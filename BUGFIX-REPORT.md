# Royal Hotel POS — Bug & Error Audit Report (2026-08-23)

සම්පූර්ණ system එක පරීක්ෂා කර හමු වූ bugs සහ ඒවාට කළ නිවැරදි කිරීම්.

## 🔧 Second Audit Round (2026-08-25) — v1.1.1

| # | Bug | Fix |
|---|-----|-----|
| 24 | **Bill void එකකදී kitchen ingredients restore වුණේ CURRENT recipe එකෙන්** — sale වෙලාවෙන් පස්සේ recipe එක edit/archive කළොත් වැඩි/අඩු ප්‍රමාණ restore වෙනවා; recipe archive කළොත් **කිසිම දෙයක් restore වුණේ නැහැ** (ingredients stock එකේ ස්ථිර අහිමිවීමක්) | Bill එකේම sale-time **deduction snapshot** එකක් save කරනවා (`bill.kitchenDeductions`); void එක restore කරන්නේ හරියටම ඒ snapshot එකෙන් (recipe එක කොහොම වුණත්). E2E: archive/edited-recipe scenarios දෙකේදීම exact restore ✅ |
| 25 | **`bill.serviceChargeRate` persist නොවීම** — පරණ bill එකක PDF invoice එකේ/display එකේ දැන් තියෙන service charge % එක පෙන්නුවා (rate වෙනස් කළොත් අගයට ගැලපෙන % නෙවෙයි) | Checkout එකේදී `serviceChargeRate` bill එකේ save වෙනවා; PDF invoice / thermal receipt / receipt modal දැන් bill එකේ rate එකම පාවිච්චි කරනවා (legacy bills සඳහා settings fallback) |
| 26 | **Client එකෙන් එවන per-item `discount` එක stored line totals විකෘති කරනවා** — server එක ඒක totals වලට ගණන් ගත්තේ නැති නිසා `Σ item.total ≠ subtotal` (bill එකේ ඇතුළත ගැලපීමක් නැතිවීම) | `sanitizeOrderItems()` දැන් client `raw.discount` සම්පූර්ණයෙන් ignore කරනවා — stored lines සැමවිටම අය කළ මිලටම (billing exploit එකක් නොවේ, data consistency fix එකක්) |
| 27 | KOT status එක same value එකට reset කිරීමට ඉඩ තිබුණා (completed → completed) | එය harmless (idempotent) නිසා හිතාමතාම තබා ඇත — transition validation එක වැරදි transitions පමණක් block කරනවා |

**Round-2 verification:** E2E suites 5ක්, **96/96 pass** (`tests/e2e/`) — POS billing, shots/750ml pool, void restore, rooms, KOT, reports, kitchen RBAC, recipe deduction + snapshot restore, approval workflows ඇතුළුව. Production build (`node dist/server.cjs`) — SPA, health, API 404, settings persistence ✅

## 🔴 Critical (මුදල් / stock අහිමි වන bugs)

| # | Bug | කලින් සිදුවූ දේ | Fix |
|---|-----|----------------|-----|
| 1 | Negative quantity checkout | `quantity: -3` යැවූ විට stock **වැඩි** විය (24 → 27) සහ negative bill එකක් සෑදුණි | `sanitizeOrderItems()` — quantity 1..10000 integer පමණයි |
| 2 | Client-side pricing trusted | `grandTotal: 1` යැවීමෙන් Rs. 3,850 බඩුවක් Rs. 1ට විකිණිය හැකි විය | Server `computeOrderTotals()` මගින් subtotal/discount/service charge/tax/grand total නැවත ගණනය කරයි |
| 3 | Unknown variant IDs | නොපවතින `variantId` එකක් bill එකට ගියේ error නැතිව | Catalogue එකේ නැති variant → 400 error |
| 4 | Duplicate cart lines | එකම variant එක දෙපාරක් යැවීමෙන් stock check එක මගහැරිය හැකි විය | Variant අනුව quantity එකතු කර stock check |
| 5 | Discount limit bypass | 90% discount එකක් යැවිය හැකි විය (`maxDiscountPercentage` = 20) | Server side clamp |
| 6 | Admin password reset on restart | Password වෙනස් කළත් server restart එකේදී නැවත `Araliya2000` බවට පත්විය | Boot එකේදී hash overwrite නොකරයි (account එක තිබෙනවාද පමණක් බලයි) |
| 7 | Change-password without current password | `currentPassword` නොදී password වෙනස් කළ හැකි විය | දැන් අනිවාර්යයි + wrong/same password checks |

## 🟠 Functional bugs

| # | Bug | Fix |
|---|-----|-----|
| 8 | **Reports page සම්පූර්ණයෙන් broken** — frontend `/api/reports/summary` call කළත් server එකේ තිබුණේ `/api/reports/analytics` පමණි (404) | `/api/reports/summary` route එක එකතු කළා |
| 9 | Report period filter වැඩ නොකළා (`period=today/week/month/year` server එක ignore කළා) | `resolvePeriodRange()` + end-date එක සම්පූර්ණ දිනය ආවරණය කරයි |
| 10 | Held bill numbers duplicate — හැම hold එකකටම `HOLD-1001` වැනි එකම අංකය | වෙනම `holdSeq` counter එකක් (`HOLD-1`, `HOLD-2`, …) |
| 11 | `paymentMethod: 'other'` (Room Charge / Other) silently `cash` බවට හැරුණා | Whitelist එක `src/types.ts` සමග ගැලපුවා |
| 12 | Room double booking — `reserved` කාමරයකට දෙවන booking එකක් දැමූ විට පළමු booking එක orphan විය | Active booking / maintenance තිබේ නම් 400 |
| 13 | Room checkout — extra charges apply කර පසුව request එක reject වීමෙන් booking totals corrupt විය | Validate → then mutate |
| 14 | Cancelled booking එකක් checkout කළ හැකි විය | 400 error |
| 15 | Duplicate SKU / barcode products save විය (barcode scan එකට වැරදි item එකක් එයි) | Duplicate check + auto unique SKU generation |
| 16 | Selling price 0 හෝ negative products save විය | Price validation |
| 17 | Backup auto-prune වැඩ නොකළා (`pos_backup_` prefix ගැලපුනේ නැහැ, backups අනන්තව වැඩිවෙයි) | නිවැරදි `royal_hotel_backup_` prefix |
| 18 | Express error handler එක routes වලට **පෙර** register වී තිබුණි → errors handle නොවීය | Middleware chain එකේ අගට ගෙන ගියා |

## 🟡 Security / permissions

| # | Bug | Fix |
|---|-----|-----|
| 19 | Cashier කෙනෙකුට `PUT /api/rooms/:id` හරහා **room rates** වෙනස් කළ හැකි විය | Cashier ට status පමණයි; අනෙක් සියල්ල Super Admin only |
| 20 | Hold / KOT items raw client JSON ලෙසම DB එකට ගියා | Sanitize කරයි |

## 🔵 Frontend / UI

| # | Bug | Fix |
|---|-----|-----|
| 21 | Out-of-stock single-variant product එකක card එකට click කළ විට කෙළින්ම cart එකට ගියා | `addToCart` stock guard + පැහැදිලි message |
| 22 | Cart quantity එක stock එකට වඩා වැඩි කළ හැකි විය | `updateCartQuantity` clamp |
| 23 | Live preview / tunnel host වලින් app එක load නොවීය (`Blocked request. This host is not allowed`) | `allowedHosts` (vite.config + server.ts vite middleware), hardcoded HMR host ඉවත් කළා |

## ✅ Verification

- `npx tsc --noEmit` — clean
- `npm run build` — vite + esbuild bundle OK
- Production mode (`node dist/server.cjs`) — SPA, API 404 handling, health OK
- End-to-end API tests: login → hold → KOT → checkout → void → stock restore → room booking → payment → checkout → reports/backup — සියල්ල pass
- Exploit tests (negative qty, fake variant, price tampering, discount bypass, cashier privilege escalation) — දැන් සියල්ල block වේ

**Default login:** `Admin` / `Araliya2000` (දැන් password වෙනස් කළාම restart එකේදී reset වෙන්නේ නැහැ. `DEFAULT_ADMIN_PASSWORD` env var එකෙන් default එක වෙනස් කරන්න පුළුවන්.)
