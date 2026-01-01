import { BusinessSettings } from "./types";

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: "My Business",
  subName: "Quality Goods Provider",
  address: "123 Business Road, City.",
  mobile: "98765 43210",
  logoInitial: "B",
  themeColor: "#dc2626", // Default Red
  logoUrl: "",
  logoWidth: 80,
  bankName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankBranch: "",
  nextInvoiceNumber: 1,
  enableGst: false,
  gstin: "",
  defaultGstRate: 12,
  upiId: "",
  showUpiQr: false
};