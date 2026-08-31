/* Hotel Functions & Events (Function Hall) module — e2e coverage:
 * hall listing, booking creation with server-derived totals, same-day
 * double-booking guard, payment recording, overpayment guard, checkout,
 * cancellation, and RBAC (cashier can book events but not manage halls).
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
const uniq = Date.now();
const eventDay = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

// 1. List function halls (seeded)
const halls = await api('/api/function-halls', {}, token);
check('GET /api/function-halls returns seeded halls', halls.status === 200 && Array.isArray(halls.json) && halls.json.length >= 3, `got ${halls.status} ${JSON.stringify(halls.json)?.slice(0, 150)}`);
const hall = halls.json?.[0];

// 2. Cashier can create hall? No — Super Admin only. Create cashier + login.
const cashier = await api('/api/users', { method: 'POST', body: { name: `FnCash-${uniq}`, username: `fncash-${uniq}`, password: 'Test1234', role: 'cashier' } }, token);
check('create test cashier', cashier.status === 201, `got ${cashier.status} ${JSON.stringify(cashier.json)?.slice(0, 150)}`);
const cashLogin = await api('/api/auth/login', { method: 'POST', body: { username: `fncash-${uniq}`, password: 'Test1234' } });
const cashToken = cashLogin.json?.token;
check('cashier login', cashLogin.status === 200 && !!cashToken, `got ${cashLogin.status}`);

const cashHallCreate = await api('/api/function-halls', { method: 'POST', body: { hallName: `X${uniq}`, hallType: 'Y', ratePerDay: 1000 } }, cashToken);
check('cashier cannot create function hall (403)', cashHallCreate.status === 403, `got ${cashHallCreate.status}`);

// 3. Cashier creates an event booking
const booking = await api('/api/function-bookings', {
  method: 'POST',
  body: {
    hallId: hall.id, eventType: 'wedding', session: 'full_day',
    customerName: `Customer-${uniq}`, customerPhone: '0771234567', customerAddress: 'Colombo',
    eventDate: eventDay, expectedGuests: 250,
    hallCharge: 60000, perPlateRate: 2500, numberOfPlates: 200,
    extraServices: 15000, discount: 5000, tax: 0, advancePaid: 100000,
    paymentMethod: 'cash', notes: 'e2e test'
  },
}, cashToken);
check('cashier creates event booking (201)', booking.status === 201, `got ${booking.status} ${JSON.stringify(booking.json)?.slice(0, 200)}`);
const bid = booking.json?.booking;
check('booking number EVT-* issued', !!bid?.bookingNumber && /^EVT-/.test(bid.bookingNumber), `got ${bid?.bookingNumber}`);
check('server-derived grand total 570000', bid?.grandTotal === 570000, `got ${bid?.grandTotal}`);
check('balance due = 470000', bid?.balanceDue === 470000, `got ${bid?.balanceDue}`);
check('status confirmed', bid?.status === 'confirmed', `got ${bid?.status}`);

// 4. Same hall + same date duplicate blocked
const dup = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'birthday', session: 'day', customerName: 'X', customerPhone: '071', eventDate: eventDay, expectedGuests: 50, advancePaid: 0 },
}, cashToken);
check('same-hall same-date double booking blocked (400)', dup.status === 400, `got ${dup.status} ${JSON.stringify(dup.json)}`);

// 5. Different date on the same hall is fine
const otherDay = new Date(Date.now() + 40 * 86400000).toISOString().split('T')[0];
const booking2 = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'X2', customerPhone: '072', eventDate: otherDay, expectedGuests: 50, advancePaid: 0 },
}, cashToken);
check('different date booking allowed (201)', booking2.status === 201, `got ${booking2.status} ${JSON.stringify(booking2.json)?.slice(0, 200)}`);

// 6. Invalid payloads
const badDate = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'X', customerPhone: '072', eventDate: 'not-a-date' },
}, cashToken);
check('invalid event date rejected (400)', badDate.status === 400, `got ${badDate.status}`);

const badAdvance = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'X', customerPhone: '072', eventDate: otherDay, advancePaid: 999999999 },
}, cashToken);
check('advance > grand total rejected (400)', badAdvance.status === 400, `got ${badAdvance.status} ${JSON.stringify(badAdvance.json)}`);

// 7. Payment recording + overpayment guard
const pay = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 200000, paymentMethod: 'bank_transfer' } }, cashToken);
check('record payment 200000', pay.status === 200 && pay.json?.booking?.advancePaid === 300000 && pay.json?.booking?.balanceDue === 270000, `got ${pay.status} ${JSON.stringify(pay.json?.booking)}`);
const overpay = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 999999 } }, cashToken);
check('overpayment blocked (400)', overpay.status === 400, `got ${overpay.status}`);

// 8. Checkout / complete
const done = await api(`/api/function-bookings/${bid.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 270000, paymentMethod: 'cash' } }, cashToken);
check('checkout completes event', done.status === 200 && done.json?.booking?.status === 'completed' && done.json?.booking?.balanceDue === 0, `got ${done.status} ${JSON.stringify(done.json?.booking)}`);
const redo = await api(`/api/function-bookings/${bid.id}/checkout`, { method: 'PUT', body: {} }, cashToken);
check('double checkout blocked (400)', redo.status === 400, `got ${redo.status}`);

// 9. Cancel flow
const canc = await api(`/api/function-bookings/${booking2.json?.booking?.id}/cancel`, { method: 'PUT', body: { reason: 'e2e cancel' } }, cashToken);
check('cancel booking', canc.status === 200 && canc.json?.booking?.status === 'cancelled', `got ${canc.status} ${JSON.stringify(canc.json?.booking)}`);
const payCancelled = await api(`/api/function-bookings/${booking2.json?.booking?.id}/payment`, { method: 'POST', body: { amount: 100 } }, cashToken);
check('payment on cancelled booking blocked (400)', payCancelled.status === 400, `got ${payCancelled.status}`);

// 10. Search & filters
const search = await api(`/api/function-bookings?search=${encodeURIComponent(`Customer-${uniq}`)}`, {}, cashToken);
check('search by customer name finds booking', search.status === 200 && search.json?.some(b => b.id === bid.id), `got ${search.status}`);
const byStatus = await api('/api/function-bookings?status=completed', {}, cashToken);
check('status filter completed includes booking', byStatus.status === 200 && byStatus.json?.some(b => b.id === bid.id), `got ${byStatus.status}`);

// Cleanup
await api(`/api/users/${cashier.json?.id}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
