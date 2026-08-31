# Royal Hotel POS — අඩුපාඩු සෙවීම & නිවැරදි කිරීම් — වටය 3 (2026-08-31)

> මේ වටයේදී system එක පුරාම (server + frontend + PHP fallback + tests) bug hunt
> කළා. `tsc --noEmit` clean, production build OK, e2e suites **230/230 pass** (අඛණ්ඩව
> වට කිහිපයක්ම — flake නැහැ). පහත අඩුපාඩු හමු වී නිවැරදි කළා.

---

## 🔴 1. Room & Function bookings වල tax එක client එවන විදියටම trust කළා (සල්ලි පාඩුව)

- **ගැටලුව:** `POST /api/room-bookings` සහ `POST /api/function-bookings` දෙකම
  `const taxAmt = Math.max(0, Number(tax) || 0)` ලෙස **client එවන tax amount එක
  verbatim** ගත්තා.
  - Settings වල taxRate 10% තිබියදී cashier කෙනෙකුට `tax: 0` එවලා **tax-free**
    booking එකක් හදන්න පුළුවන් (හෝටලයට බද්ද අහිමි වෙනවා).
  - නැත්නම් `tax: 99999` එවලා guest ගේ bill එක හිතුමතේ **inflate** කරන්න
    පුළුවන් (overcharge fraud).
  - POS cart checkout එකේ තියෙන "server recomputes every money value" ප්‍රතිපත්තිය
    rooms/functions වලට apply වෙලා තිබුණේ නැහැ.
- **Fix:**
  - Rooms: `taxAmt = (totalRoomCharge × settings.taxRate) / 100` — server එකෙන්ම
    derive වෙනවා (client `tax` සම්පූර්ණයෙන් ignore). Room extra charges හිතාමතාම
    untaxed (booking UI + checkout UI දෙකේම හැටියට).
  - Functions: `taxAmt = ((hallCharge + plateCharge + extraServices) × settings.taxRate) / 100`.
  - UI modals දෙකේ (`RoomBookingModal`, `FunctionBookingModal`) tax preview එක
    `Number(....toFixed(2))` ලෙස round කළා — server එක store කරන අගයයි UI එකේ
    පෙන්වන අගයයි දැන් 100% සමානයි.
- **Verify (live server):** taxRate=10 තියලා —
  - Room booking එකකට `tax: 999999` එව්වාම → server store කළේ `tax=500`, `grandTotal=5500`
    (1 රැය × 5000, 10%) ✅
  - `tax: -50000` → `tax=500` ✅
  - Function booking එකකට `tax: 0` එව්වාම → `tax=15000`, `grandTotal=165000`
    (hall 100,000 + plates 50×1,000, 10%) ✅

## 🟠 2. Room payment වල float-noise (බිල්පතේ පෙන්වන මුදල් විකෘති වීම)

- **ගැටලුව:** `POST /api/room-bookings/:id/payment` එකේ
  `booking.advancePaid += payAmt` (round නොකර) — පාරවල් කිහිපයක් ගෙව්වාම
  `10100.300000000001` වගේ අගයන් save වෙනවා. (Function payments වල මේක කලින්ම
  `toFixed(2)` එක්ක හදලා තිබුණා — rooms අතපසු වෙලා.)
- **Fix:** `advancePaid` සහ `balanceDue` දෙකම `Number(....toFixed(2))` එක්ක
  round කරනවා (functions එකට සමානව).

## 🟠 3. Auth rate-limiter repeat-run අවුල (test/dev environments)

- **ගැටලුව:** `authLimiter` එකේ `max: 30` hardcoded — e2e suite එක **දෙවරක්
  අඛණ්ඩව** run කළාම (වැරදි password probes නිසා) `429 Too many login attempts`
  ඇවිත් suites කඩා වැටුණා. Production default එක වෙනස් කළේ නැහැ.
- **Fix:** `RATE_LIMIT_AUTH_MAX_REQUESTS` env var එකෙන් configure කරන්න පුළුවන්
  (default 30 — කලින් එකම; min 5, max 100,000, invalid අගයක් ආවොත් warn + fallback).
  `.env.example` එකේ document කළා. (General `apiLimiter` එක කලින්ම
  `RATE_LIMIT_MAX_REQUESTS` එකෙන් configurable වුණා.)

---

## සම්පූර්ණ system එකම පරීක්ෂා කළ ආකාරය (මේ වටය)

| පැත්ත | පරීක්ෂාව | ප්‍රතිඵලය |
|---|---|---|
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | ✅ clean |
| Production build | `npm run build` (vite + esbuild) | ✅ OK |
| E2E suites | 15ක්ම (230 checks) — දෙපාරක් අඛණ්ඩව | ✅ 230/230 (flakes නැහැ) |
| API GET probe | endpoints 31ක් — bad/edge params සමග | ✅ 0 server errors |
| API mutation probe | invalid payloads 38ක් (NaN, negative, huge, bogus ids) | ✅ 0 server errors |
| Backup / Restore / Import | self-restore, garbage restore, malformed import | ✅ හරි 400/200 responses |
| Daily-sales-summary (අලුත්ම feature) | bar/food split consistency (bar+food = registerTotal) | ✅ exact match |
| Multi-hotel isolation | token-bound hotels, cross-hotel 401, unknown hotel 400 | ✅ OK |
| Money trust audit | client `tax`/`rate`/`discount`/`duration` server-side එනවද | ✅ tax හැර ඔක්කොම server-derived වුණා → **දැන් taxත් හදලා** |
| Hook-order (React #310 class) | modal components 14ක් + contexts | ✅ violations නැහැ |
| Null-crash patterns | `.toLowerCase()`, `JSON.parse`, `.items.map`, `/ length` | ✅ guards තියෙනවා |
| PHP fallback (Hostinger) | `api/*.php` code review (sandbox එකේ PHP නැති නිසා lint නොකළා) | ✅ පේන ගැටලු නැහැ |

## පෙර වටවල් වලින් හමු වුණු කුඩා දේවල් (මේ වටයේදීත් විමසුවා — වෙනස් කළේ නැහැ)

- `PUT /api/settings` එක `currencySymbol: ''` accept කරනවා — frontend එක
  `settings?.currencySymbol || 'Rs.'` fallback එකක් දාන නිසා crash නෑ, ගානක්
  යන්නෙත් නෑ. හිතාමතාම නොවෙනස් කළා (හෝටලයකට symbol එක හිස් කරන්න ඕන වෙන්නත් පුළුවන්).
- Room booking date default (silent `now`/`now+1day`) — කලින්ම note කරපු design
  choice එකක්, frontend එක හැමවිටම dates දෙකම එවනවා.
