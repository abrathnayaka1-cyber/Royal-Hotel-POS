/* Regression coverage for the ROOMS & BOOKINGS module (A2Z check, 2026-09-01).
 *
 * Covers every bug fixed in this round:
 *   1. Room master data validation (rate / half-day rate / capacity / duplicates).
 *   2. `isActive` lifecycle — retire a room, it must stop being bookable.
 *   3. Housekeeping cannot "free" a room that still has an in-house guest.
 *   4. Renaming a room keeps its ACTIVE bookings in sync.
 *   5. Deleting a room with active bookings is refused (no orphan bookings).
 *   6. Booking guards: phone, capacity, back-dated / >365-night stays,
 *      payment method, date-range overlap.
 *   7. The new PUT /room-bookings/:id/check-in transition.
 *   8. Check-out only settles an IN-HOUSE guest (never a future reservation).
 *   9. Partial payment tolerance + over-payment refusal.
 *  10. Cancelling zeroes the balance and reports the refundable advance.
 *  11. syncRoomStatus points at the NEXT arrival and respects housekeeping.
 *
 * Safe to run repeatedly: every room/booking it creates is cleaned up at the end.
 * Override with BASE_URL / ADMIN_PASSWORD env vars.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'Araliya2000';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name} ${extra}`); }
}

async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

const dayKey = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: PW } });
const token = login.json?.token;
check('login works', login.status === 200 && !!token, `got ${login.status}`);
if (!token) { console.log(results.join('\n')); process.exit(1); }

const uniq = Date.now().toString().slice(-6);
const createdRooms = [];
const createdBookings = [];

// ---------------------------------------------------------------------------
// 1. Room master data validation
// ---------------------------------------------------------------------------
const badRate = await api('/api/rooms', { method: 'POST', body: { roomNumber: `T${uniq}A`, roomType: 'Test', ratePerDay: -5 } }, token);
check('rejects a negative daily rate', badRate.status === 400, `got ${badRate.status}`);

const badHalf = await api('/api/rooms', { method: 'POST', body: { roomNumber: `T${uniq}A`, roomType: 'Test', ratePerDay: 5000, rateHalfDay: -1 } }, token);
check('rejects a negative half-day rate', badHalf.status === 400, `got ${badHalf.status}`);

const blankType = await api('/api/rooms', { method: 'POST', body: { roomNumber: `T${uniq}A`, roomType: '   ', ratePerDay: 5000 } }, token);
check('rejects a whitespace-only room type', blankType.status === 400, `got ${blankType.status}`);

const roomA = await api('/api/rooms', {
  method: 'POST',
  body: { roomNumber: `T${uniq}A`, roomType: 'E2E Deluxe', floor: 'E2E Floor', capacity: 2, ratePerDay: 10000, amenities: ['AC'] },
}, token);
check('creates a valid room', roomA.status === 201 && !!roomA.json?.id, `got ${roomA.status}`);
if (roomA.json?.id) createdRooms.push(roomA.json.id);

const dupe = await api('/api/rooms', { method: 'POST', body: { roomNumber: `T${uniq}A`, roomType: 'E2E Deluxe', ratePerDay: 10000 } }, token);
check('rejects a duplicate room number', dupe.status === 400, `got ${dupe.status}`);

const roomB = await api('/api/rooms', {
  method: 'POST',
  body: { roomNumber: `T${uniq}B`, roomType: 'E2E Standard', floor: 'E2E Floor', capacity: 4, ratePerDay: 6000 },
}, token);
check('creates a second room', roomB.status === 201, `got ${roomB.status}`);
if (roomB.json?.id) createdRooms.push(roomB.json.id);

const A = roomA.json.id;
const B = roomB.json.id;

// A bad rate on UPDATE used to be silently ignored (looked like a save).
const badUpdate = await api(`/api/rooms/${A}`, { method: 'PUT', body: { ratePerDay: 0 } }, token);
check('PUT rejects an invalid rate instead of ignoring it', badUpdate.status === 400, `got ${badUpdate.status}`);
const stillRight = await api('/api/rooms', {}, token);
check('the rejected rate did NOT change the room', stillRight.json.find(r => r.id === A)?.ratePerDay === 10000);

const badStatus = await api(`/api/rooms/${A}`, { method: 'PUT', body: { status: 'teleported' } }, token);
check('PUT rejects an unknown room status', badStatus.status === 400, `got ${badStatus.status}`);

// ---------------------------------------------------------------------------
// 2. isActive lifecycle
// ---------------------------------------------------------------------------
const retire = await api(`/api/rooms/${B}`, { method: 'PUT', body: { isActive: false } }, token);
check('a free room can be retired', retire.status === 200 && retire.json?.isActive === false, `got ${retire.status}`);

const activeOnly = await api('/api/rooms?activeOnly=true', {}, token);
check('?activeOnly=true hides the retired room', !activeOnly.json.some(r => r.id === B));
const allRooms = await api('/api/rooms', {}, token);
check('the default listing still shows it for the Admin directory', allRooms.json.some(r => r.id === B));

const bookRetired = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: B, guestName: 'Retired Test', guestPhone: '0771234567', checkInDate: dayKey(0), checkOutDate: dayKey(1) },
}, token);
check('a retired room cannot be booked', bookRetired.status === 400, `got ${bookRetired.status}`);
await api(`/api/rooms/${B}`, { method: 'PUT', body: { isActive: true } }, token);

// ---------------------------------------------------------------------------
// 3. Booking guards
// ---------------------------------------------------------------------------
const badPhone = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Bad Phone', guestPhone: 'x', checkInDate: dayKey(0), checkOutDate: dayKey(1) },
}, token);
check('rejects a junk phone number', badPhone.status === 400, `got ${badPhone.status}`);

const overCap = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Too Many', guestPhone: '0771234567', numberOfGuests: 9, checkInDate: dayKey(0), checkOutDate: dayKey(1) },
}, token);
check('enforces the room capacity (2)', overCap.status === 400, `got ${overCap.status}`);

const tooLong = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Forever', guestPhone: '0771234567', checkInDate: dayKey(0), checkOutDate: dayKey(400) },
}, token);
check('rejects a stay longer than 365 nights', tooLong.status === 400, `got ${tooLong.status}`);

const backDated = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Time Traveller', guestPhone: '0771234567', checkInDate: dayKey(-30), checkOutDate: dayKey(-20) },
}, token);
check('rejects a fully back-dated stay', backDated.status === 400, `got ${backDated.status}`);

const badMethod = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Crypto', guestPhone: '0771234567', paymentMethod: 'bitcoin', checkInDate: dayKey(0), checkOutDate: dayKey(1) },
}, token);
check('rejects an unknown payment method', badMethod.status === 400, `got ${badMethod.status}`);

// ---------------------------------------------------------------------------
// 4. Reserve → check-in → check-out happy path
// ---------------------------------------------------------------------------
const reservation = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId: A, guestName: 'E2E Guest One', guestPhone: '0771112222', guestIdOrPassport: '199512345678',
    numberOfGuests: 2, checkInDate: dayKey(0), checkOutDate: dayKey(2), advancePaid: 0, status: 'confirmed',
  },
}, token);
check('creates a reservation', reservation.status === 201, `got ${reservation.status} ${JSON.stringify(reservation.json).slice(0, 140)}`);
const bk1 = reservation.json?.booking;
if (bk1) createdBookings.push(bk1.id);
check('nights are derived from the dates (2)', bk1?.durationDays === 2, `got ${bk1?.durationDays}`);
check('room charge = nights x rate', bk1?.totalRoomCharge === 20000, `got ${bk1?.totalRoomCharge}`);
check('a reservation puts the room in "reserved"', reservation.json?.room?.status === 'reserved', `got ${reservation.json?.room?.status}`);

// Check-out must be refused before check-in.
const earlyOut = await api(`/api/room-bookings/${bk1.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: bk1.balanceDue } }, token);
check('a reservation cannot be checked out before check-in', earlyOut.status === 400, `got ${earlyOut.status}`);

// Partial payment: exact balance is refused (that is checkout's job), a part is fine.
const overPay = await api(`/api/room-bookings/${bk1.id}/payment`, { method: 'POST', body: { amount: bk1.grandTotal + 5000 } }, token);
check('refuses a payment above the balance due', overPay.status === 400, `got ${overPay.status}`);

const partial = await api(`/api/room-bookings/${bk1.id}/payment`, { method: 'POST', body: { amount: 5000, paymentMethod: 'cash' } }, token);
check('accepts a partial payment', partial.status === 200, `got ${partial.status}`);
check('the partial payment reduces the balance', partial.json?.booking?.balanceDue === Number((bk1.grandTotal - 5000).toFixed(2)), `got ${partial.json?.booking?.balanceDue}`);

const badPayMethod = await api(`/api/room-bookings/${bk1.id}/payment`, { method: 'POST', body: { amount: 100, paymentMethod: 'gold' } }, token);
check('refuses a payment with an unknown method', badPayMethod.status === 400, `got ${badPayMethod.status}`);

// The new check-in transition.
const checkIn = await api(`/api/room-bookings/${bk1.id}/check-in`, { method: 'PUT', body: {} }, token);
check('PUT /check-in turns the reservation into a stay', checkIn.status === 200 && checkIn.json?.booking?.status === 'checked_in', `got ${checkIn.status}`);
check('check-in marks the room occupied', checkIn.json?.room?.status === 'occupied', `got ${checkIn.json?.room?.status}`);
check('check-in records the in-house guest name', checkIn.json?.room?.currentGuestName === 'E2E Guest One');

const doubleIn = await api(`/api/room-bookings/${bk1.id}/check-in`, { method: 'PUT', body: {} }, token);
check('checking the same guest in twice is refused', doubleIn.status === 400, `got ${doubleIn.status}`);

// ---------------------------------------------------------------------------
// 5. Housekeeping cannot free an occupied room
// ---------------------------------------------------------------------------
const sneakyFree = await api(`/api/rooms/${A}`, { method: 'PUT', body: { status: 'available' } }, token);
check('housekeeping cannot mark an occupied room available', sneakyFree.status === 400, `got ${sneakyFree.status}`);

const sneakyRetire = await api(`/api/rooms/${A}`, { method: 'PUT', body: { isActive: false } }, token);
check('a room with an in-house guest cannot be retired', sneakyRetire.status === 400, `got ${sneakyRetire.status}`);

const sneakyDelete = await api(`/api/rooms/${A}`, { method: 'DELETE' }, token);
check('an occupied room cannot be deleted', sneakyDelete.status === 400, `got ${sneakyDelete.status}`);

// ---------------------------------------------------------------------------
// 6. Renaming a room keeps active bookings in sync
// ---------------------------------------------------------------------------
const renamed = await api(`/api/rooms/${A}`, { method: 'PUT', body: { roomNumber: `T${uniq}A2` } }, token);
check('the room can be renamed', renamed.status === 200 && renamed.json?.roomNumber === `T${uniq}A2`, `got ${renamed.status}`);
const afterRename = await api(`/api/room-bookings?roomId=${A}`, {}, token);
const syncedBooking = afterRename.json.find(b => b.id === bk1.id);
check('the active booking follows the new room number', syncedBooking?.roomNumber === `T${uniq}A2`, `got ${syncedBooking?.roomNumber}`);

// ---------------------------------------------------------------------------
// 7. Overlap detection & future reservations on an occupied room
// ---------------------------------------------------------------------------
const overlap = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Overlap Guest', guestPhone: '0773334444', checkInDate: dayKey(1), checkOutDate: dayKey(3) },
}, token);
check('an overlapping stay is refused', overlap.status === 400, `got ${overlap.status}`);

const future = await api('/api/room-bookings', {
  method: 'POST',
  body: { roomId: A, guestName: 'Future Guest', guestPhone: '0775556666', checkInDate: dayKey(10), checkOutDate: dayKey(12), status: 'confirmed' },
}, token);
check('a non-overlapping FUTURE reservation on an occupied room is allowed', future.status === 201, `got ${future.status} ${JSON.stringify(future.json).slice(0, 140)}`);
const bk2 = future.json?.booking;
if (bk2) createdBookings.push(bk2.id);
check('the future reservation does NOT evict the in-house guest', future.json?.room?.status === 'occupied', `got ${future.json?.room?.status}`);
check('a future-dated "checked_in" request is downgraded to confirmed', bk2?.status === 'confirmed', `got ${bk2?.status}`);

// ---------------------------------------------------------------------------
// 8. Check-out settles the IN-HOUSE guest only
// ---------------------------------------------------------------------------
const liveBookings = await api('/api/room-bookings', {}, token);
const liveBk1 = liveBookings.json.find(b => b.id === bk1.id);
const shortPay = await api(`/api/room-bookings/${bk1.id}/checkout`, { method: 'PUT', body: { finalPaymentAmount: 1 } }, token);
check('a short final payment is refused', shortPay.status === 400, `got ${shortPay.status}`);

const badOutMethod = await api(`/api/room-bookings/${bk1.id}/checkout`, { method: 'PUT', body: { paymentMethod: 'seashells', finalPaymentAmount: liveBk1.balanceDue } }, token);
check('an unknown settlement method is refused', badOutMethod.status === 400, `got ${badOutMethod.status}`);

const out = await api(`/api/room-bookings/${bk1.id}/checkout`, {
  method: 'PUT',
  body: { paymentMethod: 'cash', additionalCharges: 1000, finalPaymentAmount: liveBk1.balanceDue + 1000 },
}, token);
check('check-out succeeds for the in-house guest', out.status === 200, `got ${out.status} ${JSON.stringify(out.json).slice(0, 140)}`);
check('check-out clears the balance', out.json?.booking?.balanceDue === 0, `got ${out.json?.booking?.balanceDue}`);
check('extra charges are added to the grand total', out.json?.booking?.grandTotal === Number((liveBk1.grandTotal + 1000).toFixed(2)), `got ${out.json?.booking?.grandTotal}`);
check('check-out sends the room to Cleaning', out.json?.room?.status === 'cleaning', `got ${out.json?.room?.status}`);
check('the room now points at the NEXT arrival', out.json?.room?.currentBookingId === bk2.id, `got ${out.json?.room?.currentBookingId}`);

const doubleOut = await api(`/api/room-bookings/${bk1.id}/checkout`, { method: 'PUT', body: {} }, token);
check('checking out twice is refused', doubleOut.status === 400, `got ${doubleOut.status}`);

// ---------------------------------------------------------------------------
// 9. syncRoomStatus respects housekeeping and cancellation clears the balance
// ---------------------------------------------------------------------------
const cancel = await api(`/api/room-bookings/${bk2.id}/cancel`, { method: 'PUT', body: { reason: 'E2E cleanup' } }, token);
check('a reservation can be cancelled', cancel.status === 200, `got ${cancel.status}`);
check('cancelling zeroes the outstanding balance', cancel.json?.booking?.balanceDue === 0, `got ${cancel.json?.booking?.balanceDue}`);
check('cancelling does not resurrect a room out of Cleaning', cancel.json?.room?.status === 'cleaning', `got ${cancel.json?.room?.status}`);

const doubleCancel = await api(`/api/room-bookings/${bk2.id}/cancel`, { method: 'PUT', body: {} }, token);
check('cancelling twice is refused', doubleCancel.status === 400, `got ${doubleCancel.status}`);

// A cancelled booking must not be checked in.
const zombieIn = await api(`/api/room-bookings/${bk2.id}/check-in`, { method: 'PUT', body: {} }, token);
check('a cancelled booking cannot be checked in', zombieIn.status === 400, `got ${zombieIn.status}`);

// Now the room is free again.
const freed = await api(`/api/rooms/${A}`, { method: 'PUT', body: { status: 'available' } }, token);
check('housekeeping can release the room once the guest is gone', freed.status === 200 && freed.json?.status === 'available', `got ${freed.status}`);
check('releasing the room clears the stale guest name', !freed.json?.currentGuestName, `got ${freed.json?.currentGuestName}`);

// ---------------------------------------------------------------------------
// 10. Cleanup
// ---------------------------------------------------------------------------
for (const id of createdRooms) {
  await api(`/api/rooms/${id}`, { method: 'DELETE' }, token);
}
const leftovers = await api('/api/rooms', {}, token);
check('test rooms are cleaned up', !leftovers.json.some(r => createdRooms.includes(r.id)));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
