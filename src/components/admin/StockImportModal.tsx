import React, { useEffect, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/universal';
import writeXlsxFile, { type SheetData } from 'write-excel-file/browser';
import Papa from 'papaparse';
import { fetchApi } from '../../lib/api.ts';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Download,
  PackagePlus,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  History,
  Eye,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

// ==========================================
// SMART STOCK IMPORT — types shared with the server module
// ==========================================

type ImportType = 'purchase' | 'physical_count';
type ImportScope = 'bar' | 'all';

interface RawImportRow {
  rowNumber?: number;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  productName?: string;
  size?: string;
  buyingPrice?: string | number | null;
  sellingPrice?: string | number | null;
  quantity?: string | number | null;
  minStock?: string | number | null;
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
}

interface ImportRowDecision {
  excluded?: boolean;
  applyBuyingPrice?: boolean;
  applySellingPrice?: boolean;
  resolvedVariantId?: string;
  quantity?: number;
}

interface ImportPreviewRow {
  rowId: number;
  rowNumber: number;
  productName: string;
  size: string;
  sku?: string;
  quantity: number;
  status: 'MATCHED' | 'NEW_ITEM' | 'PRICE_CHANGE' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'INVALID';
  note?: string;
  excluded: boolean;
  matchedVariantId?: string;
  matchedLabel?: string;
  existingStock?: number;
  finalStock?: number;
  adjustment?: number;
  oldCost?: number;
  newCost?: number;
  oldSell?: number;
  newSell?: number;
  priceChange?: boolean;
  isNewCategory?: boolean;
  isNewCompany?: boolean;
  candidates?: { variantId: string; label: string }[];
}

interface ImportPreviewSummary {
  totalRows: number;
  matched: number;
  newItems: number;
  priceChanges: number;
  newCategories: string[];
  newCompanies: string[];
  unitsToAdd: number;
  totalAdjustment: number;
  needsReview: number;
  invalid: number;
  duplicates: number;
  excluded: number;
}

interface DuplicateImportInfo {
  id: string;
  invoiceNumber?: string;
  supplier?: string;
  fileName?: string;
  importedAt: string;
  importedBy: string;
}

interface ImportHistoryEntry {
  id: string;
  importType: ImportType;
  fileName?: string;
  fileType?: string;
  supplier?: string;
  invoiceNumber?: string;
  summary: {
    matched: number;
    newProducts: number;
    newVariants: number;
    newCategories: number;
    newCompanies: number;
    priceChanges: number;
    totalUnitsAdded: number;
    totalAdjustment: number;
    rowsImported: number;
  };
  userName: string;
  createdAt: string;
}

interface ImportDetailRow {
  productName: string;
  size: string;
  sku?: string;
  status: string;
  quantity: number;
  stockBefore?: number;
  stockAfter?: number;
  adjustment?: number;
  oldCostPrice?: number;
  newCostPrice?: number;
  oldSellingPrice?: number;
  newSellingPrice?: number;
  minStockBefore?: number;
  minStockAfter?: number;
}

interface InventoryPickerItem {
  variantId: string;
  productName: string;
  size: string;
  sku?: string;
  isShot?: boolean;
}

// ==========================================
// Excel / CSV header mapping
// ==========================================

const HEADER_ALIASES: Record<string, keyof RawImportRow> = {
  sku: 'sku', itemcode: 'sku', code: 'sku', productcode: 'sku', itemno: 'sku', itemnumber: 'sku',
  barcode: 'barcode', barcodeno: 'barcode', ean: 'barcode', upc: 'barcode', barcodeid: 'barcode',
  category: 'category', productcategory: 'category', categoryname: 'category',
  brand: 'brand', company: 'brand', brandname: 'brand', companyname: 'brand',
  distillery: 'brand', manufacturer: 'brand',
  product: 'productName', productname: 'productName', item: 'productName',
  itemname: 'productName', name: 'productName', description: 'productName',
  productdescription: 'productName', itemdescription: 'productName',
  size: 'size', variant: 'size', bottlesize: 'size', packsize: 'size', volume: 'size',
  unitsize: 'size', container: 'size',
  buyingprice: 'buyingPrice', buying: 'buyingPrice', cost: 'buyingPrice',
  costprice: 'buyingPrice', unitcost: 'buyingPrice', unitprice: 'buyingPrice',
  purchaseprice: 'buyingPrice', costperunit: 'buyingPrice', landedcost: 'buyingPrice',
  sellingprice: 'sellingPrice', selling: 'sellingPrice', price: 'sellingPrice',
  retail: 'sellingPrice', retailprice: 'sellingPrice', mrp: 'sellingPrice',
  salesprice: 'sellingPrice', saleprice: 'sellingPrice', unitsellingprice: 'sellingPrice',
  salepriceperunit: 'sellingPrice', retailperunit: 'sellingPrice',
  quantity: 'quantity', qty: 'quantity', units: 'quantity', received: 'quantity',
  receivedqty: 'quantity', count: 'quantity', counted: 'quantity',
  physicalcount: 'quantity', countedquantity: 'quantity', stock: 'quantity',
  stockonhand: 'quantity', onhand: 'quantity', availablestock: 'quantity',
  availableqty: 'quantity', quantityonhand: 'quantity', currentstock: 'quantity',
  unitsreceived: 'quantity', qtyreceived: 'quantity',
  minimumstock: 'minStock', minstock: 'minStock', minalert: 'minStock', minimum: 'minStock',
  minstocklevel: 'minStock', reorderlevel: 'minStock', reorderpoint: 'minStock',
  supplier: 'supplier', suppliername: 'supplier', vendor: 'supplier', vendorname: 'supplier',
  invoicenumber: 'invoiceNumber', invoiceno: 'invoiceNumber', invoice: 'invoiceNumber',
  invoiceref: 'invoiceNumber', billnumber: 'invoiceNumber',
  invoicedate: 'invoiceDate', date: 'invoiceDate', invoicedateonly: 'invoiceDate',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapSheetRows(json: Record<string, unknown>[], headerRow = 0): RawImportRow[] {
  return json.map((obj, i) => {
    const row: RawImportRow = { rowNumber: headerRow + i + 2 };
    for (const [key, value] of Object.entries(obj)) {
      const field = HEADER_ALIASES[normalizeHeader(key)];
      if (!field || value === undefined || value === null || String(value).trim() === '') continue;
      let v: unknown = typeof value === 'string' ? value.trim() : value;
      // Excel stores real date cells as serial numbers (e.g. 46245.7) — convert
      // them to YYYY-MM-DD so the invoice date is readable and filterable.
      if (field === 'invoiceDate' && typeof v === 'number' && v > 20000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2200) {
          v = d.toISOString().slice(0, 10);
        }
      }
      (row as Record<string, unknown>)[field] = v;
    }
    return row;
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

const STATUS_BADGE: Record<ImportPreviewRow['status'], string> = {
  MATCHED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  NEW_ITEM: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  PRICE_CHANGE: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  DUPLICATE: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  INVALID: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};

// ==========================================
// Component
// ==========================================

export const StockImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  currencySymbol: string;
}> = ({ isOpen, onClose, onImported, currencySymbol }) => {
  const [tab, setTab] = useState<'import' | 'history'>('import');
  const [step, setStep] = useState<'setup' | 'preview' | 'done'>('setup');

  // Setup
  const [importType, setImportType] = useState<ImportType>('purchase');
  // Bar-only by default: only Bar-category items are matched/updated so a bar
  // purchase never touches food/restaurant stock. Switch to 'all' if needed.
  const [scope, setScope] = useState<ImportScope>('bar');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [summary, setSummary] = useState<ImportPreviewSummary | null>(null);
  const [duplicateImport, setDuplicateImport] = useState<DuplicateImportInfo | null>(null);
  const [decisions, setDecisions] = useState<Record<number, ImportRowDecision>>({});
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Result / errors
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ id: string; summary: ImportHistoryEntry['summary'] } | null>(null);

  // Pick-list for NEEDS_REVIEW resolution
  const [pickerItems, setPickerItems] = useState<InventoryPickerItem[]>([]);

  // History
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [historyDetail, setHistoryDetail] = useState<{ entry: ImportHistoryEntry; rows: ImportDetailRow[] } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Load the variant pick-list once for review resolution
    fetchApi<Array<{ variantId?: string; id: string; productName: string; size: string; sku?: string; isShot?: boolean }>>('/inventory')
      .then(items => {
        setPickerItems(
          (items || [])
            .filter(i => !i.isShot)
            .map(i => ({ variantId: i.variantId || i.id, productName: i.productName, size: i.size, sku: i.sku }))
        );
      })
      .catch(() => setPickerItems([]));
  }, [isOpen]);

  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const list = await fetchApi<ImportHistoryEntry[]>('/inventory/import/history');
      setHistory(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load import history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && tab === 'history') loadHistory();
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const resetAll = () => {
    setStep('setup');
    setScope('bar');
    setSupplier('');
    setInvoiceNumber('');
    setInvoiceDate('');
    setFileName('');
    setFileType('');
    setFileHash('');
    setRawRows([]);
    setParseNote(null);
    setPreviewRows([]);
    setSummary(null);
    setDuplicateImport(null);
    setDecisions({});
    setForceDuplicate(false);
    setShowConfirm(false);
    setErrorMsg(null);
    setImportResult(null);
    setHistoryDetail(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  // ---- Template download (write-excel-file, zero-vulnerability xlsx writer) ----
  const downloadTemplate = async () => {
    const template = [
      {
        'SKU': 'LION-LAG-625', 'Barcode': '4791111222333', 'Category': 'Beer',
        'Brand': 'Lion Brewery Ceylon', 'Product Name': 'Lion Lager', 'Size': '625ml',
        'Buying Price': 580, 'Selling Price': 750, 'Quantity': 48, 'Minimum Stock': 12,
        'Supplier': 'ABC Distributors', 'Invoice Number': 'INV-50031', 'Invoice Date': '2026-08-24',
      },
      {
        'SKU': '', 'Barcode': '', 'Category': 'Arrack', 'Brand': 'Rockland Distilleries',
        'Product Name': 'Extra Special', 'Size': '750ml Bottle',
        'Buying Price': 2950, 'Selling Price': 3650, 'Quantity': 24, 'Minimum Stock': 5,
        'Supplier': '', 'Invoice Number': '', 'Invoice Date': '',
      },
    ];
    const headers = Object.keys(template[0]);
    const headerRow = headers.map(h => ({ value: h, fontWeight: 'bold' as const }));
    const dataRows = template.map(row => headers.map(h => {
      const val = (row as Record<string, unknown>)[h];
      if (typeof val === 'number') return { type: Number, value: val };
      return { type: String, value: val ? String(val) : '' };
    }));
    const sheetData: SheetData = [headerRow, ...dataRows];
    await writeXlsxFile(sheetData, { sheet: 'Stock Import' }).toFile('royal_pos_stock_import_template.xlsx');
  };

  // ---- File parsing ----
  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setParseNote(null);
    setRawRows([]);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext)) {
      setErrorMsg('Unsupported file type. Please upload .xlsx, .xls, .csv or .pdf');
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setErrorMsg('File is too large (max 3.5 MB).');
      return;
    }

    try {
      setIsParsing(true);
      const buffer = await file.arrayBuffer();
      setFileName(file.name);
      setFileType(ext);
      setFileHash(await sha256Hex(buffer));

      if (ext === 'pdf') {
        // Server-side, safe, best-effort text extraction — never touches the DB
        const b64 = btoa(new Uint8Array(buffer).reduce((acc, b) => acc + String.fromCharCode(b), ''));
        const result = await fetchApi<{ rows: RawImportRow[]; note?: string }>('/inventory/import/parse-pdf', {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, dataBase64: b64 }),
        });
        setRawRows((result.rows || []).map((r, i) => ({ ...r, rowNumber: i + 1 })));
        setParseNote(result.note || 'PDF rows extracted — verify quantities and prices carefully in the preview.');
      } else if (ext === 'csv') {
        const text = new TextDecoder().decode(buffer);
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
        });
        const rows = mapSheetRows(parsed.data || []).filter(r =>
          r.productName || r.sku || r.barcode || r.size ||
          (r.quantity !== undefined && String(r.quantity).trim() !== '')
        );
        if (rows.length === 0) {
          setErrorMsg('No valid product rows found. Check the column headers — download the template for the expected format.');
          return;
        }
        setRawRows(rows);
        setParseNote(`${rows.length} row(s) detected in "${file.name}".`);
        // Auto-fill invoice metadata from the file when present
        const first = rows.find(r => r.supplier || r.invoiceNumber || r.invoiceDate);
        if (first) {
          if (!supplier && first.supplier) setSupplier(String(first.supplier));
          if (!invoiceNumber && first.invoiceNumber) setInvoiceNumber(String(first.invoiceNumber));
          if (!invoiceDate && first.invoiceDate) setInvoiceDate(String(first.invoiceDate));
        }
      } else {
        // read-excel-file's default export returns EVERY sheet (name + rows).
        // Scan all of them and use the first one that actually contains product
        // rows. Supplier workbooks often start with a cover / terms / summary
        // sheet — reading only sheet #1 used to reject those files with
        // "No valid product rows found".
        const sheets = await readXlsxFile(buffer);
        if (!sheets || sheets.length === 0) throw new Error('No sheets found');

        let rows: RawImportRow[] = [];
        let usedSheet = '';
        for (const { sheet: sheetName, data: sheetData } of sheets) {
          if (!sheetData || sheetData.length === 0) continue;

          // Supplier sheets often have a title or invoice details above the
          // table. Locate the first plausible header row instead of assuming
          // row 1.
          const headerRow = sheetData.slice(0, 25).findIndex(cells => {
            const recognised = (cells || []).filter(cell => HEADER_ALIASES[normalizeHeader(String(cell ?? ''))]);
            const hasIdentity = (cells || []).some(cell => {
              const field = HEADER_ALIASES[normalizeHeader(String(cell ?? ''))];
              return field === 'productName' || field === 'sku' || field === 'barcode';
            });
            return hasIdentity && recognised.length >= 2;
          });
          if (headerRow < 0) continue;

          const headers = (sheetData[headerRow] || []).map(h => String(h ?? '').trim());
          const jsonRows: Record<string, unknown>[] = [];
          for (let i = headerRow + 1; i < sheetData.length; i++) {
            const rowData = sheetData[i];
            if (!rowData || rowData.length === 0) continue;
            const obj: Record<string, unknown> = {};
            let hasVal = false;
            headers.forEach((header, colIdx) => {
              const cellVal = rowData[colIdx];
              if (header && cellVal !== null && cellVal !== undefined && cellVal !== '') {
                obj[header] = cellVal;
                hasVal = true;
              }
            });
            if (hasVal) jsonRows.push(obj);
          }

          const candidate = mapSheetRows(jsonRows, headerRow).filter(r =>
            r.productName || r.sku || r.barcode || r.size ||
            (r.quantity !== undefined && String(r.quantity).trim() !== '')
          );
          if (candidate.length > 0) {
            rows = candidate;
            usedSheet = sheetName;
            break;
          }
        }
        if (rows.length === 0) {
          setErrorMsg('No valid product rows found. Check the column headers — download the template for the expected format.');
          return;
        }
        setRawRows(rows);
        setParseNote(usedSheet && sheets.length > 1
          ? `${rows.length} row(s) detected in sheet "${usedSheet}" of "${file.name}".`
          : `${rows.length} row(s) detected in "${file.name}".`);
        // Auto-fill invoice metadata from the file when present
        const first = rows.find(r => r.supplier || r.invoiceNumber || r.invoiceDate);
        if (first) {
          if (!supplier && first.supplier) setSupplier(String(first.supplier));
          if (!invoiceNumber && first.invoiceNumber) setInvoiceNumber(String(first.invoiceNumber));
          if (!invoiceDate && first.invoiceDate) setInvoiceDate(String(first.invoiceDate));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to read the uploaded file.';
      setErrorMsg(msg.includes('Unable') || msg.includes('extract') ? msg : `Unable to read ${ext.toUpperCase()} file. ${msg}`);
    } finally {
      setIsParsing(false);
    }
  };

  const buildRequestBody = (extra: Record<string, unknown> = {}) => ({
    importType,
    scope,
    rows: rawRows,
    decisions: Object.fromEntries(Object.entries(decisions).map(([k, v]) => [String(k), v])),
    fileName,
    fileType,
    fileHash,
    supplier: supplier || undefined,
    invoiceNumber: invoiceNumber || undefined,
    invoiceDate: invoiceDate || undefined,
    ...extra,
  });

  // ---- Preview ----
  const runPreview = async (withDecisions: Record<number, ImportRowDecision> = decisions) => {
    try {
      setIsPreviewing(true);
      setErrorMsg(null);
      const result = await fetchApi<{ rows: ImportPreviewRow[]; summary: ImportPreviewSummary; duplicateImport: DuplicateImportInfo | null }>(
        '/inventory/import/preview',
        {
          method: 'POST',
          body: JSON.stringify({ ...buildRequestBody(), decisions: Object.fromEntries(Object.entries(withDecisions).map(([k, v]) => [String(k), v])) }),
        }
      );
      setPreviewRows(result.rows || []);
      setSummary(result.summary || null);
      setDuplicateImport(result.duplicateImport || null);
      setStep('preview');
      setIsDirty(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const updateDecision = (rowId: number, patch: Partial<ImportRowDecision>) => {
    setDecisions(prev => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
    setIsDirty(true);
  };

  const excludeAllProblems = () => {
    const next = { ...decisions };
    previewRows.forEach(r => {
      if (!r.excluded && (r.status === 'INVALID' || r.status === 'NEEDS_REVIEW')) {
        next[r.rowId] = { ...next[r.rowId], excluded: true };
      }
    });
    setDecisions(next);
    runPreview(next);
  };

  const applyAllPrices = (accept: boolean) => {
    const next = { ...decisions };
    previewRows.forEach(r => {
      if (r.priceChange) {
        next[r.rowId] = { ...next[r.rowId], applyBuyingPrice: accept, applySellingPrice: accept };
      }
    });
    setDecisions(next);
  };

  // ---- Confirm ----
  const commitImport = async () => {
    try {
      setIsCommitting(true);
      setErrorMsg(null);
      const result = await fetchApi<{ import: { id: string; summary: ImportHistoryEntry['summary'] } }>(
        '/inventory/import/confirm',
        { method: 'POST', body: JSON.stringify(buildRequestBody({ force: forceDuplicate })) }
      );
      setImportResult({ id: result.import.id, summary: result.import.summary });
      setStep('done');
      setShowConfirm(false);
      onImported();
    } catch (err: unknown) {
      setShowConfirm(false);
      setErrorMsg(err instanceof Error ? err.message : 'Import failed. No changes were made.');
    } finally {
      setIsCommitting(false);
    }
  };

  const problemCount = summary ? summary.invalid + summary.needsReview : 0;

  const fmt = (n?: number) => (n === undefined || n === null ? '—' : `${currencySymbol} ${Number(n).toLocaleString()}`);

  // ==========================================
  // Render
  // ==========================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-6xl w-full overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-xl text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Smart Stock Import</h2>
              <p className="text-xs text-slate-500">
                Excel / CSV / PDF → auto-match products → preview → confirm. Nothing changes until you confirm.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
              <button
                onClick={() => setTab('import')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${tab === 'import' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs' : 'text-slate-500'}`}
              >
                New Import
              </button>
              <button
                onClick={() => setTab('history')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${tab === 'history' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs' : 'text-slate-500'}`}
              >
                <History className="w-3 h-3" />
                Import History
              </button>
            </div>
            <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ================= HISTORY TAB ================= */}
          {tab === 'history' && (
            <div className="space-y-3">
              {historyDetail ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setHistoryDetail(null)}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    ← Back to history
                  </button>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="font-black text-sm text-slate-900 dark:text-white">{historyDetail.entry.id}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {historyDetail.entry.importType === 'purchase' ? 'Purchase / Stock In' : 'Physical Stock Count'} •{' '}
                      {historyDetail.entry.fileName || 'manual'} • {historyDetail.entry.invoiceNumber || 'no invoice'} •{' '}
                      Imported by {historyDetail.entry.userName} on {new Date(historyDetail.entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                          <th className="py-2 px-3">Product</th>
                          <th className="py-2 px-3">Size</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Before → After</th>
                          <th className="py-2 px-3 text-right">Price Changes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {historyDetail.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">{r.productName}</td>
                            <td className="py-2 px-3">{r.size}</td>
                            <td className="py-2 px-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${STATUS_BADGE[r.status as ImportPreviewRow['status']] || 'bg-slate-100 text-slate-600'}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {r.adjustment !== undefined ? `${r.adjustment >= 0 ? '+' : ''}${r.adjustment}` : `+${r.quantity}`}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{r.stockBefore ?? '—'} → {r.stockAfter ?? '—'}</td>
                            <td className="py-2 px-3 text-right text-[11px]">
                              {r.newCostPrice !== undefined && r.oldCostPrice !== undefined && `Buy ${r.oldCostPrice}→${r.newCostPrice} `}
                              {r.newSellingPrice !== undefined && r.oldSellingPrice !== undefined && `Sell ${r.oldSellingPrice}→${r.newSellingPrice}`}
                              {r.minStockBefore !== undefined && r.minStockAfter !== undefined && `Min ${r.minStockBefore}→${r.minStockAfter}`}
                              {r.newCostPrice === undefined && r.newSellingPrice === undefined && r.minStockBefore === undefined && '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous Imports</h3>
                    <button
                      onClick={loadHistory}
                      className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {history.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">No imports yet.</div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                      {history.map(h => (
                        <div key={h.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                              {h.id}
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${h.importType === 'purchase' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                                {h.importType === 'purchase' ? 'Stock In' : 'Physical Count'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {new Date(h.createdAt).toLocaleString()} • {h.fileName || 'manual'} • {h.invoiceNumber || 'no invoice'} • by {h.userName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {h.summary.matched} existing • {h.summary.newProducts} new products •{' '}
                              {h.importType === 'purchase'
                                ? `+${h.summary.totalUnitsAdded} units`
                                : `net ${h.summary.totalAdjustment >= 0 ? '+' : ''}${h.summary.totalAdjustment} adjustment`}
                              {h.summary.priceChanges > 0 && ` • ${h.summary.priceChanges} price changes`}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                const detail = await fetchApi<{ rows: ImportDetailRow[] } & ImportHistoryEntry>(`/inventory/import/${h.id}`);
                                setHistoryDetail({ entry: h, rows: detail.rows || [] });
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer self-start"
                          >
                            <Eye className="w-3 h-3" />
                            View Details
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ================= IMPORT TAB ================= */}
          {tab === 'import' && step === 'setup' && (
            <div className="space-y-4">
              {/* Step 1: Import type */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Step 1 — Import Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportType('purchase')}
                    className={`p-4 border-2 rounded-2xl text-left transition-all cursor-pointer ${importType === 'purchase' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-blue-400'}`}
                  >
                    <div className="flex items-center gap-2 font-black text-sm text-slate-900 dark:text-white">
                      <PackagePlus className="w-4 h-4 text-blue-600" />
                      Purchase / Stock In
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      New stock received from a supplier. Quantities are <strong>ADDED</strong> to the current stock (24 + 48 = 72). Never replaces existing stock.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportType('physical_count')}
                    className={`p-4 border-2 rounded-2xl text-left transition-all cursor-pointer ${importType === 'physical_count' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-amber-400'}`}
                  >
                    <div className="flex items-center gap-2 font-black text-sm text-slate-900 dark:text-white">
                      <ClipboardCheck className="w-4 h-4 text-amber-600" />
                      Physical Stock Count
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      You physically counted the stock. The system calculates the difference (72 counted as 68 → −4) and records a controlled <strong>adjustment</strong>.
                    </p>
                  </button>
                </div>
              </div>

              {/* Item scope — Bar-only by default so a bar purchase never touches food/kitchen */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Item Scope — which stock can be updated
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScope('bar')}
                    className={`p-3 border-2 rounded-2xl text-left transition-all cursor-pointer ${scope === 'bar' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-blue-400'}`}
                  >
                    <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      🍸 Bar Items Only <span className="text-[9px] text-blue-500 font-bold">(recommended)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Matches & updates only <strong>Bar</strong> category products (Arrack, Whisky, Beer, Wine, Vodka/Gin, Brandy/Rum). Food, restaurant & service items are ignored — no duplicates.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`p-3 border-2 rounded-2xl text-left transition-all cursor-pointer ${scope === 'all' ? 'border-slate-800 bg-slate-100 dark:bg-slate-800/60' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}
                  >
                    <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      🍽️ All Items
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Matches & updates <strong>every</strong> product category (Bar + Food + Kitchen + Services). Only use this if the file really contains non-bar stock.
                    </p>
                  </button>
                </div>
              </div>

              {/* Invoice / supplier meta (used for duplicate protection) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Supplier</label>
                  <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. ABC Distributors"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Invoice Number</label>
                  <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-50031"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Invoice Date</label>
                  <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" />
                </div>
              </div>

              {/* Step 2: Upload */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Step 2 — Upload Excel, CSV or PDF
                  </label>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Download Excel Template
                  </button>
                </div>
                <div
                  className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/40 hover:border-blue-400 transition-colors"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
                    className="sr-only"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = '';
                    }}
                  />
                  {isParsing ? (
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  ) : (
                    <UploadCloud className="w-8 h-8 text-slate-400" />
                  )}
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {isParsing ? 'Reading file...' : 'Drop a file here, or choose one below'}
                  </span>
                  <button
                    type="button"
                    disabled={isParsing}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                  >
                    Choose Excel / CSV / PDF File
                  </button>
                  <span className="text-[10px] text-slate-400 flex items-center gap-2">
                    <FileSpreadsheet className="w-3 h-3" /> .xlsx .xls .csv
                    <FileText className="w-3 h-3 ml-1" /> .pdf (invoice) · max 3.5 MB
                  </span>
                </div>

                {fileName && rawRows.length > 0 && (
                  <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{fileName}: {parseNote}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  disabled={rawRows.length === 0 || isPreviewing}
                  onClick={() => runPreview()}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all ${rawRows.length > 0 && !isPreviewing ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                >
                  {isPreviewing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Analyse & Preview →
                </button>
              </div>
            </div>
          )}

          {/* ================= PREVIEW STEP ================= */}
          {tab === 'import' && step === 'preview' && summary && (
            <div className="space-y-4">
              {/* Duplicate import warning */}
              {duplicateImport && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 rounded-2xl text-xs">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <div className="font-black text-amber-800 dark:text-amber-300">Duplicate Import Detected</div>
                      <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                        {duplicateImport.invoiceNumber ? `Invoice ${duplicateImport.invoiceNumber}` : `File "${duplicateImport.fileName}"`}
                        {duplicateImport.supplier ? ` from ${duplicateImport.supplier}` : ''} appears to have already been processed on{' '}
                        {new Date(duplicateImport.importedAt).toLocaleDateString()} by {duplicateImport.importedBy} ({duplicateImport.id}).
                        Stock will <strong>NOT</strong> be added twice.
                      </p>
                      <label className="flex items-center gap-2 mt-2 font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
                        <input type="checkbox" checked={forceDuplicate} onChange={e => setForceDuplicate(e.target.checked)} className="w-3.5 h-3.5" />
                        I understand — import anyway (stock may duplicate)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {[
                  { label: 'Existing Matched', value: summary.matched, cls: 'text-emerald-600' },
                  { label: 'New Items', value: summary.newItems, cls: 'text-blue-600' },
                  { label: 'New Categories', value: summary.newCategories.length, cls: 'text-blue-600' },
                  { label: 'New Brands', value: summary.newCompanies.length, cls: 'text-blue-600' },
                  { label: 'Price Changes', value: summary.priceChanges, cls: 'text-indigo-600' },
                  {
                    label: importType === 'purchase' ? 'Stock To Add' : 'Net Adjustment',
                    value: importType === 'purchase' ? summary.unitsToAdd : summary.totalAdjustment,
                    cls: 'text-slate-900 dark:text-white',
                  },
                  { label: 'Needs Review', value: summary.needsReview, cls: summary.needsReview > 0 ? 'text-amber-600' : 'text-slate-400' },
                  { label: 'Invalid / Dup', value: summary.invalid + summary.duplicates, cls: summary.invalid > 0 ? 'text-rose-600' : 'text-slate-400' },
                ].map((c, i) => (
                  <div key={i} className="p-2.5 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-center">
                    <div className={`text-lg font-black ${c.cls}`}>{c.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{c.label}</div>
                  </div>
                ))}
              </div>

              {(summary.newCategories.length > 0 || summary.newCompanies.length > 0) && (
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-1.5 items-center">
                  {summary.newCategories.map(c => (
                    <span key={c} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded font-bold">+ Category: {c}</span>
                  ))}
                  {summary.newCompanies.map(c => (
                    <span key={c} className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 rounded font-bold">+ Brand: {c}</span>
                  ))}
                </div>
              )}

              {/* Zero-stock-change warning: a "successful" import that changes nothing is a trap */}
              {importType === 'purchase' && summary.unitsToAdd === 0 && problemCount === 0 && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 rounded-2xl text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-black text-amber-800 dark:text-amber-300">Heads up — this import will add 0 units</div>
                      <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                        Live Inventory stock will <strong>NOT change</strong> (only prices / minimum-stock updates). If your file has quantities, the
                        Quantity column header may not be recognized — use <strong>Quantity</strong>, <strong>Qty</strong>, <strong>Units</strong>,
                        {' '}<strong>Received</strong>, <strong>Stock</strong> or <strong>Count</strong>, or download the template.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Problem banner + quick actions */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {problemCount > 0 ? (
                    <>
                      <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Import contains {problemCount} problematic row(s) — fix, resolve or exclude them.
                      </span>
                      <button onClick={excludeAllProblems} className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-lg text-[11px] font-bold cursor-pointer">
                        Exclude All Problems
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> All rows are ready to import.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {summary.priceChanges > 0 && (
                    <>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Prices:</span>
                      <button onClick={() => { applyAllPrices(true); }} className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg text-[11px] font-bold cursor-pointer">Accept All New</button>
                      <button onClick={() => { applyAllPrices(false); }} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold cursor-pointer">Keep All Existing</button>
                    </>
                  )}
                  <button
                    onClick={() => runPreview()}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer ${isDirty ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                  >
                    <RefreshCw className={`w-3 h-3 ${isPreviewing ? 'animate-spin' : ''}`} />
                    {isDirty ? 'Re-check Rows' : 'Refresh Preview'}
                  </button>
                </div>
              </div>

              {/* Detail table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[10px] uppercase">
                      <th className="py-2 px-2 text-center">Use</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Product</th>
                      <th className="py-2 px-2">Size</th>
                      <th className="py-2 px-2">SKU</th>
                      <th className="py-2 px-2 text-right">Existing</th>
                      <th className="py-2 px-2 text-right">{importType === 'purchase' ? 'Import Qty' : 'Counted'}</th>
                      <th className="py-2 px-2 text-right">{importType === 'purchase' ? 'Final' : 'Diff'}</th>
                      <th className="py-2 px-2 text-right">Buying</th>
                      <th className="py-2 px-2 text-right">Selling</th>
                      <th className="py-2 px-2">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.map(row => {
                      const d = decisions[row.rowId] || {};
                      const isProblem = !row.excluded && (row.status === 'INVALID' || row.status === 'NEEDS_REVIEW');
                      return (
                        <tr key={row.rowId} className={`${row.excluded ? 'opacity-40' : ''} ${isProblem ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={!row.excluded}
                              disabled={row.status === 'DUPLICATE'}
                              onChange={e => updateDecision(row.rowId, { excluded: !e.target.checked })}
                              className="w-3.5 h-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded font-black text-[9px] whitespace-nowrap ${STATUS_BADGE[row.status]}`}>
                              {row.status.replace('_', ' ')}
                            </span>
                            {row.isNewCategory && <span className="block text-[9px] text-blue-500 font-bold mt-0.5">+CAT</span>}
                            {row.isNewCompany && <span className="block text-[9px] text-purple-500 font-bold mt-0.5">+BRAND</span>}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 max-w-[180px]">
                            <div className="truncate" title={row.productName}>{row.productName || '—'}</div>
                            {row.status === 'NEEDS_REVIEW' && !row.excluded && (
                              <select
                                value={d.resolvedVariantId || ''}
                                onChange={e => {
                                  updateDecision(row.rowId, { resolvedVariantId: e.target.value || undefined });
                                }}
                                className="mt-1 w-full px-1.5 py-1 bg-white dark:bg-slate-800 border-2 border-amber-400 rounded-lg text-[10px] font-semibold cursor-pointer"
                              >
                                <option value="">— Resolve: pick the correct item —</option>
                                {importType === 'purchase' && <option value="new">➕ Create as NEW item</option>}
                                {(row.candidates || []).map(c => (
                                  <option key={c.variantId} value={c.variantId}>★ {c.label}</option>
                                ))}
                                {pickerItems.map(p => (
                                  <option key={p.variantId} value={p.variantId}>
                                    {p.productName} — {p.size} {p.sku ? `[${p.sku}]` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">{row.size || '—'}</td>
                          <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500">{row.sku || '—'}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{row.existingStock ?? '—'}</td>
                          <td className="py-1.5 px-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={d.quantity !== undefined ? d.quantity : row.quantity}
                              disabled={row.excluded || row.status === 'DUPLICATE'}
                              onChange={e => updateDecision(row.rowId, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-16 px-1.5 py-0.5 text-right font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">
                            {importType === 'purchase'
                              ? (row.finalStock ?? '—')
                              : row.adjustment !== undefined
                              ? <span className={row.adjustment === 0 ? 'text-slate-400' : row.adjustment < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                                  {row.adjustment >= 0 ? `+${row.adjustment}` : row.adjustment}
                                </span>
                              : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right whitespace-nowrap">
                            {row.newCost !== undefined ? (
                              <div className="text-[10px]">
                                <span className="line-through text-slate-400">{fmt(row.oldCost)}</span>{' '}
                                <span className="font-bold text-indigo-600">{fmt(row.newCost)}</span>
                                <select
                                  value={d.applyBuyingPrice === false ? 'keep' : 'accept'}
                                  onChange={e => updateDecision(row.rowId, { applyBuyingPrice: e.target.value === 'accept' })}
                                  className="block mt-0.5 w-full px-1 py-0.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-800 rounded text-[9px] font-bold cursor-pointer"
                                >
                                  <option value="accept">Accept New</option>
                                  <option value="keep">Keep Existing</option>
                                </select>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">{fmt(row.oldCost ?? (row.status === 'NEW_ITEM' ? undefined : row.oldCost))}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right whitespace-nowrap">
                            {row.newSell !== undefined ? (
                              <div className="text-[10px]">
                                <span className="line-through text-slate-400">{fmt(row.oldSell)}</span>{' '}
                                <span className="font-bold text-indigo-600">{fmt(row.newSell)}</span>
                                <select
                                  value={d.applySellingPrice === false ? 'keep' : 'accept'}
                                  onChange={e => updateDecision(row.rowId, { applySellingPrice: e.target.value === 'accept' })}
                                  className="block mt-0.5 w-full px-1 py-0.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-800 rounded text-[9px] font-bold cursor-pointer"
                                >
                                  <option value="accept">Accept New</option>
                                  <option value="keep">Keep Existing</option>
                                </select>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">{fmt(row.oldSell)}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-[10px] text-slate-500 max-w-[220px]">
                            <div className="truncate" title={row.note}>{row.note || ''}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => { setStep('setup'); setShowConfirm(false); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  disabled={isPreviewing || isCommitting || (duplicateImport !== null && !forceDuplicate)}
                  onClick={() => {
                    if (isDirty) {
                      runPreview();
                      return;
                    }
                    setShowConfirm(true);
                  }}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 ${!isPreviewing && !isCommitting && (duplicateImport === null || forceDuplicate) ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                >
                  {isDirty ? 'Re-check Rows First' : 'CONFIRM IMPORT'}
                </button>
              </div>

              {/* Confirmation dialog */}
              {showConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Are you sure?</h3>
                    <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 font-semibold">
                      <li>• {summary.matched} existing item(s) will be updated.</li>
                      <li>• {summary.newItems} new item(s) will be created.</li>
                      {importType === 'purchase'
                        ? <li>• {summary.unitsToAdd} units will be ADDED to stock.</li>
                        : <li>• Net stock adjustment of {summary.totalAdjustment >= 0 ? '+' : ''}{summary.totalAdjustment} unit(s).</li>}
                      {summary.priceChanges > 0 && <li>• {summary.priceChanges} price(s) will change (per your Accept/Keep choices).</li>}
                      {summary.newCategories.length > 0 && <li>• Categories to create: {summary.newCategories.join(', ')}</li>}
                      {summary.newCompanies.length > 0 && <li>• Brands to create: {summary.newCompanies.join(', ')}</li>}
                    </ul>
                    <p className="text-[11px] text-slate-400">
                      The operation is transactional — if anything fails, everything rolls back and no changes are made.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer">
                        Cancel
                      </button>
                      <button
                        onClick={commitImport}
                        disabled={isCommitting}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-2"
                      >
                        {isCommitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Yes, Import Now
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= DONE STEP ================= */}
          {tab === 'import' && step === 'done' && importResult && (
            <div className="py-10 flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-emerald-100 dark:bg-emerald-950 rounded-full">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Import Completed — {importResult.id}</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  {importResult.summary.rowsImported} row(s) processed • {importResult.summary.newProducts} new products •{' '}
                  {importResult.summary.newVariants} new sizes •{' '}
                  {importType === 'purchase'
                    ? `+${importResult.summary.totalUnitsAdded} units added to stock`
                    : `net adjustment ${importResult.summary.totalAdjustment >= 0 ? '+' : ''}${importResult.summary.totalAdjustment}`}
                  {importResult.summary.priceChanges > 0 && ` • ${importResult.summary.priceChanges} prices updated`}.
                  Inventory, Daily Stock Sheet and Stock Movements are all up to date.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { resetAll(); }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer">
                  Import Another File
                </button>
                <button onClick={handleClose} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
