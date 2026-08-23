import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Bill, SystemSettings, StockMovement, InventoryItemView } from '../types.ts';

// Generate A4 or 80mm Thermal Receipt PDF for Bills / Invoices
export function generateInvoicePDF(bill: Bill, settings: SystemSettings | null) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const address = settings?.address || 'Puttalam, Sri Lanka';
  const phone = settings?.phone || '+94 32 226 5500';
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Header Banner
  doc.setFillColor(24, 34, 48);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(businessName, 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 215, 230);
  doc.text(`${address} | Tel: ${phone}`, 14, 23);

  // Right header: Invoice badge
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', 196, 15, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.invoiceNumber} (${bill.billNumber})`, 196, 23, { align: 'right' });

  // Invoice Details Meta
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Details:', 14, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date & Time: ${new Date(bill.createdAt).toLocaleString()}`, 14, 48);
  doc.text(`Cashier: ${bill.cashierName}`, 14, 54);
  doc.text(`Order Type: ${bill.orderType.toUpperCase().replace('_', ' ')}`, 14, 60);
  if (bill.tableNumber) {
    doc.text(`Table/Room: ${bill.tableNumber}`, 14, 66);
  }

  // Customer Details (Right column)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Billed To:', 130, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Customer: ${bill.customerName || 'Walk-in Guest'}`, 130, 48);
  if (bill.customerPhone) {
    doc.text(`Phone: ${bill.customerPhone}`, 130, 54);
  }
  doc.text(`Payment: ${bill.paymentMethod.toUpperCase()}`, 130, 60);
  doc.text(`Status: ${bill.status.toUpperCase()}`, 130, 66);

  // Items Table
  const tableRows = bill.items.map((item, index) => [
    index + 1,
    `${item.productName} (${item.size})`,
    item.quantity,
    `${currencySymbol} ${item.unitPrice.toLocaleString()}`,
    `${currencySymbol} ${item.total.toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: 72,
    head: [['#', 'Item & Size / Variant', 'Qty', 'Unit Price', 'Total']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 100 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // Summary Totals on Right
  const startX = 120;
  const valX = 196;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', startX, finalY);
  doc.text(`${currencySymbol} ${bill.subtotal.toLocaleString()}`, valX, finalY, { align: 'right' });

  let curY = finalY;
  if (bill.discount > 0) {
    curY += 6;
    doc.text(`Discount (${bill.discountPercentage || 0}%):`, startX, curY);
    doc.text(`- ${currencySymbol} ${bill.discount.toLocaleString()}`, valX, curY, { align: 'right' });
  }

  if (bill.serviceCharge && bill.serviceCharge > 0) {
    curY += 6;
    doc.text(`Service Charge (${settings?.serviceChargeRate || 10}%):`, startX, curY);
    doc.text(`+ ${currencySymbol} ${bill.serviceCharge.toLocaleString()}`, valX, curY, { align: 'right' });
  }

  if (bill.tax > 0) {
    curY += 6;
    doc.text(`VAT / Tax (${bill.taxRate || 0}%):`, startX, curY);
    doc.text(`+ ${currencySymbol} ${bill.tax.toLocaleString()}`, valX, curY, { align: 'right' });
  }

  curY += 8;
  doc.setFillColor(245, 247, 250);
  doc.rect(startX - 4, curY - 5, 84, 10, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', startX, curY + 2);
  doc.text(`${currencySymbol} ${bill.grandTotal.toLocaleString()}`, valX, curY + 2, { align: 'right' });

  curY += 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Amount Tendered:`, startX, curY);
  doc.text(`${currencySymbol} ${bill.amountReceived.toLocaleString()}`, valX, curY, { align: 'right' });

  curY += 6;
  doc.text(`Change Given:`, startX, curY);
  doc.text(`${currencySymbol} ${bill.changeAmount.toLocaleString()}`, valX, curY, { align: 'right' });

  // Footer Note
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    settings?.receiptFooter || 'Thank you for your patronage! Please come again.',
    105,
    280,
    { align: 'center' }
  );

  doc.save(`${bill.invoiceNumber}.pdf`);
}

// Generate Sales Analytics & Financial Report PDF
export function generateSalesReportPDF(
  title: string,
  dateRange: string,
  summary: {
    totalSales: number;
    totalBills: number;
    totalDiscount: number;
    totalTax: number;
    totalServiceCharge: number;
    averageBill: number;
  },
  bills: Bill[],
  settings: SystemSettings | null,
  userName: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const currencySymbol = settings?.currencySymbol || 'Rs.';

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${settings?.businessName || 'Royal Hotel'} - ${title}`, 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Period: ${dateRange} | Generated on ${new Date().toLocaleString()} by ${userName}`, 14, 20);

  // Summary KPI Cards Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 32, 269, 20, 2, 2, 'F');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL REVENUE', 20, 39);
  doc.text('TOTAL TRANSACTIONS', 80, 39);
  doc.text('AVERAGE BILL', 140, 39);
  doc.text('DISCOUNTS GIVEN', 200, 39);
  doc.text('SERVICE CHARGE', 245, 39);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${currencySymbol} ${summary.totalSales.toLocaleString()}`, 20, 47);
  doc.text(`${summary.totalBills}`, 80, 47);
  doc.text(`${currencySymbol} ${Math.round(summary.averageBill).toLocaleString()}`, 140, 47);
  doc.text(`${currencySymbol} ${summary.totalDiscount.toLocaleString()}`, 200, 47);
  doc.text(`${currencySymbol} ${summary.totalServiceCharge.toLocaleString()}`, 245, 47);

  // Bills Table
  const tableRows = bills.map((b, idx) => [
    idx + 1,
    b.billNumber,
    b.invoiceNumber,
    new Date(b.createdAt).toLocaleDateString() + ' ' + new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    b.cashierName,
    b.orderType.toUpperCase(),
    b.items.reduce((sum, item) => sum + item.quantity, 0),
    b.paymentMethod.toUpperCase(),
    `${currencySymbol} ${b.subtotal.toLocaleString()}`,
    `${currencySymbol} ${b.discount.toLocaleString()}`,
    `${currencySymbol} ${b.grandTotal.toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: 56,
    head: [['#', 'Bill #', 'Invoice #', 'Date & Time', 'Cashier', 'Type', 'Items', 'Payment', 'Subtotal', 'Discount', 'Grand Total']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      3: { cellWidth: 36 },
      4: { cellWidth: 36 },
      5: { cellWidth: 24 },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 24 },
      8: { cellWidth: 25, halign: 'right' },
      9: { cellWidth: 22, halign: 'right' },
      10: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  doc.save(`Sales_Report_${dateRange.replace(/\s+/g, '_')}.pdf`);
}

// Generate Excel Export (.xlsx)
export function exportToExcel(data: any[], fileName: string, sheetName: string = 'Sheet1') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

// Export Bills / Sales to Excel
export function exportBillsToExcel(bills: Bill[], fileName: string = 'Sales_Report') {
  const formatted = bills.map((b, index) => ({
    '#': index + 1,
    'Bill Number': b.billNumber,
    'Invoice Number': b.invoiceNumber,
    'Date': new Date(b.createdAt).toLocaleDateString(),
    'Time': new Date(b.createdAt).toLocaleTimeString(),
    'Cashier': b.cashierName,
    'Order Type': b.orderType,
    'Table/Room': b.tableNumber || '-',
    'Customer Name': b.customerName || 'Walk-in',
    'Customer Phone': b.customerPhone || '-',
    'Total Items': b.items.reduce((s, i) => s + i.quantity, 0),
    'Subtotal': b.subtotal,
    'Discount Amount': b.discount,
    'Service Charge': b.serviceCharge || 0,
    'Tax': b.tax,
    'Grand Total': b.grandTotal,
    'Payment Method': b.paymentMethod,
    'Status': b.status,
  }));

  exportToExcel(formatted, fileName, 'Sales');
}

// Export Inventory & Valuation to Excel
export function exportInventoryToExcel(inventory: InventoryItemView[], fileName: string = 'Inventory_Stock_Report') {
  const formatted = inventory.map((item, index) => ({
    '#': index + 1,
    'Product Name': item.productName,
    'Size / Variant': item.size,
    'Category': item.categoryName,
    'Brand / Company': item.companyName,
    'SKU': item.sku,
    'Barcode': item.barcode || '-',
    'Cost Price (Rs)': item.costPrice,
    'Selling Price (Rs)': item.sellingPrice,
    'Current Stock': item.stock,
    'Min Stock Level': item.minStockLevel,
    'Stock Value (Cost)': item.stockValue,
    'Retail Value': item.retailValue,
    'Status': item.isOutOfStock ? 'OUT OF STOCK' : item.isLowStock ? 'LOW STOCK' : 'IN STOCK',
  }));

  exportToExcel(formatted, fileName, 'Stock Inventory');
}

// Export Stock Movement Audit to Excel
export function exportStockMovementsToExcel(movements: StockMovement[], fileName: string = 'Stock_Movements') {
  const formatted = movements.map((m, index) => ({
    '#': index + 1,
    'Date & Time': new Date(m.createdAt).toLocaleString(),
    'Product': m.productName,
    'Variant / Size': m.variantSize,
    'Movement Type': m.movementType.toUpperCase(),
    'Quantity Change': m.quantityChange,
    'Stock Before': m.quantityBefore,
    'Stock After': m.quantityAfter,
    'Reason / Notes': m.reason || '-',
    'Reference (Bill/Doc)': m.referenceId || '-',
    'User': m.userName,
  }));

  exportToExcel(formatted, fileName, 'Stock Movements');
}
