import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  DivisionHeadMaster,
  TeamMaster,
  AdmMasterRecord,
  CustomerMasterRecord,
  EmployeeStatus,
} from '../types';
import {
  SaveDivisionHeadInput,
  SaveTeamInput,
  SaveAdmInput,
  SaveCustomerInput,
} from '../services/firebase';

// ============================================================
// 1. Add / Edit Division Head Modal
// ============================================================

interface DivisionHeadModalProps {
  isOpen: boolean;
  initialHead: DivisionHeadMaster | null;
  onClose: () => void;
  onSave: (input: SaveDivisionHeadInput) => Promise<void>;
}

export const DivisionHeadModal: React.FC<DivisionHeadModalProps> = ({
  isOpen,
  initialHead,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [divisionsText, setDivisionsText] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'VERIFIED' | 'NEEDS_VERIFICATION'>('VERIFIED');
  const [verificationReason, setVerificationReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialHead?.name || '');
    setDivisionsText(initialHead?.divisions.join(', ') || '');
    setVerificationStatus(initialHead?.verificationStatus || 'VERIFIED');
    setVerificationReason(initialHead?.verificationReason || '');
    setError(null);
  }, [isOpen, initialHead]);

  if (!isOpen) return null;

  const parsedDivisions = divisionsText
    .split(',')
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Division Head Name is required.');
      return;
    }
    if (parsedDivisions.length === 0) {
      setError('Enter at least one Division (separate multiple divisions with commas).');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initialHead?.id,
        name: name.trim(),
        divisions: parsedDivisions,
        verificationStatus,
        verificationReason: verificationStatus === 'NEEDS_VERIFICATION' ? verificationReason.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save Division Head.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {initialHead ? 'Edit Division Head' : 'Add New Division Head'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Division Head Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Suresh Fernando"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Responsible Division(s) <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={divisionsText}
              onChange={(e) => setDivisionsText(e.target.value)}
              placeholder="e.g. Automotive, Cargo"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Separate multiple divisions with commas. Teams and ADMs assigned to this Division Head will stay synchronized.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Verification Status</label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as 'VERIFIED' | 'NEEDS_VERIFICATION')}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              >
                <option value="VERIFIED">Verified</option>
                <option value="NEEDS_VERIFICATION">Needs Verification</option>
              </select>
            </div>

            {verificationStatus === 'NEEDS_VERIFICATION' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Verification Note</label>
                <input
                  type="text"
                  value={verificationReason}
                  onChange={(e) => setVerificationReason(e.target.value)}
                  placeholder="Reason requiring review..."
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>
            )}
          </div>

          {initialHead && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
              Updating this Division Head name will automatically cascade to all linked Teams, ADMs, and Customers.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : initialHead ? 'Save Division Head' : 'Create Division Head'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 2. Add / Edit Team Modal
// ============================================================

interface TeamModalProps {
  isOpen: boolean;
  initialTeam: TeamMaster | null;
  defaultHeadId?: string;
  divisionHeads: DivisionHeadMaster[];
  existingDivisions: string[];
  onClose: () => void;
  onSave: (input: SaveTeamInput) => Promise<void>;
}

export const TeamModal: React.FC<TeamModalProps> = ({
  isOpen,
  initialTeam,
  defaultHeadId,
  divisionHeads,
  existingDivisions,
  onClose,
  onSave,
}) => {
  const [teamName, setTeamName] = useState('');
  const [division, setDivision] = useState('');
  const [divisionHeadId, setDivisionHeadId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTeamName(initialTeam?.teamName || '');
    const initialHeadId = initialTeam?.divisionHeadId || defaultHeadId || divisionHeads[0]?.id || '';
    setDivisionHeadId(initialHeadId);
    const matchedHead = divisionHeads.find((h) => h.id === initialHeadId);
    setDivision(initialTeam?.division || matchedHead?.divisions[0] || '');
    setError(null);
  }, [isOpen, initialTeam, defaultHeadId, divisionHeads]);

  if (!isOpen) return null;

  const handleHeadChange = (nextHeadId: string) => {
    setDivisionHeadId(nextHeadId);
    if (!initialTeam && !division.trim()) {
      const h = divisionHeads.find((x) => x.id === nextHeadId);
      if (h?.divisions[0]) setDivision(h.divisions[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!teamName.trim() || !division.trim() || !divisionHeadId) {
      setError('Team Name, Division, and Division Head are all required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initialTeam?.id,
        teamName: teamName.trim(),
        division: division.trim(),
        divisionHeadId,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save Team.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {initialTeam ? 'Edit Team' : 'Add New Team'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {divisionHeads.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800">
              No Division Heads exist yet. Create a Division Head first before adding a Team.
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Responsible Division Head <span className="text-red-600">*</span>
            </label>
            <select
              value={divisionHeadId}
              onChange={(e) => handleHeadChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            >
              <option value="">-- Select Division Head --</option>
              {divisionHeads.map((dh) => (
                <option key={dh.id} value={dh.id}>
                  {dh.name} ({dh.divisions.join(', ')})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Division <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              list="wurth-divisions-list"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              placeholder="e.g. Automotive"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            />
            <datalist id="wurth-divisions-list">
              {existingDivisions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <p className="text-[10px] text-slate-400 mt-1">
              Teams are uniquely scoped within their Division (same team name in different divisions stays distinct).
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Team Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Western Metro Sales"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            />
          </div>

          {initialTeam && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
              Changes to Team Name, Division, or Division Head will cascade to all assigned ADMs and their Customers.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || divisionHeads.length === 0}
              className="px-4 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : initialTeam ? 'Save Team' : 'Create Team'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 3. Add / Edit ADM Modal
// ============================================================

interface AdmModalProps {
  isOpen: boolean;
  initialAdm: AdmMasterRecord | null;
  defaultTeamId?: string;
  teams: TeamMaster[];
  onClose: () => void;
  onSave: (input: SaveAdmInput) => Promise<void>;
}

export const AdmModal: React.FC<AdmModalProps> = ({
  isOpen,
  initialAdm,
  defaultTeamId,
  teams,
  onClose,
  onSave,
}) => {
  const [empId, setEmpId] = useState('');
  const [admNumber, setAdmNumber] = useState('');
  const [salesRepName, setSalesRepName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState<EmployeeStatus>('ACTIVE');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'VERIFIED' | 'NEEDS_VERIFICATION'>('VERIFIED');
  const [verificationReason, setVerificationReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmpId(initialAdm?.empId || '');
    setAdmNumber(initialAdm?.admNumber || '');
    setSalesRepName(initialAdm?.salesRepName || '');
    setTeamId(initialAdm?.teamId || defaultTeamId || teams[0]?.id || '');
    setEmployeeStatus(initialAdm?.employeeStatus || 'ACTIVE');
    setMobileNo(initialAdm?.mobileNo || '');
    setEmail(initialAdm?.email || '');
    setVerificationStatus(initialAdm?.verificationStatus || 'VERIFIED');
    setVerificationReason(initialAdm?.verificationReason || '');
    setError(null);
  }, [isOpen, initialAdm, defaultTeamId, teams]);

  if (!isOpen) return null;

  const selectedTeam = teams.find((t) => t.id === teamId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!empId.trim() || !admNumber.trim() || !salesRepName.trim() || !teamId) {
      setError('Emp ID, ADM#, Sales Rep. Name, and Assigned Team are required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initialAdm?.id,
        empId: empId.trim(),
        admNumber: admNumber.trim(),
        salesRepName: salesRepName.trim(),
        teamId,
        employeeStatus,
        mobileNo: mobileNo.trim(),
        email: email.trim(),
        verificationStatus,
        verificationReason: verificationStatus === 'NEEDS_VERIFICATION' ? verificationReason.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save ADM Master record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold">
            {initialAdm ? `Edit ADM Master (${initialAdm.admNumber})` : 'Add New ADM / Sales Representative'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {teams.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800">
              No Teams exist yet. Create a Division Head and Team first before adding an ADM.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Emp ID <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="e.g. EMP-1042"
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-red-600"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ADM# (Unique ID) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={admNumber}
                onChange={(e) => setAdmNumber(e.target.value)}
                placeholder="e.g. ADM-04"
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-600"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Sales Rep. Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={salesRepName}
                onChange={(e) => setSalesRepName(e.target.value)}
                placeholder="Full display name"
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Employee Status</label>
              <select
                value={employeeStatus}
                onChange={(e) => setEmployeeStatus(e.target.value as EmployeeStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Assigned Team <span className="text-red-600">*</span>
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            >
              <option value="">-- Select Team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.teamName} — Division: {t.division} (Head: {t.divisionHeadName})
                </option>
              ))}
            </select>

            {selectedTeam && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Derived Division</span>
                  <strong className="text-slate-900">{selectedTeam.division}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Derived Division Head</span>
                  <strong className="text-slate-900">{selectedTeam.divisionHeadName}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mobile No</label>
              <input
                type="text"
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value)}
                placeholder="e.g. 0771234567"
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-red-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rep@wurth.lk"
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Verification Status</label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as 'VERIFIED' | 'NEEDS_VERIFICATION')}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              >
                <option value="VERIFIED">Verified</option>
                <option value="NEEDS_VERIFICATION">Needs Verification</option>
              </select>
            </div>
            {verificationStatus === 'NEEDS_VERIFICATION' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Verification Note</label>
                <input
                  type="text"
                  value={verificationReason}
                  onChange={(e) => setVerificationReason(e.target.value)}
                  placeholder="Review note..."
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>
            )}
          </div>

          {initialAdm && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
              Updates to this ADM (name, ADM#, Team, Division, or Status) automatically sync to all linked Customers in the Customer Master directory.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || teams.length === 0}
              className="px-4 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : initialAdm ? 'Save ADM Master' : 'Create ADM Master'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 4. Add / Edit Customer Master Modal
// ============================================================

interface CustomerModalProps {
  isOpen: boolean;
  initialCustomer: CustomerMasterRecord | null;
  defaultAdmId?: string;
  adms: AdmMasterRecord[];
  onClose: () => void;
  onSave: (input: SaveCustomerInput) => Promise<void>;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  initialCustomer,
  defaultAdmId,
  adms,
  onClose,
  onSave,
}) => {
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [admId, setAdmId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerStatus, setCustomerStatus] = useState<CustomerMasterRecord['customerStatus']>('ACTIVE');
  const [assignmentEffectiveDate, setAssignmentEffectiveDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerId(initialCustomer?.customerId || '');
    setCustomerName(initialCustomer?.customerName || '');
    const matchedAdmId =
      (initialCustomer && !initialCustomer.requiresAdmMapping
        ? adms.find(
            (a) =>
              a.id === initialCustomer.admReference ||
              a.admNumber.toLowerCase() === initialCustomer.admNumber.toLowerCase()
          )?.id
        : undefined) ||
      defaultAdmId ||
      adms[0]?.id ||
      '';
    setAdmId(matchedAdmId);
    setCustomerPhone(initialCustomer?.customerPhone || '');
    setCustomerStatus(initialCustomer?.customerStatus || 'ACTIVE');
    setAssignmentEffectiveDate(initialCustomer?.assignmentEffectiveDate || new Date().toISOString().slice(0, 10));
    setError(null);
  }, [isOpen, initialCustomer, defaultAdmId, adms]);

  if (!isOpen) return null;

  const selectedAdm = adms.find((a) => a.id === admId);

  const handleAdmChange = (nextAdmId: string) => {
    setAdmId(nextAdmId);
    const a = adms.find((x) => x.id === nextAdmId);
    if (a) {
      setCustomerStatus(a.employeeStatus === 'ACTIVE' ? 'ACTIVE' : 'NEEDS_REVIEW');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId.trim() || !customerName.trim()) {
      setError('Customer ID and Customer Name are required.');
      return;
    }
    if (!admId && !initialCustomer?.requiresAdmMapping) {
      setError('Please select a responsible ADM#.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: initialCustomer?.id,
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        admId: admId || undefined,
        customerPhone: customerPhone.trim(),
        customerStatus,
        assignmentEffectiveDate,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save Customer Master record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold">
            {initialCustomer ? `Edit Customer (${initialCustomer.customerId})` : 'Add New Customer Master'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {adms.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800">
              No ADMs exist yet. Create an ADM Master record first to link customers via ADM#.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Customer ID (CX NUMBER) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="e.g. CX-10492"
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-600"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Phone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 0112345678"
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-red-600"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Customer Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Official business / customer name"
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Responsible ADM# (Authoritative Link) <span className="text-red-600">*</span>
            </label>
            <select
              value={admId}
              onChange={(e) => handleAdmChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              required={!initialCustomer?.requiresAdmMapping}
            >
              <option value="">-- Select Responsible ADM# --</option>
              {adms.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.admNumber} — {a.salesRepName} ({a.teamName} / {a.division}) [{a.employeeStatus}]
                </option>
              ))}
            </select>

            {selectedAdm && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Sales Rep</span>
                  <strong className="text-slate-900">{selectedAdm.salesRepName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Team</span>
                  <strong className="text-slate-900">{selectedAdm.teamName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Division</span>
                  <strong className="text-slate-900">{selectedAdm.division}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Division Head</span>
                  <strong className="text-slate-900">{selectedAdm.divisionHeadName}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Status</label>
              <select
                value={customerStatus}
                onChange={(e) => setCustomerStatus(e.target.value as CustomerMasterRecord['customerStatus'])}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-red-600"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="UNMAPPED_ADM">UNMAPPED_ADM</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Assignment Effective Date</label>
              <input
                type="date"
                value={assignmentEffectiveDate}
                onChange={(e) => setAssignmentEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-red-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (adms.length === 0 && !initialCustomer?.requiresAdmMapping)}
              className="px-4 py-1.5 font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : initialCustomer ? 'Save Customer' : 'Create Customer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
