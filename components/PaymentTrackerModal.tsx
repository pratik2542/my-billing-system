import React, { useState } from 'react';
import { Invoice, PaymentEntry, PaymentMode } from '../types';
import { X, PlusCircle, Trash2, IndianRupee, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface PaymentTrackerModalProps {
  invoice: Invoice;
  onClose: () => void;
  onAddPayment: (invoiceId: string, payment: PaymentEntry) => Promise<void>;
  onDeletePayment: (invoiceId: string, paymentId: string) => Promise<void>;
}

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Other'];

const MODE_COLORS: Record<PaymentMode, string> = {
  Cash: 'bg-green-100 text-green-700',
  UPI: 'bg-violet-100 text-violet-700',
  Cheque: 'bg-blue-100 text-blue-700',
  'Bank Transfer': 'bg-sky-100 text-sky-700',
  Other: 'bg-slate-100 text-slate-600',
};

const getTodayStr = (): string => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

const htmlDateToDisplay = (html: string): string => {
  if (!html) return '';
  const [y, m, d] = html.split('-');
  return `${d}/${m}/${y}`;
};

export const PaymentTrackerModal: React.FC<PaymentTrackerModalProps> = ({
  invoice,
  onClose,
  onAddPayment,
  onDeletePayment,
}) => {
  const payments = invoice.payments || [];
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.total - totalPaid;
  const paidPercent = invoice.total > 0 ? Math.min((totalPaid / invoice.total) * 100, 100) : 0;

  const paymentStatus =
    totalPaid <= 0
      ? 'unpaid'
      : remaining <= 0
      ? 'paid'
      : 'partial';

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [date, setDate] = useState(getTodayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setFormError('Please enter a valid amount greater than 0.');
      return;
    }
    if (amt > remaining + 0.01) {
      setFormError(`Amount cannot exceed remaining balance of Rs.${remaining.toFixed(2)}.`);
      return;
    }
    setSaving(true);
    try {
      const entry: PaymentEntry = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        amount: amt,
        mode,
        date: htmlDateToDisplay(date),
        note: note.trim(),
      };
      await onAddPayment(invoice.id, entry);
    } catch (e: any) {
      console.error('Failed to save payment:', e);
      if (e?.code === 'permission-denied' || (e?.message && e.message.includes('permissions'))) {
        setFormError('Permission Error: Firebase Security Rules are blocking writes. Please publish the updated Security Rules in Firebase Console.');
      } else {
        setFormError(e?.message || 'Failed to save payment. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (paymentId: string) => {
    if (!window.confirm('Delete this payment entry?')) return;
    setDeletingId(paymentId);
    try {
      await onDeletePayment(invoice.id, paymentId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-0 md:p-4 backdrop-blur-sm">
      <div className="bg-white w-full md:max-w-xl h-full md:h-auto md:max-h-[90vh] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5 flex items-start justify-between shrink-0">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-indigo-200 mb-1">Payment Tracker</div>
            <h2 className="text-xl font-bold">Bill #{invoice.id}</h2>
            <p className="text-sm text-indigo-200 mt-0.5">{invoice.customerName} &mdash; {invoice.customerCity}</p>
          </div>
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors ml-4 mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 shrink-0">
          <div className="p-4 text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase mb-1">Total Bill</div>
            <div className="text-lg font-bold text-slate-800">Rs.{invoice.total.toLocaleString('en-IN')}</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase mb-1">Paid</div>
            <div className="text-lg font-bold text-green-600">Rs.{totalPaid.toLocaleString('en-IN')}</div>
          </div>
          <div className="p-4 text-center">
            <div className="text-xs text-slate-500 font-semibold uppercase mb-1">Remaining</div>
            <div className={`text-lg font-bold ${remaining > 0 ? 'text-red-600' : 'text-slate-400'}`}>
              Rs.{Math.max(remaining, 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Payment Progress</span>
            <PaymentStatusBadge status={paymentStatus} />
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                paymentStatus === 'paid'
                  ? 'bg-green-500'
                  : paymentStatus === 'partial'
                  ? 'bg-amber-400'
                  : 'bg-slate-300'
              }`}
              style={{ width: `${paidPercent}%` }}
            />
          </div>
          <div className="text-right text-xs text-slate-400 mt-1">{paidPercent.toFixed(1)}% paid</div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Add Payment Form */}
          {remaining > 0.01 && (
            <div className="mx-4 mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                <PlusCircle size={15} className="text-indigo-500" /> Record Payment
              </h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (Rs.)*</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">Rs.</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        max={remaining}
                        required
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode*</label>
                    <select
                      value={mode}
                      onChange={e => setMode(e.target.value as PaymentMode)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-white"
                    >
                      {PAYMENT_MODES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Date*</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Note (optional)</label>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="e.g. GPay, SBI"
                      maxLength={80}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>

                {formError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle size={12} /> {formError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 px-4 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <span className="animate-pulse">Saving...</span>
                    ) : (
                      <><PlusCircle size={15} /> Add Payment</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount(remaining.toFixed(2))}
                    className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    Full Rs.{Math.floor(remaining)}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Payment History */}
          <div className="px-4 pb-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <IndianRupee size={14} className="text-slate-400" />
              Payment History
              <span className="ml-auto text-xs text-slate-400 font-normal">{payments.length} record{payments.length !== 1 ? 's' : ''}</span>
            </h3>

            {payments.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No payments recorded yet</p>
                <p className="text-xs mt-1">Use the form above to record a payment</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...payments].reverse().map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${MODE_COLORS[p.mode]}`}>
                          {p.mode}
                        </span>
                        <span className="text-xs text-slate-400">{p.date}</span>
                        {p.note && (
                          <span className="text-xs text-slate-500 italic truncate max-w-[120px]">{p.note}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-800 text-sm">Rs.{p.amount.toLocaleString('en-IN')}</div>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 disabled:opacity-40"
                      title="Delete this payment"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {paymentStatus === 'paid' && (
          <div className="shrink-0 bg-green-50 border-t border-green-200 px-5 py-3 flex items-center gap-2 text-green-700 text-sm font-semibold">
            <CheckCircle2 size={18} className="text-green-500" />
            This bill is fully paid!
          </div>
        )}
      </div>
    </div>
  );
};

export const PaymentStatusBadge: React.FC<{ status: 'unpaid' | 'partial' | 'paid'; small?: boolean }> = ({
  status,
  small = false,
}) => {
  const configs = {
    unpaid: { label: 'Unpaid', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
    partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    paid: { label: 'Paid', cls: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
  };
  const c = configs[status];
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full font-bold ${c.cls} ${
        small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};
