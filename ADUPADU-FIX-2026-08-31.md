# Royal Hotel POS — අඩුපාඩු සෙවීම & නිවැරදි කිරීම් (2026-08-31)

මේ වටයේදී system එක සම්පූර්ණයෙන්ම පරීක්ෂා කරලා හමුවූ අඩුපාඩු fix කළා. සියලුම E2E suites clean seed DB එකක් මත **191/191 pass** වෙනවා.

## 🐛 හමුවූ අඩුපාඩු & කළ නිවැරදි කිරීම්

### 1. "Enable Discounts" setting එක වැඩ කළේ නැහැ 🔴 (money bug)
- **ගැටලුව:** System Settings එකේ `enableDiscounts` flag එක DB එකේ තිබුණා, නමුත් checkout/backend එක එය **සම්පූර්ණයෙන් ignore** කළා. Super Admin discount නවත්තලා තිබුණත් cashier කෙනෙකුට API හරහා (හෝ held bill එකක් හරහා) discounts apply කරන්න පුළුවන් වුණා.
- **Fix:**
  - `server.ts → computeOrderTotals()` දැන් `settings.enableDiscounts === false` නම් ඕනෑම percentage/amount discount එකක් `0` ට force කරනවා.
  - `POSContext.tsx` frontend totals එකත් එම setting එකට ගරු කරනවා.
  - `CartPanel.tsx` discount button එක disable වුණාම "Discounts Disabled" ලෙස පෙන්වයි.
  - `SystemSettingsView.tsx` එකට දැන් **Enable Discounts** toggle එක, **Max Discount (%)** input එක සහ **Low Stock Alert Threshold** input එක එකතු කළා (මීට කලින් මේවා UI එකේ නොතිබුණා).

### 2. Invalid / split / underpaid payments "paid bill" එකක් හදාගන්න පුළුවන් වුණා 🔴 (financial integrity)
- **ගැටලුව:**
  - Checkout එකට `paymentMethod` invalid value එකක් යැව්වොත් server එක නිශ්ශබ්දව එය `cash` බවට හරවලා bill එකක් හදනවා (error එකක් නෑ).
  - `split` payment method එකට `amountReceived: 0` යැව්වොත් **unpaid bill එකක් "paid" ලෙස** save වෙනවා.
  - Card/Bank methods වලත් `amountReceived` grand total එකට වඩා අඩුවෙන් යැව්වොත් bill එක paid වෙනවා.
- **Fix:** `POST /api/bills/checkout` දැන් ඕනෑම payment method එකක් සඳහා `amountReceived >= grandTotal` අවශ්‍ය කරනවා, සහ invalid payment method එකට `400` දෙනවා.

### 3. Room/Function booking "less than balance due" ලෙස close කළ හැකි වුණා 🔴 (money bug)
- **ගැටලුව:** Room checkout / Function completion එකේදී `finalPaymentAmount` එක balance එකට වඩා **අඩුවෙන්** යැව්වොත් server එක එය accept කරලා booking/event එක close කරනවා + ඉතිරි balance එක **uncollected** වෙනවා.
- **Fix:** Both endpoints දැන් final payment එක `balanceDue` ට වඩා අඩුවෙන් නම් `400` දෙනවා — "Record a partial payment first". Partial payments තාම `POST /:id/payment` හරහා ලියන්න පුළුවන්.

### 4. Quick filters hard-coded IDs / wrong category එකට යොමු වුණා 🟠 (UX bug)
- **ගැටලුව:** `CategoryTabs` එකේ "BEERS" quick button එක hard-coded `cat-3` ID එකට යොමු වුණා, "SOFT DRINKS" button එක `type:service` එකට යොමු වුණා. Category IDs වෙනස් වුණොත් / වෙනත් hotel එකක DB එකේදී ඒ buttons වැරදි දේවල් පෙන්වනවා හෝ දෙයක් පෙන්වන්නේ නැති වෙනවා. (Default seed එකේ Soft Drinks "Sato Drinks" category එක `restaurant` type; "type:service" එකට යොමු වීම වැරදියි.)
- **Fix:** Quick groups දැන් **live categories** වලින් resolve වෙනවා (name-based). Multiple beer categories සඳහා `catids:` multi-category filter එකකුත් `ProductGrid` එකට එකතු කළා.

### 5. Legacy/restored data search crash spots 🟠 (crash bug)
- **ගැටලුව:** Bug #46/#49 වැනි "missing sku/barcode → `.toLowerCase()` crash" ගැටලු තවත් කිහිප තැනක තිබුණා:
  - `BarcodePrintModal.tsx` (search + print)
  - `BillsInvoicesView.tsx` (`invoiceNumber`/`cashierName`)
  - `FunctionManagement.tsx`, `RoomManagement.tsx`, `FunctionsView.tsx`, `DamageReportModal.tsx`
- **Fix:** සියලුම තැන්වල `String(x || '')` guards දැම්මා. මෙයින් legacy import/restore data වල්ලේ blank screen/500 crashes වළක්වයි.

### 6. Boolean settings `"false"` string ලෙස save වෙනවා 🟠 (data correctness)
- **ගැටලුව:** `PUT /api/settings` එකේදී `enableDiscounts: "false"` / `allowNegativeStock: "0"` වගේ string/JSON values **truthy** ලෙස save වෙනවා.
- **Fix:** එම boolean fields දැන් `true`/`false` ලෙස normalize වෙනවා (`"false"`, `"0"` → `false`).

## ✅ Verification
- `npm run typecheck` — clean
- `npm run build` — OK (Vite + esbuild)
- E2E (clean seed DB):
  - `e2e-test.mjs` 24 · `e2e-edge.mjs` 29 · `e2e-kitchen.mjs` 21 · `e2e-kitchen-sale.mjs` 12 · `e2e-recipe-snapshot.mjs` 10 · `e2e-recipe-impact.mjs` 21 · `e2e-shots.mjs` 24 · `e2e-functions.mjs` 21 · `e2e-barcode-bar-only.mjs` 11 · **නව** `e2e-fixes.mjs` 18 → **191/191 pass**
- නව `tests/e2e/e2e-fixes.mjs` එකෙන් පහත ඒවා regression-proof කළා:
  - disable-discounts → discount ignored, re-enable → clamped
  - invalid payment method → 400
  - split/card underpayment → 400
  - room & function partial checkout → 400, full checkout → 200
