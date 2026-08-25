import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { usePOS } from '../../context/POSContext.tsx';
import { KitchenAdjustmentRequest } from '../../types.ts';
import {
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Check,
  X,
  Clock,
  CheckCircle2,
} from 'lucide-react';

/**
 * ADJUSTMENT APPROVALS — Super Admin control area for high-risk kitchen
 * stock adjustments (large physical count variances). Rendered inside the
 * Admin suite's Food & Kitchen section; the backend rejects approve/reject
 * calls from any non-super_admin role with 403.
 */
export const KitchenApprovals: React.FC = () => {
  const { settings } = usePOS();
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  const [requests, setRequests] = useState<KitchenAdjustmentRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<KitchenAdjustmentRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetchApi<KitchenAdjustmentRequest[]>(`/kitchen/requests?status=${statusFilter}`);
      setRequests(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load adjustment requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const approve = async (r: KitchenAdjustmentRequest) => {
    try {
      setErrorMsg(null);
      await fetchApi(`/kitchen/requests/${r.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: `Approved by Super Admin` }),
      });
      setSuccessMsg(`Approved ${r.requestNumber} — stock updated on the ledger.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to approve request.');
    }
  };

  const reject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (rejectNote.trim().length < 3) { setErrorMsg('A rejection note is required.'); return; }
    try {
      setErrorMsg(null);
      await fetchApi(`/kitchen/requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      setRejectTarget(null);
      setRejectNote('');
      setSuccessMsg('Request rejected — stock stays unchanged.');
      setTimeout(() => setSuccessMsg(null), 4000);
      await load();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reject request.');
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-purple-500" />
            Kitchen Adjustment Approvals
            {statusFilter === 'pending' && pendingCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-bold">
                {pendingCount} Pending
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            High-risk kitchen stock corrections requested by Kitchen Managers — approve to update stock, reject to keep it unchanged
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs font-semibold px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={load}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && !rejectTarget && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Requests */}
      <div className="space-y-3">
        {isLoading && <div className="py-16 text-center text-sm font-bold text-slate-400">Loading requests…</div>}
        {!isLoading && requests.length === 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-black text-slate-800 dark:text-slate-200">No {statusFilter} requests</h3>
            <p className="text-xs text-slate-500 mt-1">
              Kitchen Managers only trigger approvals for variances above {currencySymbol} 5,000 per line.
            </p>
          </div>
        )}
        {!isLoading && requests.map(r => (
          <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">{r.requestNumber}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    r.status === 'pending'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      : r.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  }`}>
                    {r.status}
                  </span>
                  {r.countNumber && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">
                      from {r.countNumber}
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-1.5">
                  {r.ingredientName}: {r.currentQty.toLocaleString()} {r.unit} → {r.requestedQty.toLocaleString()} {r.unit}
                  <span className={`ml-2 font-mono text-xs ${r.diffQty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ({r.diffQty > 0 ? '+' : ''}{r.diffQty} {r.unit})
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Variance value <span className="font-black text-rose-600">{currencySymbol} {r.varianceCost.toLocaleString()}</span>
                  {' · '}requested by <strong>{r.requestedByName}</strong>
                  {' · '}<Clock className="w-3 h-3 inline -mt-0.5" /> {new Date(r.createdAt).toLocaleString()}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Reason: {r.reason}</p>
                {r.reviewedByName && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {r.status === 'approved' ? 'Approved' : 'Rejected'} by <strong>{r.reviewedByName}</strong>
                    {r.reviewedAt && ` on ${new Date(r.reviewedAt).toLocaleString()}`}
                    {r.reviewNote && ` — "${r.reviewNote}"`}
                  </p>
                )}
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => approve(r)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    Approve
                  </button>
                  <button
                    onClick={() => { setRejectTarget(r); setRejectNote(''); setErrorMsg(null); }}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Reject {rejectTarget.requestNumber}?</h3>
                <p className="text-xs text-slate-500">Stock stays unchanged; the Kitchen Manager sees your note.</p>
              </div>
              <button onClick={() => setRejectTarget(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={reject} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Rejection Note *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Please re-count with the duty supervisor and resubmit."
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
