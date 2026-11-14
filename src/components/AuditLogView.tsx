import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  FileText,
} from 'lucide-react';
import { AuditLog } from '../types';
import { getAuditLogs } from '../services/firebase';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [opFilter, setOpFilter] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filtered = logs.filter((log) => {
    if (opFilter && log.operation !== opFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.actor.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.recordId.toLowerCase().includes(q) ||
        log.operation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 text-white rounded-md">
            <ShieldCheck className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Append-Only Operational Audit Trail (Section 14)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable operational log. Audit entries cannot be edited or deleted by any application role.
            </p>
          </div>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Audit Stream</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by actor, record ID, or action keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={opFilter}
            onChange={(e) => setOpFilter(e.target.value)}
            className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Audit Operations</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="RECOVERY">RECOVERY INTERVENTION</option>
            <option value="IMPORT">IMPORT BATCH</option>
            <option value="CONFIG_CHANGE">CONFIG CHANGE</option>
          </select>
          <span className="text-xs text-slate-500 font-mono">
            {filtered.length} entries
          </span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Operation</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Target Record</th>
                <th className="py-2.5 px-3">Details & Before/After Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>

                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                        log.operation === 'CREATE'
                          ? 'bg-blue-100 text-blue-800'
                          : log.operation === 'RECOVERY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.operation === 'IMPORT'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {log.operation}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 font-sans text-slate-900 font-medium whitespace-nowrap">
                    <div>{log.actor}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.actorEmail}</div>
                  </td>

                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                    <span className="font-semibold text-slate-900">{log.recordId}</span>
                    <div className="text-[10px] text-slate-400 font-sans">{log.recordType}</div>
                  </td>

                  <td className="py-2.5 px-3 font-sans text-slate-700">
                    <p className="leading-relaxed">{log.details}</p>
                    {log.afterValue && (
                      <div className="mt-1 text-[10px] font-mono text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-200 break-all">
                        Snapshot: {log.afterValue}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-sans text-xs">
                    {loading ? 'Loading audit records...' : 'No audit entries match the current search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
