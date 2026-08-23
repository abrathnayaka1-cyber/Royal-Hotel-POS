import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Room, RoomBooking } from '../../types.ts';
import { RoomCheckoutModal } from './RoomCheckoutModal.tsx';
import {
  BedDouble,
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
  Filter,
  DollarSign,
  Users,
  LogOut,
  Building,
  RefreshCw,
  FileText
} from 'lucide-react';

export const RoomsView: React.FC = () => {
  const {
    rooms,
    roomBookings,
    settings,
    openRoomBookingModal,
    openBookingTicketModal,
    updateRoom,
    refreshRooms,
    refreshRoomBookings
  } = usePOS();

  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [checkoutModalRoom, setCheckoutModalRoom] = useState<Room | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Status counts
  const totalCount = rooms.length;
  const availableCount = rooms.filter(r => r.status === 'available').length;
  const occupiedCount = rooms.filter(r => r.status === 'occupied').length;
  const cleaningCount = rooms.filter(r => r.status === 'cleaning').length;
  const maintenanceCount = rooms.filter(r => r.status === 'maintenance').length;

  // Filtered rooms
  const filteredRooms = rooms.filter(room => {
    if (statusFilter !== 'all' && room.status !== statusFilter) return false;
    if (floorFilter !== 'all' && room.floor !== floorFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = room.roomNumber.toLowerCase().includes(q);
      const matchType = room.roomType.toLowerCase().includes(q);
      const matchFloor = room.floor.toLowerCase().includes(q);
      if (!matchNum && !matchType && !matchFloor) return false;
    }
    return true;
  });

  const uniqueFloors = Array.from(new Set(rooms.map(r => r.floor)));

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshRooms(), refreshRoomBookings()]);
    setIsRefreshing(false);
  };

  const handleQuickStatusChange = async (roomId: string, newStatus: Room['status']) => {
    try {
      await updateRoom(roomId, { status: newStatus });
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const getStatusBadge = (status: Room['status']) => {
    switch (status) {
      case 'available':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Available
          </span>
        );
      case 'occupied':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            Occupied
          </span>
        );
      case 'cleaning':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Cleaning
          </span>
        );
      case 'maintenance':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
            <Wrench className="w-3 h-3 text-purple-400" />
            Maintenance
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

  return (
    <div id="pos-rooms-view-container" className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 p-4 space-y-4">
      {/* Top Header Bar & Stats */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <BedDouble className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Hotel Rooms Management
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                {totalCount} Total
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Royal Hotel & Restaurant &bull; Real-Time Room Status, Check-In & Thermal Booking Tickets
            </p>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              statusFilter === 'all'
                ? 'bg-slate-700 text-white border-slate-500'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter('available')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              statusFilter === 'available'
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40 hover:bg-emerald-900/50'
            }`}
          >
            🟢 Available ({availableCount})
          </button>
          <button
            onClick={() => setStatusFilter('occupied')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              statusFilter === 'occupied'
                ? 'bg-rose-600 text-white border-rose-400'
                : 'bg-rose-950/40 text-rose-300 border-rose-900/40 hover:bg-rose-900/50'
            }`}
          >
            🔴 Occupied ({occupiedCount})
          </button>
          <button
            onClick={() => setStatusFilter('cleaning')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              statusFilter === 'cleaning'
                ? 'bg-amber-600 text-white border-amber-400'
                : 'bg-amber-950/40 text-amber-300 border-amber-900/40 hover:bg-amber-900/50'
            }`}
          >
            🧹 Cleaning ({cleaningCount})
          </button>
          
          <div className="flex items-center gap-2 pl-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Refresh Room Status"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="new-room-booking-btn"
              onClick={() => openRoomBookingModal(null)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Booking / Check-In</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/80">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            id="room-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search room number or type..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {uniqueFloors.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
              <Building className="w-3.5 h-3.5" /> Floor:
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setFloorFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  floorFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                All
              </button>
              {uniqueFloors.map(fl => (
                <button
                  key={fl}
                  onClick={() => setFloorFilter(fl)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    floorFilter === fl ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {fl}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rooms Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredRooms.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-slate-900/40 rounded-2xl border border-slate-800 border-dashed">
            <BedDouble className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-slate-300">No rooms found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Try adjusting your filter or search query, or add new rooms in the Admin panel.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRooms.map(room => {
              // Find active booking if occupied
              const activeBooking = roomBookings.find(
                b => b.roomId === room.id && (b.status === 'checked_in' || b.status === 'confirmed')
              ) || (room.currentBookingId ? roomBookings.find(b => b.id === room.currentBookingId) : null);

              const isOccupied = room.status === 'occupied';
              const isAvailable = room.status === 'available';
              const isCleaning = room.status === 'cleaning';

              return (
                <div
                  key={room.id}
                  id={`room-card-${room.roomNumber}`}
                  className={`relative rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-lg ${
                    isOccupied
                      ? 'bg-gradient-to-b from-rose-950/20 to-slate-900/90 border-rose-800/40 hover:border-rose-700'
                      : isAvailable
                      ? 'bg-gradient-to-b from-emerald-950/20 to-slate-900/90 border-emerald-800/40 hover:border-emerald-700'
                      : isCleaning
                      ? 'bg-gradient-to-b from-amber-950/20 to-slate-900/90 border-amber-800/40 hover:border-amber-700'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-800/80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white font-mono tracking-tight">
                            {room.roomNumber}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                            {room.floor}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-200 mt-0.5">
                          {room.roomType}
                        </h3>
                      </div>
                      {getStatusBadge(room.status)}
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                      <div className="flex items-center gap-1 font-mono">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>Up to {room.capacity} Guests</span>
                      </div>
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        {currencySymbol} {room.ratePerDay.toLocaleString()}<span className="text-[10px] text-slate-400 font-normal">/day</span>
                      </div>
                    </div>

                    {/* Amenities chips */}
                    {room.amenities && room.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {room.amenities.slice(0, 3).map((am, idx) => (
                          <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
                            {am}
                          </span>
                        ))}
                        {room.amenities.length > 3 && (
                          <span className="text-[10px] px-1 py-0.5 text-slate-500">
                            +{room.amenities.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active Booking Card Body (if occupied) */}
                  {isOccupied && activeBooking ? (
                    <div className="p-3.5 bg-rose-950/30 border-b border-rose-900/30 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between items-center text-slate-300 font-sans">
                        <span className="font-bold flex items-center gap-1 text-white">
                          <User className="w-3.5 h-3.5 text-rose-400" />
                          {activeBooking.guestName}
                        </span>
                        <span className="text-[11px] text-rose-300 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800/40">
                          #{activeBooking.bookingNumber}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Contact:</span>
                        <span className="text-slate-200">{activeBooking.guestPhone}</span>
                      </div>

                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Check-Out:</span>
                        <span className="text-amber-300 font-semibold">
                          {new Date(activeBooking.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-400 text-[11px] pt-1 border-t border-rose-900/40">
                        <span>Balance Due:</span>
                        <span className="font-bold text-rose-300">
                          {currencySymbol} {activeBooking.balanceDue.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* Action Buttons */}
                  <div className="p-3 bg-slate-950/40 flex items-center justify-between gap-2">
                    {/* Status Dropdown */}
                    <select
                      value={room.status}
                      onChange={(e) => handleQuickStatusChange(room.id, e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      <option value="available">🟢 Available</option>
                      <option value="occupied">🔴 Occupied</option>
                      <option value="cleaning">🧹 Cleaning</option>
                      <option value="maintenance">🛠️ Maint.</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      {isAvailable && (
                        <button
                          id={`book-room-${room.roomNumber}-btn`}
                          onClick={() => openRoomBookingModal(room)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/30 flex items-center gap-1 transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Book / Check-In</span>
                        </button>
                      )}

                      {isOccupied && (
                        <>
                          {activeBooking && (
                            <button
                              onClick={() => openBookingTicketModal(activeBooking)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs transition-colors border border-slate-700"
                              title="View & Print Booking Ticket"
                            >
                              <Printer className="w-4 h-4 text-emerald-400" />
                            </button>
                          )}
                          <button
                            id={`checkout-room-${room.roomNumber}-btn`}
                            onClick={() => setCheckoutModalRoom(room)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-900/30 flex items-center gap-1 transition-all active:scale-95"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Check-Out</span>
                          </button>
                        </>
                      )}

                      {isCleaning && (
                        <button
                          onClick={() => handleQuickStatusChange(room.id, 'available')}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/40 flex items-center gap-1 transition-all active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Cleaned (Available)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      <RoomCheckoutModal
        room={checkoutModalRoom}
        isOpen={!!checkoutModalRoom}
        onClose={() => setCheckoutModalRoom(null)}
      />
    </div>
  );
};
