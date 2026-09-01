# Royal Hotel POS — Dashboard Module A2Z Check & නිවැරදි කිරීම් (2026-09-01)

> මේ වටයේදී **Super Admin Dashboard Module එක පමණක්** (server `/api/dashboard/stats`,
> `/api/ai/health-check`, සහ `AdminDashboard.tsx`) A2Z පරීක්ෂා කරලා හමුවූ අඩුපාඩු
> සියල්ල නිවැරදි කළා. `tsc --noEmit` clean, Vite + esbuild production build OK,
> අලුත් `tests/e2e/e2e-dashboard.mjs` regression suite එක **16/16 pass**.

---

## 🔴 1. "Recent POS Transactions" එකේ පෙන්වූයේ පරණම බිල්පත් (data bug)

- **ගැටලුව:** `db.raw.bills` තියෙන්නේ **insertion order** එකේ. `GET /api/dashboard/stats`
  එකේ `recentBills: allPaidBills.slice(0, 10)` වුණාම **db එකේ මුලින්ම දාපු (පරණම) 10 බිල්පත්**
  තමයි ආවේ — UI එක "**Latest** completed bills" ලෙස label කළත් ඇත්තටම පෙන්නුවේ
  **පරණම** ගනුදෙනු. ("Recent POS Transactions" heading එක මුලාදැරීමක්.)
- **Fix:** `recentBills` දැන් `paidAt || createdAt` එකෙන් **newest-first** sort වෙලා
  latest 10 ගන්නවා.

## 🟠 2. Payment breakdown chart එක `split`/`room_charge` drop කළා + chart එකම render නොවුණා

- **ගැටලුව:**
  - Server එක `todayPaymentBreakdown` එකට `cash/card/bank_transfer/other` විතරයි
    initialize කළේ. `split` / `room_charge` බිල්පත්වල මුදල් **"other" ට හොරෙන් වැටුණා**
    නැත්නම් frontend එකේ බලන්නේ නැති නිසා සම්පූර්ණයෙන්ම **drop** වුණා.
  - `AdminDashboard.tsx` එකේ `paymentData` compute වුණත් **කොහෙවත් render වුණේ නැහැ** —
    `PieChart/Pie/Cell/ResponsiveContainer` imports වෙලා තිබුණත් කිසිම චාර්ට් එකක් නොතිබුණා
    (dead code / අඩුවෙලා ගිය feature).
- **Fix:**
  - Server breakdown එකට `split`, `room_charge` කියන අගයන් දෙක pre-seed කළා.
  - Frontend එකේ **"Today's Payment Methods" donut chart එක + legend එක** restore කළා
    (dynamic — ඕනෑම payment method එකක් auto-detect වෙනවා).
  - `Number()` + null-guards දාලා legacy/NaN data වලින් chart එක broken නොවන විදියට හැදුවා.

## 🟠 3. AI Health Check "Your health" card එක KPIs ට පටහැනි (stale report)

- **ගැටලුව:** `GET /api/ai/health-check` එක server **start-up** වෙද්දී හැදුණ
  "boot" report එක (`0 bill(s) today`) return කළේ. ඊට පස්සේ විකුණුම් වුණාම ද KPI එක
  "5 Bills" පෙන්නුවත් health card එක "0 bill(s) today" කියලා රැඳුණු **stale** අගයක්
  පෙන්නුවා (Super Admin ට අවුල්).
- **Fix:**
  - Rule-based mode (GEMINI_API_KEY නැති විට) GET එක දැන් **සෑම වතාවකම live snapshot
    එකෙන් නැවත compute** කරනවා (deterministic, cheap) — ඒ නිසා health card එක කවදාවත්
    KPIs වලට පටහැනි වෙන්නේ නැහැ.
  - Gemini configured නම් තාමත් latest AI-generated report එක back-end එකෙන්ම return
    කරනවා (API එක නිතර call නොකර).
  - Health report එක 30s auto-refresh interval එකටත් එකතු කළා.

## 🟡 4. Health report summary එකේ "Rs." hard-coded

- **ගැටලුව:** `buildRuleBasedReport` healthy summary එකේ `(Rs. X)` hard-coded — settings
  එකේ `currencySymbol` එක වෙනස් කරලා තිබුණත් report එක "Rs." පෙන්නුවා.
- **Fix:** `settings.currencySymbol || 'Rs.'` ලෙස ගන්නවා.

## 🟡 5. Health snapshot "today" UTC එකේ ගණන් ගත්තා

- **ගැටලුව:** `collectHealthSnapshot` එකේ `today = new Date().toISOString().split('T')[0]`
  (UTC) — dashboard `/stats` එක local-day ගන්නවා. UTC+05:30 හෝටලයක මධ්‍යම රාත්‍රියට
  පස්සේ විකුණුම් **පෙර දවසේ** ලෙස ගැනෙනවා (දෙපැත්ත අතර විෂමතාවක්).
- **Fix:** Health snapshot එකත් local start-of-day එකට align කළා.

## 🟡 6. Legacy/restored data වලින් blank/crash

- **ගැටලුව:** `AdminDashboard.tsx` රෙකෝඩ් ටිකේ `b.orderType.toUpperCase()`, `b.invoiceNumber`,
  `b.cashierName`, `b.grandTotal`, `item.minStock`, `c.username` — මේවා legacy import/restore
  data වල අඩු නම් **crash / "undefined"** පෙන්නුවා.
- **Fix:** Table + low-stock + cashier rows වලට `String(x || '')`, `Number(x || 0)`, fallback
  values දැම්මා. AI report එකේ `issues[]`/`recommendations[]` මගහැරුණොත් පත් වෙන විදියටත්
  guard දැම්මා.

## 🟡 7. කුඩා UX අඩුපාඩු

- Unused imports (`Wine`, `CreditCard`, `Banknote`, `Receipt`, `BarChart`, `Bar`, `XAxis`,
  `YAxis`, `Tooltip`, `CartesianGrid`) අයින් කළා.
- "Recent transactions" empty message එක "…yet today" → "…yet." (table එක හැමදාම තියෙන
  latest bills පෙන්නන නිසා).
- Active Cashiers card එකට empty state ("No cashier accounts configured yet") add කළා.
- `totalBillsCount` කියන දත්තය Average Bill card එකේ Lifetime Sales ගාව පෙන්නනවා.
- Payment chart color palette එක 6 payment methods වලට විහිදෙන විදියට වැඩි කළා.

---

## ✅ Verification

- `npm run typecheck` (`tsc --noEmit`) — clean
- `npm run build` (Vite + esbuild) — OK
- නව `tests/e2e/e2e-dashboard.mjs` (live server) — **16/16 pass**:
  - recentBills newest-first + most-recent bill මුලින්ම
  - payment breakdown එකට `split` include වෙනවා + `room_charge` seeded
  - health-check GET එක live report එකක් return කරනවා (todayBillsCount match)
  - payment-method totals `todayRevenue` ට reconcile වෙනවා
- Run කරන්නේ: `BASE_URL=http://localhost:3000 ADMIN_PASSWORD=... node tests/e2e/e2e-dashboard.mjs`
