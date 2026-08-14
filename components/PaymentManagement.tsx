import React, { useState, useMemo } from 'react';
import { Invoice, PaymentEntry, PaymentMode, Customer, BusinessSettings } from '../types';
import { InvoiceTemplate } from './InvoiceTemplate';
import {
  Wallet,
  IndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  PlusCircle,
  Trash2,
  Eye,
  MessageSquare,
  FileSpreadsheet,
  TrendingUp,
  CreditCard,
  Building2,
  Smartphone,
  Banknote,
  Calendar,
  Users,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Printer,
  X
} from 'lucide-react';

interface PaymentManagementProps {
  invoices: Invoice[];
  customers: Customer[];
  settings: BusinessSettings;
  onManagePayments: (invoice: Invoice) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onDeletePayment?: (invoiceId: string, paymentId: string) => Promise<void>;
}

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Other'];

const MODE_CONFIG: Record<PaymentMode, { color: string; bg: string; icon: React.ReactNode }> = {
  Cash: { color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200', icon: <Banknote size={14} className="text-emerald-600" /> },
  UPI: { color: 'text-violet-700', bg: 'bg-violet-100 border-violet-200', icon: <Smartphone size={14} className="text-violet-600" /> },
  Cheque: { color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200', icon: <CreditCard size={14} className="text-blue-600" /> },
  'Bank Transfer': { color: 'text-sky-700', bg: 'bg-sky-100 border-sky-200', icon: <Building2 size={14} className="text-sky-600" /> },
  Other: { color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200', icon: <CreditCard size={14} className="text-slate-600" /> },
};

const formatINR = (amount: number): string => {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
};

const parseInvoiceDate = (dateStr: string): number => {
  if (!dateStr) return 0;
  if (dateStr.includes('-')) {
    const ts = new Date(dateStr).getTime();
    if (!isNaN(ts)) return ts;
  }
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d).getTime();
  }
  return 0;
};

export const PaymentManagement: React.FC<PaymentManagementProps> = ({
  invoices,
  customers,
  settings,
  onManagePayments,
  onViewInvoice,
  onDeletePayment,
}) => {
  const [activeTab, setActiveTab] = useState<'receivables' | 'transactions' | 'customers'>('receivables');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid' | 'overdue'>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_pending' | 'highest_total'>('highest_pending');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Phone lookup map from customers directory
  const customerPhoneMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach(c => {
      const ph = c.mobile || (c as any).phone;
      if (ph && c.name) {
        map.set(c.name.trim().toLowerCase(), String(ph).trim());
      }
    });
    return map;
  }, [customers]);

  const getPhoneForInvoice = (inv: Invoice): string => {
    if (inv.customerMobile) return inv.customerMobile;
    const legacy = (inv as any).customerPhone || (inv as any).phone || (inv as any).mobile;
    if (legacy) return String(legacy);
    if (inv.customerName) {
      return customerPhoneMap.get(inv.customerName.trim().toLowerCase()) || '';
    }
    return '';
  };

  // Compute Overall KPI Metrics
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let overduePending = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const modeTotals: Record<PaymentMode, { amount: number; count: number }> = {
      Cash: { amount: 0, count: 0 },
      UPI: { amount: 0, count: 0 },
      Cheque: { amount: 0, count: 0 },
      'Bank Transfer': { amount: 0, count: 0 },
      Other: { amount: 0, count: 0 },
    };

    invoices.forEach(inv => {
      totalBilled += inv.total;
      const invPayments = inv.payments || [];
      const invPaid = invPayments.reduce((sum, p) => sum + p.amount, 0);
      const invRemaining = inv.total - invPaid;
      totalCollected += invPaid;

      if (invPaid <= 0) {
        unpaidCount++;
      } else if (invRemaining <= 0) {
        paidCount++;
      } else {
        partialCount++;
      }

      // Check overdue if unpaid/partial and older than 30 days
      const invDateTs = parseInvoiceDate(inv.date);
      if (invRemaining > 0 && invDateTs > 0 && invDateTs < thirtyDaysAgo) {
        overduePending += invRemaining;
      }

      // Tally payment modes
      invPayments.forEach(p => {
        const mode = (p.mode in modeTotals ? p.mode : 'Other') as PaymentMode;
        modeTotals[mode].amount += p.amount;
        modeTotals[mode].count += 1;
      });
    });

    const totalOutstanding = Math.max(0, totalBilled - totalCollected);
    const collectionRate = totalBilled > 0 ? Math.min(100, (totalCollected / totalBilled) * 100) : 0;

    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      paidCount,
      partialCount,
      unpaidCount,
      overduePending,
      modeTotals,
    };
  }, [invoices]);

  // Flatten all individual payment transactions for the ledger tab
  const allTransactions = useMemo(() => {
    const list: Array<{
      invoiceId: string;
      customerName: string;
      customerCity: string;
      customerMobile: string;
      payment: PaymentEntry;
    }> = [];

    invoices.forEach(inv => {
      const phone = getPhoneForInvoice(inv);
      (inv.payments || []).forEach(p => {
        list.push({
          invoiceId: inv.id,
          customerName: inv.customerName,
          customerCity: inv.customerCity,
          customerMobile: phone,
          payment: p,
        });
      });
    });

    return list.sort((a, b) => {
      const tA = a.payment.date ? new Date(a.payment.date.split('/').reverse().join('-')).getTime() : 0;
      const tB = b.payment.date ? new Date(b.payment.date.split('/').reverse().join('-')).getTime() : 0;
      return tB - tA;
    });
  }, [invoices, customerPhoneMap]);

  // Aggregate customer-wise outstanding balances
  const customerBalances = useMemo(() => {
    const map = new Map<string, {
      customerName: string;
      customerCity: string;
      customerMobile: string;
      invoiceCount: number;
      totalBilled: number;
      totalPaid: number;
      totalPending: number;
      invoicesList: Invoice[];
    }>();

    invoices.forEach(inv => {
      const key = inv.customerName?.trim().toLowerCase() || 'unknown';
      const phone = getPhoneForInvoice(inv);
      const invPaid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
      const invPending = Math.max(0, inv.total - invPaid);

      if (!map.has(key)) {
        map.set(key, {
          customerName: inv.customerName,
          customerCity: inv.customerCity,
          customerMobile: phone,
          invoiceCount: 1,
          totalBilled: inv.total,
          totalPaid: invPaid,
          totalPending: invPending,
          invoicesList: [inv],
        });
      } else {
        const item = map.get(key)!;
        item.invoiceCount += 1;
        item.totalBilled += inv.total;
        item.totalPaid += invPaid;
        item.totalPending += invPending;
        item.invoicesList.push(inv);
        if (!item.customerMobile && phone) item.customerMobile = phone;
      }
    });

    return Array.from(map.values())
      .filter(c => c.totalPending > 0)
      .sort((a, b) => b.totalPending - a.totalPending);
  }, [invoices, customerPhoneMap]);

  // Filtered and Sorted Invoices for Receivables Tab
  const filteredInvoices = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();
    const cleanDigits = searchTerm.replace(/[^0-9]/g, '');
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    return invoices.filter(inv => {
      const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
      const remaining = inv.total - paid;
      const isPaid = paid >= inv.total && inv.total > 0;
      const isPartial = paid > 0 && remaining > 0;
      const isUnpaid = paid <= 0;
      const invDateTs = parseInvoiceDate(inv.date);
      const isOverdue = remaining > 0 && invDateTs > 0 && invDateTs < thirtyDaysAgo;

      // Status filter
      if (statusFilter === 'unpaid' && !isUnpaid) return false;
      if (statusFilter === 'partial' && !isPartial) return false;
      if (statusFilter === 'paid' && !isPaid) return false;
      if (statusFilter === 'overdue' && !isOverdue) return false;

      // Search filter
      if (cleanSearch) {
        const phone = getPhoneForInvoice(inv);
        const nameMatch = inv.customerName?.toLowerCase().includes(cleanSearch);
        const cityMatch = inv.customerCity?.toLowerCase().includes(cleanSearch);
        const idMatch = inv.id?.toLowerCase().includes(cleanSearch);
        const phoneMatch = cleanDigits && phone ? phone.replace(/[^0-9]/g, '').includes(cleanDigits) : false;

        if (!nameMatch && !cityMatch && !idMatch && !phoneMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const paidA = (a.payments || []).reduce((s, p) => s + p.amount, 0);
      const paidB = (b.payments || []).reduce((s, p) => s + p.amount, 0);
      const pendA = Math.max(0, a.total - paidA);
      const pendB = Math.max(0, b.total - paidB);

      if (sortBy === 'highest_pending') return pendB - pendA;
      if (sortBy === 'highest_total') return b.total - a.total;
      if (sortBy === 'oldest') return parseInvoiceDate(a.date) - parseInvoiceDate(b.date);
      return parseInvoiceDate(b.date) - parseInvoiceDate(a.date);
    });
  }, [invoices, statusFilter, searchTerm, sortBy, customerPhoneMap]);

  // Filtered Transactions for Ledger Tab
  const filteredTransactions = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();
    const cleanDigits = searchTerm.replace(/[^0-9]/g, '');

    return allTransactions.filter(item => {
      if (modeFilter !== 'all' && item.payment.mode !== modeFilter) {
        return false;
      }

      if (cleanSearch) {
        const nameMatch = item.customerName?.toLowerCase().includes(cleanSearch);
        const invMatch = item.invoiceId?.toLowerCase().includes(cleanSearch);
        const noteMatch = item.payment.note?.toLowerCase().includes(cleanSearch);
        const phoneMatch = cleanDigits && item.customerMobile ? item.customerMobile.replace(/[^0-9]/g, '').includes(cleanDigits) : false;

        if (!nameMatch && !invMatch && !noteMatch && !phoneMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allTransactions, modeFilter, searchTerm]);

  // Send WhatsApp Payment Reminder
  const handleSendWhatsAppReminder = (inv: Invoice) => {
    const phone = getPhoneForInvoice(inv);
    if (!phone) {
      alert(`No mobile number recorded for ${inv.customerName}. Please update the customer profile or bill with their phone number.`);
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, inv.total - paid);

    let message = `*PAYMENT REMINDER*\n`;
    message += `Dear *${inv.customerName}*,\n\n`;
    message += `This is a friendly reminder regarding your pending balance from *${settings.name || 'our store'}*.\n\n`;
    message += `📋 *Invoice Details:*\n`;
    message += `• *Invoice #:* ${inv.id}\n`;
    message += `• *Date:* ${inv.date}\n`;
    message += `• *Bill Amount:* ₹${inv.total.toLocaleString('en-IN')}\n`;
    message += `• *Amount Paid:* ₹${paid.toLocaleString('en-IN')}\n`;
    message += `• *Balance Due:* *₹${balance.toLocaleString('en-IN')}*\n\n`;

    if (settings.upiId) {
      message += `📲 *Pay via UPI:* \`${settings.upiId}\`\n`;
    }
    if (settings.bankName && settings.bankAccountNumber) {
      message += `🏦 *Bank Details:*\n`;
      message += `• Bank: ${settings.bankName}\n`;
      message += `• A/C: ${settings.bankAccountNumber}\n`;
      if (settings.bankIfsc) message += `• IFSC: ${settings.bankIfsc}\n`;
    }

    message += `\nThank you for your business! 🙏`;

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Send WhatsApp Total Balance Reminder across all invoices
  const handleSendCustomerBalanceReminder = (customer: typeof customerBalances[0]) => {
    if (!customer.customerMobile) {
      alert(`No mobile number recorded for ${customer.customerName}.`);
      return;
    }

    const cleanPhone = customer.customerMobile.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    let message = `*ACCOUNT STATEMENT & PAYMENT REMINDER*\n`;
    message += `Dear *${customer.customerName}*,\n\n`;
    message += `Here is your outstanding account summary from *${settings.name || 'our store'}*:\n\n`;
    message += `• *Total Invoices:* ${customer.invoiceCount}\n`;
    message += `• *Total Billed:* ₹${customer.totalBilled.toLocaleString('en-IN')}\n`;
    message += `• *Total Paid:* ₹${customer.totalPaid.toLocaleString('en-IN')}\n`;
    message += `• *Total Balance Outstanding:* *₹${customer.totalPending.toLocaleString('en-IN')}*\n\n`;

    if (settings.upiId) {
      message += `📲 *Pay via UPI:* \`${settings.upiId}\`\n`;
    }
    if (settings.bankName && settings.bankAccountNumber) {
      message += `🏦 *Bank Transfer:*\n`;
      message += `• Bank: ${settings.bankName}\n`;
      message += `• A/C: ${settings.bankAccountNumber}\n`;
      if (settings.bankIfsc) message += `• IFSC: ${settings.bankIfsc}\n`;
    }

    message += `\nPlease clear the pending dues at your earliest convenience. Thank you! 🙏`;

    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Export Transactions Ledger to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('No payment records to export.');
      return;
    }

    const headers = ['Date', 'Invoice ID', 'Customer Name', 'City', 'Mobile', 'Payment Mode', 'Amount (INR)', 'Note'];
    const rows = filteredTransactions.map(t => [
      `"${t.payment.date || ''}"`,
      `"${t.invoiceId || ''}"`,
      `"${t.customerName || ''}"`,
      `"${t.customerCity || ''}"`,
      `"${t.customerMobile || ''}"`,
      `"${t.payment.mode || ''}"`,
      t.payment.amount || 0,
      `"${(t.payment.note || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `payments_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full bg-white md:rounded-lg shadow-sm border-0 md:border border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 truncate">Payment Management</h2>
                <span className="bg-white px-2.5 py-0.5 rounded-full text-xs font-black text-red-600 border border-slate-200 shadow-2xs shrink-0">
                  {metrics.unpaidCount + metrics.partialCount > 0 ? `${metrics.unpaidCount + metrics.partialCount} Dues` : 'All Clear'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">Track receivables, record collections & manage ledger</p>
            </div>
          </div>

          {/* Sub Navigation Tabs - 3-col grid on mobile with zero scrolling */}
          <div className="w-full sm:w-auto grid grid-cols-3 sm:flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs shrink-0 gap-1">
            <button
              onClick={() => setActiveTab('receivables')}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center truncate ${
                activeTab === 'receivables'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="sm:hidden">Invoices</span>
              <span className="hidden sm:inline">Invoices & Receivables</span>
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center truncate ${
                activeTab === 'transactions'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="sm:hidden">Ledger ({allTransactions.length})</span>
              <span className="hidden sm:inline">Payment Ledger ({allTransactions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center truncate ${
                activeTab === 'customers'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="sm:hidden">Dues ({customerBalances.length})</span>
              <span className="hidden sm:inline">Customer Dues ({customerBalances.length})</span>
            </button>
          </div>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-5 md:p-6 space-y-3 sm:space-y-6 w-full">
        {/* KPI Metrics Cards - 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {/* Card 1: Total Billed */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Total Billed</span>
              <span className="text-slate-400 text-[10px] sm:text-xs">{invoices.length} bills</span>
            </div>
            <div className="text-base sm:text-xl md:text-2xl font-black text-slate-850 truncate">
              {formatINR(metrics.totalBilled)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">Cumulative sales amount</div>
          </div>

          {/* Card 2: Total Collected */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-3 sm:p-4 rounded-xl border border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={12} className="shrink-0" /> Collected
              </span>
              <span className="text-emerald-700 text-[10px] sm:text-xs font-bold">{allTransactions.length} txns</span>
            </div>
            <div className="text-base sm:text-xl md:text-2xl font-black text-emerald-700 truncate">
              {formatINR(metrics.totalCollected)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-emerald-600 mt-0.5 font-semibold truncate">
              {metrics.collectionRate.toFixed(1)}% collected
            </div>
          </div>

          {/* Card 3: Pending Receivables */}
          <div className="bg-gradient-to-br from-rose-50 to-orange-50 p-3 sm:p-4 rounded-xl border border-rose-200 shadow-xs">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} className="shrink-0" /> Pending Dues
              </span>
              <span className="text-rose-700 text-[10px] sm:text-xs font-bold">{metrics.unpaidCount + metrics.partialCount} unpaid</span>
            </div>
            <div className="text-base sm:text-xl md:text-2xl font-black text-rose-700 truncate">
              {formatINR(metrics.totalOutstanding)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-rose-600 mt-0.5 truncate">
              {metrics.overduePending > 0 ? `⚠️ ${formatINR(metrics.overduePending)} overdue >30d` : 'Current receivables'}
            </div>
          </div>

          {/* Card 4: Collection Rate Progress */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Health</span>
              <TrendingUp size={14} className="text-emerald-600 shrink-0" />
            </div>
            <div className="space-y-1 my-0.5">
              <div className="flex justify-between text-[11px] sm:text-xs font-bold">
                <span className="text-slate-700">Rate</span>
                <span className="text-emerald-700">{metrics.collectionRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${metrics.collectionRate}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-[9px] sm:text-[10px] text-slate-400 truncate">
              <span>{metrics.paidCount} Paid</span>
              <span>{metrics.partialCount} Part</span>
              <span>{metrics.unpaidCount} Due</span>
            </div>
          </div>
        </div>

        {/* Payment Modes Distribution Bar - 2 cols on mobile, 3 on tablet, 5 on desktop */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
            <span>Payment Modes Breakdown</span>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal">All recorded collections</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {PAYMENT_MODES.map(mode => {
              const data = metrics.modeTotals[mode];
              const cfg = MODE_CONFIG[mode];
              return (
                <div key={mode} className={`p-2 sm:p-2.5 rounded-lg border ${cfg.bg} flex items-center justify-between`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                      {cfg.icon}
                      <span className="truncate">{mode}</span>
                    </div>
                    <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5 truncate">
                      {formatINR(data.amount)}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/80 text-slate-700 shrink-0 ml-1">
                    {data.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TAB 1: Invoices & Receivables */}
        {activeTab === 'receivables' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Search & Filter Toolbar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search customer, phone, bill #..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {/* Status Filter Pills - horizontal scrollable */}
                <div className="overflow-x-auto no-scrollbar scrollbar-none flex bg-white p-0.5 rounded-lg border border-slate-200 text-xs shrink-0 gap-0.5">
                  {[
                    { key: 'all' as const, label: 'All' },
                    { key: 'unpaid' as const, label: `Unpaid (${metrics.unpaidCount})` },
                    { key: 'partial' as const, label: `Partial (${metrics.partialCount})` },
                    { key: 'paid' as const, label: `Paid (${metrics.paidCount})` },
                    { key: 'overdue' as const, label: 'Overdue >30d' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        statusFilter === tab.key
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1 bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs shrink-0 self-start sm:self-auto">
                  <ArrowUpDown size={13} className="text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="highest_pending">Highest Due</option>
                    <option value="highest_total">Highest Bill</option>
                    <option value="newest">Newest Date</option>
                    <option value="oldest">Oldest Date</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Invoices List / Cards */}
            <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-slate-50/50">
              {filteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold">No invoices match your current filter</p>
                </div>
              ) : (
                filteredInvoices.map(inv => {
                  const phone = getPhoneForInvoice(inv);
                  const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
                  const remaining = Math.max(0, inv.total - paid);
                  const percent = inv.total > 0 ? Math.min(100, (paid / inv.total) * 100) : 0;
                  const isPaid = remaining <= 0;
                  const isPartial = paid > 0 && remaining > 0;
                  const isUnpaid = paid <= 0;

                  return (
                    <div
                      key={inv.id}
                      className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      {/* Left: Invoice & Customer Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            #{inv.id}
                          </span>
                          <span className="text-xs text-slate-400">({inv.date})</span>

                          {/* Status Badge */}
                          {isPaid && (
                            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={11} /> Fully Paid
                            </span>
                          )}
                          {isPartial && (
                            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                              <Clock size={11} /> Partial ({percent.toFixed(0)}%)
                            </span>
                          )}
                          {isUnpaid && (
                            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertCircle size={11} /> Unpaid
                            </span>
                          )}
                        </div>

                        {/* Customer Name & Phone */}
                        <div className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                          <span className="truncate">{inv.customerName}</span>
                          {inv.customerCity && (
                            <span className="text-slate-400 font-normal text-xs">({inv.customerCity})</span>
                          )}
                          {phone && (
                            <span className="text-slate-500 font-normal text-xs flex items-center gap-0.5">
                              📞 {phone}
                            </span>
                          )}
                        </div>

                        {/* Mini Payment Progress */}
                        <div className="mt-2 flex items-center gap-2 max-w-full sm:max-w-xs">
                          <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full ${
                                isPaid ? 'bg-emerald-500' : isPartial ? 'bg-orange-500' : 'bg-rose-400'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium whitespace-nowrap">
                            Paid: {formatINR(paid)} / {formatINR(inv.total)}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Balances on mobile */}
                      <div className="flex items-center justify-between md:justify-end gap-4 p-2.5 bg-slate-50 md:bg-transparent rounded-xl md:p-0">
                        <div className="text-left md:text-right">
                          <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Total Billed</div>
                          <div className="text-xs sm:text-sm font-bold text-slate-800">{formatINR(inv.total)}</div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Balance Due</div>
                          <div className={`text-sm sm:text-base font-black ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {formatINR(remaining)}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions on mobile */}
                      <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
                        {/* Record Payment Button */}
                        <button
                          onClick={() => onManagePayments(inv)}
                          className="flex-1 md:flex-initial px-3 py-2 md:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          title="Record Payment for this Invoice"
                        >
                          <PlusCircle size={13} />
                          <span>{inv.payments && inv.payments.length > 0 ? 'Manage Payments' : 'Add Payment'}</span>
                        </button>

                        {/* WhatsApp Reminder Button */}
                        {remaining > 0 && phone && (
                          <button
                            onClick={() => handleSendWhatsAppReminder(inv)}
                            className="flex-1 md:flex-initial px-3 py-2 md:py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                            title="Send Payment Reminder on WhatsApp"
                          >
                            <MessageSquare size={13} />
                            <span>WhatsApp</span>
                          </button>
                        )}

                        {/* View Invoice */}
                        {onViewInvoice && (
                          <button
                            onClick={() => onViewInvoice(inv)}
                            className="p-2 md:p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="View Invoice"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Payment History Ledger */}
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search ledger..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Mode Filter */}
                <select
                  value={modeFilter}
                  onChange={e => setModeFilter(e.target.value)}
                  className="bg-white px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">All Modes</option>
                  {PAYMENT_MODES.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 sm:py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
              >
                <FileSpreadsheet size={14} />
                <span>Export Ledger CSV</span>
              </button>
            </div>

            {/* Mobile View: Cards */}
            <div className="block sm:hidden p-3 space-y-2.5 bg-slate-50/50">
              {filteredTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  No payment transactions recorded yet
                </div>
              ) : (
                filteredTransactions.map((item, idx) => {
                  const cfg = MODE_CONFIG[item.payment.mode] || MODE_CONFIG.Other;
                  return (
                    <div key={item.payment.id || idx} className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">📅 {item.payment.date}</span>
                        <span className="font-black text-emerald-700 text-sm">{formatINR(item.payment.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-850">
                          <span className="text-indigo-600 mr-1.5">#{item.invoiceId}</span>
                          {item.customerName}
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.2 rounded-full border ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon}
                          {item.payment.mode}
                        </span>
                      </div>
                      {item.payment.note && (
                        <div className="text-[11px] text-slate-400 italic">Note: {item.payment.note}</div>
                      )}
                      {onDeletePayment && (
                        <div className="pt-1 flex justify-end">
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete payment of ${formatINR(item.payment.amount)} for invoice #${item.invoiceId}?`)) {
                                onDeletePayment(item.invoiceId, item.payment.id);
                              }
                            }}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Tablet & Desktop View: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th className="p-3 sm:p-4">Payment Date</th>
                    <th className="p-3 sm:p-4">Invoice #</th>
                    <th className="p-3 sm:p-4">Customer</th>
                    <th className="p-3 sm:p-4 text-center">Payment Mode</th>
                    <th className="p-3 sm:p-4">Note / Ref</th>
                    <th className="p-3 sm:p-4 text-right">Amount Collected</th>
                    {onDeletePayment && <th className="p-3 sm:p-4 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No payment transactions recorded yet
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((item, idx) => {
                      const cfg = MODE_CONFIG[item.payment.mode] || MODE_CONFIG.Other;
                      return (
                        <tr key={item.payment.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 sm:p-4 font-semibold text-slate-800 whitespace-nowrap">
                            📅 {item.payment.date}
                          </td>
                          <td className="p-3 sm:p-4 font-bold text-indigo-600 whitespace-nowrap">
                            #{item.invoiceId}
                          </td>
                          <td className="p-3 sm:p-4">
                            <div className="font-semibold text-slate-800">{item.customerName}</div>
                            {item.customerMobile && (
                              <div className="text-[11px] text-slate-400">📞 {item.customerMobile}</div>
                            )}
                          </td>
                          <td className="p-3 sm:p-4 text-center">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon}
                              {item.payment.mode}
                            </span>
                          </td>
                          <td className="p-3 sm:p-4 text-slate-500 text-xs max-w-xs truncate">
                            {item.payment.note || '-'}
                          </td>
                          <td className="p-3 sm:p-4 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                            {formatINR(item.payment.amount)}
                          </td>
                          {onDeletePayment && (
                            <td className="p-3 sm:p-4 text-center">
                              <button
                                onClick={() => {
                                  if (window.confirm(`Delete payment of ${formatINR(item.payment.amount)} for invoice #${item.invoiceId}?`)) {
                                    onDeletePayment(item.invoiceId, item.payment.id);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                title="Delete payment"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Customer Outstanding Summary */}
        {activeTab === 'customers' && (
          <div className="space-y-3 sm:space-y-4">
            {/* Header & Stats Banner */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-xs">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">Customer Receivables Ledger</h3>
                  <p className="text-xs text-slate-500">Cumulative outstanding balance owed per customer</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full">
                  ⚠️ {customerBalances.length} customers with pending dues
                </span>
              </div>
            </div>

            {/* List of distinct Customer Cards */}
            {customerBalances.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-80" />
                <h4 className="text-base font-bold text-slate-800">All customer dues are fully cleared!</h4>
                <p className="text-xs text-slate-400 mt-1">No outstanding receivables recorded across all customers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerBalances.map((cust, idx) => {
                  const paidPct = cust.totalBilled > 0 ? Math.min(100, (cust.totalPaid / cust.totalBilled) * 100) : 0;
                  return (
                    <div
                      key={idx}
                      className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                    >
                      {/* Left: Avatar + Customer Details + Badges */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* Avatar Initial */}
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-base sm:text-lg flex items-center justify-center shadow-xs shrink-0 uppercase">
                          {cust.customerName.charAt(0) || 'C'}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Name + City + Phone */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                              {cust.customerName}
                            </span>
                            {cust.customerCity && (
                              <span className="bg-slate-100 text-slate-600 font-semibold px-2.5 py-0.5 rounded-full text-xs border border-slate-200">
                                📍 {cust.customerCity}
                              </span>
                            )}
                            {cust.customerMobile && (
                              <span className="text-slate-500 font-medium text-xs flex items-center gap-1 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200">
                                📞 {cust.customerMobile}
                              </span>
                            )}
                          </div>

                          {/* Structured Pill Badges */}
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80">
                              📊 {cust.invoiceCount} unpaid {cust.invoiceCount === 1 ? 'bill' : 'bills'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                              💰 Billed: <strong className="text-slate-900">{formatINR(cust.totalBilled)}</strong>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                              🟢 Paid: <strong className="text-emerald-700">{formatINR(cust.totalPaid)}</strong> ({paidPct.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Pending Balance Highlight Box + WhatsApp Button */}
                      <div className="flex flex-col sm:flex-row md:flex-row items-stretch sm:items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                        {/* Pending Balance Box */}
                        <div className="bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-200/80 px-4 py-2 rounded-xl text-left sm:text-right min-w-[150px] shadow-2xs">
                          <div className="text-[10px] uppercase font-extrabold text-rose-500 tracking-wider">
                            Pending Balance
                          </div>
                          <div className="text-lg sm:text-xl font-black text-rose-600">
                            {formatINR(cust.totalPending)}
                          </div>
                        </div>

                        {/* WhatsApp Action Button */}
                        {cust.customerMobile && (
                          <button
                            onClick={() => handleSendCustomerBalanceReminder(cust)}
                            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                            title="Send Total Balance WhatsApp Reminder"
                          >
                            <MessageSquare size={14} />
                            <span>WhatsApp</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* View Invoice Preview Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-4xl h-full sm:h-auto max-h-none sm:max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex justify-between items-center bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  #
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">Invoice #{viewingInvoice.id}</h3>
                  <p className="text-xs text-slate-400">{viewingInvoice.customerName} • {viewingInvoice.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setViewingInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 sm:p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[210mm] bg-white shadow-md rounded-lg overflow-x-auto">
                <InvoiceTemplate
                  id="printable-payment-invoice"
                  billNo={String(viewingInvoice.id)}
                  date={viewingInvoice.date}
                  customerName={viewingInvoice.customerName}
                  customerCity={viewingInvoice.customerCity}
                  customerMobile={getPhoneForInvoice(viewingInvoice)}
                  items={viewingInvoice.items}
                  settings={settings}
                  subtotal={viewingInvoice.subtotal}
                  gstAmount={viewingInvoice.gstAmount}
                  gstRate={viewingInvoice.gstRate}
                  payments={viewingInvoice.payments}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
