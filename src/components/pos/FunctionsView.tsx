import React, { useEffect, useMemo, useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { FunctionBooking, FunctionPaymentMethod } from '../../types.ts';
import {
  PartyPopper,
  Calendar,
  User,
  Phone,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wrench,
  Printer,
  Plus,
  Search,
  RefreshCw,
  Users,
  Building,
  X,
  AlertCircle,
  Ban,
  Wallet,
  CreditCard,
  CalendarClock
} from 'lucide-react';

/** Money ceiling for additional charges, mirrored from server.ts. */
const EVENT_LINE_CAP = 10000000;

/**
 * Local calendar day. Every day comparison in this module has to use the
 * hotel's own day: `toISOString()` is UTC, so between midnight and 05:30 in a
 * UTC+05:30 hotel "today" used to point at yesterday — today's weddings were
 * missing from the board while yesterday's were still on it.
 */
const localDayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const eventDayKey = (booking: { eventDate?: string }): string => String(booking.eventDate || '').slice(0, 10);

type BookingFilter = 'upcoming' | 'today' | 'overdue' | 'completed' | 'cancelled' | 'all';

const FILTERS: { id: BookingFilter; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Needs Closing' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

const SESSION_LABEL: Record<string, string> = {
  day: 'Day',
  evening: 'Evening',
  full_day: 'Full Day'
};

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
  const money = (value: number) =>
    `${currencySymbol} ${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bookingsFilter, setBookingsFilter] = useState<BookingFilter>('upcoming');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  // Settlement modal state (payment / completion / cancellation)
  const [settleBooking, setSettleBooking] = useState<FunctionBooking | null>(null);
  const [settleMode, setSettleMode] = useState<'payment' | 'complete' | 'cancel'>('payment');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleAdditional, setSettleAdditional] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<FunctionPaymentMethod>('cash');
  const [settleReference, setSettleReference] = useState<string>('');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [settleError, setSettleError] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState<boolean>(false);

  const today = localDayKey();
  // A retired hall stays visible in the Admin panel; on the POS board it only
  // clutters the grid (and used to be mislabelled "Maintenance").
  const bookableHalls = functionHalls.filter(h => h.isActive !== false);
  const upcomingBookings = useMemo(
    () => functionBookings.filter(b => b.status === 'confirmed' && eventDayKey(b) >= today),
    [functionBookings, today]
  );

  const matchesSearch = (text: string, q: string) => text.toLowerCase().includes(q);

  const filteredHalls = bookableHalls.filter(hall => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      matchesSearch(String(hall.hallName || ''), q) ||
      matchesSearch(String(hall.hallType || ''), q) ||
      matchesSearch(String(hall.floor || ''), q)
    );
  });

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = functionBookings.filter(b => {
      if (bookingsFilter === 'upcoming') return b.status === 'confirmed' && eventDayKey(b) >= today;
      if (bookingsFilter === 'today') return b.status === 'confirmed' && eventDayKey(b) === today;
      if (bookingsFilter === 'overdue') return b.status === 'confirmed' && eventDayKey(b) < today;
      if (bookingsFilter === 'completed') return b.status === 'completed';
      if (bookingsFilter === 'cancelled') return b.status === 'cancelled';
      return true;
    });
    if (q) {
      list = list.filter(
        b =>
          matchesSearch(String(b.bookingNumber || ''), q) ||
          matchesSearch(String(b.customerName || ''), q) ||
          matchesSearch(String(b.customerPhone || ''), q) ||
          matchesSearch(String(b.hallName || ''), q) ||
          matchesSearch(String(b.eventType || ''), q) ||
          matchesSearch(eventDayKey(b), q)
      );
    }
    // Upcoming/overdue rows are an operations list: nearest event first.
    // Closed books stay newest-first, as the API returns them.
    const byDateFirst = bookingsFilter === 'upcoming' || bookingsFilter === 'today' || bookingsFilter === 'overdue';
    return [...list].sort((a, b) => {
      if (byDateFirst) {
        const cmp = eventDayKey(a).localeCompare(eventDayKey(b));
        if (cmp !== 0) return cmp;
      }
      return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
    });
  }, [functionBookings, bookingsFilter, searchQuery, today]);

  const openBalanceTotal = useMemo(
    () =>
      functionBookings
        .filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + Number(b.balanceDue || 0), 0),
    [functionBookings]
  );
  const overdueCount = functionBookings.filter(
    b => b.status === 'confirmed' && eventDayKey(b) < today
  ).length;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setViewError(null);
    try {
      // Without the catch a failed refresh left the spinner spinning forever
      // and the cashier had no idea the board was stale.
      await Promise.all([refreshFunctionHalls(), refreshFunctionBookings()]);
    } catch (err: any) {
      setViewError(err?.message || 'Failed to refresh the events board.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openSettlement = (booking: FunctionBooking, mode: 'payment' | 'complete' | 'cancel') => {
    setSettleBooking(booking);
    setSettleMode(mode);
    setSettleAmount(Number(booking.balanceDue) || 0);
    setSettleAdditional(0);
    setSettleMethod((booking.paymentMethod as FunctionPaymentMethod) || 'cash');
    setSettleReference('');
    setSettleNotes('');
    setSettleError(null);
  };

  const closeSettlement = () => {
    setSettleBooking(null);
    setSettleError(null);
    setIsSettling(false);
  };

  // Escape closes the settlement dialog (it is the only POS dialog in this
  // module that can be opened on top of the board while a queue is waiting).
  useEffect(() => {
    if (!settleBooking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSettling) closeSettlement();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settleBooking, isSettling]);

  const settleBalanceBase = Number(settleBooking?.balanceDue || 0);
  const settleAdditionalSafe = Math.max(0, Number(settleAdditional) || 0);
  // "Complete Event" adds the extra charges FIRST, so the amount to collect is
  // the balance plus those charges. The old dialog kept pre-filling the old
  // balance and the "Full" button reset to it as well — every event with extra
  // bar/decor charges was then rejected by the server with "final payment
  // cannot be less than balance due".
  const settleEffectiveBalance =
    settleMode === 'complete'
      ? Number(Math.max(0, settleBalanceBase + settleAdditionalSafe).toFixed(2))
      : settleBalanceBase;

  const settleTotals = {
    newGrandTotal: Number(((Number(settleBooking?.grandTotal) || 0) + (settleMode === 'complete' ? settleAdditionalSafe : 0)).toFixed(2))
  };

  const canSettle =
    !!settleBooking &&
    (settleMode === 'cancel'
      ? true
      : settleAmount > 0 &&
        settleAmount <= settleEffectiveBalance + 0.01 &&
        settleAdditionalSafe <= EVENT_LINE_CAP);

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleBooking || isSettling) return;
    if (settleMode !== 'cancel' && settleAmount <= 0) {
      setSettleError('Enter an amount greater than zero.');
      return;
    }
    if (settleMode === 'complete' && settleAdditionalSafe > EVENT_LINE_CAP) {
      setSettleError(`Additional charges cannot exceed ${money(EVENT_LINE_CAP)}.`);
      return;
    }
    try {
      setIsSettling(true);
      setSettleError(null);

      if (settleMode === 'payment') {
        await addFunctionPayment(settleBooking.id, {
          amount: settleAmount,
          paymentMethod: settleMethod,
          reference: settleReference.trim() || undefined,
          notes: settleNotes,
        });
      } else if (settleMode === 'complete') {
        await completeFunctionBooking(settleBooking.id, {
          additionalCharges: settleAdditionalSafe,
          finalPaymentAmount: settleAmount,
          paymentMethod: settleMethod,
          notes: settleNotes,
        });
      } else {
        const result = await cancelFunctionBooking(settleBooking.id, settleNotes);
        if (result && Number(result.refundDue) > 0) {
          window.alert(result.message || `Refund ${money(result.refundDue)} of advance to the customer.`);
        }
      }
      closeSettlement();
    } catch (err: any) {
      setSettleError(err.message || 'Action failed. Please try again.');
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status: FunctionBooking['status'], booking: FunctionBooking) => {
    if (status === 'confirmed' && eventDayKey(booking) < today) {
      return (
        <span
          className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5"
          title="The event day has passed but the booking was never completed"
        >
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Overdue
        </span>
      );
    }
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
                {bookableHalls.length} Hall{bookableHalls.length === 1 ? '' : 's'}
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
            ⭐ Today: {upcomingBookings.filter(b => eventDayKey(b) === today).length}
          </div>
          {overdueCount > 0 && (
            <button
              onClick={() => setBookingsFilter('overdue')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-rose-950/40 text-rose-300 border-rose-900/40 hover:bg-rose-900/40 transition-colors"
              title="Events whose day has passed without being completed"
            >
              ⚠ Needs Closing: {overdueCount}
            </button>
          )}
          <div className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-slate-900 text-slate-300 border-slate-800 font-mono">
            Outstanding: {money(openBalanceTotal)}
          </div>
          <div className="flex items-center gap-2 pl-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
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

      {viewError && (
        <div id="functions-view-error" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{viewError}</span>
          <button onClick={() => setViewError(null)} className="p-1 hover:bg-slate-800 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Hall Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            id="functions-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search halls, bookings, ticket no., customer or event date (2026-12-24)..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 p-1 text-slate-500 hover:text-white rounded"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-violet-400" />
            Function Halls ({filteredHalls.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredHalls.length === 0 ? (
              <div className="col-span-full h-40 flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
                <PartyPopper className="w-10 h-10 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-slate-300">No function halls found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {searchQuery
                    ? 'No hall matches that search — clear it to see every hall.'
                    : 'Try adjusting your search, or add function halls in the Admin panel (Functions & Events).'}
                </p>
              </div>
            ) : (
              filteredHalls.map(hall => {
                const isMaintenance = hall.status === 'maintenance';
                const hallOpen = upcomingBookings.filter(b => b.hallId === hall.id);
                const bookedToday = hallOpen.some(b => eventDayKey(b) === today) ||
                  functionBookings.some(b => b.hallId === hall.id && b.status === 'completed' && eventDayKey(b) === today);
                const hallOpenBalance = hallOpen.reduce((sum, b) => sum + Number(b.balanceDue || 0), 0);
                return (
                  <div
                    key={hall.id}
                    id={`function-hall-card-${hall.id}`}
                    className={`relative rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-lg ${
                      isMaintenance
                        ? 'bg-gradient-to-b from-amber-950/20 to-slate-900/90 border-amber-800/40 hover:border-amber-700'
                        : bookedToday
                        ? 'bg-gradient-to-b from-rose-950/20 to-slate-900/90 border-rose-900/50 hover:border-rose-800'
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
                        ) : bookedToday ? (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                            <PartyPopper className="w-3 h-3 text-rose-400" />
                            Booked Today
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Free Today
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

                      {hallOpen.length > 0 && (
                        <div className="mt-2.5 text-[11px] bg-violet-950/40 border border-violet-900/40 rounded-lg px-2.5 py-1.5 text-violet-300 font-mono">
                          {hallOpen.length} upcoming event{hallOpen.length > 1 ? 's' : ''}:{' '}
                          {hallOpen.slice(0, 2).map(b => formatEventDate(b.eventDate)).join(', ')}
                          {hallOpen.length > 2 ? '…' : ''}
                          {hallOpenBalance > 0 && (
                            <div className="text-[10px] text-amber-300/90 mt-0.5">
                              Outstanding on this hall: {money(hallOpenBalance)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="p-3 bg-slate-950/40 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">
                        {isMaintenance ? 'Under maintenance — not bookable' : bookedToday ? 'One event per hall per day' : 'Next free day: today'}
                      </span>
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
            <div className="flex items-center gap-1 flex-wrap">
              {FILTERS.map(f => {
                const count =
                  f.id === 'overdue'
                    ? overdueCount
                    : f.id === 'upcoming'
                    ? upcomingBookings.length
                    : undefined;
                return (
                  <button
                    key={f.id}
                    id={`functions-filter-${f.id}`}
                    onClick={() => setBookingsFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      bookingsFilter === f.id ? 'bg-violet-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                    {count !== undefined && count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
              <Calendar className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-300">
                {bookingsFilter === 'overdue'
                  ? 'Nothing left open from a past event day'
                  : `No ${bookingsFilter === 'all' ? '' : bookingsFilter} bookings`}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? 'Nothing matches that search under this filter.'
                  : bookingsFilter === 'upcoming'
                  ? 'Book the first event using the "New Event Booking" button above.'
                  : 'Nothing to show for this filter yet.'}
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/80">
                <div className="col-span-2">Event</div>
                <div className="col-span-2">Customer</div>
                <div className="col-span-2">Hall, Date &amp; Session</div>
                <div className="col-span-2 text-right">Total / Advance</div>
                <div className="col-span-1 text-right">Balance</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {filteredBookings.map(booking => {
                const isOverdue = booking.status === 'confirmed' && eventDayKey(booking) < today;
                const daysToGo = Math.round(
                  (new Date(`${eventDayKey(booking)}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000
                );
                return (
                  <div
                    key={booking.id}
                    id={`function-booking-row-${booking.bookingNumber}`}
                    className={`grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-800/60 last:border-b-0 items-center hover:bg-slate-800/30 transition-colors ${
                      eventDayKey(booking) === today && booking.status === 'confirmed' ? 'bg-violet-950/20' : ''
                    }`}
                  >
                    <div className="md:col-span-2">
                      <div className="font-bold text-white text-sm">{String(booking.eventType || 'other').replace('_', ' ').toUpperCase()}</div>
                      <div className="text-[10px] text-violet-400 font-mono">#{booking.bookingNumber}</div>
                      {Number(booking.numberOfPlates) > 0 && (
                        <div className="text-[10px] text-slate-500">
                          {booking.numberOfPlates} plates @ {money(booking.perPlateRate)}
                        </div>
                      )}
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
                      <div className="text-[10px] text-slate-600">by {booking.cashierName || 'staff'}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm font-semibold text-violet-300">{booking.hallName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {formatEventDate(booking.eventDate)}
                        {booking.status === 'confirmed' && daysToGo >= 0 && (
                          <span className="text-[10px] text-slate-600">
                            {daysToGo === 0 ? '(today)' : daysToGo === 1 ? '(tomorrow)' : `(${daysToGo}d)`}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        {SESSION_LABEL[booking.session] || 'Full Day'} • {booking.expectedGuests} guests
                        {isOverdue && <span className="text-amber-400"> • event day passed</span>}
                      </div>
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <div className="text-sm font-bold text-white font-mono">
                        {currencySymbol} {booking.grandTotal.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-emerald-400 font-mono">
                        Advance: {currencySymbol} {booking.advancePaid.toLocaleString()}
                      </div>
                      {Number(booking.discount) > 0 && (
                        <div className="text-[10px] text-slate-500 font-mono">disc {money(booking.discount)}</div>
                      )}
                    </div>
                    <div className="md:col-span-1 md:text-right">
                      <span className={`text-sm font-black font-mono ${booking.balanceDue > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {currencySymbol} {booking.balanceDue.toLocaleString()}
                      </span>
                    </div>
                    <div className="md:col-span-1 flex md:justify-center">
                      {getStatusBadge(booking.status, booking)}
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
                            id={`edit-function-booking-${booking.bookingNumber}-btn`}
                            onClick={() => openFunctionBookingModal(null, booking)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700"
                            title="Correct details / reschedule (keeps ticket no. & advance)"
                          >
                            <CalendarClock className="w-4 h-4 text-sky-400" />
                          </button>
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
                            title={isOverdue ? 'This event day has already passed — close it and collect the balance' : 'Collect the balance and close the event'}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Complete
                          </button>
                          <button
                            id={`cancel-function-booking-${booking.bookingNumber}-btn`}
                            onClick={() => openSettlement(booking, 'cancel')}
                            className="px-2.5 py-1.5 bg-rose-700/80 hover:bg-rose-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
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
              <button onClick={closeSettlement} disabled={isSettling} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
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
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 grid grid-cols-3 gap-2 text-center font-mono text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">
                    {settleMode === 'complete' ? 'New Total' : 'Grand Total'}
                  </div>
                  <div className="font-bold text-white">{money(settleTotals.newGrandTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Received</div>
                  <div className="font-bold text-emerald-400">{money(settleBooking.advancePaid)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">{settleMode === 'complete' ? 'To Collect' : 'Balance Due'}</div>
                  <div className="font-bold text-amber-400">{money(settleEffectiveBalance)}</div>
                </div>
              </div>

              {settleMode === 'cancel' && Number(settleBooking.advancePaid) > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-amber-200 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {money(settleBooking.advancePaid)} of advance has already been received. Cancelling closes the
                    booking and marks that amount as <strong>refundable</strong> — hand the cash back (or note the
                    forfeiture) in the register yourself; the system does not move money on its own.
                  </span>
                </div>
              )}

              {settleMode === 'complete' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Additional Charges ({currencySymbol})
                    <span className="ml-1 text-[10px] text-slate-500">bar bill, decor overrun, extra plates</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={EVENT_LINE_CAP}
                    id="function-settle-additional-input"
                    value={settleAdditional}
                    onChange={(e) => {
                      const add = Math.max(0, Math.min(Number(e.target.value) || 0, EVENT_LINE_CAP));
                      setSettleAdditional(add);
                      // Collect the new total automatically — the point of the
                      // field is that the balance grows by exactly this amount.
                      setSettleAmount(Number(Math.max(0, settleBalanceBase + add).toFixed(2)));
                    }}
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
                        max={settleEffectiveBalance}
                        step="0.01"
                        id="function-settle-amount-input"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(Math.max(0, Number(e.target.value)))}
                        className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none font-mono font-bold ${
                          settleAmount > settleEffectiveBalance + 0.01 ? 'border-rose-600 focus:border-rose-500' : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setSettleAmount(settleEffectiveBalance)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl shrink-0"
                      >
                        Full
                      </button>
                      {settleMode === 'payment' && settleBalanceBase > 0 && (
                        <button
                          type="button"
                          onClick={() => setSettleAmount(Number((settleBalanceBase / 2).toFixed(2)))}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-xl shrink-0"
                          title="Half of the outstanding balance"
                        >
                          50%
                        </button>
                      )}
                    </div>
                    {settleAmount > settleEffectiveBalance + 0.01 && (
                      <p className="mt-1 text-[10px] text-rose-300">
                        Only {money(settleEffectiveBalance)} is due — the server rejects anything more.
                      </p>
                    )}
                    {settleMode === 'complete' && settleAmount + 0.01 < settleEffectiveBalance && (
                      <p className="mt-1 text-[10px] text-amber-300">
                        Completing an event needs the full {money(settleEffectiveBalance)}. Record a part payment first
                        if the customer is paying in stages.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Payment Method</label>
                      <select
                        id="function-settle-method-select"
                        value={settleMethod}
                        onChange={(e) => setSettleMethod(e.target.value as FunctionPaymentMethod)}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="cash">💵 Cash</option>
                        <option value="card">💳 Visa / Master Card</option>
                        <option value="bank_transfer">🏦 Bank Transfer</option>
                        <option value="other">📱 Other / Online</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Slip / Reference</label>
                      <input
                        type="text"
                        id="function-settle-reference-input"
                        value={settleReference}
                        maxLength={64}
                        onChange={(e) => setSettleReference(e.target.value)}
                        placeholder="e.g. BOC-88213"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
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
                  maxLength={500}
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
                  disabled={isSettling || !canSettle}
                  title={!canSettle && settleMode !== 'cancel' ? 'Enter a valid amount within the balance due' : undefined}
                  className={`px-5 py-2 rounded-xl text-white text-sm font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
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
                    ? `Collect ${money(settleEffectiveBalance)} & Close`
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
