/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Pure, deterministic calculation functions and financial analytics service
 */

import {
  ChequeRecord,
  KPIMetrics,
  CustomerSummary,
  AdmSummary,
  ReasonSummary,
  AnomalyFinding,
  AnalyticalConfig,
  PriorityLevel,
  FilterState,
  AdmMasterRecord,
  CustomerMasterRecord,
  TeamMaster,
  DivisionHeadMaster,
  TeamSummary,
  DivisionHeadSummary,
  HistoricalLinkageAudit,
} from '../types';

export const DEFAULT_CONFIG: AnalyticalConfig = {
  repeatReturnThreshold: 2,
  highValueThreshold: 250000,
  overdueDaysThreshold: 7,
  currency: 'LKR',
};

/**
 * Format currency in Sri Lankan Rupees (LKR) with tabular precision
 */
export function formatLKR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'LKR 0.00';
  }
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('LKR', 'LKR ');
}

/**
 * Format compact LKR for charts and summary tiles
 */
export function formatCompactLKR(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `LKR ${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `LKR ${(amount / 1_000).toFixed(1)}k`;
  }
  return `LKR ${amount.toFixed(0)}`;
}

/**
 * Normalize return reason text for analytical aggregation while preserving original
 */
export function normalizeReason(raw: string): string {
  if (!raw) return 'Unspecified Reason';
  const clean = raw.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('refer to drawer') || lower === 'rd' || lower.includes('drawer refer')) {
    return 'Refer to Drawer';
  }
  if (lower.includes('stop') || lower.includes('payment stopped')) {
    return 'Payment Stopped by Drawer';
  }
  if (lower.includes('insufficient') || lower.includes('not arranged') || lower.includes('exceeds')) {
    return 'Funds Insufficient';
  }
  if (lower.includes('signature') || lower.includes('sign') || lower.includes('mandate')) {
    return 'Signature / Mandate Irregular';
  }
  if (lower.includes('post dated') || lower.includes('post-dated') || lower.includes('date')) {
    return 'Post-Dated / Date Discrepancy';
  }
  if (lower.includes('account closed') || lower.includes('closed')) {
    return 'Account Closed';
  }
  if (lower.includes('alteration') || lower.includes('correction') || lower.includes('mutilated')) {
    return 'Cheque Alteration / Mutilation';
  }
  if (lower.includes('words and figures') || lower.includes('amount differs')) {
    return 'Words & Figures Differ';
  }
  return clean;
}

/**
 * Calculate transparent rule-based priority score & category
 */
export function calculatePriority(
  record: Partial<ChequeRecord>,
  customerPreviousReturnsCount: number,
  config: AnalyticalConfig = DEFAULT_CONFIG
): { priority: PriorityLevel; score: number; explanation: string } {
  let score = 0;
  const reasons: string[] = [];

  const unrecovered = record.remainingAmount ?? record.amount ?? 0;
  const isRecovered = record.recoveryStatus === 'RECOVERED' || record.recoveryStatus === 'CLOSED_OTHER';

  if (isRecovered) {
    return {
      priority: 'LOW',
      score: 10,
      explanation: 'Verified recovered or closed with resolution.',
    };
  }

  // Exposure weight (up to 40 pts)
  if (unrecovered >= config.highValueThreshold) {
    score += 40;
    reasons.push(`High exposure >= ${formatLKR(config.highValueThreshold)}`);
  } else if (unrecovered >= 100000) {
    score += 25;
    reasons.push('Substantial unrecovered amount (> LKR 100k)');
  } else {
    score += 10;
  }

  // Repeat history (up to 30 pts)
  if (customerPreviousReturnsCount >= 3) {
    score += 30;
    reasons.push(`Chronic repeat customer (${customerPreviousReturnsCount}+ returned cheques)`);
  } else if (customerPreviousReturnsCount >= config.repeatReturnThreshold) {
    score += 20;
    reasons.push(`Repeat customer threshold breached`);
  }

  // Escalation / Status weight (up to 20 pts)
  if (record.recoveryStatus === 'ESCALATED') {
    score += 20;
    reasons.push('Case formally escalated to management');
  } else if (record.recoveryStatus === 'CONTACT_REQUIRED' || record.recoveryStatus === 'NEW') {
    score += 15;
    reasons.push('Awaiting initial customer contact');
  } else if (record.recoveryStatus === 'PAYMENT_PROMISED') {
    score += 10;
  }

  // Overdue follow-up check (up to 10 pts)
  if (record.nextFollowUpDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (record.nextFollowUpDate < today) {
      score += 10;
      reasons.push(`Overdue follow-up commitment since ${record.nextFollowUpDate}`);
    }
  }

  // Classify
  let priority: PriorityLevel = 'LOW';
  if (score >= 60) {
    priority = 'CRITICAL';
  } else if (score >= 40) {
    priority = 'HIGH';
  } else if (score >= 20) {
    priority = 'MEDIUM';
  }

  return {
    priority,
    score: Math.min(score, 100),
    explanation: reasons.length ? reasons.join('; ') : 'Standard recovery tracking queue.',
  };
}

function normKey(v: string | undefined | null): string {
  return (v || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface ResolvedRecordOrgContext {
  customerMaster?: CustomerMasterRecord;
  admMaster?: AdmMasterRecord;
  teamId: string;
  teamName: string;
  division: string;
  divisionHeadId: string;
  divisionHeadName: string;
  effectiveAdmNumber: string;
}

export function buildOrgLookupMaps(
  customersMaster: CustomerMasterRecord[] = [],
  admsMaster: AdmMasterRecord[] = []
) {
  const custMap = new Map<string, CustomerMasterRecord>();
  for (const c of customersMaster) {
    if (c.customerId) custMap.set(normKey(c.customerId), c);
  }
  const admMap = new Map<string, AdmMasterRecord>();
  for (const a of admsMaster) {
    if (a.admNumber) admMap.set(normKey(a.admNumber), a);
  }
  return { custMap, admMap };
}

export function resolveChequeOrgContext(
  rec: ChequeRecord,
  custMap: Map<string, CustomerMasterRecord>,
  admMap: Map<string, AdmMasterRecord>
): ResolvedRecordOrgContext {
  const cm = custMap.get(normKey(rec.cxNumber));
  // Prefer Customer's authoritative ADM# if mapped, else fallback to cheque's historical admCode
  const admFromCust = cm && !cm.requiresAdmMapping ? admMap.get(normKey(cm.admNumber)) : undefined;
  const admFromRec = admMap.get(normKey(rec.admCode));
  const adm = admFromCust || admFromRec;

  const teamId = adm?.teamId || cm?.teamId || '';
  const teamName = adm?.teamName || cm?.teamName || '';
  const division = adm?.division || cm?.division || '';
  const divisionHeadId = adm?.divisionHeadId || cm?.divisionHeadId || '';
  const divisionHeadName = adm?.divisionHeadName || cm?.divisionHead || '';
  const effectiveAdmNumber = adm?.admNumber || cm?.admNumber || rec.admCode || '';

  return {
    customerMaster: cm,
    admMaster: adm,
    teamId,
    teamName,
    division,
    divisionHeadId,
    divisionHeadName,
    effectiveAdmNumber,
  };
}

/**
 * Filter records based on UI filter state (including Organization Hierarchy filters)
 */
export function filterRecords(
  records: ChequeRecord[],
  filters: FilterState,
  customersMaster: CustomerMasterRecord[] = [],
  admsMaster: AdmMasterRecord[] = []
): ChequeRecord[] {
  const hasOrgFilter = Boolean(filters.division || filters.teamId || filters.divisionHeadId);
  const { custMap, admMap } = hasOrgFilter
    ? buildOrgLookupMaps(customersMaster, admsMaster)
    : { custMap: new Map<string, CustomerMasterRecord>(), admMap: new Map<string, AdmMasterRecord>() };

  return records.filter((rec) => {
    // Date filter
    const targetDate = filters.dateBasis === 'effectiveDate' ? rec.effectiveDate : rec.datePosted;
    if (filters.startDate && targetDate && targetDate < filters.startDate) return false;
    if (filters.endDate && targetDate && targetDate > filters.endDate) return false;

    // CX Filter
    if (filters.cxNumber && normKey(rec.cxNumber) !== normKey(filters.cxNumber)) return false;

    // ADM Filter
    if (filters.admCode && normKey(rec.admCode) !== normKey(filters.admCode)) return false;

    // Organizational hierarchy filters (Division, Team, Division Head)
    if (hasOrgFilter) {
      const ctx = resolveChequeOrgContext(rec, custMap, admMap);
      if (filters.division && normKey(ctx.division) !== normKey(filters.division)) return false;
      if (filters.teamId && ctx.teamId !== filters.teamId) return false;
      if (filters.divisionHeadId && ctx.divisionHeadId !== filters.divisionHeadId) return false;
    }

    // Reason Filter
    if (filters.returnReason && rec.normalizedReason !== filters.returnReason && rec.returnReason !== filters.returnReason) {
      return false;
    }

    // Status Filter
    if (filters.recoveryStatus && rec.recoveryStatus !== filters.recoveryStatus) return false;

    // Priority Filter
    if (filters.priority && rec.priority !== filters.priority) return false;

    // Assigned Officer
    if (filters.assignedOfficer && rec.assignedOfficer !== filters.assignedOfficer) return false;

    // Search Query (CX Number, Name, ADM, Cheque Ref, Remark)
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const match =
        rec.cxNumber.toLowerCase().includes(q) ||
        rec.cxName.toLowerCase().includes(q) ||
        rec.admName.toLowerCase().includes(q) ||
        rec.admCode.toLowerCase().includes(q) ||
        rec.description.toLowerCase().includes(q) ||
        rec.returnReason.toLowerCase().includes(q) ||
        (rec.finalRemark && rec.finalRemark.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Calculate KPI metrics with accurate period-over-period comparison
 */
export function calculateKPIs(
  currentRecords: ChequeRecord[],
  priorRecords: ChequeRecord[] = [],
  config: AnalyticalConfig = DEFAULT_CONFIG
): KPIMetrics {
  const totalCount = currentRecords.length;
  const totalValue = currentRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const averageAmount = totalCount > 0 ? totalValue / totalCount : 0;

  // Customers count & repeat customer logic
  const customerCounts: Record<string, { count: number; value: number }> = {};
  for (const r of currentRecords) {
    if (!customerCounts[r.cxNumber]) {
      customerCounts[r.cxNumber] = { count: 0, value: 0 };
    }
    customerCounts[r.cxNumber].count += 1;
    customerCounts[r.cxNumber].value += r.amount || 0;
  }

  const uniqueCustomers = Object.keys(customerCounts).length;
  let repeatCustomersCount = 0;
  let repeatCustomersValue = 0;

  for (const stats of Object.values(customerCounts)) {
    if (stats.count >= config.repeatReturnThreshold) {
      repeatCustomersCount += 1;
      repeatCustomersValue += stats.value;
    }
  }

  // Recovery totals
  const unrecoveredExposure = currentRecords.reduce((sum, r) => {
    if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') {
      return sum;
    }
    return sum + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
  }, 0);

  const verifiedRecoveredValue = currentRecords.reduce((sum, r) => sum + (r.recoveredAmount || 0), 0);
  const recoveryRateByValue = totalValue > 0 ? (verifiedRecoveredValue / totalValue) * 100 : 0;

  // Overdue follow-up cases
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueCasesCount = currentRecords.filter(
    (r) =>
      r.nextFollowUpDate &&
      r.nextFollowUpDate < todayStr &&
      r.recoveryStatus !== 'RECOVERED' &&
      r.recoveryStatus !== 'CLOSED_OTHER'
  ).length;

  // Prior period comparisons
  const priorCount = priorRecords.length;
  const priorValue = priorRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const priorUnrecovered = priorRecords.reduce((sum, r) => {
    if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return sum;
    return sum + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
  }, 0);

  const countChange = totalCount - priorCount;
  const countChangePct = priorCount > 0 ? ((totalCount - priorCount) / priorCount) * 100 : null;
  const valueChange = totalValue - priorValue;
  const valueChangePct = priorValue > 0 ? ((totalValue - priorValue) / priorValue) * 100 : null;
  const unrecoveredChange = unrecoveredExposure - priorUnrecovered;

  return {
    totalCount,
    totalValue,
    uniqueCustomers,
    averageAmount,
    repeatCustomersCount,
    repeatCustomersValue,
    unrecoveredExposure,
    verifiedRecoveredValue,
    recoveryRateByValue,
    overdueCasesCount,
    countChange,
    countChangePct,
    valueChange,
    valueChangePct,
    unrecoveredChange,
    comparisonPeriodLabel: priorCount > 0 ? 'vs previous comparable period' : 'baseline only',
  };
}

/**
 * Customer Intelligence Aggregator (Enriched with Customer Master & ADM Hierarchy)
 */
export function aggregateCustomerIntelligence(
  records: ChequeRecord[],
  config: AnalyticalConfig = DEFAULT_CONFIG,
  customersMaster: CustomerMasterRecord[] = [],
  admsMaster: AdmMasterRecord[] = []
): CustomerSummary[] {
  const { custMap, admMap } = buildOrgLookupMaps(customersMaster, admsMaster);

  const map: Record<string, {
    cxNumber: string;
    names: Set<string>;
    records: ChequeRecord[];
  }> = {};

  for (const r of records) {
    const key = normKey(r.cxNumber) || r.cxNumber;
    if (!map[key]) {
      map[key] = {
        cxNumber: r.cxNumber,
        names: new Set(),
        records: [],
      };
    }
    if (r.cxName) map[key].names.add(r.cxName);
    map[key].records.push(r);
  }

  return Object.values(map).map(({ cxNumber, names, records: cxRecords }) => {
    const cm = custMap.get(normKey(cxNumber));
    const linkedAdm = cm && !cm.requiresAdmMapping ? admMap.get(normKey(cm.admNumber)) : undefined;

    const totalReturns = cxRecords.length;
    const totalValue = cxRecords.reduce((s, r) => s + (r.amount || 0), 0);
    const averageAmount = totalReturns > 0 ? totalValue / totalReturns : 0;

    // Dates
    const sorted = [...cxRecords].sort((a, b) => a.datePosted.localeCompare(b.datePosted));
    const firstReturnDate = sorted[0]?.datePosted || '';
    const latestReturnDate = sorted[sorted.length - 1]?.datePosted || '';

    // Distinct months
    const monthsSet = new Set(cxRecords.map((r) => r.month || r.datePosted.slice(0, 7)));
    const distinctMonthsCount = monthsSet.size;

    // Reason frequency
    const reasonCounts: Record<string, number> = {};
    for (const r of cxRecords) {
      const norm = r.normalizedReason || normalizeReason(r.returnReason);
      reasonCounts[norm] = (reasonCounts[norm] || 0) + 1;
    }
    let mostFrequentReason = 'N/A';
    let maxFreq = 0;
    for (const [res, count] of Object.entries(reasonCounts)) {
      if (count > maxFreq) {
        maxFreq = count;
        mostFrequentReason = res;
      }
    }
    const mostRecentReason = sorted[sorted.length - 1]?.normalizedReason || sorted[sorted.length - 1]?.returnReason || 'N/A';

    // Unrecovered exposure
    const unrecoveredExposure = cxRecords.reduce((sum, r) => {
      if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return sum;
      return sum + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
    }, 0);

    const verifiedRecoveredAmount = cxRecords.reduce((sum, r) => sum + (r.recoveredAmount || 0), 0);
    const unresolvedCount = cxRecords.filter(
      (r) => r.recoveryStatus !== 'RECOVERED' && r.recoveryStatus !== 'CLOSED_OTHER'
    ).length;

    const assignedAdms = Array.from(new Set(cxRecords.map((r) => `${r.admCode || ''} ${r.admName || ''}`.trim()).filter(Boolean)));
    const namesArr = Array.from(names);
    const primaryName = cm?.customerName || namesArr[0] || 'Unknown Customer';
    const alternateNames = namesArr.filter((n) => normKey(n) !== normKey(primaryName));

    const sortedMonthKeys = Array.from(monthsSet).sort();
    const consecutiveMonths = sortedMonthKeys.length > 0 ? 1 : 0;

    // Deteriorating customer pattern detection
    let isDeteriorating = false;
    let deteriorationReason: string | undefined;

    if (totalReturns >= 3 && unresolvedCount >= 2) {
      isDeteriorating = true;
      deteriorationReason = `3+ returns with ${unresolvedCount} unresolved cases totaling ${formatLKR(unrecoveredExposure)}`;
    } else if (totalReturns >= 2 && unrecoveredExposure >= config.highValueThreshold) {
      isDeteriorating = true;
      deteriorationReason = `Repeat returns with high unrecovered exposure (${formatLKR(unrecoveredExposure)})`;
    }

    // Resolve hierarchy from Customer Master -> ADM Master -> fallback to cheque's admCode
    const fallbackAdm = admMap.get(normKey(cxRecords[cxRecords.length - 1]?.admCode));
    const effectiveAdm = linkedAdm || fallbackAdm;

    return {
      cxNumber: cm?.customerId || cxNumber,
      cxName: primaryName,
      alternateNames,
      totalReturns,
      totalValue,
      firstReturnDate,
      latestReturnDate,
      distinctMonthsCount,
      mostFrequentReason,
      mostRecentReason,
      averageAmount,
      consecutiveMonths,
      unresolvedCount,
      unrecoveredExposure,
      verifiedRecoveredAmount,
      isRepeatCustomer: totalReturns >= config.repeatReturnThreshold,
      assignedAdms,
      hasInconsistentName: namesArr.length > 1,
      chequeIds: cxRecords.map((r) => r.id),
      isDeteriorating,
      deteriorationReason,
      // Organizational master fields
      admNumber: cm?.admNumber || effectiveAdm?.admNumber || cxRecords[0]?.admCode,
      admReference: cm?.admReference || effectiveAdm?.id,
      salesRepName: effectiveAdm?.salesRepName || cm?.salesRepName || cxRecords[0]?.admName,
      customerPhone: cm?.customerPhone,
      teamId: effectiveAdm?.teamId || cm?.teamId,
      teamName: effectiveAdm?.teamName || cm?.teamName,
      division: effectiveAdm?.division || cm?.division,
      divisionHeadId: effectiveAdm?.divisionHeadId || cm?.divisionHeadId,
      divisionHead: effectiveAdm?.divisionHeadName || cm?.divisionHead,
      customerStatus: cm?.customerStatus,
      assignmentEffectiveDate: cm?.assignmentEffectiveDate,
      isMasterLinked: Boolean(cm),
      isAdmMapped: Boolean(cm && !cm.requiresAdmMapping) || Boolean(effectiveAdm),
      nameMismatchWarning: cm?.nameMismatchWarning,
    };
  }).sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * ADM Intelligence Aggregator (Enriched with ADM Master & Customer Portfolio)
 */
export function aggregateAdmIntelligence(
  records: ChequeRecord[],
  admsMaster: AdmMasterRecord[] = [],
  customersMaster: CustomerMasterRecord[] = []
): AdmSummary[] {
  const admMasterMap = new Map<string, AdmMasterRecord>();
  for (const a of admsMaster) {
    admMasterMap.set(normKey(a.admNumber), a);
  }

  const custCountByAdm = new Map<string, number>();
  for (const c of customersMaster) {
    if (!c.requiresAdmMapping && c.admNumber) {
      const k = normKey(c.admNumber);
      custCountByAdm.set(k, (custCountByAdm.get(k) || 0) + 1);
    }
  }

  const map: Record<string, {
    admCode: string;
    names: Set<string>;
    records: ChequeRecord[];
  }> = {};

  // Seed with all ADM Master records so full hierarchy is represented
  for (const am of admsMaster) {
    const k = normKey(am.admNumber);
    map[k] = { admCode: am.admNumber, names: new Set([am.salesRepName]), records: [] };
  }

  for (const r of records) {
    const code = r.admCode || 'NO-CODE';
    const k = normKey(code);
    if (!map[k]) {
      map[k] = { admCode: code, names: new Set(), records: [] };
    }
    if (r.admName) map[k].names.add(r.admName);
    map[k].records.push(r);
  }

  return Object.values(map).map(({ admCode, names, records: admRecs }) => {
    const am = admMasterMap.get(normKey(admCode));
    const totalReturns = admRecs.length;
    const totalValue = admRecs.reduce((s, r) => s + (r.amount || 0), 0);
    const averageAmount = totalReturns > 0 ? totalValue / totalReturns : 0;

    const cxSet = new Set(admRecs.map((r) => r.cxNumber));
    const uniqueCustomers = cxSet.size;

    const cxCounts: Record<string, number> = {};
    for (const r of admRecs) {
      cxCounts[r.cxNumber] = (cxCounts[r.cxNumber] || 0) + 1;
    }
    const repeatCustomersCount = Object.values(cxCounts).filter((c) => c >= 2).length;

    const unrecoveredExposure = admRecs.reduce((sum, r) => {
      if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return sum;
      return sum + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
    }, 0);

    const verifiedRecoveredValue = admRecs.reduce((sum, r) => sum + (r.recoveredAmount || 0), 0);

    // Reason frequency
    const reasonCounts: Record<string, number> = {};
    for (const r of admRecs) {
      const norm = r.normalizedReason || normalizeReason(r.returnReason);
      reasonCounts[norm] = (reasonCounts[norm] || 0) + 1;
    }
    let topReturnReason = 'N/A';
    let maxR = 0;
    for (const [k, v] of Object.entries(reasonCounts)) {
      if (v > maxR) {
        maxR = v;
        topReturnReason = k;
      }
    }

    const namesArr = Array.from(names);
    const admName = am?.salesRepName || namesArr[0] || 'Unassigned ADM';
    const alternateNames = namesArr.filter((n) => normKey(n) !== normKey(admName));

    return {
      admCode: am?.admNumber || admCode,
      admName,
      alternateNames,
      totalReturns,
      totalValue,
      averageAmount,
      uniqueCustomers,
      repeatCustomersCount,
      unrecoveredExposure,
      verifiedRecoveredValue,
      topReturnReason,
      hasInconsistentName: alternateNames.length > 0,
      chequeIds: admRecs.map((r) => r.id),
      // Enriched ADM Master fields
      empId: am?.empId,
      teamId: am?.teamId,
      teamName: am?.teamName,
      division: am?.division,
      divisionHeadId: am?.divisionHeadId,
      divisionHeadName: am?.divisionHeadName,
      employeeStatus: am?.employeeStatus,
      rawEmployeeStatus: am?.rawEmployeeStatus,
      mobileNo: am?.mobileNo,
      email: am?.email,
      masterCustomerCount: custCountByAdm.get(normKey(admCode)) || 0,
      isMasterLinked: Boolean(am),
      verificationStatus: am?.verificationStatus,
      verificationReason: am?.verificationReason,
    };
  }).sort((a, b) => b.totalValue - a.totalValue || (b.masterCustomerCount || 0) - (a.masterCustomerCount || 0));
}

/**
 * Return Reason Analytics Aggregator with Pareto calculations
 */
export function aggregateReasonIntelligence(records: ChequeRecord[]): ReasonSummary[] {
  const map: Record<string, {
    normalizedReason: string;
    originalSet: Set<string>;
    count: number;
    totalValue: number;
    customers: Set<string>;
    customerCounts: Record<string, number>;
  }> = {};

  const totalValueOverall = records.reduce((s, r) => s + (r.amount || 0), 0);
  const totalCountOverall = records.length;

  for (const r of records) {
    const norm = r.normalizedReason || normalizeReason(r.returnReason);
    if (!map[norm]) {
      map[norm] = {
        normalizedReason: norm,
        originalSet: new Set(),
        count: 0,
        totalValue: 0,
        customers: new Set(),
        customerCounts: {},
      };
    }
    map[norm].originalSet.add(r.returnReason);
    map[norm].count += 1;
    map[norm].totalValue += r.amount || 0;
    map[norm].customers.add(r.cxNumber);
    map[norm].customerCounts[r.cxNumber] = (map[norm].customerCounts[r.cxNumber] || 0) + 1;
  }

  return Object.values(map)
    .map((item) => {
      const repeatCustomerOccurrenceCount = Object.values(item.customerCounts).filter((c) => c > 1).length;
      return {
        normalizedReason: item.normalizedReason,
        originalVariations: Array.from(item.originalSet),
        count: item.count,
        totalValue: item.totalValue,
        averageAmount: item.count > 0 ? item.totalValue / item.count : 0,
        customerCount: item.customers.size,
        repeatCustomerOccurrenceCount,
        shareOfTotalValue: totalValueOverall > 0 ? (item.totalValue / totalValueOverall) * 100 : 0,
        shareOfTotalCount: totalCountOverall > 0 ? (item.count / totalCountOverall) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Calculate Pareto 80/20 Cumulative Distribution
 */
export function calculatePareto<T>(items: T[], valueGetter: (item: T) => number): Array<T & { cumulativePct: number }> {
  const total = items.reduce((sum, item) => sum + valueGetter(item), 0);
  let running = 0;

  return items.map((item) => {
    running += valueGetter(item);
    const cumulativePct = total > 0 ? (running / total) * 100 : 0;
    return {
      ...item,
      cumulativePct: Math.round(cumulativePct * 10) / 10,
    };
  });
}

/**
 * Monthly trend time series
 */
export function calculateMonthlyTrends(
  records: ChequeRecord[],
  dateBasis: 'datePosted' | 'effectiveDate' = 'datePosted'
): Array<{
  monthKey: string;
  displayMonth: string;
  count: number;
  value: number;
  averageAmount: number;
  recoveredValue: number;
  unrecoveredExposure: number;
  repeatCustomers: number;
}> {
  const map: Record<string, {
    count: number;
    value: number;
    recoveredValue: number;
    unrecoveredExposure: number;
    cxCounts: Record<string, number>;
  }> = {};

  for (const r of records) {
    const rawDate = dateBasis === 'effectiveDate' ? r.effectiveDate : r.datePosted;
    const monthKey = rawDate ? rawDate.slice(0, 7) : (r.month || 'Unknown');
    if (!map[monthKey]) {
      map[monthKey] = {
        count: 0,
        value: 0,
        recoveredValue: 0,
        unrecoveredExposure: 0,
        cxCounts: {},
      };
    }
    map[monthKey].count += 1;
    map[monthKey].value += r.amount || 0;
    map[monthKey].recoveredValue += r.recoveredAmount || 0;
    if (r.recoveryStatus !== 'RECOVERED' && r.recoveryStatus !== 'CLOSED_OTHER') {
      map[monthKey].unrecoveredExposure += r.remainingAmount !== undefined ? r.remainingAmount : (r.amount || 0);
    }
    map[monthKey].cxCounts[r.cxNumber] = (map[monthKey].cxCounts[r.cxNumber] || 0) + 1;
  }

  const sortedKeys = Object.keys(map).sort();
  return sortedKeys.map((key) => {
    const entry = map[key];
    const repeatCustomers = Object.values(entry.cxCounts).filter((c) => c >= 2).length;
    let displayMonth = key;
    if (/^\d{4}-\d{2}$/.test(key)) {
      const [y, m] = key.split('-');
      const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
      displayMonth = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }
    return {
      monthKey: key,
      displayMonth,
      count: entry.count,
      value: entry.value,
      averageAmount: entry.count > 0 ? entry.value / entry.count : 0,
      recoveredValue: entry.recoveredValue,
      unrecoveredExposure: entry.unrecoveredExposure,
      repeatCustomers,
    };
  });
}

/**
 * Detect Statistical and Operational Anomalies (Section 6)
 */
export function detectAnomalies(
  records: ChequeRecord[],
  config: AnalyticalConfig = DEFAULT_CONFIG
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  if (records.length === 0) return findings;

  const totalValue = records.reduce((s, r) => s + (r.amount || 0), 0);
  const customers = aggregateCustomerIntelligence(records, config);
  const reasons = aggregateReasonIntelligence(records);

  // 1. Extreme Concentration in Top Customers (Pareto check)
  const top3Value = customers.slice(0, 3).reduce((s, c) => s + c.totalValue, 0);
  const top3Share = totalValue > 0 ? (top3Value / totalValue) * 100 : 0;

  if (customers.length >= 3 && top3Share >= 50) {
    findings.push({
      id: 'anomaly-pareto-cx',
      title: 'Disproportionate Customer Exposure Concentration',
      category: 'REPEAT_CONCENTRATION',
      severity: top3Share >= 70 ? 'CRITICAL' : 'HIGH',
      comparison: 'Top 3 customers vs. total registered portfolio',
      evidence: `Top 3 customers represent ${top3Share.toFixed(1)}% (${formatLKR(top3Value)}) of total returned cheque value.`,
      financialImpactLkr: top3Value,
      supportingRecordCount: customers.slice(0, 3).reduce((s, c) => s + c.totalReturns, 0),
      confidence: records.length >= 5 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Direct high-touch supervisor intervention with customer finance controllers and review credit terms.',
    });
  }

  // 2. Customers with chronic returns
  const repeatChronic = customers.filter((c) => c.totalReturns >= 3);
  for (const c of repeatChronic.slice(0, 2)) {
    findings.push({
      id: `anomaly-chronic-${c.cxNumber}`,
      title: `Chronic Cheque Returns: ${c.cxName} (${c.cxNumber})`,
      category: 'DETERIORATING_CUSTOMER',
      severity: c.unrecoveredExposure >= config.highValueThreshold ? 'CRITICAL' : 'HIGH',
      comparison: `Customer history (${c.totalReturns} occurrences across ${c.distinctMonthsCount} months)`,
      evidence: `${c.totalReturns} cheques returned for total ${formatLKR(c.totalValue)}; ${c.unresolvedCount} cases remain unresolved with unrecovered exposure of ${formatLKR(c.unrecoveredExposure)}. Dominant reason: ${c.mostFrequentReason}.`,
      financialImpactLkr: c.unrecoveredExposure,
      supportingRecordCount: c.totalReturns,
      confidence: 'HIGH',
      recommendedAction: 'Freeze credit limit, require guaranteed payment instrument, and convene joint recovery review with ADM.',
      relatedCxNumber: c.cxNumber,
    });
  }

  // 3. Dominant Return Reason Concentration
  const topReason = reasons[0];
  if (topReason && topReason.shareOfTotalValue >= 40) {
    findings.push({
      id: 'anomaly-dominant-reason',
      title: `Dominant Root Cause: ${topReason.normalizedReason}`,
      category: 'REASON_SHIFT',
      severity: 'HIGH',
      comparison: `Reason share vs all other return reasons`,
      evidence: `'${topReason.normalizedReason}' accounts for ${topReason.shareOfTotalValue.toFixed(1)}% (${formatLKR(topReason.totalValue)}) across ${topReason.customerCount} customers.`,
      financialImpactLkr: topReason.totalValue,
      supportingRecordCount: topReason.count,
      confidence: 'HIGH',
      recommendedAction: `Perform structured audit on pre-banking verification procedures relating to ${topReason.normalizedReason}.`,
    });
  }

  // 4. High-Value Unresolved Cases
  const highUnresolved = records.filter(
    (r) =>
      r.amount >= config.highValueThreshold &&
      r.recoveryStatus !== 'RECOVERED' &&
      r.recoveryStatus !== 'CLOSED_OTHER'
  );
  if (highUnresolved.length > 0) {
    const totalHighValue = highUnresolved.reduce((s, r) => s + r.amount, 0);
    findings.push({
      id: 'anomaly-high-value-unresolved',
      title: `${highUnresolved.length} High-Value Cases Awaiting Resolution`,
      category: 'HIGH_EXPOSURE_UNRESOLVED',
      severity: 'CRITICAL',
      comparison: `Threshold breach >= ${formatLKR(config.highValueThreshold)}`,
      evidence: `${highUnresolved.length} cases individually exceed ${formatLKR(config.highValueThreshold)}, totaling ${formatLKR(totalHighValue)}.`,
      financialImpactLkr: totalHighValue,
      supportingRecordCount: highUnresolved.length,
      confidence: 'HIGH',
      recommendedAction: 'Assign dedicated senior recovery officer for weekly legal and management progress tracking.',
    });
  }

  return findings;
}

/**
 * Team Intelligence Aggregator (Consolidated across ADMs, Customers, and Cheques)
 */
export function aggregateTeamIntelligence(
  records: ChequeRecord[],
  customersMaster: CustomerMasterRecord[] = [],
  admsMaster: AdmMasterRecord[] = [],
  teamsMaster: TeamMaster[] = [],
  config: AnalyticalConfig = DEFAULT_CONFIG
): TeamSummary[] {
  const { custMap, admMap } = buildOrgLookupMaps(customersMaster, admsMaster);
  const teamBuckets = new Map<string, {
    team: TeamMaster;
    adms: AdmMasterRecord[];
    customers: CustomerMasterRecord[];
    cheques: ChequeRecord[];
  }>();

  for (const t of teamsMaster) {
    teamBuckets.set(t.id, { team: t, adms: [], customers: [], cheques: [] });
  }

  for (const a of admsMaster) {
    if (!teamBuckets.has(a.teamId)) {
      teamBuckets.set(a.teamId, {
        team: {
          id: a.teamId,
          teamName: a.teamName,
          canonicalKey: `${normKey(a.division)}::${normKey(a.teamName)}`,
          division: a.division,
          divisionHeadId: a.divisionHeadId,
          divisionHeadName: a.divisionHeadName,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
        adms: [],
        customers: [],
        cheques: [],
      });
    }
    teamBuckets.get(a.teamId)!.adms.push(a);
  }

  for (const c of customersMaster) {
    if (c.teamId && teamBuckets.has(c.teamId)) {
      teamBuckets.get(c.teamId)!.customers.push(c);
    }
  }

  for (const r of records) {
    const ctx = resolveChequeOrgContext(r, custMap, admMap);
    const tid = ctx.teamId || 'UNMAPPED_TEAM';
    if (!teamBuckets.has(tid)) {
      teamBuckets.set(tid, {
        team: {
          id: tid,
          teamName: ctx.teamName || 'Unmapped / Historical Records',
          canonicalKey: 'unmapped',
          division: ctx.division || 'Unassigned Division',
          divisionHeadId: ctx.divisionHeadId || 'UNMAPPED_HEAD',
          divisionHeadName: ctx.divisionHeadName || 'Unassigned Division Head',
          createdAt: '',
          updatedAt: '',
        },
        adms: [],
        customers: [],
        cheques: [],
      });
    }
    teamBuckets.get(tid)!.cheques.push(r);
  }

  return Array.from(teamBuckets.values())
    .map(({ team, adms, customers, cheques }) => {
      const totalReturns = cheques.length;
      const totalValue = cheques.reduce((s, r) => s + (r.amount || 0), 0);
      const verifiedRecoveredValue = cheques.reduce((s, r) => s + (r.recoveredAmount || 0), 0);
      const unrecoveredExposure = cheques.reduce((s, r) => {
        if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return s;
        return s + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
      }, 0);
      const recoveryRateByValue = totalValue > 0 ? (verifiedRecoveredValue / totalValue) * 100 : 0;

      const customerSummaries = aggregateCustomerIntelligence(cheques, config, customersMaster, admsMaster);
      const affectedCustomersCount = customerSummaries.length;
      const repeatCustomersCount = customerSummaries.filter((c) => c.isRepeatCustomer).length;

      return {
        teamId: team.id,
        teamName: team.teamName,
        division: team.division,
        divisionHeadId: team.divisionHeadId,
        divisionHeadName: team.divisionHeadName,
        admCount: adms.length,
        activeAdmCount: adms.filter((a) => a.employeeStatus === 'ACTIVE').length,
        masterCustomerCount: customers.length,
        affectedCustomersCount,
        repeatCustomersCount,
        totalReturns,
        totalValue,
        verifiedRecoveredValue,
        unrecoveredExposure,
        recoveryRateByValue,
        topRiskCustomers: customerSummaries.slice(0, 5),
        admNumbers: adms.map((a) => a.admNumber),
        chequeIds: cheques.map((c) => c.id),
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue || b.admCount - a.admCount);
}

/**
 * Division Head Intelligence Aggregator
 */
export function aggregateDivisionHeadIntelligence(
  records: ChequeRecord[],
  customersMaster: CustomerMasterRecord[] = [],
  admsMaster: AdmMasterRecord[] = [],
  teamsMaster: TeamMaster[] = [],
  divisionHeadsMaster: DivisionHeadMaster[] = [],
  config: AnalyticalConfig = DEFAULT_CONFIG
): DivisionHeadSummary[] {
  const { custMap, admMap } = buildOrgLookupMaps(customersMaster, admsMaster);
  const buckets = new Map<string, {
    head: DivisionHeadMaster;
    teamIds: Set<string>;
    divisions: Set<string>;
    adms: AdmMasterRecord[];
    customers: CustomerMasterRecord[];
    cheques: ChequeRecord[];
  }>();

  const headIdToBucketKey = new Map<string, string>();

  for (const dh of divisionHeadsMaster) {
    const bucketKey = normKey(dh.name || dh.canonicalName || dh.id);
    headIdToBucketKey.set(dh.id, bucketKey);
    const existing = buckets.get(bucketKey);
    if (existing) {
      for (const d of dh.divisions || []) {
        if (d) existing.divisions.add(d);
      }
    } else {
      buckets.set(bucketKey, {
        head: dh,
        teamIds: new Set(),
        divisions: new Set(dh.divisions || []),
        adms: [],
        customers: [],
        cheques: [],
      });
    }
  }

  for (const t of teamsMaster) {
    const bucketKey =
      headIdToBucketKey.get(t.divisionHeadId) ||
      normKey(t.divisionHeadName) ||
      t.divisionHeadId;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        head: {
          id: t.divisionHeadId,
          name: t.divisionHeadName,
          canonicalName: normKey(t.divisionHeadName),
          divisions: [t.division],
          verificationStatus: 'VERIFIED',
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        },
        teamIds: new Set(),
        divisions: new Set(),
        adms: [],
        customers: [],
        cheques: [],
      });
    }
    const b = buckets.get(bucketKey)!;
    b.teamIds.add(t.id);
    if (t.division) b.divisions.add(t.division);
  }

  for (const a of admsMaster) {
    const bucketKey =
      headIdToBucketKey.get(a.divisionHeadId) ||
      normKey(a.divisionHeadName) ||
      a.divisionHeadId;
    const b = buckets.get(bucketKey);
    if (b) {
      b.adms.push(a);
      b.teamIds.add(a.teamId);
      if (a.division) b.divisions.add(a.division);
    }
  }

  for (const c of customersMaster) {
    const bucketKey =
      (c.divisionHeadId ? headIdToBucketKey.get(c.divisionHeadId) : undefined) ||
      normKey(c.divisionHead) ||
      c.divisionHeadId;
    if (bucketKey && buckets.has(bucketKey)) {
      buckets.get(bucketKey)!.customers.push(c);
    }
  }

  for (const r of records) {
    const ctx = resolveChequeOrgContext(r, custMap, admMap);
    const hid = ctx.divisionHeadId || 'UNMAPPED_HEAD';
    const bucketKey =
      headIdToBucketKey.get(hid) ||
      (ctx.divisionHeadName ? normKey(ctx.divisionHeadName) : '') ||
      hid;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        head: {
          id: hid,
          name: ctx.divisionHeadName || 'Unassigned Division Head',
          canonicalName: 'unassigned',
          divisions: [ctx.division || 'Unassigned Division'],
          verificationStatus: 'VERIFIED',
          createdAt: '',
          updatedAt: '',
        },
        teamIds: new Set(),
        divisions: new Set(ctx.division ? [ctx.division] : []),
        adms: [],
        customers: [],
        cheques: [],
      });
    }
    buckets.get(bucketKey)!.cheques.push(r);
  }

  return Array.from(buckets.values())
    .map(({ head, teamIds, divisions, adms, customers, cheques }) => {
      const totalReturns = cheques.length;
      const totalValue = cheques.reduce((s, r) => s + (r.amount || 0), 0);
      const verifiedRecoveredValue = cheques.reduce((s, r) => s + (r.recoveredAmount || 0), 0);
      const unrecoveredExposure = cheques.reduce((s, r) => {
        if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return s;
        return s + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
      }, 0);
      const recoveryRateByValue = totalValue > 0 ? (verifiedRecoveredValue / totalValue) * 100 : 0;

      const cxSummaries = aggregateCustomerIntelligence(cheques, config, customersMaster, admsMaster);
      const affectedCustomersCount = cxSummaries.length;
      const repeatCustomersCount = cxSummaries.filter((c) => c.isRepeatCustomer).length;

      return {
        divisionHeadId: head.id,
        divisionHeadName: head.name,
        divisions: Array.from(divisions),
        teamCount: teamIds.size,
        admCount: adms.length,
        masterCustomerCount: customers.length,
        affectedCustomersCount,
        repeatCustomersCount,
        totalReturns,
        totalValue,
        verifiedRecoveredValue,
        unrecoveredExposure,
        recoveryRateByValue,
        verificationStatus: head.verificationStatus,
        verificationReason: head.verificationReason,
        teamIds: Array.from(teamIds),
        admNumbers: adms.map((a) => a.admNumber),
        chequeIds: cheques.map((c) => c.id),
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue || b.admCount - a.admCount);
}

/**
 * Historical Data Integration & Unmapped Record Audit (Section 5)
 * Preserves all historical cheque fields; dynamically links CX NUMBER -> Customer ID and ADM CODE -> ADM#
 */
export function analyzeHistoricalLinkage(
  records: ChequeRecord[],
  customersMaster: CustomerMasterRecord[],
  admsMaster: AdmMasterRecord[]
): HistoricalLinkageAudit {
  const { custMap, admMap } = buildOrgLookupMaps(customersMaster, admsMaster);
  let customerMappedCount = 0;
  let customerUnmappedCount = 0;
  let admMappedCount = 0;
  let admUnmappedCount = 0;
  let reassignedFromHistoricalAdmCount = 0;
  const unmappedChequeDetails: HistoricalLinkageAudit['unmappedChequeDetails'] = [];

  for (const r of records) {
    const cm = custMap.get(normKey(r.cxNumber));
    const am = admMap.get(normKey(r.admCode));

    if (cm) {
      customerMappedCount++;
      if (!cm.requiresAdmMapping && r.admCode && normKey(cm.admNumber) !== normKey(r.admCode)) {
        reassignedFromHistoricalAdmCount++;
      }
    } else {
      customerUnmappedCount++;
    }

    if (am) {
      admMappedCount++;
    } else {
      admUnmappedCount++;
    }

    if (!cm || !am) {
      unmappedChequeDetails.push({
        chequeId: r.id,
        description: r.description,
        datePosted: r.datePosted,
        cxNumber: r.cxNumber,
        cxName: r.cxName,
        admCode: r.admCode,
        admName: r.admName,
        amount: r.amount,
        missingCustomerMaster: !cm,
        missingAdmMaster: !am,
      });
    }
  }

  return {
    totalCheques: records.length,
    customerMappedCount,
    customerUnmappedCount,
    admMappedCount,
    admUnmappedCount,
    reassignedFromHistoricalAdmCount,
    unmappedChequeDetails,
  };
}
