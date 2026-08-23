import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { KOT, KOTStatus } from '../../types.ts';
import {
  UtensilsCrossed,
  Clock,
  CheckCircle,
  PlayCircle,
  XCircle,
  RefreshCw,
  Wine,
  Car,
  Home,
  MessageSquare
} from 'lucide-react';

export const KOTManager: React.FC = () => {
  const [kots, setKots] = useState<KOT[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'active' | 'completed' | 'all'>('active');

  const loadKots = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<KOT[]>('/kot');
      setKots(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load KOTs:', err);
      setKots([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadKots();
    const interval = setInterval(loadKots, 10000); // 10s auto-refresh for kitchen display
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (id: string, status: KOTStatus) => {
    try {
      await fetchApi(`/kot/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadKots();
    } catch (err: any) {
      alert(err.message || 'Failed to update KOT status.');
    }
  };

  const filteredKots = kots.filter(k => {
    if (activeFilter === 'active') return k.status === 'pending' || k.status === 'preparing' || k.status === 'ready';
    if (activeFilter === 'completed') return k.status === 'completed' || k.status === 'cancelled';
    return true;
  });

  const getStatusBadge = (status: KOTStatus) => {
    switch (status) {
      case 'pending':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 animate-pulse">PENDING</span>;
      case 'preparing':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300">PREPARING</span>;
      case 'ready':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">READY</span>;
      case 'completed':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">SERVED</span>;
      case 'cancelled':
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">CANCELLED</span>;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Kitchen Display System (KDS / KOT)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Live order queue for bar mixologists, chefs, and kitchen expeditors
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'active' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              Active Queue ({kots.filter(k => k.status !== 'completed' && k.status !== 'cancelled').length})
            </button>
            <button
              onClick={() => setActiveFilter('completed')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'completed' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              Served / Done
            </button>
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              All Tickets
            </button>
          </div>

          <button
            onClick={loadKots}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tickets Grid */}
      {filteredKots.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8">
          <UtensilsCrossed className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No Kitchen Orders in Queue</h3>
          <p className="text-xs text-slate-400 mt-1">
            New orders sent from the POS screen will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKots.map(kot => {
            const timeAgo = new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={kot.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {kot.kotNumber}
                      </span>
                      {kot.tableNumber && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-bold text-[11px] rounded-md">
                          Table {kot.tableNumber}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {kot.orderType.toUpperCase()} • {timeAgo} • By: {kot.cashierName}
                    </div>
                  </div>

                  <div>{getStatusBadge(kot.status)}</div>
                </div>

                {/* Items Content */}
                <div className="p-4 space-y-2.5 flex-1">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {kot.items.map((item, i) => (
                      <div key={i} className="py-2 first:pt-0 flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-bold text-xs text-slate-900 dark:text-white">
                            {item.productName}
                          </div>
                          <div className="text-[11px] text-slate-500">{item.size}</div>
                          {item.notes && (
                            <div className="text-[10px] text-amber-600 italic mt-0.5">
                              ** {item.notes}
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg font-black text-xs text-slate-900 dark:text-white">
                          x{item.quantity}
                        </div>
                      </div>
                    ))}
                  </div>

                  {kot.notes && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span>{kot.notes}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2">
                  {kot.status === 'pending' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'preparing')}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Start Preparing
                    </button>
                  )}

                  {kot.status === 'preparing' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'ready')}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Mark Ready for Pickup
                    </button>
                  )}

                  {kot.status === 'ready' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'completed')}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Mark Completed / Served
                    </button>
                  )}

                  {kot.status !== 'completed' && kot.status !== 'cancelled' && (
                    <button
                      onClick={() => handleUpdateStatus(kot.id, 'cancelled')}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                      title="Cancel Ticket"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
