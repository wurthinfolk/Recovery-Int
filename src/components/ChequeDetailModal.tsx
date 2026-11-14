import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  DollarSign,
  Calendar,
  User,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  History,
  Edit2,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import {
  ChequeRecord,
  RecoveryAction,
  AuditLog,
  UserProfile,
  ActionType,
  RecoveryStatus,
} from '../types';
import { formatLKR } from '../services/analytics';
import { getRecoveryActions, getAuditLogs } from '../services/firebase';

interface ChequeDetailModalProps {
  record: ChequeRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (record: ChequeRecord) => void;
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

export const ChequeDetailModal: React.FC<ChequeDetailModalProps> = ({
  record,
  isOpen,
  onClose,
  onEdit,
  onLogAction,
  currentUser,
}) => {
  if (!isOpen || !record) return null;

  const [actions, setActions] = useState<RecoveryAction[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Quick action form state
  const [showActionForm, setShowActionForm] = useState(false);
  const [quickActionType, setQuickActionType] = useState<ActionType>('CONTACT_ATTEMPT');
  const [quickNotes, setQuickNotes] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [recoveredAmount, setRecoveredAmount] = useState('');
  const [replacementRef, setReplacementRef] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    if (record) {
      setLoadingHistory(true);
      Promise.all([getRecoveryActions(record.id), getAuditLogs()])
        .then(([actList, auditList]) => {
          setActions(actList);
          setAuditTrail(auditList.filter((a) => a.recordId === record.id));
        })
        .finally(() => setLoadingHistory(false));
    }
  }, [record]);

  const handleQuickActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAction(true);
    try {
      let nextStatus = record.recoveryStatus;
      if (quickActionType === 'FULL_RECOVERY') nextStatus = 'RECOVERED';
      else if (quickActionType === 'PARTIAL_PAYMENT') nextStatus = 'PARTIALLY_RECOVERED';
      else if (quickActionType === 'PAYMENT_PROMISED') nextStatus = 'PAYMENT_PROMISED';
      else if (quickActionType === 'ESCALATION') nextStatus = 'ESCALATED';
      else if (quickActionType === 'REPLACEMENT_CHEQUE') nextStatus = 'AWAITING_REPLACEMENT';

      await onLogAction(record, quickActionType, quickNotes, {
        promisedDate: promisedDate || undefined,
        recoveredAmount: recoveredAmount ? parseFloat(recoveredAmount) : undefined,
        replacementRef: replacementRef || undefined,
        newStatus: nextStatus,
      });

      setShowActionForm(false);
      setQuickNotes('');
      // Refresh actions list
      const updated = await getRecoveryActions(record.id);
      setActions(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingAction(false);
    }
  };

  const canEdit = currentUser.role !== 'MANAGEMENT_VIEWER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                {record.id}
              </span>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {record.description}
              </h3>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {record.cxName} ({record.cxNumber}) · ADM: {record.admName} ({record.admCode})
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(record);
                }}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded flex items-center gap-1 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Record</span>
              </button>
            )}
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Financial & Status Highlight Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Cheque Value</span>
              <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                {formatLKR(record.amount)}
              </div>
            </div>

            <div className="p-3 bg-red-50 rounded border border-red-200">
              <span className="text-[10px] text-red-800 uppercase font-semibold">Remaining Exposure</span>
              <div className="text-base font-bold text-red-700 font-mono mt-0.5">
                {formatLKR(record.remainingAmount)}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
              <span className="text-[10px] text-emerald-800 uppercase font-semibold">Verified Recovered</span>
              <div className="text-base font-bold text-emerald-700 font-mono mt-0.5">
                {formatLKR(record.recoveredAmount)}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Recovery Status</span>
              <div className="text-xs font-bold text-slate-800 mt-1">
                {record.recoveryStatus.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          {/* Original Business Fields (Section 4A) */}
          <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-3">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
              Original Register Data (Source Fields)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-[11px]">
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">Date-Posted</span>
                <span className="font-semibold text-slate-800">{record.datePosted}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">Effective-Date</span>
                <span className="font-semibold text-slate-800">{record.effectiveDate}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">Month Header</span>
                <span className="font-semibold text-slate-800">{record.month}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">CX NUMBER</span>
                <span className="font-semibold text-slate-800">{record.cxNumber}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">ADM CODE</span>
                <span className="font-semibold text-slate-800">{record.admCode}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-slate-500 block">Assigned Officer</span>
                <span className="font-semibold text-slate-800">{record.assignedOfficer}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 text-xs">
              <div className="mb-1">
                <span className="font-semibold text-slate-700">Return Reason (Original): </span>
                <span className="text-slate-900">{record.returnReason}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {' '}
                  (Normalized: {record.normalizedReason})
                </span>
              </div>
              {record.finalRemark && (
                <div>
                  <span className="font-semibold text-slate-700">Original Final Remark: </span>
                  <span className="text-slate-800 italic">"{record.finalRemark}"</span>
                </div>
              )}
            </div>
          </div>

          {/* Next Planned Action Strip */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-amber-900 block">Current Action Plan:</span>
              <span className="text-amber-800">{record.nextAction || 'No action scheduled.'}</span>
              {record.nextFollowUpDate && (
                <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                  Follow-up commitment date: {record.nextFollowUpDate}
                </div>
              )}
            </div>

            {canEdit && (
              <button
                onClick={() => setShowActionForm(!showActionForm)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-xs transition-colors shrink-0"
              >
                {showActionForm ? 'Hide Form' : 'Log Intervention'}
              </button>
            )}
          </div>

          {/* Quick Action Input Form */}
          {showActionForm && (
            <form onSubmit={handleQuickActionSubmit} className="p-4 bg-slate-100 rounded-lg space-y-3">
              <h5 className="font-bold text-xs text-slate-900">Log Recovery Step</h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Action Type
                  </label>
                  <select
                    value={quickActionType}
                    onChange={(e) => setQuickActionType(e.target.value as ActionType)}
                    className="w-full p-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="CONTACT_ATTEMPT">Contact Attempt</option>
                    <option value="PAYMENT_PROMISED">Payment Promised</option>
                    <option value="PARTIAL_PAYMENT">Verified Partial Payment</option>
                    <option value="FULL_RECOVERY">Verified Full Settlement</option>
                    <option value="REPLACEMENT_CHEQUE">Replacement Cheque</option>
                    <option value="ESCALATION">Escalate Case</option>
                    <option value="INTERNAL_NOTE">Internal Note</option>
                  </select>
                </div>

                {quickActionType === 'PAYMENT_PROMISED' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Promised Date
                    </label>
                    <input
                      type="date"
                      required
                      value={promisedDate}
                      onChange={(e) => setPromisedDate(e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                )}

                {(quickActionType === 'PARTIAL_PAYMENT' || quickActionType === 'FULL_RECOVERY') && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Amount Received (LKR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder={String(record.remainingAmount)}
                      value={recoveredAmount}
                      onChange={(e) => setRecoveredAmount(e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Intervention Notes / Receipt Reference
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Details of call, payment slip, or replacement cheque..."
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded bg-white"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowActionForm(false)}
                  className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded"
                >
                  {submittingAction ? 'Saving...' : 'Record Step'}
                </button>
              </div>
            </form>
          )}

          {/* Recovery Actions History Timeline */}
          <div>
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-2">
              Recovery Intervention Timeline ({actions.length})
            </h4>

            <div className="border border-slate-200 rounded divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {actions.map((act) => (
                <div key={act.id} className="p-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-900 font-mono">
                      [{act.actionType.replace(/_/g, ' ')}]
                    </span>
                    <span className="text-slate-400 font-mono">
                      {new Date(act.createdAt).toLocaleString()} · Officer: {act.officerName}
                    </span>
                  </div>
                  <p className="text-slate-700">{act.notes}</p>
                  {act.promisedDate && (
                    <div className="text-[10px] text-purple-700 font-mono mt-0.5">
                      Promised Date: {act.promisedDate}
                    </div>
                  )}
                  {act.recoveredAmount !== undefined && act.recoveredAmount > 0 && (
                    <div className="text-[10px] text-emerald-700 font-mono font-semibold mt-0.5">
                      Recovered: {formatLKR(act.recoveredAmount)}
                    </div>
                  )}
                </div>
              ))}

              {actions.length === 0 && (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No recovery actions recorded yet for this case.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs">
          <span className="text-slate-400 font-mono text-[10px]">
            Created {new Date(record.createdAt).toLocaleDateString()} by {record.createdBy}
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
