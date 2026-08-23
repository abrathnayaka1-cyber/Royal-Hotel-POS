import React from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Play, Trash2, Clock, UtensilsCrossed, Wine, Car, Home } from 'lucide-react';
import { OrderType } from '../../types.ts';

export const HeldBillsModal: React.FC = () => {
  const {
    isHeldBillsModalOpen,
    setIsHeldBillsModalOpen,
    heldBills,
    loadHeldBill,
    deleteHeldBill,
    settings,
  } = usePOS();

  if (!isHeldBillsModalOpen) return null;

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const getTypeIcon = (type: OrderType) => {
    switch (type) {
      case 'bar_counter':
        return <Wine className="w-3.5 h-3.5" />;
      case 'takeaway':
        return <Car className="w-3.5 h-3.5" />;
      case 'room_service':
        return <Home className="w-3.5 h-3.5" />;
      default:
        return <UtensilsCrossed className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        id="held-bills-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/90 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                Held Bills & Active Tabs ({heldBills.length})
              </h2>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                Select an unfinished order to resume or modify
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsHeldBillsModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-2xl font-bold p-1 leading-none"
          >
            &times;
          </button>
        </div>

        {/* List of Held Bills */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {heldBills.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Clock className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">No active held bills</p>
              <p className="text-xs text-slate-500 mt-0.5">
                When you click HOLD on the POS screen, the order will be saved here.
              </p>
            </div>
          ) : (
            heldBills.map(held => {
              const itemCount = held.items.reduce((sum, i) => sum + i.quantity, 0);
              const formattedTime = new Date(held.updatedAt || held.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={held.id}
                  id={`held-bill-item-${held.id}`}
                  className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-amber-400 dark:hover:border-amber-500 transition-colors shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {held.billNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        {getTypeIcon(held.orderType)}
                        {held.orderType.toUpperCase().replace('_', ' ')}
                      </span>
                      {held.tableNumber && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          Table: {held.tableNumber}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-3 font-medium">
                      <span>Guest: <strong className="text-slate-800 dark:text-slate-200">{held.customerName || 'Walk-in'}</strong></span>
                      <span>Items: <strong>{itemCount}</strong></span>
                      <span>Held at: <strong>{formattedTime}</strong></span>
                    </div>

                    {/* Preview first 2 items */}
                    <div className="text-[11px] text-slate-400 truncate max-w-md pt-0.5">
                      {held.items.map(i => `${i.quantity}x ${i.productName} (${i.size})`).join(', ')}
                    </div>
                  </div>

                  {/* Actions & Price */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700">
                    <div className="text-base font-black text-slate-900 dark:text-white">
                      {currencySymbol} {held.grandTotal.toLocaleString()}
                    </div>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => deleteHeldBill(held.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Discard Held Order"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        id={`resume-held-btn-${held.id}`}
                        type="button"
                        onClick={() => loadHeldBill(held)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-black uppercase flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Resume Order
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={() => setIsHeldBillsModalOpen(false)}
            className="px-6 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

