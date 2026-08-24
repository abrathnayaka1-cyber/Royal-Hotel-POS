import React, { useMemo, useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { fetchApi } from '../../lib/api.ts';
import { Product, ProductVariant } from '../../types.ts';
import { AlertTriangle, Search, Wine, CheckCircle2, Loader2, X } from 'lucide-react';

/**
 * Cashier-accessible Damage / Breakage reporting.
 * Lets the POS user note broken or damaged bottles — stock is written off
 * with a 'damaged' movement and admins see it in Stock Movements + Audit Logs.
 */
export const DamageReportModal: React.FC = () => {
  const {
    products,
    isDamageModalOpen,
    setIsDamageModalOpen,
    refreshProducts,
  } = usePOS();

  const [search, setSearch] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState<string>('');
  const [isOpenBottle, setIsOpenBottle] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isDamageModalOpen) return null;

  const resetForm = () => {
    setSearch('');
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQuantity(1);
    setNote('');
    setIsOpenBottle(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    resetForm();
    setIsDamageModalOpen(false);
  };

  const filteredProducts = products
    .filter(p => p.isActive && !p.isArchived)
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.variants.some(v => v.size.toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q))
      );
    })
    .slice(0, 30);

  // Shot sizes cannot be damaged directly — the liquid lives in the 750ml bottle
  const damageableVariants = selectedProduct
    ? selectedProduct.variants.filter(v => v.isActive && !v.isShot)
    : [];

  const is750OfShotProduct = Boolean(
    selectedProduct?.servesShots &&
    selectedVariant &&
    /750\s*ml/i.test(selectedVariant.size)
  );
  const openBottleUsedMl = Math.max(0, Number(selectedProduct?.openBottleUsedMl) || 0);
  const canBeOpenBottle = is750OfShotProduct && openBottleUsedMl > 0;

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setSelectedVariant(null);
    setIsOpenBottle(false);
    setQuantity(1);
    setErrorMsg(null);
  };

  const handleSubmit = async () => {
    if (!selectedVariant) {
      setErrorMsg('Please select the damaged bottle size.');
      return;
    }
    if (note.trim().length < 3) {
      setErrorMsg('Please write a short note describing how the damage/breakage happened.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const result = await fetchApi<{ message: string; newStock: number }>('/inventory/damage-report', {
        method: 'POST',
        body: JSON.stringify({
          variantId: selectedVariant.id,
          quantity: isOpenBottle ? 1 : quantity,
          reason: note.trim(),
          openBottle: isOpenBottle,
        }),
      });

      setSuccessMsg(result.message || 'Damage recorded successfully.');
      await refreshProducts();

      // Auto close shortly after showing the confirmation
      setTimeout(() => {
        resetForm();
        setIsDamageModalOpen(false);
      }, 2200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record the damage report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 z-50 animate-in fade-in duration-150">
      <div
        id="damage-report-modal"
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800"
      >
        {/* Header */}
        <div className="bg-rose-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2.5 text-white">
            <AlertTriangle className="w-5 h-5" />
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight leading-tight">
                Damage / Breakage Report
              </h2>
              <p className="text-[11px] text-rose-100 font-medium">
                Note broken or damaged bottles — stock is written off and admin is notified
              </p>
            </div>
          </div>
          <button
            id="close-damage-modal-btn"
            onClick={handleClose}
            className="text-rose-100 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {successMsg ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-semibold flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Find the product */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                  1. Find the damaged item
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search product by name, size or SKU..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="mt-2 max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 text-center">No matching products found.</div>
                  ) : (
                    filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProduct(p)}
                        className={`w-full text-left px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          selectedProduct?.id === p.id
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Wine className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          {p.name}
                        </span>
                        {p.servesShots && (
                          <span className="text-[9px] font-black text-purple-500 uppercase shrink-0">🥃 Shots</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Step 2: Which size / bottle */}
              {selectedProduct && (
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    2. Which bottle / size was damaged?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {damageableVariants.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setSelectedVariant(v); setIsOpenBottle(false); setErrorMsg(null); }}
                        className={`p-2.5 border-2 rounded-xl text-left transition-all cursor-pointer ${
                          selectedVariant?.id === v.id
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                            : 'border-slate-200 dark:border-slate-700 hover:border-rose-400 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{v.size}</span>
                        <span className="block text-[10px] font-bold text-slate-500 mt-0.5">Stock: {v.stock}</span>
                      </button>
                    ))}
                  </div>
                  {selectedProduct.servesShots && (
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Shot sizes are not listed — shots pour from the 750ml Bottle, so report bottle damage instead.
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Details */}
              {selectedVariant && (
                <div className="space-y-3 pt-1">
                  {canBeOpenBottle && (
                    <label className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOpenBottle}
                        onChange={e => { setIsOpenBottle(e.target.checked); if (e.target.checked) setQuantity(1); }}
                        className="w-4 h-4 mt-0.5 text-amber-600 rounded"
                      />
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        The broken bottle was the currently OPEN bottle (shots poured from it)
                        <span className="block font-medium text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                          Open bottle status: {openBottleUsedMl}ml already poured • {750 - openBottleUsedMl}ml remaining liquid will be written off
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div>
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                        Damaged Qty
                      </label>
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 w-fit">
                        <button
                          type="button"
                          disabled={isOpenBottle}
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                        >
                          -
                        </button>
                        <span className="px-4 py-1.5 font-extrabold text-sm min-w-10 text-center text-slate-900 dark:text-white">
                          {isOpenBottle ? 1 : quantity}
                        </span>
                        <button
                          type="button"
                          disabled={isOpenBottle}
                          onClick={() => setQuantity(Math.min(selectedVariant.stock > 0 ? selectedVariant.stock : 1000, quantity + 1))}
                          className="px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex-1">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                        3. Note — what happened? *
                      </label>
                      <textarea
                        rows={2}
                        required
                        placeholder="e.g. Bottle slipped and broke while serving / cracked cap leaking..."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        className="w-full text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successMsg && (
          <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 rounded-lg font-bold text-xs uppercase text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="submit-damage-report-btn"
              type="button"
              disabled={!selectedVariant || isSubmitting}
              onClick={handleSubmit}
              className={`px-6 py-2 rounded-lg font-black text-xs uppercase text-white shadow-md transition-all flex items-center gap-2 ${
                selectedVariant && !isSubmitting
                  ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer active:scale-98'
                  : 'bg-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Record Damage
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
