import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { FunctionBooking, FunctionEventType, FunctionPaymentMethod, FunctionSession } from '../../types.ts';
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
  Sparkles,
  CalendarClock,
  RotateCcw
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

/**
 * The ceilings below are enforced by the server too (validateEventBookingPayload
 * in server.ts). Mirroring them here means the cashier sees the problem while
 * typing instead of after pressing "Confirm", and the printed total can never
 * disagree with the stored total.
 */
const EVENT_LINE_CAP = 10000000;      // hall charge / extra services
const EVENT_PLATE_RATE_CAP = 1000000; // one single plate
const EVENT_MAX_PLATES = 100000;
const EVENT_MAX_LEAD_DAYS = 730;

/** Local calendar day as YYYY-MM-DD — never new Date().toISOString(), which is
 *  a day behind between midnight and 05:30 in a UTC+05:30 hotel. */
const localDayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (base: string, days: number): string => {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
};

/** Two money fields the hall owner always wants to see apart. */
const money = (value: number, symbol: string) =>
  `${symbol} ${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const FunctionBookingModal: React.FC = () => {
  const {
    isFunctionBookingModalOpen,
    closeFunctionBookingModal,
    selectedHallForBooking,
    editingFunctionBooking,
    functionHalls,
    functionBookings,
    settings,
    createFunctionBooking,
    updateFunctionBooking
  } = usePOS();

  // Only a Super Admin may agree to a hall charge other than the hall's rate.
  const { isSuperAdmin } = useAuth();
  const canChangeHallCharge = isSuperAdmin;

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Booking discounts follow the same policy as the POS cart.
  const discountsEnabled = settings?.enableDiscounts !== false;
  const maxDiscountPct = Number(settings?.maxDiscountPercentage ?? 100) || 100;

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
  const [paymentMethod, setPaymentMethod] = useState<FunctionPaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentBank, setPaymentBank] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = !!editingFunctionBooking;
  // A booking that already collected money must not be re-priced below it, and
  // its advance is read-only (the money is in the drawer / bank already).
  const lockedAdvance = Number(editingFunctionBooking?.advancePaid || 0);

  // The form is (re)initialised ONLY on the closed → open transition. Listing
  // functionHalls / settings as dependencies used to re-run this effect on any
  // data refresh while the cashier was still typing — every field (including a
  // half-typed customer name) was wiped mid-booking.
  const wasOpen = useRef<boolean>(false);
  useEffect(() => {
    if (!isFunctionBookingModalOpen) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;

    setErrorMsg(null);
    setIsSubmitting(false);

    if (editingFunctionBooking) {
      const b = editingFunctionBooking;
      setSelectedHallId(b.hallId);
      setEventType(b.eventType);
      setSession(b.session);
      setEventDate(localDayKey(new Date(b.eventDate)));
      setExpectedGuests(Number(b.expectedGuests) || 1);
      setCustomerName(b.customerName || '');
      setCustomerPhone(b.customerPhone || '');
      setCustomerAddress(b.customerAddress || '');
      setHallCharge(Number(b.hallCharge) || 0);
      setPerPlateRate(Number(b.perPlateRate) || 0);
      setNumberOfPlates(Number(b.numberOfPlates) || 0);
      setExtraServices(Number(b.extraServices) || 0);
      setDiscount(Number(b.discount) || 0);
      setTaxRate(Number(settings?.taxRate) || 0);
      setAdvancePaid(Number(b.advancePaid) || 0);
      setPaymentMethod((b.paymentMethod as FunctionPaymentMethod) || 'cash');
      setPaymentReference(String(b.paymentDetails?.reference || ''));
      setPaymentBank(String(b.paymentDetails?.bank || ''));
      setNotes(b.notes || '');
      return;
    }

    const targetHall = selectedHallForBooking || functionHalls.find(h => h.isActive !== false && h.status === 'available');
    if (targetHall) {
      setSelectedHallId(targetHall.id);
      setHallCharge(targetHall.ratePerDay);
      setExpectedGuests(Math.min(targetHall.capacity, 100));
      setAdvancePaid(targetHall.ratePerDay);
    } else {
      setSelectedHallId('');
      setHallCharge(0);
      setExpectedGuests(100);
      setAdvancePaid(0);
    }
    // A week out is the realistic default for a hall booking (the label says so
    // in the hint) — the old comment claimed "tomorrow" while adding 7 days.
    setEventDate(addDays(localDayKey(), 7));
    setEventType('wedding');
    setSession('full_day');
    setPerPlateRate(0);
    setNumberOfPlates(0);
    setExtraServices(0);
    setDiscount(0);
    setTaxRate(Number(settings?.taxRate) || 0);
    setPaymentMethod('cash');
    setPaymentReference('');
    setPaymentBank('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setNotes('');
  }, [isFunctionBookingModalOpen, editingFunctionBooking, selectedHallForBooking, functionHalls, settings]);

  const handleHallChange = (hallId: string) => {
    setSelectedHallId(hallId);
    const h = functionHalls.find(item => item.id === hallId);
    if (h) {
      // Re-pricing on hall switch is only correct for a NEW booking — an edited
      // booking keeps the rate the customer already agreed to.
      if (!isEdit) {
        setHallCharge(h.ratePerDay);
        setAdvancePaid(h.ratePerDay);
      }
      setExpectedGuests(prev => Math.min(prev || 1, h.capacity));
    }
  };

  const selectedHallObj = functionHalls.find(h => h.id === selectedHallId);

  // ---- Computed totals (kept identical to the server's derivation) --------
  const plateRateCapped = Math.min(Math.max(0, perPlateRate || 0), EVENT_PLATE_RATE_CAP);
  const platesCapped = Math.min(Math.max(0, Math.round(numberOfPlates || 0)), EVENT_MAX_PLATES);
  const plateCharge = Number((plateRateCapped * platesCapped).toFixed(2));
  const hallBase = Math.min(Math.max(0, hallCharge || 0), EVENT_LINE_CAP);
  const extraBase = Math.min(Math.max(0, extraServices || 0), EVENT_LINE_CAP);
  const taxableBase = Number((hallBase + plateCharge + extraBase).toFixed(2));
  const taxAmount = Number(((taxableBase * taxRate) / 100).toFixed(2));
  // The server enforces the same ceiling — this only keeps the UI honest.
  const maxDiscountAllowed = Math.max(0, Number(((taxableBase * Math.min(maxDiscountPct, 100)) / 100).toFixed(2)));
  const effectiveDiscount = discountsEnabled ? Math.min(Math.max(0, discount || 0), maxDiscountAllowed) : 0;
  const grandTotal = Number(Math.max(0, taxableBase + taxAmount - effectiveDiscount).toFixed(2));
  const advance = isEdit ? lockedAdvance : Math.min(Math.max(0, advancePaid || 0), grandTotal);
  const balanceDue = Number(Math.max(0, grandTotal - advance).toFixed(2));

  const todayKey = localDayKey();
  const maxDateKey = addDays(todayKey, EVENT_MAX_LEAD_DAYS);

  // ---- Live validation, mirrored 1:1 from the server rules ----------------
  const capacityExceeded = !!selectedHallObj && expectedGuests > selectedHallObj.capacity;
  const phoneDigits = customerPhone.replace(/\D/g, '').length;
  // Mirrors validateEventBookingPayload(): a callable number is always required.
  const isPhoneOk = phoneDigits >= 7;
  const dateTooFar = !!eventDate && eventDate > maxDateKey;
  const dateInPast = !!eventDate && eventDate < todayKey;
  const hallOverCap = hallBase > EVENT_LINE_CAP || extraBase > EVENT_LINE_CAP || plateRateCapped > EVENT_PLATE_RATE_CAP;
  const totalTooBig = grandTotal > EVENT_LINE_CAP * 5;

  // Is the hall already taken on the chosen day? One event per hall per day is
  // a server rule — showing it here (instead of only after pressing Confirm)
  // is what makes the date picker usable when several weddings are on the board.
  const dayClash = useMemo(() => {
    if (!eventDate || !selectedHallId) return null;
    return (
      functionBookings.find(
        b =>
          b.hallId === selectedHallId &&
          b.id !== editingFunctionBooking?.id &&
          (b.status === 'confirmed' || b.status === 'completed') &&
          String(b.eventDate || '').slice(0, 10) === eventDate
      ) || null
    );
  }, [functionBookings, eventDate, selectedHallId, editingFunctionBooking]);

  // Remaining free days for this hall, so the cashier can offer a date that
  // actually works instead of guessing.
  const hallBookedDays = useMemo(() => {
    const map = new Map<string, FunctionBooking>();
    for (const b of functionBookings) {
      if (b.hallId !== selectedHallId) continue;
      if (b.status === 'cancelled') continue;
      const key = String(b.eventDate || '').slice(0, 10);
      if (key >= todayKey && !map.has(key)) map.set(key, b);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
  }, [functionBookings, selectedHallId, todayKey]);

  const canSubmit =
    !!selectedHallId &&
    !dateInPast &&
    !dateTooFar &&
    !capacityExceeded &&
    !hallOverCap &&
    !totalTooBig &&
    customerName.trim().length >= 2 &&
    isPhoneOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedHallId) {
      setErrorMsg('Please select a function hall to book.');
      return;
    }
    if (customerName.trim().length < 2) {
      setErrorMsg('Please enter the customer full name.');
      return;
    }
    if (!isPhoneOk) {
      setErrorMsg('Please enter a valid customer phone number (at least 7 digits).');
      return;
    }
    if (!eventDate) {
      setErrorMsg('Please choose the event date.');
      return;
    }
    if (dateInPast) {
      setErrorMsg(`The event date (${eventDate}) is in the past. Choose today or a future date.`);
      return;
    }
    if (dateTooFar) {
      setErrorMsg(`Events can be booked up to ${EVENT_MAX_LEAD_DAYS} days ahead (${maxDateKey}). Please check the year.`);
      return;
    }
    if (capacityExceeded && selectedHallObj) {
      setErrorMsg(`"${selectedHallObj.hallName}" holds a maximum of ${selectedHallObj.capacity} guests — the event expects ${expectedGuests}.`);
      return;
    }
    if (hallOverCap) {
      setErrorMsg(`One line exceeds the allowed ceiling (${currencySymbol} ${EVENT_LINE_CAP.toLocaleString()} for a charge, ${currencySymbol} ${EVENT_PLATE_RATE_CAP.toLocaleString()} per plate).`);
      return;
    }
    if (dayClash) {
      setErrorMsg(`"${selectedHallObj?.hallName || 'The hall'}" is already booked on ${eventDate} (${dayClash.bookingNumber} — ${dayClash.customerName}). Pick another date.`);
      return;
    }
    if (advancePaid > grandTotal) {
      setErrorMsg('Advance payment cannot exceed the grand total.');
      return;
    }

    const payload: Record<string, unknown> = {
      hallId: selectedHallId,
      eventType,
      session,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      eventDate,
      expectedGuests,
      hallCharge: hallBase,
      perPlateRate: plateRateCapped,
      numberOfPlates: platesCapped,
      extraServices: extraBase,
      discount: effectiveDiscount,
      tax: taxAmount,
      paymentMethod,
      paymentDetails:
        paymentReference.trim() || paymentBank.trim()
          ? { reference: paymentReference.trim(), bank: paymentBank.trim() }
          : undefined,
      notes
    };
    // The advance of an existing booking is never re-sent: money already
    // received is settled through "Record Payment" / "Complete Event".
    if (!isEdit) payload.advancePaid = advancePaid;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      if (isEdit && editingFunctionBooking) {
        await updateFunctionBooking(editingFunctionBooking.id, payload);
        closeFunctionBookingModal();
      } else {
        await createFunctionBooking(payload);
      }
    } catch (err: any) {
      setErrorMsg(err.message || (isEdit ? 'Failed to update the event booking.' : 'Failed to create function booking.'));
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
              {isEdit ? <CalendarClock className="w-6 h-6" /> : <PartyPopper className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                {isEdit ? `Edit Event Booking ${editingFunctionBooking?.bookingNumber}` : 'Function / Event Booking'}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold border border-violet-500/30">
                  {isEdit ? 'Reschedule / Correct' : 'Hall Reservation'}
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
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div id="function-booking-error" className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isEdit && (
          <div className="mx-6 mt-4 p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl text-[11px] text-sky-200 leading-relaxed">
            Editing keeps the ticket number <strong>{editingFunctionBooking?.bookingNumber}</strong> and the{' '}
            <strong>{money(lockedAdvance, currencySymbol)}</strong> advance already received. The advance itself is
            settled with <em>Payment</em> / <em>Complete Event</em> on the Functions board.
            {!canChangeHallCharge && ' Charges can only be re-priced by a Super Admin.'}
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
                disabled={isEdit}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-violet-500 font-medium text-sm disabled:opacity-60"
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

              {isEdit && (
                <p className="text-[10px] text-slate-500">
                  Moving the event to a different hall means cancelling this booking and taking a new one — the hall
                  on the ticket is fixed.
                </p>
              )}

              {selectedHallObj && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-mono ${capacityExceeded ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60' : 'bg-slate-800 text-slate-300'}`}>
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

              {/* Availability of the selected hall */}
              {selectedHallObj && hallBookedDays.length > 0 && (
                <div className="pt-1 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Already held on {selectedHallObj.hallName}:</span>{' '}
                  {hallBookedDays.map(([day, b]) => (
                    <span
                      key={day}
                      className={`inline-block ml-1 mt-1 px-1.5 py-0.5 rounded border font-mono ${
                        day === eventDate
                          ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                          : 'bg-slate-800/70 text-slate-400 border-slate-700'
                      }`}
                      title={`${b.bookingNumber} — ${b.customerName} (${b.session.replace('_', ' ')})`}
                    >
                      {day}
                    </span>
                  ))}
                </div>
              )}
              {dayClash && (
                <div id="function-date-clash-warning" className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[11px] text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    One event per hall per day. <strong>{eventDate}</strong> is already taken by{' '}
                    <strong>{dayClash.bookingNumber}</strong> ({dayClash.customerName}) — the server will reject this.
                  </span>
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
                min={todayKey}
                max={maxDateKey}
                onChange={(e) => setEventDate(e.target.value)}
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none font-mono ${
                  dateInPast || dateTooFar ? 'border-rose-600 focus:border-rose-500' : 'border-slate-700 focus:border-violet-500'
                }`}
                required
              />
              {dateInPast ? (
                <p className="text-[10px] text-rose-300">The event date is in the past — pick today or later.</p>
              ) : dateTooFar ? (
                <p className="text-[10px] text-rose-300">
                  Too far ahead ({EVENT_MAX_LEAD_DAYS} days max, i.e. {maxDateKey}). Please check the year.
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">Defaults to one week ahead. Today or later only.</p>
              )}
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
              <p className="text-[10px] text-slate-500">
                The session is printed on the ticket for the kitchen &amp; security. A hall still only takes{' '}
                <strong>one event per calendar day</strong>.
              </p>
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
                    maxLength={128}
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
                    type="tel"
                    inputMode="tel"
                    id="function-customer-phone-input"
                    value={customerPhone}
                    maxLength={32}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="077 123 4567"
                    className={`w-full bg-slate-900 border rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none font-mono ${
                      !isPhoneOk ? 'border-rose-600 focus:border-rose-500' : 'border-slate-700 focus:border-violet-500'
                    }`}
                    required
                  />
                </div>
                <p className={`mt-1 text-[10px] ${isPhoneOk ? 'text-slate-500' : 'text-rose-300'}`}>
                  {isPhoneOk
                    ? 'Booked on the ticket — the customer is called to confirm.'
                    : 'At least 7 digits are required.'}
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  City / Address
                </label>
                <input
                  type="text"
                  id="function-customer-address-input"
                  value={customerAddress}
                  maxLength={500}
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
                  {!canChangeHallCharge && (
                    <span className="ml-1 text-[10px] text-slate-500">(Super Admin only)</span>
                  )}
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="0"
                    max={EVENT_LINE_CAP}
                    step="100"
                    id="function-hall-charge-input"
                    value={hallCharge}
                    disabled={!canChangeHallCharge}
                    title={canChangeHallCharge ? undefined : 'Only a Super Admin can change the hall charge'}
                    onChange={(e) => setHallCharge(Math.max(0, Number(e.target.value)))}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono font-bold ${!canChangeHallCharge ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                </div>
                {canChangeHallCharge && selectedHallObj && hallCharge !== selectedHallObj.ratePerDay ? (
                  <button
                    type="button"
                    id="function-hall-charge-reset-btn"
                    onClick={() => { setHallCharge(selectedHallObj.ratePerDay); if (!isEdit) setAdvancePaid(selectedHallObj.ratePerDay); }}
                    className="mt-1 text-[10px] text-amber-300 hover:text-amber-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Special rate — click to restore {currencySymbol} {selectedHallObj.ratePerDay.toLocaleString()}
                  </button>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-500">
                    {canChangeHallCharge
                      ? "Locked to the hall's rate — change it for a special quote."
                      : "Locked to the hall's rate — ask a Super Admin for a special charge."}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Expected Guests
                  {selectedHallObj && <span className="ml-1 text-[10px] text-slate-500">max {selectedHallObj.capacity}</span>}
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="number"
                    min="1"
                    max={selectedHallObj?.capacity || EVENT_MAX_PLATES}
                    id="function-expected-guests-input"
                    value={expectedGuests}
                    onChange={(e) => setExpectedGuests(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    className={`w-full bg-slate-900 border rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none font-mono ${
                      capacityExceeded ? 'border-rose-600 focus:border-rose-500' : 'border-slate-700 focus:border-violet-500'
                    }`}
                  />
                </div>
                {capacityExceeded && selectedHallObj ? (
                  <p className="mt-1 text-[10px] text-rose-300">
                    {selectedHallObj.hallName} seats {selectedHallObj.capacity} — the booking is rejected until this fits.
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-500">Drives the hall capacity check, not the price.</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Extra Services / Decor ({currencySymbol})
                </label>
                <input
                  type="number"
                  min="0"
                  max={EVENT_LINE_CAP}
                  step="100"
                  id="function-extra-services-input"
                  value={extraServices}
                  onChange={(e) => setExtraServices(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">Stage, decor, AV — added to the taxable base.</p>
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
                    max={EVENT_PLATE_RATE_CAP}
                    step="10"
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
                  {selectedHallObj && <span className="ml-1 text-[10px] text-slate-500">≈ guests</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  max={EVENT_MAX_PLATES}
                  id="function-plates-input"
                  value={numberOfPlates}
                  onChange={(e) => setNumberOfPlates(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
                {platesCapped > 0 && expectedGuests > 0 && platesCapped < expectedGuests && (
                  <p className="mt-1 text-[10px] text-amber-400">
                    Fewer plates than guests ({platesCapped} / {expectedGuests}) — the kitchen plans on this number.
                  </p>
                )}
                {platesCapped === 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">0 = hall only, no catering billed here.</p>
                )}
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
                  id="function-discount-input"
                  value={discount}
                  disabled={!discountsEnabled}
                  title={discountsEnabled ? `Maximum discount: ${currencySymbol} ${maxDiscountAllowed.toLocaleString()} (${maxDiscountPct}%)` : 'Discounts are disabled in System Settings'}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder={discountsEnabled ? '0' : 'Discounts disabled'}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono text-emerald-400 ${!discountsEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                    id="function-advance-paid-input"
                    value={advance}
                    disabled={isEdit}
                    title={isEdit ? 'Money already received cannot be edited here — use Record Payment / Complete Event.' : undefined}
                    onChange={(e) => setAdvancePaid(Math.max(0, Number(e.target.value)))}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono font-bold ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={() => setAdvancePaid(grandTotal)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl shrink-0"
                    >
                      Full
                    </button>
                  )}
                </div>
                {advance > 0 && advance < grandTotal && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Deposit received; {money(balanceDue, currencySymbol)} stays outstanding until the event.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Payment Method
                </label>
                <select
                  id="function-payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as FunctionPaymentMethod)}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="card">💳 Visa / Master Card</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="other">📱 Other / Online</option>
                </select>
              </div>

              {(paymentMethod === 'bank_transfer' || paymentMethod === 'card' || paymentReference || paymentBank) && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Deposit slip / reference no.</label>
                    <input
                      type="text"
                      id="function-payment-reference-input"
                      value={paymentReference}
                      maxLength={64}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. BOC-SLIP-88213 / card auth 4412"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bank / card issuer (optional)</label>
                    <input
                      type="text"
                      id="function-payment-bank-input"
                      value={paymentBank}
                      maxLength={64}
                      onChange={(e) => setPaymentBank(e.target.value)}
                      placeholder="e.g. Bank of Ceylon — Negombo BR"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 font-mono"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Special Notes / Requests
                </label>
                <input
                  type="text"
                  id="function-notes-input"
                  value={notes}
                  maxLength={1000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Flower decorations, Sound system required, Stage arrangement"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="mt-4 p-4 bg-slate-900/90 rounded-xl border border-slate-700 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center font-mono text-[11px]">
                <div className="p-2 bg-slate-950/60 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Hall</div>
                  <div className="font-bold text-white mt-0.5">{money(hallBase, currencySymbol)}</div>
                </div>
                <div className="p-2 bg-slate-950/60 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">
                    Catering ({platesCapped} × {money(plateRateCapped, currencySymbol)})
                  </div>
                  <div className="font-bold text-white mt-0.5">{money(plateCharge, currencySymbol)}</div>
                </div>
                <div className="p-2 bg-slate-950/60 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Extra + Tax ({taxRate}%)</div>
                  <div className="font-bold text-white mt-0.5">
                    {money(extraBase, currencySymbol)} + {money(taxAmount, currencySymbol)}
                  </div>
                </div>
                <div className="p-2 bg-slate-950/60 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Discount</div>
                  <div className="font-bold text-emerald-400 mt-0.5">-{money(effectiveDiscount, currencySymbol)}</div>
                </div>
                <div className="p-2 bg-slate-950/60 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Balance Due</div>
                  <div className={`font-bold mt-0.5 ${balanceDue > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {money(balanceDue, currencySymbol)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center font-mono">
                <div className="p-2 bg-violet-950/40 border border-violet-800/40 rounded-lg">
                  <div className="text-[11px] text-violet-400 uppercase font-sans">Advance Received</div>
                  <div className="text-base font-black text-violet-300 mt-0.5">{money(advance, currencySymbol)}</div>
                </div>
                <div className="p-2 bg-slate-950/60 border border-slate-700 rounded-lg">
                  <div className="text-[11px] text-slate-400 uppercase font-sans">Grand Total</div>
                  <div className={`text-base font-black mt-0.5 ${totalTooBig ? 'text-rose-400' : 'text-white'}`}>
                    {money(grandTotal, currencySymbol)}
                  </div>
                </div>
              </div>
              {totalTooBig && (
                <p className="text-[10px] text-rose-300">
                  This total is above the per-event ceiling the server accepts — re-check the plate rate and plate count.
                </p>
              )}
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
              disabled={isSubmitting || !canSubmit || !!dayClash}
              title={!canSubmit ? 'Fix the highlighted fields first' : dayClash ? 'This hall is already booked on that date' : undefined}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>{isEdit ? 'Saving Booking...' : 'Generating Ticket...'}</span>
              ) : (
                <>
                  {isEdit ? <CalendarClock className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  <span>{isEdit ? 'Save Booking Changes' : 'Confirm & Issue Booking Ticket'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
