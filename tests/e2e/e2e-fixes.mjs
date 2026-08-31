/* Regression coverage for fixed defects:
 * 1. "Enable Discounts" setting is actually enforced server-side.
 * 2. Invalid / split / underpaid payment methods cannot create a "paid" bill.
 * 3. Room and Function booking checkout require FULL settlement (no unbalanced close).
 * These create their own products/rooms/bookings and restore settings, so they
 * are safe to run repeatedly against a live dev server.
 */
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
check('login works', login.status === 200 && !!token, `got ${login.status}`);
const uniq = Date.now();

// ---- Settings backup + helper to restore ----
const origSettings = await api('/api/settings', {}, token);

// ---- Setup: test category + product ----
const cat = await api('/api/categories', { method: 'POST', body: { name: `FixCat-${uniq}` } }, token);
const catId = cat.json?.id;
const prod = await api('/api/products', {
  method: 'POST',
  body: {
    name: `FixProd-${uniq}`,
    categoryId: catId,
    sku: `FIX${uniq}`,
    variants: [{ size: '750ml', sellingPrice: 250, stock: 50, costPrice: 100 }],
  },
}, token);
const product = prod.json?.product || prod.json;
const variantId = product?.variants?.[0]?.id;
check('setup product', prod.status === 201 && !!variantId, `got ${prod.status} ${JSON.stringify(prod.json)?.slice(0, 160)}`);

// ---- 1. enableDiscounts=false must block discounts ----
let s = await api('/api/settings', { method: 'PUT', body: { enableDiscounts: false } }, token);
check('disable discounts saved', s.status === 200 && s.json?.enableDiscounts === false, `got ${s.status} ${JSON.stringify(s.json)?.slice(0, 120)}`);

const noDisc = await api('/api/bills/checkout', {
  method: 'POST',
  body: {
    items: [{ variantId, quantity: 2 }],
    paymentMethod: 'cash',
    amountReceived: 1000,
    discountPercentage: 50,
  },
}, token);
// 2 x 250 = 500, +10% service = 550 — discount ignored because disabled.
check('discount ignored when disabled (550)', noDisc.status === 201 && Math.abs((noDisc.json?.grandTotal ?? 0) - 550) < 0.01, `got ${noDisc.status} ${JSON.stringify(noDisc.json)?.slice(0, 180)}`);
check('discount stored as 0 when disabled', noDisc.json?.discount === 0, `got ${noDisc.json?.discount}`);

s = await api('/api/settings', { method: 'PUT', body: { enableDiscounts: true, maxDiscountPercentage: origSettings.json?.maxDiscountPercentage ?? 20 } }, token);
check('re-enable discounts', s.status === 200 && s.json?.enableDiscounts === true, `got ${s.status}`);

const withDisc = await api('/api/bills/checkout', {
  method: 'POST',
  body: {
    items: [{ variantId, quantity: 2 }],
    paymentMethod: 'cash',
    amountReceived: 1000,
    discountPercentage: 50,
  },
}, token);
// 500 - 20% = 400 + 10% service = 440
check('discount clamped to 20% when enabled (440)', withDisc.status === 201 && Math.abs((withDisc.json?.grandTotal ?? 0) - 440) < 0.01, `got ${withDisc.status} ${JSON.stringify(withDisc.json)?.slice(0, 180)}`);

// ---- 2. Payment method hardening ----
const invalidPay = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'bitcoin', amountReceived: 1000 },
}, token);
check('invalid payment method rejected (400)', invalidPay.status === 400, `got ${invalidPay.status} ${JSON.stringify(invalidPay.json)}`);

const splitZero = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'split', amountReceived: 0 },
}, token);
check('split underpayment rejected (400)', splitZero.status === 400, `got ${splitZero.status} ${JSON.stringify(splitZero.json)}`);

const cardUnder = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'card', amountReceived: 100 },
}, token);
check('card underpayment rejected (400)', cardUnder.status === 400, `got ${cardUnder.status} ${JSON.stringify(cardUnder.json)}`);

// ---- 3. Room checkout requires full settlement ----
const room = await api('/api/rooms', {
  method: 'POST',
  body: { roomNumber: `R-${uniq}`, roomType: 'Standard', ratePerDay: 5000, floor: 'Floor 1' },
}, token);
const roomId = room.json?.id;
check('room created', room.status === 201, `got ${room.status}`);

const rb = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId,
    guestName: `Guest-${uniq}`,
    guestPhone: '0711112222',
    checkInDate: new Date().toISOString(),
    checkOutDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    advancePaid: 0,
    paymentMethod: 'cash',
  },
}, token);
const rbk = rb.json?.booking;
check('room booking created', rb.status === 201 && !!rbk?.id, `got ${rb.status} ${JSON.stringify(rb.json)?.slice(0, 160)}`);
check('room booking total = 10000 (2 nights x 5000)', rbk?.grandTotal === 10000, `got ${rbk?.grandTotal}`);

const roomPartial = await api(`/api/room-bookings/${rbk.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 1000, paymentMethod: 'cash' } }, token);
check('room partial checkout rejected (400)', roomPartial.status === 400, `got ${roomPartial.status} ${JSON.stringify(roomPartial.json)}`);

const roomFull = await api(`/api/room-bookings/${rbk.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 10000, paymentMethod: 'cash' } }, token);
check('room full checkout accepted (200)', roomFull.status === 200 && roomFull.json?.booking?.status === 'checked_out' && roomFull.json?.booking?.balanceDue === 0, `got ${roomFull.status} ${JSON.stringify(roomFull.json?.booking)}`);

// ---- 4. Function booking completion requires full settlement ----
const halls = await api('/api/function-halls', {}, token);
const hall = halls.json?.find(h => h.status === 'available' && h.isActive) || halls.json?.[0];
const eventDay = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0];
const fb = await api('/api/function-bookings', {
  method: 'POST',
  body: {
    hallId: hall.id, eventType: 'meeting', session: 'day',
    customerName: `Fn-${uniq}`, customerPhone: '0712223333',
    eventDate: eventDay, expectedGuests: 20, advancePaid: 0,
  },
}, token);
const fbk = fb.json?.booking;
check('function booking created', fb.status === 201 && !!fbk?.id, `got ${fb.status} ${JSON.stringify(fb.json)?.slice(0, 160)}`);

const fnPartial = await api(`/api/function-bookings/${fbk.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 100, paymentMethod: 'cash' } }, token);
check('function partial completion rejected (400)', fnPartial.status === 400, `got ${fnPartial.status} ${JSON.stringify(fnPartial.json)}`);

const fnFull = await api(`/api/function-bookings/${fbk.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: fbk.balanceDue, paymentMethod: 'cash' } }, token);
check('function full completion accepted (200)', fnFull.status === 200 && fnFull.json?.booking?.status === 'completed' && fnFull.json?.booking?.balanceDue === 0, `got ${fnFull.status} ${JSON.stringify(fnFull.json?.booking)}`);

// ---- Cleanup ----
await api(`/api/rooms/${roomId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});
if (origSettings.json?.enableDiscounts !== undefined) {
  await api('/api/settings', { method: 'PUT', body: { enableDiscounts: origSettings.json.enableDiscounts, maxDiscountPercentage: origSettings.json.maxDiscountPercentage } }, token).catch(() => {});
}

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
