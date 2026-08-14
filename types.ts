export interface Product {
  id: string;
  name: string;
  rate: number;
  price?: number;
  unit: string; // e.g., kg, gm, pcs
  packing?: string; // e.g. 1 kg, 250 gm
}

export interface Customer {
  id: string;
  name: string;
  city: string;
  phone?: string;
  mobile?: string;
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

export interface AnalyticsVisibilitySettings {
  showProductAnalysis?: boolean;
  showCustomerAnalysis?: boolean;
  showCustomerPurchaseDetails?: boolean;
  showAiBusinessAnalyst?: boolean;
}

export interface BusinessSettings {
  name: string;
  businessName?: string;
  subName: string;
  address: string;
  mobile: string;
  phone?: string;
  email?: string;
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
  gstNo?: string;
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
  // Declaration Settings
  showDeclaration?: boolean;
  declarationText?: string;
  // Analytics & AI Visibility Toggles (Admin)
  analyticsVisibility?: AnalyticsVisibilitySettings;
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
  customerMobile?: string;
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
  INVOICE_HISTORY = 'INVOICE_HISTORY',
  PAYMENTS = 'PAYMENTS',
  ANALYTICS = 'ANALYTICS',
  PRODUCTS = 'PRODUCTS',
  CUSTOMERS = 'CUSTOMERS',
  SETTINGS = 'SETTINGS',
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
  analyticsPermissions?: AnalyticsVisibilitySettings;
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