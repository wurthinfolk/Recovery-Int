import React, { useState } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Users,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  FileText,
  BarChart3,
  ExternalLink,
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
  Area,
  AreaChart,
} from 'recharts';
import {
  KPIMetrics,
  CustomerSummary,
  AdmSummary,
  ReasonSummary,
  ChequeRecord,
  FilterState,
} from '../types';
import {
  formatLKR,
  formatCompactLKR,
  calculateMonthlyTrends,
  calculatePareto,
} from '../services/analytics';

interface ExecutiveDashboardProps {
  kpis: KPIMetrics;
  records: ChequeRecord[];
  customers: CustomerSummary[];
  adms: AdmSummary[];
  reasons: ReasonSummary[];
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onNavigateToRegister: (filterOverrides?: Partial<FilterState>) => void;
  onSelectCustomer: (cxNumber: string) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  kpis,
  records,
  customers,
  adms,
  reasons,
  filters,
  onFilterChange,
  onNavigateToRegister,
  onSelectCustomer,
}) => {
  const [chartMetric, setChartMetric] = useState<'value' | 'count' | 'exposure'>('value');

  // Trend time series
  const monthlyData = calculateMonthlyTrends(records, filters.dateBasis);

  // Top 10 Pareto for Customers
  const customerPareto = calculatePareto(customers.slice(0, 10), (c) => c.totalValue);

  // Top Pareto for Reasons
  const reasonPareto = calculatePareto(reasons.slice(0, 8), (r) => r.totalValue);

  return (
    <div className="space-y-6">
      {/* KPI Metric Strip - 10 Core Documented KPIs (Section 5A) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Key Performance Indicators
            </h2>
            <span className="text-xs text-slate-500">
              · Basis: {filters.dateBasis === 'datePosted' ? 'Date-Posted' : 'Effective-Date'}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {records.length} records analyzed
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Total Count */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              1. Total Returns Count
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {kpis.totalCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              <span>{kpis.comparisonPeriodLabel}</span>
              {kpis.countChangePct !== null && (
                <span className={kpis.countChange > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {kpis.countChange > 0 ? `+${kpis.countChange}` : kpis.countChange}
                </span>
              )}
            </div>
          </div>

          {/* 2. Total Returned Value */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              2. Total Returned Value
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {formatCompactLKR(kpis.totalValue)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 truncate" title={formatLKR(kpis.totalValue)}>
              {formatLKR(kpis.totalValue)}
            </div>
          </div>

          {/* 3. Unique Customers */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              3. Affected Customers
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {kpis.uniqueCustomers}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Distinct CX Number accounts
            </div>
          </div>

          {/* 4. Average Amount */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              4. Average Return Amount
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {formatCompactLKR(kpis.averageAmount)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 truncate" title={formatLKR(kpis.averageAmount)}>
              Per returned cheque record
            </div>
          </div>

          {/* 5. Repeat Customers */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              5. Repeat Customers
            </div>
            <div className="text-xl font-bold text-red-600 mt-1 font-mono tabular-nums">
              {kpis.repeatCustomersCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              ≥ 2 returned cheques in period
            </div>
          </div>

          {/* 6. Repeat Customers Value */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              6. Repeat Customers Value
            </div>
            <div className="text-xl font-bold text-red-600 mt-1 font-mono tabular-nums">
              {formatCompactLKR(kpis.repeatCustomersValue)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {kpis.totalValue > 0
                ? `${((kpis.repeatCustomersValue / kpis.totalValue) * 100).toFixed(1)}% of total value`
                : '0%'}
            </div>
          </div>

          {/* 7. Verified Unrecovered Exposure */}
          <div className="p-3.5 bg-red-50/50 border border-red-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-red-800 uppercase tracking-tight flex items-center justify-between">
              <span>7. Unrecovered Exposure</span>
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-xl font-bold text-red-700 mt-1 font-mono tabular-nums">
              {formatCompactLKR(kpis.unrecoveredExposure)}
            </div>
            <div className="text-[10px] text-red-600 mt-1">
              Sum of remaining unrecovered balances
            </div>
          </div>

          {/* 8. Overdue Recovery Cases */}
          <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-amber-800 uppercase tracking-tight flex items-center justify-between">
              <span>8. Overdue Follow-ups</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xl font-bold text-amber-700 mt-1 font-mono tabular-nums">
              {kpis.overdueCasesCount}
            </div>
            <div className="text-[10px] text-amber-600 mt-1">
              Commitment date passed
            </div>
          </div>

          {/* 9. Recovery Rate by Value */}
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-emerald-800 uppercase tracking-tight flex items-center justify-between">
              <span>9. Recovery Rate (Value)</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
              {kpis.recoveryRateByValue.toFixed(1)}%
            </div>
            <div className="text-[10px] text-emerald-600 mt-1">
              {formatCompactLKR(kpis.verifiedRecoveredValue)} verified recovered
            </div>
          </div>

          {/* 10. Period-over-Period Change */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
              10. Period Δ Trend
            </div>
            <div className="text-base font-bold text-slate-800 mt-1 flex items-center gap-1 font-mono">
              {kpis.valueChangePct !== null ? (
                <>
                  {kpis.valueChange >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 text-red-600" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                  )}
                  <span className={kpis.valueChange >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {Math.abs(kpis.valueChangePct).toFixed(1)}% Value
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-500 font-normal">Baseline Period</span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Compared to previous baseline
            </div>
          </div>
        </div>
      </section>

      {/* Monthly Trend Analytics & Drill-down Charts (Section 5B) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Monthly Trend Analysis
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any chart bar or point to filter register down to that reporting month
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-xs font-medium">
            <button
              onClick={() => setChartMetric('value')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartMetric === 'value' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Returned vs Recovered Value
            </button>
            <button
              onClick={() => setChartMetric('count')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartMetric === 'count' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cheque & Repeat Customer Count
            </button>
            <button
              onClick={() => setChartMetric('exposure')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartMetric === 'exposure' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unrecovered Exposure
            </button>
          </div>
        </div>

        {monthlyData.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartMetric === 'value' ? (
                <ComposedChart
                  data={monthlyData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const mKey = e.activePayload[0].payload.monthKey;
                      onNavigateToRegister({ startDate: `${mKey}-01`, endDate: `${mKey}-31` });
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => formatCompactLKR(val)}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [formatLKR(Number(val)), name]}
                    labelStyle={{ fontWeight: 'bold', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="value" name="Returned Value (LKR)" fill="#CC0000" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recoveredValue" name="Verified Recovered (LKR)" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="averageAmount" name="Avg Cheque Amount" stroke="#475569" strokeWidth={2} />
                </ComposedChart>
              ) : chartMetric === 'count' ? (
                <ComposedChart
                  data={monthlyData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const mKey = e.activePayload[0].payload.monthKey;
                      onNavigateToRegister({ startDate: `${mKey}-01`, endDate: `${mKey}-31` });
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip labelStyle={{ fontWeight: 'bold', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="count" name="Returned Cheques Count" fill="#1E293B" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="repeatCustomers" name="Repeat Customers" stroke="#DC2626" strokeWidth={2} />
                </ComposedChart>
              ) : (
                <AreaChart
                  data={monthlyData}
                  margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const mKey = e.activePayload[0].payload.monthKey;
                      onNavigateToRegister({ startDate: `${mKey}-01`, endDate: `${mKey}-31` });
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="displayMonth" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => formatCompactLKR(val)} />
                  <Tooltip
                    formatter={(val: any) => [formatLKR(Number(val)), 'Unrecovered Exposure']}
                    labelStyle={{ fontWeight: 'bold', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="unrecoveredExposure"
                    name="Unrecovered Exposure (LKR)"
                    stroke="#CC0000"
                    fill="#FEE2E2"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs">
            Insufficient historical date data to plot trends. Import or record dates to generate monthly curves.
          </div>
        )}
      </section>

      {/* Concentration & Pareto Analysis Grid (Section 5C) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Customers Concentration */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Top Customers by Returned Value & Pareto Curve
              </h3>
              <p className="text-xs text-slate-500">
                Identifies disproportionate exposure concentration among customer accounts
              </p>
            </div>
            <button
              onClick={() => onNavigateToRegister()}
              className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2 px-2.5">Customer</th>
                  <th className="py-2 px-2 text-right">Returns</th>
                  <th className="py-2 px-2 text-right">Total Value (LKR)</th>
                  <th className="py-2 px-2 text-right">Unrecovered</th>
                  <th className="py-2 px-2.5 text-right">Pareto %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerPareto.slice(0, 7).map((c) => (
                  <tr
                    key={c.cxNumber}
                    onClick={() => onSelectCustomer(c.cxNumber)}
                    className="hover:bg-slate-50 cursor-pointer group transition-colors"
                  >
                    <td className="py-2 px-2.5">
                      <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors truncate max-w-[200px]">
                        {c.cxName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {c.cxNumber} {c.isRepeatCustomer && '· Repeat Customer'}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                      {c.totalReturns}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatLKR(c.totalValue)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-red-600">
                      {formatLKR(c.unrecoveredExposure)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600">
                      {c.cumulativePct}%
                    </td>
                  </tr>
                ))}
                {customerPareto.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      No customer records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top Return Reasons Breakdown */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Return Reasons Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Normalized analytical categories preserving verified source descriptions
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2 px-2.5">Normalized Reason</th>
                  <th className="py-2 px-2 text-right">Count</th>
                  <th className="py-2 px-2 text-right">Total Value (LKR)</th>
                  <th className="py-2 px-2 text-right">Share (%)</th>
                  <th className="py-2 px-2.5 text-right">Pareto %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reasonPareto.slice(0, 7).map((r) => (
                  <tr
                    key={r.normalizedReason}
                    onClick={() => onNavigateToRegister({ returnReason: r.normalizedReason })}
                    className="hover:bg-slate-50 cursor-pointer group transition-colors"
                  >
                    <td className="py-2 px-2.5">
                      <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors truncate max-w-[220px]">
                        {r.normalizedReason}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {r.customerCount} customers affected
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                      {r.count}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatLKR(r.totalValue)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-600">
                      {r.shareOfTotalValue.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-600">
                      {r.cumulativePct}%
                    </td>
                  </tr>
                ))}
                {reasonPareto.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      No return reasons logged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ADM Recorded Return Totals (Section 5C & 6C Neutral Phrasing) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              ADM Portfolio Recorded Returns
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by recorded returned-cheque value.
            </p>
          </div>
          <span className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            Note: Figures represent recorded return events only, without sales volume denominators.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {adms.slice(0, 4).map((a) => (
            <div
              key={a.admCode}
              onClick={() => onNavigateToRegister({ admCode: a.admCode })}
              className="p-3 bg-slate-50/60 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-500 font-semibold">{a.admCode}</span>
                <span className="text-[10px] text-slate-600 font-mono">{a.totalReturns} cheques</span>
              </div>
              <div className="font-semibold text-xs text-slate-900 truncate mt-1">
                {a.admName}
              </div>
              <div className="text-base font-bold text-slate-900 mt-2 font-mono tabular-nums">
                {formatLKR(a.totalValue)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{a.uniqueCustomers} customers</span>
                <span className="text-red-600 font-mono font-medium">
                  {formatCompactLKR(a.unrecoveredExposure)} unrecovered
                </span>
              </div>
            </div>
          ))}
          {adms.length === 0 && (
            <div className="col-span-4 py-6 text-center text-slate-400 text-xs">
              No ADM assignments found in records.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
