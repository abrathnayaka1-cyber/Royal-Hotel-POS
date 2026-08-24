import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { SystemSettings } from '../../types.ts';
import {
  Package,
  PlusCircle,
  MinusCircle,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  RefreshCw,
  X,
  AlertCircle,
  DollarSign,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle
} from 'lucide-react';

interface VariantInventoryItem {
  id: string;
  variantId?: string;
  productId: string;
  productName: string;
  companyName?: string;
  size: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockLevel: number;
  isActive: boolean;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  isShot?: boolean;
  shotVolumeMl?: number;
  isShotSourceBottle?: boolean;
  openBottleUsedMl?: number;
}

export const InventoryManagement: React.FC<{ settings: SystemSettings | null }> = ({ settings }) => {
  const [items, setItems] = useState<VariantInventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('all');

  // Stock Modal State
  const [modalType, setModalType] = useState<'IN' | 'OUT' | 'ADJUST' | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<VariantInventoryItem | null>(null);
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formReason, setFormReason] = useState<string>('');
  const [formRef, setFormRef] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadInventory = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<VariantInventoryItem[]>('/inventory');
      setItems(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const openActionModal = (type: 'IN' | 'OUT' | 'ADJUST', variant: VariantInventoryItem) => {
    setModalType(type);
    setSelectedVariant(variant);
    setFormQuantity(type === 'ADJUST' ? variant.stock : 1);
    setFormReason(
      type === 'IN'
        ? 'Supplier Delivery / Purchase'
        : type === 'OUT'
        ? 'Bar Breakage / Spoilage'
        : 'Physical Stock Count Audit'
    );
    setFormRef('');
    setErrorMsg(null);
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || !modalType) return;

    try {
      setErrorMsg(null);
      await fetchApi('/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          variantId: selectedVariant.id || selectedVariant.variantId,
          type: modalType,
          quantity: Number(formQuantity),
          reason: formReason,
          reference: formRef,
        }),
      });

      setModalType(null);
      await loadInventory();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update stock.');
    }
  };

  // Calculations (shot sizes share the 750ml bottle liquid — exclude them so nothing is double-counted)
  const countable = items.filter(i => !i.isShot);
  const totalStockUnits = countable.reduce((sum, i) => sum + (i.stock || 0), 0);
  const totalCostValuation = countable.reduce((sum, i) => sum + (i.stock || 0) * (i.costPrice || 0), 0);
  const totalRetailValuation = countable.reduce((sum, i) => sum + (i.stock || 0) * (i.sellingPrice || 0), 0);
  const lowStockCount = countable.filter(i => i.status === 'LOW_STOCK' || (i.stock <= i.minStockLevel && i.stock > 0)).length;
  const outOfStockCount = countable.filter(i => i.status === 'OUT_OF_STOCK' || i.stock <= 0).length;

  const filteredItems = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (item.productName || '').toLowerCase().includes(q);
      const matchSize = (item.size || '').toLowerCase().includes(q);
      const matchSku = item.sku?.toLowerCase().includes(q);
      if (!matchName && !matchSize && !matchSku) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Inventory & Stock Control
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time bottle/portion stock levels, cost & retail valuation, and physical adjustments
          </p>
        </div>

        <button
          onClick={loadInventory}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Stock
        </button>
      </div>

      {/* Stock Valuation KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Units In Stock</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {totalStockUnits.toLocaleString()} Units
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{items.length} Tracked Product Sizes</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cost Value (Purchase)</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {currencySymbol} {Math.round(totalCostValuation).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Total stock purchase investment</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Retail Sales Potential</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {currencySymbol} {Math.round(totalRetailValuation).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Estimated gross revenue value</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Stock Alerts</span>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {lowStockCount + outOfStockCount} Items
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {outOfStockCount} Out of Stock • {lowStockCount} Low Stock
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search variant, brand, size, SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            All Sizes ({items.length})
          </button>
          <button
            onClick={() => setStatusFilter('LOW_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'LOW_STOCK'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            Low Stock ({lowStockCount})
          </button>
          <button
            onClick={() => setStatusFilter('OUT_OF_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
            }`}
          >
            Out of Stock ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Product & Size</th>
                <th className="py-3 px-4">SKU / Code</th>
                <th className="py-3 px-4">Cost Price</th>
                <th className="py-3 px-4">Selling Price</th>
                <th className="py-3 px-4 text-center">Available Stock</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Quick Stock Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((item, idx) => (
                <tr key={item.id || item.variantId || `${item.productId}-${item.size}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      {item.productName}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{item.size}</span>
                      {item.isShot && (
                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded font-bold text-[9px] uppercase" title="Shots are deducted from the 750ml Bottle total stock">
                          🥃 Shot • from 750ml
                        </span>
                      )}
                      {item.companyName && <span>• {item.companyName}</span>}
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    {item.sku || '—'}
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {currencySymbol} {item.costPrice.toLocaleString()}
                  </td>

                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {currencySymbol} {item.sellingPrice.toLocaleString()}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {item.stock}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      {item.isShot ? 'Shots left (auto)' : `Min: ${item.minStockLevel}`}
                    </span>
                    {item.isShotSourceBottle && (item.openBottleUsedMl || 0) > 0 && (
                      <span className="text-[9px] text-cyan-600 dark:text-cyan-400 block font-semibold" title="The currently open bottle serving shots">
                        Open: {item.openBottleUsedMl}ml used
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center">
                    {item.status === 'OUT_OF_STOCK' ? (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold text-[10px] rounded-md">
                        OUT OF STOCK
                      </span>
                    ) : item.status === 'LOW_STOCK' ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[10px] rounded-md">
                        LOW STOCK
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px] rounded-md">
                        IN STOCK
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    {item.isShot ? (
                      <span className="text-[10px] font-semibold text-slate-400 italic" title="Shots have no independent stock — adjust the 750ml Bottle row instead">
                        Auto from 750ml Bottle
                      </span>
                    ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openActionModal('IN', item)}
                        className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Stock In / Add Received Quantity"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Stock In
                      </button>

                      <button
                        onClick={() => openActionModal('OUT', item)}
                        className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                        title="Stock Out / Wastage / Breakage"
                      >
                        <MinusCircle className="w-3.5 h-3.5" />
                        Stock Out
                      </button>

                      <button
                        onClick={() => openActionModal('ADJUST', item)}
                        className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        title="Set exact physical stock count"
                      >
                        Adjust
                      </button>
                    </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {modalType && selectedVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {modalType === 'IN'
                    ? 'Stock In (Add Received Stock)'
                    : modalType === 'OUT'
                    ? 'Stock Out (Breakage / Wastage)'
                    : 'Physical Stock Count Adjustment'}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedVariant.productName} — <strong>{selectedVariant.size}</strong> (Current: {selectedVariant.stock})
                </p>
              </div>
              <button onClick={() => setModalType(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleStockSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  {modalType === 'ADJUST' ? 'New Exact Stock Level' : 'Quantity Units *'}
                </label>
                <input
                  type="number"
                  min={modalType === 'OUT' ? '1' : '0'}
                  required
                  value={formQuantity}
                  onChange={e => setFormQuantity(Number(e.target.value))}
                  className="w-full text-sm font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Reason / Note *</label>
                <input
                  type="text"
                  required
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Supplier PO / Invoice Ref (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. PO-8891 / Delivery Note"
                  value={formRef}
                  onChange={e => setFormRef(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer ${
                    modalType === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : modalType === 'OUT'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Confirm & Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
