import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { PaymentMethod } from '../../types.ts';
import confetti from 'canvas-confetti';
import {
  X,
  CreditCard,
  Banknote,
  Building2,
  CheckCircle2,
  AlertCircle,
  Receipt
} from 'lucide-react';

export const PaymentModal: React.FC = () => {
  const {
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    grandTotal,
    subtotal,
    totalDiscount,
    serviceCharge,
    tax,
    orderType,
    tableNumber,
    customerName,
    completeCheckout,
    settings,
    roomBookings,
  } = usePOS();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedRoomBookingId, setSelectedRoomBookingId] = useState('');

  const activeRoomBookings = roomBookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed');
  const selectedBooking = activeRoomBookings.find(b => b.id === selectedRoomBookingId);
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  useEffect(() => {
    if (isPaymentModalOpen) {
      setPaymentMethod('cash');
      setAmountReceived(grandTotal.toString());
      setErrorMsg(null);
      setIsProcessing(false);
      const matchingBooking = activeRoomBookings.find(b =>
        b.roomNumber.toLowerCase() === tableNumber.trim().toLowerCase() ||
        b.guestName.toLowerCase() === customerName.trim().toLowerCase()
      );
      setSelectedRoomBookingId(matchingBooking?.id || '');
    }
  }, [isPaymentModalOpen, grandTotal]);

  if (!isPaymentModalOpen) return null;

  const numReceived = parseFloat(amountReceived) || 0;
  const changeAmount = Math.max(0, numReceived - grandTotal);
  const isSufficient = paymentMethod !== 'cash' || numReceived >= grandTotal;

  const denominations = [
    { label: 'Exact', amount: grandTotal },
    { label: '+500', amount: Math.ceil(grandTotal / 500) * 500 },
    { label: '+1,000', amount: Math.ceil(grandTotal / 1000) * 1000 },
    { label: 'Rs. 2,000', amount: 2000 },
    { label: 'Rs. 5,000', amount: 5000 },
    { label: 'Rs. 10,000', amount: 10000 },
  ];

  const handleComplete = async () => {
    try {
      if (paymentMethod === 'cash' && numReceived < grandTotal) {
        setErrorMsg('Amount received is less than Grand Total.');
        return;
      }

      setIsProcessing(true);
      setErrorMsg(null);

      if (paymentMethod === 'room_charge' && !selectedRoomBookingId) {
        setErrorMsg('Please select the guest room booking.');
        setIsProcessing(false);
        return;
      }

      await completeCheckout(
        paymentMethod,
        paymentMethod === 'room_charge' ? 0 : numReceived,
        undefined,
        paymentMethod === 'room_charge' ? selectedRoomBookingId : undefined
      );

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment processing failed.');
      setIsProcessing(false);
    }
  };

  const paymentMethods: { method: PaymentMethod; label: string; icon: any }[] = [
    { method: 'cash', label: 'Cash Tender', icon: Banknote },
    { method: 'card', label: 'Credit / Debit Card', icon: CreditCard },
    { method: 'bank_transfer', label: 'Bank / QR Transfer', icon: Building2 },
    { method: 'other', label: 'Other', icon: Receipt },
    ...(orderType === 'room_service'
      ? [{ method: 'room_charge' as PaymentMethod, label: 'Add to Room Bill', icon: Receipt }]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        id="pos-payment-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-800/90 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">
              Payment & Settlement
            </h2>
            <p className="text-xs text-slate-500 font-semibold uppercase mt-0.5">
              {orderType.toUpperCase().replace('_', ' ')} • {tableNumber ? `Table: ${tableNumber}` : 'Direct Counter'} • {customerName || 'Walk-in Guest'}
            </p>
          </div>
          <button
            onClick={() => setIsPaymentModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-2xl font-bold p-1 leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Total Payable Banner */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-xs border border-slate-800">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Total Payable Amount
              </span>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
                {currencySymbol} {grandTotal.toLocaleString()}
              </div>
            </div>
            <div className="text-right text-xs text-slate-400 space-y-0.5 font-medium">
              <div>Subtotal: {currencySymbol} {subtotal.toLocaleString()}</div>
              {totalDiscount > 0 && <div className="text-rose-400">Discount: -{currencySymbol} {totalDiscount.toLocaleString()}</div>}
              {serviceCharge > 0 && <div>Service ({settings?.serviceChargeRate || 10}%): +{currencySymbol} {serviceCharge.toLocaleString()}</div>}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {paymentMethods.map(m => {
                const isSelected = paymentMethod === m.method;
                const Icon = m.icon;
                return (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m.method);
                      if (m.method !== 'cash') {
                        setAmountReceived(grandTotal.toString());
                      }
                    }}
                    className={`p-3 rounded-xl border-2 text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-950 dark:text-blue-200 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === 'room_charge' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 block">
                Select Occupied Room / Guest
              </label>
              <select
                value={selectedRoomBookingId}
                onChange={e => setSelectedRoomBookingId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white"
              >
                <option value="">Choose active booking...</option>
                {activeRoomBookings.map(booking => (
                  <option key={booking.id} value={booking.id}>
                    Room {booking.roomNumber} — {booking.guestName} ({booking.bookingNumber})
                  </option>
                ))}
              </select>
              {selectedBooking && (
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  Current room balance: <strong>{currencySymbol} {selectedBooking.balanceDue.toLocaleString()}</strong>
                  {' '}+ Items: <strong>{currencySymbol} {grandTotal.toLocaleString()}</strong>
                  {' '}= New balance: <strong>{currencySymbol} {(selectedBooking.balanceDue + grandTotal).toLocaleString()}</strong>
                </div>
              )}
              <p className="text-[11px] text-slate-500">No payment is collected now. These items will be included with the room charge at checkout.</p>
            </div>
          )}

          {/* Cash Tender Input & Denominations */}
          {paymentMethod === 'cash' && (
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Cash Tendered
                </label>

                {/* Input Field */}
                <div className="relative w-full sm:w-56">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    id="cash-tendered-input"
                    type="number"
                    min="0"
                    step="any"
                    value={amountReceived}
                    onChange={e => setAmountReceived(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-base font-extrabold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {denominations.map((denom, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAmountReceived(denom.amount.toString())}
                    className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    {denom.label}
                  </button>
                ))}
              </div>

              {/* Change Calculation */}
              <div className="mt-2 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Change Due to Customer:
                </span>
                <span
                  className={`text-xl font-black ${
                    numReceived < grandTotal
                      ? 'text-rose-600'
                      : changeAmount > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {currencySymbol} {changeAmount.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(false)}
            className="px-6 py-2 rounded-lg font-bold text-xs uppercase text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="confirm-checkout-btn"
            type="button"
            disabled={!isSufficient || isProcessing}
            onClick={handleComplete}
            className={`px-8 py-2.5 text-xs font-black uppercase text-white rounded-lg shadow-lg flex items-center gap-2 transition-all ${
              isSufficient && !isProcessing
                ? 'bg-green-600 hover:bg-green-700 shadow-green-600/25 cursor-pointer active:scale-98'
                : 'bg-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            {isProcessing ? (
              <span>Processing Sale...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>COMPLETE SALE ({currencySymbol} {grandTotal.toLocaleString()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

