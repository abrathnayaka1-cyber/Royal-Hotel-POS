import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import {
  Printer,
  X,
  CheckCircle,
  FileText,
  Calendar,
  User,
  Phone,
  BedDouble,
  CreditCard,
  Building,
  Share2,
  Clock
} from 'lucide-react';

export const RoomBookingTicketModal: React.FC = () => {
  const {
    isBookingTicketModalOpen,
    closeBookingTicketModal,
    recentBookingTicket,
    rooms,
    settings,
    printRoomTicket
  } = usePOS();

  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isBookingTicketModalOpen || !recentBookingTicket) return null;

  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const tagline = settings?.businessTagline || 'Fine Hospitality, Restaurant & Bar';
  const address = settings?.address || 'Kurunegala Road, Puttalam, Sri Lanka';
  const phone = settings?.phone || '032 226 52 66 / 0772256569';

  const matchedRoom = rooms.find(r => r.id === recentBookingTicket.roomId);
  const itemChargesTotal = (recentBookingTicket.itemCharges || []).reduce((sum, charge) => sum + charge.total, 0);
  const otherExtraCharges = Math.max(0, recentBookingTicket.extraCharges - itemChargesTotal);

  const formattedCreated = new Date(recentBookingTicket.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const formattedCheckIn = new Date(recentBookingTicket.checkInDate || recentBookingTicket.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const formattedCheckOut = new Date(recentBookingTicket.checkOutDate).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printRoomTicket(recentBookingTicket);
    } catch (err) {
      console.error('Print ticket error:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div id="room-booking-ticket-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        id="room-booking-ticket-modal-container"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                Room Booking Ticket
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  {recentBookingTicket.status.toUpperCase().replace('_', ' ')}
                </span>
              </h3>
              <p className="text-xs text-slate-400">Ready for Thermal / Paper Print</p>
            </div>
          </div>
          <button
            id="close-room-booking-ticket-modal-btn"
            onClick={closeBookingTicketModal}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket Preview Container (Thermal Paper Look) */}
        <div className="p-6 bg-slate-950/60 overflow-y-auto max-h-[68vh] flex justify-center">
          <div 
            id="thermal-room-ticket-preview"
            className="w-full max-w-[340px] bg-white text-black p-5 rounded-lg shadow-xl font-mono text-[12px] leading-tight border border-slate-200 select-none"
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <div className="font-black text-sm uppercase tracking-wide">{businessName}</div>
              <div className="text-[10px] text-gray-700 mt-0.5">{tagline}</div>
              <div className="text-[9.5px] text-gray-600 mt-0.5">{address}</div>
              <div className="text-[9.5px] text-gray-600">Tel: {phone}</div>
              
              <div className="mt-2.5 py-1 px-2 bg-black text-white font-black text-xs uppercase tracking-wider rounded">
                *** ROOM BOOKING TICKET ***
              </div>
              <div className="text-[11px] font-bold mt-1">TICKET #{recentBookingTicket.bookingNumber}</div>
              <div className="text-sm font-black mt-1 py-0.5 px-2 bg-gray-100 border border-gray-300 rounded inline-block">
                ROOM {recentBookingTicket.roomNumber}
              </div>
              <div className="text-[10px] text-gray-700 mt-0.5">
                {recentBookingTicket.roomType} {matchedRoom?.floor ? `(${matchedRoom.floor})` : ''}
              </div>
            </div>

            {/* Guest Details */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="font-bold">Guest Name:</span>
                <span className="font-bold text-right">{recentBookingTicket.guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Phone:</span>
                <span className="font-bold">{recentBookingTicket.guestPhone}</span>
              </div>
              {recentBookingTicket.guestIdOrPassport && (
                <div className="flex justify-between">
                  <span className="text-gray-700">NIC/Passport:</span>
                  <span className="font-bold">{recentBookingTicket.guestIdOrPassport}</span>
                </div>
              )}
              {recentBookingTicket.guestAddress && (
                <div className="flex justify-between">
                  <span className="text-gray-700">City/Address:</span>
                  <span>{recentBookingTicket.guestAddress}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-700">Guests:</span>
                <span className="font-bold">{recentBookingTicket.numberOfGuests} Person(s)</span>
              </div>
            </div>

            {/* Schedule */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="font-bold">Check-In:</span>
                <span className="font-bold">{formattedCheckIn}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Check-Out:</span>
                <span className="font-bold">{formattedCheckOut}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Duration:</span>
                <span className="font-bold">{recentBookingTicket.durationDays} Night(s) / Day(s)</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 pt-0.5">
                <span>Issued At:</span>
                <span>{formattedCreated}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>Receptionist:</span>
                <span>{recentBookingTicket.cashierName || 'Admin'}</span>
              </div>
            </div>

            {/* Charges */}
            <div className="py-2 border-b-2 border-solid border-black text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Room Rate / Day:</span>
                <span>{currencySymbol} {recentBookingTicket.ratePerDay.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Room Charge ({recentBookingTicket.durationDays}d):</span>
                <span>{currencySymbol} {recentBookingTicket.totalRoomCharge.toLocaleString()}</span>
              </div>
              {otherExtraCharges > 0 && (
                <div className="flex justify-between">
                  <span>Extra Bed / Services:</span>
                  <span>{currencySymbol} {otherExtraCharges.toLocaleString()}</span>
                </div>
              )}
              {(recentBookingTicket.itemCharges || []).flatMap(charge => charge.items.map((item, index) => (
                <div key={`${charge.billId}-${index}`} className="flex justify-between gap-2">
                  <span>{item.productName} ({item.size}) × {item.quantity}</span>
                  <span className="shrink-0">{currencySymbol} {item.total.toLocaleString()}</span>
                </div>
              )))}
              {recentBookingTicket.discount > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Discount:</span>
                  <span>-{currencySymbol} {recentBookingTicket.discount.toLocaleString()}</span>
                </div>
              )}
              {recentBookingTicket.tax > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Tax:</span>
                  <span>{currencySymbol} {recentBookingTicket.tax.toLocaleString()}</span>
                </div>
              )}
              
              <div className="flex justify-between font-black text-[13px] pt-1.5 border-t border-gray-300">
                <span>TOTAL AMOUNT:</span>
                <span>{currencySymbol} {recentBookingTicket.grandTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-[12px] text-emerald-800">
                <span>ADVANCE PAID:</span>
                <span>{currencySymbol} {recentBookingTicket.advancePaid.toLocaleString()}</span>
              </div>
              <div className={`flex justify-between font-black text-[12px] ${recentBookingTicket.balanceDue > 0 ? 'text-rose-900 bg-rose-50 px-1 rounded' : 'text-gray-800'}`}>
                <span>BALANCE DUE:</span>
                <span>{currencySymbol} {recentBookingTicket.balanceDue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>Payment Method:</span>
                <span className="uppercase font-bold">{recentBookingTicket.paymentMethod}</span>
              </div>
            </div>

            {recentBookingTicket.notes && (
              <div className="py-1.5 border-b border-dashed border-gray-400 text-[10px] text-gray-700">
                <span className="font-bold">Notes:</span> {recentBookingTicket.notes}
              </div>
            )}

            {/* Policies */}
            <div className="py-2 text-[9px] text-gray-600 leading-tight space-y-0.5 border-b border-dashed border-gray-400">
              <div>&bull; Standard Check-Out Time: <strong>12:00 PM Noon</strong></div>
              <div>&bull; Free Wi-Fi: <strong>RoyalGreen_Guest</strong></div>
              <div>&bull; Room Service Dial: <strong>Ext. 100 / Reception</strong></div>
            </div>

            {/* Signatures */}
            <div className="pt-4 pb-2 flex justify-between text-[9px] text-gray-700">
              <div className="text-center">
                <div>_________________</div>
                <div className="font-bold mt-0.5">Guest Signature</div>
              </div>
              <div className="text-center">
                <div>_________________</div>
                <div className="font-bold mt-0.5">Authorized Sign</div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-2 text-[10px] font-bold text-gray-800">
              Thank you for choosing Royal Hotel!
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={closeBookingTicketModal}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="print-thermal-room-ticket-btn"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing Ticket...' : 'Print Thermal Ticket (80mm/58mm)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
