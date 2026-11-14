/**
 * WÜRTH Lanka — Cheque Return Intelligence & Recovery Analytics Platform
 * Main Enterprise Application Container
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  getChequeRecords,
  saveChequeRecord,
  saveBatchChequeRecords,
  addRecoveryAction,
  getAnalyticalConfig,
  saveAnalyticalConfig,
  resetDataset,
  clearEntireDatabase,
  ClearDatabaseOptions,
  ClearDatabaseResult,
  testConnection,
  signInWithGoogle,
  signOutFirebase,
  subscribeAuthState,
  syncLocalDataToFirestore,
  hasRemoteChequeRecords,
  getDivisionHeadMasterRecords,
  getTeamMasterRecords,
  getAdmMasterRecords,
  getCustomerMasterRecords,
  saveAdmMasterBatch,
  saveCustomerMasterBatch,
  mapCustomerToAdmMaster,
  saveDivisionHeadMaster,
  saveTeamMaster,
  saveAdmMaster,
  saveCustomerMaster,
  SaveDivisionHeadInput,
  SaveTeamInput,
  SaveAdmInput,
  SaveCustomerInput,
  DEMO_USERS,
} from './services/firebase';
import { Sidebar, NavItemId } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WurthLogo } from './components/WurthLogo';
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

export default function App() {
  // App Core State
  const [records, setRecords] = useState<ChequeRecord[]>([]);
  const [divisionHeads, setDivisionHeads] = useState<DivisionHeadMaster[]>([]);
  const [teams, setTeams] = useState<TeamMaster[]>([]);
  const [admsMaster, setAdmsMaster] = useState<AdmMasterRecord[]>([]);
  const [customersMaster, setCustomersMaster] = useState<CustomerMasterRecord[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('ADM_MASTER');
  const [orgInitialSubTab, setOrgInitialSubTab] = useState<OrgSubTab>('hierarchy');

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEMO_USERS[0]); // Default to Recovery Officer
  const [activeTab, setActiveTab] = useState<NavItemId>('executive-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [config, setConfig] = useState<AnalyticalConfig>(DEFAULT_CONFIG);
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(null);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const skipNextAuthReloadRef = useRef(false);

  // Filters State
  const [filters, setFilters] = useState<FilterState>({
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
  });

  // Modals and Drawers
  const [selectedRecord, setSelectedRecord] = useState<ChequeRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<ChequeRecord | null>(null);
  const [dataQualityModalOpen, setDataQualityModalOpen] = useState(false);

  const loadAllState = async () => {
    const [
      loadedRecords,
      loadedConfig,
      loadedHeads,
      loadedTeams,
      loadedAdms,
      loadedCustomers,
    ] = await Promise.all([
      getChequeRecords(),
      getAnalyticalConfig(),
      getDivisionHeadMasterRecords(),
      getTeamMasterRecords(),
      getAdmMasterRecords(),
      getCustomerMasterRecords(),
    ]);
    return {
      loadedRecords,
      loadedConfig,
      loadedHeads,
      loadedTeams,
      loadedAdms,
      loadedCustomers,
    };
  };

  // Initial load & Firebase Auth subscription
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      try {
        await testConnection();
        const data = await loadAllState();
        if (mounted) {
          setRecords(data.loadedRecords);
          setConfig(data.loadedConfig);
          setDivisionHeads(data.loadedHeads);
          setTeams(data.loadedTeams);
          setAdmsMaster(data.loadedAdms);
          setCustomersMaster(data.loadedCustomers);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();

    const unsubscribe = subscribeAuthState(async (user) => {
      if (!mounted) return;
      setFirebaseEmail(user?.email ?? null);
      if (skipNextAuthReloadRef.current) {
        skipNextAuthReloadRef.current = false;
        return;
      }
      if (user) {
        try {
          const data = await loadAllState();
          if (mounted) {
            setRecords(data.loadedRecords);
            setConfig(data.loadedConfig);
            setDivisionHeads(data.loadedHeads);
            setTeams(data.loadedTeams);
            setAdmsMaster(data.loadedAdms);
            setCustomersMaster(data.loadedCustomers);
          }
        } catch (err) {
          console.error('Auth refresh error:', err);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Filtered Records (derived, including organizational hierarchy filters)
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

  // Handlers
  const handleUpdateFilters = (overrides: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...overrides }));
  };

  const handleResetFilters = () => {
    setFilters({
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
    });
  };

  const handleSaveCheque = async (savedRecord: ChequeRecord, isEdit: boolean) => {
    await saveChequeRecord(savedRecord, currentUser, isEdit);
    const updated = await getChequeRecords();
    setRecords(updated);
    setEditingRecord(null);
    setActiveTab('cheque-register');
  };

  const handleImportBatch = async (newRecords: ChequeRecord[], batch: ImportBatch) => {
    await saveBatchChequeRecords(newRecords, batch, currentUser);
    const updated = await getChequeRecords();
    setRecords(updated);
  };

  const handleAdmImportComplete = async (
    upsertedAdms: AdmMasterRecord[],
    upsertedTeams: TeamMaster[],
    upsertedHeads: DivisionHeadMaster[],
    batch: ImportBatch
  ) => {
    await saveAdmMasterBatch(upsertedAdms, upsertedTeams, upsertedHeads, batch, currentUser);
    const [freshHeads, freshTeams, freshAdms] = await Promise.all([
      getDivisionHeadMasterRecords(),
      getTeamMasterRecords(),
      getAdmMasterRecords(),
    ]);
    setDivisionHeads(freshHeads);
    setTeams(freshTeams);
    setAdmsMaster(freshAdms);
  };

  const handleCustomerImportComplete = async (
    upsertedCustomers: CustomerMasterRecord[],
    batch: ImportBatch
  ) => {
    await saveCustomerMasterBatch(upsertedCustomers, batch, currentUser);
    const freshCustomers = await getCustomerMasterRecords();
    setCustomersMaster(freshCustomers);
  };

  const handleMapCustomerToAdm = async (
    customer: CustomerMasterRecord,
    adm: AdmMasterRecord
  ) => {
    await mapCustomerToAdmMaster(customer, adm, currentUser);
    const freshCustomers = await getCustomerMasterRecords();
    setCustomersMaster(freshCustomers);
  };

  const refreshOrgMasterState = async () => {
    const [freshHeads, freshTeams, freshAdms, freshCustomers] = await Promise.all([
      getDivisionHeadMasterRecords(),
      getTeamMasterRecords(),
      getAdmMasterRecords(),
      getCustomerMasterRecords(),
    ]);
    setDivisionHeads(freshHeads);
    setTeams(freshTeams);
    setAdmsMaster(freshAdms);
    setCustomersMaster(freshCustomers);
  };

  const handleSaveDivisionHead = async (input: SaveDivisionHeadInput) => {
    await saveDivisionHeadMaster(input, currentUser);
    await refreshOrgMasterState();
  };

  const handleSaveTeam = async (input: SaveTeamInput) => {
    await saveTeamMaster(input, currentUser);
    await refreshOrgMasterState();
  };

  const handleSaveAdm = async (input: SaveAdmInput) => {
    await saveAdmMaster(input, currentUser);
    await refreshOrgMasterState();
  };

  const handleSaveCustomer = async (input: SaveCustomerInput) => {
    await saveCustomerMaster(input, currentUser);
    await refreshOrgMasterState();
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
    let newRecovered = record.recoveredAmount || 0;
    if (details.recoveredAmount) {
      newRecovered += details.recoveredAmount;
    } else if (actionType === 'FULL_RECOVERY') {
      newRecovered = record.amount;
    }

    const newRemaining = Math.max(0, record.amount - newRecovered);
    const nextStatus = details.newStatus || (newRemaining === 0 ? 'RECOVERED' : record.recoveryStatus);

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

    const fresh = await getChequeRecords();
    setRecords(fresh);
    if (selectedRecord && selectedRecord.id === record.id) {
      setSelectedRecord(updatedCheque);
    }
  };

  const handleResetDataset = async (loadSample: boolean) => {
    const updated = await resetDataset(loadSample, currentUser);
    setRecords(updated);
  };

  const handlePurgeDatabase = async (options: ClearDatabaseOptions): Promise<ClearDatabaseResult> => {
    const res = await clearEntireDatabase(currentUser, options);
    if (options.clearCheques) {
      setRecords([]);
    }
    if (options.clearOrgMaster) {
      setDivisionHeads([]);
      setTeams([]);
      setAdmsMaster([]);
      setCustomersMaster([]);
    }
    return res;
  };

  const handleUpdateConfig = async (newConfig: AnalyticalConfig) => {
    setConfig(newConfig);
    await saveAnalyticalConfig(newConfig, currentUser);
  };

  const handleCustomerDrilldown = (cxNumber: string) => {
    handleUpdateFilters({ cxNumber });
    setActiveTab('cheque-register');
  };

  const handleAdmDrilldown = (admCode: string) => {
    handleUpdateFilters({ admCode });
    setActiveTab('cheque-register');
  };

  const handleTeamDrilldown = (teamId: string) => {
    handleUpdateFilters({ teamId });
    setActiveTab('cheque-register');
  };

  const handleDivisionHeadDrilldown = (divisionHeadId: string) => {
    handleUpdateFilters({ divisionHeadId });
    setActiveTab('cheque-register');
  };

  const handleDivisionDrilldown = (division: string) => {
    handleUpdateFilters({ division });
    setActiveTab('team-dashboard');
  };

  const handleReasonDrilldown = (reason: string) => {
    handleUpdateFilters({ returnReason: reason });
    setActiveTab('cheque-register');
  };

  const handleSignInGoogle = async () => {
    setCloudNotice(null);
    skipNextAuthReloadRef.current = true;
    try {
      const user = await signInWithGoogle();
      setFirebaseEmail(user.email ?? null);
      setSyncingCloud(true);

      const remoteExists = await hasRemoteChequeRecords();
      if (!remoteExists && (records.length > 0 || admsMaster.length > 0 || customersMaster.length > 0)) {
        const res = await syncLocalDataToFirestore(currentUser);
        const data = await loadAllState();
        setRecords(data.loadedRecords);
        setConfig(data.loadedConfig);
        setDivisionHeads(data.loadedHeads);
        setTeams(data.loadedTeams);
        setAdmsMaster(data.loadedAdms);
        setCustomersMaster(data.loadedCustomers);
        setCloudNotice({
          type: 'success',
          message: `Signed in as ${user.email} and synced ${res.syncedCheques} cheque records & ${res.syncedOrgMaster} org master records to Cloud Firestore.`,
        });
      } else {
        const data = await loadAllState();
        setRecords(data.loadedRecords);
        setConfig(data.loadedConfig);
        setDivisionHeads(data.loadedHeads);
        setTeams(data.loadedTeams);
        setAdmsMaster(data.loadedAdms);
        setCustomersMaster(data.loadedCustomers);
        setCloudNotice({
          type: 'success',
          message: `Connected to Cloud Firestore as ${user.email}. Click "Cloud Synced" anytime to push local edits.`,
        });
      }
    } catch (err: unknown) {
      skipNextAuthReloadRef.current = false;
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed or was cancelled.';
      setCloudNotice({ type: 'error', message: msg });
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleSignOutGoogle = async () => {
    try {
      await signOutFirebase();
      setFirebaseEmail(null);
      setCloudNotice({ type: 'success', message: 'Signed out of Cloud Firestore sync.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-out failed.';
      setCloudNotice({ type: 'error', message: msg });
    }
  };

  const handleSyncToCloud = async () => {
    setSyncingCloud(true);
    setCloudNotice(null);
    try {
      const res = await syncLocalDataToFirestore(currentUser);
      const data = await loadAllState();
      setRecords(data.loadedRecords);
      setConfig(data.loadedConfig);
      setDivisionHeads(data.loadedHeads);
      setTeams(data.loadedTeams);
      setAdmsMaster(data.loadedAdms);
      setCustomersMaster(data.loadedCustomers);
      setCloudNotice({
        type: 'success',
        message: `Cloud Firestore updated: ${res.syncedCheques} cheques, ${res.syncedOrgMaster} org master docs, ${res.syncedActions} recovery actions, ${res.syncedBatches} import batches.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloud sync failed.';
      setCloudNotice({ type: 'error', message: msg });
    } finally {
      setSyncingCloud(false);
    }
  };

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
    'settings': 'Settings & Access Control',
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden">
      {/* Persistent Left Navigation Sidebar */}
      <Sidebar
        currentTab={editingRecord ? 'add-cheque' : activeTab}
        onSelectTab={(tab) => {
          setEditingRecord(null);
          if (tab !== 'organization-management') {
            setOrgInitialSubTab('hierarchy');
          }
          setActiveTab(tab);
        }}
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
          pageTitle={pageTitles[editingRecord ? 'add-cheque' : activeTab]}
          filters={filters}
          onUpdateFilters={handleUpdateFilters}
          onResetFilters={handleResetFilters}
          currentUser={currentUser}
          onChangeUser={(u) => setCurrentUser(u)}
          dataQualityIssuesCount={dataQualityIssues.length}
          onOpenDataQuality={() => setDataQualityModalOpen(true)}
          isSampleDataLoaded={records.some((r) => r.isSample)}
          firebaseEmail={firebaseEmail}
          syncingCloud={syncingCloud}
          onSignInGoogle={handleSignInGoogle}
          onSignOutGoogle={handleSignOutGoogle}
          onSyncToCloud={handleSyncToCloud}
        />

        {/* Cloud Sync Status Banner */}
        {cloudNotice && (
          <div
            className={`px-5 py-2 text-xs flex items-center justify-between border-b ${
              cloudNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <span>{cloudNotice.message}</span>
            <button
              onClick={() => setCloudNotice(null)}
              className="ml-4 text-[11px] font-semibold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-xs text-slate-500">
              <WurthLogo size="lg" />
              <span>Initializing WÜRTH Recovery Intelligence...</span>
            </div>
          ) : (
            <>
              {/* Tab 1: Executive Dashboard */}
              {activeTab === 'executive-dashboard' && !editingRecord && (
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
                    setActiveTab('cheque-register');
                  }}
                  onSelectCustomer={(cxNumber) => {
                    handleCustomerDrilldown(cxNumber);
                  }}
                />
              )}

              {/* Tab 2: Cheque Return Register */}
              {activeTab === 'cheque-register' && !editingRecord && (
                <ChequeRegister
                  records={filteredRecords}
                  filters={filters}
                  onFilterChange={handleUpdateFilters}
                  onSelectRecord={(rec) => setSelectedRecord(rec)}
                  onAddNewRecord={() => {
                    setEditingRecord(null);
                    setActiveTab('add-cheque');
                  }}
                  onBulkImport={() => {
                    setEditingRecord(null);
                    setImportMode('CHEQUE_REGISTER');
                    setActiveTab('data-import');
                  }}
                  onEditRecord={(rec) => {
                    setEditingRecord(rec);
                    setActiveTab('add-cheque');
                  }}
                  currentUser={currentUser}
                />
              )}

              {/* Tab 3: Add / Edit Returned Cheque */}
              {(activeTab === 'add-cheque' || editingRecord) && (
                <AddChequeForm
                  initialRecord={editingRecord}
                  onSave={handleSaveCheque}
                  onCancel={() => {
                    setEditingRecord(null);
                    setActiveTab('cheque-register');
                  }}
                  onNavigateToBulkImport={() => {
                    setEditingRecord(null);
                    setImportMode('CHEQUE_REGISTER');
                    setActiveTab('data-import');
                  }}
                  existingRecords={records}
                  customersMaster={customersMaster}
                  admsMaster={admsMaster}
                  currentUser={currentUser}
                  config={config}
                />
              )}

              {/* Tab 4: Customer Intelligence */}
              {activeTab === 'customer-intelligence' && !editingRecord && (
                <CustomerIntelligence
                  customers={customerIntelligence}
                  allRecords={records}
                  onSelectCheque={(rec) => setSelectedRecord(rec)}
                  onFilterByCustomer={handleCustomerDrilldown}
                />
              )}

              {/* Tab 5: ADM Performance */}
              {activeTab === 'adm-performance' && !editingRecord && (
                <AdmPerformance
                  adms={admIntelligence}
                  allRecords={records}
                  customersMaster={customersMaster}
                  onSelectCheque={(rec) => setSelectedRecord(rec)}
                  onFilterByAdm={handleAdmDrilldown}
                />
              )}

              {/* Tab 6: Team Dashboard */}
              {activeTab === 'team-dashboard' && !editingRecord && (
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

              {/* Tab 7: Division Head Dashboard */}
              {activeTab === 'division-head-dashboard' && !editingRecord && (
                <DivisionHeadDashboard
                  divisionHeads={divisionHeadIntelligence}
                  teams={teamIntelligence}
                  admsMaster={admsMaster}
                  customersMaster={customersMaster}
                  allRecords={filteredRecords}
                  dateBasis={filters.dateBasis}
                  onFilterByDivisionHead={handleDivisionHeadDrilldown}
                  onFilterByDivision={handleDivisionDrilldown}
                  onFilterByTeam={handleTeamDrilldown}
                />
              )}

              {/* Tab 8: Organization Master & Hierarchy */}
              {activeTab === 'organization-management' && !editingRecord && (
                <OrganizationManagement
                  divisionHeads={divisionHeads}
                  teams={teams}
                  adms={admsMaster}
                  customers={customersMaster}
                  chequeRecords={records}
                  historicalAudit={historicalAudit}
                  currentUser={currentUser}
                  initialSubTab={orgInitialSubTab}
                  onRefreshOrgData={refreshOrgMasterState}
                  onNavigateToImport={(mode) => {
                    setImportMode(mode);
                    setActiveTab('data-import');
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
              {activeTab === 'reason-analysis' && !editingRecord && (
                <ReturnReasonAnalysis
                  reasons={reasonIntelligence}
                  allRecords={records}
                  onSelectCheque={(rec) => setSelectedRecord(rec)}
                  onFilterByReason={handleReasonDrilldown}
                />
              )}

              {/* Tab 10: Recovery Action Centre */}
              {activeTab === 'recovery-actions' && !editingRecord && (
                <RecoveryActionCentre
                  records={filteredRecords}
                  onSelectRecord={(rec) => setSelectedRecord(rec)}
                  onLogAction={handleLogRecoveryAction}
                  currentUser={currentUser}
                />
              )}

              {/* Tab 11: Trends & Anomalies */}
              {activeTab === 'trends-anomalies' && !editingRecord && (
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
              {activeTab === 'reports-exports' && !editingRecord && (
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
              {activeTab === 'data-import' && !editingRecord && (
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
                    setActiveTab('organization-management');
                  }}
                  onNavigateToChequeRegister={() => setActiveTab('cheque-register')}
                  currentUser={currentUser}
                  config={config}
                />
              )}

              {/* Tab 14: Audit Log */}
              {activeTab === 'audit-log' && !editingRecord && <AuditLogView />}

              {/* Tab 15: Settings & Access Control */}
              {activeTab === 'settings' && !editingRecord && (
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
          setSelectedRecord(null);
          setEditingRecord(rec);
          setActiveTab('add-cheque');
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
    </div>
  );
}
