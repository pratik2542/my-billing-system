import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Trash2, Printer, Share2, Save, Send, Eye, FilePlus, Download, Loader2 } from 'lucide-react';
import { InvoiceTemplate } from './InvoiceTemplate';
import { Product, Customer, InvoiceItem, BusinessSettings, Invoice } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface InvoiceGeneratorProps {
  products: Product[];
  customers: Customer[];
  settings: BusinessSettings;
  onUpdateSettings: (newSettings: BusinessSettings) => void;
  onSaveInvoice: (invoice: Invoice) => Promise<void>;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({
  products,
  customers,
  settings,
  onUpdateSettings,
  onSaveInvoice,
  onUnsavedChanges
}) => {
  // Initialize billNo from settings
  const [billNo, setBillNo] = useState<string>(settings.nextInvoiceNumber.toString());
  const [date, setDate] = useState<string>(new Date().toLocaleDateString('en-GB'));
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerCity, setCustomerCity] = useState('');

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [selectedProductID, setSelectedProductID] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false); // Mobile tab state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync billNo if settings change externally or on mount
  useEffect(() => {
    // Only update billNo if we're not looking at a just-saved invoice
    if (!isSaved) {
      setBillNo(settings.nextInvoiceNumber.toString());
    }
  }, [settings.nextInvoiceNumber, isSaved]);

  // Notify parent of unsaved changes
  useEffect(() => {
    if (onUnsavedChanges) {
      const hasChanges = (items.length > 0 || customerName.trim() !== '' || customerCity.trim() !== '') && !isSaved;
      onUnsavedChanges(hasChanges);
    }
  }, [items, customerName, customerCity, isSaved, onUnsavedChanges]);

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

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const gstRate = settings.enableGst ? (settings.defaultGstRate || 0) : 0;

  // Split GST into SGST and CGST
  const halfRate = gstRate / 2;
  const sgstAmount = settings.enableGst ? Math.round(subtotal * (halfRate / 100)) : 0;
  const cgstAmount = settings.enableGst ? Math.round(subtotal * (halfRate / 100)) : 0;

  const totalTax = sgstAmount + cgstAmount;
  const grandTotal = subtotal + totalTax;


  const addItem = () => {
    if (!selectedProductID) return;

    const product = products.find(p => p.id === selectedProductID);
    if (!product) return;

    // Check if item with same productId already exists in current bill
    const existingIndex = items.findIndex(item => item.productId === product.id);

    if (existingIndex > -1) {
      const newItems = [...items];
      const existingItem = newItems[existingIndex];
      const newQty = existingItem.quantity + qty;
      newItems[existingIndex] = {
        ...existingItem,
        quantity: newQty,
        amount: newQty * existingItem.rate
      };
      setItems(newItems);
    } else {
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        productId: product.id,
        name: product.name,
        quantity: qty,
        unit: product.unit,
        rate: product.rate,
        amount: qty * product.rate,
        packing: product.packing
      };
      setItems([...items, newItem]);
    }

    setSelectedProductID('');
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
          amount: newQty * item.rate
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
    setIsSaved(false);
    setDate(new Date().toLocaleDateString('en-GB'));
  };

  const handleCustomerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setIsSaved(false);
    if (custId === 'new') {
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerCity('');
    } else {
      const customer = customers.find(c => c.id === custId);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerName(customer.name);
        setCustomerCity(customer.city);
      }
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      alert("Please add items to the bill before saving.");
      return;
    }

    const invoice: Invoice = {
      id: billNo,
      date,
      customerName,
      customerCity,
      items,
      total: grandTotal,
      // Save tax details
      subtotal: subtotal,
      gstAmount: totalTax,
      gstRate: gstRate,
      sgstAmount: sgstAmount,
      cgstAmount: cgstAmount
    };

    try {
      setIsSaving(true);
      // Set isSaved to true IMMEDIATELY to lock the current bill number 
      // before the parent component updates settings and triggers a re-render.
      setIsSaved(true);
      await onSaveInvoice(invoice);
      alert("Invoice saved to history successfully! You can now download or share it.");
    } catch (e) {
      setIsSaved(false);
      // onSaveInvoice will have alerted; keep current form intact
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getInvoiceFile = async (): Promise<File | null> => {
    const element = document.getElementById('invoice-capture-hidden');
    if (!element) return null;

    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

      const fileName = `Invoice_${billNo}_${customerName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      const pdfBlob = pdf.output('blob');
      return new File([pdfBlob], fileName, { type: 'application/pdf' });
    } catch (error) {
      console.error("PDF Generation failed", error);
      return null;
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generatePDF = async () => {
    const file = await getInvoiceFile();
    if (!file) return false;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    return true;
  };

  const handleShareWhatsApp = async () => {
    if (items.length === 0) return;

    const file = await getInvoiceFile();
    if (!file) return;

    // 1. Try Native Sharing (Best for Mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Invoice ${billNo}`,
          text: `Invoice No: ${billNo} from ${settings.name}`,
        });
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      }
    }

    // 2. Fallback for Desktop (Manual)
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();

    const itemsList = items.map(i => `${i.name}${i.packing ? `(${i.packing})` : ''}: ${i.quantity}${i.unit} x ${i.rate} = ${i.amount}`).join('%0a');
    const text = `*INVOICE No: ${billNo}*%0aDate: ${date}%0aCustomer: ${customerName}%0a%0a*Items:*%0a${itemsList}%0a%0a*TOTAL: ₹${grandTotal}*`;

    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    alert("IMPORTANT: WhatsApp Web doesn't allow auto-attaching files.\n\n1. The PDF is now downloaded.\n2. We've opened WhatsApp.\n3. Please drag the downloaded PDF into the chat manually.");
  };

  const handleShareEmail = async () => {
    if (items.length === 0) return;

    const file = await getInvoiceFile();
    if (!file) return;

    // 1. Try Native Sharing (Direct attachment on mobile)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          // On mobile email apps, sometimes providing less text helps the app focus on the attachment
          title: `Invoice ${billNo}`,
        });
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      }
    }

    // 2. Desktop Fallback
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();

    const subject = `Invoice ${billNo} from ${settings.name}`;
    const body = `Dear ${customerName},\n\nPlease find the invoice details below:\n\nTotal Amount: ₹${grandTotal}\n\nI have attached the PDF invoice to this email.\n\nThank you.`;

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    alert("The PDF has been downloaded. Please attach it to your email manually.");
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Printer className="w-5 h-5 text-red-600" />
            Bill Details
          </h2>
          <button
            onClick={() => {
              if (items.length > 0) {
                if (window.confirm("Start a new bill? Current items will be cleared.")) {
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
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bill No (Auto)</label>
            <input
              type="text"
              value={billNo}
              readOnly
              className="w-full p-2 border border-slate-200 bg-slate-100 text-slate-500 rounded outline-none text-sm cursor-not-allowed"
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
        <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Customer</label>
          <select
            onChange={handleCustomerSelect}
            disabled={isSaved}
            className="w-full p-2 border border-slate-300 rounded mb-2 focus:outline-none focus:border-red-500 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
            defaultValue="new"
          >
            <option value="new">+ New Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Customer Name"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setIsSaved(false);
            }}
            disabled={isSaved}
            className="w-full p-2 border border-slate-300 rounded mb-2 outline-none focus:border-red-500 text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
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
        </div>

        {/* Add Items */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Add Products</h3>
          <div className="flex gap-2 mb-2 items-start">
            <select
              value={selectedProductID}
              onChange={(e) => setSelectedProductID(e.target.value)}
              disabled={isSaved}
              className="flex-1 p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm bg-white min-w-0 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Select Item...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.packing ? `(${p.packing})` : ''}</option>
              ))}
            </select>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              disabled={isSaved}
              min="1"
              step="1"
              className="w-16 p-2 border border-slate-300 rounded outline-none focus:border-red-500 text-sm text-center disabled:bg-slate-50 disabled:text-slate-500"
            />
            <button
              onClick={addItem}
              disabled={isSaved}
              className="bg-red-600 text-white p-2 rounded hover:bg-red-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
            </button>
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
                      Rate: ₹{item.rate} | {item.packing ? 'Pkt' : item.unit}
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
                      {item.quantity}
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
                    ₹{item.amount}
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
                    <span>₹{subtotal}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 mb-1">
                    <span>CGST ({halfRate}%):</span>
                    <span>₹{cgstAmount}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 mb-1 border-b border-dashed border-slate-300 pb-1">
                    <span>SGST ({halfRate}%):</span>
                    <span>₹{sgstAmount}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-lg text-slate-900 mt-1">
                <span>Total:</span>
                <span>₹{grandTotal}</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mt-auto pb-4 lg:pb-0">
          <button
            onClick={handleSave}
            disabled={items.length === 0 || isSaved || !customerName.trim() || isSaving}
            title={!customerName.trim() && items.length > 0 ? "Please add customer name" : ""}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white p-3 rounded hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={generatePDF}
            disabled={isGeneratingPdf || !isSaved}
            className="flex items-center justify-center gap-2 bg-slate-700 text-white p-3 rounded hover:bg-slate-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingPdf ? <span className="animate-spin">⌛</span> : <Download className="w-4 h-4" />} PDF
          </button>
          <button
            onClick={handleShareWhatsApp}
            disabled={isGeneratingPdf || !isSaved}
            className="flex items-center justify-center gap-2 bg-green-600 text-white p-3 rounded hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold"
            title="Share PDF via WhatsApp"
          >
            <Send className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={handleShareEmail}
            disabled={isGeneratingPdf || !isSaved}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold"
            title="Share PDF via Email"
          >
            <Share2 className="w-4 h-4" /> Email
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
            items={items}
            settings={settings}
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
            items={items}
            settings={settings}
          />
        </div>
      </div>

    </div>
  );
};