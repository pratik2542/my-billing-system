export interface Product {
  id: string;
  name: string;
  rate: number;
  unit: string; // e.g., kg, gm, pcs
  packing?: string; // e.g. 1 kg, 250 gm
}

export interface Customer {
  id: string;
  name: string;
  city: string;
  phone?: string;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  packing?: string;
}

export interface InvoiceHeaderCustomization {
  snHeader?: string;
  particularsHeader?: string;
  packingHeader?: string;
  qtyHeader?: string;
  rateHeader?: string;
  amountHeader?: string;
  mergePackingAndQty?: boolean;
  mergedPackingQtyHeader?: string;
}

export interface BusinessSettings {
  name: string;
  subName: string;
  address: string;
  mobile: string;
  logoInitial: string;
  themeColor: string;
  logoUrl?: string;
  logoWidth?: number;
  signatureName?: string; // Custom name for signature (For, XYZ)
  signatureUrl?: string; // Signature image
  // Bank Details
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBranch?: string;
  // Auto Increment
  nextInvoiceNumber: number;
  // GST Settings
  enableGst: boolean;
  gstin?: string;
  defaultGstRate?: number;
  // UPI Settings
  upiId?: string;
  showUpiQr?: boolean;
  // Feature Toggles
  enablePaymentTracking?: boolean;
  // Product Units
  customUnits?: string[];
  // Typography / Styling
  nameLetterSpacing?: string;
  // Custom Invoice Table Headers
  columnHeaders?: InvoiceHeaderCustomization;
}

export type PaymentMode = 'Cash' | 'UPI' | 'Cheque' | 'Bank Transfer' | 'Other';

export interface PaymentEntry {
  id: string;
  amount: number;
  mode: PaymentMode;
  date: string; // DD/MM/YYYY
  note?: string;
}

export interface Invoice {
  id: string; // Bill No
  date: string;
  customerName: string;
  customerCity: string;
  items: InvoiceItem[];
  total: number;
  // GST details (optional for backward compatibility)
  subtotal?: number;
  gstAmount?: number;
  gstRate?: number;
  sgstAmount?: number;
  cgstAmount?: number;
  // Payment tracking
  payments?: PaymentEntry[];
}

export enum AppTab {
  DASHBOARD = 'DASHBOARD',
  CREATE_BILL = 'CREATE_BILL',
  PRODUCTS = 'PRODUCTS',
  CUSTOMERS = 'CUSTOMERS',
  SETTINGS = 'SETTINGS',
  INVOICE_HISTORY = 'INVOICE_HISTORY',
  ANALYTICS = 'ANALYTICS',
  ADMIN_PORTAL = 'ADMIN_PORTAL'
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  status: 'active' | 'blocked';
  paymentTrackingBlocked?: boolean;
  csvImportAllowed?: boolean;
  maxAllowedSessions?: number; // Admin configurable max active logins (default: 1)
  activeSessions?: Array<{ id: string; device: string; lastActive: number }>;
  businessId?: string;
  businessName?: string;
  role?: 'owner' | 'member' | 'admin';
  activeSessionId?: string;
  activeSessionDevice?: string;
  createdAt: number;
  lastLogin: number;
  lastSeen: number;
  aiRequestCount: number;
  errorCount: number;
  invoiceCount: number;
}

export interface UserSession {
  id: string;
  device: string;
  browser: string;
  loginAt: number;
  lastActive: number;
}

export interface AppErrorLog {
  id: string;
  message: string;
  stack?: string;
  timestamp: number;
  route: string;
}

export type ActivityCategory = 'invoice' | 'ai' | 'product' | 'customer' | 'payment' | 'analytics' | 'settings' | 'auth';

export interface UserActivityLog {
  id: string;
  action: string;
  category: ActivityCategory;
  details?: string;
  timestamp: number;
  userId?: string;
  userEmail?: string;
}