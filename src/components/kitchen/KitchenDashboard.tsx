import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenDashboardData } from '../../types.ts';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  Carrot,
  RefreshCw,
  BookOpen,
  History,
  ChefHat,
} from 'lucide-react';

/**
 * KITCHEN MANAGER DASHBOARD — restricted view showing ONLY Food & Kitchen
 * information. Same card/table design as the Super Admin dashboard, but no
 * system-wide financials, cashier data or business-wide revenue.
 */
export const KitchenDashboard: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { settings } = usePOS();
  const [data, setData] = useState<KitchenDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetchApi<KitchenDashboardData>('/kitchen/dashboard');
      setData(res);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load kitchen metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ChefHat className="w-6 h-6 text-amber-500" />
            Kitchen Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time Food &amp; Kitchen overview — food sales, cost control, stock alerts and wastage
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">Updated: {lastRefreshed.toLocaleTimeString()}</span>
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Food Sales */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Food Sales</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.todayFoodSales || 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{data?.todayFoodItemsSold || 0} food items on {data?.todayFoodBillsCount || 0} bills</span>
            </div>
          </div>
        </div>

        {/* Food Cost */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Food Cost</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
              <Carrot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.todayFoodCost || 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Food Cost: <span className="font-bold text-blue-600 dark:text-blue-400">{data?.foodCostPct ?? 0}%</span> of food sales
            </div>
          </div>
        </div>

        {/* Gross Food Profit */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Food Profit</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.grossFoodProfit || 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Store value: {currencySymbol} {(data?.totalIngredientValue || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Stock & Wastage Alerts */}
        <div
          onClick={() => onNavigate('ingredients')}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs cursor-pointer hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Kitchen Stock Alerts</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-600">
              {(data?.lowStockCount || 0) + (data?.outOfStockCount || 0)} Ingredients
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>{data?.outOfStockCount || 0} Out of Stock</span>
              <span>•</span>
              <span>{data?.lowStockCount || 0} Low Stock</span>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white">
              {currencySymbol} {(data?.todayWastageCost || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-tight">
              Today's Wastage ({data?.todayWastageCount || 0})
            </div>
          </div>
        </div>

        <div
          onClick={() => onNavigate('recipes')}
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3 cursor-pointer hover:border-amber-400 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white">{data?.activeRecipeCount || 0}</div>
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-tight">Active Recipes</div>
          </div>
        </div>

        <div
          onClick={() => onNavigate('count')}
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3 cursor-pointer hover:border-purple-400 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white">{data?.pendingApprovals || 0}</div>
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-tight">Pending Approvals</div>
          </div>
        </div>

        <div
          onClick={() => onNavigate('stock')}
          className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3 cursor-pointer hover:border-blue-400 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white">Stock Ledger</div>
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-tight">Kitchen Movements</div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Low Stock + Recent Kitchen Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white">Kitchen Stock Alerts</h3>
              <p className="text-[11px] text-slate-500">Ingredients at or below minimum level</p>
            </div>
            <button
              onClick={() => onNavigate('stock')}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
            >
              Receive Stock
            </button>
          </div>
          <div className="space-y-2">
            {(data?.lowStockItems || []).length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">
                All kitchen ingredients are above minimum stock levels ✓
              </div>
            )}
            {(data?.lowStockItems || []).map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.status === 'OUT_OF_STOCK'
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {item.stock}{item.unit} on hand · min {item.min}{item.unit}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                    item.status === 'OUT_OF_STOCK'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {item.status === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Low Stock'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="font-black text-sm text-slate-900 dark:text-white mb-4">Recent Kitchen Activity</h3>
          <div className="space-y-2.5">
            {(data?.recentActivity || []).length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400 font-semibold">No kitchen activity yet</div>
            )}
            {(data?.recentActivity || []).slice(0, 8).map(log => (
              <div key={log.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                  {log.userName?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-snug">
                    {log.action?.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{log.details || log.entity}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent ingredient movements */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-sm text-slate-900 dark:text-white">Recent Ingredient Movements</h3>
            <p className="text-[11px] text-slate-500">Latest kitchen store ledger entries</p>
          </div>
          <button
            onClick={() => onNavigate('stock')}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-2.5 px-3">Ingredient</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Change</th>
                <th className="py-2.5 px-3 text-right">After</th>
                <th className="py-2.5 px-3">Reason / Reference</th>
                <th className="py-2.5 px-3">By</th>
                <th className="py-2.5 px-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.recentMovements || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                    No movements recorded yet
                  </td>
                </tr>
              )}
              {(data?.recentMovements || []).map(m => (
                <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{m.ingredientName}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {m.movementType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono font-bold ${m.quantityChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.quantityChange >= 0 ? '+' : ''}{m.quantityChange}{m.unit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                    {m.quantityAfter}{m.unit}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[220px] truncate" title={m.reason || m.referenceId || ''}>
                    {m.referenceId ? <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 mr-1">{m.referenceId}</span> : null}
                    {m.reason || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{m.userName}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{new Date(m.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
