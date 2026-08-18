import { BusinessSettings, ColumnId, InvoiceHeaderCustomization } from "./types";

export const DEFAULT_UNMERGED_COLUMN_ORDER: ColumnId[] = ['sn', 'particulars', 'packing', 'qty', 'rate', 'amount'];
export const DEFAULT_MERGED_COLUMN_ORDER: ColumnId[] = ['sn', 'particulars', 'packingQty', 'rate', 'amount'];

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

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, string> = {
  sn: 'w-10',
  particulars: 'flex-1',
  packing: 'w-24',
  qty: 'w-16',
  packingQty: 'w-40',
  rate: 'w-20',
  amount: 'w-32',
};

export const COLUMN_WIDTH_OPTIONS: { label: string; value: string }[] = [
  { label: 'Compact (w-12)', value: 'w-12' },
  { label: 'Small (w-16)', value: 'w-16' },
  { label: 'Compact-Medium (w-20)', value: 'w-20' },
  { label: 'Normal (w-24)', value: 'w-24' },
  { label: 'Medium-Wide (w-28)', value: 'w-28' },
  { label: 'Wide (w-32)', value: 'w-32' },
  { label: 'Extra Wide (w-36)', value: 'w-36' },
  { label: 'Large (w-40)', value: 'w-40' },
  { label: 'Jumbo (w-48)', value: 'w-48' },
];

export const DEFAULT_COLUMN_HEADERS: InvoiceHeaderCustomization = {
  snHeader: 'No.',
  particularsHeader: 'Details',
  packingHeader: 'Packing',
  qtyHeader: 'Qty',
  rateHeader: 'Rate',
  amountHeader: 'Amount',
  mergePackingAndQty: false,
  mergedPackingQtyHeader: 'Packing / Qty',
  showUnitInItemsTable: true,
  showTotalQuantityInFooter: true,
  totalQuantityCustomText: '',
  columnOrder: DEFAULT_UNMERGED_COLUMN_ORDER,
  columnWidths: DEFAULT_COLUMN_WIDTHS
};

export const getEffectiveColumnOrder = (colHeaders?: InvoiceHeaderCustomization): ColumnId[] => {
  const isMerged = !!colHeaders?.mergePackingAndQty;
  const rawOrder = colHeaders?.columnOrder;

  const validUnmerged: ColumnId[] = ['sn', 'particulars', 'packing', 'qty', 'rate', 'amount'];
  const validMerged: ColumnId[] = ['sn', 'particulars', 'packingQty', 'rate', 'amount'];
  const allowedSet = new Set<ColumnId>(isMerged ? validMerged : validUnmerged);

  if (!rawOrder || !Array.isArray(rawOrder) || rawOrder.length === 0) {
    return isMerged ? [...DEFAULT_MERGED_COLUMN_ORDER] : [...DEFAULT_UNMERGED_COLUMN_ORDER];
  }

  const result: ColumnId[] = [];

  rawOrder.forEach((c) => {
    const col = c as ColumnId;
    if (isMerged) {
      if (col === 'packing' || col === 'qty' || col === 'packingQty') {
        if (!result.includes('packingQty')) result.push('packingQty');
      } else if (allowedSet.has(col) && !result.includes(col)) {
        result.push(col);
      }
    } else {
      if (col === 'packingQty') {
        if (!result.includes('packing')) result.push('packing');
        if (!result.includes('qty')) result.push('qty');
      } else if (allowedSet.has(col) && !result.includes(col)) {
        result.push(col);
      }
    }
  });

  allowedSet.forEach((col) => {
    if (!result.includes(col)) {
      result.push(col);
    }
  });

  return result;
};

export interface BillFontOption {
  id: string;
  name: string;
  category: 'Serif' | 'Sans-Serif' | 'Monospace';
  fontFamily: string;
  description: string;
  lookDescription: string;
  badge: string;
  exampleCustomer: string;
  exampleItem: string;
}

export const BILL_FONT_OPTIONS: BillFontOption[] = [
  {
    id: 'crimson-serif',
    name: 'Classic Stationery Serif',
    category: 'Serif',
    fontFamily: "'Crimson Text', Georgia, 'Times New Roman', serif",
    description: 'Traditional printed bill book with serif typography.',
    lookDescription: 'Authentic pre-printed stationery bill book look.',
    badge: 'Classic Default',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'inter-sans',
    name: 'Modern Computerized Sans',
    category: 'Sans-Serif',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    description: 'Standard modern digital invoicing software look.',
    lookDescription: 'Looks like modern Tally / Marg ERP software bills.',
    badge: 'Tally / ERP Style',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'roboto-mono',
    name: 'Accounting Monospace',
    category: 'Monospace',
    fontFamily: "'Roboto Mono', 'Courier New', monospace",
    description: 'Fixed-width tabular numbers for mathematical alignment.',
    lookDescription: 'Clean computerized ledger & accounting printout.',
    badge: 'Accounting Ledger',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'space-mono',
    name: 'Dot-Matrix Printer Mono',
    category: 'Monospace',
    fontFamily: "'Space Mono', 'Courier New', monospace",
    description: 'Continuous tractor-feed paper dot-matrix style.',
    lookDescription: 'Authentic wholesale mandi & warehouse dot-matrix printer.',
    badge: 'Dot-Matrix Look',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'roboto-condensed',
    name: 'Compact Narrow Sans',
    category: 'Sans-Serif',
    fontFamily: "'Roboto Condensed', 'Arial Narrow', sans-serif",
    description: 'Narrow proportions fit long item names and descriptions cleanly.',
    lookDescription: 'Industrial packaging & high-density retail invoice.',
    badge: 'Compact Fit',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'open-sans',
    name: 'Corporate Office Sans',
    category: 'Sans-Serif',
    fontFamily: "'Open Sans', Arial, Helvetica, sans-serif",
    description: 'Standard neutral commercial office typography.',
    lookDescription: 'Standard corporate A4 commercial invoice.',
    badge: 'Office Standard',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'merriweather-serif',
    name: 'Heritage Press Serif',
    category: 'Serif',
    fontFamily: "'Merriweather', Georgia, 'Times New Roman', serif",
    description: 'Deep contrast, heavy ink impression letterpress style.',
    lookDescription: 'Heavy-set traditional mechanical printing.',
    badge: 'Heavy Ink',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  },
  {
    id: 'inconsolata-mono',
    name: 'POS Terminal Monospace',
    category: 'Monospace',
    fontFamily: "'Inconsolata', Consolas, 'Courier New', monospace",
    description: 'Crisp, compact computerized receipt style.',
    lookDescription: 'Modern computerized terminal & receipt look.',
    badge: 'POS Terminal',
    exampleCustomer: 'M/s. Shreeji Trading Co.',
    exampleItem: '50 Kg Sugar @ ₹42.50 = ₹2,125.00'
  }
];

export const getBillFontFamily = (fontId?: string): string => {
  const match = BILL_FONT_OPTIONS.find(f => f.id === fontId);
  return match ? match.fontFamily : BILL_FONT_OPTIONS[0].fontFamily;
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
  showProductsMenu: true,
  showCustomersMenu: true,
  customUnits: ['Kg', 'Gm', 'Pkt', 'Ltr', 'Pcs', 'Meter', 'Box', 'Dozen', 'Ft', 'Sq Ft'],
  nameLetterSpacing: '0.05em',
  billFont: 'crimson-serif',
  billFontScope: 'items_and_customer',
  billFontWeight: 'medium',
  columnHeaders: DEFAULT_COLUMN_HEADERS,
  showDeclaration: true,
  declarationText: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  analyticsVisibility: {
    showProductAnalysis: true,
    showCustomerAnalysis: true,
    showCustomerPurchaseDetails: true,
    showAiBusinessAnalyst: true
  }
};