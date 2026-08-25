import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenIngredient, KitchenStockMovement } from '../../types.ts';
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'opening_stock', label: 'Opening Stock' },
  { value: 'stock_in', label: 'Stock In' },
  { value: 'stock_out', label: 'Stock Out' },
  { value: 'sale', label: 'Auto Production (Sale)' },
  { value: 'wastage', label: 'Wastage' },
  { value: 'adjustment', label: 'Adjustment / Approval' },
  { value: 'count_correction', label: 'Count Correction' },
];

/** KITCHEN STOCK — current store, receive stock, and the full movement ledger. */
export const KitchenStock: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [ingredients, setIngredients] = useState<KitchenIngredient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Movements state
  const [movements, setMovements] = useState<KitchenStockMovement[]>([]);
  const [mTotal, setMTotal] = useState<number>(0);
  const [mPage, setMPage] = useState<number>(1);
  const [mTotalPages, setMTotalPages] = useState<number>(1);
  const [mType, setMType] = useState<string>('all');
  const [mIngredient, setMIngredient] = useState<string>('all');
  const [mSearch, setMSearch] = useState<string>('');

  // Stock modal state
  const [modalMode, setModalMode] = useState<'in' | 'out' | null>(null);
  const [selIngredient, setSelIngredient] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formRef, setFormRef] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadIngredients = async () => {
    try {
      const res = await fetchApi<KitchenIngredient[]>('/kitchen/ingredients');
      setIngredients(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load kitchen stock.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMovements = async (page = mPage) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (mType !== 'all') params.set('type', mType);
      if (mIngredient !== 'all') params.set('ingredientId', mIngredient);
      if (mSearch.trim()) params.set('reference', mSearch.trim());
      const res = await fetchApi<{ items: KitchenStockMovement[]; total: number; page: number; totalPages: number }>(`/kitchen/movements?${params.toString()}`);
      setMovements(res.items || []);
      setMTotal(res.total || 0);
      setMPage(res.page || 1);
      setMTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load kitchen movements:', err);
    }
  };

  useEffect(() => {
    loadIngredients();
  }, []);

  useEffect(() => {
    loadMovements(1);
  }, [mType, mIngredient]);

  const openModal = (mode: 'in' | 'out') => {
    setModalMode(mode);
    setSelIngredient(''); setFormQty(''); setFormCost(''); setFormReason(''); setFormRef('');
    setErrorMsg(null); setSuccessMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selIngredient) { setErrorMsg('Select an ingredient.'); return; }
    const qty = Number(formQty);
    if (!Number.isFinite(qty) || qty <= 0) { setErrorMsg('Quantity must be a positive number.'); return; }
    if (formReason.trim().length < 3) { setErrorMsg(modalMode === 'in' ? 'Add a short note (e.g. supplier delivery).' : 'A reason is required (e.g. transfer, return).'); return; }

    try {
      const body: any = { ingredientId: selIngredient, quantity: qty, reason: formReason.trim() };
      if (formRef.trim()) body.reference = formRef.trim();
      if (modalMode === 'in' && formCost !== '' && Number(formCost) > 0) body.costPerUnit = Number(formCost);

      await fetchApi(`/kitchen/stock-${modalMode}`, { method: 'POST', body: JSON.stringify(body) });
      setIsModalOpenSafe(false);
      setSuccessMsg(modalMode === 'in'
        ? `Stock received: +${qty} units recorded on the kitchen ledger.`
        : `Stock out recorded: -${qty} units with reason on the ledger.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await Promise.all([loadIngredients(), loadMovements(1)]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save stock operation.');
    }
  };

  const setIsModalOpenSafe = (open: boolean) => {
    if (!open) setModalMode(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Package className="w-6 h-6 text-amber-500" />
            Kitchen Stock
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Current kitchen store levels, stock receiving and the full ingredient movement ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadIngredients(); loadMovements(1); }}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => openModal('in')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Stock In
          </button>
          <button
            onClick={() => openModal('out')}
            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            Stock Out
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && modalMode === null && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Current stock grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Current Kitchen Store
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4 text-right">On Hand</th>
                <th className="py-3 px-4 text-right">Min Level</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400 font-semibold">Loading kitchen stock…</td></tr>
              )}
              {!isLoading && ingredients.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400 font-semibold">No ingredients yet — add them under Kitchen Ingredients.</td></tr>
              )}
              {!isLoading && ingredients.map(ing => (
                <tr key={ing.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{ing.name}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                    {ing.currentStock.toLocaleString()} <span className="text-slate-400 font-sans">{ing.unit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500">{ing.minStockLevel.toLocaleString()} {ing.unit}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      ing.isOutOfStock
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : ing.isLowStock
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}>
                      {ing.isOutOfStock ? 'Out' : ing.isLowStock ? 'Low' : 'OK'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">{new Date(ing.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement ledger */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4" />
            Ingredient Movement Ledger ({mTotal})
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Search reference (BILL-…)"
              value={mSearch}
              onChange={e => setMSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadMovements(1)}
              className="text-[11px] font-semibold px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <select
              value={mType}
              onChange={e => setMType(e.target.value)}
              className="text-[11px] font-semibold px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              {MOVEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select
              value={mIngredient}
              onChange={e => setMIngredient(e.target.value)}
              className="text-[11px] font-semibold px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer max-w-[180px]"
            >
              <option value="all">All Ingredients</option>
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Change</th>
                <th className="py-3 px-4 text-right">Before → After</th>
                <th className="py-3 px-4">Reason / Reference</th>
                <th className="py-3 px-4">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {movements.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-semibold">No movements match the filters.</td></tr>
              )}
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{m.ingredientName}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      m.movementType === 'sale' || m.movementType === 'wastage'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : m.movementType === 'stock_in'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {m.movementType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className={`py-3 px-4 text-right font-mono font-bold ${m.quantityChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.quantityChange >= 0 ? '+' : ''}{m.quantityChange} {m.unit}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500">
                    {m.quantityBefore} → {m.quantityAfter}
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-[260px] truncate" title={`${m.reason || ''} ${m.referenceId || ''}`}>
                    {m.referenceId && <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 mr-1">{m.referenceId}</span>}
                    {m.reason || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{m.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mTotalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-semibold">Page {mPage} of {mTotalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => loadMovements(Math.max(1, mPage - 1))}
                disabled={mPage <= 1}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => loadMovements(Math.min(mTotalPages, mPage + 1))}
                disabled={mPage >= mTotalPages}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stock In / Out Modal */}
      {modalMode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${modalMode === 'in' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600'}`}>
                  {modalMode === 'in' ? <ArrowDownToLine className="w-4.5 h-4.5" /> : <ArrowUpFromLine className="w-4.5 h-4.5" />}
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">
                    {modalMode === 'in' ? 'Receive Kitchen Stock' : 'Kitchen Stock Out'}
                  </h3>
                  <p className="text-xs text-slate-500">Recorded on the ingredient ledger</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpenSafe(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
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
                    <option key={i.id} value={i.id}>
                      {i.name} — {i.currentStock} {i.unit} on hand
                    </option>
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
                {modalMode === 'in' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Cost / Unit ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Keep current"
                      value={formCost}
                      onChange={e => setFormCost(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {modalMode === 'in' ? 'Note / Supplier *' : 'Reason *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={modalMode === 'in' ? 'e.g. Weekly market purchase — Cargills' : 'e.g. Transfer to bar kitchen'}
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Invoice / GRN number"
                  value={formRef}
                  onChange={e => setFormRef(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpenSafe(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
                    modalMode === 'in'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-slate-700 hover:bg-slate-600 shadow-slate-600/20'
                  }`}
                >
                  {modalMode === 'in' ? 'Receive Stock' : 'Record Stock Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
