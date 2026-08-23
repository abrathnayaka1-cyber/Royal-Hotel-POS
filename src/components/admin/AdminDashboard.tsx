import React, { useState, useEffect } from 'react';
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
  Wine,
  ArrowUpRight,
  RefreshCw,
  CreditCard,
  Banknote,
  Receipt,
  FileSpreadsheet
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
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
  activeCashiers: any[];
}

export const AdminDashboard: React.FC<{ settings: SystemSettings | null; onNavigate: (tab: string) => void }> = ({
  settings,
  onNavigate,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

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
    // Auto refresh every 30 seconds for live monitoring
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

  const avgBillToday =
    data && data.todayBillsCount > 0 ? Math.round(data.todayRevenue / data.todayBillsCount) : 0;

  // Aggregate payment methods for today / recent
  const paymentData = [
    { name: 'Cash', value: data?.recentBills.filter(b => b.paymentMethod === 'cash').reduce((s, b) => s + b.grandTotal, 0) || 0 },
    { name: 'Card', value: data?.recentBills.filter(b => b.paymentMethod === 'card').reduce((s, b) => s + b.grandTotal, 0) || 0 },
    { name: 'Bank Transfer', value: data?.recentBills.filter(b => b.paymentMethod === 'bank_transfer').reduce((s, b) => s + b.grandTotal, 0) || 0 },
    { name: 'Other', value: data?.recentBills.filter(b => b.paymentMethod === 'other').reduce((s, b) => s + b.grandTotal, 0) || 0 },
  ].filter(p => p.value > 0);

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
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        <div>{b.billNumber}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{b.invoiceNumber}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                        {b.cashierName}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {b.orderType.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 uppercase font-semibold text-slate-600 dark:text-slate-400">
                        {b.paymentMethod}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                        {currencySymbol} {b.grandTotal.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No transactions recorded yet today.
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
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.productName}</div>
                      <div className="text-[11px] text-slate-500">{item.size}</div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          item.status === 'OUT_OF_STOCK'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {item.stock} left (Min: {item.minStock})
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
              {data?.activeCashiers?.map(c => (
                <div
                  key={c.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                    <div className="text-[11px] text-slate-400">@{c.username}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded-md">
                    ACTIVE
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
