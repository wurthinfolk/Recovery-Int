import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Search,
  Edit3,
  KeyRound,
  Power,
  History,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Trash2,
} from 'lucide-react';
import type {
  AuditLog,
  DivisionHeadMaster,
  TeamMaster,
  UserAccountStatus,
  UserProfile,
  UserRole,
} from '../types';
import {
  ALL_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from '../services/permissions';
import {
  apiCreateUser,
  apiDeleteUser,
  apiGetAuditLogs,
  apiListUsers,
  apiResetUserPassword,
  apiUpdateUser,
} from '../services/api';

interface UserManagementProps {
  currentUser: UserProfile;
  divisionHeads: DivisionHeadMaster[];
  teams: TeamMaster[];
}

export const UserManagement: React.FC<UserManagementProps> = ({
  currentUser,
  divisionHeads,
  teams,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create/Edit Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showTempPw, setShowTempPw] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('Recovery & Credit Control');
  const [role, setRole] = useState<UserRole>('RECOVERY_OFFICER');
  const [assignedDivision, setAssignedDivision] = useState('');
  const [assignedTeamId, setAssignedTeamId] = useState('');
  const [divisionHeadId, setDivisionHeadId] = useState('');
  const [status, setStatus] = useState<UserAccountStatus>('ACTIVE');

  // Password Reset Modal State
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);
  const [resetShowPw, setResetShowPw] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Activity Drawer State
  const [activityTarget, setActivityTarget] = useState<UserProfile | null>(null);
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Delete User Modal State
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await apiListUsers();
      setUsers(list);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load user directory.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const availableDivisions = useMemo(() => {
    const set = new Set<string>();
    for (const h of divisionHeads) {
      for (const d of h.divisions || []) {
        if (d) set.add(d);
      }
    }
    for (const t of teams) {
      if (t.division) set.add(t.division);
    }
    return Array.from(set).sort();
  }, [divisionHeads, teams]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employeeId || '').toLowerCase().includes(q) ||
        (u.assignedDivision || '').toLowerCase().includes(q) ||
        (u.divisionHeadName || '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((u) => u.status === 'ACTIVE').length,
      admins: users.filter((u) => u.role === 'SYSTEM_ADMIN' && u.status === 'ACTIVE').length,
      divisionHeads: users.filter((u) => u.role === 'DIVISION_HEAD' && u.status === 'ACTIVE').length,
      pendingReset: users.filter((u) => u.mustChangePassword).length,
    };
  }, [users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setDisplayName('');
    setUsername('');
    setTemporaryPassword('');
    setEmail('');
    setMobileNo('');
    setEmployeeId('');
    setDepartment('Recovery & Credit Control');
    setRole('RECOVERY_OFFICER');
    setAssignedDivision('');
    setAssignedTeamId('');
    setDivisionHeadId('');
    setStatus('ACTIVE');
    setFormError(null);
    setShowTempPw(false);
    setFormOpen(true);
  };

  const openEditModal = (u: UserProfile) => {
    setEditingUser(u);
    setDisplayName(u.displayName);
    setUsername(u.username);
    setTemporaryPassword('');
    setEmail(u.email);
    setMobileNo(u.mobileNo || '');
    setEmployeeId(u.employeeId || '');
    setDepartment(u.department || '');
    setRole(u.role);
    setAssignedDivision(u.assignedDivision || '');
    setAssignedTeamId(u.assignedTeamId || '');
    setDivisionHeadId(u.divisionHeadId || '');
    setStatus(u.status);
    setFormError(null);
    setFormOpen(true);
  };

  const handleSelectDivisionHeadMaster = (headId: string) => {
    setDivisionHeadId(headId);
    const found = divisionHeads.find((h) => h.id === headId);
    if (found) {
      if (found.divisions.length > 0) {
        setAssignedDivision(found.divisions.join(', '));
      }
      if (!displayName) {
        setDisplayName(found.name);
      }
    }
  };

  const handleSelectTeam = (teamId: string) => {
    setAssignedTeamId(teamId);
    const found = teams.find((t) => t.id === teamId);
    if (found) {
      setAssignedDivision(found.division);
      if (!divisionHeadId && found.divisionHeadId) {
        setDivisionHeadId(found.divisionHeadId);
      }
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const matchedHead = divisionHeads.find((h) => h.id === divisionHeadId);
    const matchedTeam = teams.find((t) => t.id === assignedTeamId);

    try {
      if (editingUser) {
        const updated = await apiUpdateUser(editingUser.uid, {
          displayName: displayName.trim(),
          email: email.trim(),
          mobileNo: mobileNo.trim(),
          employeeId: employeeId.trim(),
          department: department.trim(),
          role,
          assignedDivision: assignedDivision.trim(),
          assignedTeamId: assignedTeamId.trim(),
          assignedTeamName: matchedTeam?.teamName || editingUser.assignedTeamName || '',
          divisionHeadId: divisionHeadId.trim(),
          divisionHeadName: matchedHead?.name || editingUser.divisionHeadName || '',
          status,
        });
        setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
        setBanner({
          type: 'success',
          message: `Updated user "${updated.username}" (${ROLE_LABELS[updated.role]}).`,
        });
      } else {
        const created = await apiCreateUser({
          displayName: displayName.trim(),
          username: username.trim(),
          temporaryPassword,
          email: email.trim(),
          mobileNo: mobileNo.trim(),
          employeeId: employeeId.trim(),
          department: department.trim(),
          role,
          assignedDivision: assignedDivision.trim(),
          assignedTeamId: assignedTeamId.trim(),
          assignedTeamName: matchedTeam?.teamName || '',
          divisionHeadId: divisionHeadId.trim(),
          divisionHeadName: matchedHead?.name || '',
          status,
        });
        setUsers((prev) => [...prev, created].sort((a, b) => a.username.localeCompare(b.username)));
        setBanner({
          type: 'success',
          message: `Created account "${created.username}" with temporary password (password change forced on first sign-in).`,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save user account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (target: UserProfile) => {
    const nextStatus: UserAccountStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBanner(null);
    try {
      const updated = await apiUpdateUser(target.uid, { status: nextStatus });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
      setBanner({
        type: 'success',
        message: `Account "${updated.username}" marked ${updated.status}.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update account status.',
      });
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    setResetError(null);
    try {
      const updated = await apiResetUserPassword(resetTarget.uid, resetTempPassword, resetForceChange);
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
      setResetTarget(null);
      setResetTempPassword('');
      setBanner({
        type: 'success',
        message: `Password reset for "${updated.username}". ${
          resetForceChange ? 'User will be required to set a new password at next sign-in.' : ''
        }`,
      });
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleOpenActivity = async (target: UserProfile) => {
    setActivityTarget(target);
    setActivityLoading(true);
    try {
      const logs = await apiGetAuditLogs(target.username);
      setActivityLogs(logs);
    } catch {
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const getDeleteRestriction = (target: UserProfile): string | null => {
    if (target.uid === currentUser.uid) {
      return 'You cannot delete your own active account.';
    }
    if (target.role === 'SYSTEM_ADMIN' && target.status === 'ACTIVE' && stats.admins <= 1) {
      return 'Cannot delete the last active System Administrator.';
    }
    return null;
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiDeleteUser(deleteTarget.uid);
      setUsers((prev) => prev.filter((u) => u.uid !== deleteTarget.uid));
      setBanner({
        type: 'success',
        message: `Permanently deleted user account "${deleteTarget.username}" (${deleteTarget.displayName}).`,
      });
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete user account.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Create CTA */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-md shrink-0">
            <Shield className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              User Management &amp; Organizational Scope Administration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provision user accounts, assign 5-role RBAC permissions, bind Division Heads to their exact Divisions, and manage password resets.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#CC0000] hover:bg-[#B00000] text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create User Account</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-[11px] font-semibold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Total Accounts" value={stats.total} />
        <StatTile label="Active Users" value={stats.active} tone="emerald" />
        <StatTile label="System Admins" value={stats.admins} />
        <StatTile label="Division Heads" value={stats.divisionHeads} />
        <StatTile label="Forced Reset Pending" value={stats.pendingReset} tone="amber" />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by full name, username, email, employee ID, or division..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          <span className="text-slate-500 font-mono tabular-nums ml-1">
            {filteredUsers.length} users
          </span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3">User / Identity</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Assigned Scope</th>
                <th className="py-2.5 px-2.5 text-center">Status</th>
                <th className="py-2.5 px-3">Last Login</th>
                <th className="py-2.5 px-3">Created</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Loading user directory...
                  </td>
                </tr>
              )}
              {!loading &&
                filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{u.displayName}</span>
                        {u.uid === currentUser.uid && (
                          <span className="text-[10px] font-mono text-slate-500">(You)</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-600">{u.username}</div>
                      <div className="text-[10px] text-slate-400">
                        {u.email}
                        {u.employeeId ? ` · Emp ${u.employeeId}` : ''}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{ROLE_LABELS[u.role]}</span>
                      <div className="text-[10px] text-slate-400">{u.department || '—'}</div>
                    </td>

                    <td className="py-2.5 px-3 text-[11px] text-slate-700">
                      {u.role === 'DIVISION_HEAD' ? (
                        <div>
                          <div className="font-semibold text-slate-900">
                            {(() => {
                              const linkedHead = divisionHeads.find((h) => h.id === u.divisionHeadId);
                              const divList =
                                linkedHead && linkedHead.divisions.length > 0
                                  ? linkedHead.divisions
                                  : (u.assignedDivision || '')
                                      .split(',')
                                      .map((d) => d.trim())
                                      .filter(Boolean);
                              return divList.length > 0 ? divList.join(', ') : 'Division Unspecified';
                            })()}
                          </div>
                          {(u.divisionHeadName || u.assignedTeamName) && (
                            <div className="text-[10px] text-slate-500">
                              {[u.divisionHeadName, u.assignedTeamName].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      ) : u.assignedDivision || u.assignedTeamName ? (
                        <div>
                          <span>{u.assignedDivision || '—'}</span>
                          {u.assignedTeamName && (
                            <span className="block text-[10px] text-slate-500">
                              {u.assignedTeamName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Enterprise-Wide</span>
                      )}
                    </td>

                    <td className="py-2.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        {u.status}
                      </span>
                      {u.mustChangePassword && (
                        <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                          Reset Required
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          title="Edit user details, role, and scope"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setResetTempPassword('');
                            setResetForceChange(true);
                            setResetError(null);
                            setResetShowPw(false);
                          }}
                          title="Reset Password"
                          className="p-1.5 text-slate-600 hover:text-[#CC0000] hover:bg-red-50 rounded transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          title={u.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                          className={`p-1.5 rounded transition-colors ${
                            u.status === 'ACTIVE'
                              ? 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenActivity(u)}
                          title="View User Activity Log"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        {(() => {
                          const restriction = getDeleteRestriction(u);
                          return (
                            <button
                              type="button"
                              disabled={Boolean(restriction)}
                              onClick={() => {
                                setDeleteTarget(u);
                                setDeleteError(null);
                              }}
                              title={restriction || 'Delete User Account'}
                              className={`p-1.5 rounded transition-colors ${
                                restriction
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-600 hover:text-[#CC0000] hover:bg-red-50'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No user accounts match the current search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingUser ? `Edit User: ${editingUser.username}` : 'Create New User Account'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {editingUser
                    ? 'Modify role, organizational scope, contact profile, or account status.'
                    : 'Accounts created with a temporary password require password replacement at first sign-in.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Nimal Perera"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingUser)}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. n.perera"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@wurth.lk"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mobile Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={mobileNo}
                    onChange={(e) => setMobileNo(e.target.value)}
                    placeholder="+94 7X XXX XXXX"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Employee ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="e.g. EMP-1024"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Credit Control"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Status *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as UserAccountStatus)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">{ROLE_LABELS[role]}:</span>{' '}
                {ROLE_DESCRIPTIONS[role]}
              </div>

              {!editingUser && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Temporary Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showTempPw ? 'text' : 'password'}
                      required
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      placeholder="Min 8 chars, upper & lower case + digit/symbol"
                      className="w-full px-3 py-1.5 pr-9 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTempPw(!showTempPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showTempPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Organizational Scope Controls */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="font-semibold text-slate-800">
                  Organizational Scope {role === 'DIVISION_HEAD' ? '(Required for Division Head Isolation)' : '(Optional)'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Division Head Master
                    </label>
                    <select
                      value={divisionHeadId}
                      onChange={(e) => handleSelectDivisionHeadMaster(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">-- Optional --</option>
                      {divisionHeads.map((dh) => (
                        <option key={dh.id} value={dh.id}>
                          {dh.name} ({dh.divisions.join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Assigned Division
                    </label>
                    <input
                      list="wurth-divisions-list"
                      value={assignedDivision}
                      onChange={(e) => setAssignedDivision(e.target.value)}
                      placeholder="Select or type division"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                    />
                    <datalist id="wurth-divisions-list">
                      {availableDivisions.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Assigned Team
                    </label>
                    <select
                      value={assignedTeamId}
                      onChange={(e) => handleSelectTeam(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">-- All Teams in Division --</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.teamName} ({t.division})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#CC0000] hover:bg-[#B00000] disabled:bg-red-300 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingUser ? 'Save Changes' : 'Create User Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Reset User Password</h3>
                <p className="text-[11px] font-mono text-slate-500">
                  {resetTarget.displayName} ({resetTarget.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="p-5 space-y-4 text-xs">
              {resetError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800">
                  {resetError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Temporary Password *
                </label>
                <div className="relative">
                  <input
                    type={resetShowPw ? 'text' : 'password'}
                    required
                    value={resetTempPassword}
                    onChange={(e) => setResetTempPassword(e.target.value)}
                    placeholder="Min 8 chars, upper & lower case + digit/symbol"
                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
                  />
                  <button
                    type="button"
                    onClick={() => setResetShowPw(!resetShowPw)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {resetShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={resetForceChange}
                  onChange={(e) => setResetForceChange(e.target.checked)}
                  className="rounded text-[#CC0000] focus:ring-[#CC0000]"
                />
                <span>Force password change at next login (recommended)</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-3.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetBusy}
                  className="px-4 py-1.5 bg-[#CC0000] hover:bg-[#B00000] text-white font-semibold rounded-md"
                >
                  {resetBusy ? 'Resetting...' : 'Confirm Password Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Activity Drawer */}
      {activityTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Security &amp; Activity Log: {activityTarget.displayName}
                </h3>
                <p className="text-[11px] font-mono text-slate-500">{activityTarget.username}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivityTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-xs">
              {activityLoading ? (
                <div className="py-10 text-center text-slate-400">Loading activity history...</div>
              ) : activityLogs.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  No recorded activity entries for this user yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                      <div>
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 mr-2">
                          {log.operation}
                        </span>
                        <span className="text-slate-800">{log.details}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete User Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#CC0000]" />
                <h3 className="text-sm font-bold text-slate-900">Delete User Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {deleteError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-slate-700 leading-relaxed">
                Are you sure you want to permanently delete this user account? The user will immediately lose all system access, and this action will be recorded in the security audit log.
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                <div className="font-semibold text-slate-900">{deleteTarget.displayName}</div>
                <div className="font-mono text-[11px] text-slate-600">
                  @{deleteTarget.username} · {deleteTarget.email}
                </div>
                <div className="text-[11px] text-slate-500">
                  Role: <span className="font-semibold text-slate-700">{ROLE_LABELS[deleteTarget.role]}</span> · Status:{' '}
                  <span className="font-semibold text-slate-700">{deleteTarget.status}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteBusy}
                  className="px-3.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteUser}
                  disabled={deleteBusy}
                  className="px-4 py-1.5 bg-[#CC0000] hover:bg-[#B00000] disabled:bg-red-300 text-white font-semibold rounded-md inline-flex items-center gap-1.5"
                >
                  {deleteBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{deleteBusy ? 'Deleting...' : 'Delete Permanently'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: number; tone?: 'neutral' | 'emerald' | 'amber' }> = ({
  label,
  value,
  tone = 'neutral',
}) => {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/40 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/40 text-amber-800'
        : 'border-slate-200 bg-white text-slate-900';
  return (
    <div className={`p-3.5 rounded-lg border ${toneCls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-xl font-bold font-mono tabular-nums mt-1">{value}</div>
    </div>
  );
};
