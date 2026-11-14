/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Excel (.xlsx, .xls) and CSV Returned-Cheque Register Ingestion & Normalization Engine
 */

import * as XLSX from 'xlsx';
import {
  ChequeRecord,
  AnalyticalConfig,
  CustomerMasterRecord,
  AdmMasterRecord,
  RecoveryStatus,
} from '../types';
import { normalizeReason, calculatePriority, DEFAULT_CONFIG } from './analytics';
import { extractSpreadsheetTable, matchHeader } from './orgImportParser';

export const CHEQUE_REGISTER_EXACT_HEADERS = [
  'Date-Posted',
  'Effective-Date',
  'CX NUMBER',
  'CX NAME',
  'ADM CODE',
  'ADM NAME',
  'DESCRIPTION',
  'AMOUNT',
  'RETURN REASON',
  'FINAL REMARK',
  'Recovery Status',
  'Assigned Recovery Officer',
] as const;

export interface ColumnMapping {
  datePosted: string;
  effectiveDate: string;
  cxNumber: string;
  cxName: string;
  admCode: string;
  admName: string;
  description: string;
  amount: string;
  returnReason: string;
  finalRemark: string;
  recoveryStatus: string;
  assignedOfficer: string;
  month: string;
}

export interface RowValidationResult {
  rowNumber: number;
  rawRow: Record<string, any>;
  parsedRecord: ChequeRecord | null;
  isValid: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  fileName: string;
  totalRows: number;
  validRows: ChequeRecord[];
  duplicateRows: RowValidationResult[];
  invalidRows: RowValidationResult[];
  warningsCount: number;
  totalValidAmount: number;
  columnHeaders: string[];
  detectedMapping: ColumnMapping;
  batchId: string;
}

export interface ChequeParseOptions {
  customersMaster?: CustomerMasterRecord[];
  admsMaster?: AdmMasterRecord[];
  defaultOfficer?: string;
}

/**
 * Standard column aliases aligned with the "Register New Returned Cheque" fields
 */
const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  datePosted: [
    'date-posted',
    'date posted',
    'posted date',
    'posted-date',
    'date_posted',
    'posting date',
    'post date',
  ],
  effectiveDate: [
    'effective-date',
    'effective date',
    'effective-date (cheque date)',
    'eff date',
    'value date',
    'cheque date',
    'chq date',
    'effective_date',
  ],
  cxNumber: [
    'cx number',
    'cx no',
    'cx_number',
    'cxnumber',
    'customer number',
    'customer id',
    'cust no',
    'client id',
    'cust code',
  ],
  cxName: [
    'cx name',
    'cx name (customer name)',
    'cx_name',
    'customer name',
    'client name',
    'company name',
    'customer',
  ],
  admCode: ['adm code', 'adm_code', 'adm#', 'adm #', 'adm number', 'rep code', 'rep id', 'adm id', 'admcode'],
  admName: [
    'adm name',
    'adm name (account manager)',
    'adm_name',
    'account manager',
    'sales rep name',
    'sales rep. name',
    'sales rep',
    'representative',
  ],
  description: [
    'description',
    'description (cheque ref / bank)',
    'desc',
    'cheque number',
    'cheque ref',
    'chq no',
    'cheque no',
    'reference',
    'chq number',
    'particulars',
  ],
  amount: [
    'amount',
    'amount (lkr)',
    'cheque amount',
    'chq amount',
    'value',
    'lkr amount',
    'sum',
  ],
  returnReason: [
    'return reason',
    'return_reason',
    'reason',
    'bounce reason',
    'return code',
    'rejection reason',
  ],
  finalRemark: [
    'final remark',
    'final remark (original note)',
    'final_remark',
    'remark',
    'remarks',
    'comments',
    'notes',
    'status remark',
  ],
  recoveryStatus: ['recovery status', 'recovery_status', 'status'],
  assignedOfficer: [
    'assigned recovery officer',
    'assigned officer',
    'recovery officer',
    'officer',
  ],
  month: ['month', 'mth', 'period', 'reporting month'],
};

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    datePosted: '',
    effectiveDate: '',
    cxNumber: '',
    cxName: '',
    admCode: '',
    admName: '',
    description: '',
    amount: '',
    returnReason: '',
    finalRemark: '',
    recoveryStatus: '',
    assignedOfficer: '',
    month: '',
  };

  (Object.keys(HEADER_ALIASES) as Array<keyof ColumnMapping>).forEach((field) => {
    mapping[field] = matchHeader(headers, HEADER_ALIASES[field]);
  });

  return mapping;
}

const MONTH_ABBR_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function formatLocalDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse Excel serial date or date string into YYYY-MM-DD without timezone off-by-one shifts
 */
export function parseDate(value: any): { dateStr: string; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { dateStr: '', error: 'Date is missing' };
  }

  // Handle Excel Serial Number (e.g. 45210)
  if (typeof value === 'number') {
    try {
      const utcDays = Math.floor(value - 25569);
      const dateInfo = new Date(utcDays * 86400 * 1000);
      if (isNaN(dateInfo.getTime())) {
        return { dateStr: '', error: `Invalid numeric date serial: ${value}` };
      }
      return { dateStr: dateInfo.toISOString().slice(0, 10) };
    } catch {
      return { dateStr: '', error: `Invalid numeric date serial: ${value}` };
    }
  }

  const str = String(value).trim();
  if (!str) return { dateStr: '', error: 'Empty date string' };

  // Pure numeric string Excel serial
  if (/^\d{5}$/.test(str)) {
    const serial = Number(str);
    if (serial > 20000 && serial < 80000) {
      const utcDays = Math.floor(serial - 25569);
      const dateInfo = new Date(utcDays * 86400 * 1000);
      if (!isNaN(dateInfo.getTime())) {
        return { dateStr: dateInfo.toISOString().slice(0, 10) };
      }
    }
  }

  // Check YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) {
    return { dateStr: `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}` };
  }

  // Check DD-MMM-YYYY or DD-MMM-YY (e.g. 13-Nov-2026 or 13-Nov-26)
  const dmmmy = str.match(/^(\d{1,2})[/\-.\s]+([A-Za-z]{3,9})[/\-.\s]+(\d{2,4})$/);
  if (dmmmy) {
    const mNum = MONTH_ABBR_MAP[dmmmy[2].slice(0, 3).toLowerCase()];
    if (mNum) {
      const year = dmmmy[3].length === 2 ? `20${dmmmy[3]}` : dmmmy[3];
      return { dateStr: `${year}-${mNum}-${dmmmy[1].padStart(2, '0')}` };
    }
  }

  // Check DD/MM/YYYY or MM/DD/YYYY or DD/MM/YY
  const slashDate = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashDate) {
    const p1 = parseInt(slashDate[1], 10);
    const p2 = parseInt(slashDate[2], 10);
    const year = slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3];
    // If second part > 12, it is MM/DD/YYYY (from Excel US formatted cell); otherwise default DD/MM/YYYY
    if (p2 > 12 && p1 <= 12) {
      return {
        dateStr: `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`,
      };
    }
    return {
      dateStr: `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`,
    };
  }

  // General Date parse using local calendar fields
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return { dateStr: formatLocalDateYmd(parsed) };
  }

  return { dateStr: '', error: `Unrecognized date format: "${str}"` };
}

/**
 * Parse numeric amount safely removing commas, spaces, currency codes
 */
export function parseAmount(value: any): { amount: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { amount: 0, error: 'Amount is required' };
  }

  if (typeof value === 'number') {
    if (isNaN(value) || value <= 0) {
      return { amount: 0, error: `Invalid amount value: ${value}` };
    }
    return { amount: Math.round(value * 100) / 100 };
  }

  const rawStr = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(rawStr);
  if (isNaN(num) || num <= 0) {
    return { amount: 0, error: `Invalid currency amount: "${value}"` };
  }

  return { amount: Math.round(num * 100) / 100 };
}

const VALID_RECOVERY_STATUSES: RecoveryStatus[] = [
  'NEW',
  'UNDER_INVESTIGATION',
  'CONTACT_REQUIRED',
  'PAYMENT_PROMISED',
  'AWAITING_REPLACEMENT',
  'PARTIALLY_RECOVERED',
  'RECOVERED',
  'ESCALATED',
  'CLOSED_OTHER',
];

function parseRecoveryStatus(raw: string): {
  status: RecoveryStatus;
  recognized: boolean;
  warning?: string;
} {
  const clean = raw.trim();
  if (!clean) return { status: 'NEW', recognized: true };

  const normalized = clean
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if ((VALID_RECOVERY_STATUSES as string[]).includes(normalized)) {
    return { status: normalized as RecoveryStatus, recognized: true };
  }

  // Friendly aliases matching dropdown labels in Register New Returned Cheque
  if (normalized.includes('NEW')) return { status: 'NEW', recognized: true };
  if (normalized.includes('INVESTIGAT')) return { status: 'UNDER_INVESTIGATION', recognized: true };
  if (normalized.includes('CONTACT')) return { status: 'CONTACT_REQUIRED', recognized: true };
  if (normalized.includes('PROMIS')) return { status: 'PAYMENT_PROMISED', recognized: true };
  if (normalized.includes('REPLACEMENT')) return { status: 'AWAITING_REPLACEMENT', recognized: true };
  if (normalized.includes('PARTIAL')) return { status: 'PARTIALLY_RECOVERED', recognized: true };
  if (normalized.includes('RECOVER') || normalized.includes('SETTLED')) {
    return { status: 'RECOVERED', recognized: true };
  }
  if (normalized.includes('ESCALAT')) return { status: 'ESCALATED', recognized: true };
  if (normalized.includes('CLOSED')) return { status: 'CLOSED_OTHER', recognized: true };

  return {
    status: 'NEW',
    recognized: false,
    warning: `Unrecognized Recovery Status "${raw}" (defaulted to NEW)`,
  };
}

function deriveMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  const mIdx = parseInt(m || '', 10) - 1;
  const monthNames = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];
  if (mIdx >= 0 && mIdx < 12 && y) {
    return `${monthNames[mIdx]} ${y}`;
  }
  return dateStr.slice(0, 7);
}

/**
 * Downloadable Excel template matching the exact "Register New Returned Cheque" format
 */
export function downloadChequeRegisterTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...CHEQUE_REGISTER_EXACT_HEADERS]]);
  ws['!cols'] = CHEQUE_REGISTER_EXACT_HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Cheque_Register');

  const guide = XLSX.utils.aoa_to_sheet([
    ['Column Name (Exact Order)', 'Required', 'Description & Auto-Lookup Rules'],
    ['Date-Posted', 'Yes', 'YYYY-MM-DD or DD/MM/YYYY (Default financial reporting date)'],
    ['Effective-Date', 'Recommended', 'Cheque value date (defaults to Date-Posted if blank)'],
    ['CX NUMBER', 'Yes', 'Customer ID / CX Number (e.g. CX-10492)'],
    ['CX NAME', 'Yes*', 'Customer Name (*auto-filled from Customer Master if blank and CX NUMBER exists)'],
    ['ADM CODE', 'Optional*', 'ADM# (*auto-loaded from Customer Master if left blank)'],
    ['ADM NAME', 'Optional*', 'ADM Sales Rep Name (*auto-loaded from ADM/Customer Master if blank)'],
    ['DESCRIPTION', 'Yes', 'Cheque number / Bank reference (e.g. CHQ-884920 / Commercial Bank)'],
    ['AMOUNT', 'Yes', 'Cheque amount in LKR (positive number)'],
    ['RETURN REASON', 'Yes', 'Bank return reason (e.g. Refer to Drawer, Funds Insufficient)'],
    ['FINAL REMARK', 'Optional', 'Original recovery remark or follow-up note'],
    ['Recovery Status', 'Optional', 'NEW (default), UNDER_INVESTIGATION, CONTACT_REQUIRED, PAYMENT_PROMISED, AWAITING_REPLACEMENT, PARTIALLY_RECOVERED, RECOVERED, ESCALATED'],
    ['Assigned Recovery Officer', 'Optional', 'Assigned officer name (defaults to importing user if blank)'],
  ]);
  guide['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 76 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Template_Guide');

  XLSX.writeFile(wb, 'WURTH_Returned_Cheque_Register_Template.xlsx');
}

/**
 * Download Excel validation/error report for Cheque Register upload
 */
export function downloadChequeImportErrorReport(parseResult: ParseResult): void {
  const rows: Array<Record<string, any>> = [];

  for (const inv of parseResult.invalidRows) {
    rows.push({
      'Row #': inv.rowNumber,
      Classification: 'INVALID',
      'CX NUMBER': String(inv.rawRow[parseResult.detectedMapping.cxNumber] || ''),
      'CX NAME': String(inv.rawRow[parseResult.detectedMapping.cxName] || ''),
      DESCRIPTION: String(inv.rawRow[parseResult.detectedMapping.description] || ''),
      AMOUNT: String(inv.rawRow[parseResult.detectedMapping.amount] || ''),
      Errors: inv.errors.join(' | '),
      Warnings: inv.warnings.join(' | '),
    });
  }

  for (const dup of parseResult.duplicateRows) {
    rows.push({
      'Row #': dup.rowNumber,
      Classification: 'DUPLICATE',
      'CX NUMBER': String(dup.rawRow[parseResult.detectedMapping.cxNumber] || ''),
      'CX NAME': String(dup.rawRow[parseResult.detectedMapping.cxName] || ''),
      DESCRIPTION: String(dup.rawRow[parseResult.detectedMapping.description] || ''),
      AMOUNT: String(dup.rawRow[parseResult.detectedMapping.amount] || ''),
      Errors: '',
      Warnings: [dup.duplicateReason, ...dup.warnings].filter(Boolean).join(' | '),
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 16 },
    { wch: 28 },
    { wch: 26 },
    { wch: 14 },
    { wch: 45 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Cheque_Validation_Report');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Cheque_Register_Validation_Report_${dateStr}.xlsx`);
}

/**
 * Parse an uploaded File (Excel/CSV) into structured ChequeRecord entries
 */
export async function parseSpreadsheetFile(
  file: File,
  customMapping?: Partial<ColumnMapping>,
  existingRecords: ChequeRecord[] = [],
  config: AnalyticalConfig = DEFAULT_CONFIG,
  options: ChequeParseOptions = {}
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const extracted = extractSpreadsheetTable(workbook, Object.values(HEADER_ALIASES));

  if (extracted.columnHeaders.length === 0 || extracted.rawRows.length === 0) {
    return {
      fileName: file.name,
      totalRows: 0,
      validRows: [],
      duplicateRows: [],
      invalidRows: [],
      warningsCount: 0,
      totalValidAmount: 0,
      columnHeaders: extracted.columnHeaders,
      detectedMapping: detectColumnMapping(extracted.columnHeaders),
      batchId: `BATCH-${Date.now()}`,
    };
  }

  const columnHeaders = extracted.columnHeaders;
  const detected = detectColumnMapping(columnHeaders);
  const mapping: ColumnMapping = { ...detected, ...(customMapping || {}) };

  const batchId = `BATCH-${Date.now()}`;
  const validRows: ChequeRecord[] = [];
  const duplicateRows: RowValidationResult[] = [];
  const invalidRows: RowValidationResult[] = [];
  let warningsCount = 0;
  let totalValidAmount = 0;

  // Build Customer Master & ADM Master lookup maps for automatic enrichment when optional fields are blank
  const customerMasterMap = new Map<string, CustomerMasterRecord>();
  for (const cm of options.customersMaster || []) {
    const key = (cm.customerId || '').trim().toUpperCase();
    if (key) customerMasterMap.set(key, cm);
  }

  const admMasterMap = new Map<string, AdmMasterRecord>();
  for (const am of options.admsMaster || []) {
    const key = (am.admNumber || '').trim().toUpperCase();
    if (key) admMasterMap.set(key, am);
  }

  // Pre-compute existing duplicate keys & customer return history counts
  const existingKeys = new Set<string>();
  const customerPrevCounts = new Map<string, number>();
  for (const r of existingRecords) {
    const cx = (r.cxNumber || '').trim().toUpperCase();
    const desc = (r.description || '').trim().toUpperCase();
    const amtRounded = Math.round((r.amount || 0) * 100);
    existingKeys.add(`${cx}|${desc}|${r.datePosted}|${amtRounded}`);
    if (cx) {
      customerPrevCounts.set(cx, (customerPrevCounts.get(cx) || 0) + 1);
    }
  }

  const seenFileKeys = new Set<string>();
  const nowIso = new Date().toISOString();
  const baseStamp = Date.now().toString(36).toUpperCase();

  extracted.rawRows.forEach((entry, idx) => {
    const row = entry.data;
    const rowNum = entry.excelRowNumber;
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawMonth = mapping.month ? String(row[mapping.month] || '').trim() : '';
    const rawDatePosted = mapping.datePosted ? row[mapping.datePosted] : '';
    const rawEffectiveDate = mapping.effectiveDate ? row[mapping.effectiveDate] : '';
    const rawCxNumber = mapping.cxNumber ? String(row[mapping.cxNumber] || '').trim().toUpperCase() : '';
    const rawCxName = mapping.cxName ? String(row[mapping.cxName] || '').trim() : '';
    const rawAdmCode = mapping.admCode ? String(row[mapping.admCode] || '').trim().toUpperCase() : '';
    const rawAdmName = mapping.admName ? String(row[mapping.admName] || '').trim() : '';
    const rawDesc = mapping.description ? String(row[mapping.description] || '').trim() : '';
    const rawAmount = mapping.amount ? row[mapping.amount] : '';
    const rawReason = mapping.returnReason ? String(row[mapping.returnReason] || '').trim() : '';
    const rawRemark = mapping.finalRemark ? String(row[mapping.finalRemark] || '').trim() : '';
    const rawStatus = mapping.recoveryStatus ? String(row[mapping.recoveryStatus] || '').trim() : '';
    const rawOfficer = mapping.assignedOfficer ? String(row[mapping.assignedOfficer] || '').trim() : '';

    // Auto-fill CX NAME / ADM CODE / ADM NAME from Customer & ADM Master if blank
    const cmMatch = rawCxNumber ? customerMasterMap.get(rawCxNumber) : undefined;
    const resolvedCxName = rawCxName || (cmMatch?.customerName || '').trim();

    let resolvedAdmCode = rawAdmCode;
    if (!resolvedAdmCode && cmMatch?.admNumber) {
      const candidateAdm = cmMatch.admNumber.trim().toUpperCase();
      if (candidateAdm && candidateAdm !== 'UNMAPPED' && candidateAdm !== 'NO-CODE') {
        resolvedAdmCode = candidateAdm;
      }
    }

    const amMatch = resolvedAdmCode ? admMasterMap.get(resolvedAdmCode) : undefined;
    const resolvedAdmName =
      rawAdmName ||
      (amMatch?.salesRepName || '').trim() ||
      (cmMatch?.salesRepName && cmMatch.salesRepName !== 'Unassigned'
        ? cmMatch.salesRepName.trim()
        : '');

    // 1. Mandatory Fields Validation (aligned with Register New Returned Cheque)
    if (!rawCxNumber) errors.push('Missing mandatory CX NUMBER');
    if (!resolvedCxName) errors.push('Missing mandatory CX NAME');
    if (!rawDesc) errors.push('Missing DESCRIPTION or Cheque Reference');
    if (!rawReason) errors.push('Missing RETURN REASON');

    // 2. Dates Validation
    const parsedPosted = parseDate(rawDatePosted);
    if (parsedPosted.error) errors.push(`Date-Posted: ${parsedPosted.error}`);

    let parsedEffective = parseDate(rawEffectiveDate);
    if (!rawEffectiveDate) {
      parsedEffective = parsedPosted;
      warnings.push('Effective-Date was empty; defaulted to Date-Posted');
      warningsCount++;
    } else if (parsedEffective.error) {
      warnings.push(`Effective-Date warning: ${parsedEffective.error}`);
      warningsCount++;
    }

    if (parsedPosted.dateStr && parsedEffective.dateStr) {
      if (parsedEffective.dateStr < parsedPosted.dateStr) {
        warnings.push(
          `Effective-Date (${parsedEffective.dateStr}) precedes Date-Posted (${parsedPosted.dateStr})`
        );
        warningsCount++;
      } else if (parsedEffective.dateStr > parsedPosted.dateStr) {
        warnings.push(
          `Effective-Date (${parsedEffective.dateStr}) is later than Date-Posted (${parsedPosted.dateStr})`
        );
        warningsCount++;
      }

      if (rawMonth) {
        const postedMonthNum = parsedPosted.dateStr.slice(5, 7);
        const postedYear = parsedPosted.dateStr.slice(0, 4);
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const expectedMonthAbbr = monthNames[parseInt(postedMonthNum, 10) - 1];
        if (expectedMonthAbbr && !rawMonth.toUpperCase().includes(expectedMonthAbbr)) {
          warnings.push(
            `Source Month "${rawMonth}" does not match Date-Posted month (${expectedMonthAbbr} ${postedYear})`
          );
          warningsCount++;
        }
      }
    }

    // 3. Amount Validation
    const parsedAmt = parseAmount(rawAmount);
    if (parsedAmt.error) errors.push(parsedAmt.error);

    // 4. Recovery Status Normalization
    const statusParsed = parseRecoveryStatus(rawStatus);
    if (statusParsed.warning) {
      warnings.push(statusParsed.warning);
      warningsCount++;
    }

    // 5. Duplicate Detection (CX NUMBER + DESCRIPTION + DATE-POSTED + AMOUNT)
    const amtRounded = Math.round(parsedAmt.amount * 100);
    const recordDedupeKey = `${rawCxNumber}|${rawDesc.toUpperCase()}|${parsedPosted.dateStr}|${amtRounded}`;
    let isDuplicate = false;
    let duplicateReason = '';

    if (seenFileKeys.has(recordDedupeKey)) {
      isDuplicate = true;
      duplicateReason =
        'Duplicate row within the same uploaded spreadsheet (matching CX, Cheque Ref, Date, and Amount)';
    } else {
      seenFileKeys.add(recordDedupeKey);
      if (existingKeys.has(recordDedupeKey)) {
        isDuplicate = true;
        duplicateReason = `Matches existing registered record (${rawCxNumber}, ${rawDesc}, ${parsedPosted.dateStr}, LKR ${parsedAmt.amount})`;
      }
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      invalidRows.push({
        rowNumber: rowNum,
        rawRow: row,
        parsedRecord: null,
        isValid: false,
        isDuplicate,
        duplicateReason,
        errors,
        warnings,
      });
      return;
    }

    if (isDuplicate) {
      duplicateRows.push({
        rowNumber: rowNum,
        rawRow: row,
        parsedRecord: null,
        isValid: true,
        isDuplicate: true,
        duplicateReason,
        errors: [],
        warnings: [duplicateReason, ...warnings],
      });
      warningsCount++;
      return;
    }

    // 6. Construct Valid ChequeRecord (identical structure to Register New Returned Cheque)
    const normReason = normalizeReason(rawReason);
    const id = `CHQ-${baseStamp}-${String(idx + 1).padStart(4, '0')}`;
    const prevCount = customerPrevCounts.get(rawCxNumber) || 0;
    customerPrevCounts.set(rawCxNumber, prevCount + 1);

    const priorityCalc = calculatePriority(
      {
        amount: parsedAmt.amount,
        remainingAmount: statusParsed.status === 'RECOVERED' ? 0 : parsedAmt.amount,
        recoveryStatus: statusParsed.status,
      },
      prevCount,
      config
    );

    const recoveredAmt = statusParsed.status === 'RECOVERED' ? parsedAmt.amount : 0;
    const remainingAmt = Math.max(0, parsedAmt.amount - recoveredAmt);
    const actorName = options.defaultOfficer || 'import.wizard';

    const record: ChequeRecord = {
      id,
      month: rawMonth || deriveMonthLabel(parsedPosted.dateStr),
      datePosted: parsedPosted.dateStr,
      effectiveDate: parsedEffective.dateStr || parsedPosted.dateStr,
      cxNumber: rawCxNumber,
      cxName: resolvedCxName,
      admCode: resolvedAdmCode || 'NO-CODE',
      admName: resolvedAdmName || 'Unassigned ADM',
      description: rawDesc,
      amount: parsedAmt.amount,
      returnReason: rawReason,
      normalizedReason: normReason,
      finalRemark: rawRemark,
      recoveryStatus: statusParsed.status,
      priority: priorityCalc.priority,
      priorityScore: priorityCalc.score,
      priorityExplanation: priorityCalc.explanation,
      assignedOfficer: rawOfficer || options.defaultOfficer || 'Unassigned',
      recoveredAmount: recoveredAmt,
      remainingAmount: remainingAmt,
      nextAction:
        statusParsed.status === 'RECOVERED'
          ? 'Recovery settled'
          : 'Initiate customer recovery contact',
      nextFollowUpDate: '',
      lastContactDate: '',
      resolutionDate: statusParsed.status === 'RECOVERED' ? parsedPosted.dateStr : '',
      resolutionEvidence: '',
      recoveryNotes: rawRemark ? `Original remark: ${rawRemark}` : '',
      createdAt: nowIso,
      createdBy: actorName,
      updatedAt: nowIso,
      updatedBy: actorName,
      batchId,
      isSample: false,
    };

    validRows.push(record);
    totalValidAmount += record.amount;
  });

  return {
    fileName: file.name,
    totalRows: extracted.rawRows.length,
    validRows,
    duplicateRows,
    invalidRows,
    warningsCount,
    totalValidAmount,
    columnHeaders,
    detectedMapping: mapping,
    batchId,
  };
}
