/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Multi-format Report Generation & Export Service (CSV & Excel)
 */

import * as XLSX from 'xlsx';
import { ChequeRecord, FilterState, KPIMetrics, CustomerSummary, AdmSummary, ReasonSummary } from '../types';
import { formatLKR } from './analytics';

export type ReportType =
  | 'COMPLETE_REGISTER'
  | 'MONTHLY_SUMMARY'
  | 'CUSTOMER_ANALYSIS'
  | 'ADM_ANALYSIS'
  | 'REASON_ANALYSIS'
  | 'REPEAT_CUSTOMERS'
  | 'UNRESOLVED_CASES'
  | 'OVERDUE_FOLLOWUPS'
  | 'HIGH_PRIORITY_CASES'
  | 'RECOVERY_OUTCOMES';

export interface ExportOptions {
  reportType: ReportType;
  records: ChequeRecord[];
  filters: FilterState;
  kpis?: KPIMetrics;
  customers?: CustomerSummary[];
  adms?: AdmSummary[];
  reasons?: ReasonSummary[];
  format: 'xlsx' | 'csv';
}

export function generateReportData(options: ExportOptions): { filename: string; data: any[] } {
  const { reportType, records, filters, customers, adms, reasons } = options;
  const timestamp = new Date().toISOString().slice(0, 10);

  switch (reportType) {
    case 'COMPLETE_REGISTER':
      return {
        filename: `WURTH_Cheque_Register_${timestamp}`,
        data: records.map((r, i) => ({
          '#': i + 1,
          'Record ID': r.id,
          'Month': r.month,
          'Date Posted': r.datePosted,
          'Effective Date': r.effectiveDate,
          'CX Number': r.cxNumber,
          'Customer Name': r.cxName,
          'ADM Code': r.admCode,
          'ADM Name': r.admName,
          'Cheque Reference': r.description,
          'Amount (LKR)': r.amount,
          'Return Reason (Raw)': r.returnReason,
          'Normalized Reason': r.normalizedReason,
          'Recovery Status': r.recoveryStatus,
          'Priority': r.priority,
          'Assigned Officer': r.assignedOfficer,
          'Recovered Amount (LKR)': r.recoveredAmount,
          'Unrecovered Exposure (LKR)': r.remainingAmount,
          'Next Action': r.nextAction,
          'Next Follow-up': r.nextFollowUpDate,
          'Original Final Remark': r.finalRemark,
        })),
      };

    case 'CUSTOMER_ANALYSIS':
      return {
        filename: `WURTH_Customer_Intelligence_${timestamp}`,
        data: (customers || []).map((c, i) => ({
          '#': i + 1,
          'CX Number': c.cxNumber,
          'Customer Name': c.cxName,
          'Total Returns': c.totalReturns,
          'Total Returned Value (LKR)': c.totalValue,
          'Average Amount (LKR)': Math.round(c.averageAmount),
          'Unrecovered Exposure (LKR)': c.unrecoveredExposure,
          'Recovered Value (LKR)': c.verifiedRecoveredAmount,
          'Unresolved Cases': c.unresolvedCount,
          'Distinct Return Months': c.distinctMonthsCount,
          'Most Frequent Reason': c.mostFrequentReason,
          'Repeat Status': c.isRepeatCustomer ? 'REPEAT CUSTOMER' : 'SINGLE',
          'Deteriorating Alert': c.isDeteriorating ? 'YES' : 'NO',
          'Assigned ADMs': c.assignedAdms.join(', '),
        })),
      };

    case 'ADM_ANALYSIS':
      return {
        filename: `WURTH_ADM_Performance_Report_${timestamp}`,
        data: (adms || []).map((a, i) => ({
          '#': i + 1,
          'ADM Code': a.admCode,
          'ADM Name': a.admName,
          'Recorded Return Count': a.totalReturns,
          'Recorded Return Value (LKR)': a.totalValue,
          'Average Return Amount (LKR)': Math.round(a.averageAmount),
          'Unique Customers': a.uniqueCustomers,
          'Repeat Return Customers in Portfolio': a.repeatCustomersCount,
          'Unrecovered Exposure (LKR)': a.unrecoveredExposure,
          'Top Return Reason': a.topReturnReason,
          'Notice': 'Report reflects recorded returns only; sales volume & portfolio denominators omitted per guidelines.',
        })),
      };

    case 'REASON_ANALYSIS':
      return {
        filename: `WURTH_Return_Reason_Analytics_${timestamp}`,
        data: (reasons || []).map((res, i) => ({
          '#': i + 1,
          'Normalized Reason': res.normalizedReason,
          'Return Count': res.count,
          'Total Value (LKR)': res.totalValue,
          'Average Amount (LKR)': Math.round(res.averageAmount),
          'Share of Value (%)': res.shareOfTotalValue.toFixed(1) + '%',
          'Share of Count (%)': res.shareOfTotalCount.toFixed(1) + '%',
          'Affected Customers': res.customerCount,
          'Repeat Customer Occurrences': res.repeatCustomerOccurrenceCount,
          'Original Raw Variations': res.originalVariations.join(' | '),
        })),
      };

    case 'REPEAT_CUSTOMERS':
      return {
        filename: `WURTH_Repeat_Return_Customers_${timestamp}`,
        data: (customers || [])
          .filter((c) => c.isRepeatCustomer)
          .map((c, i) => ({
            '#': i + 1,
            'CX Number': c.cxNumber,
            'Customer Name': c.cxName,
            'Total Cheque Returns': c.totalReturns,
            'Total Value (LKR)': c.totalValue,
            'Unrecovered Exposure (LKR)': c.unrecoveredExposure,
            'Unresolved Cases': c.unresolvedCount,
            'Primary Reason': c.mostFrequentReason,
            'Earliest Return': c.firstReturnDate,
            'Latest Return': c.latestReturnDate,
          })),
      };

    case 'UNRESOLVED_CASES':
      return {
        filename: `WURTH_Unresolved_Recovery_Queue_${timestamp}`,
        data: records
          .filter((r) => r.recoveryStatus !== 'RECOVERED' && r.recoveryStatus !== 'CLOSED_OTHER')
          .map((r, i) => ({
            '#': i + 1,
            'Record ID': r.id,
            'Customer': `${r.cxName} (${r.cxNumber})`,
            'Cheque Ref': r.description,
            'Date Posted': r.datePosted,
            'Total Amount (LKR)': r.amount,
            'Remaining Exposure (LKR)': r.remainingAmount,
            'Recovery Status': r.recoveryStatus,
            'Priority': r.priority,
            'Assigned Officer': r.assignedOfficer,
            'Next Action': r.nextAction,
            'Follow-up Date': r.nextFollowUpDate,
            'Reason': r.returnReason,
          })),
      };

    case 'OVERDUE_FOLLOWUPS':
      const today = new Date().toISOString().slice(0, 10);
      return {
        filename: `WURTH_Overdue_Followups_${timestamp}`,
        data: records
          .filter(
            (r) =>
              r.nextFollowUpDate &&
              r.nextFollowUpDate < today &&
              r.recoveryStatus !== 'RECOVERED' &&
              r.recoveryStatus !== 'CLOSED_OTHER'
          )
          .map((r, i) => ({
            '#': i + 1,
            'Record ID': r.id,
            'Customer': `${r.cxName} (${r.cxNumber})`,
            'Amount (LKR)': r.amount,
            'Unrecovered (LKR)': r.remainingAmount,
            'Follow-up Due Date': r.nextFollowUpDate,
            'Days Overdue': Math.floor((new Date(today).getTime() - new Date(r.nextFollowUpDate).getTime()) / (1000 * 3600 * 24)),
            'Assigned Officer': r.assignedOfficer,
            'Planned Action': r.nextAction,
            'Status': r.recoveryStatus,
          })),
      };

    case 'HIGH_PRIORITY_CASES':
      return {
        filename: `WURTH_High_Critical_Priority_Cases_${timestamp}`,
        data: records
          .filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH')
          .map((r, i) => ({
            '#': i + 1,
            'Priority': r.priority,
            'Priority Score': r.priorityScore,
            'Customer': `${r.cxName} (${r.cxNumber})`,
            'Cheque Ref': r.description,
            'Amount (LKR)': r.amount,
            'Unrecovered Exposure (LKR)': r.remainingAmount,
            'Status': r.recoveryStatus,
            'Officer': r.assignedOfficer,
            'Reason for Priority': r.priorityExplanation,
            'Next Action': r.nextAction,
          })),
      };

    case 'RECOVERY_OUTCOMES':
      return {
        filename: `WURTH_Recovery_Outcomes_${timestamp}`,
        data: records
          .filter((r) => r.recoveredAmount > 0 || r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'PARTIALLY_RECOVERED')
          .map((r, i) => ({
            '#': i + 1,
            'Record ID': r.id,
            'Customer': `${r.cxName} (${r.cxNumber})`,
            'Original Cheque Amount (LKR)': r.amount,
            'Verified Recovered (LKR)': r.recoveredAmount,
            'Remaining Balance (LKR)': r.remainingAmount,
            'Status': r.recoveryStatus,
            'Resolution Date': r.resolutionDate || 'In Progress',
            'Resolution Evidence': r.resolutionEvidence,
            'Officer': r.assignedOfficer,
          })),
      };

    default:
      return { filename: `WURTH_Report_${timestamp}`, data: [] };
  }
}

/**
 * Trigger browser download of Excel or CSV
 */
export function exportReport(options: ExportOptions): boolean {
  const { filename, data } = generateReportData(options);
  if (!data || data.length === 0) {
    return false;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

  if (options.format === 'csv') {
    XLSX.writeFile(workbook, `${filename}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, `${filename}.xlsx`, { bookType: 'xlsx' });
  }
  return true;
}
