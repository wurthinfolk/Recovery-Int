import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Database,
  Download,
  Users,
  Briefcase,
  FileSpreadsheet,
} from 'lucide-react';
import {
  parseSpreadsheetFile,
  ColumnMapping,
  ParseResult,
  CHEQUE_REGISTER_EXACT_HEADERS,
  downloadChequeRegisterTemplate,
  downloadChequeImportErrorReport,
} from '../services/importParser';
import {
  ADM_EXACT_HEADERS,
  CUSTOMER_EXACT_HEADERS,
  AdmColumnMapping,
  CustomerColumnMapping,
  AdmParseResult,
  CustomerParseResult,
  downloadAdmMasterTemplate,
  downloadCustomerMasterTemplate,
  downloadOrgImportErrorReport,
  parseAdmMasterFile,
  parseCustomerMasterFile,
} from '../services/orgImportParser';
import {
  ChequeRecord,
  ImportBatch,
  UserProfile,
  AnalyticalConfig,
  AdmMasterRecord,
  CustomerMasterRecord,
  TeamMaster,
  DivisionHeadMaster,
} from '../types';
import { formatLKR, DEFAULT_CONFIG } from '../services/analytics';
import { getImportBatches } from '../services/firebase';
import { canImportOrgMaster } from '../services/permissions';

export type ImportMode = 'ADM_MASTER' | 'CUSTOMER_MASTER' | 'CHEQUE_REGISTER';

interface DataImportProps {
  existingRecords: ChequeRecord[];
  existingAdms: AdmMasterRecord[];
  existingCustomers: CustomerMasterRecord[];
  existingTeams: TeamMaster[];
  existingDivisionHeads: DivisionHeadMaster[];
  initialMode?: ImportMode;
  onImportComplete: (records: ChequeRecord[], batch: ImportBatch) => Promise<void>;
  onAdmImportComplete: (
    adms: AdmMasterRecord[],
    teams: TeamMaster[],
    divisionHeads: DivisionHeadMaster[],
    batch: ImportBatch
  ) => Promise<void>;
  onCustomerImportComplete: (customers: CustomerMasterRecord[], batch: ImportBatch) => Promise<void>;
  onNavigateToOrgMaster?: (targetTab?: 'hierarchy' | 'adms' | 'customers') => void;
  onNavigateToChequeRegister?: () => void;
  currentUser: UserProfile;
  config?: AnalyticalConfig;
}

export const DataImport: React.FC<DataImportProps> = ({
  existingRecords,
  existingAdms,
  existingCustomers,
  existingTeams,
  existingDivisionHeads,
  initialMode = 'ADM_MASTER',
  onImportComplete,
  onAdmImportComplete,
  onCustomerImportComplete,
  onNavigateToOrgMaster,
  onNavigateToChequeRegister,
  currentUser,
  config = DEFAULT_CONFIG,
}) => {
  const allowOrgMasterImport = canImportOrgMaster(currentUser.role);
  const resolveAllowedMode = (requested: ImportMode): ImportMode =>
    allowOrgMasterImport ? requested : 'CHEQUE_REGISTER';

  const [mode, setMode] = useState<ImportMode>(() => resolveAllowedMode(initialMode));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [lastBatchSummary, setLastBatchSummary] = useState<ImportBatch | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);

  // Cheque Register Import state
  const [chequeResult, setChequeResult] = useState<ParseResult | null>(null);
  const [chequeMapping, setChequeMapping] = useState<ColumnMapping | null>(null);

  // ADM Master Import state
  const [admResult, setAdmResult] = useState<AdmParseResult | null>(null);
  const [admMapping, setAdmMapping] = useState<AdmColumnMapping | null>(null);

  // Customer Master Import state
  const [customerResult, setCustomerResult] = useState<CustomerParseResult | null>(null);
  const [customerMapping, setCustomerMapping] = useState<CustomerColumnMapping | null>(null);
  const [stageUnmappedCustomers, setStageUnmappedCustomers] = useState(false);

  useEffect(() => {
    setMode(resolveAllowedMode(initialMode));
    resetWizard();
  }, [initialMode, allowOrgMasterImport]);

  useEffect(() => {
    getImportBatches()
      .then((batches) => setImportBatches(batches))
      .catch(() => setImportBatches([]));
  }, [importDone]);

  const resetWizard = () => {
    setSelectedFile(null);
    setChequeResult(null);
    setChequeMapping(null);
    setAdmResult(null);
    setAdmMapping(null);
    setCustomerResult(null);
    setCustomerMapping(null);
    setImportDone(false);
    setLastBatchSummary(null);
    setErrorBanner(null);
    setStageUnmappedCustomers(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSwitchMode = (nextMode: ImportMode) => {
    setMode(nextMode);
    resetWizard();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (
    file: File,
    overrides?: {
      cheque?: Partial<ColumnMapping>;
      adm?: Partial<AdmColumnMapping>;
      customer?: Partial<CustomerColumnMapping>;
    }
  ) => {
    setSelectedFile(file);
    setParsing(true);
    setImportDone(false);
    setLastBatchSummary(null);
    setErrorBanner(null);

    try {
      if (mode === 'CHEQUE_REGISTER') {
        const res = await parseSpreadsheetFile(file, overrides?.cheque, existingRecords, config, {
          customersMaster: existingCustomers,
          admsMaster: existingAdms,
          defaultOfficer: currentUser.displayName,
        });
        setChequeResult(res);
        setChequeMapping(res.detectedMapping);
      } else if (mode === 'ADM_MASTER') {
        const res = await parseAdmMasterFile(
          file,
          existingAdms,
          existingTeams,
          existingDivisionHeads,
          currentUser,
          overrides?.adm
        );
        setAdmResult(res);
        setAdmMapping(res.detectedMapping);
      } else {
        const res = await parseCustomerMasterFile(
          file,
          existingCustomers,
          existingAdms,
          currentUser,
          overrides?.customer
        );
        // Preserve unmapped staging selection if user re-mapped columns after enabling it
        if (stageUnmappedCustomers) {
          res.rows = res.rows.map((r) =>
            r.status === 'UNMAPPED' && r.parsedRecord && r.customerId && r.customerName
              ? { ...r, approvedForCommit: true }
              : r
          );
        }
        setCustomerResult(res);
        setCustomerMapping(res.detectedMapping);
      }
    } catch (err) {
      console.error('File parsing error:', err);
      const detail = err instanceof Error ? err.message : '';
      setErrorBanner(
        `Failed to parse spreadsheet file${detail ? ` (${detail})` : ''}. Please verify it is a valid .xlsx, .xls, or .csv file.`
      );
    } finally {
      setParsing(false);
    }
  };

  // Toggle approval on ADM or Customer rows
  const toggleAdmRowApproval = (rowNumber: number) => {
    if (!admResult) return;
    setAdmResult({
      ...admResult,
      rows: admResult.rows.map((r) =>
        r.rowNumber === rowNumber ? { ...r, approvedForCommit: !r.approvedForCommit } : r
      ),
    });
  };

  const toggleCustomerRowApproval = (rowNumber: number) => {
    if (!customerResult) return;
    const nextRows = customerResult.rows.map((r) =>
      r.rowNumber === rowNumber ? { ...r, approvedForCommit: !r.approvedForCommit } : r
    );
    const stageableUnmapped = nextRows.filter(
      (r) => r.status === 'UNMAPPED' && r.parsedRecord && r.customerId && r.customerName
    );
    setStageUnmappedCustomers(
      stageableUnmapped.length > 0 && stageableUnmapped.every((r) => r.approvedForCommit)
    );
    setCustomerResult({
      ...customerResult,
      rows: nextRows,
    });
  };

  const handleToggleAllUnmappedCustomers = (checked: boolean) => {
    setStageUnmappedCustomers(checked);
    if (!customerResult) return;
    setCustomerResult({
      ...customerResult,
      rows: customerResult.rows.map((r) =>
        r.status === 'UNMAPPED' && r.parsedRecord && r.customerId && r.customerName
          ? { ...r, approvedForCommit: checked }
          : r
      ),
    });
  };

  // Commit Handlers
  const handleConfirmChequeImport = async () => {
    if (!chequeResult || chequeResult.validRows.length === 0) return;
    setImporting(true);
    setErrorBanner(null);
    try {
      const batch: ImportBatch = {
        id: chequeResult.batchId,
        importType: 'CHEQUE_REGISTER',
        fileName: chequeResult.fileName,
        totalRows: chequeResult.totalRows,
        importedCount: chequeResult.validRows.length,
        duplicateCount: chequeResult.duplicateRows.length,
        errorCount: chequeResult.invalidRows.length,
        totalAmount: chequeResult.totalValidAmount,
        importedAt: new Date().toISOString(),
        importedBy: currentUser.displayName,
        status: chequeResult.invalidRows.length > 0 ? 'PARTIAL' : 'SUCCESS',
        errors: chequeResult.invalidRows.map((r) => `Row ${r.rowNumber}: ${r.errors.join(', ')}`),
      };
      await onImportComplete(chequeResult.validRows, batch);
      setLastBatchSummary(batch);
      setImportDone(true);
    } catch (err) {
      console.error('Cheque import error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to commit cheque records to database.';
      setErrorBanner(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmAdmImport = async () => {
    if (!admResult) return;
    const rowsToCommit = admResult.rows.filter(
      (r) => r.parsedRecord && (r.status === 'NEW' || (r.status === 'UPDATED' && r.approvedForCommit))
    );
    if (rowsToCommit.length === 0) return;

    setImporting(true);
    setErrorBanner(null);
    try {
      const admsToSave = rowsToCommit.map((r) => r.parsedRecord!);
      const teamIdsUsed = new Set(admsToSave.map((a) => a.teamId));
      const headIdsUsed = new Set(admsToSave.map((a) => a.divisionHeadId));
      const teamsToSave = admResult.teamsToUpsert.filter((t) => teamIdsUsed.has(t.id));
      const headsToSave = admResult.divisionHeadsToUpsert.filter((h) => headIdsUsed.has(h.id));

      const newCount = rowsToCommit.filter((r) => r.status === 'NEW').length;
      const updatedCount = rowsToCommit.filter((r) => r.status === 'UPDATED').length;

      const batch: ImportBatch = {
        id: admResult.batchId,
        importType: 'ADM_MASTER',
        fileName: admResult.fileName,
        totalRows: admResult.summary.totalRecords,
        importedCount: newCount,
        updatedCount,
        duplicateCount: admResult.summary.duplicateRecords,
        errorCount: admResult.summary.invalidRecords,
        unmappedCount: admResult.summary.unmappedRelationships,
        reviewRequiredCount: admResult.summary.reviewRequiredRecords,
        totalAmount: 0,
        importedAt: new Date().toISOString(),
        importedBy: currentUser.displayName,
        status:
          admResult.summary.invalidRecords > 0 || admResult.summary.unmappedRelationships > 0
            ? 'PARTIAL'
            : 'SUCCESS',
        errors: admResult.rows
          .filter((r) => r.errors.length > 0)
          .map((r) => `Row ${r.rowNumber}: ${r.errors.join(', ')}`),
      };

      await onAdmImportComplete(admsToSave, teamsToSave, headsToSave, batch);
      setLastBatchSummary(batch);
      setImportDone(true);
    } catch (err) {
      console.error('ADM import error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save ADM Master records.';
      setErrorBanner(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmCustomerImport = async () => {
    if (!customerResult) return;
    const rowsToCommit = customerResult.rows.filter(
      (r) =>
        r.parsedRecord &&
        r.approvedForCommit &&
        (r.status === 'NEW' || r.status === 'UPDATED' || r.status === 'UNMAPPED')
    );
    if (rowsToCommit.length === 0) return;

    setImporting(true);
    setErrorBanner(null);
    try {
      const existingIdSet = new Set(existingCustomers.map((c) => c.customerId.trim().toLowerCase()));
      const customersToSave = rowsToCommit.map((r) => r.parsedRecord!);
      const newCount = rowsToCommit.filter(
        (r) =>
          r.status === 'NEW' ||
          (r.status === 'UNMAPPED' && !existingIdSet.has(r.customerId.trim().toLowerCase()))
      ).length;
      const updatedCount = rowsToCommit.filter(
        (r) =>
          r.status === 'UPDATED' ||
          (r.status === 'UNMAPPED' && existingIdSet.has(r.customerId.trim().toLowerCase()))
      ).length;
      const stagedUnmappedCount = rowsToCommit.filter((r) => r.status === 'UNMAPPED').length;

      const batch: ImportBatch = {
        id: customerResult.batchId,
        importType: 'CUSTOMER_MASTER',
        fileName: customerResult.fileName,
        totalRows: customerResult.summary.totalRecords,
        importedCount: newCount,
        updatedCount,
        duplicateCount: customerResult.summary.duplicateRecords,
        errorCount: customerResult.summary.invalidRecords,
        unmappedCount: customerResult.summary.unmappedRelationships,
        reviewRequiredCount:
          customerResult.summary.reviewRequiredRecords || stagedUnmappedCount,
        totalAmount: 0,
        importedAt: new Date().toISOString(),
        importedBy: currentUser.displayName,
        status:
          customerResult.summary.invalidRecords > 0 || customerResult.summary.unmappedRelationships > 0
            ? 'PARTIAL'
            : 'SUCCESS',
        errors: customerResult.rows
          .filter((r) => r.errors.length > 0 || r.status === 'UNMAPPED')
          .map((r) => `Row ${r.rowNumber}: ${[...r.errors, ...r.warnings].join(', ')}`),
      };

      await onCustomerImportComplete(customersToSave, batch);
      setLastBatchSummary(batch);
      setImportDone(true);
    } catch (err) {
      console.error('Customer import error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save Customer Master records.';
      setErrorBanner(msg);
    } finally {
      setImporting(false);
    }
  };

  const admCommitCandidatesCount = admResult
    ? admResult.rows.filter(
        (r) => r.parsedRecord && (r.status === 'NEW' || (r.status === 'UPDATED' && r.approvedForCommit))
      ).length
    : 0;

  const customerStageableUnmappedCount = customerResult
    ? customerResult.rows.filter(
        (r) => r.status === 'UNMAPPED' && r.parsedRecord && r.customerId && r.customerName
      ).length
    : 0;

  const customerCommitCandidatesCount = customerResult
    ? customerResult.rows.filter(
        (r) =>
          r.parsedRecord &&
          r.approvedForCommit &&
          (r.status === 'NEW' || r.status === 'UPDATED' || r.status === 'UNMAPPED')
      ).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Mode Switcher: Master Imports (Admin only) + Cheque Register */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {allowOrgMasterImport && (
            <>
              <button
                onClick={() => handleSwitchMode('ADM_MASTER')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                  mode === 'ADM_MASTER'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>1. Import ADM Master (9 Columns)</span>
              </button>

              <button
                onClick={() => handleSwitchMode('CUSTOMER_MASTER')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-colors ${
                  mode === 'CUSTOMER_MASTER'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>2. Import Customer Master (5 Columns)</span>
              </button>
            </>
          )}

          <button
            onClick={() => handleSwitchMode('CHEQUE_REGISTER')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-colors ${
              mode === 'CHEQUE_REGISTER'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {allowOrgMasterImport
                ? '3. Import Cheque Return Register'
                : 'Bulk Upload Cheque Return Register'}
            </span>
          </button>
        </div>

        {/* Exact Template Download Button */}
        {mode === 'ADM_MASTER' && (
          <button
            onClick={downloadAdmMasterTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            <span>Download ADM Template (.xlsx)</span>
          </button>
        )}
        {mode === 'CUSTOMER_MASTER' && (
          <button
            onClick={downloadCustomerMasterTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            <span>Download Customer Template (.xlsx)</span>
          </button>
        )}
        {mode === 'CHEQUE_REGISTER' && (
          <button
            onClick={downloadChequeRegisterTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            <span>Download Cheque Template (.xlsx)</span>
          </button>
        )}
      </div>


      {errorBanner && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button onClick={() => setErrorBanner(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Authoritative Structure Banner & File Drop Zone */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-1">
            {mode === 'ADM_MASTER' && 'Import ADM Master — Exact 9-Column Format'}
            {mode === 'CUSTOMER_MASTER' && 'Import Customer Master — Exact 5-Column Format'}
            {mode === 'CHEQUE_REGISTER' && 'Import Returned-Cheque Register (Register Format)'}
          </h3>

          {mode === 'ADM_MASTER' && (
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Authoritative columns in order:{' '}
                <span className="font-mono text-[11px] text-slate-900 font-semibold">
                  {ADM_EXACT_HEADERS.join(' | ')}
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                Uses <strong>ADM#</strong> as primary identifier; creates/maps Division-scoped Teams and Division Heads cleanly without case/whitespace duplicates; flags cross-division head matches and Emp ID conflicts; never silently overwrites existing Team/Division assignments.
              </p>
            </div>
          )}

          {mode === 'CUSTOMER_MASTER' && (
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Authoritative columns in order:{' '}
                <span className="font-mono text-[11px] text-slate-900 font-semibold">
                  {CUSTOMER_EXACT_HEADERS.join(' | ')}
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                Uses <strong>ADM#</strong> as the authoritative ADM link ({existingAdms.length} ADMs currently in Master). Validates Sales Rep Name against ADM Master (flags mismatches for review) and flags unknown ADM# without auto-creating ADMs.
              </p>
            </div>
          )}

          {mode === 'CHEQUE_REGISTER' && (
            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Matches the <strong>Register New Returned Cheque</strong> fields:{' '}
                <span className="font-mono text-[11px] text-slate-900 font-semibold">
                  {CHEQUE_REGISTER_EXACT_HEADERS.join(' | ')}
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                Upload Excel (.xlsx, .xls) or CSV. If <strong>CX NAME</strong>, <strong>ADM CODE</strong>, or <strong>ADM NAME</strong> are left blank, matching Customer Master ({existingCustomers.length}) &amp; ADM Master ({existingAdms.length}) values auto-fill automatically. Historical cheque fields are preserved cleanly.
              </p>
            </div>
          )}
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={handleFileDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-red-500 bg-red-50/40'
              : 'border-slate-300 hover:border-red-500 bg-slate-50/50 hover:bg-red-50/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <UploadCloud className="w-8 h-8 text-slate-400" />
          <div className="text-xs font-semibold text-slate-700">
            {selectedFile ? selectedFile.name : 'Click or drag & drop spreadsheet (.xlsx, .xls, .csv)'}
          </div>
          <p className="text-[11px] text-slate-400">
            Automatic column detection & manual column mapping enabled
          </p>
        </div>

        {parsing && (
          <div className="text-xs text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-600" />
            <span>Analyzing spreadsheet columns, validating relationships, and detecting conflicts...</span>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* ADM MASTER PARSE PREVIEW & VALIDATION                             */}
      {/* ================================================================= */}
      {mode === 'ADM_MASTER' && admResult && !importDone && (
        <div className="space-y-5">
          {/* 7-Metric Required Import Summary */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2.5">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Records</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">{admResult.summary.totalRecords}</div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-[10px] text-emerald-800 uppercase font-semibold">New Records</span>
              <div className="text-xl font-bold font-mono text-emerald-700 mt-1">{admResult.summary.newRecords}</div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-[10px] text-blue-800 uppercase font-semibold">Updated Records</span>
              <div className="text-xl font-bold font-mono text-blue-700 mt-1">{admResult.summary.updatedRecords}</div>
            </div>
            <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
              <span className="text-[10px] text-slate-700 uppercase font-semibold">Duplicates</span>
              <div className="text-xl font-bold font-mono text-slate-800 mt-1">{admResult.summary.duplicateRecords}</div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-[10px] text-red-800 uppercase font-semibold">Invalid Records</span>
              <div className="text-xl font-bold font-mono text-red-700 mt-1">{admResult.summary.invalidRecords}</div>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-[10px] text-orange-800 uppercase font-semibold">Unmapped Rel.</span>
              <div className="text-xl font-bold font-mono text-orange-700 mt-1">{admResult.summary.unmappedRelationships}</div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-[10px] text-amber-800 uppercase font-semibold">Manual Review</span>
              <div className="text-xl font-bold font-mono text-amber-800 mt-1">{admResult.summary.reviewRequiredRecords}</div>
            </div>
          </div>

          {admResult.rows.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">No ADM data rows were found in "{admResult.fileName}".</div>
                <p className="mt-0.5 text-amber-800">
                  Ensure the worksheet contains ADM rows below the header row (
                  <span className="font-mono">{ADM_EXACT_HEADERS.join(' | ')}</span>) and is saved properly.
                </p>
              </div>
            </div>
          )}

          {/* Manual Column Mapping */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">2. Column Mapping (9 Required ADM Fields)</h4>
              <button
                onClick={() =>
                  downloadOrgImportErrorReport(
                    'ADM_Master',
                    admResult.rows
                      .filter((r) => r.errors.length > 0 || r.warnings.length > 0 || r.status !== 'NEW')
                      .map((r) => ({
                        rowNumber: r.rowNumber,
                        status: r.status,
                        primaryId: r.empId,
                        name: r.salesRepName,
                        admNumber: r.admNumber,
                        errors: r.errors,
                        warnings: r.warnings,
                      }))
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Validation / Error Report (.xlsx)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
              {admMapping &&
                (Object.keys(admMapping) as Array<keyof AdmColumnMapping>).map((key) => (
                  <div key={key} className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">{key}</span>
                    <select
                      value={admMapping[key]}
                      onChange={(e) => {
                        const updated = { ...admMapping, [key]: e.target.value };
                        setAdmMapping(updated);
                        if (selectedFile) processFile(selectedFile, { adm: updated });
                      }}
                      className="mt-1 w-full p-1 border border-slate-300 rounded bg-white text-xs font-mono"
                    >
                      <option value="">-- Unmapped --</option>
                      {admResult.columnHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>
          </div>

          {/* Interactive Preview & Proposed Changes Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-xs text-slate-900">
                3. Preview, Conflict Checks & Proposed Updates ({admResult.rows.length} rows)
              </h4>
              <span className="text-[11px] text-slate-500">
                Existing Team/Division changes are locked by default — check Approve to authorize reassignment.
              </span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-2">Commit</th>
                    <th className="py-2 px-2">Row</th>
                    <th className="py-2 px-2">Classification</th>
                    <th className="py-2 px-2">Emp ID / ADM#</th>
                    <th className="py-2 px-2">Sales Rep. Name</th>
                    <th className="py-2 px-2">Team / Division / Head</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-3">Proposed Diffs / Validation Notices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admResult.rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={
                        r.status === 'INVALID' || r.status === 'UNMAPPED'
                          ? 'bg-red-50/40'
                          : r.requiresManualReview
                            ? 'bg-amber-50/40'
                            : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2 px-2 text-center">
                        {(r.status === 'NEW' || r.status === 'UPDATED') && r.parsedRecord ? (
                          <input
                            type="checkbox"
                            checked={r.approvedForCommit}
                            onChange={() => toggleAdmRowApproval(r.rowNumber)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'NEW'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'UPDATED'
                                ? 'bg-blue-100 text-blue-800'
                                : r.status === 'DUPLICATE'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono">
                        <div className="font-bold text-slate-900">{r.admNumber || '—'}</div>
                        <div className="text-[10px] text-slate-500">Emp: {r.empId || '—'}</div>
                      </td>
                      <td className="py-2 px-2 font-semibold text-slate-900">
                        {r.salesRepName || '—'}
                        <div className="text-[10px] font-normal text-slate-500">
                          {r.mobileNo} {r.email ? `· ${r.email}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-medium text-slate-800">{r.teamName || '—'}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.division || '—'} · Head: {r.divisionHeadName || '—'}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            r.employeeStatus === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {r.rawEmployeeStatus || r.employeeStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 space-y-1 text-[11px]">
                        {r.errors.map((err, i) => (
                          <div key={i} className="text-red-700 font-semibold">
                            • {err}
                          </div>
                        ))}
                        {r.fieldDiffs.map((d, i) => (
                          <div key={i} className="text-blue-800 font-mono text-[10px]">
                            Δ {d.field}: "{d.before}" → "{d.after}"
                          </div>
                        ))}
                        {r.warnings.map((w, i) => (
                          <div key={i} className="text-amber-800">
                            ⚠ {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Auto-creating/mapping <strong>{admResult.teamsToUpsert.length}</strong> Division-scoped Teams and{' '}
                <strong>{admResult.divisionHeadsToUpsert.length}</strong> Division Heads.
              </span>
              <button
                onClick={handleConfirmAdmImport}
                disabled={importing || admCommitCandidatesCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-md shadow-xs"
              >
                <Database className="w-4 h-4" />
                <span>
                  {importing
                    ? 'Saving ADM Hierarchy...'
                    : `Confirm & Import ${admCommitCandidatesCount} ADM Records`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CUSTOMER MASTER PARSE PREVIEW & VALIDATION                        */}
      {/* ================================================================= */}
      {mode === 'CUSTOMER_MASTER' && customerResult && !importDone && (
        <div className="space-y-5">
          {/* 7-Metric Required Import Summary */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2.5">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Records</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">{customerResult.summary.totalRecords}</div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-[10px] text-emerald-800 uppercase font-semibold">New Records</span>
              <div className="text-xl font-bold font-mono text-emerald-700 mt-1">{customerResult.summary.newRecords}</div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-[10px] text-blue-800 uppercase font-semibold">Updated Records</span>
              <div className="text-xl font-bold font-mono text-blue-700 mt-1">{customerResult.summary.updatedRecords}</div>
            </div>
            <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
              <span className="text-[10px] text-slate-700 uppercase font-semibold">Duplicates</span>
              <div className="text-xl font-bold font-mono text-slate-800 mt-1">{customerResult.summary.duplicateRecords}</div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-[10px] text-red-800 uppercase font-semibold">Invalid Records</span>
              <div className="text-xl font-bold font-mono text-red-700 mt-1">{customerResult.summary.invalidRecords}</div>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-[10px] text-orange-800 uppercase font-semibold">Unmapped ADM#</span>
              <div className="text-xl font-bold font-mono text-orange-700 mt-1">{customerResult.summary.unmappedRelationships}</div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-[10px] text-amber-800 uppercase font-semibold">Manual Review</span>
              <div className="text-xl font-bold font-mono text-amber-800 mt-1">{customerResult.summary.reviewRequiredRecords}</div>
            </div>
          </div>

          {/* Empty File / Missing Required Columns Diagnostics */}
          {customerResult.rows.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">No Customer data rows were found in "{customerResult.fileName}".</div>
                <p className="mt-0.5 text-amber-800">
                  Ensure the worksheet contains customer rows below the header row (
                  <span className="font-mono">{CUSTOMER_EXACT_HEADERS.join(' | ')}</span>) and is saved properly.
                </p>
              </div>
            </div>
          )}

          {customerMapping &&
            (!customerMapping.customerId || !customerMapping.name || !customerMapping.admNumber) && (
              <div className="p-4 bg-red-50 border border-red-300 rounded-lg text-xs text-red-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Required Customer columns were not auto-detected:</div>
                  <p className="mt-0.5">
                    Missing mapping for:{' '}
                    <span className="font-mono font-semibold">
                      {[
                        !customerMapping.customerId && 'Customer ID',
                        !customerMapping.name && 'Name',
                        !customerMapping.admNumber && 'ADM#',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    . Use the dropdowns in Step 2 below to map them manually.
                  </p>
                </div>
              </div>
            )}

          {/* Actionable Notice for Unmapped ADM# Rows */}
          {customerResult.summary.unmappedRelationships > 0 && (
            <div className="p-4 bg-orange-50 border border-orange-300 rounded-lg text-xs text-orange-950 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="font-bold">
                    {customerResult.summary.unmappedRelationships} Customer row(s) could not be linked to ADM Master
                  </div>
                  <p className="text-orange-900 leading-relaxed">
                    {existingAdms.length === 0 ? (
                      <>
                        <strong>ADM Master currently has 0 ADMs loaded.</strong> Upload your <strong>ADM Master</strong> first to auto-link Teams, Divisions &amp; Division Heads — OR check the option below to import valid rows flagged as{' '}
                        <span className="font-mono font-semibold">Requires ADM Mapping</span> (unknown ADMs are never auto-created).
                      </>
                    ) : (
                      <>
                        The uploaded <strong>ADM#</strong> values did not match any of the{' '}
                        <strong>{existingAdms.length}</strong> ADMs in ADM Master. Unknown ADMs are not auto-created; you can import these customers flagged as{' '}
                        <span className="font-mono font-semibold">Requires ADM Mapping</span> and map them in Organization Master.
                      </>
                    )}
                  </p>
                </div>
              </div>
              {customerStageableUnmappedCount > 0 && (
                <label className="flex items-center gap-2.5 p-2.5 bg-white/80 border border-orange-200 rounded cursor-pointer hover:bg-white">
                  <input
                    type="checkbox"
                    checked={stageUnmappedCustomers}
                    onChange={(e) => handleToggleAllUnmappedCustomers(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="font-semibold text-orange-950">
                    Include {customerStageableUnmappedCount} Customer(s) flagged as UNMAPPED_ADM (Requires ADM Mapping) in this import
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Manual Column Mapping */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-bold text-slate-900">2. Column Mapping (5 Required Customer Fields)</h4>
              <button
                onClick={() =>
                  downloadOrgImportErrorReport(
                    'Customer_Master',
                    customerResult.rows
                      .filter((r) => r.errors.length > 0 || r.warnings.length > 0 || r.status !== 'NEW')
                      .map((r) => ({
                        rowNumber: r.rowNumber,
                        status: r.status,
                        primaryId: r.customerId,
                        name: r.customerName,
                        admNumber: r.admNumber,
                        errors: r.errors,
                        warnings: r.warnings,
                      }))
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Validation / Error Report (.xlsx)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              {customerMapping &&
                (Object.keys(customerMapping) as Array<keyof CustomerColumnMapping>).map((key) => {
                  const isReqMissing =
                    (key === 'customerId' || key === 'name' || key === 'admNumber') &&
                    !customerMapping[key];
                  return (
                    <div
                      key={key}
                      className={`p-2 rounded border ${
                        isReqMissing ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                        {key}
                        {(key === 'customerId' || key === 'name' || key === 'admNumber') && ' *'}
                      </span>
                      <select
                        value={customerMapping[key]}
                        onChange={(e) => {
                          const updated = { ...customerMapping, [key]: e.target.value };
                          setCustomerMapping(updated);
                          if (selectedFile) processFile(selectedFile, { customer: updated });
                        }}
                        className="mt-1 w-full p-1 border border-slate-300 rounded bg-white text-xs font-mono"
                      >
                        <option value="">-- Unmapped --</option>
                        {customerResult.columnHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-xs text-slate-900">
                3. Customer-to-ADM Relationship Validation ({customerResult.rows.length} rows)
              </h4>
              {customerStageableUnmappedCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-orange-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageUnmappedCustomers}
                    onChange={(e) => handleToggleAllUnmappedCustomers(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span>
                    Include all <strong>UNMAPPED_ADM</strong> rows ({customerStageableUnmappedCount})
                  </span>
                </label>
              )}
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-2">Commit</th>
                    <th className="py-2 px-2">Row</th>
                    <th className="py-2 px-2">Classification</th>
                    <th className="py-2 px-2">Customer ID & Name</th>
                    <th className="py-2 px-2">ADM# (Auth)</th>
                    <th className="py-2 px-2">Uploaded vs ADM Master Rep</th>
                    <th className="py-2 px-2">Derived Hierarchy</th>
                    <th className="py-2 px-3">Validation Notices / Diffs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerResult.rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={
                        r.status === 'INVALID'
                          ? 'bg-red-50/40'
                          : r.status === 'UNMAPPED'
                            ? 'bg-orange-50/50'
                            : r.requiresManualReview
                              ? 'bg-amber-50/40'
                              : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2 px-2 text-center">
                        {(r.status === 'NEW' ||
                          r.status === 'UPDATED' ||
                          (r.status === 'UNMAPPED' && r.customerId && r.customerName)) &&
                        r.parsedRecord ? (
                          <input
                            type="checkbox"
                            checked={r.approvedForCommit}
                            onChange={() => toggleCustomerRowApproval(r.rowNumber)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'NEW'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'UPDATED'
                                ? 'bg-blue-100 text-blue-800'
                                : r.status === 'DUPLICATE'
                                  ? 'bg-slate-200 text-slate-700'
                                  : r.status === 'UNMAPPED'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-semibold text-slate-900">{r.customerName || '—'}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {r.customerId || '—'} · {r.customerPhone || 'No phone'}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-slate-900">{r.admNumber || '—'}</td>
                      <td className="py-2 px-2">
                        <div className="text-slate-800 font-medium">{r.authoritativeSalesRepName || '—'}</div>
                        {r.uploadedSalesRepName && r.uploadedSalesRepName !== r.authoritativeSalesRepName && (
                          <div className="text-[10px] text-amber-700">
                            Uploaded: "{r.uploadedSalesRepName}"
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-[11px] text-slate-600">
                        {r.parsedRecord && !r.parsedRecord.requiresAdmMapping ? (
                          <>
                            <div className="font-medium text-slate-800">{r.parsedRecord.teamName}</div>
                            <div className="text-[10px] text-slate-500">
                              {r.parsedRecord.division} · {r.parsedRecord.divisionHead}
                            </div>
                          </>
                        ) : (
                          <span className="text-orange-700 font-semibold">Requires ADM Mapping</span>
                        )}
                      </td>
                      <td className="py-2 px-3 space-y-1 text-[11px]">
                        {r.errors.map((err, i) => (
                          <div key={i} className="text-red-700 font-semibold">
                            • {err}
                          </div>
                        ))}
                        {r.fieldDiffs.map((d, i) => (
                          <div key={i} className="text-blue-800 font-mono text-[10px]">
                            Δ {d.field}: "{d.before}" → "{d.after}"
                          </div>
                        ))}
                        {r.warnings.map((w, i) => (
                          <div key={i} className="text-amber-800">
                            ⚠ {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Valid & approved rows link authoritatively via <strong>ADM#</strong> without creating unknown ADMs.
                {customerCommitCandidatesCount === 0 && customerStageableUnmappedCount > 0 && (
                  <span className="ml-1 text-orange-700 font-semibold">
                    (Check "Include {customerStageableUnmappedCount} UNMAPPED_ADM" above to enable import.)
                  </span>
                )}
              </span>
              <button
                onClick={handleConfirmCustomerImport}
                disabled={importing || customerCommitCandidatesCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-md shadow-xs"
              >
                <Database className="w-4 h-4" />
                <span>
                  {importing
                    ? 'Saving Customer Master...'
                    : `Confirm & Import ${customerCommitCandidatesCount} Customer Records`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* EXISTING CHEQUE REGISTER IMPORT (PRESERVED)                       */}
      {/* ================================================================= */}
      {mode === 'CHEQUE_REGISTER' && chequeResult && !importDone && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Rows</span>
              <div className="text-xl font-bold text-slate-900 font-mono mt-1">
                {chequeResult.totalRows}
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-[10px] text-emerald-800 uppercase font-semibold">Valid & Ready</span>
              <div className="text-xl font-bold text-emerald-700 font-mono mt-1">
                {chequeResult.validRows.length}
              </div>
              <span className="text-[10px] text-emerald-600 font-mono">
                {formatLKR(chequeResult.totalValidAmount)}
              </span>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-[10px] text-amber-800 uppercase font-semibold">Duplicates Flagged</span>
              <div className="text-xl font-bold text-amber-700 font-mono mt-1">
                {chequeResult.duplicateRows.length}
              </div>
              <span className="text-[10px] text-amber-600">Preserved / skipped</span>
            </div>

            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-[10px] text-red-800 uppercase font-semibold">Row Errors</span>
              <div className="text-xl font-bold text-red-700 font-mono mt-1">
                {chequeResult.invalidRows.length}
              </div>
              <span className="text-[10px] text-red-600">Missing fields / bad amounts</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-bold text-slate-900">2. Spreadsheet Column Mapping</h4>
              {(chequeResult.invalidRows.length > 0 || chequeResult.duplicateRows.length > 0) && (
                <button
                  onClick={() => downloadChequeImportErrorReport(chequeResult)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                >
                  <Download className="w-3.5 h-3.5 text-red-600" />
                  <span>Download Validation Report (.xlsx)</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {chequeMapping &&
                Object.keys(chequeMapping).map((key) => {
                  const fieldKey = key as keyof ColumnMapping;
                  return (
                    <div key={key} className="p-2.5 bg-slate-50 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold block uppercase">
                        {key}
                      </span>
                      <select
                        value={chequeMapping[fieldKey]}
                        onChange={(e) => {
                          const updated = { ...chequeMapping, [fieldKey]: e.target.value };
                          setChequeMapping(updated);
                          if (selectedFile) processFile(selectedFile, { cheque: updated });
                        }}
                        className="mt-1 w-full p-1 border border-slate-300 rounded bg-white text-xs font-mono"
                      >
                        <option value="">-- Unmapped --</option>
                        {chequeResult.columnHeaders.map((hdr) => (
                          <option key={hdr} value={hdr}>
                            {hdr}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
            </div>
          </div>

          {(chequeResult.invalidRows.length > 0 || chequeResult.duplicateRows.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
              <h4 className="text-sm font-bold text-slate-900 mb-2">
                Validation Notices & Row Exceptions
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto text-xs font-mono">
                {chequeResult.invalidRows.map((inv) => (
                  <div key={inv.rowNumber} className="p-2 bg-red-50 border border-red-200 rounded text-red-800">
                    <strong>Row {inv.rowNumber}:</strong> {inv.errors.join('; ')}
                  </div>
                ))}
                {chequeResult.duplicateRows.map((dup) => (
                  <div key={dup.rowNumber} className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
                    <strong>Row {dup.rowNumber}:</strong> {dup.duplicateReason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-900">
                Previewing Valid Records Ready for Database Ingestion ({chequeResult.validRows.length}
                {chequeResult.validRows.length > 50 ? ' — showing first 50' : ''})
              </h4>
              <span className="font-mono text-xs text-emerald-700 font-bold">
                Total: {formatLKR(chequeResult.totalValidAmount)}
              </span>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Date Posted / Eff.</th>
                    <th className="py-2 px-3">CX Number</th>
                    <th className="py-2 px-3">Customer Name</th>
                    <th className="py-2 px-3">ADM Code & Name</th>
                    <th className="py-2 px-3">Cheque Ref</th>
                    <th className="py-2 px-3 text-right">Amount (LKR)</th>
                    <th className="py-2 px-3">Normalized Reason</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chequeResult.validRows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                        <div>{r.datePosted}</div>
                        <div className="text-[10px] text-slate-400">Eff: {r.effectiveDate}</div>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-800 font-semibold">{r.cxNumber}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{r.cxName}</td>
                      <td className="py-2 px-3 text-slate-700">
                        <div className="font-mono text-[11px] font-semibold">{r.admCode}</div>
                        <div className="text-[10px] text-slate-500">{r.admName}</div>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700">{r.description}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatLKR(r.amount)}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{r.normalizedReason}</td>
                      <td className="py-2 px-3 text-[11px] font-mono text-slate-600">{r.recoveryStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                Authorized user: <strong>{currentUser.displayName}</strong> ({currentUser.role})
              </span>
              <button
                onClick={handleConfirmChequeImport}
                disabled={importing || chequeResult.validRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-md transition-colors shadow-xs"
              >
                <Database className="w-4 h-4" />
                <span>
                  {importing
                    ? 'Saving Cheque Records...'
                    : `Confirm & Commit ${chequeResult.validRows.length} Cheque Records`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Success State */}
      {importDone && (
        <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-900 text-center space-y-3">
          <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
          <h3 className="text-base font-bold text-emerald-950">Import Completed Successfully</h3>
          {lastBatchSummary && (
            <div className="text-xs font-mono text-emerald-900 bg-white/70 border border-emerald-200 rounded-md px-4 py-2 inline-block">
              File: {lastBatchSummary.fileName} · New: {lastBatchSummary.importedCount}
              {lastBatchSummary.updatedCount ? ` · Updated: ${lastBatchSummary.updatedCount}` : ''}
              {lastBatchSummary.unmappedCount ? ` · Flagged Unmapped ADM#: ${lastBatchSummary.unmappedCount}` : ''}
            </div>
          )}
          <p className="text-xs text-emerald-800 max-w-lg mx-auto">
            Records and organizational relationships have been saved with full audit tracking. Dashboards and intelligence views have been refreshed.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {onNavigateToOrgMaster && (mode === 'ADM_MASTER' || mode === 'CUSTOMER_MASTER') && (
              <button
                onClick={() =>
                  onNavigateToOrgMaster(mode === 'CUSTOMER_MASTER' ? 'customers' : 'adms')
                }
                className="px-4 py-2 bg-white border border-emerald-600 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold rounded"
              >
                View & Map in Organization Master
              </button>
            )}
            {onNavigateToChequeRegister && mode === 'CHEQUE_REGISTER' && (
              <button
                onClick={onNavigateToChequeRegister}
                className="px-4 py-2 bg-white border border-emerald-600 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold rounded"
              >
                View in Cheque Return Register
              </button>
            )}
            <button
              onClick={resetWizard}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded"
            >
              Import Another Spreadsheet File
            </button>
          </div>
        </div>
      )}

      {/* Import Batch History */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
            Spreadsheet Ingestion Batch History
          </h4>
          <span className="text-xs text-slate-500 font-mono">{importBatches.length} recorded batches</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">File Name</th>
                <th className="py-2.5 px-3">Imported At</th>
                <th className="py-2.5 px-3">Imported By</th>
                <th className="py-2.5 px-3 text-right">New / Updated</th>
                <th className="py-2.5 px-3 text-right">Amount / Notes</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {importBatches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-sans">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold">
                      {(b.importType || 'CHEQUE_REGISTER').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-800 font-semibold">{b.id}</td>
                  <td className="py-2 px-3 text-slate-700 font-sans">{b.fileName}</td>
                  <td className="py-2 px-3 text-slate-500">{new Date(b.importedAt).toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-700 font-sans">{b.importedBy}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-900 font-semibold">
                    +{b.importedCount} {b.updatedCount ? `/ Δ${b.updatedCount}` : ''}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-900">
                    {b.importType === 'ADM_MASTER' || b.importType === 'CUSTOMER_MASTER'
                      ? `${b.duplicateCount} dup · ${b.errorCount} err${b.unmappedCount ? ` · ${b.unmappedCount} unmapped` : ''}`
                      : formatLKR(b.totalAmount)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                        b.status === 'SUCCESS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}

              {importBatches.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-sans text-xs">
                    No spreadsheet batches imported yet.
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
