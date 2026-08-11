import React, { useState, useMemo } from 'react';
import { Customer, Invoice } from '../types';
import {
  X,
  ShoppingBag,
  TrendingUp,
  Calendar,
  DollarSign,
  Package,
  Award,
  BarChart3,
  FileText
} from 'lucide-react';

interface CustomerSpendingModalProps {
  customer: Customer;
  invoices: Invoice[];
  onClose: () => void;
}

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#d97706', '#4f46e5'];

const formatINRFull = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

export const CustomerSpendingModal: React.FC<CustomerSpendingModalProps> = ({
  customer,
  invoices,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'timeline' | 'bills'>('products');

  // Filter invoices for this customer (case-insensitive name match)
  const customerInvoices = useMemo(() => {
    const custNameLower = customer.name.trim().toLowerCase();
    return invoices.filter(
      inv => inv.customerName && inv.customerName.trim().toLowerCase() === custNameLower
    ).sort((a, b) => b.id.localeCompare(a.id));
  }, [customer.name, invoices]);

  // Calculate customer spending statistics
  const stats = useMemo(() => {
    const totalSpent = customerInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const invoiceCount = customerInvoices.length;
    const avgOrderValue = invoiceCount > 0 ? totalSpent / invoiceCount : 0;

    // Aggregate Product Purchases
    const productMap: Record<
      string,
      { name: string; quantity: number; amount: number; unit: string; packing?: string }
    > = {};

    let totalItemsCount = 0;

    customerInvoices.forEach(inv => {
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          totalItemsCount += item.quantity;
          const key = item.name.trim();
          if (!productMap[key]) {
            productMap[key] = {
              name: item.name,
              quantity: 0,
              amount: 0,
              unit: item.unit || 'Unit',
              packing: item.packing
            };
          }
          productMap[key].quantity += item.quantity;
          productMap[key].amount += Number(item.amount) || 0;
        });
      }
    });

    const productBreakdown = Object.values(productMap).sort((a, b) => b.amount - a.amount);
    const maxProductAmount = productBreakdown.length > 0 ? productBreakdown[0].amount : 1;

    // Timeline data (spending per bill)
    const timelineData = customerInvoices.map(inv => ({
      id: inv.id,
      date: inv.date,
      total: Number(inv.total) || 0,
      itemCount: inv.items ? inv.items.length : 0
    })).reverse(); // chronological order

    const maxBillAmount = timelineData.length > 0 ? Math.max(...timelineData.map(t => t.total), 1) : 1;

    return {
      totalSpent,
      invoiceCount,
      avgOrderValue,
      totalItemsCount,
      productBreakdown,
      maxProductAmount,
      timelineData,
      maxBillAmount
    };
  }, [customerInvoices]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex justify-between items-start shrink-0 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <ShoppingBag size={200} />
          </div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-semibold backdrop-blur-md mb-2">
              <Award size={14} className="text-yellow-300" /> Customer Analytics
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{customer.name}</h2>
            <p className="text-blue-100 text-xs md:text-sm mt-1 flex items-center gap-3">
              <span>📍 {customer.city || 'No city specified'}</span>
              {customer.phone && <span>📞 {customer.phone}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 md:p-5 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
              <DollarSign size={16} className="text-green-600" /> Total Spent
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-900">
              {formatINRFull(stats.totalSpent)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Lifetime value</div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
              <FileText size={16} className="text-blue-600" /> Total Bills
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-900">
              {stats.invoiceCount}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Invoices generated</div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
              <TrendingUp size={16} className="text-purple-600" /> Avg Order Value
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-900">
              {formatINRFull(stats.avgOrderValue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Per invoice average</div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
              <Package size={16} className="text-amber-600" /> Products Bought
            </div>
            <div className="text-lg md:text-xl font-bold text-slate-900">
              {stats.productBreakdown.length} <span className="text-xs text-slate-500 font-normal">items</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Distinct product types</div>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-5 shrink-0">
          <button
            onClick={() => setActiveTab('products')}
            className={`py-3 px-4 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'products'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 size={16} /> What is He Buying? (Product Breakdown)
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 px-4 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar size={16} /> Spending Timeline
          </button>
          <button
            onClick={() => setActiveTab('bills')}
            className={`py-3 px-4 text-xs md:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'bills'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={16} /> Invoices ({stats.invoiceCount})
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {customerInvoices.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-bold text-base">No Purchase History Found</p>
              <p className="text-xs text-slate-400 mt-1">This customer does not have any recorded invoices yet.</p>
            </div>
          ) : (
            <>
              {/* Tab 1: Product Purchase Breakdown */}
              {activeTab === 'products' && (
                <div className="space-y-6">
                  {/* Top Spending Products Bar Visualization */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
                      <span>Spending Share by Product</span>
                      <span className="text-xs text-slate-500 font-normal">Sorted by highest expenditure</span>
                    </h3>
                    <div className="space-y-4">
                      {stats.productBreakdown.map((item, idx) => {
                        const percentOfCustomerTotal = stats.totalSpent > 0
                          ? ((item.amount / stats.totalSpent) * 100).toFixed(1)
                          : '0';
                        const barWidthPercent = (item.amount / stats.maxProductAmount) * 100;
                        const barColor = COLORS[idx % COLORS.length];

                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-800 flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full inline-block"
                                  style={{ backgroundColor: barColor }}
                                ></span>
                                {item.name}
                                {item.packing && (
                                  <span className="text-[10px] text-slate-500 font-normal bg-slate-200 px-1.5 py-0.5 rounded">
                                    {item.packing}
                                  </span>
                                )}
                              </span>
                              <div className="text-right">
                                <span className="font-bold text-slate-900">{formatINRFull(item.amount)}</span>
                                <span className="text-[10px] text-slate-500 ml-2">({percentOfCustomerTotal}%)</span>
                              </div>
                            </div>
                            <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex items-center p-0.5">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.max(barWidthPercent, 2)}%`,
                                  backgroundColor: barColor
                                }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-500 flex justify-between">
                              <span>Purchased Qty: {item.quantity} {item.unit}</span>
                              <span>Avg Rate: {formatINRFull(item.quantity > 0 ? item.amount / item.quantity : 0)}/{item.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Product Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-100 font-bold text-xs text-slate-700 uppercase tracking-wider">
                      Detailed Items Purchased Table
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Total Quantity</th>
                          <th className="p-3 text-right">Total Amount</th>
                          <th className="p-3 text-right">% of Total Spend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stats.productBreakdown.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-800">
                              {item.name}
                              {item.packing && (
                                <span className="text-[10px] text-slate-400 font-normal ml-2">
                                  ({item.packing})
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">
                              {formatINRFull(item.amount)}
                            </td>
                            <td className="p-3 text-right text-slate-600">
                              {stats.totalSpent > 0 ? ((item.amount / stats.totalSpent) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Spending Timeline */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
                      <span>Invoice Spending History Chart</span>
                      <span className="text-xs text-slate-500 font-normal">Amount per Invoice</span>
                    </h3>
                    <div className="h-56 flex items-end justify-between gap-3 pt-6 pb-2 px-2 overflow-x-auto">
                      {stats.timelineData.map((t, idx) => {
                        const heightPercent = (t.total / stats.maxBillAmount) * 100;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end min-w-[36px]">
                            {/* Hover tooltip */}
                            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded p-2 z-20 whitespace-nowrap shadow-lg">
                              <div className="font-bold">Bill #{t.id}</div>
                              <div>Date: {t.date}</div>
                              <div>Total: {formatINRFull(t.total)}</div>
                              <div>Items: {t.itemCount}</div>
                            </div>
                            <div
                              className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t transition-all"
                              style={{ height: `${Math.max(heightPercent, 4)}%` }}
                            ></div>
                            <div className="text-[10px] text-slate-500 font-medium truncate w-full text-center">
                              #{t.id}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Customer Invoices List */}
              {activeTab === 'bills' && (
                <div className="space-y-3">
                  {customerInvoices.map(inv => (
                    <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-300 transition-colors">
                      <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">Invoice #{inv.id}</span>
                          <span className="text-xs text-slate-500 ml-3">📅 {inv.date}</span>
                        </div>
                        <div className="text-base font-bold text-blue-600">
                          {formatINRFull(inv.total)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Items Bought:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {inv.items.map((item, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                              {item.name} × {item.quantity} {item.unit} ({formatINRFull(item.amount)})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-md"
          >
            Close Details
          </button>
        </div>

      </div>
    </div>
  );
};
