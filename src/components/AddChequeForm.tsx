import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle,
  Save,
  X,
  UploadCloud,
} from 'lucide-react';
import {
  ChequeRecord,
  UserProfile,
  AnalyticalConfig,
  CustomerMasterRecord,
  AdmMasterRecord,
} from '../types';
import { normalizeReason, calculatePriority, formatLKR, DEFAULT_CONFIG } from '../services/analytics';

interface AddChequeFormProps {
  initialRecord?: ChequeRecord | null;
  onSave: (record: ChequeRecord, isEdit: boolean) => Promise<void>;
  onCancel: () => void;
  onNavigateToBulkImport?: () => void;
  existingRecords: ChequeRecord[];
  customersMaster?: CustomerMasterRecord[];
  admsMaster?: AdmMasterRecord[];
  currentUser: UserProfile;
  config?: AnalyticalConfig;
}

interface CustomerAutocompleteOption {
  cxNumber: string;
  cxName: string;
  admCode: string;
  admName: string;
  teamName?: string;
  division?: string;
  source: 'MASTER' | 'HISTORY';
}

const normKey = (val?: string | null): string => (val || '').trim().toUpperCase();

export const AddChequeForm: React.FC<AddChequeFormProps> = ({
  initialRecord,
  onSave,
  onCancel,
  onNavigateToBulkImport,
  existingRecords,
  customersMaster = [],
  admsMaster = [],
  currentUser,
  config = DEFAULT_CONFIG,
}) => {
  const isEdit = !!initialRecord;

  // Form State
  const [datePosted, setDatePosted] = useState(
    initialRecord?.datePosted || new Date().toISOString().slice(0, 10)
  );
  const [effectiveDate, setEffectiveDate] = useState(
    initialRecord?.effectiveDate || new Date().toISOString().slice(0, 10)
  );
  const [cxNumber, setCxNumber] = useState(initialRecord?.cxNumber || '');
  const [cxName, setCxName] = useState(initialRecord?.cxName || '');
  const [admCode, setAdmCode] = useState(initialRecord?.admCode || '');
  const [admName, setAdmName] = useState(initialRecord?.admName || '');
  const [description, setDescription] = useState(initialRecord?.description || '');
  const [amountStr, setAmountStr] = useState(
    initialRecord?.amount !== undefined ? String(initialRecord.amount) : ''
  );
  const [returnReason, setReturnReason] = useState(initialRecord?.returnReason || '');
  const [finalRemark, setFinalRemark] = useState(initialRecord?.finalRemark || '');
  const [recoveryStatus, setRecoveryStatus] = useState(initialRecord?.recoveryStatus || 'NEW');
  const [assignedOfficer, setAssignedOfficer] = useState(
    initialRecord?.assignedOfficer || currentUser.displayName
  );

  // Dropdown & Auto-fill Tracking State
  const [activeDropdown, setActiveDropdown] = useState<'cxNumber' | 'cxName' | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(0);
  const [admManuallyEdited, setAdmManuallyEdited] = useState<boolean>(Boolean(initialRecord));
  const [admNameManuallyEdited, setAdmNameManuallyEdited] = useState<boolean>(Boolean(initialRecord));
  const lastAutoCxRef = useRef<string>(normKey(initialRecord?.cxNumber));
  const cxRowRef = useRef<HTMLDivElement | null>(null);

  // Validation & Duplicate Warning State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Unified ADM lookup (ADM Master takes priority, historical records fallback)
  const admLookup = useMemo(() => {
    const map = new Map<string, string>();
    existingRecords.forEach((r) => {
      const code = normKey(r.admCode);
      if (code && code !== 'NO-CODE' && r.admName && r.admName !== 'Unassigned ADM') {
        map.set(code, r.admName.trim());
      }
    });
    admsMaster.forEach((a) => {
      const code = normKey(a.admNumber);
      if (code && a.salesRepName) {
        map.set(code, a.salesRepName.trim());
      }
    });
    return map;
  }, [admsMaster, existingRecords]);

  // Unified searchable customer options (Customer Master + historical cheque customers)
  const customerOptions = useMemo(() => {
    const map = new Map<string, CustomerAutocompleteOption>();

    // Seed from Customer Master first (authoritative hierarchy)
    customersMaster.forEach((c) => {
      const key = normKey(c.customerId);
      if (!key) return;
      const cleanAdm = normKey(c.admNumber);
      const validAdm = cleanAdm && cleanAdm !== 'UNMAPPED' && cleanAdm !== 'NO-CODE' ? cleanAdm : '';
      const resolvedAdmName =
        (validAdm && admLookup.get(validAdm)) ||
        (c.salesRepName && c.salesRepName !== 'Unassigned' ? c.salesRepName.trim() : '');

      map.set(key, {
        cxNumber: key,
        cxName: (c.customerName || '').trim(),
        admCode: validAdm,
        admName: resolvedAdmName,
        teamName: c.teamName,
        division: c.division,
        source: 'MASTER',
      });
    });

    // Enrich / add from existing cheque history (sorted oldest->newest so latest wins on fallback)
    const sortedHistory = [...existingRecords].sort((a, b) =>
      (a.datePosted || '').localeCompare(b.datePosted || '')
    );
    sortedHistory.forEach((r) => {
      const key = normKey(r.cxNumber);
      if (!key) return;
      const histAdm = normKey(r.admCode);
      const validHistAdm = histAdm && histAdm !== 'NO-CODE' ? histAdm : '';
      const histAdmName =
        (validHistAdm && admLookup.get(validHistAdm)) ||
        (r.admName && r.admName !== 'Unassigned ADM' ? r.admName.trim() : '');

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          cxNumber: key,
          cxName: (r.cxName || '').trim(),
          admCode: validHistAdm,
          admName: histAdmName,
          source: 'HISTORY',
        });
      } else {
        if (!existing.cxName && r.cxName) existing.cxName = r.cxName.trim();
        if (!existing.admCode && validHistAdm) {
          existing.admCode = validHistAdm;
          existing.admName = histAdmName;
        } else if (!existing.admName && histAdmName) {
          existing.admName = histAdmName;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      (a.cxName || a.cxNumber).localeCompare(b.cxName || b.cxNumber)
    );
  }, [customersMaster, existingRecords, admLookup]);

  const customerByCxNumber = useMemo(() => {
    const map = new Map<string, CustomerAutocompleteOption>();
    customerOptions.forEach((opt) => map.set(opt.cxNumber, opt));
    return map;
  }, [customerOptions]);

  const filteredCustomerMatches = useMemo(() => {
    const rawQuery = activeDropdown === 'cxNumber' ? cxNumber : cxName;
    const q = (rawQuery || '').trim().toLowerCase();
    if (!q) return customerOptions.slice(0, 30);

    const scored: Array<{ opt: CustomerAutocompleteOption; score: number }> = [];
    for (const opt of customerOptions) {
      const numLow = opt.cxNumber.toLowerCase();
      const nameLow = opt.cxName.toLowerCase();
      if (numLow === q || nameLow === q) {
        scored.push({ opt, score: 0 });
      } else if (
        (activeDropdown === 'cxNumber' && numLow.startsWith(q)) ||
        (activeDropdown === 'cxName' && nameLow.startsWith(q))
      ) {
        scored.push({ opt, score: 1 });
      } else if (numLow.startsWith(q) || nameLow.startsWith(q)) {
        scored.push({ opt, score: 2 });
      } else if (numLow.includes(q) || nameLow.includes(q)) {
        scored.push({ opt, score: 3 });
      }
    }
    scored.sort((a, b) => a.score - b.score || a.opt.cxName.localeCompare(b.opt.cxName));
    return scored.slice(0, 30).map((s) => s.opt);
  }, [customerOptions, activeDropdown, cxNumber, cxName]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (cxRowRef.current && !cxRowRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const applyCustomerOption = (opt: CustomerAutocompleteOption) => {
    setCxNumber(opt.cxNumber);
    if (opt.cxName) setCxName(opt.cxName);
    setAdmCode(opt.admCode);
    setAdmName(opt.admName);
    lastAutoCxRef.current = opt.cxNumber;
    setAdmManuallyEdited(false);
    setAdmNameManuallyEdited(false);
    setActiveDropdown(null);
    setHighlightedIdx(0);
  };

  // Handle CX Number typing + exact auto-load
  const handleCxNumberChange = (val: string) => {
    setCxNumber(val);
    setActiveDropdown('cxNumber');
    setHighlightedIdx(0);

    const upper = normKey(val);
    const match = customerByCxNumber.get(upper);
    if (match) {
      if (match.cxName) setCxName(match.cxName);
      if (!admManuallyEdited || lastAutoCxRef.current !== upper) {
        setAdmCode(match.admCode);
        setAdmName(match.admName);
        lastAutoCxRef.current = upper;
        setAdmManuallyEdited(false);
        setAdmNameManuallyEdited(false);
      }
    }
  };

  // Handle CX Name typing
  const handleCxNameChange = (val: string) => {
    setCxName(val);
    setActiveDropdown('cxName');
    setHighlightedIdx(0);
  };

  // Keyboard navigation for Customer autocomplete dropdown
  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeDropdown || filteredCustomerMatches.length === 0) {
      if (e.key === 'ArrowDown' && customerOptions.length > 0) {
        setHighlightedIdx(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1) % filteredCustomerMatches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev <= 0 ? filteredCustomerMatches.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = filteredCustomerMatches[highlightedIdx] || filteredCustomerMatches[0];
      if (chosen) applyCustomerOption(chosen);
    } else if (e.key === 'Escape') {
      setActiveDropdown(null);
    }
  };

  // Handle ADM Code manual edit (auto-fills ADM Name unless manually overridden)
  const handleAdmCodeChange = (val: string) => {
    setAdmCode(val);
    setAdmManuallyEdited(true);
    const upper = normKey(val);
    if (admLookup.has(upper) && (!admName || !admNameManuallyEdited)) {
      setAdmName(admLookup.get(upper)!);
    }
  };

  const handleAdmNameChange = (val: string) => {
    setAdmName(val);
    setAdmManuallyEdited(true);
    setAdmNameManuallyEdited(true);
  };

  // Real-time Duplicate Detection (Section 8: based on cheque ref, cx number, date, amount)
  useEffect(() => {
    const amt = parseFloat(amountStr);
    if (!cxNumber || !description || !datePosted || isNaN(amt) || amt <= 0) {
      setDuplicateWarning(null);
      return;
    }

    const potentialMatch = existingRecords.find(
      (r) =>
        r.id !== initialRecord?.id &&
        r.cxNumber.trim().toUpperCase() === cxNumber.trim().toUpperCase() &&
        r.description.trim().toUpperCase() === description.trim().toUpperCase() &&
        r.datePosted === datePosted &&
        Math.abs(r.amount - amt) < 0.01
    );

    if (potentialMatch) {
      setDuplicateWarning(
        `Warning: A record with identical Customer (${potentialMatch.cxNumber}), Cheque Reference (${potentialMatch.description}), Date (${potentialMatch.datePosted}), and Amount (LKR ${potentialMatch.amount}) already exists (Record ID: ${potentialMatch.id}).`
      );
    } else {
      setDuplicateWarning(null);
    }
  }, [cxNumber, description, datePosted, amountStr, existingRecords, initialRecord]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!datePosted) newErrors.datePosted = 'Date-Posted is required';
    if (!effectiveDate) newErrors.effectiveDate = 'Effective-Date is required';
    if (!cxNumber.trim()) newErrors.cxNumber = 'CX NUMBER is required';
    if (!cxName.trim()) newErrors.cxName = 'CX NAME is required';
    if (!description.trim()) newErrors.description = 'Cheque reference/description is required';

    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) {
      newErrors.amount = 'Valid positive amount in LKR is required';
    }

    if (!returnReason.trim()) newErrors.returnReason = 'RETURN REASON is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setConfirmModalOpen(true);
    }
  };

  const confirmAndSave = async () => {
    setSubmitting(true);
    try {
      const parsedAmount = parseFloat(amountStr);
      const normalizedReason = normalizeReason(returnReason);

      const customerPrevCount = existingRecords.filter(
        (r) => r.cxNumber.toUpperCase() === cxNumber.trim().toUpperCase()
      ).length;

      const priorityCalc = calculatePriority(
        {
          amount: parsedAmount,
          remainingAmount: initialRecord?.remainingAmount ?? parsedAmount,
          recoveryStatus,
        },
        customerPrevCount,
        config
      );

      // Determine Month label (e.g. "OCTOBER 2026")
      const d = new Date(datePosted);
      const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

      const record: ChequeRecord = {
        id: initialRecord?.id || `CHQ-${Date.now().toString(36).toUpperCase()}`,
        month: monthLabel,
        datePosted,
        effectiveDate,
        cxNumber: cxNumber.trim().toUpperCase(),
        cxName: cxName.trim(),
        admCode: admCode.trim().toUpperCase() || 'NO-CODE',
        admName: admName.trim() || 'Unassigned ADM',
        description: description.trim(),
        amount: parsedAmount,
        returnReason: returnReason.trim(),
        normalizedReason,
        finalRemark: finalRemark.trim(),
        recoveryStatus,
        priority: priorityCalc.priority,
        priorityScore: priorityCalc.score,
        priorityExplanation: priorityCalc.explanation,
        assignedOfficer,
        recoveredAmount: initialRecord?.recoveredAmount || 0,
        remainingAmount:
          initialRecord?.remainingAmount !== undefined
            ? initialRecord.remainingAmount
            : parsedAmount,
        nextAction: initialRecord?.nextAction || 'Initiate customer recovery contact',
        nextFollowUpDate: initialRecord?.nextFollowUpDate || '',
        lastContactDate: initialRecord?.lastContactDate || '',
        resolutionDate: initialRecord?.resolutionDate || '',
        resolutionEvidence: initialRecord?.resolutionEvidence || '',
        recoveryNotes: initialRecord?.recoveryNotes || (finalRemark ? `Original remark: ${finalRemark}` : ''),
        createdAt: initialRecord?.createdAt || new Date().toISOString(),
        createdBy: initialRecord?.createdBy || currentUser.displayName,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName,
        batchId: initialRecord?.batchId,
        isSample: initialRecord?.isSample || false,
      };

      await onSave(record, isEdit);
      setConfirmModalOpen(false);
    } catch (err) {
      console.error('Failed to save record:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/60">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {isEdit ? `Edit Returned Cheque Record (${initialRecord.id})` : 'Register New Returned Cheque'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Original business fields are mapped directly into the WÜRTH Recovery Intelligence register.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEdit && onNavigateToBulkImport && (
            <button
              type="button"
              onClick={onNavigateToBulkImport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5 text-red-600" />
              <span>Bulk Upload Register</span>
            </button>
          )}
          <button
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Duplicate Warning Banner */}
      {duplicateWarning && (
        <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Potential Duplicate Detected</span>
            <span>{duplicateWarning}</span>
            <span className="block mt-1 text-[11px] text-amber-700">
              Note: You may still save this record if it represents a distinct cheque transaction.
            </span>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
        {/* Row 1: Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date-Posted <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs border rounded-md font-mono ${
                errors.datePosted ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            {errors.datePosted && <p className="text-[11px] text-red-500 mt-1">{errors.datePosted}</p>}
            <p className="text-[10px] text-slate-400 mt-0.5">Default financial reporting basis</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Effective-Date (Cheque Date) <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs border rounded-md font-mono ${
                errors.effectiveDate ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            {errors.effectiveDate && (
              <p className="text-[11px] text-red-500 mt-1">{errors.effectiveDate}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-0.5">Value date on the cheque leaf</p>
          </div>
        </div>

        {/* Row 2: Customer Details */}
        <div
          ref={cxRowRef}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50/70 rounded-lg border border-slate-200"
        >
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CX NUMBER <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              placeholder="e.g. CX-10492"
              value={cxNumber}
              onFocus={() => {
                setActiveDropdown('cxNumber');
                setHighlightedIdx(0);
              }}
              onChange={(e) => handleCxNumberChange(e.target.value)}
              onKeyDown={handleCustomerInputKeyDown}
              className={`w-full px-3 py-1.5 text-xs border rounded-md font-mono uppercase bg-white ${
                errors.cxNumber ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            {activeDropdown === 'cxNumber' && filteredCustomerMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredCustomerMatches.map((opt, idx) => (
                  <button
                    key={opt.cxNumber}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyCustomerOption(opt);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      idx === highlightedIdx ? 'bg-red-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-slate-900">{opt.cxNumber}</span>
                      {opt.admCode && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                          {opt.admCode}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-700 truncate mt-0.5">{opt.cxName || '—'}</div>
                    {opt.admName && (
                      <div className="text-[10px] text-slate-500 truncate">ADM: {opt.admName}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {errors.cxNumber && <p className="text-[11px] text-red-500 mt-1">{errors.cxNumber}</p>}
          </div>

          <div className="sm:col-span-2 relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CX NAME (Customer Name) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              placeholder="e.g. Auto Miraj Grand Express (Pvt) Ltd"
              value={cxName}
              onFocus={() => {
                setActiveDropdown('cxName');
                setHighlightedIdx(0);
              }}
              onChange={(e) => handleCxNameChange(e.target.value)}
              onKeyDown={handleCustomerInputKeyDown}
              className={`w-full px-3 py-1.5 text-xs border rounded-md bg-white ${
                errors.cxName ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            {activeDropdown === 'cxName' && filteredCustomerMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredCustomerMatches.map((opt, idx) => (
                  <button
                    key={opt.cxNumber}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyCustomerOption(opt);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      idx === highlightedIdx ? 'bg-red-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 truncate">
                        {opt.cxName || opt.cxNumber}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded shrink-0">
                        {opt.cxNumber}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mt-0.5">
                      <span className="truncate">
                        {opt.admCode ? `ADM ${opt.admCode}` : 'No ADM#'}
                        {opt.admName ? ` · ${opt.admName}` : ''}
                      </span>
                      {(opt.teamName || opt.division) && (
                        <span className="truncate shrink-0">
                          {[opt.teamName, opt.division].filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {errors.cxName && <p className="text-[11px] text-red-500 mt-1">{errors.cxName}</p>}
          </div>
        </div>

        {/* Row 3: ADM Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ADM CODE
            </label>
            <input
              type="text"
              placeholder="e.g. ADM-04"
              value={admCode}
              onChange={(e) => handleAdmCodeChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md font-mono uppercase"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ADM NAME (Account Manager)
            </label>
            <input
              type="text"
              placeholder="e.g. Kamal Perera"
              value={admName}
              onChange={(e) => handleAdmNameChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* Row 4: Cheque Description & Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              DESCRIPTION (Cheque Ref / Bank) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. CHQ-884920 / Commercial Bank"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs border rounded-md font-mono ${
                errors.description ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            {errors.description && (
              <p className="text-[11px] text-red-500 mt-1">{errors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              AMOUNT (LKR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-mono text-slate-400">LKR</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className={`w-full pl-12 pr-3 py-1.5 text-xs border rounded-md font-mono tabular-nums ${
                  errors.amount ? 'border-red-500 bg-red-50' : 'border-slate-300'
                }`}
              />
            </div>
            {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount}</p>}
            {amountStr && !isNaN(parseFloat(amountStr)) && (
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Formatted: {formatLKR(parseFloat(amountStr))}
              </p>
            )}
          </div>
        </div>

        {/* Row 5: Return Reason & Remarks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              RETURN REASON <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="common-reasons"
              placeholder="e.g. Refer to Drawer"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs border rounded-md ${
                errors.returnReason ? 'border-red-500 bg-red-50' : 'border-slate-300'
              }`}
            />
            <datalist id="common-reasons">
              <option value="Refer to Drawer" />
              <option value="Payment Stopped by Drawer" />
              <option value="Funds Insufficient" />
              <option value="Signature Differs from Mandate" />
              <option value="Post Dated Cheque" />
              <option value="Account Closed" />
              <option value="Words and Figures Differ" />
              <option value="Alteration Requires Drawer Signature" />
            </datalist>
            {errors.returnReason && (
              <p className="text-[11px] text-red-500 mt-1">{errors.returnReason}</p>
            )}
            {returnReason && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Normalized as: <strong className="text-slate-600">{normalizeReason(returnReason)}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              FINAL REMARK (Original Note)
            </label>
            <input
              type="text"
              placeholder="e.g. Customer promised representation next week"
              value={finalRemark}
              onChange={(e) => setFinalRemark(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* Row 6: Initial Recovery Assignment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recovery Status
            </label>
            <select
              value={recoveryStatus}
              onChange={(e) => setRecoveryStatus(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-800"
            >
              <option value="NEW">New (Unassigned / Pending Action)</option>
              <option value="UNDER_INVESTIGATION">Under Investigation</option>
              <option value="CONTACT_REQUIRED">Contact Required</option>
              <option value="PAYMENT_PROMISED">Payment Promised</option>
              <option value="AWAITING_REPLACEMENT">Awaiting Replacement Cheque</option>
              <option value="PARTIALLY_RECOVERED">Partially Recovered</option>
              <option value="RECOVERED">Recovered (Fully Settled)</option>
              <option value="ESCALATED">Escalated</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assigned Recovery Officer
            </label>
            <input
              type="text"
              value={assignedOfficer}
              onChange={(e) => setAssignedOfficer(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isEdit ? 'Update Cheque Record' : 'Save & Register Cheque'}</span>
          </button>
        </div>
      </form>

      {/* Confirmation Dialog */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Confirm Cheque Registration
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to {isEdit ? 'update' : 'create'} returned cheque record for{' '}
              <strong>{cxName}</strong> ({cxNumber}) in the amount of{' '}
              <strong className="text-slate-900">{formatLKR(parseFloat(amountStr))}</strong>?
            </p>

            <div className="bg-slate-50 p-3 rounded text-xs space-y-1 font-mono text-slate-600 border border-slate-200">
              <div>Date Posted: {datePosted}</div>
              <div>Cheque Ref: {description}</div>
              <div>Return Reason: {returnReason}</div>
              <div>Assigned Officer: {assignedOfficer}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded"
              >
                Go Back & Review
              </button>
              <button
                type="button"
                onClick={confirmAndSave}
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                {submitting ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
