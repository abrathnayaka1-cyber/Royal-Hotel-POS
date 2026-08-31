import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api.ts';
import { SystemSettings } from '../../types.ts';
import { Settings, Save, CheckCircle, AlertCircle, RefreshCw, Building, DollarSign, Receipt, Printer, Database, Download, Upload, ShieldCheck, History, HardDrive } from 'lucide-react';

export const SystemSettingsView: React.FC<{
  settings: SystemSettings | null;
  onSettingsUpdated: () => void;
}> = ({ settings: initialSettings, onSettingsUpdated }) => {
  const [form, setForm] = useState<SystemSettings>({
    businessName: 'Royal Hotel & Restaurant',
    businessTagline: 'Fine Liquor, Cuisine & Hospitality',
    address: 'No. 42 Beach Road, Puttalam, Sri Lanka',
    phone: '+94 32 226 5500 / +94 77 123 4567',
    email: 'royalgreengardenputtalam@gmail.com',
    website: 'www.royalgreengarden.lk',
    currency: 'LKR',
    currencySymbol: 'Rs.',
    taxRate: 0,
    serviceChargeRate: 10,
    allowNegativeStock: false,
    enableDiscounts: true,
    maxDiscountPercentage: 20,
    invoicePrefix: 'INV-',
    billPrefix: 'BILL-',
    kotPrefix: 'KOT-',
    receiptHeader: 'Welcome to Royal Hotel',
    receiptFooter: 'Thank you for visiting Royal Hotel! Please visit again.',
    lowStockDefaultThreshold: 5,
    printerType: 'thermal',
    thermalWidth: '80mm',
    autoPrintAfterPayment: false,
    allowCashierToPrint: true,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isBackupLoading, setIsBackupLoading] = useState<boolean>(false);
  const [backupList, setBackupList] = useState<{ filename: string; size: number; createdAt: string }[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const fetchBackups = async () => {
    try {
      const data = await fetchApi<{ filename: string; size: number; createdAt: string }[]>('/database/backups');
      setBackupList(data || []);
    } catch (_) {}
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateSnapshot = async () => {
    try {
      setIsBackupLoading(true);
      setSuccessMsg(null);
      setErrorMsg(null);
      const res = await fetchApi<{ success: boolean; backup: any }>('/database/backup', { method: 'POST' });
      setSuccessMsg(`Database snapshot created successfully: ${res.backup.filename}`);
      fetchBackups();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create backup snapshot.');
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleDownloadDatabase = async () => {
    try {
      const token = localStorage.getItem('pos_auth_token');
      const response = await fetch('/api/database/download', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('Failed to download database file.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `royal_hotel_pos_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMsg('Complete database JSON file downloaded safely to your local computer!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error downloading database.');
    }
  };

  const handleFileUploadRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (!window.confirm('⚠️ ARE YOU SURE you want to restore this database? It will safely replace the current database state and load all items, prices, stock, bills, and history from the file.')) {
          return;
        }

        setIsBackupLoading(true);
        const res = await fetchApi<{ success: boolean; message: string }>('/database/restore', {
          method: 'POST',
          body: JSON.stringify({ databaseData: parsed })
        });

        setSuccessMsg(res.message || 'Database restored successfully!');
        onSettingsUpdated();
        fetchBackups();
      } catch (err: any) {
        setErrorMsg(`Failed to restore database: ${err.message}`);
      } finally {
        setIsBackupLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleServerFileRestore = async (filename: string) => {
    if (!window.confirm(`⚠️ Restore from snapshot "${filename}"? All data will be reverted to this point.`)) {
      return;
    }
    try {
      setIsBackupLoading(true);
      const res = await fetchApi<{ success: boolean; message: string }>('/database/restore-file', {
        method: 'POST',
        body: JSON.stringify({ filename })
      });
      setSuccessMsg(res.message);
      onSettingsUpdated();
      fetchBackups();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to restore snapshot.');
    } finally {
      setIsBackupLoading(false);
    }
  };

  useEffect(() => {
    if (initialSettings) {
      setForm({
        ...initialSettings,
        printerType: initialSettings.printerType || 'thermal',
        thermalWidth: initialSettings.thermalWidth || '80mm',
        autoPrintAfterPayment: initialSettings.autoPrintAfterPayment ?? false,
        allowCashierToPrint: initialSettings.allowCashierToPrint ?? true,
      });
    }
  }, [initialSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setSuccessMsg(null);
      setErrorMsg(null);

      await fetchApi('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          taxRate: Number(form.taxRate || 0),
          serviceChargeRate: Number(form.serviceChargeRate || 0),
          maxDiscountPercentage: Number(form.maxDiscountPercentage || 20),
          lowStockDefaultThreshold: Number(form.lowStockDefaultThreshold || 5),
        }),
      });

      setSuccessMsg('System configuration saved successfully!');
      onSettingsUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          System & Business Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure business details, tax rates, service charges, thermal printer width, and receipt formatting
        </p>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Thermal Printer Hardware Settings Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Printer className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Thermal POS Printer Configuration</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Printer Type</label>
              <select
                value={form.printerType || 'thermal'}
                onChange={e => setForm({ ...form, printerType: e.target.value as any })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="thermal">Thermal Receipt Printer (Standard POS)</option>
                <option value="a4">Standard A4 / Office Printer</option>
                <option value="other">Other Generic Printer</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Thermal mode formats receipts specifically for continuous roll paper.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Thermal Receipt Width</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, thermalWidth: '80mm' })}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer text-center ${
                    form.thermalWidth === '80mm'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  80mm (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, thermalWidth: '58mm' })}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer text-center ${
                    form.thermalWidth === '58mm'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  58mm (Compact)
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Select 80mm for standard commercial thermal printers or 58mm for mini portable printers.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Auto Print After Payment</label>
              <div className="flex items-center gap-3 mt-1.5">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.autoPrintAfterPayment}
                    onChange={e => setForm({ ...form, autoPrintAfterPayment: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {form.autoPrintAfterPayment ? 'ON (Opens print dialog on checkout)' : 'OFF (Cashier clicks Print Receipt)'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Allow Cashier to Print Receipts</label>
              <div className="flex items-center gap-3 mt-1.5">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowCashierToPrint ?? true}
                    onChange={e => setForm({ ...form, allowCashierToPrint: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {form.allowCashierToPrint ?? true ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Business Information Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Building className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Business Identity & Contact</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Business / Bar Name *</label>
              <input
                type="text"
                required
                value={form.businessName}
                onChange={e => setForm({ ...form, businessName: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">Address *</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Email Address</label>
              <input
                type="email"
                value={form.email || ''}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Website / Tagline</label>
              <input
                type="text"
                value={form.website || form.businessTagline || ''}
                onChange={e => setForm({ ...form, website: e.target.value, businessTagline: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Currency & Financial Rates Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Currency & Billing Rates</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Currency Symbol *</label>
              <input
                type="text"
                required
                value={form.currencySymbol}
                onChange={e => setForm({ ...form, currencySymbol: e.target.value })}
                className="w-full text-xs font-black px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Default Service Charge (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.serviceChargeRate}
                onChange={e => setForm({ ...form, serviceChargeRate: Number(e.target.value) })}
                className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Default Tax / VAT (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.taxRate}
                onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })}
                className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Enable Discounts</label>
              <label className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enableDiscounts}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      enableDiscounts: e.target.checked,
                      maxDiscountPercentage: e.target.checked ? (f.maxDiscountPercentage || 20) : 0,
                    }))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Allow cashiers to apply discounts
                </span>
              </label>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Max Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                disabled={!form.enableDiscounts}
                value={form.maxDiscountPercentage}
                onChange={e => setForm({ ...form, maxDiscountPercentage: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Low Stock Alert Threshold</label>
              <input
                type="number"
                min="0"
                max="100000"
                value={form.lowStockDefaultThreshold}
                onChange={e => setForm({ ...form, lowStockDefaultThreshold: Math.max(0, Number(e.target.value)) })}
                className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Receipt Messages Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Receipt className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Thermal Receipt Customization</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Receipt Header Line</label>
              <input
                type="text"
                value={form.receiptHeader || ''}
                onChange={e => setForm({ ...form, receiptHeader: e.target.value })}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Receipt Footer Note</label>
              <input
                type="text"
                value={form.receiptFooter || ''}
                onChange={e => setForm({ ...form, receiptFooter: e.target.value })}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Database Backup & Disaster Recovery Card (100% Data Preservation) */}
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/40 dark:border-emerald-600/40 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Database Backup & 100% Data Preservation
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-md">
                    Hostinger Safe
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Protect all your products, stock quantities, bar movements, bills, room bookings & invoices across redeployments.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={isBackupLoading}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{isBackupLoading ? 'Working...' : 'Create Snapshot'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadDatabase}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Download full JSON database directly to your laptop/phone"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export DB (JSON)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Download & Upload Restore Guide */}
            <div className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Upload className="w-4 h-4 text-blue-500" />
                <span>Restore Database From File</span>
              </div>
              <p className="text-[11px] text-slate-500">
                If you redeploy a new ZIP or migrate servers, upload your downloaded JSON database file here to restore 100% of your items, history & stock instantly.
              </p>
              <div>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose & Restore JSON File</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUploadRestore}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Persistent Data Path info */}
            <div className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Hostinger Permanent Directory</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                You can configure Hostinger environment variable <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-emerald-400 font-mono text-[10px] rounded">POS_DATA_DIR=/home/u123456789/pos_data</code> so your database stays safely outside the web application ZIP root directory forever!
              </p>
            </div>
          </div>

          {/* Server Snapshots list */}
          {backupList.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Recent Server Snapshots ({backupList.length})</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {backupList.map(bk => (
                  <div
                    key={bk.filename}
                    className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 rounded-lg text-xs border border-slate-200 dark:border-slate-800/80"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-[11px]">
                        {bk.filename}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(bk.createdAt).toLocaleString()} • {(bk.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleServerFileRestore(bk.filename)}
                      disabled={isBackupLoading}
                      className="px-2.5 py-1 text-[11px] font-bold text-amber-500 hover:text-amber-400 bg-amber-950/30 hover:bg-amber-950/60 border border-amber-800/40 rounded-lg cursor-pointer transition-colors"
                    >
                      Rollback
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isLoading ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
