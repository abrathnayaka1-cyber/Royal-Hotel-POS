import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Room } from '../../types.ts';
import {
  BedDouble,
  Calendar,
  User,
  Phone,
  CreditCard,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Clock,
  Sparkles,
  Users,
  Building,
  ShieldCheck
} from 'lucide-react';

export const RoomBookingModal: React.FC = () => {
  const {
    isBookingModalOpen,
    closeRoomBookingModal,
    selectedRoomForBooking,
    rooms,
    settings,
    createRoomBooking
  } = usePOS();

  // Only a Super Admin may agree to a rate other than the room's own tariff.
  const { isSuperAdmin } = useAuth();
  const canChangeRate = isSuperAdmin;

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Booking discounts follow the same policy as the POS cart.
  const discountsEnabled = settings?.enableDiscounts !== false;
  const maxDiscountPct = Number(settings?.maxDiscountPercentage ?? 100) || 100;

  // Form State
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [guestIdOrPassport, setGuestIdOrPassport] = useState<string>('');
  const [guestAddress, setGuestAddress] = useState<string>('');
  const [numberOfGuests, setNumberOfGuests] = useState<number>(2);
  
  // Dates
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [checkInDate, setCheckInDate] = useState<string>(todayStr);
  const [checkOutDate, setCheckOutDate] = useState<string>(tomorrowStr);
  const [durationDays, setDurationDays] = useState<number>(1);
  
  // Pricing
  const [ratePerDay, setRatePerDay] = useState<number>(0);
  const [extraCharges, setExtraCharges] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [status, setStatus] = useState<'checked_in' | 'confirmed'>('checked_in');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize room when modal opens
  useEffect(() => {
    if (isBookingModalOpen) {
      setErrorMsg(null);
      const targetRoom = selectedRoomForBooking || rooms.find(r => r.status === 'available');
      if (targetRoom) {
        setSelectedRoomId(targetRoom.id);
        setRatePerDay(targetRoom.ratePerDay);
        setNumberOfGuests(Math.min(targetRoom.capacity, 2));
      }
      setCheckInDate(todayStr);
      setCheckOutDate(tomorrowStr);
      setDurationDays(1);
      setExtraCharges(0);
      setDiscount(0);
      setTaxRate(settings?.taxRate || 0);
      setAdvancePaid(targetRoom ? targetRoom.ratePerDay : 0);
      setPaymentMethod('cash');
      setStatus('checked_in');
      setGuestName('');
      setGuestPhone('');
      setGuestIdOrPassport('');
      setGuestAddress('');
      setNotes('');
    }
  }, [isBookingModalOpen, selectedRoomForBooking, rooms, settings]);

  // Update daily rate when room changes
  const handleRoomChange = (roomId: string) => {
    setSelectedRoomId(roomId);
    const r = rooms.find(item => item.id === roomId);
    if (r) {
      setRatePerDay(r.ratePerDay);
      setNumberOfGuests(Math.min(r.capacity, 2));
      // Auto adjust advance recommendation
      const total = r.ratePerDay * durationDays;
      setAdvancePaid(total);
    }
  };

  // Recalculate duration when dates change
  const handleCheckInChange = (date: string) => {
    setCheckInDate(date);
    const start = new Date(date).getTime();
    const end = new Date(checkOutDate).getTime();
    const diff = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    setDurationDays(diff);
  };

  const handleCheckOutChange = (date: string) => {
    setCheckOutDate(date);
    const start = new Date(checkInDate).getTime();
    const end = new Date(date).getTime();
    const diff = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    setDurationDays(diff);
  };

  const handleDurationChange = (days: number) => {
    const val = Math.max(1, days);
    setDurationDays(val);
    const start = new Date(checkInDate);
    start.setDate(start.getDate() + val);
    setCheckOutDate(start.toISOString().split('T')[0]);
  };

  // Computed Totals
  const totalRoomCharge = durationDays * ratePerDay;
  const taxAmount = (totalRoomCharge * taxRate) / 100;
  // The server enforces the same ceiling — this only keeps the UI honest.
  const maxDiscountAllowed = Math.max(0, Number((((totalRoomCharge + extraCharges) * Math.min(maxDiscountPct, 100)) / 100).toFixed(2)));
  const effectiveDiscount = discountsEnabled ? Math.min(discount, maxDiscountAllowed) : 0;
  const grandTotal = Math.max(0, totalRoomCharge + extraCharges + taxAmount - effectiveDiscount);
  const balanceDue = Math.max(0, grandTotal - advancePaid);

  const selectedRoomObj = rooms.find(r => r.id === selectedRoomId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) {
      setErrorMsg('Please select a room to book.');
      return;
    }
    if (!guestName.trim()) {
      setErrorMsg('Please enter guest full name.');
      return;
    }
    if (!guestPhone.trim()) {
      setErrorMsg('Please enter guest contact phone number.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await createRoomBooking({
        roomId: selectedRoomId,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestIdOrPassport: guestIdOrPassport.trim(),
        guestAddress: guestAddress.trim(),
        numberOfGuests,
        checkInDate,
        checkOutDate,
        durationDays,
        ratePerDay,
        extraCharges,
        discount: effectiveDiscount,
        tax: taxAmount,
        advancePaid,
        paymentMethod,
        status,
        notes
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room booking.');
      setIsSubmitting(false);
    }
  };

  if (!isBookingModalOpen) return null;

  return (
    <div id="room-booking-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        id="room-booking-modal-container" 
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <BedDouble className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Room Booking & Check-In
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  Ticket Generation
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Royal Hotel & Restaurant &bull; Issue Instant Thermal Booking Ticket
              </p>
            </div>
          </div>
          <button
            id="close-room-booking-modal-btn"
            onClick={closeRoomBookingModal}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Room Selection & Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Room Selector */}
            <div className="md:col-span-2 bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4 text-emerald-400" />
                Select Room / Suite <span className="text-rose-400">*</span>
              </label>
              <select
                id="booking-room-select"
                value={selectedRoomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500 font-medium text-sm"
                required
              >
                <option value="" disabled>-- Select a Room --</option>
                {rooms.map(room => (
                  <option 
                    key={room.id} 
                    value={room.id}
                    disabled={room.status === 'occupied' && room.id !== selectedRoomForBooking?.id}
                  >
                    Room {room.roomNumber} - {room.roomType} ({room.floor}) &bull; Rs. {room.ratePerDay.toLocaleString()}/day {room.status !== 'available' ? `[${room.status.toUpperCase()}]` : '[AVAILABLE]'}
                  </option>
                ))}
              </select>

              {selectedRoomObj && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono">
                    Max: {selectedRoomObj.capacity} Guests
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 font-mono border border-emerald-800/40">
                    Rate: Rs. {selectedRoomObj.ratePerDay.toLocaleString()} / day
                  </span>
                  {selectedRoomObj.amenities?.map((am, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 bg-slate-800/60 text-slate-400 rounded">
                      {am}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Booking Status Selector */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Initial Status
              </label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  id="status-checkin-btn"
                  onClick={() => setStatus('checked_in')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    status === 'checked_in'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-900/30'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  🟢 Check-In Now
                </button>
                <button
                  type="button"
                  id="status-confirmed-btn"
                  onClick={() => setStatus('confirmed')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    status === 'confirmed'
                      ? 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-900/30'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  🟡 Reserve Only
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {status === 'checked_in' ? 'Guest receives room key immediately (Occupied).' : 'Holds room for scheduled check-in date.'}
              </p>
            </div>
          </div>

          {/* Section 2: Guest Details */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <User className="w-4 h-4 text-emerald-400" />
              Guest Contact & Identification
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Guest Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    id="guest-name-input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Kasun Fernando"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    id="guest-phone-input"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="077 123 4567"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  NIC / Passport Number
                </label>
                <input
                  type="text"
                  id="guest-nic-input"
                  value={guestIdOrPassport}
                  onChange={(e) => setGuestIdOrPassport(e.target.value)}
                  placeholder="199512345678 / N1234567"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  City / Address
                </label>
                <input
                  type="text"
                  id="guest-address-input"
                  value={guestAddress}
                  onChange={(e) => setGuestAddress(e.target.value)}
                  placeholder="Colombo / Kandy"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Number of Guests
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    id="guest-count-input"
                    value={numberOfGuests}
                    onChange={(e) => setNumberOfGuests(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Daily Rate ({currencySymbol})
                  {!canChangeRate && (
                    <span className="ml-1 text-[10px] text-slate-500">(Super Admin only)</span>
                  )}
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="0"
                    id="room-rate-input"
                    value={ratePerDay}
                    disabled={!canChangeRate}
                    title={canChangeRate ? undefined : 'Only a Super Admin can change the room rate'}
                    onChange={(e) => setRatePerDay(Math.max(0, Number(e.target.value)))}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold ${!canChangeRate ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                </div>
                {!canChangeRate && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Locked to the room's tariff — ask a Super Admin for a special rate.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Dates & Duration */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Stay Schedule & Duration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Check-In Date
                </label>
                <input
                  type="date"
                  id="checkin-date-input"
                  value={checkInDate}
                  onChange={(e) => handleCheckInChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Check-Out Date
                </label>
                <input
                  type="date"
                  id="checkout-date-input"
                  value={checkOutDate}
                  min={checkInDate}
                  onChange={(e) => handleCheckOutChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Duration (Nights / Days)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    id="duration-days-input"
                    value={durationDays}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                  <span className="text-xs text-slate-400 shrink-0 font-medium">Night(s)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Billing & Advance Payment */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              Charges & Payment Settlement
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Extra Charges / Bed ({currencySymbol})
                </label>
                <input
                  type="number"
                  min="0"
                  id="extra-charges-input"
                  value={extraCharges}
                  onChange={(e) => setExtraCharges(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Discount ({currencySymbol})
                  {discountsEnabled && (
                    <span className="ml-1 text-[10px] text-slate-500">max {maxDiscountPct}%</span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  max={discountsEnabled ? maxDiscountAllowed : 0}
                  id="room-discount-input"
                  value={discount}
                  disabled={!discountsEnabled}
                  title={discountsEnabled ? `Maximum discount: ${currencySymbol} ${maxDiscountAllowed.toLocaleString()} (${maxDiscountPct}%)` : 'Discounts are disabled in System Settings'}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder={discountsEnabled ? '0' : 'Discounts disabled'}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono text-emerald-400 ${!discountsEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                {discountsEnabled && discount > maxDiscountAllowed ? (
                  <p className="mt-1 text-[10px] text-amber-400">
                    Capped at {currencySymbol} {maxDiscountAllowed.toLocaleString()} ({maxDiscountPct}%).
                  </p>
                ) : !discountsEnabled ? (
                  <p className="mt-1 text-[10px] text-slate-500">Discounts are turned off in System Settings.</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Advance Payment Paid ({currencySymbol})
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max={grandTotal}
                    id="advance-paid-input"
                    value={advancePaid}
                    onChange={(e) => setAdvancePaid(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(grandTotal)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl shrink-0"
                  >
                    Full
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Payment Method
                </label>
                <select
                  id="room-payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="card">💳 Visa / Master Card</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="other">📱 Other / Online</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Special Notes / Guest Requests
                </label>
                <input
                  type="text"
                  id="room-booking-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Extra pillows, Late arrival, Ocean view requested"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="mt-4 p-4 bg-slate-900/90 rounded-xl border border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-center font-mono">
              <div className="p-2 bg-slate-950/60 rounded-lg">
                <div className="text-[11px] text-slate-400 uppercase font-sans">Room Subtotal</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {currencySymbol} {totalRoomCharge.toLocaleString()}
                </div>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg">
                <div className="text-[11px] text-slate-400 uppercase font-sans">Grand Total</div>
                <div className="text-base font-black text-white mt-0.5">
                  {currencySymbol} {grandTotal.toLocaleString()}
                </div>
              </div>
              <div className="p-2 bg-emerald-950/40 border border-emerald-800/40 rounded-lg">
                <div className="text-[11px] text-emerald-400 uppercase font-sans">Advance Received</div>
                <div className="text-base font-black text-emerald-300 mt-0.5">
                  {currencySymbol} {advancePaid.toLocaleString()}
                </div>
              </div>
              <div className="p-2 bg-amber-950/40 border border-amber-800/40 rounded-lg">
                <div className="text-[11px] text-amber-400 uppercase font-sans">Balance Due</div>
                <div className={`text-base font-black mt-0.5 ${balanceDue > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {currencySymbol} {balanceDue.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeRoomBookingModal}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-room-booking-btn"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Generating Ticket...</span>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Confirm & Issue Booking Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
