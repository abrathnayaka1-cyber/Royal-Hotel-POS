import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { generateInvoicePDF } from '../../lib/exportUtils.ts';
import { printThermalReceipt } from '../../lib/printEngine.ts';
import { X, Printer, Download, CheckCircle, PlusCircle, FileText, Loader2 } from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const {
    isReceiptModalOpen,
    setIsReceiptModalOpen,
    recentCompletedBill,
    settings,
  } = usePOS();

  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isReceiptModalOpen || !recentCompletedBill) return null;

  const bill = recentCompletedBill;
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const handlePrintThermal = async () => {
    try {
      setIsPrinting(true);
      await printThermalReceipt(bill, settings);
    } catch (err) {
      console.error('Failed to print receipt:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPDF = () => {
    generateInvoicePDF(bill, settings);
  };

  const handleClose = () => {
    setIsReceiptModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        id="receipt-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/90 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-600 text-white flex items-center justify-center shadow-xs">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                Sale Completed & Paid
              </h2>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                {bill.billNumber} • Invoice #{bill.invoiceNumber}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-2xl font-bold p-1 leading-none"
          >
            &times;
          </button>
        </div>

        {/* Thermal Receipt Visual Preview */}
        <div className="p-6 overflow-y-auto flex-1">
          <div
            id="thermal-receipt-container"
            className="p-6 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs text-slate-900 dark:text-slate-100 space-y-3 shadow-md max-w-sm mx-auto tracking-tight"
          >
            {/* Store Header */}
            <div className="text-center space-y-0.5 border-b border-dashed border-slate-400 dark:border-slate-600 pb-3">
              <img
                src="/logo.png"
                alt="Royal Hotel POS"
                className="w-12 h-12 rounded-lg object-cover mx-auto mb-1.5"
                draggable={false}
              />
              <h3 className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                {settings?.businessName || 'Royal Hotel & Restaurant'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">{settings?.address || 'Kurunegala Road, Puttalam'}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{settings?.phone || '032 226 52 66 / 0772256569'}</p>
            </div>

            {/* Bill Details */}
            <div className="text-xs space-y-1 pt-1 border-b border-dashed border-slate-400 dark:border-slate-600 pb-2">
              <div className="flex justify-between">
                <span><strong>Date</strong> &nbsp;{new Date(bill.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span>
                <span><strong>Time</strong> &nbsp;{new Date(bill.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
              </div>
              <div className="flex justify-between">
                <span><strong>Bill</strong> &nbsp;{bill.billNumber}</span>
                <span><strong>User</strong> &nbsp;{bill.cashierName || 'Admin'}</span>
              </div>
              {bill.tableNumber && (
                <div className="flex justify-between">
                  <span><strong>Table</strong> &nbsp;{bill.tableNumber}</span>
                  <span><strong>Type</strong> &nbsp;{bill.orderType.toUpperCase().replace('_', ' ')}</span>
                </div>
              )}
            </div>

            {/* Column Headers */}
            <div className="flex justify-between font-bold text-xs text-slate-800 dark:text-slate-200 border-b border-dashed border-slate-400 dark:border-slate-600 pb-1">
              <span className="w-2/5 text-left">Price</span>
              <span className="w-1/5 text-center">QTY</span>
              <span className="w-2/5 text-right">Amount</span>
            </div>

            {/* Line Items */}
            <div className="space-y-2.5 py-1 border-b border-dashed border-slate-400 dark:border-slate-600">
              {bill.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    {item.productName}{item.size ? ` ${item.size}` : ''}
                  </div>
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span className="w-2/5 text-left">{Number(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="w-1/5 text-center font-bold">{item.quantity}</span>
                    <span className="w-2/5 text-right font-bold">{Number(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-1.5 text-xs pt-1 border-b border-dashed border-slate-400 dark:border-slate-600 pb-2">
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>Service Charge{bill.serviceChargeRate ? ` (${bill.serviceChargeRate}%)` : ''}</span>
                <span>{Number(bill.serviceCharge || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>Amount</span>
                <span>{Number(bill.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>Total Bill Discount</span>
                <span>({Number(bill.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
              </div>
              {bill.tax > 0 && (
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>VAT / Tax ({bill.taxRate || 0}%)</span>
                  <span>{Number(bill.tax || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-900 dark:border-slate-100 text-slate-900 dark:text-white">
                <span>Total Amount</span>
                <span>{Number(bill.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between text-xs pt-1 text-slate-700 dark:text-slate-300">
                <span>Payment ({bill.paymentMethod.toUpperCase()})</span>
                <span>{Number(bill.amountReceived || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                <span>Balance</span>
                <span>{(Number(bill.amountReceived || 0) - Number(bill.grandTotal || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Footer Greeting */}
            <div className="text-center text-xs text-slate-600 dark:text-slate-400 pt-2 space-y-0.5">
              <div className="font-bold text-slate-800 dark:text-slate-200">{settings?.receiptFooter || 'Thankyou! Come Again...'}</div>
              <div>System powered by Royal Hotel POS</div>
              <div>{settings?.phone || '032 226 52 66 / 0772256569'}</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            PDF Invoice
          </button>

          <div className="flex items-center gap-2">
            <button
              id="print-thermal-receipt-btn"
              type="button"
              disabled={isPrinting}
              onClick={handlePrintThermal}
              className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>{isPrinting ? 'Printing...' : 'Print Thermal'}</span>
            </button>
            <button
              id="new-order-btn"
              type="button"
              onClick={handleClose}
              className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              New Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

