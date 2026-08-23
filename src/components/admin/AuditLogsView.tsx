import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { AuditLog } from '../../types.ts';
import { exportToExcel } from '../../lib/exportUtils.ts';
import { ShieldCheck, Search, Download, RefreshCw, Key, ShoppingCart, Settings, Layers, Ban } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const res = await fetchApi<any>('/audit-logs');
      if (Array.isArray(res)) {
        setLogs(res);
      } else if (res && Array.isArray(res.logs)) {
        setLogs(res.logs);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleExport = () => {
    const data = filteredLogs.map(l => ({
      'Date & Time': new Date(l.createdAt).toLocaleString(),
      'User': l.userName,
      'Action Performed': l.action,
      'Entity Type': l.entity || (l as any).entityType || 'SYSTEM',
      'Entity ID': l.entityId || 'N/A',
      'Details': l.details || '',
    }));
    exportToExcel(data, 'System_Audit_Security_Logs');
  };

  const filteredLogs = logs.filter(l => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchUser = l.userName.toLowerCase().includes(q);
      const matchAction = l.action.toLowerCase().includes(q);
      const matchDetails = l.details?.toLowerCase().includes(q);
      if (!matchUser && !matchAction && !matchDetails) return false;
    }
    return true;
  });

  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN')) return <Key className="w-3.5 h-3.5 text-blue-500" />;
    if (action.includes('SALE') || action.includes('BILL')) return <ShoppingCart className="w-3.5 h-3.5 text-emerald-500" />;
    if (action.includes('VOID')) return <Ban className="w-3.5 h-3.5 text-rose-500" />;
    if (action.includes('SETTINGS')) return <Settings className="w-3.5 h-3.5 text-purple-500" />;
    return <Layers className="w-3.5 h-3.5 text-slate-500" />;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            System Security & Audit Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tamper-proof event logs recording user logins, price updates, stock adjustments, bill voids, and settings
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export Logs Excel
          </button>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by user, action, detail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <option value="all">All Audit Actions</option>
            <option value="USER_LOGIN">USER_LOGIN</option>
            <option value="COMPLETE_SALE">COMPLETE_SALE</option>
            <option value="VOID_BILL">VOID_BILL</option>
            <option value="STOCK_ADJUSTMENT">STOCK_ADJUSTMENT</option>
            <option value="CREATE_PRODUCT">CREATE_PRODUCT</option>
            <option value="UPDATE_PRODUCT">UPDATE_PRODUCT</option>
            <option value="UPDATE_SETTINGS">UPDATE_SETTINGS</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-bold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Staff User</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((l, idx) => (
                <tr key={l.id || `log-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    <div>{new Date(l.createdAt).toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </td>

                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {l.userName}
                  </td>

                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {getActionIcon(l.action)}
                      {l.action}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 uppercase text-[10px]">
                    {l.entity || (l as any).entityType || 'SYSTEM'}
                  </td>

                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200 max-w-md">
                    {l.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
