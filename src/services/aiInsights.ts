/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Client AI Management Insights Service with Deterministic Fallback
 */

import { ManagementInsight, KPIMetrics, CustomerSummary, ReasonSummary, AnomalyFinding } from '../types';
import { formatLKR } from './analytics';

export async function fetchManagementInsights(
  kpis: KPIMetrics,
  topCustomers: CustomerSummary[],
  topReasons: ReasonSummary[],
  anomalies: AnomalyFinding[]
): Promise<{ available: boolean; insights: ManagementInsight[]; note?: string }> {
  // Safe, non-PII summary payload
  const summaryPayload = {
    totalReturnedChequesCount: kpis.totalCount,
    totalReturnedChequeValueLKR: kpis.totalValue,
    uniqueAffectedCustomers: kpis.uniqueCustomers,
    repeatCustomersCount: kpis.repeatCustomersCount,
    repeatCustomersValueLKR: kpis.repeatCustomersValue,
    verifiedUnrecoveredExposureLKR: kpis.unrecoveredExposure,
    verifiedRecoveredValueLKR: kpis.verifiedRecoveredValue,
    recoveryRatePercent: kpis.recoveryRateByValue.toFixed(1) + '%',
    overdueCasesCount: kpis.overdueCasesCount,
    topContributingCustomers: topCustomers.slice(0, 3).map((c) => ({
      customerCode: c.cxNumber,
      totalReturns: c.totalReturns,
      totalValueLKR: c.totalValue,
      unrecoveredExposureLKR: c.unrecoveredExposure,
      topReason: c.mostFrequentReason,
    })),
    topReturnReasons: topReasons.slice(0, 3).map((r) => ({
      reason: r.normalizedReason,
      count: r.count,
      totalValueLKR: r.totalValue,
      shareOfTotalValuePercent: r.shareOfTotalValue.toFixed(1) + '%',
    })),
    anomaliesCount: anomalies.length,
    keyAnomalies: anomalies.map((a) => ({
      category: a.category,
      severity: a.severity,
      evidence: a.evidence,
    })),
  };

  try {
    const res = await fetch('/api/ai-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryData: summaryPayload }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.available && Array.isArray(data.insights) && data.insights.length > 0) {
        return {
          available: true,
          insights: data.insights.map((ins: any) => ({
            ...ins,
            generatedBy: 'AI_MODEL',
          })),
        };
      }
    }
  } catch (err) {
    console.warn('Backend AI service call failed, falling back to rule engine:', err);
  }

  // Fallback to pure, deterministic rule-based management insights (Section 11)
  const ruleInsights: ManagementInsight[] = [];

  // Insight 1: Customer concentration
  if (topCustomers.length > 0) {
    const top1 = topCustomers[0];
    const topShare = kpis.totalValue > 0 ? (top1.totalValue / kpis.totalValue) * 100 : 0;
    ruleInsights.push({
      finding: `Severe Exposure Concentration in ${top1.cxName} (${top1.cxNumber})`,
      evidence: `${top1.totalReturns} cheques returned amounting to ${formatLKR(top1.totalValue)}, representing ${topShare.toFixed(1)}% of all returns. Verified unrecovered exposure: ${formatLKR(top1.unrecoveredExposure)}.`,
      businessImpact: `While total returned value stands at ${formatLKR(top1.totalValue)}, ${formatLKR(top1.unrecoveredExposure)} is at immediate cash-flow risk without security.`,
      recommendedAction: 'Engage customer executive management jointly with Recovery Supervisor; establish escrow or bank guarantee before releasing pending supply orders.',
      successMeasure: `Reduction of unrecovered balance below ${formatLKR(top1.unrecoveredExposure * 0.3)} within 30 days.`,
      limitations: 'Customer total annual turnover with WÜRTH not factored into return ratio.',
      generatedBy: 'RULE_ENGINE',
    });
  }

  // Insight 2: Dominant Root Cause
  if (topReasons.length > 0) {
    const primaryReason = topReasons[0];
    ruleInsights.push({
      finding: `Primary Failure Mode: ${primaryReason.normalizedReason}`,
      evidence: `${primaryReason.count} occurrences across ${primaryReason.customerCount} customers, accounting for ${formatLKR(primaryReason.totalValue)} (${primaryReason.shareOfTotalValue.toFixed(1)}% of total value).`,
      businessImpact: 'Indicates either systemic pre-banking settlement timing discrepancies or credit exhaustion across multiple customer facilities.',
      recommendedAction: 'Standardize customer pre-clearing notification 48 hours prior to cheque deposit and enforce mandate re-verification.',
      successMeasure: `Minimum 25% drop in "${primaryReason.normalizedReason}" returns over the next quarter.`,
      limitations: 'Bank-specific clearing cut-off times and holiday schedules vary by branch network.',
      generatedBy: 'RULE_ENGINE',
    });
  }

  // Insight 3: Recovery Efficiency
  ruleInsights.push({
    finding: `Operational Recovery Velocity: ${kpis.recoveryRateByValue.toFixed(1)}% Settled`,
    evidence: `Verified recovered funds equal ${formatLKR(kpis.verifiedRecoveredValue)} against total eligible cheques of ${formatLKR(kpis.totalValue)}. ${kpis.overdueCasesCount} cases have past-due follow-ups.`,
    businessImpact: `Unrecovered exposure currently stands at ${formatLKR(kpis.unrecoveredExposure)}. Delayed follow-up significantly reduces historical probability of recovery.`,
    recommendedAction: 'Reassign overdue follow-up queues to active recovery officers and institute mandatory 72-hour contact SLAs.',
    successMeasure: 'Zero overdue follow-up cases and recovery rate surpassing 65%.',
    limitations: 'Partial installment plans currently in transit are only counted upon bank confirmation.',
    generatedBy: 'RULE_ENGINE',
  });

  return {
    available: false,
    insights: ruleInsights,
    note: 'Rule-based analytical engine active (deterministic mathematical synthesis conforming to Section 11).',
  };
}
