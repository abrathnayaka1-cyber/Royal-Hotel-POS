import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { FunctionBooking, FunctionHall } from '../../types.ts';
import {
  PartyPopper,
  Calendar,
  User,
  Phone,
  CheckCircle2,
  Clock,
  Sparkles,
  Wrench,
  Printer,
  Plus,
  Search,
  RefreshCw,
  Users,
  DollarSign,
  Building,
  X,
  AlertCircle,
  Ban,
  Wallet,
  CreditCard
} from 'lucide-react';

export const FunctionsView: React.FC = () => {
  const {
    functionHalls,
    functionBookings,
    settings,
    openFunctionBookingModal,
    openFunctionTicketModal,
    addFunctionPayment,
    completeFunctionBooking,
    cancelFunctionBooking,
    refreshFunctionHalls,
    refreshFunctionBookings
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bookingsFilter, setBookingsFilter] = useState<'upcoming' | 'completed' | 'cancelled' | 'all'>('upcoming');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Settlement modal state (payment / completion / cancellation)
  const [settleBooking, setSettleBooking] = useState<FunctionBooking | null>(null);
  const [settleMode, setSettleMode] = useState<'payment' | 'complete' | 'cancel'>('payment');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleAdditional, setSettleAdditional] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [settleError, setSettleError] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState<boolean>(false);

  const today = new Date().toISOString().split('T')[0];
  const availableHalls = functionHalls.filter(h => h.isActive);
  const upcomingBookings = functionBookings.filter(b => b.status === 'confirmed');
  const todaysEvents = upcomingBookings.filter(b => (b.eventDate || '').split('T')[0] === today);

  const filteredHalls = functionHalls.filter(hall => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      hall.hallName.toLowerCase().includes(q) ||
      hall.hallType.toLowerCase().includes(q) ||
      (hall.floor || '').toLowerCase().includes(q)
    );
  });

  const filteredBookings = functionBookings.filter(b => {
    if (bookingsFilter === 'upcoming') return b.status === 'confirmed';
    if (bookingsFilter === 'completed') return b.status === 'completed';
    if (bookingsFilter === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshFunctionHalls(), refreshFunctionBookings()]);
    setIsRefreshing(false);
  };

  const openSettlement = (booking: FunctionBooking, mode: 'payment' | 'complete' | 'cancel') => {
    setSettleBooking(booking);
    setSettleMode(mode);
    setSettleAmount(booking.balanceDue);
    setSettleAdditional(0);
    setSettleMethod(booking.paymentMethod === 'split' ? 'cash' : (booking.paymentMethod as any) || 'cash');
    setSettleNotes('');
    setSettleError(null);
  };

  const closeSettlement = () => {
    setSettleBooking(null);
    setSettleError(null);
    setIsSettling(false);
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleBooking) return;
    try {
      setIsSettling(true);
      setSettleError(null);

      if (settleMode === 'payment') {
        await addFunctionPayment(settleBooking.id, {
          amount: settleAmount,
          paymentMethod: settleMethod,
          notes: settleNotes,
        });
      } else if (settleMode === 'complete') {
        await completeFunctionBooking(settleBooking.id, {
          additionalCharges: settleAdditional,
          finalPaymentAmount: settleAmount,
          paymentMethod: settleMethod,
          notes: settleNotes,
        });
      } else {
        await cancelFunctionBooking(settleBooking.id, settleNotes);
      }
      closeSettlement();
    } catch (err: any) {
      setSettleError(err.message || 'Action failed. Please try again.');
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status: FunctionBooking['status']) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Confirmed
          </span>
        );
      case 'completed':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
            <Ban className="w-3 h-3 text-rose-400" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const formatEventDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <div id="pos-functions-view-container" className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 p-4 space-y-4">
      {/* Top Header Bar & Stats */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
            <PartyPopper className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Hotel Functions &amp; Events
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
                {availableHalls.length} Halls
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Royal Hotel &amp; Restaurant &bull; Weddings, Parties, Meetings &amp; Corporate Event Bookings
            </p>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-slate-900 text-slate-300 border-slate-800">
            📅 Upcoming Events: {upcomingBookings.length}
          </div>
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-amber-950/40 text-amber-300 border-amber-900/40">
            ⭐ Today: {todaysEvents.length}
          </div>
          <div className="flex items-center gap-2 pl-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Refresh Functions & Bookings"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="new-function-booking-btn"
              onClick={() => openFunctionBookingModal(null)}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-violet-900/30 flex items-center gap-1.5 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Event Booking</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hall Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-violet-400" />
            Function Halls
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHalls.length === 0 ? (
              <div className="col-span-full h-40 flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
                <PartyPopper className="w-10 h-10 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-slate-300">No function halls found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Try adjusting your search, or add function halls in the Admin panel (Functions &amp; Events).
                </p>
              </div>
            ) : (
              filteredHalls.map(hall => {
                const isMaintenance = hall.status === 'maintenance' || !hall.isActive;
                const hallUpcoming = upcomingBookings.filter(b => b.hallId === hall.id);
                return (
                  <div
                    key={hall.id}
                    id={`function-hall-card-${hall.id}`}
                    className={`relative rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-lg ${
                      isMaintenance
                        ? 'bg-gradient-to-b from-amber-950/20 to-slate-900/90 border-amber-800/40 hover:border-amber-700'
                        : 'bg-gradient-to-b from-violet-950/20 to-slate-900/90 border-violet-800/40 hover:border-violet-700'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="p-4 border-b border-slate-800/80">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-black text-white tracking-tight">
                            {hall.hallName}
                          </h3>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                            {hall.hallType}{hall.floor ? ` • ${hall.floor}` : ''}
                          </span>
                        </div>
                        {isMaintenance ? (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                            <Wrench className="w-3 h-3 text-amber-400" />
                            Maintenance
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Available
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                        <div className="flex items-center gap-1 font-mono">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>Up to {hall.capacity} Guests</span>
                        </div>
                        <div className="font-mono font-bold text-violet-400 text-sm">
                          {currencySymbol} {hall.ratePerDay.toLocaleString()}<span className="text-[10px] text-slate-400 font-normal">/booking</span>
                        </div>
                      </div>

                      {/* Amenities chips */}
                      {hall.amenities && hall.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {hall.amenities.slice(0, 3).map((am, idx) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
                              {am}
                            </span>
                          ))}
                          {hall.amenities.length > 3 && (
                            <span className="text-[10px] px-1 py-0.5 text-slate-500">
                              +{hall.amenities.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {hallUpcoming.length > 0 && (
                        <div className="mt-2.5 text-[11px] bg-violet-950/40 border border-violet-900/40 rounded-lg px-2.5 py-1.5 text-violet-300 font-mono">
                          {hallUpcoming.length} upcoming event{hallUpcoming.length > 1 ? 's' : ''}:{' '}
                          {hallUpcoming.slice(0, 2).map(b => formatEventDate(b.eventDate)).join(', ')}
                          {hallUpcoming.length > 2 ? '…' : ''}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="p-3 bg-slate-950/40 flex items-center justify-end gap-2">
                      <button
                        id={`book-function-hall-${hall.id}-btn`}
                        onClick={() => openFunctionBookingModal(hall)}
                        disabled={isMaintenance}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-900/30 flex items-center gap-1 transition-all active:scale-95 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Book Event</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bookings List */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-400" />
              Event Bookings ({filteredBookings.length})
            </h2>
            <div className="flex items-center gap-1">
              {([
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'completed', label: 'Completed' },
                { id: 'cancelled', label: 'Cancelled' },
                { id: 'all', label: 'All' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setBookingsFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    bookingsFilter === f.id ? 'bg-violet-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
              <Calendar className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-300">No {bookingsFilter} bookings</h3>
              <p className="text-xs text-slate-500 mt-1">
                {bookingsFilter === 'upcoming'
                  ? 'Book the first event using the "New Event Booking" button above.'
                  : 'Nothing to show for this filter yet.'}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/80">
                <div className="col-span-2">Event</div>
                <div className="col-span-2">Customer</div>
                <div className="col-span-2">Hall &amp; Date</div>
                <div className="col-span-2 text-right">Total / Advance</div>
                <div className="col-span-1 text-right">Balance</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {filteredBookings.map(booking => (
                <div
                  key={booking.id}
                  id={`function-booking-row-${booking.bookingNumber}`}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-800/60 last:border-b-0 items-center hover:bg-slate-800/30 transition-colors"
                >
                  <div className="md:col-span-2">
                    <div className="font-bold text-white text-sm">{booking.eventType.replace('_', ' ').toUpperCase()}</div>
                    <div className="text-[10px] text-violet-400 font-mono">#{booking.bookingNumber}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      {booking.customerName}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />
                      {booking.customerPhone}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm font-semibold text-violet-300">{booking.hallName}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {formatEventDate(booking.eventDate)}
                    </div>
                    <div className="text-[10px] text-slate-600">{booking.expectedGuests} guests</div>
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    <div className="text-sm font-bold text-white font-mono">
                      {currencySymbol} {booking.grandTotal.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono">
                      Advance: {currencySymbol} {booking.advancePaid.toLocaleString()}
                    </div>
                  </div>
                  <div className="md:col-span-1 md:text-right">
                    <span className={`text-sm font-black font-mono ${booking.balanceDue > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {currencySymbol} {booking.balanceDue.toLocaleString()}
                    </span>
                  </div>
                  <div className="md:col-span-1 flex md:justify-center">
                    {getStatusBadge(booking.status)}
                  </div>
                  <div className="md:col-span-2 flex items-center gap-1.5 md:justify-end flex-wrap">
                    <button
                      id={`print-function-booking-${booking.bookingNumber}-btn`}
                      onClick={() => openFunctionTicketModal(booking)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700"
                      title="View & Print Booking Ticket"
                    >
                      <Printer className="w-4 h-4 text-violet-400" />
                    </button>
                    {booking.status === 'confirmed' && (
                      <>
                        <button
                          id={`pay-function-booking-${booking.bookingNumber}-btn`}
                          onClick={() => openSettlement(booking, 'payment')}
                          className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Payment
                        </button>
                        <button
                          id={`complete-function-booking-${booking.bookingNumber}-btn`}
                          onClick={() => openSettlement(booking, 'complete')}
                          className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </button>
                        <button
                          id={`cancel-function-booking-${booking.bookingNumber}-btn`}
                          onClick={() => openSettlement(booking, 'cancel')}
                          className="px-2.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settlement Modal (Payment / Complete / Cancel) */}
      {settleBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${
                  settleMode === 'payment'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : settleMode === 'complete'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {settleMode === 'payment' ? <Wallet className="w-5 h-5" /> : settleMode === 'complete' ? <CheckCircle2 className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {settleMode === 'payment' ? 'Record Payment' : settleMode === 'complete' ? 'Complete Event' : 'Cancel Booking'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">#{settleBooking.bookingNumber} • {settleBooking.customerName}</p>
                </div>
              </div>
              <button onClick={closeSettlement} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {settleError && (
              <div className="mx-5 mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{settleError}</span>
              </div>
            )}

            <form onSubmit={handleSettleSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 grid grid-cols-2 gap-2 text-center font-mono text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Grand Total</div>
                  <div className="font-bold text-white">{currencySymbol} {settleBooking.grandTotal.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Balance Due</div>
                  <div className="font-bold text-amber-400">{currencySymbol} {settleBooking.balanceDue.toLocaleString()}</div>
                </div>
              </div>

              {settleMode === 'complete' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Additional Charges ({currencySymbol})</label>
                  <input
                    type="number"
                    min="0"
                    id="function-settle-additional-input"
                    value={settleAdditional}
                    onChange={(e) => setSettleAdditional(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              {settleMode !== 'cancel' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {settleMode === 'complete' ? 'Final Payment Amount' : 'Payment Amount'} ({currencySymbol})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        id="function-settle-amount-input"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setSettleAmount(settleBooking.balanceDue)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl shrink-0"
                      >
                        Full
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Payment Method</label>
                    <select
                      id="function-settle-method-select"
                      value={settleMethod}
                      onChange={(e) => setSettleMethod(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="card">💳 Visa / Master Card</option>
                      <option value="bank_transfer">🏦 Bank Transfer</option>
                      <option value="other">📱 Other / Online</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {settleMode === 'cancel' ? 'Cancellation Reason' : 'Notes'}
                </label>
                <input
                  type="text"
                  id="function-settle-notes-input"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder={settleMode === 'cancel' ? 'e.g. Customer postponed the event' : 'Optional notes'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeSettlement}
                  disabled={isSettling}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  id="confirm-function-settle-btn"
                  disabled={isSettling}
                  className={`px-5 py-2 rounded-xl text-white text-sm font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${
                    settleMode === 'payment'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
                      : settleMode === 'complete'
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'
                      : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/40'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  {isSettling
                    ? 'Processing...'
                    : settleMode === 'payment'
                    ? 'Record Payment'
                    : settleMode === 'complete'
                    ? 'Complete Event'
                    : 'Cancel Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
