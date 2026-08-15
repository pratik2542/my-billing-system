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
  showUnitInItemsTable?: boolean; // Show/hide unit like 'Sq Ft' in bill table rows (default true)
  showTotalQuantityInFooter?: boolean; // Show/hide total quantity summary in footer (default true)
  totalQuantityCustomText?: string; // Custom override text or unit for total quantity in footer
}

export interface AnalyticsVisibilitySettings {
  showProductAnalysis?: boolean;
  showCustomerAnalysis?: boolean;
  showCustomerPurchaseDetails?: boolean;
  showAiBusinessAnalyst?: boolean;
}

// Bill Font Types
export type BillFontStyle =
  | 'crimson-serif'
  | 'inter-sans'
  | 'roboto-mono'
  | 'space-mono'
  | 'roboto-condensed'
  | 'open-sans'
  | 'merriweather-serif'
  | 'inconsolata-mono';

export type BillFontScope = 'items_and_customer' | 'entire_bill';
export type BillFontWeight = 'normal' | 'medium' | 'bold';

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
  showProductsMenu?: boolean; // Admin option to show/hide Products catalog in menu (default true)
  showCustomersMenu?: boolean; // Admin option to show/hide Customers directory in menu (default true)
  // Product Units
  customUnits?: string[];
  // Typography / Styling
  nameLetterSpacing?: string;
  billFont?: BillFontStyle | string;
  billFontScope?: BillFontScope | string;
  billFontWeight?: BillFontWeight | string;
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
  // Unit & Total quantity display customizations
  showUnitInItemsTable?: boolean;
  customTotalQtyText?: string;
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
  productsMenuBlocked?: boolean; // When true, Products menu is blocked/hidden by Admin
  customersMenuBlocked?: boolean; // When true, Customers menu is blocked/hidden by Admin
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