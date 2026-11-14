import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  Users,
  Briefcase,
  PieChart,
  ShieldAlert,
  TrendingUp,
  FileDown,
  UploadCloud,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Layers,
  Building2,
} from 'lucide-react';
import { WurthLogo } from './WurthLogo';
import { UserProfile, UserRole } from '../types';

export type NavItemId =
  | 'executive-dashboard'
  | 'cheque-register'
  | 'add-cheque'
  | 'customer-intelligence'
  | 'adm-performance'
  | 'team-dashboard'
  | 'division-head-dashboard'
  | 'organization-management'
  | 'reason-analysis'
  | 'recovery-actions'
  | 'trends-anomalies'
  | 'reports-exports'
  | 'data-import'
  | 'audit-log'
  | 'settings';

interface SidebarProps {
  currentTab: NavItemId;
  onSelectTab: (tab: NavItemId) => void;
  currentUser: UserProfile;
  collapsed: boolean;
  onToggleCollapse: () => void;
  unresolvedCount?: number;
  overdueCount?: number;
}

interface NavItemDef {
  id: NavItemId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  collapsed,
  onToggleCollapse,
  unresolvedCount = 0,
  overdueCount = 0,
}) => {
  const allRoles: UserRole[] = [
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'SYSTEM_ADMIN',
  ];

  const navItems: NavItemDef[] = [
    {
      id: 'executive-dashboard',
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
      allowedRoles: allRoles,
    },
    {
      id: 'cheque-register',
      label: 'Cheque Return Register',
      icon: FileSpreadsheet,
      allowedRoles: allRoles,
    },
    {
      id: 'add-cheque',
      label: 'Add Returned Cheque',
      icon: PlusCircle,
      allowedRoles: ['RECOVERY_OFFICER', 'RECOVERY_SUPERVISOR', 'SYSTEM_ADMIN'],
    },
    {
      id: 'customer-intelligence',
      label: 'Customer Intelligence',
      icon: Users,
      allowedRoles: allRoles,
    },
    {
      id: 'adm-performance',
      label: 'ADM Performance',
      icon: Briefcase,
      allowedRoles: allRoles,
    },
    {
      id: 'team-dashboard',
      label: 'Team Dashboard',
      icon: Layers,
      allowedRoles: allRoles,
    },
    {
      id: 'division-head-dashboard',
      label: 'Division Head Dashboard',
      icon: Building2,
      allowedRoles: allRoles,
    },
    {
      id: 'organization-management',
      label: 'Organization Master',
      icon: GitBranch,
      allowedRoles: allRoles,
    },
    {
      id: 'reason-analysis',
      label: 'Return Reason Analysis',
      icon: PieChart,
      allowedRoles: allRoles,
    },
    {
      id: 'recovery-actions',
      label: 'Recovery Action Centre',
      icon: ShieldAlert,
      allowedRoles: allRoles,
      badge: overdueCount > 0 ? overdueCount : undefined,
    },
    {
      id: 'trends-anomalies',
      label: 'Trends & Anomalies',
      icon: TrendingUp,
      allowedRoles: allRoles,
    },
    {
      id: 'reports-exports',
      label: 'Reports & Exports',
      icon: FileDown,
      allowedRoles: allRoles,
    },
    {
      id: 'data-import',
      label: 'Data Import',
      icon: UploadCloud,
      allowedRoles: ['RECOVERY_SUPERVISOR', 'SYSTEM_ADMIN'],
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      icon: History,
      allowedRoles: ['RECOVERY_SUPERVISOR', 'SYSTEM_ADMIN'],
    },
    {
      id: 'settings',
      label: 'Settings & Access Control',
      icon: Settings,
      allowedRoles: ['SYSTEM_ADMIN'],
    },
  ];

  const visibleItems = navItems.filter((item) => item.allowedRoles.includes(currentUser.role));

  return (
    <aside
      className={`relative flex flex-col bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-200 z-30 select-none ${
        collapsed ? 'w-16' : 'w-64'
      } shrink-0 min-h-screen`}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center h-16 border-b border-slate-800/80 ${
          collapsed ? 'justify-center gap-0.5 px-1.5' : 'justify-between px-4'
        }`}
      >
        {!collapsed ? (
          <WurthLogo white size="md" />
        ) : (
          <WurthLogo white compact size="sm" />
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors text-left group ${
                isActive
                  ? 'bg-red-600 text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />
              {!collapsed && (
                <span className="truncate flex-1 whitespace-nowrap">{item.label}</span>
              )}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Information Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-red-400 border border-slate-700 shrink-0">
              {currentUser.displayName.charAt(0)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate">
                {currentUser.displayName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-tight truncate">
                {currentUser.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="w-8 h-8 mx-auto rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-red-400"
            title={`${currentUser.displayName} (${currentUser.role})`}
          >
            {currentUser.displayName.charAt(0)}
          </div>
        )}
      </div>
    </aside>
  );
};
