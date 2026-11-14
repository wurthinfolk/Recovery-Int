import React, { useState } from 'react';
import {
  Calendar,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { FilterState, UserProfile } from '../types';
import { DEMO_USERS } from '../services/firebase';

interface TopBarProps {
  pageTitle: string;
  filters: FilterState;
  onUpdateFilters: (filters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  currentUser: UserProfile;
  onChangeUser: (user: UserProfile) => void;
  dataQualityIssuesCount: number;
  onOpenDataQuality: () => void;
  isSampleDataLoaded: boolean;
  firebaseEmail: string | null;
  syncingCloud: boolean;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onSyncToCloud: () => Promise<void>;
}

export const TopBar: React.FC<TopBarProps> = ({
  pageTitle,
  filters,
  onUpdateFilters,
  onResetFilters,
  currentUser,
  onChangeUser,
  dataQualityIssuesCount,
  onOpenDataQuality,
  isSampleDataLoaded,
  firebaseEmail,
  syncingCloud,
  onSignInGoogle,
  onSignOutGoogle,
  onSyncToCloud,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Count active non-default filters
  let activeFilterCount = 0;
  if (filters.startDate || filters.endDate) activeFilterCount++;
  if (filters.cxNumber) activeFilterCount++;
  if (filters.admCode) activeFilterCount++;
  if (filters.division) activeFilterCount++;
  if (filters.teamId) activeFilterCount++;
  if (filters.divisionHeadId) activeFilterCount++;
  if (filters.returnReason) activeFilterCount++;
  if (filters.recoveryStatus) activeFilterCount++;
  if (filters.priority) activeFilterCount++;
  if (filters.assignedOfficer) activeFilterCount++;
  if (filters.searchQuery) activeFilterCount++;

  const handlePresetDate = (preset: 'ALL' | 'THIS_MONTH' | 'LAST_30' | 'LAST_90' | 'YTD') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'ALL') {
      onUpdateFilters({ startDate: '', endDate: '' });
    } else if (preset === 'THIS_MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      onUpdateFilters({ startDate: startOfMonth, endDate: todayStr });
    } else if (preset === 'LAST_30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      onUpdateFilters({ startDate: d.toISOString().slice(0, 10), endDate: todayStr });
    } else if (preset === 'LAST_90') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      onUpdateFilters({ startDate: d.toISOString().slice(0, 10), endDate: todayStr });
    } else if (preset === 'YTD') {
      const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      onUpdateFilters({ startDate: startOfYear, endDate: todayStr });
    }
    setDateDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-14 px-5 bg-white border-b border-slate-200 select-none shadow-2xs">
      {/* Left Zone: Title & Context */}
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">
          {pageTitle}
        </h1>

        {isSampleDataLoaded && (
          <span className="hidden sm:inline-flex items-center text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
            Sample Register (10 Verified Records)
          </span>
        )}

        {(filters.division || filters.teamId || filters.divisionHeadId) && (
          <span className="hidden md:inline-flex items-center text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono truncate max-w-[260px]">
            Org Scope:{' '}
            {filters.division ||
              (filters.teamId ? 'Team Filter Active' : 'Division Head Filter Active')}
          </span>
        )}
      </div>

      {/* Right Zone: Controls, Date Basis, Filters & User Switcher */}
      <div className="flex items-center gap-3">
        {/* Date Basis Segmented Control */}
        <div className="hidden lg:flex items-center p-0.5 bg-slate-100 rounded-md text-[11px] font-medium border border-slate-200">
          <button
            onClick={() => onUpdateFilters({ dateBasis: 'datePosted' })}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              filters.dateBasis === 'datePosted'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Use Date-Posted (Standard for financial trend reporting)"
          >
            Date-Posted
          </button>
          <button
            onClick={() => onUpdateFilters({ dateBasis: 'effectiveDate' })}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              filters.dateBasis === 'effectiveDate'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Use Effective-Date (Value / cheque maturity basis)"
          >
            Effective-Date
          </button>
        </div>

        {/* Date Range Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-mono text-[11px]">
              {filters.startDate || filters.endDate
                ? `${filters.startDate || 'Start'} → ${filters.endDate || 'Present'}`
                : 'All Periods'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {dateDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50 text-xs">
              <span className="font-semibold text-slate-900 block mb-2">Reporting Period</span>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                <button
                  onClick={() => handlePresetDate('ALL')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  All Available History
                </button>
                <button
                  onClick={() => handlePresetDate('THIS_MONTH')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Current Month
                </button>
                <button
                  onClick={() => handlePresetDate('LAST_30')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Last 30 Days
                </button>
                <button
                  onClick={() => handlePresetDate('LAST_90')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Last 90 Days
                </button>
                <button
                  onClick={() => handlePresetDate('YTD')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Year to Date
                </button>
              </div>

              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-slate-500">From</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => onUpdateFilters({ startDate: e.target.value })}
                    className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-10 text-[10px] text-slate-500">To</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => onUpdateFilters({ endDate: e.target.value })}
                    className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Filters Reset Button */}
        {activeFilterCount > 0 && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
            title="Clear all filters"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear Filters ({activeFilterCount})</span>
          </button>
        )}

        {/* Data Quality Monitor Trigger */}
        <button
          onClick={onOpenDataQuality}
          className={`relative p-1.5 rounded-md border transition-colors ${
            dataQualityIssuesCount > 0
              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title={`${dataQualityIssuesCount} data-quality notices detected`}
        >
          <AlertTriangle className="w-4 h-4" />
          {dataQualityIssuesCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[9px] font-mono font-bold text-white">
              {dataQualityIssuesCount}
            </span>
          )}
        </button>

        {/* Cloud Firestore Auth & Sync Button */}
        {firebaseEmail ? (
          <button
            onClick={onSyncToCloud}
            disabled={syncingCloud}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap"
            title={`Signed in as ${firebaseEmail}. Click to push current records to Cloud Firestore.`}
          >
            {syncingCloud ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
            <span>{syncingCloud ? 'Syncing...' : 'Cloud Synced'}</span>
          </button>
        ) : (
          <button
            onClick={onSignInGoogle}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            title="Sign in with Google to save & sync your data to Cloud Firestore"
          >
            <LogIn className="w-3.5 h-3.5 text-red-600" />
            <span>Sign In to Sync Cloud</span>
          </button>
        )}

        {/* User Role Switcher Dropdown (Allows testing RBAC) */}
        <div className="relative">
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
          >
            <div className="w-5 h-5 rounded bg-red-600 text-white flex items-center justify-center font-bold text-[10px]">
              {currentUser.displayName.charAt(0)}
            </div>
            <div className="hidden md:flex flex-col text-left leading-none">
              <span className="text-[11px] font-semibold text-slate-900 truncate max-w-[120px]">
                {currentUser.displayName.split(' ')[0]}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                {currentUser.role.replace('_', ' ')}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-1 w-68 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-xs">
              {/* Cloud Auth Status */}
              <div className="px-2 py-2 mb-2 bg-slate-50 rounded border border-slate-200">
                {firebaseEmail ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                      <Cloud className="w-3.5 h-3.5" />
                      <span className="truncate">{firebaseEmail}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          onSyncToCloud();
                          setUserDropdownOpen(false);
                        }}
                        className="flex-1 px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-800"
                      >
                        Push Local Data to Cloud
                      </button>
                      <button
                        onClick={() => {
                          onSignOutGoogle();
                          setUserDropdownOpen(false);
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded flex items-center gap-1"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onSignInGoogle();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded text-xs transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In with Google (Cloud DB)</span>
                  </button>
                )}
              </div>

              <div className="px-2 py-1 border-b border-slate-100 mb-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Switch Active Role (RBAC Simulation)
                </span>
              </div>
              <div className="space-y-0.5">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.uid}
                    onClick={() => {
                      onChangeUser(u);
                      setUserDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                      currentUser.uid === u.uid
                        ? 'bg-red-50 text-red-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-xs">{u.displayName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {u.role.replace('_', ' ')}
                      </div>
                    </div>
                    {currentUser.uid === u.uid && (
                      <span className="text-red-600 text-xs font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
