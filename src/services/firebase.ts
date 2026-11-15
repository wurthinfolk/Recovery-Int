/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Server-Backed Data Access & Legacy Local Storage Migration Bridge
 * Note: Google Login and hardcoded demo users have been permanently removed.
 */

import type {
  AdmMasterRecord,
  AnalyticalConfig,
  AuditLog,
  ChequeRecord,
  CustomerMasterRecord,
  DivisionHeadMaster,
  EmployeeStatus,
  ImportBatch,
  RecoveryAction,
  TeamMaster,
  UserProfile,
} from '../types';
import {
  apiBootstrapData,
  apiClearSampleRecords,
  apiGetAuditLogs,
  apiGetChequeCaseDetails,
  apiGetImportBatches,
  apiLogRecoveryAction,
  apiMigrateLocalBrowserData,
  apiPurgeDatabase,
  apiRecordAuditEvent,
  apiResetDataset,
  apiSaveAdmBatch,
  apiSaveBatchCheques,
  apiSaveChequeRecord,
  apiSaveCustomerBatch,
  apiSyncOrgMaster,
  apiUpdateConfig,
} from './api';
import { canManageOrg, canManageSettings } from './permissions';

// Legacy browser cache keys (used ONLY for one-time Admin migration of pre-upgrade browser data)
const CACHE_CHEQUES_KEY = 'wurth_cheques_v1';
const CACHE_ACTIONS_KEY = 'wurth_actions_v1';
const CACHE_BATCHES_KEY = 'wurth_batches_v1';
const CACHE_DIVISION_HEADS_KEY = 'wurth_division_heads_v1';
const CACHE_TEAMS_KEY = 'wurth_teams_v1';
const CACHE_ADMS_KEY = 'wurth_adms_v1';
const CACHE_CUSTOMERS_KEY = 'wurth_customers_v1';
const CACHE_MIGRATED_FLAG = 'wurth_server_migrated_v1';

const IDB_NAME = 'wurth_recovery_store_v1';
const IDB_STORE = 'kv_lists';

function openPersistentDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetList<T>(key: string): Promise<T[] | null> {
  const idb = await openPersistentDb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? (req.result as T[]) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readLocalStorageSync<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

async function readLegacyList<T>(key: string): Promise<T[]> {
  const fromIdb = await idbGetList<T>(key);
  if (fromIdb && fromIdb.length > 0) return fromIdb;
  const fromLs = readLocalStorageSync<T>(key);
  return fromLs || [];
}

/**
 * If a System Administrator previously uploaded production data into local browser
 * storage before server-side persistence was enabled, migrate it once cleanly.
 */
export async function migrateLegacyLocalDataIfNeeded(currentUser: UserProfile): Promise<number> {
  if (!canManageSettings(currentUser.role)) return 0;
  try {
    if (localStorage.getItem(CACHE_MIGRATED_FLAG) === 'true') return 0;
    const [cheques, divisionHeads, teams, adms, customers, actions, batches] = await Promise.all([
      readLegacyList<ChequeRecord>(CACHE_CHEQUES_KEY),
      readLegacyList<DivisionHeadMaster>(CACHE_DIVISION_HEADS_KEY),
      readLegacyList<TeamMaster>(CACHE_TEAMS_KEY),
      readLegacyList<AdmMasterRecord>(CACHE_ADMS_KEY),
      readLegacyList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY),
      readLegacyList<RecoveryAction>(CACHE_ACTIONS_KEY),
      readLegacyList<ImportBatch>(CACHE_BATCHES_KEY),
    ]);

    const realCheques = cheques.filter((c) => !c.isSample);
    const hasLegacyData =
      realCheques.length > 0 ||
      divisionHeads.length > 0 ||
      teams.length > 0 ||
      adms.length > 0 ||
      customers.length > 0;

    if (!hasLegacyData) {
      localStorage.setItem(CACHE_MIGRATED_FLAG, 'true');
      return 0;
    }

    const migratedCount = await apiMigrateLocalBrowserData({
      cheques: realCheques,
      divisionHeads,
      teams,
      adms,
      customers,
      actions,
      batches,
    });
    localStorage.setItem(CACHE_MIGRATED_FLAG, 'true');
    return migratedCount;
  } catch {
    return 0;
  }
}

// ============================================================
// Audit & History Endpoints
// ============================================================

export async function recordAuditLog(
  log: Omit<AuditLog, 'id' | 'timestamp'>
): Promise<void> {
  await apiRecordAuditEvent({
    recordId: log.recordId,
    recordType: log.recordType,
    operation: log.operation,
    details: log.details,
  });
}

export async function getAuditLogs(username?: string): Promise<AuditLog[]> {
  return apiGetAuditLogs(username);
}

export async function getChequeCaseHistory(
  chequeId: string
): Promise<{ actions: RecoveryAction[]; auditTrail: AuditLog[] }> {
  return apiGetChequeCaseDetails(chequeId);
}

// ============================================================
// Cheque & Recovery Endpoints (Server-Enforced Scope & RBAC)
// ============================================================

export async function getChequeRecords(): Promise<ChequeRecord[]> {
  const payload = await apiBootstrapData();
  return payload.chequeRecords;
}

export async function saveChequeRecord(
  record: ChequeRecord,
  _currentUser: UserProfile,
  isEdit = false
): Promise<void> {
  await apiSaveChequeRecord(record, isEdit);
}

export async function saveBatchChequeRecords(
  records: ChequeRecord[],
  batch: ImportBatch,
  _currentUser: UserProfile
): Promise<void> {
  await apiSaveBatchCheques(records, batch);
}

export async function addRecoveryAction(
  action: Omit<RecoveryAction, 'id' | 'createdAt'>,
  updatedCheque: ChequeRecord,
  _currentUser: UserProfile
): Promise<RecoveryAction> {
  const res = await apiLogRecoveryAction(action, updatedCheque);
  return res.action;
}

export async function getRecoveryActions(chequeId?: string): Promise<RecoveryAction[]> {
  if (chequeId) {
    const res = await apiGetChequeCaseDetails(chequeId);
    return res.actions;
  }
  const payload = await apiBootstrapData();
  return payload.recoveryActions;
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  return apiGetImportBatches();
}

export async function getAnalyticalConfig(): Promise<AnalyticalConfig> {
  const payload = await apiBootstrapData();
  return payload.config;
}

export async function saveAnalyticalConfig(
  config: AnalyticalConfig,
  _currentUser: UserProfile
): Promise<void> {
  await apiUpdateConfig(config);
}

export async function resetDataset(
  loadSample = false,
  _currentUser: UserProfile
): Promise<ChequeRecord[]> {
  return apiResetDataset(loadSample);
}

export async function clearSampleRecordsOnly(_currentUser: UserProfile): Promise<ChequeRecord[]> {
  return apiClearSampleRecords();
}

export interface ClearDatabaseOptions {
  clearCheques: boolean;
  clearActions: boolean;
  clearBatches: boolean;
  clearAuditLogs: boolean;
  clearOrgMaster?: boolean;
}

export interface ClearDatabaseResult {
  deletedCheques: number;
  deletedActions: number;
  deletedBatches: number;
  deletedAuditLogs: number;
  deletedOrgMaster?: number;
}

export async function clearEntireDatabase(
  currentUser: UserProfile,
  options: ClearDatabaseOptions
): Promise<ClearDatabaseResult> {
  if (!canManageSettings(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can purge the database.');
  }
  return apiPurgeDatabase(options);
}

// ============================================================
// Organization Master Persistence (Server-Backed)
// ============================================================

export async function getDivisionHeadMasterRecords(): Promise<DivisionHeadMaster[]> {
  const payload = await apiBootstrapData();
  return payload.divisionHeads;
}

export async function getTeamMasterRecords(): Promise<TeamMaster[]> {
  const payload = await apiBootstrapData();
  return payload.teams;
}

export async function getAdmMasterRecords(): Promise<AdmMasterRecord[]> {
  const payload = await apiBootstrapData();
  return payload.adms;
}

export async function getCustomerMasterRecords(): Promise<CustomerMasterRecord[]> {
  const payload = await apiBootstrapData();
  return payload.customers;
}

export async function saveAdmMasterBatch(
  admsToUpsert: AdmMasterRecord[],
  teamsToUpsert: TeamMaster[],
  divisionHeadsToUpsert: DivisionHeadMaster[],
  batch: ImportBatch,
  _currentUser: UserProfile
): Promise<void> {
  await apiSaveAdmBatch(admsToUpsert, teamsToUpsert, divisionHeadsToUpsert, batch);
}

export async function saveCustomerMasterBatch(
  customersToUpsert: CustomerMasterRecord[],
  batch: ImportBatch,
  _currentUser: UserProfile
): Promise<void> {
  await apiSaveCustomerBatch(customersToUpsert, batch);
}

function normOrgDisplay(val: string): string {
  return String(val || '').trim().replace(/\s+/g, ' ');
}

function normOrgKey(val: string): string {
  return normOrgDisplay(val).toLowerCase();
}

export async function mapCustomerToAdmMaster(
  customer: CustomerMasterRecord,
  adm: AdmMasterRecord,
  currentUser: UserProfile
): Promise<CustomerMasterRecord> {
  if (!canManageOrg(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can modify customer-to-ADM mappings.');
  }
  const now = new Date().toISOString();
  const updated: CustomerMasterRecord = {
    ...customer,
    admNumber: adm.admNumber,
    admReference: adm.id,
    salesRepName: adm.salesRepName,
    teamId: adm.teamId,
    teamName: adm.teamName,
    division: adm.division,
    divisionHeadId: adm.divisionHeadId,
    divisionHead: adm.divisionHeadName,
    customerStatus: adm.employeeStatus === 'ACTIVE' ? 'ACTIVE' : 'NEEDS_REVIEW',
    requiresAdmMapping: false,
    nameMismatchWarning: undefined,
    assignmentEffectiveDate: now.slice(0, 10),
    assignmentHistory: [
      ...(customer.assignmentHistory || []),
      {
        changedAt: now,
        changedBy: currentUser.displayName,
        previousAdmNumber: customer.admNumber,
        newAdmNumber: adm.admNumber,
        reason: 'Manual ADM mapping resolution in Organization Management',
      },
    ],
    updatedAt: now,
    updatedBy: currentUser.displayName,
  };

  const state = await apiBootstrapData();
  const customers = state.customers.map((c) => (c.id === updated.id ? updated : c));
  if (!customers.some((c) => c.id === updated.id)) {
    customers.unshift(updated);
  }

  await apiSyncOrgMaster({
    customers,
    recordId: updated.id,
    recordType: 'CUSTOMER_MASTER',
    operation: 'ASSIGNMENT',
    auditDetail: `Mapped Customer ${updated.customerId} (${updated.customerName}) to ADM# ${adm.admNumber} (${adm.salesRepName}, Team: ${adm.teamName}, Division: ${adm.division}).`,
  });

  return updated;
}

export interface SaveDivisionHeadInput {
  id?: string;
  name: string;
  divisions: string[];
  verificationStatus?: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
}

export async function saveDivisionHeadMaster(
  input: SaveDivisionHeadInput,
  currentUser: UserProfile
): Promise<DivisionHeadMaster> {
  if (!canManageOrg(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can modify Division Heads.');
  }

  const name = normOrgDisplay(input.name);
  if (!name) throw new Error('Division Head Name is required.');

  const cleanedDivisions = Array.from(
    new Map(
      (input.divisions || [])
        .map((d) => normOrgDisplay(d))
        .filter(Boolean)
        .map((d) => [normOrgKey(d), d])
    ).values()
  );
  if (cleanedDivisions.length === 0) {
    throw new Error('At least one Division is required.');
  }

  const state = await apiBootstrapData();
  const existingHeads = [...state.divisionHeads];
  const existing = input.id ? existingHeads.find((h) => h.id === input.id) : undefined;
  const canonicalName = normOrgKey(name);
  const matchingByName = existingHeads.find(
    (other) => other.id !== existing?.id && normOrgKey(other.name) === canonicalName
  );

  // If creating or renaming to match an existing Division Head, merge divisions into one unified record
  const targetRecord = existing || matchingByName;
  const mergedDivisions = Array.from(
    new Map(
      [...(matchingByName?.divisions || []), ...cleanedDivisions]
        .map((d) => normOrgDisplay(d))
        .filter(Boolean)
        .map((d) => [normOrgKey(d), d])
    ).values()
  );

  const verificationStatus = input.verificationStatus || 'VERIFIED';
  const verificationReason =
    verificationStatus === 'NEEDS_VERIFICATION'
      ? normOrgDisplay(input.verificationReason || '') || undefined
      : undefined;

  const now = new Date().toISOString();
  const slugName =
    canonicalName
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'unknown';
  const saved: DivisionHeadMaster = {
    id: targetRecord?.id || `DH_${slugName}`,
    name,
    canonicalName,
    divisions: existing && !matchingByName ? cleanedDivisions : mergedDivisions,
    verificationStatus,
    verificationReason,
    createdAt: targetRecord?.createdAt || now,
    updatedAt: now,
  };

  const mergedAwayId = existing && matchingByName ? matchingByName.id : undefined;
  const nextHeads = existingHeads
    .filter((h) => h.id !== mergedAwayId)
    .map((h) => (h.id === saved.id ? saved : h));
  if (!nextHeads.some((h) => h.id === saved.id)) {
    nextHeads.unshift(saved);
  }

  const matchesAffectedHead = (headId?: string) =>
    Boolean(headId && (headId === saved.id || (mergedAwayId && headId === mergedAwayId)));

  const nextTeams = state.teams.map((t) =>
    matchesAffectedHead(t.divisionHeadId) &&
    (t.divisionHeadId !== saved.id || t.divisionHeadName !== saved.name)
      ? { ...t, divisionHeadId: saved.id, divisionHeadName: saved.name, updatedAt: now }
      : t
  );
  const nextAdms = state.adms.map((a) =>
    matchesAffectedHead(a.divisionHeadId) &&
    (a.divisionHeadId !== saved.id || a.divisionHeadName !== saved.name)
      ? {
          ...a,
          divisionHeadId: saved.id,
          divisionHeadName: saved.name,
          updatedAt: now,
          updatedBy: currentUser.displayName,
        }
      : a
  );
  const nextCustomers = state.customers.map((c) =>
    matchesAffectedHead(c.divisionHeadId) &&
    (c.divisionHeadId !== saved.id || c.divisionHead !== saved.name)
      ? {
          ...c,
          divisionHeadId: saved.id,
          divisionHead: saved.name,
          updatedAt: now,
          updatedBy: currentUser.displayName,
        }
      : c
  );

  await apiSyncOrgMaster({
    divisionHeads: nextHeads,
    teams: nextTeams,
    adms: nextAdms,
    customers: nextCustomers,
    recordId: saved.id,
    recordType: 'DIVISION_HEAD_MASTER',
    operation: targetRecord ? 'UPDATE' : 'CREATE',
    auditDetail: `${targetRecord ? 'Updated' : 'Created'} Division Head "${saved.name}" (Divisions: ${saved.divisions.join(', ')}).`,
  });

  return saved;
}

export interface SaveTeamInput {
  id?: string;
  teamName: string;
  division: string;
  divisionHeadId: string;
}

export async function saveTeamMaster(
  input: SaveTeamInput,
  currentUser: UserProfile
): Promise<TeamMaster> {
  if (!canManageOrg(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can modify Teams.');
  }

  const teamName = normOrgDisplay(input.teamName);
  const division = normOrgDisplay(input.division);
  if (!teamName) throw new Error('Team Name is required.');
  if (!division) throw new Error('Division Name is required.');
  if (!input.divisionHeadId) throw new Error('Division Head selection is required.');

  const state = await apiBootstrapData();
  const heads = [...state.divisionHeads];
  const head = heads.find((h) => h.id === input.divisionHeadId);
  if (!head) throw new Error('Selected Division Head record was not found.');

  const canonicalKey = `${normOrgKey(division)}::${normOrgKey(teamName)}`;
  const existingTeams = [...state.teams];
  const existing = input.id ? existingTeams.find((t) => t.id === input.id) : undefined;

  const collision = existingTeams.find(
    (t) =>
      t.id !== existing?.id &&
      (t.canonicalKey || `${normOrgKey(t.division)}::${normOrgKey(t.teamName)}`) === canonicalKey
  );
  if (collision) {
    throw new Error(`Team "${teamName}" already exists inside Division "${division}".`);
  }

  const now = new Date().toISOString();
  const saved: TeamMaster = {
    id: existing?.id || `TEAM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    teamName,
    canonicalKey,
    division,
    divisionHeadId: head.id,
    divisionHeadName: head.name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const nextTeams = existing
    ? existingTeams.map((t) => (t.id === saved.id ? saved : t))
    : [saved, ...existingTeams];

  const nextHeads = !head.divisions.some((d) => normOrgKey(d) === normOrgKey(division))
    ? heads.map((h) =>
        h.id === head.id ? { ...h, divisions: [...h.divisions, division], updatedAt: now } : h
      )
    : heads;

  const affectedAdmNumbers = new Set<string>();
  const nextAdms = state.adms.map((a) => {
    if (
      a.teamId === saved.id &&
      (a.teamName !== saved.teamName ||
        a.division !== saved.division ||
        a.divisionHeadId !== saved.divisionHeadId ||
        a.divisionHeadName !== saved.divisionHeadName)
    ) {
      affectedAdmNumbers.add(normOrgKey(a.admNumber));
      return {
        ...a,
        teamName: saved.teamName,
        division: saved.division,
        divisionHeadId: saved.divisionHeadId,
        divisionHeadName: saved.divisionHeadName,
        assignmentHistory: [
          ...(a.assignmentHistory || []),
          {
            changedAt: now,
            changedBy: currentUser.displayName,
            previousTeamId: a.teamId,
            previousTeamName: a.teamName,
            previousDivision: a.division,
            previousDivisionHeadName: a.divisionHeadName,
            newTeamId: saved.id,
            newTeamName: saved.teamName,
            newDivision: saved.division,
            newDivisionHeadName: saved.divisionHeadName,
          },
        ],
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
    }
    return a;
  });

  const nextCustomers = state.customers.map((c) => {
    if (
      c.teamId === saved.id ||
      (!c.requiresAdmMapping && affectedAdmNumbers.has(normOrgKey(c.admNumber)))
    ) {
      return {
        ...c,
        teamId: saved.id,
        teamName: saved.teamName,
        division: saved.division,
        divisionHeadId: saved.divisionHeadId,
        divisionHead: saved.divisionHeadName,
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
    }
    return c;
  });

  await apiSyncOrgMaster({
    divisionHeads: nextHeads,
    teams: nextTeams,
    adms: nextAdms,
    customers: nextCustomers,
    recordId: saved.id,
    recordType: 'TEAM_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    auditDetail: `${existing ? 'Updated' : 'Created'} Team "${saved.teamName}" under Division "${saved.division}" (Division Head: ${saved.divisionHeadName}).`,
  });

  return saved;
}

export interface SaveAdmInput {
  id?: string;
  empId: string;
  admNumber: string;
  salesRepName: string;
  teamId: string;
  employeeStatus: EmployeeStatus;
  mobileNo: string;
  email: string;
  verificationStatus?: 'VERIFIED' | 'NEEDS_VERIFICATION';
  verificationReason?: string;
}

export async function saveAdmMaster(
  input: SaveAdmInput,
  currentUser: UserProfile
): Promise<AdmMasterRecord> {
  if (!canManageOrg(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can modify ADM records.');
  }

  const empId = normOrgDisplay(input.empId);
  const admNumber = normOrgDisplay(input.admNumber);
  const salesRepName = normOrgDisplay(input.salesRepName);
  const mobileNo = normOrgDisplay(input.mobileNo);
  const email = normOrgDisplay(input.email);

  if (!empId) throw new Error('Emp ID is required.');
  if (!admNumber) throw new Error('ADM# is required.');
  if (!salesRepName) throw new Error('Sales Rep. Name is required.');
  if (!input.teamId) throw new Error('Assigned Team is required.');

  const state = await apiBootstrapData();
  const team = state.teams.find((t) => t.id === input.teamId);
  if (!team) throw new Error('Selected Team record was not found.');

  const existingAdms = [...state.adms];
  const existing = input.id ? existingAdms.find((a) => a.id === input.id) : undefined;

  const admCollision = existingAdms.find(
    (a) => a.id !== existing?.id && normOrgKey(a.admNumber) === normOrgKey(admNumber)
  );
  if (admCollision) {
    throw new Error(
      `ADM# "${admNumber}" is already assigned to ${admCollision.salesRepName} (Emp ID: ${admCollision.empId}).`
    );
  }

  const empCollision = existingAdms.find(
    (a) => a.id !== existing?.id && normOrgKey(a.empId) === normOrgKey(empId)
  );
  if (empCollision) {
    throw new Error(
      `Emp ID "${empId}" is already assigned to ${empCollision.salesRepName} (ADM#: ${empCollision.admNumber}).`
    );
  }

  const now = new Date().toISOString();
  const assignmentHistory = [...(existing?.assignmentHistory || [])];
  if (
    existing &&
    (existing.teamId !== team.id ||
      normOrgKey(existing.division) !== normOrgKey(team.division) ||
      existing.divisionHeadId !== team.divisionHeadId)
  ) {
    assignmentHistory.push({
      changedAt: now,
      changedBy: currentUser.displayName,
      previousTeamId: existing.teamId,
      previousTeamName: existing.teamName,
      previousDivision: existing.division,
      previousDivisionHeadName: existing.divisionHeadName,
      newTeamId: team.id,
      newTeamName: team.teamName,
      newDivision: team.division,
      newDivisionHeadName: team.divisionHeadName,
    });
  }

  const saved: AdmMasterRecord = {
    id: existing?.id || `ADM-${admNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now().toString(36)}`,
    empId,
    admNumber,
    salesRepName,
    teamId: team.id,
    teamName: team.teamName,
    division: team.division,
    divisionHeadId: team.divisionHeadId,
    divisionHeadName: team.divisionHeadName,
    employeeStatus: input.employeeStatus,
    rawEmployeeStatus: input.employeeStatus === 'ACTIVE' ? 'Active' : 'Inactive',
    mobileNo,
    email,
    verificationStatus: input.verificationStatus || 'VERIFIED',
    verificationReason:
      (input.verificationStatus || 'VERIFIED') === 'NEEDS_VERIFICATION'
        ? input.verificationReason || 'Flagged for manual verification'
        : undefined,
    assignmentHistory: assignmentHistory.length > 0 ? assignmentHistory : undefined,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || currentUser.displayName,
    updatedAt: now,
    updatedBy: currentUser.displayName,
    batchId: existing?.batchId,
  };

  const nextAdms = existing
    ? existingAdms.map((a) => (a.id === saved.id ? saved : a))
    : [saved, ...existingAdms];

  const nextCustomers = state.customers.map((c) => {
    const matchesRef = c.admReference === saved.id;
    const matchesOldNum =
      existing && !c.requiresAdmMapping && normOrgKey(c.admNumber) === normOrgKey(existing.admNumber);
    const matchesNewNum =
      !c.requiresAdmMapping && normOrgKey(c.admNumber) === normOrgKey(saved.admNumber);
    if (matchesRef || matchesOldNum || matchesNewNum) {
      const nextStatus: CustomerMasterRecord['customerStatus'] =
        c.customerStatus === 'INACTIVE'
          ? 'INACTIVE'
          : saved.employeeStatus === 'ACTIVE'
            ? 'ACTIVE'
            : 'NEEDS_REVIEW';
      return {
        ...c,
        admNumber: saved.admNumber,
        admReference: saved.id,
        salesRepName: saved.salesRepName,
        teamId: saved.teamId,
        teamName: saved.teamName,
        division: saved.division,
        divisionHeadId: saved.divisionHeadId,
        divisionHead: saved.divisionHeadName,
        customerStatus: nextStatus,
        requiresAdmMapping: false,
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
    }
    return c;
  });

  await apiSyncOrgMaster({
    adms: nextAdms,
    customers: nextCustomers,
    recordId: saved.id,
    recordType: 'ADM_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    auditDetail: `${existing ? 'Updated' : 'Created'} ADM# ${saved.admNumber} (${saved.salesRepName}, Emp ID: ${saved.empId}, Team: ${saved.teamName}, Division: ${saved.division}).`,
  });

  return saved;
}

export interface SaveCustomerInput {
  id?: string;
  customerId: string;
  customerName: string;
  admId?: string;
  customerPhone: string;
  customerStatus?: CustomerMasterRecord['customerStatus'];
  assignmentEffectiveDate?: string;
}

export async function saveCustomerMaster(
  input: SaveCustomerInput,
  currentUser: UserProfile
): Promise<CustomerMasterRecord> {
  if (!canManageOrg(currentUser.role)) {
    throw new Error('Unauthorized: Only System Administrators can modify Customer Master records.');
  }

  const customerId = normOrgDisplay(input.customerId);
  const customerName = normOrgDisplay(input.customerName);
  const customerPhone = normOrgDisplay(input.customerPhone);

  if (!customerId) throw new Error('Customer ID is required.');
  if (!customerName) throw new Error('Customer Name is required.');

  const state = await apiBootstrapData();
  const existingCustomers = [...state.customers];
  const existing = input.id ? existingCustomers.find((c) => c.id === input.id) : undefined;

  const idCollision = existingCustomers.find(
    (c) => c.id !== existing?.id && normOrgKey(c.customerId) === normOrgKey(customerId)
  );
  if (idCollision) {
    throw new Error(
      `Customer ID "${customerId}" is already registered to "${idCollision.customerName}".`
    );
  }

  const selectedAdm = input.admId ? state.adms.find((a) => a.id === input.admId) : undefined;
  if (!selectedAdm && !existing?.requiresAdmMapping) {
    throw new Error('Authoritative ADM# selection is required.');
  }

  const now = new Date().toISOString();
  const effectiveDate =
    input.assignmentEffectiveDate || existing?.assignmentEffectiveDate || now.slice(0, 10);
  const assignmentHistory = [...(existing?.assignmentHistory || [])];

  if (selectedAdm && existing && normOrgKey(existing.admNumber) !== normOrgKey(selectedAdm.admNumber)) {
    assignmentHistory.push({
      changedAt: now,
      changedBy: currentUser.displayName,
      previousAdmNumber: existing.admNumber,
      newAdmNumber: selectedAdm.admNumber,
      reason: 'Manual ADM reassignment in Organization Management',
    });
  } else if (selectedAdm && !existing) {
    assignmentHistory.push({
      changedAt: now,
      changedBy: currentUser.displayName,
      newAdmNumber: selectedAdm.admNumber,
      reason: 'Initial manual Customer Master creation',
    });
  }

  const derivedStatus: CustomerMasterRecord['customerStatus'] = selectedAdm
    ? input.customerStatus || (selectedAdm.employeeStatus === 'ACTIVE' ? 'ACTIVE' : 'NEEDS_REVIEW')
    : input.customerStatus || existing?.customerStatus || 'UNMAPPED_ADM';

  const saved: CustomerMasterRecord = {
    id: existing?.id || `CUST-${customerId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now().toString(36)}`,
    customerId,
    customerName,
    admNumber: selectedAdm ? selectedAdm.admNumber : existing?.admNumber || 'UNMAPPED',
    admReference: selectedAdm ? selectedAdm.id : existing?.admReference || 'UNMAPPED',
    salesRepName: selectedAdm ? selectedAdm.salesRepName : existing?.salesRepName || '',
    uploadedSalesRepName: selectedAdm
      ? selectedAdm.salesRepName
      : existing?.uploadedSalesRepName || '',
    customerPhone,
    teamId: selectedAdm ? selectedAdm.teamId : existing?.teamId || '',
    teamName: selectedAdm ? selectedAdm.teamName : existing?.teamName || '',
    division: selectedAdm ? selectedAdm.division : existing?.division || '',
    divisionHeadId: selectedAdm ? selectedAdm.divisionHeadId : existing?.divisionHeadId || '',
    divisionHead: selectedAdm ? selectedAdm.divisionHeadName : existing?.divisionHead || '',
    customerStatus: derivedStatus,
    assignmentEffectiveDate: effectiveDate,
    nameMismatchWarning: selectedAdm ? undefined : existing?.nameMismatchWarning,
    requiresAdmMapping: selectedAdm ? false : Boolean(existing?.requiresAdmMapping),
    assignmentHistory: assignmentHistory.length > 0 ? assignmentHistory : undefined,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || currentUser.displayName,
    updatedAt: now,
    updatedBy: currentUser.displayName,
    batchId: existing?.batchId,
  };

  const nextCustomers = existing
    ? existingCustomers.map((c) => (c.id === saved.id ? saved : c))
    : [saved, ...existingCustomers];

  await apiSyncOrgMaster({
    customers: nextCustomers,
    recordId: saved.id,
    recordType: 'CUSTOMER_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    auditDetail: `${existing ? 'Updated' : 'Created'} Customer ${saved.customerId} (${saved.customerName}) -> ADM# ${saved.admNumber}.`,
  });

  return saved;
}
