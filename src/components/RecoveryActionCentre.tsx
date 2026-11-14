import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  PhoneCall,
  Calendar,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
  UserPlus,
  ArrowRight,
  FileCheck,
  FileText,
  MessageSquare,
  Search,
  Filter,
} from 'lucide-react';
import {
  ChequeRecord,
  RecoveryStatus,
  PriorityLevel,
  UserProfile,
  ActionType,
} from '../types';
import { formatLKR, formatCompactLKR } from '../services/analytics';

interface RecoveryActionCentreProps {
  records: ChequeRecord[];
  onSelectRecord: (record: ChequeRecord) => void;
  onLogAction: (
    record: ChequeRecord,
    actionType: ActionType,
    notes: string,
    details: {
      promisedDate?: string;
      promisedAmount?: number;
      recoveredAmount?: number;
      replacementRef?: string;
      newStatus?: RecoveryStatus;
    }
  ) => Promise<void>;
  currentUser: UserProfile;
}

export const RecoveryActionCentre: React.FC<RecoveryActionCentreProps> = ({
  records,
  onSelectRecord,
  onLogAction,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'PRIORITY' | 'OVERDUE' | 'PROMISED' | 'RECOVERED'>('PRIORITY');
  const [actionModalRecord, setActionModalRecord] = useState<ChequeRecord | null>(null);
  const [actionType, setActionType] = useState<ActionType>('CONTACT_ATTEMPT');
  const [actionNotes, setActionNotes] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [recoveredAmount, setRecoveredAmount] = useState('');
  const [replacementRef, setReplacementRef] = useState('');
  const [newStatus, setNewStatus] = useState<RecoveryStatus>('CONTACT_REQUIRED');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter queues
  const unresolvedRecords = records.filter(
    (r) => r.recoveryStatus !== 'RECOVERED' && r.recoveryStatus !== 'CLOSED_OTHER'
  );

  const overdueRecords = records.filter(
    (r) =>
      r.nextFollowUpDate &&
      r.nextFollowUpDate < todayStr &&
      r.recoveryStatus !== 'RECOVERED' &&
      r.recoveryStatus !== 'CLOSED_OTHER'
  );

  const promisedRecords = records.filter((r) => r.recoveryStatus === 'PAYMENT_PROMISED');

  const recoveredRecords = records.filter(
    (r) => r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'PARTIALLY_RECOVERED'
  );

  // Ranked priority list
  const prioritySorted = [...unresolvedRecords].sort((a, b) => b.priorityScore - a.priorityScore);

  const handleOpenActionModal = (record: ChequeRecord) => {
    setActionModalRecord(record);
    setActionType('CONTACT_ATTEMPT');
    setActionNotes('');
    setPromisedDate('');
    setPromisedAmount('');
    setRecoveredAmount('');
    setReplacementRef('');
    setNewStatus(record.recoveryStatus);
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModalRecord) return;

    setSubmitting(true);
    try {
      await onLogAction(actionModalRecord, actionType, actionNotes, {
        promisedDate: promisedDate || undefined,
        promisedAmount: promisedAmount ? parseFloat(promisedAmount) : undefined,
        recoveredAmount: recoveredAmount ? parseFloat(recoveredAmount) : undefined,
        replacementRef: replacementRef || undefined,
        newStatus,
      });
      setActionModalRecord(null);
    } catch (err) {
      console.error('Failed to log action:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Queue Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setActiveTab('PRIORITY')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'PRIORITY'
              ? 'bg-red-50/70 border-red-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-tight">
            <span>Critical & High Work Queue</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
            {unresolvedRecords.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').length}
          </div>
          <div className="text-[11px] text-red-600 font-medium mt-1">
            {formatLKR(
              unresolvedRecords
                .filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH')
                .reduce((s, r) => s + r.remainingAmount, 0)
            )}{' '}
            exposure
          </div>
        </div>

        <div
          onClick={() => setActiveTab('OVERDUE')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'OVERDUE'
              ? 'bg-amber-50/70 border-amber-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-tight">
            <span>Overdue Follow-ups</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-2 font-mono tabular-nums">
            {overdueRecords.length}
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-1">
            Missed commitment deadlines
          </div>
        </div>

        <div
          onClick={() => setActiveTab('PROMISED')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'PROMISED'
              ? 'bg-purple-50/70 border-purple-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-tight">
            <span>Payment Promised</span>
            <DollarSign className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-800 mt-2 font-mono tabular-nums">
            {promisedRecords.length}
          </div>
          <div className="text-[11px] text-purple-600 font-medium mt-1">
            Awaiting confirmed bank credit
          </div>
        </div>

        <div
          onClick={() => setActiveTab('RECOVERED')}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'RECOVERED'
              ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-tight">
            <span>Settled & Partial Recoveries</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2 font-mono tabular-nums">
            {recoveredRecords.length}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1 font-mono">
            {formatLKR(records.reduce((s, r) => s + (r.recoveredAmount || 0), 0))} verified
          </div>
        </div>
      </div>

      {/* Action Table Section */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900 tracking-tight">
              {activeTab === 'PRIORITY' && 'Priority-Ranked Recovery Queue'}
              {activeTab === 'OVERDUE' && 'Overdue Follow-Up Commitments'}
              {activeTab === 'PROMISED' && 'Payment Promised Follow-Up Queue'}
              {activeTab === 'RECOVERED' && 'Verified Recoveries & Settlements'}
            </h3>
            <span className="text-xs text-slate-500">
              · Prioritized by rule-based exposure and customer history
            </span>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            {activeTab === 'PRIORITY' && `${prioritySorted.length} cases`}
            {activeTab === 'OVERDUE' && `${overdueRecords.length} overdue`}
            {activeTab === 'PROMISED' && `${promisedRecords.length} promised`}
            {activeTab === 'RECOVERED' && `${recoveredRecords.length} settled`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Customer (CX)</th>
                <th className="py-2.5 px-3">Cheque Reference</th>
                <th className="py-2.5 px-3 text-right">Unrecovered Exposure</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Assigned Officer</th>
                <th className="py-2.5 px-3">Next Action & Commitment</th>
                <th className="py-2.5 px-3 text-center">Intervene</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === 'PRIORITY'
                ? prioritySorted
                : activeTab === 'OVERDUE'
                ? overdueRecords
                : activeTab === 'PROMISED'
                ? promisedRecords
                : recoveredRecords
              ).map((rec) => {
                const isOverdue =
                  rec.nextFollowUpDate &&
                  rec.nextFollowUpDate < todayStr &&
                  rec.recoveryStatus !== 'RECOVERED';

                return (
                  <tr
                    key={rec.id}
                    onClick={() => onSelectRecord(rec)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                            rec.priority === 'CRITICAL'
                              ? 'bg-red-100 text-red-700'
                              : rec.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {rec.priority}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {rec.priorityScore}pts
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]" title={rec.priorityExplanation}>
                        {rec.priorityExplanation}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors">
                        {rec.cxName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {rec.cxNumber} · ADM: {rec.admName}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <div>{rec.description}</div>
                      <div className="text-[10px] text-slate-400">
                        {rec.normalizedReason}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-red-600">
                      {formatLKR(rec.remainingAmount)}
                      <div className="text-[10px] text-slate-400 font-normal">
                        Orig: {formatLKR(rec.amount)}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                        {rec.recoveryStatus.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {rec.assignedOfficer || 'Unassigned'}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-slate-800 font-medium truncate max-w-[180px]">
                        {rec.nextAction || 'Pending Plan'}
                      </div>
                      {rec.nextFollowUpDate && (
                        <div
                          className={`text-[10px] font-mono flex items-center gap-1 ${
                            isOverdue ? 'text-red-600 font-bold' : 'text-slate-500'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>Due: {rec.nextFollowUpDate}</span>
                          {isOverdue && <span>(OVERDUE)</span>}
                        </div>
                      )}
                    </td>

                    <td
                      className="py-2.5 px-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleOpenActionModal(rec)}
                        className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-300 rounded transition-colors whitespace-nowrap"
                      >
                        Log Action
                      </button>
                    </td>
                  </tr>
                );
              })}

              {unresolvedRecords.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    All recorded returned cheques have been verified recovered or resolved!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Recovery Action Modal (Section 7 Recovery Workflow) */}
      {actionModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Log Recovery Intervention
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Case: {actionModalRecord.description} · {actionModalRecord.cxName}
                </p>
              </div>
              <button
                onClick={() => setActionModalRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteAction} className="space-y-4 text-xs">
              {/* Action Type */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Action / Intervention Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={actionType}
                  onChange={(e) => {
                    const val = e.target.value as ActionType;
                    setActionType(val);
                    if (val === 'PAYMENT_PROMISED') setNewStatus('PAYMENT_PROMISED');
                    else if (val === 'FULL_RECOVERY') setNewStatus('RECOVERED');
                    else if (val === 'PARTIAL_PAYMENT') setNewStatus('PARTIALLY_RECOVERED');
                    else if (val === 'ESCALATION') setNewStatus('ESCALATED');
                    else if (val === 'REPLACEMENT_CHEQUE') setNewStatus('AWAITING_REPLACEMENT');
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800"
                >
                  <option value="CONTACT_ATTEMPT">Customer Contact Attempt (Phone / Site Visit)</option>
                  <option value="PAYMENT_PROMISED">Payment Promised by Customer</option>
                  <option value="REPLACEMENT_CHEQUE">Replacement Cheque Received / Deposited</option>
                  <option value="PARTIAL_PAYMENT">Verified Partial Payment Received</option>
                  <option value="FULL_RECOVERY">Verified Full Recovery (Cheque Cleared / Cash)</option>
                  <option value="ESCALATION">Escalate to Recovery Supervisor / Legal</option>
                  <option value="INTERNAL_NOTE">Internal Recovery Note</option>
                </select>
              </div>

              {/* Conditional: Promised Date & Amount */}
              {actionType === 'PAYMENT_PROMISED' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/50 rounded border border-purple-200">
                  <div>
                    <label className="block font-semibold text-purple-900 mb-1">
                      Promised Settlement Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={promisedDate}
                      onChange={(e) => setPromisedDate(e.target.value)}
                      className="w-full px-2 py-1 border border-purple-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-purple-900 mb-1">
                      Promised Amount (LKR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={String(actionModalRecord.remainingAmount)}
                      value={promisedAmount}
                      onChange={(e) => setPromisedAmount(e.target.value)}
                      className="w-full px-2 py-1 border border-purple-300 rounded font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}

              {/* Conditional: Partial / Full Recovery Amount */}
              {(actionType === 'PARTIAL_PAYMENT' || actionType === 'FULL_RECOVERY') && (
                <div className="p-3 bg-emerald-50/50 rounded border border-emerald-200 space-y-2">
                  <div>
                    <label className="block font-semibold text-emerald-900 mb-1">
                      Verified Amount Received (LKR) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder={
                        actionType === 'FULL_RECOVERY'
                          ? String(actionModalRecord.remainingAmount)
                          : '0.00'
                      }
                      value={recoveredAmount}
                      onChange={(e) => setRecoveredAmount(e.target.value)}
                      className="w-full px-2 py-1 border border-emerald-300 rounded font-mono tabular-nums"
                    />
                  </div>
                  <p className="text-[10px] text-emerald-700">
                    Important: Section 4D requires that cheques are not considered recovered merely
                    by a word in remarks. Enter the confirmed receipt or bank transaction slip below.
                  </p>
                </div>
              )}

              {/* Conditional: Replacement Cheque Reference */}
              {actionType === 'REPLACEMENT_CHEQUE' && (
                <div className="p-3 bg-amber-50/50 rounded border border-amber-200">
                  <label className="block font-semibold text-amber-900 mb-1">
                    Replacement Cheque Number & Bank <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CHQ-991204 / Sampath Bank"
                    value={replacementRef}
                    onChange={(e) => setReplacementRef(e.target.value)}
                    className="w-full px-2 py-1 border border-amber-300 rounded font-mono"
                  />
                </div>
              )}

              {/* Notes & Resolution Evidence */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Intervention Notes / Receipt Slip Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Record summary of customer conversation, receipts, or escalation rationale..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>

              {/* New Recovery Status */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Update Case Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as RecoveryStatus)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800"
                >
                  <option value="NEW">New</option>
                  <option value="UNDER_INVESTIGATION">Under Investigation</option>
                  <option value="CONTACT_REQUIRED">Contact Required</option>
                  <option value="PAYMENT_PROMISED">Payment Promised</option>
                  <option value="AWAITING_REPLACEMENT">Awaiting Replacement Cheque</option>
                  <option value="PARTIALLY_RECOVERED">Partially Recovered</option>
                  <option value="RECOVERED">Recovered (Fully Settled)</option>
                  <option value="ESCALATED">Escalated</option>
                </select>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActionModalRecord(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-white bg-red-600 hover:bg-red-700 font-semibold rounded shadow-xs"
                >
                  {submitting ? 'Saving...' : 'Record Action & Update Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
