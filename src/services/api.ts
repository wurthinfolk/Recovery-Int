/**
 * WÜRTH Recovery Intelligence — Trusted Backend API Client
 * All auth sessions, user management, org scoping, and audit operations route through /api/*.
 */

import type {
  ActionType,
  AdmMasterRecord,
  AnalyticalConfig,
  AuditLog,
  AuditOperation,
  AuditRecordType,
  ChequeRecord,
  CrossTeamBenchmarkSummary,
  CustomerMasterRecord,
  DivisionHeadMaster,
  ImportBatch,
  RecoveryAction,
  RecoveryStatus,
  TeamMaster,
  UserAccountStatus,
  UserProfile,
  UserRole,
} from '../types';

const SESSION_TOKEN_KEY = 'wurth_session_token_v1';

function getStoredSessionToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const val = sessionStorage.getItem(SESSION_TOKEN_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

function setStoredSessionToken(token: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (token && token.trim()) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token.trim());
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (response.status === 401) {
    setStoredSessionToken(null);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // non-json response
  }

  if (!response.ok) {
    const message =
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return payload as unknown as T;
}

// ============================================================
// Authentication & Password Flows
// ============================================================

export interface AuthSessionResponse {
  authenticated: boolean;
  bootstrapInitialized: boolean;
  user?: UserProfile;
}

export async function apiGetBootstrapStatus(): Promise<boolean> {
  const response = await fetch('/api/auth/bootstrap-status', {
    credentials: 'include',
  });
  if (!response.ok) return true;
  try {
    const data = (await response.json()) as { initialized?: boolean };
    return Boolean(data.initialized);
  } catch {
    return true;
  }
}

export async function apiGetAuthMe(): Promise<AuthSessionResponse> {
  const token = getStoredSessionToken();
  const response = await fetch('/api/auth/me', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (response.status === 401) {
    setStoredSessionToken(null);
  }
  let data: Partial<AuthSessionResponse> = {};
  try {
    data = (await response.json()) as Partial<AuthSessionResponse>;
  } catch {
    // ignore
  }
  return {
    authenticated: response.ok && Boolean(data.authenticated && data.user),
    bootstrapInitialized: Boolean(data.bootstrapInitialized),
    user: data.user,
  };
}

export async function apiBootstrapAdmin(input: {
  password: string;
  confirmPassword: string;
  displayName?: string;
  email?: string;
}): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile; sessionToken?: string }>(
    '/api/auth/bootstrap-admin',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  if (data.sessionToken) {
    setStoredSessionToken(data.sessionToken);
  }
  return data.user;
}

export async function apiLogin(username: string, password: string): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile; sessionToken?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data.sessionToken) {
    setStoredSessionToken(data.sessionToken);
  }
  return data.user;
}

export async function apiLogout(): Promise<void> {
  try {
    await requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  } finally {
    setStoredSessionToken(null);
  }
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile; sessionToken?: string }>(
    '/api/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  );
  if (data.sessionToken) {
    setStoredSessionToken(data.sessionToken);
  }
  return data.user;
}

// ============================================================
// Admin User Management API
// ============================================================

export interface CreateUserInput {
  displayName: string;
  username: string;
  temporaryPassword: string;
  email: string;
  mobileNo?: string;
  employeeId?: string;
  department?: string;
  role: UserRole;
  assignedDivision?: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
  divisionHeadId?: string;
  divisionHeadName?: string;
  status: UserAccountStatus;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
  mobileNo?: string;
  employeeId?: string;
  department?: string;
  role?: UserRole;
  assignedDivision?: string;
  assignedTeamId?: string;
  assignedTeamName?: string;
  divisionHeadId?: string;
  divisionHeadName?: string;
  status?: UserAccountStatus;
  mustChangePassword?: boolean;
}

export async function apiListUsers(): Promise<UserProfile[]> {
  const data = await requestJson<{ users: UserProfile[] }>('/api/admin/users');
  return data.users;
}

export async function apiCreateUser(input: CreateUserInput): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function apiUpdateUser(uid: string, input: UpdateUserInput): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile }>(`/api/admin/users/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function apiResetUserPassword(
  uid: string,
  temporaryPassword: string,
  forcePasswordChange = true
): Promise<UserProfile> {
  const data = await requestJson<{ user: UserProfile }>(
    `/api/admin/users/${encodeURIComponent(uid)}/reset-password`,
    {
      method: 'POST',
      body: JSON.stringify({ temporaryPassword, forcePasswordChange }),
    }
  );
  return data.user;
}

export async function apiDeleteUser(uid: string): Promise<void> {
  await requestJson<{ ok: boolean; deletedUid: string }>(
    `/api/admin/users/${encodeURIComponent(uid)}`,
    {
      method: 'DELETE',
    }
  );
}

// ============================================================
// Scoped Domain Data & Benchmarking API
// ============================================================

export interface BootstrapPayload {
  chequeRecords: ChequeRecord[];
  divisionHeads: DivisionHeadMaster[];
  teams: TeamMaster[];
  adms: AdmMasterRecord[];
  customers: CustomerMasterRecord[];
  recoveryActions: RecoveryAction[];
  importBatches: ImportBatch[];
  config: AnalyticalConfig;
  scopeSummary?: {
    restricted: boolean;
    role: UserRole;
    divisionHeadId?: string;
    divisionHeadName?: string;
    divisions?: string[];
    teamCount?: number;
  };
}

export async function apiBootstrapData(): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>('/api/data/bootstrap');
}

export async function apiGetCrossTeamBenchmarks(): Promise<CrossTeamBenchmarkSummary> {
  return requestJson<CrossTeamBenchmarkSummary>('/api/benchmarks/teams');
}

export async function apiGetChequeCaseDetails(
  chequeId: string
): Promise<{ actions: RecoveryAction[]; auditTrail: AuditLog[] }> {
  return requestJson<{ actions: RecoveryAction[]; auditTrail: AuditLog[] }>(
    `/api/data/cheques/${encodeURIComponent(chequeId)}/actions`
  );
}

export async function apiSaveChequeRecord(
  record: ChequeRecord,
  isEdit: boolean
): Promise<ChequeRecord[]> {
  const data = await requestJson<{ ok: boolean; chequeRecords: ChequeRecord[] }>('/api/data/cheques', {
    method: 'POST',
    body: JSON.stringify({ record, isEdit }),
  });
  return data.chequeRecords;
}

export async function apiSaveBatchCheques(
  records: ChequeRecord[],
  batch: ImportBatch
): Promise<ChequeRecord[]> {
  const data = await requestJson<{ ok: boolean; chequeRecords: ChequeRecord[] }>(
    '/api/data/cheques/batch',
    {
      method: 'POST',
      body: JSON.stringify({ records, batch }),
    }
  );
  return data.chequeRecords;
}

export async function apiLogRecoveryAction(
  action: Omit<RecoveryAction, 'id' | 'createdAt'>,
  updatedCheque: ChequeRecord
): Promise<{ action: RecoveryAction; chequeRecords: ChequeRecord[] }> {
  return requestJson<{ ok: boolean; action: RecoveryAction; chequeRecords: ChequeRecord[] }>(
    '/api/data/recovery-actions',
    {
      method: 'POST',
      body: JSON.stringify({ action, updatedCheque }),
    }
  );
}

export async function apiSaveAdmBatch(
  adms: AdmMasterRecord[],
  teams: TeamMaster[],
  divisionHeads: DivisionHeadMaster[],
  batch: ImportBatch
): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/data/org/adm-batch', {
    method: 'POST',
    body: JSON.stringify({ adms, teams, divisionHeads, batch }),
  });
}

export async function apiSaveCustomerBatch(
  customers: CustomerMasterRecord[],
  batch: ImportBatch
): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/data/org/customer-batch', {
    method: 'POST',
    body: JSON.stringify({ customers, batch }),
  });
}

export async function apiSyncOrgMaster(payload: {
  divisionHeads?: DivisionHeadMaster[];
  teams?: TeamMaster[];
  adms?: AdmMasterRecord[];
  customers?: CustomerMasterRecord[];
  recordId?: string;
  recordType?: AuditRecordType;
  operation?: AuditOperation;
  auditDetail?: string;
}): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/data/org/sync', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function apiMigrateLocalBrowserData(payload: {
  cheques: ChequeRecord[];
  divisionHeads: DivisionHeadMaster[];
  teams: TeamMaster[];
  adms: AdmMasterRecord[];
  customers: CustomerMasterRecord[];
  actions: RecoveryAction[];
  batches: ImportBatch[];
}): Promise<number> {
  const data = await requestJson<{ ok: boolean; migratedCount: number }>('/api/data/migrate-local', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.migratedCount;
}

export async function apiUpdateConfig(config: AnalyticalConfig): Promise<AnalyticalConfig> {
  const data = await requestJson<{ ok: boolean; config: AnalyticalConfig }>('/api/data/config', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  });
  return data.config;
}

export async function apiResetDataset(loadSample: boolean): Promise<ChequeRecord[]> {
  const data = await requestJson<{ ok: boolean; chequeRecords: ChequeRecord[] }>('/api/data/reset', {
    method: 'POST',
    body: JSON.stringify({ loadSample }),
  });
  return data.chequeRecords;
}

export async function apiClearSampleRecords(): Promise<ChequeRecord[]> {
  const data = await requestJson<{ ok: boolean; chequeRecords: ChequeRecord[] }>('/api/data/sample', {
    method: 'DELETE',
  });
  return data.chequeRecords;
}

export async function apiPurgeDatabase(options: {
  clearCheques: boolean;
  clearActions: boolean;
  clearBatches: boolean;
  clearAuditLogs: boolean;
  clearOrgMaster?: boolean;
}): Promise<{
  deletedCheques: number;
  deletedActions: number;
  deletedBatches: number;
  deletedAuditLogs: number;
  deletedOrgMaster?: number;
}> {
  return requestJson('/api/data/purge', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function apiGetAuditLogs(username?: string): Promise<AuditLog[]> {
  const qs = username ? `?username=${encodeURIComponent(username)}` : '';
  const data = await requestJson<{ logs: AuditLog[] }>(`/api/audit-logs${qs}`);
  return data.logs;
}

export async function apiRecordAuditEvent(entry: {
  recordId: string;
  recordType: AuditRecordType;
  operation: AuditOperation;
  details: string;
}): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/audit/log', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function apiGetImportBatches(): Promise<ImportBatch[]> {
  const data = await requestJson<{ batches: ImportBatch[] }>('/api/import-batches');
  return data.batches;
}
