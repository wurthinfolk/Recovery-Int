import React, { useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  FileText,
  Calendar,
  Filter,
  CheckCircle,
  Clock,
  Printer,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import {
  ChequeRecord,
  FilterState,
  KPIMetrics,
  CustomerSummary,
  AdmSummary,
  ReasonSummary,
} from '../types';
import { ReportType, exportReport, generateReportData } from '../services/exportService';
import { formatLKR } from '../services/analytics';

interface ReportsAndExportsProps {
  records: ChequeRecord[];
  filters: FilterState;
  kpis: KPIMetrics;
  customers: CustomerSummary[];
  adms: AdmSummary[];
  reasons: ReasonSummary[];
}

interface ReportOptionDef {
  id: ReportType;
  title: string;
  description: string;
  recordCount: number;
}

export const ReportsAndExports: React.FC<ReportsAndExportsProps> = ({
  records,
  filters,
  kpis,
  customers,
  adms,
  reasons,
}) => {
  const [selectedReport, setSelectedReport] = useState<ReportType>('COMPLETE_REGISTER');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const todayStr = new Date().toISOString().slice(0, 10);

  const reportDefinitions: ReportOptionDef[] = [
    {
      id: 'COMPLETE_REGISTER',
      title: 'Complete Returned-Cheque Register',
      description: 'Full transaction register including original business fields, recovery status, and amounts.',
      recordCount: records.length,
    },
    {
      id: 'CUSTOMER_ANALYSIS',
      title: 'Customer-Wise Exposure Intelligence',
      description: 'Historical customer aggregates: return counts, total value, unrecovered exposure, and deterioration flags.',
      recordCount: customers.length,
    },
    {
      id: 'REPEAT_CUSTOMERS',
      title: 'Repeat-Return Customers Report',
      description: 'Customers with ≥ 2 returned cheques within the selected analysis window.',
      recordCount: customers.filter((c) => c.isRepeatCustomer).length,
    },
    {
      id: 'ADM_ANALYSIS',
      title: 'ADM Portfolio Return Analysis',
      description: 'Aggregation by ADM code noting total value, return frequencies, and affected customers.',
      recordCount: adms.length,
    },
    {
      id: 'REASON_ANALYSIS',
      title: 'Return Reason & Pareto Analysis',
      description: 'Normalized reason categorization, value shares, and repeat customer occurrences.',
      recordCount: reasons.length,
    },
    {
      id: 'UNRESOLVED_CASES',
      title: 'Unresolved Recovery Cases Queue',
      description: 'All active cheque return cases requiring contact, legal intervention, or balance recovery.',
      recordCount: records.filter((r) => r.recoveryStatus !== 'RECOVERED' && r.recoveryStatus !== 'CLOSED_OTHER').length,
    },
    {
      id: 'OVERDUE_FOLLOWUPS',
      title: 'Overdue Follow-Up Commitments',
      description: 'Cases with scheduled follow-up dates that have elapsed without logged resolution.',
      recordCount: records.filter(
        (r) =>
          r.nextFollowUpDate &&
          r.nextFollowUpDate < todayStr &&
          r.recoveryStatus !== 'RECOVERED' &&
          r.recoveryStatus !== 'CLOSED_OTHER'
      ).length,
    },
    {
      id: 'HIGH_PRIORITY_CASES',
      title: 'Critical & High Priority Action Cases',
      description: 'High-exposure cases (≥ LKR 250k) and chronic repeat customer accounts requiring immediate attention.',
      recordCount: records.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').length,
    },
    {
      id: 'RECOVERY_OUTCOMES',
      title: 'Recovery Outcomes & Verified Settlements',
      description: 'Log of verified recoveries, cleared replacements, and partial payments received.',
      recordCount: records.filter((r) => r.recoveredAmount > 0 || r.recoveryStatus === 'RECOVERED').length,
    },
  ];

  const handleDownload = () => {
    exportReport({
      reportType: selectedReport,
      records,
      filters,
      kpis,
      customers,
      adms,
      reasons,
      format: exportFormat,
    });
  };

  const preview = generateReportData({
    reportType: selectedReport,
    records,
    filters,
    customers,
    adms,
    reasons,
    format: exportFormat,
  });

  return (
    <div className="space-y-6">
      {/* Overview & Download Action Bar */}
      <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Enterprise Reports & Verified Data Exports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Section 10 compliant financial and operational extracts formatted for management and audit review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Format Picker */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-md text-xs font-medium border border-slate-200">
            <button
              onClick={() => setExportFormat('xlsx')}
              className={`px-3 py-1.5 rounded transition-colors ${
                exportFormat === 'xlsx'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Excel (.xlsx)
            </button>
            <button
              onClick={() => setExportFormat('csv')}
              className={`px-3 py-1.5 rounded transition-colors ${
                exportFormat === 'csv'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CSV (.csv)
            </button>
          </div>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* Report Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {reportDefinitions.map((rep) => (
          <div
            key={rep.id}
            onClick={() => setSelectedReport(rep.id)}
            className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
              selectedReport === rep.id
                ? 'bg-red-50/50 border-red-300 shadow-xs ring-1 ring-red-400'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-900">{rep.title}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                  {rep.recordCount} rows
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                {rep.description}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className={selectedReport === rep.id ? 'font-bold text-red-600' : 'text-slate-400'}>
                {selectedReport === rep.id ? 'Selected for Export ✓' : 'Click to Select'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Data Preview Section */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <h4 className="font-bold text-xs text-slate-900">
              Live Report Preview: {preview.filename}
            </h4>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Previewing first {Math.min(preview.data.length, 10)} of {preview.data.length} export rows
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs text-left">
            {preview.data.length > 0 && (
              <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                <tr>
                  {Object.keys(preview.data[0]).map((header) => (
                    <th key={header} className="py-2 px-3 whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-100">
              {preview.data.slice(0, 10).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 font-mono text-[11px]">
                  {Object.values(row).map((val: any, cIdx) => (
                    <td key={cIdx} className="py-2 px-3 whitespace-nowrap text-slate-700">
                      {typeof val === 'number' ? val.toLocaleString() : String(val)}
                    </td>
                  ))}
                </tr>
              ))}

              {preview.data.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-sans">
                    No data records currently match the report filter parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
