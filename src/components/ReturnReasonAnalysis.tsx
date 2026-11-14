import React, { useState } from 'react';
import {
  PieChart as PieIcon,
  BarChart2,
  AlertTriangle,
  Info,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts';
import { ReasonSummary, ChequeRecord } from '../types';
import { formatLKR, formatCompactLKR, calculatePareto } from '../services/analytics';

interface ReturnReasonAnalysisProps {
  reasons: ReasonSummary[];
  allRecords: ChequeRecord[];
  onSelectCheque: (record: ChequeRecord) => void;
  onFilterByReason: (reason: string) => void;
}

export const ReturnReasonAnalysis: React.FC<ReturnReasonAnalysisProps> = ({
  reasons,
  allRecords,
  onSelectCheque,
  onFilterByReason,
}) => {
  const [selectedReason, setSelectedReason] = useState<ReasonSummary | null>(null);

  const paretoReasons = calculatePareto(reasons, (r) => r.totalValue);

  const selectedCheques = selectedReason
    ? allRecords.filter((r) => r.normalizedReason === selectedReason.normalizedReason)
    : [];

  const COLORS = ['#CC0000', '#1E293B', '#475569', '#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0'];

  return (
    <div className="space-y-6">
      {/* Top Reason Chart & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Return Value Distribution by Normalized Reason
            </h3>
            <p className="text-xs text-slate-500">
              Bar represents total returned value in LKR; click bar to inspect underlying records.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={paretoReasons}
                margin={{ top: 10, right: 20, left: 20, bottom: 40 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload[0]) {
                    const r = e.activePayload[0].payload as ReasonSummary;
                    setSelectedReason(r);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="normalizedReason"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(val) => formatCompactLKR(val)}
                />
                <Tooltip
                  formatter={(val: any) => [formatLKR(Number(val)), 'Returned Value']}
                  labelStyle={{ fontWeight: 'bold', fontSize: 12 }}
                />
                <Bar dataKey="totalValue" radius={[4, 4, 0, 0]}>
                  {paretoReasons.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Root Cause Key Takeaway */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100/60 px-2 py-0.5 rounded">
              Root Cause Intelligence
            </span>
            <h4 className="text-base font-bold text-slate-900 mt-2">
              Dominant Return Failure Modes
            </h4>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Standardized grouping normalizes variations like "RD", "Refer to Drawer", and
              "Insufficient funds" while strictly preserving the original bank slip wording.
            </p>

            {reasons.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Top Cause:</span>
                  <strong className="text-slate-900">{reasons[0].normalizedReason}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Primary Cause Value:</span>
                  <span className="font-mono font-bold text-slate-900">{formatLKR(reasons[0].totalValue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Share of Total Returns:</span>
                  <span className="font-semibold text-red-600">
                    {reasons[0].shareOfTotalValue.toFixed(1)}% of all value
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Affected Customers:</span>
                  <span className="font-semibold text-slate-800">{reasons[0].customerCount}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (reasons[0]) onFilterByReason(reasons[0].normalizedReason);
            }}
            className="mt-4 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors text-center"
          >
            Filter Register by Primary Reason
          </button>
        </div>
      </div>

      {/* Detailed Reason Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
            Normalized Return Reason Matrix & Pareto Analysis
          </h4>
          <span className="text-xs text-slate-500 font-mono">
            {reasons.length} categories identified
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Normalized Reason</th>
                <th className="py-2.5 px-2 text-right">Count</th>
                <th className="py-2.5 px-2 text-right">Total Value (LKR)</th>
                <th className="py-2.5 px-2 text-right">Average (LKR)</th>
                <th className="py-2.5 px-2 text-right">Share of Value</th>
                <th className="py-2.5 px-2 text-right">Pareto %</th>
                <th className="py-2.5 px-2 text-center">Customers</th>
                <th className="py-2.5 px-2 text-center">Repeat Occurrence</th>
                <th className="py-2.5 px-3 text-center">Drill-down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paretoReasons.map((res) => (
                <tr
                  key={res.normalizedReason}
                  onClick={() => setSelectedReason(res)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors">
                      {res.normalizedReason}
                    </div>
                    {res.originalVariations.length > 1 && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[240px]">
                        Variants: {res.originalVariations.join(', ')}
                      </div>
                    )}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                    {res.count}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatLKR(res.totalValue)}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                    {formatLKR(res.averageAmount)}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-slate-800">
                    {res.shareOfTotalValue.toFixed(1)}%
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-500">
                    {res.cumulativePct}%
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-700">
                    {res.customerCount}
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">
                    {res.repeatCustomerOccurrenceCount > 0 ? (
                      <span className="text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-[10px]">
                        {res.repeatCustomerOccurrenceCount} CX
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">0</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReason(res);
                      }}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                    >
                      <span>Drill-down</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-Down Cheques for Reason */}
      {selectedReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedReason.normalizedReason}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedReason.count} cheque records totaling {formatLKR(selectedReason.totalValue)}
                </div>
              </div>
              <button
                onClick={() => setSelectedReason(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Customer</th>
                      <th className="py-2 px-2.5">Cheque Ref</th>
                      <th className="py-2 px-2.5 text-right">Amount (LKR)</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">Unrecovered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCheques.map((chq) => (
                      <tr
                        key={chq.id}
                        onClick={() => {
                          setSelectedReason(null);
                          onSelectCheque(chq);
                        }}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                          {chq.datePosted}
                        </td>
                        <td className="py-2 px-2.5 font-semibold text-slate-900">
                          {chq.cxName} ({chq.cxNumber})
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-700">
                          {chq.description}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatLKR(chq.amount)}
                        </td>
                        <td className="py-2 px-2.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
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

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  onFilterByReason(selectedReason.normalizedReason);
                  setSelectedReason(null);
                }}
                className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <span>Filter Entire Register by {selectedReason.normalizedReason}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => setSelectedReason(null)}
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
