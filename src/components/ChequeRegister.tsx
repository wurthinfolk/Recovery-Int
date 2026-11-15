import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Download,
  AlertTriangle,
  Eye,
  Edit2,
  Clock,
  CheckCircle,
  FileText,
  User,
  Shield,
  X,
  UploadCloud,
} from 'lucide-react';
import {
  ChequeRecord,
  FilterState,
  RecoveryStatus,
  PriorityLevel,
  UserProfile,
} from '../types';
import { formatLKR } from '../services/analytics';
import { canEditCheques } from '../services/permissions';

interface ChequeRegisterProps {
  records: ChequeRecord[];
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onSelectRecord: (record: ChequeRecord) => void;
  onAddNewRecord: () => void;
  onBulkImport?: () => void;
  onEditRecord: (record: ChequeRecord) => void;
  currentUser: UserProfile;
}

export const ChequeRegister: React.FC<ChequeRegisterProps> = ({
  records,
  filters,
  onFilterChange,
  onSelectRecord,
  onAddNewRecord,
  onBulkImport,
  onEditRecord,
  currentUser,
}) => {
  const [sortField, setSortField] = useState<keyof ChequeRecord>('datePosted');
  const [sortAsc, setSortAsc] = useState(false);

  const canAdd = canEditCheques(currentUser.role);
  const canEdit = canEditCheques(currentUser.role);

  const handleSort = (field: keyof ChequeRecord) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedRecords = [...records].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (typeof aVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const getStatusColor = (status: RecoveryStatus) => {
    switch (status) {
      case 'RECOVERED':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'PARTIALLY_RECOVERED':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'PAYMENT_PROMISED':
        return 'text-purple-700 bg-purple-50 border-purple-200';
      case 'ESCALATED':
        return 'text-red-700 bg-red-50 border-red-300 font-semibold';
      case 'AWAITING_REPLACEMENT':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'CONTACT_REQUIRED':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'UNDER_INVESTIGATION':
        return 'text-slate-700 bg-slate-100 border-slate-300';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getPriorityBadge = (priority: PriorityLevel) => {
    switch (priority) {
      case 'CRITICAL':
        return <span className="font-bold text-red-600 text-[10px]">CRITICAL</span>;
      case 'HIGH':
        return <span className="font-semibold text-amber-600 text-[10px]">HIGH</span>;
      case 'MEDIUM':
        return <span className="text-slate-600 text-[10px]">MEDIUM</span>;
      default:
        return <span className="text-slate-400 text-[10px]">LOW</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, cheque #, ADM, reason, remark..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600 focus:border-red-600 transition-colors"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Selectors & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recovery Status Filter */}
          <select
            value={filters.recoveryStatus}
            onChange={(e) => onFilterChange({ recoveryStatus: e.target.value })}
            className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Recovery Statuses</option>
            <option value="NEW">New</option>
            <option value="UNDER_INVESTIGATION">Under Investigation</option>
            <option value="CONTACT_REQUIRED">Contact Required</option>
            <option value="PAYMENT_PROMISED">Payment Promised</option>
            <option value="AWAITING_REPLACEMENT">Awaiting Replacement</option>
            <option value="PARTIALLY_RECOVERED">Partially Recovered</option>
            <option value="RECOVERED">Recovered</option>
            <option value="ESCALATED">Escalated</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => onFilterChange({ priority: e.target.value })}
            className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical Priority</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          {canAdd && onBulkImport && (
            <button
              onClick={onBulkImport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              <UploadCloud className="w-3.5 h-3.5 text-red-600" />
              <span>Bulk Upload</span>
            </button>
          )}

          {canAdd && (
            <button
              onClick={onAddNewRecord}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-2xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Returned Cheque</span>
            </button>
          )}
        </div>
      </div>

      {/* High-Density Cheque Register Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold select-none">
                <th
                  onClick={() => handleSort('datePosted')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Date Posted</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cxName')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Customer (CX)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('description')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Cheque Ref</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('amount')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Amount (LKR)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('normalizedReason')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Return Reason</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('admName')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>ADM</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('priority')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Priority</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('recoveryStatus')}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-200/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Recovery Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Unrecovered</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRecords.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  onClick={() => onSelectRecord(r)}
                >
                  {/* Date Posted */}
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {r.datePosted}
                  </td>

                  {/* Customer */}
                  <td className="py-2 px-3">
                    <div className="font-semibold text-slate-900 group-hover:text-red-600 transition-colors truncate max-w-[200px]">
                      {r.cxName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {r.cxNumber}
                    </div>
                  </td>

                  {/* Cheque Description */}
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-700 truncate max-w-[160px]">
                    {r.description}
                  </td>

                  {/* Amount LKR */}
                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {formatLKR(r.amount)}
                  </td>

                  {/* Return Reason */}
                  <td className="py-2 px-3">
                    <div className="text-slate-800 font-medium truncate max-w-[180px]">
                      {r.normalizedReason}
                    </div>
                    {r.returnReason !== r.normalizedReason && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                        Original: {r.returnReason}
                      </div>
                    )}
                  </td>

                  {/* ADM */}
                  <td className="py-2 px-3 text-slate-700">
                    <div className="truncate max-w-[120px]">{r.admName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.admCode}</div>
                  </td>

                  {/* Priority */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {getPriorityBadge(r.priority)}
                  </td>

                  {/* Recovery Status */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(
                        r.recoveryStatus
                      )}`}
                    >
                      {r.recoveryStatus.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Remaining Unrecovered */}
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-red-600 font-medium whitespace-nowrap">
                    {r.remainingAmount > 0 ? formatLKR(r.remainingAmount) : '—'}
                  </td>

                  {/* Actions */}
                  <td
                    className="py-2 px-3 text-center whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onSelectRecord(r)}
                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                        title="View details & recovery action queue"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onEditRecord(r)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                          title="Edit record"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {sortedRecords.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 text-xs">
                    No returned cheque records found matching the current search and filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
          <span>
            Showing <strong className="font-semibold text-slate-900">{sortedRecords.length}</strong> of{' '}
            {records.length} records
          </span>
          <span className="font-mono tabular-nums">
            Total Displayed Value:{' '}
            <strong className="font-semibold text-slate-900">
              {formatLKR(sortedRecords.reduce((sum, r) => sum + r.amount, 0))}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};
