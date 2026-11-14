import React, { useState } from 'react';
import {
  Search,
  Users,
  AlertTriangle,
  TrendingUp,
  FileText,
  Calendar,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
  ChevronRight,
  X,
  Filter,
} from 'lucide-react';
import { CustomerSummary, ChequeRecord } from '../types';
import { formatLKR, formatCompactLKR } from '../services/analytics';

interface CustomerIntelligenceProps {
  customers: CustomerSummary[];
  allRecords: ChequeRecord[];
  onSelectCheque: (record: ChequeRecord) => void;
  onFilterByCustomer: (cxNumber: string) => void;
}

export const CustomerIntelligence: React.FC<CustomerIntelligenceProps> = ({
  customers,
  allRecords,
  onSelectCheque,
  onFilterByCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [onlyRepeat, setOnlyRepeat] = useState(false);
  const [onlyDeteriorating, setOnlyDeteriorating] = useState(false);

  const filtered = customers.filter((c) => {
    if (onlyRepeat && !c.isRepeatCustomer) return false;
    if (onlyDeteriorating && !c.isDeteriorating) return false;
    if (search) {
      const q = search.toLowerCase().trim();
      return (
        (c.cxNumber || '').toLowerCase().includes(q) ||
        (c.cxName || '').toLowerCase().includes(q) ||
        (c.alternateNames || []).some((n) => (n || '').toLowerCase().includes(q)) ||
        (c.mostFrequentReason || '').toLowerCase().includes(q) ||
        (c.customerPhone || '').toLowerCase().includes(q) ||
        (c.admNumber || '').toLowerCase().includes(q) ||
        (c.salesRepName || '').toLowerCase().includes(q) ||
        (c.teamName || '').toLowerCase().includes(q) ||
        (c.division || '').toLowerCase().includes(q) ||
        (c.divisionHead || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedCustomerCheques = selectedCustomer
    ? allRecords.filter((r) => r.cxNumber === selectedCustomer.cxNumber)
    : [];

  return (
    <div className="space-y-4">
      {/* Search and Filter Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, CX number, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setOnlyRepeat(!onlyRepeat)}
            className={`px-3 py-1.5 rounded-md border font-medium transition-colors ${
              onlyRepeat
                ? 'bg-red-50 text-red-700 border-red-300 font-semibold'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Repeat Customers Only ({customers.filter((c) => c.isRepeatCustomer).length})
          </button>

          <button
            onClick={() => setOnlyDeteriorating(!onlyDeteriorating)}
            className={`px-3 py-1.5 rounded-md border font-medium transition-colors ${
              onlyDeteriorating
                ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Deteriorating Patterns ({customers.filter((c) => c.isDeteriorating).length})
          </button>
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Customer Account & Phone</th>
                <th className="py-2.5 px-2">ADM# / Sales Rep</th>
                <th className="py-2.5 px-2">Team / Division / Head</th>
                <th className="py-2.5 px-2 text-center">Repeat Status</th>
                <th className="py-2.5 px-2 text-right">Returns</th>
                <th className="py-2.5 px-2 text-right">Total Value (LKR)</th>
                <th className="py-2.5 px-2 text-right">Unrecovered</th>
                <th className="py-2.5 px-2 text-center">Unresolved</th>
                <th className="py-2.5 px-3">Frequent Reason</th>
                <th className="py-2.5 px-3 text-center">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr
                  key={c.cxNumber}
                  onClick={() => setSelectedCustomer(c)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors">
                      {c.cxName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex flex-wrap items-center gap-1.5">
                      <span>{c.cxNumber}</span>
                      {c.customerPhone && <span className="text-slate-500">· {c.customerPhone}</span>}
                      {c.hasInconsistentName && (
                        <span className="text-amber-600 font-medium" title={c.alternateNames.join(', ')}>
                          · Name Inconsistency
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-2">
                    <div className="font-medium text-slate-800">{c.salesRepName || 'Unassigned'}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {c.admNumber || '—'}
                      {c.nameMismatchWarning && (
                        <span className="text-amber-700 font-sans ml-1" title={c.nameMismatchWarning}>
                          (Review)
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-2">
                    <div className="font-medium text-slate-800">{c.teamName || '—'}</div>
                    <div className="text-[10px] text-slate-500">
                      {c.division || 'Unmapped'} {c.divisionHead ? `· ${c.divisionHead}` : ''}
                    </div>
                  </td>

                  <td className="py-2.5 px-2 text-center">
                    {c.isRepeatCustomer ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        REPEAT ({c.totalReturns})
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Single</span>
                    )}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                    {c.totalReturns}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatLKR(c.totalValue)}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-red-600">
                    {c.unrecoveredExposure > 0 ? formatLKR(c.unrecoveredExposure) : '—'}
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        c.unresolvedCount > 0 ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {c.unresolvedCount}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-slate-700">
                    <div className="truncate max-w-[180px]">{c.mostFrequentReason}</div>
                    <div className="text-[10px] text-slate-400">
                      Active across {c.distinctMonthsCount} months
                    </div>
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomer(c);
                      }}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                    >
                      <span>Drill-down</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs">
                    No customers match the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer 360 Drill-Down Modal (Section 6A & Section 7) */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedCustomer.cxName}</h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                    {selectedCustomer.cxNumber}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    Responsible ADM: <strong className="text-slate-700">{selectedCustomer.admNumber || '—'} ({selectedCustomer.salesRepName || 'Unassigned'})</strong>
                  </span>
                  <span>
                    Phone: <strong className="text-slate-700 font-mono">{selectedCustomer.customerPhone || '—'}</strong>
                  </span>
                  <span>
                    Team: <strong className="text-slate-700">{selectedCustomer.teamName || '—'}</strong>
                  </span>
                  <span>
                    Division: <strong className="text-slate-700">{selectedCustomer.division || '—'}</strong>
                  </span>
                  <span>
                    Division Head: <strong className="text-slate-700">{selectedCustomer.divisionHead || '—'}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedCustomer.nameMismatchWarning && (
              <div className="mx-6 mt-4 p-2.5 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{selectedCustomer.nameMismatchWarning}</span>
              </div>
            )}

            {/* Inconsistency Warning if present */}
            {selectedCustomer.hasInconsistentName && (
              <div className="mx-6 mt-4 p-2.5 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Multiple customer names recorded for this CX number:{' '}
                  <strong>{selectedCustomer.alternateNames.join(' | ')}</strong>. Do not merge
                  customer records without supervisory verification.
                </span>
              </div>
            )}

            {/* Metrics Overview Strip */}
            <div className="grid grid-cols-4 gap-3 p-6 pb-2 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500 text-[10px] uppercase font-medium">Total Returned</div>
                <div className="text-base font-bold text-slate-900 mt-1 font-mono">
                  {formatLKR(selectedCustomer.totalValue)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {selectedCustomer.totalReturns} cheque records
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded border border-red-200">
                <div className="text-red-700 text-[10px] uppercase font-medium">Unrecovered Exposure</div>
                <div className="text-base font-bold text-red-700 mt-1 font-mono">
                  {formatLKR(selectedCustomer.unrecoveredExposure)}
                </div>
                <div className="text-[10px] text-red-600 mt-0.5">
                  {selectedCustomer.unresolvedCount} unresolved cases
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                <div className="text-emerald-700 text-[10px] uppercase font-medium">Recovered Value</div>
                <div className="text-base font-bold text-emerald-700 mt-1 font-mono">
                  {formatLKR(selectedCustomer.verifiedRecoveredAmount)}
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Verified settlements</div>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-500 text-[10px] uppercase font-medium">Primary Reason</div>
                <div className="text-xs font-bold text-slate-800 mt-1 truncate">
                  {selectedCustomer.mostFrequentReason}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Most recent: {selectedCustomer.mostRecentReason}
                </div>
              </div>
            </div>

            {/* Cheque List Table */}
            <div className="flex-1 overflow-y-auto px-6 py-2">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Returned Cheques History ({selectedCustomerCheques.length})
              </div>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Cheque Ref</th>
                      <th className="py-2 px-2.5 text-right">Amount (LKR)</th>
                      <th className="py-2 px-2.5">Return Reason</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">Unrecovered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCustomerCheques.map((chq) => (
                      <tr
                        key={chq.id}
                        onClick={() => {
                          setSelectedCustomer(null);
                          onSelectCheque(chq);
                        }}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                          {chq.datePosted}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-800 font-medium">
                          {chq.description}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatLKR(chq.amount)}
                        </td>
                        <td className="py-2 px-2.5 text-slate-700 truncate max-w-[160px]">
                          {chq.normalizedReason}
                        </td>
                        <td className="py-2 px-2.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {chq.recoveryStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-red-600">
                          {chq.remainingAmount > 0 ? formatLKR(chq.remainingAmount) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  onFilterByCustomer(selectedCustomer.cxNumber);
                  setSelectedCustomer(null);
                }}
                className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <span>Filter Entire Platform by {selectedCustomer.cxNumber}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
