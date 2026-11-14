import React, { useState, useMemo } from 'react';
import {
  Search,
  Building2,
  AlertTriangle,
  ExternalLink,
  X,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  DivisionHeadSummary,
  TeamSummary,
  AdmMasterRecord,
  CustomerMasterRecord,
  ChequeRecord,
  DateBasis,
} from '../types';
import {
  formatLKR,
  formatCompactLKR,
  calculateMonthlyTrends,
} from '../services/analytics';

interface DivisionHeadDashboardProps {
  divisionHeads: DivisionHeadSummary[];
  teams: TeamSummary[];
  admsMaster: AdmMasterRecord[];
  customersMaster: CustomerMasterRecord[];
  allRecords: ChequeRecord[];
  dateBasis: DateBasis;
  onFilterByDivisionHead: (divisionHeadId: string) => void;
  onFilterByDivision: (division: string) => void;
  onFilterByTeam: (teamId: string) => void;
}

export const DivisionHeadDashboard: React.FC<DivisionHeadDashboardProps> = ({
  divisionHeads,
  teams,
  admsMaster,
  customersMaster,
  allRecords,
  dateBasis,
  onFilterByDivisionHead,
  onFilterByDivision,
  onFilterByTeam,
}) => {
  const [search, setSearch] = useState('');
  const [selectedHead, setSelectedHead] = useState<DivisionHeadSummary | null>(null);

  const filtered = divisionHeads.filter((dh) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      dh.divisionHeadName.toLowerCase().includes(q) ||
      dh.divisions.some((d) => d.toLowerCase().includes(q))
    );
  });

  const totals = useMemo(() => {
    const totalHeads = filtered.length;
    const allDivs = new Set(filtered.flatMap((d) => d.divisions));
    const totalTeams = filtered.reduce((s, d) => s + d.teamCount, 0);
    const totalAdms = filtered.reduce((s, d) => s + d.admCount, 0);
    const totalCustomers = filtered.reduce((s, d) => s + d.masterCustomerCount, 0);
    const totalValue = filtered.reduce((s, d) => s + d.totalValue, 0);
    const totalUnrecovered = filtered.reduce((s, d) => s + d.unrecoveredExposure, 0);
    const totalRepeat = filtered.reduce((s, d) => s + d.repeatCustomersCount, 0);
    const totalRecovered = filtered.reduce((s, d) => s + d.verifiedRecoveredValue, 0);
    const recoveryRate = totalValue > 0 ? (totalRecovered / totalValue) * 100 : 0;
    return {
      totalHeads,
      divisionsCount: allDivs.size,
      totalTeams,
      totalAdms,
      totalCustomers,
      totalValue,
      totalUnrecovered,
      totalRepeat,
      totalRecovered,
      recoveryRate,
    };
  }, [filtered]);

  const scopedCheques = useMemo(() => {
    const ids = new Set(filtered.flatMap((h) => h.chequeIds));
    return allRecords.filter((r) => ids.has(r.id));
  }, [filtered, allRecords]);

  const recoveryTrends = useMemo(
    () => calculateMonthlyTrends(scopedCheques, dateBasis),
    [scopedCheques, dateBasis]
  );

  const selectedHeadTeams = useMemo(() => {
    if (!selectedHead) return [];
    return teams.filter((t) => t.divisionHeadId === selectedHead.divisionHeadId);
  }, [selectedHead, teams]);

  const selectedHeadAdms = useMemo(() => {
    if (!selectedHead) return [];
    return admsMaster.filter((a) => a.divisionHeadId === selectedHead.divisionHeadId);
  }, [selectedHead, admsMaster]);

  const selectedHeadCheques = useMemo(() => {
    if (!selectedHead) return [];
    const ids = new Set(selectedHead.chequeIds);
    return allRecords.filter((r) => ids.has(r.id));
  }, [selectedHead, allRecords]);

  const selectedHeadTrends = useMemo(
    () => calculateMonthlyTrends(selectedHeadCheques, dateBasis),
    [selectedHeadCheques, dateBasis]
  );

  return (
    <div className="space-y-5">
      {/* Consolidated KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Divisions & Teams</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {totals.divisionsCount} <span className="text-xs font-normal text-slate-500">Div</span> / {totals.totalTeams} <span className="text-xs font-normal text-slate-500">Teams</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {totals.totalHeads} Division Heads
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Total ADMs</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {totals.totalAdms}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Active sales force</div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Total Customers</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {totals.totalCustomers}
          </div>
          <div className="text-[10px] text-red-600 font-medium mt-0.5">
            {totals.totalRepeat} repeat-return accounts
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Returned-Cheque Value</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {formatCompactLKR(totals.totalValue)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {formatLKR(totals.totalValue)}
          </div>
        </div>

        <div className="p-3.5 bg-red-50/50 border border-red-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-red-800 uppercase">Unrecovered Exposure</span>
          <div className="text-xl font-bold text-red-700 font-mono mt-1 tabular-nums">
            {formatCompactLKR(totals.totalUnrecovered)}
          </div>
          <div className="text-[10px] text-red-600 mt-0.5">Remaining exposure</div>
        </div>

        <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-emerald-800 uppercase">Recovery Rate</span>
          <div className="text-xl font-bold text-emerald-700 font-mono mt-1 tabular-nums">
            {totals.recoveryRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5 font-mono">
            {formatCompactLKR(totals.totalRecovered)}
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Division Head or Division..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {filtered.length} division leadership portfolios
        </span>
      </div>

      {/* Consolidated Division Recovery Trends Chart */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
        <div className="mb-3">
          <h3 className="text-sm font-bold text-slate-900">
            Division Recovery & Returned-Cheque Exposure Trends
          </h3>
          <p className="text-xs text-slate-500">
            Aggregated monthly performance across all Divisions and Teams
          </p>
        </div>

        {recoveryTrends.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={recoveryTrends} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactLKR(v)} />
                <Tooltip formatter={(v: any, n: any) => [formatLKR(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" name="Returned Cheque Value (LKR)" fill="#CC0000" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recoveredValue" name="Verified Recovered (LKR)" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="unrecoveredExposure" name="Unrecovered Exposure" stroke="#0F172A" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400">
            No returned-cheque history available to plot division recovery trends.
          </div>
        )}
      </div>

      {/* Division Head Directory Cards / Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Division Head</th>
                <th className="py-2.5 px-2">Divisions</th>
                <th className="py-2.5 px-2 text-center">Teams</th>
                <th className="py-2.5 px-2 text-center">ADMs</th>
                <th className="py-2.5 px-2 text-center">Customers</th>
                <th className="py-2.5 px-2 text-center">Repeat Return Cx</th>
                <th className="py-2.5 px-2 text-right">Returned Value</th>
                <th className="py-2.5 px-2 text-right">Unrecovered</th>
                <th className="py-2.5 px-2 text-right">Recovery %</th>
                <th className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((dh) => (
                <tr
                  key={dh.divisionHeadId}
                  onClick={() => setSelectedHead(dh)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors">
                        {dh.divisionHeadName}
                      </span>
                      {dh.verificationStatus === 'NEEDS_VERIFICATION' && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300"
                          title={dh.verificationReason}
                        >
                          VERIFY
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{dh.divisionHeadId}</div>
                  </td>

                  <td className="py-2.5 px-2">
                    <div className="flex flex-wrap gap-1">
                      {dh.divisions.map((div) => (
                        <span
                          key={div}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold"
                        >
                          {div}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800">{dh.teamCount}</td>
                  <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800">{dh.admCount}</td>
                  <td className="py-2.5 px-2 text-center font-mono text-slate-700">
                    {dh.masterCustomerCount}
                    {dh.affectedCustomersCount > 0 && (
                      <span className="block text-[10px] text-slate-400">
                        ({dh.affectedCustomersCount} w/ returns)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono">
                    {dh.repeatCustomersCount > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                        {dh.repeatCustomersCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatLKR(dh.totalValue)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-red-600">
                    {dh.unrecoveredExposure > 0 ? formatLKR(dh.unrecoveredExposure) : '—'}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-emerald-700">
                    {dh.recoveryRateByValue.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHead(dh);
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
                    No Division Heads mapped yet. Import ADM Master data to populate the Division Head hierarchy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Division Head Drill-Down Modal */}
      {selectedHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedHead.divisionHeadName}</h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {selectedHead.divisions.join(', ')}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedHead.teamCount} Teams · {selectedHead.admCount} ADMs · {selectedHead.masterCustomerCount} Customers
                </div>
              </div>
              <button
                onClick={() => setSelectedHead(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedHead.verificationStatus === 'NEEDS_VERIFICATION' && selectedHead.verificationReason && (
              <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{selectedHead.verificationReason}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Returned Value</div>
                  <div className="text-base font-bold text-slate-900 font-mono mt-1">
                    {formatLKR(selectedHead.totalValue)}
                  </div>
                  <div className="text-[10px] text-slate-500">{selectedHead.totalReturns} cheques</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-[10px] text-red-700 uppercase font-semibold">Unrecovered Exposure</div>
                  <div className="text-base font-bold text-red-700 font-mono mt-1">
                    {formatLKR(selectedHead.unrecoveredExposure)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                  <div className="text-[10px] text-emerald-700 uppercase font-semibold">Recovery Rate</div>
                  <div className="text-base font-bold text-emerald-700 font-mono mt-1">
                    {selectedHead.recoveryRateByValue.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-emerald-600 font-mono">
                    {formatCompactLKR(selectedHead.verifiedRecoveredValue)}
                  </div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                  <div className="text-[10px] text-amber-800 uppercase font-semibold">Repeat Customers</div>
                  <div className="text-base font-bold text-amber-800 font-mono mt-1">
                    {selectedHead.repeatCustomersCount}
                  </div>
                  <div className="text-[10px] text-amber-700">of {selectedHead.affectedCustomersCount} affected</div>
                </div>
              </div>

              {/* Trend Chart */}
              {selectedHeadTrends.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                    Division Head Recovery Trend
                  </h4>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={selectedHeadTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="displayMonth" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactLKR(v)} />
                        <Tooltip formatter={(v: any, n: any) => [formatLKR(Number(v)), n]} />
                        <Bar dataKey="value" name="Returned Value" fill="#CC0000" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="recoveredValue" name="Recovered Value" fill="#16A34A" radius={[3, 3, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Teams under Division Head */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Teams Under {selectedHead.divisionHeadName} ({selectedHeadTeams.length})
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-2.5">Team</th>
                        <th className="py-2 px-2.5">Division</th>
                        <th className="py-2 px-2.5 text-center">ADMs</th>
                        <th className="py-2 px-2.5 text-center">Customers</th>
                        <th className="py-2 px-2.5 text-right">Returned Value</th>
                        <th className="py-2 px-2.5 text-right">Unrecovered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedHeadTeams.map((t) => (
                        <tr
                          key={t.teamId}
                          onClick={() => {
                            onFilterByTeam(t.teamId);
                            setSelectedHead(null);
                          }}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2 px-2.5 font-semibold text-slate-900">{t.teamName}</td>
                          <td className="py-2 px-2.5 text-slate-600">{t.division}</td>
                          <td className="py-2 px-2.5 text-center font-mono">{t.admCount}</td>
                          <td className="py-2 px-2.5 text-center font-mono">{t.masterCustomerCount}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold">{formatLKR(t.totalValue)}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-red-600">
                            {formatLKR(t.unrecoveredExposure)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ADMs list */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  ADMs Reporting to Division ({selectedHeadAdms.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedHeadAdms.map((a) => (
                    <div key={a.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{a.salesRepName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {a.admNumber} · Emp {a.empId} · {a.teamName}
                        </div>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          a.employeeStatus === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {a.employeeStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center gap-4">
                {selectedHead.divisionHeadId !== 'UNMAPPED_HEAD' && (
                  <button
                    onClick={() => {
                      onFilterByDivisionHead(selectedHead.divisionHeadId);
                      setSelectedHead(null);
                    }}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <span>Filter Platform by {selectedHead.divisionHeadName}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                {selectedHead.divisions[0] && (
                  <button
                    onClick={() => {
                      onFilterByDivision(selectedHead.divisions[0]);
                      setSelectedHead(null);
                    }}
                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1"
                  >
                    <span>Filter by Division: {selectedHead.divisions[0]}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedHead(null)}
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
