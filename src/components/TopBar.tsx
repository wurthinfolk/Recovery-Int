import React, { useState } from 'react';
import {
  Calendar,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  LogOut,
  KeyRound,
  Shield,
} from 'lucide-react';
import type { FilterState, UserProfile } from '../types';
import { ROLE_LABELS, canImportCheques } from '../services/permissions';

interface TopBarProps {
  pageTitle: string;
  filters: FilterState;
  onUpdateFilters: (filters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  currentUser: UserProfile;
  dataQualityIssuesCount: number;
  onOpenDataQuality: () => void;
  isSampleDataLoaded: boolean;
  onClearSampleData?: () => void;
  onOpenChangePassword: () => void;
  onSignOut: () => Promise<void>;
}

export const TopBar: React.FC<TopBarProps> = ({
  pageTitle,
  filters,
  onUpdateFilters,
  onResetFilters,
  currentUser,
  dataQualityIssuesCount,
  onOpenDataQuality,
  isSampleDataLoaded,
  onClearSampleData,
  onOpenChangePassword,
  onSignOut,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

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

  const canClearSample = canImportCheques(currentUser.role);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-14 px-5 bg-white border-b border-slate-200 select-none">
      {/* Left Zone: Title & Scope Context */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">
          {pageTitle}
        </h1>

        {isSampleDataLoaded && (
          <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
            <span>Sample Register</span>
            {canClearSample && onClearSampleData && (
              <button
                type="button"
                onClick={onClearSampleData}
                className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-200/70 hover:bg-amber-300 text-amber-950 rounded transition-colors"
                title="Remove sample records from register"
              >
                Clear Sample
              </button>
            )}
          </div>
        )}

        {currentUser.role === 'DIVISION_HEAD' && currentUser.assignedDivision && (
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono truncate max-w-[240px]">
            Division Scope: {currentUser.assignedDivision}
          </span>
        )}

        {(filters.division || filters.teamId || filters.divisionHeadId) && (
          <span className="hidden lg:inline-flex items-center text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono truncate max-w-[240px]">
            Filter: {filters.division || (filters.teamId ? 'Team' : 'Division Head')}
          </span>
        )}
      </div>

      {/* Right Zone: Date Basis, Date Range, Data Quality, Authenticated Account Menu */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Date Basis Segmented Control */}
        <div className="hidden lg:flex items-center p-0.5 bg-slate-100 rounded-md text-[11px] font-medium border border-slate-200">
          <button
            type="button"
            onClick={() => onUpdateFilters({ dateBasis: 'datePosted' })}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              filters.dateBasis === 'datePosted'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Date-Posted
          </button>
          <button
            type="button"
            onClick={() => onUpdateFilters({ dateBasis: 'effectiveDate' })}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              filters.dateBasis === 'effectiveDate'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Effective-Date
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-mono text-[11px] tabular-nums">
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
                  type="button"
                  onClick={() => handlePresetDate('ALL')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  All Available History
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('THIS_MONTH')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Current Month
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('LAST_30')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetDate('LAST_90')}
                  className="px-2 py-1 text-left text-slate-700 hover:bg-slate-100 rounded text-[11px]"
                >
                  Last 90 Days
                </button>
                <button
                  type="button"
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

        {/* Active Filters Reset */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset ({activeFilterCount})</span>
          </button>
        )}

        {/* Data Quality Monitor */}
        <button
          type="button"
          onClick={onOpenDataQuality}
          className={`relative p-1.5 rounded-md border transition-colors ${
            dataQualityIssuesCount > 0
              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title={`${dataQualityIssuesCount} data-quality notices`}
        >
          <AlertTriangle className="w-4 h-4" />
          {dataQualityIssuesCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[9px] font-mono font-bold text-white tabular-nums">
              {dataQualityIssuesCount}
            </span>
          )}
        </button>

        {/* Authenticated User Account Menu (Zero role-switcher, Zero Google sign-in) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
          >
            <div className="w-6 h-6 rounded bg-[#CC0000] text-white flex items-center justify-center font-bold text-[11px]">
              {currentUser.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-[11px] font-semibold text-slate-900 truncate max-w-[140px]">
                {currentUser.displayName}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {ROLE_LABELS[currentUser.role]}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-xs">
              <div className="px-2.5 py-2 mb-1.5 bg-slate-50 rounded border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-900 truncate">{currentUser.displayName}</div>
                <div className="text-[11px] font-mono text-slate-600">@{currentUser.username}</div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Shield className="w-3 h-3 text-[#CC0000]" />
                  <span>{ROLE_LABELS[currentUser.role]}</span>
                </div>
                {currentUser.role === 'DIVISION_HEAD' && currentUser.assignedDivision && (
                  <div className="text-[10px] text-slate-600 pt-0.5 border-t border-slate-200">
                    Scope: <strong>{currentUser.assignedDivision}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setUserDropdownOpen(false);
                  onOpenChangePassword();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-slate-700 hover:bg-slate-100 rounded text-left font-medium transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Change Password</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setUserDropdownOpen(false);
                  await onSignOut();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-[#CC0000] hover:bg-red-50 rounded text-left font-semibold transition-colors mt-0.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
