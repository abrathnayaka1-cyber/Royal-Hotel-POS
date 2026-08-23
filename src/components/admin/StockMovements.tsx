import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { StockMovement } from '../../types.ts';
import { exportToExcel } from '../../lib/exportUtils.ts';
import {
  History,
  Search,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Calendar,
  PackagePlus,
  ShoppingCart,
  Trash2,
  CheckCircle2,
  Building2
} from 'lucide-react';

export const StockMovements: React.FC = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all'); // 'all' | 'today' | 'yesterday' | 'custom'
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const loadMovements = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<StockMovement[]>('/inventory/movements');
      setMovements(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load stock movements:', err);
      setMovements([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const filteredMovements = (Array.isArray(movements) ? movements : []).filter(m => {
    const type = String((m as any).type || m.movementType || '').toUpperCase();
    if (typeFilter !== 'all' && !type.includes(typeFilter.toUpperCase())) return false;
    
    // Date filtering
    const movDate = m.createdAt ? new Date(m.createdAt).toISOString().split('T')[0] : '';
    if (dateFilter === 'today' && movDate !== todayStr) return false;
    if (dateFilter === 'yesterday' && movDate !== yesterdayStr) return false;
    if (dateFilter === 'custom' && movDate !== customDate) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (m.productName || '').toLowerCase().includes(q);
      const matchCompany = ((m as any).companyName || '').toLowerCase().includes(q);
      const matchCategory = ((m as any).categoryName || '').toLowerCase().includes(q);
      const matchSize = String((m as any).size || m.variantSize || '').toLowerCase().includes(q);
      const matchUser = (m.userName || '').toLowerCase().includes(q);
      const matchRef = String((m as any).reference || m.referenceId || '').toLowerCase().includes(q);
      if (!matchName && !matchCompany && !matchCategory && !matchSize && !matchUser && !matchRef) return false;
    }
    return true;
  });

  // Calculate quick stats from movements
  const totalReceived = filteredMovements
    .filter(m => {
      const t = String((m as any).type || m.movementType || '').toUpperCase();
      const qty = (m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange;
      return t.includes('STOCK_IN') || t.includes('PURCHASE') || (t.includes('ADJUST') && qty > 0);
    })
    .reduce((acc, m) => acc + Math.abs((m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange), 0);

  const totalSold = filteredMovements
    .filter(m => {
      const t = String((m as any).type || m.movementType || '').toUpperCase();
      return t.includes('SALE');
    })
    .reduce((acc, m) => acc + Math.abs((m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange), 0);

  const totalWastage = filteredMovements
    .filter(m => {
      const t = String((m as any).type || m.movementType || '').toUpperCase();
      return t.includes('STOCK_OUT') || t.includes('DAMAGED') || t.includes('EXPIRED');
    })
    .reduce((acc, m) => acc + Math.abs((m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange), 0);

  const handleExport = () => {
    const data = filteredMovements.map(m => {
      const size = (m as any).size || m.variantSize || '';
      const type = (m as any).type || m.movementType || '';
      const qty = (m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange;
      const prevStock = (m as any).previousStock !== undefined ? (m as any).previousStock : m.quantityBefore;
      const newStock = (m as any).newStock !== undefined ? (m as any).newStock : m.quantityAfter;
      const ref = (m as any).reference || m.referenceId || '';

      return {
        'Date & Time': new Date(m.createdAt).toLocaleString(),
        'Product Name': m.productName,
        'Brand / Company': (m as any).companyName || 'In-House',
        'Category': (m as any).categoryName || 'General',
        'Size / Variant': size,
        'Movement Type': String(type).toUpperCase(),
        'Qty Change': qty,
        'Previous Stock': prevStock,
        'New Stock': newStock,
        'Reason / Note': m.reason || '',
        'Reference #': ref,
        'Performed By': m.userName,
      };
    });
    exportToExcel(data, `Stock_Movements_Audit_${dateFilter}_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Stock Movements & Audit History
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete tamper-proof audit trail of supplier deliveries, sales deductions, breakages, and manual adjustments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMovements}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export Excel Audit
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200/60 dark:border-blue-800/60">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Received / In</div>
            <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">+{totalReceived} units</div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Sold / POS Out</div>
            <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">-{totalSold} units</div>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200/60 dark:border-rose-800/60">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Wastage / Breakage</div>
            <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">-{totalWastage} units</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search product, brand, size, user, invoice..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Date Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateFilter === 'today'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateFilter === 'yesterday'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDateFilter('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateFilter === 'custom'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Date
            </button>
          </div>

          {dateFilter === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white cursor-pointer"
            />
          )}

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Movement Types</option>
            <option value="STOCK_IN">STOCK_IN (Purchase / Delivery)</option>
            <option value="SALE">SALE (POS Deduction)</option>
            <option value="STOCK_OUT">STOCK_OUT (Breakage/Wastage)</option>
            <option value="ADJUSTMENT">ADJUSTMENT (Audit Verification)</option>
            <option value="VOID_RESTORE">VOID_RESTORE (Bill Cancellation)</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Brand & Item</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-center">Change Qty</th>
                <th className="py-3 px-4 text-center">Stock Before → After</th>
                <th className="py-3 px-4">Reason / Reference</th>
                <th className="py-3 px-4">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No stock movement records found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m, idx) => {
                  const size = (m as any).size || m.variantSize || '';
                  const rawType = String((m as any).type || m.movementType || 'ADJUSTMENT').toUpperCase();
                  const qty = (m as any).quantity !== undefined ? (m as any).quantity : m.quantityChange;
                  const prevStock = (m as any).previousStock !== undefined ? (m as any).previousStock : m.quantityBefore;
                  const newStock = (m as any).newStock !== undefined ? (m as any).newStock : m.quantityAfter;
                  const ref = (m as any).reference || m.referenceId || '';
                  const company = (m as any).companyName;
                  const category = (m as any).categoryName;

                  return (
                    <tr key={m.id || `mov-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Brand & Item Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-xs text-slate-900 dark:text-white">
                          {m.productName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          {company && (
                            <span className="px-1.5 py-0.2 font-semibold bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded border border-slate-200 dark:border-slate-700">
                              {company}
                            </span>
                          )}
                          <span>{category ? `${category} • ` : ''}{size}</span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            rawType.includes('SALE')
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                              : rawType.includes('STOCK_IN') || rawType.includes('PURCHASE')
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                              : rawType.includes('STOCK_OUT') || rawType.includes('DAMAGED') || rawType.includes('EXPIRED')
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                              : rawType.includes('VOID')
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                          }`}
                        >
                          {rawType}
                        </span>
                      </td>

                      {/* Change Quantity */}
                      <td className="py-3 px-4 text-center font-black font-mono text-xs">
                        <span
                          className={
                            qty > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {qty > 0 ? `+${qty}` : qty}
                        </span>
                      </td>

                      {/* Before -> After */}
                      <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400">
                        <span className="font-mono text-xs">
                          {prevStock} → <strong className="text-slate-900 dark:text-white">{newStock}</strong>
                        </span>
                      </td>

                      {/* Reason & Reference */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-800 dark:text-slate-200 truncate">{m.reason || 'Standard operation'}</div>
                        {ref && (
                          <div className="text-[10px] font-mono font-semibold text-blue-500 dark:text-blue-400 mt-0.5">
                            Ref: {ref}
                          </div>
                        )}
                      </td>

                      {/* User */}
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                          {m.userName || 'Super Admin'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StockMovements;
