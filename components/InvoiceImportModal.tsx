import React, { useState } from 'react';
import { Invoice, InvoiceItem } from '../types';
import { Upload, X, FileText, CheckCircle2, AlertTriangle, Download, Loader2 } from 'lucide-react';

interface InvoiceImportModalProps {
  onClose: () => void;
  onImport: (invoices: Invoice[]) => Promise<void>;
}

export const InvoiceImportModal: React.FC<InvoiceImportModalProps> = ({ onClose, onImport }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedInvoices, setParsedInvoices] = useState<Invoice[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const downloadSampleCSV = () => {
    const csvContent = [
      'Bill No,Date,Customer Name,Customer City,Item Name,Quantity,Unit,Rate,Amount,Packing',
      '1001,15/08/2026,Rajesh Patel,Ahmedabad,Guchda Sev,2,kg,250,500,1 kg',
      '1001,15/08/2026,Rajesh Patel,Ahmedabad,Nylon Pauva,1,kg,150,150,1 kg',
      '1002,16/08/2026,Mehta Traders,Surat,Special Mix,5,kg,200,1000,500 gm'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample_invoice_import.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSVText = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      setErrors(['CSV file appears to be empty or missing data.']);
      return;
    }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let start = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
          let field = line.substring(start, i).trim();
          if (field.startsWith('"') && field.endsWith('"')) {
            field = field.substring(1, field.length - 1).replace(/""/g, '"');
          }
          result.push(field);
          start = i + 1;
        }
      }
      let lastField = line.substring(start).trim();
      if (lastField.startsWith('"') && lastField.endsWith('"')) {
        lastField = lastField.substring(1, lastField.length - 1).replace(/""/g, '"');
      }
      result.push(lastField);
      return result;
    };

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    // Map headers to indexes
    const findIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
    
    const billNoIdx = findIdx(['billno', 'billnumber', 'invoiceid', 'invoiceno', 'id']);
    const dateIdx = findIdx(['date']);
    const customerIdx = findIdx(['customername', 'customer', 'party']);
    const cityIdx = findIdx(['customercity', 'city', 'location']);
    const itemsSummaryIdx = findIdx(['items', 'itemssummary']);
    const itemNameIdx = findIdx(['itemname', 'productname', 'item', 'product']);
    const qtyIdx = findIdx(['quantity', 'qty']);
    const unitIdx = findIdx(['unit']);
    const rateIdx = findIdx(['rate', 'price']);
    const amountIdx = findIdx(['amount', 'totalitem']);
    const packingIdx = findIdx(['packing']);
    const totalIdx = findIdx(['total', 'totalamount', 'billtotal', 'grandtotal']);

    const invMap: Record<string, Invoice> = {};
    const parseErrors: string[] = [];

    // Helper to parse summary string like "Photo Print 12x18 inch (4 Qty), Flex Banner 8x4 ft (2 Qty)"
    const parseItemsSummaryString = (itemsSummaryStr: string, totalAmount: number): InvoiceItem[] => {
      // Split by comma followed by item name or parenthesis boundary
      const rawParts = itemsSummaryStr.split(/,\s*(?=[A-Za-z0-9\s\.\-\+\#]+\s*\()/).map(p => p.trim()).filter(p => p.length > 0);
      const parts = rawParts.length > 0 ? rawParts : itemsSummaryStr.split(',').map(p => p.trim()).filter(p => p.length > 0);

      const parsedParts: Array<{ name: string; quantity: number; unit: string }> = [];
      let totalQty = 0;

      for (const part of parts) {
        // Match "Item Name (4 Qty)" or "Item Name (2 kg)" or "Item Name (5 pcs)"
        const match = part.match(/^(.*?)(?:\s*\(\s*(\d+(?:\.\d+)?)\s*([A-Za-z]+)?\s*\))?$/);
        if (match) {
          const name = (match[1] || part).trim();
          const quantity = match[2] ? parseFloat(match[2]) : 1;
          const unit = match[3] ? match[3].trim() : 'Qty';
          parsedParts.push({ name: name || part, quantity, unit });
          totalQty += quantity;
        } else {
          parsedParts.push({ name: part, quantity: 1, unit: 'Qty' });
          totalQty += 1;
        }
      }

      return parsedParts.map((it, idx) => {
        const itemAmount = totalAmount > 0 && totalQty > 0 
          ? Math.round((totalAmount * (it.quantity / totalQty)) * 100) / 100
          : 0;
        const rate = it.quantity > 0 ? Math.round((itemAmount / it.quantity) * 100) / 100 : itemAmount;

        return {
          id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          productId: `p-${Math.random().toString(36).substr(2, 6)}`,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          rate,
          amount: itemAmount,
          packing: ''
        };
      });
    };

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length < 2) continue;

      const rawBillNo = (billNoIdx >= 0 && row[billNoIdx]) ? row[billNoIdx] : `IMP-${i}`;
      const date = (dateIdx >= 0 && row[dateIdx]) ? row[dateIdx] : new Date().toLocaleDateString('en-GB');
      const customerName = (customerIdx >= 0 && row[customerIdx]) ? row[customerIdx] : 'Cash Sale';
      const customerCity = (cityIdx >= 0 && row[cityIdx]) ? row[cityIdx] : 'Local';
      const rowTotal = (totalIdx >= 0 && row[totalIdx]) ? (parseFloat(row[totalIdx]) || 0) : 0;
      
      const key = `${rawBillNo}_${customerName}`.toLowerCase();

      if (!invMap[key]) {
        invMap[key] = {
          id: rawBillNo,
          date,
          customerName,
          customerCity,
          items: [],
          total: rowTotal
        };
      } else if (rowTotal > 0) {
        invMap[key].total = rowTotal;
      }

      // Check if row has an Items summary string (Exported CSV format)
      const itemsSummary = (itemsSummaryIdx >= 0 && row[itemsSummaryIdx]) ? row[itemsSummaryIdx] : '';
      
      if (itemsSummary && (itemsSummary.includes('(') || itemsSummary.includes(',') || qtyIdx < 0)) {
        // Parse summary string into multiple items
        const extractedItems = parseItemsSummaryString(itemsSummary, rowTotal || invMap[key].total);
        invMap[key].items.push(...extractedItems);
        if (invMap[key].total === 0) {
          invMap[key].total = extractedItems.reduce((s, it) => s + it.amount, 0);
        }
      } else {
        // Detailed row item format
        const itemName = (itemNameIdx >= 0 && row[itemNameIdx]) ? row[itemNameIdx] : (itemsSummary || 'General Item');
        const quantity = (qtyIdx >= 0 && row[qtyIdx]) ? (parseFloat(row[qtyIdx]) || 1) : 1;
        const unit = (unitIdx >= 0 && row[unitIdx]) ? row[unitIdx] : 'Qty';
        const rate = (rateIdx >= 0 && row[rateIdx]) ? (parseFloat(row[rateIdx]) || 0) : 0;
        const amount = (amountIdx >= 0 && row[amountIdx]) ? (parseFloat(row[amountIdx]) || (quantity * rate)) : (quantity * rate);
        const packing = (packingIdx >= 0 && row[packingIdx]) ? row[packingIdx] : '';

        const itemObj: InvoiceItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productId: `p-${Math.random().toString(36).substr(2, 6)}`,
          name: itemName,
          quantity,
          unit,
          rate,
          amount,
          packing
        };

        invMap[key].items.push(itemObj);
        if (totalIdx < 0) {
          invMap[key].total += amount;
        }
      }
    }

    const invoiceList = Object.values(invMap);
    if (invoiceList.length === 0) {
      parseErrors.push('No valid invoice records could be extracted from the file.');
    }

    setErrors(parseErrors);
    setParsedInvoices(invoiceList);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setSuccessCount(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) parseCSVText(text);
    };
    reader.readAsText(selected);
  };

  const handleConfirmImport = async () => {
    if (parsedInvoices.length === 0) return;
    setImporting(true);
    try {
      await onImport(parsedInvoices);
      setSuccessCount(parsedInvoices.length);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrors([err.message || 'Import failed.']);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-700 to-emerald-800 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={22} />
            <div>
              <h2 className="font-bold text-lg leading-tight">Import Invoices from CSV</h2>
              <p className="text-xs text-green-200">Upload CSV file to import multiple bills into your account</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Action Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-xs font-bold text-slate-700">Need a starting template?</p>
              <p className="text-xs text-slate-500">Download a sample CSV format pre-filled with example data.</p>
            </div>
            <button
              type="button"
              onClick={downloadSampleCSV}
              className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm shrink-0"
            >
              <Download size={14} /> Sample CSV
            </button>
          </div>

          {/* File Upload Box */}
          <div className="border-2 border-dashed border-slate-300 hover:border-green-500 bg-green-50/40 rounded-2xl p-6 text-center transition-all cursor-pointer relative">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <Upload size={32} className="mx-auto mb-2 text-green-600 opacity-80" />
            <p className="text-sm font-bold text-slate-800">
              {file ? file.name : 'Click or Drag CSV file here to upload'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Supports UTF-8 CSV files with bill & item details</p>
          </div>

          {/* Errors list */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {errors.map((err, idx) => (
                <p key={idx} className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={14} className="shrink-0" /> {err}
                </p>
              ))}
            </div>
          )}

          {/* Success Banner */}
          {successCount !== null && (
            <div className="bg-green-100 border border-green-300 text-green-800 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 size={24} className="text-green-600" />
              <div>
                <p className="font-bold text-sm">Import Successful!</p>
                <p className="text-xs">{successCount} invoices imported successfully into your history.</p>
              </div>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedInvoices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                  Parsed Preview ({parsedInvoices.length} Bills)
                </h3>
                <span className="text-xs text-green-700 font-bold bg-green-100 px-2 py-0.5 rounded-full">
                  Total Value: ₹{parsedInvoices.reduce((s, i) => s + i.total, 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Bill No</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Customer</th>
                      <th className="p-2.5 text-right">Items</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedInvoices.map((inv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-700">#{inv.id}</td>
                        <td className="p-2.5 text-slate-500">{inv.date}</td>
                        <td className="p-2.5 font-medium text-slate-800">{inv.customerName}</td>
                        <td className="p-2.5 text-right text-slate-600">{inv.items.length}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">₹{inv.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={parsedInvoices.length === 0 || importing || successCount !== null}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Importing...
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Import {parsedInvoices.length} Invoices
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};