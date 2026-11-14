import React, { useState } from 'react';
import {
  Briefcase,
  AlertCircle,
  HelpCircle,
  Info,
  Users,
  Search,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  PieChart,
} from 'lucide-react';
import { AdmSummary, ChequeRecord, CustomerMasterRecord } from '../types';
import { formatLKR, formatCompactLKR } from '../services/analytics';

interface AdmPerformanceProps {
  adms: AdmSummary[];
  allRecords: ChequeRecord[];
  customersMaster?: CustomerMasterRecord[];
  onSelectCheque: (record: ChequeRecord) => void;
  onFilterByAdm: (admCode: string) => void;
}

export const AdmPerformance: React.FC<AdmPerformanceProps> = ({
  adms,
  allRecords,
  customersMaster = [],
  onSelectCheque,
  onFilterByAdm,
}) => {
  const [search, setSearch] = useState('');
  const [selectedAdm, setSelectedAdm] = useState<AdmSummary | null>(null);

  const filtered = adms.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        a.admCode.toLowerCase().includes(q) ||
        a.admName.toLowerCase().includes(q) ||
        a.topReturnReason.toLowerCase().includes(q) ||
        (a.empId && a.empId.toLowerCase().includes(q)) ||
        (a.teamName && a.teamName.toLowerCase().includes(q)) ||
        (a.division && a.division.toLowerCase().includes(q)) ||
        (a.divisionHeadName && a.divisionHeadName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedAdmCheques = selectedAdm
    ? allRecords.filter((r) => r.admCode.toLowerCase() === selectedAdm.admCode.toLowerCase())
    : [];

  const selectedAdmCustomers = selectedAdm
    ? customersMaster.filter(
        (c) => !c.requiresAdmMapping && c.admNumber.toLowerCase() === selectedAdm.admCode.toLowerCase()
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Mandatory Analytical Neutrality Disclaimer Banner (Section 6C) */}
      <div className="p-4 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 text-xs flex items-start gap-3">
        <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-slate-900 mb-0.5">
            Analytical Baseline & Neutrality Notice
          </h4>
          <p className="leading-relaxed">
            Returned-cheque totals alone do not indicate account manager performance. Analysis accounts
            for the absence of denominator metrics such as total sales revenue, customer portfolio size,
            territory risk profiles, and tenure. Rankings use objective terminology ("highest recorded returned-cheque value")
            to facilitate constructive credit-control and recovery support.
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search ADM by name, code, or top reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {filtered.length} ADMs identified in records
        </span>
      </div>

      {/* ADM Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((adm) => (
          <div
            key={adm.admCode}
            onClick={() => setSelectedAdm(adm)}
            className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                    {adm.admCode}
                  </span>
                  {adm.empId && (
                    <span className="font-mono text-[10px] text-slate-500">
                      Emp {adm.empId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {adm.employeeStatus && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        adm.employeeStatus === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {adm.employeeStatus}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 font-mono font-medium">
                    {adm.totalReturns} Cheques
                  </span>
                </div>
              </div>

              <h4 className="font-bold text-sm text-slate-900 truncate">
                {adm.admName}
              </h4>
              {adm.isMasterLinked && (
                <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                  <div className="truncate">
                    <span className="text-slate-400">Team:</span>{' '}
                    <strong className="text-slate-800">{adm.teamName}</strong> · {adm.division}
                  </div>
                  <div className="truncate text-[10px] text-slate-500">
                    Division Head: {adm.divisionHeadName}
                  </div>
                </div>
              )}
              {adm.hasInconsistentName && (
                <div className="text-[10px] text-amber-700 mt-0.5">
                  Historical name variation: {adm.alternateNames.join(', ')}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Recorded Value</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatLKR(adm.totalValue)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Unrecovered</span>
                  <span className="font-mono font-bold text-red-600 text-sm">
                    {formatLKR(adm.unrecoveredExposure)}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Portfolio / Return Cx:</span>
                  <span className="font-semibold text-slate-800">
                    {adm.masterCustomerCount ?? 0} Master / {adm.uniqueCustomers} w/ Returns
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Repeat Customers:</span>
                  <span className="font-semibold text-red-600">{adm.repeatCustomersCount}</span>
                </div>
                {(adm.mobileNo || adm.email) && (
                  <div className="flex items-center justify-between truncate text-[10px] text-slate-500">
                    <span>{adm.mobileNo || '—'}</span>
                    <span className="truncate max-w-[140px]">{adm.email || '—'}</span>
                  </div>
                )}
                <div className="flex items-center justify-between truncate">
                  <span className="text-slate-500">Top Root Cause:</span>
                  <span className="font-medium text-slate-800 truncate max-w-[140px]" title={adm.topReturnReason}>
                    {adm.topReturnReason}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-red-600 font-semibold group-hover:underline">
                View Portfolio History →
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Avg {formatCompactLKR(adm.averageAmount)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ADM Portfolio Detail Modal */}
      {selectedAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedAdm.admName}</h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                    {selectedAdm.admCode}
                  </span>
                  {selectedAdm.empId && (
                    <span className="font-mono text-xs text-slate-600">Emp ID: {selectedAdm.empId}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {selectedAdm.teamName && <span>Team: <strong className="text-slate-700">{selectedAdm.teamName}</strong></span>}
                  {selectedAdm.division && <span>Division: <strong className="text-slate-700">{selectedAdm.division}</strong></span>}
                  {selectedAdm.divisionHeadName && <span>Division Head: <strong className="text-slate-700">{selectedAdm.divisionHeadName}</strong></span>}
                  {selectedAdm.mobileNo && <span>Mobile: <strong className="text-slate-700 font-mono">{selectedAdm.mobileNo}</strong></span>}
                  {selectedAdm.email && <span>E-mail: <strong className="text-slate-700">{selectedAdm.email}</strong></span>}
                </div>
              </div>
              <button
                onClick={() => setSelectedAdm(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {selectedAdmCustomers.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Customer Portfolio ({selectedAdmCustomers.length} Master Customers)
                  </h4>
                  <div className="border border-slate-200 rounded overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2.5">Customer ID</th>
                          <th className="py-1.5 px-2.5">Name</th>
                          <th className="py-1.5 px-2.5">Phone</th>
                          <th className="py-1.5 px-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAdmCustomers.map((c) => (
                          <tr key={c.id}>
                            <td className="py-1.5 px-2.5 font-mono text-slate-700">{c.customerId}</td>
                            <td className="py-1.5 px-2.5 font-medium text-slate-900">{c.customerName}</td>
                            <td className="py-1.5 px-2.5 font-mono text-slate-600">{c.customerPhone || '—'}</td>
                            <td className="py-1.5 px-2.5 text-[10px]">{c.customerStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Returned Cheques History ({selectedAdmCheques.length})
                </h4>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Customer</th>
                      <th className="py-2 px-2.5">Cheque Ref</th>
                      <th className="py-2 px-2.5 text-right">Amount (LKR)</th>
                      <th className="py-2 px-2.5">Reason</th>
                      <th className="py-2 px-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedAdmCheques.map((chq) => (
                      <tr
                        key={chq.id}
                        onClick={() => {
                          setSelectedAdm(null);
                          onSelectCheque(chq);
                        }}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600">
                          {chq.datePosted}
                        </td>
                        <td className="py-2 px-2.5 font-semibold text-slate-900">
                          {chq.cxName}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-700">
                          {chq.description}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatLKR(chq.amount)}
                        </td>
                        <td className="py-2 px-2.5 text-slate-700 truncate max-w-[150px]">
                          {chq.normalizedReason}
                        </td>
                        <td className="py-2 px-2.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                            {chq.recoveryStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  onFilterByAdm(selectedAdm.admCode);
                  setSelectedAdm(null);
                }}
                className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <span>Filter Entire Platform by {selectedAdm.admCode}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => setSelectedAdm(null)}
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
