import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Calendar, 
  Search, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Package, 
  Layers, 
  DollarSign, 
  Edit3, 
  Save, 
  X,
  Wine,
  Beer,
  UtensilsCrossed,
  Sparkles,
  ArrowUpDown,
  Check,
  PlusCircle,
  Clock,
  Building2
} from 'lucide-react';
import { DailyStockSheetItem, DailyStockSheetReport, Category } from '../../types.ts';

interface DailyStockSheetProps {
  categories?: Category[];
}

export const DailyStockSheet: React.FC<DailyStockSheetProps> = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all'); // 'all' | 'bar' | 'restaurant'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [report, setReport] = useState<DailyStockSheetReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reconciliation / Edit Mode state
  const [isAuditMode, setIsAuditMode] = useState<boolean>(false);
  const [editedBalances, setEditedBalances] = useState<Record<string, number>>({});
  const [isSavingAudit, setIsSavingAudit] = useState<boolean>(false);
  const [auditSuccessMsg, setAuditSuccessMsg] = useState<string | null>(null);

  // Quick single item adjust modal
  const [adjustingItem, setAdjustingItem] = useState<DailyStockSheetItem | null>(null);
  const [singleNewBalance, setSingleNewBalance] = useState<number>(0);
  const [singleAdjustReason, setSingleAdjustReason] = useState<string>('Physical stock count verification');

  // Receive Stock / Delivery Modal
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState<boolean>(false);
  const [receivingItem, setReceivingItem] = useState<DailyStockSheetItem | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [receiveQuantity, setReceiveQuantity] = useState<number>(12);
  const [receiveCost, setReceiveCost] = useState<number>(0);
  const [receiveRef, setReceiveRef] = useState<string>('');
  const [receiveReason, setReceiveReason] = useState<string>('Supplier Delivery / Stock In');
  const [receiveDate, setReceiveDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isSubmittingReceive, setIsSubmittingReceive] = useState<boolean>(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  const fetchDailySheet = async (date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date: date,
        categoryId: selectedCategory,
        type: selectedType,
        search: searchQuery
      });

      const data = await fetchApi<DailyStockSheetReport>(`/reports/daily-stock-sheet?${params.toString()}`);
      setReport(data);

      // Prepopulate audit balances with current balances
      const initialBalances: Record<string, number> = {};
      if (data && Array.isArray(data.items)) {
        data.items.forEach(item => {
          initialBalances[item.variantId] = item.balance;
        });
      }
      setEditedBalances(initialBalances);
    } catch (err: any) {
      console.error('Error loading daily stock sheet:', err);
      setError(err.message || 'Failed to load daily stock sheet data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDailySheet(selectedDate);
  }, [selectedDate, selectedCategory, selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDailySheet(selectedDate);
  };

  // Reconcile and save physical stock counts
  const handleSaveAudit = async () => {
    if (!report) return;
    setIsSavingAudit(true);
    setError(null);
    setAuditSuccessMsg(null);

    try {
      const adjustments: { variantId: string; newBalance: number }[] = [];

      report.items.forEach(item => {
        const edited = editedBalances[item.variantId];
        if (edited !== undefined && edited !== item.balance) {
          adjustments.push({
            variantId: item.variantId,
            newBalance: Number(edited)
          });
        }
      });

      if (adjustments.length === 0) {
        setAuditSuccessMsg('No physical stock count changes detected.');
        setIsAuditMode(false);
        setIsSavingAudit(false);
        return;
      }

      const result = await fetchApi<{ success: boolean; updatedCount: number }>('/reports/daily-stock-sheet/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          adjustments,
          reason: `Physical audit sheet reconciliation for ${selectedDate}`
        })
      });

      setAuditSuccessMsg(`Successfully verified and updated ${result.updatedCount || adjustments.length} stock items!`);
      setIsAuditMode(false);
      // Refresh sheet
      fetchDailySheet(selectedDate);
    } catch (err: any) {
      console.error('Audit save error:', err);
      setError(err.message || 'Failed to save physical reconciliation');
    } finally {
      setIsSavingAudit(false);
    }
  };

  // Quick single item modal adjustment
  const handleSingleItemAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;
    setIsSavingAudit(true);
    try {
      await fetchApi('/reports/daily-stock-sheet/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          adjustments: [{
            variantId: adjustingItem.variantId,
            newBalance: Number(singleNewBalance)
          }],
          reason: singleAdjustReason || `Physical stock count adjustment for ${adjustingItem.displayName}`
        })
      });

      setAdjustingItem(null);
      setAuditSuccessMsg(`Updated physical stock for ${adjustingItem.displayName}`);
      fetchDailySheet(selectedDate);
    } catch (err: any) {
      alert(err.message || 'Error updating stock');
    } finally {
      setIsSavingAudit(false);
    }
  };

  // Receive stock delivery handler (GRN / Stock In)
  const handleReceiveStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vId = receivingItem ? receivingItem.variantId : selectedVariantId;
    if (!vId) {
      alert('Please select a product variant to receive.');
      return;
    }
    if (receiveQuantity <= 0) {
      alert('Quantity must be greater than 0.');
      return;
    }

    try {
      setIsSubmittingReceive(true);
      await fetchApi('/inventory/stock-in', {
        method: 'POST',
        body: JSON.stringify({
          variantId: vId,
          quantity: Number(receiveQuantity),
          costPrice: receiveCost > 0 ? Number(receiveCost) : undefined,
          reference: receiveRef || 'Daily Delivery',
          reason: receiveReason || 'Supplier Delivery / Purchase',
          date: receiveDate || selectedDate,
        }),
      });

      setAuditSuccessMsg(`Successfully recorded received stock (+${receiveQuantity} units) for ${receiveDate}!`);
      setIsReceiveModalOpen(false);
      setReceivingItem(null);
      setSelectedVariantId('');
      fetchDailySheet(selectedDate);
    } catch (err: any) {
      alert(err.message || 'Failed to record received stock.');
    } finally {
      setIsSubmittingReceive(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!report || report.items.length === 0) return;

    const headers = ['No', 'Item Name', 'Size', 'In-Hand (Opening)', 'Received Today', 'Total Stock', 'Balance (Closing)', 'Sold Today', 'Price (Rs.)', 'Sales Value (Rs.)'];
    const rows = report.items.map(item => [
      item.no,
      `"${item.displayName.replace(/"/g, '""')}"`,
      `"${item.size.replace(/"/g, '""')}"`,
      item.inHand,
      item.received,
      item.stock,
      item.balance,
      item.sold,
      item.price.toFixed(2),
      item.value.toFixed(2)
    ]);

    // Add total row
    rows.push([
      'TOTAL',
      'SUMMARY TOTALS',
      '',
      report.totalInHand,
      report.totalReceived,
      report.totalStock,
      report.totalBalance,
      report.totalSold,
      '',
      report.totalValue.toFixed(2)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      `DAILY STOCK & SALES RECONCILIATION - ${report.formattedDate}\n` +
      headers.join(',') + '\n' + 
      rows.map(e => e.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daily_Stock_Sheet_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Browser Print trigger
  const handlePrint = () => {
    window.print();
  };

  // Formatted date string for display (e.g. 2026.08.23)
  const displayFormattedDate = selectedDate.replace(/-/g, '.');

  // Filtered items in memory if query changed
  const displayItems = useMemo(() => {
    if (!report || !report.items) return [];
    if (!searchQuery) return report.items;
    const q = searchQuery.toLowerCase();
    return report.items.filter(it => 
      it.displayName.toLowerCase().includes(q) ||
      it.productName.toLowerCase().includes(q) ||
      it.categoryName.toLowerCase().includes(q)
    );
  }, [report, searchQuery]);

  // Department counts
  const totalItemCount = report?.items?.length || 0;
  const barItemCount = report?.items?.filter(i => !i.isKitchenItem).length || 0;
  const restaurantItemCount = report?.items?.filter(i => i.isKitchenItem).length || 0;

  return (
    <div id="admin-daily-stock-sheet-view" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Daily Stock Sheet
            </h1>
            <span className="px-3 py-1 text-xs font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded-xl">
              {displayFormattedDate}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Commercial bar liquor register, opening stock, received, closing balance and sales reconciliation
          </p>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Today / Yesterday */}
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                selectedDate === new Date().toISOString().split('T')[0]
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              Yesterday
            </button>
          </div>

          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold shadow-xs cursor-pointer"
            />
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          </div>

          {/* Receive Stock (GRN / Delivery) Button */}
          <button
            onClick={() => {
              setReceivingItem(null);
              setSelectedVariantId(report?.items[0]?.variantId || '');
              setReceiveQuantity(12);
              setReceiveCost(report?.items[0]?.costPrice || 0);
              setReceiveRef('');
              setReceiveReason('Supplier Delivery / Stock In');
              setReceiveDate(selectedDate);
              setIsReceiveModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-950/40 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Receive Stock (GRN)</span>
          </button>

          {/* Physical Audit Toggle Button */}
          <button
            onClick={() => setIsAuditMode(!isAuditMode)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all shadow-xs cursor-pointer ${
              isAuditMode 
                ? 'bg-amber-600 text-white border-amber-500 ring-2 ring-amber-500/40' 
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isAuditMode ? 'Audit Mode Active' : 'Physical Audit'}
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchDailySheet(selectedDate)}
            disabled={isLoading}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors shadow-xs cursor-pointer"
            title="Refresh Stock Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Export to Excel (CSV) */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Excel (CSV)</span>
          </button>

          {/* Print Sheet */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {auditSuccessMsg && (
        <div className="flex items-center justify-between p-4 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs font-semibold animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{auditSuccessMsg}</span>
          </div>
          <button onClick={() => setAuditSuccessMsg(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audit Notification Banner */}
      {isAuditMode && (
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-amber-950/50 border border-amber-700/60 rounded-2xl text-amber-200 gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-900/60 rounded-xl text-amber-300 border border-amber-700/50">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-amber-200 uppercase tracking-wide">Physical Stock Audit Mode Active</h4>
              <p className="text-xs text-amber-300/80">
                Directly edit the <strong className="text-amber-200">Balance</strong> column below to match your physical count. Units sold and sales value will recalculate in real-time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsAuditMode(false)}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-300 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAudit}
              disabled={isSavingAudit}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {isSavingAudit ? 'Saving...' : 'Apply Physical Count'}
            </button>
          </div>
        </div>
      )}

      {/* Valuation & Register KPI Cards (Exact Theme Matching Screenshot 1) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: In-Hand */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">In-Hand (Open)</span>
          <div className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-1 font-mono">
            {report?.totalInHand?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Opening stock</div>
        </div>

        {/* Card 2: Received */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">Received Today</span>
          <div className="text-2xl lg:text-3xl font-black text-blue-500 dark:text-blue-400 mt-1 font-mono">
            +{report?.totalReceived?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-blue-500/80 mt-0.5">Stock In today</div>
        </div>

        {/* Card 3: Total Stock */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Total Stock</span>
          <div className="text-2xl lg:text-3xl font-black text-indigo-500 dark:text-indigo-400 mt-1 font-mono">
            {report?.totalStock?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-indigo-500/80 mt-0.5">In-Hand + Received</div>
        </div>

        {/* Card 4: Closing Balance */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Closing Balance</span>
          <div className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-1 font-mono">
            {report?.totalBalance?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Closing stock in-hand</div>
        </div>

        {/* Card 5: Sold */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Units Sold</span>
          <div className="text-2xl lg:text-3xl font-black text-emerald-500 dark:text-emerald-400 mt-1 font-mono">
            {report?.totalSold?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-emerald-500/80 mt-0.5">Sales quantity today</div>
        </div>

        {/* Card 6: Sales Revenue */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Sales Revenue</span>
          <div className="text-2xl lg:text-3xl font-black text-emerald-500 dark:text-emerald-400 mt-1 font-mono">
            Rs. {report?.totalValue ? report.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '0'}
          </div>
          <div className="text-xs text-emerald-500/80 mt-0.5 font-medium">Sold × Selling Price</div>
        </div>
      </div>

      {/* Filters and Search Toolbar (Matching Screenshot 1) */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search variant, brand, size, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Department Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedType === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-400 hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            All Items ({totalItemCount})
          </button>
          <button
            onClick={() => setSelectedType('bar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedType === 'bar'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-400 hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Wine className="w-3.5 h-3.5" />
            Bar Spirits & Beer ({barItemCount})
          </button>
          <button
            onClick={() => setSelectedType('restaurant')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedType === 'restaurant'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-400 hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            Kitchen & Restaurant ({restaurantItemCount})
          </button>
        </div>
      </div>

      {/* Main Stock Sheet Table (Screen & Printable) */}
      <div 
        ref={printAreaRef} 
        id="printable-daily-stock-sheet"
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
      >
        {/* Printable Header Section (Only visible during print / formatted cleanly) */}
        <div className="print-header hidden p-6 border-b border-slate-300 bg-slate-50">
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                ROYAL GREEN GARDEN BAR & RESTAURANT
              </h2>
              <p className="text-xs text-slate-600">No. 42 Beach Road, Puttalam | Hotline: +94 32 226 5500</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase font-bold text-slate-500">REGISTER SHEET REF</div>
              <div className="text-lg font-mono font-black text-slate-900">
                {displayFormattedDate}
              </div>
            </div>
          </div>
          <div className="text-center font-bold text-base uppercase tracking-wider text-slate-800">
            DAILY STOCK & LIQUOR SALES RECONCILIATION SHEET
          </div>
        </div>

        {/* The Core Register Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">No</th>
                <th className="py-3 px-4 min-w-[220px]">Product & Size</th>
                <th className="py-3 px-3 text-right w-24">In-Hand</th>
                <th className="py-3 px-3 text-right w-24 text-blue-500 dark:text-blue-400">Received</th>
                <th className="py-3 px-3 text-right w-24 text-indigo-500 dark:text-indigo-400">Stock</th>
                <th className="py-3 px-3 text-right w-28">
                  Balance {isAuditMode && '✏️'}
                </th>
                <th className="py-3 px-3 text-right w-24 text-emerald-500 dark:text-emerald-400">Sold</th>
                <th className="py-3 px-3 text-right w-28">Selling Price</th>
                <th className="py-3 px-4 text-right min-w-[130px] text-emerald-500 dark:text-emerald-400">Sales Value</th>
                {!isAuditMode && (
                  <th className="py-3 px-3 text-center text-slate-400 w-14 print:hidden">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    Loading daily stock registry data...
                  </td>
                </tr>
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    No items found matching the selected filter.
                  </td>
                </tr>
              ) : (
                displayItems.map((item) => {
                  const currentBalance = isAuditMode && editedBalances[item.variantId] !== undefined
                    ? editedBalances[item.variantId]
                    : item.balance;
                  
                  const calculatedSold = isAuditMode 
                    ? Math.max(0, item.stock - currentBalance)
                    : item.sold;

                  const calculatedValue = calculatedSold * item.price;
                  const isModifiedInAudit = isAuditMode && currentBalance !== item.balance;

                  return (
                    <tr 
                      key={item.variantId} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* No */}
                      <td className="py-3 px-3 text-center font-mono text-slate-400">
                        {item.no}
                      </td>

                      {/* Product & Size */}
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex flex-col">
                          <span>{item.displayName}</span>
                          <span className="text-[10px] text-slate-500 font-normal font-mono flex items-center gap-1.5 mt-0.5">
                            {item.companyName && (
                              <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700">
                                {item.companyName}
                              </span>
                            )}
                            <span>{item.categoryName} • {item.size}</span>
                          </span>
                        </div>
                      </td>

                      {/* In-Hand (Opening) */}
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                        {item.inHand}
                      </td>

                      {/* Received Today */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-blue-500 dark:text-blue-400">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.received > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 text-xs">
                              +{item.received}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                          {!isAuditMode && (
                            <button
                              type="button"
                              onClick={() => {
                                setReceivingItem(item);
                                setSelectedVariantId(item.variantId);
                                setReceiveQuantity(12);
                                setReceiveCost(item.costPrice || 0);
                                setReceiveRef('');
                                setReceiveReason(`Stock replenishment from ${item.companyName || 'Supplier'}`);
                                setReceiveDate(selectedDate);
                                setIsReceiveModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-950/40 rounded transition-colors cursor-pointer print:hidden"
                              title={`Receive Stock for ${item.displayName}`}
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Total Stock Available */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-500 dark:text-indigo-400">
                        {item.stock}
                      </td>

                      {/* Balance (Closing Stock in Hand) */}
                      <td className={`py-3 px-3 text-right font-mono font-black ${
                        isModifiedInAudit 
                          ? 'text-amber-400' 
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        {isAuditMode ? (
                          <input
                            type="number"
                            min="0"
                            value={currentBalance}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setEditedBalances(prev => ({
                                ...prev,
                                [item.variantId]: val
                              }));
                            }}
                            className="w-16 px-1.5 py-0.5 text-right font-mono font-bold text-xs bg-slate-950 text-amber-300 border-2 border-amber-500 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner"
                          />
                        ) : (
                          <span>{item.balance}</span>
                        )}
                      </td>

                      {/* Sold */}
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-500 dark:text-emerald-400">
                        {calculatedSold > 0 ? calculatedSold : '-'}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-600 dark:text-slate-300">
                        Rs. {item.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>

                      {/* Sales Value (Rs.) */}
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-500 dark:text-emerald-400">
                        {calculatedValue > 0 ? (
                          <span>Rs. {calculatedValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-slate-500 font-normal">Rs. 0</span>
                        )}
                      </td>

                      {/* Action */}
                      {!isAuditMode && (
                        <td className="py-3 px-3 text-center print:hidden">
                          <button
                            onClick={() => {
                              setAdjustingItem(item);
                              setSingleNewBalance(item.balance);
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Audit / Adjust Physical Stock"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Summary Footer Row */}
            {report && report.items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-950/90 border-t-2 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs">
                  <td colSpan={2} className="py-3.5 px-4 uppercase tracking-wider text-right font-sans font-black text-blue-400">
                    TOTAL SUMMARY
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-700 dark:text-slate-300">
                    {report.totalInHand}
                  </td>
                  <td className="py-3.5 px-3 text-right text-blue-500 dark:text-blue-400">
                    +{report.totalReceived}
                  </td>
                  <td className="py-3.5 px-3 text-right text-indigo-500 dark:text-indigo-400">
                    {report.totalStock}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-900 dark:text-white">
                    {report.totalBalance}
                  </td>
                  <td className="py-3.5 px-3 text-right text-emerald-500 dark:text-emerald-400 text-sm font-black">
                    {report.totalSold}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-400 font-sans text-[10px]">
                    LKR
                  </td>
                  <td className="py-3.5 px-4 text-right text-emerald-500 dark:text-emerald-400 text-sm font-black tracking-tight">
                    Rs. {report.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </td>
                  {!isAuditMode && <td className="print:hidden"></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Formal Printable Verification Signatures Section */}
        <div className="print-signatures hidden pt-12 pb-6 px-8 bg-white border-t border-slate-300">
          <div className="grid grid-cols-3 gap-8 text-center text-xs text-slate-700">
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2 font-mono">
                ....................................................
              </div>
              <div className="font-bold uppercase text-slate-900">Barman / Stock Keeper</div>
              <div className="text-[10px] text-slate-500">Physical Stock Count Prepared</div>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2 font-mono">
                ....................................................
              </div>
              <div className="font-bold uppercase text-slate-900">Head Cashier</div>
              <div className="text-[10px] text-slate-500">Sales & Bills Reconciled</div>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1 mb-2 font-mono">
                ....................................................
              </div>
              <div className="font-bold uppercase text-slate-900">Manager / Super Admin</div>
              <div className="text-[10px] text-slate-500">Verified & Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for Receiving Stock / GRN Delivery */}
      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-950/60 text-blue-400 border border-blue-800/60 rounded-xl">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Receive Stock / GRN Delivery</h3>
                  <p className="text-xs text-slate-400">Record fresh delivery & update Received Today</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsReceiveModalOpen(false);
                  setReceivingItem(null);
                }} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveStockSubmit} className="space-y-4">
              {/* Product Selector if not single item */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Product / Brand & Size
                </label>
                {receivingItem ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{receivingItem.displayName}</div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-1.5 mt-0.5">
                        {receivingItem.companyName && (
                          <span className="text-blue-400 font-semibold">{receivingItem.companyName}</span>
                        )}
                        <span>• {receivingItem.categoryName} • {receivingItem.size}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Current Stock</span>
                      <span className="font-mono font-bold text-slate-200">{receivingItem.balance} units</span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={selectedVariantId}
                    onChange={(e) => {
                      setSelectedVariantId(e.target.value);
                      const found = report?.items.find(i => i.variantId === e.target.value);
                      if (found && found.costPrice) {
                        setReceiveCost(found.costPrice);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    required
                  >
                    <option value="">Select a product to receive...</option>
                    {report?.items.map(it => (
                      <option key={it.variantId} value={it.variantId}>
                        {it.displayName} ({it.companyName ? `${it.companyName} - ` : ''}{it.size}) - Current: {it.balance}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Delivery Date & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Delivery Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={receiveDate}
                      onChange={(e) => setReceiveDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 font-mono font-bold cursor-pointer"
                    />
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Quantity Received (Units/Bottles)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receiveQuantity}
                    onChange={(e) => setReceiveQuantity(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 12 or 24"
                    className="w-full px-3 py-2 text-sm font-bold font-mono bg-slate-950 border border-slate-700 text-emerald-400 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Invoice Ref & Cost Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Supplier Invoice / GRN Ref #
                  </label>
                  <input
                    type="text"
                    value={receiveRef}
                    onChange={(e) => setReceiveRef(e.target.value)}
                    placeholder="e.g. INV-8842 / GRN-2026-08"
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unit Cost Price (Rs. Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveCost || ''}
                    onChange={(e) => setReceiveCost(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 3500.00"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                  />
                </div>
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Delivery Reason / Supplier Note
                </label>
                <input
                  type="text"
                  value={receiveReason}
                  onChange={(e) => setReceiveReason(e.target.value)}
                  placeholder="e.g. Rockland weekly replenishment / Lion Brewery direct delivery"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsReceiveModalOpen(false);
                    setReceivingItem(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReceive}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors shadow-md cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  {isSubmittingReceive ? 'Recording Delivery...' : 'Save & Update Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Adjusting Single Item */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-950/60 text-amber-400 border border-amber-800/60 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Adjust Physical Stock Count</h3>
                  <p className="text-xs text-slate-400">{adjustingItem.displayName}</p>
                </div>
              </div>
              <button 
                onClick={() => setAdjustingItem(null)} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSingleItemAdjust} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500">Current Stock:</span>
                  <div className="font-bold font-mono text-white text-sm">{adjustingItem.balance} units</div>
                </div>
                <div>
                  <span className="text-slate-500">Selling Price:</span>
                  <div className="font-bold font-mono text-emerald-400 text-sm">Rs. {adjustingItem.price.toFixed(2)}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Actual Physical In-Hand Count (New Balance)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={singleNewBalance}
                  onChange={(e) => setSingleNewBalance(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-bold font-mono bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Difference: <span className={`font-bold font-mono ${singleNewBalance - adjustingItem.balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {singleNewBalance - adjustingItem.balance >= 0 ? `+${singleNewBalance - adjustingItem.balance}` : singleNewBalance - adjustingItem.balance} units
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audit Reason / Note
                </label>
                <input
                  type="text"
                  value={singleAdjustReason}
                  onChange={(e) => setSingleAdjustReason(e.target.value)}
                  placeholder="e.g. Daily shift stock count physical verification"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAudit}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors shadow-md cursor-pointer"
                >
                  {isSavingAudit ? 'Saving...' : 'Update & Reconcile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print CSS Injection */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-daily-stock-sheet, #printable-daily-stock-sheet * {
            visibility: visible;
          }
          #printable-daily-stock-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          .print-header {
            display: block !important;
          }
          .print-signatures {
            display: block !important;
          }
          table {
            border: 1px solid #000 !important;
            width: 100% !important;
            font-size: 9pt !important;
            color: #000 !important;
          }
          th, td {
            border: 1px solid #ccc !important;
            padding: 4px 6px !important;
            color: #000 !important;
          }
          thead tr {
            background-color: #1e293b !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          tfoot tr {
            background-color: #0f172a !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default DailyStockSheet;
