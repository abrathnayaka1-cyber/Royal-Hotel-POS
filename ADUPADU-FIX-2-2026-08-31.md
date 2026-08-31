# Royal Hotel POS — අඩුපාඩු සෙවීම & නිවැරදි කිරීම් — වටය 2 (2026-08-31)

> මේ වටයේදී POS එක live server එකක් මත (fresh DB) cashier සහ Super Admin
> දෙපැත්තෙන්ම probe කරලා, හමු වූ **සල්ලි පාඩු වෙන්න පුළුවන් අඩුපාඩු** සහ
> **security / room-plan ගැටලු** නිවැරදි කළා. සියලුම e2e suites clean seed DB එකක් මත
> **230/230 pass** (දෙවරක් අඛණ්ඩව run කර බැලුවා — flake නැහැ).

---

## 🔴 1. Cashier කෙනෙකුට room rate එක අඩු කරන්න පුළුවන් වුණා (money leak)

- **ගැටලුව:** `POST /api/room-bookings` එක client එවන `ratePerDay` එක විශ්වාස කළා.
  Rs. **8,500**/night room එකක් `ratePerDay: 100` සමග book කළාම server එක
  **Rs. 200** කට (රෑ 2ක්) booking එක හැදුවා. Cashier කෙනෙකුට ඕනෑම guest කෙනෙකුට
  "විශේෂ අනුපාතයක්" දෙන්න පුළුවන්.
- **Fix:** Rate එක master data.
  - Non-admin (cashier / kitchen manager) request එකක එන `ratePerDay` **ignore** වෙනවා → සැමවිටම `room.ratePerDay`.
  - Super Admin කෙනෙකුට negotiated rate එකක් දෙන්න පුළුවන් (0 – 1,000,000 validate; අනිත් අය 400).
  - `RoomBookingModal` rate input එක non-admin ට **locked** ("Super Admin only" hint එකත් එක්ක).

## 🔴 2. Function hall charge එකත් එහෙමයි

- **ගැටලුව:** Rs. **150,000** hall එක `hallCharge: 100` සමග book වුණා.
- **Fix:** Non-admin → `hall.ratePerDay` (client value ignore). Admin override 0 – 10,000,000 validate.
  `FunctionBookingModal` hall charge input එක non-admin ට locked.

## 🔴 3. Room / Function discounts settings දෙකම ignore කළා

- **ගැටලුව:** System Settings වල **Enable Discounts** සහ **Max Discount %** POS cart එකට විතරයි
  apply වුණේ. Bookings වලදී cashier කෙනෙකුට Rs. 400,000 wedding එකකට `discount: 500000` දීලා
  **Rs. 0** event එකක් create කරන්න පුළුවන් වුණා (verify: `grandTotal=0`).
- **Fix:** නව `clampBookingDiscount()` helper එක rooms සහ functions දෙකටම:
  - `enableDiscounts === false` → discount **0**
  - නැත්නම් → cap එක `maxDiscountPercentage` (room: charge + extra · function: hall + plates + extra)
  - Frontend discount input එක disable / cap වෙනවා + "max N%" සහ "Capped at Rs. X" hint.

## 🟠 4. Function event එකක් අතීත date එකකට book කරන්න පුළුවන් වුණා

- **ගැටලුව:** `eventDate: 2020-01-01` → **201 Created**. මෙවැනි booking එකක් upcoming lists වල
  නොපෙනෙන නිසා hall එක free ලෙස පෙනෙනවා (typo 2024 → 2026 වගේ).
- **Fix:** event date එක අදට වඩා පරණනම් **400** — "The event date (…) is in the past."

## 🟠 5. Room double-booking guard එක dates ගණන් ගත්තේ නැහැ

- **ගැටලුව:** guard එක "room එකේ active booking එකක් තියෙනවද" (confirmed/checked_in) විතරයි බැලුවේ.
  - ලබන මාසේ reservation එකක් තිබුණොත් **අද check-in කරන්න බැහැ** ("already has an active booking").
  - එකම රෑවල් වලට **overlapping future reservations detect කළේ නැහැ**.
- **Fix:** සැබෑ **date-range overlap check** — `existing.checkIn < new.checkOut && new.checkIn < existing.checkOut`.
  Overlapping stays විතරයි block වෙන්නේ (error එකේ dates දෙකම පෙන්වනවා).

## 🟠 6. Future stay එකක් "checked_in" වෙලා room එක OCCUPIED වුණා

- **ගැටලුව:** check-in date එක සති කිහිපයකට පස්සේ වුණත්, status එක `checked_in` විදිහට save වෙලා
  room එක වහාම **OCCUPIED** වුණා + guest ව in-house ලෙස පෙන්නුවා.
- **Fix:** Future-dated stay එකක් සැමවිටම **`confirmed`** reservation විදිහට (room `reserved`,
  occupant fields empty).

## 🟠 7. Future reservation cancel කළාම in-house guest ඉන්න room එක free වුණා

- **ගැටලුව:** cancel handler එක කොන්දේසි විරහිතව room එක `available` කළා; future booking එකක්
  add කළාමත් occupied room එක `reserved` වුණා (guest ව room plan එකෙන් අතුරුදහන්).
- **Fix:** `syncRoomStatus()` — create/cancel වලදී room status + occupant fields
  **ඉතිරි active bookings වලින් re-derive** වෙනවා (in-house → occupied · reservation → reserved · නැත්නම් available).

## 🟠 8. Password එක වෙනස් කළාට පස්සේත් පරණ sessions වැඩ කළා (security)

- **ගැටලුව:** tokens 30 days valid. Password leak වී වෙනස් කළත්, admin කෙනෙකු user කෙනෙකුගේ
  password reset කළත්, account එක disable/delete කළත් පරණ token එකෙන් API එකට යන්න පුළුවන්.
- **Fix:** `User.sessionsInvalidatedAt` + token sweep.
  - change-password → **අනිත් devices සියල්ල sign out** (මේ device එක ඉතුරුයි)
  - admin password reset / account disable / delete → **සියලුම** sessions dead
  - `authMiddleware` issuedAt < invalidatedAt → **401** → frontend `pos_auth_expired` හරහා auto logout.

## 🟠 9. Super Admin කෙනෙකුට system එකම lock කරන්න පුළුවන් වුණා

- **ගැටලුව:** `PATCH /api/users/:id/toggle` වලින් self-disable block කළත්, `PUT /api/users/:id`
  හරහා තමන්ගේම account එක `isActive:false` කරන්න හෝ last Super Admin ව demote/disable කරන්න පුළුවන්.
- **Fix:** `PUT /api/users/:id` → self-disable **400**, last-active-Super-Admin demote/disable **400**
  (`isActive: 0` / `"false"` වගේ variant values ගත්තත් හසු වෙනවා).

## 🟠 10. Rate limit settings / login limiter (availability)

- **ගැටලුව:**
  - `.env.example` එකේ document කරපු `RATE_LIMIT_MAX_REQUESTS` සහ `RATE_LIMIT_WINDOW_MS`
    server එක **කියවුවේ නැහැ** (silently 500/15min).
  - Login limiter එක **successful logins පවා** count කළා — hotel floor එකක සියලුම terminals
    එක public IP එකක් share කරන නිසා staff ට "Too many login attempts" lock වෙන්න පුළුවන්.
- **Fix:** Env variables දෙකම read + validate (invalid → default + warning log). Login limiter එකට
  `skipSuccessfulRequests: true` — brute-force protection (5 වැරදි attempt → 60s lockout) නොවෙනස්ව තියෙනවා.

## 🟠 11. Numeric settings string ලෙස save වීම & රෑ ගණනේ rounding

- **ගැටලුව:**
  - `PUT /api/settings` → `taxRate: "15"` string එක ලෙසම store වුණා (booleans normalize කළත් numbers නොවෙයි).
  - Nights calculation එකේ `Math.ceil()` නිසා "රෑ 2ක් + 1 ms" → **රෑ 3** charge (guest overcharge).
- **Fix:** `taxRate`, `serviceChargeRate`, `maxDiscountPercentage`, `lowStockDefaultThreshold` සැමවිටම
  `Number()` normalize (invalid → 400). Nights → `toFixed(6)` rounding වලින් පස්සේ `ceil`.

## 🟡 12. Test suite එක repeat කරන්න බැරි වුණා

- **ගැටලුව:** `tests/e2e/e2e-shots.mjs` seeded stock (24 bottles / 0 ml poured) assume කළා →
  දෙවෙනි run එකේ checks 15ක් fail (state pollution).
- **Fix:** suite එක ආරම්භයේදීම known baseline එක set කරනවා (bottle stock 24 + open bottle clear) —
  දැන් suite එක කීප වරක් අඛණ්ඩව run කරන්න පුළුවන් ✅

---

## ✅ Verification

- `npm run typecheck` (`tsc --noEmit`) — clean
- `npm run build` (Vite + esbuild) — OK
- E2E (clean seed DB, live server, **2 වරක්**):
  `e2e-barcode-bar-only` 11 · `e2e-edge` 29 · `e2e-fixes` 18 · `e2e-functions` 21 ·
  `e2e-kitchen-sale` 12 · `e2e-kitchen` 21 · `e2e-recipe-impact` 21 · `e2e-recipe-snapshot` 10 ·
  **නව** `e2e-round2` **37** · `e2e-shots` 26 · `e2e-test` 24 → **230/230 pass**
- Adversarial probe (endpoints 40+, malformed JSON, invalid enums, path traversal, tampered rates) →
  **500 එකක් නැහැ**, සියල්ල නිවැරදි 400/404/403/401 ✅
- Tenant isolation verify: Hotel A token + `X-Hotel-Id: Hotel B` → **401** ✅
- නව `tests/e2e/e2e-round2.mjs` regression-proof කරන්නේ: rate tampering, hall-charge tampering,
  discount clamping (on/off), back-dated events, date-range overlap, future-stay status,
  room-status re-derivation, session invalidation, self-lockout guards, numeric settings ✅
