import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Room, RoomBooking } from '../../types.ts';
import {
  BedDouble,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  Building,
  Users,
  DollarSign,
  FileText,
  Calendar,
  Sparkles,
  Printer,
  History,
  X,
  Check,
  Tag
} from 'lucide-react';

export const RoomManagement: React.FC = () => {
  const {
    rooms,
    roomBookings,
    settings,
    createRoom,
    updateRoom,
    deleteRoom,
    openBookingTicketModal,
    cancelRoomBooking,
    refreshRooms,
    refreshRoomBookings
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [activeTab, setActiveTab] = useState<'rooms' | 'bookings'>('rooms');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Edit / Add Room Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  
  // Form fields
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [roomType, setRoomType] = useState<string>('Deluxe Double AC');
  const [floor, setFloor] = useState<string>('1st Floor');
  const [capacity, setCapacity] = useState<number>(2);
  const [ratePerDay, setRatePerDay] = useState<number>(7500);
  const [amenitiesInput, setAmenitiesInput] = useState<string>('AC, TV, Attached Bath, Free Wi-Fi');
  const [status, setStatus] = useState<Room['status']>('available');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingRoom(null);
    setRoomNumber('');
    setRoomType('Deluxe Double AC');
    setFloor('1st Floor');
    setCapacity(2);
    setRatePerDay(7500);
    setAmenitiesInput('AC, King Bed, Attached Bath, TV, Free Wi-Fi');
    setStatus('available');
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (room: Room) => {
    setEditingRoom(room);
    setRoomNumber(room.roomNumber);
    setRoomType(room.roomType);
    setFloor(room.floor);
    setCapacity(room.capacity);
    setRatePerDay(room.ratePerDay);
    setAmenitiesInput(room.amenities ? room.amenities.join(', ') : '');
    setStatus(room.status);
    setNotes(room.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
    setFormError(null);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim()) {
      setFormError('Room Number is required.');
      return;
    }
    if (!ratePerDay || ratePerDay <= 0) {
      setFormError('Please enter a valid rate per day.');
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
        roomNumber: roomNumber.trim(),
        roomType: roomType.trim(),
        floor: floor.trim(),
        capacity: Number(capacity) || 2,
        ratePerDay: Number(ratePerDay),
        amenities: amenitiesArray,
        status,
        notes: notes.trim()
      };

      if (editingRoom) {
        await updateRoom(editingRoom.id, payload);
      } else {
        await createRoom(payload);
      }

      handleCloseModal();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save room details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    if (room.status === 'occupied') {
      alert(`Cannot delete Room ${room.roomNumber} while it is currently Occupied! Please check-out the guest first.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete Room ${room.roomNumber} (${room.roomType})?`)) {
      try {
        await deleteRoom(room.id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete room');
      }
    }
  };

  const handleCancelBooking = async (booking: RoomBooking) => {
    if (window.confirm(`Are you sure you want to cancel booking #${booking.bookingNumber} for ${booking.guestName}?`)) {
      try {
        await cancelRoomBooking(booking.id, 'Cancelled by Admin');
      } catch (err: any) {
        alert(err.message || 'Failed to cancel booking');
      }
    }
  };

  // Filtered lists
  const filteredRooms = rooms.filter(room => {
    if (statusFilter !== 'all' && room.status !== statusFilter) return false;
    if (floorFilter !== 'all' && room.floor !== floorFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = room.roomNumber.toLowerCase().includes(q);
      const matchType = room.roomType.toLowerCase().includes(q);
      if (!matchNum && !matchType) return false;
    }
    return true;
  });

  const filteredBookings = roomBookings.filter(b => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTicket = b.bookingNumber.toLowerCase().includes(q);
      const matchGuest = b.guestName.toLowerCase().includes(q);
      const matchPhone = b.guestPhone.toLowerCase().includes(q);
      const matchRoom = b.roomNumber.toLowerCase().includes(q);
      if (!matchTicket && !matchGuest && !matchPhone && !matchRoom) return false;
    }
    return true;
  });

  const uniqueFloors = Array.from(new Set(rooms.map(r => r.floor)));

  return (
    <div id="admin-room-management-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <BedDouble className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Rooms & Accommodation Management
            </h1>
            <p className="text-xs text-slate-400">
              Super Admin: Customize room numbers, types, rates, amenities & booking logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab buttons */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'rooms'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BedDouble className="w-4 h-4" />
              Rooms Directory ({rooms.length})
            </button>
            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'bookings'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              Booking History ({roomBookings.length})
            </button>
          </div>

          <button
            id="admin-add-room-btn"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Room</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'rooms' ? 'Search room number or type...' : 'Search guest, phone, ticket #...'}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {activeTab === 'rooms' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="available">🟢 Available</option>
              <option value="occupied">🔴 Occupied</option>
              <option value="cleaning">🧹 Cleaning</option>
              <option value="maintenance">🛠️ Maintenance</option>
            </select>

            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Floors</option>
              {uniqueFloors.map(fl => (
                <option key={fl} value={fl}>{fl}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: Rooms Directory Table */}
      {activeTab === 'rooms' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
                  <th className="py-3.5 px-4">Room No.</th>
                  <th className="py-3.5 px-4">Room Type & Floor</th>
                  <th className="py-3.5 px-4">Capacity</th>
                  <th className="py-3.5 px-4">Rate / Day</th>
                  <th className="py-3.5 px-4">Amenities</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No rooms found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map(room => (
                    <tr key={room.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-black text-sm text-white">
                        {room.roomNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-200">{room.roomType}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-500" />
                          {room.floor}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {room.capacity} Guests
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                        {currencySymbol} {room.ratePerDay.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {room.amenities?.map((am, idx) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {am}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-block ${
                          room.status === 'available'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : room.status === 'occupied'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : room.status === 'cleaning'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        }`}>
                          {room.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(room)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                            title="Edit Room Details & Rates"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room)}
                            className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-lg transition-colors border border-rose-800/40"
                            title="Delete Room"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Booking History Log */}
      {activeTab === 'bookings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
                  <th className="py-3.5 px-4">Ticket No.</th>
                  <th className="py-3.5 px-4">Room</th>
                  <th className="py-3.5 px-4">Guest Details</th>
                  <th className="py-3.5 px-4">Check-In / Out</th>
                  <th className="py-3.5 px-4">Nights</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Paid / Balance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500">
                      No room bookings recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map(b => (
                    <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        #{b.bookingNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-sm text-white">
                        Room {b.roomNumber}
                        <div className="text-[10px] font-normal text-slate-400">{b.roomType}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-200">{b.guestName}</div>
                        <div className="text-[11px] text-slate-400">{b.guestPhone}</div>
                        {b.guestIdOrPassport && (
                          <div className="text-[10px] text-slate-500">NIC: {b.guestIdOrPassport}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">
                        <div>In: {new Date(b.checkInDate || b.createdAt).toLocaleDateString()}</div>
                        <div>Out: {new Date(b.checkOutDate).toLocaleDateString()}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {b.durationDays}d
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-white text-sm">
                        {currencySymbol} {b.grandTotal.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-emerald-400 font-bold">Paid: {currencySymbol} {b.advancePaid.toLocaleString()}</div>
                        <div className={b.balanceDue > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                          Due: {currencySymbol} {b.balanceDue.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          b.status === 'checked_in'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : b.status === 'checked_out'
                            ? 'bg-slate-700 text-slate-300 border-slate-600'
                            : b.status === 'confirmed'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openBookingTicketModal(b)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                            title="Print Dedicated Booking Ticket"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Ticket</span>
                          </button>
                          {b.status !== 'checked_out' && b.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCancelBooking(b)}
                              className="p-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg border border-rose-800/40"
                              title="Cancel Booking"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Room Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <BedDouble className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingRoom ? `Customize Room ${editingRoom.roomNumber}` : 'Add New Hotel Room'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Royal Hotel & Restaurant &bull; Room Details & Pricing
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRoom} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Room Number <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. 101, 204, VIP-1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="e.g. 1st Floor, Ground Floor"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Room Type & Category <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    placeholder="e.g. Deluxe Double AC, Luxury Suite, Standard Non-AC"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Daily Rate ({currencySymbol}) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ratePerDay}
                    onChange={(e) => setRatePerDay(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold text-emerald-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Guest Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={capacity}
                    onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Current Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="available">🟢 Available</option>
                    <option value="occupied">🔴 Occupied</option>
                    <option value="cleaning">🧹 Cleaning</option>
                    <option value="maintenance">🛠️ Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Internal Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Garden View, Extra Bed Allowed"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Amenities (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={amenitiesInput}
                    onChange={(e) => setAmenitiesInput(e.target.value)}
                    placeholder="AC, King Bed, Attached Bath, TV, Free Wi-Fi, Balcony"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl border border-slate-700 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition-all transform active:scale-95 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : editingRoom ? 'Update Room Details' : 'Create Room'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
