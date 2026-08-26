/* E2E — Barcode Purchasing (Bar Items Only) Test
 *
 * Verifies that:
 * 1. Barcode fields on product variants save and update correctly.
 * 2. Bar items (category type 'bar', !isKitchenItem) have valid barcodes.
 * 3. Kitchen items are properly identified as kitchen/food items.
 * 4. Duplicate barcodes on different products are rejected by the server.
 */
import { equal, ok } from 'node:assert';

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    results.push(`✅ ${name}`);
  } else {
    fail++;
    results.push(`❌ ${name} ${extra}`);
  }
}

async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function run() {
  console.log('--- Starting Barcode Bar-Only E2E Test ---');

  // 1. Login as Admin
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
  check('Login as Admin', login.status === 200, `got ${login.status}`);
  const token = login.json?.token;

  // 2. Fetch products & categories
  const [prodsRes, catsRes] = await Promise.all([
    api('/api/products', {}, token),
    api('/api/categories', {}, token),
  ]);

  const products = prodsRes.json || [];
  const categories = catsRes.json || [];

  check('Products list loaded', Array.isArray(products) && products.length > 0);
  check('Categories list loaded', Array.isArray(categories) && categories.length > 0);

  // 3. Find Lion Lager
  const lionLager = products.find(p => p.id === 'prod-4' || p.name.includes('Lion Lager'));
  check('Lion Lager product exists', Boolean(lionLager));

  const lionCat = categories.find(c => c.id === lionLager?.categoryId);
  const lionIsKitchen = Boolean(lionLager?.isKitchenItem || lionCat?.type === 'restaurant');
  check('Lion Lager identified as BAR ITEM (not kitchen)', lionIsKitchen === false);

  // Update Lion Lager variant to include barcode '4790003001'
  if (lionLager) {
    const updatedVariants = lionLager.variants.map((v, i) => i === 0 ? { ...v, barcode: '4790003001' } : v);
    const updateRes = await api(`/api/products/${lionLager.id}`, {
      method: 'PUT',
      body: {
        ...lionLager,
        variants: updatedVariants
      }
    }, token);
    check('Updated Lion Lager variant with barcode 4790003001', updateRes.status === 200);

    // Verify barcode saved
    const refreshed = await api('/api/products', {}, token);
    const updatedLion = refreshed.json?.find((p) => p.id === lionLager.id);
    const varWithCode = updatedLion?.variants?.find((v) => v.barcode === '4790003001');
    check('Refreshed Lion Lager has barcode 4790003001', Boolean(varWithCode));
  }

  // 4. Find Spicy Devilled Chicken (Kitchen Item)
  const devilledChicken = products.find(p => p.id === 'prod-8' || p.name.includes('Devilled Chicken'));
  check('Spicy Devilled Chicken product exists', Boolean(devilledChicken));

  const chickenCat = categories.find(c => c.id === devilledChicken?.categoryId);
  const chickenIsKitchen = Boolean(devilledChicken?.isKitchenItem || chickenCat?.type === 'restaurant');
  check('Spicy Devilled Chicken identified as KITCHEN/RESTAURANT ITEM', chickenIsKitchen === true);

  // 5. Create a new Bar Product with a barcode
  const timeSuffix = Date.now().toString().slice(-6);
  const testBarcode = `888999${timeSuffix}`;
  const newBarProdRes = await api('/api/products', {
    method: 'POST',
    body: {
      name: `E2E Barcode Test Rum ${timeSuffix}`,
      categoryId: 'cat-1',
      isKitchenItem: false,
      servesShots: false,
      variants: [
        {
          size: '750ml Bottle',
          sku: `RUM-${timeSuffix}`,
          barcode: testBarcode,
          costPrice: 2000,
          sellingPrice: 3000,
          stock: 20,
          minStockLevel: 5,
        }
      ]
    }
  }, token);

  check('Create Bar Product with Barcode', newBarProdRes.status === 201 || newBarProdRes.status === 200, `got ${newBarProdRes.status}`);
  const createdId = newBarProdRes.json?.id;

  // 6. Attempt to create another product with duplicate barcode testBarcode (should fail)
  const dupBarcodeRes = await api('/api/products', {
    method: 'POST',
    body: {
      name: `E2E Duplicate Barcode Item ${timeSuffix}`,
      categoryId: 'cat-1',
      isKitchenItem: false,
      variants: [
        {
          size: '750ml',
          sku: `DUP-${timeSuffix}`,
          barcode: testBarcode,
          costPrice: 1000,
          sellingPrice: 1500,
          stock: 10,
        }
      ]
    }
  }, token);

  check('Duplicate Barcode rejected by server', dupBarcodeRes.status === 400 || dupBarcodeRes.status === 409, `got ${dupBarcodeRes.status}`);

  // Clean up test item
  if (createdId) {
    await api(`/api/products/${createdId}`, { method: 'DELETE' }, token);
  }

  console.log(`\n===== Barcode Bar-Only E2E Results: ${pass} passed, ${fail} failed =====`);
  results.forEach(r => console.log(r));
  if (fail > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
