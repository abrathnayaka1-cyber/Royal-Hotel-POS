# Royal Hotel POS — Functions & Events Module A2Z Check & නිවැරදි කිරීම් (2026-09-01)

> මේ වටයේදී **Functions & Events Module එක පමණක්** (function halls + event bookings —
> wedding / birthday / meeting / party / corporate) A2Z පරීක්ෂා කරලා හමුවූ bugs, errors,
> logic faults සහ අඩුපාඩු සියල්ල නිවැරදි කළා.
>
> **Scope:** `server.ts` (`/api/function-halls`, `/api/function-bookings` + checkout /
> cancel / payment), `server/db.ts`, `src/types.ts`, `src/components/pos/FunctionsView.tsx`,
> `FunctionBookingModal.tsx`, `FunctionBookingTicketModal.tsx`, `CategorySidebar.tsx`,
> `src/components/admin/FunctionManagement.tsx`, `src/context/POSContext.tsx`,
> `src/lib/printEngine.ts`.
>
> **ප්‍රතිඵලය:** `tsc --noEmit` clean · Vite + esbuild build OK ·
> `tests/e2e/e2e-functions.mjs` **75/75 pass** (fresh DB එකක දෙපාරක් — දෙවන වතාවේත් 75/75)
> · අලුත් jsdom UI test `tests/functions-ui.test.tsx` **pass** · පරණ suites සියල්ලම green.

---

## 🔴 CRITICAL — මුදල් / දත්ත අහිමි වන bugs

### 1. Booking එකක් හැදුවම **අලුත්‍වලා තිබුණේ cancel පමණයි** — reschedule කියන එකක්ම තිබුණේ නැහැ

- **ගැටලුව:** `PUT /api/function-bookings/:id` endpoint එකක්ම නැහැ; `POSContext` එකේත්
  `updateFunctionBooking` කියා function එකක් නැහැ. Customer කෙනෙක්
  "අපි 14thට යන්න ඕන" / "දුරකථන අංකය වැරදියි" කිව්වොත් front desk ට තිබුණේ එකම විකල්පය —
  **booking එක cancel කරලා අලුතින් හදන එක**. ඒකෙන්:
  - ticket number එක (EVT-20xx) **නැති වෙනවා** — පරණ ticket එක අතේ තියෙනවා;
  - **advance** එක cancel එකෙන් refund වෙලා නැවත ගන්න වෙනවා (cash drawer එකට අනවශ්‍ය
    movement එකක්);
  - audit trail එක කැඩෙනවා (created → cancelled, "moved" කියන record එකක් නැහැ);
  - cancel කරපු booking එක **hall day එක free** කරන නිසා, මොහොතක් වැරදීමකින්
    hall එක ඒ රාත්‍රියට විකුණලා යනවා.
- **Fix:** `PUT /api/function-bookings/:id` අලුතින් හදලා **create එකේ validator එකම
  (`validateEventBookingPayload`) share කරලා** — දෙක කවදාවත් වෙන් වෙන්නේ නැහැ:
  - ticket number එක **රැඳෙනවා**; day එක යන්නෙන් notes එකේ
    `"Event rescheduled from 2027-03-05 to 2027-03-12"`;
  - **cancelled** booking එකක් edit කරලා **confirmed** ආපහු ගන්න පුළුවන් (day එක හිස්නම්);
  - `advancePaid` edit එකකදී **LOCKED** — දැනටමත් ලැබුණු මුදල් re-type කරන්න බැහැ;
    අලුත් grand total එක advance එකට වඩා අඩු නම් **400** (silent clamp නැහැ);
  - target day එක වෙනත් event එකකින් occupy වෙලා නම් **400**, edit වෙන booking එකම
    conflict විදිහට ගණන් ගන්නේ නැහැ (`excludeBookingId`);
  - `updatedAt` + `UPDATE_FUNCTION_BOOKING` audit entry එක (changed fields list).
  - POS board එකේ **Edit / Reschedule** button එක (modal එකම reuse කරනවා); admin
    cancel dialog එකෙන් කියනවා *"To move an event to another date, use Reschedule at
    the POS — it keeps the ticket number and the advance"* — admin panel එකෙන්
    edit කිරීමක් නැහැ (rooms module එකේ pattern එකම).

### 2. එකම hall එක **එකම දිනට දෙවතාවක්** විකුණන්න පුළුවන් වුණා

- **ගැටලුව:** double-booking check එක `b.status !== 'confirmed'` නිසා **skip** කළා.
  Event එකක් කලින්ම complete කළාම (හෝ checkout කර ඉවර කළාම) hall-day pair එක නැවත **හිස්** — ඒ රාත්‍රියටම තව couple එකකට sell කරලා **paid tickets දෙකක්**.
  Checkout එකේදීත් `completed` bookings conflict list එකෙන් අයින් වෙනවා.
- **Fix:** `confirmed` **+ `completed** යන දෙකම day එක hold කරනවා (cancel පමණක් free
  කරනවා) — server conflict check එකේම ඒක reason එකත් එක්ක comment කරලා තියෙනවා.
  UI එකේ live clash warning එක + submit gate එකත් එකම rules.

### 3. **Hall capacity එකක්ම check කරලා නැහැ**

- **ගැටලුව (probe එකෙන්):** `expectedGuests: 99999` → **350 seats** Grand Ballroom එකට
  accept වුණා (old code: `Math.max(1, Math.min(100000, ...))` — absolute cap විතරයි).
  ඒ නිසා fire-safety / catering plates ගණන / hall layout කිසිම එකක් සැබෑ දත්ත
  එක්ක ගැලපුණේ නැහැ — event day එකේදී තමා පේන්නේ.
- **Fix:** `guests > hall.capacity` නම් **400**:
  `"Grand Ballroom" holds a maximum of 350 guests — the event expects 400. Pick a
  bigger hall or reduce the guest count.` POS modal එකේ live amber warning +
  "cap to capacity" quick action + submit block. Admin hall form එකේ capacity
  master-data ceiling (1 – 10,000)ත් validate කරනවා.

### 4. වැරදි වර්ෂයක් → **hall එක සදාකාලිකව block** වෙනවා

- **ගැටලුව:** ahead-date limit එකක් තිබුණේ නැහැ. `eventDate: "2038-05-14"` accept වුණා —
  ඒ day එකේදී hall එක **කවදාවත්** නැවත book කරන්න බැරි (item 2 නිසා conflict check එක
  ඒක hold කරනවා), reports/dashboard වල 12-years-ahead phantom revenue එකක්.
  `2026-02-31` වගේ නොමැති දවසක් `new Date('2026-02-31T00:00:00')` හරහා
  **2026-03-03** විදිහට silently roll වුණා.
- **Fix:** `eventDayKeyFromInput()` — calendar day විදිහටම parse කරනවා (UTC round-trip
  නැතුව), real day එකක් කියලා check කරනවා, **අතීතය නොවේ**, **උපරිම දින 730**
  (`EVENT_MAX_LEAD_DAYS`). Modal එකේ `min`/`max` attributes + inline error.
  (Back-dated block එක පැරණි code එකේත් තිබුණා — ඒත් server එකයි modal එකේ `min`
  attribute එකයි `new Date().toISOString().split('T')[0]` පාවිච්චි කළ නිසා
  **00:00 – 05:30** අතරේදී "today" කියලා ආවේ **ඊයේ** → ඊයේ සිදුවෙච්ච event එකක්
  "future" කියලා accept වුණා; දැන් හැම තැනම `localDateKey()`.)

### 5. Money fields **කිසිම ceiling එකකින් නොමැතිව** client එකෙන්ම save වුණා

- **ගැටලුව (probe එකෙන්):**
  - `perPlateRate: 1e9`, `numberOfPlates: 1e9` → **grandTotal 100000000060000**
    (plates 100k ට clamp වුණත් rate එකට limit එකක් නැහැ) — ticket එකේ, audit log එකේ,
    admin "Booked Revenue" එකේ ඒ බෝරු අංකයම;
  - `extraServices: 1e15` → accept;
  - checkout `additionalCharges: 1e12` → **silently `Math.min(…, 10000000)`** —
    Rs. 12k bar bill එකක් වගේ නම් **Rs. 10,000,000** විදිහට over-inflate වෙනවා;
    non-numeric / negative නම් **0** (bill එකම අතුරුදහන්, "completed" message එක
    විතරක් සාර්ථකයි);
  - `advancePaid: -50000` → `Math.max(0, …)` එකෙන් **0** — customer කෙනෙක් 50k
    දුන්නා කියලා සටහනක් නැතුව booking එක "advance 0" විදිහට save වෙනවා.
  - (tax / discount policy clamps — `clampBookingDiscount()` + settings tax —
    **දැනටමත් හරියටම තිබුණා**, rooms module එකට shared; ඒවාට අතින් දාලා නැහැ.)
- **Fix:** server එකේ **shared caps** (`EVENT_LINE_CAP` 10M hall/extra/additional,
  `EVENT_PLATE_RATE_CAP` 1M per plate, `EVENT_MAX_PLATES` 100k,
  `EVENT_GRAND_TOTAL_CAP` 50M) + **negative/NaN → 400** (silently 0 හෝ clamp නැහැ).
  POS form එකේ input limits + live total එක, admin-only special quote supportත් එක්ක.

### 6. Cancel කළාම **balanceDue විවෘතවම**, advance එක **refund වෙන්න ඕන** කියලා කොහේම නැහැ

- **ගැටලුව:** `/:id/cancel` එකෙන් කළේ `status = 'cancelled'` + notes එකට reason එක විතරයි.
  `balanceDue` (උදා: Rs. 40,500) **ගෙවීමට තියෙනවා** විදිහටම report වුණා — hall stats
  (open balance), admin outstanding, "unpaid" figures සියල්ල වැරදියි.
  **Advance එක refund කරන්න ඕන** කියන එක UI එකෙන් පෙන්නුවේ නැහැ — cash drawer එකෙන්
  පිටට යන මුදල ගැන කාටවත් අවවාදයක් නැහැ.
  **Cancel කරපු booking එකක් නැවත cancel** කරන්නත් පුළුවන් වුණා — notes එකට
  `"| Cancel Reason: …"` දෙවටියක් එකතු වෙලා, audit log එකත් duplicate වුණා
  (double refund බාරගන්න සිද්ධියක් එතකොට සඟිනවා).
- **Fix:** cancel එකේදී `balanceDue = 0`, response එකෙන් **`refundDue = advancePaid`**,
  notes එකේ `"Advance of Rs. X received before cancellation is refundable to the customer."`,
  **double-cancel 400**, `completed` event එකක් cancel කිරීමත් **400** (already settled —
  cancel කරලා නැවත bill කරන්න බැහැ), POS එකේ alert එකෙන්
  "… Rs. X of advance is refundable", admin cancel dialog එකේ **Advance received /
  Balance written off** breakdown එක + "hand the money back (or record the forfeiture)
  yourself" warning එක, සහ **"use Reschedule at the POS instead"** hint එක.
  Payment/checkout guards: `completed`/`cancelled` bookings වලට payment **400**
  (පරණ code එකේ තිබුණා — රකිනවා), **cancel කළ booking එකකට checkout 400** (අලුත්).

### 7. Hall එකක් **delete** කළාම future event එකක් **අනාථ** වෙනවා

- **ගැටලුව:** DELETE guard එක:
  `b.status === 'confirmed' && new Date(b.eventDate).getTime() >= Date.now() - 86400000`
  — **අදට + හෙට පමණයි** block කරලා තිබුණේ. **මාස තුනකට ඉදිරියෙන් Rs. 100,000 advance
  එකක් ගත්ත wedding එකක්** තිබුණත් hall එක delete කළාම booking එකට hall එකක් නැහැ —
  board එකේ name එක හිස්, ticket/print/reports බිඳ වැටෙනවා, outstanding balance එක
  නිවැරදිව close කරන්න බැහැ.
- **Fix:** **cancel නොකළ ඕනෑම booking එකක්** (confirmed/completed) තිබුණොත් delete **400** —
  message එකේ ticket number එකත්:
  `Cannot delete "Grand Ballroom" — it has 3 event booking(s) on file (next up: EVT-2004).
  Cancel them or retire the hall instead.` ඒ වෙනුවට **Retire** (`isActive: false`):
  history එක රැකගෙන POS board එකෙන් සඟවෙනවා; retired hall එකකට අලුත් booking **400**
  (`"X" is retired — reactivate it before taking new events.`).

### 8. Booking list endpoint එක **crash** වුණා + **store කරපු array එකම mutate** කළා

- **ගැටලුව:** `GET /api/function-bookings?search=` එක
  `b.customerName.toLowerCase()` (phone/hallName/eventType ද එකට) — legacy row එකක
  field එකක් null නම් **500**, මුළු Functions tab එකම හිස්.
  ඊට අමතරව `bookings.sort(...)` කියලා **`db.raw.functionBookings` array එකම** in-place
  sort කළා — `unshift()` order එක (අලුත්ම එක මුලින්) ඒ නිසා යාවත්කාලීන වීම් වලදී
  එළියට එන අනුපිළිවෙල අහඹු වෙනවා.
- **Fix:** `[...bookings].sort(...)` + හැම filter එකකම `String(x || '').toLowerCase()`
  guards; search එක දැන් **ticket number, name, phone, hall, event type, day** යන සියල්ලෙන්ම
  match වෙනවා; `status` whitelist + `hallId`/`from`/`to` day-key filters.

---

## 🟠 HIGH — payment / master data correctness

### 9. `paymentMethod` කොහෙත්ම validate කරලා නැහැ

- **ගැටලුව:** `paymentMethod: "paypal"` යව්වොත් ඒකම save වුණා (POST booking,
  `/:id/payment`, checkout — තුනම). `FunctionBooking['paymentMethod']` type එක
  4-value union එකක් නිසා ඒ data එක **විශ්වාස කරන්න බැරි** වුණා:
  - ticket එකේ "PAYMENT METHOD: paypal" කියලා customer ට දෙනවා (system එකේ
    ඒ method එකක් නැහැ),
  - board එකේ settle modal එක `booking.paymentMethod` එකෙන් select එක prefill
    කරනවා — option එකක් නැති නිසා **select එක 'cash' පෙන්වනවා, record එක 'paypal'** —
    cashier කෙනෙක් "හරි" දාලා save කළාම **වැරදි method එකකින්** payment එක ලියවෙනවා,
  - method අනුව grouping කරන ඕනෑම report/export එකක ඒ advance එක වර්ගීකරණය නැති වෙනවා.
- **Fix:** `normalizeEventPaymentMethod()` — **4-value whitelist**
  (`cash | card | bank_transfer | other`), unknown → `other`; checkout එකේදී
  booking එකේ තිබුණු method එක fallback; `FunctionPaymentMethod` type එක
  `src/types.ts`/`server/db.ts` වල export කරලා reuse කරනවා.

### 10. Bank transfer **reference එක** payment record එකකින් අතුරුදහන් වුණා

- **ගැටලුව:** POST booking එකේදී `paymentDetails` object එක store කරපුත්,
  `POST /:id/payment` + checkout එකේදී ඒක **සම්පූර්ණයෙන් ignore කළා** — Rs. 500,000ක්
  bank transfer එකකින් ගත්තා කියලා **කිසිම slip/reference සාක්ෂියක්** booking එකේ
  නැහැ (note එකේ `"Payment: 500000 (bank_transfer) - ..."` විතරයි).
- **Fix:** `paymentDetails` (reference/bank) **payload එකෙන් sanitize කරලා persist**
  (booking + edit + payment), payment note එක
  `"Payment: 200000 (bank_transfer) ref BOCS-1122 - …"`, checkout note එක
  `"Settled with Rs. 25,500 (cash). …"`.

### 11. Hall master data: **bad input → 200 OK with nothing saved**

- **ගැටලුව (old `PUT /api/function-halls/:id`):**
  - `ratePerDay: -5` / `"abc"` / `1e9` → `if (!isNaN(rate) && rate > 0 …)` එකෙන්
    **silently ignore**, response **200** — admin form එක "saved" කියලා පෙන්වා
    **පරණ rate එකම** ඉස්සරහට bookings වලට ආවා;
  - `capacity: 0` → `Math.max(1, Math.min(10000, Number(capacity) || 100))` →
    PUT එකේදී **1**, POST එකේදී **100** — hall එකක seats 100ක් කියලා system එක
    හිතනවා, master data එකේ 0 කියලා පේනවා;
  - `hallName: "Grand Ballroom"` → `hallName` change වෙන්නේ **lowercase compare එකෙන්
    වෙනස් නම් විතරයි** — "grand ballroom" → "Grand Ballroom" වගේ **capitalisation
    fix එකක් කිසිම විදිහට save වුණේ නැහැ** (200 OK);
  - `status: "closed"` → validate නැතුව ignore; `amenities` trim නොකරන නිසා
    `["", "  "]` → **blank chips**;
  - `hallName.trim()` → hall row එකක name එකක් නැත්නම් **500**.
- **Fix:** POST/PUT දෙකම **දැන් clear 400s** එවනවා — name (2–128, dup check
  case-insensitive, **rename always applied**), type, capacity **1 – 10,000**,
  rate **1 – 10M**, amenities trim + drop blanks + max 20, `status` whitelist
  ("Hall status must be \"available\" or \"maintenance\"."), notes/floor caps,
  legacy-safe `String(...)`. Admin form එකෙත් same checks **submit එකට කලින්**
  (typingදී input එක clamp කරන්නේ නැහැ — "0" type කරලා save කළොත්
  "Hall capacity must be between 1 and 10,000 guests." inline error එක පේනවා).

### 12. Hall list එකේ **derived data එකක් නැහැ** — POS එකට " මේ hall එක block කරලා තියෙනවද" දකින්න බැහැ

- **ගැටලුව:** `GET /api/function-halls` raw rows විතරයි එව්වේ. Hall cards වල
  upcoming count / ඊළඟ event එක / outstanding balance කිසිවක් නැහැ; retired
  (isActive false) halls **bookable** විදිහටම පේනවා; "available" filter එකෙන්
  `status` පමණයි (maintenance විතරක්) බැලූවේ.
- **Fix:** hall payload එකට **`upcomingCount`, `nextEventDate`, `openBalance`**
  derive කරලා එවනවා (local day keys, `confirmed` bookings විතරක්) — POS board එකටත්
  admin grid එකටත් bookings list එක වෙන වැමැරින් draw නොකර ඒක පුළුවන්.
  Hall card එකේ "N open • next … • outstanding …", maintenance/retired badges;
  **board එකෙන් retired සඟවෙනවා** (admin list එකේ **Retired** tab එකෙන් පේනවා +
  Reactivate quick action).

### 13. `POSContext` — booking mutation එකකින් **hall cards stale**

- **ගැටලුව:** `createFunctionBooking` / `updateFunctionBooking` /
  `completeFunctionBooking` / `cancelFunctionBooking` / `addFunctionPayment`
  යන කිහිපයම `refreshFunctionBookings()` විතරයි call කළේ — hall list
  reload කරලා නැහැ. ඒ නිසා event එකක් close/cancel කළාට පස්සේ hall card එකේ
  counts එකත් outstanding එකත් **refresh කරනකම් පරණ අගයන්ම**.
- **Fix:** හැම booking mutation එකකම
  `await Promise.all([refreshFunctionBookings(), refreshFunctionHalls()])`
  (hall CRUD ops ද `refreshFunctionHalls()` call කරනවා), edit කරද්දී තියෙන
  ticket modal එකත් updated booking එකට sync වෙනවා.

### 14. Complete Event එක **භාවිතා කරන්නම බැරි** තත්ත්වයක් — extra charges දාද්දී

- **ගැටලුව:** `function-settle-amount-input` එක prefill වුණේ **පරණ `balanceDue`** එකට;
  "Additional Charges" type කරද්දී amount එක update වුණේ නැහැ ("Full" button එකත්
  `settleBooking.balanceDue` විතරයි). Server එක expected
  `balanceDue + additionalCharges` නිසා **submit = 400 "Final payment cannot be less
  than balance due"** — bar bill / decor extra එකක් එක්ක event එකක් close කරන්න
  බැරිවුණා. Cashier කරපු දේ: extra charges 0 විදිහට leave කරලා close කරන එක —
  **අදායම system එකේ register නොකර** (දෙවන වරට settle කරන්න බැරි නිසා loss එක සදහටම).
- **Fix:** `effectiveBalance = balanceDue + additionalCharges` — modal open වෙද්දී
  prefilled, additional වෙනස් කරද්දී amount යාවත්කාලීන, `full` limit
  `min(cap, effectiveBalance)`, button label **"Complete Event • Collect Rs. X"**,
  gate එක `settleEffectiveBalance`. jsdom UI test එකෙන්ම lock කරනවා
  (5,000 දානවා → 25,500 විදිහට update වෙනවා → event `completed`,
  `grandTotal` +5,000, `balanceDue` 0).

---

## 🟡 MEDIUM — UI / UX අඩුපාඩු (module එක half-built තිබුණු තැන්)

| # | ගැටලුව | Fix |
|---|--------|-----|
| 15 | POS board එකේ **search box එකක්ම render කරලා නැහැ** — `searchQuery` state එකයි filter logic එකයි තිබුණා, input එක නැහැ (dead feature) | Real input (`functions-search-input`) + hall/customer/ticket/day/phone/hall-type match, "No hall matches that search" empty state, hall cards filtered live |
| 16 | Board එකේ tabs **Upcoming / Completed / Cancelled / All** විතරයි — **අද event** මොනවද, **ඉවර නොකළ (overdue)** event මොනවද කියලා වෙන් කරන්න බැරි; hall card එකේ upcoming list එක දින 2කින් cut ("…") | `BookingFilter` tabs: Today / Upcoming / **Needs Closing** (event day එක පැන්නාම open — badge count එකක් එක්ක) / Completed / Cancelled / All, date-first sort, hall card එකේ සම්පූර්ණ open list + `nextEventDate` |
| 17 | `settleBooking.grandTotal.toLocaleString()` / `balanceDue.toLocaleString()` — legacy rows වල field එකක් null නම් **මුළු page එකම crash** (ErrorBoundary) | `Number(x \|\| 0)` / `String(x \|\| '')` guards (board, admin list, ticket modal, print engine) |
| 18 | Board එකේ hall card **"Book this hall"** button එක maintenance/retired halls වලත් enabled — click කරද්දී server 400 එක raw පෙන්වවා (modal dropdown එකෙන් පමණක් disable වුණා) | card button එකම disabled + "Under maintenance"/"Retired" label එක + `title` tooltip; modal එකේ hall select එකත් `isActive`/maintenance guard එකෙන් |
| 19 | CategorySidebar එකේ FUNCTIONS badge එකේ ගණන කුමක්ද කියලා **කිසිම පැහැදිලි කිරීමක් නැහැ** (tooltip එකක් නැහැ, stable test hook එකක් නැහැ), retired hall එකක අනාථ open event එකක් ඉතුරු වුණොත් ඒකත් "bookable work" විදිහට ගණන් ගන්නවා | `openFunctionCount` (= open/confirmed events) + `title="N open event booking(s) — close or cancel them"` + `id="cat-sidebar-functions-badge"`; hall delete guard එක නිසා (item 7) අනාථ open events නැති වෙනවා |
| 20 | Ticket/print: **"Hall opens 8:00 AM – 12:00 AM" fixed** (day/evening/full_day වලට policy වෙනස්), hall usage rule එක print එකේ නැහැ, දිනය **UTC** | `functionSessionHours(session)` — ticket preview එකේත් thermal print එකේත් **"Hall opens / Event / Hand-over"** + "One event per hall per day • Balance due before the event starts" (print = preview exactly), local day key, phone "Not provided" fallback, currency from settings |
| 21 | Booking modal එකේ වැරදි **submit කරනකම් පෙන්නුවේ නැහැ** — phone digits, hall capacity ඉක්මවා ගිය guests, day clash, 730-day ceiling, over-advance (server 400 එකම පමණයි, toast එකෙන්). Bank transfer **reference** එක type කරන්න field එකක්ම නැහැ (server එක `paymentDetails` store කළත් UI එක කිසිවක් යවුවේ නැහැ) | හැම field එකකම live validation + red ring + hint + error summary; server messages field එකට map වෙනවා; **clash pre-check** (loaded bookings එකෙන්, edit කරන booking එක skip කරලා); `paymentDetails` (reference + bank) fields; edit mode එකේ advance එක read-only ("Advance is locked — refund it via Cancel and re-book"); Super Admin special-rate එකට "click to restore" hint |
| 22 | Event date field එක **හිස්ව** open වුණා (`''`), `max` attribute එකක් තිබුණේ නැහැ — වර්ෂයක් වැරදිව type කරලා 2038 දාන්න පුළුවන්; hall rate එක/ capacity එක form එකේ කොහේවත් summary එකක් විදිහට නැහැ | default = **today + 14 days**, `min = local today`, `max = today + 730`, hall summary strip එකේ "rate per booking • capacity • max guests" (advance/hall charge prefill එක පැරණි code එකේත් තිබුණා — `ratePerDay` වලින් ✓ රකිනවා) |
| 23 | Cancel කරද්දී **refund** එක ගැන UI එක කිසිම දෙයක් පෙන්නුවේ නැහැ | board alert එක + admin dialog breakdown එක (item 6) |
| 24 | Admin: **stats bar එකක් නැහැ** — event මුදල් කොපමණක් **uncollected** ද (Outstanding Balance), halls කීයක් active/retired ද කියලා දකින්න බැරි; hall cards වල **Edit / Delete** විතරයි (`isActive` payload එකටම යවන්නේ නැහැ — UI එකෙන් retire කිරීම **අසম්භවයි**, ඒ නිසා option එක තිබුණේ destructive Delete එක විතරයි) | Stats bar (Halls active/total, Open Events, **Outstanding Balance**, Booked Revenue), Retire/Reactivate + Maintenance quick actions, `isActive` checkbox එක form එකේ, delete/retire guard messaging |
| 25 | Admin booking list එකේ **status filter එකක් නැහැ** (search box එක තිබුණා), overdue/over-capacity flags නැහැ, `booking.balanceDue.toLocaleString()` වගේ unguarded calls නිසා legacy rows වලදී **මුළු admin page එකම crash**, event row එකක hall master data වෙනස් වුණා කියලා පෙනෙන්නේ නැහැ | `bookingStatusFilter` (all/confirmed/**overdue**/completed/cancelled) + "Needs Closing" count, "⚠ over capacity" / "⚠ event day passed" / "(retired hall)" flags, `Number(x \|\| 0)` guards, per-row Ticket/Cancel, cancel dialog breakdown (item 6) |

### 🔵 LOW — hardening / polish

| # | ගැටලුව | Fix |
|---|--------|-----|
| 26 | `customerPhone: "abc"` accept වුණා (truthy check එකක් විතරයි) — customer අවුටර්, ticket එකේ බෝරු number එකක් | server + modal: **≥ 7 digits** (digits විතරයි ගණන් ගන්නේ), `maxLength 32`, hint "At least 7 digits are required." |
| 27 | `customerName: "A"` (1 char) accept; notes infinite growth (හැම payment/cancel එකකම append) | name min 2 chars (cap 128), `appendEventBookingNotes()` — **cap 2000** |
| 28 | Audit logs + checkout/cancel error messages වල **`Rs.` hard-coded** | `db.raw.settings.currencySymbol` (`cur`) හැම තැනම |
| 29 | `FunctionBooking` type එකේ `paymentDetails`/`updatedAt` නැහැ; `paymentMethod` inline union duplicate; hall derived fields නැහැ | `server/db.ts` + `src/types.ts`: `FunctionPaymentMethod` export, `paymentDetails?`, `updatedAt?`, `upcomingCount?`/`nextEventDate?`/`openBalance?` |
| 30 | Legacy data වල `hallName`/`expectedGuests` undefined විදිහට UI calls crash | defensive reads; `FunctionBooking.eventType/session` unions type-safe |
| 31 | POS form එකේ session/type choices `string` ගණනක්; capacity max 2000 hard-coded (hall 10,000 වුණාම reject වෙනවා) | `EVENT_MAX_HALL_CAPACITY` shared constant; select options from the type unions |
| 32 | `printEngine` event ticket එකේ `eventDayKey` declare කරන්නේ **පස්සෙන්** (TS2448 use-before-declare) | declaration order එක හදලා `tsc` clean |

---

## ⚠️ දැනට තියෙන සීමාවන් (bug නෙවෙයි — scope decisions / ඊළඟ වටයට)

1. **Event එකකට bar / food bill එකක් charge කරන්න බැහැ** — `room_charge` module එක
   `bookingId` (room booking) මත trigger වෙනවා; `event_charge` type එකක් නැහැ. දැන්
   extra charges දාන්නේ **checkout modal එකේ "Additional Charges"** field එකෙන්
   (`extraServices` line එකට එකතු වෙනවා).
2. **Event plates සඳහා stock/kitchen reservation එකක් නැහැ** — `numberOfPlates` ගණන
   inventory එකෙන් reserve වෙන්නේ නැහැ (KOT එකක් came වෙනකම් shortage එකක් පෙනෙන්නේ
   නැහැ).
3. **Event payments register `paymentBreakdown` එකේ නැහැ** — cash drawer close කරද්දී
   event advance/payment එක "Cash Sales" විතරයි (rooms advance එකත් එහෙමමයි — parity).
4. **Per-event payment ledger එකක් නැහැ** (payments array එකක්) — advance + partials
   notes එකේත් audit log එකේත් විතරයි. Rooms module එකේ precedent එකත් එකම රටාව
   (advance + notes).
5. Hall **rate එක වෙනස් කළාම booked event එකේ price snapshot එක යළි derive වෙන්නේ නැහැ**
   (සැකසුම් = signed quote එකක්) — admin audit entry එකේ "N upcoming event(s) keep their
   booked rates" කියලා ලියනවා, POS form එකේත් ඒක පෙනෙනවා.
6. **One event per hall per day** rule එක session-based capacity split එකක් නැහැ
   (day + evening දාලා hall එකක් rent කරන්න බැහැ) — ticket එකේත් modal එකේත්
   hall banner එකේත් ඒක business rule එකක් විදිහට පැහැදිලිවම ලියලා තියෙනවා.
7. Daily summary / admin stats වල **booked revenue unpaid ඇතුළත්**; cash-based අගයන්
   ඕන නම් Outstanding Balance එක අඩු කරන්න.
8. `functionBookingPrefix` (ticket numbering) **settings UI එකෙන් edit කරන්න බැහැ** —
   default `EVT`, sequence 2001 ට ඉහළින්.
9. Retired hall එකක **open bookings** list එකේ ඉතිරි වෙනවා (board එකෙන් පමණක් සඟවෙනවා) —
   cancel හෝ re-book කරලා වැහිය යුතුයි.

---

## ✅ Verification

```
npx tsc --noEmit                         → clean
npm run build                            → Vite + esbuild OK (exit 0)
npx vitest run                           → 2/2 pass  (import-crash + functions-ui)
node tests/e2e/e2e-functions.mjs         → 75/75 pass   ← fresh DB, දෙපාරක්ම 75/75
node tests/e2e/e2e-rooms.mjs             → 57/57 pass
node tests/e2e/e2e-dashboard.mjs         → 16/16 pass
node tests/e2e/e2e-round2.mjs            → 37/37 pass
node tests/e2e/e2e-edge.mjs              → 29/29 pass
node tests/e2e/e2e-fixes.mjs             → 18/18 pass
node tests/e2e/e2e-kitchen.mjs           → 21/21 pass
node tests/e2e/e2e-kitchen-sale.mjs      → 12/12 pass
node tests/e2e/e2e-recipe-impact.mjs     → 21/21 pass
node tests/e2e/e2e-recipe-snapshot.mjs   → 10/10 pass
node tests/e2e/e2e-barcode-bar-only.mjs  → 11/11 pass
node tests/e2e/e2e-shots.mjs             → 26/26 pass
node tests/e2e/e2e-test.mjs              → 24/24 pass
```

### අලුත් API regression suite — `tests/e2e/e2e-functions.mjs` (75 checks)

Hall master data (name/type/floor/capacity/rate/amenities/status/dup/rename case,
retire vs delete, delete guards, RBAC: hall CRUD = Super Admin only), booking
guards (name, phone ≥ 7 digits, past date, impossible date, 730-day ceiling,
guests vs hall capacity, line caps, grand-total ceiling, discount policy, tax
from settings, payment-method whitelist, `paymentDetails` persistence),
availability (hall held for the day by **confirmed + completed** bookings,
edit excludes itself, retired halls refuse bookings), **edit/reschedule**
(ticket number stays, price + advance snapshot kept, `updatedAt` note
"Event rescheduled from X to Y", re-confirm a cancelled booking, occupied days
rejected, cashier cannot re-price (403) while Super Admin can), checkout
(double-checkout / pay-on-completed / pay-on-cancelled blocked, `1e12`
additional → 400 instead of a silent cap), cancel (balance zeroed, `refundDue`
returned, re-cancel blocked, refund note).

හැම run එකකම **unique day slice** (`DAY_BASE = 100 + Date.now() % 400`),
throwaway halls (seeded hall කිසිවක් delete කරන්නේ නැහැ), inline cashier user
(create → use → delete) — ඒ නිසා **නැවත නැවත run කරන්න ආරක්ෂිතයි**; local-day
keys පාවිච්චි කරන නිසා 00:00–05:30 window එකේදීත් pass වෙනවා.

> මේ suite එක run කරද්දී **මගේ rewrite එකේම bug එකක්** හමුවිය: validator එක
> *නොඑවූ* `advancePaid` එකට "Advance paid must be 0 or more." කියලා 400 එව්වා
> (field එක optional කියලා UI එක assume කරනවා). absent/null/`''` → 0, present
> value විතරක් validate, over-advance → 400 (Math.min clamp එක ඉවත්) — fix කරලා
> නැවත run කරලා 75/75.

### jsdom UI test — `tests/functions-ui.test.tsx` (අලුත්)

සැබෑ `<App />` render කරලා POS board එකෙන්ම: search input එක filter වෙනවා,
over-capacity guests + invalid phone + **occupied date** submit block (live
warnings), form total එක server total එකට සමාන, booking එකක් හදලා ticket
number/session hours/usage policy, hall charge = hall rate, auto-proposed
advance, sidebar open badge එක +1, **Complete Event + additional charges**
settle maths, admin hall form capacity validation ("0" → inline error),
retire hall (board එකෙන් සඟවා, admin list එකේ ඉතිරි), App crash/console
errors නැද්ද කියන assertion.

```
# Run කරන ආකාරය (dev server එකක් :3000 වලින් ඕන)
POS_DATA_DIR=/tmp/postest RATE_LIMIT_MAX_REQUESTS=100000 RATE_LIMIT_AUTH_MAX_REQUESTS=100000 npx tsx server.ts
npx vitest run tests/functions-ui.test.tsx
node tests/e2e/e2e-functions.mjs
```

---

## 📌 Front desk — මේ වෙනස්කම් දැන් පෙනෙන ආකාරය

- Hall card එකේ **"3 open • next 2027-03-03 • Outstanding Rs. 1,000"**, maintenance/
  retired halls disabled + හේතුව label එකෙන්.
- Tabs: **Today / Upcoming / Needs Closing (overdue badge) / Completed / Cancelled**.
- Booking form එක hall rate එකෙන්ම open වෙනවා (advance එකත් default = hall rate),
  live capacity/clash/date/discount guards, Super Admin ට විතරක් special hall charge.
- Ticket/print එකේ **session hours** + "One event per hall per day • Balance due
  before the event starts".
- **Edit / Reschedule** — ticket number එකයි advance එකයි රැඳෙනවා; cancel කළාම
  **refund amount** එක UI එකෙන්ම.
- Admin → Functions: Outstanding Balance, booked revenue, overdue flags, per-row
  ticket/cancel, retire/reactivate/maintenance.
