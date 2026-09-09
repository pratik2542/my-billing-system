import React, { useState } from 'react';
import { Invoice, InvoiceAuditEntry, InvoiceAuditAction } from '../types';
import { 
  History, 
  X, 
  FilePlus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  CreditCard, 
  MinusCircle, 
  User, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  AlertTriangle,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { formatBillNum } from './InvoiceTemplate';

interface InvoiceAuditTrailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onRestore?: (invoiceId: string) => void;
  onPermanentDelete?: (invoiceId: string) => void;
  isMainAdmin?: boolean;
}

const getActionConfig = (action: InvoiceAuditAction) => {
  switch (action) {
    case 'created':
      return {
        label: 'Bill Created',
        badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
        iconBg: 'bg-blue-600 text-white',
        icon: FilePlus,
      };
    case 'edited':
      return {
        label: 'Bill Edited',
        badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
        iconBg: 'bg-amber-600 text-white',
        icon: Edit3,
      };
    case 'deleted':
      return {
        label: 'Moved to Trash',
        badgeBg: 'bg-red-100 text-red-800 border-red-200',
        iconBg: 'bg-red-600 text-white',
        icon: Trash2,
      };
    case 'restored':
      return {
        label: 'Bill Restored',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        iconBg: 'bg-emerald-600 text-white',
        icon: RotateCcw,
      };
    case 'payment_added':
      return {
        label: 'Payment Recorded',
        badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
        iconBg: 'bg-purple-600 text-white',
        icon: CreditCard,
      };
    case 'payment_deleted':
      return {
        label: 'Payment Removed',
        badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
        iconBg: 'bg-rose-600 text-white',
        icon: MinusCircle,
      };
    default:
      return {
        label: 'Activity',
        badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
        iconBg: 'bg-slate-600 text-white',
        icon: Clock,
      };
  }
};

const formatTimestamp = (ts: number | undefined): { dateStr: string; timeStr: string; relative: string } => {
  if (!ts) return { dateStr: 'N/A', timeStr: '', relative: '' };
  const d = new Date(ts);
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);

  let relative = '';
  if (diffSec < 60) relative = 'Just now';
  else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) relative = `${Math.floor(diffSec / 3600)}h ago`;
  else if (diffSec < 86400 * 7) relative = `${Math.floor(diffSec / 86400)}d ago`;
  else relative = d.toLocaleDateString('en-GB');

  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  return { dateStr, timeStr, relative };
};

export const InvoiceAuditTrailModal: React.FC<InvoiceAuditTrailModalProps> = ({
  invoice,
  onClose,
  onRestore,
  onPermanentDelete,
  isMainAdmin = false
}) => {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Ensure there is at least one fallback entry for legacy invoices with no audit trail
  const entries: InvoiceAuditEntry[] = React.useMemo(() => {
    if (invoice.auditTrail && invoice.auditTrail.length > 0) {
      // Sort newest first
      return [...invoice.auditTrail].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    // Build fallback creation entry
    const initialCreated: InvoiceAuditEntry = {
      id: `initial-${invoice.id}`,
      action: 'created',
      timestamp: invoice.createdAt || (invoice.date ? parseDateToTs(invoice.date) : Date.now()),
      userName: invoice.createdByName || invoice.billedBy || 'System / Admin',
      userEmail: invoice.createdByEmail,
      summary: `Bill #${invoice.id} recorded with ${invoice.items?.length || 0} items (Total: ₹${formatBillNum(invoice.total)})`,
      snapshot: {
        total: invoice.total,
        itemsCount: invoice.items?.length || 0,
        customerName: invoice.customerName,
        customerCity: invoice.customerCity,
        date: invoice.date
      }
    };

    return [initialCreated];
  }, [invoice]);

  function parseDateToTs(dStr: string): number {
    try {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d).getTime();
      }
    } catch {}
    return Date.now();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-400/30">
              <History size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">Audit Trail & Revision History</h3>
                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full font-semibold border border-indigo-400/30">
                  Bill #{invoice.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>Customer: <strong className="text-slate-200 font-medium">{invoice.customerName}</strong></span>
                <span>•</span>
                <span>Total: <strong className="text-emerald-400 font-semibold">₹{formatBillNum(invoice.total)}</strong></span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
            title="Close Audit Trail"
          >
            <X size={20} />
          </button>
        </div>

        {/* Trashed Status Banner if applicable */}
        {invoice.isDeleted && (
          <div className="bg-rose-50 border-b border-rose-200 p-3 sm:px-5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="text-rose-600 shrink-0" size={18} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-rose-900">This invoice is currently in Trash</p>
                <p className="text-[11px] text-rose-700 truncate">
                  Deleted by {invoice.deletedByName || 'User'} on {formatTimestamp(invoice.deletedAt).dateStr} ({formatTimestamp(invoice.deletedAt).timeStr})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onRestore && (
                <button
                  onClick={() => {
                    onRestore(invoice.id);
                    onClose();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Restore Bill</span>
                </button>
              )}
              {isMainAdmin && onPermanentDelete && (
                <button
                  onClick={() => {
                    onPermanentDelete(invoice.id);
                    onClose();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  title="Permanently Delete Bill from Database (Main Admin Only)"
                >
                  <Trash2 size={13} />
                  <span>Delete Permanently</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <ShieldCheck size={14} className="text-indigo-600" />
              <span>Immutable activity logs ({entries.length} events)</span>
            </span>
            <span>Newest first</span>
          </div>

          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
            {entries.map((entry, idx) => {
              const cfg = getActionConfig(entry.action);
              const Icon = cfg.icon;
              const { dateStr, timeStr, relative } = formatTimestamp(entry.timestamp);
              const isExpanded = !!expandedEntries[entry.id];
              const hasDetails = (entry.changes && entry.changes.length > 0) || entry.details || entry.snapshot;

              return (
                <div key={entry.id || idx} className="relative group">
                  {/* Timeline icon node */}
                  <div className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 sm:w-8 sm:h-8 rounded-full ${cfg.iconBg} flex items-center justify-center shadow-md ring-4 ring-white z-10`}>
                    <Icon size={14} className="sm:w-4 sm:h-4" />
                  </div>

                  {/* Card Container */}
                  <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs hover:border-indigo-200 hover:shadow-sm transition-all">
                    {/* Top Row: Action Badge + Timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${cfg.badgeBg}`}>
                          {cfg.label}
                        </span>
                        {entry.userRole && (
                          <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-medium">
                            {entry.userRole}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 ml-auto">
                        <Clock size={12} className="text-slate-400" />
                        <span title={`${dateStr} ${timeStr}`}>{dateStr} {timeStr}</span>
                        {relative && (
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                            {relative}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary */}
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                      {entry.summary}
                    </p>

                    {/* Actor User Info */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {(entry.userName || 'U')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-700 truncate">
                          {entry.userName || 'Unknown User'}
                        </span>
                        {entry.userEmail && (
                          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                            ({entry.userEmail})
                          </span>
                        )}
                      </div>

                      {hasDetails && (
                        <button
                          onClick={() => toggleExpand(entry.id)}
                          className="text-indigo-600 hover:text-indigo-700 font-bold text-[11px] flex items-center gap-0.5 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors ml-2"
                        >
                          <span>{isExpanded ? 'Hide changes' : 'View details'}</span>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>

                    {/* Expandable Diffs & Snapshot Details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-3 bg-slate-50/70 -mx-3.5 -mb-3.5 sm:-mx-4 sm:-mb-4 p-3.5 sm:p-4 rounded-b-xl animate-fadeIn">
                        {/* Field Changes Table */}
                        {entry.changes && entry.changes.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                              Modified Fields ({entry.changes.length})
                            </p>
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
                              {entry.changes.map((ch, cIdx) => (
                                <div key={cIdx} className="p-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                                  <span className="font-semibold text-slate-700 w-28 shrink-0">
                                    {ch.label || ch.field}:
                                  </span>
                                  <div className="flex-1 flex items-center gap-2 flex-wrap text-slate-600">
                                    <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded text-[11px] line-through font-mono">
                                      {typeof ch.oldValue === 'object' ? JSON.stringify(ch.oldValue) : String(ch.oldValue ?? 'None')}
                                    </span>
                                    <ArrowRight size={13} className="text-slate-400 shrink-0" />
                                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded text-[11px] font-mono font-bold">
                                      {typeof ch.newValue === 'object' ? JSON.stringify(ch.newValue) : String(ch.newValue ?? 'None')}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Additional notes/details */}
                        {entry.details && (
                          <div className="text-xs bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700">
                            <p className="font-semibold text-slate-800 mb-0.5">Notes:</p>
                            <p className="text-slate-600 whitespace-pre-wrap">{entry.details}</p>
                          </div>
                        )}

                        {/* Snapshot at this revision */}
                        {entry.snapshot && (
                          <div className="bg-indigo-50/50 border border-indigo-100/70 p-2.5 rounded-lg text-xs">
                            <div className="flex items-center gap-1.5 text-indigo-900 font-bold mb-1">
                              <Sparkles size={13} className="text-indigo-600" />
                              <span>Snapshot at this version:</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-700">
                              <div>
                                <span className="text-slate-400 block">Customer</span>
                                <span className="font-semibold truncate block">{entry.snapshot.customerName}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Date</span>
                                <span className="font-semibold block">{entry.snapshot.date}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Items</span>
                                <span className="font-semibold block">{entry.snapshot.itemsCount} items</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Total</span>
                                <span className="font-bold text-emerald-700 block">₹{formatBillNum(entry.snapshot.total)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <User size={13} className="text-slate-400" />
            <span>Multi-User Audit Protection Enabled</span>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
