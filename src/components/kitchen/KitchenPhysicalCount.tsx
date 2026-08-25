import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenPhysicalCount as KitchenPhysicalCountType } from '../../types.ts';
import {
  ClipboardCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  ShieldCheck,
  Clock,
} from 'lucide-react';

interface ExpectedRow {
  ingredientId: string;
  name: string;
  unit: string;
  expected: number;
  costPerUnit: number;
}

const APPROVAL_THRESHOLD = 5000; // Rs. — mirrors server KITCHEN_ADJUSTMENT_APPROVAL_THRESHOLD

/** PHYSICAL STOCK COUNT — expected vs physical vs variance, with approval flow. */
export const KitchenPhysicalCount: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [expected, setExpected] = useState<ExpectedRow[]>([]);
  const [countsHistory, setCountsHistory] = useState<KitchenPhysicalCountType[]>([]);
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [countNotes, setCountNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<{ counts: KitchenPhysicalCountType[]; expected: ExpectedRow[] }>('/kitchen/counts');
      setExpected(res.expected || []);
      setCountsHistory(res.counts || []);
      setCountInputs({});
      setCountNotes('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load count data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rowsWithVariance = expected.map(row => {
    const raw = countInputs[row.ingredientId];
    const physical = raw === '' || raw === undefined ? null : Number(raw);
    const variance = physical === null || !Number.isFinite(physical) ? null : Number(((physical - row.expected)).toFixed(3));
    const varianceCost = variance === null ? 0 : Math.abs(variance) * row.costPerUnit;
    const needsApproval = variance !== null && Math.abs(variance) >= 0.001 && varianceCost > APPROVAL_THRESHOLD;
    return { ...row, physical, variance, varianceCost, needsApproval };
  });

  const countedRows = rowsWithVariance.filter(r => r.physical !== null);
  const varianceRows = countedRows.filter(r => Math.abs(r.variance || 0) >= 0.001);
  const totalVarianceCost = varianceRows.reduce((s, r) => s + r.varianceCost, 0);
  const needsApprovalCount = varianceRows.filter(r => r.needsApproval).length;

  const submitCount = async () => {
    setErrorMsg(null); setSuccessMsg(null);
    if (countedRows.length === 0) {
      setErrorMsg('Enter the physical quantity for at least one ingredient.');
      return;
    }
    for (const r of countedRows) {
      if (r.physical! < 0) { setErrorMsg(`Physical count for ${r.name} cannot be negative.`); return; }
    }

    try {
      setIsSubmitting(true);
      const res = await fetchApi<{ count: KitchenPhysicalCountType; createdRequests: any[] }>('/kitchen/counts', {
        method: 'POST',
        body: JSON.stringify({
          lines: countedRows.map(r => ({ ingredientId: r.ingredientId, physical: r.physical })),
          notes: countNotes.trim() || undefined,
        }),
      });
      const reqCount = res.createdRequests?.length || 0;
      setSuccessMsg(reqCount > 0
        ? `Count ${res.count.countNumber} saved. Small variances were auto-corrected; ${reqCount} large variance(s) were sent to Super Admin for approval.`
        : `Count ${res.count.countNumber} saved and variances corrected on the ledger.`);
      setTimeout(() => setSuccessMsg(null), 6000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit physical count.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-amber-500" />
            Physical Stock Count
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Count the kitchen store — variance is computed automatically and corrected on the ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={submitCount}
            disabled={isSubmitting || countedRows.length === 0}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardCheck className="w-4 h-4" />
            {isSubmitting ? 'Submitting…' : `Submit Count (${countedRows.length})`}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {needsApprovalCount > 0 && (
        <div className="p-3 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900/60 text-purple-800 dark:text-purple-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>
            {needsApprovalCount} line(s) exceed the {currencySymbol} {APPROVAL_THRESHOLD.toLocaleString()} variance threshold and will be sent to Super Admin for approval.
          </span>
        </div>
      )}

      {/* Count entry table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Today's Count Sheet
          </h3>
          <div className="text-[11px] font-bold text-slate-500">
            Variance total: <span className={totalVarianceCost > 0 ? 'text-rose-600' : 'text-emerald-600'}>
              {currencySymbol} {totalVarianceCost.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4 text-right">Expected (System)</th>
                <th className="py-3 px-4 text-center">Physical (Counted)</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4 text-right">Variance Cost</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400 font-semibold">Loading count sheet…</td></tr>
              )}
              {!isLoading && rowsWithVariance.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400 font-semibold">No ingredients — add them under Kitchen Ingredients.</td></tr>
              )}
              {!isLoading && rowsWithVariance.map(r => (
                <tr key={r.ingredientId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{r.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {r.expected.toLocaleString()} <span className="text-slate-400 font-sans">{r.unit}</span>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="—"
                      value={countInputs[r.ingredientId] || ''}
                      onChange={e => setCountInputs(prev => ({ ...prev, [r.ingredientId]: e.target.value }))}
                      className="w-28 text-xs font-mono font-bold text-center px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none mx-auto block"
                    />
                  </td>
                  <td className={`py-3 px-4 text-right font-mono font-bold ${
                    r.variance === null || Math.abs(r.variance) < 0.001 ? 'text-slate-400'
                      : r.variance > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {r.variance === null || Math.abs(r.variance) < 0.001
                      ? '—'
                      : `${r.variance > 0 ? '+' : ''}${r.variance} ${r.unit}`}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                    {r.variance !== null && Math.abs(r.variance) >= 0.001 ? `${currencySymbol} ${r.varianceCost.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {r.variance === null || Math.abs(r.variance) < 0.001 ? (
                      <span className="text-[10px] font-black uppercase text-slate-400">—</span>
                    ) : r.needsApproval ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                        🔒 Needs Approval
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Auto-Correct
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <input
            type="text"
            placeholder="Count notes (optional) — e.g. Month-end count with head chef"
            value={countNotes}
            onChange={e => setCountNotes(e.target.value)}
            className="w-full text-xs font-semibold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
          />
        </div>
      </div>

      {/* Count history / variance register */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Count History &amp; Stock Variance
          </h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {countsHistory.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-400 font-semibold">No physical counts recorded yet</div>
          )}
          {countsHistory.slice(0, 20).map(c => (
            <div key={c.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">{c.countNumber}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    c.status === 'applied'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : c.status === 'partial'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                  }`}>
                    {c.status === 'applied' ? 'Applied' : c.status === 'partial' ? 'Partial (approval pending)' : 'Pending Approval'}
                  </span>
                  {c.notes && <span className="text-[11px] text-slate-500 truncate max-w-[280px]">{c.notes}</span>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.createdAt).toLocaleString()}</span>
                  <span>by <strong>{c.userName}</strong></span>
                  <span className="font-black text-rose-600">Variance: {currencySymbol} {c.totalVarianceCost.toLocaleString()}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 uppercase font-bold">
                      <th className="py-1.5 pr-3">Ingredient</th>
                      <th className="py-1.5 px-3 text-right">Expected</th>
                      <th className="py-1.5 px-3 text-right">Physical</th>
                      <th className="py-1.5 px-3 text-right">Variance</th>
                      <th className="py-1.5 px-3 text-right">Variance Cost</th>
                      <th className="py-1.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                    {c.lines.filter(l => l.status !== 'no_variance').map(l => (
                      <tr key={l.ingredientId}>
                        <td className="py-1.5 pr-3 font-bold text-slate-700 dark:text-slate-300">{l.ingredientName}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{l.expected} {l.unit}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{l.physical} {l.unit}</td>
                        <td className={`py-1.5 px-3 text-right font-mono font-bold ${l.variance > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {l.variance > 0 ? '+' : ''}{l.variance} {l.unit}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono">{currencySymbol} {l.varianceCost.toLocaleString()}</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                            l.status === 'applied'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                          }`}>
                            {l.status === 'applied' ? 'Corrected' : 'Awaiting Approval'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
