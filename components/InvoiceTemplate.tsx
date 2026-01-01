import React from 'react';
import { BusinessSettings, InvoiceItem } from '../types';

interface InvoiceTemplateProps {
  id: string; // The HTML ID for printing context
  billNo: string;
  date: string;
  customerName: string;
  customerCity: string;
  items: InvoiceItem[];
  settings: BusinessSettings;
  // Optional: if coming from history, specific tax values might be passed, 
  // otherwise calculate on fly for preview
  gstAmount?: number;
  subtotal?: number;
  gstRate?: number;
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
  items,
  settings,
  gstRate: propGstRate
}) => {
  // Calculate financials
  const calcSubtotal = items.reduce((sum, item) => sum + item.amount, 0);

  const isGstEnabled = settings.enableGst;
  // Use prop if available (for History view), else settings (for Generator view)
  const rate = propGstRate !== undefined ? propGstRate : (settings.defaultGstRate || 0);

  const halfRate = rate / 2;
  const calcSgst = isGstEnabled ? Math.round(calcSubtotal * (halfRate / 100)) : 0;
  const calcCgst = isGstEnabled ? Math.round(calcSubtotal * (halfRate / 100)) : 0;
  const totalAmount = calcSubtotal + calcSgst + calcCgst;

  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const amountInWords = numberToWords(Math.round(totalAmount));

  // Calculate total weight from packing
  const totalWeightDisplay = React.useMemo(() => {
    const totalGrams = items.reduce((sum, item) => {
      if (!item.packing) return sum;
      const text = item.packing.toLowerCase().trim();
      const match = text.match(/^(\d+(\.\d+)?)\s*(kg|gm|g|ltr|ml|l)/);

      if (match) {
        let value = parseFloat(match[1]);
        const unit = match[3];
        if (['kg', 'ltr', 'l'].includes(unit)) {
          value *= 1000;
        }
        return sum + (value * item.quantity);
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
  const minRows = isGstEnabled ? 8 : 10;
  const emptyRows = Math.max(0, minRows - items.length);

  const themeColor = settings.themeColor || '#dc2626';
  const lightBg = hexToRgba(themeColor, 0.05);
  const borderColor = themeColor;
  const lightBorder = hexToRgba(themeColor, 0.3);

  const logoWidth = settings.logoWidth || 80;

  return (
    <div id={id} className="bg-white w-[210mm] min-h-[297mm] print:min-h-0 print:h-auto mx-auto relative font-serif-custom flex flex-col" style={{ color: themeColor }}>
      <div className="p-4 flex-1 flex flex-col">
        {/* Outer Border */}
        <div className="border-2 flex-1 flex flex-col" style={{ borderColor: borderColor }}>

          {/* Header Section */}
          <div className="border-b-2 p-4 text-center relative" style={{ borderColor: borderColor }}>
            {/* Logo */}
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="absolute left-4 top-4 object-contain"
                style={{ width: `${logoWidth}px`, maxHeight: '120px' }}
              />
            ) : (
              <div
                className="absolute left-4 top-4 w-16 h-16 border-2 rounded-full flex items-center justify-center"
                style={{ borderColor: borderColor }}>
                <div className="text-center">
                  <span className="block text-2xl font-bold leading-none">{settings.logoInitial}</span>
                </div>
              </div>
            )}

            <div className="mt-2">
              <h1 className="text-5xl font-bold tracking-wider mb-1" style={{ color: themeColor }}>{settings.name}</h1>
              <h2 className="text-2xl font-bold" style={{ color: themeColor }}>{settings.subName}</h2>
              <p className="mt-1 text-sm" style={{ color: themeColor }}>{settings.address} M.: {settings.mobile}</p>
              {settings.enableGst && settings.gstin && (
                <p className="text-sm font-bold" style={{ color: themeColor }}>GSTIN: {settings.gstin}</p>
              )}
            </div>
          </div>

          {/* Meta Data Section */}
          <div className="flex border-b-2" style={{ borderColor: borderColor }}>
            <div className="flex-1 p-2 border-r flex items-center" style={{ borderColor: borderColor }}>
              <span className="font-bold mr-2">Bill No.:</span>
              <span className="text-xl font-medium text-slate-900">{billNo}</span>
            </div>
            <div className="flex-1 p-2 flex items-center justify-end">
              <span className="font-bold mr-2">Date:</span>
              <span className="text-xl font-medium text-slate-900">{date}</span>
            </div>
          </div>

          <div className="p-2 border-b-2 flex items-end" style={{ borderColor: borderColor }}>
            <span className="font-bold mr-2 mb-1">M/s.</span>
            <div className="flex-1 border-b border-dashed text-xl font-medium text-slate-900 px-2" style={{ borderColor: lightBorder }}>
              {customerName}
            </div>
            <div className="w-1/3 border-b border-dashed text-xl font-medium text-slate-900 px-2 text-center" style={{ borderColor: lightBorder }}>
              {customerCity ? `(${customerCity})` : ''}
            </div>
          </div>

          {/* Table Header */}
          <div className="flex border-b-2" style={{ borderColor: borderColor, backgroundColor: lightBg }}>
            <div className="w-10 p-1 text-center font-bold border-r" style={{ borderColor: borderColor }}>No.</div>
            <div className="flex-1 p-1 text-center font-bold border-r" style={{ borderColor: borderColor }}>Details</div>
            <div className="w-24 p-1 text-center font-bold border-r" style={{ borderColor: borderColor }}>Packing</div>
            <div className="w-16 p-1 text-center font-bold border-r" style={{ borderColor: borderColor }}>Qty</div>
            <div className="w-20 p-1 text-center font-bold border-r" style={{ borderColor: borderColor }}>Rate</div>
            <div className="w-24 p-1 text-center font-bold">Amount</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 flex flex-col">
            {items.map((item, index) => (
              <div key={item.id} className="flex border-b" style={{ borderColor: lightBorder }}>
                <div className="w-10 p-1 text-center border-r flex items-center justify-center text-slate-800" style={{ borderColor: borderColor }}>
                  {index + 1}
                </div>
                <div className="flex-1 p-1 pl-3 text-left border-r text-lg text-slate-800 font-medium" style={{ borderColor: borderColor }}>
                  {item.name}
                </div>
                <div className="w-24 p-1 text-center border-r text-lg font-handwriting text-slate-900 flex items-center justify-center" style={{ borderColor: borderColor }}>
                  {item.packing || '-'}
                </div>
                <div className="w-16 p-1 text-center border-r text-lg font-handwriting text-slate-900 flex items-center justify-center" style={{ borderColor: borderColor }}>
                  {item.quantity} {['Kg', 'Gm', 'G', 'Ltr', 'Ml', 'L'].includes(item.unit) ? '' : item.unit}
                </div>
                <div className="w-20 p-1 text-center border-r text-lg font-handwriting text-slate-900 flex items-center justify-center" style={{ borderColor: borderColor }}>
                  {item.rate}
                </div>
                <div className="w-24 p-1 text-center text-lg font-handwriting font-bold text-slate-900 flex items-center justify-center">
                  {item.amount}
                </div>
              </div>
            ))}

            {/* Empty Rows Filler */}
            <div className="flex-1 flex flex-col">
              {Array.from({ length: emptyRows }).map((_, i) => (
                <div key={`empty-${i}`} className="flex border-b flex-1 min-h-[40px]" style={{ borderColor: hexToRgba(themeColor, 0.1) }}>
                  <div className="w-10 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-24 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-16 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-20 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-24"></div>
                </div>
              ))}
            </div>

            {/* Subtotal Row (If GST enabled) */}
            {isGstEnabled && (
              <div className="flex border-t" style={{ borderColor: borderColor }}>
                <div className="w-10 border-r" style={{ borderColor: borderColor }}></div>
                <div className="flex-1 border-r text-right p-1 pr-4 font-bold" style={{ borderColor: borderColor }}>
                  Subtotal
                </div>
                <div className="w-40 border-r text-center p-1 font-bold text-slate-900 flex items-center justify-center" style={{ borderColor: borderColor }}>
                  {totalWeightDisplay !== '-' ? totalWeightDisplay : Number(totalQty.toFixed(2))}
                </div>
                <div className="w-20 border-r" style={{ borderColor: borderColor }}></div>
                <div className="w-24 text-center p-1 font-bold text-slate-900 flex items-center justify-center">
                  ₹{calcSubtotal}
                </div>
              </div>
            )}

            {/* GST Split Rows (If enabled) */}
            {isGstEnabled && (
              <>
                <div className="flex border-t" style={{ borderColor: borderColor }}>
                  <div className="w-10 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r text-right p-1 pr-4 font-bold" style={{ borderColor: borderColor }}>
                    Add: CGST ({halfRate}%)
                  </div>
                  <div className="w-40 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-20 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-24 text-center p-1 font-bold text-slate-900 flex items-center justify-center">
                    ₹{calcCgst}
                  </div>
                </div>
                <div className="flex border-t" style={{ borderColor: borderColor }}>
                  <div className="w-10 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="flex-1 border-r text-right p-1 pr-4 font-bold" style={{ borderColor: borderColor }}>
                    Add: SGST ({halfRate}%)
                  </div>
                  <div className="w-40 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-20 border-r" style={{ borderColor: borderColor }}></div>
                  <div className="w-24 text-center p-1 font-bold text-slate-900 flex items-center justify-center">
                    ₹{calcSgst}
                  </div>
                </div>
              </>
            )}

            {/* Grand Total Row */}
            <div className="flex border-t" style={{ borderColor: borderColor }}>
              <div className="w-10 border-r" style={{ borderColor: borderColor }}></div>
              <div className="flex-1 border-r text-right p-1 pr-4 font-bold text-lg" style={{ borderColor: borderColor }}>
                {isGstEnabled ? 'Grand Total' : 'Total'}
              </div>
              {/* If GST is NOT enabled, show the weight summary here. If GST IS enabled, we showed it in subtotal to avoid clutter */}
              <div className="w-40 border-r text-center p-1 font-bold text-lg text-slate-900 flex items-center justify-center leading-tight whitespace-pre-line" style={{ borderColor: borderColor }}>
                {!isGstEnabled ? (totalWeightDisplay !== '-' ? totalWeightDisplay : Number(totalQty.toFixed(2))) : ''}
              </div>
              <div className="w-20 border-r" style={{ borderColor: borderColor }}></div>
              <div className="w-24 text-center p-1 font-bold text-lg text-slate-900 flex items-center justify-center">
                ₹{totalAmount}
              </div>
            </div>
          </div>

          {/* Footer Area */}
          <div className="border-t-2" style={{ borderColor: borderColor }}>

            <div className="flex">
              {/* LEFT SIDE: Words & Bank Details */}
              <div className="flex-1 border-r-2 flex flex-col" style={{ borderColor: borderColor }}>

                {/* Amount In Words */}
                <div className="p-2 border-b flex-1" style={{ borderColor: lightBorder }}>
                  <span className="font-bold text-sm block mb-1">Amount Chargeable (in words):</span>
                  <span className="font-bold italic text-slate-900">{amountInWords}</span>
                </div>

                {/* Bank Details & UPI QR */}
                <div className="flex">
                  <div className="flex-1">
                    {settings.bankName && (
                      <div className="p-2 text-sm">
                        <h3 className="font-bold underline mb-1">Company's Bank Details</h3>
                        <div className="grid grid-cols-[80px_1fr] gap-x-2">
                          <span className="font-semibold">Bank Name:</span>
                          <span className="text-slate-900 font-medium">{settings.bankName}</span>

                          <span className="font-semibold">A/c No.:</span>
                          <span className="text-slate-900 font-medium">{settings.bankAccountNumber}</span>

                          <span className="font-semibold">Branch & IFS:</span>
                          <span className="text-slate-900 font-medium">{settings.bankBranch} {settings.bankIfsc}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {settings.showUpiQr && settings.upiId && (
                    <div className="p-2 flex flex-col items-center justify-center border-l" style={{ borderColor: lightBorder }}>
                      <div className="bg-white p-1 border relative" style={{ borderColor: borderColor }}>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`upi://pay?pa=${settings.upiId}&pn=${settings.name}&am=${totalAmount.toFixed(2)}&cu=INR`)}&ecc=H`}
                          alt="UPI QR Code"
                          className="w-24 h-24 block"
                        />
                        {/* UPI Logo Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-white p-0.5 rounded-sm shadow-sm border border-slate-100">
                            <img
                              src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/64px-UPI-Logo-vector.svg.png"
                              className="w-5 h-5 object-contain"
                              alt="UPI Logo"
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold mt-1">Scan to Pay: ₹{totalAmount}</span>
                      <span className="text-[8px] opacity-70">UPI: {settings.upiId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: Totals */}
              <div className="w-1/3 flex flex-col">
                <div className="flex-1"></div> {/* Spacer for alignment if needed */}
                <div className="flex border-t" style={{ borderColor: lightBorder }}>
                  <div className="flex-1 p-2 text-right font-bold text-xl bg-opacity-10" style={{ backgroundColor: lightBg }}>
                    Total
                  </div>
                  <div className="w-32 p-2 text-center font-bold text-2xl text-slate-900">
                    ₹{totalAmount}
                  </div>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="flex justify-between items-end p-3 pt-6 border-t-2" style={{ borderColor: borderColor }}>
              <div className="text-center w-1/3">
                <div className="text-xs text-left mb-4 italic text-slate-500">
                  Declaration:<br />
                  We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                </div>
              </div>
              <div className="text-center w-1/3">
                <p className="font-bold mb-1 text-sm">For, {settings.signatureName || settings.name}</p>
                {settings.signatureUrl && (
                  <div className="flex justify-center my-2">
                    <img
                      src={settings.signatureUrl}
                      alt="Signature"
                      className="max-h-12 object-contain"
                    />
                  </div>
                )}
                <div className="border-t w-full mb-1" style={{ borderColor: lightBorder }}></div>
                <span className="text-xs">Authorised Signatory</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};