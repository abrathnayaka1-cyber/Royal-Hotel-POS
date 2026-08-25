/* E2E adversarial/edge tests — Royal Hotel POS */
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name} ${extra}`); }
}
async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
const token = login.json?.token;
const uniq = Date.now();

// ---- A. Discount clamp ----
const cat = await api('/api/categories', { method: 'POST', body: { name: `CatA-${uniq}` } }, token);
const catId = cat.json?.id;
const prod = await api('/api/products', {
  method: 'POST',
  body: {
    name: `ProdA-${uniq}`, categoryId: catId,
    variants: [{ size: '750ml', sellingPrice: 1000, stock: 50, costPrice: 500 }],
  },
}, token);
const v1 = prod.json?.variants?.[0]?.id;

// maxDiscountPercentage = 20; send 90% discount
const d90 = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: v1, quantity: 1 }], paymentMethod: 'cash', amountReceived: 1000, discountPercentage: 90 },
}, token);
// 1000 - 20% = 800 + 10% service = 880
check('discount clamped to 20% (grand=880)', Math.abs((d90.json?.grandTotal ?? 0) - 880) < 0.01, JSON.stringify(d90.json));
check('bill stores clamped discountPercentage=20', d90.json?.discountPercentage === 20, `got ${d90.json?.discountPercentage}`);

// ---- B. Change password security ----
const cp = await api('/api/auth/change-password', { method: 'POST', body: { newPassword: 'NewPass123!' } }, token);
check('change-password without current rejected (400)', cp.status === 400, `got ${cp.status} ${JSON.stringify(cp.json)}`);

// ---- C. Void twice ----
const vv = await api(`/api/bills/${d90.json?.id}/void`, { method: 'POST', body: { reason: 'test' } }, token);
const vv2 = await api(`/api/bills/${d90.json?.id}/void`, { method: 'POST', body: { reason: 'test2' } }, token);
check('void works', vv.status === 200, `got ${vv.status}`);
check('double void blocked (400)', vv2.status === 400, `got ${vv2.status} ${JSON.stringify(vv2.json)}`);

// ---- D. Cashier room rate change -> 403 ----
const room = await api('/api/rooms', { method: 'POST', body: { roomNumber: `RA${uniq % 100000}`, roomType: 'Standard', ratePerDay: 5000 } }, token);
const roomId = room.json?.id;
const cUser = await api('/api/users', { method: 'POST', body: { username: `cashA${uniq}`, name: 'Cash A', password: 'Cashier123', role: 'cashier' } }, token);
const cLogin = await api('/api/auth/login', { method: 'POST', body: { username: cUser.json?.username, password: 'Cashier123' } });
const cToken = cLogin.json?.token;
const rateChange = await api(`/api/rooms/${roomId}`, { method: 'PUT', body: { ratePerDay: 99999 } }, cToken);
check('cashier room rate change blocked (403)', rateChange.status === 403, `got ${rateChange.status} ${JSON.stringify(rateChange.json)}`);
const statusChange = await api(`/api/rooms/${roomId}`, { method: 'PUT', body: { status: 'cleaning' } }, cToken);
check('cashier room status change allowed (200)', statusChange.status === 200, `got ${statusChange.status} ${JSON.stringify(statusChange.json)}`);

// ---- E. Checkout removes held bill ----
const held = await api('/api/orders/hold', { method: 'POST', body: { items: [{ variantId: v1, quantity: 1 }] } }, token);
const heldId = held.json?.id;
const coWithHeld = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: v1, quantity: 1 }], paymentMethod: 'cash', amountReceived: 2000, heldBillId: heldId },
}, token);
check('checkout with heldBillId', coWithHeld.status === 201, `got ${coWithHeld.status} ${JSON.stringify(coWithHeld.json)?.slice(0, 120)}`);
const heldAfter = await api('/api/orders/held', {}, token);
check('held bill removed after checkout', !heldAfter.json?.some(h => h.id === heldId), JSON.stringify(heldAfter.json)?.slice(0, 120));
await api(`/api/bills/${coWithHeld.json?.id}/void`, { method: 'POST', body: { reason: 'cleanup' } }, token);

// ---- F. Shot variant flow ----
const shotProd = await api('/api/products', {
  method: 'POST',
  body: {
    name: `WhiskyA-${uniq}`, categoryId: catId, servesShots: true,
    variants: [
      { size: '750ml', sellingPrice: 8000, stock: 2, costPrice: 6000 },
      { size: '100ml (Peg)', sellingPrice: 1500, stock: 0, costPrice: 0, isShot: true, shotVolumeMl: 100 },
    ],
  },
}, token);
check('create shot product', shotProd.status === 201, `got ${shotProd.status} ${JSON.stringify(shotProd.json)?.slice(0, 200)}`);
const bottleV = shotProd.json?.variants?.find(x => !x.isShot)?.id;
const pegV = shotProd.json?.variants?.find(x => x.isShot)?.id;

// Sell 5 pegs (500ml) — should not consume a full bottle yet (750ml pool: 1500ml, openUsed 500)
const pegSale = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: pegV, quantity: 5 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
check('5 peg sale ok (5x1500=7500 + 10% = 8250)', Math.abs((pegSale.json?.grandTotal ?? 0) - 8250) < 0.01, `got ${pegSale.json?.grandTotal}`);
const prodsAfterPegs = await api('/api/products', {}, token);
const shotP = prodsAfterPegs.json?.find(p => p.id === shotProd.json?.id);
check('bottle stock still 2 after 500ml shots', shotP?.variants?.find(x => !x.isShot)?.stock === 2, `got ${JSON.stringify(shotP?.variants)}`);
check('openBottleUsedMl = 500', shotP?.openBottleUsedMl === 500, `got ${shotP?.openBottleUsedMl}`);

// Sell 3 more pegs (300ml) — openUsed 500+300=800 → consumes 1 bottle, openUsed=50
const pegSale2 = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: pegV, quantity: 3 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
check('3 more pegs ok (grand=4950)', Math.abs((pegSale2.json?.grandTotal ?? 0) - 4950) < 0.01, `got ${pegSale2.json?.grandTotal}`);
const prodsAfterPegs2 = await api('/api/products', {}, token);
const shotP2 = prodsAfterPegs2.json?.find(p => p.id === shotProd.json?.id);
check('bottle stock 2 -> 1 (800ml consumed)', shotP2?.variants?.find(x => !x.isShot)?.stock === 1, `got ${JSON.stringify(shotP2?.variants)}`);
check('openBottleUsedMl = 50', shotP2?.openBottleUsedMl === 50, `got ${shotP2?.openBottleUsedMl}`);

// Oversell shots: 8 more pegs = 800ml > 750+50 available -> blocked
const overPeg = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: pegV, quantity: 8 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
check('shot oversell blocked (400)', overPeg.status === 400, `got ${overPeg.status} ${JSON.stringify(overPeg.json)}`);

// Void peg sale 2 -> restores: bottle 1->2, openUsed 50->... 750-300=... restore: used 50 - 300 = -250 → 450? compute: restoreShotMl subtracts; openUsed was 50, minus 300 → wrap: bottle +1, openUsed = 50+750-300 = 500
const voidPeg2 = await api(`/api/bills/${pegSale2.json?.id}/void`, { method: 'POST', body: { reason: 'test' } }, token);
check('void peg sale 2', voidPeg2.status === 200, `got ${voidPeg2.status} ${JSON.stringify(voidPeg2.json)}`);
const prodsAfterVoid = await api('/api/products', {}, token);
const shotP3 = prodsAfterVoid.json?.find(p => p.id === shotProd.json?.id);
check('bottle stock restored to 2', shotP3?.variants?.find(x => !x.isShot)?.stock === 2, `got ${JSON.stringify(shotP3?.variants)}`);
check('openBottleUsedMl restored to 500', shotP3?.openBottleUsedMl === 500, `got ${shotP3?.openBottleUsedMl}`);

// ---- G. Daily stock sheet with damage ----
// bottle currently 2. Report damage 1 bottle.
const damage = await api('/api/inventory/damage-report', { method: 'POST', body: { variantId: bottleV, quantity: 1, reason: 'E2E breakage test' } }, token);
check('damage report (201 Created)', damage.status === 201, `got ${damage.status} ${JSON.stringify(damage.json)}`);
const sheet = await api('/api/reports/daily-stock-sheet', {}, token);
const row = sheet.json?.items?.find(i => i.variantId === bottleV);
check('sheet has bottle row', !!row, JSON.stringify(sheet.json?.items)?.slice(0, 200));
// Today: opening 2, sales 0 (bottle), damage -1, shots consumed 0 bottles (peg sales are ml only; bottle movement only when emptied — none today after void)
// netChange = -1 → inHand = balance - (-1) = 1 + 1 = 2 ✓ ; balance = 1
check('sheet inHand=2 balance=1 sold=0', row?.inHand === 2 && row?.balance === 1 && row?.sold === 0, JSON.stringify(row));

// ---- H. Reconcile ----
const rec = await api('/api/reports/daily-stock-sheet/reconcile', {
  method: 'POST',
  body: { adjustments: [{ variantId: bottleV, newBalance: 3 }], reason: 'E2E reconcile' },
}, token);
check('reconcile ok', rec.status === 200 && rec.json?.updatedCount === 1, `got ${rec.status} ${JSON.stringify(rec.json)}`);
const prodsFinal = await api('/api/products', {}, token);
const shotP4 = prodsFinal.json?.find(p => p.id === shotProd.json?.id);
check('reconcile set bottle stock to 3', shotP4?.variants?.find(x => !x.isShot)?.stock === 3, `got ${JSON.stringify(shotP4?.variants)}`);

// ---- I. Held bill discount stored ----
const held2 = await api('/api/orders/hold', { method: 'POST', body: { items: [{ variantId: v1, quantity: 1 }], discountPercentage: 15 } }, token);
check('hold with 15% discount (grand=1000-150=850+85=935)', Math.abs((held2.json?.grandTotal ?? 0) - 935) < 0.01, `got ${held2.json?.grandTotal}`);

// ---- J. Invalid KOT variant ----
const badKot = await api('/api/kot', { method: 'POST', body: { items: [{ variantId: 'var-does-not-exist', quantity: 1 }] } }, token);
check('KOT unknown variant blocked (400)', badKot.status === 400, `got ${badKot.status} ${JSON.stringify(badKot.json)}`);

// ---- K. Settings validation ----
const badSet = await api('/api/settings', { method: 'PUT', body: { taxRate: 250 } }, token);
check('settings taxRate>100 rejected (400)', badSet.status === 400, `got ${badSet.status} ${JSON.stringify(badSet.json)}`);

// ---- L. No-auth access blocked ----
const noAuth = await api('/api/products');
check('no-auth products blocked (401)', noAuth.status === 401, `got ${noAuth.status}`);

// Cleanup
await api(`/api/products/${prod.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/products/${shotProd.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/rooms/${roomId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});
if (cUser.json?.id) await api(`/api/users/${cUser.json.id}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
