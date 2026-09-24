/**
 * OfflineApp.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline-mode root component (used when running inside Electron).
 * Replaces Firebase auth/Firestore with SQLite-backed IPC calls.
 *
 * Key differences from App.tsx (cloud version):
 *   - No Firebase auth — user is auto-authenticated (single-user desktop app)
 *   - Data loaded once on mount from SQLite via IPC (no real-time listeners)
 *   - Settings, products, customers, invoices all saved to SQLite
 *   - Feature flags read from encrypted features.dat
 *   - Backup/restore UI in settings
 *   - Cloud import UI in settings
 *   - Offline AI via Ollama
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import {
  getFeatures, getProducts, upsertProduct, deleteProduct,
  getCustomers, upsertCustomer, deleteCustomer,
  getInvoices, upsertInvoice, deleteInvoice,
  getSettings, saveSettings,
  createBackup, listBackups, restoreBackup, openBackupFolder,
  pickFile, importCloudExport,
  aiChat, getAiStatus,
  logActivity, logError,
  onUpdateAvailable, onUpdateDownloaded,
  IS_ELECTRON,
  getHardwareFingerprint, installLicense,
  LocalUser, userNeedsSetup, userGetSession, userLogout, userList
} from './electron-api';
import {
  Product, Customer, Invoice, BusinessSettings, AppTab, InvoiceAuditEntry, PaymentEntry
} from './types';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_PRODUCT_UNITS } from './constants';
import {
  Package, PackagePlus, Users, UserPlus, Search, Edit, Trash, PlusCircle, Save, X, BarChart3, MapPin, Phone, PhoneCall, User as UserIcon, Shield
} from 'lucide-react';

import { InvoiceGenerator } from './components/InvoiceGenerator';
import { InvoiceHistory } from './components/InvoiceHistory';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { PaymentManagement } from './components/PaymentManagement';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineSettings } from './components/OfflineSettings';
import { PaymentTrackerModal } from './components/PaymentTrackerModal';
import { CustomerSpendingModal } from './components/CustomerSpendingModal';
import { ProductAnalysisModal } from './components/ProductAnalysisModal';
import { UserManagement } from './components/UserManagement';
import { AdminSetupScreen, LoginScreen } from './components/AuthScreens';

// ─── Feature Context ──────────────────────────────────────────────────────────
interface OfflineFeatures {
  enableAnalytics: boolean;
  enableAiAnalyst: boolean;
  ollamaModel: string;
  enablePaymentTracking: boolean;
  enableProductsMenu: boolean;
  enableCustomersMenu: boolean;
  enableGst: boolean;
  enableCsvImport: boolean;
  enableAuditTrail: boolean;
  enableCloudImport: boolean;
  autoUpdates: string;
  maxInvoicesPerMonth: number;
  customerName: string;
}

const FeaturesContext = createContext<OfflineFeatures>({
  enableAnalytics: true, enableAiAnalyst: false, ollamaModel: 'llama3.2:3b',
  enablePaymentTracking: true, enableProductsMenu: true, enableCustomersMenu: true,
  enableGst: true, enableCsvImport: true, enableAuditTrail: true, enableCloudImport: true,
  autoUpdates: 'manual', maxInvoicesPerMonth: -1, customerName: 'User',
});

export const useOfflineFeatures = () => useContext(FeaturesContext);

// ─── Offline Data Context ─────────────────────────────────────────────────────
interface OfflineDataContext {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  settings: BusinessSettings;
  loading: boolean;
  refreshAll: () => Promise<void>;
  saveInvoice: (inv: Invoice) => Promise<void>;
  saveProduct: (p: Product, actorUser?: LocalUser | null) => Promise<void>;
  removeProduct: (id: string, actorUser?: LocalUser | null) => Promise<void>;
  saveCustomer: (c: Customer, actorUser?: LocalUser | null) => Promise<void>;
  removeCustomer: (id: string, actorUser?: LocalUser | null) => Promise<void>;
  updateSettings: (s: BusinessSettings) => Promise<void>;
}

export const OfflineDataCtx = createContext<OfflineDataContext>({} as any);

// ─── Root Offline App Router ──────────────────────────────────────────────────
export const OfflineApp: React.FC = () => {
  const isActivateScreen = typeof window !== 'undefined' && window.location.hash.includes('/activate');
  if (isActivateScreen) {
    return <ActivationScreen />;
  }

  return (
    <ErrorBoundary fallbackTitle="Billing System Offline Error">
      <OfflineMainApp />
    </ErrorBoundary>
  );
};

// ─── Main Offline App Component ───────────────────────────────────────────────
const OfflineMainApp: React.FC = () => {
  const [features, setFeatures] = useState<OfflineFeatures | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [updateBanner, setUpdateBanner] = useState<string | null>(null);

  // Multi-user & Auth State
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const refreshAll = useCallback(async () => {
    const [prods, custs, invs, sett] = await Promise.all([
      getProducts(),
      getCustomers(),
      getInvoices(),
      getSettings(),
    ]);
    setProducts(prods || []);
    setCustomers(custs || []);
    setInvoices(invs || []);
    setSettings(sett || DEFAULT_BUSINESS_SETTINGS);
  }, []);

  const reloadFeatures = useCallback(async () => {
    const f = await getFeatures();
    setFeatures(f as OfflineFeatures);
  }, []);

  const handleLogout = useCallback(async () => {
    await userLogout();
    setCurrentUser(null);
  }, []);

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Load features first
        const f = await getFeatures();
        setFeatures(f as OfflineFeatures);

        // Check user setup & session
        const setupNeeded = await userNeedsSetup();
        if (setupNeeded) {
          setNeedsSetup(true);
        } else {
          const session = await userGetSession();
          if (session) {
            setCurrentUser(session);
          }
        }
        setAuthChecked(true);

        // Load all data from SQLite
        await refreshAll();

        // Update listeners
        onUpdateAvailable((info: any) => {
          setUpdateBanner(`Update v${info.version} is available. ${f.autoUpdates === 'manual' ? 'Click to install.' : 'Installing...'}`);
        });
      } catch (e: any) {
        console.error('[OfflineApp] Bootstrap error:', e);
        logError({ message: e.message, stack: e.stack, route: 'bootstrap', timestamp: Date.now() });
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshAll]);

  // ── Data Operations ─────────────────────────────────────────────────────────
  const saveInvoice = useCallback(async (inv: Invoice) => {
    await upsertInvoice(inv);
    setInvoices(prev => {
      const idx = prev.findIndex(i => i.id === inv.id);
      if (idx >= 0) return [...prev.slice(0, idx), inv, ...prev.slice(idx + 1)];
      return [inv, ...prev];
    });
    logActivity({
      action: `Saved invoice #${inv.id} for ${inv.customerName}`,
      category: 'INVOICES',
      details: `Total: ₹${inv.total}`,
      timestamp: Date.now(),
      userId: inv.updatedBy || inv.createdBy,
      userEmail: inv.updatedByEmail || inv.createdByEmail,
    });
  }, []);

  const saveProduct = useCallback(async (p: Product, actorUser?: LocalUser | null) => {
    const prevList = await getProducts();
    const isEdit = prevList.some((x: any) => x.id === p.id);
    await upsertProduct(p);
    setProducts(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      if (idx >= 0) return [...prev.slice(0, idx), p, ...prev.slice(idx + 1)];
      return [...prev, p];
    });
    logActivity({
      action: isEdit ? `Updated product "${p.name}"` : `Added product "${p.name}"`,
      category: 'PRODUCTS',
      details: `Rate: ₹${p.rate || 0}, Unit: ${p.unit || '-'}${p.packing ? ', Packing: ' + p.packing : ''}`,
      timestamp: Date.now(),
      userId: actorUser?.id,
      userEmail: actorUser?.email,
    });
  }, []);

  const removeProduct = useCallback(async (id: string, actorUser?: LocalUser | null) => {
    const prevList = await getProducts();
    const found = prevList.find((x: any) => x.id === id);
    await deleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
    logActivity({
      action: `Deleted product "${found?.name || id}"`,
      category: 'PRODUCTS',
      timestamp: Date.now(),
      userId: actorUser?.id,
      userEmail: actorUser?.email,
    });
  }, []);

  const saveCustomer = useCallback(async (c: Customer, actorUser?: LocalUser | null) => {
    const prevList = await getCustomers();
    const isEdit = prevList.some((x: any) => x.id === c.id);
    await upsertCustomer(c);
    setCustomers(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) return [...prev.slice(0, idx), c, ...prev.slice(idx + 1)];
      return [...prev, c];
    });
    logActivity({
      action: isEdit ? `Updated customer "${c.name}"` : `Added customer "${c.name}"`,
      category: 'CUSTOMERS',
      details: `City: ${c.city || '-'}, Phone: ${c.phone || '-'}`,
      timestamp: Date.now(),
      userId: actorUser?.id,
      userEmail: actorUser?.email,
    });
  }, []);

  const removeCustomer = useCallback(async (id: string, actorUser?: LocalUser | null) => {
    const prevList = await getCustomers();
    const found = prevList.find((x: any) => x.id === id);
    await deleteCustomer(id);
    setCustomers(prev => prev.filter(c => c.id !== id));
    logActivity({
      action: `Deleted customer "${found?.name || id}"`,
      category: 'CUSTOMERS',
      timestamp: Date.now(),
      userId: actorUser?.id,
      userEmail: actorUser?.email,
    });
  }, []);

  const updateSettings = useCallback(async (s: BusinessSettings) => {
    await saveSettings(s);
    setSettings(s);
  }, []);

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading || !features || !authChecked) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white', fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#3b82f6',
          animation: 'spin 1s linear infinite',
          marginBottom: 24
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Starting Billing System...</h2>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          Loading local database
        </p>
      </div>
    );
  }

  // ── First-time Admin Setup ──────────────────────────────────────────────────
  if (needsSetup) {
    return (
      <AdminSetupScreen
        onSetupComplete={(admin) => {
          setCurrentUser(admin);
          setNeedsSetup(false);
        }}
        onRestoreComplete={async () => {
          setNeedsSetup(false);
          await refreshAll();
          const session = await userGetSession();
          if (session) {
            setCurrentUser(session);
          }
        }}
      />
    );
  }

  // ── User Login Screen ───────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  return (
    <FeaturesContext.Provider value={features}>
      <OfflineDataCtx.Provider value={{
        products, customers, invoices, settings, loading,
        refreshAll, saveInvoice, saveProduct, removeProduct,
        saveCustomer, removeCustomer, updateSettings,
      }}>
        {/* Update banner */}
        {updateBanner && (
          <div style={{
            background: '#1d4ed8', color: 'white', padding: '8px 16px',
            textAlign: 'center', fontSize: 13, fontWeight: 500,
            cursor: features.autoUpdates === 'manual' ? 'pointer' : 'default'
          }}>
            🔄 {updateBanner}
          </div>
        )}

        <OfflineAppShell
          currentUser={currentUser}
          onUserUpdated={setCurrentUser}
          onLogout={handleLogout}
          onReloadFeatures={reloadFeatures}
        />
      </OfflineDataCtx.Provider>
    </FeaturesContext.Provider>
  );
};

const getDefaultUnit = (s: BusinessSettings) => {
  if (s.customUnits && s.customUnits.length > 0) {
    return s.customUnits[0];
  }
  return DEFAULT_PRODUCT_UNITS[0] || 'Kg';
};

// ─── Offline App Shell ────────────────────────────────────────────────────────
const OfflineAppShell: React.FC<{
  currentUser: LocalUser;
  onUserUpdated: (u: LocalUser) => void;
  onLogout: () => void;
  onReloadFeatures: () => Promise<void>;
}> = ({ currentUser, onUserUpdated, onLogout, onReloadFeatures }) => {
  const data = useContext(OfflineDataCtx);
  const features = useOfflineFeatures();
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.CREATE_BILL);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupList, setBackupList] = useState<any[]>([]);
  const [backupMsg, setBackupMsg] = useState('');

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);

  useEffect(() => {
    userList().then(list => setLocalUsers(list || [])).catch(() => {});
  }, []);

  // --- Payment Tracker Modal State ---
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  // --- Modals for Customer Spending & Product Analysis ---
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<Customer | null>(null);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);

  // --- Product Edit State ---
  const [prodForm, setProdForm] = useState({
    name: '',
    packing: '',
    rate: '',
    unit: 'Kg'
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const productFormRef = useRef<HTMLDivElement>(null);

  // Sync prodForm unit with configured customUnits when settings change
  useEffect(() => {
    if (!editingProductId && data.settings.customUnits && data.settings.customUnits.length > 0) {
      if (!data.settings.customUnits.includes(prodForm.unit)) {
        setProdForm(prev => ({ ...prev, unit: data.settings.customUnits![0] }));
      }
    }
  }, [data.settings.customUnits, editingProductId]);

  // --- Customer Edit State ---
  const [custForm, setCustForm] = useState({
    name: '',
    city: '',
    phone: ''
  });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [showCustomerFormMobile, setShowCustomerFormMobile] = useState(false);
  const customerFormRef = useRef<HTMLDivElement>(null);

  // --- Backup Handlers ---
  const handleCreateBackup = async () => {
    const result = await createBackup();
    setBackupMsg(result.success ? `✅ Backup created: ${result.filePath}` : `❌ ${result.error}`);
    const list = await listBackups();
    setBackupList(list);
  };

  const handleRestoreBackup = async (filePath: string) => {
    if (!window.confirm('⚠️ This will replace ALL current data with the backup. Continue?')) return;
    const result = await restoreBackup(filePath);
    if (result.success) {
      setBackupMsg('✅ Restored successfully. Reloading data...');
      await data.refreshAll();
      const session = await userGetSession();
      if (session) {
        onUserUpdated(session);
      }
    } else {
      setBackupMsg(`❌ Restore failed: ${result.error}`);
    }
  };

  const handleCloudImport = async () => {
    const filePath = await pickFile([{ name: 'JSON Export', extensions: ['json'] }]);
    if (!filePath) return;
    const result = await importCloudExport(filePath);
    if (result.success) {
      alert(`✅ Import successful!\nInvoices: ${result.counts?.invoices || 0}\nProducts: ${result.counts?.products || 0}\nCustomers: ${result.counts?.customers || 0}\n\nRefreshing data...`);
      await data.refreshAll();
      const session = await userGetSession();
      if (session) {
        onUserUpdated(session);
      }
    } else {
      alert(`❌ Import failed: ${result.error}`);
    }
  };

  // --- Payments Handlers ---
  const handleAddPayment = async (invoiceId: string, paymentEntry: PaymentEntry) => {
    const inv = data.invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const updatedPayments = [...(inv.payments || []), paymentEntry];
    const updatedInv = { ...inv, payments: updatedPayments };
    await data.saveInvoice(updatedInv);
    setPaymentInvoice(prev => (prev && prev.id === invoiceId ? updatedInv : prev));
  };

  const handleDeletePayment = async (invoiceId: string, paymentId: string) => {
    const inv = data.invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const targetPayment = (inv.payments || []).find(p => p.id === paymentId);
    if (!targetPayment) return;

    const now = Date.now();
    const updatedPayments = (inv.payments || []).map(p => {
      if (p.id === paymentId) {
        return {
          ...p,
          isDeleted: true,
          deletedAt: now,
          deletedBy: currentUser?.id || 'offline_admin',
          deletedByName: currentUser?.name || currentUser?.email || 'Admin'
        };
      }
      return p;
    });

    const billNumStr = inv.id;
    const auditEntry: InvoiceAuditEntry = {
      id: `aud_${now}_${Math.random().toString(36).slice(2, 7)}`,
      action: 'payment_deleted',
      userId: currentUser?.id || 'offline_admin',
      userName: currentUser?.name || currentUser?.email || 'Admin',
      userEmail: currentUser?.email || '',
      timestamp: now,
      summary: `Payment of ₹${targetPayment.amount} (${targetPayment.mode}) deleted/voided by ${currentUser?.name || currentUser?.email || 'Admin'}`
    };

    const updatedInv = {
      ...inv,
      payments: updatedPayments,
      auditTrail: [...(inv.auditTrail || []), auditEntry]
    };
    await data.saveInvoice(updatedInv);
    setPaymentInvoice(prev => (prev && prev.id === invoiceId ? updatedInv : prev));

    try {
      await logActivity({
        action: 'DELETE_PAYMENT',
        category: 'PAYMENTS',
        details: `Deleted payment ₹${targetPayment.amount} (${targetPayment.mode}) on Invoice #${billNumStr} for ${inv.customerName || 'Customer'}${targetPayment.note ? ` - ${targetPayment.note}` : ''}`,
        timestamp: Date.now(),
        userId: currentUser?.id,
        userEmail: currentUser?.email
      });
    } catch (err) {
      console.warn('Failed to log payment deletion activity:', err);
    }
  };

  // --- Product Handlers ---
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodForm.name.trim()) return;
    try {
      const prod: Product = {
        id: editingProductId || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: prodForm.name.trim(),
        packing: prodForm.packing.trim(),
        rate: prodForm.rate ? Number(prodForm.rate) : 0,
        unit: prodForm.unit || getDefaultUnit(data.settings)
      };
      await data.saveProduct(prod, currentUser);
      setEditingProductId(null);
      setProdForm({ name: '', packing: '', rate: '', unit: getDefaultUnit(data.settings) });
    } catch (e) {
      console.error("Error saving product: ", e);
      alert("Failed to save product.");
    }
  };

  const startEditProduct = (product: Product) => {
    setProdForm({
      name: product.name,
      packing: product.packing || '',
      rate: String(product.rate || product.price || 0),
      unit: product.unit || getDefaultUnit(data.settings)
    });
    setEditingProductId(product.id);
    setTimeout(() => {
      productFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const cancelEditProduct = () => {
    setProdForm({ name: '', packing: '', rate: '', unit: getDefaultUnit(data.settings) });
    setEditingProductId(null);
  };

  const deleteProduct = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await data.removeProduct(id, currentUser);
      if (editingProductId === id) cancelEditProduct();
      setSelectedProductIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e) {
      console.error("Error deleting product:", e);
    }
  };

  const bulkDeleteProducts = async () => {
    if (selectedProductIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedProductIds.size} selected product(s)? This cannot be undone.`)) return;
    for (const id of selectedProductIds) {
      try { await data.removeProduct(id, currentUser); } catch (e) { console.error('Bulk delete product error:', e); }
    }
    setSelectedProductIds(new Set());
    if (editingProductId && selectedProductIds.has(editingProductId)) cancelEditProduct();
  };

  const handleSaveAllUnsavedProducts = async () => {
    if (!window.confirm(`Save all ${unsavedInvoiceProducts.length} unsaved products to your catalog?`)) return;
    for (const u of unsavedInvoiceProducts) {
      try {
        const prod: Product = {
          id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: u.name.trim(), rate: Number(u.rate) || 0,
          unit: u.unit || getDefaultUnit(data.settings), packing: u.packing || ''
        };
        await data.saveProduct(prod, currentUser);
      } catch (e) { console.error('Bulk save product error:', e); }
    }
  };

  const handleQuickSaveProduct = async (name: string, rate: number, unit: string, packing: string = '') => {
    if (!name.trim()) return;
    try {
      const prod: Product = {
        id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        rate: Number(rate) || 0,
        unit: unit || getDefaultUnit(data.settings),
        packing: packing ? packing.trim() : ''
      };
      await data.saveProduct(prod, currentUser);
      alert(`Product "${name.trim()}" saved to your product catalog!`);
    } catch (e) {
      console.error("Error quick-saving product:", e);
      alert(`Failed to save product "${name}".`);
    }
  };

  const unsavedInvoiceProducts = useMemo(() => {
    const savedNames = new Set(data.products.map(p => p.name.trim().toLowerCase()));
    const map = new Map<string, { name: string; rate: number; unit: string; packing: string; count: number; totalQty: number; totalRevenue: number }>();

    data.invoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          if (item.name && item.name.trim()) {
            const normName = item.name.trim().toLowerCase();
            if (!savedNames.has(normName)) {
              const existing = map.get(normName);
              const qty = item.quantity || 0;
              const amt = item.amount ?? ((item.rate || 0) * qty);
              const rate = item.rate || 0;
              const unit = item.unit || getDefaultUnit(data.settings);
              const packing = item.packing || '';

              if (existing) {
                existing.count += 1;
                existing.totalQty += qty;
                existing.totalRevenue += amt;
                if (!existing.rate && rate) existing.rate = rate;
                if (!existing.unit && unit) existing.unit = unit;
                if (!existing.packing && packing) existing.packing = packing;
              } else {
                map.set(normName, {
                  name: item.name.trim(),
                  rate: rate,
                  unit: unit,
                  packing: packing,
                  count: 1,
                  totalQty: qty,
                  totalRevenue: amt
                });
              }
            }
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [data.products, data.invoices, data.settings]);

  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return data.products;
    const q = productSearchQuery.toLowerCase().trim();
    return data.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.packing && p.packing.toLowerCase().includes(q))
    );
  }, [data.products, productSearchQuery]);

  // --- Customer Handlers ---
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name.trim()) return;
    try {
      const cust: Customer = {
        id: editingCustomerId || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: custForm.name.trim(),
        city: custForm.city.trim(),
        phone: custForm.phone.trim()
      };
      await data.saveCustomer(cust, currentUser);
      setEditingCustomerId(null);
      setCustForm({ name: '', city: '', phone: '' });
      setShowCustomerFormMobile(false);
    } catch (e) {
      console.error("Error saving customer:", e);
      alert("Failed to save customer.");
    }
  };

  const startEditCustomer = (customer: Customer) => {
    setCustForm({
      name: customer.name,
      city: customer.city || '',
      phone: customer.phone || (customer as any).mobile || ''
    });
    setEditingCustomerId(customer.id);
    setTimeout(() => {
      customerFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const cancelEditCustomer = () => {
    setCustForm({ name: '', city: '', phone: '' });
    setEditingCustomerId(null);
  };

  const deleteCustomer = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    try {
      await data.removeCustomer(id, currentUser);
      if (editingCustomerId === id) cancelEditCustomer();
      setSelectedCustomerIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e) {
      console.error("Error deleting customer:", e);
    }
  };

  const bulkDeleteCustomers = async () => {
    if (selectedCustomerIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedCustomerIds.size} selected customer(s)? This cannot be undone.`)) return;
    for (const id of selectedCustomerIds) {
      try { await data.removeCustomer(id, currentUser); } catch (e) { console.error('Bulk delete customer error:', e); }
    }
    setSelectedCustomerIds(new Set());
    if (editingCustomerId && selectedCustomerIds.has(editingCustomerId)) cancelEditCustomer();
  };

  const handleSaveAllUnsavedCustomers = async () => {
    if (!window.confirm(`Save all ${unsavedInvoiceCustomers.length} unsaved customers to your directory?`)) return;
    for (const u of unsavedInvoiceCustomers) {
      try {
        const cust: Customer = {
          id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: u.name.trim(), city: u.city || '', phone: ''
        };
        await data.saveCustomer(cust, currentUser);
      } catch (e) { console.error('Bulk save customer error:', e); }
    }
  };

  const handleQuickSaveCustomer = async (name: string, city: string = '') => {
    if (!name.trim()) return;
    try {
      const cust: Customer = {
        id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        city: city.trim(),
        phone: ''
      };
      await data.saveCustomer(cust, currentUser);
      alert(`Customer "${name.trim()}" saved to your customer directory!`);
    } catch (e) {
      console.error("Error quick-saving customer:", e);
      alert(`Failed to save customer "${name}".`);
    }
  };

  const unsavedInvoiceCustomers = useMemo(() => {
    const savedNames = new Set(data.customers.map(c => c.name.trim().toLowerCase()));
    const map = new Map<string, { name: string; city: string; count: number; totalSpent: number }>();

    data.invoices.forEach(inv => {
      if (inv.customerName && inv.customerName.trim()) {
        const normName = inv.customerName.trim().toLowerCase();
        if (!savedNames.has(normName)) {
          const existing = map.get(normName);
          const amount = inv.total ?? (inv as any).totalAmount ?? 0;
          if (existing) {
            existing.count += 1;
            existing.totalSpent += amount;
            if (!existing.city && inv.customerCity) existing.city = inv.customerCity;
          } else {
            map.set(normName, {
              name: inv.customerName.trim(),
              city: inv.customerCity || '',
              count: 1,
              totalSpent: amount
            });
          }
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [data.customers, data.invoices]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return data.customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return data.customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      ((c.phone || (c as any).mobile) && (c.phone || (c as any).mobile).includes(q))
    );
  }, [data.customers, customerSearchQuery]);

  // Tab rendering
  const renderTab = () => {
    switch (activeTab) {
      case AppTab.CREATE_BILL:
        return (
          <InvoiceGenerator
            products={data.products}
            customers={data.customers}
            invoices={data.invoices}
            settings={data.settings}
            enablePaymentTracking={features.enablePaymentTracking}
            currentUserDisplayName={currentUser?.name || currentUser?.email?.split('@')[0] || ''}
            businessMembers={localUsers.map(u => ({ uid: u.id, email: u.email, displayName: u.name, role: u.role }))}
            onUpdateSettings={data.updateSettings}
            onSaveInvoice={async (inv) => {
              const isEditing = !!editingInvoice;
              const now = Date.now();

              // ── Compute field-level changes (for edit only) ──────────────────
              const changes: InvoiceAuditEntry['changes'] = [];
              if (isEditing && editingInvoice) {
                const prev = editingInvoice;
                // Track total change
                if (Number(prev.total) !== Number(inv.total)) {
                  changes.push({
                    field: 'total',
                    label: 'Grand Total',
                    oldValue: `₹${prev.total}`,
                    newValue: `₹${inv.total}`,
                  });
                }
                // Track customer change
                if (prev.customerName !== inv.customerName) {
                  changes.push({
                    field: 'customerName',
                    label: 'Customer Name',
                    oldValue: prev.customerName,
                    newValue: inv.customerName,
                  });
                }
                // Track customer city change
                if ((prev.customerCity || '') !== (inv.customerCity || '')) {
                  changes.push({
                    field: 'customerCity',
                    label: 'Customer City',
                    oldValue: prev.customerCity || '-',
                    newValue: inv.customerCity || '-',
                  });
                }
                // Track date change
                if (prev.date !== inv.date) {
                  changes.push({ field: 'date', label: 'Invoice Date', oldValue: prev.date, newValue: inv.date });
                }
                // Track items change (compare stringified for simplicity)
                const prevItemSig = (prev.items || []).map(i => `${i.name}×${i.quantity}`).join(',');
                const newItemSig = (inv.items || []).map(i => `${i.name}×${i.quantity}`).join(',');
                if (prevItemSig !== newItemSig) {
                  const fmt = (items: typeof inv.items) =>
                    (items || []).map(i => `${i.name} (x${i.quantity})`).join(', ');
                  changes.push({
                    field: 'items',
                    label: 'Items List',
                    oldValue: fmt(prev.items),
                    newValue: fmt(inv.items),
                  });
                }
              }

              // ── Build descriptive summary ─────────────────────────────────────
              let summary = '';
              if (isEditing && editingInvoice) {
                const totalChanged = Number(editingInvoice.total) !== Number(inv.total);
                const itemsChanged = changes.some(c => c.field === 'items');
                const parts: string[] = [];
                if (totalChanged) parts.push(`Total ₹${editingInvoice.total}→₹${inv.total}`);
                if (itemsChanged) parts.push(`Items modified (${inv.items?.length || 0} items)`);
                const otherFields = changes.filter(c => c.field !== 'total' && c.field !== 'items');
                if (otherFields.length > 0) parts.push(`${otherFields.map(c => c.label).join(', ')} changed`);
                summary = `Bill #${inv.id} edited${parts.length ? ': ' + parts.join('; ') : ''}`;
              } else {
                summary = `Bill #${inv.id} created with ${inv.items?.length || 0} items (Total: ₹${inv.total})`;
              }

              // ── Build rich audit entry ────────────────────────────────────────
              const auditEntry: InvoiceAuditEntry = {
                id: `audit_${now}_${Math.random().toString(36).slice(2, 6)}`,
                action: (isEditing ? 'edited' : 'created') as 'edited' | 'created',
                timestamp: now,
                userId: currentUser.id,
                userName: currentUser.name,
                userEmail: currentUser.email,
                userRole: currentUser.role,
                summary,
                details: isEditing && changes.length === 0
                  ? `Invoice reviewed/saved by ${currentUser.name} — no field changes detected`
                  : undefined,
                changes: changes.length > 0 ? changes : undefined,
                snapshot: {
                  total: inv.total,
                  itemsCount: inv.items?.length || 0,
                  customerName: inv.customerName,
                  customerCity: inv.customerCity,
                  date: inv.date,
                  itemsSummary: (inv.items || []).slice(0, 3).map(i => `${i.name} (x${i.quantity})`).join(', ') +
                    (inv.items && inv.items.length > 3 ? ` +${inv.items.length - 3} more` : ''),
                },
              };

              const enriched: Invoice = {
                ...inv,
                createdBy: inv.createdBy || currentUser.id,
                createdByName: inv.createdByName || currentUser.name,
                createdByEmail: inv.createdByEmail || currentUser.email,
                createdAt: inv.createdAt || now,
                updatedBy: currentUser.id,
                updatedByName: currentUser.name,
                updatedByEmail: currentUser.email,
                updatedAt: now,
                // Append the new audit trail entry to any existing trail
                auditTrail: [...(inv.auditTrail || []), auditEntry],
              };
              await data.saveInvoice(enriched);
              setEditingInvoice(null);
              // Increment bill number only when creating a new invoice (not editing)
              if (!editingInvoice) {
                const currentNum = Number(data.settings.nextInvoiceNumber) || 1;
                // Also check the max existing invoice numeric ID to prevent overwriting
                const maxExisting = data.invoices.reduce((max, i) => {
                  const n = Number(i.id);
                  return !isNaN(n) && n > max ? n : max;
                }, 0);
                const nextNum = Math.max(currentNum, maxExisting) + 1;
                await data.updateSettings({ ...data.settings, nextInvoiceNumber: nextNum });
              }
            }}


            editingInvoice={editingInvoice}
            onClearEditingInvoice={() => setEditingInvoice(null)}
          />
        );
      case AppTab.INVOICE_HISTORY:
        return (
          <InvoiceHistory
            invoices={data.invoices}
            customers={data.customers}
            settings={data.settings}
            onDeleteInvoice={async (id) => {
              if (currentUser.role !== 'admin' && !currentUser.permissions?.canDeleteBills) {
                alert('Permission Denied: You do not have permission to delete invoices. Please contact your administrator.');
                return;
              }
              const inv = data.invoices.find(i => i.id === id);
              const custInfo = inv?.customerName ? ` for "${inv.customerName}"` : '';
              const amtInfo = inv?.total !== undefined ? ` (Total: ₹${inv.total})` : '';

              if (!window.confirm(`Are you sure you want to delete Bill #${id}${custInfo}${amtInfo}?\n\nThis bill will be moved to Trash. You can restore it anytime from Invoice History.`)) {
                return;
              }

              if (inv) await data.saveInvoice({
                ...inv,
                isDeleted: true,
                deletedAt: Date.now(),
                deletedBy: currentUser.id,
                deletedByName: currentUser.name,
                deletedByEmail: currentUser.email,
              });
            }}
            onRestoreInvoice={async (id) => {
              const inv = data.invoices.find(i => i.id === id);
              if (inv) await data.saveInvoice({ ...inv, isDeleted: false, restoredAt: Date.now() });
            }}
            onPermanentDeleteInvoice={async (id) => {
              if (currentUser.role !== 'admin') {
                alert('Permission Denied: Only Administrator can permanently delete invoices.');
                return;
              }
              if (!window.confirm(`Are you sure you want to permanently delete Bill #${id}?\n\nWARNING: This action CANNOT be undone.`)) {
                return;
              }
              await deleteInvoice(id);
              await data.refreshAll();
            }}
            onEmptyTrash={async () => {
              if (currentUser.role !== 'admin') {
                alert('Permission Denied: Only Administrator can empty the trash.');
                return;
              }
              const trashed = data.invoices.filter(i => i.isDeleted);
              if (trashed.length === 0) return;
              if (!window.confirm(`Permanently delete all ${trashed.length} invoices in Trash?\n\nWARNING: This cannot be undone.`)) {
                return;
              }
              for (const inv of trashed) {
                await deleteInvoice(inv.id);
              }
              await data.refreshAll();
            }}
            isMainAdmin={currentUser.role === 'admin'}
            businessMembers={localUsers.map(u => ({ uid: u.id, email: u.email, displayName: u.name, role: u.role }))}
            onEditInvoice={(inv) => {
              setEditingInvoice(inv);
              setActiveTab(AppTab.CREATE_BILL);
            }}
            onManagePayments={(inv) => {
              setPaymentInvoice(inv);
            }}
            enablePaymentTracking={features.enablePaymentTracking}
          />
        );
      case AppTab.ANALYTICS: {
        if (!features.enableAnalytics) return <FeatureDisabled name="Analytics" />;
        const isAdminUser = currentUser.role === 'admin';
        const canSeeProducts = !!features.enableProductsMenu && (isAdminUser || currentUser.permissions?.canManageProducts !== false);
        const canSeeCustomers = !!features.enableCustomersMenu && (isAdminUser || currentUser.permissions?.canManageCustomers !== false);
        const canSeeAi = !!features.enableAiAnalyst && (isAdminUser || currentUser.permissions?.canViewAnalytics !== false);
        return (
          <AnalyticsDashboard
            invoices={data.invoices.filter(i => !i.isDeleted)}
            products={data.products}
            customers={data.customers}
            settings={{
              ...data.settings,
              analyticsVisibility: {
                showProductAnalysis: canSeeProducts,
                showCustomerAnalysis: canSeeCustomers,
                showCustomerPurchaseDetails: canSeeCustomers,
                showAiBusinessAnalyst: canSeeAi,
              }
            }}
            enablePaymentTracking={features.enablePaymentTracking}
            enableAiAnalyst={canSeeAi}
            enableProductsMenu={canSeeProducts}
            enableCustomersMenu={canSeeCustomers}
          />
        );
      }

      case AppTab.PAYMENTS:
        if (!features.enablePaymentTracking) return <FeatureDisabled name="Payment Tracking" />;
        return (
          <PaymentManagement
            invoices={data.invoices.filter(i => !i.isDeleted)}
            customers={data.customers}
            settings={data.settings}
            onManagePayments={(inv) => setPaymentInvoice(inv)}
            onDeletePayment={handleDeletePayment}
          />
        );
      case AppTab.PRODUCTS:
        return (
          <div className="h-full flex flex-col overflow-hidden bg-slate-100 p-4 md:p-6">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex justify-between items-center shrink-0 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">Products</h2>
                    <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs">
                      {data.products.length}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">Manage your product catalog</p>
                </div>
              </div>

              {/* Add/Edit Form */}
              <div ref={productFormRef} className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
                <form onSubmit={handleProductSubmit} className="space-y-2 sm:space-y-3">
                  <div>
                    <input
                      name="name"
                      required
                      placeholder="Product Name *"
                      value={prodForm.name}
                      onChange={e => setProdForm({ ...prodForm, name: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full">
                    <input
                      name="packing"
                      placeholder="Size / Packing (e.g. 1kg, 500g)"
                      value={prodForm.packing}
                      onChange={e => setProdForm({ ...prodForm, packing: e.target.value })}
                      className="flex-1 min-w-0 p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white"
                    />
                    <input
                      name="rate"
                      type="number"
                      placeholder="Rate (optional)"
                      value={prodForm.rate}
                      onChange={e => setProdForm({ ...prodForm, rate: e.target.value })}
                      className="w-24 sm:w-28 p-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 focus:outline-none bg-white shrink-0 font-semibold"
                    />
                    {(() => {
                      const activeUnits = (data.settings.customUnits && data.settings.customUnits.length > 0)
                        ? data.settings.customUnits
                        : DEFAULT_PRODUCT_UNITS.slice(0, 10);
                      const unitOptions = Array.from(new Set([...activeUnits, prodForm.unit].filter(Boolean)));
                      return (
                        <select
                          name="unit"
                          value={prodForm.unit}
                          onChange={e => setProdForm({ ...prodForm, unit: e.target.value })}
                          className="w-20 sm:w-24 p-2 border border-slate-300 rounded text-sm bg-white focus:ring-1 focus:ring-red-500 focus:outline-none shrink-0"
                        >
                          {unitOptions.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      );
                    })()}
                    {editingProductId ? (
                      <>
                        <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center shrink-0 min-w-[36px] h-[38px] cursor-pointer" title="Update Product">
                          <Save size={18} />
                        </button>
                        <button type="button" onClick={cancelEditProduct} className="bg-slate-400 text-white p-2 rounded hover:bg-slate-500 flex items-center justify-center shrink-0 min-w-[36px] h-[38px] cursor-pointer" title="Cancel Edit">
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <button type="submit" className="bg-red-600 text-white p-2 rounded hover:bg-red-700 flex items-center justify-center shrink-0 min-w-[36px] h-[38px] cursor-pointer" title="Add Product">
                        <PlusCircle size={20} />
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Search Bar */}
              <div className="p-2.5 sm:p-3 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                  <input
                    type="text"
                    placeholder="Search product name or packing..."
                    value={productSearchQuery}
                    onChange={e => setProductSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 bg-white outline-none"
                  />
                  {productSearchQuery && (
                    <button onClick={() => setProductSearchQuery('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Action Bar */}
              {selectedProductIds.size > 0 && (
                <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-red-700">{selectedProductIds.size} selected</span>
                  <button onClick={bulkDeleteProducts} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Trash size={13} /> Delete Selected
                  </button>
                  <button onClick={() => setSelectedProductIds(new Set())} className="text-slate-500 hover:text-slate-700 text-xs font-medium cursor-pointer">
                    Clear Selection
                  </button>
                </div>
              )}

              {/* Products List */}
              <div className="flex-1 overflow-y-auto">
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-10">
                          <input type="checkbox"
                            checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.has(p.id))}
                            onChange={e => setSelectedProductIds(e.target.checked ? new Set(filteredProducts.map(p => p.id)) : new Set())}
                            className="w-4 h-4 rounded cursor-pointer accent-red-600"
                          />
                        </th>
                        <th className="p-4 whitespace-nowrap">Product Name</th>
                        <th className="p-4 whitespace-nowrap">Packing</th>
                        <th className="p-4 whitespace-nowrap">Rate</th>
                        <th className="p-4 whitespace-nowrap">Unit</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map(p => (
                        <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${editingProductId === p.id ? 'bg-blue-50' : ''} ${selectedProductIds.has(p.id) ? 'bg-red-50/40' : ''}`}>
                          <td className="p-3">
                            <input type="checkbox"
                              checked={selectedProductIds.has(p.id)}
                              onChange={e => setSelectedProductIds(prev => { const s = new Set(prev); e.target.checked ? s.add(p.id) : s.delete(p.id); return s; })}
                              className="w-4 h-4 rounded cursor-pointer accent-red-600"
                            />
                          </td>
                          <td className="p-4 font-semibold text-slate-900">{p.name}</td>
                          <td className="p-4 text-slate-600">{p.packing || '-'}</td>
                          <td className="p-4 font-bold text-red-600">{(p.rate || p.price) ? `₹${p.rate || p.price}` : '-'}</td>
                          <td className="p-4"><span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">{p.unit || '-'}</span></td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setSelectedProductForModal(p)} className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-xs font-bold border border-emerald-200 shadow-2xs cursor-pointer" title="Sales & Analytics">
                                <BarChart3 size={15} /> Analytics
                              </button>
                              <button onClick={() => startEditProduct(p)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded transition-colors cursor-pointer" title="Edit">
                                <Edit size={17} />
                              </button>
                              <button onClick={() => deleteProduct(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors cursor-pointer" title="Delete">
                                <Trash size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-400 font-medium">
                            <Package className="w-12 h-12 mx-auto mb-2 opacity-40" />
                            No products found in your catalog.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden p-3 space-y-3">
                  {filteredProducts.map(p => (
                    <div key={p.id} className={`bg-white border rounded-xl p-3.5 shadow-xs transition-all ${editingProductId === p.id ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{p.name}</h3>
                          <p className="text-xs text-slate-500">{p.packing || 'No packing info'}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-red-600">{(p.rate || p.price) ? `₹${p.rate || p.price}` : '-'}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-700">{p.unit}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button onClick={() => setSelectedProductForModal(p)} className="flex-1 border border-emerald-200 bg-emerald-50 text-emerald-700 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 font-bold text-xs">
                          <BarChart3 size={13} /> Analytics
                        </button>
                        <button onClick={() => startEditProduct(p)} className="bg-blue-50 text-blue-600 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1 font-medium text-xs">
                          <Edit size={14} /> Edit
                        </button>
                        <button onClick={() => deleteProduct(p.id)} className="bg-red-50 text-red-600 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1 font-medium text-xs">
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unsaved Products Banner */}
                {unsavedInvoiceProducts.length > 0 && (
                  <div className="p-4 bg-amber-50/80 border-t border-amber-200 mt-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <PackagePlus className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <h3 className="font-bold text-amber-900 text-sm">Unsaved Products from Past Invoices ({unsavedInvoiceProducts.length})</h3>
                          <p className="text-xs text-amber-700">These products were used on bills but are not yet saved in your permanent product catalog.</p>
                        </div>
                      </div>
                      <button onClick={handleSaveAllUnsavedProducts} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm">
                        <PackagePlus size={13} /> Save All
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {unsavedInvoiceProducts.map(u => (
                        <div key={u.name} className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm truncate">{u.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              {u.rate > 0 && <span className="font-semibold text-red-600">₹{u.rate}</span>}
                              {u.packing && <span className="text-slate-600">({u.packing})</span>}
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded">{u.count} bill{u.count > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleQuickSaveProduct(u.name, u.rate, u.unit, u.packing)}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                          >
                            <PackagePlus size={14} /> Save
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case AppTab.CUSTOMERS:
        return (
          <div className="h-full flex flex-col overflow-hidden bg-slate-100 p-4 md:p-6">
            <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex justify-between items-center shrink-0 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">Customers</h2>
                    <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs">
                      {data.customers.length}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">Manage your customer database & insights</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerFormMobile(prev => !prev)}
                  className="md:hidden bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>{showCustomerFormMobile || editingCustomerId ? 'Close' : '+ Add'}</span>
                </button>
              </div>

              {/* Add/Edit Form */}
              <div ref={customerFormRef} className={`${showCustomerFormMobile || editingCustomerId ? 'block' : 'hidden md:block'} p-3 sm:p-4 border-b border-slate-200 bg-slate-50 shrink-0`}>
                <form onSubmit={handleCustomerSubmit}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5 items-center">
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="name"
                        required
                        placeholder="Customer Name *"
                        value={custForm.name}
                        onChange={e => setCustForm({ ...custForm, name: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 bg-white outline-none"
                      />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="city"
                        placeholder="City"
                        value={custForm.city}
                        onChange={e => setCustForm({ ...custForm, city: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 bg-white outline-none"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                      <input
                        name="phone"
                        placeholder="Phone Number"
                        value={custForm.phone}
                        onChange={e => setCustForm({ ...custForm, phone: e.target.value })}
                        className="w-full pl-9 pr-2.5 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 bg-white outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {editingCustomerId ? (
                        <>
                          <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer" title="Update Customer">
                            <Save size={15} /> <span>Update</span>
                          </button>
                          <button type="button" onClick={cancelEditCustomer} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-2.5 rounded-lg text-xs sm:text-sm cursor-pointer" title="Cancel Edit">
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
                          <UserPlus size={15} /> <span>Add Customer</span>
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {/* Search Bar */}
              <div className="p-2.5 sm:p-3 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={15} />
                  <input
                    type="text"
                    placeholder="Search by name, city, or phone..."
                    value={customerSearchQuery}
                    onChange={e => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-red-500 bg-white outline-none"
                  />
                  {customerSearchQuery && (
                    <button onClick={() => setCustomerSearchQuery('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Action Bar */}
              {selectedCustomerIds.size > 0 && (
                <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-red-700">{selectedCustomerIds.size} selected</span>
                  <button onClick={bulkDeleteCustomers} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Trash size={13} /> Delete Selected
                  </button>
                  <button onClick={() => setSelectedCustomerIds(new Set())} className="text-slate-500 hover:text-slate-700 text-xs font-medium cursor-pointer">
                    Clear Selection
                  </button>
                </div>
              )}

              {/* Customers List */}
              <div className="flex-1 overflow-y-auto">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-10">
                          <input type="checkbox"
                            checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedCustomerIds.has(c.id))}
                            onChange={e => setSelectedCustomerIds(e.target.checked ? new Set(filteredCustomers.map(c => c.id)) : new Set())}
                            className="w-4 h-4 rounded cursor-pointer accent-red-600"
                          />
                        </th>
                        <th className="p-4 whitespace-nowrap">Customer</th>
                        <th className="p-4 whitespace-nowrap">City</th>
                        <th className="p-4 whitespace-nowrap">Phone</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCustomers.map(c => {
                        const initials = c.name ? c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'C';
                        const ph = c.phone || (c as any).mobile;
                        return (
                          <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${editingCustomerId === c.id ? 'bg-blue-50/50' : ''} ${selectedCustomerIds.has(c.id) ? 'bg-red-50/40' : ''}`}>
                            <td className="p-3">
                              <input type="checkbox"
                                checked={selectedCustomerIds.has(c.id)}
                                onChange={e => setSelectedCustomerIds(prev => { const s = new Set(prev); e.target.checked ? s.add(c.id) : s.delete(c.id); return s; })}
                                className="w-4 h-4 rounded cursor-pointer accent-red-600"
                              />
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
                                  {initials}
                                </div>
                                <span className="font-semibold text-slate-900">{c.name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-600 text-sm">{c.city || '-'}</td>
                            <td className="p-4 text-slate-600 text-sm font-mono">{ph || '-'}</td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setSelectedCustomerForModal(c)} className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold border border-indigo-200 shadow-2xs cursor-pointer" title="Spending & Purchases">
                                  <BarChart3 size={15} /> Spending & Purchases
                                </button>
                                <button onClick={() => startEditCustomer(c)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-xl transition-colors cursor-pointer" title="Edit">
                                  <Edit size={17} />
                                </button>
                                <button onClick={() => deleteCustomer(c.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-xl transition-colors cursor-pointer" title="Delete">
                                  <Trash size={17} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredCustomers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                            <Users className="w-12 h-12 mx-auto mb-2 opacity-40" />
                            No customers found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden p-3.5 space-y-3">
                  {filteredCustomers.map(c => {
                    const initials = c.name ? c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'C';
                    const ph = c.phone || (c as any).mobile;
                    return (
                      <div key={c.id} className={`bg-white border rounded-2xl p-4 shadow-xs ${editingCustomerId === c.id ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200'}`}>
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-base leading-snug truncate">{c.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {c.city && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-xs font-medium"><MapPin size={11} /> {c.city}</span>}
                              {ph && <a href={`tel:${ph}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium"><PhoneCall size={11} /> {ph}</a>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100">
                          <button onClick={() => setSelectedCustomerForModal(c)} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-xs border border-indigo-100">
                            <BarChart3 size={14} /> <span>Spending</span>
                          </button>
                          <button onClick={() => startEditCustomer(c)} className="bg-blue-50 text-blue-700 p-2 rounded-xl"><Edit size={15} /></button>
                          <button onClick={() => deleteCustomer(c.id)} className="bg-red-50 text-red-600 p-2 rounded-xl"><Trash size={15} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Unsaved Customers Banner */}
                {unsavedInvoiceCustomers.length > 0 && (
                  <div className="p-4 bg-amber-50/80 border-t border-amber-200 mt-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <h3 className="font-bold text-amber-900 text-sm">Unsaved Customers from Past Invoices ({unsavedInvoiceCustomers.length})</h3>
                          <p className="text-xs text-amber-700">These customers exist on past bills but are not yet saved in your permanent Customer directory.</p>
                        </div>
                      </div>
                      <button onClick={handleSaveAllUnsavedCustomers} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm">
                        <UserPlus size={13} /> Save All
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {unsavedInvoiceCustomers.map(u => (
                        <div key={u.name} className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 text-sm truncate">{u.name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              {u.city && <span>📍 {u.city}</span>}
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded">{u.count} bill{u.count > 1 ? 's' : ''} (₹{u.totalSpent.toLocaleString('en-IN')})</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleQuickSaveCustomer(u.name, u.city)}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                          >
                            <UserPlus size={14} /> Save
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case AppTab.SETTINGS:
        if (currentUser.role !== 'admin' && !currentUser.permissions?.canViewSettings) {
          return <FeatureDisabled name="Settings (Requires Admin or Settings Permission)" />;
        }
        return (
          <OfflineSettings
            settings={data.settings}
            onUpdateSettings={data.updateSettings}
            features={features}
            onShowBackup={() => setShowBackupModal(true)}
            onCloudImport={handleCloudImport}
            onReloadFeatures={onReloadFeatures}
          />
        );
      case AppTab.USERS:
        if (currentUser.role !== 'admin') {
          return <FeatureDisabled name="Team & User Management (Admin Only)" />;
        }
        return <UserManagement currentUser={currentUser} onUserUpdated={onUserUpdated} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f172a', position: 'relative' }}>
      {/* Sidebar */}
      <OfflineSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        features={features}
        currentUser={currentUser}
        onLogout={onLogout}
        settings={data.settings}
      />


      {/* Main content — white background for all tabs */}
      <div style={{ flex: 1, overflow: 'auto', background: 'white', position: 'relative', zIndex: 1 }}>
        {renderTab()}
      </div>

      {/* ── Modals rendered OUTSIDE the scrollable content div to avoid pointer-event interference ── */}

      {/* Payment Tracker Modal */}
      {paymentInvoice && (
        <PaymentTrackerModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onAddPayment={handleAddPayment}
          onDeletePayment={handleDeletePayment}
        />
      )}

      {/* Customer Spending & Purchase Details Modal */}
      {selectedCustomerForModal && (
        <CustomerSpendingModal
          customer={selectedCustomerForModal}
          invoices={data.invoices.filter(inv => !inv.isDeleted)}
          settings={data.settings}
          onClose={() => setSelectedCustomerForModal(null)}
        />
      )}

      {/* Product Sales & Buying Analysis Modal */}
      {selectedProductForModal && (
        <ProductAnalysisModal
          product={selectedProductForModal}
          invoices={data.invoices.filter(inv => !inv.isDeleted)}
          customers={data.customers}
          settings={data.settings}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}

      {/* Backup Modal */}
      {showBackupModal && (
        <BackupModal
          backupList={backupList}
          message={backupMsg}
          onCreateBackup={handleCreateBackup}
          onRestoreBackup={handleRestoreBackup}
          onOpenFolder={openBackupFolder}
          onClose={() => setShowBackupModal(false)}
          onRefreshList={async () => setBackupList(await listBackups())}
        />
      )}
    </div>
  );
};

// ─── Offline Sidebar ──────────────────────────────────────────────────────────
const OfflineSidebar: React.FC<{
  activeTab: AppTab;
  onTabChange: (t: AppTab) => void;
  features: OfflineFeatures;
  currentUser: LocalUser;
  onLogout: () => void;
  settings: BusinessSettings;
}> = ({ activeTab, onTabChange, features, currentUser, onLogout, settings }) => {
  const isAdmin = currentUser.role === 'admin';

  const navItems = [
    {
      tab: AppTab.CREATE_BILL,
      label: 'Create Bill',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      show: true,
    },
    {
      tab: AppTab.INVOICE_HISTORY,
      label: 'Invoice History',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      show: true,
    },
    {
      tab: AppTab.PAYMENTS,
      label: 'Payments',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
      show: features.enablePaymentTracking && (isAdmin || currentUser.permissions?.canManagePayments !== false),
    },
    {
      tab: AppTab.ANALYTICS,
      label: 'Analytics',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      show: features.enableAnalytics && (isAdmin || currentUser.permissions?.canViewAnalytics),
    },
    {
      tab: AppTab.PRODUCTS,
      label: 'Products',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
      show: features.enableProductsMenu && (isAdmin || currentUser.permissions?.canManageProducts !== false),
    },
    {
      tab: AppTab.CUSTOMERS,
      label: 'Customers',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      show: features.enableCustomersMenu && (isAdmin || currentUser.permissions?.canManageCustomers !== false),
    },
    {
      tab: AppTab.SETTINGS,
      label: 'Settings',
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      show: isAdmin || currentUser.permissions?.canViewSettings,
    },
  ];

  const firstChar = (settings.name?.trim().charAt(0) || 'B').toUpperCase();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col no-print" style={{ minHeight: '100vh' }}>
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        {settings.logoUrl ? (
          <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-slate-700">
            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-lg shrink-0 shadow-sm">
            {firstChar}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-serif text-white font-bold tracking-wide truncate" title={settings.name || 'Universal Billing'}>
            {settings.name || 'Universal Billing'}
          </h1>
          <p className="text-[10px] text-slate-500 font-medium">v2.0 (Desktop)</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.filter(n => n.show).map(n => {
          const isActive = activeTab === n.tab;
          return (
            <button
              key={n.tab}
              onClick={() => onTabChange(n.tab)}
              className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors text-sm font-medium cursor-pointer ${
                isActive
                  ? 'bg-red-600 text-white'
                  : 'hover:bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom Menu: Team & Users (Placed at bottom, right before User ID Area) */}
      {isAdmin && (
        <div className="px-4 pb-2">
          <button
            onClick={() => onTabChange(AppTab.USERS)}
            className={`flex items-center gap-3 w-full p-2.5 rounded-lg transition-colors text-sm font-medium cursor-pointer ${
              activeTab === AppTab.USERS
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 bg-slate-800/40'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div className="flex-1 text-left flex items-center justify-between">
              <span>Team & Users</span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-400/30">
                Admin
              </span>
            </div>
          </button>
        </div>
      )}

      {/* User Footer / ID Area */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${isAdmin ? 'bg-purple-600' : 'bg-blue-600'}`}>
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs text-white font-semibold truncate">{currentUser.name}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wide ${isAdmin ? 'text-purple-400' : 'text-blue-400'}`}>
              {currentUser.role}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-1 text-xs font-medium cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Logout
        </button>
      </div>
    </aside>
  );
};



// ─── Backup Modal ─────────────────────────────────────────────────────────────
const BackupModal: React.FC<{
  backupList: any[];
  message: string;
  onCreateBackup: () => void;
  onRestoreBackup: (fp: string) => void;
  onOpenFolder: () => void;
  onClose: () => void;
  onRefreshList: () => void;
}> = ({ backupList, message, onCreateBackup, onRestoreBackup, onOpenFolder, onClose, onRefreshList }) => {
  useEffect(() => { onRefreshList(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 16, padding: 28, width: 560, maxHeight: '80vh',
        overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'white', fontSize: 18, fontWeight: 700 }}>💾 Backup Management</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>

        {message && (
          <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, color: '#93c5fd', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={onCreateBackup} style={btnStyle('#059669')}>🆕 Create Backup Now</button>
          <button onClick={onOpenFolder} style={btnStyle('#374151')}>📂 Open Folder</button>
        </div>

        <h4 style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
          Available Backups ({backupList.length})
        </h4>

        {backupList.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No backups found yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backupList.map(b => (
              <div key={b.filename} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px'
              }}>
                <div>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>{b.date}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                    {(b.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button onClick={() => onRestoreBackup(b.path)} style={btnStyle('#dc2626', true)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Feature Disabled placeholder ─────────────────────────────────────────────
const FeatureDisabled: React.FC<{ name: string }> = ({ name }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter, sans-serif'
  }}>
    <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
    <h3 style={{ margin: 0, fontSize: 18 }}>{name} not enabled</h3>
    <p style={{ fontSize: 13, marginTop: 8 }}>This feature is not included in your license.</p>
  </div>
);

// ─── Style helpers ────────────────────────────────────────────────────────────
function btnStyle(bg: string, small = false): React.CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
    padding: small ? '6px 12px' : '8px 16px', fontSize: small ? 12 : 13, fontWeight: 600,
    transition: 'opacity 0.15s',
  };
}

// ─── Activation Screen ────────────────────────────────────────────────────────
const ActivationScreen: React.FC = () => {
  const [fingerprint, setFingerprint] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getHardwareFingerprint().then(fp => setFingerprint(fp || ''));
  }, []);

  const handleCopy = () => {
    if (fingerprint) {
      navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setStatus({ type: 'error', message: 'Please enter a license key.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Verifying license...' });
    try {
      const res = await installLicense(licenseKey.trim());
      if (res.valid || res.success) {
        setStatus({
          type: 'success',
          message: `✅ License activated successfully${res.customerName ? ` for ${res.customerName}` : ''}! Launching app...`
        });
      } else {
        setStatus({ type: 'error', message: res.error || 'Invalid license key for this machine.' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Activation failed' });
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white',
      fontFamily: 'Inter, system-ui, sans-serif', padding: 24, boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: 28, width: '100%', maxWidth: 440,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="./icon.png" alt="Logo" style={{ width: 68, height: 68, borderRadius: 16, margin: '0 auto 12px', display: 'block', objectFit: 'contain' }} />
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Universal Billing System</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            This installation is locked to this computer. Enter your license key below to activate.
          </p>
        </div>

        <div style={{ marginBottom: 16, background: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Machine Fingerprint</span>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: copied ? '#10b981' : '#334155', color: 'white', border: 'none',
                borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 500
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', color: '#cbd5e1',
            wordBreak: 'break-all', userSelect: 'all'
          }}>
            {fingerprint || 'Generating fingerprint...'}
          </div>
        </div>

        <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
              License Key
            </label>
            <textarea
              rows={3}
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="Paste license key here..."
              style={{
                width: '100%', padding: '10px 12px', background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                color: 'white', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                boxSizing: 'border-box', resize: 'vertical'
              }}
            />
          </div>

          {status.message && (
            <div style={{
              padding: 10, borderRadius: 8, fontSize: 12,
              background: status.type === 'error' ? 'rgba(239,68,68,0.15)' : status.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
              color: status.type === 'error' ? '#fca5a5' : status.type === 'success' ? '#6ee7b7' : '#93c5fd',
              border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : status.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`
            }}>
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={status.type === 'loading'}
            style={{
              marginTop: 4, background: '#2563eb', color: 'white', border: 'none',
              padding: '10px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13,
              cursor: status.type === 'loading' ? 'not-allowed' : 'pointer',
              opacity: status.type === 'loading' ? 0.7 : 1
            }}
          >
            {status.type === 'loading' ? 'Activating...' : 'Activate System'}
          </button>
        </form>
      </div>
    </div>
  );
};
