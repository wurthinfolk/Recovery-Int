import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  ExternalLink,
  X,
  ChevronRight,
  Lock,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import type {
  AdmMasterRecord,
  AdmSummary,
  ChequeRecord,
  CrossTeamBenchmarkSummary,
  CustomerMasterRecord,
  CustomerSummary,
  DateBasis,
  DivisionHeadSummary,
  TeamSummary,
  UserProfile,
} from '../types';
import {
  formatLKR,
  formatCompactLKR,
  calculateMonthlyTrends,
} from '../services/analytics';

interface DivisionHeadDashboardProps {
  currentUser: UserProfile;
  divisionHeads: DivisionHeadSummary[];
  teams: TeamSummary[];
  adms: AdmSummary[];
  customers: CustomerSummary[];
  admsMaster: AdmMasterRecord[];
  customersMaster: CustomerMasterRecord[];
  allRecords: ChequeRecord[];
  dateBasis: DateBasis;
  benchmarks: CrossTeamBenchmarkSummary | null;
  onFilterByDivisionHead: (divisionHeadId: string) => void;
  onFilterByDivision: (division: string) => void;
  onFilterByTeam: (teamId: string) => void;
  onFilterByAdm: (admCode: string) => void;
  onFilterByCustomer: (cxNumber: string) => void;
}

export const DivisionHeadDashboard: React.FC<DivisionHeadDashboardProps> = ({
  currentUser,
  divisionHeads,
  teams,
  adms,
  customers,
  admsMaster,
  customersMaster,
  allRecords,
  dateBasis,
  benchmarks,
  onFilterByDivisionHead,
  onFilterByDivision,
  onFilterByTeam,
  onFilterByAdm,
  onFilterByCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [selectedHead, setSelectedHead] = useState<DivisionHeadSummary | null>(null);
  const isDivisionHeadRole = currentUser.role === 'DIVISION_HEAD';
  const todayStr = new Date().toISOString().slice(0, 10);

  const filteredHeads = useMemo(() => {
    if (!search.trim()) return divisionHeads;
    const q = search.toLowerCase();
    return divisionHeads.filter(
      (dh) =>
        dh.divisionHeadName.toLowerCase().includes(q) ||
        dh.divisions.some((d) => d.toLowerCase().includes(q))
    );
  }, [divisionHeads, search]);

  const scopedCheques = useMemo(() => {
    if (isDivisionHeadRole) return allRecords;
    const ids = new Set(filteredHeads.flatMap((h) => h.chequeIds));
    return allRecords.filter((r) => ids.has(r.id));
  }, [isDivisionHeadRole, allRecords, filteredHeads]);

  const totals = useMemo(() => {
    const allDivs = new Set(filteredHeads.flatMap((d) => d.divisions));
    const totalTeams = isDivisionHeadRole
      ? teams.length
      : filteredHeads.reduce((s, d) => s + d.teamCount, 0);
    const totalAdms = isDivisionHeadRole
      ? admsMaster.length || adms.length
      : filteredHeads.reduce((s, d) => s + d.admCount, 0);
    const totalCustomers = isDivisionHeadRole
      ? customersMaster.length || customers.length
      : filteredHeads.reduce((s, d) => s + d.masterCustomerCount, 0);
    const returnedCount = scopedCheques.length;
    const returnedValue = scopedCheques.reduce((s, r) => s + (r.amount || 0), 0);
    const verifiedRecovered = scopedCheques.reduce((s, r) => s + (r.recoveredAmount || 0), 0);
    const unrecoveredExposure = scopedCheques.reduce((s, r) => {
      if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return s;
      return s + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
    }, 0);
    const recoveryRate = returnedValue > 0 ? (verifiedRecovered / returnedValue) * 100 : 0;
    const repeatCustomersCount = customers.filter((c) => c.isRepeatCustomer).length;
    const overdueCasesCount = scopedCheques.filter(
      (r) =>
        r.nextFollowUpDate &&
        r.nextFollowUpDate < todayStr &&
        r.recoveryStatus !== 'RECOVERED' &&
        r.recoveryStatus !== 'CLOSED_OTHER'
    ).length;

    return {
      totalHeads: filteredHeads.length,
      divisionsCount: allDivs.size,
      totalTeams,
      totalAdms,
      totalCustomers,
      returnedCount,
      returnedValue,
      repeatCustomersCount,
      unrecoveredExposure,
      verifiedRecovered,
      recoveryRate,
      overdueCasesCount,
    };
  }, [
    filteredHeads,
    isDivisionHeadRole,
    teams.length,
    admsMaster.length,
    adms.length,
    customersMaster.length,
    customers,
    scopedCheques,
    todayStr,
  ]);

  const monthlyTrends = useMemo(
    () =>
      calculateMonthlyTrends(scopedCheques, dateBasis).map((t) => ({
        ...t,
        recoveryRatePct: t.value > 0 ? Number(((t.recoveredValue / t.value) * 100).toFixed(1)) : 0,
      })),
    [scopedCheques, dateBasis]
  );

  const teamComparisonData = useMemo(() => {
    return [...teams]
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 12);
  }, [teams]);

  const topCustomers = useMemo(() => {
    return [...customers]
      .filter((c) => c.totalReturns > 0)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 12);
  }, [customers]);

  const sortedAdms = useMemo(() => {
    return [...adms].sort((a, b) => b.totalValue - a.totalValue);
  }, [adms]);

  const benchmarkChartRows = useMemo(() => {
    if (!benchmarks) return [];
    return benchmarks.rows.map((r) => ({
      name: r.isOwnTeam ? `${r.teamLabel} (Your Team)` : r.teamLabel,
      teamLabel: r.teamLabel,
      totalValue: r.totalValue,
      recoveryRateByValue: r.recoveryRateByValue,
      isOwnTeam: r.isOwnTeam,
    }));
  }, [benchmarks]);

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
      {/* Division Head Isolation Scope Notice */}
      {isDivisionHeadRole && (
        <div className="p-3.5 bg-slate-900 text-white rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-[#CC0000] shrink-0" />
            <span>
              <strong>Division Scope Enforced:</strong> Showing data exclusively for{' '}
              <strong>{currentUser.assignedDivision || currentUser.divisionHeadName || currentUser.displayName}</strong>
              {currentUser.assignedTeamName ? ` (${currentUser.assignedTeamName})` : ''}. Peer divisions remain confidential.
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-300 shrink-0">
            Read-Only Executive View
          </span>
        </div>
      )}

      {/* 9-Metric Consolidated KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <KpiCard label="Total Teams" value={String(totals.totalTeams)} sub={`${totals.divisionsCount} Divisions`} />
        <KpiCard label="Total ADMs" value={String(totals.totalAdms)} sub="Assigned force" />
        <KpiCard label="Total Customers" value={String(totals.totalCustomers)} sub="Master accounts" />
        <KpiCard label="Returned Cheques" value={String(totals.returnedCount)} sub="Cheque count" />
        <KpiCard
          label="Returned Value"
          value={formatCompactLKR(totals.returnedValue)}
          sub={formatLKR(totals.returnedValue)}
        />
        <KpiCard
          label="Repeat Customers"
          value={String(totals.repeatCustomersCount)}
          sub="Repeat returns"
          tone="amber"
        />
        <KpiCard
          label="Unrecovered"
          value={formatCompactLKR(totals.unrecoveredExposure)}
          sub={formatLKR(totals.unrecoveredExposure)}
          tone="red"
        />
        <KpiCard
          label="Recovery Rate"
          value={`${totals.recoveryRate.toFixed(1)}%`}
          sub={formatCompactLKR(totals.verifiedRecovered)}
          tone="emerald"
        />
        <KpiCard
          label="Overdue Cases"
          value={String(totals.overdueCasesCount)}
          sub="Past follow-up"
          tone={totals.overdueCasesCount > 0 ? 'red' : 'neutral'}
        />
      </div>

      {/* Dual Trend Charts: Monthly Returned-Cheque Trends & Recovery Performance Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Monthly Returned-Cheque Trends
            </h3>
            <p className="text-xs text-slate-500">
              Monthly returned-cheque count and total LKR exposure within scope
            </p>
          </div>
          {monthlyTrends.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrends} margin={{ top: 10, right: 16, bottom: 8, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayMonth" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactLKR(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(v: any, n: any) =>
                      String(n).includes('Count') ? [v, n] : [formatLKR(Number(v)), n]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="value" name="Returned Value (LKR)" fill="#CC0000" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Cheque Count" stroke="#0F172A" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No monthly cheque return records available in scope.
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Recovery Performance Trends
            </h3>
            <p className="text-xs text-slate-500">
              Verified recovered value vs unrecovered exposure and recovery rate (%)
            </p>
          </div>
          {monthlyTrends.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrends} margin={{ top: 10, right: 16, bottom: 8, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayMonth" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactLKR(v)} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v: any, n: any) =>
                      String(n).includes('%') ? [`${v}%`, n] : [formatLKR(Number(v)), n]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="recoveredValue" name="Recovered Value (LKR)" fill="#16A34A" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="unrecoveredExposure" name="Unrecovered Exposure" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="recoveryRatePct" name="Recovery Rate %" stroke="#0F172A" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No recovery history available to plot monthly recovery performance.
            </div>
          )}
        </div>
      </div>

      {/* Team-Wise Comparison (Own Scope) & ADM-Wise Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Team-Wise Returned-Cheque Comparison
            </h3>
            <p className="text-xs text-slate-500">
              Authorized Teams compared by total returned value, exposure, and recovery %
            </p>
          </div>
          {teamComparisonData.length > 0 ? (
            <>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamComparisonData} margin={{ top: 8, right: 12, bottom: 8, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="teamName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactLKR(v)} />
                    <Tooltip formatter={(v: any, n: any) => [formatLKR(Number(v)), n]} />
                    <Bar dataKey="totalValue" name="Returned Value" fill="#CC0000" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="unrecoveredExposure" name="Unrecovered Exposure" fill="#0F172A" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2.5">Team</th>
                      <th className="py-2 px-2 text-center">ADMs</th>
                      <th className="py-2 px-2 text-center">Cheques</th>
                      <th className="py-2 px-2 text-right">Returned</th>
                      <th className="py-2 px-2 text-right">Unrecovered</th>
                      <th className="py-2 px-2.5 text-right">Rec %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamComparisonData.map((t) => (
                      <tr
                        key={t.teamId}
                        onClick={() => onFilterByTeam(t.teamId)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2 px-2.5 font-semibold text-slate-900">{t.teamName}</td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums">{t.admCount}</td>
                        <td className="py-2 px-2 text-center font-mono tabular-nums">{t.totalReturns}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums">{formatCompactLKR(t.totalValue)}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-red-600">{formatCompactLKR(t.unrecoveredExposure)}</td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {t.recoveryRateByValue.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No Teams mapped inside this Division scope.
            </div>
          )}
        </div>

        {/* ADM-Wise Breakdown */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              ADM-Wise Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Sales representative exposure, return frequency, and affected customers
            </p>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded max-h-[340px]">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                <tr>
                  <th className="py-2 px-2.5">ADM / Sales Rep</th>
                  <th className="py-2 px-2">Team</th>
                  <th className="py-2 px-2 text-center">Cheques</th>
                  <th className="py-2 px-2 text-center">Repeat Cx</th>
                  <th className="py-2 px-2 text-right">Returned</th>
                  <th className="py-2 px-2.5 text-right">Unrecovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAdms.map((a) => (
                  <tr
                    key={a.admCode}
                    onClick={() => onFilterByAdm(a.admCode)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2 px-2.5">
                      <div className="font-semibold text-slate-900">{a.admName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{a.admCode}</div>
                    </td>
                    <td className="py-2 px-2 text-slate-600">{a.teamName || '—'}</td>
                    <td className="py-2 px-2 text-center font-mono tabular-nums">{a.totalReturns}</td>
                    <td className="py-2 px-2 text-center font-mono tabular-nums">{a.repeatCustomersCount}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">{formatCompactLKR(a.totalValue)}</td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-red-600 font-semibold">
                      {formatCompactLKR(a.unrecoveredExposure)}
                    </td>
                  </tr>
                ))}
                {sortedAdms.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No ADM records found inside this Division scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cross-Team Comparative Benchmarking (Anonymized Peer Divisions for Division Heads) */}
      {benchmarks && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-slate-900 text-white rounded-md shrink-0">
                <BarChart3 className="w-4 h-4 text-[#CC0000]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cross-Team Comparative Benchmarking
                </h3>
                <p className="text-xs text-slate-500">
                  {isDivisionHeadRole
                    ? 'Compare your Team performance against anonymized peer Teams & company averages. Peer division identities, customers, and cheque details remain strictly hidden.'
                    : 'Enterprise Team benchmarking ranked by returned-cheque value and recovery rate.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs border border-slate-200 bg-slate-50 rounded-md px-3.5 py-2">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Company Avg Return</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatCompactLKR(benchmarks.companyAverageReturnValue)}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Company Avg Recovery</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                  {benchmarks.companyAverageRecoveryRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Company Avg Count</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {benchmarks.companyAverageReturnsCount}
                </span>
              </div>
            </div>
          </div>

          {benchmarkChartRows.length > 0 && (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarkChartRows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="teamLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompactLKR(v)} />
                  <Tooltip formatter={(v: any) => [formatLKR(Number(v)), 'Returned Value']} />
                  <Bar dataKey="totalValue" name="Returned Value" radius={[4, 4, 0, 0]}>
                    {benchmarkChartRows.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.isOwnTeam ? '#CC0000' : '#94A3B8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-center">Rank (Value)</th>
                  <th className="py-2.5 px-2.5 text-center">Rank (Rec %)</th>
                  <th className="py-2.5 px-3">Team / Benchmark Cohort</th>
                  <th className="py-2.5 px-2 text-center">Returns</th>
                  <th className="py-2.5 px-2 text-center">Repeat Cx</th>
                  <th className="py-2.5 px-2 text-right">Returned Value</th>
                  <th className="py-2.5 px-2 text-right">Unrecovered</th>
                  <th className="py-2.5 px-3 text-right">Recovery %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {benchmarks.rows.map((row) => (
                  <tr
                    key={row.teamId}
                    className={
                      row.isOwnTeam
                        ? 'bg-red-50/50 font-medium'
                        : 'hover:bg-slate-50/70'
                    }
                  >
                    <td className="py-2 px-3 text-center font-mono tabular-nums font-bold text-slate-900">
                      #{row.rankByValue}
                    </td>
                    <td className="py-2 px-2.5 text-center font-mono tabular-nums text-slate-700">
                      #{row.rankByRecoveryRate}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className={row.isOwnTeam ? 'font-bold text-[#CC0000]' : 'text-slate-700'}>
                          {row.teamLabel}
                        </span>
                        {row.isOwnTeam && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                            YOUR TEAM
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{row.divisionLabel}</div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono tabular-nums">{row.totalReturns}</td>
                    <td className="py-2 px-2 text-center font-mono tabular-nums">{row.repeatCustomersCount}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                      {formatLKR(row.totalValue)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-red-700">
                      {formatLKR(row.unrecoveredExposure)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {row.recoveryRateByValue.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {benchmarks.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No team benchmark data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Customers with Returned Cheques (Scoped to Own Division) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Top Customers with Returned Cheques (Division Scope)
          </h3>
          <p className="text-xs text-slate-500">
            Highest-exposure accounts inside your authorized Division ranked by returned-cheque value
          </p>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2 px-3">Customer</th>
                <th className="py-2 px-2">ADM / Team</th>
                <th className="py-2 px-2 text-center">Returns</th>
                <th className="py-2 px-2 text-center">Unresolved</th>
                <th className="py-2 px-2 text-right">Returned Value</th>
                <th className="py-2 px-3 text-right">Unrecovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topCustomers.map((c) => (
                <tr
                  key={c.cxNumber}
                  onClick={() => onFilterByCustomer(c.cxNumber)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-900">{c.cxName}</div>
                    <div className="text-[10px] font-mono text-slate-400">{c.cxNumber}</div>
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    <div>{c.salesRepName || c.admNumber || '—'}</div>
                    <div className="text-[10px] text-slate-400">{c.teamName || '—'}</div>
                  </td>
                  <td className="py-2 px-2 text-center font-mono tabular-nums font-semibold">
                    {c.totalReturns}
                    {c.isRepeatCustomer && (
                      <span className="ml-1 text-[10px] text-red-600 font-bold">(Repeat)</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center font-mono tabular-nums">{c.unresolvedCount}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                    {formatLKR(c.totalValue)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-red-600">
                    {formatLKR(c.unrecoveredExposure)}
                  </td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No customer returned cheques recorded within this Division scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Search & Division Head Directory Table (for Admins/Management/Supervisors or Own Portfolio inspection) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Division Portfolio Summary</h3>
            <p className="text-xs text-slate-500">Click any Division Head row for complete Team &amp; ADM drill-down</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Division Head or Division..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Division Head</th>
                <th className="py-2.5 px-2">Divisions</th>
                <th className="py-2.5 px-2 text-center">Teams</th>
                <th className="py-2.5 px-2 text-center">ADMs</th>
                <th className="py-2.5 px-2 text-center">Customers</th>
                <th className="py-2.5 px-2 text-center">Repeat Cx</th>
                <th className="py-2.5 px-2 text-right">Returned Value</th>
                <th className="py-2.5 px-2 text-right">Unrecovered</th>
                <th className="py-2.5 px-2 text-right">Recovery %</th>
                <th className="py-2.5 px-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHeads.map((dh) => (
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

                  <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800 tabular-nums">{dh.teamCount}</td>
                  <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800 tabular-nums">{dh.admCount}</td>
                  <td className="py-2.5 px-2 text-center font-mono text-slate-700 tabular-nums">{dh.masterCustomerCount}</td>
                  <td className="py-2.5 px-2 text-center font-mono tabular-nums">{dh.repeatCustomersCount}</td>
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
                      type="button"
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
              {filteredHeads.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs">
                    No Division Heads mapped inside your authorized scope yet.
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
                type="button"
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Returned Value</div>
                  <div className="text-base font-bold text-slate-900 font-mono mt-1 tabular-nums">
                    {formatLKR(selectedHead.totalValue)}
                  </div>
                  <div className="text-[10px] text-slate-500">{selectedHead.totalReturns} cheques</div>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="text-[10px] text-red-700 uppercase font-semibold">Unrecovered Exposure</div>
                  <div className="text-base font-bold text-red-700 font-mono mt-1 tabular-nums">
                    {formatLKR(selectedHead.unrecoveredExposure)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                  <div className="text-[10px] text-emerald-700 uppercase font-semibold">Recovery Rate</div>
                  <div className="text-base font-bold text-emerald-700 font-mono mt-1 tabular-nums">
                    {selectedHead.recoveryRateByValue.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-emerald-600 font-mono">
                    {formatCompactLKR(selectedHead.verifiedRecoveredValue)}
                  </div>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                  <div className="text-[10px] text-amber-800 uppercase font-semibold">Repeat Customers</div>
                  <div className="text-base font-bold text-amber-800 font-mono mt-1 tabular-nums">
                    {selectedHead.repeatCustomersCount}
                  </div>
                  <div className="text-[10px] text-amber-700">of {selectedHead.affectedCustomersCount} affected</div>
                </div>
              </div>

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
                          <td className="py-2 px-2.5 text-center font-mono tabular-nums">{t.admCount}</td>
                          <td className="py-2 px-2.5 text-center font-mono tabular-nums">{t.masterCustomerCount}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold tabular-nums">{formatLKR(t.totalValue)}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-red-600 tabular-nums">
                            {formatLKR(t.unrecoveredExposure)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

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
                    type="button"
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
                    type="button"
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
                type="button"
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

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  tone?: 'neutral' | 'red' | 'emerald' | 'amber';
}> = ({ label, value, sub, tone = 'neutral' }) => {
  const cls =
    tone === 'red'
      ? 'bg-red-50/50 border-red-200 text-red-700'
      : tone === 'emerald'
        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700'
        : tone === 'amber'
          ? 'bg-amber-50/50 border-amber-200 text-amber-800'
          : 'bg-white border-slate-200 text-slate-900';
  return (
    <div className={`p-3 border rounded-lg ${cls}`}>
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight block truncate">
        {label}
      </span>
      <div className="text-lg font-bold font-mono tabular-nums mt-1 truncate">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
};
