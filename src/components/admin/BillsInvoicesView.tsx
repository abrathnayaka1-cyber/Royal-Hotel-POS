import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { Bill, SystemSettings } from '../../types.ts';
import { generateInvoicePDF, exportToExcel } from '../../lib/exportUtils.ts';
import { printThermalReceipt } from '../../lib/printEngine.ts';
import {
  Receipt,
  Search,
  Download,
  Printer,
  Ban,
  Eye,
  RefreshCw,
  X,
  AlertCircle,
  FileText,
  CreditCard,
  Banknote,
  Building2
} from 'lucide-react';

export const BillsInvoicesView: React.FC<{ settings: SystemSettings | null }> = ({ settings }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Selected Bill for Detail View
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  // Void Bill Modal
  const [voidBillTarget, setVoidBillTarget] = useState<Bill | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const loadBills = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<Bill[]>('/bills');
      setBills(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load bills:', err);
      setBills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, []);

  const handleExportExcel = () => {
    const data = filteredBills.map(b => ({
      'Invoice #': b.invoiceNumber,
      'Bill #': b.billNumber,
      'Date & Time': new Date(b.createdAt).toLocaleString(),
      'Order Type': b.orderType,
      'Table #': b.tableNumber || 'N/A',
      'Guest Name': b.customerName || 'Walk-in',
      'Cashier': b.cashierName,
      'Subtotal': b.subtotal,
      'Discount': b.discount,
      'Service Charge': b.serviceCharge || 0,
      'Tax / VAT': b.tax,
      'Grand Total': b.grandTotal,
      'Payment Method': b.paymentMethod,
      'Status': b.status,
    }));
    exportToExcel(data, 'Completed_Bills_Invoices');
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidBillTarget || !voidReason.trim()) return;

    try {
      setIsVoiding(true);
      setErrorMsg(null);
      await fetchApi(`/bills/${voidBillTarget.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setVoidBillTarget(null);
      setVoidReason('');
      setIsVoiding(false);
      await loadBills();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void bill.');
      setIsVoiding(false);
    }
  };

  const filteredBills = bills.filter(b => {
    if (paymentFilter !== 'all' && b.paymentMethod !== paymentFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchBill = String(b.billNumber || '').toLowerCase().includes(q);
      const matchInv = String(b.invoiceNumber || '').toLowerCase().includes(q);
      const matchCust = b.customerName?.toLowerCase().includes(q);
      const matchTable = b.tableNumber?.toLowerCase().includes(q);
      const matchCashier = String(b.cashierName || '').toLowerCase().includes(q);
      if (!matchBill && !matchInv && !matchCust && !matchTable && !matchCashier) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Bills & Tax Invoices
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search completed POS transactions, download official PDF invoices, and perform admin voids
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBills}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export Invoices Excel
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice #, bill #, table, guest, cashier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other / Room</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid & Completed</option>
            <option value="voided">Voided / Cancelled</option>
          </select>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Invoice / Bill #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Type & Table</th>
                <th className="py-3 px-4">Guest / Cashier</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredBills.map(bill => (
                <tr key={bill.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      {bill.invoiceNumber}
                    </div>
                    <div className="text-[11px] text-slate-400">{bill.billNumber}</div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    <div>{new Date(bill.createdAt).toLocaleDateString()}</div>
                    <div className="text-[10px]">
                      {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {bill.orderType}
                    </span>
                    {bill.tableNumber && (
                      <span className="ml-1.5 font-bold text-xs text-blue-600 dark:text-blue-400">
                        T-{bill.tableNumber}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {bill.customerName || 'Walk-in'}
                    </div>
                    <div className="text-[11px] text-slate-400">By: {bill.cashierName}</div>
                  </td>

                  <td className="py-3.5 px-4 uppercase font-semibold text-slate-600 dark:text-slate-400">
                    {bill.paymentMethod}
                  </td>

                  <td className="py-3.5 px-4 text-right font-black text-sm text-slate-900 dark:text-white">
                    {currencySymbol} {bill.grandTotal.toLocaleString()}
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    {bill.status === 'voided' ? (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold text-[10px] rounded-md">
                        VOIDED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px] rounded-md">
                        PAID
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedBill(bill)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                        title="View Full Bill Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => printThermalReceipt(bill, settings)}
                        className="p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Print Thermal Receipt (80mm/58mm)"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => generateInvoicePDF(bill, settings)}
                        className="p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Download Tax Invoice PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {bill.status !== 'voided' && (
                        <button
                          onClick={() => {
                            setVoidBillTarget(bill);
                            setVoidReason('');
                            setErrorMsg(null);
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Void Bill & Restore Inventory"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Details Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Invoice #{selectedBill.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Bill #{selectedBill.billNumber} • {new Date(selectedBill.createdAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedBill(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs flex-1">
              <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5 shadow-xs">
                {/* Store Header */}
                <div className="text-center pb-2 border-b border-dashed border-slate-300 dark:border-slate-700">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{settings?.businessName || 'Royal Hotel & Restaurant'}</div>
                  <div className="text-[11px] text-slate-500">{settings?.address || 'Kurunegala Road, Puttalam'}</div>
                  <div className="text-[11px] text-slate-500">{settings?.phone || '032 226 52 66 / 0772256569'}</div>
                </div>

                {/* Metadata */}
                <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 dark:border-slate-700 pb-2">
                  <div className="flex justify-between">
                    <span><strong>Date</strong> &nbsp;{new Date(selectedBill.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span>
                    <span><strong>Time</strong> &nbsp;{new Date(selectedBill.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span><strong>Bill</strong> &nbsp;{selectedBill.billNumber}</span>
                    <span><strong>User</strong> &nbsp;{selectedBill.cashierName || 'Admin'}</span>
                  </div>
                  {selectedBill.tableNumber && (
                    <div className="flex justify-between">
                      <span><strong>Table</strong> &nbsp;{selectedBill.tableNumber}</span>
                      <span><strong>Type</strong> &nbsp;{selectedBill.orderType.toUpperCase().replace('_', ' ')}</span>
                    </div>
                  )}
                </div>

                {/* Column Headers */}
                <div className="flex justify-between font-bold text-[11px] text-slate-700 dark:text-slate-300 border-b border-dashed border-slate-300 dark:border-slate-700 pb-1">
                  <span className="w-2/5 text-left">Price</span>
                  <span className="w-1/5 text-center">QTY</span>
                  <span className="w-2/5 text-right">Amount</span>
                </div>

                {/* Items List */}
                <div className="space-y-2 py-1 border-b border-dashed border-slate-300 dark:border-slate-700">
                  {selectedBill.items.map((item, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white text-xs">
                        {item.productName}{item.size ? ` ${item.size}` : ''}
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="w-2/5 text-left">{Number(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="w-1/5 text-center font-bold">{item.quantity}</span>
                        <span className="w-2/5 text-right font-bold text-slate-900 dark:text-white">{Number(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="space-y-1 pt-1 text-[11px] text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Service Charge</span>
                    <span>{Number(selectedBill.serviceCharge || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount</span>
                    <span>{Number(selectedBill.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Bill Discount</span>
                    <span>({Number(selectedBill.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                  </div>
                  <div className="flex justify-between font-black text-sm text-slate-900 dark:text-white pt-1.5 border-t border-slate-900 dark:border-slate-100">
                    <span>Total Amount</span>
                    <span>{Number(selectedBill.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span>Payment ({selectedBill.paymentMethod.toUpperCase()})</span>
                    <span>{Number(selectedBill.amountReceived || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Balance</span>
                    <span>{(Number(selectedBill.amountReceived || 0) - Number(selectedBill.grandTotal || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => printThermalReceipt(selectedBill, settings)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Thermal Receipt
              </button>
              <button
                type="button"
                onClick={() => generateInvoicePDF(selectedBill, settings)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidBillTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950 flex items-center justify-center">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Void & Cancel Bill #{voidBillTarget.billNumber}
                </h3>
                <p className="text-xs text-rose-600 font-medium">
                  Grand Total: {currencySymbol} {voidBillTarget.grandTotal.toLocaleString()}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Voiding this bill will mark it as cancelled, reverse financial totals, and automatically
              restore the subtracted bottle and portion stock back into inventory.
            </p>

            {errorMsg && <div className="text-xs text-rose-600">{errorMsg}</div>}

            <form onSubmit={handleConfirmVoid} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  Reason for Voiding *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Customer changed mind / wrong order entered"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidBillTarget(null)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isVoiding}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black"
                >
                  {isVoiding ? 'Voiding...' : 'Confirm Void & Restore Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
