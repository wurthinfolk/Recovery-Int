import React, { useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  FileText,
  CheckCircle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  AnomalyFinding,
  ManagementInsight,
  KPIMetrics,
  CustomerSummary,
  ReasonSummary,
  ChequeRecord,
} from '../types';
import { formatLKR, detectAnomalies } from '../services/analytics';
import { fetchManagementInsights } from '../services/aiInsights';

interface TrendsAndAnomaliesProps {
  records: ChequeRecord[];
  kpis: KPIMetrics;
  customers: CustomerSummary[];
  reasons: ReasonSummary[];
  onSelectCustomer: (cxNumber: string) => void;
  onFilterByReason: (reason: string) => void;
}

export const TrendsAndAnomalies: React.FC<TrendsAndAnomaliesProps> = ({
  records,
  kpis,
  customers,
  reasons,
  onSelectCustomer,
  onFilterByReason,
}) => {
  const anomalies = detectAnomalies(records);
  const [managementInsights, setManagementInsights] = useState<ManagementInsight[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const handleGenerateAiInsights = async () => {
    setLoadingAi(true);
    setAiNote(null);
    try {
      const res = await fetchManagementInsights(kpis, customers, reasons, anomalies);
      setManagementInsights(res.insights);
      if (res.note) setAiNote(res.note);
    } catch (err) {
      console.error('Failed to generate insights:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded text-[10px] font-mono">
            CRITICAL SEVERITY
          </span>
        );
      case 'HIGH':
        return (
          <span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[10px] font-mono">
            HIGH SEVERITY
          </span>
        );
      default:
        return (
          <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-mono">
            MEDIUM SEVERITY
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner & Executive Insights Generator */}
      <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Advanced Pattern & Anomaly Detection
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              · Section 6 Analytical Engine
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Statistically grounded rules evaluate customer repeat concentration, period shifts,
            and unrecovered exposure. Flags provide transparent evidence without automated claims of default.
          </p>
        </div>

        <button
          onClick={handleGenerateAiInsights}
          disabled={loadingAi}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-xs transition-colors shrink-0 whitespace-nowrap"
        >
          {loadingAi ? (
            <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-red-500" />
          )}
          <span>{loadingAi ? 'Synthesizing...' : 'Generate Executive Management Insights'}</span>
        </button>
      </div>

      {/* AI / Rule-based Management Insights Panel (Section 11) */}
      {managementInsights.length > 0 && (
        <section className="bg-red-50/40 border border-red-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-600" />
              <h3 className="font-bold text-sm text-slate-900 tracking-tight">
                Executive Management Intelligence Brief (Section 11)
              </h3>
            </div>
            {aiNote && (
              <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                {aiNote}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {managementInsights.map((ins, i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 text-xs shadow-2xs"
              >
                <div className="font-bold text-slate-900 text-sm text-red-700 flex items-center justify-between">
                  <span>{ins.finding}</span>
                  <span className="text-[10px] text-slate-400 font-normal font-mono">
                    {ins.generatedBy === 'AI_MODEL' ? 'AI Grounded' : 'Rule Engine'}
                  </span>
                </div>

                <div className="text-slate-700 leading-relaxed">
                  <strong className="text-slate-900">Evidence:</strong> {ins.evidence}
                </div>

                <div className="text-slate-700 leading-relaxed">
                  <strong className="text-slate-900">Business Impact:</strong> {ins.businessImpact}
                </div>

                <div className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-800 leading-relaxed">
                  <strong className="text-slate-900">Recommended Action:</strong> {ins.recommendedAction}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span><strong>Success Measure:</strong> {ins.successMeasure}</span>
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  <strong>Limitations:</strong> {ins.limitations}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ranked Anomaly Cards (Section 6E Pattern Discovery) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Verified Risk Patterns & Anomalies ({anomalies.length} Detected)
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            Ground-truth data from {records.length} registered records
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anomalies.map((a) => (
            <div
              key={a.id}
              className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  {getSeverityBadge(a.severity)}
                  <span className="text-[10px] font-mono text-slate-500">
                    Confidence: {a.confidence}
                  </span>
                </div>

                <h4 className="font-bold text-slate-900 text-sm mb-2">
                  {a.title}
                </h4>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-1.5">
                    <strong className="text-slate-800 shrink-0">Comparison Baseline:</strong>
                    <span>{a.comparison}</span>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <strong className="text-slate-800 shrink-0">Supporting Evidence:</strong>
                    <span className="text-slate-900 font-medium">{a.evidence}</span>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <strong className="text-slate-800 shrink-0">Financial Exposure:</strong>
                    <span className="font-mono font-bold text-red-600">
                      {formatLKR(a.financialImpactLkr)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({a.supportingRecordCount} records)
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800">
                  <div className="font-semibold text-slate-900 mb-0.5">Recommended Next Step:</div>
                  <p>{a.recommendedAction}</p>
                </div>
              </div>

              {a.relatedCxNumber && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => onSelectCustomer(a.relatedCxNumber!)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <span>Inspect Customer Profile ({a.relatedCxNumber})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {anomalies.length === 0 && (
            <div className="col-span-2 py-12 text-center text-slate-400 text-xs bg-white border border-slate-200 rounded-lg">
              No statistical anomalies or risk threshold breaches identified in the current record selection.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
