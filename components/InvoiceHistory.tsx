import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Invoice, BusinessSettings } from '../types';
import { Search, Eye, X, Printer, Download } from 'lucide-react';
import { InvoiceTemplate } from './InvoiceTemplate';

interface InvoiceHistoryProps {
  invoices: Invoice[];
  settings: BusinessSettings;
}

export const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({ invoices, settings }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const matchesSearch =
        invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.id.toLowerCase().includes(searchTerm.toLowerCase());

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
            end.setHours(0, 0, 0, 0);
            if (invDate > end) matchesDate = false;
          }
        }
      }

      return matchesSearch && matchesDate;
    }).sort((a, b) => {
      // Sort by Bill No descending (assuming string number)
      return parseInt(b.id) - parseInt(a.id);
    });
  }, [invoices, searchTerm, startDate, endDate]);

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

    const headers = ['Bill No', 'Date', 'Customer Name', 'City', 'Items', 'Total Amount'];
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
          `"${inv.customerName.replace(/"/g, '""')}"`, // Escape quotes
          `"${inv.customerCity.replace(/"/g, '""')}"`,
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
        <div className="p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-600" />
              Invoice History
            </h2>
            <p className="text-xs text-slate-500 mt-1">View and manage all invoices</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleExportCSV}
              disabled={filteredInvoices.length === 0}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title="Export to CSV"
            >
              <Download size={14} /> <span>Export CSV</span>
            </button>
            <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200">
              <div className="text-lg md:text-2xl font-bold text-indigo-600">{filteredInvoices.length}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Total</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by customer name or bill number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* MOBILE VIEW: Cards */}
          <div className="md:hidden p-3 space-y-3">
            {filteredInvoices.map(inv => {
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
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {inv.customerCity}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-indigo-600">₹{inv.total}</div>
                      <div className="text-xs text-slate-500">{inv.items.length} items</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500 truncate mb-2">{preview || 'No items'}{moreCount}</p>
                    <button className="w-full bg-indigo-50 text-indigo-600 py-2 px-3 rounded-lg hover:bg-indigo-100 flex items-center justify-center gap-2 font-medium text-sm transition-colors">
                      <Eye size={16} /> View Invoice
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredInvoices.length === 0 && (
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
                  <th className="p-4 whitespace-nowrap text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInvoices.map(inv => (
                  <React.Fragment key={inv.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-700">#{inv.id}</td>
                      <td className="p-4 text-slate-500">{inv.date}</td>
                      <td className="p-4 font-medium">{inv.customerName} <span className="text-xs text-slate-400">({inv.customerCity})</span></td>
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
                      <td className="p-4 text-right font-bold text-slate-900">₹{inv.total}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setViewingInvoice(inv)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-full transition-colors"
                            title="View Invoice"
                          >
                            <Eye size={16} />
                          </button>
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
                        <td colSpan={6} className="p-4">
                          <div className="grid gap-2">
                            {inv.items.map(it => (
                              <div key={it.id} className="flex justify-between text-sm text-slate-700">
                                <div className="truncate">{it.name} x {it.quantity} <span className="text-xs text-slate-400">({it.packing || it.unit})</span></div>
                                <div className="text-right">₹{it.rate} &nbsp; | &nbsp; ₹{it.amount}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No invoices found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
                    items={viewingInvoice.items}
                    settings={settings}
                    gstRate={viewingInvoice.gstRate}
                  />
                </div>
              </div>


            </div>
          </div>
        )}
      </div>
    </div>
  );
};
