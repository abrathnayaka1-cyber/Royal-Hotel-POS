import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { SystemSettings, Bill } from '../../types.ts';
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  Clock,
  Users,
  Utensils,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  Sparkles,
  Activity,
  Bot,
  ShieldAlert,
  PiggyBank
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface DashboardData {
  todayRevenue: number;
  todayBillsCount: number;
  totalRevenue: number;
  totalBillsCount: number;
  activeHeldBillsCount: number;
  pendingKOTCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: any[];
  recentBills: Bill[];
  todayPaymentBreakdown?: Record<string, { count: number; total: number }>;
  activeCashiers: any[];
}

interface AiHealthIssue {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
}

interface AiHealthReport {
  id: string;
  createdAt: string;
  generatedBy: 'gemini' | 'rule-based';
  aiConfigured: boolean;
  model?: string;
  overallStatus: 'healthy' | 'attention' | 'critical';
  summary: string;
  issues: AiHealthIssue[];
  recommendations: string[];
  metrics: Record<string, number | string | boolean>;
}

interface AiHealthResponse {
  configured: boolean;
  model?: string;
  canAnalyze: boolean;
  report: AiHealthReport | null;
}

export const AdminDashboard: React.FC<{ settings: SystemSettings | null; onNavigate: (tab: string) => void }> = ({
  settings,
  onNavigate,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // AI System Health Check
  const [aiHealth, setAiHealth] = useState<AiHealthResponse | null>(null);
  const [aiRunning, setAiRunning] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetchApi<DashboardData>('/dashboard/stats');
      setData(res);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load dashboard metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadAiHealth();
    // Auto refresh every 30 seconds for live monitoring (sales + health report)
    const interval = setInterval(() => {
      loadDashboard();
      loadAiHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAiHealth = async () => {
    try {
      const res = await fetchApi<AiHealthResponse>('/ai/health-check');
      setAiHealth(res);
      setAiError(null);
    } catch (err: any) {
      setAiError(err?.message || 'Failed to load AI health status.');
    }
  };

  const runAiHealth = async () => {
    setAiRunning(true);
    setAiError(null);
    try {
      const res = await fetchApi<AiHealthResponse>('/ai/health-check', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setAiHealth(res);
    } catch (err: any) {
      setAiError(err?.message || 'AI health check failed.');
    } finally {
      setAiRunning(false);
    }
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  const avgBillToday =
    data && data.todayBillsCount > 0 ? Math.round(data.todayRevenue / data.todayBillsCount) : 0;

  const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    other: 'Other',
    split: 'Split',
    room_charge: 'Room Charge',
  };

  // Aggregate today's payment methods into a chart-friendly array. Values are
  // coerced with Number() and null-guarded so legacy/NaN data never produces a
  // broken chart. Only methods with a non-zero total are shown.
  const paymentData = useMemo(() => {
    const breakdown = data?.todayPaymentBreakdown;
    if (!breakdown) return [];
    return Object.entries(breakdown)
      .map(([method, val]) => ({
        method,
        name: PAYMENT_LABELS[method] || method,
        value: Number(val?.total) || 0,
        count: Number(val?.count) || 0,
      }))
      .filter(p => p.value > 0);
  }, [data?.todayPaymentBreakdown]);

  const paymentTotal = paymentData.reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Live Business Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time overview of sales, active tables, inventory alerts, and cashier operations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">
            Updated: {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={() => onNavigate('daily-sheet')}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-emerald-600/20"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Daily Stock Sheet
          </button>
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Live
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl flex items-center justify-between text-amber-800 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={loadDashboard}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Revenue */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Sales</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.todayRevenue || 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{data?.todayBillsCount || 0} Bills Completed Today</span>
            </div>
          </div>
        </div>

        {/* Average Bill Value */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Bill</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {avgBillToday.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Lifetime Sales: {currencySymbol} {(data?.totalRevenue || 0).toLocaleString()}
              {data?.totalBillsCount ? ` · ${data.totalBillsCount} bills` : ''}
            </div>
          </div>
        </div>

        {/* Active Held Tabs & KOT */}
        <div
          onClick={() => onNavigate('kot')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs cursor-pointer hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Orders</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {data?.activeHeldBillsCount || 0} Held Tabs
            </div>
            <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <Utensils className="w-3.5 h-3.5" />
              <span>{data?.pendingKOTCount || 0} Kitchen Tickets in Queue</span>
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div
          onClick={() => onNavigate('inventory')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs cursor-pointer hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Alerts</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600">
              {(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)} Variants
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>{data?.outOfStockCount || 0} Out of Stock</span>
              <span>•</span>
              <span>{data?.lowStockCount || 0} Low Stock</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI System Health Check */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                AI System Health Check
                <Sparkles className="w-4 h-4 text-indigo-500" />
              </h2>
              <p className="text-[11px] text-slate-500">
                {aiHealth?.report
                  ? `Generated by ${aiHealth.report.generatedBy === 'gemini' ? 'Gemini AI' : 'rule-based engine'}${aiHealth.report.model ? ` (${aiHealth.report.model})` : ''} · ${new Date(aiHealth.report.createdAt).toLocaleString()}`
                  : 'Live health report of the whole POS system.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {aiHealth && !aiHealth.configured && (
              <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" />
                Rule-based mode — set GEMINI_API_KEY for AI analysis
              </span>
            )}
            <button
              onClick={runAiHealth}
              disabled={aiRunning}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiRunning ? 'animate-pulse' : ''}`} />
              {aiRunning ? 'Running…' : 'Run Health Check'}
            </button>
          </div>
        </div>

        {aiError && (
          <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-200 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{aiError}</span>
          </div>
        )}

        {aiHealth?.report ? (
          <div className="mt-4 space-y-4">
            {/* Status banner */}
            <div className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
              aiHealth.report.overallStatus === 'healthy'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                : aiHealth.report.overallStatus === 'attention'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200'
            }`}>
              <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                aiHealth.report.overallStatus === 'healthy' ? 'bg-emerald-500' : aiHealth.report.overallStatus === 'attention' ? 'bg-amber-500' : 'bg-rose-500'
              }`} />
              <div>
                <div className="font-black uppercase tracking-wide text-[11px]">
                  {aiHealth.report.overallStatus === 'healthy' ? 'All Systems Healthy' : aiHealth.report.overallStatus === 'attention' ? 'Attention Required' : 'Critical Issue Detected'}
                </div>
                <p className="text-[13px] mt-0.5">{aiHealth.report.summary}</p>
              </div>
            </div>

            {(aiHealth.report.issues || []).length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Issues ({(aiHealth.report.issues || []).length})
                </div>
                <ul className="space-y-2">
                  {(aiHealth.report.issues || []).map((issue, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        issue.severity === 'critical' ? 'bg-rose-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                      }`} />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{issue.title}</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[13px]"> — {issue.detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(aiHealth.report.recommendations || []).length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Recommended Actions
                </div>
                <ul className="space-y-1.5">
                  {(aiHealth.report.recommendations || []).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                      <span className="text-indigo-500 font-black mt-0.5 shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-xs text-slate-500">
            {aiRunning ? 'Running system health check…' : 'No health report yet. Run a health check to see the system status.'}
          </div>
        )}
      </div>

      {/* Today's Payment Method Breakdown */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                Today's Payment Methods
              </h2>
              <p className="text-[11px] text-slate-500">
                {data?.todayBillsCount || 0} paid bill(s) today totalling {currencySymbol}{' '}
                {(data?.todayRevenue || 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.todayRevenue || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">Total Collected Today</div>
          </div>
        </div>

        {paymentData.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {paymentData.map((entry, i) => (
                      <Cell key={`${entry.method}-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {paymentData.map((p, i) => (
                <div
                  key={p.method}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{p.name}</span>
                    <span className="text-[10px] text-slate-400">({p.count})</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-slate-900 dark:text-white">
                      {currencySymbol} {p.value.toLocaleString()}
                    </span>
                    <span className="ml-2 text-[10px] text-slate-400">
                      {paymentTotal > 0 ? Math.round((p.value / paymentTotal) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-xs text-slate-500">
            No payments recorded yet today.
          </div>
        )}
      </div>

      {/* Main Content Grid: Recent Transactions & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Transactions Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent POS Transactions</h2>
              <p className="text-xs text-slate-500">Latest completed bills across all bar & restaurant registers</p>
            </div>
            <button
              onClick={() => onNavigate('bills')}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              View All Bills <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-2.5 px-3">Bill / Invoice</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Cashier</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.recentBills && data.recentBills.length > 0 ? (
                  data.recentBills.slice(0, 7).map(b => (
                    <tr key={b.id || b.billNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        <div>{b.billNumber || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{b.invoiceNumber || b.billNumber || ''}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                        {b.cashierName || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {String(b.orderType || '').toUpperCase() || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 uppercase font-semibold text-slate-600 dark:text-slate-400">
                        {b.paymentMethod || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                        {currencySymbol} {Number(b.grandTotal || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Low Stock & Cashiers */}
        <div className="space-y-6">
          {/* Low Stock Watchlist */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Low Stock Watchlist
              </h2>
              <button
                onClick={() => onNavigate('inventory')}
                className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Stock In
              </button>
            </div>

            <div className="space-y-2.5">
              {data?.lowStockItems && data.lowStockItems.length > 0 ? (
                data.lowStockItems.map((item, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{item.productName || 'Product'}</div>
                      <div className="text-[11px] text-slate-500">{item.size || ''}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          item.status === 'OUT_OF_STOCK'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {Number(item.stock || 0)} left (Min: {Number(item.minStock || 0)})
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-emerald-600 font-semibold">
                  All inventory stock levels are healthy!
                </div>
              )}
            </div>
          </div>

          {/* Active Cashier Registers */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-500" />
                Configured Cashier Registers
              </h2>
              <button
                onClick={() => onNavigate('users')}
                className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>

            <div className="space-y-2">
              {data?.activeCashiers && data.activeCashiers.length > 0 ? (
                data.activeCashiers.map(c => (
                  <div
                    key={c.id || c.username}
                    className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{c.name || c.username || 'Cashier'}</div>
                      <div className="text-[11px] text-slate-400">{c.username ? `@${c.username}` : ''}</div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded-md">
                      ACTIVE
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  No cashier accounts configured yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
