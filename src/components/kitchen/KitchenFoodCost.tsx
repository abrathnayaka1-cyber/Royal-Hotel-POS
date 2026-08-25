import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenFoodCostRow } from '../../types.ts';
import {
  Calculator,
  AlertCircle,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

/** FOOD COST — selling price vs recipe cost per menu item (view only). */
export const KitchenFoodCost: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [rows, setRows] = useState<KitchenFoodCostRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetchApi<KitchenFoodCostRow[]>('/kitchen/food-cost');
      setRows(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load food cost data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows
    .filter(r => filter === 'all' || (filter === 'linked' && r.hasRecipe) || (filter === 'missing' && !r.hasRecipe));

  const withRecipe = rows.filter(r => r.hasRecipe);
  const avgFoodCostPct = withRecipe.length > 0
    ? Number((withRecipe.reduce((s, r) => s + (r.foodCostPct || 0), 0) / withRecipe.length).toFixed(2))
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Calculator className="w-6 h-6 text-amber-500" />
            Food Cost
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Recipe cost vs selling price per menu item — gross profit, food cost % and margin
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-xs font-semibold px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
          >
            <option value="all">All Food Items</option>
            <option value="linked">With Recipe</option>
            <option value="missing">Without Recipe</option>
          </select>
          <button
            onClick={load}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Average Food Cost</div>
          <div className={`text-2xl font-black mt-1 ${avgFoodCostPct > 40 ? 'text-rose-600' : avgFoodCostPct > 32 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {avgFoodCostPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">across {withRecipe.length} recipe-linked items</div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Recipe Coverage</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {withRecipe.length}/{rows.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">food items auto-deducting ingredients</div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Example Target</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">28–35%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">healthy food cost range for hotel kitchens</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Menu Item</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4 text-right">Selling Price</th>
                <th className="py-3 px-4 text-right">Recipe Cost</th>
                <th className="py-3 px-4 text-right">Gross Profit</th>
                <th className="py-3 px-4 text-right">Food Cost %</th>
                <th className="py-3 px-4 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">Loading food cost…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">No food items found.</td></tr>
              )}
              {!isLoading && filtered.map(r => (
                <tr key={r.variantId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">{r.productName}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      {r.variantSize}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                    {currencySymbol} {r.sellingPrice.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {r.hasRecipe ? `${currencySymbol} ${(r.recipeCost || 0).toLocaleString()}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {r.hasRecipe ? `${currencySymbol} ${(r.grossProfit || 0).toLocaleString()}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {r.hasRecipe ? (
                      <span className={`font-mono font-black ${
                        (r.foodCostPct || 0) > 40 ? 'text-rose-600' : (r.foodCostPct || 0) > 32 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {r.foodCostPct}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">
                    {r.hasRecipe ? `${r.grossMarginPct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-500">
          💡 Items without a recipe show "—" — create a recipe under{' '}
          <span className="font-bold inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Recipes &amp; Production
          </span>{' '}
          to activate automatic ingredient deduction and food cost tracking.
        </div>
      </div>
    </div>
  );
};
