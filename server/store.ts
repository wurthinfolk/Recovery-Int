/**
 * WÜRTH Recovery Intelligence — Server-Side Auth, RBAC, Scoped Data & Audit Store
 * Note: Compatible with Node v22 native TypeScript strip-types (no enums, type-only imports).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  AdmMasterRecord,
  AnalyticalConfig,
  AuditLog,
  AuditOperation,
  AuditRecordType,
  ChequeRecord,
  CrossTeamBenchmarkRow,
  CrossTeamBenchmarkSummary,
  CustomerMasterRecord,
  DivisionHeadMaster,
  ImportBatch,
  RecoveryAction,
  TeamMaster,
  UserAccountStatus,
  UserProfile,
  UserRole,
} from '../src/types/index.ts';
import {
  ALL_ROLES,
  isValidRole,
} from '../src/services/permissions.ts';
import { SAMPLE_CHEQUE_RECORDS } from '../src/data/sampleRecords.ts';

export interface StoredUserRecord extends UserProfile {
  usernameLower: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface ServerStoreState {
  meta: {
    version: number;
    bootstrapCompleted: boolean;
    bootstrapCompletedAt?: string;
    sampleDismissed: boolean;
    updatedAt: string;
  };
  users: StoredUserRecord[];
  chequeRecords: ChequeRecord[];
  recoveryActions: RecoveryAction[];
  importBatches: ImportBatch[];
  divisionHeads: DivisionHeadMaster[];
  teams: TeamMaster[];
  adms: AdmMasterRecord[];
  customers: CustomerMasterRecord[];
  config: AnalyticalConfig;
  auditLogs: AuditLog[];
}

export const DEFAULT_SERVER_CONFIG: AnalyticalConfig = {
  repeatReturnThreshold: 2,
  highValueThreshold: 250000,
  overdueDaysThreshold: 7,
  currency: 'LKR',
};

const DATA_DIR = process.env.WURTH_DATA_DIR
  ? path.resolve(process.env.WURTH_DATA_DIR)
  : path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'wurth-store.json');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');

const MAX_AUDIT_LOGS = 5000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Precomputed dummy salt & hash for constant-time rejection when username is unknown
const DUMMY_SALT = 'wurth_lk_constant_time_salt_v1';
const DUMMY_HASH = crypto.scryptSync('wurth_constant_time_dummy_pw', DUMMY_SALT, 64).toString('hex');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function getSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = getSessionSecret();

function createEmptyState(): ServerStoreState {
  return {
    meta: {
      version: 1,
      bootstrapCompleted: false,
      sampleDismissed: false,
      updatedAt: new Date().toISOString(),
    },
    users: [],
    chequeRecords: [],
    recoveryActions: [],
    importBatches: [],
    divisionHeads: [],
    teams: [],
    adms: [],
    customers: [],
    config: { ...DEFAULT_SERVER_CONFIG },
    auditLogs: [],
  };
}

let cachedState: ServerStoreState | null = null;

function parseStoreFile(filePath: string): ServerStoreState | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ServerStoreState>;
    const base = createEmptyState();
    return {
      meta: { ...base.meta, ...(parsed.meta || {}) },
      users: Array.isArray(parsed.users) ? parsed.users : [],
      chequeRecords: Array.isArray(parsed.chequeRecords) ? parsed.chequeRecords : [],
      recoveryActions: Array.isArray(parsed.recoveryActions) ? parsed.recoveryActions : [],
      importBatches: Array.isArray(parsed.importBatches) ? parsed.importBatches : [],
      divisionHeads: Array.isArray(parsed.divisionHeads) ? parsed.divisionHeads : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      adms: Array.isArray(parsed.adms) ? parsed.adms : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      config: { ...DEFAULT_SERVER_CONFIG, ...(parsed.config || {}) },
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch (err) {
    console.error(`Failed to parse store file ${filePath}:`, err);
    return null;
  }
}

function isUninitializedStore(state: ServerStoreState): boolean {
  return (
    !state.meta.bootstrapCompleted &&
    state.users.length === 0 &&
    state.chequeRecords.length === 0 &&
    state.customers.length === 0 &&
    state.adms.length === 0 &&
    state.teams.length === 0 &&
    state.divisionHeads.length === 0
  );
}

function loadPopulatedFallbackStore(): ServerStoreState | null {
  const candidates = [
    path.resolve(process.cwd(), '.data', 'wurth-store.json'),
    path.resolve(process.cwd(), 'September@2026', 'wurth-store.json'),
  ];
  for (const candidate of candidates) {
    if (path.resolve(candidate) === path.resolve(STORE_FILE)) continue;
    const candidateState = parseStoreFile(candidate);
    if (candidateState && !isUninitializedStore(candidateState)) {
      return candidateState;
    }
  }
  return null;
}

export function loadStore(): ServerStoreState {
  if (cachedState) return cachedState;
  ensureDataDir();

  const primary = parseStoreFile(STORE_FILE);
  if (primary && !isUninitializedStore(primary)) {
    const consolidated = consolidateDivisionHeadsInState(primary);
    cachedState = primary;
    if (consolidated) {
      saveStore(cachedState);
    }
    return cachedState;
  }

  const fallback = loadPopulatedFallbackStore();
  if (fallback) {
    consolidateDivisionHeadsInState(fallback);
    cachedState = fallback;
    saveStore(cachedState);
    return cachedState;
  }

  cachedState = primary || createEmptyState();
  saveStore(cachedState);
  return cachedState;
}

export function saveStore(state: ServerStoreState): void {
  ensureDataDir();
  state.meta.updatedAt = new Date().toISOString();
  const tmpFile = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmpFile, STORE_FILE);
  cachedState = state;
}

export function resetInMemoryStoreCache(): void {
  cachedState = null;
}

export function sanitizeUser(user: StoredUserRecord): UserProfile {
  return {
    uid: user.uid,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    department: user.department,
    mobileNo: user.mobileNo,
    employeeId: user.employeeId,
    assignedDivision: user.assignedDivision,
    assignedTeamId: user.assignedTeamId,
    assignedTeamName: user.assignedTeamName,
    divisionHeadId: user.divisionHeadId,
    divisionHeadName: user.divisionHeadName,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    createdBy: user.createdBy,
    updatedAt: user.updatedAt,
  };
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function verifyDummyPasswordTimingSafe(password: string): void {
  verifyPassword(password, DUMMY_HASH, DUMMY_SALT);
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must not exceed 128 characters.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Password must include both uppercase and lowercase letters.';
  }
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must include at least one number or special character.';
  }
  return null;
}

export function appendServerAuditLog(
  state: ServerStoreState,
  entry: {
    recordId: string;
    recordType: AuditRecordType;
    operation: AuditOperation;
    actor: string;
    actorUsername?: string;
    actorEmail: string;
    actorRole?: UserRole | 'ANONYMOUS';
    details: string;
    beforeValue?: string;
    afterValue?: string;
  }
): AuditLog {
  const log: AuditLog = {
    id: `AUDIT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    recordId: entry.recordId,
    recordType: entry.recordType,
    operation: entry.operation,
    actor: entry.actor,
    actorUsername: entry.actorUsername,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    details: entry.details,
    beforeValue: entry.beforeValue,
    afterValue: entry.afterValue,
    timestamp: new Date().toISOString(),
  };
  state.auditLogs.unshift(log);
  if (state.auditLogs.length > MAX_AUDIT_LOGS) {
    state.auditLogs = state.auditLogs.slice(0, MAX_AUDIT_LOGS);
  }
  return log;
}

/**
 * One-time secure server-side bootstrap of initial `it.admin` account.
 * Reads `INITIAL_ADMIN_PASSWORD` exclusively from environment configuration.
 * Never logs or exposes the password; locks bootstrap after first initialization.
 */
export function runInitialAdminBootstrap(): { initialized: boolean; createdNow: boolean } {
  const state = loadStore();
  const hasAnyAdmin = state.users.some(
    (u) => u.usernameLower === 'it.admin' || u.role === 'SYSTEM_ADMIN'
  );

  if (state.meta.bootstrapCompleted || hasAnyAdmin) {
    if (!state.meta.bootstrapCompleted && hasAnyAdmin) {
      state.meta.bootstrapCompleted = true;
      state.meta.bootstrapCompletedAt = new Date().toISOString();
      saveStore(state);
    }
    return { initialized: true, createdNow: false };
  }

  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!initialPassword || !initialPassword.trim()) {
    return { initialized: false, createdNow: false };
  }

  const { hash, salt } = hashPassword(initialPassword);
  const now = new Date().toISOString();
  const adminUser: StoredUserRecord = {
    uid: `usr-${crypto.randomUUID()}`,
    username: 'it.admin',
    usernameLower: 'it.admin',
    passwordHash: hash,
    passwordSalt: salt,
    displayName: 'IT System Administrator',
    email: 'it.admin@wurth.lk',
    role: 'SYSTEM_ADMIN',
    department: 'IT & Systems Governance',
    status: 'ACTIVE',
    mustChangePassword: true,
    createdAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    updatedAt: now,
  };

  state.users.push(adminUser);
  state.meta.bootstrapCompleted = true;
  state.meta.bootstrapCompletedAt = now;

  appendServerAuditLog(state, {
    recordId: adminUser.uid,
    recordType: 'USER_ACCOUNT',
    operation: 'USER_CREATE',
    actor: 'SYSTEM_BOOTSTRAP',
    actorUsername: 'system',
    actorEmail: 'system@wurth.lk',
    actorRole: 'SYSTEM_ADMIN',
    details: 'One-time server bootstrap created initial System Administrator account (it.admin) with forced password change.',
    afterValue: JSON.stringify({ username: 'it.admin', role: 'SYSTEM_ADMIN', mustChangePassword: true }),
  });

  saveStore(state);
  return { initialized: true, createdNow: true };
}

/**
 * Strictly one-time interactive initial System Administrator creation.
 * Only permitted when zero users exist and bootstrap has not yet completed.
 * Permanently locks itself after creating the single initial `it.admin` account.
 */
export function createOneTimeInitialAdmin(input: {
  password: string;
  displayName?: string;
  email?: string;
}): StoredUserRecord {
  const state = loadStore();
  const hasAnyAdmin = state.users.some(
    (u) => u.usernameLower === 'it.admin' || u.role === 'SYSTEM_ADMIN'
  );

  if (state.meta.bootstrapCompleted || hasAnyAdmin || state.users.length > 0) {
    if (!state.meta.bootstrapCompleted && (hasAnyAdmin || state.users.length > 0)) {
      state.meta.bootstrapCompleted = true;
      state.meta.bootstrapCompletedAt = new Date().toISOString();
      saveStore(state);
    }
    throw new Error('BOOTSTRAP_LOCKED');
  }

  const strengthErr = validatePasswordStrength(input.password);
  if (strengthErr) {
    throw new Error(strengthErr);
  }

  const cleanName = (input.displayName || '').trim() || 'IT System Administrator';
  const cleanEmail = (input.email || '').trim().toLowerCase() || 'it.admin@wurth.lk';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid corporate email address.');
  }

  const { hash, salt } = hashPassword(input.password);
  const now = new Date().toISOString();
  const adminUser: StoredUserRecord = {
    uid: `usr-${crypto.randomUUID()}`,
    username: 'it.admin',
    usernameLower: 'it.admin',
    passwordHash: hash,
    passwordSalt: salt,
    displayName: cleanName,
    email: cleanEmail,
    role: 'SYSTEM_ADMIN',
    department: 'IT & Systems Governance',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: now,
    createdAt: now,
    createdBy: 'ONE_TIME_SETUP',
    updatedAt: now,
  };

  state.users.push(adminUser);
  state.meta.bootstrapCompleted = true;
  state.meta.bootstrapCompletedAt = now;

  appendServerAuditLog(state, {
    recordId: adminUser.uid,
    recordType: 'USER_ACCOUNT',
    operation: 'USER_CREATE',
    actor: adminUser.displayName,
    actorUsername: adminUser.username,
    actorEmail: adminUser.email,
    actorRole: 'SYSTEM_ADMIN',
    details:
      'One-time initial System Administrator (it.admin) initialized by project owner and bootstrap permanently locked.',
    afterValue: JSON.stringify({
      username: 'it.admin',
      role: 'SYSTEM_ADMIN',
      bootstrapLocked: true,
    }),
  });

  saveStore(state);
  return adminUser;
}

export interface SessionPayload {
  uid: string;
  username: string;
  iat: number;
  exp: number;
}

export function signSessionToken(user: StoredUserRecord): string {
  const now = Date.now();
  const payload: SessionPayload = {
    uid: user.uid,
    username: user.usernameLower,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// ============================================================
// Login Sliding Window Rate Limiter
// ============================================================

const loginAttempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 15;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (loginAttempts.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  loginAttempts.set(key, timestamps);
  return timestamps.length >= RATE_LIMIT_MAX_FAILURES;
}

export function recordFailedLoginAttempt(key: string): void {
  const now = Date.now();
  const timestamps = (loginAttempts.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  loginAttempts.set(key, timestamps);
}

export function clearFailedLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

// ============================================================
// Active Admin Guard & User Management Helpers
// ============================================================

export function countActiveSystemAdmins(users: StoredUserRecord[]): number {
  return users.filter((u) => u.role === 'SYSTEM_ADMIN' && u.status === 'ACTIVE').length;
}

export function normalizeUsername(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function validateUsernameFormat(username: string): string | null {
  const clean = username.trim();
  if (clean.length < 3 || clean.length > 48) {
    return 'Username must be between 3 and 48 characters.';
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) {
    return 'Username may only contain letters, numbers, dots (.), underscores (_), or hyphens (-).';
  }
  return null;
}

export function validateUserRole(role: unknown): role is UserRole {
  return isValidRole(role) && ALL_ROLES.includes(role);
}

// ============================================================
// Division Head Scope Enforcement & Cross-Team Benchmarking
// ============================================================

function normOrgKey(val?: string | null): string {
  return (val || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normOrgDisplay(val?: string | null): string {
  return (val || '').trim().replace(/\s+/g, ' ');
}

function slugifyOrg(val: string): string {
  return (
    normOrgKey(val)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'unknown'
  );
}

function dedupeDivisions(divisions: string[]): string[] {
  const map = new Map<string, string>();
  for (const raw of divisions) {
    const clean = normOrgDisplay(raw);
    if (!clean) continue;
    const key = normOrgKey(clean);
    if (!map.has(key)) {
      map.set(key, clean);
    }
  }
  return Array.from(map.values());
}

/**
 * Losslessly consolidates duplicate DivisionHeadMaster records that share the same
 * canonical person name across multiple Divisions into a single DivisionHeadMaster
 * with a combined `divisions` list, and remaps all Teams, ADMs, Customers, and Users.
 * Returns true if any records were updated.
 */
export function consolidateDivisionHeadsInState(state: ServerStoreState): boolean {
  if (!Array.isArray(state.divisionHeads) || state.divisionHeads.length === 0) {
    return false;
  }

  let changed = false;
  const groups = new Map<string, DivisionHeadMaster[]>();

  for (const dh of state.divisionHeads) {
    const cleanName = normOrgDisplay(dh.name || dh.canonicalName || 'Unknown Division Head');
    const cName = normOrgKey(cleanName);
    if (!groups.has(cName)) groups.set(cName, []);
    groups.get(cName)!.push(dh);
  }

  const oldIdToCanonical = new Map<string, { id: string; name: string }>();
  const consolidatedHeads: DivisionHeadMaster[] = [];

  for (const [cName, records] of groups.entries()) {
    if (records.length > 1) {
      changed = true;
    }

    const canonicalId = `DH_${slugifyOrg(cName)}`;
    const primaryRecord =
      records.find((r) => r.id === canonicalId) ||
      [...records].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))[0];
    const displayName = normOrgDisplay(primaryRecord.name) || primaryRecord.name;

    // Collect divisions from all duplicate DivisionHead records
    const allDivisions: string[] = [];
    let earliestCreatedAt = primaryRecord.createdAt || new Date().toISOString();
    let latestUpdatedAt = primaryRecord.updatedAt || earliestCreatedAt;
    let verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION' = 'VERIFIED';
    let verificationReason: string | undefined;

    for (const r of records) {
      for (const d of r.divisions || []) {
        allDivisions.push(d);
      }
      if (r.createdAt && r.createdAt < earliestCreatedAt) earliestCreatedAt = r.createdAt;
      if (r.updatedAt && r.updatedAt > latestUpdatedAt) latestUpdatedAt = r.updatedAt;

      // Only preserve NEEDS_VERIFICATION if the reason is NOT the old cross-division split warning
      if (r.verificationStatus === 'NEEDS_VERIFICATION') {
        const reason = (r.verificationReason || '').toLowerCase();
        const isCrossDivisionWarning =
          reason.includes('appears in multiple divisions') ||
          reason.includes('also appears under another division');
        if (!isCrossDivisionWarning && r.verificationReason) {
          verificationStatus = 'NEEDS_VERIFICATION';
          verificationReason = r.verificationReason;
        } else {
          changed = true;
        }
      }

      if (r.id !== canonicalId) {
        changed = true;
      }
      oldIdToCanonical.set(r.id, { id: canonicalId, name: displayName });
    }

    // Also include any divisions found directly on Teams or ADMs linked to these IDs
    const groupIdSet = new Set(records.map((r) => r.id));
    for (const t of state.teams) {
      if (groupIdSet.has(t.divisionHeadId) && t.division) {
        allDivisions.push(t.division);
      }
    }
    for (const a of state.adms) {
      if (groupIdSet.has(a.divisionHeadId) && a.division) {
        allDivisions.push(a.division);
      }
    }

    const mergedDivisions = dedupeDivisions(allDivisions);
    if (
      records.length === 1 &&
      (records[0].divisions?.length !== mergedDivisions.length ||
        records[0].canonicalName !== cName)
    ) {
      changed = true;
    }

    consolidatedHeads.push({
      id: canonicalId,
      name: displayName,
      canonicalName: cName,
      divisions: mergedDivisions,
      verificationStatus,
      ...(verificationStatus === 'NEEDS_VERIFICATION' && verificationReason
        ? { verificationReason }
        : {}),
      createdAt: earliestCreatedAt,
      updatedAt: latestUpdatedAt,
    });
  }

  state.divisionHeads = consolidatedHeads;

  // Remap Teams
  for (const t of state.teams) {
    const mapped =
      oldIdToCanonical.get(t.divisionHeadId) ||
      (t.divisionHeadName ? oldIdToCanonical.get(`DH_${slugifyOrg(t.divisionHeadName)}`) : undefined);
    if (mapped && (t.divisionHeadId !== mapped.id || t.divisionHeadName !== mapped.name)) {
      t.divisionHeadId = mapped.id;
      t.divisionHeadName = mapped.name;
      changed = true;
    }
  }

  // Remap ADMs (and clear stale cross-division duplicate verification flags)
  for (const a of state.adms) {
    const mapped = oldIdToCanonical.get(a.divisionHeadId);
    if (mapped && (a.divisionHeadId !== mapped.id || a.divisionHeadName !== mapped.name)) {
      a.divisionHeadId = mapped.id;
      a.divisionHeadName = mapped.name;
      changed = true;
    }
    if (a.verificationStatus === 'NEEDS_VERIFICATION') {
      const reason = (a.verificationReason || '').toLowerCase();
      if (
        reason.includes('appears in multiple divisions') ||
        reason.includes('also appears under another division')
      ) {
        a.verificationStatus = 'VERIFIED';
        delete a.verificationReason;
        changed = true;
      }
    }
  }

  // Remap Customers
  for (const c of state.customers) {
    if (c.divisionHeadId) {
      const mapped = oldIdToCanonical.get(c.divisionHeadId);
      if (mapped && (c.divisionHeadId !== mapped.id || c.divisionHead !== mapped.name)) {
        c.divisionHeadId = mapped.id;
        c.divisionHead = mapped.name;
        changed = true;
      }
    }
  }

  // Remap Users
  for (const u of state.users) {
    if (u.divisionHeadId) {
      const mapped = oldIdToCanonical.get(u.divisionHeadId);
      if (mapped && (u.divisionHeadId !== mapped.id || u.divisionHeadName !== mapped.name)) {
        u.divisionHeadId = mapped.id;
        u.divisionHeadName = mapped.name;
        changed = true;
      }
    }
  }

  return changed;
}

export interface ResolvedScopeContext {
  isRestricted: boolean;
  hasPinnedHead: boolean;
  allowedHeadIds: Set<string>;
  allowedDivisions: Set<string>;
  allowedTeamIds: Set<string>;
  allowedAdmNumbers: Set<string>;
  allowedCustomerIds: Set<string>;
}

export function resolveUserOrgScope(
  user: UserProfile,
  state: ServerStoreState
): ResolvedScopeContext {
  if (user.role !== 'DIVISION_HEAD') {
    return {
      isRestricted: false,
      hasPinnedHead: false,
      allowedHeadIds: new Set(),
      allowedDivisions: new Set(),
      allowedTeamIds: new Set(),
      allowedAdmNumbers: new Set(),
      allowedCustomerIds: new Set(),
    };
  }

  const allowedHeadIds = new Set<string>();
  const allowedDivisions = new Set<string>();
  const allowedTeamIds = new Set<string>();
  const allowedAdmNumbers = new Set<string>();
  const allowedCustomerIds = new Set<string>();

  if (user.divisionHeadId?.trim()) {
    allowedHeadIds.add(user.divisionHeadId.trim());
  }
  if (user.assignedDivision?.trim()) {
    for (const part of user.assignedDivision.split(',')) {
      const key = normOrgKey(part);
      if (key) allowedDivisions.add(key);
    }
  }
  if (user.assignedTeamId?.trim()) {
    allowedTeamIds.add(user.assignedTeamId.trim());
  }

  // Match division head master by divisionHeadName if ID was not explicitly set
  if (user.divisionHeadName?.trim() && allowedHeadIds.size === 0) {
    const targetHeadName = normOrgKey(user.divisionHeadName);
    for (const dh of state.divisionHeads) {
      if (normOrgKey(dh.name) === targetHeadName || normOrgKey(dh.canonicalName) === targetHeadName) {
        allowedHeadIds.add(dh.id);
      }
    }
  }

  const hasPinnedHead = allowedHeadIds.size > 0;

  // Expand divisions from matched DivisionHeadMaster
  for (const dh of state.divisionHeads) {
    if (allowedHeadIds.has(dh.id)) {
      for (const div of dh.divisions || []) {
        if (div) allowedDivisions.add(normOrgKey(div));
      }
    } else if (
      !hasPinnedHead &&
      allowedDivisions.size > 0 &&
      (dh.divisions || []).some((d) => allowedDivisions.has(normOrgKey(d)))
    ) {
      allowedHeadIds.add(dh.id);
    }
  }

  // Expand allowed Teams
  for (const t of state.teams) {
    const teamMatchesHead = allowedHeadIds.size > 0 && allowedHeadIds.has(t.divisionHeadId);
    const teamMatchesDiv =
      !hasPinnedHead && allowedDivisions.size > 0 && allowedDivisions.has(normOrgKey(t.division));
    const teamMatchesAssignedTeam = Boolean(user.assignedTeamId && t.id === user.assignedTeamId);
    if (teamMatchesHead || teamMatchesDiv || teamMatchesAssignedTeam) {
      allowedTeamIds.add(t.id);
      if (t.division) allowedDivisions.add(normOrgKey(t.division));
    }
  }

  // Expand allowed ADMs
  for (const a of state.adms) {
    const admMatchesHead = allowedHeadIds.size > 0 && allowedHeadIds.has(a.divisionHeadId);
    const admMatchesDiv =
      !hasPinnedHead && allowedDivisions.size > 0 && allowedDivisions.has(normOrgKey(a.division));
    const admMatchesTeam = allowedTeamIds.has(a.teamId);
    if (admMatchesHead || admMatchesDiv || admMatchesTeam) {
      allowedAdmNumbers.add(normOrgKey(a.admNumber));
      if (a.teamId) allowedTeamIds.add(a.teamId);
    }
  }

  // Expand allowed Customers
  for (const c of state.customers) {
    const custMatchesHead = Boolean(c.divisionHeadId && allowedHeadIds.has(c.divisionHeadId));
    const custMatchesDiv = Boolean(
      !hasPinnedHead && c.division && allowedDivisions.has(normOrgKey(c.division))
    );
    const custMatchesTeam = Boolean(c.teamId && allowedTeamIds.has(c.teamId));
    const custMatchesAdm = Boolean(c.admNumber && allowedAdmNumbers.has(normOrgKey(c.admNumber)));
    if (custMatchesHead || custMatchesDiv || custMatchesTeam || custMatchesAdm) {
      allowedCustomerIds.add(normOrgKey(c.customerId));
    }
  }

  return {
    isRestricted: true,
    hasPinnedHead,
    allowedHeadIds,
    allowedDivisions,
    allowedTeamIds,
    allowedAdmNumbers,
    allowedCustomerIds,
  };
}

export function isChequeInScope(
  rec: ChequeRecord,
  scope: ResolvedScopeContext,
  custMap: Map<string, CustomerMasterRecord>,
  admMap: Map<string, AdmMasterRecord>
): boolean {
  if (!scope.isRestricted) return true;
  const cxKey = normOrgKey(rec.cxNumber);
  if (cxKey && scope.allowedCustomerIds.has(cxKey)) return true;

  const cm = custMap.get(cxKey);
  const admFromCust = cm && !cm.requiresAdmMapping ? admMap.get(normOrgKey(cm.admNumber)) : undefined;
  const admFromRec = admMap.get(normOrgKey(rec.admCode));
  const adm = admFromCust || admFromRec;

  const teamId = adm?.teamId || cm?.teamId || '';
  const division = adm?.division || cm?.division || '';
  const divisionHeadId = adm?.divisionHeadId || cm?.divisionHeadId || '';
  const admNumber = adm?.admNumber || cm?.admNumber || rec.admCode || '';

  if (divisionHeadId && scope.allowedHeadIds.has(divisionHeadId)) return true;
  if (teamId && scope.allowedTeamIds.has(teamId)) return true;
  if (!scope.hasPinnedHead && division && scope.allowedDivisions.has(normOrgKey(division))) return true;
  if (admNumber && scope.allowedAdmNumbers.has(normOrgKey(admNumber))) return true;
  return false;
}

export function getEffectiveChequeRecords(state: ServerStoreState): ChequeRecord[] {
  if (state.chequeRecords.length > 0) {
    return state.chequeRecords;
  }
  const hasRealOrg =
    state.divisionHeads.length > 0 ||
    state.teams.length > 0 ||
    state.adms.length > 0 ||
    state.customers.length > 0;
  if (state.meta.sampleDismissed || hasRealOrg) {
    return [];
  }
  return SAMPLE_CHEQUE_RECORDS;
}

export function getScopedPayloadForUser(user: UserProfile, state: ServerStoreState) {
  const allCheques = getEffectiveChequeRecords(state);
  const scope = resolveUserOrgScope(user, state);

  if (!scope.isRestricted) {
    return {
      chequeRecords: allCheques,
      divisionHeads: state.divisionHeads,
      teams: state.teams,
      adms: state.adms,
      customers: state.customers,
      recoveryActions: state.recoveryActions,
      importBatches: user.role === 'SYSTEM_ADMIN' ? state.importBatches : [],
      config: state.config,
      scopeSummary: {
        restricted: false,
        role: user.role,
      },
    };
  }

  const custMap = new Map<string, CustomerMasterRecord>();
  for (const c of state.customers) {
    if (c.customerId) custMap.set(normOrgKey(c.customerId), c);
  }
  const admMap = new Map<string, AdmMasterRecord>();
  for (const a of state.adms) {
    if (a.admNumber) admMap.set(normOrgKey(a.admNumber), a);
  }

  const scopedHeads = state.divisionHeads.filter(
    (dh) =>
      scope.allowedHeadIds.has(dh.id) ||
      (!scope.hasPinnedHead &&
        (dh.divisions || []).some((d) => scope.allowedDivisions.has(normOrgKey(d))))
  );
  const scopedTeams = state.teams.filter(
    (t) =>
      scope.allowedTeamIds.has(t.id) ||
      scope.allowedHeadIds.has(t.divisionHeadId) ||
      (!scope.hasPinnedHead && scope.allowedDivisions.has(normOrgKey(t.division)))
  );
  const scopedAdms = state.adms.filter(
    (a) =>
      scope.allowedAdmNumbers.has(normOrgKey(a.admNumber)) ||
      scope.allowedTeamIds.has(a.teamId) ||
      scope.allowedHeadIds.has(a.divisionHeadId) ||
      (!scope.hasPinnedHead && scope.allowedDivisions.has(normOrgKey(a.division)))
  );
  const scopedCustomers = state.customers.filter(
    (c) =>
      scope.allowedCustomerIds.has(normOrgKey(c.customerId)) ||
      scope.allowedTeamIds.has(c.teamId) ||
      scope.allowedHeadIds.has(c.divisionHeadId) ||
      (!scope.hasPinnedHead && scope.allowedDivisions.has(normOrgKey(c.division))) ||
      scope.allowedAdmNumbers.has(normOrgKey(c.admNumber))
  );
  const scopedCheques = allCheques.filter((r) => isChequeInScope(r, scope, custMap, admMap));
  const scopedChequeIdSet = new Set(scopedCheques.map((c) => c.id));
  const scopedActions = state.recoveryActions.filter((a) => scopedChequeIdSet.has(a.chequeId));

  return {
    chequeRecords: scopedCheques,
    divisionHeads: scopedHeads,
    teams: scopedTeams,
    adms: scopedAdms,
    customers: scopedCustomers,
    recoveryActions: scopedActions,
    importBatches: [],
    config: state.config,
    scopeSummary: {
      restricted: true,
      role: user.role,
      divisionHeadId: user.divisionHeadId || scopedHeads[0]?.id || '',
      divisionHeadName: user.divisionHeadName || scopedHeads[0]?.name || user.displayName,
      divisions: Array.from(scope.allowedDivisions),
      teamCount: scopedTeams.length,
    },
  };
}

/**
 * Server-computed anonymized Cross-Team Comparative Benchmarking.
 * Exposes quantitative benchmarks for all Teams while strictly redacting
 * peer divisions' team names, ADM identities, and customer/cheque details
 * when requested by a DIVISION_HEAD user.
 */
export function computeCrossTeamBenchmarksForUser(
  user: UserProfile,
  state: ServerStoreState
): CrossTeamBenchmarkSummary {
  const allCheques = getEffectiveChequeRecords(state);
  const scope = resolveUserOrgScope(user, state);
  const todayStr = new Date().toISOString().slice(0, 10);

  const custMap = new Map<string, CustomerMasterRecord>();
  for (const c of state.customers) {
    if (c.customerId) custMap.set(normOrgKey(c.customerId), c);
  }
  const admMap = new Map<string, AdmMasterRecord>();
  for (const a of state.adms) {
    if (a.admNumber) admMap.set(normOrgKey(a.admNumber), a);
  }

  interface Bucket {
    teamId: string;
    teamName: string;
    division: string;
    divisionHeadId: string;
    admCount: number;
    cheques: ChequeRecord[];
  }

  const buckets = new Map<string, Bucket>();
  for (const t of state.teams) {
    buckets.set(t.id, {
      teamId: t.id,
      teamName: t.teamName,
      division: t.division,
      divisionHeadId: t.divisionHeadId,
      admCount: 0,
      cheques: [],
    });
  }

  for (const a of state.adms) {
    if (!buckets.has(a.teamId)) {
      buckets.set(a.teamId, {
        teamId: a.teamId,
        teamName: a.teamName,
        division: a.division,
        divisionHeadId: a.divisionHeadId,
        admCount: 0,
        cheques: [],
      });
    }
    buckets.get(a.teamId)!.admCount += 1;
  }

  for (const r of allCheques) {
    const cm = custMap.get(normOrgKey(r.cxNumber));
    const admFromCust = cm && !cm.requiresAdmMapping ? admMap.get(normOrgKey(cm.admNumber)) : undefined;
    const admFromRec = admMap.get(normOrgKey(r.admCode));
    const adm = admFromCust || admFromRec;

    const teamId = adm?.teamId || cm?.teamId || 'UNMAPPED_TEAM';
    if (!buckets.has(teamId)) {
      buckets.set(teamId, {
        teamId,
        teamName: adm?.teamName || cm?.teamName || 'Unmapped / Historical Records',
        division: adm?.division || cm?.division || 'Unassigned Division',
        divisionHeadId: adm?.divisionHeadId || cm?.divisionHeadId || 'UNMAPPED_HEAD',
        admCount: 0,
        cheques: [],
      });
    }
    buckets.get(teamId)!.cheques.push(r);
  }

  const rawStats = Array.from(buckets.values()).map((b) => {
    const totalReturns = b.cheques.length;
    const totalValue = b.cheques.reduce((s, r) => s + (r.amount || 0), 0);
    const verifiedRecoveredValue = b.cheques.reduce((s, r) => s + (r.recoveredAmount || 0), 0);
    const unrecoveredExposure = b.cheques.reduce((s, r) => {
      if (r.recoveryStatus === 'RECOVERED' || r.recoveryStatus === 'CLOSED_OTHER') return s;
      return s + (r.remainingAmount !== undefined ? r.remainingAmount : r.amount || 0);
    }, 0);
    const recoveryRateByValue = totalValue > 0 ? (verifiedRecoveredValue / totalValue) * 100 : 0;

    const cxCounts: Record<string, number> = {};
    for (const r of b.cheques) {
      cxCounts[r.cxNumber] = (cxCounts[r.cxNumber] || 0) + 1;
    }
    const affectedCustomersCount = Object.keys(cxCounts).length;
    const repeatCustomersCount = Object.values(cxCounts).filter(
      (cnt) => cnt >= state.config.repeatReturnThreshold
    ).length;

    const overdueCasesCount = b.cheques.filter(
      (r) =>
        r.nextFollowUpDate &&
        r.nextFollowUpDate < todayStr &&
        r.recoveryStatus !== 'RECOVERED' &&
        r.recoveryStatus !== 'CLOSED_OTHER'
    ).length;

    const isOwnTeam = scope.isRestricted
      ? scope.allowedTeamIds.has(b.teamId) ||
        scope.allowedHeadIds.has(b.divisionHeadId) ||
        scope.allowedDivisions.has(normOrgKey(b.division))
      : true;

    return {
      ...b,
      totalReturns,
      totalValue,
      verifiedRecoveredValue,
      unrecoveredExposure,
      recoveryRateByValue,
      affectedCustomersCount,
      repeatCustomersCount,
      overdueCasesCount,
      isOwnTeam,
    };
  });

  // Compute rank by returned value (descending — rank 1 = highest return value)
  const sortedByValue = [...rawStats].sort(
    (a, b) => b.totalValue - a.totalValue || b.totalReturns - a.totalReturns
  );
  const rankByValueMap = new Map<string, number>();
  sortedByValue.forEach((item, idx) => rankByValueMap.set(item.teamId, idx + 1));

  // Compute rank by recovery rate (descending — rank 1 = best recovery rate)
  const sortedByRecovery = [...rawStats].sort(
    (a, b) => b.recoveryRateByValue - a.recoveryRateByValue || a.unrecoveredExposure - b.unrecoveredExposure
  );
  const rankByRecoveryMap = new Map<string, number>();
  sortedByRecovery.forEach((item, idx) => rankByRecoveryMap.set(item.teamId, idx + 1));

  let peerCounter = 0;
  const rows: CrossTeamBenchmarkRow[] = sortedByValue.map((item) => {
    const canShowIdentity = !scope.isRestricted || item.isOwnTeam;
    if (!canShowIdentity) peerCounter += 1;
    return {
      teamId: canShowIdentity ? item.teamId : `BENCHMARK-PEER-${peerCounter}`,
      teamLabel: canShowIdentity ? item.teamName : `Peer Benchmark Team #${peerCounter}`,
      divisionLabel: canShowIdentity ? item.division : 'Comparative Peer Division',
      isOwnTeam: scope.isRestricted ? item.isOwnTeam : false,
      rankByValue: rankByValueMap.get(item.teamId) || 0,
      rankByRecoveryRate: rankByRecoveryMap.get(item.teamId) || 0,
      admCount: item.admCount,
      totalReturns: item.totalReturns,
      totalValue: item.totalValue,
      unrecoveredExposure: item.unrecoveredExposure,
      verifiedRecoveredValue: item.verifiedRecoveredValue,
      recoveryRateByValue: Number(item.recoveryRateByValue.toFixed(1)),
      repeatCustomersCount: item.repeatCustomersCount,
      affectedCustomersCount: item.affectedCustomersCount,
      overdueCasesCount: item.overdueCasesCount,
    };
  });

  const totalTeamsCount = rows.length;
  const ownTeamsCount = scope.isRestricted ? rows.filter((r) => r.isOwnTeam).length : totalTeamsCount;
  const companyAverageReturnValue =
    totalTeamsCount > 0 ? rows.reduce((s, r) => s + r.totalValue, 0) / totalTeamsCount : 0;
  const companyAverageRecoveryRate =
    totalTeamsCount > 0
      ? rows.reduce((s, r) => s + r.recoveryRateByValue, 0) / totalTeamsCount
      : 0;
  const companyAverageReturnsCount =
    totalTeamsCount > 0 ? rows.reduce((s, r) => s + r.totalReturns, 0) / totalTeamsCount : 0;

  return {
    totalTeamsCount,
    ownTeamsCount,
    companyAverageReturnValue,
    companyAverageRecoveryRate: Number(companyAverageRecoveryRate.toFixed(1)),
    companyAverageReturnsCount: Number(companyAverageReturnsCount.toFixed(1)),
    rows,
  };
}
