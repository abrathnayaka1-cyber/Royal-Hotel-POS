import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { SystemSettings, Bill } from '../../types.ts';
import { generateSalesReportPDF, exportToExcel } from '../../lib/exportUtils.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  BarChart3,
  Calendar,
  Download,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Users,
  Layers,
  CreditCard,
  Banknote,
  Building2,
  RefreshCw
} from 'lucide-react';

interface ReportResponse {
  summary: {
    totalSales: number;
    totalBills: number;
    totalDiscount: number;
    totalTax: number;
    totalServiceCharge: number;
    averageBill: number;
  };
  paymentBreakdown: Record<string, { count: number; total: number }>;
  topSellingProducts: Array<{
    productId: string;
    name: string;
    size: string;
    quantity: number;
    revenue: number;
  }>;
  cashierBreakdown: Array<{
    cashierId: string;
    cashierName: string;
    billsCount: number;
    totalSales: number;
  }>;
  bills: Bill[];
}

export const ReportsView: React.FC<{ settings: SystemSettings | null }> = ({ settings }) => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadReport = async () => {
    try {
      setIsLoading(true);
      let query = `?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        query += `&startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetchApi<ReportResponse>(`/reports/summary${query}`);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [period]);

  const handleCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadReport();
  };

  const handleDownloadPDF = () => {
    if (!reportData) return;
    const dateRangeLabel =
      period === 'today'
        ? 'Today'
        : period === 'week'
        ? 'Last 7 Days'
        : period === 'month'
        ? 'This Month'
        : period === 'year'
        ? 'This Year'
        : `${startDate} to ${endDate}`;

    generateSalesReportPDF(
      `${period.toUpperCase()} SALES REPORT`,
      dateRangeLabel,
      reportData.summary,
      reportData.bills || [],
      settings,
      user?.name || 'Super Admin'
    );
  };

  const handleDownloadExcel = () => {
    if (!reportData) return;
    // Export Product breakdown
    const data = (reportData.topSellingProducts || []).map((p, idx) => ({
      'Rank': idx + 1,
      'Product Name': p.name,
      'Size / Variant': p.size,
      'Units / Portions Sold': p.quantity,
      'Total Revenue': p.revenue,
    }));
    exportToExcel(data, `Sales_Report_${period.toUpperCase()}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Financial & Sales Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daily, weekly, monthly, and annual sales analytics with cashier performance and product velocity
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPDF}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Report
          </button>
          <button
            onClick={handleDownloadExcel}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Export
          </button>
        </div>
      </div>

      {/* Period Selector Tabs */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold w-full md:w-auto overflow-x-auto">
          {(['today', 'week', 'month', 'year', 'custom'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg capitalize whitespace-nowrap transition-all cursor-pointer ${
                period === p
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'Annual / Year' : 'Custom Dates'}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <form onSubmit={handleCustomFilter} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="date"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              required
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Filter
            </button>
          </form>
        )}
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Sales</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {currencySymbol} {(reportData?.summary?.totalSales || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">{reportData?.summary?.totalBills || 0} Invoices Finalized</div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Discounts Given</span>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {currencySymbol} {(reportData?.summary?.totalDiscount || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Deducted at cash counter
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Service Charges & VAT</span>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {currencySymbol} {((reportData?.summary?.totalServiceCharge || 0) + (reportData?.summary?.totalTax || 0)).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Service: {currencySymbol}{(reportData?.summary?.totalServiceCharge || 0).toLocaleString()} • Tax: {currencySymbol}{(reportData?.summary?.totalTax || 0).toLocaleString()}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Check Value</span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {currencySymbol} {Math.round(reportData?.summary?.averageBill || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Average per customer receipt</div>
        </div>
      </div>

      {/* Cashier Performance & Payment Method Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cashier Performance Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Cashier Sales Breakdown
          </h2>
          <p className="text-xs text-slate-500 mb-4">Total revenue collected per cashier terminal</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase">
                  <th className="py-2.5 px-3">Cashier</th>
                  <th className="py-2.5 px-3 text-center">Bills Count</th>
                  <th className="py-2.5 px-3 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData?.cashierBreakdown && reportData.cashierBreakdown.length > 0 ? (
                  reportData.cashierBreakdown.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{c.cashierName}</td>
                      <td className="py-3 px-3 text-center font-semibold">{c.billsCount}</td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                        {currencySymbol} {c.totalSales.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      No cashier data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Payment Tender Breakdown
          </h2>
          <p className="text-xs text-slate-500 mb-4">Cash vs. Card vs. Bank Transfer splits</p>

          <div className="space-y-3">
            {reportData?.paymentBreakdown &&
              Object.entries(reportData.paymentBreakdown).map(([method, item]) => {
                const data = item as { count: number; total: number };
                return (
                  <div key={method} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300">
                        {method.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-2">({data.count} bills)</span>
                    </div>
                    <span className="font-black text-sm text-slate-900 dark:text-white">
                      {currencySymbol} {data.total.toLocaleString()}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Top Selling Products & Velocity */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" />
          Product Sales Velocity (Bottles & Portions Sold)
        </h2>
        <p className="text-xs text-slate-500 mb-4">Quantity sold and gross revenue contribution</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Size / Variant</th>
                <th className="py-2.5 px-3 text-center">Units / Portions Sold</th>
                <th className="py-2.5 px-3 text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reportData?.topSellingProducts && reportData.topSellingProducts.length > 0 ? (
                reportData.topSellingProducts.map((prod, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-bold text-slate-400">#{i + 1}</td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{prod.name}</td>
                    <td className="py-3 px-3 text-slate-500">{prod.size}</td>
                    <td className="py-3 px-3 text-center font-extrabold text-blue-600 dark:text-blue-400">
                      {prod.quantity}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                      {currencySymbol} {prod.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No product sales recorded in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
