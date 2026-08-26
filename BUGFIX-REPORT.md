# Royal Hotel POS — Bug & Error Audit Report (2026-08-23)

සම්පූර්ණ system එක පරීක්ෂා කර හමු වූ bugs සහ ඒවාට කළ නිවැරදි කිරීම්.

## 🔧 Seventh Audit Round (2026-08-26) — System health check, frontend crash fix & security hardening

**ක්‍රමය:** අලුත් `npm install` එකකින් (fresh node_modules) පටන් ගෙන — typecheck, production build, සම්පූර්ණ e2e suites (7ක්) නැවත run, සහ ජීවත් වන server එකක් මත auth / users / rooms / bookings / settings / companies / imports / reports / backups හරහා adversarial probes. සමස්ත system එක **healthy** ✅ — හමු වූ කුඩා කරුණු පහත.

**System health — verify කළ දේ (සියල්ල හරි ✅):**
- `npx tsc --noEmit` — clean
- `npm run build` (vite + esbuild) — OK (chunk-size warning පමණයි, bug නොවේ)
- `GET /api/health` — `{status:ok, database:{writable:true}}`
- Login (Admin/Araliya2000), bad-token 401, wrong-password 401
- e2e suites **141/141** pass: `e2e-test` 24 · `e2e-edge` 29 · `e2e-kitchen` 21 · `e2e-kitchen-sale` 12 · `e2e-recipe-snapshot` 10 · `e2e-recipe-impact` 21 · `e2e-shots` 24
- Adversarial probes: user create (duplicate username 400, invalid role 400, self-delete 400, weak pw 400), rooms (negative rate 400, booking checkout<checkin 400, invalid date 400, zero-night 400), settings (taxRate>100 400, negative serviceCharge 400), import malformed 400, companies GET/POST, reports, audit-logs, backups — හැම endpoint එකක්ම නිවැරදි status code, **500 එකක් නැත**

හමු වූ bugs සහ කළ නිවැරදි කිරීම්:

| # | Bug | Fix |
|---|-----|-----|
| 49 | **POS product search crash (bug #46 එකේම class එක, ඉතිරි වුණු තැනක්)** — `src/components/pos/ProductGrid.tsx` එකේ තාම `v.sku.toLowerCase()` **unguarded**. Bug #46 වලින් prove වුණා runtime data එකේ (legacy import/restore) variant එකක `sku` අතුරුදහන් වෙන්න පුළුවන් කියලා (type එකේ `sku: string` කියලා තිබුණත්). `GET /api/products` එක ඒ variants නොවෙනස්ව පසුකර යවනවා (`productForClient` normalize නොකරයි). ඒ නිසා POS එකේ product search කළාම `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` → React error boundary → **blank screen**. Bug #46 fix වුණේ `DailyStockSheet` + `ProductManagement` වලට පමණයි; **`ProductGrid` අතපසු වී තිබුණා** | `String(v.sku || '').toLowerCase()` guard (consistency සඳහා `String(v.size || '')` ද එකතු කළා). දැන් legacy/imported variant එකක sku නැති වුණත් search crash නොවේ ✅ |
| 50 | **Weak minimum password length — 4 characters** — user create (`userCreateSchema`: `z.string().min(4)`), `POST /api/auth/change-password` (`< 4`), `PUT /api/users/:id` (`< 4`), සහ frontend `UserManagement.tsx` (3 තැනක `< 4`) — සියල්ල 4-char passwords පිළිගත්තා. OWASP/NIST recommend **8+** | සියලුම minimum **8** දක්වා ඉහළ නැංවූවා (server `min(8)`, change-password `< 8`, PUT user `< 8`, UserManagement `< 8`). Verified: 4-char → 400 "at least 8", 8-char → created ✅. පවතින users වල login වලට බලපාන්නේ නැහැ (login length check නොකරයි); e2e suite එකේ passwords සියල්ල ≥8 නිසා tests බිඳුනේ නැහැ ✅ |
| — | **High-severity dependency vulnerability (`xlsx@0.18.5`)** — `npm audit` එකේ **1 high severity**: prototype pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9). **No fix available** (npm එකේ patched version නැත). එය පාවිච්චි වන්නේ **client-side පමණයි** (`StockImportModal.tsx` Excel parse + `exportUtils.ts` export) නිසා impact එක cashier/browser session එකට සීමා වේ — නමුත් malicious Excel file එකකින් browser එකේ ReDoS/prototype pollution අවුල් කරන්න පුළුවන් | **Fix නැත** — known limitation ලෙස document කළා. ඊළඟ release එකකදී maintained Excel parser එකකට (e.g. `exceljs`) මාරු කිරීම recommend ✅ |
| — | **Room booking silent date default (minor)** — `checkInDate`/`checkOutDate` එක්ක එවන්නේ නැත්නම් server එක නිශ්ශබ්දව `now` / `now+1day` ලෙස default කරනවා. Frontend එක හැම විටම දෙකම එවන නිසා live bug එකක් නොවේ; API client එකක් dates අතහැරියොත් unexpected booking එකක් නිර්මාණය වේ | Breaking change එකක් වළක්වන්න හිතාමතාම වෙනස් නොකළා. Note කර ඇත ✅ |

**Verification (fresh DB, live server):** e2e suites 141/141 pass (Seven Audit Round එකට පෙර තිබූ සියල්ල regression නැත). `tsc --noEmit` clean ✅ · production build OK ✅ · password min hardening verified (4→reject, 8→accept) ✅ · ProductGrid sku fix typecheck/build OK ✅.

## 🔧 Sixth Audit Round (2026-08-26) — System-wide adversarial testing

**ක්‍රමය:** ජීවත් වන server එකක් මත checkouts, rooms, daily stock sheet, import engine, authz, backup/restore හරහා adversarial tests 44ක් + පවතින e2e suites 141ක් (මුළු 185). හමු වූ bugs:

| # | Bug | Fix |
|---|-----|-----|
| 45 | **Room booking charge inflation (money bug)** — server එක client එවන `durationDays` එක trust කළා. රෑ 1ක stay එකකට `durationDays: 500` යැව්වොත් **Rs. 4,250,000 charge** (8500×500) — cashier කෙනෙකුට guest කෙනෙකුව 500× overcharge කරන්න පුළුවන්. Verify: `totalRoomCharge=4250000` (1 රැයකට ඕනේ 8500) | **Nights ගණන සැමවිටම validate කළ dates දෙකෙන්ම derive** කරනවා (`calculatedDays`); client `durationDays` සම්පූර්ණයෙන් ignore. Verify: `durationDays=1, total=8500` ✅ |
| 46 | **Daily Stock Sheet search එකෙන් 500 crash** — variant එකක `sku` එක නැති legacy data (අතීත import/restore) තිබුණොත් `v.sku.toLowerCase()` → `TypeError` → 500. ඇත්තටම reproduce කරා (sku එක strip කරපු DB එකක් restore කරලා) | `String(v.sku || '')` guard; Product Management UI search එකේ එකම bug එකත් fix (ProductManagement.tsx) |
| 47 | **Import summary inconsistency** — preview එකේ `priceChanges` = rows ගණන, confirm එකේ = price fields ගණන (buy+sell දෙකම change වුණොත් preview 1, history 2) — done screen එකේ අගය preview එකට වඩා වැඩියි | confirm summary එකේත් **rows ගණන** (preview එකට සමාන); audit log එකේ detail එක තියෙනවා |
| 48 | **PaymentModal UI/server mismatch** — card/bank/other methods වලදී received < grand total වුණත් Complete button එක active වුණා (server එක 400 error එකක් දෙනවා) | `isSufficient` දැන් හැම method එකකටම `received >= grandTotal` — button එක consistent විදිහට disable |

**මේ round එකේම verify කරපු අනිත් සියල්ල හරි ✅** (checks 44/44): room charge derivation, daily sheet arithmetic (`received==qty, inHand+received==stock, balance==stock`), checkout validation (fractional/10001/negative qty, empty cart, unknown variant, card underpayment — හැම එකම 400), duplicate cart lines aggregated (oversell bypass නැහැ), import 2000-row limit, excluded rows, price-only imports, all-excluded 400, physical-count NEW item NEEDS_REVIEW, multi-size grouping, 401/403 authz, malformed JSON 400, unknown import 404, stock-out <0 block, shot stock-in block, backup→restore round trip, missing-sku crash fix. පවතින e2e suites 7ක්: **141/141 pass**. `tsc --noEmit` clean ✅

## 🔧 Fifth Audit Round (2026-08-26) — Smart Import: silent no-op + 6 more fixes

**පසුබිම:** User ට Excel upload කළාම Live Inventory එකේ කිසිම වෙනසක් නොපෙනුණි. ජීවත් වන server එකක් මත real Excel upload → preview → confirm → inventory chain එක full E2E විදිහට පරීක්ෂා කළාම හමු වුණේ: **pipeline එක 100% නිවැරදියි** (96+48=144, 30+24=54, නව items, movements ledger, duplicate 409, history සියල්ල pass) — නමුත් (1) supplier-style headers (`Unit Price` / `Sales Price` / `Stock On Hand`) හඳුනා නොගැනීම නිසා quantity/prices **නිශ්ශබ්දව drop** වී, import එක "සාර්ථක" වී 0 units එකතු වුණා.

| # | Bug | Fix |
|---|-----|-----|
| 37 | **Supplier-style Excel headers හඳුනා නොගැනීම** — `Unit Price`, `Sales Price`, `Stock On Hand`, `Category Name`, `Brand Name`, `Item Code`, `Min Stock Level`, `On Hand`, `Reorder Level`, `Invoice Ref`, `Bill Number` ආදිය mapping එකේ නැති නිසා ඒ columns නිශ්ශබ්දව අතහැරුණා → import "සාර්ථක" වුණත් **0 units** (Live Inventory එකේ වෙනසක් නැත) | `HEADER_ALIASES` එකට aliases 30+ක් එකතු කළා (sku/barcode/category/brand/name/size/buy/sell/qty/minstock/supplier/invoice) — දැන් සාමාන්‍ය supplier sheets වලින් qty සහ prices හරියට එනවා. E2E: `Unit Price/Sales Price/Stock On Hand` file එක → **96 → 144 ✅** |
| 38 | **Silent no-op row** — quantity හෝ price නැති matched row එකක් "Import Completed" කියලා පෙන්නලා කිසිම දෙයක් change නොකළා | එවැනි row → **INVALID** + හඳුනාගත හැකි quantity headers ලැයිස්තුවක් සහිත note; confirm block වෙනවා. Preview එකේද "will add 0 units" amber warning එකක් |
| 39 | **Duplicate SKU/Barcode හැදීම** — එකම file එකේ නව rows 2කට එකම SKU; හෝ bar-scope එකේදී non-bar product එකක SKU එකම reuse (matching index එක scope-filtered නිසා හසු නොවුණා) → duplicate code එක්ක නව variants | NEW_ITEM rows සඳහා preview එකේදීම duplicate-code guard: file ඇතුළත හෝ පවතින (ඕනෑම scope එකක) items සමග ගැටෙන SKU/Barcode → **INVALID** + note; confirm 400. E2E: දෙකම block ✅ |
| 40 | **"Minimum Stock" column එක existing items වලට ignore වීම** — template එකේ column එකක්, නමුත් apply වුණේ නව items වලට පමණයි (තවත් silent no-op) | Matched items වලටත් apply: preview note (`Min stock 12 → 40.`), confirm එකේදී `minStockLevel` update, history detail එකේ `minStockBefore/After` display. Min-stock-පමණක් row එකක් දැන් importable (INVALID නොවේ) |
| 41 | **Multi-sheet Excel files** — cover/terms sheet එකක් පළමුවෙන් තිබුණොත් "No valid product rows found" error | සියලුම sheets scan කරලා valid rows ඇති පළමු sheet එක භාවිතා කරනවා (+ parse note එකේ sheet name) |
| 42 | **Invoice Date Excel serial number විදිහට එනවා** (e.g. `46245`) | `mapSheetRows` දී serial → `YYYY-MM-DD` conversion |
| 43 | **"Keep Existing" කිව්වත් movement ledger එකේ අලුත් (rejected) buying price record වීම** | Ledger cost දැන් variant එකේ ඇත්තටම තබාගත් cost එකයි (Keep Existing → පරණ price) |
| 44 | **Bar scope + නව category "Food"-වැනි නමක්** — නොතිබුණු category එකක් `type:'bar'` විදිහට create වීම (bar import එකෙන් "Food" කියන bar category එකක් හැදෙන්න පුළුවන්කම) | Bar scope එකේදී `inferCategoryType()` restaurant යයි පෙන්වන නව category නමක් → **INVALID** + "switch to All items" note |

**Verification (fresh DB, real server):** නව audit suite එක **23/23 pass** — regression (matched+new+prices), duplicate-SKU-in-file, out-of-scope SKU clash, min-stock on matched, Keep-Existing ledger cost, "Food" category block, multi-sheet, serial date, physical count, min-stock-only row, empty-row block. පවතින e2e suites: `e2e-test.mjs` **24/24** ✅ · `e2e-edge.mjs` **29/29** ✅ · `tsc --noEmit` clean ✅

## 🔧 Fourth Audit Round (2026-08-25) — Smart Import crash fix

| # | Bug | Fix |
|---|-----|-----|
| 35 | **"Smart Import" button එක click කළ විට React error #310 ("Something went wrong")** — `StockImportModal` එකේ Rules-of-Hooks violation එකක්. `if (!isOpen) return null;` කියන early return එකට **පස්සේ** `const activePreviewRows = useMemo(() => previewRows, [previewRows]);` කියන hook එක call වුණා. Modal එක **closed** වෙලා තියෙද්දී component එක hook 29කින් (27 `useState` + 2 `useEffect`) early return වුණා; click කළාම (`isOpen` → `true`) එකම instance එක නැවත render වෙලා 30th hook එකත් call කළා → "Rendered more hooks than during the previous render." → **React error #310** → whole app crash. Backend හරියටම වැඩ කරයි; මෙය pure frontend hooks bug එකක් | `useMemo` hook එක ඉවත් කළා (එය `previewRows` එකම unchanged return කළා — අවශ්‍ය නොවේ); `activePreviewRows` → `previewRows` වෙනස් කළා; unused `useMemo` import එකත් ඉවත් කළා. Verified: closed → open transition එකේදී **no crash** ✅ · `tsc --noEmit` clean ✅ · production build OK ✅ |
| 36 | **Smart Import — Bar items only + wrong matches & duplicates** — Excel upload කළාම (1) **restaurant/food/service items වලටත් stock update වුණා** (e.g. `Special Chicken Fried Rice` MATCHED), (2) **duplicates** හැදුණා (`Rockland Gal Arrack` → NEW `Rockland Gal Arrack` කියා), (3) **වැරදි items/sizes** match වුණා (`Extra Special Arrack` → `Navy Special Arrack`; ඊටත් පස්සේ fuzzy matcher එක exact match එක override කළා). **Root causes:** matching engine එක `type:bar` scope එක නොදැන හැම product එකක්ම match කළා; name එක exact නොගැලපුණු විට "near match" එක වෙනුවට NEW_ITEM හැදුවා (duplicate); ඒ වගේම exact match එක full-name එකට පමණක් ගැලපුණු නිසා කෙටි invoice names අසාර්ථක වුණා | **Scope `bar` (default):** `buildImportMatchIndex(scope)` bar-type categories පමණක් index කරයි; non-Bar matched rows **INVALID** (blocked); new items bar category එකට පමණයි. **Fuzzy auto-match:** name token similarity (`importNameScore` — coverage·0.7 + jaccard·0.3) එකෙන් කෙටි names auto-match (run only when no exact Barcode/SKU/Name+Size match — `!hit` guard, so it never overrides a correct match) → `Lion Lager`→`Lion Lager Beer 4.8%`, `Rockland Gal Arrack`→`Rockland Old Arrack (Gal Arrack)`, `Extra Special Arrack`→`Extra Special Arrack`. Duplicates → 0. **UI:** modal එකට "Bar Items Only / All Items" toggle (`scope` state → server). Verified: bar probe → 6 MATCHED, 1 INVALID (food), **0 duplicates / 0 NEW_ITEM**; scope=all → food matches; commit updates correct rows only; duplicate file re-import → 409; `tsc` + production build clean ✅ |

## 🔧 Second Audit Round (2026-08-25) — v1.1.1

| # | Bug | Fix |
|---|-----|-----|
| 24 | **Bill void එකකදී kitchen ingredients restore වුණේ CURRENT recipe එකෙන්** — sale වෙලාවෙන් පස්සේ recipe එක edit/archive කළොත් වැඩි/අඩු ප්‍රමාණ restore වෙනවා; recipe archive කළොත් **කිසිම දෙයක් restore වුණේ නැහැ** (ingredients stock එකේ ස්ථිර අහිමිවීමක්) | Bill එකේම sale-time **deduction snapshot** එකක් save කරනවා (`bill.kitchenDeductions`); void එක restore කරන්නේ හරියටම ඒ snapshot එකෙන් (recipe එක කොහොම වුණත්). E2E: archive/edited-recipe scenarios දෙකේදීම exact restore ✅ |
| 25 | **`bill.serviceChargeRate` persist නොවීම** — පරණ bill එකක PDF invoice එකේ/display එකේ දැන් තියෙන service charge % එක පෙන්නුවා (rate වෙනස් කළොත් අගයට ගැලපෙන % නෙවෙයි) | Checkout එකේදී `serviceChargeRate` bill එකේ save වෙනවා; PDF invoice / thermal receipt / receipt modal දැන් bill එකේ rate එකම පාවිච්චි කරනවා (legacy bills සඳහා settings fallback) |
| 26 | **Client එකෙන් එවන per-item `discount` එක stored line totals විකෘති කරනවා** — server එක ඒක totals වලට ගණන් ගත්තේ නැති නිසා `Σ item.total ≠ subtotal` (bill එකේ ඇතුළත ගැලපීමක් නැතිවීම) | `sanitizeOrderItems()` දැන් client `raw.discount` සම්පූර්ණයෙන් ignore කරනවා — stored lines සැමවිටම අය කළ මිලටම (billing exploit එකක් නොවේ, data consistency fix එකක්) |
| 27 | KOT status එක same value එකට reset කිරීමට ඉඩ තිබුණා (completed → completed) | එය harmless (idempotent) නිසා හිතාමතාම තබා ඇත — transition validation එක වැරදි transitions පමණක් block කරනවා |
| 28 | **Food & Kitchen items වලින් 52/53කට recipe නැත** — ඒවා POS එකෙන් විකුණද්දී kitchen Materials stock එකෙන් **කිසිම දෙයක් අඩු වුණේ නැහැ** (daily food cost එක understated) | Kitchen Dashboard එකට **"X items sell WITHOUT a recipe"** warning banner එකක් — ඒ item list එකත් එක්ක (Recipes tab එකට navigate button එකත්) — Kitchen Manager ට දවසින් දවස පේනවා මොන items වලටද recipes එකතු කරන්න ඕනේ කියලා |
| 29 | Kitchen ingredients / users වලට delete කරන්න endpoint නැති නිසා test cleanup + admin management දෙකේදීම අඩුපාඩුවක් | `DELETE /api/users/:id` (self-delete + last-admin guards) සහ `DELETE /api/kitchen/ingredients/:id` (archive — ledger history preserved) එකතු කළා |

## 🧪 Third Audit Round (2026-08-25) — v1.1.2 · Recipe Stock-Impact Feature

**ඉල්ලීම:** එක එක Portion එකට එක එක Materials (recipe rows add/delete කරන්න පුළුවන්) + recipe එකේ Material column එකක් දාද්දී ඒ Material එකේ stock එකෙන් ඒ ප්‍රමාණය අඩු වෙන එක. **තීරණය (user confirmed):** stock අඩු වීම **POS විකුණුම් වලදී** (දැනට තියෙන විදිහම) — recipe save කරද්දී නොවේ (double-deduction වළක්වන්න).

**කළ දේ:**
| # | Feature | විස්තරය |
|---|---------|---------|
| 30 | **Live stock-impact preview** (Recipe cards + editor) | Recipe එකේ හැම ingredient line එකක් යටම: "1 portion deducts: −250g · Stock 25,000g → 24,750g" — ඇති නම් green, නැත්නම් red + "Not enough X for 1 portion (short Y)" warning |
| 31 | **Stock Check panel** (editor එකේ) | Portions ගණනක් ඇතුළත් කරලා live check: material | need | stock | ✓/✗ short — "1000% check" save කරන්න කලින් |
| 32 | **`GET /api/kitchen/recipes/:id/impact?portions=N`** | Server-side verify endpoint: per-ingredient needed, available, shortBy, total cost for N portions; `allSufficient` flag. Testable via API |
| 33 | **`stockImpact` on GET /recipes** | Per-recipe derived data: perPortion, batchQuantity, availableStock, remainingAfterOne, sufficientForOne/Batch |
| 34 | E2E: **per-portion materials isolation** | එකම dish එකේ Regular (rice 250g) + Full (rice 400g + chicken 150g) — Regular විකුණද්දී rice විතරයි, Full විකුණද්දී දෙකම; void වුණාම exact restore. **21/21 checks pass** |

**Round-3 verification:** සම්පූර්ණ suite එක — 117/117 checks pass (96 කලින් + 21 අලුත්). `tsc --noEmit` clean, production build OK. Version → 1.1.2.

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
