import React, { useState, useMemo } from 'react';
import {
  Search,
  Users,
  Briefcase,
  Building2,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  X,
  CheckCircle2,
  ChevronRight,
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

interface TeamDashboardProps {
  teams: TeamSummary[];
  admsMaster: AdmMasterRecord[];
  customersMaster: CustomerMasterRecord[];
  allRecords: ChequeRecord[];
  dateBasis: DateBasis;
  onFilterByTeam: (teamId: string) => void;
  onFilterByAdm: (admCode: string) => void;
  onFilterByCustomer: (cxNumber: string) => void;
  onSelectCheque: (record: ChequeRecord) => void;
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({
  teams,
  admsMaster,
  customersMaster,
  allRecords,
  dateBasis,
  onFilterByTeam,
  onFilterByAdm,
  onFilterByCustomer,
  onSelectCheque,
}) => {
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);

  const divisions = useMemo(
    () => Array.from(new Set(teams.map((t) => t.division).filter(Boolean))).sort(),
    [teams]
  );

  const filtered = teams.filter((t) => {
    if (divisionFilter && t.division !== divisionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.teamName.toLowerCase().includes(q) ||
        t.division.toLowerCase().includes(q) ||
        t.divisionHeadName.toLowerCase().includes(q) ||
        t.teamId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Consolidated summary KPIs
  const totals = useMemo(() => {
    const totalTeams = filtered.length;
    const totalAdms = filtered.reduce((s, t) => s + t.admCount, 0);
    const totalMasterCustomers = filtered.reduce((s, t) => s + t.masterCustomerCount, 0);
    const totalReturnedValue = filtered.reduce((s, t) => s + t.totalValue, 0);
    const totalUnrecovered = filtered.reduce((s, t) => s + t.unrecoveredExposure, 0);
    const totalRecovered = filtered.reduce((s, t) => s + t.verifiedRecoveredValue, 0);
    const recoveryRate = totalReturnedValue > 0 ? (totalRecovered / totalReturnedValue) * 100 : 0;
    return {
      totalTeams,
      totalAdms,
      totalMasterCustomers,
      totalReturnedValue,
      totalUnrecovered,
      totalRecovered,
      recoveryRate,
    };
  }, [filtered]);

  // Monthly trends for filtered teams' cheques
  const scopedCheques = useMemo(() => {
    const ids = new Set(filtered.flatMap((t) => t.chequeIds));
    return allRecords.filter((r) => ids.has(r.id));
  }, [filtered, allRecords]);

  const monthlyTrend = useMemo(
    () => calculateMonthlyTrends(scopedCheques, dateBasis),
    [scopedCheques, dateBasis]
  );

  // Drill-down details for selected team
  const selectedTeamAdms = useMemo(() => {
    if (!selectedTeam) return [];
    return admsMaster.filter((a) => a.teamId === selectedTeam.teamId);
  }, [selectedTeam, admsMaster]);

  const selectedTeamCustomers = useMemo(() => {
    if (!selectedTeam) return [];
    return customersMaster.filter((c) => c.teamId === selectedTeam.teamId);
  }, [selectedTeam, customersMaster]);

  const selectedTeamCheques = useMemo(() => {
    if (!selectedTeam) return [];
    const idSet = new Set(selectedTeam.chequeIds);
    return allRecords.filter((r) => idSet.has(r.id));
  }, [selectedTeam, allRecords]);

  const selectedTeamMonthly = useMemo(
    () => calculateMonthlyTrends(selectedTeamCheques, dateBasis),
    [selectedTeamCheques, dateBasis]
  );

  return (
    <div className="space-y-5">
      {/* Consolidated KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Active Teams</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {totals.totalTeams}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {divisions.length} divisions represented
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">ADMs & Customers</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {totals.totalAdms} <span className="text-xs font-normal text-slate-500">ADMs</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {totals.totalMasterCustomers} Master Customers
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Returned Cheque Value</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
            {formatCompactLKR(totals.totalReturnedValue)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {formatLKR(totals.totalReturnedValue)}
          </div>
        </div>

        <div className="p-3.5 bg-red-50/50 border border-red-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-red-800 uppercase">Unrecovered Exposure</span>
          <div className="text-xl font-bold text-red-700 font-mono mt-1 tabular-nums">
            {formatCompactLKR(totals.totalUnrecovered)}
          </div>
          <div className="text-[10px] text-red-600 mt-0.5">
            Active outstanding team exposure
          </div>
        </div>

        <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-lg shadow-2xs">
          <span className="text-[10px] font-semibold text-emerald-800 uppercase">Team Recovery Rate</span>
          <div className="text-xl font-bold text-emerald-700 font-mono mt-1 tabular-nums">
            {totals.recoveryRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5 font-mono">
            {formatCompactLKR(totals.totalRecovered)} recovered
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search team name, division, or division head..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
            />
          </div>

          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Divisions ({divisions.length})</option>
            {divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          {filtered.length} teams shown
        </span>
      </div>

      {/* Team Returned-Cheque & Recovery Trends Chart */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Team Portfolio Returned-Cheque & Recovery Performance Trends
            </h3>
            <p className="text-xs text-slate-500">
              Monthly returned-cheque value vs verified recovery across {filtered.length} teams
            </p>
          </div>
        </div>

        {monthlyTrend.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactLKR(v)} />
                <Tooltip formatter={(v: any, name: any) => [formatLKR(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" name="Returned Value (LKR)" fill="#CC0000" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recoveredValue" name="Verified Recovered (LKR)" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="unrecoveredExposure" name="Unrecovered Exposure" stroke="#1E293B" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400">
            No returned-cheque activity recorded for the selected teams yet.
          </div>
        )}
      </div>

      {/* Team Directory & Risk Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Team & Division</th>
                <th className="py-2.5 px-2">Division Head</th>
                <th className="py-2.5 px-2 text-center">ADMs</th>
                <th className="py-2.5 px-2 text-center">Customers (Master / Affected)</th>
                <th className="py-2.5 px-2 text-center">Repeat Risk</th>
                <th className="py-2.5 px-2 text-right">Returned Value</th>
                <th className="py-2.5 px-2 text-right">Unrecovered</th>
                <th className="py-2.5 px-2 text-right">Recovery %</th>
                <th className="py-2.5 px-3 text-center">Drill-down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr
                  key={t.teamId}
                  onClick={() => setSelectedTeam(t)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors">
                      {t.teamName}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <span className="font-medium text-slate-600">{t.division}</span>
                      <span className="font-mono text-slate-400">· {t.teamId}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-2 text-slate-700 font-medium">{t.divisionHeadName}</td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">
                    <span className="font-bold text-slate-900">{t.admCount}</span>
                    {t.admCount > 0 && (
                      <span className="block text-[10px] text-emerald-700">
                        {t.activeAdmCount} active
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-700">
                    {t.masterCustomerCount} / {t.affectedCustomersCount}
                  </td>

                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">
                    {t.repeatCustomersCount > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                        {t.repeatCustomersCount} repeat
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatLKR(t.totalValue)}
                    <div className="text-[10px] font-normal text-slate-500">
                      {t.totalReturns} cheques
                    </div>
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-red-600">
                    {t.unrecoveredExposure > 0 ? formatLKR(t.unrecoveredExposure) : '—'}
                  </td>

                  <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                    <span
                      className={`font-bold ${
                        t.recoveryRateByValue >= 50 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {t.recoveryRateByValue.toFixed(1)}%
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTeam(t);
                      }}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                    No Teams found. Import an ADM Master spreadsheet to populate Division-scoped Teams.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Drill-Down Modal */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedTeam.teamName}</h3>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                    {selectedTeam.division}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Division Head: <strong>{selectedTeam.divisionHeadName}</strong> · Team ID: {selectedTeam.teamId}
                </div>
              </div>
              <button
                onClick={() => setSelectedTeam(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">ADMs / Master Customers</div>
                  <div className="text-base font-bold text-slate-900 font-mono mt-1">
                    {selectedTeam.admCount} ADMs / {selectedTeam.masterCustomerCount} Cust.
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Returned Value</div>
                  <div className="text-base font-bold text-slate-900 font-mono mt-1">
                    {formatLKR(selectedTeam.totalValue)}
                  </div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-[10px] text-red-700 uppercase font-semibold">Unrecovered Exposure</div>
                  <div className="text-base font-bold text-red-700 font-mono mt-1">
                    {formatLKR(selectedTeam.unrecoveredExposure)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                  <div className="text-[10px] text-emerald-700 uppercase font-semibold">Recovery Performance</div>
                  <div className="text-base font-bold text-emerald-700 font-mono mt-1">
                    {selectedTeam.recoveryRateByValue.toFixed(1)}% ({formatCompactLKR(selectedTeam.verifiedRecoveredValue)})
                  </div>
                </div>
              </div>

              {/* Team Monthly Trend */}
              {selectedTeamMonthly.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                    Team Returned-Cheque Trend
                  </h4>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={selectedTeamMonthly}>
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

              {/* ADMs in Team */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  ADMs in Team ({selectedTeamAdms.length})
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-2.5">Emp ID</th>
                        <th className="py-2 px-2.5">ADM#</th>
                        <th className="py-2 px-2.5">Sales Rep. Name</th>
                        <th className="py-2 px-2.5">Status</th>
                        <th className="py-2 px-2.5">Mobile / Email</th>
                        <th className="py-2 px-2.5 text-center">Customers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedTeamAdms.map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => {
                            onFilterByAdm(a.admNumber);
                            setSelectedTeam(null);
                          }}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2 px-2.5 font-mono text-slate-600">{a.empId}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{a.admNumber}</td>
                          <td className="py-2 px-2.5 font-semibold text-slate-900">{a.salesRepName}</td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                a.employeeStatus === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {a.employeeStatus}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-[11px] text-slate-600">
                            {a.mobileNo || '—'} {a.email ? `· ${a.email}` : ''}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono">
                            {customersMaster.filter((c) => c.admNumber === a.admNumber).length}
                          </td>
                        </tr>
                      ))}
                      {selectedTeamAdms.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400">
                            No ADM Master records mapped to this team.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Customer Risk Concentration */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Top Risk Concentration Customers ({selectedTeam.topRiskCustomers.length})
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-2.5">Customer</th>
                        <th className="py-2 px-2.5 text-right">Returns</th>
                        <th className="py-2 px-2.5 text-right">Total Value</th>
                        <th className="py-2 px-2.5 text-right">Unrecovered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedTeam.topRiskCustomers.map((c) => (
                        <tr
                          key={c.cxNumber}
                          onClick={() => {
                            onFilterByCustomer(c.cxNumber);
                            setSelectedTeam(null);
                          }}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2 px-2.5 font-semibold text-slate-900">
                            {c.cxName}{' '}
                            <span className="font-mono text-[10px] text-slate-500">({c.cxNumber})</span>
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono">{c.totalReturns}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold">{formatLKR(c.totalValue)}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-red-600 font-semibold">
                            {formatLKR(c.unrecoveredExposure)}
                          </td>
                        </tr>
                      ))}
                      {selectedTeam.topRiskCustomers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            No returned-cheque risk cases in this team ({selectedTeamCustomers.length} master customers linked).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Returned Cheques */}
              {selectedTeamCheques.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Returned Cheques ({selectedTeamCheques.length})
                  </h4>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2 px-2.5">Date</th>
                          <th className="py-2 px-2.5">Customer</th>
                          <th className="py-2 px-2.5">Cheque Ref</th>
                          <th className="py-2 px-2.5 text-right">Amount</th>
                          <th className="py-2 px-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedTeamCheques.slice(0, 10).map((chq) => (
                          <tr
                            key={chq.id}
                            onClick={() => {
                              setSelectedTeam(null);
                              onSelectCheque(chq);
                            }}
                            className="hover:bg-slate-50 cursor-pointer"
                          >
                            <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">{chq.datePosted}</td>
                            <td className="py-2 px-2.5 font-semibold text-slate-900">{chq.cxName}</td>
                            <td className="py-2 px-2.5 font-mono">{chq.description}</td>
                            <td className="py-2 px-2.5 text-right font-mono font-semibold">{formatLKR(chq.amount)}</td>
                            <td className="py-2 px-2.5 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {chq.recoveryStatus.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              {selectedTeam.teamId !== 'UNMAPPED_TEAM' ? (
                <button
                  onClick={() => {
                    onFilterByTeam(selectedTeam.teamId);
                    setSelectedTeam(null);
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <span>Filter Entire Platform by Team {selectedTeam.teamName}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              ) : (
                <span className="text-xs text-slate-500">Historical unmapped records</span>
              )}
              <button
                onClick={() => setSelectedTeam(null)}
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
