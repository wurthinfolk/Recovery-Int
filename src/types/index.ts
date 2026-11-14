/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Core Data Models and Domain Types
 */

export type RecoveryStatus =
  | 'NEW'
  | 'UNDER_INVESTIGATION'
  | 'CONTACT_REQUIRED'
  | 'PAYMENT_PROMISED'
  | 'AWAITING_REPLACEMENT'
  | 'PARTIALLY_RECOVERED'
  | 'RECOVERED'
  | 'ESCALATED'
  | 'CLOSED_OTHER';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type UserRole =
  | 'RECOVERY_OFFICER'
  | 'RECOVERY_SUPERVISOR'
  | 'MANAGEMENT_VIEWER'
  | 'SYSTEM_ADMIN';

export type DateBasis = 'datePosted' | 'effectiveDate';

export interface ChequeRecord {
  id: string;
  // Original business fields
  month: string;              // Source month string (e.g. "OCTOBER 2026")
  datePosted: string;         // YYYY-MM-DD (Default for trend reporting)
  effectiveDate: string;      // YYYY-MM-DD
  cxNumber: string;           // Primary customer identifier (e.g. "CX-10492")
  cxName: string;             // Customer name
  admName: string;            // Account Development Manager Name
  admCode: string;            // Primary ADM identifier (e.g. "ADM-04")
  description: string;        // Cheque number or reference
  amount: number;             // Amount in Sri Lankan Rupees (LKR)
  returnReason: string;       // Original return reason
  normalizedReason: string;   // Normalized grouping for analytics
  finalRemark: string;        // Original remark from source

  // Structured recovery tracking fields
  recoveryStatus: RecoveryStatus;
  priority: PriorityLevel;
  priorityScore: number;      // 0 - 100 transparent calculated score
  priorityExplanation: string; // Documented rationale
  assignedOfficer: string;
  recoveredAmount: number;    // Verified recovered amount (LKR)
  remainingAmount: number;    // Verified unrecovered exposure (LKR)
  nextAction: string;
  nextFollowUpDate: string;   // YYYY-MM-DD
  lastContactDate: string;    // YYYY-MM-DD
  resolutionDate: string;     // YYYY-MM-DD
  resolutionEvidence: string; // Receipt / chq reference / bank slip
  recoveryNotes: string;

  // System metadata
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  batchId?: string;
  isSample?: boolean;
}

export type ActionType =
  | 'CONTACT_ATTEMPT'
  | 'PAYMENT_PROMISED'
  | 'REPLACEMENT_CHEQUE'
  | 'PARTIAL_PAYMENT'
  | 'FULL_RECOVERY'
  | 'ESCALATION'
  | 'STATUS_CHANGE'
  | 'INTERNAL_NOTE';

export interface RecoveryAction {
  id: string;
  chequeId: string;
  cxNumber: string;
  actionType: ActionType;
  officerName: string;
  officerId: string;
  notes: string;
  promisedDate?: string;
  promisedAmount?: number;
  recoveredAmount?: number;
  replacementChequeRef?: string;
  newStatus?: RecoveryStatus;
  createdAt: string;
  createdBy: string;
}

export interface ImportBatch {
  id: string;
  importType?: 'CHEQUE_REGISTER' | 'ADM_MASTER' | 'CUSTOMER_MASTER';
  fileName: string;
  totalRows: number;
  importedCount: number;
  updatedCount?: number;
  duplicateCount: number;
  errorCount: number;
  unmappedCount?: number;
  reviewRequiredCount?: number;
  totalAmount: number;
  importedAt: string;
  importedBy: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errors?: string[];
}

export interface AuditLog {
  id: string;
  recordId: string;
  recordType:
    | 'CHEQUE_RECORD'
    | 'RECOVERY_ACTION'
    | 'IMPORT_BATCH'
    | 'CONFIG'
    | 'USER_ROLE'
    | 'ADM_MASTER'
    | 'CUSTOMER_MASTER'
    | 'TEAM_MASTER'
    | 'DIVISION_HEAD_MASTER';
  operation: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'ASSIGNMENT' | 'RECOVERY' | 'IMPORT' | 'CONFIG_CHANGE';
  actor: string;
  actorEmail: string;
  details: string;
  beforeValue?: string;
  afterValue?: string;
  timestamp: string;
}

export interface AnalyticalConfig {
  repeatReturnThreshold: number; // e.g. 2 returns
  highValueThreshold: number;     // e.g. 250,000 LKR
  overdueDaysThreshold: number;   // e.g. 7 days past follow-up
  currency: string;               // "LKR"
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: string;
  avatarUrl?: string;
}

export interface FilterState {
  dateBasis: DateBasis;
  startDate: string;
  endDate: string;
  cxNumber: string;
  admCode: string;
  division?: string;
  teamId?: string;
  divisionHeadId?: string;
  returnReason: string;
  recoveryStatus: string;
  priority: string;
  assignedOfficer: string;
  searchQuery: string;
}

export interface KPIMetrics {
  totalCount: number;
  totalValue: number;
  uniqueCustomers: number;
  averageAmount: number;
  repeatCustomersCount: number;
  repeatCustomersValue: number;
  unrecoveredExposure: number;
  verifiedRecoveredValue: number;
  recoveryRateByValue: number;
  overdueCasesCount: number;
  // Comparisons vs prior period
  countChange: number;
  countChangePct: number | null;
  valueChange: number;
  valueChangePct: number | null;
  unrecoveredChange: number;
  comparisonPeriodLabel: string;
}

export interface CustomerSummary {
  cxNumber: string;
  cxName: string;
  alternateNames: string[];
  totalReturns: number;
  totalValue: number;
  firstReturnDate: string;
  latestReturnDate: string;
  distinctMonthsCount: number;
  mostFrequentReason: string;
  mostRecentReason: string;
  averageAmount: number;
  consecutiveMonths: number;
  unresolvedCount: number;
  unrecoveredExposure: number;
  verifiedRecoveredAmount: number;
  isRepeatCustomer: boolean;
  assignedAdms: string[];
  hasInconsistentName: boolean;
  chequeIds: string[];
  isDeteriorating: boolean;
  deteriorationReason?: string;
  // Enriched Customer & Org Master relationship fields
  admNumber?: string;
  admReference?: string;
  salesRepName?: string;
  customerPhone?: string;
  teamId?: string;
  teamName?: string;
  division?: string;
  divisionHeadId?: string;
  divisionHead?: string;
  customerStatus?: string;
  assignmentEffectiveDate?: string;
  isMasterLinked?: boolean;
  isAdmMapped?: boolean;
  nameMismatchWarning?: string;
}

export interface AdmSummary {
  admCode: string;
  admName: string;
  alternateNames: string[];
  totalReturns: number;
  totalValue: number;
  averageAmount: number;
  uniqueCustomers: number;
  repeatCustomersCount: number;
  unrecoveredExposure: number;
  verifiedRecoveredValue?: number;
  topReturnReason: string;
  hasInconsistentName: boolean;
  chequeIds: string[];
  // Enriched ADM Master relationship fields
  empId?: string;
  teamId?: string;
  teamName?: string;
  division?: string;
  divisionHeadId?: string;
  divisionHeadName?: string;
  employeeStatus?: string;
  rawEmployeeStatus?: string;
  mobileNo?: string;
  email?: string;
  masterCustomerCount?: number;
  isMasterLinked?: boolean;
  verificationStatus?: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
}

export interface ReasonSummary {
  normalizedReason: string;
  originalVariations: string[];
  count: number;
  totalValue: number;
  averageAmount: number;
  customerCount: number;
  repeatCustomerOccurrenceCount: number;
  shareOfTotalValue: number;
  shareOfTotalCount: number;
}

export interface AnomalyFinding {
  id: string;
  title: string;
  category: 'REPEAT_CONCENTRATION' | 'UNUSUAL_AMOUNT' | 'FREQUENCY_SPIKE' | 'REASON_SHIFT' | 'DETERIORATING_CUSTOMER' | 'HIGH_EXPOSURE_UNRESOLVED';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  comparison: string;
  evidence: string;
  financialImpactLkr: number;
  supportingRecordCount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'INSUFFICIENT_BASELINE';
  recommendedAction: string;
  relatedCxNumber?: string;
  relatedAdmCode?: string;
}

export interface ManagementInsight {
  finding: string;
  evidence: string;
  businessImpact: string;
  recommendedAction: string;
  successMeasure: string;
  limitations: string;
  generatedBy: 'AI_MODEL' | 'RULE_ENGINE';
}

// ============================================================
// Organization Management Master Data Types
// Hierarchy: DIVISION HEAD -> DIVISION -> TEAM -> ADM -> CUSTOMER
// ============================================================

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';

export interface DivisionHeadMaster {
  id: string;
  name: string;
  canonicalName: string;
  divisions: string[];
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMaster {
  id: string;
  teamName: string;
  canonicalKey: string; // normalizedDivision::normalizedTeamName
  division: string;
  divisionHeadId: string;
  divisionHeadName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdmAssignmentHistoryEntry {
  changedAt: string;
  changedBy: string;
  previousTeamId?: string;
  previousTeamName?: string;
  previousDivision?: string;
  previousDivisionHeadName?: string;
  newTeamId: string;
  newTeamName: string;
  newDivision: string;
  newDivisionHeadName: string;
}

export interface AdmMasterRecord {
  id: string;
  empId: string;
  admNumber: string; // Unique business identifier (ADM#)
  salesRepName: string;
  teamId: string;
  teamName: string;
  division: string;
  divisionHeadId: string;
  divisionHeadName: string;
  employeeStatus: EmployeeStatus;
  rawEmployeeStatus: string;
  mobileNo: string;
  email: string;
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
  assignmentHistory?: AdmAssignmentHistoryEntry[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  batchId?: string;
}

export interface CustomerAssignmentHistoryEntry {
  changedAt: string;
  changedBy: string;
  previousAdmNumber?: string;
  newAdmNumber: string;
  reason?: string;
}

export interface CustomerMasterRecord {
  id: string;
  customerId: string; // Unique customer identifier (Customer ID)
  customerName: string;
  admNumber: string; // Authoritative ADM#
  admReference: string; // ADM Master ID / Emp ID or UNMAPPED
  salesRepName: string; // Authoritative ADM Master Sales Rep Name (or uploaded if unmapped)
  uploadedSalesRepName: string;
  customerPhone: string;
  teamId: string;
  teamName: string;
  division: string;
  divisionHeadId: string;
  divisionHead: string;
  customerStatus: 'ACTIVE' | 'NEEDS_REVIEW' | 'UNMAPPED_ADM' | 'INACTIVE';
  assignmentEffectiveDate: string;
  nameMismatchWarning?: string;
  requiresAdmMapping?: boolean;
  assignmentHistory?: CustomerAssignmentHistoryEntry[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  batchId?: string;
}

export interface TeamSummary {
  teamId: string;
  teamName: string;
  division: string;
  divisionHeadId: string;
  divisionHeadName: string;
  admCount: number;
  activeAdmCount: number;
  masterCustomerCount: number;
  affectedCustomersCount: number;
  repeatCustomersCount: number;
  totalReturns: number;
  totalValue: number;
  verifiedRecoveredValue: number;
  unrecoveredExposure: number;
  recoveryRateByValue: number;
  topRiskCustomers: CustomerSummary[];
  admNumbers: string[];
  chequeIds: string[];
}

export interface DivisionHeadSummary {
  divisionHeadId: string;
  divisionHeadName: string;
  divisions: string[];
  teamCount: number;
  admCount: number;
  masterCustomerCount: number;
  affectedCustomersCount: number;
  repeatCustomersCount: number;
  totalReturns: number;
  totalValue: number;
  verifiedRecoveredValue: number;
  unrecoveredExposure: number;
  recoveryRateByValue: number;
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
  teamIds: string[];
  admNumbers: string[];
  chequeIds: string[];
}

export interface HistoricalLinkageAudit {
  totalCheques: number;
  customerMappedCount: number;
  customerUnmappedCount: number;
  admMappedCount: number;
  admUnmappedCount: number;
  reassignedFromHistoricalAdmCount: number;
  unmappedChequeDetails: Array<{
    chequeId: string;
    description: string;
    datePosted: string;
    cxNumber: string;
    cxName: string;
    admCode: string;
    admName: string;
    amount: number;
    missingCustomerMaster: boolean;
    missingAdmMaster: boolean;
  }>;
}

