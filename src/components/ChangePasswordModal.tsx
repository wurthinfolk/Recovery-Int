import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, X, ShieldAlert, Loader2 } from 'lucide-react';
import { apiChangePassword } from '../services/api';
import type { UserProfile } from '../types';

interface ChangePasswordModalProps {
  currentUser: UserProfile;
  forceOpen: boolean;
  onSuccess: (updatedUser: UserProfile) => void;
  onClose?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  currentUser,
  forceOpen,
  onSuccess,
  onClose,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasMinLength = newPassword.length >= 8;
  const hasUpperAndLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
  const matchesConfirm = newPassword.length > 0 && newPassword === confirmPassword;
  const differsFromCurrent = !currentPassword || newPassword !== currentPassword;

  const isFormValid =
    Boolean(currentPassword) &&
    hasMinLength &&
    hasUpperAndLower &&
    hasDigitOrSymbol &&
    matchesConfirm &&
    differsFromCurrent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setErrorMsg('Please satisfy all password security requirements below.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const updatedUser = await apiChangePassword(currentPassword, newPassword);
      onSuccess(updatedUser);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#CC0000] text-white">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {forceOpen ? 'Password Update Required' : 'Change Account Password'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">{currentUser.username}</p>
            </div>
          </div>
          {!forceOpen && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {forceOpen && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                You are signed in with an initial or administrator-issued temporary password. Set a private password to continue into WÜRTH Recovery Intelligence.
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Current / Temporary Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#CC0000] focus:border-[#CC0000]"
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#CC0000] focus:border-[#CC0000]"
                placeholder="Create a strong password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#CC0000] focus:border-[#CC0000]"
              placeholder="Re-enter new password"
            />
          </div>

          {/* Password Policy Checklist */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-[11px]">
            <div className="font-semibold text-slate-700 mb-1">Password Requirements:</div>
            <RuleCheck ok={hasMinLength} label="At least 8 characters" />
            <RuleCheck ok={hasUpperAndLower} label="Includes uppercase and lowercase letters" />
            <RuleCheck ok={hasDigitOrSymbol} label="Includes at least one number or symbol" />
            <RuleCheck ok={differsFromCurrent} label="Different from current/temporary password" />
            <RuleCheck ok={matchesConfirm} label="Confirmation matches new password" />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            {!forceOpen && onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="px-4 py-2 bg-[#CC0000] hover:bg-[#B00000] disabled:bg-red-300 text-white font-semibold rounded-md transition-colors inline-flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Updating...' : 'Save New Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RuleCheck: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <div className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${ok ? 'text-emerald-600' : 'text-slate-300'}`} />
    <span>{label}</span>
  </div>
);
