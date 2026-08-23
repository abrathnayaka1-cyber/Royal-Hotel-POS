import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Room, RoomBooking } from '../../types.ts';
import {
  LogOut,
  X,
  CreditCard,
  User,
  DollarSign,
  AlertCircle,
  Sparkles,
  BedDouble,
  Receipt,
  Printer
} from 'lucide-react';

interface RoomCheckoutModalProps {
  room: Room | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RoomCheckoutModal: React.FC<RoomCheckoutModalProps> = ({ room, isOpen, onClose }) => {
  const {
    roomBookings,
    checkoutRoomBooking,
    settings,
    printRoomTicket
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [booking, setBooking] = useState<RoomBooking | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && room) {
      setErrorMsg(null);
      setAdditionalCharges(0);
      setPaymentMethod('cash');
      setNotes('');

      // Find active booking for this room
      const active = roomBookings.find(
        b => b.roomId === room.id && (b.status === 'checked_in' || b.status === 'confirmed')
      ) || (room.currentBookingId ? roomBookings.find(b => b.id === room.currentBookingId) : null);

      setBooking(active || null);
    }
  }, [isOpen, room, roomBookings]);

  if (!isOpen || !room) return null;

  const currentGrandTotal = booking ? booking.grandTotal + Number(additionalCharges || 0) : 0;
  const currentBalanceDue = booking ? Math.max(0, currentGrandTotal - booking.advancePaid) : 0;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) {
      setErrorMsg('No active booking record found for this room.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const updated = await checkoutRoomBooking(booking.id, {
        paymentMethod,
        additionalCharges: Number(additionalCharges) || 0,
        finalPaymentAmount: currentBalanceDue,
        notes: notes.trim()
      });

      // Optionally trigger thermal receipt
      if (settings?.autoPrintAfterPayment) {
        printRoomTicket(updated).catch(() => {});
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Checkout failed.');
      setIsSubmitting(false);
    }
  };

  return (
    <div id="room-checkout-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        id="room-checkout-modal-container"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Room Check-Out & Final Settlement
              </h3>
              <p className="text-xs text-slate-400">
                Room {room.roomNumber} &bull; {room.roomType}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCheckout} className="p-6 space-y-5">
          {/* Guest Summary */}
          {booking ? (
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Guest Details</span>
                <span className="text-xs font-mono font-bold text-emerald-400">TICKET #{booking.bookingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Guest Name:</span>
                <span className="font-bold text-white">{booking.guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="text-slate-200">{booking.guestPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Stay Duration:</span>
                <span className="font-mono text-slate-200">{booking.durationDays} Night(s) / Day(s)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Advance Paid:</span>
                <span className="font-mono text-emerald-400 font-bold">{currencySymbol} {booking.advancePaid.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm">
              No active booking found. You can clear the room directly to available/cleaning status.
            </div>
          )}

          {/* Extra Charges */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Additional Charges (Minibar / Food / Room Service)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="number"
                  min="0"
                  id="checkout-extra-charges-input"
                  value={additionalCharges}
                  onChange={(e) => setAdditionalCharges(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Settlement Payment Method
              </label>
              <select
                id="checkout-payment-method-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="cash">💵 Cash Settlement</option>
                <option value="card">💳 Visa / Master Card</option>
                <option value="bank_transfer">🏦 Bank Transfer</option>
                <option value="other">📱 Other / Online</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Checkout Notes
              </label>
              <input
                type="text"
                id="checkout-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Keys returned, Room checked, Satisfied stay"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Settlement Summary Box */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 grid grid-cols-2 gap-3 text-center font-mono">
            <div className="p-2.5 bg-slate-900 rounded-lg">
              <div className="text-[11px] text-slate-400 uppercase font-sans">Final Total Amount</div>
              <div className="text-base font-bold text-white mt-0.5">
                {currencySymbol} {currentGrandTotal.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/40 rounded-lg">
              <div className="text-[11px] text-amber-400 uppercase font-sans">Collect Balance Due</div>
              <div className="text-lg font-black text-amber-300 mt-0.5">
                {currencySymbol} {currentBalanceDue.toLocaleString()}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            ✨ Once checked out, Room {room.roomNumber} will automatically be marked for <strong>Cleaning</strong>.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-checkout-btn"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>{isSubmitting ? 'Checking Out...' : `Settle & Check-Out (${currencySymbol} ${currentBalanceDue.toLocaleString()})`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
