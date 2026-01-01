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

export interface BusinessSettings {
  name: string;
  subName: string;
  address: string;
  mobile: string;
  logoInitial: string;
  themeColor: string;
  logoUrl?: string;
  logoWidth?: number;
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
}

export enum AppTab {
  DASHBOARD = 'DASHBOARD',
  CREATE_BILL = 'CREATE_BILL',
  PRODUCTS = 'PRODUCTS',
  CUSTOMERS = 'CUSTOMERS',
  SETTINGS = 'SETTINGS',
  INVOICE_HISTORY = 'INVOICE_HISTORY',
  ANALYTICS = 'ANALYTICS'
}