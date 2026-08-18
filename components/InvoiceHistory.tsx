import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Invoice, BusinessSettings, Customer } from '../types';
import { Search, Calendar, Eye, X, Printer, Download, Upload, Edit, Trash2, Wallet, History, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { InvoiceTemplate, formatBillNum } from './InvoiceTemplate';
import { PaymentStatusBadge } from './PaymentTrackerModal';
import { InvoiceImportModal } from './InvoiceImportModal';

interface InvoiceHistoryProps {
  invoices: Invoice[];
  customers?: Customer[];
  settings: BusinessSettings;
  onDeleteInvoice?: (invoiceId: string) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onManagePayments?: (invoice: Invoice) => void;
  enablePaymentTracking?: boolean;
  csvImportAllowed?: boolean;
  onImportInvoices?: (invoices: Invoice[]) => Promise<void>;
}

const getPaymentStatus = (inv: Invoice): 'unpaid' | 'partial' | 'paid' => {
  const payments = inv.payments || [];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (paid <= 0) return 'unpaid';
  if (paid >= inv.total - 0.01) return 'paid';
  return 'partial';
};

export const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({
  invoices,
  customers,
  settings,
  onDeleteInvoice,
  onEditInvoice,
  onManagePayments,
  enablePaymentTracking = true,
  csvImportAllowed = false,
  onImportInvoices
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  // Scale for modal view
  const [scale, setScale] = useState(1);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when expandedId changes
  useEffect(() => {
    if (!expandedId) return;
    // Wait for DOM to update
    const id = `inv-expanded-${expandedId}`;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [expandedId]);

  useEffect(() => {
    const calculateScale = () => {
      if (modalContainerRef.current) {
        const containerWidth = modalContainerRef.current.offsetWidth;
        const a4Width = 794; // approx px for A4 at 96dpi
        const padding = 24; // padding inside container
        // On mobile, force scale to fit
        const newScale = Math.min((containerWidth - padding) / a4Width, 0.95);
        setScale(Math.max(newScale, 0.3));
      }
    };

    if (viewingInvoice) {
      // Slight delay to ensure DOM is ready
      const timer = setTimeout(calculateScale, 10);
      window.addEventListener('resize', calculateScale);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', calculateScale);
      };
    }
  }, [viewingInvoice]);
  // Map customer names to phone numbers from saved customers directory
  const customerPhoneMap = useMemo(() => {
    const map = new Map<string, string>();
    (customers || []).forEach(c => {
      if (c.name && c.phone) {
        map.set(c.name.trim().toLowerCase(), c.phone.trim());
      }
    });
    return map;
  }, [customers]);

  // Helper to extract phone number for an invoice (checks invoice fields & customer directory)
  const getInvoicePhone = useCallback((inv: Invoice): string => {
    if (inv.customerMobile && inv.customerMobile.trim()) return inv.customerMobile.trim();
    if ((inv as any).customerPhone && (inv as any).customerPhone.trim()) return (inv as any).customerPhone.trim();
    if ((inv as any).phone && (inv as any).phone.trim()) return (inv as any).phone.trim();
    if ((inv as any).mobile && (inv as any).mobile.trim()) return (inv as any).mobile.trim();
    if (inv.customerName && inv.customerName.trim()) {
      const match = customerPhoneMap.get(inv.customerName.trim().toLowerCase());
      if (match) return match;
    }
    return '';
  }, [customerPhoneMap]);

  const filteredInvoices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const cleanTerm = term.replace(/[^0-9]/g, '');

    return invoices.filter(invoice => {
      let matchesSearch = true;

      if (term) {
        // 1. Bill No match
        const matchId = invoice.id.toLowerCase().includes(term);

        // 2. Customer Name match
        const matchName = invoice.customerName.toLowerCase().includes(term);

        // 3. Customer City match
        const matchCity = !!(invoice.customerCity && invoice.customerCity.toLowerCase().includes(term));

        // 4. Mobile / Phone match (direct substring & clean digit-only match)
        const rawPhone = getInvoicePhone(invoice);
        let matchPhone = false;
        if (rawPhone) {
          if (rawPhone.toLowerCase().includes(term)) {
            matchPhone = true;
          } else if (cleanTerm.length >= 3) {
            const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
            if (cleanPhone.includes(cleanTerm)) {
              matchPhone = true;
            }
          }
        }

        matchesSearch = matchId || matchName || matchCity || matchPhone;
      }

      let matchesDate = true;
      if (startDate || endDate) {
        // Parse invoice date (DD/MM/YYYY)
        const parts = invoice.date.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts.map(Number);
          const invDate = new Date(year, month - 1, day);
          invDate.setHours(0, 0, 0, 0);

          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (invDate < start) matchesDate = false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (invDate > end) matchesDate = false;
          }
        }
      }

      return matchesSearch && matchesDate;
    }).sort((a, b) => {
      // Sort by Bill No descending (assuming string number)
      return parseInt(b.id) - parseInt(a.id);
    });
  }, [invoices, searchTerm, getInvoicePhone, startDate, endDate]);

  // Reset page when filters change
  useEffect(() => { resetPage(); }, [searchTerm, startDate, endDate, resetPage]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pagedInvoices = filteredInvoices.slice(startIdx, startIdx + pageSize);
  const endIdx = Math.min(startIdx + pageSize, filteredInvoices.length);


  const handlePrint = () => {
    if (!viewingInvoice) return;

    // Save original title and set new title for PDF filename
    const originalTitle = document.title;
    document.title = `Invoice_${viewingInvoice.id}_${viewingInvoice.customerName.replace(/[^a-z0-9]/gi, '_')}`;

    // Create a temporary container for printing
    const printContainer = document.createElement('div');
    printContainer.id = 'print-only-container';
    printContainer.className = 'print-only-container';
    // Ensure immediate visibility for mobile browsers - use height: auto to prevent blank second page
    printContainer.style.cssText = 'display: block !important; visibility: visible !important; position: static; width: 100%; height: auto; min-height: 0; background: white; z-index: 99999;';
    document.body.appendChild(printContainer);

    // Clone the invoice template and render it in the print container
    const invoiceElement = document.getElementById('history-view');
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
    // This is more reliable on mobile browsers than setTimeout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double RAF ensures the browser has painted the content
        window.print();

        // Clean up after print dialog closes
        // Use a longer delay for mobile browsers which may take longer to close print dialog
        const cleanup = () => {
          if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
          }
          // Restore original title
          document.title = originalTitle;
        };

        // Try to detect when print dialog closes using focus event (works on some browsers)
        const handleFocus = () => {
          setTimeout(cleanup, 500);
          window.removeEventListener('focus', handleFocus);
        };
        window.addEventListener('focus', handleFocus);

        // Fallback cleanup after a longer delay for mobile
        setTimeout(cleanup, 3000);
      });
    });
  };



  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) return;

    const headers = ['Bill No', 'Date', 'Customer Name', 'City', 'Mobile', 'Items', 'Total Amount'];
    const csvContent = [
      headers.join(','),
      ...filteredInvoices.map(inv => {
        // Format items as "ProductName (quantity packets), ProductName2 (quantity packets)"
        const itemsString = inv.items.map(item => 
          `${item.name}${item.packing ? ` ${item.packing}` : ''} (${item.quantity} ${item.unit})`
        ).join(', ');
        
        return [
          inv.id,
          inv.date,
          `"${(inv.customerName || '').replace(/"/g, '""')}"`, // Escape quotes
          `"${(inv.customerCity || '').replace(/"/g, '""')}"`,
          `"${(inv.customerMobile || '').replace(/"/g, '""')}"`,
          `"${itemsString.replace(/"/g, '""')}"`, // Escape quotes in items
          inv.total
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `invoices_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-base sm:text-xl md:text-2xl font-bold text-slate-800 truncate">Invoice History</h2>
                <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs shrink-0">
                  {filteredInvoices.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">View and manage all invoices</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {csvImportAllowed && onImportInvoices && (
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
                title="Import Invoices from CSV"
              >
                <Upload size={13} /> <span className="hidden sm:inline">Import CSV</span>
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={filteredInvoices.length === 0}
              className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title="Export to CSV"
            >
              <Download size={13} /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Compact Filters & Search Bar */}
        <div className="p-2.5 sm:p-4 border-b border-slate-200 bg-slate-50 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search customer name or bill #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5">
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowDateFilter(!showDateFilter)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0 ${
                startDate || endDate || showDateFilter
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
              title="Filter by Date Range"
            >
              <Calendar size={13} />
              <span>Dates</span>
              {(startDate || endDate) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          </div>

          {/* Date Range Controls (Expanded when active or toggled) */}
          {(showDateFilter || startDate || endDate) && (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-slate-600 mb-0.5">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-bold text-slate-600 mb-0.5">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* MOBILE VIEW: Cards */}
          <div className="md:hidden p-3 space-y-3">
            {pagedInvoices.map(inv => {
              const preview = inv.items.slice(0, 2).map(i => `${i.name} x ${i.quantity}`).join(', ');
              const moreCount = inv.items.length > 2 ? ` +${inv.items.length - 2} more` : '';
              return (
                <div
                  key={inv.id}
                  onClick={() => setViewingInvoice(inv)}
                  className="bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-lg p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded">#{inv.id}</span>
                        <span className="text-xs text-slate-400">{inv.date}</span>
                      </div>
                      <h3 className="font-bold text-slate-900">{inv.customerName}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{inv.customerCity || 'N/A'}</span>
                      </p>
                      {getInvoicePhone(inv) && (
                        <p className="text-xs text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                          <span>📞</span>
                          <span>{getInvoicePhone(inv)}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-indigo-600">₹{formatBillNum(inv.total)}</div>
                      <div className="text-xs text-slate-500">{inv.items.length} items</div>
                      {enablePaymentTracking && (
                        <div className="mt-1">
                          <PaymentStatusBadge status={getPaymentStatus(inv)} small />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500 truncate mb-2">{preview || 'No items'}{moreCount}</p>
                    <div className={`grid ${enablePaymentTracking && onManagePayments ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-2`}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setViewingInvoice(inv); }}
                        className="bg-indigo-50 text-indigo-600 py-2 px-2 rounded-lg hover:bg-indigo-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors"
                      >
                        <Eye size={14} /> View
                      </button>
                      {enablePaymentTracking && onManagePayments && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onManagePayments(inv); }}
                          className="bg-purple-50 text-purple-600 py-2 px-2 rounded-lg hover:bg-purple-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors"
                        >
                          <Wallet size={14} /> Payments
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {onEditInvoice && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditInvoice(inv); }}
                          className="bg-blue-50 text-blue-600 py-2 px-2 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors"
                        >
                          <Edit size={14} /> Edit
                        </button>
                      )}
                      {onDeleteInvoice && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteInvoice(inv.id); }}
                          className="bg-red-50 text-red-600 py-2 px-2 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1 font-medium text-xs transition-colors"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {pagedInvoices.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Search size={48} className="mb-3 opacity-20" />
                <p className="font-medium">No invoices found</p>
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            )}
          </div>

          {/* DESKTOP VIEW: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-4 whitespace-nowrap">Bill No</th>
                  <th className="p-4 whitespace-nowrap">Date</th>
                  <th className="p-4 whitespace-nowrap">Customer</th>
                  <th className="p-4 whitespace-nowrap text-right">Items</th>
                  <th className="p-4 whitespace-nowrap text-right">Total Amount</th>
                  {enablePaymentTracking && <th className="p-4 whitespace-nowrap text-center">Status</th>}
                  <th className="p-4 whitespace-nowrap text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pagedInvoices.map(inv => (
                  <React.Fragment key={inv.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-700">#{inv.id}</td>
                      <td className="p-4 text-slate-500">{inv.date}</td>
                      <td className="p-4 font-medium">
                        <div className="font-bold text-slate-800">
                          {inv.customerName}
                          {inv.customerCity && (
                            <span className="text-xs text-slate-400 font-normal ml-1">({inv.customerCity})</span>
                          )}
                        </div>
                        {getInvoicePhone(inv) && (
                          <div className="text-xs text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                            <span>📞</span>
                            <span>{getInvoicePhone(inv)}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-sm text-slate-600">
                          {inv.items.length === 0 && <span className="text-xs text-slate-400">No items</span>}
                          {inv.items.length > 0 && (
                            inv.items.slice(0, 2).map((it, idx) => (
                              <span key={it.id} className="block">{it.name} x {it.quantity}{inv.items.length > 2 && idx === 1 ? ` +${inv.items.length - 2} more` : ''}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold text-slate-900">₹{formatBillNum(inv.total)}</td>
                      {enablePaymentTracking && (
                        <td className="p-4 text-center">
                          <PaymentStatusBadge status={getPaymentStatus(inv)} />
                        </td>
                      )}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setViewingInvoice(inv)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-full transition-colors"
                            title="View Invoice"
                          >
                            <Eye size={16} />
                          </button>
                          {enablePaymentTracking && onManagePayments && (
                            <button
                              onClick={() => onManagePayments(inv)}
                              className="bg-purple-100 hover:bg-purple-200 text-purple-700 p-2 rounded-full transition-colors"
                              title="Manage Payments"
                            >
                              <Wallet size={16} />
                            </button>
                          )}
                          {onEditInvoice && (
                            <button
                              onClick={() => onEditInvoice(inv)}
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 p-2 rounded-full transition-colors"
                              title="Edit Invoice"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {onDeleteInvoice && (
                            <button
                              onClick={() => onDeleteInvoice(inv.id)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 p-2 rounded-full transition-colors"
                              title="Delete Invoice"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(prev => prev === inv.id ? null : inv.id); }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded transition-colors text-xs"
                            title={expandedId === inv.id ? 'Collapse items' : 'Expand items'}
                          >
                            {expandedId === inv.id ? '−' : '+'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === inv.id && (
                      <tr id={`inv-expanded-${inv.id}`} className="bg-slate-50">
                        <td colSpan={enablePaymentTracking ? 7 : 6} className="p-4">
                          <div className="grid gap-2">
                            {inv.items.map(it => (
                              <div key={it.id} className="flex justify-between text-sm text-slate-700">
                                <div className="truncate">
                                  <span className="font-semibold text-slate-800">{it.name}</span> &times; {it.quantity} {it.unit}
                                  {it.packing && (
                                    <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 ml-2 font-medium">
                                      {settings.columnHeaders?.packingHeader || 'Packing'}: {it.packing}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right text-xs font-semibold text-slate-600">
                                  Rate: ₹{formatBillNum(it.rate)} &nbsp;|&nbsp; Amount: <span className="text-slate-900 font-bold">₹{formatBillNum(it.amount)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {pagedInvoices.length === 0 && (
                  <tr>
                    <td colSpan={enablePaymentTracking ? 7 : 6} className="p-8 text-center text-slate-400">
                      No invoices found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {filteredInvoices.length > 0 && (
          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Info + page size */}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Showing <span className="font-semibold text-slate-700">{startIdx + 1}–{endIdx}</span> of{' '}
                <span className="font-semibold text-slate-700">{filteredInvoices.length}</span> invoices
              </span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); resetPage(); }}
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-indigo-400 outline-none"
              >
                {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
              </select>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First page"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next page"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Last page"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Invoice View Modal */}
        {viewingInvoice && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-0 md:p-4 backdrop-blur-sm">
            <div className="bg-slate-200 w-full md:max-w-5xl h-full md:h-[90vh] md:rounded-lg shadow-2xl flex flex-col relative overflow-hidden">
              {/* Toolbar */}
              <div className="bg-slate-800 text-white p-3 md:p-4 flex flex-wrap justify-between items-center no-print gap-2 shrink-0 safe-top">
                <div className="flex flex-col">
                  <span className="text-[10px] md:text-xs text-slate-400 uppercase tracking-wider">Viewing Invoice</span>
                  <h3 className="font-bold text-sm md:text-lg">#{viewingInvoice.id}</h3>
                </div>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1 md:gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 md:px-4 md:py-2 rounded text-[10px] md:text-sm font-bold shadow-lg transition-colors border border-slate-600"
                  >
                    <Printer size={14} className="md:w-4 md:h-4" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={() => setViewingInvoice(null)}
                    className="bg-slate-700 hover:bg-red-600 p-1.5 md:p-2 rounded-full transition-colors ml-1"
                  >
                    <X size={18} className="md:w-5 md:h-5" />
                  </button>
                </div>
              </div>

              {/* Preview Area */}
              <div ref={modalContainerRef} className="flex-1 overflow-auto p-4 md:p-8 flex justify-center bg-slate-500/10 relative">
                <div
                  className="print-container origin-top shadow-xl transition-transform duration-200 ease-out bg-white"
                  style={{ transform: `scale(${scale})`, marginBottom: `${Math.max(0, scale * 300)}px` }}
                >
                  <InvoiceTemplate
                    id="history-view"
                    billNo={viewingInvoice.id}
                    date={viewingInvoice.date}
                    customerName={viewingInvoice.customerName}
                    customerCity={viewingInvoice.customerCity}
                    customerMobile={getInvoicePhone(viewingInvoice)}
                    items={viewingInvoice.items}
                    settings={settings}
                    gstRate={viewingInvoice.gstRate}
                    payments={viewingInvoice.payments}
                    showUnitInItemsTable={viewingInvoice.showUnitInItemsTable}
                    customTotalQtyText={viewingInvoice.customTotalQtyText}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Import Modal */}
        {showImportModal && onImportInvoices && (
          <InvoiceImportModal
            onClose={() => setShowImportModal(false)}
            onImport={onImportInvoices}
          />
        )}
      </div>
    </div>
  );
};
