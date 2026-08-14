import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert as adminCert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp } from 'firebase/app';
import { getFirestore as getClientDb, collection as clientCollection, getDocs as clientGetDocs, doc as clientDoc, getDoc as clientGetDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env and .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Configuration
const RECIPIENT_EMAIL = process.env.BACKUP_EMAIL_TO || 'myuniversalbillingsystem@gmail.com';
const BACKUP_DIR = path.resolve(__dirname, '../backups');

// Firebase client config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Helper: Escape CSV fields
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

// Helper: Array of objects to CSV string
function objectsToCsv(headers, rows) {
  const headerLine = headers.map(h => escapeCsv(h.label)).join(',');
  const rowLines = rows.map(row => {
    return headers.map(h => escapeCsv(h.get(row))).join(',');
  });
  return [headerLine, ...rowLines].join('\r\n');
}

// Format numbers in Indian Rupees
function formatINR(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(num);
}

// Sanitize filename
function sanitizeFilename(name) {
  return (name || 'business').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/**
 * Initialize Firestore access.
 * Supports:
 * 1. Firebase Admin SDK via serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT_KEY env
 * 2. Firebase Client SDK with Email/Password authentication (ADMIN_EMAIL / ADMIN_PASSWORD)
 * 3. Firebase Client SDK anonymous/direct fallback
 */
async function initializeDatabase() {
  // Method 1: Check for Firebase Admin service account
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, '../serviceAccountKey.json');
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (fs.existsSync(serviceAccountPath) || serviceAccountEnv) {
    try {
      let serviceAccount;
      if (serviceAccountEnv) {
        serviceAccount = typeof serviceAccountEnv === 'string' ? JSON.parse(serviceAccountEnv) : serviceAccountEnv;
      } else {
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      }

      const apps = getAdminApps();
      const adminApp = apps.length > 0 ? apps[0] : initAdminApp({
        credential: adminCert(serviceAccount)
      });
      const adminDb = getAdminFirestore(adminApp);

      console.log('[Backup Service] Connected to Firestore via Firebase Admin SDK (Full Root Access).');
      return { type: 'admin', db: adminDb };
    } catch (e) {
      console.warn('[Backup Service] Failed to initialize Firebase Admin SDK, falling back to Client SDK:', e.message);
    }
  }

  // Method 2: Firebase Client SDK
  const clientApp = initClientApp(firebaseConfig);
  const clientDb = getClientDb(clientApp);
  const auth = getAuth(clientApp);

  const authEmail = process.env.FIREBASE_AUTH_EMAIL || process.env.ADMIN_EMAIL;
  const authPassword = process.env.FIREBASE_AUTH_PASSWORD || process.env.ADMIN_PASSWORD;

  let currentUser = null;
  if (authEmail && authPassword) {
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      currentUser = cred.user;
      console.log(`[Backup Service] Authenticated as ${cred.user.email} (UID: ${cred.user.uid}) for data retrieval.`);
    } catch (err) {
      console.warn(`[Backup Service] Auth login warning (${authEmail}):`, err.message);
    }
  } else {
    console.log('[Backup Service] Connecting to Firestore Client SDK without explicit auth credentials.');
  }

  return { type: 'client', db: clientDb, user: currentUser };
}

/**
 * Fetch all businesses and their respective datasets.
 */
async function fetchAllData(dbInstance) {
  const { type, db, user } = dbInstance;
  const businesses = [];

  console.log('[Backup Service] Fetching user profiles and business registries...');

  let profileDocs = [];
  try {
    if (type === 'admin') {
      const snap = await db.collection('userProfiles').get();
      profileDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const snap = await clientGetDocs(clientCollection(db, 'userProfiles'));
      profileDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn('[Backup Service] Could not list userProfiles collection:', err.message);
  }

  // Determine unique workspace/business IDs
  const workspaceMap = new Map();
  profileDocs.forEach(p => {
    const wsId = (p.businessId && p.businessId !== 'global') ? p.businessId : p.id;
    const bizName = p.businessName || p.name || p.email || `Business_${wsId.slice(0, 6)}`;
    if (!workspaceMap.has(wsId)) {
      workspaceMap.set(wsId, { id: wsId, name: bizName, email: p.email || '', owner: p.name || '' });
    }
  });

  // If user is authenticated via Client SDK, guarantee their workspace is registered
  if (user?.uid && !workspaceMap.has(user.uid)) {
    try {
      const myProfileSnap = await clientGetDoc(clientDoc(db, 'userProfiles', user.uid));
      if (myProfileSnap.exists()) {
        const p = myProfileSnap.data();
        const wsId = (p.businessId && p.businessId !== 'global') ? p.businessId : user.uid;
        workspaceMap.set(wsId, { id: wsId, name: p.businessName || p.name || p.email || 'My Business', email: p.email || user.email || '', owner: p.name || '' });
      } else {
        workspaceMap.set(user.uid, { id: user.uid, name: 'My Business', email: user.email || '', owner: 'Admin' });
      }
    } catch {
      workspaceMap.set(user.uid, { id: user.uid, name: 'My Business', email: user.email || '', owner: 'Admin' });
    }
  }

  // If still no profiles found, fallback to the default workspace or single tenant
  if (workspaceMap.size === 0) {
    const fallbackId = process.env.DEFAULT_BUSINESS_ID || 'global';
    workspaceMap.set(fallbackId, { id: fallbackId, name: 'Main Business', email: RECIPIENT_EMAIL, owner: 'Admin' });
  }

  for (const [wsId, bizInfo] of workspaceMap.entries()) {
    console.log(`[Backup Service] Extracting data for business: ${bizInfo.name} (${wsId})...`);

    let invoices = [];
    let customers = [];
    let products = [];
    let settings = {};

    try {
      if (type === 'admin') {
        const invSnap = await db.collection('users').doc(wsId).collection('invoices').get();
        invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const custSnap = await db.collection('users').doc(wsId).collection('customers').get();
        customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const prodSnap = await db.collection('users').doc(wsId).collection('products').get();
        products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const setSnap = await db.collection('users').doc(wsId).collection('settings').doc('general').get();
        if (setSnap.exists) settings = setSnap.data() || {};
      } else {
        const invSnap = await clientGetDocs(clientCollection(db, 'users', wsId, 'invoices'));
        invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const custSnap = await clientGetDocs(clientCollection(db, 'users', wsId, 'customers'));
        customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const prodSnap = await clientGetDocs(clientCollection(db, 'users', wsId, 'products'));
        products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const setSnap = await clientGetDoc(clientDoc(db, 'users', wsId, 'settings', 'general'));
        if (setSnap.exists()) settings = setSnap.data() || {};
      }
    } catch (err) {
      console.warn(`[Backup Service] Error fetching subcollections for ${wsId}:`, err.message);
    }

    // Extract detailed payment entries across all invoices
    const payments = [];
    invoices.forEach(inv => {
      if (Array.isArray(inv.paymentHistory) && inv.paymentHistory.length > 0) {
        inv.paymentHistory.forEach((p, idx) => {
          payments.push({
            id: p.id || `${inv.id}_pay_${idx + 1}`,
            invoiceId: inv.id,
            customerName: inv.customerName || '',
            date: p.date || inv.date || '',
            amount: p.amount || 0,
            mode: p.mode || 'Cash',
            note: p.note || '',
            recordedAt: p.recordedAt ? new Date(p.recordedAt).toISOString() : ''
          });
        });
      } else if (inv.amountPaid > 0) {
        // Single recorded payment without history log
        payments.push({
          id: `${inv.id}_pay_init`,
          invoiceId: inv.id,
          customerName: inv.customerName || '',
          date: inv.date || '',
          amount: inv.amountPaid,
          mode: inv.paymentMode || 'Cash',
          note: 'Initial Recorded Payment',
          recordedAt: ''
        });
      }
    });

    const finalBizName = settings.name || bizInfo.name;

    businesses.push({
      id: wsId,
      name: finalBizName,
      email: bizInfo.email,
      owner: bizInfo.owner,
      settings,
      invoices,
      payments,
      customers,
      products,
      summary: {
        totalInvoices: invoices.length,
        totalRevenue: invoices.reduce((acc, i) => acc + (Number(i.total) || 0), 0),
        totalPaid: invoices.reduce((acc, i) => acc + (Number(i.amountPaid) || 0), 0),
        totalBalance: invoices.reduce((acc, i) => acc + (Number(i.remainingBalance) || 0), 0),
        totalPayments: payments.length,
        totalCustomers: customers.length,
        totalProducts: products.length,
      }
    });
  }

  return businesses;
}

/**
 * Generate CSV definitions and content for a business.
 */
function generateBusinessCSVs(biz, dateStr) {
  const prefix = sanitizeFilename(biz.name);

  // 1. Invoices CSV
  const invoiceHeaders = [
    { label: 'Invoice No', get: i => i.id || '' },
    { label: 'Date', get: i => i.date || '' },
    { label: 'Customer Name', get: i => i.customerName || '' },
    { label: 'Customer City', get: i => i.customerCity || '' },
    { label: 'Customer Mobile', get: i => i.customerMobile || '' },
    { label: 'Items Count', get: i => (i.items || []).length },
    { label: 'Items Summary', get: i => (i.items || []).map(item => `${item.name} (${item.qty} ${item.unit || ''} @ ₹${item.rate})`).join('; ') },
    { label: 'Subtotal (INR)', get: i => i.subtotal || i.total || 0 },
    { label: 'Discount (INR)', get: i => i.discount || 0 },
    { label: 'GST (INR)', get: i => i.gstAmount || 0 },
    { label: 'Grand Total (INR)', get: i => i.total || 0 },
    { label: 'Amount Paid (INR)', get: i => i.amountPaid || 0 },
    { label: 'Remaining Balance (INR)', get: i => i.remainingBalance || 0 },
    { label: 'Payment Status', get: i => i.paymentStatus || (i.remainingBalance > 0 ? 'Partial/Pending' : 'Paid') },
    { label: 'Payment Mode', get: i => i.paymentMode || '' },
    { label: 'Created At', get: i => i.createdAt ? new Date(i.createdAt).toISOString() : '' }
  ];
  const invoicesCsv = objectsToCsv(invoiceHeaders, biz.invoices);

  // 2. Payments CSV
  const paymentHeaders = [
    { label: 'Payment ID', get: p => p.id || '' },
    { label: 'Invoice No', get: p => p.invoiceId || '' },
    { label: 'Customer Name', get: p => p.customerName || '' },
    { label: 'Payment Date', get: p => p.date || '' },
    { label: 'Amount Paid (INR)', get: p => p.amount || 0 },
    { label: 'Payment Mode', get: p => p.mode || '' },
    { label: 'Note / Reference', get: p => p.note || '' },
    { label: 'Recorded At', get: p => p.recordedAt || '' }
  ];
  const paymentsCsv = objectsToCsv(paymentHeaders, biz.payments);

  // 3. Customers CSV
  const customerHeaders = [
    { label: 'Customer ID', get: c => c.id || '' },
    { label: 'Customer Name', get: c => c.name || '' },
    { label: 'Mobile / Phone', get: c => c.phone || '' },
    { label: 'City', get: c => c.city || '' }
  ];
  const customersCsv = objectsToCsv(customerHeaders, biz.customers);

  // 4. Products CSV
  const productHeaders = [
    { label: 'Product ID', get: p => p.id || '' },
    { label: 'Product Name', get: p => p.name || '' },
    { label: 'Packing', get: p => p.packing || '' },
    { label: 'Measurement Unit', get: p => p.unit || 'Kg' },
    { label: 'Default Rate (INR)', get: p => p.rate || 0 }
  ];
  const productsCsv = objectsToCsv(productHeaders, biz.products);

  return [
    { filename: `${prefix}_invoices_${dateStr}.csv`, content: invoicesCsv, recordCount: biz.invoices.length, label: 'Invoices' },
    { filename: `${prefix}_payments_${dateStr}.csv`, content: paymentsCsv, recordCount: biz.payments.length, label: 'Payments' },
    { filename: `${prefix}_customers_${dateStr}.csv`, content: customersCsv, recordCount: biz.customers.length, label: 'Customers' },
    { filename: `${prefix}_products_${dateStr}.csv`, content: productsCsv, recordCount: biz.products.length, label: 'Products' }
  ];
}

/**
 * Configure Nodemailer Transport.
 */
function createEmailTransporter() {
  // Option 1: Gmail App Password
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (gmailUser && gmailPass) {
    console.log(`[Backup Service] Configuring SMTP transport for ${gmailUser}...`);
    return nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE === 'true' || true,
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });
  }

  // Option 2: Generic SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return null;
}

/**
 * Build modern, responsive HTML email body.
 */
function buildHtmlEmail(businesses, dateStr, totalAttachments) {
  const overall = businesses.reduce((acc, b) => ({
    invoices: acc.invoices + b.summary.totalInvoices,
    revenue: acc.revenue + b.summary.totalRevenue,
    paid: acc.paid + b.summary.totalPaid,
    balance: acc.balance + b.summary.totalBalance,
    customers: acc.customers + b.summary.totalCustomers,
    products: acc.products + b.summary.totalProducts
  }), { invoices: 0, revenue: 0, paid: 0, balance: 0, customers: 0, products: 0 });

  const businessRows = businesses.map(b => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 12px 14px; font-weight: 700; color: #1e293b;">${b.name}</td>
      <td style="padding: 12px 14px; text-align: center; color: #334155;">${b.summary.totalInvoices}</td>
      <td style="padding: 12px 14px; text-align: right; font-weight: 600; color: #059669;">₹${formatINR(b.summary.totalRevenue)}</td>
      <td style="padding: 12px 14px; text-align: right; color: #2563eb;">₹${formatINR(b.summary.totalPaid)}</td>
      <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: ${b.summary.totalBalance > 0 ? '#dc2626' : '#16a34a'};">₹${formatINR(b.summary.totalBalance)}</td>
      <td style="padding: 12px 14px; text-align: center; color: #475569;">${b.summary.totalCustomers}</td>
      <td style="padding: 12px 14px; text-align: center; color: #475569;">${b.summary.totalProducts}</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Universal Billing System - Weekly Backup</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #334155;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.04); border: 1px solid #e2e8f0;">
      
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 28px; color: #ffffff;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; color: #c7d2fe; margin-bottom: 6px;">Automated Data Vault</div>
        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #ffffff;">Weekly Billing System Backup</h1>
        <p style="margin: 0; font-size: 14px; color: #e0e7ff;">Comprehensive CSV export of all Invoices, Payments, Customers, and Products across ${businesses.length} registered business${businesses.length > 1 ? 'es' : ''}.</p>
      </div>

      <!-- Execution Metadata -->
      <div style="background-color: #f8fafc; padding: 14px 28px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; display: flex; justify-content: space-between;">
        <span><strong>Backup Date:</strong> ${dateStr}</span>
        <span><strong>Attached Files:</strong> ${totalAttachments} CSV Files</span>
      </div>

      <!-- Body Content -->
      <div style="padding: 28px;">
        
        <!-- KPI Metrics Grid -->
        <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Global System Summary</h3>
        <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 24px;">
          <tr>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Revenue</div>
              <div style="font-size: 18px; font-weight: 800; color: #059669; margin-top: 4px;">₹${formatINR(overall.revenue)}</div>
            </td>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Collected</div>
              <div style="font-size: 18px; font-weight: 800; color: #2563eb; margin-top: 4px;">₹${formatINR(overall.paid)}</div>
            </td>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Outstanding Due</div>
              <div style="font-size: 18px; font-weight: 800; color: #dc2626; margin-top: 4px;">₹${formatINR(overall.balance)}</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Invoices</div>
              <div style="font-size: 18px; font-weight: 800; color: #1e293b; margin-top: 4px;">${overall.invoices}</div>
            </td>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Active Customers</div>
              <div style="font-size: 18px; font-weight: 800; color: #1e293b; margin-top: 4px;">${overall.customers}</div>
            </td>
            <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 33%;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Product Catalog</div>
              <div style="font-size: 18px; font-weight: 800; color: #1e293b; margin-top: 4px;">${overall.products}</div>
            </td>
          </tr>
        </table>

        <!-- Breakdown Table -->
        <h3 style="margin: 24px 0 12px 0; font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Business Breakdown</h3>
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #475569;">Business</th>
                <th style="padding: 10px 14px; text-align: center; font-weight: 700; color: #475569;">Invoices</th>
                <th style="padding: 10px 14px; text-align: right; font-weight: 700; color: #475569;">Total Sales</th>
                <th style="padding: 10px 14px; text-align: right; font-weight: 700; color: #475569;">Collected</th>
                <th style="padding: 10px 14px; text-align: right; font-weight: 700; color: #475569;">Balance</th>
                <th style="padding: 10px 14px; text-align: center; font-weight: 700; color: #475569;">Clients</th>
                <th style="padding: 10px 14px; text-align: center; font-weight: 700; color: #475569;">Items</th>
              </tr>
            </thead>
            <tbody>
              ${businessRows}
            </tbody>
          </table>
        </div>

        <!-- Note Section -->
        <div style="margin-top: 24px; padding: 14px 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; font-size: 12px; color: #166534;">
          <strong>Security Notice:</strong> All attached CSV files contain point-in-time snapshots of your live database. Keep these files encrypted or securely stored for audit and disaster recovery purposes.
        </div>

      </div>

      <!-- Footer -->
      <div style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
        Sent automatically by <strong>Universal Billing System Cloud Backup Service</strong>.<br />
        To modify schedule or credentials, update your configuration in <code>.env</code>.
      </div>

    </div>
  </body>
  </html>
  `;
}

/**
 * Main Backup Execution
 */
export async function runWeeklyBackup() {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().split('T')[0];
  console.log(`\n======================================================`);
  console.log(`[Backup Service] Starting Automated Weekly Backup: ${dateStr}`);
  console.log(`======================================================`);

  try {
    // 1. Ensure local backups folder exists
    const todayDir = path.join(BACKUP_DIR, `backup_${dateStr}`);
    if (!fs.existsSync(todayDir)) {
      fs.mkdirSync(todayDir, { recursive: true });
    }

    // 2. Initialize Firestore
    const dbInstance = await initializeDatabase();

    // 3. Fetch data across all businesses
    const businesses = await fetchAllData(dbInstance);

    if (businesses.length === 0) {
      console.warn('[Backup Service] No businesses or data found to export.');
      return { success: false, message: 'No business data found.' };
    }

    // 4. Generate CSVs & save local copies
    const allAttachments = [];
    let totalGeneratedFiles = 0;

    for (const biz of businesses) {
      const csvFiles = generateBusinessCSVs(biz, dateStr);
      for (const file of csvFiles) {
        const filePath = path.join(todayDir, file.filename);
        fs.writeFileSync(filePath, file.content, 'utf8');
        totalGeneratedFiles++;

        allAttachments.push({
          filename: file.filename,
          content: file.content,
          contentType: 'text/csv'
        });
      }
    }

    console.log(`[Backup Service] Generated and saved ${totalGeneratedFiles} CSV files to ${todayDir}`);

    // 5. Send Email
    const transporter = createEmailTransporter();

    if (!transporter) {
      console.warn('\n[Backup Service] ⚠️ Email SMTP credentials not found in .env / environment!');
      console.warn(`[Backup Service] Generated CSVs are safely saved in local folder: ${todayDir}`);
      console.warn(`[Backup Service] To enable automated email sending to ${RECIPIENT_EMAIL}, configure GMAIL_USER & GMAIL_APP_PASSWORD in .env.\n`);
      return {
        success: true,
        localOnly: true,
        savedPath: todayDir,
        fileCount: totalGeneratedFiles,
        message: 'CSVs generated locally. SMTP credentials needed for email dispatch.'
      };
    }

    const htmlBody = buildHtmlEmail(businesses, dateStr, allAttachments.length);

    console.log(`[Backup Service] Dispatching email with ${allAttachments.length} CSV attachments to ${RECIPIENT_EMAIL}...`);

    const mailOptions = {
      from: `"Universal Billing System" <${process.env.GMAIL_USER || process.env.SMTP_USER || 'no-reply@universalbilling.com'}>`,
      to: RECIPIENT_EMAIL,
      subject: `Weekly (Backup) CSV Data Export - ${dateStr} (${businesses.length} Business${businesses.length > 1 ? 'es' : ''})`,
      html: htmlBody,
      attachments: allAttachments
    };

    const info = await transporter.sendMail(mailOptions);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[Backup Service] ✅ Email successfully sent to ${RECIPIENT_EMAIL}! MessageId: ${info.messageId} (took ${duration}s)`);

    return {
      success: true,
      messageId: info.messageId,
      recipient: RECIPIENT_EMAIL,
      fileCount: allAttachments.length,
      savedPath: todayDir,
      duration
    };

  } catch (error) {
    console.error('[Backup Service] ❌ Backup failed with error:', error);
    return { success: false, error: error.message };
  }
}

// Direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runWeeklyBackup()
    .then(res => {
      if (!res.success) process.exit(1);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
