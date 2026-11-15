/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Main Enterprise Application Container (Authenticated & Role-Scoped)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChequeRecord,
  FilterState,
  UserProfile,
  AnalyticalConfig,
  ImportBatch,
  ActionType,
  RecoveryStatus,
  DivisionHeadMaster,
  TeamMaster,
  AdmMasterRecord,
  CustomerMasterRecord,
  CrossTeamBenchmarkSummary,
  NavItemId,
} from './types';
import {
  filterRecords,
  calculateKPIs,
  aggregateCustomerIntelligence,
  aggregateAdmIntelligence,
  aggregateReasonIntelligence,
  aggregateTeamIntelligence,
  aggregateDivisionHeadIntelligence,
  analyzeHistoricalLinkage,
  DEFAULT_CONFIG,
} from './services/analytics';
import {
  saveChequeRecord,
  saveBatchChequeRecords,
  addRecoveryAction,
  saveAnalyticalConfig,
  resetDataset,
  clearEntireDatabase,
  ClearDatabaseOptions,
  ClearDatabaseResult,
  clearSampleRecordsOnly,
  saveAdmMasterBatch,
  saveCustomerMasterBatch,
  mapCustomerToAdmMaster,
  saveDivisionHeadMaster,
  saveTeamMaster,
  saveAdmMaster,
  saveCustomerMaster,
  migrateLegacyLocalDataIfNeeded,
  SaveDivisionHeadInput,
  SaveTeamInput,
  SaveAdmInput,
  SaveCustomerInput,
} from './services/firebase';
import {
  ApiError,
  apiBootstrapData,
  apiGetAuthMe,
  apiGetCrossTeamBenchmarks,
  apiLogout,
  apiRecordAuditEvent,
} from './services/api';
import {
  ALL_NAV_TABS,
  canAccessTab,
  canEditCheques,
  canImportCheques,
  canImportOrgMaster,
  canManageUsers,
  getDefaultTabForRole,
} from './services/permissions';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WurthLogo } from './components/WurthLogo';
import { LoginScreen } from './components/LoginScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AccessDeniedView } from './components/AccessDeniedView';
import { UserManagement } from './components/UserManagement';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { ChequeRegister } from './components/ChequeRegister';
import { AddChequeForm } from './components/AddChequeForm';
import { CustomerIntelligence } from './components/CustomerIntelligence';
import { AdmPerformance } from './components/AdmPerformance';
import { TeamDashboard } from './components/TeamDashboard';
import { DivisionHeadDashboard } from './components/DivisionHeadDashboard';
import { OrganizationManagement, OrgSubTab } from './components/OrganizationManagement';
import { ReturnReasonAnalysis } from './components/ReturnReasonAnalysis';
import { RecoveryActionCentre } from './components/RecoveryActionCentre';
import { TrendsAndAnomalies } from './components/TrendsAndAnomalies';
import { ReportsAndExports } from './components/ReportsAndExports';
import { DataImport, ImportMode } from './components/DataImport';
import { AuditLogView } from './components/AuditLogView';
import { SettingsAndAccessControl } from './components/SettingsAndAccessControl';
import { DataQualityMonitorModal, auditDataQuality } from './components/DataQualityMonitorModal';
import { ChequeDetailModal } from './components/ChequeDetailModal';

const INITIAL_FILTERS: FilterState = {
  dateBasis: 'datePosted',
  startDate: '',
  endDate: '',
  cxNumber: '',
  admCode: '',
  division: '',
  teamId: '',
  divisionHeadId: '',
  returnReason: '',
  recoveryStatus: '',
  priority: '',
  assignedOfficer: '',
  searchQuery: '',
};

function parseHashTab(): NavItemId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return null;
  const candidate = raw.split('?')[0] as NavItemId;
  return ALL_NAV_TABS.includes(candidate) ? candidate : null;
}

export default function App() {
  // Authentication & Session State
  const [authChecking, setAuthChecking] = useState(true);
  const [bootstrapInitialized, setBootstrapInitialized] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);

  // App Core Domain State
  const [records, setRecords] = useState<ChequeRecord[]>([]);
  const [divisionHeads, setDivisionHeads] = useState<DivisionHeadMaster[]>([]);
  const [teams, setTeams] = useState<TeamMaster[]>([]);
  const [admsMaster, setAdmsMaster] = useState<AdmMasterRecord[]>([]);
  const [customersMaster, setCustomersMaster] = useState<CustomerMasterRecord[]>([]);
  const [benchmarks, setBenchmarks] = useState<CrossTeamBenchmarkSummary | null>(null);
  const [config, setConfig] = useState<AnalyticalConfig>(DEFAULT_CONFIG);

  // Navigation & UI State
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<NavItemId>('executive-dashboard');
  const [deniedAttemptTab, setDeniedAttemptTab] = useState<NavItemId | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('ADM_MASTER');
  const [orgInitialSubTab, setOrgInitialSubTab] = useState<OrgSubTab>('hierarchy');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Filters State
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Modals and Drawers
  const [selectedRecord, setSelectedRecord] = useState<ChequeRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<ChequeRecord | null>(null);
  const [dataQualityModalOpen, setDataQualityModalOpen] = useState(false);

  const pageTitles: Record<NavItemId, string> = {
    'executive-dashboard': 'Executive Dashboard',
    'cheque-register': 'Cheque Return Register',
    'add-cheque': editingRecord ? 'Edit Returned Cheque' : 'Add Returned Cheque',
    'customer-intelligence': 'Customer Intelligence',
    'adm-performance': 'ADM Performance',
    'team-dashboard': 'Team Recovery & Exposure Dashboard',
    'division-head-dashboard': 'Division Head Dashboard',
    'organization-management': 'Organization Master & Hierarchy',
    'reason-analysis': 'Return Reason Analysis',
    'recovery-actions': 'Recovery Action Centre',
    'trends-anomalies': 'Trends & Anomalies',
    'reports-exports': 'Reports & Exports',
    'data-import': 'Data Import (Excel & CSV)',
    'audit-log': 'Audit Log',
    'user-management': 'User Management',
    settings: 'Settings & Access Control',
  };

  const resetDomainState = useCallback(() => {
    setRecords([]);
    setDivisionHeads([]);
    setTeams([]);
    setAdmsMaster([]);
    setCustomersMaster([]);
    setBenchmarks(null);
    setConfig(DEFAULT_CONFIG);
    setSelectedRecord(null);
    setEditingRecord(null);
    setDataQualityModalOpen(false);
    setDeniedAttemptTab(null);
    setFilters(INITIAL_FILTERS);
  }, []);

  const loadScopedApplicationData = useCallback(
    async (user: UserProfile) => {
      setDataLoading(true);
      try {
        let [payload, benchmarkData] = await Promise.all([
          apiBootstrapData(),
          apiGetCrossTeamBenchmarks().catch(() => null),
        ]);

        // If a System Administrator had production data cached locally before server persistence, migrate it once cleanly
        if (
          user.role === 'SYSTEM_ADMIN' &&
          payload.chequeRecords.filter((r) => !r.isSample).length === 0 &&
          payload.adms.length === 0 &&
          payload.customers.length === 0
        ) {
          const migratedCount = await migrateLegacyLocalDataIfNeeded(user);
          if (migratedCount > 0) {
            [payload, benchmarkData] = await Promise.all([
              apiBootstrapData(),
              apiGetCrossTeamBenchmarks().catch(() => null),
            ]);
            setStatusNotice({
              type: 'success',
              message: `Migrated ${migratedCount} previously uploaded production record(s) to the centralized database.`,
            });
          }
        }

        setRecords(payload.chequeRecords);
        setDivisionHeads(payload.divisionHeads);
        setTeams(payload.teams);
        setAdmsMaster(payload.adms);
        setCustomersMaster(payload.customers);
        setConfig(payload.config);
        setBenchmarks(benchmarkData);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCurrentUser(null);
          resetDomainState();
          return;
        }
        setStatusNotice({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Unable to load authorized application data.',
        });
      } finally {
        setDataLoading(false);
      }
    },
    [resetDomainState]
  );

  const navigateWithRbac = useCallback(
    (targetTab: NavItemId, user: UserProfile, logUnauthorized = true) => {
      if (!canAccessTab(user.role, targetTab)) {
        setDeniedAttemptTab(targetTab);
        setEditingRecord(null);
        if (logUnauthorized) {
          apiRecordAuditEvent({
            recordId: targetTab,
            recordType: 'ACCESS_CONTROL',
            operation: 'UNAUTHORIZED_ACCESS',
            details: `Blocked attempt by @${user.username} (${user.role}) to access restricted section "${targetTab}".`,
          }).catch(() => {});
        }
        return false;
      }

      setDeniedAttemptTab(null);
      setEditingRecord(null);
      if (targetTab !== 'organization-management') {
        setOrgInitialSubTab('hierarchy');
      }
      if (targetTab === 'data-import' && !canImportOrgMaster(user.role)) {
        setImportMode('CHEQUE_REGISTER');
      }
      setActiveTab(targetTab);
      if (typeof window !== 'undefined') {
        const desiredHash = `#/${targetTab}`;
        if (window.location.hash !== desiredHash) {
          window.location.hash = desiredHash;
        }
      }
      return true;
    },
    []
  );

  const applyInitialTabForUser = useCallback(
    (user: UserProfile) => {
      const requestedFromHash = parseHashTab();
      if (requestedFromHash) {
        navigateWithRbac(requestedFromHash, user, true);
      } else {
        const defaultTab = getDefaultTabForRole(user.role);
        navigateWithRbac(defaultTab, user, false);
      }
      if (!canImportOrgMaster(user.role)) {
        setImportMode('CHEQUE_REGISTER');
      } else {
        setImportMode('ADM_MASTER');
      }
    },
    [navigateWithRbac]
  );

  // Initial session hydration
  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      setAuthChecking(true);
      try {
        const session = await apiGetAuthMe();
        if (!mounted) return;
        setBootstrapInitialized(session.bootstrapInitialized);
        if (session.authenticated && session.user) {
          setCurrentUser(session.user);
          applyInitialTabForUser(session.user);
          await loadScopedApplicationData(session.user);
        } else {
          setCurrentUser(null);
        }
      } catch {
        if (mounted) setCurrentUser(null);
      } finally {
        if (mounted) setAuthChecking(false);
      }
    }
    restoreSession();
    return () => {
      mounted = false;
    };
  }, [applyInitialTabForUser, loadScopedApplicationData]);

  // Listen to browser hash URL changes to enforce RBAC against direct URL manipulation
  useEffect(() => {
    if (!currentUser) return;
    const handleHashChange = () => {
      const hashTab = parseHashTab();
      if (!hashTab) return;
      navigateWithRbac(hashTab, currentUser, true);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser, navigateWithRbac]);

  // Login handler
  const handleLoginSuccess = async (user: UserProfile) => {
    setBootstrapInitialized(true);
    setStatusNotice(null);
    setCurrentUser(user);
    setFilters(INITIAL_FILTERS);
    applyInitialTabForUser(user);
    await loadScopedApplicationData(user);
  };

  // Logout handler
  const handleSignOut = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore logout error and clear local state anyway
    }
    setCurrentUser(null);
    setChangePasswordModalOpen(false);
    setStatusNotice(null);
    resetDomainState();
    if (typeof window !== 'undefined' && window.location.hash) {
      window.location.hash = '';
    }
  };

  // Filtered Records (derived from server-scoped records + active UI filters)
  const filteredRecords = useMemo(() => {
    return filterRecords(records, filters, customersMaster, admsMaster);
  }, [records, filters, customersMaster, admsMaster]);

  // Derived Analytics Calculations
  const kpis = useMemo(() => {
    return calculateKPIs(filteredRecords, [], config);
  }, [filteredRecords, config]);

  const customerIntelligence = useMemo(() => {
    return aggregateCustomerIntelligence(filteredRecords, config, customersMaster, admsMaster);
  }, [filteredRecords, config, customersMaster, admsMaster]);

  const admIntelligence = useMemo(() => {
    return aggregateAdmIntelligence(filteredRecords, admsMaster, customersMaster);
  }, [filteredRecords, admsMaster, customersMaster]);

  const teamIntelligence = useMemo(() => {
    return aggregateTeamIntelligence(filteredRecords, customersMaster, admsMaster, teams, config);
  }, [filteredRecords, customersMaster, admsMaster, teams, config]);

  const divisionHeadIntelligence = useMemo(() => {
    return aggregateDivisionHeadIntelligence(
      filteredRecords,
      customersMaster,
      admsMaster,
      teams,
      divisionHeads,
      config
    );
  }, [filteredRecords, customersMaster, admsMaster, teams, divisionHeads, config]);

  const historicalAudit = useMemo(() => {
    return analyzeHistoricalLinkage(records, customersMaster, admsMaster);
  }, [records, customersMaster, admsMaster]);

  const reasonIntelligence = useMemo(() => {
    return aggregateReasonIntelligence(filteredRecords);
  }, [filteredRecords]);

  // Data Quality Issues
  const dataQualityIssues = useMemo(() => {
    return auditDataQuality(records);
  }, [records]);

  // Filter Handlers
  const handleUpdateFilters = (overrides: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...overrides }));
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  // Domain Refresh Helpers
  const refreshAllData = async () => {
    const [payload, benchmarkData] = await Promise.all([
      apiBootstrapData(),
      apiGetCrossTeamBenchmarks().catch(() => null),
    ]);
    setRecords(payload.chequeRecords);
    setDivisionHeads(payload.divisionHeads);
    setTeams(payload.teams);
    setAdmsMaster(payload.adms);
    setCustomersMaster(payload.customers);
    setConfig(payload.config);
    setBenchmarks(benchmarkData);
  };

  // Mutating Handlers (with RBAC validation)
  const handleSaveCheque = async (savedRecord: ChequeRecord, isEdit: boolean) => {
    if (!currentUser) return;
    await saveChequeRecord(savedRecord, currentUser, isEdit);
    await refreshAllData();
    setEditingRecord(null);
    navigateWithRbac('cheque-register', currentUser, false);
  };

  const handleImportBatch = async (newRecords: ChequeRecord[], batch: ImportBatch) => {
    if (!currentUser) return;
    await saveBatchChequeRecords(newRecords, batch, currentUser);
    await refreshAllData();
  };

  const handleAdmImportComplete = async (
    upsertedAdms: AdmMasterRecord[],
    upsertedTeams: TeamMaster[],
    upsertedHeads: DivisionHeadMaster[],
    batch: ImportBatch
  ) => {
    if (!currentUser) return;
    await saveAdmMasterBatch(upsertedAdms, upsertedTeams, upsertedHeads, batch, currentUser);
    await refreshAllData();
  };

  const handleCustomerImportComplete = async (
    upsertedCustomers: CustomerMasterRecord[],
    batch: ImportBatch
  ) => {
    if (!currentUser) return;
    await saveCustomerMasterBatch(upsertedCustomers, batch, currentUser);
    await refreshAllData();
  };

  const handleMapCustomerToAdm = async (
    customer: CustomerMasterRecord,
    adm: AdmMasterRecord
  ) => {
    if (!currentUser) return;
    await mapCustomerToAdmMaster(customer, adm, currentUser);
    await refreshAllData();
  };

  const handleSaveDivisionHead = async (input: SaveDivisionHeadInput) => {
    if (!currentUser) return;
    await saveDivisionHeadMaster(input, currentUser);
    await refreshAllData();
  };

  const handleSaveTeam = async (input: SaveTeamInput) => {
    if (!currentUser) return;
    await saveTeamMaster(input, currentUser);
    await refreshAllData();
  };

  const handleSaveAdm = async (input: SaveAdmInput) => {
    if (!currentUser) return;
    await saveAdmMaster(input, currentUser);
    await refreshAllData();
  };

  const handleSaveCustomer = async (input: SaveCustomerInput) => {
    if (!currentUser) return;
    await saveCustomerMaster(input, currentUser);
    await refreshAllData();
  };

  const handleLogRecoveryAction = async (
    record: ChequeRecord,
    actionType: ActionType,
    notes: string,
    details: {
      promisedDate?: string;
      promisedAmount?: number;
      recoveredAmount?: number;
      replacementRef?: string;
      newStatus?: RecoveryStatus;
    }
  ) => {
    if (!currentUser) return;
    let newRecovered = record.recoveredAmount || 0;
    if (details.recoveredAmount) {
      newRecovered += details.recoveredAmount;
    } else if (actionType === 'FULL_RECOVERY') {
      newRecovered = record.amount;
    }

    const newRemaining = Math.max(0, record.amount - newRecovered);
    const nextStatus =
      details.newStatus || (newRemaining === 0 ? 'RECOVERED' : record.recoveryStatus);

    const updatedCheque: ChequeRecord = {
      ...record,
      recoveryStatus: nextStatus,
      recoveredAmount: newRecovered,
      remainingAmount: newRemaining,
      nextAction: details.promisedDate
        ? `Awaiting promised payment on ${details.promisedDate}`
        : record.nextAction,
      nextFollowUpDate: details.promisedDate || record.nextFollowUpDate,
      resolutionEvidence: details.replacementRef || record.resolutionEvidence,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.displayName,
    };

    await addRecoveryAction(
      {
        chequeId: record.id,
        cxNumber: record.cxNumber,
        actionType,
        officerName: currentUser.displayName,
        officerId: currentUser.uid,
        notes,
        promisedDate: details.promisedDate,
        promisedAmount: details.promisedAmount,
        recoveredAmount: details.recoveredAmount,
        replacementChequeRef: details.replacementRef,
        newStatus: nextStatus,
        createdBy: currentUser.displayName,
      },
      updatedCheque,
      currentUser
    );

    await refreshAllData();
    if (selectedRecord && selectedRecord.id === record.id) {
      setSelectedRecord(updatedCheque);
    }
  };

  const handleResetDataset = async (loadSample: boolean) => {
    if (!currentUser) return;
    await resetDataset(loadSample, currentUser);
    await refreshAllData();
  };

  const handleClearSampleData = async () => {
    if (!currentUser) return;
    const remaining = await clearSampleRecordsOnly(currentUser);
    await refreshAllData();
    setStatusNotice({
      type: 'success',
      message:
        remaining.length > 0
          ? `Removed sample records. Showing ${remaining.length} production cheque record(s).`
          : 'Sample records removed. Register is ready for your production cheque import.',
    });
  };

  const handlePurgeDatabase = async (options: ClearDatabaseOptions): Promise<ClearDatabaseResult> => {
    if (!currentUser) {
      throw new Error('Authentication required.');
    }
    const res = await clearEntireDatabase(currentUser, options);
    await refreshAllData();
    return res;
  };

  const handleUpdateConfig = async (newConfig: AnalyticalConfig) => {
    if (!currentUser) return;
    setConfig(newConfig);
    await saveAnalyticalConfig(newConfig, currentUser);
    await refreshAllData();
  };

  // Cross-view Drilldowns
  const handleCustomerDrilldown = (cxNumber: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ cxNumber });
    navigateWithRbac('cheque-register', currentUser, false);
  };

  const handleAdmDrilldown = (admCode: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ admCode });
    navigateWithRbac('cheque-register', currentUser, false);
  };

  const handleTeamDrilldown = (teamId: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ teamId });
    navigateWithRbac('cheque-register', currentUser, false);
  };

  const handleDivisionHeadDrilldown = (divisionHeadId: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ divisionHeadId });
    navigateWithRbac('cheque-register', currentUser, false);
  };

  const handleDivisionDrilldown = (division: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ division });
    navigateWithRbac('team-dashboard', currentUser, false);
  };

  const handleReasonDrilldown = (reason: string) => {
    if (!currentUser) return;
    handleUpdateFilters({ returnReason: reason });
    navigateWithRbac('cheque-register', currentUser, false);
  };

  // 1. Initial authentication check splash
  if (authChecking) {
    return (
      <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center gap-3 text-xs text-slate-600">
        <WurthLogo size="lg" />
        <span>Verifying enterprise session...</span>
      </div>
    );
  }

  // 2. Unauthenticated state -> Dedicated Login Screen only
  if (!currentUser) {
    return (
      <LoginScreen
        bootstrapInitialized={bootstrapInitialized}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const effectiveTab: NavItemId = editingRecord ? 'add-cheque' : activeTab;

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden">
      {/* Persistent Left Navigation Sidebar */}
      <Sidebar
        currentTab={effectiveTab}
        onSelectTab={(tab) => navigateWithRbac(tab, currentUser, true)}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        unresolvedCount={records.filter((r) => r.recoveryStatus !== 'RECOVERED').length}
        overdueCount={kpis.overdueCasesCount}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Compact Top Navigation Bar */}
        <TopBar
          pageTitle={deniedAttemptTab ? 'Access Denied' : pageTitles[effectiveTab]}
          filters={filters}
          onUpdateFilters={handleUpdateFilters}
          onResetFilters={handleResetFilters}
          currentUser={currentUser}
          dataQualityIssuesCount={dataQualityIssues.length}
          onOpenDataQuality={() => setDataQualityModalOpen(true)}
          isSampleDataLoaded={records.some((r) => r.isSample)}
          onClearSampleData={handleClearSampleData}
          onOpenChangePassword={() => setChangePasswordModalOpen(true)}
          onSignOut={handleSignOut}
        />

        {/* Operational / Migration Status Notice */}
        {statusNotice && (
          <div
            className={`px-5 py-2 text-xs flex items-center justify-between border-b ${
              statusNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <span>{statusNotice.message}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="ml-4 text-[11px] font-semibold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6">
          {dataLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-xs text-slate-500">
              <WurthLogo size="lg" />
              <span>Loading WÜRTH Recovery Intelligence workspace...</span>
            </div>
          ) : deniedAttemptTab ? (
            <AccessDeniedView
              attemptedSection={pageTitles[deniedAttemptTab] || deniedAttemptTab}
              role={currentUser.role}
              defaultTab={getDefaultTabForRole(currentUser.role)}
              onReturnToDashboard={(tab) => navigateWithRbac(tab, currentUser, false)}
            />
          ) : (
            <>
              {/* Tab 1: Executive Dashboard */}
              {activeTab === 'executive-dashboard' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'executive-dashboard') && (
                  <ExecutiveDashboard
                    kpis={kpis}
                    records={filteredRecords}
                    customers={customerIntelligence}
                    adms={admIntelligence}
                    reasons={reasonIntelligence}
                    filters={filters}
                    onFilterChange={handleUpdateFilters}
                    onNavigateToRegister={(overrides) => {
                      if (overrides) handleUpdateFilters(overrides);
                      navigateWithRbac('cheque-register', currentUser, false);
                    }}
                    onSelectCustomer={(cxNumber) => {
                      handleCustomerDrilldown(cxNumber);
                    }}
                  />
                )}

              {/* Tab 2: Cheque Return Register */}
              {activeTab === 'cheque-register' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'cheque-register') && (
                  <ChequeRegister
                    records={filteredRecords}
                    filters={filters}
                    onFilterChange={handleUpdateFilters}
                    onSelectRecord={(rec) => setSelectedRecord(rec)}
                    onAddNewRecord={() => {
                      if (!canEditCheques(currentUser.role)) return;
                      setEditingRecord(null);
                      navigateWithRbac('add-cheque', currentUser, false);
                    }}
                    onBulkImport={
                      canImportCheques(currentUser.role)
                        ? () => {
                            setEditingRecord(null);
                            setImportMode('CHEQUE_REGISTER');
                            navigateWithRbac('data-import', currentUser, false);
                          }
                        : undefined
                    }
                    onEditRecord={(rec) => {
                      if (!canEditCheques(currentUser.role)) return;
                      setEditingRecord(rec);
                      if (typeof window !== 'undefined') {
                        window.location.hash = '#/add-cheque';
                      }
                    }}
                    currentUser={currentUser}
                  />
                )}

              {/* Tab 3: Add / Edit Returned Cheque */}
              {(activeTab === 'add-cheque' || editingRecord) &&
                canEditCheques(currentUser.role) && (
                  <AddChequeForm
                    initialRecord={editingRecord}
                    onSave={handleSaveCheque}
                    onCancel={() => {
                      setEditingRecord(null);
                      navigateWithRbac('cheque-register', currentUser, false);
                    }}
                    onNavigateToBulkImport={
                      canImportCheques(currentUser.role)
                        ? () => {
                            setEditingRecord(null);
                            setImportMode('CHEQUE_REGISTER');
                            navigateWithRbac('data-import', currentUser, false);
                          }
                        : undefined
                    }
                    existingRecords={records}
                    customersMaster={customersMaster}
                    admsMaster={admsMaster}
                    currentUser={currentUser}
                    config={config}
                  />
                )}

              {/* Tab 4: Customer Intelligence */}
              {activeTab === 'customer-intelligence' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'customer-intelligence') && (
                  <CustomerIntelligence
                    customers={customerIntelligence}
                    allRecords={records}
                    onSelectCheque={(rec) => setSelectedRecord(rec)}
                    onFilterByCustomer={handleCustomerDrilldown}
                  />
                )}

              {/* Tab 5: ADM Performance */}
              {activeTab === 'adm-performance' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'adm-performance') && (
                  <AdmPerformance
                    adms={admIntelligence}
                    allRecords={records}
                    customersMaster={customersMaster}
                    onSelectCheque={(rec) => setSelectedRecord(rec)}
                    onFilterByAdm={handleAdmDrilldown}
                  />
                )}

              {/* Tab 6: Team Dashboard */}
              {activeTab === 'team-dashboard' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'team-dashboard') && (
                  <TeamDashboard
                    teams={teamIntelligence}
                    admsMaster={admsMaster}
                    customersMaster={customersMaster}
                    allRecords={filteredRecords}
                    dateBasis={filters.dateBasis}
                    onFilterByTeam={handleTeamDrilldown}
                    onFilterByAdm={handleAdmDrilldown}
                    onFilterByCustomer={handleCustomerDrilldown}
                    onSelectCheque={(rec) => setSelectedRecord(rec)}
                  />
                )}

              {/* Tab 7: Division Head Dashboard (Full Division KPIs + Cross-Team Comparative Benchmarking) */}
              {activeTab === 'division-head-dashboard' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'division-head-dashboard') && (
                  <DivisionHeadDashboard
                    currentUser={currentUser}
                    divisionHeads={divisionHeadIntelligence}
                    teams={teamIntelligence}
                    adms={admIntelligence}
                    customers={customerIntelligence}
                    admsMaster={admsMaster}
                    customersMaster={customersMaster}
                    allRecords={filteredRecords}
                    dateBasis={filters.dateBasis}
                    benchmarks={benchmarks}
                    onFilterByDivisionHead={handleDivisionHeadDrilldown}
                    onFilterByDivision={handleDivisionDrilldown}
                    onFilterByTeam={handleTeamDrilldown}
                    onFilterByAdm={handleAdmDrilldown}
                    onFilterByCustomer={handleCustomerDrilldown}
                  />
                )}

              {/* Tab 8: Organization Master & Hierarchy */}
              {activeTab === 'organization-management' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'organization-management') && (
                  <OrganizationManagement
                    divisionHeads={divisionHeads}
                    teams={teams}
                    adms={admsMaster}
                    customers={customersMaster}
                    chequeRecords={records}
                    historicalAudit={historicalAudit}
                    currentUser={currentUser}
                    initialSubTab={orgInitialSubTab}
                    onRefreshOrgData={refreshAllData}
                    onNavigateToImport={(mode) => {
                      if (!canImportOrgMaster(currentUser.role)) return;
                      setImportMode(mode);
                      navigateWithRbac('data-import', currentUser, false);
                    }}
                    onMapCustomerToAdm={handleMapCustomerToAdm}
                    onSaveDivisionHead={handleSaveDivisionHead}
                    onSaveTeam={handleSaveTeam}
                    onSaveAdm={handleSaveAdm}
                    onSaveCustomer={handleSaveCustomer}
                    onSelectCheque={(rec) => setSelectedRecord(rec)}
                  />
                )}

              {/* Tab 9: Return Reason Analysis */}
              {activeTab === 'reason-analysis' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'reason-analysis') && (
                  <ReturnReasonAnalysis
                    reasons={reasonIntelligence}
                    allRecords={records}
                    onSelectCheque={(rec) => setSelectedRecord(rec)}
                    onFilterByReason={handleReasonDrilldown}
                  />
                )}

              {/* Tab 10: Recovery Action Centre */}
              {activeTab === 'recovery-actions' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'recovery-actions') && (
                  <RecoveryActionCentre
                    records={filteredRecords}
                    onSelectRecord={(rec) => setSelectedRecord(rec)}
                    onLogAction={handleLogRecoveryAction}
                    currentUser={currentUser}
                  />
                )}

              {/* Tab 11: Trends & Anomalies */}
              {activeTab === 'trends-anomalies' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'trends-anomalies') && (
                  <TrendsAndAnomalies
                    records={filteredRecords}
                    kpis={kpis}
                    customers={customerIntelligence}
                    reasons={reasonIntelligence}
                    onSelectCustomer={handleCustomerDrilldown}
                    onFilterByReason={handleReasonDrilldown}
                  />
                )}

              {/* Tab 12: Reports & Exports */}
              {activeTab === 'reports-exports' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'reports-exports') && (
                  <ReportsAndExports
                    records={filteredRecords}
                    filters={filters}
                    kpis={kpis}
                    customers={customerIntelligence}
                    adms={admIntelligence}
                    reasons={reasonIntelligence}
                  />
                )}

              {/* Tab 13: Data Import */}
              {activeTab === 'data-import' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'data-import') && (
                  <DataImport
                    existingRecords={records}
                    existingAdms={admsMaster}
                    existingCustomers={customersMaster}
                    existingTeams={teams}
                    existingDivisionHeads={divisionHeads}
                    initialMode={importMode}
                    onImportComplete={handleImportBatch}
                    onAdmImportComplete={handleAdmImportComplete}
                    onCustomerImportComplete={handleCustomerImportComplete}
                    onNavigateToOrgMaster={(targetTab) => {
                      setOrgInitialSubTab(targetTab || 'hierarchy');
                      navigateWithRbac('organization-management', currentUser, false);
                    }}
                    onNavigateToChequeRegister={() =>
                      navigateWithRbac('cheque-register', currentUser, false)
                    }
                    currentUser={currentUser}
                    config={config}
                  />
                )}

              {/* Tab 14: User Management (Admin Only) */}
              {activeTab === 'user-management' &&
                !editingRecord &&
                canManageUsers(currentUser.role) && (
                  <UserManagement
                    currentUser={currentUser}
                    divisionHeads={divisionHeads}
                    teams={teams}
                  />
                )}

              {/* Tab 15: Audit Log (Admin Only) */}
              {activeTab === 'audit-log' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'audit-log') && <AuditLogView />}

              {/* Tab 16: Settings & Access Control (Admin Only) */}
              {activeTab === 'settings' &&
                !editingRecord &&
                canAccessTab(currentUser.role, 'settings') && (
                  <SettingsAndAccessControl
                    config={config}
                    onUpdateConfig={handleUpdateConfig}
                    onResetDataset={handleResetDataset}
                    onPurgeDatabase={handlePurgeDatabase}
                    currentUser={currentUser}
                    totalRecordsCount={records.length}
                  />
                )}
            </>
          )}
        </main>
      </div>

      {/* Cheque Record Case Detail Modal */}
      <ChequeDetailModal
        record={selectedRecord}
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onEdit={(rec) => {
          if (!canEditCheques(currentUser.role)) return;
          setSelectedRecord(null);
          setEditingRecord(rec);
          if (typeof window !== 'undefined') {
            window.location.hash = '#/add-cheque';
          }
        }}
        onLogAction={handleLogRecoveryAction}
        currentUser={currentUser}
      />

      {/* Data Quality Monitor Modal */}
      <DataQualityMonitorModal
        records={records}
        isOpen={dataQualityModalOpen}
        onClose={() => setDataQualityModalOpen(false)}
        onSelectRecord={(rec) => {
          setSelectedRecord(rec);
          setDataQualityModalOpen(false);
        }}
      />

      {/* Mandatory First-Login / Reset Password Change OR Voluntary Password Update */}
      {(currentUser.mustChangePassword || changePasswordModalOpen) && (
        <ChangePasswordModal
          currentUser={currentUser}
          forceOpen={Boolean(currentUser.mustChangePassword)}
          onSuccess={(updatedUser) => {
            setCurrentUser(updatedUser);
            setChangePasswordModalOpen(false);
            setStatusNotice({
              type: 'success',
              message: 'Your password has been updated securely.',
            });
          }}
          onClose={() => setChangePasswordModalOpen(false)}
        />
      )}
    </div>
  );
}
