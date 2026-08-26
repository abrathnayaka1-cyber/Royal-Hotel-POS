import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { ProductVariant } from '../../types.ts';
import { X, Check, ShoppingCart, AlertTriangle } from 'lucide-react';

export const VariantSelectorModal: React.FC = () => {
  const {
    isVariantModalOpen,
    selectedProductForVariant,
    closeVariantModal,
    addToCart,
    availableStockFor,
    settings,
  } = usePOS();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [itemNotes, setItemNotes] = useState<string>('');

  if (!isVariantModalOpen || !selectedProductForVariant) return null;

  const product = selectedProductForVariant;
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // --- 750ml bottle pool (shot products) ---
  // Every shot pours from this shared pool, so the cashier can watch the
  // total liquid volume drop ml-by-ml as shots are sold.
  const servesShots = Boolean(product.servesShots);
  const bottleVariant = servesShots
    ? product.variants.find(v => !v.isShot && /750\s*ml/i.test(v.size))
    : undefined;
  const poolRemainingMl = Math.max(0, Number(product.availableShotMl) || 0);
  const openUsedMl = Math.max(0, Number(product.openBottleUsedMl) || 0);
  const fmtMl = (ml: number) => ml.toLocaleString();
  const fmtL = (ml: number) => `${(ml / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}L`;

  const handleSelectVariant = (variant: ProductVariant) => {
    setSelectedVariant(variant);
  };

  const handleConfirm = () => {
    if (!selectedVariant) return;
    addToCart(product, selectedVariant, quantity, itemNotes);
    setSelectedVariant(null);
    setQuantity(1);
    setItemNotes('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 z-50 animate-in fade-in duration-150">
      <div
        id="variant-selector-modal"
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800"
      >
        {/* Modal Header */}
        <div className="bg-slate-100 dark:bg-slate-800/90 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">
            {product.name} <span className="text-slate-400 font-normal lowercase">— select size & quantity</span>
          </h2>
          <button
            id="close-variant-modal-btn"
            onClick={closeVariantModal}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-2xl font-bold p-1 leading-none"
          >
            &times;
          </button>
        </div>

        {/* Modal Body / Variants Grid */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* 750ml Bottle Pool — live ml meter for shot-serving products */}
          {servesShots && bottleVariant && (
            <div
              id="bottle-pool-meter"
              className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/40 px-4 py-3"
              title="Shots pour from this shared 750ml bottle pool — every shot sold reduces the remaining ml"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                  🥃 750ml Bottle Pool
                </span>
                <span className="text-[11px] font-bold text-cyan-800 dark:text-cyan-200">
                  {bottleVariant.stock} × 750ml = {(bottleVariant.stock * 750).toLocaleString()}ml total
                  {openUsedMl > 0 && ` • Open bottle: ${openUsedMl}ml used / ${750 - openUsedMl}ml left`}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-cyan-100 dark:bg-cyan-900 overflow-hidden" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400 transition-all"
                  style={{ width: `${Math.min(100, Math.round((poolRemainingMl / Math.max(1, (bottleVariant.stock * 750) + openUsedMl)) * 100))}%` }}
                />
              </div>
              <div className="mt-1.5 text-sm font-extrabold text-cyan-800 dark:text-cyan-100">
                Remaining: {fmtMl(poolRemainingMl)}ml ({fmtL(poolRemainingMl)})
                <span className="ml-2 text-[11px] font-semibold text-cyan-600 dark:text-cyan-300">
                  — drops by every shot poured
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {product.variants
              .filter(v => v.isActive)
              .map(variant => {
                const isSelected = selectedVariant?.id === variant.id;
                const isShot = Boolean(product.servesShots && variant.isShot);
                // Cart-aware remaining: shots & bottles share the same 750ml pool
                const remaining = availableStockFor(variant);
                const isOutOfStock = remaining <= 0;
                const isLowStock = !isShot && remaining > 0 && remaining <= variant.minStockLevel;

                return (
                  <button
                    key={variant.id}
                    id={`variant-btn-${variant.id}`}
                    type="button"
                    disabled={isOutOfStock && !settings?.allowNegativeStock}
                    onClick={() => handleSelectVariant(variant)}
                    className={`flex flex-col justify-between p-4 border-2 rounded-xl transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-xs'
                        : isOutOfStock && !settings?.allowNegativeStock
                        ? 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <span className={`text-base sm:text-lg font-bold block ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-100'}`}>
                        {variant.size}
                      </span>
                      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {currencySymbol} {variant.sellingPrice.toLocaleString()}
                      </span>
                      {isShot && (
                        <span className="mt-1 inline-block text-[9px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                          Shot {variant.shotVolumeMl ? `${variant.shotVolumeMl}ml` : ''} • from 750ml bottle
                        </span>
                      )}
                      {variant.barcode && (
                        <span className="text-[10px] font-mono text-slate-400 block mt-1" title="Barcode for this size">
                          🏷️ Barcode: {variant.barcode}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5">
                      {isOutOfStock ? (
                        <span className="text-[10px] text-red-500 font-bold uppercase">
                          Out of Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="text-[10px] text-orange-500 font-bold uppercase underline">
                          Low Stock: {remaining}
                        </span>
                      ) : (
                        <span className="text-[10px] text-green-600 dark:text-emerald-400 font-bold uppercase">
                          {isShot ? `Shots Left: ${remaining}` : `Stock: ${remaining}`}
                        </span>
                      )}
                      {servesShots && (isShot || bottleVariant?.id === variant.id) && (
                        <span className="text-[9px] text-cyan-600 dark:text-cyan-400 block font-bold" title="Total liquid left in the 750ml bottle pool">
                          {isShot ? `Pool: ${fmtMl(poolRemainingMl)}ml left` : `${fmtMl(poolRemainingMl)}ml (${fmtL(poolRemainingMl)}) left`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Selected Variant Options */}
          {selectedVariant && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Selected Variant
                  </span>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {selectedVariant.size} • {currencySymbol} {selectedVariant.sellingPrice.toLocaleString()}
                  </div>
                </div>

                {/* Quantity Control */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">
                    Quantity:
                  </span>
                  <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-3 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 font-extrabold text-sm min-w-8 text-center text-slate-900 dark:text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-3 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional note / special instructions (e.g. Lime & Soda, Extra Ice)..."
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={closeVariantModal}
            className="px-6 py-2 rounded-lg font-bold text-xs uppercase text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            CANCEL
          </button>
          <button
            id="confirm-add-variant-btn"
            type="button"
            disabled={!selectedVariant}
            onClick={handleConfirm}
            className={`px-8 py-2 rounded-lg font-bold text-xs uppercase text-white shadow-md transition-all ${
              selectedVariant
                ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer active:scale-98'
                : 'bg-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            ADD TO CART
          </button>
        </div>
      </div>
    </div>
  );
};

