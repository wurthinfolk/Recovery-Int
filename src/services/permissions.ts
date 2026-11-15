/**
 * WÜRTH Recovery Intelligence — Centralized Role-Based Access Control Policy
 * Enforces exact permission matrix across both frontend routes/UI and backend API endpoints.
 */

import type { NavItemId, UserRole } from '../types/index.ts';

export const ALL_ROLES: UserRole[] = [
  'SYSTEM_ADMIN',
  'RECOVERY_OFFICER',
  'RECOVERY_SUPERVISOR',
  'MANAGEMENT_VIEWER',
  'DIVISION_HEAD',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  RECOVERY_OFFICER: 'Recovery Officer',
  RECOVERY_SUPERVISOR: 'Recovery Supervisor',
  MANAGEMENT_VIEWER: 'Management Viewer',
  DIVISION_HEAD: 'Division Head',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SYSTEM_ADMIN:
    'Unrestricted administrative control: User Management, System Settings, Master Imports, Org Hierarchy changes, Audit Administration, and full operations.',
  RECOVERY_OFFICER:
    'Full operational access to add/edit cheque records, manage recovery actions, view authorized dashboards, and export operational reports.',
  RECOVERY_SUPERVISOR:
    'Recovery operations supervision: manage/assign recovery actions & priorities, monitor overdue cases, add/edit cheques, and export operational reports.',
  MANAGEMENT_VIEWER:
    'Strict read-only executive access across all reporting dashboards, analytics, organization views, and management exports.',
  DIVISION_HEAD:
    'Strict read-only organizational scope: restricted to assigned Division, Teams, ADMs, Customers, and anonymized cross-team comparative benchmarks.',
};

export const ALL_NAV_TABS: NavItemId[] = [
  'executive-dashboard',
  'recovery-actions',
  'cheque-register',
  'add-cheque',
  'customer-intelligence',
  'adm-performance',
  'team-dashboard',
  'division-head-dashboard',
  'organization-management',
  'reason-analysis',
  'trends-anomalies',
  'reports-exports',
  'data-import',
  'audit-log',
  'user-management',
  'settings',
];

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (ALL_ROLES as string[]).includes(role);
}

export function getDefaultTabForRole(role: UserRole): NavItemId {
  switch (role) {
    case 'SYSTEM_ADMIN':
      return 'executive-dashboard';
    case 'MANAGEMENT_VIEWER':
      return 'executive-dashboard';
    case 'RECOVERY_OFFICER':
      return 'recovery-actions';
    case 'RECOVERY_SUPERVISOR':
      return 'recovery-actions';
    case 'DIVISION_HEAD':
      return 'division-head-dashboard';
    default:
      return 'executive-dashboard';
  }
}

export const TAB_ALLOWED_ROLES: Record<NavItemId, UserRole[]> = {
  'executive-dashboard': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
  ],
  'cheque-register': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'add-cheque': ['SYSTEM_ADMIN', 'RECOVERY_OFFICER', 'RECOVERY_SUPERVISOR'],
  'customer-intelligence': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'adm-performance': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'team-dashboard': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'division-head-dashboard': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'organization-management': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'reason-analysis': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'recovery-actions': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
  ],
  'trends-anomalies': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'reports-exports': [
    'SYSTEM_ADMIN',
    'RECOVERY_OFFICER',
    'RECOVERY_SUPERVISOR',
    'MANAGEMENT_VIEWER',
    'DIVISION_HEAD',
  ],
  'data-import': ['SYSTEM_ADMIN', 'RECOVERY_OFFICER', 'RECOVERY_SUPERVISOR'],
  'audit-log': ['SYSTEM_ADMIN'],
  'user-management': ['SYSTEM_ADMIN'],
  settings: ['SYSTEM_ADMIN'],
};

export function canAccessTab(role: UserRole, tab: NavItemId): boolean {
  const allowed = TAB_ALLOWED_ROLES[tab];
  return Array.isArray(allowed) ? allowed.includes(role) : false;
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canManageSettings(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canViewAuditAdmin(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canManageOrg(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canImportOrgMaster(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canImportCheques(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'RECOVERY_SUPERVISOR' || role === 'RECOVERY_OFFICER';
}

export function canEditCheques(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'RECOVERY_SUPERVISOR' || role === 'RECOVERY_OFFICER';
}

export function canManageRecovery(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'RECOVERY_SUPERVISOR' || role === 'RECOVERY_OFFICER';
}

export function canAssignRecovery(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'RECOVERY_SUPERVISOR' || role === 'RECOVERY_OFFICER';
}

export function canDeleteProtectedData(role: UserRole): boolean {
  return role === 'SYSTEM_ADMIN';
}

export function canExportReports(role: UserRole): boolean {
  return ALL_ROLES.includes(role);
}

export function isReadOnlyRole(role: UserRole): boolean {
  return role === 'MANAGEMENT_VIEWER' || role === 'DIVISION_HEAD';
}
