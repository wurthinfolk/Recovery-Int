/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Firebase SDK and Firestore Data Access Service
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  DocumentReference,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ChequeRecord,
  RecoveryAction,
  AuditLog,
  ImportBatch,
  AnalyticalConfig,
  UserProfile,
  AdmMasterRecord,
  CustomerMasterRecord,
  TeamMaster,
  DivisionHeadMaster,
  EmployeeStatus,
} from '../types';
import { SAMPLE_CHEQUE_RECORDS } from '../data/sampleRecords';
import { DEFAULT_CONFIG } from './analytics';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
const firestoreDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);

/**
 * Strip undefined values recursively before writing to Cloud Firestore
 */
function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

const FIRESTORE_BATCH_CHUNK_SIZE = 400;

async function commitFirestoreSetOps(
  ops: Array<{ ref: DocumentReference; data: unknown; merge?: boolean }>
): Promise<void> {
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + FIRESTORE_BATCH_CHUNK_SIZE);
    const wb = writeBatch(db);
    for (const op of chunk) {
      const cleaned = cleanForFirestore(op.data);
      if (op.merge) {
        wb.set(op.ref, cleaned as Record<string, unknown>, { merge: true });
      } else {
        wb.set(op.ref, cleaned as Record<string, unknown>);
      }
    }
    await wb.commit();
  }
}

function sanitizeBatchForStorage(batch: ImportBatch): ImportBatch {
  const MAX_ERRORS = 150;
  if (!batch.errors || batch.errors.length <= MAX_ERRORS) return batch;
  const remaining = batch.errors.length - MAX_ERRORS;
  return {
    ...batch,
    errors: [
      ...batch.errors.slice(0, MAX_ERRORS),
      `... and ${remaining} additional validation notices (download the Excel validation report for the complete list).`,
    ],
  };
}

function appendBatchToLocalCache(batch: ImportBatch): void {
  try {
    const rawBatches = localStorage.getItem(CACHE_BATCHES_KEY);
    const batches: ImportBatch[] = rawBatches ? JSON.parse(rawBatches) : [];
    const trimmed = [sanitizeBatchForStorage(batch), ...batches].slice(0, 50);
    localStorage.setItem(CACHE_BATCHES_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Local batch history cache skipped (storage limit):', e);
  }
}

// ============================================================
// Resilient Local Cache (In-Memory + IndexedDB + Non-Blocking localStorage)
// Avoids 5MB localStorage QuotaExceededError dropping large Customer Master sets
// ============================================================

const memoryListCache = new Map<string, unknown[]>();
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

async function idbSetList<T>(key: string, items: T[]): Promise<void> {
  const idb = await openPersistentDb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(items, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDeleteKey(key: string): Promise<void> {
  const idb = await openPersistentDb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function readLocalStorageSync<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

async function readPersistentList<T>(key: string): Promise<T[]> {
  const mem = memoryListCache.get(key);
  if (Array.isArray(mem)) return [...(mem as T[])];

  const fromIdb = await idbGetList<T>(key);
  if (fromIdb !== null) {
    memoryListCache.set(key, fromIdb);
    return [...fromIdb];
  }

  const fromLs = readLocalStorageSync<T>(key);
  if (fromLs !== null) {
    memoryListCache.set(key, fromLs);
    return [...fromLs];
  }

  return [];
}

async function writePersistentList<T>(key: string, items: T[]): Promise<void> {
  memoryListCache.set(key, items);
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    // Do not fail when >5MB localStorage quota is exceeded; IndexedDB + memory hold full dataset
    console.warn(`localStorage write skipped for ${key}:`, e);
  }
  await idbSetList(key, items);
}

async function clearPersistentKey(key: string, emptyValue?: unknown[]): Promise<void> {
  if (emptyValue) {
    memoryListCache.set(key, emptyValue);
    try {
      localStorage.setItem(key, JSON.stringify(emptyValue));
    } catch {
      // ignore
    }
    await idbSetList(key, emptyValue);
  } else {
    memoryListCache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    await idbDeleteKey(key);
  }
}

async function upsertPersistentItem<T extends { id: string }>(key: string, item: T): Promise<T[]> {
  const list = await readPersistentList<T>(key);
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await writePersistentList(key, list);
  return list;
}

/**
 * Validate connection to Firestore as commanded in skill guidelines
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or initializing.');
    }
    return false;
  }
}

// Local cache keys for instant response and offline continuity
const CACHE_CHEQUES_KEY = 'wurth_cheques_v1';
const CACHE_ACTIONS_KEY = 'wurth_actions_v1';
const CACHE_AUDIT_KEY = 'wurth_audit_v1';
const CACHE_BATCHES_KEY = 'wurth_batches_v1';
const CACHE_CONFIG_KEY = 'wurth_config_v1';
const CACHE_DIVISION_HEADS_KEY = 'wurth_division_heads_v1';
const CACHE_TEAMS_KEY = 'wurth_teams_v1';
const CACHE_ADMS_KEY = 'wurth_adms_v1';
const CACHE_CUSTOMERS_KEY = 'wurth_customers_v1';

export const DEMO_USERS: UserProfile[] = [
  {
    uid: 'officer-nuwan',
    email: 'n.wijesinghe@wurth.lk',
    displayName: 'Nuwan Wijesinghe',
    role: 'RECOVERY_OFFICER',
    department: 'Recovery & Legal',
  },
  {
    uid: 'supervisor-anura',
    email: 'a.senanayake@wurth.lk',
    displayName: 'Anura Senanayake (Supervisor)',
    role: 'RECOVERY_SUPERVISOR',
    department: 'Credit Control & Recovery',
  },
  {
    uid: 'mgmt-chandra',
    email: 'c.perera@wurth.lk',
    displayName: 'Chandana Perera (Finance Director)',
    role: 'MANAGEMENT_VIEWER',
    department: 'Executive Management',
  },
  {
    uid: 'admin-wurth',
    email: 'wurthinfolk@gmail.com',
    displayName: 'WÜRTH System Admin',
    role: 'SYSTEM_ADMIN',
    department: 'IT & Risk Governance',
  },
];

/**
 * Audit log recording function (append-only)
 */
export async function recordAuditLog(
  log: Omit<AuditLog, 'id' | 'timestamp'>
): Promise<void> {
  const newLog: AuditLog = {
    ...log,
    id: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  // 1. Save to local cache
  try {
    const raw = localStorage.getItem(CACHE_AUDIT_KEY);
    const existing: AuditLog[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(CACHE_AUDIT_KEY, JSON.stringify([newLog, ...existing].slice(0, 500)));
  } catch (e) {
    console.error('Audit cache error:', e);
  }

  // 2. Persist to Firestore if authenticated
  if (auth.currentUser) {
    const path = `audit_logs/${newLog.id}`;
    try {
      await setDoc(doc(db, 'audit_logs', newLog.id), cleanForFirestore(newLog));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

/**
 * Load all audit logs
 */
export async function getAuditLogs(): Promise<AuditLog[]> {
  const path = 'audit_logs';
  try {
    if (auth.currentUser) {
      const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as AuditLog);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }

  // Fallback to local storage
  const raw = localStorage.getItem(CACHE_AUDIT_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Load Cheque Records
 */
export async function getChequeRecords(): Promise<ChequeRecord[]> {
  const path = 'cheque_records';
  try {
    if (auth.currentUser) {
      const snap = await getDocs(collection(db, path));
      if (!snap.empty) {
        const remoteRecords = snap.docs.map((d) => d.data() as ChequeRecord);
        await writePersistentList(CACHE_CHEQUES_KEY, remoteRecords);
        return remoteRecords;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }

  const mem = memoryListCache.get(CACHE_CHEQUES_KEY);
  if (Array.isArray(mem)) return [...(mem as ChequeRecord[])];

  const fromIdb = await idbGetList<ChequeRecord>(CACHE_CHEQUES_KEY);
  if (fromIdb !== null) {
    memoryListCache.set(CACHE_CHEQUES_KEY, fromIdb);
    return [...fromIdb];
  }

  const fromLs = readLocalStorageSync<ChequeRecord>(CACHE_CHEQUES_KEY);
  if (fromLs !== null) {
    memoryListCache.set(CACHE_CHEQUES_KEY, fromLs);
    return [...fromLs];
  }

  // Default to the 10 official sample records only on very first launch
  await writePersistentList(CACHE_CHEQUES_KEY, SAMPLE_CHEQUE_RECORDS);
  return SAMPLE_CHEQUE_RECORDS;
}

/**
 * Save single cheque record
 */
export async function saveChequeRecord(
  record: ChequeRecord,
  currentUser: UserProfile,
  isEdit = false
): Promise<void> {
  const path = `cheque_records/${record.id}`;

  // Update resilient local store (In-Memory + IndexedDB + non-blocking localStorage)
  try {
    await upsertPersistentItem(CACHE_CHEQUES_KEY, record);
  } catch (e) {
    console.error('Local cache error', e);
  }

  // Firestore update if connected
  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'cheque_records', record.id), cleanForFirestore(record), { merge: true });
    } catch (err) {
      handleFirestoreError(err, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  }

  // Record audit log
  await recordAuditLog({
    recordId: record.id,
    recordType: 'CHEQUE_RECORD',
    operation: isEdit ? 'UPDATE' : 'CREATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `${isEdit ? 'Updated' : 'Registered'} cheque #${record.description} for ${record.cxName} (${record.cxNumber}) - LKR ${record.amount}`,
    afterValue: JSON.stringify({
      amount: record.amount,
      status: record.recoveryStatus,
      cx: record.cxNumber,
      officer: record.assignedOfficer,
    }),
  });
}

/**
 * Batch save imported cheque records
 */
export async function saveBatchChequeRecords(
  records: ChequeRecord[],
  batch: ImportBatch,
  currentUser: UserProfile
): Promise<void> {
  const safeBatch = sanitizeBatchForStorage(batch);

  // Update resilient local store (In-Memory + IndexedDB + non-blocking localStorage)
  try {
    const existing = await readPersistentList<ChequeRecord>(CACHE_CHEQUES_KEY);
    const mergedMap = new Map<string, ChequeRecord>();

    for (const r of existing) mergedMap.set(r.id, r);
    for (const r of records) mergedMap.set(r.id, r);

    const mergedList = Array.from(mergedMap.values());
    await writePersistentList(CACHE_CHEQUES_KEY, mergedList);
    appendBatchToLocalCache(safeBatch);
  } catch (e) {
    console.error('Local cache batch save error', e);
  }

  // Firestore chunked batch writes
  if (auth.currentUser) {
    try {
      const ops: Array<{ ref: DocumentReference; data: unknown; merge?: boolean }> = [
        { ref: doc(db, 'import_batches', safeBatch.id), data: safeBatch },
        ...records.map((r) => ({
          ref: doc(db, 'cheque_records', r.id),
          data: r,
          merge: true,
        })),
      ];
      await commitFirestoreSetOps(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'cheque_records/batch');
      throw err instanceof Error
        ? err
        : new Error('Failed to save cheque records to Cloud Firestore.');
    }
  }

  // Record audit log
  await recordAuditLog({
    recordId: safeBatch.id,
    recordType: 'IMPORT_BATCH',
    operation: 'IMPORT',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `Imported batch "${safeBatch.fileName}": ${safeBatch.importedCount} records added, ${safeBatch.duplicateCount} duplicates flagged, ${safeBatch.errorCount} errors, total value LKR ${safeBatch.totalAmount}.`,
  });
}

/**
 * Add recovery action to a cheque case
 */
export async function addRecoveryAction(
  action: Omit<RecoveryAction, 'id' | 'createdAt'>,
  updatedCheque: ChequeRecord,
  currentUser: UserProfile
): Promise<RecoveryAction> {
  const newAction: RecoveryAction = {
    ...action,
    id: `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  // Resilient local cache
  try {
    await upsertPersistentItem(CACHE_ACTIONS_KEY, newAction);
  } catch (e) {
    console.error('Action cache error', e);
  }

  // Update cheque record
  await saveChequeRecord(updatedCheque, currentUser, true);

  // Firestore write
  if (auth.currentUser) {
    const path = `recovery_actions/${newAction.id}`;
    try {
      await setDoc(doc(db, 'recovery_actions', newAction.id), cleanForFirestore(newAction));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  // Audit
  await recordAuditLog({
    recordId: updatedCheque.id,
    recordType: 'RECOVERY_ACTION',
    operation: 'RECOVERY',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `Action [${newAction.actionType}] recorded on #${updatedCheque.description}. Notes: "${newAction.notes}". New status: ${updatedCheque.recoveryStatus}. Remaining: LKR ${updatedCheque.remainingAmount}`,
  });

  return newAction;
}

/**
 * Get recovery actions for a specific cheque or all cheques
 */
export async function getRecoveryActions(chequeId?: string): Promise<RecoveryAction[]> {
  let actions: RecoveryAction[] = [];
  const path = 'recovery_actions';

  try {
    if (auth.currentUser) {
      const snap = await getDocs(collection(db, path));
      if (!snap.empty) {
        actions = snap.docs.map((d) => d.data() as RecoveryAction);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }

  if (actions.length === 0) {
    actions = await readPersistentList<RecoveryAction>(CACHE_ACTIONS_KEY);
  }

  if (chequeId) {
    return actions.filter((a) => a.chequeId === chequeId);
  }
  return actions;
}

/**
 * Get Import Batches History
 */
export async function getImportBatches(): Promise<ImportBatch[]> {
  const path = 'import_batches';
  try {
    if (auth.currentUser) {
      const snap = await getDocs(collection(db, path));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as ImportBatch);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }

  const raw = localStorage.getItem(CACHE_BATCHES_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Get or Save System Config
 */
export async function getAnalyticalConfig(): Promise<AnalyticalConfig> {
  const path = 'config/analytics';
  try {
    if (auth.currentUser) {
      const snap = await getDocs(collection(db, 'config'));
      const found = snap.docs.find((d) => d.id === 'analytics');
      if (found) return found.data() as AnalyticalConfig;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  const raw = localStorage.getItem(CACHE_CONFIG_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_CONFIG;
}

export async function saveAnalyticalConfig(
  config: AnalyticalConfig,
  currentUser: UserProfile
): Promise<void> {
  const path = 'config/analytics';
  localStorage.setItem(CACHE_CONFIG_KEY, JSON.stringify(config));

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'config', 'analytics'), config);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  await recordAuditLog({
    recordId: 'analytics',
    recordType: 'CONFIG',
    operation: 'CONFIG_CHANGE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `Updated analytical configuration thresholds: Repeat >= ${config.repeatReturnThreshold}, High Value >= LKR ${config.highValueThreshold}, Overdue >= ${config.overdueDaysThreshold} days.`,
  });
}

/**
 * Clear dataset to empty state or reload sample dataset
 */
export async function resetDataset(loadSample = false, currentUser: UserProfile): Promise<ChequeRecord[]> {
  const initial = loadSample ? SAMPLE_CHEQUE_RECORDS : [];
  await writePersistentList(CACHE_CHEQUES_KEY, initial);

  if (loadSample && auth.currentUser) {
    try {
      for (const r of initial) {
        await setDoc(doc(db, 'cheque_records', r.id), cleanForFirestore(r), { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'cheque_records/sample');
    }
  }

  await recordAuditLog({
    recordId: 'dataset-reset',
    recordType: 'CHEQUE_RECORD',
    operation: 'UPDATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: loadSample
      ? 'Loaded 10 official sample records into active register.'
      : 'Reset active cheque register to empty state.',
  });

  return initial;
}

export async function hasRemoteChequeRecords(): Promise<boolean> {
  if (!auth.currentUser) return false;
  try {
    const q = query(collection(db, 'cheque_records'), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'cheque_records');
    return false;
  }
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

/**
 * High-Security System Administrator Database Purge
 * Clears Cloud Firestore collections and local persistence stores
 */
export async function clearEntireDatabase(
  currentUser: UserProfile,
  options: ClearDatabaseOptions
): Promise<ClearDatabaseResult> {
  if (currentUser.role !== 'SYSTEM_ADMIN') {
    throw new Error('Unauthorized: Only System Administrators can clear the database.');
  }

  const result: ClearDatabaseResult = {
    deletedCheques: 0,
    deletedActions: 0,
    deletedBatches: 0,
    deletedAuditLogs: 0,
    deletedOrgMaster: 0,
  };

  // 1. Delete Cheque Records
  if (options.clearCheques) {
    await clearPersistentKey(CACHE_CHEQUES_KEY, []);
    if (auth.currentUser) {
      try {
        const snap = await getDocs(collection(db, 'cheque_records'));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          result.deletedCheques++;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'cheque_records');
      }
    }
  }

  // 2. Delete Recovery Actions
  if (options.clearActions) {
    await clearPersistentKey(CACHE_ACTIONS_KEY);
    if (auth.currentUser) {
      try {
        const snap = await getDocs(collection(db, 'recovery_actions'));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          result.deletedActions++;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'recovery_actions');
      }
    }
  }

  // 3. Delete Import Batches
  if (options.clearBatches) {
    await clearPersistentKey(CACHE_BATCHES_KEY);
    if (auth.currentUser) {
      try {
        const snap = await getDocs(collection(db, 'import_batches'));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          result.deletedBatches++;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'import_batches');
      }
    }
  }

  // 4. Delete Organization Master Records (if selected)
  if (options.clearOrgMaster) {
    await clearPersistentKey(CACHE_DIVISION_HEADS_KEY, []);
    await clearPersistentKey(CACHE_TEAMS_KEY, []);
    await clearPersistentKey(CACHE_ADMS_KEY, []);
    await clearPersistentKey(CACHE_CUSTOMERS_KEY, []);
    if (auth.currentUser) {
      for (const colName of ['division_head_master', 'team_master', 'adm_master', 'customer_master']) {
        try {
          const snap = await getDocs(collection(db, colName));
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
            result.deletedOrgMaster = (result.deletedOrgMaster || 0) + 1;
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, colName);
        }
      }
    }
  }

  // 5. Delete Audit Logs
  if (options.clearAuditLogs) {
    localStorage.removeItem(CACHE_AUDIT_KEY);
    if (auth.currentUser) {
      try {
        const snap = await getDocs(collection(db, 'audit_logs'));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          result.deletedAuditLogs++;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'audit_logs');
      }
    }
  }

  // Record an audit log for the purge event
  await recordAuditLog({
    recordId: 'db-purge',
    recordType: 'CHEQUE_RECORD',
    operation: 'CONFIG_CHANGE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `ADMIN DATABASE PURGE EXECUTED by ${currentUser.displayName}. Options: Cheques=${options.clearCheques}, Actions=${options.clearActions}, Batches=${options.clearBatches}, OrgMaster=${!!options.clearOrgMaster}, AuditLogs=${options.clearAuditLogs}. Total items deleted: Cheques=${result.deletedCheques}, Actions=${result.deletedActions}, Batches=${result.deletedBatches}, OrgMaster=${result.deletedOrgMaster || 0}, Logs=${result.deletedAuditLogs}`,
  });

  return result;
}

// ============================================================
// Organization Master Persistence (Division Heads, Teams, ADMs, Customers)
// ============================================================

async function loadMasterCollection<T>(collectionName: string, cacheKey: string): Promise<T[]> {
  try {
    if (auth.currentUser) {
      const snap = await getDocs(collection(db, collectionName));
      if (!snap.empty) {
        const rows = snap.docs.map((d) => d.data() as T);
        await writePersistentList(cacheKey, rows);
        return rows;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionName);
  }

  return readPersistentList<T>(cacheKey);
}

export async function getDivisionHeadMasterRecords(): Promise<DivisionHeadMaster[]> {
  return loadMasterCollection<DivisionHeadMaster>('division_head_master', CACHE_DIVISION_HEADS_KEY);
}

export async function getTeamMasterRecords(): Promise<TeamMaster[]> {
  return loadMasterCollection<TeamMaster>('team_master', CACHE_TEAMS_KEY);
}

export async function getAdmMasterRecords(): Promise<AdmMasterRecord[]> {
  return loadMasterCollection<AdmMasterRecord>('adm_master', CACHE_ADMS_KEY);
}

export async function getCustomerMasterRecords(): Promise<CustomerMasterRecord[]> {
  return loadMasterCollection<CustomerMasterRecord>('customer_master', CACHE_CUSTOMERS_KEY);
}

export async function saveAdmMasterBatch(
  admsToUpsert: AdmMasterRecord[],
  teamsToUpsert: TeamMaster[],
  divisionHeadsToUpsert: DivisionHeadMaster[],
  batch: ImportBatch,
  currentUser: UserProfile
): Promise<void> {
  const safeBatch = sanitizeBatchForStorage(batch);

  const upsertCache = async <T extends { id: string }>(key: string, items: T[]) => {
    const existing = await readPersistentList<T>(key);
    const map = new Map<string, T>();
    for (const item of existing) map.set(item.id, item);
    for (const item of items) map.set(item.id, item);
    await writePersistentList(key, Array.from(map.values()));
  };

  try {
    await upsertCache(CACHE_DIVISION_HEADS_KEY, divisionHeadsToUpsert);
    await upsertCache(CACHE_TEAMS_KEY, teamsToUpsert);
    await upsertCache(CACHE_ADMS_KEY, admsToUpsert);
    appendBatchToLocalCache(safeBatch);
  } catch (e) {
    console.error('Local ADM master batch cache error:', e);
  }

  // 2. Persist to Cloud Firestore using chunked writeBatch commits
  if (auth.currentUser) {
    try {
      const ops: Array<{ ref: DocumentReference; data: unknown; merge?: boolean }> = [
        { ref: doc(db, 'import_batches', safeBatch.id), data: safeBatch },
        ...divisionHeadsToUpsert.map((dh) => ({
          ref: doc(db, 'division_head_master', dh.id),
          data: dh,
          merge: true,
        })),
        ...teamsToUpsert.map((t) => ({
          ref: doc(db, 'team_master', t.id),
          data: t,
          merge: true,
        })),
        ...admsToUpsert.map((adm) => ({
          ref: doc(db, 'adm_master', adm.id),
          data: adm,
          merge: true,
        })),
      ];
      await commitFirestoreSetOps(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'adm_master/batch');
      throw err instanceof Error
        ? err
        : new Error('Failed to persist ADM Master batch to Cloud Firestore.');
    }
  }

  // 3. Record audit log
  await recordAuditLog({
    recordId: safeBatch.id,
    recordType: 'ADM_MASTER',
    operation: 'IMPORT',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `ADM Master bulk upload "${safeBatch.fileName}": ${safeBatch.importedCount} new, ${safeBatch.updatedCount || 0} updated, ${safeBatch.duplicateCount} duplicates, ${safeBatch.errorCount} invalid, ${safeBatch.reviewRequiredCount || 0} review-flagged. Created/mapped ${teamsToUpsert.length} teams and ${divisionHeadsToUpsert.length} division heads.`,
  });
}

export async function saveCustomerMasterBatch(
  customersToUpsert: CustomerMasterRecord[],
  batch: ImportBatch,
  currentUser: UserProfile
): Promise<void> {
  const safeBatch = sanitizeBatchForStorage(batch);

  try {
    const existing = await readPersistentList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY);
    const map = new Map<string, CustomerMasterRecord>();
    for (const item of existing) map.set(item.id, item);
    for (const item of customersToUpsert) map.set(item.id, item);
    await writePersistentList(CACHE_CUSTOMERS_KEY, Array.from(map.values()));
    appendBatchToLocalCache(safeBatch);
  } catch (e) {
    console.error('Local customer master batch cache error:', e);
  }

  if (auth.currentUser) {
    try {
      const ops: Array<{ ref: DocumentReference; data: unknown; merge?: boolean }> = [
        { ref: doc(db, 'import_batches', safeBatch.id), data: safeBatch },
        ...customersToUpsert.map((cust) => ({
          ref: doc(db, 'customer_master', cust.id),
          data: cust,
          merge: true,
        })),
      ];
      await commitFirestoreSetOps(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'customer_master/batch');
      throw err instanceof Error
        ? err
        : new Error('Failed to persist Customer Master batch to Cloud Firestore.');
    }
  }

  await recordAuditLog({
    recordId: safeBatch.id,
    recordType: 'CUSTOMER_MASTER',
    operation: 'IMPORT',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `Customer Master bulk upload "${safeBatch.fileName}": ${safeBatch.importedCount} new, ${safeBatch.updatedCount || 0} updated, ${safeBatch.duplicateCount} duplicates, ${safeBatch.errorCount} invalid, ${safeBatch.unmappedCount || 0} unmapped ADM relationships, ${safeBatch.reviewRequiredCount || 0} manual review warnings.`,
  });
}

export async function mapCustomerToAdmMaster(
  customer: CustomerMasterRecord,
  adm: AdmMasterRecord,
  currentUser: UserProfile
): Promise<CustomerMasterRecord> {
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

  try {
    await upsertPersistentItem(CACHE_CUSTOMERS_KEY, updated);
  } catch (e) {
    console.error('Cache map customer error:', e);
  }

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'customer_master', updated.id), cleanForFirestore(updated), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `customer_master/${updated.id}`);
    }
  }

  await recordAuditLog({
    recordId: updated.id,
    recordType: 'CUSTOMER_MASTER',
    operation: 'ASSIGNMENT',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `Mapped Customer ${updated.customerId} (${updated.customerName}) to ADM# ${adm.admNumber} (${adm.salesRepName}, Team: ${adm.teamName}, Division: ${adm.division}).`,
  });

  return updated;
}

// ============================================================
// Manual Organization Master CRUD (Division Head, Team, ADM, Customer)
// ============================================================

function normOrgDisplay(val: string): string {
  return String(val || '').trim().replace(/\s+/g, ' ');
}

function normOrgKey(val: string): string {
  return normOrgDisplay(val).toLowerCase();
}

async function readLocalCacheList<T>(key: string): Promise<T[]> {
  return readPersistentList<T>(key);
}

async function upsertLocalCacheItem<T extends { id: string }>(key: string, item: T): Promise<T[]> {
  return upsertPersistentItem<T>(key, item);
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
  if (currentUser.role !== 'RECOVERY_SUPERVISOR' && currentUser.role !== 'SYSTEM_ADMIN') {
    throw new Error('Unauthorized: Only Recovery Supervisors or System Admins can modify Division Heads.');
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

  const existingHeads = await readLocalCacheList<DivisionHeadMaster>(CACHE_DIVISION_HEADS_KEY);
  const existing = input.id ? existingHeads.find((h) => h.id === input.id) : undefined;
  const canonicalName = normOrgKey(name);

  // Check duplicate canonicalName within the same division across other Division Head records
  for (const other of existingHeads) {
    if (other.id === existing?.id) continue;
    if (normOrgKey(other.name) === canonicalName) {
      const overlap = other.divisions.some((d) =>
        cleanedDivisions.some((cd) => normOrgKey(cd) === normOrgKey(d))
      );
      if (overlap) {
        throw new Error(`Division Head "${name}" already exists for that Division.`);
      }
    }
  }

  const sameNameDifferentDiv = existingHeads.some(
    (other) => other.id !== existing?.id && normOrgKey(other.name) === canonicalName
  );
  const verificationStatus =
    input.verificationStatus || (sameNameDifferentDiv ? 'NEEDS_VERIFICATION' : 'VERIFIED');
  const verificationReason =
    verificationStatus === 'NEEDS_VERIFICATION'
      ? normOrgDisplay(input.verificationReason || '') ||
        `Name "${name}" also appears under another division — verify whether same individual.`
      : undefined;

  const now = new Date().toISOString();
  const saved: DivisionHeadMaster = {
    id: existing?.id || `DH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    canonicalName,
    divisions: cleanedDivisions,
    verificationStatus,
    verificationReason,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await upsertLocalCacheItem(CACHE_DIVISION_HEADS_KEY, saved);

  // Cascade name / verification updates to Teams, ADMs, and Customers referencing this Division Head
  const teams = await readLocalCacheList<TeamMaster>(CACHE_TEAMS_KEY);
  const updatedTeams: TeamMaster[] = [];
  for (const t of teams) {
    if (t.divisionHeadId === saved.id && t.divisionHeadName !== saved.name) {
      const nextTeam: TeamMaster = { ...t, divisionHeadName: saved.name, updatedAt: now };
      await upsertLocalCacheItem(CACHE_TEAMS_KEY, nextTeam);
      updatedTeams.push(nextTeam);
    }
  }

  const adms = await readLocalCacheList<AdmMasterRecord>(CACHE_ADMS_KEY);
  const updatedAdms: AdmMasterRecord[] = [];
  for (const a of adms) {
    if (a.divisionHeadId === saved.id && a.divisionHeadName !== saved.name) {
      const nextAdm: AdmMasterRecord = {
        ...a,
        divisionHeadName: saved.name,
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
      await upsertLocalCacheItem(CACHE_ADMS_KEY, nextAdm);
      updatedAdms.push(nextAdm);
    }
  }

  const customers = await readLocalCacheList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY);
  const updatedCustomers: CustomerMasterRecord[] = [];
  for (const c of customers) {
    if (c.divisionHeadId === saved.id && c.divisionHead !== saved.name) {
      const nextCust: CustomerMasterRecord = {
        ...c,
        divisionHead: saved.name,
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
      await upsertLocalCacheItem(CACHE_CUSTOMERS_KEY, nextCust);
      updatedCustomers.push(nextCust);
    }
  }

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'division_head_master', saved.id), cleanForFirestore(saved), { merge: true });
      for (const t of updatedTeams) {
        await setDoc(doc(db, 'team_master', t.id), cleanForFirestore(t), { merge: true });
      }
      for (const a of updatedAdms) {
        await setDoc(doc(db, 'adm_master', a.id), cleanForFirestore(a), { merge: true });
      }
      for (const c of updatedCustomers) {
        await setDoc(doc(db, 'customer_master', c.id), cleanForFirestore(c), { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `division_head_master/${saved.id}`);
      throw err instanceof Error ? err : new Error('Failed to save Division Head to Cloud Firestore.');
    }
  }

  await recordAuditLog({
    recordId: saved.id,
    recordType: 'DIVISION_HEAD_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `${existing ? 'Updated' : 'Created'} Division Head "${saved.name}" (Divisions: ${saved.divisions.join(', ')}; Cascaded to ${updatedTeams.length} teams, ${updatedAdms.length} ADMs, ${updatedCustomers.length} customers).`,
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
  if (currentUser.role !== 'RECOVERY_SUPERVISOR' && currentUser.role !== 'SYSTEM_ADMIN') {
    throw new Error('Unauthorized: Only Recovery Supervisors or System Admins can modify Teams.');
  }

  const teamName = normOrgDisplay(input.teamName);
  const division = normOrgDisplay(input.division);
  if (!teamName) throw new Error('Team Name is required.');
  if (!division) throw new Error('Division Name is required.');
  if (!input.divisionHeadId) throw new Error('Division Head selection is required.');

  const heads = await readLocalCacheList<DivisionHeadMaster>(CACHE_DIVISION_HEADS_KEY);
  const head = heads.find((h) => h.id === input.divisionHeadId);
  if (!head) throw new Error('Selected Division Head record was not found.');

  const canonicalKey = `${normOrgKey(division)}::${normOrgKey(teamName)}`;
  const existingTeams = await readLocalCacheList<TeamMaster>(CACHE_TEAMS_KEY);
  const existing = input.id ? existingTeams.find((t) => t.id === input.id) : undefined;

  const collision = existingTeams.find(
    (t) => t.id !== existing?.id && (t.canonicalKey || `${normOrgKey(t.division)}::${normOrgKey(t.teamName)}`) === canonicalKey
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

  await upsertLocalCacheItem(CACHE_TEAMS_KEY, saved);

  // Ensure Division Head's divisions array includes this division
  let updatedHead: DivisionHeadMaster | null = null;
  if (!head.divisions.some((d) => normOrgKey(d) === normOrgKey(division))) {
    updatedHead = {
      ...head,
      divisions: [...head.divisions, division],
      updatedAt: now,
    };
    await upsertLocalCacheItem(CACHE_DIVISION_HEADS_KEY, updatedHead);
  }

  // Cascade Team updates to linked ADMs and Customers
  const adms = await readLocalCacheList<AdmMasterRecord>(CACHE_ADMS_KEY);
  const updatedAdms: AdmMasterRecord[] = [];
  const affectedAdmNumbers = new Set<string>();
  for (const a of adms) {
    if (
      a.teamId === saved.id &&
      (a.teamName !== saved.teamName ||
        a.division !== saved.division ||
        a.divisionHeadId !== saved.divisionHeadId ||
        a.divisionHeadName !== saved.divisionHeadName)
    ) {
      const historyEntry =
        a.division !== saved.division || a.teamName !== saved.teamName || a.divisionHeadName !== saved.divisionHeadName
          ? {
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
            }
          : null;

      const nextAdm: AdmMasterRecord = {
        ...a,
        teamName: saved.teamName,
        division: saved.division,
        divisionHeadId: saved.divisionHeadId,
        divisionHeadName: saved.divisionHeadName,
        assignmentHistory: historyEntry
          ? [...(a.assignmentHistory || []), historyEntry]
          : a.assignmentHistory,
        updatedAt: now,
        updatedBy: currentUser.displayName,
      };
      await upsertLocalCacheItem(CACHE_ADMS_KEY, nextAdm);
      updatedAdms.push(nextAdm);
      affectedAdmNumbers.add(normOrgKey(nextAdm.admNumber));
    }
  }

  const customers = await readLocalCacheList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY);
  const updatedCustomers: CustomerMasterRecord[] = [];
  for (const c of customers) {
    if (
      c.teamId === saved.id ||
      (!c.requiresAdmMapping && affectedAdmNumbers.has(normOrgKey(c.admNumber)))
    ) {
      if (
        c.teamId !== saved.id ||
        c.teamName !== saved.teamName ||
        c.division !== saved.division ||
        c.divisionHeadId !== saved.divisionHeadId ||
        c.divisionHead !== saved.divisionHeadName
      ) {
        const nextCust: CustomerMasterRecord = {
          ...c,
          teamId: saved.id,
          teamName: saved.teamName,
          division: saved.division,
          divisionHeadId: saved.divisionHeadId,
          divisionHead: saved.divisionHeadName,
          updatedAt: now,
          updatedBy: currentUser.displayName,
        };
        await upsertLocalCacheItem(CACHE_CUSTOMERS_KEY, nextCust);
        updatedCustomers.push(nextCust);
      }
    }
  }

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'team_master', saved.id), cleanForFirestore(saved), { merge: true });
      if (updatedHead) {
        await setDoc(doc(db, 'division_head_master', updatedHead.id), cleanForFirestore(updatedHead), { merge: true });
      }
      for (const a of updatedAdms) {
        await setDoc(doc(db, 'adm_master', a.id), cleanForFirestore(a), { merge: true });
      }
      for (const c of updatedCustomers) {
        await setDoc(doc(db, 'customer_master', c.id), cleanForFirestore(c), { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `team_master/${saved.id}`);
      throw err instanceof Error ? err : new Error('Failed to save Team to Cloud Firestore.');
    }
  }

  await recordAuditLog({
    recordId: saved.id,
    recordType: 'TEAM_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `${existing ? 'Updated' : 'Created'} Team "${saved.teamName}" under Division "${saved.division}" (Division Head: ${saved.divisionHeadName}; Cascaded to ${updatedAdms.length} ADMs, ${updatedCustomers.length} customers).`,
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
  if (currentUser.role !== 'RECOVERY_SUPERVISOR' && currentUser.role !== 'SYSTEM_ADMIN') {
    throw new Error('Unauthorized: Only Recovery Supervisors or System Admins can modify ADM records.');
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

  const teams = await readLocalCacheList<TeamMaster>(CACHE_TEAMS_KEY);
  const team = teams.find((t) => t.id === input.teamId);
  if (!team) throw new Error('Selected Team record was not found.');

  const existingAdms = await readLocalCacheList<AdmMasterRecord>(CACHE_ADMS_KEY);
  const existing = input.id ? existingAdms.find((a) => a.id === input.id) : undefined;

  const admCollision = existingAdms.find(
    (a) => a.id !== existing?.id && normOrgKey(a.admNumber) === normOrgKey(admNumber)
  );
  if (admCollision) {
    throw new Error(`ADM# "${admNumber}" is already assigned to ${admCollision.salesRepName} (Emp ID: ${admCollision.empId}).`);
  }

  const empCollision = existingAdms.find(
    (a) => a.id !== existing?.id && normOrgKey(a.empId) === normOrgKey(empId)
  );
  if (empCollision) {
    throw new Error(`Emp ID "${empId}" is already assigned to ${empCollision.salesRepName} (ADM#: ${empCollision.admNumber}).`);
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

  await upsertLocalCacheItem(CACHE_ADMS_KEY, saved);

  // Cascade ADM updates to all linked Customers (referencing admReference === saved.id or previous/new admNumber)
  const customers = await readLocalCacheList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY);
  const updatedCustomers: CustomerMasterRecord[] = [];
  for (const c of customers) {
    const matchesRef = c.admReference === saved.id;
    const matchesOldNum = existing && !c.requiresAdmMapping && normOrgKey(c.admNumber) === normOrgKey(existing.admNumber);
    const matchesNewNum = !c.requiresAdmMapping && normOrgKey(c.admNumber) === normOrgKey(saved.admNumber);
    if (matchesRef || matchesOldNum || matchesNewNum) {
      const nextStatus: CustomerMasterRecord['customerStatus'] =
        c.customerStatus === 'INACTIVE'
          ? 'INACTIVE'
          : saved.employeeStatus === 'ACTIVE'
            ? 'ACTIVE'
            : 'NEEDS_REVIEW';

      const nextCust: CustomerMasterRecord = {
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
      await upsertLocalCacheItem(CACHE_CUSTOMERS_KEY, nextCust);
      updatedCustomers.push(nextCust);
    }
  }

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'adm_master', saved.id), cleanForFirestore(saved), { merge: true });
      for (const c of updatedCustomers) {
        await setDoc(doc(db, 'customer_master', c.id), cleanForFirestore(c), { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `adm_master/${saved.id}`);
      throw err instanceof Error ? err : new Error('Failed to save ADM Master to Cloud Firestore.');
    }
  }

  await recordAuditLog({
    recordId: saved.id,
    recordType: 'ADM_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `${existing ? 'Updated' : 'Created'} ADM# ${saved.admNumber} (${saved.salesRepName}, Emp ID: ${saved.empId}, Team: ${saved.teamName}, Division: ${saved.division}, Status: ${saved.employeeStatus}). Cascaded to ${updatedCustomers.length} linked customers.`,
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
  if (currentUser.role !== 'RECOVERY_SUPERVISOR' && currentUser.role !== 'SYSTEM_ADMIN') {
    throw new Error('Unauthorized: Only Recovery Supervisors or System Admins can modify Customer Master records.');
  }

  const customerId = normOrgDisplay(input.customerId);
  const customerName = normOrgDisplay(input.customerName);
  const customerPhone = normOrgDisplay(input.customerPhone);

  if (!customerId) throw new Error('Customer ID is required.');
  if (!customerName) throw new Error('Customer Name is required.');

  const existingCustomers = await readLocalCacheList<CustomerMasterRecord>(CACHE_CUSTOMERS_KEY);
  const existing = input.id ? existingCustomers.find((c) => c.id === input.id) : undefined;

  const idCollision = existingCustomers.find(
    (c) => c.id !== existing?.id && normOrgKey(c.customerId) === normOrgKey(customerId)
  );
  if (idCollision) {
    throw new Error(`Customer ID "${customerId}" is already registered to "${idCollision.customerName}".`);
  }

  const adms = await readLocalCacheList<AdmMasterRecord>(CACHE_ADMS_KEY);
  const selectedAdm = input.admId ? adms.find((a) => a.id === input.admId) : undefined;
  if (!selectedAdm && !existing?.requiresAdmMapping) {
    throw new Error('Authoritative ADM# selection is required.');
  }

  const now = new Date().toISOString();
  const effectiveDate = input.assignmentEffectiveDate || existing?.assignmentEffectiveDate || now.slice(0, 10);
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

  await upsertLocalCacheItem(CACHE_CUSTOMERS_KEY, saved);

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'customer_master', saved.id), cleanForFirestore(saved), { merge: true });
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `customer_master/${saved.id}`);
      throw err instanceof Error ? err : new Error('Failed to save Customer Master to Cloud Firestore.');
    }
  }

  await recordAuditLog({
    recordId: saved.id,
    recordType: 'CUSTOMER_MASTER',
    operation: existing ? 'UPDATE' : 'CREATE',
    actor: currentUser.displayName,
    actorEmail: currentUser.email,
    details: `${existing ? 'Updated' : 'Created'} Customer ${saved.customerId} (${saved.customerName}) -> ADM# ${saved.admNumber} (${saved.salesRepName || 'Unmapped'}).`,
  });

  return saved;
}

/**
 * Sync local browser records/actions/batches/org-master/config to Cloud Firestore so data is shared across published URLs
 */
export async function syncLocalDataToFirestore(currentUser: UserProfile): Promise<{
  syncedCheques: number;
  syncedActions: number;
  syncedBatches: number;
  syncedOrgMaster: number;
}> {
  if (!auth.currentUser) {
    throw new Error('Must be signed in with Google to sync data to Cloud Firestore.');
  }

  let syncedCheques = 0;
  let syncedActions = 0;
  let syncedBatches = 0;
  let syncedOrgMaster = 0;

  try {
    const ops: Array<{ ref: DocumentReference; data: unknown; merge?: boolean }> = [];

    const localCheques = await readPersistentList<ChequeRecord>(CACHE_CHEQUES_KEY);
    for (const r of localCheques) {
      ops.push({ ref: doc(db, 'cheque_records', r.id), data: r, merge: true });
      syncedCheques++;
    }

    const rawActions = localStorage.getItem(CACHE_ACTIONS_KEY);
    const localActions: RecoveryAction[] = rawActions ? JSON.parse(rawActions) : [];
    for (const a of localActions) {
      ops.push({ ref: doc(db, 'recovery_actions', a.id), data: a, merge: true });
      syncedActions++;
    }

    const rawBatches = localStorage.getItem(CACHE_BATCHES_KEY);
    const localBatches: ImportBatch[] = rawBatches ? JSON.parse(rawBatches) : [];
    for (const b of localBatches) {
      ops.push({ ref: doc(db, 'import_batches', b.id), data: sanitizeBatchForStorage(b), merge: true });
      syncedBatches++;
    }

    const pushCol = async (cacheKey: string, colName: string) => {
      const items = await readPersistentList<{ id: string }>(cacheKey);
      for (const item of items) {
        ops.push({ ref: doc(db, colName, item.id), data: item, merge: true });
        syncedOrgMaster++;
      }
    };

    await pushCol(CACHE_DIVISION_HEADS_KEY, 'division_head_master');
    await pushCol(CACHE_TEAMS_KEY, 'team_master');
    await pushCol(CACHE_ADMS_KEY, 'adm_master');
    await pushCol(CACHE_CUSTOMERS_KEY, 'customer_master');

    const rawConfig = localStorage.getItem(CACHE_CONFIG_KEY);
    if (rawConfig) {
      ops.push({ ref: doc(db, 'config', 'analytics'), data: JSON.parse(rawConfig), merge: true });
    }

    await commitFirestoreSetOps(ops);

    await recordAuditLog({
      recordId: 'cloud-sync',
      recordType: 'CHEQUE_RECORD',
      operation: 'UPDATE',
      actor: currentUser.displayName,
      actorEmail: currentUser.email,
      details: `Synchronized local records to Cloud Firestore: ${syncedCheques} cheques, ${syncedActions} actions, ${syncedBatches} import batches, ${syncedOrgMaster} org master docs.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'syncLocalDataToFirestore');
    throw err;
  }

  return { syncedCheques, syncedActions, syncedBatches, syncedOrgMaster };
}

