import React, { useState, useMemo } from 'react';
import { Product, ProductVariant, SystemSettings } from '../../types.ts';
import { encodeCode128B, generateBarcodeSVG } from '../../lib/barcodeGenerator.ts';
import { Printer, Download, X, Check, Search, Filter, Wine, AlertCircle, Info, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';

interface BarcodePrintItem {
  productId: string;
  productName: string;
  variantId: string;
  size: string;
  sku: string;
  barcode: string;
  sellingPrice: number;
  companyName?: string;
  categoryName?: string;
  quantity: number;
  isSelected: boolean;
}

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings?: SystemSettings | null;
  initialSelectedVariantId?: string;
}

/** Escape catalogue/settings text before inserting it into the print window HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  initialSelectedVariantId,
}) => {
  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'ROYAL HOTEL POS';

  // Format options
  const [printLayout, setPrintLayout] = useState<'thermal_roll' | 'a4_24' | 'a4_40'>('thermal_roll');
  const [showBusinessName, setShowBusinessName] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showSize, setShowSize] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract ONLY Bottle variants (strictly exclude shot variants)
  const initialItems = useMemo(() => {
    const list: BarcodePrintItem[] = [];
    for (const p of products) {
      if (!p.isActive || p.isArchived) continue;
      if (p.isKitchenItem) continue; // Skip kitchen items

      for (const v of p.variants) {
        if (!v.isActive) continue;
        // BOTTLE ONLY FILTER: Exclude Shot variants
        if (v.isShot) continue;

        const effectiveCode = (v.barcode && v.barcode.trim()) ? v.barcode.trim() : v.sku;
        const isSelected = Boolean(initialSelectedVariantId && v.id === initialSelectedVariantId);

        list.push({
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          size: v.size,
          sku: v.sku,
          barcode: effectiveCode,
          sellingPrice: v.sellingPrice,
          companyName: p.companyId,
          quantity: isSelected ? 10 : 5, // default print 5 stickers
          isSelected: isSelected || false,
        });
      }
    }
    return list;
  }, [products, initialSelectedVariantId]);

  const [items, setItems] = useState<BarcodePrintItem[]>(initialItems);

  // Update items when modal opens or products change
  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems, isOpen]);

  if (!isOpen) return null;

  // Filtered items for display in table
  const filteredItems = items.filter(i => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      i.productName.toLowerCase().includes(q) ||
      i.size.toLowerCase().includes(q) ||
      i.barcode.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q)
    );
  });

  const selectedCount = items.filter(i => i.isSelected).length;
  const totalStickersToPrint = items
    .filter(i => i.isSelected)
    .reduce((sum, i) => sum + Math.max(1, i.quantity), 0);

  const toggleSelectAll = () => {
    const allSelected = filteredItems.every(i => i.isSelected);
    setItems(prev =>
      prev.map(item => {
        if (filteredItems.some(f => f.variantId === item.variantId)) {
          return { ...item, isSelected: !allSelected };
        }
        return item;
      })
    );
  };

  const handleToggleItem = (variantId: string) => {
    setItems(prev =>
      prev.map(i => (i.variantId === variantId ? { ...i, isSelected: !i.isSelected } : i))
    );
  };

  const handleQuantityChange = (variantId: string, qty: number) => {
    setItems(prev =>
      prev.map(i => (i.variantId === variantId ? { ...i, quantity: Math.max(1, qty) } : i))
    );
  };

  const handleBarcodeChange = (variantId: string, newCode: string) => {
    setItems(prev =>
      prev.map(i => (i.variantId === variantId ? { ...i, barcode: newCode.trim() } : i))
    );
  };

  /**
   * Helper to render Code128 SVG for a given barcode string
   */
  const renderSVGString = (code: string, height: number = 32, barWidth: number = 1.5) =>
    generateBarcodeSVG(code, { height, barWidth });

  /**
   * Triggers Browser Thermal / A4 Print window for barcode stickers
   */
  const handlePrint = () => {
    const selectedItems = items.filter(i => i.isSelected);
    if (selectedItems.length === 0) {
      alert('Please select at least one bottle item to print barcode labels.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Pop-up blocker prevented opening print preview window. Please allow popups.');
      return;
    }

    // Build sticker html blocks
    let labelCardsHTML = '';

    for (const item of selectedItems) {
      const svgCode = renderSVGString(item.barcode, 36, 1.4);
      for (let q = 0; q < Math.max(1, item.quantity); q++) {
        labelCardsHTML += `
          <div class="sticker-card">
            ${showBusinessName ? `<div class="biz-title">${escapeHtml(businessName)}</div>` : ''}
            ${showProductName ? `<div class="prod-title">${escapeHtml(item.productName)}</div>` : ''}
            ${showSize ? `<div class="prod-size">${escapeHtml(item.size)}</div>` : ''}
            <div class="barcode-svg">${svgCode}</div>
            ${showPrice ? `<div class="prod-price">${escapeHtml(currencySymbol)} ${item.sellingPrice.toLocaleString()}</div>` : ''}
          </div>
        `;
      }
    }

    const isThermal = printLayout === 'thermal_roll';
    const isA4_24 = printLayout === 'a4_24';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bottle Barcode Stickers - Royal Hotel POS</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #000; }
          
          ${
            isThermal
              ? `
            @page { size: 50mm 30mm; margin: 0; }
            body { width: 50mm; }
            .sticker-container { width: 50mm; display: flex; flex-direction: column; }
            .sticker-card {
              width: 50mm; height: 30mm; padding: 2mm 3mm;
              display: flex; flex-direction: column; items-center: center; justify-content: center;
              text-align: center; page-break-after: always; break-after: page;
              border: 1px dashed #ccc;
            }
            `
              : `
            @page { size: A4; margin: 10mm; }
            .sticker-container {
              display: grid;
              grid-template-columns: repeat(${isA4_24 ? 3 : 4}, 1fr);
              gap: 4mm; width: 100%;
            }
            .sticker-card {
              border: 1px solid #ddd; border-radius: 4px; padding: 3mm;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; height: ${isA4_24 ? '32mm' : '25mm'};
              page-break-inside: avoid; break-inside: avoid;
            }
            `
          }

          .biz-title { font-size: 7px; font-weight: 800; text-transform: uppercase; color: #444; letter-spacing: 0.5px; }
          .prod-title { font-size: 9px; font-weight: 800; line-height: 1.1; margin-top: 1px; color: #000; overflow: hidden; max-height: 18px; }
          .prod-size { font-size: 8px; font-weight: 700; color: #2563eb; }
          .barcode-svg { margin: 2px 0; display: flex; justify-content: center; width: 100%; }
          .barcode-svg svg { max-width: 100%; height: auto; }
          .prod-price { font-size: 9px; font-weight: 900; color: #000; }

          @media print {
            .sticker-card { border: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="sticker-container">
          ${labelCardsHTML}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  /**
   * Generates a downloadable PDF with barcode labels
   */
  const handleExportPDF = () => {
    const selectedItems = items.filter(i => i.isSelected);
    if (selectedItems.length === 0) {
      alert('Please select at least one bottle item to export PDF.');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let page = 1;
    let x = 10;
    let y = 10;
    const cardW = 60;
    const cardH = 32;
    const maxCols = 3;
    let col = 0;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    for (const item of selectedItems) {
      for (let q = 0; q < Math.max(1, item.quantity); q++) {
        // Draw label rectangle
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, cardW, cardH);

        let currentY = y + 4;

        if (showBusinessName) {
          doc.setFontSize(7);
          doc.setTextColor(100, 100, 100);
          doc.text(businessName.toUpperCase(), x + cardW / 2, currentY, { align: 'center' });
          currentY += 3.5;
        }

        if (showProductName) {
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          doc.text(item.productName.substring(0, 28), x + cardW / 2, currentY, { align: 'center' });
          currentY += 3.5;
        }

        if (showSize) {
          doc.setFontSize(8);
          doc.setTextColor(37, 99, 235);
          doc.text(item.size, x + cardW / 2, currentY, { align: 'center' });
          currentY += 3.5;
        }

        // Draw the actual Code 128 bars. The previous PDF export used pipe
        // characters as a visual placeholder, which looked like a barcode but
        // could not be read by a scanner.
        const barcodeCode = item.barcode.trim() || '000000';
        const barcodeBars = encodeCode128B(barcodeCode);
        const barcodeModules = barcodeBars.reduce((sum, bar) => sum + bar.width, 0);
        const barcodeHeight = 8;
        const barcodeMaxWidth = cardW - 8;
        const barcodeModuleWidth = Math.min(0.32, barcodeMaxWidth / barcodeModules);
        const barcodeWidth = barcodeModules * barcodeModuleWidth;
        let barcodeX = x + (cardW - barcodeWidth) / 2;

        doc.setFillColor(0, 0, 0);
        for (const bar of barcodeBars) {
          const barWidth = bar.width * barcodeModuleWidth;
          if (bar.isBar) {
            doc.rect(barcodeX, currentY, barWidth, barcodeHeight, 'F');
          }
          barcodeX += barWidth;
        }

        // Keep the value below the bars for manual verification.
        doc.setFont('courier', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(0, 0, 0);
        doc.text(barcodeCode, x + cardW / 2, currentY + barcodeHeight + 2, { align: 'center' });
        currentY += barcodeHeight + 4;

        if (showPrice) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text(`${currencySymbol} ${item.sellingPrice.toLocaleString()}`, x + cardW / 2, currentY + 2, { align: 'center' });
        }

        col++;
        if (col >= maxCols) {
          col = 0;
          x = 10;
          y += cardH + 4;
          if (y + cardH > 280) {
            doc.addPage();
            page++;
            y = 10;
          }
        } else {
          x += cardW + 4;
        }
      }
    }

    doc.save(`Bottle-Barcode-Labels-${Date.now()}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>Bottle Barcode Label Generator</span>
                <span className="text-[10px] bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                  Bottles Only
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Generate and print barcode stickers for liquor bottles, beer cans & beverages
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Note:</strong> Shot sizes (100ml / 50ml / 25ml) are automatically excluded. Barcode stickers are generated for <strong>Full Bottles, Half Bottles & Cans</strong> only.
            </span>
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap ml-2">
            {selectedCount} bottle(s) selected ({totalStickersToPrint} total stickers)
          </span>
        </div>

        {/* Content Body: Split Layout */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* Left Column: Item Selection Table */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3">
            {/* Search Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search bottle items by title, size, SKU, or barcode..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                />
              </div>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                {filteredItems.every(i => i.isSelected) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Bottle Items Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">Sel</th>
                    <th className="py-2.5 px-3">Bottle Product & Size</th>
                    <th className="py-2.5 px-3 w-32">Barcode</th>
                    <th className="py-2.5 px-3 w-24">Price</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        No bottle items match search query.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => (
                      <tr
                        key={item.variantId}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                          item.isSelected ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={() => handleToggleItem(item.variantId)}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {item.productName}
                          </div>
                          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                            {item.size}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.barcode}
                            onChange={e => handleBarcodeChange(item.variantId, e.target.value)}
                            className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200">
                          {currencySymbol} {item.sellingPrice.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={item.quantity}
                            disabled={!item.isSelected}
                            onChange={e => handleQuantityChange(item.variantId, Number(e.target.value))}
                            className="w-16 px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center text-xs font-bold"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Print Format & Live Preview */}
          <div className="w-full md:w-80 shrink-0 p-4 bg-slate-50 dark:bg-slate-800/30 flex flex-col space-y-4 overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Label Printing Settings
            </h3>

            {/* Layout Preset */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Printer Paper Format:
              </label>
              <select
                value={printLayout}
                onChange={e => setPrintLayout(e.target.value as any)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              >
                <option value="thermal_roll">🏷️ Thermal Sticker Roll (50mm x 30mm)</option>
                <option value="a4_24">📄 A4 Sheet — 24 Labels / Page (3x8 Grid)</option>
                <option value="a4_40">📄 A4 Sheet — 40 Labels / Page (4x10 Grid)</option>
              </select>
            </div>

            {/* Label Contents Checklist */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Fields To Print On Sticker:
              </label>
              <div className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBusinessName}
                    onChange={e => setShowBusinessName(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Hotel / Business Name ({businessName})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={e => setShowProductName(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Bottle Title</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSize}
                    onChange={e => setShowSize(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Bottle Size (e.g. 750ml, 375ml)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={e => setShowPrice(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Selling Price</span>
                </label>
              </div>
            </div>

            {/* Live Sticker Sample Preview */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Sticker Preview Sample:
              </label>
              <div className="bg-white p-3 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-center shadow-xs">
                {showBusinessName && (
                  <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    {businessName}
                  </div>
                )}
                {showProductName && (
                  <div className="text-xs font-extrabold text-slate-900 mt-0.5">
                    {items.find(i => i.isSelected)?.productName || 'Rockland Old Arrack'}
                  </div>
                )}
                {showSize && (
                  <div className="text-[10px] font-bold text-blue-600">
                    {items.find(i => i.isSelected)?.size || '750ml Bottle'}
                  </div>
                )}
                <div
                  className="my-1.5 w-full flex justify-center"
                  dangerouslySetInnerHTML={{
                    __html: renderSVGString(
                      items.find(i => i.isSelected)?.barcode || '4790001001',
                      32,
                      1.3
                    ),
                  }}
                />
                {showPrice && (
                  <div className="text-xs font-black text-slate-900">
                    {currencySymbol}{' '}
                    {(items.find(i => i.isSelected)?.sellingPrice || 3650).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 space-y-2">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>PRINT STICKERS ({totalStickersToPrint})</span>
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
