import React from 'react';
import { ShieldOff, ArrowLeft } from 'lucide-react';
import type { NavItemId, UserRole } from '../types';
import { ROLE_LABELS } from '../services/permissions';

interface AccessDeniedViewProps {
  attemptedSection: string;
  role: UserRole;
  defaultTab: NavItemId;
  onReturnToDashboard: (tab: NavItemId) => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  attemptedSection,
  role,
  defaultTab,
  onReturnToDashboard,
}) => {
  return (
    <div className="max-w-lg mx-auto my-12 bg-white border border-red-200 rounded-lg p-6 shadow-xs text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 text-[#CC0000] flex items-center justify-center mx-auto">
        <ShieldOff className="w-6 h-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-bold text-slate-900">Access Denied</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Your signed-in role (<strong>{ROLE_LABELS[role]}</strong>) does not have permission to view{' '}
          <span className="font-mono font-semibold text-slate-900">{attemptedSection}</span>. This attempt has been recorded in the security audit trail.
        </p>
      </div>
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onReturnToDashboard(defaultTab)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#CC0000] hover:bg-[#B00000] text-white text-xs font-semibold rounded-md transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Authorized Dashboard</span>
        </button>
      </div>
    </div>
  );
};
