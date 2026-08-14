import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Trash2, Printer, Save, Eye, FilePlus, Loader2, Edit, X, CreditCard, CheckCircle2, Wallet, Banknote } from 'lucide-react';
import { InvoiceTemplate, formatBillNum, formatBillQty } from './InvoiceTemplate';
import { Product, Customer, InvoiceItem, BusinessSettings, Invoice, PaymentMode, PaymentEntry } from '../types';

interface InvoiceGeneratorProps {
  products: Product[];
  customers: Customer[];
  invoices?: Invoice[];
  settings: BusinessSettings;
  enablePaymentTracking?: boolean;
  onUpdateSettings: (newSettings: BusinessSettings) => void;
  onSaveInvoice: (invoice: Invoice) => Promise<void>;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  editingInvoice?: Invoice | null;
  onClearEditingInvoice?: () => void;
}

export const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({
  products,
  customers,
  invoices = [],
  settings,
  enablePaymentTracking = (settings.enablePaymentTracking !== false),
  onUpdateSettings,
  onSaveInvoice,
  onUnsavedChanges,
  editingInvoice,
  onClearEditingInvoice
}) => {
  // Initialize billNo from settings
  const [billNo, setBillNo] = useState<string>(settings.nextInvoiceNumber.toString());
  const [date, setDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Payment at Creation states
  const [recordPayment, setRecordPayment] = useState<boolean>(false);
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>('full');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [paymentNote, setPaymentNote] = useState<string>('');

  // Merge registered customers with unique customer names from past invoices
  const allCustomerOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; city: string; phone: string; isFromInvoice: boolean }>();

    // 1. Saved database customers
    customers.forEach(c => {
      if (c.name.trim()) {
        map.set(c.name.trim().toLowerCase(), {
          id: c.id,
          name: c.name.trim(),
          city: c.city || '',
          phone: c.phone || '',
          isFromInvoice: false
        });
      }
    });

    // 2. Customers from past invoices (not explicitly saved in database)
    if (invoices && invoices.length > 0) {
      invoices.forEach(inv => {
        if (inv.customerName && inv.customerName.trim()) {
          const key = inv.customerName.trim().toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              id: `inv-${key}`,
              name: inv.customerName.trim(),
              city: inv.customerCity || '',
              phone: inv.customerMobile || '',
              isFromInvoice: true
            });
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, invoices]);

  // Close suggestions pop-up when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered customer suggestions while typing
  const matchingSuggestions = React.useMemo(() => {
    if (!customerName.trim()) return allCustomerOptions;
    const query = customerName.trim().toLowerCase();
    return allCustomerOptions.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.city.toLowerCase().includes(query) ||
      (c.phone && c.phone.toLowerCase().includes(query))
    );
  }, [allCustomerOptions, customerName]);

  // Merge registered products with unique products from past invoices
  const allProductOptions = React.useMemo(() => {
    const savedNames = new Set(products.map(p => p.name.trim().toLowerCase()));
    const list: Array<{ id: string; name: string; rate: number; unit: string; packing?: string; isFromInvoice?: boolean }> = products.map(p => ({
      id: p.id,
      name: p.name,
      rate: p.rate,
      unit: p.unit,
      packing: p.packing,
      isFromInvoice: false
    }));

    if (invoices && invoices.length > 0) {
      invoices.forEach(inv => {
        if (inv.items && Array.isArray(inv.items)) {
          inv.items.forEach(item => {
            if (item.name && item.name.trim()) {
              const normKey = item.name.trim().toLowerCase();
              if (!savedNames.has(normKey)) {
                savedNames.add(normKey);
                list.push({
                  id: `inv-prod-${normKey}`,
                  name: item.name.trim(),
                  rate: item.rate || 0,
                  unit: item.unit || 'Kg',
                  packing: item.packing || '',
                  isFromInvoice: true
                });
              }
            }
          });
        }
      });
    }

    return list;
  }, [products, invoices]);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [selectedProductID, setSelectedProductID] = useState<string>('');
  const [customProductName, setCustomProductName] = useState('');
  const [customPacking, setCustomPacking] = useState('');
  const [customUnit, setCustomUnit] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [customRate, setCustomRate] = useState<string>(''); // Custom rate input
  const [showPreviewMobile, setShowPreviewMobile] = useState(false); // Mobile tab state
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load editing invoice data
  useEffect(() => {
    if (editingInvoice) {
      setBillNo(editingInvoice.id);
      setDate(editingInvoice.date);
      setCustomerName(editingInvoice.customerName);
      setCustomerCity(editingInvoice.customerCity);
      setCustomerMobile(editingInvoice.customerMobile || '');
      setItems(editingInvoice.items);
      setIsSaved(false);
      // Try to find matching customer
      const matchingCustomer = customers.find(c => c.name === editingInvoice.customerName);
      if (matchingCustomer) {
        setSelectedCustomer(matchingCustomer);
      }

      // Pre-fill payment details if existing payments exist
      if (editingInvoice.payments && editingInvoice.payments.length > 0) {
        setRecordPayment(true);
        const totalP = editingInvoice.payments.reduce((s, p) => s + p.amount, 0);
        const lastP = editingInvoice.payments[editingInvoice.payments.length - 1];
        setPaymentMode(lastP.mode);
        setPaymentDate(lastP.date || editingInvoice.date);
        setPaymentNote(lastP.note || '');
        if (totalP >= editingInvoice.total - 0.01) {
          setPaymentType('full');
          setPaymentAmount(editingInvoice.total.toString());
        } else {
          setPaymentType('partial');
          setPaymentAmount(totalP.toString());
        }
      } else {
        setRecordPayment(false);
        setPaymentType('full');
        setPaymentAmount('');
        setPaymentMode('Cash');
        setPaymentNote('');
      }
    }
  }, [editingInvoice, customers]);

  // Sync billNo from settings when not editing or just saved
  useEffect(() => {
    if (!isSaved && !editingInvoice) {
      setBillNo((settings.nextInvoiceNumber || 1).toString());
    }
  }, [settings.nextInvoiceNumber, isSaved, editingInvoice]);

  // Notify parent of unsaved changes
  useEffect(() => {
    if (onUnsavedChanges) {
      const hasChanges = (items.length > 0 || customerName.trim() !== '' || customerCity.trim() !== '' || customerMobile.trim() !== '') && !isSaved;
      onUnsavedChanges(hasChanges);
    }
  }, [items, customerName, customerCity, customerMobile, isSaved, onUnsavedChanges]);

  // Auto-fill product fields when selection changes
  useEffect(() => {
    if (selectedProductID === 'CUSTOM') {
      setCustomProductName('');
      setCustomPacking('');
      setCustomRate('');
      setCustomUnit(settings.customUnits?.[0] || 'Kg');
    } else if (selectedProductID) {
      const product = allProductOptions.find(p => p.id === selectedProductID);
      if (product) {
        setCustomProductName(product.name);
        setCustomPacking(product.packing || '');
        setCustomRate(product.rate > 0 ? product.rate.toString() : '');
        setCustomUnit(product.unit || 'Kg');
      }
    } else {
      setCustomProductName('');
      setCustomPacking('');
      setCustomRate('');
    }
  }, [selectedProductID, allProductOptions, settings.customUnits]);

  // Scaling logic for responsiveness
  const [scale, setScale] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateScale = () => {
      if (previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.offsetWidth;
        const containerHeight = previewContainerRef.current.offsetHeight;
        const a4Width = 794;
        const a4Height = 1123; // A4 height in pixels
        const padding = 32;

        // Calculate scale based on both width and height to ensure it fits
        const scaleByWidth = (containerWidth - padding) / a4Width;
        const scaleByHeight = (containerHeight - padding) / a4Height;
        const newScale = Math.min(scaleByWidth, scaleByHeight, 0.8); // Max 0.8 for better fit

        setScale(Math.max(newScale, 0.3));
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [showPreviewMobile]);

  // Calculations (rounded to 2 decimal places max)
  const subtotal = Math.round(items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) * 100) / 100;
  const gstRate = settings.enableGst ? (settings.defaultGstRate || 0) : 0;

  // Split GST into SGST and CGST
  const halfRate = gstRate / 2;
  const sgstAmount = settings.enableGst ? Math.round(subtotal * (halfRate / 100) * 100) / 100 : 0;
  const cgstAmount = settings.enableGst ? Math.round(subtotal * (halfRate / 100) * 100) / 100 : 0;

  const totalTax = Math.round((sgstAmount + cgstAmount) * 100) / 100;
  const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

  // Sync paymentAmount with grandTotal if paymentType === 'full' and recordPayment is active
  useEffect(() => {
    if (recordPayment && paymentType === 'full') {
      setPaymentAmount(grandTotal > 0 ? formatBillNum(grandTotal) : '');
    }
  }, [grandTotal, recordPayment, paymentType]);

  // Dynamic payments for template preview
  const currentPayments = React.useMemo(() => {
    if (recordPayment) {
      const amt = parseFloat(paymentAmount) || 0;
      if (amt > 0) {
        return [{
          id: 'preview-payment',
          amount: amt,
          mode: paymentMode,
          date: paymentDate || date,
          note: paymentNote
        }];
      }
    } else if (editingInvoice && editingInvoice.payments) {
      return editingInvoice.payments;
    }
    return undefined;
  }, [recordPayment, paymentAmount, paymentMode, paymentDate, date, paymentNote, editingInvoice]);


  const addItem = () => {
    if (!selectedProductID) return;

    if (selectedProductID === 'CUSTOM') {
      if (!customProductName.trim()) {
        alert("Please enter a product name for the custom product.");
        return;
      }
      const finalRate = customRate && parseFloat(customRate) >= 0 ? parseFloat(customRate) : 0;
      const finalQty = qty > 0 ? qty : 1;
      const unitToUse = customUnit || settings.customUnits?.[0] || 'Kg';

      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        productId: `custom-${Date.now()}`,
        name: customProductName.trim(),
        quantity: finalQty,
        unit: unitToUse,
        rate: finalRate,
        amount: Math.round(finalQty * finalRate * 100) / 100,
        packing: customPacking.trim() || undefined
      };

      setItems([...items, newItem]);
      setSelectedProductID('');
      setCustomProductName('');
      setCustomPacking('');
      setCustomRate('');
      setQty(1);
      setIsSaved(false);
      return;
    }

    const product = allProductOptions.find(p => p.id === selectedProductID);
    if (!product) return;

    const finalRate = customRate && parseFloat(customRate) >= 0 ? parseFloat(customRate) : product.rate;
    const finalQty = qty > 0 ? qty : 1;
    const unitToUse = customUnit || product.unit || settings.customUnits?.[0] || 'Kg';
    const packingToUse = customPacking !== undefined ? customPacking : product.packing;

    // Check if item with same name and same rate already exists in current bill
    const existingIndex = items.findIndex(item => item.name.trim().toLowerCase() === product.name.trim().toLowerCase() && item.rate === finalRate);

    if (existingIndex > -1) {
      const newItems = [...items];
      const existingItem = newItems[existingIndex];
      const newQty = existingItem.quantity + finalQty;
      newItems[existingIndex] = {
        ...existingItem,
        quantity: newQty,
        amount: Math.round(newQty * existingItem.rate * 100) / 100
      };
      setItems(newItems);
    } else {
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        productId: product.id,
        name: customProductName.trim() || product.name,
        quantity: finalQty,
        unit: unitToUse,
        rate: finalRate,
        amount: Math.round(finalQty * finalRate * 100) / 100,
        packing: packingToUse || undefined
      };
      setItems([...items, newItem]);
    }

    setSelectedProductID('');
    setCustomProductName('');
    setCustomPacking('');
    setCustomRate('');
    setQty(1);
    setIsSaved(false);
  };

  const updateItemQty = (id: string, delta: number) => {
    setIsSaved(false);
    setItems(items.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return {
          ...item,
          quantity: newQty,
          amount: Math.round(newQty * item.rate * 100) / 100
        };
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setIsSaved(false);
    setItems(items.filter(item => item.id !== id));
  };

  const resetForm = () => {
    setItems([]);
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerCity('');
    setCustomerMobile('');
    setIsSaved(false);
    setDate(new Date().toLocaleDateString('en-GB'));
    setRecordPayment(false);
    setPaymentType('full');
    setPaymentAmount('');
    setPaymentMode('Cash');
    setPaymentNote('');
  };

  const handleCustomerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setIsSaved(false);
    if (custId === 'new') {
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerCity('');
      setCustomerMobile('');
    } else {
      const match = allCustomerOptions.find(c => c.id === custId);
      if (match) {
        setCustomerName(match.name);
        setCustomerCity(match.city);
        setCustomerMobile(match.phone || '');
        setShowSuggestions(false);
      }
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      alert("Please add items to the bill before saving.");
      return;
    }

    let initialPayments: PaymentEntry[] | undefined = undefined;

    if (recordPayment) {
      const amt = parseFloat(paymentAmount) || 0;
      if (amt > 0) {
        initialPayments = [{
          id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          amount: amt,
          mode: paymentMode,
          date: paymentDate || date,
          note: paymentNote.trim() || (amt >= grandTotal - 0.01 ? 'Full payment received at bill creation' : 'Partial payment received at bill creation')
        }];
      }
    } else if (editingInvoice && editingInvoice.payments) {
      initialPayments = editingInvoice.payments;
    }

    const invoice: Invoice = {
      id: billNo,
      date,
      customerName,
      customerCity,
      customerMobile: customerMobile.trim() || undefined,
      items,
      total: grandTotal,
      // Save tax details
      subtotal: subtotal,
      gstAmount: totalTax,
      gstRate: gstRate,
      sgstAmount: sgstAmount,
      cgstAmount: cgstAmount,
      payments: initialPayments
    };

    try {
      setIsSaving(true);
      // Set isSaved to true BEFORE the save to lock the current bill number
      // This prevents the useEffect from updating billNo when settings.nextInvoiceNumber changes
      setIsSaved(true);
      await onSaveInvoice(invoice);
      
      if (editingInvoice) {
        alert("Invoice updated successfully!");
        // Clear editing state
        if (onClearEditingInvoice) {
          onClearEditingInvoice();
        }
        // Reset form
        resetForm();
      } else {
        alert("Invoice saved to history successfully! You can now download or share it.");
      }
    } catch (e) {
      setIsSaved(false);
      // onSaveInvoice will have alerted; keep current form intact
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    // Save original title and set new title for PDF filename
    const originalTitle = document.title;
    document.title = `Invoice_${billNo}_${customerName.replace(/[^a-z0-9]/gi, '_')}`;

    // Create a temporary container for printing
    const printContainer = document.createElement('div');
    printContainer.id = 'print-only-container';
    printContainer.className = 'print-only-container';
    // Ensure immediate visibility for mobile browsers
    printContainer.style.cssText = 'display: block !important; visibility: visible !important; position: static; width: 100%; height: auto; min-height: 0; background: white; z-index: 99999;';
    document.body.appendChild(printContainer);

    // Clone the invoice template and render it in the print container
    const invoiceElement = document.getElementById('invoice-capture');
    if (invoiceElement) {
      const clone = invoiceElement.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.padding = '0'; // Use internal padding from template
      clone.style.width = '794px'; // A4 width in pixels at 96dpi
      clone.style.maxWidth = '100%';
      clone.style.boxSizing = 'border-box';
      clone.style.visibility = 'visible';
      clone.style.display = 'block';
      clone.style.background = 'white';
      clone.style.minHeight = '0'; // Override min-h-[297mm] to prevent blank second page
      clone.style.height = 'auto';
      printContainer.appendChild(clone);
    }

    // Use requestAnimationFrame to ensure DOM is painted before printing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();

        // Clean up after print dialog closes
        const cleanup = () => {
          if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
          }
          // Restore original title
          document.title = originalTitle;
        };

        const handleFocus = () => {
          setTimeout(cleanup, 500);
          window.removeEventListener('focus', handleFocus);
        };
        window.addEventListener('focus', handleFocus);
        setTimeout(cleanup, 3000);
      });
    });
  };



  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 lg:gap-4 relative overflow-hidden">

      {/* Mobile Toggle Tabs */}
      <div className="lg:hidden flex mb-2 bg-slate-200 p-1 rounded-lg">
        <button
          onClick={() => setShowPreviewMobile(false)}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${!showPreviewMobile ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
        >
          Edit Details
        </button>
        <button
          onClick={() => setShowPreviewMobile(true)}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${showPreviewMobile ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
        >
          Preview Bill
        </button>
      </div>

      {/* LEFT: Controls */}
      <div className={`w-full lg:w-2/5 h-full bg-white p-4 lg:p-6 rounded-lg shadow-md border border-slate-200 overflow-y-auto no-print ${showPreviewMobile ? 'hidden lg:block' : 'block'}`}>
        
        {/* Editing Banner */}
        {editingInvoice && (
          <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-bold text-blue-900 text-sm">Editing Invoice #{editingInvoice.id}</p>
                  <p className="text-xs text-blue-700">Make changes and click Save to update</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Cancel editing? Any changes will be lost.")) {
                    if (onClearEditingInvoice) onClearEditingInvoice();
                    resetForm();
                  }
                }}
                className="text-blue-600 hover:text-blue-800 p-1"
                title="Cancel editing"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Printer className="w-5 h-5 text-red-600" />
            Bill Details
          </h2>
          <button
            onClick={() => {
              if (items.length > 0) {
                if (window.confirm("Start a new bill? Current items will be cleared.")) {
                  if (onClearEditingInvoice) onClearEditingInvoice();
                  resetForm();
                }
              } else {
                resetForm();
              }
            }}
            className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 px-2 py-1 bg-red-50 rounded transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
            New Bill
          </button>
        </div>

        {/* Header Details */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              {editingInvoice ? 'Bill No (Locked)' : 'Bill No (Auto)'}
            </label>
            <input
              type="text"
              value={billNo}
              readOnly
              className="w-full p-2 border border-slate-200 bg-slate-100 text-slate-500 rounded outline-none text-sm cursor-not-allowed"
              title={editingInvoice ? 'Cannot change bill number when editing' : 'Auto-generated bill number'}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSaved}
              className="w-full p-2 border border-slate-300 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none text-sm disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="DD/MM/YYYY"
            />
          </div>
        </div>

        {/* Customer Selection */}
        <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200" ref={suggestionRef}>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Customer / M/s.</label>
          <select
            onChange={handleCustomerSelect}
            disabled={isSaved}
            className="w-full p-2 border border-slate-300 rounded mb-2 focus:outline-none focus:border-red-500 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
            value="new"
          >
            <option value="new">+ Select or Type Customer Name...</option>
            {customers.length > 0 && (
              <optgroup label="Saved Customers">
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ''}</option>
                ))}
              </optgroup>
            )}
            {allCustomerOptions.filter(c => c.isFromInvoice).length > 0 && (
              <optgroup label="Past Invoice Customers">
                {allCustomerOptions.filter(c => c.isFromInvoice).map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.city ? `(${c.city})` : ''}</option>
                ))}
              </optgroup>
            )}
          </select>

          <div className="relative">
            <input
              type="text"
              placeholder="Customer Name"
              value={customerName}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setShowSuggestions(true);
                setIsSaved(false);
              }}
              disabled={isSaved}
              className="w-full p-2 border border-slate-300 rounded mb-2 outline-none focus:border-red-500 text-sm disabled:bg-slate-50 disabled:text-slate-500 font-bold"
            />

            {/* Customer Suggestions Popup Menu */}
            {showSuggestions && matchingSuggestions.length > 0 && !isSaved && (
              <div className="absolute left-0 right-0 top-[38px] z-50 bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100">
                <div className="p-1.5 bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                  <span>Suggested Customers ({matchingSuggestions.length})</span>
                  <span className="text-[9px] text-slate-400 font-normal">Click to auto-fill</span>
                </div>
                {matchingSuggestions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setCustomerName(s.name);
                      setCustomerCity(s.city);
                      setCustomerMobile(s.phone || '');
                      setShowSuggestions(false);
                    }}
                    className="p-2.5 hover:bg-red-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-800 text-sm">{s.name}</span>
                      {(s.city || s.phone) && (
                        <span className="text-xs text-slate-500 ml-2">
                          ({[s.city, s.phone].filter(Boolean).join(', ')})
                        </span>
                      )}
                    </div>
                    {s.isFromInvoice ? (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Past Invoice</span>
                    ) : (
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">Saved</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="City"
              value={customerCity}
              onChange={(e) => {
                setCustomerCity(e.target.value);
                setIsSaved(false);
              }}
              disabled={isSaved}
              className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
            <input
              type="text"
              placeholder="Mobile / Phone No."
              value={customerMobile}
              onChange={(e) => {
                setCustomerMobile(e.target.value);
                setIsSaved(false);
              }}
              disabled={isSaved}
              className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </div>

        {/* Add Items */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">Add Products</h3>
            <button
              type="button"
              onClick={() => setSelectedProductID(selectedProductID === 'CUSTOM' ? '' : 'CUSTOM')}
              disabled={isSaved}
              className={`text-xs font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                selectedProductID === 'CUSTOM'
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {selectedProductID === 'CUSTOM' ? '← Catalog Select' : '➕ Custom Product'}
            </button>
          </div>

          <div className="space-y-2.5 mb-2">
            <select
              value={selectedProductID}
              onChange={(e) => setSelectedProductID(e.target.value)}
              disabled={isSaved}
              className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 font-medium"
            >
              <option value="">Select Item from Catalog...</option>
              <option value="CUSTOM" className="font-bold text-red-600">➕ Add Custom / Unsaved Product...</option>
              {products.length > 0 && (
                <optgroup label="Saved Catalog Products">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.packing ? `(${p.packing})` : ''} - ₹{p.rate}/{p.unit}</option>
                  ))}
                </optgroup>
              )}
              {allProductOptions.filter(p => p.isFromInvoice).length > 0 && (
                <optgroup label="Past Invoice Products (Unsaved)">
                  {allProductOptions.filter(p => p.isFromInvoice).map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.packing ? `(${p.packing})` : ''} - ₹{p.rate}/{p.unit} (Unsaved)</option>
                  ))}
                </optgroup>
              )}
            </select>

            {selectedProductID === 'CUSTOM' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-red-50/60 p-3 rounded-lg border border-red-100 shadow-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Product Name *</label>
                  <input
                    type="text"
                    placeholder="Custom Product Name"
                    value={customProductName}
                    onChange={(e) => setCustomProductName(e.target.value)}
                    disabled={isSaved}
                    className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Packing (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 kg, 500 gm, 250 ML"
                    value={customPacking}
                    onChange={(e) => setCustomPacking(e.target.value)}
                    disabled={isSaved}
                    className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm bg-white"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">Rate (₹)</label>
                <input
                  type="number"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  disabled={isSaved || !selectedProductID}
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                  className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div className="w-24">
                <label className="text-xs text-slate-500 block mb-1">Unit</label>
                {(() => {
                  const unitList = (settings.customUnits && settings.customUnits.length > 0)
                    ? settings.customUnits
                    : ['Kg', 'Gm', 'Pkt', 'Qty', 'Ltr', 'Pcs', 'Meter', 'Box', 'Dozen', 'Ft', 'Sq Ft'];
                  const options = Array.from(new Set([...unitList, customUnit].filter(Boolean)));
                  return (
                    <select
                      value={customUnit || unitList[0]}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      disabled={isSaved || !selectedProductID}
                      className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {options.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              <div className="w-20">
                <label className="text-xs text-slate-500 block mb-1">Qty</label>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  disabled={isSaved || !selectedProductID}
                  min="1"
                  step="1"
                  className="w-full p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm text-center disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div className="pt-5">
                <button
                  type="button"
                  onClick={addItem}
                  disabled={isSaved || !selectedProductID || (selectedProductID === 'CUSTOM' && !customProductName.trim())}
                  className="bg-red-600 text-white p-2 rounded hover:bg-red-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                  title="Add Item to Bill"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Items List (Editable) */}
        <div className="mb-6">
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id} className="bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm overflow-hidden flex-1 pr-2">
                    <div className="font-bold text-slate-800 truncate">
                      {idx + 1}. {item.name} <span className="text-slate-400 font-normal text-xs">{item.packing ? `(${item.packing})` : ''}</span>
                    </div>
                    <div className="text-slate-500 text-xs font-medium">
                      Rate: ₹{formatBillNum(item.rate)} | {item.unit}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={isSaved}
                    className="text-slate-300 hover:text-red-500 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-md">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateItemQty(item.id, -1)}
                      disabled={isSaved}
                      className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded shadow-xs hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <div className="w-10 text-center font-bold text-slate-700 text-sm">
                      {formatBillQty(item.quantity)}
                    </div>
                    <button
                      onClick={() => updateItemQty(item.id, 1)}
                      disabled={isSaved}
                      className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded shadow-xs hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    ₹{formatBillNum(item.amount)}
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="text-center p-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">No items added</div>}
          </div>

          {/* Live Totals in Controls */}
          {items.length > 0 && (
            <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200">
              {settings.enableGst && (
                <>
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>Subtotal:</span>
                    <span>₹{formatBillNum(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>CGST ({halfRate}%):</span>
                    <span>₹{formatBillNum(cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 mb-1 border-b border-dashed border-slate-300 pb-1">
                    <span>SGST ({halfRate}%):</span>
                    <span>₹{formatBillNum(sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-lg text-slate-900 mt-1">
                <span>Total:</span>
                <span>₹{formatBillNum(grandTotal)}</span>
              </div>
            </div>
          )}

          {/* Payment / Billing Option at Invoice Creation */}
          {enablePaymentTracking && items.length > 0 && (
            <div className="mt-4 p-3.5 bg-gradient-to-br from-slate-50 to-indigo-50/40 rounded-xl border border-indigo-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recordPayment}
                    onChange={(e) => {
                      setRecordPayment(e.target.checked);
                      setIsSaved(false);
                      if (e.target.checked && !paymentAmount) {
                        setPaymentAmount(formatBillNum(grandTotal));
                      }
                    }}
                    disabled={isSaved}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    Collect Payment Now
                  </span>
                </label>
                {recordPayment && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {paymentType === 'full' && parseFloat(paymentAmount) >= grandTotal ? 'Marked Paid' : 'Partial'}
                  </span>
                )}
              </div>

              {recordPayment && (
                <div className="space-y-3 pt-2.5 border-t border-indigo-100/70">
                  {/* Payment Type Selection */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('full');
                        setPaymentAmount(formatBillNum(grandTotal));
                        setIsSaved(false);
                      }}
                      disabled={isSaved}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        paymentType === 'full'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Full Payment (₹{formatBillNum(grandTotal)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('partial');
                        setIsSaved(false);
                      }}
                      disabled={isSaved}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        paymentType === 'partial'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Partial Payment
                    </button>
                  </div>

                  {/* Mode & Amount Inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => {
                          setPaymentMode(e.target.value as PaymentMode);
                          setIsSaved(false);
                        }}
                        disabled={isSaved}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:border-indigo-500 outline-none font-medium"
                      >
                        <option value="Cash">Cash 💵</option>
                        <option value="UPI">UPI / QR 📱</option>
                        <option value="Bank Transfer">Bank Transfer 🏦</option>
                        <option value="Cheque">Cheque 📝</option>
                        <option value="Other">Other 💳</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Amount Paid (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={grandTotal}
                        value={paymentAmount}
                        onChange={(e) => {
                          setPaymentAmount(e.target.value);
                          if (paymentType === 'full' && parseFloat(e.target.value) !== grandTotal) {
                            setPaymentType('partial');
                          }
                          setIsSaved(false);
                        }}
                        disabled={isSaved}
                        placeholder="0.00"
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Date & Note Inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Date</label>
                      <input
                        type="text"
                        value={paymentDate}
                        onChange={(e) => {
                          setPaymentDate(e.target.value);
                          setIsSaved(false);
                        }}
                        disabled={isSaved}
                        placeholder="DD/MM/YYYY"
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Note (Optional)</label>
                      <input
                        type="text"
                        value={paymentNote}
                        onChange={(e) => {
                          setPaymentNote(e.target.value);
                          setIsSaved(false);
                        }}
                        disabled={isSaved}
                        placeholder="e.g. GPay / Cash received"
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Summary row */}
                  {(() => {
                    const amt = parseFloat(paymentAmount) || 0;
                    const bal = Math.max(0, grandTotal - amt);
                    return (
                      <div className="flex justify-between items-center text-xs p-2 bg-white/90 rounded-lg border border-indigo-100 font-medium">
                        <span className="text-slate-600">
                          Paid: <strong className="text-emerald-700">₹{amt}</strong> ({paymentMode})
                        </span>
                        <span className={bal > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                          {bal > 0 ? `Due: ₹${bal}` : 'Fully Paid ✓'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mt-auto pb-4 lg:pb-0">
          <button
            onClick={handleSave}
            disabled={items.length === 0 || isSaved || !customerName.trim() || isSaving}
            title={!customerName.trim() && items.length > 0 ? "Please add customer name" : ""}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white p-3 rounded hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? "Saving..." : (editingInvoice ? "Update Invoice" : "Save")}
          </button>
          <button
            onClick={handlePrint}
            disabled={!isSaved || isSaving}
            className="flex items-center justify-center gap-2 bg-red-600 text-white p-3 rounded hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
          >
            <Printer className="w-4 h-4" /> Print
          </button>

          {isSaved && (
            <button
              onClick={resetForm}
              className="col-span-2 flex items-center justify-center gap-2 bg-red-50 text-red-600 p-3 rounded border border-red-100 hover:bg-red-100 transition-colors font-bold mt-2"
            >
              <FilePlus className="w-4 h-4" /> New Bill
            </button>
          )}
        </div>
      </div>

      {/* RIGHT: Live Preview (Scaled) */}
      <div
        ref={previewContainerRef}
        className={`w-full lg:w-3/5 h-full bg-slate-500/10 lg:bg-slate-200 overflow-hidden flex justify-center items-center p-4 rounded-lg relative ${!showPreviewMobile ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="print-container origin-center transition-transform duration-200 ease-out" style={{ transform: `scale(${scale})` }}>
          <InvoiceTemplate
            id="invoice-capture"
            billNo={billNo}
            date={date}
            customerName={customerName}
            customerCity={customerCity}
            customerMobile={customerMobile}
            items={items}
            settings={settings}
            payments={currentPayments}
          />
        </div>
      </div>

      {/* Hidden container for PDF capture to ensure it works even if main preview is hidden on mobile */}
      <div className="absolute -left-[9999px] top-0">
        <div style={{ width: '794px', height: '1123px', background: 'white' }}>
          <InvoiceTemplate
            id="invoice-capture-hidden"
            billNo={billNo}
            date={date}
            customerName={customerName}
            customerCity={customerCity}
            customerMobile={customerMobile}
            items={items}
            settings={settings}
            payments={currentPayments}
          />
        </div>
      </div>

    </div>
  );
};