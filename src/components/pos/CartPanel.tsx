import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { OrderType } from '../../types.ts';
import {
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  FileText,
  CreditCard,
  RotateCcw,
  UtensilsCrossed,
  Tag,
  Wine,
  Car,
  Home,
  MessageSquare,
  Printer,
  AlertTriangle
} from 'lucide-react';

export const CartPanel: React.FC = () => {
  const {
    cart,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    customerName,
    setCustomerName,
    notes,
    setNotes,
    discountPercentage,
    setDiscountPercentage,
    subtotal,
    totalDiscount,
    serviceCharge,
    tax,
    grandTotal,
    totalItemsCount,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    holdCurrentBill,
    setIsPaymentModalOpen,
    setIsHeldBillsModalOpen,
    setIsKOTModalOpen,
    setIsDamageModalOpen,
    heldBills,
    settings,
  } = usePOS();

  const [isDiscountOpen, setIsDiscountOpen] = useState<boolean>(false);
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const handleHold = async () => {
    try {
      setErrorMsg(null);
      await holdCurrentBill();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to hold bill.');
    }
  };

  const handleKOT = () => {
    if (cart.length === 0) {
      setErrorMsg('Cart is empty. Add food/beverage items first.');
      return;
    }
    setErrorMsg(null);
    setIsKOTModalOpen(true);
  };

  const handleOpenPay = () => {
    if (cart.length === 0) {
      setErrorMsg('Cart is empty. Add items to checkout.');
      return;
    }
    setErrorMsg(null);
    setIsPaymentModalOpen(true);
  };

  const orderTypes: { type: OrderType; label: string; icon: any }[] = [
    { type: 'dine_in', label: 'Dine-In', icon: UtensilsCrossed },
    { type: 'bar_counter', label: 'Bar', icon: Wine },
    { type: 'takeaway', label: 'Takeaway', icon: Car },
    { type: 'room_service', label: 'Room', icon: Home },
  ];

  return (
    <aside
      id="pos-cart-panel"
      className="w-full h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col select-none shadow-xs"
    >
      {/* Top Header: Current Order & Order Number */}
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800 dark:text-white uppercase tracking-wider text-xs sm:text-sm">
            Current Order
          </h3>
          {totalItemsCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded">
              {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
            </span>
          )}
          {heldBills.length > 0 && (
            <button
              onClick={() => setIsHeldBillsModalOpen(true)}
              className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 rounded cursor-pointer"
            >
              {heldBills.length} Held
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            id="open-damage-report-btn"
            onClick={() => setIsDamageModalOpen(true)}
            title="Report damaged / broken bottles (stock write-off note)"
            className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900 rounded cursor-pointer flex items-center gap-1 transition-colors"
          >
            <AlertTriangle className="w-3 h-3" />
            Damage
          </button>
          <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs px-2.5 py-0.5 rounded-md font-extrabold">
            #ORD-{cart.length > 0 ? (cart.length * 1024 % 9000 + 1000) : '8402'}
          </span>
        </div>
      </div>

      {/* Order Type & Table Quick Bar */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          {orderTypes.map(t => {
            const isSelected = orderType === t.type;
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setOrderType(t.type)}
                className={`py-1 px-1.5 rounded-lg text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <input
            id="cart-table-input"
            type="text"
            placeholder={orderType === 'bar_counter' ? 'Bar Stool / Tab #' : 'Table / Room #'}
            value={tableNumber}
            onChange={e => setTableNumber(e.target.value)}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
          <input
            id="cart-customer-input"
            type="text"
            placeholder="Guest Name (Opt)"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              No items in order
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any product to select size & add to cart.
            </p>
          </div>
        ) : (
          cart.map((item, idx) => {
            const isLast = idx === cart.length - 1;
            return (
              <div
                key={`${item.variantId}-${idx}`}
                className={`flex flex-col p-3 rounded-lg border transition-all ${
                  isLast
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-100'
                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60'
                }`}
              >
                <div className="flex justify-between items-start font-bold text-xs sm:text-sm">
                  <span className="truncate pr-2">{item.productName} ({item.size})</span>
                  <span className="shrink-0 font-extrabold">{item.total.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                    {item.quantity} x {currencySymbol} {item.unitPrice.toLocaleString()}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.variantId, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs flex items-center justify-center font-bold cursor-pointer transition-colors"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold w-5 text-center text-slate-800 dark:text-slate-200">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.variantId, item.quantity + 1)}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs flex items-center justify-center font-bold cursor-pointer transition-colors"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.variantId)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded ml-1"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {item.notes && (
                  <p className="text-[10px] italic text-amber-600 dark:text-amber-400 mt-1">
                    Note: {item.notes}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border-t border-rose-200 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 font-bold">×</button>
        </div>
      )}

      {/* Totals Section matching theme */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        {/* Quick Toggles for Discount & Order Note */}
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setIsDiscountOpen(!isDiscountOpen)}
            className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <Tag className="w-3 h-3" />
            {discountPercentage > 0 ? `Discount (${discountPercentage}%)` : '+ Add Discount'}
          </button>

          <button
            type="button"
            onClick={() => setIsNotesOpen(!isNotesOpen)}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
          >
            <MessageSquare className="w-3 h-3" />
            {notes ? 'Edit Note' : '+ Note'}
          </button>
        </div>

        {/* Discount Form */}
        {isDiscountOpen && (
          <div className="p-2 mb-2 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg flex items-center gap-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300 text-[10px]">DISC %:</span>
            {[0, 5, 10, 15, 20].map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => setDiscountPercentage(pct)}
                className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                  discountPercentage === pct
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Note Form */}
        {isNotesOpen && (
          <div className="p-2 mb-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <input
              type="text"
              placeholder="Order remarks (e.g. Table reserved, VIP)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
            />
          </div>
        )}

        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
          <span>Subtotal</span>
          <span>{currencySymbol} {subtotal.toLocaleString()}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex justify-between text-xs text-rose-600 mb-1 font-semibold">
            <span>Discount ({discountPercentage}%)</span>
            <span>-{currencySymbol} {totalDiscount.toLocaleString()}</span>
          </div>
        )}

        {serviceCharge > 0 && (
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Service ({settings?.serviceChargeRate || 10}%)</span>
            <span>+{currencySymbol} {serviceCharge.toLocaleString()}</span>
          </div>
        )}

        {tax > 0 && (
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Tax ({settings?.taxRate || 0}%)</span>
            <span>+{currencySymbol} {tax.toLocaleString()}</span>
          </div>
        )}

        <div className="flex justify-between text-lg font-black text-slate-900 dark:text-white mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <span className="uppercase tracking-tight">TOTAL</span>
          <span className="text-blue-700 dark:text-blue-400">
            {currencySymbol} {grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Action Buttons Grid matching theme */}
      <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800">
        <button
          id="pos-hold-btn"
          type="button"
          disabled={cart.length === 0}
          onClick={handleHold}
          className="bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white font-bold py-3 rounded-lg text-xs uppercase shadow-xs transition-colors cursor-pointer"
        >
          Hold Bill
        </button>

        <button
          id="pos-kot-btn"
          type="button"
          disabled={cart.length === 0}
          onClick={handleKOT}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-3 rounded-lg text-xs uppercase shadow-xs transition-colors cursor-pointer"
        >
          Send KOT
        </button>

        <button
          id="pos-clear-btn"
          type="button"
          disabled={cart.length === 0}
          onClick={clearCart}
          className="bg-slate-500 hover:bg-slate-600 disabled:opacity-40 text-white font-bold py-3 rounded-lg text-xs uppercase shadow-xs transition-colors cursor-pointer"
        >
          Clear Bill
        </button>

        <button
          id="pos-pay-btn"
          type="button"
          disabled={cart.length === 0}
          onClick={handleOpenPay}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-black py-3 rounded-lg text-sm uppercase shadow-lg transition-colors cursor-pointer"
        >
          PAY NOW
        </button>
      </div>
    </aside>
  );
};

