import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenIngredient } from '../../types.ts';
import {
  Plus,
  Edit2,
  Carrot,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  Package,
} from 'lucide-react';

/** KITCHEN INGREDIENTS — manage the Food & Kitchen ingredient store. */
export const KitchenIngredients: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [ingredients, setIngredients] = useState<KitchenIngredient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [target, setTarget] = useState<KitchenIngredient | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('g');
  const [formStock, setFormStock] = useState('0');
  const [formMin, setFormMin] = useState('0');
  const [formCost, setFormCost] = useState('0');
  const [formNote, setFormNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<KitchenIngredient[]>('/kitchen/ingredients');
      setIngredients(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('Failed to load kitchen ingredients:', err);
      setErrorMsg(err?.message || 'Failed to load ingredients.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setTarget(null);
    setFormName(''); setFormUnit('g'); setFormStock('0'); setFormMin('0'); setFormCost('0'); setFormNote('');
    setErrorMsg(null); setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const openEdit = (ing: KitchenIngredient) => {
    setTarget(ing);
    setFormName(ing.name); setFormUnit(ing.unit); setFormStock(String(ing.currentStock));
    setFormMin(String(ing.minStockLevel)); setFormCost(String(ing.costPerUnit)); setFormNote('');
    setErrorMsg(null); setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = formName.trim();
    if (name.length < 2) { setErrorMsg('Ingredient name must be at least 2 characters.'); return; }
    if (!formUnit.trim()) { setErrorMsg('Unit is required (e.g. g, kg, ml, pcs).'); return; }

    try {
      const payload: any = {
        name,
        unit: formUnit.trim(),
        minStockLevel: Number(formMin) || 0,
        costPerUnit: Number(formCost) || 0,
      };
      if (!target) {
        payload.currentStock = Number(formStock) || 0;
        payload.openingReason = formNote.trim() || undefined;
        await fetchApi('/kitchen/ingredients', { method: 'POST', body: JSON.stringify(payload) });
        setSuccessMsg(`Ingredient "${name}" added to the kitchen store.`);
      } else {
        payload.currentStock = target.currentStock; // quantity only changes via Stock In / Count
        await fetchApi(`/kitchen/ingredients/${target.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setSuccessMsg(`Ingredient "${name}" updated.`);
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save ingredient.');
    }
  };

  const filtered = ingredients
    .filter(ing => statusFilter === 'all'
      || (statusFilter === 'low' && ing.isLowStock)
      || (statusFilter === 'out' && ing.isOutOfStock)
      || (statusFilter === 'ok' && !ing.isLowStock && !ing.isOutOfStock))
    .filter(ing => !search.trim() || ing.name.toLowerCase().includes(search.trim().toLowerCase()));

  const totalValue = filtered.reduce((s, i) => s + (i.stockValue || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Carrot className="w-6 h-6 text-amber-500" />
            Kitchen Ingredients
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
              {ingredients.length} Items
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Food &amp; Kitchen raw material store — rice, chicken, vegetables, spices and more
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh Ingredients"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add Ingredient
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search ingredients (e.g. rice, chicken, oil)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-xs font-semibold px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs font-semibold px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="ok">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">Current Qty</th>
                <th className="py-3 px-4 text-right">Min Level</th>
                <th className="py-3 px-4 text-right">Cost / Unit</th>
                <th className="py-3 px-4 text-right">Stock Value</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400 font-semibold">Loading ingredients…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400 font-semibold">No ingredients found. Add your first kitchen ingredient.</td></tr>
              )}
              {!isLoading && filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{ing.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{ing.unit}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                    {ing.currentStock.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">{ing.minStockLevel.toLocaleString()}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {currencySymbol} {ing.costPerUnit.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                    {currencySymbol} {(ing.stockValue || 0).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      ing.isOutOfStock
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : ing.isLowStock
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}>
                      {ing.isOutOfStock ? 'Out of Stock' : ing.isLowStock ? 'Low Stock' : 'In Stock'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => openEdit(ing)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                      title={`Edit ${ing.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 dark:text-slate-300 flex justify-between">
          <span>{filtered.length} ingredient(s)</span>
          <span>Total Value: {currencySymbol} {totalValue.toLocaleString()}</span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Carrot className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">
                    {target ? 'Edit Ingredient' : 'Add Kitchen Ingredient'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {target ? target.name : 'New raw material for the Food & Kitchen store'}
                  </p>
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
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Ingredient Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice (Samba), Chicken (Boneless), Cooking Oil"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Unit *</label>
                  <select
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                  >
                    <option value="g">g (grams)</option>
                    <option value="kg">kg (kilograms)</option>
                    <option value="ml">ml (millilitres)</option>
                    <option value="l">l (litres)</option>
                    <option value="pcs">pcs (pieces)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {target ? 'Current Qty (read-only)' : 'Opening Stock *'}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    disabled={Boolean(target)}
                    placeholder="0"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Minimum Stock Level</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formMin}
                    onChange={e => setFormMin(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Cost per Unit ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formCost}
                    onChange={e => setFormCost(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              {target && (
                <p className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
                  ℹ️ Quantities change only through <strong>Stock In / Stock Out / Physical Count</strong> so every movement stays on the ledger. Cost, minimum level, name and unit can be edited here.
                </p>
              )}

              {!target && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Opening Stock Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Initial kitchen store setup"
                    value={formNote}
                    onChange={e => setFormNote(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
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
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                >
                  {target ? 'Save Changes' : 'Add Ingredient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
