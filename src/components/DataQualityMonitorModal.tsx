import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  Building,
  Calendar,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { ChequeRecord } from '../types';
import { formatLKR } from '../services/analytics';

export interface DataQualityIssue {
  id: string;
  recordId: string;
  cxNumber: string;
  cxName: string;
  description: string;
  issueType: 'ERROR' | 'WARNING';
  category:
    | 'MISSING_CUSTOMER_ID'
    | 'MISSING_ADM_CODE'
    | 'INCONSISTENT_NAME'
    | 'DATE_MISMATCH'
    | 'SUSPECTED_DUPLICATE'
    | 'RECOVERY_EXCEEDS_AMOUNT'
    | 'MISSING_FOLLOWUP';
  message: string;
  recommendation: string;
}

interface DataQualityMonitorModalProps {
  records: ChequeRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: ChequeRecord) => void;
}

export function auditDataQuality(records: ChequeRecord[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // 1. Group names by CX NUMBER
  const cxNamesMap = new Map<string, Set<string>>();
  const admNamesMap = new Map<string, Set<string>>();
  const dedupeMap = new Map<string, ChequeRecord[]>();

  records.forEach((r) => {
    // CX Map
    if (r.cxNumber) {
      if (!cxNamesMap.has(r.cxNumber)) cxNamesMap.set(r.cxNumber, new Set());
      if (r.cxName) cxNamesMap.get(r.cxNumber)!.add(r.cxName);
    }

    // ADM Map
    if (r.admCode && r.admCode !== 'NO-CODE') {
      if (!admNamesMap.has(r.admCode)) admNamesMap.set(r.admCode, new Set());
      if (r.admName) admNamesMap.get(r.admCode)!.add(r.admName);
    }

    // Dedupe Key
    const dKey = `${(r.cxNumber || '').toUpperCase()}|${(r.description || '').toUpperCase()}|${r.datePosted}|${r.amount}`;
    if (!dedupeMap.has(dKey)) dedupeMap.set(dKey, []);
    dedupeMap.get(dKey)!.push(r);
  });

  // Evaluate records
  records.forEach((r) => {
    // Missing CX Number
    if (!r.cxNumber || r.cxNumber.trim() === '') {
      issues.push({
        id: `dq-cx-${r.id}`,
        recordId: r.id,
        cxNumber: 'UNKNOWN',
        cxName: r.cxName,
        description: r.description,
        issueType: 'ERROR',
        category: 'MISSING_CUSTOMER_ID',
        message: 'Record lacks a primary CX NUMBER customer identifier.',
        recommendation: 'Look up customer account code in SAP/ERP and assign via edit form.',
      });
    }

    // Inconsistent Customer Name
    const names = cxNamesMap.get(r.cxNumber);
    if (names && names.size > 1) {
      issues.push({
        id: `dq-name-${r.id}`,
        recordId: r.id,
        cxNumber: r.cxNumber,
        cxName: r.cxName,
        description: r.description,
        issueType: 'WARNING',
        category: 'INCONSISTENT_NAME',
        message: `Multiple customer name spellings recorded for ${r.cxNumber}: ${Array.from(names).join(' | ')}.`,
        recommendation: 'Confirm official legal customer title with accounts department.',
      });
    }

    // Missing ADM Code
    if (!r.admCode || r.admCode === 'NO-CODE' || r.admCode === 'Unassigned') {
      issues.push({
        id: `dq-adm-${r.id}`,
        recordId: r.id,
        cxNumber: r.cxNumber,
        cxName: r.cxName,
        description: r.description,
        issueType: 'WARNING',
        category: 'MISSING_ADM_CODE',
        message: 'Account manager code is unassigned or missing in register.',
        recommendation: 'Assign responsible ADM for portfolio recovery follow-up.',
      });
    }

    // Recovery exceeds amount
    if (r.recoveredAmount > r.amount) {
      issues.push({
        id: `dq-rec-exceeds-${r.id}`,
        recordId: r.id,
        cxNumber: r.cxNumber,
        cxName: r.cxName,
        description: r.description,
        issueType: 'ERROR',
        category: 'RECOVERY_EXCEEDS_AMOUNT',
        message: `Recorded recovered amount (${formatLKR(r.recoveredAmount)}) exceeds original cheque amount (${formatLKR(r.amount)}).`,
        recommendation: 'Audit receipt breakdown to ensure surcharge or multi-cheque payment was not misallocated.',
      });
    }

    // Incomplete follow-up when unresolved
    if (
      (r.recoveryStatus === 'CONTACT_REQUIRED' || r.recoveryStatus === 'NEW') &&
      !r.nextFollowUpDate
    ) {
      issues.push({
        id: `dq-followup-${r.id}`,
        recordId: r.id,
        cxNumber: r.cxNumber,
        cxName: r.cxName,
        description: r.description,
        issueType: 'WARNING',
        category: 'MISSING_FOLLOWUP',
        message: 'Active unresolved case has no scheduled next follow-up date.',
        recommendation: 'Assign recovery officer and set next target contact date.',
      });
    }
  });

  // Check potential duplicates
  dedupeMap.forEach((matchedRecords, key) => {
    if (matchedRecords.length > 1) {
      matchedRecords.forEach((r) => {
        issues.push({
          id: `dq-dup-${r.id}`,
          recordId: r.id,
          cxNumber: r.cxNumber,
          cxName: r.cxName,
          description: r.description,
          issueType: 'WARNING',
          category: 'SUSPECTED_DUPLICATE',
          message: `Identical matching cheque (${r.cxNumber}, ${r.description}, ${r.datePosted}, ${formatLKR(r.amount)}) recorded ${matchedRecords.length} times.`,
          recommendation: 'Investigate whether this is a legitimate representation or duplicate import row.',
        });
      });
    }
  });

  return issues;
}

export const DataQualityMonitorModal: React.FC<DataQualityMonitorModalProps> = ({
  records,
  isOpen,
  onClose,
  onSelectRecord,
}) => {
  if (!isOpen) return null;

  const issues = auditDataQuality(records);
  const errorsCount = issues.filter((i) => i.issueType === 'ERROR').length;
  const warningsCount = issues.filter((i) => i.issueType === 'WARNING').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-md text-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Data Quality & Analytical Integrity Monitor (Section 12)
              </h3>
              <p className="text-xs text-slate-500">
                Automated detection of inconsistencies, missing identifiers, and duplicate registers.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Strip */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50/70 border-b border-slate-200 text-xs">
          <div className="p-2.5 bg-white rounded border border-slate-200">
            <span className="text-slate-500 text-[10px] uppercase font-semibold">Total Assessed</span>
            <div className="text-base font-bold text-slate-900 font-mono mt-0.5">{records.length} records</div>
          </div>
          <div className="p-2.5 bg-red-50 rounded border border-red-200">
            <span className="text-red-700 text-[10px] uppercase font-semibold">Integrity Errors</span>
            <div className="text-base font-bold text-red-700 font-mono mt-0.5">{errorsCount}</div>
          </div>
          <div className="p-2.5 bg-amber-50 rounded border border-amber-200">
            <span className="text-amber-800 text-[10px] uppercase font-semibold">Integrity Warnings</span>
            <div className="text-base font-bold text-amber-800 font-mono mt-0.5">{warningsCount}</div>
          </div>
        </div>

        {/* Issue List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {issues.map((issue) => {
            const rec = records.find((r) => r.id === issue.recordId);
            return (
              <div
                key={issue.id}
                className={`p-3.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                  issue.issueType === 'ERROR'
                    ? 'bg-red-50/60 border-red-200'
                    : 'bg-amber-50/60 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${
                        issue.issueType === 'ERROR'
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {issue.issueType}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {issue.cxName} ({issue.cxNumber}) · #{issue.description}
                    </span>
                  </div>
                  {rec && (
                    <button
                      onClick={() => {
                        onClose();
                        onSelectRecord(rec);
                      }}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      <span>Fix in Record</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-slate-800 leading-relaxed">{issue.message}</p>
                <div className="text-[11px] text-slate-500">
                  <strong className="text-slate-700">Governance Recommendation:</strong> {issue.recommendation}
                </div>
              </div>
            );
          })}

          {issues.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-xs">
              <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <div className="font-semibold text-slate-900 text-sm">No Data Quality Defects Detected</div>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                All records satisfy customer identification, amount consistency, and follow-up standards.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs">
          <span className="text-slate-500">
            Section 12: Source records are never altered automatically. Adjustments require authorized user review.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
