import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { printKOT } from '../../lib/printEngine.ts';
import { KOT } from '../../types.ts';
import { Printer, CheckCircle, Utensils, AlertCircle, Loader2 } from 'lucide-react';

export const KOTModal: React.FC = () => {
  const {
    isKOTModalOpen,
    setIsKOTModalOpen,
    cart,
    orderType,
    tableNumber,
    notes,
    createKOT,
    settings,
  } = usePOS();

  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [createdKot, setCreatedKot] = useState<KOT | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isKOTModalOpen) return null;

  const handleSendKOT = async () => {
    try {
      setIsPrinting(true);
      setErrorMsg(null);
      const kot = await createKOT();
      setCreatedKot(kot);
      // Automatically trigger thermal kitchen print
      await printKOT(kot, settings);
      setIsPrinting(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate KOT ticket.');
      setIsPrinting(false);
    }
  };

  const handleReprint = async () => {
    if (!createdKot) return;
    try {
      setIsPrinting(true);
      await printKOT(createdKot, settings);
    } catch (err) {
      console.error('Reprint failed:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleClose = () => {
    setCreatedKot(null);
    setErrorMsg(null);
    setIsKOTModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        id="kot-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/90 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Utensils className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                Kitchen Order Ticket (KOT)
              </h2>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                Dispatch items to preparation queue
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

        {/* Content: Ticket Preview */}
        <div className="p-6 overflow-y-auto space-y-4">
          {createdKot ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">
                KOT Generated & Dispatched!
              </h3>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">
                Ticket #{createdKot.kotNumber}
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto font-medium">
                The order items have been queued in the Kitchen Management Display and sent to the thermal kitchen printer.
              </p>
            </div>
          ) : (
            <>
              {/* Thermal KOT Ticket Preview Mockup */}
              <div className="p-5 bg-white dark:bg-slate-950 border-2 border-dashed border-slate-400 dark:border-slate-700 rounded-xl font-mono text-xs text-slate-900 dark:text-slate-100 space-y-2.5 max-w-sm mx-auto shadow-md">
                <div className="text-center border-b border-dashed border-slate-400 dark:border-slate-600 pb-2 space-y-0.5">
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    {settings?.businessName || 'Royal Hotel & Restaurant'}
                  </div>
                  <div className="font-black text-sm text-slate-900 dark:text-white">*** KITCHEN ORDER TICKET ***</div>
                  <div className="inline-block bg-black text-white text-xs font-black px-2.5 py-0.5 rounded mt-1">
                    TABLE: {tableNumber || 'COUNTER / BAR'}
                  </div>
                </div>

                <div className="flex justify-between text-xs pt-1 border-b border-dashed border-slate-400 dark:border-slate-600 pb-2 text-slate-700 dark:text-slate-300">
                  <span><strong>Date</strong> &nbsp;{new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span>
                  <span><strong>Time</strong> &nbsp;{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
                </div>

                {/* Items List */}
                <div className="border-b border-dashed border-slate-400 dark:border-slate-600 py-2 space-y-2">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <span className="font-black text-sm text-slate-900 dark:text-white w-6 shrink-0">
                        {item.quantity}x
                      </span>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900 dark:text-white">{item.productName}</div>
                        {item.size && <div className="text-[11px] text-slate-600 dark:text-slate-400">({item.size})</div>}
                        {item.notes && (
                          <div className="text-[11px] italic font-bold bg-slate-100 dark:bg-slate-800 p-1 rounded mt-1 border-l-2 border-slate-900 dark:border-slate-100 text-slate-800 dark:text-slate-200">
                            ** Note: {item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {notes && (
                  <div className="text-xs bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                    <strong>Special Instructions:</strong> {notes}
                  </div>
                )}

                <div className="text-center font-bold text-[11px] text-slate-500 pt-1">
                  *** DISPATCH TO PREPARATION ***
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          {createdKot ? (
            <>
              <button
                type="button"
                disabled={isPrinting}
                onClick={handleReprint}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isPrinting ? 'Printing...' : 'Re-print Ticket'}</span>
              </button>
              <button
                id="kot-done-btn"
                type="button"
                onClick={handleClose}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black uppercase transition-colors cursor-pointer"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-bold uppercase text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-send-kot-btn"
                type="button"
                disabled={isPrinting}
                onClick={handleSendKOT}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                <span>{isPrinting ? 'Sending & Printing...' : 'Send & Print KOT'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

