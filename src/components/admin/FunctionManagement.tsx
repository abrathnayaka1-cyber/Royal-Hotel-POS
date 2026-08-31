import React, { useState } from 'react';
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
  Building,
  Users,
  DollarSign,
  Printer,
  X,
  Ban,
  Calendar,
  Clock
} from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'halls' | 'bookings'>('halls');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
    setNotes(hall.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingHall(null);
    setFormError(null);
  };

  const handleSaveHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hallName.trim()) {
      setFormError('Hall name is required.');
      return;
    }
    if (!ratePerDay || ratePerDay <= 0) {
      setFormError('Please enter a valid rate per booking.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const amenitiesArray = amenitiesInput
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const payload = {
        hallName: hallName.trim(),
        hallType: hallType.trim(),
        floor: floor.trim(),
        capacity,
        ratePerDay,
        amenities: amenitiesArray,
        status,
        notes: notes.trim(),
      };

      if (editingHall) {
        await updateFunctionHall(editingHall.id, payload);
      } else {
        await createFunctionHall(payload);
      }
      handleCloseModal();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save function hall.');
      setIsSubmitting(false);
    }
  };

  const handleDeleteHall = async (hall: FunctionHall) => {
    if (!window.confirm(`Delete function hall "${hall.hallName}"? This cannot be undone.`)) return;
    try {
      await deleteFunctionHall(hall.id);
    } catch (err: any) {
      window.alert(err.message || 'Failed to delete function hall.');
    }
  };

  const handleCancelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    try {
      setIsCancelling(true);
      await cancelFunctionBooking(cancelTarget.id, cancelReason);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err: any) {
      window.alert(err.message || 'Failed to cancel booking.');
    } finally {
      setIsCancelling(false);
    }
  };

  const filteredHalls = functionHalls.filter(hall => {
    if (statusFilter !== 'all' && hall.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = String(hall.hallName || '').toLowerCase().includes(q);
      const matchType = String(hall.hallType || '').toLowerCase().includes(q);
      if (!matchName && !matchType) return false;
    }
    return true;
  });

  const filteredBookings = functionBookings.filter(b => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(b.bookingNumber || '').toLowerCase().includes(q) ||
      String(b.customerName || '').toLowerCase().includes(q) ||
      String(b.customerPhone || '').toLowerCase().includes(q) ||
      String(b.hallName || '').toLowerCase().includes(q)
    );
  });

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
            onClick={() => { refreshFunctionHalls(); refreshFunctionBookings(); }}
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
          >
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
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'halls' ? 'Search halls...' : 'Search bookings...'}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-violet-500"
          />
        </div>
        {activeTab === 'halls' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
          </select>
        )}
      </div>

      {/* Halls Grid */}
      {activeTab === 'halls' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHalls.map(hall => (
            <div
              key={hall.id}
              id={`admin-function-hall-card-${hall.id}`}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
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
                    hall.status === 'available'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {hall.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {hall.capacity} guests
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
                </div>
              )}

              {hall.notes && <p className="text-[11px] text-slate-400 mt-2 italic">"{hall.notes}"</p>}

              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => handleOpenEditModal(hall)}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleDeleteHall(hall)}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-950 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
          {filteredHalls.length === 0 && (
            <div className="col-span-full h-40 flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-dashed rounded-2xl">
              <PartyPopper className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-500">No function halls found</h3>
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
            <div className="col-span-2">Hall &amp; Date</div>
            <div className="col-span-2 text-right">Total / Advance</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {filteredBookings.map(booking => (
            <div
              key={booking.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div className="md:col-span-2">
                <div className="font-bold text-slate-800 dark:text-white text-sm">
                  {booking.eventType.replace('_', ' ').toUpperCase()}
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
              </div>
              <div className="md:col-span-2">
                <div className="text-sm font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 shrink-0" />
                  {booking.hallName}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatEventDate(booking.eventDate)}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {booking.expectedGuests} guests • {booking.session.replace('_', ' ')}
                </div>
              </div>
              <div className="md:col-span-2 md:text-right">
                <div className="text-sm font-bold text-slate-800 dark:text-white font-mono">
                  {currencySymbol} {booking.grandTotal.toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                  Advance: {currencySymbol} {booking.advancePaid.toLocaleString()}
                </div>
              </div>
              <div className="md:col-span-2 md:text-right">
                <span className={`text-sm font-black font-mono ${booking.balanceDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                  {currencySymbol} {booking.balanceDue.toLocaleString()}
                </span>
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
                    onClick={() => { setCancelTarget(booking); setCancelReason(''); }}
                    className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Cancel Booking"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredBookings.length === 0 && (
            <div className="h-40 flex flex-col items-center justify-center text-center p-8">
              <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-bold text-slate-500">No bookings found</h3>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Hall Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg text-slate-800 dark:text-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                {editingHall ? 'Edit Function Hall' : 'Add Function Hall'}
              </h3>
              <button onClick={handleCloseModal} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveHall} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Hall Name *</label>
                  <input
                    type="text"
                    value={hallName}
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
                    value={hallType}
                    onChange={(e) => setHallType(e.target.value)}
                    placeholder="e.g. Main Hall (AC)"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Floor / Location</label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="e.g. Ground Floor"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Capacity (Guests)</label>
                  <input
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Rate / Booking ({currencySymbol}) *</label>
                  <input
                    type="number"
                    min="1"
                    value={ratePerDay}
                    onChange={(e) => setRatePerDay(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 font-mono"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Amenities (comma separated)</label>
                  <input
                    type="text"
                    value={amenitiesInput}
                    onChange={(e) => setAmenitiesInput(e.target.value)}
                    placeholder="AC, Stage, Sound System, Chairs"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FunctionHall['status'])}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  >
                    <option value="available">Available</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  />
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
              <button onClick={() => setCancelTarget(null)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCancelBooking} className="p-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Cancel <strong className="text-slate-800 dark:text-white">{cancelTarget.bookingNumber}</strong> —{' '}
                {cancelTarget.customerName} at {cancelTarget.hallName} on {formatEventDate(cancelTarget.eventDate)}?
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Cancellation Reason</label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer postponed the event"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-500"
                />
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
