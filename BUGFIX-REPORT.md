# Royal Hotel POS — Bug & Error Audit Report (2026-08-23)

සම්පූර්ණ system එක පරීක්ෂා කර හමු වූ bugs සහ ඒවාට කළ නිවැරදි කිරීම්.

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
| 24 | **Smart Stock Import modal එක open කළ ගමන් app එකම crash** — `Minified React error #310` ("Rendered more hooks than during the previous render") → "Something went wrong" screen | `StockImportModal` එකේ `useMemo` hook එක `if (!isOpen) return null;` ට **පස්සේ** තිබුණා. Modal එක closed වෙලා තියෙන render එකේදී hook එක run නොවී, open කළාම run වෙන නිසා hook count එක වෙනස් වී React crash වුණා. Redundant `useMemo` එක ඉවත් කර hooks ඔක්කොම early-return එකට කලින් තැබුවා + regression test (`tests/import-crash.test.tsx`) |

## 🐘 PHP Backend (Hostinger) — 2026-08-24

`api/` folder එකේ තිබූ fatal errors. මේවා නිසා Hostinger shared hosting එකේදී endpoints 500 දුන්නා.

| # | Bug | කලින් සිදුවූ දේ | Fix |
|---|-----|----------------|-----|
| P1 | `api/reports/daily-stock-sheet.php` → `require_once '/../db.php'` | `api/db.php` කියන file එකක් නැහැ → **PHP Fatal error** (500) | ඉවත් කළා (`middleware.php` දැනටමත් `config/database.php` load කරනවා) |
| P2 | එම file එකේම `authenticate()` | නොපවතින function එකක් → **Fatal error** | `requireAuth()` |
| P3 | එම file එකේම `http_response_type()` (×4) | නොපවතින function එකක් → **Fatal error** | `http_response_code()` / `sendError()` |
| P4 | එම file එකේම `get_db_connection()` | නොපවතින function එකක් → **Fatal error** | `Database::getConnection()` |
| P5 | Daily sheet එකේ In-Hand ගණනය Node version එකට වඩා වෙනස් (positive adjustments "received" ලෙස නොසැලකුණා) | Paper register එකේ opening stock වැරදියි | `server.ts` logic එකට සමාන කළා |
| P6 | Daily sheet POST — `variantId` නැති row එකක් ආවොත් PHP warning, `newBalance` සීමා නැහැ, audit log නැහැ | Reconcile එක අසම්පූර්ණයි / transaction එක open ඉතුරු විය හැක | Validation + audit log + `inTransaction()` rollback |
| P7 | Daily sheet response එකේ `companyName` නැහැ | UI එකේ brand නම පෙන්වන්නේ නැහැ | `LEFT JOIN companies` |
| P8 | `change-password.php` — `currentPassword` අනිවාර්ය නැහැ | Token එකක් තියෙන ඕනෑම කෙනෙකුට password එක වෙනස් කළ හැකි විය (Node එකේ fix කර තිබුණත් PHP එකේ නැහැ) | අනිවාර්ය + වැරදි password check + same-password check + 4..128 සීමා + වෙනත් sessions revoke |
| P9 | `users/index.php` PUT — තමන්ගේම account එක disable/demote කළ හැකි විය | Super Admin ලොක් වෙනවා | Self-guard + PATCH toggle + email validation/duplicate check + name/password length checks |
| P10 | `generateNextNumber()` — `COUNT(*)` මත පදනම් විය | Bill එකක් delete/void කළාම අංකය නැවත භාවිතා වී **duplicate key (SQLSTATE 23000)** | ඉහළම අංකයෙන් ඊළඟ අංකය සාදන `nextSequenceNumber()` |
| P11 | CORS — ඕනෑම Origin එකක් `Allow-Credentials: true` සමග reflect විය | වෙනත් site එකකට authenticated requests යැවිය හැකි විය | Same-host (හෝ `CORS_ALLOWED_ORIGINS`) origin පමණයි |
| P12 | `config/database.php` — `$_SERVER['PHP_SELF']` CLI එකේදී notice එකක් දුන්නා | Notice/warning | `?? ''` guard |

### PHP backend පරීක්ෂා කරන ආකාරය (PHP install එකක් නැතුව)

```bash
npm run check:php
```

`tools/check-php.mjs` — syntax parse (php-parser), require targets, undefined functions, සහ
`database.sql` schema එකට එරෙහිව හැම SQL statement එකක්ම පරීක්ෂා කරනවා. Fix කරන්න කලින්
ඉහත P1–P4 එය exit 1 සමග අල්ලා ගන්නවා; දැන් සියල්ල pass.

## ✅ Verification

- `npx tsc --noEmit` — clean
- `npm run build` — vite + esbuild bundle OK
- `npm run check:php` — PHP syntax / requires / functions / SQL-vs-schema clean
- Production mode (`node dist/server.cjs`) — SPA, API 404 handling, health OK
- End-to-end API tests: login → hold → KOT → checkout → void → stock restore → room booking → payment → checkout → reports/backup — සියල්ල pass
- Exploit tests (negative qty, fake variant, price tampering, discount bypass, cashier privilege escalation) — දැන් සියල්ල block වේ

**Default login:** `Admin` / `Araliya2000` (දැන් password වෙනස් කළාම restart එකේදී reset වෙන්නේ නැහැ. `DEFAULT_ADMIN_PASSWORD` env var එකෙන් default එක වෙනස් කරන්න පුළුවන්.)
