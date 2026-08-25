import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenIngredient, KitchenWastageRecord, KITCHEN_WASTAGE_CATEGORIES, KitchenWastageCategory } from '../../types.ts';
import {
  Trash2,
  Plus,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
} from 'lucide-react';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

/** WASTAGE — record kitchen wastage with full ledger + audit trail. */
export const KitchenWastage: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [ingredients, setIngredients] = useState<KitchenIngredient[]>([]);
  const [records, setRecords] = useState<KitchenWastageRecord[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [from, setFrom] = useState<string>(monthStartStr());
  const [to, setToStr] = useState<string>(todayStr());
  const [category, setCategory] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selIngredient, setSelIngredient] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formCategory, setFormCategory] = useState<KitchenWastageCategory>('Spoilage');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (category !== 'all') params.set('category', category);
      const [ings, res] = await Promise.all([
        fetchApi<KitchenIngredient[]>('/kitchen/ingredients'),
        fetchApi<{ items: KitchenWastageRecord[]; totalCost: number }>(`/kitchen/wastage?${params.toString()}`),
      ]);
      setIngredients(Array.isArray(ings) ? ings : []);
      setRecords(res.items || []);
      setTotalCost(res.totalCost || 0);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load wastage records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [from, to, category]);

  const openModal = () => {
    setSelIngredient(''); setFormQty(''); setFormCategory('Spoilage'); setFormReason(''); setFormNotes('');
    setErrorMsg(null); setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const selectedIng = ingredients.find(i => i.id === selIngredient);
  const previewCost = selectedIng && Number(formQty) > 0 ? Number(formQty) * selectedIng.costPerUnit : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selIngredient) { setErrorMsg('Select an ingredient.'); return; }
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) { setErrorMsg('Quantity must be a positive number.'); return; }
    if (formReason.trim().length < 3) { setErrorMsg('Describe the reason for the wastage.'); return; }

    try {
      await fetchApi('/kitchen/wastage', {
        method: 'POST',
        body: JSON.stringify({
          ingredientId: selIngredient,
          quantity: qty,
          category: formCategory,
          reason: formReason.trim(),
          notes: formNotes.trim() || undefined,
        }),
      });
      setIsModalOpen(false);
      setSuccessMsg(`Wastage recorded: ${qty} ${selectedIng?.unit || ''} of ${selectedIng?.name || ''} — stock adjusted on the ledger.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record wastage.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Trash2 className="w-6 h-6 text-amber-500" />
            Kitchen Wastage
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Spoilage, spillage, burnt food, expiry and other kitchen losses — every record adjusts stock on the ledger
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
            onClick={openModal}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Record Wastage
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && !isModalOpen && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filters + total */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs font-semibold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl" />
          <span className="text-xs text-slate-400 font-bold">to</span>
          <input type="date" value={to} onChange={e => setToStr(e.target.value)}
            className="text-xs font-semibold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl" />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="text-xs font-semibold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
        >
          <option value="all">All Categories</option>
          {KITCHEN_WASTAGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-black text-rose-700 dark:text-rose-300">
          Total Wastage: {currencySymbol} {totalCost.toLocaleString()}
        </div>
      </div>

      {/* Records table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Cost</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">Loading wastage records…</td></tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">No wastage recorded for this period ✓</td></tr>
              )}
              {!isLoading && records.map(w => (
                <tr key={w.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{new Date(w.createdAt).toLocaleString()}</td>
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{w.ingredientName}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                    {w.quantity} {w.unit}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      {w.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                    {currencySymbol} {w.cost.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-[240px] truncate" title={w.reason || ''}>{w.reason || '—'}</td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{w.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 dark:text-slate-300 flex justify-between">
          <span>{records.length} record(s)</span>
          <span>Total: {currencySymbol} {totalCost.toLocaleString()}</span>
        </div>
      </div>

      {/* Record Wastage Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                  <Trash2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Record Wastage</h3>
                  <p className="text-xs text-slate-500">Stock is reduced through the movement ledger</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Ingredient *</label>
                <select
                  value={selIngredient}
                  onChange={e => setSelIngredient(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                >
                  <option value="">Select ingredient…</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — {i.currentStock} {i.unit} on hand</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    placeholder="0"
                    value={formQty}
                    onChange={e => setFormQty(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Category *</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as KitchenWastageCategory)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                  >
                    {KITCHEN_WASTAGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice left overnight in cooker"
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Additional details"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              {previewCost > 0 && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-black text-rose-700 dark:text-rose-300">
                  Wastage value: {currencySymbol} {previewCost.toFixed(2)}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  Record Wastage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
