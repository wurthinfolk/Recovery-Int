/**
 * WÜRTH Lanka — Organization Management & Master Data Import Engine
 * Handles Authoritative 9-Column ADM Master & 5-Column Customer Master Uploads
 */

import * as XLSX from 'xlsx';
import {
  AdmMasterRecord,
  CustomerMasterRecord,
  TeamMaster,
  DivisionHeadMaster,
  EmployeeStatus,
  UserProfile,
} from '../types';

export const ADM_EXACT_HEADERS = [
  'Emp ID',
  'ADM#',
  'Sales Rep. Name',
  'Team',
  'Employee Status',
  'Division',
  'Division Head',
  'Mobile No',
  'E-mail',
] as const;

export const CUSTOMER_EXACT_HEADERS = [
  'Customer ID',
  'Name',
  'ADM#',
  'Sales Rep Name',
  'Customer phone',
] as const;

export interface AdmColumnMapping {
  empId: string;
  admNumber: string;
  salesRepName: string;
  team: string;
  employeeStatus: string;
  division: string;
  divisionHead: string;
  mobileNo: string;
  email: string;
}

export interface CustomerColumnMapping {
  customerId: string;
  name: string;
  admNumber: string;
  salesRepName: string;
  customerPhone: string;
}

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface AdmRowAssessment {
  rowNumber: number;
  rawRow: Record<string, any>;
  status: 'NEW' | 'UPDATED' | 'DUPLICATE' | 'INVALID' | 'UNMAPPED';
  requiresManualReview: boolean;
  hasOrgAssignmentChange: boolean;
  approvedForCommit: boolean;
  empId: string;
  admNumber: string;
  salesRepName: string;
  teamName: string;
  employeeStatus: EmployeeStatus;
  rawEmployeeStatus: string;
  division: string;
  divisionHeadName: string;
  mobileNo: string;
  email: string;
  errors: string[];
  warnings: string[];
  fieldDiffs: FieldDiff[];
  parsedRecord: AdmMasterRecord | null;
  resolvedTeam: TeamMaster | null;
  resolvedDivisionHead: DivisionHeadMaster | null;
}

export interface AdmParseResult {
  fileName: string;
  batchId: string;
  columnHeaders: string[];
  detectedMapping: AdmColumnMapping;
  rows: AdmRowAssessment[];
  summary: {
    totalRecords: number;
    newRecords: number;
    updatedRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
    unmappedRelationships: number;
    reviewRequiredRecords: number;
  };
  teamsToUpsert: TeamMaster[];
  divisionHeadsToUpsert: DivisionHeadMaster[];
}

export interface CustomerRowAssessment {
  rowNumber: number;
  rawRow: Record<string, any>;
  status: 'NEW' | 'UPDATED' | 'DUPLICATE' | 'INVALID' | 'UNMAPPED';
  requiresManualReview: boolean;
  hasAdmAssignmentChange: boolean;
  approvedForCommit: boolean;
  customerId: string;
  customerName: string;
  admNumber: string;
  uploadedSalesRepName: string;
  authoritativeSalesRepName: string;
  customerPhone: string;
  errors: string[];
  warnings: string[];
  fieldDiffs: FieldDiff[];
  parsedRecord: CustomerMasterRecord | null;
}

export interface CustomerParseResult {
  fileName: string;
  batchId: string;
  columnHeaders: string[];
  detectedMapping: CustomerColumnMapping;
  rows: CustomerRowAssessment[];
  summary: {
    totalRecords: number;
    newRecords: number;
    updatedRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
    unmappedRelationships: number;
    reviewRequiredRecords: number;
  };
}

// ============================================================
// Normalization & Deterministic ID Helpers
// ============================================================

export function normalizeDisplayText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

export function canonicalKey(val: unknown): string {
  return normalizeDisplayText(val).toLowerCase();
}

function slugify(val: string): string {
  return canonicalKey(val)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'unknown';
}

export function makeAdmDocId(admNumber: string): string {
  return `ADM_${slugify(admNumber)}`;
}

export function makeCustomerDocId(customerId: string): string {
  return `CUST_${slugify(customerId)}`;
}

export function makeTeamDocId(division: string, teamName: string): string {
  return `TEAM_${slugify(division)}__${slugify(teamName)}`;
}

export function makeDivisionHeadDocId(headName: string, _division?: string): string {
  return `DH_${slugify(headName)}`;
}

export function normalizeEmployeeStatus(raw: string): {
  status: EmployeeStatus;
  recognized: boolean;
  warning?: string;
} {
  const clean = canonicalKey(raw);
  if (!clean) {
    return {
      status: 'ACTIVE',
      recognized: false,
      warning: 'Employee Status is blank',
    };
  }
  if (['active', 'act', 'employed', 'confirmed', 'probation', 'permanent', 'yes', 'y', '1'].includes(clean)) {
    return { status: 'ACTIVE', recognized: true };
  }
  if (
    ['inactive', 'in-active', 'resigned', 'terminated', 'left', 'retired', 'suspended', 'separated', 'no', 'n', '0'].includes(
      clean
    )
  ) {
    return { status: 'INACTIVE', recognized: true };
  }
  return {
    status: 'ACTIVE',
    recognized: false,
    warning: `Unrecognized Employee Status "${raw}" (defaulted to ACTIVE; please review)`,
  };
}

// ============================================================
// Downloadable Excel Templates & Error Reports
// ============================================================

export function downloadAdmMasterTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...ADM_EXACT_HEADERS]]);
  ws['!cols'] = ADM_EXACT_HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, 'ADM_Master');

  const guide = XLSX.utils.aoa_to_sheet([
    ['Column Name (Exact Order)', 'Required', 'Description & Rules'],
    ['Emp ID', 'Yes', 'Unique employee identifier (checked for conflicts against ADM#)'],
    ['ADM#', 'Yes', 'Authoritative unique ADM business identifier (e.g. ADM-01)'],
    ['Sales Rep. Name', 'Yes', 'Full display name of the Account Development Manager'],
    ['Team', 'Yes', 'Assigned Team name (uniquely scoped within Division)'],
    ['Employee Status', 'Yes', 'Active or Inactive (Resigned/Terminated treated as Inactive)'],
    ['Division', 'Yes', 'Division name governing the Team'],
    ['Division Head', 'Yes', 'Responsible Division Head name (cross-division duplicates flagged)'],
    ['Mobile No', 'Recommended', 'Contact mobile number'],
    ['E-mail', 'Recommended', 'Corporate email address'],
  ]);
  guide['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Template_Guide');

  XLSX.writeFile(wb, 'WURTH_ADM_Master_Import_Template.xlsx');
}

export function downloadCustomerMasterTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...CUSTOMER_EXACT_HEADERS]]);
  ws['!cols'] = CUSTOMER_EXACT_HEADERS.map((h) => ({ wch: Math.max(h.length + 6, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Customer_Master');

  const guide = XLSX.utils.aoa_to_sheet([
    ['Column Name (Exact Order)', 'Required', 'Description & Rules'],
    ['Customer ID', 'Yes', 'Unique Customer identifier (maps to CX NUMBER in cheque register)'],
    ['Name', 'Yes', 'Official customer / business display name'],
    ['ADM#', 'Yes', 'Authoritative ADM number linking customer to ADM Master'],
    ['Sales Rep Name', 'Validation', 'Validated against ADM Master name (mismatches flagged for review)'],
    ['Customer phone', 'Recommended', 'Customer primary contact phone number'],
  ]);
  guide['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Template_Guide');

  XLSX.writeFile(wb, 'WURTH_Customer_Master_Import_Template.xlsx');
}

export function downloadOrgImportErrorReport(
  titlePrefix: string,
  rows: Array<{
    rowNumber: number;
    status: string;
    primaryId: string;
    name: string;
    admNumber: string;
    errors: string[];
    warnings: string[];
  }>
): void {
  const exportData = rows.map((r) => ({
    'Row #': r.rowNumber,
    Classification: r.status,
    'Primary ID': r.primaryId,
    Name: r.name,
    'ADM#': r.admNumber,
    'Errors (Blocking)': r.errors.join(' | '),
    'Warnings / Manual Review': r.warnings.join(' | '),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 45 },
    { wch: 55 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Validation_Report');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${titlePrefix}_Validation_Report_${dateStr}.xlsx`);
}

// ============================================================
// Column Auto-Detection (ADM & Customer)
// ============================================================

const ADM_HEADER_ALIASES: Record<keyof AdmColumnMapping, string[]> = {
  empId: ['emp id', 'emp_id', 'empid', 'employee id', 'emp no', 'emp #', 'staff id', 'staff no'],
  admNumber: ['adm#', 'adm #', 'adm no', 'adm no.', 'adm number', 'adm code', 'adm_code', 'adm_number', 'adm id', 'adm'],
  salesRepName: ['sales rep. name', 'sales rep name', 'sales rep', 'sales representative', 'adm name', 'representative name', 'rep name'],
  team: ['team', 'team name', 'sales team'],
  employeeStatus: ['employee status', 'emp status', 'status', 'employment status'],
  division: ['division', 'division name', 'div'],
  divisionHead: ['division head', 'div head', 'division_head', 'head of division'],
  mobileNo: ['mobile no', 'mobile no.', 'mobile', 'mobile number', 'phone', 'contact no', 'contact number'],
  email: ['e-mail', 'email', 'email address', 'mail'],
};

const CUSTOMER_HEADER_ALIASES: Record<keyof CustomerColumnMapping, string[]> = {
  customerId: [
    'customer id',
    'customer_id',
    'customerid',
    'cx number',
    'cx no',
    'cx id',
    'cx #',
    'cust id',
    'cust no',
    'cust code',
    'customer code',
    'customer number',
    'customer no',
    'client id',
    'account number',
  ],
  name: ['name', 'customer name', 'cust name', 'cx name', 'client name', 'company name', 'customer', 'outlet name'],
  admNumber: ['adm#', 'adm #', 'adm no', 'adm no.', 'adm number', 'adm code', 'adm_code', 'adm_number', 'adm id', 'adm'],
  salesRepName: ['sales rep name', 'sales rep. name', 'sales rep', 'sales representative', 'adm name', 'representative name', 'rep name', 'rep'],
  customerPhone: [
    'customer phone',
    'customer phone no',
    'customer phone number',
    'phone',
    'phone no',
    'phone number',
    'mobile',
    'mobile no',
    'mobile number',
    'contact number',
    'contact no',
    'contact',
    'telephone',
    'tel',
    'tel no',
  ],
};

function cleanHeaderLabel(val: unknown): string {
  return String(val ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeHeaderForMatch(val: string): string {
  return cleanHeaderLabel(val)
    .toLowerCase()
    .replace(/[:*]+$/g, '')
    .trim();
}

function compactAlphanumericKey(val: unknown): string {
  return canonicalKey(val).replace(/[^a-z0-9]/g, '');
}

export function matchHeader(headers: string[], aliases: string[]): string {
  const normalized = headers.map((h) => ({
    original: h,
    clean: normalizeHeaderForMatch(h),
    compact: normalizeHeaderForMatch(h).replace(/[^a-z0-9#]/g, ''),
  }));
  // 1. Exact alias match
  for (const alias of aliases) {
    const cleanAlias = normalizeHeaderForMatch(alias);
    const exact = normalized.find((h) => h.clean === cleanAlias);
    if (exact) return exact.original;
  }
  // 2. Punctuation-normalized match (ignoring dots, underscores, hyphens, spaces)
  for (const alias of aliases) {
    const compactAlias = normalizeHeaderForMatch(alias).replace(/[^a-z0-9#]/g, '');
    const exactCompact = normalized.find((h) => h.compact === compactAlias);
    if (exactCompact) return exactCompact.original;
  }
  // 3. Substring match (guarded against ultra-short aliases like 'adm' or 'rep' matching unintended headers)
  for (const alias of aliases) {
    const cleanAlias = normalizeHeaderForMatch(alias);
    if (cleanAlias.length < 4) continue;
    const partial = normalized.find((h) => h.clean.includes(cleanAlias));
    if (partial) return partial.original;
  }
  return '';
}

function scoreHeaderRow(cells: string[], aliasGroups: string[][]): number {
  let score = 0;
  for (const group of aliasGroups) {
    if (matchHeader(cells, group)) score += 1;
  }
  return score;
}

export interface ExtractedSheetData {
  sheetName: string;
  columnHeaders: string[];
  rawRows: Array<{ excelRowNumber: number; data: Record<string, string> }>;
}

/**
 * Extracts tabular records cleanly from Excel (.xlsx/.xls) or CSV workbooks:
 * - Prefers populated data sheets over guide/report sheets
 * - Auto-detects the true header row within the top 15 non-empty rows (survives title banners / blank top rows)
 * - Strips UTF-8 BOM, deduplicates headers, preserves formatted text (e.g. leading-zero phones/IDs), and skips blank rows
 */
export function extractSpreadsheetTable(
  workbook: XLSX.WorkBook,
  aliasGroups: string[][]
): ExtractedSheetData {
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return { sheetName: '', columnHeaders: [], rawRows: [] };
  }

  const prioritizedSheets = [...sheetNames].sort((a, b) => {
    const aGuide = /template_guide|guide|instructions|validation_report/i.test(a) ? 1 : 0;
    const bGuide = /template_guide|guide|instructions|validation_report/i.test(b) ? 1 : 0;
    return aGuide - bGuide;
  });

  let bestResult: ExtractedSheetData & { score: number } = {
    sheetName: prioritizedSheets[0],
    columnHeaders: [],
    rawRows: [],
    score: -1,
  };

  for (const name of prioritizedSheets) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;

    // raw: false preserves cell formatting (e.g. "0771234567" instead of 771234567 or 7.71e+8)
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (!matrix || matrix.length === 0) continue;

    // Find best header row in top 15 rows
    let headerIdx = -1;
    let bestRowScore = -1;
    let firstMultiCellIdx = -1;

    const scanLimit = Math.min(matrix.length, 15);
    for (let i = 0; i < scanLimit; i++) {
      const rowCells = (matrix[i] || []).map((c) => cleanHeaderLabel(c));
      const nonEmptyCount = rowCells.filter(Boolean).length;
      if (nonEmptyCount === 0) continue;
      if (firstMultiCellIdx === -1 && nonEmptyCount >= 2) {
        firstMultiCellIdx = i;
      }
      const rowScore = scoreHeaderRow(rowCells, aliasGroups);
      if (rowScore > bestRowScore) {
        bestRowScore = rowScore;
        headerIdx = i;
      }
    }

    if (headerIdx === -1 || bestRowScore === 0) {
      headerIdx = firstMultiCellIdx !== -1 ? firstMultiCellIdx : 0;
    }

    const headerCellsRaw = (matrix[headerIdx] || []).map((c) => cleanHeaderLabel(c));
    // Trim trailing empty columns from header row
    let lastNonEmptyCol = -1;
    for (let c = headerCellsRaw.length - 1; c >= 0; c--) {
      if (headerCellsRaw[c]) {
        lastNonEmptyCol = c;
        break;
      }
    }
    if (lastNonEmptyCol === -1) continue;

    const usedHeaderCounts = new Map<string, number>();
    const columnHeaders: string[] = [];
    const colIndices: number[] = [];

    for (let c = 0; c <= lastNonEmptyCol; c++) {
      const base = headerCellsRaw[c];
      if (!base) continue;
      const seen = usedHeaderCounts.get(base) || 0;
      usedHeaderCounts.set(base, seen + 1);
      const uniqueHeader = seen === 0 ? base : `${base} (${seen + 1})`;
      columnHeaders.push(uniqueHeader);
      colIndices.push(c);
    }

    if (columnHeaders.length === 0) continue;

    const rawRows: Array<{ excelRowNumber: number; data: Record<string, string> }> = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const rowArr = matrix[r] || [];
      const rowObj: Record<string, string> = {};
      let hasAnyValue = false;

      for (let i = 0; i < columnHeaders.length; i++) {
        const colIdx = colIndices[i];
        const cellVal = cleanHeaderLabel(rowArr[colIdx]);
        rowObj[columnHeaders[i]] = cellVal;
        if (cellVal) hasAnyValue = true;
      }

      if (hasAnyValue) {
        rawRows.push({ excelRowNumber: r + 1, data: rowObj });
      }
    }

    const sheetScore = bestRowScore * 1000 + rawRows.length;
    if (sheetScore > bestResult.score && (rawRows.length > 0 || bestRowScore > 0)) {
      bestResult = {
        sheetName: name,
        columnHeaders,
        rawRows,
        score: sheetScore,
      };
    }

    // Stop early if strong header match and rows found
    if (bestRowScore >= 3 && rawRows.length > 0) {
      break;
    }
  }

  return {
    sheetName: bestResult.sheetName,
    columnHeaders: bestResult.columnHeaders,
    rawRows: bestResult.rawRows,
  };
}

export function detectAdmColumnMapping(headers: string[]): AdmColumnMapping {
  return {
    empId: matchHeader(headers, ADM_HEADER_ALIASES.empId),
    admNumber: matchHeader(headers, ADM_HEADER_ALIASES.admNumber),
    salesRepName: matchHeader(headers, ADM_HEADER_ALIASES.salesRepName),
    team: matchHeader(headers, ADM_HEADER_ALIASES.team),
    employeeStatus: matchHeader(headers, ADM_HEADER_ALIASES.employeeStatus),
    division: matchHeader(headers, ADM_HEADER_ALIASES.division),
    divisionHead: matchHeader(headers, ADM_HEADER_ALIASES.divisionHead),
    mobileNo: matchHeader(headers, ADM_HEADER_ALIASES.mobileNo),
    email: matchHeader(headers, ADM_HEADER_ALIASES.email),
  };
}

export function detectCustomerColumnMapping(headers: string[]): CustomerColumnMapping {
  return {
    customerId: matchHeader(headers, CUSTOMER_HEADER_ALIASES.customerId),
    name: matchHeader(headers, CUSTOMER_HEADER_ALIASES.name),
    admNumber: matchHeader(headers, CUSTOMER_HEADER_ALIASES.admNumber),
    salesRepName: matchHeader(headers, CUSTOMER_HEADER_ALIASES.salesRepName),
    customerPhone: matchHeader(headers, CUSTOMER_HEADER_ALIASES.customerPhone),
  };
}

// ============================================================
// 1. ADM Master Bulk Upload Parser
// ============================================================

export async function parseAdmMasterFile(
  file: File,
  existingAdms: AdmMasterRecord[],
  existingTeams: TeamMaster[],
  existingDivisionHeads: DivisionHeadMaster[],
  currentUser: UserProfile,
  customMapping?: Partial<AdmColumnMapping>
): Promise<AdmParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const extracted = extractSpreadsheetTable(workbook, Object.values(ADM_HEADER_ALIASES));
  const rawRows = extracted.rawRows;
  const batchId = `BATCH-ADM-${Date.now()}`;

  if (rawRows.length === 0) {
    const columnHeaders = extracted.columnHeaders;
    const detected = detectAdmColumnMapping(columnHeaders);
    return {
      fileName: file.name,
      batchId,
      columnHeaders,
      detectedMapping: { ...detected, ...(customMapping || {}) },
      rows: [],
      summary: {
        totalRecords: 0,
        newRecords: 0,
        updatedRecords: 0,
        duplicateRecords: 0,
        invalidRecords: 0,
        unmappedRelationships: 0,
        reviewRequiredRecords: 0,
      },
      teamsToUpsert: [],
      divisionHeadsToUpsert: [],
    };
  }

  const columnHeaders = extracted.columnHeaders;
  const detected = detectAdmColumnMapping(columnHeaders);
  const mapping: AdmColumnMapping = { ...detected, ...(customMapping || {}) };
  const now = new Date().toISOString();

  // Build quick lookup maps from existing master data
  const existingAdmByNum = new Map<string, AdmMasterRecord>();
  const existingAdmByEmp = new Map<string, AdmMasterRecord>();
  for (const a of existingAdms) {
    existingAdmByNum.set(canonicalKey(a.admNumber), a);
    if (a.empId) existingAdmByEmp.set(canonicalKey(a.empId), a);
  }

  // Track Division Heads globally by canonical head name so one person overseeing multiple divisions
  // is consolidated into a single DivisionHeadMaster with all assigned divisions combined.
  const dedupeDivisions = (divs: string[]): string[] => {
    const map = new Map<string, string>();
    for (const raw of divs) {
      const clean = normalizeDisplayText(raw);
      if (!clean) continue;
      const k = canonicalKey(clean);
      if (!map.has(k)) map.set(k, clean);
    }
    return Array.from(map.values());
  };

  const divHeadMap = new Map<string, DivisionHeadMaster>();
  for (const dh of existingDivisionHeads) {
    const cName = canonicalKey(dh.name);
    const existing = divHeadMap.get(cName);
    if (existing) {
      divHeadMap.set(cName, {
        ...existing,
        id: makeDivisionHeadDocId(existing.name),
        divisions: dedupeDivisions([...(existing.divisions || []), ...(dh.divisions || [])]),
        verificationStatus:
          existing.verificationStatus === 'NEEDS_VERIFICATION' &&
          !(existing.verificationReason || '').toLowerCase().includes('multiple divisions')
            ? 'NEEDS_VERIFICATION'
            : 'VERIFIED',
        verificationReason: undefined,
      });
    } else {
      divHeadMap.set(cName, {
        ...dh,
        id: makeDivisionHeadDocId(dh.name),
        divisions: dedupeDivisions(dh.divisions || []),
      });
    }
  }

  const teamMap = new Map<string, TeamMaster>();
  for (const t of existingTeams) {
    teamMap.set(t.canonicalKey || `${canonicalKey(t.division)}::${canonicalKey(t.teamName)}`, { ...t });
  }

  // First pass: register all Division Head names and collect all divisions they oversee in this file
  const headNameToDivisions = new Map<string, string[]>();
  for (const { data: row } of rawRows) {
    const rawDiv = normalizeDisplayText(row[mapping.division]);
    const rawHead = normalizeDisplayText(row[mapping.divisionHead]);
    if (rawDiv && rawHead) {
      const cName = canonicalKey(rawHead);
      if (!headNameToDivisions.has(cName)) headNameToDivisions.set(cName, []);
      headNameToDivisions.get(cName)!.push(rawDiv);
    }
  }

  const seenAdmInFile = new Map<string, { rowNum: number; empId: string }>();
  const seenEmpInFile = new Map<string, { rowNum: number; admNumber: string }>();

  const assessedRows: AdmRowAssessment[] = [];
  const upsertedTeams = new Map<string, TeamMaster>();
  const upsertedHeads = new Map<string, DivisionHeadMaster>();

  rawRows.forEach(({ excelRowNumber: rowNumber, data: row }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldDiffs: FieldDiff[] = [];

    const empId = normalizeDisplayText(row[mapping.empId]);
    const admNumber = normalizeDisplayText(row[mapping.admNumber]);
    const salesRepName = normalizeDisplayText(row[mapping.salesRepName]);
    const teamName = normalizeDisplayText(row[mapping.team]);
    const rawEmployeeStatus = normalizeDisplayText(row[mapping.employeeStatus]);
    const division = normalizeDisplayText(row[mapping.division]);
    const divisionHeadName = normalizeDisplayText(row[mapping.divisionHead]);
    const mobileNo = normalizeDisplayText(row[mapping.mobileNo]);
    const email = normalizeDisplayText(row[mapping.email]);

    // Required field validations
    if (!empId) errors.push('Missing Emp ID');
    if (!admNumber) errors.push('Missing ADM#');
    if (!salesRepName) errors.push('Missing Sales Rep. Name');
    if (!teamName) errors.push('Missing Team');
    if (!division) errors.push('Missing Division');
    if (!divisionHeadName) errors.push('Missing Division Head');

    // Employee Status validation
    const statusCheck = normalizeEmployeeStatus(rawEmployeeStatus);
    if (!statusCheck.recognized && statusCheck.warning) {
      warnings.push(statusCheck.warning);
    }

    // Contact validations (soft warnings)
    if (!mobileNo) warnings.push('Mobile No is blank');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`E-mail "${email}" has an unusual format`);
    }

    // Within-file duplicate & Emp ID / ADM# conflict detection
    const cAdm = canonicalKey(admNumber);
    const cEmp = canonicalKey(empId);
    let isFileDuplicate = false;
    let hasConflict = false;

    if (cAdm) {
      const prevAdm = seenAdmInFile.get(cAdm);
      if (prevAdm) {
        if (canonicalKey(prevAdm.empId) !== cEmp) {
          errors.push(`Conflicting Emp ID "${empId}" for ADM# "${admNumber}" (row ${prevAdm.rowNum} used Emp ID "${prevAdm.empId}")`);
          hasConflict = true;
        } else {
          isFileDuplicate = true;
          warnings.push(`Duplicate ADM# "${admNumber}" within uploaded file (first seen at row ${prevAdm.rowNum})`);
        }
      } else {
        seenAdmInFile.set(cAdm, { rowNum: rowNumber, empId });
      }
    }

    if (cEmp) {
      const prevEmp = seenEmpInFile.get(cEmp);
      if (prevEmp && canonicalKey(prevEmp.admNumber) !== cAdm) {
        errors.push(`Conflicting ADM# "${admNumber}" for Emp ID "${empId}" (row ${prevEmp.rowNum} used ADM# "${prevEmp.admNumber}")`);
        hasConflict = true;
      } else if (!prevEmp) {
        seenEmpInFile.set(cEmp, { rowNum: rowNumber, admNumber });
      }
    }

    // Cross-check Emp ID vs existing master DB
    const existingByAdm = cAdm ? existingAdmByNum.get(cAdm) : undefined;
    const existingByEmp = cEmp ? existingAdmByEmp.get(cEmp) : undefined;
    if (existingByEmp && canonicalKey(existingByEmp.admNumber) !== cAdm) {
      errors.push(`Emp ID "${empId}" is already assigned to existing ADM# "${existingByEmp.admNumber}"`);
      hasConflict = true;
    }
    if (existingByAdm && existingByAdm.empId && cEmp && canonicalKey(existingByAdm.empId) !== cEmp) {
      warnings.push(`Emp ID differs from existing master record (existing: "${existingByAdm.empId}", uploaded: "${empId}")`);
      hasConflict = true;
    }

    // Blocking errors check
    if (errors.length > 0) {
      assessedRows.push({
        rowNumber,
        rawRow: row,
        status: !teamName || !division || !divisionHeadName ? 'UNMAPPED' : 'INVALID',
        requiresManualReview: true,
        hasOrgAssignmentChange: false,
        approvedForCommit: false,
        empId,
        admNumber,
        salesRepName,
        teamName,
        employeeStatus: statusCheck.status,
        rawEmployeeStatus,
        division,
        divisionHeadName,
        mobileNo,
        email,
        errors,
        warnings,
        fieldDiffs: [],
        parsedRecord: null,
        resolvedTeam: null,
        resolvedDivisionHead: null,
      });
      return;
    }

    if (isFileDuplicate) {
      assessedRows.push({
        rowNumber,
        rawRow: row,
        status: 'DUPLICATE',
        requiresManualReview: false,
        hasOrgAssignmentChange: false,
        approvedForCommit: false,
        empId,
        admNumber,
        salesRepName,
        teamName,
        employeeStatus: statusCheck.status,
        rawEmployeeStatus,
        division,
        divisionHeadName,
        mobileNo,
        email,
        errors: [],
        warnings,
        fieldDiffs: [],
        parsedRecord: null,
        resolvedTeam: null,
        resolvedDivisionHead: null,
      });
      return;
    }

    // Resolve Division Head uniquely by canonical person name (merging all responsible Divisions)
    const cDiv = canonicalKey(division);
    const cHead = canonicalKey(divisionHeadName);
    const fileDivisionsForHead = headNameToDivisions.get(cHead) || [division];

    let resolvedHead = divHeadMap.get(cHead);
    if (!resolvedHead) {
      resolvedHead = {
        id: makeDivisionHeadDocId(divisionHeadName),
        name: divisionHeadName,
        canonicalName: cHead,
        divisions: dedupeDivisions(fileDivisionsForHead),
        verificationStatus: 'VERIFIED',
        createdAt: now,
        updatedAt: now,
      };
      divHeadMap.set(cHead, resolvedHead);
    } else {
      const mergedDivisions = dedupeDivisions([
        ...(resolvedHead.divisions || []),
        division,
        ...fileDivisionsForHead,
      ]);
      const isCrossDivWarning =
        (resolvedHead.verificationReason || '').toLowerCase().includes('multiple divisions') ||
        (resolvedHead.verificationReason || '').toLowerCase().includes('another division');
      resolvedHead = {
        ...resolvedHead,
        id: makeDivisionHeadDocId(resolvedHead.name || divisionHeadName),
        divisions: mergedDivisions,
        verificationStatus:
          resolvedHead.verificationStatus === 'NEEDS_VERIFICATION' && !isCrossDivWarning
            ? 'NEEDS_VERIFICATION'
            : 'VERIFIED',
        verificationReason:
          resolvedHead.verificationStatus === 'NEEDS_VERIFICATION' && !isCrossDivWarning
            ? resolvedHead.verificationReason
            : undefined,
        updatedAt: now,
      };
      divHeadMap.set(cHead, resolvedHead);
    }

    // Resolve Team scoped uniquely within Division
    const tKey = `${cDiv}::${canonicalKey(teamName)}`;
    let resolvedTeam = teamMap.get(tKey);
    if (!resolvedTeam) {
      resolvedTeam = {
        id: makeTeamDocId(division, teamName),
        teamName,
        canonicalKey: tKey,
        division,
        divisionHeadId: resolvedHead.id,
        divisionHeadName: resolvedHead.name,
        createdAt: now,
        updatedAt: now,
      };
      teamMap.set(tKey, resolvedTeam);
    } else {
      resolvedTeam = {
        ...resolvedTeam,
        divisionHeadId: resolvedHead.id,
        divisionHeadName: resolvedHead.name,
        updatedAt: now,
      };
      teamMap.set(tKey, resolvedTeam);
    }

    upsertedHeads.set(resolvedHead.id, resolvedHead);
    upsertedTeams.set(resolvedTeam.id, resolvedTeam);

    // Compare against existing ADM# record
    let rowStatus: 'NEW' | 'UPDATED' | 'DUPLICATE' = 'NEW';
    let hasOrgAssignmentChange = false;

    if (existingByAdm) {
      const checkDiff = (field: string, beforeVal: string, afterVal: string, isOrgField = false) => {
        if (canonicalKey(beforeVal) !== canonicalKey(afterVal)) {
          fieldDiffs.push({ field, before: beforeVal || '(blank)', after: afterVal || '(blank)' });
          if (isOrgField) hasOrgAssignmentChange = true;
        }
      };

      checkDiff('Emp ID', existingByAdm.empId, empId);
      checkDiff('Sales Rep. Name', existingByAdm.salesRepName, salesRepName);
      checkDiff('Team', existingByAdm.teamName, resolvedTeam.teamName, true);
      checkDiff('Division', existingByAdm.division, division, true);
      checkDiff('Division Head', existingByAdm.divisionHeadName, resolvedHead.name, true);
      checkDiff('Employee Status', existingByAdm.employeeStatus, statusCheck.status);
      checkDiff('Mobile No', existingByAdm.mobileNo, mobileNo);
      checkDiff('E-mail', existingByAdm.email, email);

      if (fieldDiffs.length === 0) {
        rowStatus = 'DUPLICATE';
        warnings.push(`No changes vs existing ADM# "${existingByAdm.admNumber}"`);
      } else {
        rowStatus = 'UPDATED';
        if (hasOrgAssignmentChange) {
          warnings.push(
            `Proposed Team/Division reassignment on existing ADM# "${existingByAdm.admNumber}" — requires explicit authorization.`
          );
        }
      }
    }

    const requiresManualReview =
      warnings.length > 0 || hasConflict || hasOrgAssignmentChange;

    // Do NOT silently replace Team or Division assignment on existing ADM#
    const approvedForCommit =
      rowStatus === 'NEW' ? true : rowStatus === 'UPDATED' ? !hasOrgAssignmentChange && !hasConflict : false;

    const historyEntry =
      existingByAdm && hasOrgAssignmentChange
        ? [
            {
              changedAt: now,
              changedBy: currentUser.displayName,
              previousTeamId: existingByAdm.teamId,
              previousTeamName: existingByAdm.teamName,
              previousDivision: existingByAdm.division,
              previousDivisionHeadName: existingByAdm.divisionHeadName,
              newTeamId: resolvedTeam.id,
              newTeamName: resolvedTeam.teamName,
              newDivision: division,
              newDivisionHeadName: resolvedHead.name,
            },
          ]
        : [];

    const parsedRecord: AdmMasterRecord = {
      id: existingByAdm?.id || makeAdmDocId(admNumber),
      empId,
      admNumber,
      salesRepName,
      teamId: resolvedTeam.id,
      teamName: resolvedTeam.teamName,
      division,
      divisionHeadId: resolvedHead.id,
      divisionHeadName: resolvedHead.name,
      employeeStatus: statusCheck.status,
      rawEmployeeStatus: rawEmployeeStatus || statusCheck.status,
      mobileNo,
      email,
      verificationStatus: hasConflict ? 'NEEDS_VERIFICATION' : 'VERIFIED',
      verificationReason: hasConflict ? warnings.join('; ') : undefined,
      assignmentHistory: [...(existingByAdm?.assignmentHistory || []), ...historyEntry],
      createdAt: existingByAdm?.createdAt || now,
      createdBy: existingByAdm?.createdBy || currentUser.displayName,
      updatedAt: now,
      updatedBy: currentUser.displayName,
      batchId,
    };

    assessedRows.push({
      rowNumber,
      rawRow: row,
      status: rowStatus,
      requiresManualReview,
      hasOrgAssignmentChange,
      approvedForCommit,
      empId,
      admNumber,
      salesRepName,
      teamName: resolvedTeam.teamName,
      employeeStatus: statusCheck.status,
      rawEmployeeStatus,
      division,
      divisionHeadName: resolvedHead.name,
      mobileNo,
      email,
      errors,
      warnings,
      fieldDiffs,
      parsedRecord,
      resolvedTeam,
      resolvedDivisionHead: resolvedHead,
    });
  });

  const summary = {
    totalRecords: assessedRows.length,
    newRecords: assessedRows.filter((r) => r.status === 'NEW').length,
    updatedRecords: assessedRows.filter((r) => r.status === 'UPDATED').length,
    duplicateRecords: assessedRows.filter((r) => r.status === 'DUPLICATE').length,
    invalidRecords: assessedRows.filter((r) => r.status === 'INVALID').length,
    unmappedRelationships: assessedRows.filter((r) => r.status === 'UNMAPPED').length,
    reviewRequiredRecords: assessedRows.filter((r) => r.requiresManualReview).length,
  };

  return {
    fileName: file.name,
    batchId,
    columnHeaders,
    detectedMapping: mapping,
    rows: assessedRows,
    summary,
    teamsToUpsert: Array.from(upsertedTeams.values()),
    divisionHeadsToUpsert: Array.from(upsertedHeads.values()),
  };
}

// ============================================================
// 2. Customer Master Bulk Upload Parser
// ============================================================

export async function parseCustomerMasterFile(
  file: File,
  existingCustomers: CustomerMasterRecord[],
  admMasterRecords: AdmMasterRecord[],
  currentUser: UserProfile,
  customMapping?: Partial<CustomerColumnMapping>
): Promise<CustomerParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const extracted = extractSpreadsheetTable(workbook, Object.values(CUSTOMER_HEADER_ALIASES));
  const rawRows = extracted.rawRows;
  const batchId = `BATCH-CUST-${Date.now()}`;

  if (rawRows.length === 0) {
    const columnHeaders = extracted.columnHeaders;
    const detected = detectCustomerColumnMapping(columnHeaders);
    return {
      fileName: file.name,
      batchId,
      columnHeaders,
      detectedMapping: { ...detected, ...(customMapping || {}) },
      rows: [],
      summary: {
        totalRecords: 0,
        newRecords: 0,
        updatedRecords: 0,
        duplicateRecords: 0,
        invalidRecords: 0,
        unmappedRelationships: 0,
        reviewRequiredRecords: 0,
      },
    };
  }

  const columnHeaders = extracted.columnHeaders;
  const detected = detectCustomerColumnMapping(columnHeaders);
  const mapping: CustomerColumnMapping = { ...detected, ...(customMapping || {}) };
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);

  const existingCustById = new Map<string, CustomerMasterRecord>();
  for (const c of existingCustomers) {
    existingCustById.set(canonicalKey(c.customerId), c);
  }

  const admByNumber = new Map<string, AdmMasterRecord>();
  const admByCompactNumber = new Map<string, AdmMasterRecord | 'AMBIGUOUS'>();
  for (const a of admMasterRecords) {
    admByNumber.set(canonicalKey(a.admNumber), a);
    const compact = compactAlphanumericKey(a.admNumber);
    if (compact) {
      if (admByCompactNumber.has(compact)) {
        admByCompactNumber.set(compact, 'AMBIGUOUS');
      } else {
        admByCompactNumber.set(compact, a);
      }
    }
  }

  const seenCustomerIdsInFile = new Map<string, number>();
  const assessedRows: CustomerRowAssessment[] = [];

  rawRows.forEach(({ excelRowNumber: rowNumber, data: row }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldDiffs: FieldDiff[] = [];

    const customerId = normalizeDisplayText(row[mapping.customerId]);
    const customerName = normalizeDisplayText(row[mapping.name]);
    const admNumber = normalizeDisplayText(row[mapping.admNumber]);
    const uploadedSalesRepName = normalizeDisplayText(row[mapping.salesRepName]);
    const customerPhone = normalizeDisplayText(row[mapping.customerPhone]);

    // Required fields validation
    if (!customerId) errors.push('Missing Customer ID');
    if (!customerName) errors.push('Missing Customer Name');
    if (!admNumber) errors.push('Missing ADM#');

    if (!customerPhone) warnings.push('Customer phone is blank');

    // Duplicate detection within file
    const cCustId = canonicalKey(customerId);
    let isFileDuplicate = false;
    if (cCustId) {
      const prevRow = seenCustomerIdsInFile.get(cCustId);
      if (prevRow !== undefined) {
        isFileDuplicate = true;
        warnings.push(`Duplicate Customer ID "${customerId}" within uploaded file (first seen at row ${prevRow})`);
      } else {
        seenCustomerIdsInFile.set(cCustId, rowNumber);
      }
    }

    if (errors.length > 0) {
      assessedRows.push({
        rowNumber,
        rawRow: row,
        status: !admNumber && customerId && customerName ? 'UNMAPPED' : 'INVALID',
        requiresManualReview: true,
        hasAdmAssignmentChange: false,
        approvedForCommit: false,
        customerId,
        customerName,
        admNumber,
        uploadedSalesRepName,
        authoritativeSalesRepName: uploadedSalesRepName,
        customerPhone,
        errors,
        warnings,
        fieldDiffs: [],
        parsedRecord: null,
      });
      return;
    }

    if (isFileDuplicate) {
      assessedRows.push({
        rowNumber,
        rawRow: row,
        status: 'DUPLICATE',
        requiresManualReview: false,
        hasAdmAssignmentChange: false,
        approvedForCommit: false,
        customerId,
        customerName,
        admNumber,
        uploadedSalesRepName,
        authoritativeSalesRepName: uploadedSalesRepName,
        customerPhone,
        errors: [],
        warnings,
        fieldDiffs: [],
        parsedRecord: null,
      });
      return;
    }

    // Authoritative ADM# lookup (NEVER auto-create unknown ADM#)
    let matchedAdm = admByNumber.get(canonicalKey(admNumber));
    if (!matchedAdm) {
      const compactCandidate = admByCompactNumber.get(compactAlphanumericKey(admNumber));
      if (compactCandidate && compactCandidate !== 'AMBIGUOUS') {
        matchedAdm = compactCandidate;
        warnings.push(
          `ADM# "${admNumber}" matched existing ADM Master "${compactCandidate.admNumber}" after separator normalization.`
        );
      }
    }
    const existingCust = existingCustById.get(cCustId);

    if (!matchedAdm) {
      const unmappedMsg = `Unknown ADM# "${admNumber}" — not found in ADM Master. Do not auto-create ADM; requires ADM mapping.`;
      warnings.push(unmappedMsg);

      const stagedUnmappedRecord: CustomerMasterRecord = {
        id: existingCust?.id || makeCustomerDocId(customerId),
        customerId,
        customerName,
        admNumber,
        admReference: 'UNMAPPED',
        salesRepName: uploadedSalesRepName || 'Unmapped ADM',
        uploadedSalesRepName,
        customerPhone,
        teamId: existingCust?.teamId || '',
        teamName: existingCust?.teamName || 'Unmapped Team',
        division: existingCust?.division || 'Unmapped Division',
        divisionHeadId: existingCust?.divisionHeadId || '',
        divisionHead: existingCust?.divisionHead || 'Unmapped Division Head',
        customerStatus: 'UNMAPPED_ADM',
        assignmentEffectiveDate: existingCust?.assignmentEffectiveDate || todayStr,
        requiresAdmMapping: true,
        nameMismatchWarning: unmappedMsg,
        assignmentHistory: existingCust?.assignmentHistory || [],
        createdAt: existingCust?.createdAt || now,
        createdBy: existingCust?.createdBy || currentUser.displayName,
        updatedAt: now,
        updatedBy: currentUser.displayName,
        batchId,
      };

      assessedRows.push({
        rowNumber,
        rawRow: row,
        status: 'UNMAPPED',
        requiresManualReview: true,
        hasAdmAssignmentChange: false,
        approvedForCommit: false, // Default: do not silently import unmapped relationships
        customerId,
        customerName,
        admNumber,
        uploadedSalesRepName,
        authoritativeSalesRepName: 'UNMAPPED ADM#',
        customerPhone,
        errors: [],
        warnings,
        fieldDiffs: [],
        parsedRecord: stagedUnmappedRecord,
      });
      return;
    }

    // Matched ADM found -> validate Sales Rep Name against ADM Master (non-primary validation check)
    let nameMismatchWarning: string | undefined;
    if (uploadedSalesRepName && canonicalKey(uploadedSalesRepName) !== canonicalKey(matchedAdm.salesRepName)) {
      nameMismatchWarning = `Uploaded Sales Rep Name "${uploadedSalesRepName}" differs from ADM Master "${matchedAdm.salesRepName}" for ADM# ${matchedAdm.admNumber}.`;
      warnings.push(nameMismatchWarning);
    }

    if (matchedAdm.employeeStatus === 'INACTIVE') {
      warnings.push(
        `Matched ADM# ${matchedAdm.admNumber} (${matchedAdm.salesRepName}) has Employee Status: INACTIVE (${matchedAdm.rawEmployeeStatus}).`
      );
    }

    let rowStatus: 'NEW' | 'UPDATED' | 'DUPLICATE' = 'NEW';
    let hasAdmAssignmentChange = false;

    if (existingCust) {
      const checkDiff = (field: string, beforeVal: string, afterVal: string, isAdm = false) => {
        if (canonicalKey(beforeVal) !== canonicalKey(afterVal)) {
          fieldDiffs.push({ field, before: beforeVal || '(blank)', after: afterVal || '(blank)' });
          if (isAdm) hasAdmAssignmentChange = true;
        }
      };
      checkDiff('Name', existingCust.customerName, customerName);
      checkDiff('ADM#', existingCust.admNumber, matchedAdm.admNumber, true);
      checkDiff('Customer phone', existingCust.customerPhone, customerPhone);
      checkDiff('Team', existingCust.teamName, matchedAdm.teamName);
      checkDiff('Division', existingCust.division, matchedAdm.division);

      if (fieldDiffs.length === 0 && !existingCust.requiresAdmMapping) {
        rowStatus = 'DUPLICATE';
        warnings.push(`No changes vs existing Customer ID "${existingCust.customerId}"`);
      } else {
        rowStatus = 'UPDATED';
        if (hasAdmAssignmentChange) {
          warnings.push(
            `Proposed ADM# reassignment from "${existingCust.admNumber}" to "${matchedAdm.admNumber}" — verify before applying.`
          );
        }
      }
    }

    const requiresManualReview = Boolean(nameMismatchWarning) || matchedAdm.employeeStatus === 'INACTIVE' || hasAdmAssignmentChange;
    const customerStatus: CustomerMasterRecord['customerStatus'] = nameMismatchWarning
      ? 'NEEDS_REVIEW'
      : matchedAdm.employeeStatus === 'INACTIVE'
        ? 'NEEDS_REVIEW'
        : 'ACTIVE';

    const historyEntry =
      existingCust && hasAdmAssignmentChange
        ? [
            {
              changedAt: now,
              changedBy: currentUser.displayName,
              previousAdmNumber: existingCust.admNumber,
              newAdmNumber: matchedAdm.admNumber,
              reason: 'Customer Master Bulk Import',
            },
          ]
        : [];

    const parsedRecord: CustomerMasterRecord = {
      id: existingCust?.id || makeCustomerDocId(customerId),
      customerId,
      customerName,
      admNumber: matchedAdm.admNumber,
      admReference: matchedAdm.id,
      salesRepName: matchedAdm.salesRepName,
      uploadedSalesRepName: uploadedSalesRepName || matchedAdm.salesRepName,
      customerPhone,
      teamId: matchedAdm.teamId,
      teamName: matchedAdm.teamName,
      division: matchedAdm.division,
      divisionHeadId: matchedAdm.divisionHeadId,
      divisionHead: matchedAdm.divisionHeadName,
      customerStatus,
      assignmentEffectiveDate: hasAdmAssignmentChange
        ? todayStr
        : existingCust?.assignmentEffectiveDate || todayStr,
      nameMismatchWarning,
      requiresAdmMapping: false,
      assignmentHistory: [...(existingCust?.assignmentHistory || []), ...historyEntry],
      createdAt: existingCust?.createdAt || now,
      createdBy: existingCust?.createdBy || currentUser.displayName,
      updatedAt: now,
      updatedBy: currentUser.displayName,
      batchId,
    };

    assessedRows.push({
      rowNumber,
      rawRow: row,
      status: rowStatus,
      requiresManualReview,
      hasAdmAssignmentChange,
      approvedForCommit: rowStatus === 'NEW' || (rowStatus === 'UPDATED' && !hasAdmAssignmentChange),
      customerId,
      customerName,
      admNumber: matchedAdm.admNumber,
      uploadedSalesRepName,
      authoritativeSalesRepName: matchedAdm.salesRepName,
      customerPhone,
      errors: [],
      warnings,
      fieldDiffs,
      parsedRecord,
    });
  });

  const summary = {
    totalRecords: assessedRows.length,
    newRecords: assessedRows.filter((r) => r.status === 'NEW').length,
    updatedRecords: assessedRows.filter((r) => r.status === 'UPDATED').length,
    duplicateRecords: assessedRows.filter((r) => r.status === 'DUPLICATE').length,
    invalidRecords: assessedRows.filter((r) => r.status === 'INVALID').length,
    unmappedRelationships: assessedRows.filter((r) => r.status === 'UNMAPPED').length,
    reviewRequiredRecords: assessedRows.filter((r) => r.requiresManualReview).length,
  };

  return {
    fileName: file.name,
    batchId,
    columnHeaders,
    detectedMapping: mapping,
    rows: assessedRows,
    summary,
  };
}
