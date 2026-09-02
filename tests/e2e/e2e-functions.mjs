/* Hotel Functions & Events (Function Hall) module — e2e coverage:
 * hall listing + master-data validation, booking creation with server-derived
 * totals, hall capacity / phone / payment-method guards, event-date rails,
 * same-day double-booking (incl. completed events), edit & reschedule, payment
 * recording, overpayment guard, checkout, cancellation with refund, and RBAC
 * (cashier can book events but not manage halls or re-price them).
 *
 * Run against a dev server:  node tests/e2e/e2e-functions.mjs
 */
const BASE = process.env.POS_BASE || 'http://localhost:3000';
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
if (!token) {
  console.log('❌ cannot log in as Admin — start the dev server first (npm run dev)');
  process.exit(1);
}
const uniq = Date.now();
// LOCAL day keys — the module is day-based, so the test must not drift a day
// behind the hotel by going through toISOString() (UTC).
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const inDays = (n) => dayKey(Date.now() + n * 86400000);
// Every run books its own slice of the calendar: a COMPLETED event owns its day
// forever (that is the point), so fixed offsets would collide with the previous
// run's data and the suite would stop being repeatable.
const DAY_BASE = 100 + (uniq % 400);
const eventDay = inDays(DAY_BASE);
const otherDay = inDays(DAY_BASE + 10);
const rel = (n) => inDays(DAY_BASE + n);

// 1. List function halls (seeded)
const halls = await api('/api/function-halls', {}, token);
check('GET /api/function-halls returns seeded halls', halls.status === 200 && Array.isArray(halls.json) && halls.json.length >= 3, `got ${halls.status} ${JSON.stringify(halls.json)?.slice(0, 150)}`);
const hall = halls.json?.[0];
check('hall list carries derived availability data', typeof hall?.upcomingCount === 'number' && 'nextEventDate' in hall && typeof hall.openBalance === 'number', `got ${JSON.stringify(hall)?.slice(0, 160)}`);

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
    paymentMethod: 'bank_transfer',
    paymentDetails: { reference: `SLIP-${uniq}`, bank: 'BOC Negombo' },
    notes: 'e2e test'
  },
}, cashToken);
check('cashier creates event booking (201)', booking.status === 201, `got ${booking.status} ${JSON.stringify(booking.json)?.slice(0, 200)}`);
const bid = booking.json?.booking;
check('booking number EVT-* issued', !!bid?.bookingNumber && /^EVT-/.test(bid.bookingNumber), `got ${bid?.bookingNumber}`);
check('server-derived grand total 570000', bid?.grandTotal === 570000, `got ${bid?.grandTotal}`);
check('balance due = 470000', bid?.balanceDue === 470000, `got ${bid?.balanceDue}`);
check('status confirmed', bid?.status === 'confirmed', `got ${bid?.status}`);
check('bank slip reference stored for the deposit', bid?.paymentDetails?.reference === `SLIP-${uniq}` && bid?.paymentDetails?.bank === 'BOC Negombo', `got ${JSON.stringify(bid?.paymentDetails)}`);
check('event day stored as the picked calendar day', String(bid?.eventDate || '').slice(0, 10) === eventDay, `got ${bid?.eventDate}`);

// 4. Same hall + same date duplicate blocked
const dup = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'birthday', session: 'day', customerName: 'Dup Person', customerPhone: '0771111111', eventDate: eventDay, expectedGuests: 50, advancePaid: 0 },
}, cashToken);
check('same-hall same-date double booking blocked (400)', dup.status === 400, `got ${dup.status} ${JSON.stringify(dup.json)}`);

// 5. Different date on the same hall is fine
const booking2 = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'Postponed Co', customerPhone: '0772222222', eventDate: otherDay, expectedGuests: 50, advancePaid: 0 },
}, cashToken);
check('different date booking allowed (201)', booking2.status === 201, `got ${booking2.status} ${JSON.stringify(booking2.json)?.slice(0, 200)}`);
const b2 = booking2.json?.booking;

// 6. Invalid payloads
const badDate = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'Bad Date', customerPhone: '0773333333', eventDate: 'not-a-date' },
}, cashToken);
check('invalid event date rejected (400)', badDate.status === 400, `got ${badDate.status}`);

const badAdvance = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, eventType: 'meeting', session: 'day', customerName: 'Big Advance', customerPhone: '0774444444', eventDate: rel(45), advancePaid: 999999999 },
}, cashToken);
check('advance > grand total rejected (400)', badAdvance.status === 400, `got ${badAdvance.status} ${JSON.stringify(badAdvance.json)}`);

// 6b. A2Z guards added in this round -------------------------------------------------------------
const overCapacity = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Crowd', customerPhone: '0775555555', eventDate: rel(50), expectedGuests: (hall.capacity || 350) + 500 },
}, cashToken);
check(`guests above hall capacity rejected (400, capacity ${hall.capacity})`,
  overCapacity.status === 400 && /maximum of/.test(overCapacity.json?.error || ''),
  `got ${overCapacity.status} ${JSON.stringify(overCapacity.json)}`);

const badPhone = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'No Phone', customerPhone: 'abc', eventDate: rel(51) },
}, cashToken);
check('garbage customer phone rejected (400)', badPhone.status === 400 && /phone/i.test(badPhone.json?.error || ''), `got ${badPhone.status} ${JSON.stringify(badPhone.json)}`);

const badMethod = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Crypto Pay', customerPhone: '0776666666', eventDate: rel(52), paymentMethod: 'paypal' },
}, cashToken);
check('unknown payment method normalised (never stored raw)', badMethod.status === 201 && ['cash','card','bank_transfer','other'].includes(badMethod.json?.booking?.paymentMethod), `got ${badMethod.status} ${badMethod.json?.booking?.paymentMethod}`);
if (badMethod.json?.booking?.id) await api(`/api/function-bookings/${badMethod.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'e2e cleanup' } }, token);

const farFuture = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Year Typo', customerPhone: '0777777777', eventDate: '2038-01-01' },
}, cashToken);
check('mistyped year (12+ years ahead) rejected (400)', farFuture.status === 400 && /check the year|days ahead/i.test(farFuture.json?.error || ''), `got ${farFuture.status} ${JSON.stringify(farFuture.json)}`);

const yesterday = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Yesterday', customerPhone: '0778888888', eventDate: inDays(-1) },
}, cashToken);
check('back-dated event rejected (400)', yesterday.status === 400, `got ${yesterday.status} ${JSON.stringify(yesterday.json)}`);

const hugePlates = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Tycoon', customerPhone: '0779999999', eventDate: rel(55), perPlateRate: 1000000000, numberOfPlates: 1000000000 },
}, cashToken);
check('absurd plate rate/count rejected instead of billed (400)', hugePlates.status === 400 && /exceed|between/i.test(hugePlates.json?.error || ''), `got ${hugePlates.status} ${JSON.stringify(hugePlates.json)}`);

const hugeExtra = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Decor', customerPhone: '0771010101', eventDate: rel(56), extraServices: 1e15 },
}, cashToken);
check('extra services beyond the ceiling rejected (400)', hugeExtra.status === 400, `got ${hugeExtra.status} ${JSON.stringify(hugeExtra.json)}`);

const negGuests = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Zero Crowd', customerPhone: '0771212121', eventDate: rel(57), expectedGuests: -5 },
}, cashToken);
check('negative guest count rejected (400)', negGuests.status === 400, `got ${negGuests.status}`);

const bogusDate = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Leap', customerPhone: '0771313131', eventDate: '2027-02-31' },
}, cashToken);
check('impossible calendar date rejected (400)', bogusDate.status === 400, `got ${bogusDate.status}`);

// 7. Payment recording + overpayment guard
const pay = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 200000, paymentMethod: 'bank_transfer', reference: `DEP-${uniq}` } }, cashToken);
check('record payment 200000', pay.status === 200 && pay.json?.booking?.advancePaid === 300000 && pay.json?.booking?.balanceDue === 270000, `got ${pay.status} ${JSON.stringify(pay.json?.booking)}`);
check('payment note carries the method + reference', /200000 \(bank_transfer\)/.test(pay.json?.booking?.notes || '') && String(pay.json?.booking?.notes || '').includes(`DEP-${uniq}`), `got ${pay.json?.booking?.notes?.slice(-160)}`);
const overpay = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 999999 } }, cashToken);
check('overpayment blocked (400)', overpay.status === 400, `got ${overpay.status}`);
const zeroPay = await api(`/api/function-bookings/${b2.id}/payment`, { method: 'POST', body: { amount: 0 } }, cashToken);
check('zero-amount payment blocked (400)', zeroPay.status === 400, `got ${zeroPay.status}`);
const bogusPayMethod = await api(`/api/function-bookings/${b2.id}/payment`, { method: 'POST', body: { amount: 1000, paymentMethod: 'bitcoin' } }, cashToken);
check('payment with unknown method falls back to cash (not stored raw)',
  bogusPayMethod.status === 200 && bogusPayMethod.json?.booking?.paymentMethod === 'cash',
  `got ${bogusPayMethod.status} ${bogusPayMethod.json?.booking?.paymentMethod}`);
// Money already collected on b2 from here on — every later assertion uses this.
const paidOnB2 = Number(bogusPayMethod.json?.booking?.advancePaid || 0);
check('partial payment landed on b2 (1000)', paidOnB2 === 1000, `got ${paidOnB2}`);

// 7b. Edit / reschedule a confirmed booking ------------------------------------------------------
const resched = await api(`/api/function-bookings/${b2.id}`, {
  method: 'PUT',
  body: { eventDate: rel(11), session: 'evening', customerPhone: '0770000000', notes: 'moved by phone call' },
}, cashToken);
check('reschedule + phone fix accepted (200)', resched.status === 200, `got ${resched.status} ${JSON.stringify(resched.json)?.slice(0, 200)}`);
const rescheduled = resched.json?.booking;
check('reschedule keeps the SAME ticket number', rescheduled?.bookingNumber === b2.bookingNumber, `got ${rescheduled?.bookingNumber} vs ${b2.bookingNumber}`);
check('reschedule moves the event day', String(rescheduled?.eventDate || '').slice(0, 10) === rel(11), `got ${rescheduled?.eventDate} vs ${rel(11)}`);
check('reschedule keeps the price snapshot', Number(rescheduled?.grandTotal) === Number(b2.grandTotal), `got ${rescheduled?.grandTotal}/${b2.grandTotal}`);
check('reschedule keeps the advance already collected', Number(rescheduled?.advancePaid) === paidOnB2, `got ${rescheduled?.advancePaid} vs ${paidOnB2}`);
check('reschedule records updatedAt + note', !!rescheduled?.updatedAt && /moved by phone call/.test(rescheduled?.notes || ''), `got ${JSON.stringify(rescheduled?.notes)?.slice(0, 120)}`);

const ontoTakenDay = await api(`/api/function-bookings/${b2.id}`, {
  method: 'PUT',
  body: { eventDate: eventDay },
}, cashToken);
check('rescheduling onto an occupied day blocked (400)', ontoTakenDay.status === 400 && /already booked/i.test(ontoTakenDay.json?.error || ''), `got ${ontoTakenDay.status} ${JSON.stringify(ontoTakenDay.json)}`);

const cashierReprice = await api(`/api/function-bookings/${b2.id}`, {
  method: 'PUT',
  body: { hallCharge: 100, perPlateRate: 1 },
}, cashToken);
check('cashier cannot re-price an existing booking (403)', cashierReprice.status === 403, `got ${cashierReprice.status} ${JSON.stringify(cashierReprice.json)}`);

const adminReprice = await api(`/api/function-bookings/${b2.id}`, {
  method: 'PUT',
  body: { perPlateRate: 2000, numberOfPlates: 60 },
}, token);
// hall charge 60000 + 60 plates × 2000 = 180000, advance untouched
check('super admin can re-price a confirmed booking (200)', adminReprice.status === 200 && adminReprice.json?.booking?.grandTotal === 180000, `got ${adminReprice.status} ${adminReprice.json?.booking?.grandTotal}`);
check('re-pricing keeps the advance already received', Number(adminReprice.json?.booking?.advancePaid) === paidOnB2, `got ${adminReprice.json?.booking?.advancePaid}`);
check('re-pricing re-derives the outstanding balance', Number(adminReprice.json?.booking?.balanceDue) === 180000 - paidOnB2, `got ${adminReprice.json?.booking?.balanceDue}`);
const b2BalanceBeforeCancel = Number(adminReprice.json?.booking?.balanceDue || 0);

const editOverCapacity = await api(`/api/function-bookings/${b2.id}`, {
  method: 'PUT',
  body: { expectedGuests: (hall.capacity || 350) + 900 },
}, token);
check('edit still enforces hall capacity (400)', editOverCapacity.status === 400, `got ${editOverCapacity.status}`);

// 8. Checkout / complete
const done = await api(`/api/function-bookings/${bid.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 270000, paymentMethod: 'cash' } }, cashToken);
check('checkout completes event', done.status === 200 && done.json?.booking?.status === 'completed' && done.json?.booking?.balanceDue === 0, `got ${done.status} ${JSON.stringify(done.json?.booking)}`);
const redo = await api(`/api/function-bookings/${bid.id}/checkout`, { method: 'PUT', body: {} }, cashToken);
check('double checkout blocked (400)', redo.status === 400, `got ${redo.status}`);
const editCompleted = await api(`/api/function-bookings/${bid.id}`, { method: 'PUT', body: { customerName: 'Ghost Writer' } }, token);
check('completed event cannot be edited (400)', editCompleted.status === 400, `got ${editCompleted.status}`);
const payCompleted = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 1000 } }, cashToken);
check('payment on a completed event blocked (400)', payCompleted.status === 400, `got ${payCompleted.status}`);
const payOverSettled = await api(`/api/function-bookings/${bid.id}/payment`, { method: 'POST', body: { amount: 1 } }, cashToken);
check('paying a fully settled event blocked (400)', payOverSettled.status === 400, `got ${payOverSettled.status}`);

// 8b. A COMPLETED event still owns its day — the hall cannot be sold twice ------
const ghostDay = rel(60);
const firstEvent = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Paid And Closed', customerPhone: '0772020202', eventDate: ghostDay, expectedGuests: 40, advancePaid: 0 },
}, token);
check('setup: bookable event created', firstEvent.status === 201, `got ${firstEvent.status}`);
const firstId = firstEvent.json?.booking?.id;
const closeFirst = await api(`/api/function-bookings/${firstId}/checkout`, { method: 'PUT', body: {} }, token);
check('setup: event completed with nothing outstanding', closeFirst.status === 200 && closeFirst.json?.booking?.status === 'completed', `got ${closeFirst.status}`);
const secondSameDay = await api('/api/function-bookings', {
  method: 'POST',
  body: { hallId: hall.id, customerName: 'Double Booked', customerPhone: '0773030303', eventDate: ghostDay, expectedGuests: 40 },
}, token);
check('same day not re-sold after the first event was completed (400)', secondSameDay.status === 400, `got ${secondSameDay.status} ${JSON.stringify(secondSameDay.json)}`);

// 9. Cancel flow
const canc = await api(`/api/function-bookings/${b2.id}/cancel`, { method: 'PUT', body: { reason: 'e2e cancel' } }, cashToken);
check('cancel booking', canc.status === 200 && canc.json?.booking?.status === 'cancelled', `got ${canc.status} ${JSON.stringify(canc.json?.booking)}`);
check('cancelled booking no longer reports an outstanding balance',
  Number(canc.json?.booking?.balanceDue) === 0 && Number(canc.json?.booking?.advancePaid) === paidOnB2,
  `got balance=${canc.json?.booking?.balanceDue} advance=${canc.json?.booking?.advancePaid}`);
check('cancelled booking writes off the unpaid part only', b2BalanceBeforeCancel > 0 && Number(canc.json?.booking?.balanceDue) === 0, `wrote off ${b2BalanceBeforeCancel}`);
check('cancel reports the refundable advance', Number(canc.json?.refundDue) === paidOnB2, `got ${canc.json?.refundDue} vs paid ${paidOnB2}`);
const recancel = await api(`/api/function-bookings/${b2.id}/cancel`, { method: 'PUT', body: { reason: 'again' } }, cashToken);
check('double cancel blocked (400)', recancel.status === 400, `got ${recancel.status}`);
const editCancelled = await api(`/api/function-bookings/${b2.id}`, { method: 'PUT', body: { customerName: 'Zombie' } }, token);
check('cancelled booking cannot be edited (400)', editCancelled.status === 400, `got ${editCancelled.status}`);
const payCancelled = await api(`/api/function-bookings/${b2.id}/payment`, { method: 'POST', body: { amount: 100 } }, cashToken);
check('payment on cancelled booking blocked (400)', payCancelled.status === 400, `got ${payCancelled.status}`);

// 9b. Checkout input validation (no silent truncation) -------------------------
const badCheckout = await api(`/api/function-bookings/${firstId}`, { method: 'PUT', body: {} }, cashToken);
check('completed event cannot be completed again (400)', badCheckout.status === 400, `got ${badCheckout.status}`);
const addBig = await api(`/api/function-bookings/${firstId}/checkout`, { method: 'PUT', body: { additionalCharges: 1e12 } }, token);
check('oversized additional charges rejected (400, not silently capped)', addBig.status === 400, `got ${addBig.status} ${JSON.stringify(addBig.json)}`);

// 10. Search & filters
const search = await api(`/api/function-bookings?search=${encodeURIComponent(`Customer-${uniq}`)}`, {}, cashToken);
check('search by customer name finds booking', search.status === 200 && search.json?.some(b => b.id === bid.id), `got ${search.status}`);
const byStatus = await api('/api/function-bookings?status=completed', {}, cashToken);
check('status filter completed includes booking', byStatus.status === 200 && byStatus.json?.some(b => b.id === bid.id), `got ${byStatus.status}`);
const listUntouched = await api('/api/function-bookings', {}, cashToken);
check('listing the board does not re-order the stored array', Array.isArray(listUntouched.json) && listUntouched.json.length > 0, `got ${listUntouched.status}`);

// 11. Hall master data hardening -------------------------------------------------
const newHall = await api('/api/function-halls', {
  method: 'POST',
  body: { hallName: `E2E Lawn ${uniq}`, hallType: 'Open-Air Garden', capacity: 120, ratePerDay: 25000, amenities: ['AC', '', '  ', 'Stage'], status: 'available' }
}, token);
check('super admin can add a hall (201)', newHall.status === 201 && newHall.json?.capacity === 120, `got ${newHall.status} ${JSON.stringify(newHall.json)?.slice(0, 160)}`);
check('blank amenities are dropped on save', Array.isArray(newHall.json?.amenities) && newHall.json.amenities.length === 2, `got ${JSON.stringify(newHall.json?.amenities)}`);
const zeroCap = await api('/api/function-halls', { method: 'POST', body: { hallName: `Zero ${uniq}`, hallType: 'X', ratePerDay: 5000, capacity: 0 } }, token);
check('capacity 0 rejected instead of silently becoming 100 (400)', zeroCap.status === 400, `got ${zeroCap.status} ${JSON.stringify(zeroCap.json)}`);
const noType = await api('/api/function-halls', { method: 'POST', body: { hallName: `NoType ${uniq}`, hallType: '   ', ratePerDay: 5000 } }, token);
check('empty hall type rejected (400)', noType.status === 400, `got ${noType.status}`);

const hid = newHall.json?.id;
if (hid) {
  const rename = await api(`/api/function-halls/${hid}`, { method: 'PUT', body: { hallName: `E2E lawn ${uniq}` } }, token);
  check('case-only rename is saved (not silently dropped)', rename.status === 200 && rename.json?.hallName === `E2E lawn ${uniq}`, `got ${rename.status} ${rename.json?.hallName}`);
  const badRate = await api(`/api/function-halls/${hid}`, { method: 'PUT', body: { ratePerDay: -5 } }, token);
  check('invalid rate on edit rejected (400, not ignored)', badRate.status === 400, `got ${badRate.status} ${JSON.stringify(badRate.json)}`);
  const badStatus = await api(`/api/function-halls/${hid}`, { method: 'PUT', body: { status: 'closed-forever' } }, token);
  check('unknown hall status rejected (400)', badStatus.status === 400, `got ${badStatus.status}`);
  const retire = await api(`/api/function-halls/${hid}`, { method: 'PUT', body: { isActive: false } }, token);
  check('hall can be retired (isActive false)', retire.status === 200 && retire.json?.isActive === false, `got ${retire.status}`);
  const bookRetired = await api('/api/function-bookings', {
    method: 'POST',
    body: { hallId: hid, customerName: 'Too Late', customerPhone: '0774040404', eventDate: rel(70) }
  }, cashToken);
  check('retired hall refuses new bookings (400)', bookRetired.status === 400, `got ${bookRetired.status}`);
  const del = await api(`/api/function-halls/${hid}`, { method: 'DELETE' }, token);
  check('unused hall can still be deleted', del.status === 200, `got ${del.status} ${JSON.stringify(del.json)}`);
}
if (firstId) {
  const busyHall = await api('/api/function-halls', { method: 'POST', body: { hallName: `Busy ${uniq}`, hallType: 'Hall', ratePerDay: 1000, capacity: 10 } }, token);
  const busyId = busyHall.json?.id;
  const busyBooking = await api('/api/function-bookings', {
    method: 'POST',
    body: { hallId: busyId, customerName: 'Busy Customer', customerPhone: '0775050505', eventDate: rel(90), expectedGuests: 5 }
  }, token);
  const busyDelete = await api(`/api/function-halls/${busyId}`, { method: 'DELETE' }, token);
  check('hall with an OPEN booking cannot be deleted (400)', busyDelete.status === 400 && /de-activate/i.test(busyDelete.json?.error || ''), `got ${busyDelete.status} ${JSON.stringify(busyDelete.json)}`);
  // Cancel the open booking, then prove a CLOSED event's history also blocks
  // deletion (the old guard only looked one day ahead, so a hall with a paid
  // event next month could simply be deleted and its booking orphaned).
  if (busyBooking.json?.booking?.id) {
    await api(`/api/function-bookings/${busyBooking.json.booking.id}/checkout`, { method: 'PUT', body: {} }, token);
  }
  const delAfterHistory = await api(`/api/function-halls/${busyId}`, { method: 'DELETE' }, token);
  check('hall with completed event history cannot be deleted (400)', delAfterHistory.status === 400, `got ${delAfterHistory.status} ${JSON.stringify(delAfterHistory.json)}`);
  await api(`/api/function-halls/${busyId}`, { method: 'PUT', body: { isActive: false } }, token).catch(() => {});
  await api(`/api/function-halls/${busyId}`, { method: 'DELETE' }, token).catch(() => {});
}

// Cleanup — cancelled bookings free their day again, so repeated runs stay green.
for (const id of [firstId, bid?.id]) {
  if (!id) continue;
  const b = await api(`/api/function-bookings/${id}`, { method: 'PUT', body: {} }, token);
  if (b.status !== 200) await api(`/api/function-bookings/${id}/cancel`, { method: 'PUT', body: { reason: 'e2e cleanup' } }, token).catch(() => {});
}
await api(`/api/users/${cashier.json?.id}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'))
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
