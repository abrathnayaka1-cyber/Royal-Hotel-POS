import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { FunctionEventType, FunctionSession } from '../../types.ts';
import {
  PartyPopper,
  Calendar,
  User,
  Phone,
  CreditCard,
  X,
  AlertCircle,
  FileText,
  DollarSign,
  Users,
  Building,
  UtensilsCrossed,
  Clock,
  Sparkles
} from 'lucide-react';

const EVENT_TYPES: { type: FunctionEventType; label: string; emoji: string }[] = [
  { type: 'wedding', label: 'Wedding', emoji: '💍' },
  { type: 'birthday', label: 'Birthday', emoji: '🎂' },
  { type: 'meeting', label: 'Meeting', emoji: '💼' },
  { type: 'party', label: 'Party', emoji: '🎉' },
  { type: 'corporate', label: 'Corporate', emoji: '🏢' },
  { type: 'other', label: 'Other', emoji: '✨' },
];

const SESSIONS: { type: FunctionSession; label: string }[] = [
  { type: 'day', label: '☀️ Day (9 AM - 5 PM)' },
  { type: 'evening', label: '🌙 Evening (6 PM - 12 AM)' },
  { type: 'full_day', label: '🌗 Full Day' },
];

export const FunctionBookingModal: React.FC = () => {
  const {
    isFunctionBookingModalOpen,
    closeFunctionBookingModal,
    selectedHallForBooking,
    functionHalls,
    settings,
    createFunctionBooking
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Form State
  const [selectedHallId, setSelectedHallId] = useState<string>('');
  const [eventType, setEventType] = useState<FunctionEventType>('wedding');
  const [session, setSession] = useState<FunctionSession>('full_day');
  const [eventDate, setEventDate] = useState<string>('');
  const [expectedGuests, setExpectedGuests] = useState<number>(100);

  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');

  // Pricing
  const [hallCharge, setHallCharge] = useState<number>(0);
  const [perPlateRate, setPerPlateRate] = useState<number>(0);
  const [numberOfPlates, setNumberOfPlates] = useState<number>(0);
  const [extraServices, setExtraServices] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (isFunctionBookingModalOpen) {
      setErrorMsg(null);
      const targetHall = selectedHallForBooking || functionHalls.find(h => h.isActive && h.status === 'available');
      if (targetHall) {
        setSelectedHallId(targetHall.id);
        setHallCharge(targetHall.ratePerDay);
        setExpectedGuests(Math.min(targetHall.capacity, 100));
      } else {
        setSelectedHallId('');
        setHallCharge(0);
        setExpectedGuests(100);
      }
      const tomorrow = new Date(Date.now() + 7 * 86400000);
      setEventDate(tomorrow.toISOString().split('T')[0]);
      setEventType('wedding');
      setSession('full_day');
      setPerPlateRate(0);
      setNumberOfPlates(0);
      setExtraServices(0);
      setDiscount(0);
      setTaxRate(settings?.taxRate || 0);
      setAdvancePaid(targetHall ? targetHall.ratePerDay : 0);
      setPaymentMethod('cash');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setNotes('');
    }
  }, [isFunctionBookingModalOpen, selectedHallForBooking, functionHalls, settings]);

  const handleHallChange = (hallId: string) => {
    setSelectedHallId(hallId);
    const h = functionHalls.find(item => item.id === hallId);
    if (h) {
      setHallCharge(h.ratePerDay);
      setExpectedGuests(Math.min(h.capacity, 100));
      setAdvancePaid(h.ratePerDay);
    }
  };

  // Computed Totals
  const plateCharge = perPlateRate * numberOfPlates;
  const taxAmount = ((hallCharge + plateCharge + extraServices) * taxRate) / 100;
  const grandTotal = Math.max(0, hallCharge + plateCharge + extraServices + taxAmount - discount);
  const balanceDue = Math.max(0, grandTotal - advancePaid);

  const selectedHallObj = functionHalls.find(h => h.id === selectedHallId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHallId) {
      setErrorMsg('Please select a function hall to book.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Please enter the customer full name.');
      return;
    }
    if (!customerPhone.trim()) {
      setErrorMsg('Please enter the customer contact phone number.');
      return;
    }
    if (!eventDate) {
      setErrorMsg('Please choose the event date.');
      return;
    }
    if (advancePaid > grandTotal) {
      setErrorMsg('Advance payment cannot exceed the grand total.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await createFunctionBooking({
        hallId: selectedHallId,
        eventType,
        session,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        eventDate,
        expectedGuests,
        hallCharge,
        perPlateRate,
        numberOfPlates,
        extraServices,
        discount,
        tax: taxAmount,
        advancePaid,
        paymentMethod,
        notes
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create function booking.');
      setIsSubmitting(false);
    }
  };

  if (!isFunctionBookingModalOpen) return null;

  return (
    <div id="function-booking-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        id="function-booking-modal-container"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
              <PartyPopper className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Function / Event Booking
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold border border-violet-500/30">
                  Hall Reservation
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Royal Hotel & Restaurant &bull; Weddings, Parties, Meetings &amp; Corporate Events
              </p>
            </div>
          </div>
          <button
            id="close-function-booking-modal-btn"
            onClick={closeFunctionBookingModal}
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
          {/* Section 1: Hall Selection & Event Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Hall Selector */}
            <div className="md:col-span-2 bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4 text-violet-400" />
                Select Function Hall <span className="text-rose-400">*</span>
              </label>
              <select
                id="function-hall-select"
                value={selectedHallId}
                onChange={(e) => handleHallChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500 font-medium text-sm"
                required
              >
                <option value="" disabled>-- Select a Function Hall --</option>
                {functionHalls.map(hall => (
                  <option
                    key={hall.id}
                    value={hall.id}
                    disabled={!hall.isActive || hall.status === 'maintenance'}
                  >
                    {hall.hallName} - {hall.hallType} &bull; {currencySymbol} {hall.ratePerDay.toLocaleString()}/booking
                    {(!hall.isActive || hall.status === 'maintenance') ? ' [UNAVAILABLE]' : ' [AVAILABLE]'}
                  </option>
                ))}
              </select>

              {selectedHallObj && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono">
                    Max: {selectedHallObj.capacity} Guests
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-violet-950/60 text-violet-300 font-mono border border-violet-800/40">
                    Rate: {currencySymbol} {selectedHallObj.ratePerDay.toLocaleString()} / booking
                  </span>
                  {selectedHallObj.amenities?.slice(0, 4).map((am, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 bg-slate-800/60 text-slate-400 rounded">
                      {am}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Event Date & Session */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-400" />
                Event Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                id="function-event-date-input"
                value={eventDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                required
              />
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 pt-1">
                <Clock className="w-4 h-4 text-violet-400" />
                Session
              </label>
              <select
                id="function-session-select"
                value={session}
                onChange={(e) => setSession(e.target.value as FunctionSession)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
              >
                {SESSIONS.map(s => (
                  <option key={s.type} value={s.type}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: Event Type */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Event Type
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {EVENT_TYPES.map(et => (
                <button
                  key={et.type}
                  type="button"
                  id={`function-event-type-${et.type}`}
                  onClick={() => setEventType(et.type)}
                  className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    eventType === et.type
                      ? 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-900/30'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span className="block text-base mb-0.5">{et.emoji}</span>
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Customer Details */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <User className="w-4 h-4 text-violet-400" />
              Customer Contact Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Customer Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    id="function-customer-name-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Kasun Fernando"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
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
                    id="function-customer-phone-input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="077 123 4567"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  City / Address
                </label>
                <input
                  type="text"
                  id="function-customer-address-input"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Colombo / Kandy"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Charges & Payment */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <CreditCard className="w-4 h-4 text-violet-400" />
              Charges &amp; Advance Payment
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Hall Charge ({currencySymbol})
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="0"
                    id="function-hall-charge-input"
                    value={hallCharge}
                    onChange={(e) => setHallCharge(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Expected Guests
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="1"
                    id="function-expected-guests-input"
                    value={expectedGuests}
                    onChange={(e) => setExpectedGuests(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Extra Services / Decor ({currencySymbol})
                </label>
                <input
                  type="number"
                  min="0"
                  id="function-extra-services-input"
                  value={extraServices}
                  onChange={(e) => setExtraServices(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Per-Plate Rate ({currencySymbol})
                </label>
                <div className="relative">
                  <UtensilsCrossed className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="0"
                    id="function-per-plate-rate-input"
                    value={perPlateRate}
                    onChange={(e) => setPerPlateRate(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Number of Plates
                </label>
                <input
                  type="number"
                  min="0"
                  id="function-plates-input"
                  value={numberOfPlates}
                  onChange={(e) => setNumberOfPlates(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Discount ({currencySymbol})
                </label>
                <input
                  type="number"
                  min="0"
                  id="function-discount-input"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono text-emerald-400"
                />
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
                    id="function-advance-paid-input"
                    value={advancePaid}
                    onChange={(e) => setAdvancePaid(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono font-bold"
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
                  id="function-payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="card">💳 Visa / Master Card</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="other">📱 Other / Online</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Special Notes / Requests
                </label>
                <input
                  type="text"
                  id="function-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Flower decorations, Sound system required, Stage arrangement"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="mt-4 p-4 bg-slate-900/90 rounded-xl border border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-center font-mono">
              <div className="p-2 bg-slate-950/60 rounded-lg">
                <div className="text-[11px] text-slate-400 uppercase font-sans">Hall + Plates</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {currencySymbol} {(hallCharge + plateCharge).toLocaleString()}
                </div>
              </div>
              <div className="p-2 bg-slate-950/60 rounded-lg">
                <div className="text-[11px] text-slate-400 uppercase font-sans">Grand Total</div>
                <div className="text-base font-black text-white mt-0.5">
                  {currencySymbol} {grandTotal.toLocaleString()}
                </div>
              </div>
              <div className="p-2 bg-violet-950/40 border border-violet-800/40 rounded-lg">
                <div className="text-[11px] text-violet-400 uppercase font-sans">Advance Received</div>
                <div className="text-base font-black text-violet-300 mt-0.5">
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
              onClick={closeFunctionBookingModal}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-function-booking-btn"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Generating Ticket...</span>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Confirm &amp; Issue Booking Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
