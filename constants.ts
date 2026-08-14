import { BusinessSettings } from "./types";

export const DEFAULT_PRODUCT_UNITS = [
  'Kg',
  'Gm',
  'Pkt',
  'Qty',
  'Ltr',
  'Pcs',
  'Meter',
  'Box',
  'Dozen',
  'Ft',
  'Sq Ft',
  'Roll',
  'Set',
  'Bundle',
  'Bag',
  'Pair',
  'Ton',
  'Quintal'
];

export const DEFAULT_COLUMN_HEADERS = {
  snHeader: 'No.',
  particularsHeader: 'Details',
  packingHeader: 'Packing',
  qtyHeader: 'Qty',
  rateHeader: 'Rate',
  amountHeader: 'Amount',
  mergePackingAndQty: false,
  mergedPackingQtyHeader: 'Packing / Qty'
};

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: "PRINT WORKS",
  subName: "offset & screen printing offset process color print & packaging box",
  address: "opposite ram temple, talaja road, palitana",
  mobile: "94269 89569",
  logoInitial: "P",
  themeColor: "#dc2626", // Default Red
  logoUrl: "",
  logoWidth: 80,
  signatureName: "",
  signatureUrl: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankBranch: "",
  nextInvoiceNumber: 1,
  enableGst: false,
  gstin: "",
  defaultGstRate: 12,
  upiId: "",
  showUpiQr: false,
  enablePaymentTracking: true,
  customUnits: ['Kg', 'Gm', 'Pkt', 'Ltr', 'Pcs', 'Meter', 'Box', 'Dozen', 'Ft', 'Sq Ft'],
  nameLetterSpacing: '0.05em',
  columnHeaders: DEFAULT_COLUMN_HEADERS,
  analyticsVisibility: {
    showProductAnalysis: true,
    showCustomerAnalysis: true,
    showCustomerPurchaseDetails: true,
    showAiBusinessAnalyst: true
  }
};