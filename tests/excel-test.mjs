import assert from 'node:assert';
import writeXlsxFileNode from 'write-excel-file/node';
import { readSheet } from 'read-excel-file/node';
import Papa from 'papaparse';

console.log('Testing Excel write/read and CSV parsing...');

// 1. Test Excel Export / Write
const testData = [
  {
    '#': 1,
    'SKU': 'LION-LAG-625',
    'Barcode': '4791111222333',
    'Product Name': 'Lion Lager',
    'Category': 'Beer',
    'Buying Price': 580,
    'Selling Price': 750,
    'Quantity': 48,
    'Active': true,
  },
  {
    '#': 2,
    'SKU': 'ARR-EXT-750',
    'Barcode': '4791111222444',
    'Product Name': 'Extra Special',
    'Category': 'Arrack',
    'Buying Price': 2950,
    'Selling Price': 3650,
    'Quantity': 24,
    'Active': false,
  }
];

const headers = Object.keys(testData[0]);
const headerRow = headers.map(h => ({ value: h, fontWeight: 'bold' }));
const dataRows = testData.map(item =>
  headers.map(h => {
    const val = item[h];
    if (val === null || val === undefined) return { type: String, value: '' };
    if (typeof val === 'number') return { type: Number, value: val };
    if (typeof val === 'boolean') return { type: Boolean, value: val };
    return { type: String, value: String(val) };
  })
);

const filePath = '/tmp/test_export.xlsx';
await writeXlsxFileNode([headerRow, ...dataRows], { sheet: 'Sales' }).toFile(filePath);
console.log('✅ Excel write successful');

// 2. Test Excel Import / Read
const readRows = await readSheet(filePath);
assert.strictEqual(readRows.length, 3, 'Should have header + 2 data rows');
assert.deepStrictEqual(readRows[0], headers, 'Headers should match');
assert.strictEqual(readRows[1][1], 'LION-LAG-625');
assert.strictEqual(readRows[1][5], 580);
assert.strictEqual(readRows[1][6], 750);
assert.strictEqual(readRows[1][7], 48);
console.log('✅ Excel read/parsing successful');

// 3. Test CSV parsing
const csvContent = `SKU,Product Name,Quantity,Buying Price,Selling Price\nLION-LAG-625,Lion Lager,48,580,750\nARR-EXT-750,Extra Special,24,2950,3650`;
const parsedCsv = Papa.parse(csvContent, { header: true, skipEmptyLines: true, dynamicTyping: true });
assert.strictEqual(parsedCsv.data.length, 2);
assert.strictEqual(parsedCsv.data[0].SKU, 'LION-LAG-625');
assert.strictEqual(parsedCsv.data[0].Quantity, 48);
console.log('✅ CSV parsing successful');

console.log('🎉 All Excel & CSV tests passed perfectly!');
