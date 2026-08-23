import React from 'react';
import { CategorySidebar } from './CategorySidebar.tsx';
import { CategoryTabs } from './CategoryTabs.tsx';
import { ProductGrid } from './ProductGrid.tsx';
import { RoomsView } from './RoomsView.tsx';
import { CartPanel } from './CartPanel.tsx';
import { FooterStatusBar } from './FooterStatusBar.tsx';
import { VariantSelectorModal } from './VariantSelectorModal.tsx';
import { PaymentModal } from './PaymentModal.tsx';
import { HeldBillsModal } from './HeldBillsModal.tsx';
import { KOTModal } from './KOTModal.tsx';
import { ReceiptModal } from './ReceiptModal.tsx';
import { RoomBookingModal } from './RoomBookingModal.tsx';
import { RoomBookingTicketModal } from './RoomBookingTicketModal.tsx';
import { BarcodeScannerListener } from './BarcodeScannerListener.tsx';
import { usePOS } from '../../context/POSContext.tsx';
import { Loader2 } from 'lucide-react';

export const POSScreen: React.FC = () => {
  const { isLoading, selectedCategory } = usePOS();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Connecting Station & Catalog...
          </span>
        </div>
      </div>
    );
  }

  const isRoomsView = selectedCategory === 'rooms';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* Hardware Barcode Scanner Listener */}
      <BarcodeScannerListener />

      {/* Main Screen Three-Column Grid */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Left: Category Sidebar */}
        <CategorySidebar />

        {/* Center: Search / Filters + Product Grid OR Rooms View */}
        {isRoomsView ? (
          <RoomsView />
        ) : (
          <main className="flex-1 flex flex-col overflow-hidden p-3 md:p-4 gap-3 bg-slate-100 dark:bg-slate-950 min-w-0">
            {/* Top Search & Filter Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-xs">
              <CategoryTabs />
            </div>

            {/* Scrollable Products Grid */}
            <div className="flex-1 overflow-y-auto pr-0.5">
              <ProductGrid />
            </div>
          </main>
        )}

        {/* Right: Cart & Actions Panel */}
        <div className="w-full md:w-[360px] lg:w-[400px] xl:w-[420px] shrink-0 h-[480px] md:h-full">
          <CartPanel />
        </div>
      </div>

      {/* Bottom Status Bar */}
      <FooterStatusBar />

      {/* Modals */}
      <VariantSelectorModal />
      <PaymentModal />
      <HeldBillsModal />
      <KOTModal />
      <ReceiptModal />
      <RoomBookingModal />
      <RoomBookingTicketModal />
    </div>
  );
};

