/**
 * Code 128 (Subset B) Pure TypeScript Barcode Generator
 * Encodes alphanumeric strings into crisp vector SVG barcodes suitable for thermal sticker printers and PDF/HTML printing.
 */

const CODE128_PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2] // Stop pattern
];

export interface BarcodeElement {
  isBar: boolean;
  width: number;
}

export function encodeCode128B(text: string): BarcodeElement[] {
  const clean = text.trim() || '000000';
  const codes = [104]; // Start Code B

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    if (charCode >= 32 && charCode <= 126) {
      codes.push(charCode - 32);
    } else {
      codes.push(31); // '?' fallback
    }
  }

  // Calculate Checksum
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  const bars: BarcodeElement[] = [];
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    for (let p = 0; p < pattern.length; p++) {
      bars.push({ isBar: p % 2 === 0, width: pattern[p] });
    }
  }
  return bars;
}

export interface BarcodeRenderOptions {
  height?: number;
  barWidth?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Generates an SVG string representation of a Code 128 barcode.
 */
export function generateBarcodeSVG(code: string, options: BarcodeRenderOptions = {}): string {
  const height = options.height || 45;
  const barWidth = options.barWidth || 2;
  const showText = options.showText !== false;
  const cleanCode = String(code || '').trim();

  const bars = encodeCode128B(cleanCode);
  const totalModules = bars.reduce((sum, b) => sum + b.width, 0);
  const svgWidth = totalModules * barWidth;
  const svgHeight = height + (showText ? 16 : 0);

  let currentX = 0;
  let rects = '';

  for (const b of bars) {
    const w = b.width * barWidth;
    if (b.isBar) {
      rects += `<rect x="${currentX}" y="0" width="${w}" height="${height}" fill="#000000" />`;
    }
    currentX += w;
  }

  let textSvg = '';
  if (showText) {
    textSvg = `<text x="${svgWidth / 2}" y="${height + 13}" font-family="monospace, sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="#000000">${cleanCode}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${rects}${textSvg}</svg>`;
}
