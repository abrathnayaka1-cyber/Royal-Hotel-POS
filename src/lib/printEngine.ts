import { Bill, KOT, SystemSettings, OrderItem, RoomBooking, Room, FunctionBooking, FunctionHall } from '../types.ts';

/**
 * Commercial POS Native Thermal Print Engine
 * Directly invokes browser native print dialog with strict 58mm / 80mm thermal formatting.
 * Never outputs PDF wrappers or blank pages.
 */

/** Resolve the Royal Hotel POS brand logo against the running app origin (safe inside print iframes). */
function getBrandLogoSrc(): string {
  try {
    return new URL('/logo.png', window.location.href).href;
  } catch {
    return '/logo.png';
  }
}

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount: number, symbol: string = 'Rs.'): string {
  return `${symbol} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Injects thermal receipt HTML into a dedicated hidden print frame and triggers native print.
 */
function printHtmlContent(htmlContent: string, title: string = 'POS_Thermal_Receipt'): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Remove any prior print iframes
      const oldFrame = document.getElementById('pos-thermal-print-iframe');
      if (oldFrame) {
        oldFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'pos-thermal-print-iframe';
      iframe.setAttribute('title', title);
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        throw new Error('Unable to access print frame.');
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (printErr) {
          console.warn('[PrintEngine] Iframe native print failed, attempting window.print fallback:', printErr);
          try {
            window.print();
            resolve(true);
          } catch (fallbackErr) {
            console.error('[PrintEngine] All print triggers failed:', fallbackErr);
            alert("Unable to open the print dialog. Please check your browser's print permissions and printer settings.");
            resolve(false);
          }
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }
      };

      // Ensure styles and fonts are rendered before calling native print dialog
      if (iframe.contentWindow?.document.readyState === 'complete') {
        setTimeout(triggerPrint, 250);
      } else {
        iframe.onload = () => setTimeout(triggerPrint, 250);
      }
    } catch (error) {
      console.error('[PrintEngine] Print execution error:', error);
      alert("Unable to open the print dialog. Please check your browser's print permissions and printer settings.");
      resolve(false);
    }
  });
}

/**
 * Print a standard POS Thermal Receipt (58mm or 80mm)
 * Formatted precisely to match standard commercial thermal POS receipt printers.
 */
export async function printThermalReceipt(bill: Bill, settings: SystemSettings | null): Promise<boolean> {
  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const logoSrc = getBrandLogoSrc();
  const address = settings?.address || 'No. 42 Beach Road, Puttalam';
  const phone = settings?.phone || '+94 32 226 5500';
  const footerText = settings?.receiptFooter || 'Thank you! Come Again...';

  const is58mm = (settings?.thermalWidth || '80mm') === '58mm';
  const pageWidth = is58mm ? '58mm' : '80mm';
  const bodyWidth = is58mm ? '48mm' : '72mm';
  const baseFontSize = is58mm ? '11px' : '12px';
  const titleFontSize = is58mm ? '14px' : '16px';
  const grandTotalFontSize = is58mm ? '15px' : '17px';

  // Format date like: Jul 25, 2025
  const billDate = new Date(bill.createdAt);
  const formattedDate = billDate.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = billDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  // Calculate gross items amount before discount
  const grossAmount = bill.items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);

  const itemsHtml = bill.items
    .map(
      (item) => `
      <div class="item-block">
        <div class="item-name">${escapeHtml(item.productName)}${item.size ? ` ${escapeHtml(item.size)}` : ''}</div>
        <table class="item-table">
          <tr>
            <td class="col-price">${Number(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="col-qty">${item.quantity}</td>
            <td class="col-total">${Number(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </table>
      </div>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt_${bill.billNumber}</title>
        <style>
          @page {
            size: ${pageWidth} auto;
            margin: 0mm;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              color: #000 !important;
              width: ${pageWidth} !important;
            }
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: 'JetBrains Mono', 'Courier New', Courier, 'Lucida Console', Monaco, monospace;
            font-size: ${baseFontSize};
            font-weight: 500;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 1.5mm' : '5mm 3mm'};
            width: ${bodyWidth};
            line-height: 1.3;
            letter-spacing: -0.2px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .font-bold { font-weight: 700; }
          .font-black { font-weight: 900; }
          .divider {
            border-top: 1px dashed #000;
            margin: 5px 0;
          }
          .divider-solid {
            border-top: 1.5px solid #000;
            margin: 5px 0;
          }
          .header-title {
            font-size: ${titleFontSize};
            font-weight: 800;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 2px;
          }
          .receipt-logo {
            width: ${is58mm ? '26px' : '32px'};
            height: ${is58mm ? '26px' : '32px'};
            display: block;
            margin: 0 auto 3px auto;
          }
          .header-subtitle {
            font-size: ${is58mm ? '10px' : '11px'};
            text-align: center;
            line-height: 1.25;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 1px 0;
            font-size: ${is58mm ? '10px' : '11.5px'};
          }
          .col-hdr-table {
            width: 100%;
            font-weight: 700;
            font-size: ${is58mm ? '10px' : '11.5px'};
            margin-bottom: 3px;
          }
          .item-block {
            margin-bottom: 4px;
          }
          .item-name {
            font-weight: 700;
            font-size: ${is58mm ? '10.5px' : '12px'};
            line-height: 1.25;
            word-break: break-word;
          }
          .item-table {
            width: 100%;
          }
          .col-price {
            width: 40%;
            text-align: left;
            font-size: ${is58mm ? '10px' : '11.5px'};
          }
          .col-qty {
            width: 20%;
            text-align: center;
            font-weight: 700;
            font-size: ${is58mm ? '10px' : '11.5px'};
          }
          .col-total {
            width: 40%;
            text-align: right;
            font-weight: 700;
            font-size: ${is58mm ? '10px' : '11.5px'};
          }
          .summary-table td {
            padding: 1px 0;
            font-size: ${is58mm ? '10.5px' : '12px'};
          }
          .total-amount-row td {
            font-size: ${grandTotalFontSize};
            font-weight: 900;
            padding: 3px 0;
          }
          .footer-section {
            text-align: center;
            font-size: ${is58mm ? '9.5px' : '10.5px'};
            margin-top: 6px;
            line-height: 1.35;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="text-center">
          <img src="${logoSrc}" class="receipt-logo" alt="" />
          <div class="header-title">${escapeHtml(businessName)}</div>
          <div class="header-subtitle">${escapeHtml(address)}</div>
          <div class="header-subtitle">${escapeHtml(phone)}</div>
        </div>

        <div class="divider"></div>

        <!-- Meta Section (2-column layout matching receipt) -->
        <table class="meta-table">
          <tr>
            <td style="width: 55%;"><strong>Date</strong> &nbsp;${formattedDate}</td>
            <td style="width: 45%;" class="text-right"><strong>Time</strong> &nbsp;${formattedTime}</td>
          </tr>
          <tr>
            <td><strong>Bill</strong> &nbsp;${escapeHtml(bill.billNumber)}</td>
            <td class="text-right"><strong>User</strong> &nbsp;${escapeHtml(bill.cashierName || 'Admin')}</td>
          </tr>
          ${
            bill.tableNumber || bill.orderType !== 'dine_in'
              ? `<tr>
                  <td>${bill.tableNumber ? `<strong>Table</strong> &nbsp;${escapeHtml(bill.tableNumber)}` : ''}</td>
                  <td class="text-right"><strong>Type</strong> &nbsp;${escapeHtml(bill.orderType.toUpperCase().replace('_', ' '))}</td>
                </tr>`
              : ''
          }
        </table>

        <div class="divider"></div>

        <!-- Column Headers -->
        <table class="col-hdr-table">
          <tr>
            <td class="col-price"><strong>Price</strong></td>
            <td class="col-qty"><strong>QTY</strong></td>
            <td class="col-total"><strong>Amount</strong></td>
          </tr>
        </table>

        <div class="divider"></div>

        <!-- Line Items -->
        <div>
          ${itemsHtml}
        </div>

        <div class="divider"></div>

        <!-- Financial Summary Breakdown -->
        <table class="summary-table">
          <tr>
            <td style="width: 60%;">Service Charge${bill.serviceChargeRate ? ` (${bill.serviceChargeRate}%)` : ''}</td>
            <td style="width: 40%;" class="text-right">${Number(bill.serviceCharge || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td>Amount</td>
            <td class="text-right">${Number(grossAmount || bill.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td>Total Bill Discount</td>
            <td class="text-right">(${Number(bill.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</td>
          </tr>
          ${
            bill.tax && bill.tax > 0
              ? `<tr>
                  <td>VAT / Tax (${bill.taxRate || 0}%)</td>
                  <td class="text-right">${Number(bill.tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>`
              : ''
          }
          <tr class="total-amount-row">
            <td><strong>Total Amount</strong></td>
            <td class="text-right"><strong>${Number(bill.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
          </tr>
          <tr>
            <td>Payment (${escapeHtml(bill.paymentMethod.toUpperCase())})</td>
            <td class="text-right">${Number(bill.amountReceived || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td>Balance</td>
            <td class="text-right">${(Number(bill.amountReceived || 0) - Number(bill.grandTotal || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </table>

        <div class="divider"></div>

        <!-- Footer -->
        <div class="footer-section">
          <div><strong>${escapeHtml(footerText)}</strong></div>
          <div style="margin-top: 2px;">System powered by Royal Hotel POS v1.1.0</div>
          <div>${escapeHtml(phone)}</div>
        </div>
      </body>
    </html>
  `;

  return printHtmlContent(html, `Receipt_${bill.billNumber}`);
}

/**
 * Print Kitchen Order Ticket (KOT) for thermal printer
 */
export async function printKOT(
  kot: KOT | { kotNumber: string; orderType: string; tableNumber?: string; cashierName: string; notes?: string; items: OrderItem[]; createdAt: string },
  settings: SystemSettings | null
): Promise<boolean> {
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const is58mm = (settings?.thermalWidth || '80mm') === '58mm';
  const pageWidth = is58mm ? '58mm' : '80mm';
  const bodyWidth = is58mm ? '48mm' : '72mm';

  const kotDate = new Date(kot.createdAt);
  const formattedDate = kotDate.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = kotDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const totalQty = kot.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const itemsHtml = kot.items
    .map(
      (item) => `
      <div style="margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed #333;">
        <table style="width: 100%;">
          <tr>
            <td style="width: ${is58mm ? '28px' : '36px'}; vertical-align: top; font-size: ${is58mm ? '15px' : '17px'}; font-weight: 900; text-align: left;">
              ${item.quantity}x
            </td>
            <td style="vertical-align: top; font-size: ${is58mm ? '12px' : '13.5px'}; font-weight: 800; text-align: left;">
              <div>${escapeHtml(item.productName)}</div>
              ${item.size ? `<div style="font-size: ${is58mm ? '10px' : '11px'}; font-weight: 600; color: #111;">(${escapeHtml(item.size)})</div>` : ''}
              ${
                item.notes
                  ? `<div style="font-size: 10.5px; font-style: italic; font-weight: bold; background: #eee; padding: 2px 4px; margin-top: 2px; border-left: 3px solid #000;">** ${escapeHtml(item.notes)}</div>`
                  : ''
              }
            </td>
          </tr>
        </table>
      </div>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>KOT_${kot.kotNumber}</title>
        <style>
          @page {
            size: ${pageWidth} auto;
            margin: 0mm;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              color: #000 !important;
              width: ${pageWidth} !important;
            }
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
            font-size: ${is58mm ? '11px' : '12px'};
            font-weight: 600;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 2mm' : '5mm 3mm'};
            width: ${bodyWidth};
            line-height: 1.3;
            letter-spacing: -0.2px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .divider {
            border-top: 1.5px dashed #000;
            margin: 5px 0;
          }
          .divider-solid {
            border-top: 2px solid #000;
            margin: 5px 0;
          }
          .kot-title {
            font-size: ${is58mm ? '14px' : '16px'};
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 2px 0;
          }
          .table-badge {
            font-size: ${is58mm ? '15px' : '18px'};
            font-weight: 900;
            background: #000;
            color: #fff;
            padding: 3px 8px;
            display: inline-block;
            margin: 4px 0;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 1px 0;
            font-size: ${is58mm ? '10px' : '11.5px'};
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div style="font-size: 11px; font-weight: bold;">${escapeHtml(businessName)}</div>
          <div class="kot-title">*** KITCHEN ORDER TICKET ***</div>
          <div style="font-size: ${is58mm ? '13px' : '14px'}; font-weight: 900;">TICKET #${escapeHtml(kot.kotNumber)}</div>
          <div class="table-badge">TABLE: ${escapeHtml(kot.tableNumber || 'COUNTER / BAR')}</div>
        </div>

        <div class="divider"></div>

        <table class="meta-table">
          <tr>
            <td style="width: 55%;"><strong>Date</strong> &nbsp;${formattedDate}</td>
            <td style="width: 45%;" class="text-right"><strong>Time</strong> &nbsp;${formattedTime}</td>
          </tr>
          <tr>
            <td><strong>Type</strong> &nbsp;${escapeHtml(kot.orderType.toUpperCase().replace('_', ' '))}</td>
            <td class="text-right"><strong>User</strong> &nbsp;${escapeHtml(kot.cashierName || 'Admin')}</td>
          </tr>
        </table>

        <div class="divider-solid"></div>

        <div style="margin: 4px 0;">
          ${itemsHtml}
        </div>

        <div class="divider-solid"></div>

        <table style="width: 100%; font-weight: 800; font-size: ${is58mm ? '11px' : '12.5px'};">
          <tr>
            <td>TOTAL ITEMS:</td>
            <td class="text-right">${totalQty} Items</td>
          </tr>
        </table>

        ${
          kot.notes
            ? `
          <div class="divider"></div>
          <div style="font-size: ${is58mm ? '10px' : '11px'}; padding: 4px; border: 1.5px solid #000; margin-top: 3px;">
            <strong>SPECIAL INSTRUCTIONS:</strong>
            <div>${escapeHtml(kot.notes)}</div>
          </div>
        `
            : ''
        }

        <div class="divider"></div>

        <div class="text-center" style="font-size: 10px; font-weight: 900; margin-top: 3px;">
          *** DISPATCH TO PREPARATION ***
        </div>
      </body>
    </html>
  `;

  return printHtmlContent(html, `KOT_${kot.kotNumber}`);
}

/**
 * Print dedicated Room Booking Ticket & Receipt
 * Formatted for thermal 80mm/58mm printers and standard paper.
 */
export async function printRoomBookingTicket(
  booking: RoomBooking,
  room: Room | null,
  settings: SystemSettings | null
): Promise<boolean> {
  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const logoSrc = getBrandLogoSrc();
  const tagline = settings?.businessTagline || 'Fine Hospitality, Restaurant & Bar';
  const address = settings?.address || 'No. 42 Beach Road, Puttalam, Sri Lanka';
  const phone = settings?.phone || '+94 32 226 5500';
  const email = settings?.email || 'royalgreengardenputtalam@gmail.com';
  const footerText = settings?.receiptFooter || 'Thank you for staying at Royal Hotel! Have a wonderful stay.';
  const itemChargesTotal = (booking.itemCharges || []).reduce((sum, charge) => sum + charge.total, 0);
  const otherExtraCharges = Math.max(0, booking.extraCharges - itemChargesTotal);

  const is58mm = (settings?.thermalWidth || '80mm') === '58mm';
  const pageWidth = is58mm ? '58mm' : '80mm';
  const bodyWidth = is58mm ? '48mm' : '72mm';

  const checkInDateObj = new Date(booking.checkInDate || booking.createdAt);
  const checkOutDateObj = new Date(booking.checkOutDate);

  const formattedCreated = new Date(booking.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const formattedCheckIn = checkInDateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const formattedCheckOut = checkOutDateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const statusLabel = booking.status.toUpperCase().replace('_', ' ');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Booking_${escapeHtml(booking.bookingNumber)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

          @media print {
            @page {
              size: ${pageWidth} auto;
              margin: 0mm;
            }
            body {
              width: ${pageWidth};
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-print { display: none !important; }
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'JetBrains Mono', monospace, 'Courier New', Courier;
            font-size: ${is58mm ? '11px' : '12px'};
            font-weight: 600;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 2mm' : '5mm 3mm'};
            width: ${bodyWidth};
            line-height: 1.3;
            letter-spacing: -0.2px;
          }

          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          
          .divider {
            border-top: 1.5px dashed #000;
            margin: 4px 0;
          }
          
          .divider-solid {
            border-top: 2px solid #000;
            margin: 5px 0;
          }

          .header-title {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .receipt-logo {
            width: ${is58mm ? '26px' : '32px'};
            height: ${is58mm ? '26px' : '32px'};
            display: block;
            margin: 0 auto 3px auto;
          }

          .booking-title {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
            margin: 3px 0 1px 0;
            letter-spacing: 0.5px;
          }

          .room-badge {
            font-size: ${is58mm ? '14px' : '16px'};
            font-weight: 900;
            background: #000;
            color: #fff;
            padding: 3px 8px;
            display: inline-block;
            margin: 4px 0;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }

          .status-tag {
            display: inline-block;
            font-size: ${is58mm ? '10px' : '11px'};
            font-weight: 800;
            border: 1.5px solid #000;
            padding: 1px 6px;
            border-radius: 3px;
            margin-top: 2px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          .kv-table td {
            padding: 1.5px 0;
            font-size: ${is58mm ? '10.5px' : '11.5px'};
            vertical-align: top;
          }

          .highlight-row {
            font-weight: 800;
            font-size: ${is58mm ? '12px' : '13.5px'};
          }
          
          .grand-total-row {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
          }

          .signature-box {
            margin-top: 14px;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="text-center">
          <img src="${logoSrc}" class="receipt-logo" alt="" />
          <div class="header-title">${escapeHtml(businessName)}</div>
          <div style="font-size: 10px; margin: 1px 0;">${escapeHtml(tagline)}</div>
          <div style="font-size: 9.5px;">${escapeHtml(address)}</div>
          <div style="font-size: 9.5px;">Tel: ${escapeHtml(phone)}</div>
          
          <div class="divider"></div>
          <div class="booking-title">*** ROOM BOOKING TICKET ***</div>
          <div style="font-size: 11px; font-weight: bold;">TICKET #${escapeHtml(booking.bookingNumber)}</div>
          <div class="room-badge">ROOM: ${escapeHtml(booking.roomNumber)}</div>
          <div><span class="status-tag">[ ${statusLabel} ]</span></div>
          <div style="font-size: 10px; margin-top: 2px;">${escapeHtml(booking.roomType)}${room?.floor ? ' &bull; ' + escapeHtml(room.floor) : ''}</div>
        </div>

        <div class="divider"></div>

        <!-- Guest Details -->
        <table class="kv-table">
          <tr>
            <td style="width: 38%;"><strong>Guest Name:</strong></td>
            <td style="width: 62%;" class="text-right"><strong>${escapeHtml(booking.guestName)}</strong></td>
          </tr>
          <tr>
            <td><strong>Phone:</strong></td>
            <td class="text-right">${escapeHtml(booking.guestPhone)}</td>
          </tr>
          ${booking.guestIdOrPassport ? `
          <tr>
            <td><strong>NIC/Passport:</strong></td>
            <td class="text-right">${escapeHtml(booking.guestIdOrPassport)}</td>
          </tr>` : ''}
          ${booking.guestAddress ? `
          <tr>
            <td><strong>Address/City:</strong></td>
            <td class="text-right">${escapeHtml(booking.guestAddress)}</td>
          </tr>` : ''}
          <tr>
            <td><strong>No. of Guests:</strong></td>
            <td class="text-right">${booking.numberOfGuests} Person(s)</td>
          </tr>
        </table>

        <div class="divider"></div>

        <!-- Stay Schedule -->
        <table class="kv-table">
          <tr>
            <td style="width: 40%;"><strong>Check-In:</strong></td>
            <td style="width: 60%;" class="text-right"><strong>${formattedCheckIn}</strong></td>
          </tr>
          <tr>
            <td><strong>Check-Out:</strong></td>
            <td class="text-right"><strong>${formattedCheckOut}</strong></td>
          </tr>
          <tr>
            <td><strong>Duration:</strong></td>
            <td class="text-right">${booking.durationDays} Night(s) / Day(s)</td>
          </tr>
          <tr>
            <td><strong>Issued At:</strong></td>
            <td class="text-right">${formattedCreated}</td>
          </tr>
          <tr>
            <td><strong>Receptionist:</strong></td>
            <td class="text-right">${escapeHtml(booking.cashierName || 'Admin')}</td>
          </tr>
        </table>

        <div class="divider-solid"></div>

        <!-- Financial Charges Breakdown -->
        <table class="kv-table">
          <tr>
            <td>Room Rate (per day):</td>
            <td class="text-right">${formatCurrency(booking.ratePerDay, currencySymbol)}</td>
          </tr>
          <tr>
            <td>Room Charge (${booking.durationDays}d):</td>
            <td class="text-right">${formatCurrency(booking.totalRoomCharge, currencySymbol)}</td>
          </tr>
          ${(booking.itemCharges || []).flatMap(charge => charge.items.map(item => `
          <tr>
            <td>${escapeHtml(item.productName)} (${escapeHtml(item.size)}) × ${item.quantity}</td>
            <td class="text-right">${formatCurrency(item.total, currencySymbol)}</td>
          </tr>`)).join('')}
          ${otherExtraCharges > 0 ? `
          <tr>
            <td>Extra Services / Bed:</td>
            <td class="text-right">${formatCurrency(otherExtraCharges, currencySymbol)}</td>
          </tr>` : ''}
          ${booking.tax > 0 ? `
          <tr>
            <td>Tax / Govt Levy:</td>
            <td class="text-right">${formatCurrency(booking.tax, currencySymbol)}</td>
          </tr>` : ''}
          ${booking.discount > 0 ? `
          <tr>
            <td>Discount:</td>
            <td class="text-right">-${formatCurrency(booking.discount, currencySymbol)}</td>
          </tr>` : ''}
        </table>

        <div class="divider"></div>

        <!-- Grand Total & Balances -->
        <table class="kv-table">
          <tr class="grand-total-row">
            <td>TOTAL AMOUNT:</td>
            <td class="text-right">${formatCurrency(booking.grandTotal, currencySymbol)}</td>
          </tr>
          <tr class="highlight-row">
            <td>ADVANCE PAID:</td>
            <td class="text-right">${formatCurrency(booking.advancePaid, currencySymbol)}</td>
          </tr>
          <tr class="highlight-row" style="color: ${booking.balanceDue > 0 ? '#000' : '#000'};">
            <td><strong>BALANCE DUE:</strong></td>
            <td class="text-right"><strong>${formatCurrency(booking.balanceDue, currencySymbol)}</strong></td>
          </tr>
          <tr>
            <td>Payment Method:</td>
            <td class="text-right">${escapeHtml(booking.paymentMethod.toUpperCase().replace('_', ' '))}</td>
          </tr>
        </table>

        ${booking.notes ? `
        <div class="divider"></div>
        <div style="font-size: 10px; padding: 3px; border: 1px solid #000; margin-top: 3px;">
          <strong>Notes / Special Requests:</strong>
          <div>${escapeHtml(booking.notes)}</div>
        </div>` : ''}

        <div class="divider-solid"></div>

        <!-- Hotel Policies & Wi-Fi -->
        <div style="font-size: 9.5px; line-height: 1.25; margin: 4px 0;">
          <div>&bull; Standard Check-Out Time: <strong>12:00 PM Noon</strong></div>
          <div>&bull; Free Guest Wi-Fi: <strong>RoyalHotel_Guest</strong></div>
          <div>&bull; Room Service & Bar Dial: <strong>Ext. 100 / Reception</strong></div>
        </div>

        <div class="divider"></div>

        <!-- Signatures -->
        <table style="width: 100%; margin-top: 14px; font-size: 9.5px;">
          <tr>
            <td style="width: 50%; text-align: center;">
              ____________________<br>
              <strong>Guest Signature</strong>
            </td>
            <td style="width: 50%; text-align: center;">
              ____________________<br>
              <strong>Authorized Sign</strong>
            </td>
          </tr>
        </table>

        <div class="divider" style="margin-top: 12px;"></div>

        <!-- Footer -->
        <div class="text-center" style="margin-top: 4px;">
          <div style="font-size: 10.5px; font-weight: bold;">${escapeHtml(footerText)}</div>
          <div style="font-size: 9px; color: #333; margin-top: 2px;">Royal Hotel Management System</div>
        </div>
      </body>
    </html>
  `;

  return printHtmlContent(html, `Booking_${booking.bookingNumber}`);
}


/**
 * Print dedicated Hotel Function / Event Booking Ticket & Receipt
 * (v1.4.0) — weddings, parties, meetings, corporate events.
 * Formatted for thermal 80mm/58mm printers and standard paper.
 */
export async function printFunctionBookingTicket(
  booking: FunctionBooking,
  hall: FunctionHall | null,
  settings: SystemSettings | null
): Promise<boolean> {
  const currencySymbol = settings?.currencySymbol || 'Rs.';
  const businessName = settings?.businessName || 'Royal Hotel & Restaurant';
  const logoSrc = getBrandLogoSrc();
  const tagline = settings?.businessTagline || 'Fine Liquor, Cuisine & Hospitality';
  const address = settings?.address || 'No. 42 Beach Road, Puttalam, Sri Lanka';
  const phone = settings?.phone || '+94 32 226 5500';
  const footerText = settings?.receiptFooter || 'Thank you for choosing Royal Hotel! We look forward to hosting your event.';

  const is58mm = (settings?.thermalWidth || '80mm') === '58mm';
  const pageWidth = is58mm ? '58mm' : '80mm';
  const bodyWidth = is58mm ? '48mm' : '72mm';

  const eventDateObj = new Date(booking.eventDate || booking.createdAt);

  const formattedCreated = new Date(booking.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const formattedEventDate = eventDateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

  const sessionLabel =
    booking.session === 'day' ? 'Day Session (9 AM - 5 PM)' :
    booking.session === 'evening' ? 'Evening Session (6 PM - 12 AM)' :
    'Full Day Session';

  const eventTypeLabel = booking.eventType.replace('_', ' ').toUpperCase();
  const statusLabel = booking.status.toUpperCase().replace('_', ' ');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Event_${escapeHtml(booking.bookingNumber)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

          @media print {
            @page {
              size: ${pageWidth} auto;
              margin: 0mm;
            }
            body {
              width: ${pageWidth};
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-print { display: none !important; }
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'JetBrains Mono', monospace, 'Courier New', Courier;
            font-size: ${is58mm ? '11px' : '12px'};
            font-weight: 600;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: ${is58mm ? '3mm 2mm' : '5mm 3mm'};
            width: ${bodyWidth};
            line-height: 1.3;
            letter-spacing: -0.2px;
          }

          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }

          .divider {
            border-top: 1.5px dashed #000;
            margin: 4px 0;
          }

          .divider-solid {
            border-top: 2px solid #000;
            margin: 5px 0;
          }

          .header-title {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .receipt-logo {
            width: ${is58mm ? '26px' : '32px'};
            height: ${is58mm ? '26px' : '32px'};
            display: block;
            margin: 0 auto 3px auto;
          }

          .booking-title {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
            margin: 3px 0 1px 0;
            letter-spacing: 0.5px;
          }

          .hall-badge {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
            background: #000;
            color: #fff;
            padding: 3px 8px;
            display: inline-block;
            margin: 4px 0;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }

          .status-tag {
            display: inline-block;
            font-size: ${is58mm ? '10px' : '11px'};
            font-weight: 800;
            border: 1.5px solid #000;
            padding: 1px 6px;
            border-radius: 3px;
            margin-top: 2px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          .kv-table td {
            padding: 1.5px 0;
            font-size: ${is58mm ? '10.5px' : '11.5px'};
            vertical-align: top;
          }

          .highlight-row {
            font-weight: 800;
            font-size: ${is58mm ? '12px' : '13.5px'};
          }

          .grand-total-row {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 900;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="text-center">
          <img src="${logoSrc}" class="receipt-logo" alt="" />
          <div class="header-title">${escapeHtml(businessName)}</div>
          <div style="font-size: 10px; margin: 1px 0;">${escapeHtml(tagline)}</div>
          <div style="font-size: 9.5px;">${escapeHtml(address)}</div>
          <div style="font-size: 9.5px;">Tel: ${escapeHtml(phone)}</div>

          <div class="divider"></div>
          <div class="booking-title">*** FUNCTION BOOKING TICKET ***</div>
          <div style="font-size: 11px; font-weight: bold;">TICKET #${escapeHtml(booking.bookingNumber)}</div>
          <div class="hall-badge">${escapeHtml(booking.hallName)}</div>
          <div><span class="status-tag">[ ${statusLabel} ]</span></div>
          <div style="font-size: 10px; margin-top: 2px;">${escapeHtml(booking.hallType)}${hall?.floor ? ' &bull; ' + escapeHtml(hall.floor) : ''}</div>
          <div style="font-size: 11px; margin-top: 2px; font-weight: 800;">${eventTypeLabel} EVENT</div>
        </div>

        <div class="divider"></div>

        <!-- Customer Details -->
        <table class="kv-table">
          <tr>
            <td style="width: 38%;"><strong>Customer:</strong></td>
            <td style="width: 62%;" class="text-right"><strong>${escapeHtml(booking.customerName)}</strong></td>
          </tr>
          <tr>
            <td><strong>Phone:</strong></td>
            <td class="text-right">${escapeHtml(booking.customerPhone)}</td>
          </tr>
          ${booking.customerAddress ? `
          <tr>
            <td><strong>Address:</strong></td>
            <td class="text-right">${escapeHtml(booking.customerAddress)}</td>
          </tr>` : ''}
          <tr>
            <td><strong>Expected Guests:</strong></td>
            <td class="text-right">${booking.expectedGuests} Person(s)</td>
          </tr>
        </table>

        <div class="divider"></div>

        <!-- Event Schedule -->
        <table class="kv-table">
          <tr>
            <td style="width: 40%;"><strong>Event Date:</strong></td>
            <td style="width: 60%;" class="text-right"><strong>${formattedEventDate}</strong></td>
          </tr>
          <tr>
            <td><strong>Session:</strong></td>
            <td class="text-right">${escapeHtml(sessionLabel)}</td>
          </tr>
          <tr>
            <td><strong>Issued At:</strong></td>
            <td class="text-right">${formattedCreated}</td>
          </tr>
          <tr>
            <td><strong>Booked By:</strong></td>
            <td class="text-right">${escapeHtml(booking.cashierName || 'Admin')}</td>
          </tr>
        </table>

        <div class="divider-solid"></div>

        <!-- Financial Charges Breakdown -->
        <table class="kv-table">
          <tr>
            <td>Hall Charge:</td>
            <td class="text-right">${formatCurrency(booking.hallCharge, currencySymbol)}</td>
          </tr>
          ${booking.numberOfPlates > 0 ? `
          <tr>
            <td>Food (${booking.numberOfPlates} plates x ${formatCurrency(booking.perPlateRate, currencySymbol)}):</td>
            <td class="text-right">${formatCurrency(booking.plateCharge, currencySymbol)}</td>
          </tr>` : ''}
          ${booking.extraServices > 0 ? `
          <tr>
            <td>Extra Services / Decor:</td>
            <td class="text-right">${formatCurrency(booking.extraServices, currencySymbol)}</td>
          </tr>` : ''}
          ${booking.tax > 0 ? `
          <tr>
            <td>Tax / Govt Levy:</td>
            <td class="text-right">${formatCurrency(booking.tax, currencySymbol)}</td>
          </tr>` : ''}
          ${booking.discount > 0 ? `
          <tr>
            <td>Discount:</td>
            <td class="text-right">-${formatCurrency(booking.discount, currencySymbol)}</td>
          </tr>` : ''}
        </table>

        <div class="divider"></div>

        <!-- Grand Total & Balances -->
        <table class="kv-table">
          <tr class="grand-total-row">
            <td>TOTAL AMOUNT:</td>
            <td class="text-right">${formatCurrency(booking.grandTotal, currencySymbol)}</td>
          </tr>
          <tr class="highlight-row">
            <td>ADVANCE PAID:</td>
            <td class="text-right">${formatCurrency(booking.advancePaid, currencySymbol)}</td>
          </tr>
          <tr class="highlight-row">
            <td><strong>BALANCE DUE:</strong></td>
            <td class="text-right"><strong>${formatCurrency(booking.balanceDue, currencySymbol)}</strong></td>
          </tr>
          <tr>
            <td>Payment Method:</td>
            <td class="text-right">${escapeHtml(booking.paymentMethod.toUpperCase().replace('_', ' '))}</td>
          </tr>
        </table>

        ${booking.notes ? `
        <div class="divider"></div>
        <div style="font-size: 10px; padding: 3px; border: 1px solid #000; margin-top: 3px;">
          <strong>Notes / Special Requests:</strong>
          <div>${escapeHtml(booking.notes)}</div>
        </div>` : ''}

        <div class="divider-solid"></div>

        <!-- Hotel Policies -->
        <div style="font-size: 9.5px; line-height: 1.25; margin: 4px 0;">
          <div>&bull; Hall opens: <strong>8:00 AM</strong> &bull; Event end: <strong>12:00 AM</strong></div>
          <div>&bull; Outside catering/bands need prior approval</div>
          <div>&bull; Reservations: <strong>Ext. 100 / Reception</strong></div>
        </div>

        <div class="divider"></div>

        <!-- Signatures -->
        <table style="width: 100%; margin-top: 14px; font-size: 9.5px;">
          <tr>
            <td style="width: 50%; text-align: center;">
              ____________________<br>
              <strong>Customer Signature</strong>
            </td>
            <td style="width: 50%; text-align: center;">
              ____________________<br>
              <strong>Authorized Sign</strong>
            </td>
          </tr>
        </table>

        <div class="divider" style="margin-top: 12px;"></div>

        <!-- Footer -->
        <div class="text-center" style="margin-top: 4px;">
          <div style="font-size: 10.5px; font-weight: bold;">${escapeHtml(footerText)}</div>
          <div style="font-size: 9px; color: #333; margin-top: 2px;">Royal Hotel Management System</div>
        </div>
      </body>
    </html>
  `;

  return printHtmlContent(html, `Event_${booking.bookingNumber}`);
}
