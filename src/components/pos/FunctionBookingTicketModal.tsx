import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import {
  Printer,
  X,
  FileText,
  Calendar,
  User,
  Phone,
  PartyPopper,
  CreditCard,
  Building,
  Clock
} from 'lucide-react';

export const FunctionBookingTicketModal: React.FC = () => {
  const {
    isFunctionTicketModalOpen,
    closeFunctionTicketModal,
    recentFunctionTicket,
    functionHalls,
    settings,
    printFunctionTicket
  } = usePOS();

  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isFunctionTicketModalOpen || !recentFunctionTicket) return null;

  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const tagline = settings?.businessTagline || 'Fine Hospitality, Restaurant & Bar';
  const address = settings?.address || 'Kurunegala Road, Puttalam, Sri Lanka';
  const phone = settings?.phone || '032 226 52 66 / 0772256569';

  const matchedHall = functionHalls.find(h => h.id === recentFunctionTicket.hallId);

  const formattedCreated = new Date(recentFunctionTicket.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const formattedEventDate = new Date(recentFunctionTicket.eventDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const sessionLabel =
    recentFunctionTicket.session === 'day'
      ? 'Day Session (9 AM - 5 PM)'
      : recentFunctionTicket.session === 'evening'
      ? 'Evening Session (6 PM - 12 AM)'
      : 'Full Day Session';

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printFunctionTicket(recentFunctionTicket);
    } catch (err) {
      console.error('Print ticket error:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div id="function-booking-ticket-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        id="function-booking-ticket-modal-container"
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-xl border border-violet-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                Function Booking Ticket
                <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-semibold border border-violet-500/30">
                  {recentFunctionTicket.status.toUpperCase().replace('_', ' ')}
                </span>
              </h3>
              <p className="text-xs text-slate-400">Ready for Thermal / Paper Print</p>
            </div>
          </div>
          <button
            id="close-function-ticket-modal-btn"
            onClick={closeFunctionTicketModal}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket Preview Container (Thermal Paper Look) */}
        <div className="p-6 bg-slate-950/60 overflow-y-auto max-h-[68vh] flex justify-center">
          <div
            id="thermal-function-ticket-preview"
            className="w-full max-w-[340px] bg-white text-black p-5 rounded-lg shadow-xl font-mono text-[12px] leading-tight border border-slate-200 select-none"
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <div className="font-black text-sm uppercase tracking-wide">{businessName}</div>
              <div className="text-[10px] text-gray-700 mt-0.5">{tagline}</div>
              <div className="text-[9.5px] text-gray-600 mt-0.5">{address}</div>
              <div className="text-[9.5px] text-gray-600">Tel: {phone}</div>

              <div className="mt-2.5 py-1 px-2 bg-black text-white font-black text-xs uppercase tracking-wider rounded">
                *** FUNCTION BOOKING TICKET ***
              </div>
              <div className="text-[11px] font-bold mt-1">TICKET #{recentFunctionTicket.bookingNumber}</div>
              <div className="text-sm font-black mt-1 py-0.5 px-2 bg-gray-100 border border-gray-300 rounded inline-block">
                {recentFunctionTicket.hallName}
              </div>
              <div className="text-[10px] text-gray-700 mt-0.5">
                {recentFunctionTicket.hallType} {matchedHall?.floor ? `(${matchedHall.floor})` : ''}
              </div>
              <div className="text-[11px] font-black mt-0.5">
                {recentFunctionTicket.eventType.replace('_', ' ').toUpperCase()} EVENT
              </div>
            </div>

            {/* Customer Details */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="font-bold">Customer:</span>
                <span className="font-bold text-right">{recentFunctionTicket.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Phone:</span>
                <span className="font-bold">{recentFunctionTicket.customerPhone}</span>
              </div>
              {recentFunctionTicket.customerAddress && (
                <div className="flex justify-between">
                  <span className="text-gray-700">City/Address:</span>
                  <span>{recentFunctionTicket.customerAddress}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-700">Expected Guests:</span>
                <span className="font-bold">{recentFunctionTicket.expectedGuests} Person(s)</span>
              </div>
            </div>

            {/* Schedule */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="font-bold">Event Date:</span>
                <span className="font-bold">{formattedEventDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Session:</span>
                <span className="font-bold">{sessionLabel}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 pt-0.5">
                <span>Issued At:</span>
                <span>{formattedCreated}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>Booked By:</span>
                <span>{recentFunctionTicket.cashierName || 'Admin'}</span>
              </div>
            </div>

            {/* Charges */}
            <div className="py-2 border-b-2 border-solid border-black text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Hall Charge:</span>
                <span>{currencySymbol} {recentFunctionTicket.hallCharge.toLocaleString()}</span>
              </div>
              {recentFunctionTicket.numberOfPlates > 0 && (
                <div className="flex justify-between">
                  <span>Food ({recentFunctionTicket.numberOfPlates} plates):</span>
                  <span>{currencySymbol} {recentFunctionTicket.plateCharge.toLocaleString()}</span>
                </div>
              )}
              {recentFunctionTicket.extraServices > 0 && (
                <div className="flex justify-between">
                  <span>Extra Services:</span>
                  <span>{currencySymbol} {recentFunctionTicket.extraServices.toLocaleString()}</span>
                </div>
              )}
              {recentFunctionTicket.discount > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Discount:</span>
                  <span>-{currencySymbol} {recentFunctionTicket.discount.toLocaleString()}</span>
                </div>
              )}
              {recentFunctionTicket.tax > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Tax:</span>
                  <span>{currencySymbol} {recentFunctionTicket.tax.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between font-black text-[13px] pt-1.5 border-t border-gray-300">
                <span>TOTAL AMOUNT:</span>
                <span>{currencySymbol} {recentFunctionTicket.grandTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-[12px] text-emerald-800">
                <span>ADVANCE PAID:</span>
                <span>{currencySymbol} {recentFunctionTicket.advancePaid.toLocaleString()}</span>
              </div>
              <div className={`flex justify-between font-black text-[12px] ${recentFunctionTicket.balanceDue > 0 ? 'text-rose-900 bg-rose-50 px-1 rounded' : 'text-gray-800'}`}>
                <span>BALANCE DUE:</span>
                <span>{currencySymbol} {recentFunctionTicket.balanceDue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>Payment Method:</span>
                <span className="uppercase font-bold">{recentFunctionTicket.paymentMethod}</span>
              </div>
            </div>

            {recentFunctionTicket.notes && (
              <div className="py-1.5 border-b border-dashed border-gray-400 text-[10px] text-gray-700">
                <span className="font-bold">Notes:</span> {recentFunctionTicket.notes}
              </div>
            )}

            {/* Policies */}
            <div className="py-2 text-[9px] text-gray-600 leading-tight space-y-0.5 border-b border-dashed border-gray-400">
              <div>&bull; Hall opens: <strong>8:00 AM</strong> &bull; Event end: <strong>12:00 AM</strong></div>
              <div>&bull; Outside catering/bands need prior approval</div>
              <div>&bull; Reservations Dial: <strong>Ext. 100 / Reception</strong></div>
            </div>

            {/* Signatures */}
            <div className="pt-4 pb-2 flex justify-between text-[9px] text-gray-700">
              <div className="text-center">
                <div>_________________</div>
                <div className="font-bold mt-0.5">Customer Signature</div>
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
            onClick={closeFunctionTicketModal}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="print-thermal-function-ticket-btn"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-900/40 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
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
