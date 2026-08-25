import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { exportToExcel } from '../../lib/exportUtils.ts';
import {
  BarChart3,
  AlertCircle,
  RefreshCw,
  Download,
} from 'lucide-react';

const REPORT_TYPES = [
  { value: 'food-cost', label: 'Food Cost & Menu Profitability' },
  { value: 'consumption', label: 'Ingredient Consumption' },
  { value: 'wastage', label: 'Wastage' },
  { value: 'variance', label: 'Stock Variance (Counts)' },
  { value: 'purchases', label: 'Kitchen Purchases (Stock In)' },
  { value: 'movements', label: 'Kitchen Stock Movement' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const weekAgoStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
};

/** KITCHEN REPORTS — kitchen-scoped reporting only (no payroll/users/finances). */
export const KitchenReports: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [type, setType] = useState<string>('food-cost');
  const [from, setFrom] = useState<string>(weekAgoStr());
  const [to, setToStr] = useState<string>(todayStr());
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      params.set('type', type);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetchApi<any>(`/kitchen/reports?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load report.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [type, from, to]);

  const handleExport = () => {
    if (!data?.rows || data.rows.length === 0) return;
    exportToExcel(data.rows, `Kitchen_Report_${type}_${from}_to_${to}`);
  };

  const fmtMoney = (v: number) => `${currencySymbol} ${(v || 0).toLocaleString()}`;
  const fmtQty = (v: number, unit?: string) => `${(v || 0).toLocaleString()}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-amber-500" />
            Kitchen Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Food &amp; Kitchen reporting only — consumption, wastage, variance, food cost and purchases
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!data?.rows || data.rows.length === 0}
            className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="flex-1 text-xs font-semibold px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
        >
          {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="text-xs font-semibold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl" />
        <span className="text-xs text-slate-400 font-bold self-center">to</span>
        <input type="date" value={to} onChange={e => setToStr(e.target.value)}
          className="text-xs font-semibold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl" />
      </div>

      {/* Summary strip */}
      {data && (
        <div className="flex flex-wrap gap-2">
          {type === 'food-cost' && (
            <>
              <SummaryChip label="Food Sales" value={fmtMoney(data.totalFoodSales)} tone="emerald" />
              <SummaryChip label="Food Cost" value={fmtMoney(data.totalFoodCost)} tone="blue" />
              <SummaryChip label="Gross Profit" value={fmtMoney(data.totalGrossProfit)} tone="indigo" />
            </>
          )}
          {type === 'consumption' && <SummaryChip label="Consumption Cost" value={fmtMoney(data.totalCostValue)} tone="rose" />}
          {type === 'wastage' && <SummaryChip label="Wastage Cost" value={fmtMoney(data.totalCost)} tone="rose" />}
          {type === 'variance' && <SummaryChip label="Total Variance" value={fmtMoney(data.totalVarianceCost)} tone="rose" />}
          {type === 'purchases' && <SummaryChip label="Purchases" value={fmtMoney(data.totalCostValue)} tone="emerald" />}
          {type === 'movements' && <SummaryChip label="Movements" value={`${data.totalRows} rows`} tone="slate" />}
        </div>
      )}

      {/* Report table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400">Generating report…</div>
          ) : !data?.rows || data.rows.length === 0 ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400">No data for this period</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                  {type === 'food-cost' && (
                    <>
                      <Th>Menu Item</Th><Th>Size</Th><Th right>Qty Sold</Th><Th right>Food Sales</Th><Th right>Food Cost</Th><Th right>Gross Profit</Th><Th right>Food Cost %</Th>
                    </>
                  )}
                  {type === 'consumption' && (
                    <>
                      <Th>Ingredient</Th><Th right>Sales Usage</Th><Th right>Wastage</Th><Th right>Stock Out</Th><Th right>Total Consumed</Th><Th right>Cost Value</Th>
                    </>
                  )}
                  {type === 'wastage' && (
                    <>
                      <Th>Date</Th><Th>Ingredient</Th><Th right>Qty</Th><Th>Category</Th><Th right>Cost</Th><Th>Reason</Th><Th>By</Th>
                    </>
                  )}
                  {type === 'variance' && (
                    <>
                      <Th>Count</Th><Th>Date</Th><Th>Ingredient</Th><Th right>Expected</Th><Th right>Physical</Th><Th right>Variance</Th><Th right>Cost</Th>
                    </>
                  )}
                  {type === 'purchases' && (
                    <>
                      <Th>Date</Th><Th>Ingredient</Th><Th right>Qty</Th><Th right>Cost/Unit</Th><Th right>Cost Value</Th><Th>Reference</Th><Th>Received By</Th>
                    </>
                  )}
                  {type === 'movements' && (
                    <>
                      <Th>Date</Th><Th>Ingredient</Th><Th>Type</Th><Th right>Change</Th><Th right>After</Th><Th>Reason</Th><Th>By</Th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {type === 'food-cost' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td bold>{r.productName}</Td>
                    <Td>{r.variantSize}</Td>
                    <Td right mono>{r.quantitySold}</Td>
                    <Td right mono>{fmtMoney(r.foodSales)}</Td>
                    <Td right mono>{fmtMoney(r.foodCost)}</Td>
                    <Td right mono className="text-emerald-600 font-bold">{fmtMoney(r.grossProfit)}</Td>
                    <Td right mono bold>{r.foodCostPct}%</Td>
                  </tr>
                ))}
                {type === 'consumption' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td bold>{r.ingredientName}</Td>
                    <Td right mono>{fmtQty(r.consumedBySales)}</Td>
                    <Td right mono className="text-rose-600">{fmtQty(r.wastage)}</Td>
                    <Td right mono>{fmtQty(r.stockOut)}</Td>
                    <Td right mono bold>{fmtQty(r.totalConsumed)}</Td>
                    <Td right mono bold>{fmtMoney(r.costValue)}</Td>
                  </tr>
                ))}
                {type === 'wastage' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td bold>{r.ingredientName}</Td>
                    <Td right mono className="text-rose-600 font-bold">{fmtQty(r.quantity, r.unit)}</Td>
                    <Td>{r.category}</Td>
                    <Td right mono>{fmtMoney(r.cost)}</Td>
                    <Td>{r.reason}</Td>
                    <Td>{r.userName}</Td>
                  </tr>
                ))}
                {type === 'variance' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td mono>{r.countNumber}</Td>
                    <Td>{new Date(r.createdAt).toLocaleDateString()}</Td>
                    <Td bold>{r.ingredientName}</Td>
                    <Td right mono>{fmtQty(r.expected, r.unit)}</Td>
                    <Td right mono>{fmtQty(r.physical, r.unit)}</Td>
                    <Td right mono className={r.variance > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {r.variance > 0 ? '+' : ''}{fmtQty(r.variance, r.unit)}
                    </Td>
                    <Td right mono>{fmtMoney(r.varianceCost)}</Td>
                  </tr>
                ))}
                {type === 'purchases' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td bold>{r.ingredientName}</Td>
                    <Td right mono>{fmtQty(r.quantity, r.unit)}</Td>
                    <Td right mono>{fmtMoney(r.costPerUnit)}</Td>
                    <Td right mono bold>{fmtMoney(r.costValue)}</Td>
                    <Td mono>{r.reference || '—'}</Td>
                    <Td>{r.receivedBy}</Td>
                  </tr>
                ))}
                {type === 'movements' && data.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td bold>{r.ingredientName}</Td>
                    <Td>{r.movementType.replace(/_/g, ' ')}</Td>
                    <Td right mono className={r.quantityChange >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      {r.quantityChange >= 0 ? '+' : ''}{fmtQty(r.quantityChange, r.unit)}
                    </Td>
                    <Td right mono>{fmtQty(r.quantityAfter, r.unit)}</Td>
                    <Td>{r.reason}</Td>
                    <Td>{r.userName}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const SummaryChip: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => {
  const toneCls: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60',
    blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60',
    rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className={`px-4 py-2 border rounded-xl text-xs font-black ${toneCls[tone] || toneCls.slate}`}>
      {label}: <span className="font-mono">{value}</span>
    </div>
  );
};

const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`py-3 px-4 ${right ? 'text-right' : ''}`}>{children}</th>
);

const Td: React.FC<{ children?: React.ReactNode; right?: boolean; bold?: boolean; mono?: boolean; className?: string }> = ({ children, right, bold, mono, className = '' }) => (
  <td className={`py-3 px-4 ${right ? 'text-right' : ''} ${bold ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'} ${mono ? 'font-mono' : ''} ${className}`}>
    {children}
  </td>
);
