import React from 'react';
import { usePOS } from '../../context/POSContext.tsx';
import { Database, Printer, CheckCircle2 } from 'lucide-react';

export const FooterStatusBar: React.FC = () => {
  const { products, heldBills } = usePOS();

  return (
    <footer
      id="pos-footer-status-bar"
      className="h-8 bg-slate-900 text-slate-400 px-4 sm:px-6 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest border-t border-slate-800 select-none shrink-0"
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <Database className="w-3 h-3" />
          <span>DB STATUS: CONNECTED</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-slate-300">
          <Printer className="w-3 h-3 text-blue-400" />
          <span>KITCHEN: READY</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-slate-300">
          <Printer className="w-3 h-3 text-indigo-400" />
          <span>BAR: PRINTER READY</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden lg:inline text-slate-500">
          {products.length} CATALOG ITEMS LOADED
        </span>
        <span className="text-slate-400">
          ROYAL HOTEL POS v1.1.0
        </span>
      </div>
    </footer>
  );
};
