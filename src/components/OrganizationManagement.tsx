import React, { useState, useMemo, useEffect } from 'react';
import {
  GitBranch,
  AlertTriangle,
  Search,
  UploadCloud,
  Plus,
  Pencil,
  Info,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  DivisionHeadMaster,
  TeamMaster,
  AdmMasterRecord,
  CustomerMasterRecord,
  ChequeRecord,
  HistoricalLinkageAudit,
  UserProfile,
} from '../types';
import { formatLKR } from '../services/analytics';
import {
  SaveDivisionHeadInput,
  SaveTeamInput,
  SaveAdmInput,
  SaveCustomerInput,
} from '../services/firebase';
import {
  DivisionHeadModal,
  TeamModal,
  AdmModal,
  CustomerModal,
} from './OrganizationMasterModals';

export type OrgSubTab = 'hierarchy' | 'heads' | 'teams' | 'adms' | 'customers' | 'historical';

const normOrgKey = (val?: string | null): string => (val || '').trim().toUpperCase();
const CUSTOMER_PAGE_SIZE = 50;

interface OrganizationManagementProps {
  divisionHeads: DivisionHeadMaster[];
  teams: TeamMaster[];
  adms: AdmMasterRecord[];
  customers: CustomerMasterRecord[];
  chequeRecords: ChequeRecord[];
  historicalAudit: HistoricalLinkageAudit;
  currentUser: UserProfile;
  initialSubTab?: OrgSubTab;
  onRefreshOrgData?: () => Promise<void>;
  onNavigateToImport: (mode: 'ADM_MASTER' | 'CUSTOMER_MASTER') => void;
  onMapCustomerToAdm: (customer: CustomerMasterRecord, adm: AdmMasterRecord) => Promise<void>;
  onSaveDivisionHead: (input: SaveDivisionHeadInput) => Promise<void>;
  onSaveTeam: (input: SaveTeamInput) => Promise<void>;
  onSaveAdm: (input: SaveAdmInput) => Promise<void>;
  onSaveCustomer: (input: SaveCustomerInput) => Promise<void>;
  onSelectCheque: (record: ChequeRecord) => void;
}

export const OrganizationManagement: React.FC<OrganizationManagementProps> = ({
  divisionHeads,
  teams,
  adms,
  customers,
  chequeRecords,
  historicalAudit,
  currentUser,
  initialSubTab,
  onRefreshOrgData,
  onNavigateToImport,
  onMapCustomerToAdm,
  onSaveDivisionHead,
  onSaveTeam,
  onSaveAdm,
  onSaveCustomer,
  onSelectCheque,
}) => {
  const [subTab, setSubTab] = useState<OrgSubTab>(initialSubTab || 'hierarchy');
  const [search, setSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'NEEDS_REVIEW' | 'UNMAPPED_ADM'
  >('ALL');
  const [customerPage, setCustomerPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  useEffect(() => {
    setCustomerPage(1);
  }, [search, customerStatusFilter, customers.length]);
  const [selectedHeadId, setSelectedHeadId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedAdmNum, setSelectedAdmNum] = useState<string>('');
  const [mappingCustomer, setMappingCustomer] = useState<CustomerMasterRecord | null>(null);
  const [chosenAdmId, setChosenAdmId] = useState<string>('');
  const [mappingBusy, setMappingBusy] = useState(false);

  // Manual Add / Edit Modal States
  const [headModalOpen, setHeadModalOpen] = useState(false);
  const [editingHead, setEditingHead] = useState<DivisionHeadMaster | null>(null);

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamMaster | null>(null);

  const [admModalOpen, setAdmModalOpen] = useState(false);
  const [editingAdm, setEditingAdm] = useState<AdmMasterRecord | null>(null);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerMasterRecord | null>(null);

  const canManageOrg =
    currentUser.role === 'RECOVERY_SUPERVISOR' || currentUser.role === 'SYSTEM_ADMIN';

  const unmappedCustomersCount = customers.filter((c) => c.requiresAdmMapping).length;
  const mismatchCustomersCount = customers.filter(
    (c) => Boolean(c.nameMismatchWarning) && !c.requiresAdmMapping
  ).length;
  const reviewAdmsCount = adms.filter((a) => a.verificationStatus === 'NEEDS_VERIFICATION').length;

  const existingDivisions = useMemo(() => {
    const set = new Set<string>();
    for (const h of divisionHeads) {
      for (const d of h.divisions || []) if (d) set.add(d);
    }
    for (const t of teams) if (t.division) set.add(t.division);
    return Array.from(set).sort();
  }, [divisionHeads, teams]);

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => !selectedHeadId || t.divisionHeadId === selectedHeadId);
  }, [teams, selectedHeadId]);

  const filteredAdmsInTree = useMemo(() => {
    return adms.filter((a) => {
      if (selectedHeadId && a.divisionHeadId !== selectedHeadId) return false;
      if (selectedTeamId && a.teamId !== selectedTeamId) return false;
      return true;
    });
  }, [adms, selectedHeadId, selectedTeamId]);

  const filteredCustomersInTree = useMemo(() => {
    return customers.filter((c) => {
      if (selectedHeadId && c.divisionHeadId !== selectedHeadId) return false;
      if (selectedTeamId && c.teamId !== selectedTeamId) return false;
      if (selectedAdmNum && normOrgKey(c.admNumber) !== normOrgKey(selectedAdmNum)) return false;
      return true;
    });
  }, [customers, selectedHeadId, selectedTeamId, selectedAdmNum]);

  const filteredHeadsTable = useMemo(() => {
    if (!search) return divisionHeads;
    const q = search.toLowerCase().trim();
    return divisionHeads.filter(
      (dh) =>
        (dh.name || '').toLowerCase().includes(q) ||
        (dh.divisions || []).some((d) => (d || '').toLowerCase().includes(q))
    );
  }, [divisionHeads, search]);

  const filteredTeamsTable = useMemo(() => {
    if (!search) return teams;
    const q = search.toLowerCase().trim();
    return teams.filter(
      (t) =>
        (t.teamName || '').toLowerCase().includes(q) ||
        (t.division || '').toLowerCase().includes(q) ||
        (t.divisionHeadName || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q)
    );
  }, [teams, search]);

  const filteredAdmsTable = useMemo(() => {
    if (!search) return adms;
    const q = search.toLowerCase().trim();
    return adms.filter(
      (a) =>
        (a.admNumber || '').toLowerCase().includes(q) ||
        (a.empId || '').toLowerCase().includes(q) ||
        (a.salesRepName || '').toLowerCase().includes(q) ||
        (a.teamName || '').toLowerCase().includes(q) ||
        (a.division || '').toLowerCase().includes(q) ||
        (a.divisionHeadName || '').toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q)
    );
  }, [adms, search]);

  const filteredCustomersTable = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers.filter((c) => {
      if (customerStatusFilter !== 'ALL' && c.customerStatus !== customerStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (c.customerId || '').toLowerCase().includes(q) ||
        (c.customerName || '').toLowerCase().includes(q) ||
        (c.admNumber || '').toLowerCase().includes(q) ||
        (c.salesRepName || '').toLowerCase().includes(q) ||
        (c.uploadedSalesRepName || '').toLowerCase().includes(q) ||
        (c.teamName || '').toLowerCase().includes(q) ||
        (c.division || '').toLowerCase().includes(q) ||
        (c.divisionHead || '').toLowerCase().includes(q) ||
        (c.customerPhone || '').toLowerCase().includes(q)
      );
    });
  }, [customers, search, customerStatusFilter]);

  const totalCustomerPages = Math.max(1, Math.ceil(filteredCustomersTable.length / CUSTOMER_PAGE_SIZE));
  const safeCustomerPage = Math.min(customerPage, totalCustomerPages);
  const paginatedCustomers = useMemo(() => {
    const start = (safeCustomerPage - 1) * CUSTOMER_PAGE_SIZE;
    return filteredCustomersTable.slice(start, start + CUSTOMER_PAGE_SIZE);
  }, [filteredCustomersTable, safeCustomerPage]);

  const handleRefresh = async () => {
    if (!onRefreshOrgData || refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshOrgData();
    } finally {
      setRefreshing(false);
    }
  };

  const selectedAdmObj = useMemo(
    () => (selectedAdmNum ? adms.find((a) => normOrgKey(a.admNumber) === normOrgKey(selectedAdmNum)) : undefined),
    [adms, selectedAdmNum]
  );

  const handleConfirmAdmMapping = async () => {
    if (!mappingCustomer || !chosenAdmId) return;
    const adm = adms.find((a) => a.id === chosenAdmId);
    if (!adm) return;
    setMappingBusy(true);
    try {
      await onMapCustomerToAdm(mappingCustomer, adm);
      setMappingCustomer(null);
      setChosenAdmId('');
    } finally {
      setMappingBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Organization Summary Strip & Actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-red-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Organization Hierarchy & Master Data Governance
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative structure: <strong>DIVISION HEAD → DIVISION → TEAM → ADM → CUSTOMER</strong>
          </p>
        </div>

        {canManageOrg && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setEditingHead(null);
                setHeadModalOpen(true);
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Add Head</span>
            </button>
            <button
              onClick={() => {
                setEditingTeam(null);
                setTeamModalOpen(true);
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Add Team</span>
            </button>
            <button
              onClick={() => {
                setEditingAdm(null);
                setAdmModalOpen(true);
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Add ADM</span>
            </button>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setCustomerModalOpen(true);
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Add Customer</span>
            </button>

            <button
              onClick={() => onNavigateToImport('ADM_MASTER')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5 text-red-400" />
              <span>Bulk ADM</span>
            </button>
            <button
              onClick={() => onNavigateToImport('CUSTOMER_MASTER')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Bulk Customer</span>
            </button>
          </div>
        )}
      </div>

      {/* Role Notice if user is currently in read-only role */}
      {!canManageOrg && (
        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            Viewing Organization Master in read-only mode (<strong>{currentUser.role.replace('_', ' ')}</strong>).
            Switch to <strong>Recovery Supervisor</strong> or <strong>System Admin</strong> in the top-right user menu to add or edit Division Heads, Teams, ADMs, and Customers.
          </span>
        </div>
      )}

      {/* Hierarchy KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setSubTab('heads')}
          className="text-left p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
        >
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Division Heads</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">{divisionHeads.length}</div>
          <div className="text-[10px] text-slate-400">
            {existingDivisions.length} Divisions
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('teams')}
          className="text-left p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
        >
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Teams</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">{teams.length}</div>
          <div className="text-[10px] text-slate-400">Division-scoped unique IDs</div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('adms')}
          className="text-left p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors"
        >
          <span className="text-[10px] font-semibold text-slate-500 uppercase">ADM Master</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">{adms.length}</div>
          <div className="text-[10px] text-emerald-700 font-mono">
            {adms.filter((a) => a.employeeStatus === 'ACTIVE').length} Active ·{' '}
            {adms.filter((a) => a.employeeStatus === 'INACTIVE').length} Inactive
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('customers')}
          className="text-left p-3 bg-white border border-slate-200 hover:border-red-300 rounded-lg transition-colors"
        >
          <span className="text-[10px] font-semibold text-slate-500 uppercase">Customer Master</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">{customers.length}</div>
          <div className="text-[10px] text-red-600 font-medium">View directory →</div>
        </button>

        <div
          className={`p-3 border rounded-lg ${
            unmappedCustomersCount + reviewAdmsCount > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <span className="text-[10px] font-semibold text-amber-800 uppercase">Review / Unmapped</span>
          <div className="text-xl font-bold text-amber-800 font-mono mt-1">
            {unmappedCustomersCount + mismatchCustomersCount + reviewAdmsCount}
          </div>
          <div className="text-[10px] text-amber-700">
            {unmappedCustomersCount} unmapped · {mismatchCustomersCount + reviewAdmsCount} warnings
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-lg">
          <span className="text-[10px] font-semibold text-slate-500 uppercase">
            Historical Cheques Linked
          </span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
            {historicalAudit.totalCheques > 0
              ? `${Math.round((historicalAudit.customerMappedCount / historicalAudit.totalCheques) * 100)}%`
              : '—'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {historicalAudit.customerMappedCount}/{historicalAudit.totalCheques} CX ·{' '}
            {historicalAudit.admMappedCount}/{historicalAudit.totalCheques} ADM
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 border border-slate-200 rounded-lg">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'hierarchy', label: 'Hierarchy Explorer' },
            { id: 'heads', label: `Division Heads (${divisionHeads.length})` },
            { id: 'teams', label: `Teams (${teams.length})` },
            { id: 'adms', label: `ADM Master (${adms.length})` },
            { id: 'customers', label: `Customer Master (${customers.length})` },
            {
              id: 'historical',
              label: `Historical Linkage (${historicalAudit.unmappedChequeDetails.length} Unmapped)`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                subTab === tab.id
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(subTab === 'heads' || subTab === 'teams' || subTab === 'adms' || subTab === 'customers') && (
          <div className="relative min-w-[240px]">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search master directory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
            />
          </div>
        )}
      </div>

      {/* TAB 1: Interactive Hierarchy Explorer */}
      {subTab === 'hierarchy' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Column 1: Division Heads & Divisions */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-[520px]">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase truncate">
                1. Division Heads ({divisionHeads.length})
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {selectedHeadId && (
                  <button
                    onClick={() => {
                      setSelectedHeadId('');
                      setSelectedTeamId('');
                      setSelectedAdmNum('');
                    }}
                    className="text-[10px] text-red-600 font-semibold"
                  >
                    Reset
                  </button>
                )}
                {canManageOrg && (
                  <button
                    onClick={() => {
                      setEditingHead(null);
                      setHeadModalOpen(true);
                    }}
                    className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-slate-900 text-white hover:bg-slate-800 rounded font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {divisionHeads.map((dh) => (
                <div
                  key={dh.id}
                  onClick={() => {
                    setSelectedHeadId(dh.id === selectedHeadId ? '' : dh.id);
                    setSelectedTeamId('');
                    setSelectedAdmNum('');
                  }}
                  className={`w-full text-left p-3 text-xs transition-colors cursor-pointer group ${
                    selectedHeadId === dh.id
                      ? 'bg-red-50 border-l-4 border-l-red-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
                    <span className="truncate">{dh.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {dh.verificationStatus === 'NEEDS_VERIFICATION' && (
                        <span title={dh.verificationReason} className="shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        </span>
                      )}
                      {canManageOrg && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingHead(dh);
                            setHeadModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-white"
                          title="Edit Division Head"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Division: <strong>{dh.divisions.join(', ')}</strong>
                  </div>
                </div>
              ))}
              {divisionHeads.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No Division Heads yet. Click "+ Add" to create one.
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Teams */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-[520px]">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase truncate">
                2. Teams ({filteredTeams.length})
              </span>
              {canManageOrg && (
                <button
                  onClick={() => {
                    setEditingTeam(null);
                    setTeamModalOpen(true);
                  }}
                  className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-slate-900 text-white hover:bg-slate-800 rounded font-semibold shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredTeams.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTeamId(t.id === selectedTeamId ? '' : t.id);
                    setSelectedAdmNum('');
                  }}
                  className={`w-full text-left p-3 text-xs transition-colors cursor-pointer ${
                    selectedTeamId === t.id
                      ? 'bg-red-50 border-l-4 border-l-red-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
                    <span className="truncate">{t.teamName}</span>
                    {canManageOrg && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTeam(t);
                          setTeamModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-white shrink-0"
                        title="Edit Team"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {t.division} · {adms.filter((a) => a.teamId === t.id).length} ADMs
                  </div>
                </div>
              ))}
              {filteredTeams.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">No Teams in selection.</div>
              )}
            </div>
          </div>

          {/* Column 3: ADMs */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-[520px]">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase truncate">
                3. ADMs ({filteredAdmsInTree.length})
              </span>
              {canManageOrg && (
                <button
                  onClick={() => {
                    setEditingAdm(null);
                    setAdmModalOpen(true);
                  }}
                  className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-slate-900 text-white hover:bg-slate-800 rounded font-semibold shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredAdmsInTree.map((a) => (
                <div
                  key={a.id}
                  onClick={() =>
                    setSelectedAdmNum(a.admNumber === selectedAdmNum ? '' : a.admNumber)
                  }
                  className={`w-full text-left p-3 text-xs transition-colors cursor-pointer ${
                    selectedAdmNum === a.admNumber
                      ? 'bg-red-50 border-l-4 border-l-red-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 truncate">{a.salesRepName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                        {a.admNumber}
                      </span>
                      {canManageOrg && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAdm(a);
                            setAdmModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-white"
                          title="Edit ADM"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Emp {a.empId} · {a.employeeStatus} ·{' '}
                    {customers.filter((c) => normOrgKey(c.admNumber) === normOrgKey(a.admNumber)).length} Cx
                  </div>
                </div>
              ))}
              {filteredAdmsInTree.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">No ADMs in selection.</div>
              )}
            </div>
          </div>

          {/* Column 4: Customers */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-[520px]">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase truncate">
                4. Customers ({filteredCustomersInTree.length})
              </span>
              {canManageOrg && (
                <button
                  onClick={() => {
                    setEditingCustomer(null);
                    setCustomerModalOpen(true);
                  }}
                  className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-red-600 text-white hover:bg-red-700 rounded font-semibold shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredCustomersInTree.slice(0, 100).map((c) => (
                <div key={c.id} className="p-3 text-xs hover:bg-slate-50">
                  <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
                    <span className="truncate">{c.customerName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.requiresAdmMapping && canManageOrg && (
                        <button
                          onClick={() => {
                            setMappingCustomer(c);
                            setChosenAdmId('');
                          }}
                          className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold"
                        >
                          Map ADM
                        </button>
                      )}
                      {canManageOrg && (
                        <button
                          onClick={() => {
                            setEditingCustomer(c);
                            setCustomerModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-white"
                          title="Edit Customer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {c.customerId} · ADM {c.admNumber}
                  </div>
                  {c.customerPhone && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{c.customerPhone}</div>
                  )}
                </div>
              ))}
              {filteredCustomersInTree.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                  <div>No Customers in selection.</div>
                  {customers.length > 0 && selectedAdmNum && (
                    <button
                      onClick={() => setSubTab('customers')}
                      className="text-[11px] font-semibold text-red-600 hover:underline"
                    >
                      Browse all {customers.length} customers in Customer Master →
                    </button>
                  )}
                </div>
              )}
              {filteredCustomersInTree.length > 100 && (
                <div className="p-3 bg-slate-50 text-center border-t border-slate-200">
                  <div className="text-[10px] text-slate-500 mb-1">
                    Showing first 100 of {filteredCustomersInTree.length} customers in tree view.
                  </div>
                  <button
                    onClick={() => setSubTab('customers')}
                    className="text-[11px] font-semibold text-red-600 hover:underline"
                  >
                    Open Full Customer Master Directory ({customers.length}) →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Division Heads Directory */}
      {subTab === 'heads' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase">
              Division Head Master Directory
            </span>
            {canManageOrg && (
              <button
                onClick={() => {
                  setEditingHead(null);
                  setHeadModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Division Head</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Division Head Name</th>
                  <th className="py-2.5 px-2">Responsible Divisions</th>
                  <th className="py-2.5 px-2 text-center">Teams</th>
                  <th className="py-2.5 px-2 text-center">ADMs</th>
                  <th className="py-2.5 px-2 text-center">Customers</th>
                  <th className="py-2.5 px-2">Verification</th>
                  {canManageOrg && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHeadsTable.map((dh) => {
                  const dhTeams = teams.filter((t) => t.divisionHeadId === dh.id);
                  const dhAdms = adms.filter((a) => a.divisionHeadId === dh.id);
                  const dhCustomers = customers.filter((c) => c.divisionHeadId === dh.id);
                  return (
                    <tr key={dh.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        <div>{dh.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{dh.id}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-700">{dh.divisions.join(', ')}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{dhTeams.length}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{dhAdms.length}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{dhCustomers.length}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            dh.verificationStatus === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {dh.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'NEEDS VERIFICATION'}
                        </span>
                        {dh.verificationReason && (
                          <div className="text-[10px] text-amber-700 mt-0.5">{dh.verificationReason}</div>
                        )}
                      </td>
                      {canManageOrg && (
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => {
                              setEditingHead(dh);
                              setHeadModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredHeadsTable.length === 0 && (
                  <tr>
                    <td colSpan={canManageOrg ? 7 : 6} className="py-10 text-center text-slate-400">
                      No Division Head records found. Click "Add Division Head" or upload via Bulk ADM Master.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Teams Directory */}
      {subTab === 'teams' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase">
              Team Master Directory (Division-Scoped)
            </span>
            {canManageOrg && (
              <button
                onClick={() => {
                  setEditingTeam(null);
                  setTeamModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Team</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Team Name & ID</th>
                  <th className="py-2.5 px-2">Division</th>
                  <th className="py-2.5 px-2">Responsible Division Head</th>
                  <th className="py-2.5 px-2 text-center">ADMs</th>
                  <th className="py-2.5 px-2 text-center">Customers</th>
                  {canManageOrg && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeamsTable.map((t) => {
                  const tAdms = adms.filter((a) => a.teamId === t.id);
                  const tCustomers = customers.filter((c) => c.teamId === t.id);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{t.teamName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{t.id}</div>
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-800">{t.division}</td>
                      <td className="py-2.5 px-2 text-slate-700">{t.divisionHeadName}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{tAdms.length}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{tCustomers.length}</td>
                      {canManageOrg && (
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => {
                              setEditingTeam(t);
                              setTeamModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredTeamsTable.length === 0 && (
                  <tr>
                    <td colSpan={canManageOrg ? 6 : 5} className="py-10 text-center text-slate-400">
                      No Team Master records found. Click "Add Team" or upload via Bulk ADM Master.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ADM Master Directory */}
      {subTab === 'adms' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase">ADM Master Directory</span>
            {canManageOrg && (
              <button
                onClick={() => {
                  setEditingAdm(null);
                  setAdmModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add ADM</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Emp ID</th>
                  <th className="py-2.5 px-2">ADM#</th>
                  <th className="py-2.5 px-3">Sales Rep. Name</th>
                  <th className="py-2.5 px-2">Team (ID / Name)</th>
                  <th className="py-2.5 px-2">Division</th>
                  <th className="py-2.5 px-2">Division Head</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-3">Contact (Mobile / Email)</th>
                  {canManageOrg && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdmsTable.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-600">{a.empId}</td>
                    <td className="py-2.5 px-2 font-mono font-bold text-slate-900">{a.admNumber}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{a.salesRepName}</div>
                      {a.verificationStatus === 'NEEDS_VERIFICATION' && (
                        <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{a.verificationReason}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-800">{a.teamName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{a.teamId}</div>
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">{a.division}</td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-800">{a.divisionHeadName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{a.divisionHeadId}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          a.employeeStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-200 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {a.employeeStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-600">
                      <div>{a.mobileNo || '—'}</div>
                      <div className="text-slate-400">{a.email || '—'}</div>
                    </td>
                    {canManageOrg && (
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => {
                            setEditingAdm(a);
                            setAdmModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredAdmsTable.length === 0 && (
                  <tr>
                    <td colSpan={canManageOrg ? 9 : 8} className="py-10 text-center text-slate-400">
                      No ADM Master records loaded yet. Click "Add ADM" or use "Bulk ADM" to upload the 9-column template.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: Customer Master Directory */}
      {subTab === 'customers' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase">
                Customer Master Directory ({filteredCustomersTable.length}
                {filteredCustomersTable.length !== customers.length ? ` of ${customers.length}` : ''})
              </span>
              <div className="flex flex-wrap items-center gap-1 ml-1">
                {(
                  [
                    { id: 'ALL', label: `All (${customers.length})` },
                    {
                      id: 'ACTIVE',
                      label: `Active (${customers.filter((c) => c.customerStatus === 'ACTIVE').length})`,
                    },
                    {
                      id: 'NEEDS_REVIEW',
                      label: `Review (${customers.filter((c) => c.customerStatus === 'NEEDS_REVIEW').length})`,
                    },
                    {
                      id: 'UNMAPPED_ADM',
                      label: `Unmapped (${customers.filter((c) => c.customerStatus === 'UNMAPPED_ADM').length})`,
                    },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setCustomerStatusFilter(chip.id)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded border transition-colors ${
                      customerStatusFilter === chip.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onRefreshOrgData && (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded disabled:opacity-50"
                  title="Reload Organization & Customer Master data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              )}
              {canManageOrg && (
                <button
                  onClick={() => {
                    setEditingCustomer(null);
                    setCustomerModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Customer</span>
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Customer ID & Name</th>
                  <th className="py-2.5 px-2">ADM# (Authoritative)</th>
                  <th className="py-2.5 px-2">Sales Rep Name</th>
                  <th className="py-2.5 px-2">Phone</th>
                  <th className="py-2.5 px-2">Team / Division</th>
                  <th className="py-2.5 px-2">Division Head</th>
                  <th className="py-2.5 px-2">Status & Effective Date</th>
                  {canManageOrg && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{c.customerName || '—'}</div>
                      <div className="text-[10px] font-mono text-slate-500">{c.customerId || '—'}</div>
                    </td>
                    <td className="py-2.5 px-2 font-mono font-bold text-slate-900">
                      {c.admNumber || '—'}
                      <div className="text-[10px] font-normal text-slate-400">{c.admReference || '—'}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-800">{c.salesRepName || '—'}</div>
                      {c.nameMismatchWarning && (
                        <div className="text-[10px] text-amber-700 mt-0.5" title={c.nameMismatchWarning}>
                          Uploaded: &ldquo;{c.uploadedSalesRepName}&rdquo; (mismatch)
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-slate-600">{c.customerPhone || '—'}</td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-800">{c.teamName || '—'}</div>
                      <div className="text-[10px] text-slate-500">{c.division || '—'}</div>
                    </td>
                    <td className="py-2.5 px-2 text-slate-700">{c.divisionHead || '—'}</td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          c.customerStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.customerStatus === 'UNMAPPED_ADM'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {c.customerStatus || 'ACTIVE'}
                      </span>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        Eff: {c.assignmentEffectiveDate || '—'}
                      </div>
                    </td>
                    {canManageOrg && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {(c.requiresAdmMapping || c.nameMismatchWarning) && (
                            <button
                              onClick={() => {
                                setMappingCustomer(c);
                                setChosenAdmId('');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 rounded border border-red-200"
                            >
                              Map ADM#
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingCustomer(c);
                              setCustomerModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredCustomersTable.length === 0 && (
                  <tr>
                    <td colSpan={canManageOrg ? 8 : 7} className="py-10 text-center text-slate-500">
                      <div className="space-y-2">
                        <div>
                          {customers.length === 0
                            ? 'No Customer Master records loaded yet.'
                            : 'No Customer Master records match the current search or status filter.'}
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-1">
                          {(search || customerStatusFilter !== 'ALL') && (
                            <button
                              onClick={() => {
                                setSearch('');
                                setCustomerStatusFilter('ALL');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                            >
                              Clear Filters
                            </button>
                          )}
                          {customers.length === 0 && canManageOrg && (
                            <>
                              <button
                                onClick={() => onNavigateToImport('CUSTOMER_MASTER')}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
                              >
                                Upload Customer Master Excel/CSV
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCustomer(null);
                                  setCustomerModalOpen(true);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                              >
                                Add Customer Manually
                              </button>
                            </>
                          )}
                          {onRefreshOrgData && (
                            <button
                              onClick={handleRefresh}
                              disabled={refreshing}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded border border-slate-300"
                            >
                              {refreshing ? 'Refreshing...' : 'Refresh Data'}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredCustomersTable.length > CUSTOMER_PAGE_SIZE && (
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Showing{' '}
                <strong>
                  {(safeCustomerPage - 1) * CUSTOMER_PAGE_SIZE + 1}–
                  {Math.min(safeCustomerPage * CUSTOMER_PAGE_SIZE, filteredCustomersTable.length)}
                </strong>{' '}
                of <strong>{filteredCustomersTable.length}</strong> customers
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                  disabled={safeCustomerPage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded font-medium hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="px-2 font-mono">
                  Page {safeCustomerPage} / {totalCustomerPages}
                </span>
                <button
                  onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                  disabled={safeCustomerPage >= totalCustomerPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded font-medium hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Section 5 Historical Data Integration & Unmapped Cheque Audit */}
      {subTab === 'historical' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Cheques Mapped to Customer ID
              </span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                {historicalAudit.customerMappedCount} / {historicalAudit.totalCheques}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Cheques Mapped to ADM#
              </span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                {historicalAudit.admMappedCount} / {historicalAudit.totalCheques}
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Reassigned Since Historical Return
              </span>
              <div className="text-lg font-bold font-mono text-amber-700 mt-0.5">
                {historicalAudit.reassignedFromHistoricalAdmCount}
              </div>
              <span className="text-[10px] text-slate-500">Historical ADM attribution preserved</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Unmapped Historical Cheques
              </span>
              <div className="text-lg font-bold font-mono text-red-600 mt-0.5">
                {historicalAudit.unmappedChequeDetails.length}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase">
                Historical Returned Cheques Lacking Customer Master or ADM Master Linkage
              </h4>
              <span className="text-[11px] text-slate-500">
                Transaction values and historical ADM attribution remain intact
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/60 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2 px-3">Date Posted</th>
                    <th className="py-2 px-2">Cheque Ref</th>
                    <th className="py-2 px-2">CX NUMBER (Customer)</th>
                    <th className="py-2 px-2">Historical ADM CODE</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-3">Missing Master Linkage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historicalAudit.unmappedChequeDetails.map((u) => {
                    const rec = chequeRecords.find((r) => r.id === u.chequeId);
                    return (
                      <tr
                        key={u.chequeId}
                        onClick={() => rec && onSelectCheque(rec)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono text-slate-600">{u.datePosted}</td>
                        <td className="py-2 px-2 font-mono font-semibold text-slate-900">
                          {u.description}
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-mono font-semibold text-slate-800">{u.cxNumber}</span>{' '}
                          <span className="text-slate-600">{u.cxName}</span>
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-mono text-slate-800">{u.admCode}</span>{' '}
                          <span className="text-slate-500">({u.admName})</span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-semibold">
                          {formatLKR(u.amount)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {u.missingCustomerMaster && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                Unmapped Customer ID
                              </span>
                            )}
                            {u.missingAdmMaster && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold">
                                Unmapped ADM#
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {historicalAudit.unmappedChequeDetails.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-emerald-700 font-medium">
                        All {historicalAudit.totalCheques} historical cheque records are mapped to both Customer Master and ADM Master.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Manual ADM# Mapping on Unmapped / Mismatched Customers */}
      {mappingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Assign Authoritative ADM# to Customer
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
              <div>
                <strong>Customer:</strong> {mappingCustomer.customerName} ({mappingCustomer.customerId})
              </div>
              <div>
                <strong>Current Uploaded ADM#:</strong>{' '}
                <span className="font-mono">{mappingCustomer.admNumber}</span>
              </div>
              <div>
                <strong>Uploaded Sales Rep:</strong> {mappingCustomer.uploadedSalesRepName || '—'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Authoritative ADM Master Record:
              </label>
              <select
                value={chosenAdmId}
                onChange={(e) => setChosenAdmId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              >
                <option value="">-- Choose ADM# --</option>
                {adms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.admNumber} — {a.salesRepName} ({a.teamName} / {a.division}) [{a.employeeStatus}]
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setMappingCustomer(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdmMapping}
                disabled={!chosenAdmId || mappingBusy}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded"
              >
                {mappingBusy ? 'Mapping...' : 'Confirm ADM Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add / Edit Modals */}
      <DivisionHeadModal
        isOpen={headModalOpen}
        initialHead={editingHead}
        onClose={() => {
          setHeadModalOpen(false);
          setEditingHead(null);
        }}
        onSave={onSaveDivisionHead}
      />

      <TeamModal
        isOpen={teamModalOpen}
        initialTeam={editingTeam}
        defaultHeadId={selectedHeadId || undefined}
        divisionHeads={divisionHeads}
        existingDivisions={existingDivisions}
        onClose={() => {
          setTeamModalOpen(false);
          setEditingTeam(null);
        }}
        onSave={onSaveTeam}
      />

      <AdmModal
        isOpen={admModalOpen}
        initialAdm={editingAdm}
        defaultTeamId={selectedTeamId || undefined}
        teams={teams}
        onClose={() => {
          setAdmModalOpen(false);
          setEditingAdm(null);
        }}
        onSave={onSaveAdm}
      />

      <CustomerModal
        isOpen={customerModalOpen}
        initialCustomer={editingCustomer}
        defaultAdmId={selectedAdmObj?.id}
        adms={adms}
        onClose={() => {
          setCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        onSave={onSaveCustomer}
      />
    </div>
  );
};
