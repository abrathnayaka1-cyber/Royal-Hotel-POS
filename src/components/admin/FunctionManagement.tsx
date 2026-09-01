import React, { useMemo, useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { FunctionBooking, FunctionHall } from '../../types.ts';
import {
  PartyPopper,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Building,
  Users,
  DollarSign,
  Printer,
  X,
  Ban,
  Calendar,
  Clock,
  RefreshCw
} from 'lucide-react';

/** Server-side ceilings for hall master data (see server.ts). */
const EVENT_MAX_HALL_CAPACITY = 10000;
const EVENT_LINE_CAP = 10000000;

const localDayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const eventDayKey = (b: { eventDate?: string }) => String(b.eventDate || '').slice(0, 10);

const AMENITY_PRESETS = [
  'Fully Air-Conditioned',
  'Stage & Lighting',
  'Sound System',
  'Projector & Screen',
  'Outdoor Toilets',
  'Backup Generator',
  'Free Wi-Fi',
  'Bridal Room',
  'Valet Parking'
];

const HALL_TYPE_PRESETS = [
  'Main Hall (AC)',
  'Open-Air Garden',
  'Meeting Room (AC)',
  'Banquet Hall',
  'Rooftop Terrace',
  'Ballroom'
];

export const FunctionManagement: React.FC = () => {
  const {
    functionHalls,
    functionBookings,
    settings,
    createFunctionHall,
    updateFunctionHall,
    deleteFunctionHall,
    openFunctionTicketModal,
    cancelFunctionBooking,
    refreshFunctionHalls,
    refreshFunctionBookings
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const money = (v: number) =>
    `${currencySymbol} ${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const [activeTab, setActiveTab] = useState<'halls' | 'bookings'>('halls');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Edit / Add Hall Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingHall, setEditingHall] = useState<FunctionHall | null>(null);

  const [hallName, setHallName] = useState<string>('');
  const [hallType, setHallType] = useState<string>('Main Hall (AC)');
  const [floor, setFloor] = useState<string>('Ground Floor');
  const [capacity, setCapacity] = useState<number>(200);
  const [ratePerDay, setRatePerDay] = useState<number>(50000);
  const [amenitiesInput, setAmenitiesInput] = useState<string>('AC, Stage, Sound System, Chairs');
  const [status, setStatus] = useState<FunctionHall['status']>('available');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<FunctionBooking | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const handleOpenCreateModal = () => {
    setEditingHall(null);
    setHallName('');
    setHallType('Main Hall (AC)');
    setFloor('Ground Floor');
    setCapacity(200);
    setRatePerDay(50000);
    setAmenitiesInput('AC, Stage, Sound System, Chairs');
    setStatus('available');
    setIsActive(true);
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (hall: FunctionHall) => {
    setEditingHall(hall);
    setHallName(hall.hallName);
    setHallType(hall.hallType);
    setFloor(hall.floor || '');
    setCapacity(hall.capacity);
    setRatePerDay(hall.ratePerDay);
    setAmenitiesInput(hall.amenities ? hall.amenities.join(', ') : '');
    setStatus(hall.status);
    setIsActive(hall.isActive !== false);
    setNotes(hall.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingHall(null);
    setFormError(null);
  };

  const amenitiesPreview = amenitiesInput
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const handleSaveHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!hallName.trim()) {
      setFormError('Hall name is required.');
      return;
    }
    if (!hallType.trim()) {
      setFormError('Hall type is required.');
      return;
    }
    if (!ratePerDay || ratePerDay <= 0) {
      setFormError('Please enter a valid rate per booking.');
      return;
    }
    // Mirror the server: these used to be silently rewritten (capacity 0 → 100)
    // or ignored (a negative rate kept the old price while the form said 200 OK).
    if (!Number.isFinite(capacity) || Math.round(capacity) < 1 || capacity > EVENT_MAX_HALL_CAPACITY) {
      setFormError(`Hall capacity must be between 1 and ${EVENT_MAX_HALL_CAPACITY.toLocaleString()} guests.`);
      return;
    }
    if (ratePerDay > EVENT_LINE_CAP) {
      setFormError(`Hall rate must stay within ${money(EVENT_LINE_CAP)} per booking.`);
      return;
    }
    if (amenitiesPreview.length > 20) {
      setFormError('Maximum 20 amenities per hall — merge or drop a few.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        hallName: hallName.trim(),
        hallType: hallType.trim(),
        floor: floor.trim(),
        capacity: Math.round(capacity),
        ratePerDay,
        amenities: amenitiesPreview,
        status,
        notes: notes.trim(),
        isActive
      };

      if (editingHall) {
        await updateFunctionHall(editingHall.id, payload);
        setBanner({ type: 'success', text: `Hall "${hallName.trim()}" updated. Existing bookings keep the rate they were booked at.` });
      } else {
        await createFunctionHall(payload);
        setBanner({ type: 'success', text: `Hall "${hallName.trim()}" added to the POS board.` });
      }
      handleCloseModal();
    } catch (err: any) {
      setBanner(null);
      setFormError(err.message || 'Failed to save function hall.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHall = async (hall: FunctionHall) => {
    if (!window.confirm(`Delete function hall "${hall.hallName}"? This cannot be undone.`)) return;
    try {
      await deleteFunctionHall(hall.id);
      setBanner({ type: 'success', text: `Function hall "${hall.hallName}" deleted.` });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to delete function hall.' });
    }
  };

  const handleToggleActive = async (hall: FunctionHall, next: boolean) => {
    try {
      await updateFunctionHall(hall.id, { isActive: next });
      setBanner({
        type: 'success',
        text: next
          ? `"${hall.hallName}" is active again and bookable from the POS.`
          : `"${hall.hallName}" is retired — hidden from the POS board; its ${
              functionBookings.filter(b => b.hallId === hall.id && b.status === 'confirmed').length
            } open booking(s) stay on file.`
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to change the hall status.' });
    }
  };

  const handleToggleMaintenance = async (hall: FunctionHall) => {
    const next = hall.status === 'maintenance' ? 'available' : 'maintenance';
    try {
      await updateFunctionHall(hall.id, { status: next });
      setBanner({
        type: 'success',
        text: next === 'maintenance'
          ? `"${hall.hallName}" is under maintenance — no new events can be booked. Confirmed events stay active.`
          : `"${hall.hallName}" is available for bookings again.`
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to change the hall status.' });
    }
  };

  const handleCancelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget || isCancelling) return;
    try {
      setIsCancelling(true);
      const result = await cancelFunctionBooking(cancelTarget.id, cancelReason.trim());
      setBanner({
        type: 'success',
        text: result?.message || `Booking ${cancelTarget.bookingNumber} cancelled.`
      });
      setCancelTarget(null);
      setCancelReason('');
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to cancel booking.' });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setBanner(null);
    try {
      // Unhandled rejections here left the button looking idle forever.
      await Promise.all([refreshFunctionHalls(), refreshFunctionBookings()]);
      setBanner({ type: 'success', text: 'Halls and event bookings refreshed.' });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to refresh functions data.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const todayKey = localDayKey();

  const filteredHalls = functionHalls.filter(hall => {
    if (statusFilter === 'available' && (hall.status !== 'available' || hall.isActive === false)) return false;
    if (statusFilter === 'maintenance' && hall.status !== 'maintenance') return false;
    if (statusFilter === 'retired' && hall.isActive !== false) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = String(hall.hallName || '').toLowerCase().includes(q);
      const matchType = String(hall.hallType || '').toLowerCase().includes(q);
      const matchFloor = String(hall.floor || '').toLowerCase().includes(q);
      if (!matchName && !matchType && !matchFloor) return false;
    }
    return true;
  });

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = functionBookings.filter(b => {
      if (bookingStatusFilter !== 'all' && b.status !== bookingStatusFilter) return false;
      if (!q) return true;
      return (
        String(b.bookingNumber || '').toLowerCase().includes(q) ||
        String(b.customerName || '').toLowerCase().includes(q) ||
        String(b.customerPhone || '').toLowerCase().includes(q) ||
        String(b.hallName || '').toLowerCase().includes(q) ||
        eventDayKey(b).includes(q)
      );
    });
    // Live events are an operations list (soonest first); closed books read as a
    // history, so the most recent event stays on top.
    const soonestFirst = bookingStatusFilter === 'confirmed' || bookingStatusFilter === 'all';
    return [...list].sort((a, b) => {
      const cmp = eventDayKey(a).localeCompare(eventDayKey(b));
      if (cmp !== 0) return soonestFirst ? cmp : -cmp;
      return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
    });
  }, [functionBookings, bookingStatusFilter, searchQuery]);

  // Outstanding balance across every live booking — a Super Admin had no way to
  // see how much event money was still uncollected (rooms have had this all along).
  const outstandingDue = functionBookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + Number(b.balanceDue || 0), 0);
  const overdueBookings = functionBookings.filter(
    b => b.status === 'confirmed' && eventDayKey(b) < todayKey
  );
  const bookedRevenue = functionBookings
    .filter(b => b.status !== 'cancelled')
    .reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);

  const statsFor = (hallId: string) => {
    const onHall = functionBookings.filter(b => b.hallId === hallId && b.status !== 'cancelled');
    const upcoming = onHall.filter(b => b.status === 'confirmed' && eventDayKey(b) >= todayKey);
    return {
      total: onHall.length,
      upcoming: upcoming.length,
      next: upcoming.length ? [...upcoming].sort((a, b) => eventDayKey(a).localeCompare(eventDayKey(b)))[0] : null,
      open: Number(onHall.filter(b => b.status === 'confirmed').reduce((s, b) => s + Number(b.balanceDue || 0), 0).toFixed(2))
    };
  };

  const hallById = new Map(functionHalls.map(h => [h.id, h]));

  const formatEventDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <div id="admin-functions-view" className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            Functions &amp; Events
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage function halls &amp; event bookings (weddings, parties, meetings, corporate events)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {activeTab === 'halls' && (
            <button
              id="admin-new-function-hall-btn"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Function Hall
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          id="admin-functions-banner"
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            banner.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {banner.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="p-0.5 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Halls (active)</div>
          <div className="text-lg font-black text-slate-800 dark:text-white font-mono">
            {functionHalls.filter(h => h.isActive !== false).length}
            <span className="text-[11px] text-slate-400 font-sans font-normal ml-1">
              / {functionHalls.length} total
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Open Events</div>
          <div className="text-lg font-black text-slate-800 dark:text-white font-mono">
            {functionBookings.filter(b => b.status === 'confirmed').length}
            {overdueBookings.length > 0 && (
              <span className="text-[11px] text-amber-500 font-sans font-normal ml-1">
                {overdueBookings.length} overdue
              </span>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Outstanding Balance</div>
          <div className={`text-lg font-black font-mono ${outstandingDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}>
            {money(outstandingDue)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
          <div className="text-[10px] uppercase font-bold text-slate-400">Booked Revenue</div>
          <div className="text-lg font-black text-slate-800 dark:text-white font-mono">{money(bookedRevenue)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('halls')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'halls' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow' : 'text-slate-500'
          }`}
        >
          Function Halls ({functionHalls.length})
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'bookings' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow' : 'text-slate-500'
          }`}
        >
          Event Bookings ({functionBookings.length})
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-full max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            id="admin-functions-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'halls' ? 'Search halls...' : 'Search ticket no., customer, hall, date...'}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-violet-500"
          />
        </div>
        {activeTab === 'halls' ? (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="all">All Halls</option>
            <option value="available">Available</option>
            <option value="maintenance">Under Maintenance</option>
            <option value="retired">Retired</option>
          </select>
        ) : (
          <select
            value={bookingStatusFilter}
            onChange={(e) => setBookingStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="all">All Bookings</option>
            <option value="confirmed">🟢 Confirmed / Upcoming</option>
            <option value="completed">🔵 Completed</option>
            <option value="cancelled">🔴 Cancelled</option>
          </select>
        )}
      </div>

      {/* Halls Grid */}
      {activeTab === 'halls' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHalls.map(hall => {
            const stats = statsFor(hall.id);
            const retired = hall.isActive === false;
            return (
              <div
                key={hall.id}
                id={`admin-function-hall-card-${hall.id}`}
                className={`border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow ${
                  retired
                    ? 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 opacity-80'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white">{hall.hallName}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {hall.hallType}{hall.floor ? ` • ${hall.floor}` : ''}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                      retired
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                        : hall.status === 'available'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {retired ? 'RETIRED' : hall.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {hall.capacity.toLocaleString()} guests
                  </span>
                  <span className="font-mono font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    {currencySymbol} {hall.ratePerDay.toLocaleString()}/booking
                  </span>
                </div>

                {hall.amenities && hall.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {hall.amenities.slice(0, 4).map((am, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {am}
                      </span>
                    ))}
                    {hall.amenities.length > 4 && (
                      <span className="text-[10px] px-1 py-0.5 text-slate-400">+{hall.amenities.length - 4}</span>
                    )}
                  </div>
                )}

                {hall.notes && <p className="text-[11px] text-slate-400 mt-2 italic">"{hall.notes}"</p>}

                <div className="mt-3 text-[11px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2 text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span>Bookings on file</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {stats.total}{stats.upcoming > 0 ? ` (${stats.upcoming} upcoming)` : ''}
                    </span>
                  </div>
                  {stats.next && (
                    <div className="flex items-center justify-between">
                      <span>Next event</span>
                      <span className="font-mono">{eventDayKey(stats.next)}</span>
                    </div>
                  )}
                  {stats.open > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Outstanding</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{money(stats.open)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                  <button
                    onClick={() => handleOpenEditModal(hall)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleToggleMaintenance(hall)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors"
                    title={hall.status === 'maintenance' ? 'Mark the hall available for new bookings' : 'Block new bookings (existing events stay active)'}
                  >
                    {hall.status === 'maintenance' ? 'Resume' : 'Maintenance'}
                  </button>
                  <button
                    onClick={() => handleToggleActive(hall, retired)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title={retired ? 'Put this hall back on the POS board' : 'Hide from the POS without deleting its history'}
                  >
                    {retired ? 'Reactivate' : 'Retire'}
                  </button>
                  <button
                    onClick={() => handleDeleteHall(hall)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-950 transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
          {filteredHalls.length === 0 && (
            <div className="col-span-full h-40 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-dashed rounded-2xl">
              <PartyPopper className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-500">No function halls found</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                {functionHalls.length > 0 ? 'No hall matches the current search / filter.' : 'Add the first hall to start taking event bookings.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bookings Table */}
      {activeTab === 'bookings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <div className="col-span-2">Event</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-2">Hall, Date &amp; Session</div>
            <div className="col-span-2 text-right">Total / Advance</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {filteredBookings.map(booking => {
            const hall = hallById.get(booking.hallId);
            const overCapacity = !!hall && Number(booking.expectedGuests) > Number(hall.capacity);
            const isOverdue = booking.status === 'confirmed' && eventDayKey(booking) < todayKey;
            return (
              <div
                key={booking.id}
                id={`admin-function-booking-row-${booking.bookingNumber}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="md:col-span-2">
                  <div className="font-bold text-slate-800 dark:text-white text-sm">
                    {String(booking.eventType || 'other').replace('_', ' ').toUpperCase()}
                  </div>
                  <div className="text-[10px] text-violet-600 dark:text-violet-400 font-mono">#{booking.bookingNumber}</div>
                  <span
                    className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                      booking.status === 'confirmed'
                        ? 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/50'
                        : booking.status === 'completed'
                        ? 'text-blue-600 border-blue-300 bg-blue-50 dark:text-blue-300 dark:border-blue-800 dark:bg-blue-950/50'
                        : 'text-rose-600 border-rose-300 bg-rose-50 dark:text-rose-300 dark:border-rose-800 dark:bg-rose-950/50'
                    }`}
                  >
                    {booking.status.toUpperCase()}
                  </span>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{booking.customerName}</div>
                  <div className="text-[11px] text-slate-500">{booking.customerPhone}</div>
                  {booking.customerAddress && (
                    <div className="text-[10px] text-slate-400 truncate" title={booking.customerAddress}>
                      {booking.customerAddress}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 shrink-0" />
                    {booking.hallName}
                    {hall?.isActive === false && <span className="text-[9px] text-slate-400">(retired hall)</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatEventDate(booking.eventDate)}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                    <Clock className="w-3 h-3" />
                    {Number(booking.expectedGuests).toLocaleString()} guests • {String(booking.session || 'full_day').replace('_', ' ')}
                    {overCapacity && (
                      <span className="text-rose-500 font-semibold" title={`Hall capacity is ${hall?.capacity}`}>
                        ⚠ over capacity
                      </span>
                    )}
                    {isOverdue && <span className="text-amber-500 font-semibold">⚠ event day passed</span>}
                  </div>
                </div>
                <div className="md:col-span-2 md:text-right">
                  <div className="text-sm font-bold text-slate-800 dark:text-white font-mono">
                    {currencySymbol} {Number(booking.grandTotal || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                    Advance: {currencySymbol} {Number(booking.advancePaid || 0).toLocaleString()}
                  </div>
                  {Number(booking.tax) > 0 && (
                    <div className="text-[10px] text-slate-400 font-mono">tax {money(booking.tax)}</div>
                  )}
                </div>
                <div className="md:col-span-2 md:text-right">
                  <span className={`text-sm font-black font-mono ${booking.balanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                    {currencySymbol} {Number(booking.balanceDue || 0).toLocaleString()}
                  </span>
                  {booking.status === 'completed' && booking.completedAt && (
                    <div className="text-[10px] text-slate-400">
                      closed {String(booking.completedAt).slice(0, 10)}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2 flex items-center gap-1.5 md:justify-end">
                  <button
                    onClick={() => openFunctionTicketModal(booking)}
                    className="p-1.5 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="View & Print Ticket"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {booking.status === 'confirmed' && (
                    <button
                      onClick={() => { setCancelTarget(booking); setCancelReason(''); setBanner(null); }}
                      className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      title="Cancel Booking"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredBookings.length === 0 && (
            <div className="h-40 flex flex-col items-center justify-center text-center p-8">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-500">No bookings found</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                {functionBookings.length > 0 ? 'Nothing matches the current search / status filter.' : 'Event bookings taken at the POS register appear here.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Hall Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg text-slate-800 dark:text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                {editingHall ? `Edit Function Hall — ${editingHall.hallName}` : 'Add Function Hall'}
              </h3>
              <button onClick={handleCloseModal} disabled={isSubmitting} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors disabled:opacity-40">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveHall} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Hall Name *</label>
                  <input
                    type="text"
                    id="admin-hall-name-input"
                    value={hallName}
                    maxLength={128}
                    onChange={(e) => setHallName(e.target.value)}
                    placeholder="e.g. Grand Ballroom"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Hall Type *</label>
                  <input
                    type="text"
                    id="admin-hall-type-input"
                    value={hallType}
                    list="admin-hall-type-presets"
                    maxLength={128}
                    onChange={(e) => setHallType(e.target.value)}
                    placeholder="e.g. Main Hall (AC)"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                    required
                  />
                  <datalist id="admin-hall-type-presets">
                    {Array.from(new Set([...HALL_TYPE_PRESETS, ...functionHalls.map(h => h.hallType)])).map(t => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Floor / Location</label>
                  <input
                    type="text"
                    id="admin-hall-floor-input"
                    value={floor}
                    maxLength={64}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="e.g. Ground Floor"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Capacity (Guests) <span className="text-[10px] font-normal">1 - {EVENT_MAX_HALL_CAPACITY.toLocaleString()}</span>
                  </label>
                  <input
                    type="number"
                    id="admin-hall-capacity-input"
                    min="1"
                    max={EVENT_MAX_HALL_CAPACITY}
                    value={Number.isFinite(capacity) ? capacity : ''}
                    // Deliberately NOT clamped while typing: silently turning 0
                    // into 1 was how a "0" hall used to end up with a phantom
                    // capacity of 100 guests.
                    onChange={(e) => setCapacity(e.target.value === '' ? NaN : Number(e.target.value))}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 font-mono"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Every event booking is capped at this number — guests above it are rejected.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Rate / Booking ({currencySymbol}) *</label>
                  <input
                    type="number"
                    id="admin-hall-rate-input"
                    min="1"
                    max={EVENT_LINE_CAP}
                    value={ratePerDay}
                    onChange={(e) => setRatePerDay(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 font-mono"
                    required
                  />
                  {editingHall && editingHall.ratePerDay !== ratePerDay && (
                    <p className="mt-1 text-[10px] text-amber-500">
                      Only NEW bookings get the new rate — {statsFor(editingHall.id).upcoming} upcoming event(s) keep
                      {` ${money(editingHall.ratePerDay)}`}.
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Amenities (comma separated, max 20)
                  </label>
                  <input
                    type="text"
                    id="admin-hall-amenities-input"
                    value={amenitiesInput}
                    onChange={(e) => setAmenitiesInput(e.target.value)}
                    placeholder="AC, Stage, Sound System, Chairs"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                    <span className="text-[10px] text-slate-400">{amenitiesPreview.length}/20</span>
                    {AMENITY_PRESETS.filter(p => !amenitiesPreview.includes(p)).slice(0, 6).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAmenitiesInput(prev => (prev.trim() ? `${prev.trim()}, ${p}` : p))}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:border-violet-400 hover:text-violet-500 transition-colors"
                      >
                        + {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status</label>
                  <select
                    id="admin-hall-status-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FunctionHall['status'])}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  >
                    <option value="available">Available</option>
                    <option value="maintenance">Maintenance (no new bookings)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Notes</label>
                  <input
                    type="text"
                    id="admin-hall-notes-input"
                    value={notes}
                    maxLength={1000}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="col-span-2 flex items-start gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
                  <input
                    type="checkbox"
                    id="admin-hall-active-toggle"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-violet-500 mt-0.5"
                  />
                  <label htmlFor="admin-hall-active-toggle" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <strong>Active</strong> — un-tick to retire this hall. Retired halls stay in the booking history but
                    disappear from the POS board and cannot take new events.
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="admin-hall-save-btn"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isSubmitting ? 'Saving...' : editingHall ? 'Save Changes' : 'Add Hall'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md text-slate-800 dark:text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-500" />
                Cancel Event Booking
              </h3>
              <button onClick={() => setCancelTarget(null)} disabled={isCancelling} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors disabled:opacity-40">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCancelBooking} className="p-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Cancel <strong className="text-slate-800 dark:text-white">{cancelTarget.bookingNumber}</strong> —{' '}
                {cancelTarget.customerName} at {cancelTarget.hallName} on {formatEventDate(cancelTarget.eventDate)}?
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                <div className="flex justify-between"><span>Event total</span><span>{money(cancelTarget.grandTotal)}</span></div>
                <div className="flex justify-between"><span>Advance received</span><span className="text-emerald-600 dark:text-emerald-400">{money(cancelTarget.advancePaid)}</span></div>
                <div className="flex justify-between"><span>Balance written off</span><span className={cancelTarget.balanceDue > 0 ? 'text-rose-500' : ''}>{money(cancelTarget.balanceDue)}</span></div>
              </div>
              {Number(cancelTarget.advancePaid) > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {money(cancelTarget.advancePaid)} has already been received. Cancelling frees the hall date and
                    marks the advance as refundable — hand the money back (or record the forfeiture) yourself.
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Cancellation Reason</label>
                <input
                  type="text"
                  id="admin-cancel-reason-input"
                  value={cancelReason}
                  maxLength={400}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer postponed the event to next month"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-500"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  To move an event to another date, use <strong>Reschedule</strong> at the POS instead — it keeps the
                  ticket number and the advance.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  id="admin-cancel-booking-btn"
                  disabled={isCancelling}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
