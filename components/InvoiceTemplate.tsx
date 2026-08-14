import React from 'react';
import { BusinessSettings, InvoiceItem, PaymentEntry } from '../types';

interface InvoiceTemplateProps {
  id: string; // The HTML ID for printing context
  billNo: string;
  date: string;
  customerName: string;
  customerCity: string;
  customerMobile?: string;
  items: InvoiceItem[];
  settings: BusinessSettings;
  // Optional: if coming from history, specific tax values might be passed, 
  // otherwise calculate on fly for preview
  gstAmount?: number;
  subtotal?: number;
  gstRate?: number;
  payments?: PaymentEntry[];
}

// Helper to create lighter shades for backgrounds
const hexToRgba = (hex: string, alpha: number) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }
  return `rgba(${r},${g},${b},${alpha})`;
};

// Helper to format currency/amounts for bills with max 2 decimals (e.g. 1999.19991999999 -> 1999.20, 2000 -> 2000)
export const formatBillNum = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0';
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
};

export const formatBillQty = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '0';
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

// Simple number to words converter (Indian Number System)
const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (inputNum: number): string => {
    const n = inputNum.toString();
    if (n.length > 9) return 'overflow';
    let n_array: any = ('000000000' + n).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_array) return "";
    let str = '';
    str += (Number(n_array[1]) !== 0) ? (a[Number(n_array[1])] || b[Number(n_array[1][0])] + ' ' + a[Number(n_array[1][1])]) + 'Crore ' : '';
    str += (Number(n_array[2]) !== 0) ? (a[Number(n_array[2])] || b[Number(n_array[2][0])] + ' ' + a[Number(n_array[2][1])]) + 'Lakh ' : '';
    str += (Number(n_array[3]) !== 0) ? (a[Number(n_array[3])] || b[Number(n_array[3][0])] + ' ' + a[Number(n_array[3][1])]) + 'Thousand ' : '';
    str += (Number(n_array[4]) !== 0) ? (a[Number(n_array[4])] || b[Number(n_array[4][0])] + ' ' + a[Number(n_array[4][1])]) + 'Hundred ' : '';
    str += (Number(n_array[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n_array[5])] || b[Number(n_array[5][0])] + ' ' + a[Number(n_array[5][1])]) : '';
    return str;
  };

  return inWords(num) + "Only";
};

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  id,
  billNo,
  date,
  customerName,
  customerCity,
  customerMobile,
  items,
  settings,
  gstRate: propGstRate,
  payments
}) => {
  // Calculate financials (rounded to 2 decimals)
  const calcSubtotal = Math.round(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100;

  const isGstEnabled = settings.enableGst;
  // Use prop if available (for History view), else settings (for Generator view)
  const rate = propGstRate !== undefined ? propGstRate : (settings.defaultGstRate || 0);

  const halfRate = rate / 2;
  const calcSgst = isGstEnabled ? Math.round(calcSubtotal * (halfRate / 100) * 100) / 100 : 0;
  const calcCgst = isGstEnabled ? Math.round(calcSubtotal * (halfRate / 100) * 100) / 100 : 0;
  const totalAmount = Math.round((calcSubtotal + calcSgst + calcCgst) * 100) / 100;

  // Payment status & totals
  const totalPaid = Math.round((payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;
  const remainingBalance = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);
  const isPaidInFull = !!(payments && payments.length > 0 && remainingBalance <= 0.01 && totalPaid > 0);
  const isPartiallyPaid = !!(payments && payments.length > 0 && totalPaid > 0 && remainingBalance > 0.01);
  const lastPaymentMode = payments && payments.length > 0 ? payments[payments.length - 1].mode : '';

  const totalQty = Math.round(items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) * 100) / 100;
  const amountInWords = numberToWords(Math.round(totalAmount));

  // Calculate total weight from quantity
  const totalWeightDisplay = React.useMemo(() => {
    const totalGrams = items.reduce((sum, item) => {
      const qty = item.quantity;
      const unit = item.unit.toLowerCase().trim();
      
      // If unit is weight (Kg, Gm, G), use quantity directly
      if (['kg'].includes(unit)) {
        return sum + (qty * 1000); // Convert to grams
      } else if (['gm', 'g', 'gram', 'grams'].includes(unit)) {
        return sum + qty;
      }
      
      // If unit is non-weight (Pkt, Box, etc.), multiply quantity by packing weight
      if (item.packing) {
        const text = item.packing.toLowerCase().trim();
        const match = text.match(/^(\d+(\.\d+)?)\s*(kg|gm|g|ltr|ml|l)/);

        if (match) {
          let value = parseFloat(match[1]);
          const packingUnit = match[3];
          if (['kg', 'ltr', 'l'].includes(packingUnit)) {
            value *= 1000; // Convert to grams/ml
          }
          return sum + (value * qty);
        }
      }
      
      return sum;
    }, 0);

    if (totalGrams === 0) return "-";

    const kg = Math.floor(totalGrams / 1000);
    const gm = Math.round(totalGrams % 1000);

    const parts = [];
    if (kg > 0) parts.push(`${kg} Kg`);
    if (gm > 0) parts.push(`${gm} Gm`);

    return parts.join(' ');
  }, [items]);

  // Ensure we have enough empty rows
  // When GST is enabled, we have 3 extra footer rows (Subtotal, CGST, SGST), so fewer empty rows needed
  // When GST is disabled, add more empty rows to fill the space
  const minRows = isGstEnabled ? 5 : 7;
  const emptyRows = Math.max(0, minRows - items.length);

  const themeColor = settings.themeColor || '#dc2626';
  const lightBg = hexToRgba(themeColor, 0.05);
  const borderColor = themeColor;
  const lightBorder = hexToRgba(themeColor, 0.3);

  // Column headers customization
  const colHeaders = settings.columnHeaders || {};
  const snHeader = colHeaders.snHeader || 'No.';
  const particularsHeader = colHeaders.particularsHeader || 'Details';
  const packingHeader = colHeaders.packingHeader || 'Packing';
  const qtyHeader = colHeaders.qtyHeader || 'Qty';
  const rateHeader = colHeaders.rateHeader || 'Rate';
  const amountHeader = colHeaders.amountHeader || 'Amount';
  const mergePackingAndQty = !!colHeaders.mergePackingAndQty;
  const mergedPackingQtyHeader = colHeaders.mergedPackingQtyHeader || 'Packing / Qty';

  return (
    <div id={id || "invoice-template"} className="bg-white text-slate-900 font-serif-custom p-6 w-[794px] min-h-[1123px] mx-auto flex flex-col justify-between text-sm leading-relaxed border shadow-sm">
      <div className="h-full flex flex-col">
        {/* Border Box */}
        <div className="border-2 flex flex-col min-h-[1050px] justify-between flex-1" style={{ borderColor: borderColor }}>

          {/* Header Section */}
          <div className="border-b-2 p-4 font-serif-custom text-center relative" style={{ color: themeColor, borderColor: borderColor }}>
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="absolute left-4 top-4 object-contain"
                style={{ width: `${settings.logoWidth || 80}px`, maxHeight: '120px' }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold text-3xl absolute left-4 top-4 shadow-sm"
                style={{ borderColor: themeColor, color: themeColor }}
              >
                {settings.logoInitial}
              </div>
            )}
            <div className="mt-2">
              <h1 className="text-5xl font-bold mb-1" style={{ color: themeColor, letterSpacing: settings.nameLetterSpacing || '0.05em' }}>{settings.name}</h1>
              <h2 className="text-2xl font-bold" style={{ color: themeColor }}>{settings.subName}</h2>
              <p className="mt-1 text-sm" style={{ color: themeColor }}>{settings.address} M.: {settings.mobile}</p>
              {settings.enableGst && settings.gstin && (
                <p className="text-sm font-bold" style={{ color: themeColor }}>GSTIN: {settings.gstin}</p>
              )}
            </div>
          </div>

          {/* Meta Data Section */}
          <div className="flex border-b-2" style={{ borderColor: borderColor }}>
            <div className="flex-1 p-2 border-r flex items-center justify-between min-w-0" style={{ borderColor: borderColor }}>
              <div className="flex items-center truncate">
                <span className="font-bold mr-2" style={{ color: themeColor }}>Bill No.:</span>
                <span className="text-xl font-medium text-slate-900">{billNo}</span>
              </div>
              {isPaidInFull && (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-400 text-xs font-black px-2 py-0.5 rounded tracking-widest uppercase shadow-xs mr-2 shrink-0">
                  PAID ({lastPaymentMode})
                </span>
              )}
              {isPartiallyPaid && (
                <span className="bg-amber-100 text-amber-800 border border-amber-400 text-xs font-black px-2 py-0.5 rounded tracking-wider uppercase shadow-xs mr-2 shrink-0">
                  PARTIAL (PAID ₹{formatBillNum(totalPaid)})
                </span>
              )}
            </div>
            <div className="flex-1 p-2 flex items-center justify-end min-w-0">
              <span className="font-bold mr-2" style={{ color: themeColor }}>Date:</span>
              <span className="text-xl font-medium text-slate-900">{date}</span>
            </div>
          </div>

          <div className="p-2 border-b-2 flex items-end" style={{ borderColor: borderColor }}>
            <span className="font-bold mr-2 mb-1" style={{ color: themeColor }}>M/s.</span>
            <div className="flex-1 border-b border-dashed text-xl font-medium text-slate-900 px-2 truncate" style={{ borderColor: lightBorder }}>
              {customerName}
            </div>
            <div className="w-1/3 border-b border-dashed text-xl font-medium text-slate-900 px-2 text-center truncate" style={{ borderColor: lightBorder }}>
              {customerCity ? `(${customerCity})` : ''} {customerMobile ? `Ph: ${customerMobile}` : ''}
            </div>
          </div>

          {/* Table Header */}
          <div className="flex border-b-2" style={{ borderColor: borderColor, backgroundColor: lightBg, color: themeColor }}>
            <div className="w-10 p-1 text-center font-bold border-r shrink-0" style={{ borderColor: borderColor }}>{snHeader}</div>
            <div className="flex-1 p-1 text-center font-bold border-r min-w-0" style={{ borderColor: borderColor }}>{particularsHeader}</div>
            {mergePackingAndQty ? (
              <div className="w-40 p-1 text-center font-bold border-r shrink-0" style={{ borderColor: borderColor }}>{mergedPackingQtyHeader}</div>
            ) : (
              <>
                <div className="w-24 p-1 text-center font-bold border-r shrink-0" style={{ borderColor: borderColor }}>{packingHeader}</div>
                <div className="w-16 p-1 text-center font-bold border-r shrink-0" style={{ borderColor: borderColor }}>{qtyHeader}</div>
              </>
            )}
            <div className="w-20 p-1 text-center font-bold border-r shrink-0" style={{ borderColor: borderColor }}>{rateHeader}</div>
            <div className="w-32 p-1 text-center font-bold shrink-0">{amountHeader}</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 flex flex-col">
            {items.map((item, index) => (
              <div key={item.id} className="flex border-b" style={{ borderColor: lightBorder }}>
                <div className="w-10 p-1 text-center border-r flex items-center justify-center text-slate-800 shrink-0" style={{ borderColor: borderColor }}>
                  {index + 1}
                </div>
                <div className="flex-1 p-1 pl-3 text-left border-r text-lg text-slate-800 font-medium truncate min-w-0" style={{ borderColor: borderColor }}>
                  {item.name}
                </div>
                {mergePackingAndQty ? (
                  <div className="w-40 p-1 text-center border-r text-lg text-slate-900 flex items-center justify-center truncate shrink-0 px-1" style={{ borderColor: borderColor }}>
                    {item.packing ? `${item.packing} (${formatBillQty(item.quantity)} ${item.unit})` : `${formatBillQty(item.quantity)} ${item.unit}`}
                  </div>
                ) : (
                  <>
                    <div className="w-24 p-1 text-center border-r text-lg text-slate-900 flex items-center justify-center truncate shrink-0 px-1" style={{ borderColor: borderColor }}>
                      {item.packing || '-'}
                    </div>
                    <div className="w-16 p-1 text-center border-r text-lg text-slate-900 flex items-center justify-center truncate shrink-0 px-1" style={{ borderColor: borderColor }}>
                      {formatBillQty(item.quantity)} {item.unit}
                    </div>
                  </>
                )}
                <div className="w-20 p-1 text-center border-r text-lg text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1" style={{ borderColor: borderColor }}>
                  {formatBillNum(item.rate)}
                </div>
                <div className="w-32 p-1 text-center text-lg font-bold text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1">
                  {formatBillNum(item.amount)}
                </div>
              </div>
            ))}

            {/* Empty Rows Filler */}
            <div className="flex-1 flex flex-col">
              {Array.from({ length: emptyRows }).map((_, i) => (
                <div key={`empty-${i}`} className="flex border-b flex-1 min-h-[40px]" style={{ borderColor: hexToRgba(themeColor, 0.1) }}>
                  <div className="w-10 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r min-w-0" style={{ borderColor: borderColor }}></div>
                  {mergePackingAndQty ? (
                    <div className="w-40 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  ) : (
                    <>
                      <div className="w-24 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                      <div className="w-16 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                    </>
                  )}
                  <div className="w-20 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="w-32 shrink-0"></div>
                </div>
              ))}
            </div>

            {/* Subtotal Row (If GST enabled) */}
            {isGstEnabled && (
              <div className="flex border-t" style={{ borderColor: borderColor }}>
                <div className="w-10 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                <div className="flex-1 border-r text-right p-1 pr-4 font-bold min-w-0" style={{ borderColor: borderColor, color: themeColor }}>
                  Subtotal
                </div>
                <div className="w-40 border-r text-center p-1 font-bold text-slate-900 flex items-center justify-center shrink-0 px-1" style={{ borderColor: borderColor }}>
                  {totalWeightDisplay !== '-' ? totalWeightDisplay : formatBillQty(totalQty)}
                </div>
                <div className="w-20 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                <div className="w-32 text-center p-1 font-bold text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1">
                  ₹{formatBillNum(calcSubtotal)}
                </div>
              </div>
            )}

            {/* GST Split Rows (If enabled) */}
            {isGstEnabled && (
              <>
                <div className="flex border-t" style={{ borderColor: borderColor }}>
                  <div className="w-10 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r text-right p-1 pr-4 font-bold min-w-0" style={{ borderColor: borderColor, color: themeColor }}>
                    Add: CGST ({halfRate}%)
                  </div>
                  <div className="w-40 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="w-20 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="w-32 text-center p-1 font-bold text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1">
                    ₹{formatBillNum(calcCgst)}
                  </div>
                </div>
                <div className="flex border-t" style={{ borderColor: borderColor }}>
                  <div className="w-10 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r text-right p-1 pr-4 font-bold min-w-0" style={{ borderColor: borderColor, color: themeColor }}>
                    Add: SGST ({halfRate}%)
                  </div>
                  <div className="w-40 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="w-20 border-r shrink-0" style={{ borderColor: borderColor }}></div>
                  <div className="w-32 text-center p-1 font-bold text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1">
                    ₹{formatBillNum(calcSgst)}
                  </div>
                </div>
              </>
            )}

            {/* Grand Total Row */}
            <div className="flex border-t" style={{ borderColor: borderColor }}>
              <div className="w-10 border-r shrink-0" style={{ borderColor: borderColor }}></div>
              <div className="flex-1 border-r text-right p-1 pr-4 font-bold text-lg min-w-0" style={{ borderColor: borderColor, color: themeColor }}>
                {isGstEnabled ? 'Grand Total' : 'Total'}
              </div>
              {/* If GST is NOT enabled, show the weight summary here. If GST IS enabled, we showed it in subtotal to avoid clutter */}
              <div className="w-40 border-r text-center p-1 font-bold text-lg text-slate-900 flex items-center justify-center leading-tight whitespace-pre-line shrink-0 px-1" style={{ borderColor: borderColor }}>
                {!isGstEnabled ? (totalWeightDisplay !== '-' ? totalWeightDisplay : formatBillQty(totalQty)) : ''}
              </div>
              <div className="w-20 border-r shrink-0" style={{ borderColor: borderColor }}></div>
              <div className="w-32 text-center p-1 font-bold text-lg text-slate-900 flex items-center justify-center whitespace-nowrap shrink-0 px-1">
                ₹{formatBillNum(totalAmount)}
              </div>
            </div>
          </div>

          {/* Footer Area */}
          <div className="border-t-2" style={{ borderColor: borderColor }}>

            <div className="flex">
              {/* LEFT SIDE: Words & Bank Details */}
              <div className="flex-1 border-r-2 flex flex-col min-w-0" style={{ borderColor: borderColor }}>

                {/* Amount In Words */}
                <div className="p-2 border-b flex-1" style={{ borderColor: lightBorder }}>
                  <span className="font-bold text-sm block mb-1" style={{ color: themeColor }}>Amount Chargeable (in words):</span>
                  <span className="font-bold italic text-slate-900 break-words">{amountInWords}</span>
                </div>

                {/* Bank Details & UPI QR */}
                <div className="flex">
                  <div className="flex-1 min-w-0">
                    {settings.bankName && (
                      <div className="p-2 text-sm">
                        <h3 className="font-bold underline mb-1" style={{ color: themeColor }}>Company's Bank Details</h3>
                        <div className="grid grid-cols-[105px_1fr] gap-x-2">
                          <span className="font-semibold" style={{ color: themeColor }}>Bank Name:</span>
                          <span className="text-slate-900 font-medium truncate">{settings.bankName}</span>

                          <span className="font-semibold" style={{ color: themeColor }}>A/c No.:</span>
                          <span className="text-slate-900 font-medium truncate">{settings.bankAccountNumber}</span>

                          <span className="font-semibold" style={{ color: themeColor }}>Branch & IFSC:</span>
                          <span className="text-slate-900 font-medium truncate">{settings.bankBranch ? `${settings.bankBranch} ${settings.bankIfsc || ''}`.trim() : (settings.bankIfsc || '')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {settings.showUpiQr && settings.upiId && (
                    <div className="p-2 flex flex-col items-center justify-center border-l shrink-0" style={{ borderColor: lightBorder }}>
                      <div className="bg-white p-1 border relative" style={{ borderColor: borderColor }}>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`upi://pay?pa=${settings.upiId}&pn=${settings.name}&am=${(Math.round(totalAmount * 100) / 100).toFixed(2)}&cu=INR`)}&ecc=H`}
                          alt="UPI QR Code"
                          className="w-24 h-24 block"
                        />
                        {/* UPI Logo Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-white px-1 py-0.5 rounded shadow-sm border border-slate-200 flex items-center justify-center gap-0.5">
                            <svg className="w-4 h-3" viewBox="0 0 50 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M5 5L20 25L26 16L15 5H5Z" fill="#78258D" />
                              <path d="M22 5L12 20L17 25L32 5H22Z" fill="#008344" />
                              <path d="M30 25H38L45 5H37L30 25Z" fill="#008344" />
                            </svg>
                            <span className="text-[9px] font-black tracking-tighter text-slate-800 leading-none">UPI</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold mt-1 max-w-[120px] truncate text-center" style={{ color: themeColor }} title={`₹${formatBillNum(totalAmount)}`}>
                        Scan to Pay: ₹{formatBillNum(totalAmount)}
                      </span>
                      <span className="text-[8px] opacity-70 max-w-[120px] truncate">{settings.upiId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: Totals */}
              <div className="w-[45%] min-w-[280px] flex flex-col justify-end">
                <div className="flex-1"></div> {/* Spacer for alignment if needed */}
                <div className="flex border-t items-center" style={{ borderColor: lightBorder }}>
                  <div className="flex-1 p-2 text-right font-bold text-base sm:text-lg bg-opacity-10 min-w-0" style={{ backgroundColor: lightBg, color: themeColor }}>
                    {isGstEnabled ? 'Grand Total' : 'Total'}
                  </div>
                  <div className="min-w-[145px] px-3 py-2 text-center font-black text-xl sm:text-2xl text-slate-900 whitespace-nowrap" title={`₹${formatBillNum(totalAmount)}`}>
                    ₹{formatBillNum(totalAmount)}
                  </div>
                </div>
                {payments && payments.length > 0 && totalPaid > 0 && (
                  <>
                    <div className="flex border-t items-center" style={{ borderColor: lightBorder }}>
                      <div className="flex-1 p-1 text-right font-bold text-xs text-emerald-700 bg-emerald-50/80 min-w-0">
                        Paid ({lastPaymentMode})
                      </div>
                      <div className="min-w-[145px] px-3 py-1 text-center font-bold text-sm text-emerald-700 bg-emerald-50/80 whitespace-nowrap" title={`₹${formatBillNum(totalPaid)}`}>
                        ₹{formatBillNum(totalPaid)}
                      </div>
                    </div>
                    {remainingBalance > 0.01 && (
                      <div className="flex border-t items-center" style={{ borderColor: lightBorder }}>
                        <div className="flex-1 p-1 text-right font-bold text-xs text-red-600 bg-red-50/80 min-w-0">
                          Balance Due
                        </div>
                        <div className="min-w-[145px] px-3 py-1 text-center font-black text-sm text-red-600 bg-red-50/80 whitespace-nowrap" title={`₹${formatBillNum(remainingBalance)}`}>
                          ₹{formatBillNum(remainingBalance)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Signatures & Declaration */}
            <div className="flex justify-between items-end p-2.5 border-t-2 bg-white" style={{ borderColor: borderColor }}>
              <div className="text-center w-5/12">
                {settings.showDeclaration !== false && (
                  <div className="text-[10px] text-left leading-snug italic text-slate-500">
                    <span className="font-bold not-italic text-slate-700">Declaration:</span><br />
                    {settings.declarationText || "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}
                  </div>
                )}
              </div>
              <div className="text-center w-4/12">
                <p className="font-bold mb-1 text-xs" style={{ color: themeColor }}>For, {settings.signatureName || settings.name}</p>
                {settings.signatureUrl && (
                  <div className="flex justify-center my-1">
                    <img
                      src={settings.signatureUrl}
                      alt="Signature"
                      className="max-h-10 object-contain filter contrast-[180%] brightness-[80%]"
                    />
                  </div>
                )}
                <div className="border-t w-full my-1" style={{ borderColor: lightBorder }}></div>
                <span className="text-xs font-semibold" style={{ color: themeColor }}>Authorised Signatory</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};