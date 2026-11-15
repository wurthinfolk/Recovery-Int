import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import type {
  AdmMasterRecord,
  AnalyticalConfig,
  AuditLog,
  ChequeRecord,
  CustomerMasterRecord,
  DivisionHeadMaster,
  ImportBatch,
  RecoveryAction,
  TeamMaster,
  UserAccountStatus,
  UserProfile,
  UserRole,
} from './src/types/index.ts';
import { SAMPLE_CHEQUE_RECORDS } from './src/data/sampleRecords.ts';
import {
  canEditCheques,
  canImportCheques,
  canImportOrgMaster,
  canManageOrg,
  canManageRecovery,
  canManageSettings,
  canManageUsers,
  canViewAuditAdmin,
} from './src/services/permissions.ts';
import {
  appendServerAuditLog,
  clearFailedLoginAttempts,
  computeCrossTeamBenchmarksForUser,
  consolidateDivisionHeadsInState,
  countActiveSystemAdmins,
  createOneTimeInitialAdmin,
  getEffectiveChequeRecords,
  getScopedPayloadForUser,
  hashPassword,
  isChequeInScope,
  isRateLimited,
  loadStore,
  normalizeUsername,
  parseCookieHeader,
  recordFailedLoginAttempt,
  resolveUserOrgScope,
  runInitialAdminBootstrap,
  sanitizeUser,
  saveStore,
  signSessionToken,
  validatePasswordStrength,
  validateUserRole,
  validateUsernameFormat,
  verifyDummyPasswordTimingSafe,
  verifyPassword,
  verifySessionToken,
} from './server/store.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_COOKIE_NAME = 'wurth_session';
const app = express();
app.set('trust proxy', 1);

const rawPort = Number(process.env.PORT);
const nginxPort = Number(process.env.NGINX_PORT);
const PORT =
  rawPort && rawPort !== nginxPort
    ? rawPort
    : Number(process.env.DEFAULT_APP_PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

// Ensure one-time server bootstrap executes cleanly on startup when configured
const bootStatus = runInitialAdminBootstrap();
if (bootStatus.createdNow) {
  console.log('WÜRTH Recovery Intelligence: Initial System Administrator (it.admin) bootstrapped.');
}

// ============================================================
// Cookie & Authentication Middleware
// ============================================================

function isHttpsRequest(req: express.Request): boolean {
  return (
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim() === 'https'
  );
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${12 * 60 * 60}`,
  ];
  if (isHttps) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  const isHttps = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure');
    parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

interface AuthedRequest extends express.Request {
  authUser?: UserProfile;
}

function extractBearerToken(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1].trim() : undefined;
}

function resolveSessionUser(req: express.Request): UserProfile | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME] || extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const state = loadStore();
  const user = state.users.find((u) => u.uid === payload.uid);
  if (!user || user.status !== 'ACTIVE') {
    return null;
  }
  return sanitizeUser(user);
}

function requireAuth(
  req: AuthedRequest,
  res: express.Response,
  next: express.NextFunction
): void {
  const user = resolveSessionUser(req);
  if (!user) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = user;
  next();
}

function requirePermission(
  checkFn: (role: UserRole) => boolean,
  permissionDescription: string
) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!checkFn(user.role)) {
      const state = loadStore();
      appendServerAuditLog(state, {
        recordId: req.originalUrl,
        recordType: 'ACCESS_CONTROL',
        operation: 'UNAUTHORIZED_ACCESS',
        actor: user.displayName,
        actorUsername: user.username,
        actorEmail: user.email,
        actorRole: user.role,
        details: `Denied access to ${req.method} ${req.originalUrl}: missing permission (${permissionDescription}).`,
      });
      saveStore(state);
      res.status(403).json({
        error: `Access denied. Your role (${user.role}) is not authorized to perform this action.`,
      });
      return;
    }
    next();
  };
}

// ============================================================
// Health & Bootstrap Status
// ============================================================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.get('/api/auth/bootstrap-status', (_req, res) => {
  const result = runInitialAdminBootstrap();
  res.json({ initialized: result.initialized });
});

app.post('/api/auth/bootstrap-admin', (req, res) => {
  const currentBoot = runInitialAdminBootstrap();
  if (currentBoot.initialized) {
    return res.status(403).json({
      error:
        'Initial administrator setup has already been completed and is permanently locked. Please sign in with your administrator credentials.',
    });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword =
    typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : undefined;
  const displayName =
    typeof req.body?.displayName === 'string' ? req.body.displayName : undefined;
  const email = typeof req.body?.email === 'string' ? req.body.email : undefined;

  if (!password) {
    return res.status(400).json({ error: 'Initial administrator password is required.' });
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  try {
    const adminUser = createOneTimeInitialAdmin({ password, displayName, email });
    const state = loadStore();
    appendServerAuditLog(state, {
      recordId: adminUser.uid,
      recordType: 'AUTH_SESSION',
      operation: 'LOGIN_SUCCESS',
      actor: adminUser.displayName,
      actorUsername: adminUser.username,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      details: 'Initial System Administrator (it.admin) signed in upon one-time setup.',
    });
    saveStore(state);

    const token = signSessionToken(adminUser);
    setSessionCookie(req, res, token);
    return res.status(201).json({
      user: sanitizeUser(adminUser),
      sessionToken: token,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to initialize administrator.';
    if (message === 'BOOTSTRAP_LOCKED') {
      return res.status(403).json({
        error:
          'Initial administrator setup has already been completed and is permanently locked.',
      });
    }
    return res.status(400).json({ error: message });
  }
});

// ============================================================
// Authentication Routes (Username + Password, Non-Enumerating)
// ============================================================

app.post('/api/auth/login', (req, res) => {
  runInitialAdminBootstrap();
  const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const usernameLower = normalizeUsername(rawUsername);
  const ip = req.ip || 'unknown';
  const rateKey = `${ip}::${usernameLower}`;

  if (isRateLimited(rateKey)) {
    return res.status(429).json({
      error: 'Too many failed sign-in attempts. Please wait a few minutes and try again.',
    });
  }

  if (!usernameLower || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const state = loadStore();
  const user = state.users.find((u) => u.usernameLower === usernameLower);

  if (!user) {
    verifyDummyPasswordTimingSafe(password);
    recordFailedLoginAttempt(rateKey);
    appendServerAuditLog(state, {
      recordId: usernameLower,
      recordType: 'AUTH_SESSION',
      operation: 'LOGIN_FAILED',
      actor: usernameLower,
      actorUsername: usernameLower,
      actorEmail: 'unknown',
      actorRole: 'ANONYMOUS',
      details: `Failed sign-in attempt for unrecognized username "${usernameLower}".`,
    });
    saveStore(state);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const validPassword = verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!validPassword) {
    recordFailedLoginAttempt(rateKey);
    appendServerAuditLog(state, {
      recordId: user.uid,
      recordType: 'AUTH_SESSION',
      operation: 'LOGIN_FAILED',
      actor: user.displayName,
      actorUsername: user.username,
      actorEmail: user.email,
      actorRole: user.role,
      details: `Failed sign-in attempt (incorrect password) for username "${user.username}".`,
    });
    saveStore(state);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (user.status !== 'ACTIVE') {
    recordFailedLoginAttempt(rateKey);
    appendServerAuditLog(state, {
      recordId: user.uid,
      recordType: 'AUTH_SESSION',
      operation: 'LOGIN_FAILED',
      actor: user.displayName,
      actorUsername: user.username,
      actorEmail: user.email,
      actorRole: user.role,
      details: `Blocked sign-in attempt for deactivated account "${user.username}".`,
    });
    saveStore(state);
    return res.status(403).json({
      error: 'This user account is inactive. Please contact your System Administrator.',
    });
  }

  clearFailedLoginAttempts(rateKey);
  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.updatedAt = now;

  appendServerAuditLog(state, {
    recordId: user.uid,
    recordType: 'AUTH_SESSION',
    operation: 'LOGIN_SUCCESS',
    actor: user.displayName,
    actorUsername: user.username,
    actorEmail: user.email,
    actorRole: user.role,
    details: `User "${user.username}" (${user.role}) signed in successfully.`,
  });
  saveStore(state);

  const token = signSessionToken(user);
  setSessionCookie(req, res, token);
  return res.json({ user: sanitizeUser(user), sessionToken: token });
});

app.post('/api/auth/logout', (req, res) => {
  const user = resolveSessionUser(req);
  if (user) {
    const state = loadStore();
    appendServerAuditLog(state, {
      recordId: user.uid,
      recordType: 'AUTH_SESSION',
      operation: 'LOGOUT',
      actor: user.displayName,
      actorUsername: user.username,
      actorEmail: user.email,
      actorRole: user.role,
      details: `User "${user.username}" signed out.`,
    });
    saveStore(state);
  }
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const boot = runInitialAdminBootstrap();
  const user = resolveSessionUser(req);
  if (!user) {
    clearSessionCookie(req, res);
    return res.status(401).json({
      authenticated: false,
      bootstrapInitialized: boot.initialized,
    });
  }
  return res.json({
    authenticated: true,
    bootstrapInitialized: boot.initialized,
    user,
  });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  const userSession = req.authUser!;
  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    return res.status(400).json({ error: strengthErr });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      error: 'New password must be different from your current or temporary password.',
    });
  }

  const state = loadStore();
  const stored = state.users.find((u) => u.uid === userSession.uid);
  if (!stored || stored.status !== 'ACTIVE') {
    clearSessionCookie(req, res);
    return res.status(401).json({ error: 'Account unavailable.' });
  }

  if (!verifyPassword(currentPassword, stored.passwordHash, stored.passwordSalt)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const { hash, salt } = hashPassword(newPassword);
  const now = new Date().toISOString();
  stored.passwordHash = hash;
  stored.passwordSalt = salt;
  stored.mustChangePassword = false;
  stored.updatedAt = now;

  appendServerAuditLog(state, {
    recordId: stored.uid,
    recordType: 'USER_ACCOUNT',
    operation: 'PASSWORD_CHANGE',
    actor: stored.displayName,
    actorUsername: stored.username,
    actorEmail: stored.email,
    actorRole: stored.role,
    details: `User "${stored.username}" updated their password.`,
  });
  saveStore(state);

  const token = signSessionToken(stored);
  setSessionCookie(req, res, token);
  return res.json({ user: sanitizeUser(stored), sessionToken: token });
});

// ============================================================
// System Administrator User Management Endpoints
// ============================================================

app.get(
  '/api/admin/users',
  requireAuth,
  requirePermission(canManageUsers, 'User Management'),
  (_req, res) => {
    const state = loadStore();
    const users = state.users
      .map(sanitizeUser)
      .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    return res.json({ users });
  }
);

app.post(
  '/api/admin/users',
  requireAuth,
  requirePermission(canManageUsers, 'Create User'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const body = req.body || {};
    const displayName = String(body.displayName || '').trim();
    const usernameRaw = String(body.username || '').trim();
    const usernameLower = normalizeUsername(usernameRaw);
    const temporaryPassword = String(body.temporaryPassword || '');
    const email = String(body.email || '').trim().toLowerCase();
    const mobileNo = body.mobileNo ? String(body.mobileNo).trim() : '';
    const employeeId = body.employeeId ? String(body.employeeId).trim() : '';
    const department = String(body.department || '').trim() || 'Recovery & Operations';
    const role = body.role;
    const status: UserAccountStatus = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const assignedDivision = body.assignedDivision ? String(body.assignedDivision).trim() : '';
    const assignedTeamId = body.assignedTeamId ? String(body.assignedTeamId).trim() : '';
    const assignedTeamName = body.assignedTeamName ? String(body.assignedTeamName).trim() : '';
    const divisionHeadId = body.divisionHeadId ? String(body.divisionHeadId).trim() : '';
    const divisionHeadName = body.divisionHeadName ? String(body.divisionHeadName).trim() : '';

    if (!displayName) {
      return res.status(400).json({ error: 'Full Name is required.' });
    }
    const uErr = validateUsernameFormat(usernameRaw);
    if (uErr) return res.status(400).json({ error: uErr });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid Email Address is required.' });
    }
    if (!validateUserRole(role)) {
      return res.status(400).json({ error: 'Invalid user role selected.' });
    }
    const pwErr = validatePasswordStrength(temporaryPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    if (role === 'DIVISION_HEAD' && !divisionHeadId && !assignedDivision && !divisionHeadName) {
      return res.status(400).json({
        error: 'Division Head accounts must specify an Assigned Division or Division Head Master mapping.',
      });
    }

    const state = loadStore();
    if (state.users.some((u) => u.usernameLower === usernameLower)) {
      return res.status(409).json({
        error: `Username "${usernameLower}" already exists. Usernames must be unique.`,
      });
    }

    const { hash, salt } = hashPassword(temporaryPassword);
    const now = new Date().toISOString();
    const newUser = {
      uid: `usr-${crypto.randomUUID()}`,
      username: usernameLower,
      usernameLower,
      passwordHash: hash,
      passwordSalt: salt,
      displayName,
      email,
      mobileNo,
      employeeId,
      department,
      role,
      assignedDivision,
      assignedTeamId,
      assignedTeamName,
      divisionHeadId,
      divisionHeadName,
      status,
      mustChangePassword: true,
      createdAt: now,
      createdBy: actor.username,
      updatedAt: now,
    };

    state.users.push(newUser);
    appendServerAuditLog(state, {
      recordId: newUser.uid,
      recordType: 'USER_ACCOUNT',
      operation: 'USER_CREATE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Created user "${newUser.username}" (${newUser.displayName}) with role ${newUser.role} and forced password change.`,
      afterValue: JSON.stringify({
        username: newUser.username,
        role: newUser.role,
        assignedDivision: newUser.assignedDivision,
        assignedTeamId: newUser.assignedTeamId,
        divisionHeadId: newUser.divisionHeadId,
        status: newUser.status,
      }),
    });
    saveStore(state);
    return res.status(201).json({ user: sanitizeUser(newUser) });
  }
);

app.patch(
  '/api/admin/users/:uid',
  requireAuth,
  requirePermission(canManageUsers, 'Update User'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { uid } = req.params;
    const body = req.body || {};

    const state = loadStore();
    const target = state.users.find((u) => u.uid === uid);
    if (!target) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const nextRole = body.role !== undefined ? body.role : target.role;
    if (!validateUserRole(nextRole)) {
      return res.status(400).json({ error: 'Invalid user role.' });
    }

    const nextStatus =
      body.status === 'ACTIVE' || body.status === 'INACTIVE' ? body.status : target.status;

    // Guard against removing or deactivating the last active System Administrator
    const wasActiveAdmin = target.role === 'SYSTEM_ADMIN' && target.status === 'ACTIVE';
    const willBeActiveAdmin = nextRole === 'SYSTEM_ADMIN' && nextStatus === 'ACTIVE';
    if (wasActiveAdmin && !willBeActiveAdmin && countActiveSystemAdmins(state.users) <= 1) {
      return res.status(400).json({
        error: 'Cannot deactivate or downgrade the last active System Administrator account.',
      });
    }

    const beforeSnapshot = JSON.stringify({
      displayName: target.displayName,
      email: target.email,
      role: target.role,
      status: target.status,
      assignedDivision: target.assignedDivision,
      assignedTeamId: target.assignedTeamId,
      divisionHeadId: target.divisionHeadId,
      mustChangePassword: target.mustChangePassword,
    });

    if (body.displayName !== undefined) {
      const cleanName = String(body.displayName).trim();
      if (!cleanName) return res.status(400).json({ error: 'Full Name cannot be empty.' });
      target.displayName = cleanName;
    }
    if (body.email !== undefined) {
      const cleanEmail = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Valid email address is required.' });
      }
      target.email = cleanEmail;
    }
    if (body.mobileNo !== undefined) target.mobileNo = String(body.mobileNo || '').trim();
    if (body.employeeId !== undefined) target.employeeId = String(body.employeeId || '').trim();
    if (body.department !== undefined) target.department = String(body.department || '').trim();
    if (body.assignedDivision !== undefined) {
      target.assignedDivision = String(body.assignedDivision || '').trim();
    }
    if (body.assignedTeamId !== undefined) {
      target.assignedTeamId = String(body.assignedTeamId || '').trim();
    }
    if (body.assignedTeamName !== undefined) {
      target.assignedTeamName = String(body.assignedTeamName || '').trim();
    }
    if (body.divisionHeadId !== undefined) {
      target.divisionHeadId = String(body.divisionHeadId || '').trim();
    }
    if (body.divisionHeadName !== undefined) {
      target.divisionHeadName = String(body.divisionHeadName || '').trim();
    }
    if (body.mustChangePassword !== undefined) {
      target.mustChangePassword = Boolean(body.mustChangePassword);
    }

    target.role = nextRole;
    target.status = nextStatus;
    target.updatedAt = new Date().toISOString();

    const statusChanged = beforeSnapshot.includes(`"status":"ACTIVE"`) !== (nextStatus === 'ACTIVE');
    appendServerAuditLog(state, {
      recordId: target.uid,
      recordType: 'USER_ACCOUNT',
      operation: statusChanged ? 'USER_STATUS_CHANGE' : 'USER_UPDATE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Updated user "${target.username}" (${target.role}, status: ${target.status}).`,
      beforeValue: beforeSnapshot,
      afterValue: JSON.stringify({
        displayName: target.displayName,
        email: target.email,
        role: target.role,
        status: target.status,
        assignedDivision: target.assignedDivision,
        assignedTeamId: target.assignedTeamId,
        divisionHeadId: target.divisionHeadId,
        mustChangePassword: target.mustChangePassword,
      }),
    });
    saveStore(state);
    return res.json({ user: sanitizeUser(target) });
  }
);

app.post(
  '/api/admin/users/:uid/reset-password',
  requireAuth,
  requirePermission(canManageUsers, 'Reset User Password'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { uid } = req.params;
    const temporaryPassword = String(req.body?.temporaryPassword || '');
    const forceChange = req.body?.forcePasswordChange !== false;

    const pwErr = validatePasswordStrength(temporaryPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const state = loadStore();
    const target = state.users.find((u) => u.uid === uid);
    if (!target) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const { hash, salt } = hashPassword(temporaryPassword);
    target.passwordHash = hash;
    target.passwordSalt = salt;
    target.mustChangePassword = forceChange;
    target.updatedAt = new Date().toISOString();

    appendServerAuditLog(state, {
      recordId: target.uid,
      recordType: 'USER_ACCOUNT',
      operation: 'PASSWORD_RESET',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Administrator reset password for "${target.username}" (forcePasswordChange=${forceChange}).`,
    });
    saveStore(state);
    return res.json({ user: sanitizeUser(target) });
  }
);

app.delete(
  '/api/admin/users/:uid',
  requireAuth,
  requirePermission(canManageUsers, 'Delete User Account'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { uid } = req.params;
    const state = loadStore();
    const targetIdx = state.users.findIndex((u) => u.uid === uid);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const target = state.users[targetIdx];
    if (target.uid === actor.uid) {
      return res.status(400).json({
        error: 'You cannot delete your own active System Administrator account.',
      });
    }

    if (
      target.role === 'SYSTEM_ADMIN' &&
      target.status === 'ACTIVE' &&
      countActiveSystemAdmins(state.users) <= 1
    ) {
      return res.status(400).json({
        error: 'Cannot delete the last active System Administrator account.',
      });
    }

    const beforeSnapshot = JSON.stringify(sanitizeUser(target));
    state.users.splice(targetIdx, 1);

    appendServerAuditLog(state, {
      recordId: target.uid,
      recordType: 'USER_ACCOUNT',
      operation: 'USER_DELETE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Administrator permanently deleted user account "${target.username}" (${target.displayName}, role: ${target.role}).`,
      beforeValue: beforeSnapshot,
    });
    saveStore(state);
    return res.json({ ok: true, deletedUid: uid });
  }
);

// ============================================================
// Scoped Data & Analytics Endpoints
// ============================================================

app.get('/api/data/bootstrap', requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const state = loadStore();
  return res.json(getScopedPayloadForUser(user, state));
});

app.get('/api/benchmarks/teams', requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const state = loadStore();
  return res.json(computeCrossTeamBenchmarksForUser(user, state));
});

app.get('/api/data/cheques/:id/actions', requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const { id } = req.params;
  const state = loadStore();
  const allCheques = getEffectiveChequeRecords(state);
  const record = allCheques.find((c) => c.id === id);
  if (!record) {
    return res.json({ actions: [], auditTrail: [] });
  }

  if (user.role === 'DIVISION_HEAD') {
    const scope = resolveUserOrgScope(user, state);
    const custMap = new Map(state.customers.map((c) => [c.customerId.trim().toLowerCase(), c]));
    const admMap = new Map(state.adms.map((a) => [a.admNumber.trim().toLowerCase(), a]));
    if (!isChequeInScope(record, scope, custMap, admMap)) {
      appendServerAuditLog(state, {
        recordId: id,
        recordType: 'ACCESS_CONTROL',
        operation: 'UNAUTHORIZED_ACCESS',
        actor: user.displayName,
        actorUsername: user.username,
        actorEmail: user.email,
        actorRole: user.role,
        details: `Division Head "${user.username}" attempted to inspect out-of-scope cheque "${id}".`,
      });
      saveStore(state);
      return res.status(403).json({
        error: 'Access denied. This returned-cheque record belongs to another Division.',
      });
    }
  }

  const actions = state.recoveryActions
    .filter((a) => a.chequeId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const auditTrail =
    user.role === 'DIVISION_HEAD'
      ? []
      : state.auditLogs.filter((a) => a.recordId === id).slice(0, 100);
  return res.json({ actions, auditTrail });
});

app.post(
  '/api/data/cheques',
  requireAuth,
  requirePermission(canEditCheques, 'Create/Update Cheque Record'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const record = req.body?.record as ChequeRecord | undefined;
    const isEdit = Boolean(req.body?.isEdit);
    if (!record || !record.id || !record.cxNumber) {
      return res.status(400).json({ error: 'Invalid cheque record payload.' });
    }

    const state = loadStore();
    if (!record.isSample) {
      state.meta.sampleDismissed = true;
      state.chequeRecords = state.chequeRecords.filter((r) => !r.isSample);
    }

    const idx = state.chequeRecords.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      state.chequeRecords[idx] = record;
    } else {
      state.chequeRecords.unshift(record);
    }

    appendServerAuditLog(state, {
      recordId: record.id,
      recordType: 'CHEQUE_RECORD',
      operation: isEdit ? 'UPDATE' : 'CREATE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `${isEdit ? 'Updated' : 'Created'} returned cheque ${record.description} for ${record.cxName} (${record.cxNumber}) — LKR ${record.amount}.`,
      afterValue: JSON.stringify({
        recoveryStatus: record.recoveryStatus,
        amount: record.amount,
        remainingAmount: record.remainingAmount,
      }),
    });

    saveStore(state);
    return res.json({ ok: true, chequeRecords: getEffectiveChequeRecords(state) });
  }
);

app.post(
  '/api/data/cheques/batch',
  requireAuth,
  requirePermission(canImportCheques, 'Bulk Upload Cheque Register'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const newRecords = Array.isArray(req.body?.records) ? (req.body.records as ChequeRecord[]) : [];
    const batch = req.body?.batch as ImportBatch | undefined;
    if (!batch || newRecords.length === 0) {
      return res.status(400).json({ error: 'Batch metadata and records are required.' });
    }

    const state = loadStore();
    state.meta.sampleDismissed = true;
    const existingNonSample = state.chequeRecords.filter((r) => !r.isSample);
    const mergedMap = new Map<string, ChequeRecord>();
    for (const r of existingNonSample) mergedMap.set(r.id, r);
    for (const r of newRecords) mergedMap.set(r.id, { ...r, isSample: false });
    state.chequeRecords = Array.from(mergedMap.values()).sort((a, b) =>
      (b.datePosted || '').localeCompare(a.datePosted || '')
    );

    state.importBatches.unshift(batch);
    state.importBatches = state.importBatches.slice(0, 100);

    appendServerAuditLog(state, {
      recordId: batch.id,
      recordType: 'IMPORT_BATCH',
      operation: 'IMPORT',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Imported ${newRecords.length} cheque records from "${batch.fileName}".`,
    });
    saveStore(state);
    return res.json({ ok: true, chequeRecords: getEffectiveChequeRecords(state) });
  }
);

app.post(
  '/api/data/recovery-actions',
  requireAuth,
  requirePermission(canManageRecovery, 'Log Recovery Action'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const actionInput = req.body?.action as Omit<RecoveryAction, 'id' | 'createdAt'> | undefined;
    const updatedCheque = req.body?.updatedCheque as ChequeRecord | undefined;
    if (!actionInput || !updatedCheque || !updatedCheque.id) {
      return res.status(400).json({ error: 'Invalid recovery action payload.' });
    }

    const fullAction: RecoveryAction = {
      ...actionInput,
      id: `ACT-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      officerName: actor.displayName,
      officerId: actor.uid,
      createdAt: new Date().toISOString(),
      createdBy: actor.displayName,
    };

    const state = loadStore();
    state.meta.sampleDismissed = true;
    state.recoveryActions.unshift(fullAction);

    const idx = state.chequeRecords.findIndex((c) => c.id === updatedCheque.id);
    if (idx >= 0) {
      state.chequeRecords[idx] = updatedCheque;
    } else {
      state.chequeRecords.unshift(updatedCheque);
    }

    appendServerAuditLog(state, {
      recordId: updatedCheque.id,
      recordType: 'RECOVERY_ACTION',
      operation: 'RECOVERY',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `Action [${fullAction.actionType}] logged: "${fullAction.notes}". Status=${updatedCheque.recoveryStatus}, Remaining=LKR ${updatedCheque.remainingAmount}.`,
    });
    saveStore(state);
    return res.json({ ok: true, action: fullAction, chequeRecords: getEffectiveChequeRecords(state) });
  }
);

// ============================================================
// Organization Master Admin-Only Endpoints
// ============================================================

app.post(
  '/api/data/org/adm-batch',
  requireAuth,
  requirePermission(canImportOrgMaster, 'Import ADM Master'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const adms = Array.isArray(req.body?.adms) ? (req.body.adms as AdmMasterRecord[]) : [];
    const teams = Array.isArray(req.body?.teams) ? (req.body.teams as TeamMaster[]) : [];
    const divisionHeads = Array.isArray(req.body?.divisionHeads)
      ? (req.body.divisionHeads as DivisionHeadMaster[])
      : [];
    const batch = req.body?.batch as ImportBatch | undefined;

    const state = loadStore();
    const dhByCanonicalName = new Map<string, DivisionHeadMaster>();
    const normHeadKey = (s?: string) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    for (const h of state.divisionHeads) {
      dhByCanonicalName.set(normHeadKey(h.name || h.canonicalName), h);
    }
    for (const h of divisionHeads) {
      const key = normHeadKey(h.name || h.canonicalName);
      const existing = dhByCanonicalName.get(key);
      if (existing) {
        const divMap = new Map<string, string>();
        for (const d of [...(existing.divisions || []), ...(h.divisions || [])]) {
          const clean = (d || '').trim().replace(/\s+/g, ' ');
          if (clean && !divMap.has(clean.toLowerCase())) {
            divMap.set(clean.toLowerCase(), clean);
          }
        }
        dhByCanonicalName.set(key, {
          ...existing,
          name: h.name || existing.name,
          divisions: Array.from(divMap.values()),
          verificationStatus: h.verificationStatus || existing.verificationStatus,
          verificationReason: h.verificationReason,
          updatedAt: h.updatedAt || new Date().toISOString(),
        });
      } else {
        dhByCanonicalName.set(key, h);
      }
    }
    state.divisionHeads = Array.from(dhByCanonicalName.values());

    const teamMap = new Map(state.teams.map((t) => [t.id, t]));
    for (const t of teams) teamMap.set(t.id, t);
    state.teams = Array.from(teamMap.values());

    const admMap = new Map(state.adms.map((a) => [a.id, a]));
    for (const a of adms) admMap.set(a.id, a);
    state.adms = Array.from(admMap.values());

    consolidateDivisionHeadsInState(state);

    state.meta.sampleDismissed = true;
    state.chequeRecords = state.chequeRecords.filter((r) => !r.isSample);
    if (batch) {
      state.importBatches.unshift(batch);
      state.importBatches = state.importBatches.slice(0, 100);
      appendServerAuditLog(state, {
        recordId: batch.id,
        recordType: 'ADM_MASTER',
        operation: 'IMPORT',
        actor: actor.displayName,
        actorUsername: actor.username,
        actorEmail: actor.email,
        actorRole: actor.role,
        details: `ADM Master upload "${batch.fileName}": ${adms.length} ADMs, ${teams.length} Teams, ${state.divisionHeads.length} Division Heads.`,
      });
    }
    saveStore(state);
    return res.json({ ok: true });
  }
);

app.post(
  '/api/data/org/customer-batch',
  requireAuth,
  requirePermission(canImportOrgMaster, 'Import Customer Master'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const customers = Array.isArray(req.body?.customers)
      ? (req.body.customers as CustomerMasterRecord[])
      : [];
    const batch = req.body?.batch as ImportBatch | undefined;

    const state = loadStore();
    const custMap = new Map(state.customers.map((c) => [c.id, c]));
    for (const c of customers) custMap.set(c.id, c);
    state.customers = Array.from(custMap.values());
    state.meta.sampleDismissed = true;
    state.chequeRecords = state.chequeRecords.filter((r) => !r.isSample);

    if (batch) {
      state.importBatches.unshift(batch);
      state.importBatches = state.importBatches.slice(0, 100);
      appendServerAuditLog(state, {
        recordId: batch.id,
        recordType: 'CUSTOMER_MASTER',
        operation: 'IMPORT',
        actor: actor.displayName,
        actorUsername: actor.username,
        actorEmail: actor.email,
        actorRole: actor.role,
        details: `Customer Master upload "${batch.fileName}": ${customers.length} Customer records committed.`,
      });
    }
    saveStore(state);
    return res.json({ ok: true });
  }
);

app.put(
  '/api/data/org/sync',
  requireAuth,
  requirePermission(canManageOrg, 'Modify Organization Hierarchy'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const body = req.body || {};
    const state = loadStore();

    if (Array.isArray(body.divisionHeads)) state.divisionHeads = body.divisionHeads;
    if (Array.isArray(body.teams)) state.teams = body.teams;
    if (Array.isArray(body.adms)) state.adms = body.adms;
    if (Array.isArray(body.customers)) state.customers = body.customers;
    consolidateDivisionHeadsInState(state);
    state.meta.sampleDismissed = true;
    state.chequeRecords = state.chequeRecords.filter((r) => !r.isSample);

    if (body.auditDetail) {
      appendServerAuditLog(state, {
        recordId: String(body.recordId || 'ORG_MASTER'),
        recordType: body.recordType || 'TEAM_MASTER',
        operation: body.operation || 'UPDATE',
        actor: actor.displayName,
        actorUsername: actor.username,
        actorEmail: actor.email,
        actorRole: actor.role,
        details: String(body.auditDetail),
      });
    }
    saveStore(state);
    return res.json({ ok: true });
  }
);

app.post(
  '/api/data/migrate-local',
  requireAuth,
  requirePermission(canManageSettings, 'Migrate Local Browser Data'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const body = req.body || {};
    const state = loadStore();

    let migratedCount = 0;
    if (state.chequeRecords.length === 0 && Array.isArray(body.cheques)) {
      const realCheques = (body.cheques as ChequeRecord[]).filter((c) => !c.isSample);
      if (realCheques.length > 0) {
        state.chequeRecords = realCheques;
        migratedCount += realCheques.length;
      }
    }
    if (state.divisionHeads.length === 0 && Array.isArray(body.divisionHeads) && body.divisionHeads.length > 0) {
      state.divisionHeads = body.divisionHeads;
      migratedCount += body.divisionHeads.length;
    }
    if (state.teams.length === 0 && Array.isArray(body.teams) && body.teams.length > 0) {
      state.teams = body.teams;
      migratedCount += body.teams.length;
    }
    if (state.adms.length === 0 && Array.isArray(body.adms) && body.adms.length > 0) {
      state.adms = body.adms;
      migratedCount += body.adms.length;
    }
    if (state.customers.length === 0 && Array.isArray(body.customers) && body.customers.length > 0) {
      state.customers = body.customers;
      migratedCount += body.customers.length;
    }
    if (state.recoveryActions.length === 0 && Array.isArray(body.actions) && body.actions.length > 0) {
      state.recoveryActions = body.actions;
    }
    if (state.importBatches.length === 0 && Array.isArray(body.batches) && body.batches.length > 0) {
      state.importBatches = body.batches;
    }

    if (migratedCount > 0) {
      state.meta.sampleDismissed = true;
      appendServerAuditLog(state, {
        recordId: 'SERVER_STORE',
        recordType: 'SYSTEM',
        operation: 'IMPORT',
        actor: actor.displayName,
        actorUsername: actor.username,
        actorEmail: actor.email,
        actorRole: actor.role,
        details: `Migrated ${migratedCount} existing browser production records into shared server database.`,
      });
      saveStore(state);
    }

    return res.json({ ok: true, migratedCount });
  }
);

// ============================================================
// Settings, Audit Administration, Sample Cleanup & DB Purge
// ============================================================

app.put(
  '/api/data/config',
  requireAuth,
  requirePermission(canManageSettings, 'Update Analytical Settings'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const cfg = req.body?.config as AnalyticalConfig | undefined;
    if (!cfg) return res.status(400).json({ error: 'Invalid configuration payload.' });

    const state = loadStore();
    const before = JSON.stringify(state.config);
    state.config = {
      repeatReturnThreshold: Number(cfg.repeatReturnThreshold) || 2,
      highValueThreshold: Number(cfg.highValueThreshold) || 250000,
      overdueDaysThreshold: Number(cfg.overdueDaysThreshold) || 7,
      currency: 'LKR',
    };
    appendServerAuditLog(state, {
      recordId: 'analytics',
      recordType: 'CONFIG',
      operation: 'CONFIG_CHANGE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: 'Updated system analytical thresholds.',
      beforeValue: before,
      afterValue: JSON.stringify(state.config),
    });
    saveStore(state);
    return res.json({ ok: true, config: state.config });
  }
);

app.post(
  '/api/data/reset',
  requireAuth,
  requirePermission(canManageSettings, 'Reset Dataset'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const loadSample = Boolean(req.body?.loadSample);
    const state = loadStore();
    state.chequeRecords = loadSample ? [...SAMPLE_CHEQUE_RECORDS] : [];
    state.meta.sampleDismissed = !loadSample;
    appendServerAuditLog(state, {
      recordId: 'DATASET',
      recordType: 'SYSTEM',
      operation: 'CONFIG_CHANGE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: loadSample
        ? 'Reloaded verified sample dataset (10 records).'
        : 'Reset active cheque register to empty production state.',
    });
    saveStore(state);
    return res.json({ ok: true, chequeRecords: getEffectiveChequeRecords(state) });
  }
);

app.delete(
  '/api/data/sample',
  requireAuth,
  requirePermission(canImportCheques, 'Clear Sample Dataset'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const state = loadStore();
    state.chequeRecords = state.chequeRecords.filter((r) => !r.isSample);
    state.meta.sampleDismissed = true;
    appendServerAuditLog(state, {
      recordId: 'SAMPLE_DATA',
      recordType: 'SYSTEM',
      operation: 'DELETE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: 'Cleared sample records from register.',
    });
    saveStore(state);
    return res.json({ ok: true, chequeRecords: getEffectiveChequeRecords(state) });
  }
);

app.post(
  '/api/data/purge',
  requireAuth,
  requirePermission(canManageSettings, 'Database Purge'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const opts = req.body || {};
    const state = loadStore();

    const deletedCheques = opts.clearCheques ? state.chequeRecords.length : 0;
    const deletedActions = opts.clearActions ? state.recoveryActions.length : 0;
    const deletedBatches = opts.clearBatches ? state.importBatches.length : 0;
    const deletedOrgMaster = opts.clearOrgMaster
      ? state.divisionHeads.length + state.teams.length + state.adms.length + state.customers.length
      : 0;
    const deletedAuditLogs = opts.clearAuditLogs ? state.auditLogs.length : 0;

    if (opts.clearCheques) {
      state.chequeRecords = [];
      state.meta.sampleDismissed = true;
    }
    if (opts.clearActions) state.recoveryActions = [];
    if (opts.clearBatches) state.importBatches = [];
    if (opts.clearOrgMaster) {
      state.divisionHeads = [];
      state.teams = [];
      state.adms = [];
      state.customers = [];
    }
    if (opts.clearAuditLogs) state.auditLogs = [];

    appendServerAuditLog(state, {
      recordId: 'DATABASE_PURGE',
      recordType: 'SYSTEM',
      operation: 'DELETE',
      actor: actor.displayName,
      actorUsername: actor.username,
      actorEmail: actor.email,
      actorRole: actor.role,
      details: `System Administrator purged selected collections (cheques=${deletedCheques}, actions=${deletedActions}, batches=${deletedBatches}, orgMaster=${deletedOrgMaster}, auditLogs=${deletedAuditLogs}).`,
    });
    saveStore(state);

    return res.json({
      deletedCheques,
      deletedActions,
      deletedBatches,
      deletedOrgMaster,
      deletedAuditLogs,
    });
  }
);

app.get(
  '/api/audit-logs',
  requireAuth,
  requirePermission(canViewAuditAdmin, 'Audit Administration'),
  (req, res) => {
    const state = loadStore();
    const usernameFilter =
      typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : '';
    const logs = usernameFilter
      ? state.auditLogs.filter(
          (l) =>
            (l.actorUsername || '').toLowerCase() === usernameFilter ||
            (l.recordId || '').toLowerCase() === usernameFilter
        )
      : state.auditLogs;
    return res.json({ logs: logs.slice(0, 500) });
  }
);

app.post('/api/audit/log', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const body = req.body || {};
  const operation = String(body.operation || 'UPDATE');
  const recordType = String(body.recordType || 'SYSTEM');
  const recordId = String(body.recordId || 'SYSTEM');
  const details = String(body.details || '');

  const state = loadStore();
  const entry = appendServerAuditLog(state, {
    recordId,
    recordType: recordType as AuditLog['recordType'],
    operation: operation as AuditLog['operation'],
    actor: actor.displayName,
    actorUsername: actor.username,
    actorEmail: actor.email,
    actorRole: actor.role,
    details,
  });
  saveStore(state);
  return res.json({ ok: true, log: entry });
});

app.get('/api/import-batches', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (!canImportCheques(actor.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const state = loadStore();
  const batches =
    actor.role === 'SYSTEM_ADMIN'
      ? state.importBatches
      : state.importBatches.filter((b) => !b.importType || b.importType === 'CHEQUE_REGISTER');
  return res.json({ batches });
});

// ============================================================
// Protected AI-Generated Management Insights Endpoint
// ============================================================

app.post('/api/ai-insights', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        available: false,
        reason: 'GEMINI_API_KEY not configured in environment. Using deterministic rule engine.',
        insights: [],
      });
    }

    const { summaryData } = req.body;
    if (!summaryData) {
      return res.status(400).json({ error: 'Missing summaryData payload' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an elite Senior Financial Risk & Recovery Analytics Director for WÜRTH Lanka.
Analyze the following aggregated returned-cheque metrics and identified anomalies for the current reporting period.

CRITICAL INSTRUCTIONS:
1. Ground your analysis STRICTLY in the provided numbers. NEVER hallucinate, invent, or estimate any financial figures, dates, or recovery outcomes.
2. Clearly distinguish between "Total Recorded Returned-Cheque Value" and "Verified Unrecovered Exposure".
3. Return exactly 3 to 4 high-impact, operational management findings formatted strictly as a JSON array of objects.

Data Summary:
${JSON.stringify(summaryData, null, 2)}

Output format must be valid JSON matching this schema:
[
  {
    "finding": "Short title describing the verified pattern detected",
    "evidence": "Exact figures, counts, percentages, and dates supporting this finding",
    "businessImpact": "Operational and financial consequence, distinguishing total returned value vs unrecovered exposure",
    "recommendedAction": "Concrete, practical recovery or credit-control intervention",
    "successMeasure": "Specific metric that must improve if this action works",
    "limitations": "Data boundaries, missing sales/portfolio denominators, or caveats"
  }
]
Return ONLY the raw JSON array without markdown code blocks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim() || '[]';
    const cleanedJson = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    const insights = JSON.parse(cleanedJson);

    return res.json({
      available: true,
      insights: Array.isArray(insights) ? insights : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in /api/ai-insights:', err);
    return res.status(200).json({
      available: false,
      reason: message || 'AI generation encountered an issue. Falling back to rule-based engine.',
      insights: [],
    });
  }
});

// ============================================================
// Vite Middleware for Dev / Static Files for Prod
// ============================================================

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WÜRTH Recovery Intelligence server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
