/* E2E smoke test — Royal Hotel POS */
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

// 1. Login
const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
check('login works', login.status === 200, `got ${login.status}`);
const token = login.json?.token;

// 2. Create a test category + product
const cat = await api('/api/categories', { method: 'POST', body: { name: `TestCat-${Date.now()}` } }, token);
check('create category', cat.status === 201 || cat.status === 200, `got ${cat.status} ${JSON.stringify(cat.json)}`);
const catId = cat.json?.id;

const prodBody = {
  name: `TestProduct-${Date.now()}`,
  categoryId: catId,
  sku: `TST${Date.now()}`,
  costPrice: 100,
  sellingPrice: 250,
  variants: [{ size: '750ml', sellingPrice: 250, stock: 10, costPrice: 100 }],
};
const prod = await api('/api/products', { method: 'POST', body: prodBody }, token);
check('create product', prod.status === 201, `got ${prod.status} ${JSON.stringify(prod.json)?.slice(0, 200)}`);
const product = prod.json?.product || prod.json;
const variantId = product?.variants?.[0]?.id;

// 3. Checkout (sale of 2 units)
const co = await api('/api/bills/checkout', {
  method: 'POST',
  body: {
    items: [{ variantId, quantity: 2 }],
    orderType: 'dine_in',
    paymentMethod: 'cash',
    amountReceived: 600,
    discount: 0,
  },
}, token);
check('checkout sale', co.status === 201, `got ${co.status} ${JSON.stringify(co.json)?.slice(0, 200)}`);
const billId = co.json?.id;
const grandTotal = co.json?.grandTotal;
// Settings default: serviceChargeRate = 10% -> 2 x 250 = 500 + 10% = 550
check('grandTotal = 550 (2 x 250 + 10% service)', Math.abs((grandTotal ?? 0) - 550) < 0.01, `got ${grandTotal}`);
check('change = 50', Math.abs((co.json?.changeAmount ?? 0) - 50) < 0.01, `got ${co.json?.changeAmount}`);

// 4. Stock deducted
const prods = await api('/api/products', {}, token);
const p = prods.json?.find(x => x.id === product?.id);
check('stock deducted 10 -> 8', p?.variants?.[0]?.stock === 8, `got ${JSON.stringify(p?.variants?.[0]?.stock)}`);

// 5. Oversell blocked
const over = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 100 }], paymentMethod: 'cash', amountReceived: 99999 },
}, token);
check('oversell blocked (400)', over.status === 400, `got ${over.status} ${JSON.stringify(over.json)}`);

// 6. Tampered price blocked
const tamper = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1, unitPrice: 1, total: 1 }], paymentMethod: 'cash', amountReceived: 1000 },
}, token);
check('tampered price ignored (grandTotal=275)', Math.abs((tamper.json?.grandTotal ?? 0) - 275) < 0.01, `got ${JSON.stringify(tamper.json)?.slice(0, 150)}`);

// 7. Negative quantity blocked
const neg = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: -3 }], paymentMethod: 'cash' },
}, token);
check('negative qty blocked (400)', neg.status === 400, `got ${neg.status}`);

// 8. Void restores stock
const voidRes = await api(`/api/bills/${billId}/void`, { method: 'POST', body: { reason: 'test' } }, token);
check('void bill', voidRes.status === 200, `got ${voidRes.status} ${JSON.stringify(voidRes.json)}`);
const prods2 = await api('/api/products', {}, token);
const p2 = prods2.json?.find(x => x.id === product?.id);
// 10 - 2 (sale1) - 1 (tamper-test sale, still active) + 2 (void restore) = 9
check('stock restored after void (8->9; tamper bill still active)', p2?.variants?.[0]?.stock === 9, `got ${JSON.stringify(p2?.variants?.[0]?.stock)}`);

// 9. Hold bill + resume
const hold = await api('/api/orders/hold', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1, unitPrice: 250, total: 250 }], orderType: 'dine_in' },
}, token);
check('hold bill', hold.status === 201, `got ${hold.status} ${JSON.stringify(hold.json)?.slice(0, 150)}`);
const heldId = hold.json?.id;
const heldList = await api('/api/orders/held', {}, token);
check('held bill listed', heldList.json?.some(h => h.id === heldId), JSON.stringify(heldList.json)?.slice(0, 150));

// 10. KOT flow
const kot = await api('/api/kot', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1, productName: p?.name, size: '750ml' }], tableNumber: '1' },
}, token);
check('create KOT', kot.status === 201, `got ${kot.status} ${JSON.stringify(kot.json)?.slice(0, 200)}`);
const kotId = kot.json?.id;
const ks1 = await api(`/api/kot/${kotId}/status`, { method: 'PATCH', body: { status: 'preparing' } }, token);
const ks2 = await api(`/api/kot/${kotId}/status`, { method: 'PATCH', body: { status: 'ready' } }, token);
const ks3 = await api(`/api/kot/${kotId}/status`, { method: 'PATCH', body: { status: 'completed' } }, token);
check('KOT status flow', ks1.status === 200 && ks2.status === 200 && ks3.status === 200, JSON.stringify([ks1.status, ks2.status, ks3.status]));
const badKot = await api(`/api/kot/${kotId}/status`, { method: 'PATCH', body: { status: 'preparing' } }, token);
check('KOT invalid transition blocked', badKot.status === 400, `got ${badKot.status} ${JSON.stringify(badKot.json)}`);

// 11. Rooms
const room = await api('/api/rooms', { method: 'POST', body: { roomNumber: `R${Date.now() % 100000}`, roomType: 'Standard', floor: '1', capacity: 2, ratePerDay: 5000 } }, token);
check('create room', room.status === 201, `got ${room.status} ${JSON.stringify(room.json)?.slice(0, 150)}`);
const roomId = room.json?.id;

const booking = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Test Guest', guestPhone: '0712345678',
    checkInDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    checkOutDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    advancePaid: 5000,
  },
}, token);
check('create booking', booking.status === 201, `got ${booking.status} ${JSON.stringify(booking.json)?.slice(0, 200)}`);
const bookingId = booking.json?.booking?.id;

// Double booking blocked
const booking2 = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Guest2', guestPhone: '0712345678',
    checkInDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    checkOutDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    advancePaid: 1000,
  },
}, token);
check('double booking blocked', booking2.status === 400, `got ${booking2.status} ${JSON.stringify(booking2.json)}`);

const checkout = await api(`/api/room-bookings/${bookingId}/checkout`, { method: 'PUT', body: { additionalCharges: 1000 } }, token);
check('booking checkout', checkout.status === 200, `got ${checkout.status} ${JSON.stringify(checkout.json)?.slice(0, 200)}`);

// 12. Reports
const rep = await api('/api/reports/summary?period=today', {}, token);
check('reports summary', rep.status === 200, `got ${rep.status}`);
const sheet = await api('/api/reports/daily-stock-sheet', {}, token);
check('daily stock sheet', sheet.status === 200, `got ${sheet.status}`);

// 13. Cashier cannot create product (403)
const cashierCreate = await api('/api/users', {
  method: 'POST',
  body: { username: `cashier_${Date.now()}`, name: 'Test Cashier', password: 'Cashier123', role: 'cashier' },
}, token);
const cashierToken = null;
if (cashierCreate.status === 201) {
  const cashierUsername = cashierCreate.json?.username;
  const cl = await api('/api/auth/login', { method: 'POST', body: { username: cashierUsername, password: 'Cashier123' } });
  const t2 = cl.json?.token;
  const denied = await api('/api/products', { method: 'POST', body: prodBody }, t2);
  check('cashier denied product create (403)', denied.status === 403, `got ${denied.status} ${JSON.stringify(denied.json)}`);
  await api(`/api/users/${cashierCreate.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
} else {
  check('cashier create (may fail)', false, JSON.stringify(cashierCreate.json)?.slice(0, 150));
}

// Cleanup: delete test product, room, category
await api(`/api/products/${product?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/rooms/${roomId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
