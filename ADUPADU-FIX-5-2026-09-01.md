# Royal Hotel POS — Rooms & Bookings Module A2Z Check & නිවැරදි කිරීම් (2026-09-01)

> මේ වටයේදී **Rooms & Bookings Module එක පමණක්** A2Z පරීක්ෂා කරලා හමුවූ bugs, errors,
> logic faults සහ අඩුපාඩු සියල්ල නිවැරදි කළා.
>
> **Scope:** `server.ts` (`/api/rooms`, `/api/room-bookings`), `server/db.ts` (types),
> `src/components/pos/RoomsView.tsx`, `RoomBookingModal.tsx`, `RoomCheckoutModal.tsx`,
> `RoomBookingTicketModal.tsx`, `src/components/admin/RoomManagement.tsx`,
> `src/context/POSContext.tsx`, `src/lib/printEngine.ts`.
>
> `tsc --noEmit` clean, Vite + esbuild production build OK, අලුත්
> `tests/e2e/e2e-rooms.mjs` regression suite එක **57/57 pass**, පරණ suites සියල්ල
> (24 + 37 + 18 + 29 + 21 + 16) තාමත් green.

---

## 🔴 CRITICAL — මුදල් / දත්ත අහිමි වන bugs

### 1. Check-Out එකෙන් **වැරදි guest ගේ booking එක** settle වුණා

- **ගැටලුව:** `RoomCheckoutModal` එකේ active booking හොයන logic එක
  `status === 'checked_in' || status === 'confirmed'` කියලා ගත්තා, ඒත් `.find()`
  එකෙන් ආවේ array එකේ **මුලින්ම හම්බවෙන** එක. Bookings `unshift()` වෙන නිසා
  **අලුත්ම** එක මුලට එනවා — ඒ නිසා ඇතුළේ ඉන්න guest කෙනෙක් ඉද්දී **ඊළඟ මාසෙට
  දාපු reservation එක** checkout modal එකේ පෙන්නලා, "Settle & Check-Out" එබුවම
  **ඒ future reservation එක විනාශ වෙලා**, ඇත්ත in-house guest ගේ booking එක
  විවෘතව ම රැඳුණා (කාමරේ occupied, ගණන් නොගෙවා).
- **Fix:** Checkout modal එක දැන් **`checked_in` booking එකක් පමණක්** තෝරනවා.
  Server එකත් `booking.status !== 'checked_in'` නම් checkout එක ප්‍රතික්ෂේප කරනවා.

### 2. Reservation එකක් **check-in නොකර** checkout කරලා මුදල් ගන්න පුළුවන් වුණා

- **ගැටලුව:** `PUT /room-bookings/:id/checkout` එකට `confirmed` booking එකකුත්
  යවන්න පුළුවන් වුණා — කවදාවත් සිදු නොවුණු නවාතැනකට මුදල් අය කරලා, කාමරේ
  "reserved" තත්ත්වයේ හිරවෙලා තිබුණා.
- **Fix:** Check-out කරන්න පුළුවන් **checked-in guest කෙනෙකුට පමණයි**.

### 3. **Check-In transition එකක්ම නොතිබුණා** (module එකේ ලොකුම හිඩැස)

- **ගැටලුව:** `confirmed` reservation එකක් `checked_in` බවට පත් කරන්න **කිසිම
  endpoint එකක් හෝ UI button එකක් තිබුණේ නැහැ**. Guest ආවම කරන්න තිබුණේ booking
  එක cancel කරලා අලුතින් හදන එක විතරයි (ticket number එක නැතිවෙනවා, advance එක
  නැතිවෙනවා). කාමරේ මුළු නවාතැන පුරාම "reserved" විදියට හිරවෙලා තිබුණා.
- **Fix:**
  - අලුත් **`PUT /api/room-bookings/:id/check-in`** endpoint එක
    (validation ඇතුළුව: already checked-in, cancelled/checked-out booking,
    කාමරේ තව in-house guest කෙනෙක්, maintenance room).
  - POSContext එකට `checkInRoomBooking()` එකතු කළා.
  - RoomsView එකේ reserved කාමරවලට **"🟢 Check-In Guest" button** එකක්.

### 4. Housekeeping dropdown එකෙන් **guest කෙනෙක් "අතුරුදන්" කරන්න** පුළුවන් වුණා

- **ගැටලුව:** Room card එකේ status dropdown එකෙන් occupied කාමරයක් කෙළින්ම
  "Available" කරන්න පුළුවන් වුණා. `PUT /api/rooms/:id` එක ඒක blindly save කළා —
  booking එක `checked_in` විදියටම රැඳුණත් කාමරේ නිදහස් වුණා, ඊට පස්සේ **එම කාමරය
  double-book කරන්න පුළුවන් වුණා** සහ in-house guest කෙනා dashboard එකෙන් අතුරුදන් වුණා.
- **Fix:**
  - Server: in-house guest කෙනෙක් ඉන්නවා නම් `occupied` හැර වෙන status එකකට
    මාරු කරන්න දෙන්නේ නැහැ (පැහැදිලි error message එකක් සමඟ).
  - UI: guest ඉන්නවා නම් dropdown එක disable වෙනවා (tooltip එකෙන් හේතුව).
  - `occupied` / `reserved` options දෙක manual selection වලින් ඉවත් කළා —
    ඒවා booking engine එකෙන් set වෙන ඒවා.

### 5. Guest capacity **කවදාවත් enforce වුණේ නැහැ**

- **ගැටලුව:** `numberOfGuests` එක UI එකේ අරන් `Math.min(20, …)` විතරක් කරලා save
  වුණා. 2-person කාමරයකට **guests 12ක්** check-in කරන්න පුළුවන් වුණා.
- **Fix:** Server එක `room.capacity` එකට එරෙහිව validate කරනවා; modal එකේ input
  එකේ `max` එක කාමරයේ capacity එකට bind කරලා, over-capacity නම් රතු warning එකක්
  සහ submit button එක disable වෙනවා.

---

## 🟠 HIGH — වැරදි මුදල් ගණන් / corrupted data

### 6. වසරකට වඩා දිග / **back-dated** නවාතැන් වලට ආරක්ෂාවක් තිබුණේ නැහැ

- **ගැටලුව:** Check-out date එකේ year එක වැරදියට type කළොත් (`2027` වෙනුවට `2037`)
  nights × rate ගණනය වෙලා **ලක්ෂ ගණනක bill එකක්** හැදුණා. පරණ දිනවලට bookings
  දාන්නත් පුළුවන් වුණා — ඒවා occupancy reports විනාශ කරලා, කවදාවත් check-in
  කරන්න බැරි වුණා.
- **Fix:** නවාතැනක් උපරිම **nights 365**; සම්පූර්ණයෙන් අතීතයේ ඇති නවාතැන්
  ප්‍රතික්ෂේප කරනවා (කාල කලාප සඳහා දින 1ක grace එකක් සමඟ). UI එකේ
  duration input එකේ `max` එක 60 සිට 365 දක්වා නිවැරදි කරලා check-in date
  එකට `min={todayStr}` දාලා.

### 7. Room rate / half-day rate **වැරදි අගයන් නිහඬව ප්‍රතික්ෂේප** වුණා

- **ගැටලුව:** `PUT /api/rooms/:id` එකේ `if (!isNaN(rate) && rate > 0 …) room.ratePerDay = rate;`
  — වැරදි rate එකක් දුන්නොත් **error එකක් නැහැ, save එකත් නැහැ**. Admin UI එකේ
  "Update Room Details" සාර්ථක වගේ පෙනුණත් පරණ tariff එකම තිබුණා.
- **Fix:** වැරදි rate / half-day rate එකකට දැන් `400` error එකක්. Create endpoint
  එකේ `rateHalfDay` එකට validation එකක්ම තිබුණේ නැහැ — ඒකත් එකතු කළා.

### 8. **Timezone bug** — සවස 6:30ට පස්සේ ගත්ත bookings "හෙට" ලෙස ගැනුණා

- **ගැටලුව:** `checkIn.toISOString().split('T')[0]` කියන්නේ **UTC**. UTC+05:30
  හෝටලයක සවස 6:30ට පස්සේ ගන්න **අද දිනයේ check-in** එකක් "අනාගත" එකක් ලෙස කියවලා
  නිහඬව `confirmed` බවට downgrade වුණා — guest කාමරයේ ඉද්දී reservation එකක් විදියට.
  Frontend එකේත් `todayStr` / `tomorrowStr` UTC වලින් හදපු නිසා UTC+05:30 හෝටලයක
  අලුයම 5:30ට කලින් default check-in date එක **ඊයේ** ලෙස render වුණා.
- **Fix:** Server එකට `localDateKey()` helper එකක්; modal එකට `toDateKey()` එකක්.
  Date arithmetic සියල්ල දැන් `T00:00:00` local-midnight parsing එකෙන් කරනවා
  (`new Date('2026-09-01')` කියන්නේ UTC midnight — local dates එක්ක මිශ්‍ර වුණාම
  nights ගණන 1කින් වැරදුණා).

### 9. Cancel කළ bookings **"outstanding dues" වල සදාකාලිකව** රැඳුණා

- **ගැටලුව:** Cancel කරද්දී `balanceDue` එක එහෙමම තිබුණා — අවලංගු කළ නවාතැනකට
  තවමත් මුදල් හිඟයි කියලා පෙන්නුවා.
- **Fix:** Cancel කරද්දී `balanceDue = 0`; ගෙවලා තිබුණු advance එකක් තියෙනවා නම්
  **refundable amount එක notes එකට** සහ API response එකේ `refundDue` field එකට
  දාලා cashier ට පේන විදියට message එකේ පෙන්නනවා.

### 10. `syncRoomStatus` **වැරදි booking එකට** point කළා + housekeeping override කළා

- **ගැටලුව:**
  - `active[0]` කියන්නේ array එකේ මුල — bookings unshift වෙන නිසා **අලුත්ම**
    reservation එක. හෙට එන guest කෙනා වෙනුවට **ලබන මාසේ** එන කෙනා පෙන්නුවා.
  - Cleaning / maintenance තත්ත්වයේ තිබුණු කාමරයක් future reservation එකක් නිසා
    බලෙන් "reserved" බවට පත් වුණා — housekeeping status එක නැතිවුණා.
- **Fix:** check-in date එකෙන් sort කරලා **ඊළඟට එන අය** තෝරනවා; cleaning /
  maintenance තත්ත්ව overwrite කරන්නේ නැහැ. Check-out එකේදීත් කාමරය
  `cleaning` වුණාට පස්සේ ඊළඟ arrival එකට link එක තියාගන්නවා.

### 11. Room එකක් **rename කළාම bookings පරණ නම එක්ක** හිරවුණා

- **ගැටලුව:** Booking එකේ `roomNumber` / `roomType` snapshot කරලා තිබුණු නිසා
  කාමරයේ අංකය වෙනස් කළාම booking list එකයි room plan එකයි **එකිනෙකට පටහැනි**
  තොරතුරු පෙන්නුවා.
- **Fix:** Rename / retype කරද්දී **active bookings** (`confirmed` / `checked_in`)
  sync වෙනවා. (History bookings ඒ කාලේ තිබුණු නම එක්කම රැඳෙනවා — ඒක නිවැරදියි.)

### 12. Room delete කළාම bookings **orphan** වුණා

- **ගැටලුව:** `occupied` නොවන ඒත් `confirmed` reservations තියෙන කාමරයක් delete
  කරන්න පුළුවන් වුණා. Booking එක history එකේ නැති කාමරයකට point කරලා රැඳුණා,
  `syncRoomStatus` එකට කවදාවත් ඒක නිදහස් කරන්න බැරි වුණා.
- **Fix:** Active bookings තියෙනවා නම් delete එක ප්‍රතික්ෂේප කරලා, booking
  number එකත් සමඟ පැහැදිලි message එකක් දෙනවා (හෝ room එක de-activate කරන්න යෝජනා කරනවා).

### 13. `isActive` field එකට **UI එකක්ම තිබුණේ නැහැ** — retired කාමර bookable වුණා

- **ගැටලුව:** `Room.isActive` data model එකේ තිබුණත් Admin UI එකේ ඒක බලන්න/වෙනස්
  කරන්න ක්‍රමයක් තිබුණේ නැහැ, `GET /api/rooms` එකෙන් filter වුණේත් නැහැ —
  retired කාමරයක් POS room plan එකේ පෙන්නලා **සම්පූර්ණයෙන් bookable** වුණා.
- **Fix:** Admin modal එකට **Active checkbox** එකක්; `GET /api/rooms?activeOnly=true`;
  RoomsView එකෙන් retired කාමර සම්පූර්ණයෙන් හංගනවා; booking endpoint එකෙන්
  retired කාමරයක් ප්‍රතික්ෂේප කරනවා; active bookings තියෙද්දී retire කරන්න දෙන්නේ නැහැ.
  Admin table එකේ status badge එකේ `· RETIRED` ලෙස පෙන්නනවා.

---

## 🟡 MEDIUM — UI / UX / consistency

### 14. `reserved` status එක UI එකේ **කොහෙවත් තිබුණේ නැහැ** (ghost status)

- **ගැටලුව:** `RoomStatus` union එකේ `'reserved'` තිබුණත් —
  - RoomsView එකේ **badge එකක් නැහැ** (default grey ට වැටුණා),
  - **count pill එකක් නැහැ** (All = 10 වුවත් Available+Occupied+Cleaning = 7 — ගණන් ගැලපුණේ නැහැ),
  - **filter එකක් නැහැ** — reserved කාමර වලට filter කරන්න බැරි වුණා,
  - Admin filter dropdown එකේත් නැහැ, status badge එකේ **maintenance වගේ purple**
    පාටින් පෙන්නුවා.
- **Fix:** සම්පූර්ණ `reserved` support එක (sky-blue badge, count pill, filter,
  card gradient, guest panel). `maintenance` count එකත් dead code වෙලා තිබුණු නිසා
  ඒකටත් pill එකක් දැම්මා.

### 15. Booking modal එකේ **form එක මැදදී මැකී ගියා**

- **ගැටලුව:** `useEffect` dependency array එකේ `rooms` සහ `settings` තිබුණා.
  Background refresh එකකදී ඒවායේ array identity එක වෙනස් වුණාම effect එක නැවත
  run වෙලා **guest name, dates, advance ඇතුළු අඩක් type කරපු form එකම reset** වුණා.
- **Fix:** Dependencies `[isBookingModalOpen, selectedRoomForBooking]` දක්වා අඩු කළා.

### 16. දින logic එකේ අඩුපාඩු (negative stays, UTC drift)

- **ගැටලුව:** Check-in date එක check-out එකට පස්සට ගෙනියද්දී check-out එක
  එහෙමම තිබුණා — **negative නවාතැනක්** පෙන්නලා submit කරද්දී server error එකක්.
  `handleDurationChange` එකේ `toISOString()` UTC drift එකෙන් දිනය 1කින් වැරදුණා.
  `Math.ceil` භාවිතය නිසා තත්පර කිහිපයක වෙනසක් **අමතර රාත්‍රියක්** එකතු කළා.
- **Fix:** Check-in date එක ඉස්සරහට ගියොත් check-out එක **auto-adjust** වෙනවා;
  `nightsBetween()` helper එක local midnights දෙකක් අතර `Math.round` කරනවා;
  duration එක 1..365 අතරට clamp වෙනවා.

### 17. Advance එක grand total එකට වඩා වැඩි වුණාම **submit කරද්දී විතරයි fail වුණේ**

- **Fix:** UI එකේ `effectiveAdvance` එකෙන් clamp කරලා summary එකේ නිවැරදිව
  පෙන්නලා, clamp කරපු අගයම server එකට යවනවා.

### 18. Booking History එක **පරණම booking මුලින්** පෙන්නුවා + status filter එකක් නැහැ

- **ගැටලුව:** Admin RoomManagement එකේ bookings sort වුණේ නැහැ (raw array order).
  Bookings tab එකේ තිබුණේ **rooms tab එකේ status filter** එකමයි — ඒකේ values
  (`available`, `occupied` …) booking status වලට කිසිසේත් නොගැලපෙන නිසා
  ඇත්තටම **filter එකක්ම තිබුණේ නැහැ**.
- **Fix:** Newest-first sort; bookings සඳහාම වෙනම status filter එකක්
  (Confirmed / Checked-In / Checked-Out / Cancelled); NIC/passport එකෙනුත් search
  කරන්න පුළුවන්; **"Outstanding Due" total එකක්** header එකේ පෙන්නනවා.

### 19. Room-service charges **checkout screen එකේ පෙනුණේ නැහැ**

- **ගැටලුව:** කාමරයට charge කරපු bar/restaurant bills `grandTotal` එකට එකතු
  වුණත් checkout modal එකේ පෙන්නුවේ මුළු ගණන විතරයි — guest ට "මේ මුදල මොකටද?"
  කියලා පෙන්නන්න විදියක් තිබුණේ නැහැ.
- **Fix:** Checkout summary එකේ **Room Charge**, **Room-Service Bills (n)** සහ
  එක් එක් bill number එකේ breakdown එක පෙන්නනවා.

### 20. Errors **console එකට විතරක්** ගියා — cashier ට කිසිම දෙයක් පෙනුණේ නැහැ

- **ගැටලුව:** RoomsView එකේ `handleQuickStatusChange` fail වුණාම `console.error`
  විතරයි — UI එකේ කිසිම දෙයක් සිද්ධ නොවුණු ලෙස පෙනුණා. Refresh එක fail වුණාම
  spinner එක **සදාකාලිකව කැරකෙමින්** තිබුණා (`try/finally` නැහැ).
- **Fix:** Dismissable error banner එකක්; refresh එකට `try/finally`.

### 21. Payment method validation නැහැ (bookings / payments / checkout)

- **ගැටලුව:** `paymentMethod: 'bitcoin'` වගේ අගයක් කෙළින්ම booking එකට save වුණා —
  ඒ settlement එක **කිසිම payment breakdown එකක පෙන්නුවේ නැහැ**.
- **Fix:** තුන් තැනම (`POST /room-bookings`, `/payment`, `/checkout`) whitelist
  validation එකක්. `server/db.ts` එකේ `RoomBooking.paymentMethod` type එකට
  `'split'` එකතු කරලා `src/types.ts` එකට align කළා.

### 22. Payment එකේ **floating-point rounding** නිසා නිවැරදි මුදල ප්‍රතික්ෂේප වුණා

- **ගැටලුව:** `if (payAmt > booking.balanceDue)` — පෙන්නපු balance එකම හරියටම
  ගෙව්වම floating-point noise නිසා ඉතා සුළු වශයෙන් වැඩි වෙලා **ප්‍රතික්ෂේප** වුණා.
- **Fix:** 1-cent tolerance එකක් (`+ 0.01`), ගෙවීම balance එකට clamp කරලා,
  අගය `toFixed(2)` කරනවා.

### 23. දෙවරක් cancel කිරීම

- **ගැටලුව:** දැනටමත් cancel කරපු booking එකක් නැවත cancel කරන්න පුළුවන් වුණා —
  notes එකට **තවත් "Cancel Reason" එකක්** එකතු වුණා, audit log එකට තවත් entry එකක්.
- **Fix:** `already cancelled` guard එකක්.

### 24. Booking status එකට **checked_out / cancelled** කෙළින්ම යවන්න පුළුවන් වුණා

- **ගැටලුව:** `POST /room-bookings` එකේ `status` whitelist එකේ හතරම තිබුණා —
  `checked_out` කියලා booking එකක් හදන්න පුළුවන් වුණා. ඒක **වසා දැමූ** එකක් ලෙස
  පෙන්නුවත් overlap check එකෙන් **කාමරයේ දින block කළා**.
- **Fix:** අලුත් booking එකක් `confirmed` හෝ `checked_in` පමණයි.

---

## 🔵 LOW — hardening / polish

| # | ගැටලුව | Fix |
|---|--------|-----|
| 25 | Guest phone එක truthy නම් ඕනෑම දෙයක් (`"x"`) පිළිගත්තා | අවම ඉලක්කම් 7ක් validate කරනවා (server + modal) |
| 26 | Booking modal එකේ room dropdown එකේ **`Rs.` hard-coded** | `currencySymbol` setting එක පාවිච්චි කරනවා |
| 27 | Audit logs සහ error messages වල `Rs.` hard-coded | `settings.currencySymbol` වලින් ගන්නවා |
| 28 | Overlap error message එකේ දින **UTC** වලින් පෙන්නුවා | `localDateKey()` වලින් local දින |
| 29 | Occupied කාමර dropdown එකේ **disabled** වුණා — advance reservation ගන්න බැරි වුණා | Maintenance කාමර පමණක් disable; occupied ඒවා අනාගත දිනවලට reserve කරන්න පුළුවන් |
| 30 | Legacy/restored data වල `ratePerDay`, `grandTotal`, `balanceDue`, `status`, `paymentMethod` `undefined` වුණාම `.toLocaleString()` / `.toUpperCase()` එකෙන් **මුළු page එකම crash** වුණා | `Number(x \|\| 0)` / `String(x \|\| '')` guards (RoomsView, RoomManagement, TicketModal, printEngine) |
| 31 | Admin room form එකේ duplicate room number එක server round-trip එකෙන් විතරයි හසුවුණේ | Client-side duplicate + type + capacity validation |
| 32 | Admin form එකෙන් `occupied` / `reserved` status එක save කරද්දී server sync එකට එරෙහිව ගැටුණා | Housekeeping states පමණක් යවනවා |
| 33 | `uniqueFloors` sort වුණේ නැහැ — floor filter එකේ අනුපිළිවෙළ අහඹු වුණා | `.sort()` |
| 34 | `server/db.ts` එකේ `Room.status` / `RoomBooking.status` inline unions ලෙස duplicate වුණා | `RoomStatus` / `RoomBookingStatus` types export කරලා reuse කරනවා |

---

## ✅ Verification

```
npm run typecheck          → clean
npm run build              → Vite + esbuild OK
npm test                   → 1/1 pass
node tests/e2e/e2e-rooms.mjs      → 57/57 pass   ← අලුත්
node tests/e2e/e2e-test.mjs       → 24/24 pass
node tests/e2e/e2e-round2.mjs     → 37/37 pass
node tests/e2e/e2e-fixes.mjs      → 18/18 pass
node tests/e2e/e2e-edge.mjs       → 29/29 pass
node tests/e2e/e2e-functions.mjs  → 21/21 pass
node tests/e2e/e2e-dashboard.mjs  → 16/16 pass
```

POS → room-charge integration එකත් manual ලෙස verify කළා:
room-service bill එකක් `charged_to_room` ලෙස booking එකට attach වෙලා,
checkout එකේදී `paid` (`paidAt` සමඟ) බවට පත් වෙනවා.

### අලුත් regression suite: `tests/e2e/e2e-rooms.mjs`

Room master data validation, `isActive` lifecycle, housekeeping guards, rename
sync, delete guards, booking guards (phone / capacity / back-date / 365 nights /
payment method / overlap), අලුත් check-in transition එක, in-house-only checkout,
partial payment tolerance, cancel refund reporting සහ `syncRoomStatus` හැසිරීම
යන සියල්ල cover කරනවා. හදන සියලුම rooms/bookings අවසානයේ cleanup වෙනවා — නැවත
නැවත run කරන්න ආරක්ෂිතයි.
