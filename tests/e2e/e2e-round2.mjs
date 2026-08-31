/* Eighth audit round — regression coverage for the defects found on 2026-08-31:
 *
 *  1. Cashier could tamper the room rate (ratePerDay) — now master data only.
 *  2. Cashier could tamper the function hall charge — now master data only.
 *  3. Room & function discounts ignored "Enable Discounts" / "Max Discount %".
 *  4. Function events could be booked on a date in the past.
 *  5. Room double-booking guard ignored the stay dates (a reservation for next
 *     month made the room un-bookable today; overlapping future stays were not
 *     detected at all).
 *  6. Changing a password left every other device logged in for 30 days.
 *  7. A Super Admin could lock the whole system out (self-deactivate / demote
 *     the last Super Admin) through PUT /api/users/:id.
 *  8. PUT /api/settings stored numeric settings as strings.
 *
 * Everything is created through the API and cleaned up at the end, so the suite
 * is safe to run repeatedly against a live dev server.
 */
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${extra}`); }
}

async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { }
  return { status: res.status, json };
}

const uniq = Date.now();
const iso = d => new Date(d).toISOString();
const dayKey = d => new Date(d).toISOString().split('T')[0];
const inDays = n => Date.now() + n * 86400000;

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000', hotelId: 'royal-green-garden' } });
const adminToken = login.json?.token;
check('admin login', login.status === 200 && !!adminToken, `got ${login.status}`);

const originalSettings = (await api('/api/settings', {}, adminToken)).json;

// ---------------------------------------------------------------- cashier ---
const cashierUser = await api('/api/users', {
  method: 'POST',
  body: { name: `Round2 Cashier ${uniq}`, username: `r2cash${uniq}`, role: 'cashier', password: 'CashierPass1' },
}, adminToken);
const cashierId = cashierUser.json?.id;
const cashierLogin = await api('/api/auth/login', { method: 'POST', body: { username: `r2cash${uniq}`, password: 'CashierPass1', hotelId: 'royal-green-garden' } });
const cashierToken = cashierLogin.json?.token;
check('cashier login', cashierLogin.status === 200 && !!cashierToken, `got ${cashierLogin.status}`);

// =========================================================== 1. ROOM RATE ===
const roomRes = await api('/api/rooms', {
  method: 'POST',
  body: { roomNumber: `R2-${uniq % 100000}`, roomType: 'Deluxe', floor: '2', ratePerDay: 8500 },
}, adminToken);
const roomId = roomRes.json?.id;
check('test room created', roomRes.status === 201 && !!roomId, `got ${roomRes.status}`);

const tampered = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Rate Tamper', guestPhone: '0770000001',
    checkInDate: iso(inDays(1)), checkOutDate: iso(inDays(3)),
    ratePerDay: 100, advancePaid: 0,
  },
}, cashierToken);
check('cashier rate tamper ignored (master rate used)',
  tampered.status === 201 && tampered.json?.booking?.ratePerDay === 8500 && tampered.json?.booking?.totalRoomCharge === 17000,
  `got rate=${tampered.json?.booking?.ratePerDay} total=${tampered.json?.booking?.totalRoomCharge}`);
if (tampered.json?.booking?.id) await api(`/api/room-bookings/${tampered.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

const adminOverride = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Negotiated Rate', guestPhone: '0770000002',
    checkInDate: iso(inDays(1)), checkOutDate: iso(inDays(2)),
    ratePerDay: 7000, advancePaid: 0,
  },
}, adminToken);
check('super admin may still negotiate a rate',
  adminOverride.status === 201 && adminOverride.json?.booking?.ratePerDay === 7000,
  `got ${adminOverride.json?.booking?.ratePerDay}`);
if (adminOverride.json?.booking?.id) await api(`/api/room-bookings/${adminOverride.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

const badOverride = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Bad Rate', guestPhone: '0770000003',
    checkInDate: iso(inDays(1)), checkOutDate: iso(inDays(2)),
    ratePerDay: 99999999, advancePaid: 0,
  },
}, adminToken);
check('invalid admin rate override rejected (400)', badOverride.status === 400, `got ${badOverride.status}`);

// ================================================ 2. FUNCTION HALL CHARGE ===
const hallRes = await api('/api/function-halls', {
  method: 'POST',
  body: { hallName: `R2 Hall ${uniq % 100000}`, hallType: 'Banquet', ratePerDay: 150000 },
}, adminToken);
const hallId = hallRes.json?.id;
check('test hall created', hallRes.status === 201 && !!hallId, `got ${hallRes.status}`);

const hallTamper = await api('/api/function-bookings', {
  method: 'POST',
  body: {
    hallId, customerName: 'Hall Tamper', customerPhone: '0770000004',
    eventDate: dayKey(inDays(10)), eventType: 'wedding',
    hallCharge: 100, perPlateRate: 2500, numberOfPlates: 100, advancePaid: 0,
  },
}, cashierToken);
check('cashier hall-charge tamper ignored (hall rate used)',
  hallTamper.status === 201 && hallTamper.json?.booking?.hallCharge === 150000 && hallTamper.json?.booking?.grandTotal === 400000,
  `got charge=${hallTamper.json?.booking?.hallCharge} total=${hallTamper.json?.booking?.grandTotal}`);
if (hallTamper.json?.booking?.id) await api(`/api/function-bookings/${hallTamper.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

// ============================== 3. BOOKING DISCOUNTS OBEY THE POS POLICY ====
await api('/api/settings', { method: 'PUT', body: { maxDiscountPercentage: 10, enableDiscounts: true } }, adminToken);

const roomDisc = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Discount Clamp', guestPhone: '0770000005',
    checkInDate: iso(inDays(1)), checkOutDate: iso(inDays(2)),
    ratePerDay: 8500, discount: 8000, advancePaid: 0,
  },
}, cashierToken);
check('room discount clamped to max 10% (850)',
  roomDisc.status === 201 && roomDisc.json?.booking?.discount === 850,
  `got ${roomDisc.json?.booking?.discount}`);
if (roomDisc.json?.booking?.id) await api(`/api/room-bookings/${roomDisc.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

const fnDisc = await api('/api/function-bookings', {
  method: 'POST',
  body: {
    hallId, customerName: 'Discount Clamp', customerPhone: '0770000006',
    eventDate: dayKey(inDays(11)), eventType: 'birthday',
    hallCharge: 150000, perPlateRate: 2500, numberOfPlates: 100, discount: 500000, advancePaid: 0,
  },
}, cashierToken);
check('function discount clamped to max 10% (40,000)',
  fnDisc.status === 201 && fnDisc.json?.booking?.discount === 40000 && fnDisc.json?.booking?.grandTotal === 360000,
  `got ${fnDisc.json?.booking?.discount} / ${fnDisc.json?.booking?.grandTotal}`);
if (fnDisc.json?.booking?.id) await api(`/api/function-bookings/${fnDisc.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

await api('/api/settings', { method: 'PUT', body: { enableDiscounts: false } }, adminToken);

const roomDiscOff = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'No Discounts', guestPhone: '0770000007',
    checkInDate: iso(inDays(1)), checkOutDate: iso(inDays(2)),
    ratePerDay: 8500, discount: 5000, advancePaid: 0,
  },
}, cashierToken);
check('room discount forced to 0 when discounts disabled',
  roomDiscOff.status === 201 && roomDiscOff.json?.booking?.discount === 0 && roomDiscOff.json?.booking?.grandTotal === 8500,
  `got ${roomDiscOff.json?.booking?.discount} / ${roomDiscOff.json?.booking?.grandTotal}`);
if (roomDiscOff.json?.booking?.id) await api(`/api/room-bookings/${roomDiscOff.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);

await api('/api/settings', { method: 'PUT', body: { enableDiscounts: true, maxDiscountPercentage: originalSettings?.maxDiscountPercentage ?? 20 } }, adminToken);

// ================================================= 4. PAST EVENT DATE =======
const pastEvent = await api('/api/function-bookings', {
  method: 'POST',
  body: {
    hallId, customerName: 'Backdated', customerPhone: '0770000008',
    eventDate: '2020-01-01', eventType: 'party', hallCharge: 150000,
  },
}, adminToken);
check('back-dated event rejected (400)', pastEvent.status === 400, `got ${pastEvent.status}`);

// ============================================ 5. DATE-AWARE ROOM OVERLAP ====
// A reservation far in the future must NOT block a stay that ends before it.
const futureBooking = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Future Guest', guestPhone: '0770000009',
    checkInDate: iso(inDays(20)), checkOutDate: iso(inDays(23)),
    status: 'confirmed', advancePaid: 0,
  },
}, adminToken);
check('future reservation created', futureBooking.status === 201, `got ${futureBooking.status}`);

const nowBooking = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Today Guest', guestPhone: '0770000010',
    checkInDate: iso(inDays(0)), checkOutDate: iso(inDays(2)),
    advancePaid: 0,
  },
}, adminToken);
check('today\'s check-in NOT blocked by a future reservation',
  nowBooking.status === 201, `got ${nowBooking.status} ${JSON.stringify(nowBooking.json)?.slice(0, 160)}`);

const overlapping = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Overlap Guest', guestPhone: '0770000011',
    checkInDate: iso(inDays(21)), checkOutDate: iso(inDays(25)),
    advancePaid: 0,
  },
}, adminToken);
check('overlapping future stay blocked (400)', overlapping.status === 400, `got ${overlapping.status}`);

const afterBooking = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Later Guest', guestPhone: '0770000012',
    checkInDate: iso(inDays(24)), checkOutDate: iso(inDays(26)),
    status: 'confirmed', advancePaid: 0,
  },
}, adminToken);
check('non-overlapping later stay allowed', afterBooking.status === 201, `got ${afterBooking.status} ${JSON.stringify(afterBooking.json)?.slice(0, 160)}`);

// A future stay must never be "checked in" (that used to flip the room to
// OCCUPIED and list the guest as in-house weeks before arrival).
const futureCheckin = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId, guestName: 'Early Bird', guestPhone: '0770000013',
    checkInDate: iso(inDays(30)), checkOutDate: iso(inDays(31)),
    status: 'checked_in', advancePaid: 0,
  },
}, adminToken);
check('future stay is downgraded to a reservation',
  futureCheckin.status === 201 && futureCheckin.json?.booking?.status === 'confirmed',
  `got ${futureCheckin.json?.booking?.status}`);
check('future reservation does not replace the in-house guest',
  futureCheckin.json?.room?.currentGuestName !== 'Early Bird',
  `guest=${futureCheckin.json?.room?.currentGuestName} status=${futureCheckin.json?.room?.status}`);

// On a free room, a future stay must leave it RESERVED (not occupied).
const room2Res = await api('/api/rooms', {
  method: 'POST',
  body: { roomNumber: `R2B-${uniq % 100000}`, roomType: 'Standard', floor: '2', ratePerDay: 5000 },
}, adminToken);
const room2Id = room2Res.json?.id;
const futureOnly = await api('/api/room-bookings', {
  method: 'POST',
  body: {
    roomId: room2Id, guestName: 'Future Only', guestPhone: '0770000014',
    checkInDate: iso(inDays(40)), checkOutDate: iso(inDays(41)),
    status: 'checked_in', advancePaid: 0,
  },
}, adminToken);
check('future stay leaves a free room RESERVED (not OCCUPIED)',
  futureOnly.status === 201 && futureOnly.json?.room?.status === 'reserved' && !futureOnly.json?.room?.currentGuestName,
  `got room=${futureOnly.json?.room?.status} guest=${futureOnly.json?.room?.currentGuestName}`);
if (futureOnly.json?.booking?.id) {
  await api(`/api/room-bookings/${futureOnly.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);
}
if (room2Id) await api(`/api/rooms/${room2Id}`, { method: 'DELETE' }, adminToken);

// Cancelling a future reservation must not free a room that is occupied now.
const roomState = async () => (await api('/api/rooms', {}, adminToken)).json?.find(r => r.id === roomId);
const occupiedNow = await roomState();
check('room is occupied by the current guest', occupiedNow?.status === 'occupied', `got ${occupiedNow?.status}`);
if (futureCheckin.json?.booking?.id) {
  await api(`/api/room-bookings/${futureCheckin.json.booking.id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);
}
const stillOccupied = await roomState();
check('cancelling a future reservation keeps the room occupied',
  stillOccupied?.status === 'occupied' && !!stillOccupied?.currentGuestName,
  `got ${stillOccupied?.status} guest=${stillOccupied?.currentGuestName}`);

for (const id of [futureBooking.json?.booking?.id, nowBooking.json?.booking?.id, afterBooking.json?.booking?.id]) {
  if (id) await api(`/api/room-bookings/${id}/cancel`, { method: 'PUT', body: { reason: 'test cleanup' } }, adminToken);
}
const freedRoom = await roomState();
check('room freed after every booking is cancelled',
  freedRoom?.status === 'available' && !freedRoom?.currentBookingId,
  `got ${freedRoom?.status}`);

// ================================= 6. PASSWORD CHANGE KILLS OTHER SESSIONS ==
const admin2 = await api('/api/users', {
  method: 'POST',
  body: { name: `R2 Admin2 ${uniq}`, username: `r2admin2${uniq}`, role: 'super_admin', password: 'Round2Admin1' },
}, adminToken);
const admin2Id = admin2.json?.id;
const s1 = await api('/api/auth/login', { method: 'POST', body: { username: `r2admin2${uniq}`, password: 'Round2Admin1', hotelId: 'royal-green-garden' } });
const s2 = await api('/api/auth/login', { method: 'POST', body: { username: `r2admin2${uniq}`, password: 'Round2Admin1', hotelId: 'royal-green-garden' } });
const t1 = s1.json?.token, t2 = s2.json?.token;
check('two sessions opened', s1.status === 200 && s2.status === 200 && t1 !== t2, `got ${s1.status}/${s2.status}`);

const pwChange = await api('/api/auth/change-password', {
  method: 'POST',
  body: { currentPassword: 'Round2Admin1', newPassword: 'Round2Admin2!' },
}, t1);
check('password change accepted', pwChange.status === 200, `got ${pwChange.status} ${JSON.stringify(pwChange.json)?.slice(0, 120)}`);
check('changing session still valid', (await api('/api/auth/me', {}, t1)).status === 200);
const stale = await api('/api/auth/me', {}, t2);
check('other device signed out (401)', stale.status === 401, `got ${stale.status}`);
check('new password logs in', (await api('/api/auth/login', { method: 'POST', body: { username: `r2admin2${uniq}`, password: 'Round2Admin2!', hotelId: 'royal-green-garden' } })).status === 200);

// ============================== 7. NO SELF-LOCKOUT VIA PUT /api/users/:id ===
const selfDisable = await api(`/api/users/${admin2Id}`, { method: 'PUT', body: { isActive: false } }, t1);
check('super admin cannot disable own account (400)', selfDisable.status === 400, `got ${selfDisable.status}`);

if (adminToken) {
  const selfDisable2 = await api(`/api/users/${login.json.user.id}`, { method: 'PUT', body: { isActive: false } }, adminToken);
  check('primary admin cannot disable own account (400)', selfDisable2.status === 400, `got ${selfDisable2.status}`);
}

// Admin resets the cashier password → the cashier's token must die.
const reset = await api(`/api/users/${cashierId}`, { method: 'PUT', body: { password: 'ResetCashier1' } }, adminToken);
check('admin password reset accepted', reset.status === 200, `got ${reset.status}`);
check('reset user signed out (401)', (await api('/api/auth/me', {}, cashierToken)).status === 401);
check('new cashier password works', (await api('/api/auth/login', { method: 'POST', body: { username: `r2cash${uniq}`, password: 'ResetCashier1', hotelId: 'royal-green-garden' } })).status === 200);

// Disabling an account must also kill its sessions.
const reCashier = await api('/api/auth/login', { method: 'POST', body: { username: `r2cash${uniq}`, password: 'ResetCashier1', hotelId: 'royal-green-garden' } });
const reCashierToken = reCashier.json?.token;
const toggle = await api(`/api/users/${cashierId}/toggle`, { method: 'PATCH' }, adminToken);
check('cashier disabled', toggle.status === 200 && toggle.json?.isActive === false, `got ${toggle.status}`);
check('disabled cashier token rejected (401)', (await api('/api/auth/me', {}, reCashierToken)).status === 401);
await api(`/api/users/${cashierId}/toggle`, { method: 'PATCH' }, adminToken);

// ============================== 8. NUMERIC SETTINGS STORED AS NUMBERS ======
const strSettings = await api('/api/settings', { method: 'PUT', body: { taxRate: '7', serviceChargeRate: '5', maxDiscountPercentage: '15' } }, adminToken);
check('string tax rate stored as a number',
  strSettings.status === 200 && typeof strSettings.json?.taxRate === 'number' && strSettings.json?.taxRate === 7,
  `got ${typeof strSettings.json?.taxRate} ${strSettings.json?.taxRate}`);
check('string service charge stored as a number', typeof strSettings.json?.serviceChargeRate === 'number' && strSettings.json?.serviceChargeRate === 5);
check('string max discount stored as a number', typeof strSettings.json?.maxDiscountPercentage === 'number' && strSettings.json?.maxDiscountPercentage === 15);

// ------------------------------------------------------------------ cleanup -
await api('/api/settings', { method: 'PUT', body: {
  taxRate: originalSettings?.taxRate ?? 0,
  serviceChargeRate: originalSettings?.serviceChargeRate ?? 0,
  maxDiscountPercentage: originalSettings?.maxDiscountPercentage ?? 20,
  enableDiscounts: originalSettings?.enableDiscounts !== false,
} }, adminToken);
if (admin2Id) await api(`/api/users/${admin2Id}`, { method: 'DELETE' }, adminToken);
if (cashierId) await api(`/api/users/${cashierId}`, { method: 'DELETE' }, adminToken);
if (hallId) await api(`/api/function-halls/${hallId}`, { method: 'DELETE' }, adminToken);
if (roomId) await api(`/api/rooms/${roomId}`, { method: 'DELETE' }, adminToken);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail > 0 ? 1 : 0);
