import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Sliders,
  Database,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  DollarSign,
  UserCheck,
  Trash2,
  AlertOctagon,
  X,
  Lock,
} from 'lucide-react';
import { AnalyticalConfig, UserProfile } from '../types';
import { formatLKR } from '../services/analytics';
import {
  ClearDatabaseOptions,
  ClearDatabaseResult,
} from '../services/firebase';
import { ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../services/permissions';

interface SettingsAndAccessControlProps {
  config: AnalyticalConfig;
  onUpdateConfig: (config: AnalyticalConfig) => Promise<void>;
  onResetDataset: (loadSample: boolean) => Promise<void>;
  onPurgeDatabase: (options: ClearDatabaseOptions) => Promise<ClearDatabaseResult>;
  currentUser: UserProfile;
  totalRecordsCount: number;
}

export const SettingsAndAccessControl: React.FC<SettingsAndAccessControlProps> = ({
  config,
  onUpdateConfig,
  onResetDataset,
  onPurgeDatabase,
  currentUser,
  totalRecordsCount,
}) => {
  const [repeatThreshold, setRepeatThreshold] = useState(config.repeatReturnThreshold);
  const [highValueThreshold, setHighValueThreshold] = useState(config.highValueThreshold);
  const [overdueDays, setOverdueDays] = useState(config.overdueDaysThreshold);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Database Purge Modal State
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeOptions, setPurgeOptions] = useState<ClearDatabaseOptions>({
    clearCheques: true,
    clearActions: true,
    clearBatches: true,
    clearOrgMaster: false,
    clearAuditLogs: false,
  });
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<ClearDatabaseResult | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [datasetConfirmMode, setDatasetConfirmMode] = useState<'sample' | 'empty' | null>(null);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [datasetNotice, setDatasetNotice] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'SYSTEM_ADMIN';

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated: AnalyticalConfig = {
        repeatReturnThreshold: Number(repeatThreshold),
        highValueThreshold: Number(highValueThreshold),
        overdueDaysThreshold: Number(overdueDays),
        currency: 'LKR',
      };
      await onUpdateConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDatasetReset = async () => {
    if (!datasetConfirmMode) return;
    setDatasetBusy(true);
    setDatasetNotice(null);
    try {
      await onResetDataset(datasetConfirmMode === 'sample');
      setDatasetNotice(
        datasetConfirmMode === 'sample'
          ? 'Loaded official sample dataset (10 records).'
          : 'Active cheque register cleared to empty state.'
      );
      setDatasetConfirmMode(null);
    } catch (err) {
      setDatasetNotice(err instanceof Error ? err.message : 'Unable to update dataset.');
    } finally {
      setDatasetBusy(false);
    }
  };

  const handleExecutePurge = async () => {
    if (confirmPhrase.trim().toUpperCase() !== 'CLEAR DATABASE') return;
    setPurging(true);
    setPurgeError(null);
    try {
      const result = await onPurgeDatabase(purgeOptions);
      setPurgeResult(result);
      setConfirmPhrase('');
      setTimeout(() => {
        setPurgeModalOpen(false);
      }, 3000);
    } catch (err: unknown) {
      console.error('Database purge error:', err);
      const message =
        err instanceof Error ? err.message : 'Permission denied or network failure';
      setPurgeError(`Purge failed: ${message}`);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Config Form Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-slate-900 text-white rounded-md">
            <Sliders className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Analytical Risk Thresholds & System Parameters
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure parameters governing repeat-return flags, high-value priority queues, and overdue tracking.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Repeat Return Customer Threshold
              </label>
              <input
                type="number"
                min={2}
                max={10}
                value={repeatThreshold}
                onChange={(e) => setRepeatThreshold(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Minimum distinct returned cheques to trigger Repeat Customer status (Default: 2)
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                High-Value Exposure Threshold (LKR)
              </label>
              <input
                type="number"
                step="10000"
                min={50000}
                value={highValueThreshold}
                onChange={(e) => setHighValueThreshold(parseFloat(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono tabular-nums"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Amount triggering automatic Critical/High Priority classification (Current:{' '}
                {formatLKR(highValueThreshold)})
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Overdue Follow-Up Threshold (Days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={overdueDays}
                onChange={(e) => setOverdueDays(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Days past commitment before escalation alert is dispatched (Default: 7)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {saveSuccess ? (
              <span className="text-emerald-700 text-xs font-semibold flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Thresholds saved and audit log updated!
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md shadow-xs transition-colors"
            >
              {saving ? 'Saving Changes...' : 'Save Configuration Parameters'}
            </button>
          </div>
        </form>
      </div>

      {/* Role-Based Access Control Reference (Section 13) */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-md">
            <Shield className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Role-Based Access Control Architecture (RBAC)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enforced server-side via authenticated session tokens, organizational Division Head scoping, and Firebase Security Rules. Manage accounts under <strong>User Management</strong>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {ALL_ROLES.map((role) => (
            <div key={role} className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900">{ROLE_LABELS[role]}</span>
                <span className="font-mono text-[10px] text-slate-500">{role}</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Dataset Management & Sample Data Controls (Section 18) */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-md">
            <Database className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Dataset Lifecycle Controls (Section 18 Development Data Protocol)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Reset the active register to an empty state for initial company Excel register import, or
              reload the 10 verified sample records.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setDatasetConfirmMode('sample')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
          >
            Reload Official Sample Dataset (10 Records)
          </button>

          <button
            type="button"
            onClick={() => setDatasetConfirmMode('empty')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-300 rounded transition-colors"
          >
            Reset Active Register to Empty State
          </button>
        </div>

        {datasetConfirmMode && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-amber-900 font-medium">
              {datasetConfirmMode === 'sample'
                ? 'Confirm reloading the 10 official sample records into the active cheque register?'
                : 'Confirm clearing active cheque records to an empty register? Organization Master data will be preserved.'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDatasetConfirmMode(null)}
                disabled={datasetBusy}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDatasetReset}
                disabled={datasetBusy}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded"
              >
                {datasetBusy ? 'Updating...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        )}

        {datasetNotice && (
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            <span>{datasetNotice}</span>
          </div>
        )}
      </div>

      {/* High-Security System Admin Purge Zone */}
      {isAdmin ? (
        <div className="bg-red-50/40 border-2 border-red-200 rounded-lg p-6 shadow-2xs space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-600 text-white rounded-md shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-red-950 tracking-tight">
                    Danger Zone: System Administrator Database Purge
                  </h3>
                  <span className="text-[10px] font-mono font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                    ADMIN ONLY
                  </span>
                </div>
                <p className="text-xs text-red-900/80 mt-1 leading-relaxed max-w-2xl">
                  Permanently delete all returned-cheque records, recovery interventions, import batches,
                  and optionally the audit log from Cloud Firestore and local persistence stores.
                  This operation cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-red-200/60">
            <span className="text-xs font-mono text-red-800">
              Active records in database: <strong>{totalRecordsCount}</strong>
            </span>

            <button
              onClick={() => {
                setPurgeResult(null);
                setPurgeError(null);
                setConfirmPhrase('');
                setPurgeModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-md shadow-xs transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete All Records & Clear Database</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>
              Database Purge and mass record deletion controls are restricted to <strong>SYSTEM_ADMIN</strong>.
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            Current role: {currentUser.role}
          </span>
        </div>
      )}

      {/* Two-Step Purge Confirmation Modal */}
      {purgeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 space-y-4 border border-red-300">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5 text-red-700">
                <AlertOctagon className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">
                  Confirm Database Purge
                </h3>
              </div>
              <button
                onClick={() => setPurgeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {purgeResult ? (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-900 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-sm">Database Successfully Purged</h4>
                <div className="text-xs font-mono space-y-1 text-emerald-800">
                  <div>Deleted Cheque Records: {purgeResult.deletedCheques}</div>
                  <div>Deleted Recovery Actions: {purgeResult.deletedActions}</div>
                  <div>Deleted Import Batches: {purgeResult.deletedBatches}</div>
                  <div>Deleted Organization Master Docs: {purgeResult.deletedOrgMaster || 0}</div>
                  <div>Deleted Audit Logs: {purgeResult.deletedAuditLogs}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {purgeError && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded text-red-800 font-medium">
                    {purgeError}
                  </div>
                )}
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 leading-relaxed">
                  <strong>WARNING:</strong> This action will permanently erase the selected collections
                  from the enterprise database. Data cannot be recovered once purged.
                </div>

                <div>
                  <label className="block font-bold text-slate-900 mb-2">
                    Select Collections to Purge:
                  </label>
                  <div className="space-y-2 font-medium">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={purgeOptions.clearCheques}
                        onChange={(e) =>
                          setPurgeOptions({ ...purgeOptions, clearCheques: e.target.checked })
                        }
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span>Returned Cheque Records (<code>cheque_records</code>)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={purgeOptions.clearActions}
                        onChange={(e) =>
                          setPurgeOptions({ ...purgeOptions, clearActions: e.target.checked })
                        }
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span>Recovery Actions & Interventions (<code>recovery_actions</code>)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={purgeOptions.clearBatches}
                        onChange={(e) =>
                          setPurgeOptions({ ...purgeOptions, clearBatches: e.target.checked })
                        }
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span>Spreadsheet Ingestion Batches (<code>import_batches</code>)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!purgeOptions.clearOrgMaster}
                        onChange={(e) =>
                          setPurgeOptions({ ...purgeOptions, clearOrgMaster: e.target.checked })
                        }
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span>
                        Organization Master Directories (<code>adm_master</code>, <code>customer_master</code>,{' '}
                        <code>team_master</code>, <code>division_head_master</code>)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                      <input
                        type="checkbox"
                        checked={purgeOptions.clearAuditLogs}
                        onChange={(e) =>
                          setPurgeOptions({ ...purgeOptions, clearAuditLogs: e.target.checked })
                        }
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span>Operational Audit Log History (<code>audit_logs</code>)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block font-bold text-slate-900 mb-1">
                    Security Verification:
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Please type <strong className="font-mono text-red-600 select-all">CLEAR DATABASE</strong> to
                    unlock the purge button:
                  </p>
                  <input
                    type="text"
                    placeholder="Type CLEAR DATABASE"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-xs uppercase"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPurgeModalOpen(false)}
                    disabled={purging}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleExecutePurge}
                    disabled={
                      purging || confirmPhrase.trim().toUpperCase() !== 'CLEAR DATABASE'
                    }
                    className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded transition-colors ${
                      confirmPhrase.trim().toUpperCase() === 'CLEAR DATABASE' && !purging
                        ? 'bg-red-600 hover:bg-red-700 cursor-pointer shadow-xs'
                        : 'bg-red-300 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {purging ? 'Purging Firestore...' : 'Permanently Delete All Selected Records'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
