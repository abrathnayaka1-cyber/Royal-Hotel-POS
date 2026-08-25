# Production Readiness Audit — Royal Hotel POS

**Date:** 2026-08-25 · **Version:** 1.1.2 → **1.1.3**

## තීරණය / Verdict

**කලින්: Production Ready නෙවෙයි ❌ → දැන්: Production Ready ✅**

Business logic එක (billing, stock, kitchen, RBAC) **හොඳින් තිබුණා** — E2E checks
117ම pass වුණා, `tsc` clean, build OK. ප්‍රශ්නය තිබුණේ **deployment සහ data
durability layer එකේ**. ඒ bugs දේවල් local `npm run dev` එකේදී **කවදාවත් පේන්නේ
නැහැ** — ඒවා පේන්නේ real server එකක, PM2/cPanel එකක, power cut එකකදී විතරයි.
එකක් නම් **සම්පූර්ණ shop data එකම මකලා දානවා**.

---

## 🔴 Critical — දත්ත/මුදල් අහිමි වන ඒවා

### 1. `process.cwd()` මත රඳා පැවතීම → empty database එකක් හැදෙනවා
`dist/` සහ database දෙකම `process.cwd()` එකෙන් resolve වුණා. PM2 / systemd /
cPanel / cron වලින් app එක **වෙන directory එකකින්** start කරනවා. එතකොට:

- හැම page load එකක්ම **500** (`ENOENT: /wrong/path/dist/index.html`)
- **තව බරපතළයි:** `cwd/data/pos_database.json` නැති නිසා server එක නිශ්ශබ්දව
  **අලුත් හිස් database එකක්** හදනවා. Staff login වෙලා බලනකොට **products නැහැ,
  bills නැහැ, stock නැහැ** — ඇත්ත data එක වෙන තැනක අනාථව.

**Reproduce කළා:** `cd /tmp && node dist/server.cjs` → `root=500` + `/tmp/data/` හැදුණා.
**Fix:** `server/paths.ts` — module location එකෙන් resolve කරනවා. පරණ installs
වලට legacy fallback එකක් තියෙනවා, ඒ නිසා upgrade එකකදී data orphan වෙන්නේ නැහැ.
**Verify:** දැන් `cd /tmp` → `root=200`, stray dir නැහැ, DB එක app root එකෙන්.

### 2. Corrupt DB එකක් = සම්පූර්ණ data wipe (නිශ්ශබ්දව)
Read/parse error **ඕනෑම එකකදී** fresh demo database එකක් seed කරලා ඒක කෙළින්ම
**damaged file එක උඩින්ම persist කළා**. Power cut එකකදී write එකක් කැඩුණොත්
(truncated JSON) — products, bills, stock **ස්ථිරවම නැති වෙනවා**. Backup තිබුණත්
පාවිච්චි කළේ නැහැ.

**Fix (3 layers):** damaged file එක `pos_database.json.corrupt.<ts>` විදිහට
quarantine → `data/backups/` එකෙන් අලුත්ම valid එක auto-restore → හරියන එකක්
නැත්නම් **start වෙන්නේ නැහැ** (හිස් POS එකකින් වෙළඳාම් කරනවාට වඩා හොඳයි).
**Verify:** corrupt+no-backup → refuse ✅ · corrupt+backup → `RECOVERED` ✅ · පරණ file එක නොවෙනස්ව ✅

### 3. Save fail වුණාම නිශ්ශබ්දයි
Disk full / permission → `console.error` විතරයි, cashier ලා දිගටම bill ගහනවා,
restart එකේදී ඔක්කොම යනවා. Health check එක `"ok"` කියලාම කිව්වා.
**Fix:** data dir writable නැත්නම් **startup එකේදීම fail** · save fail → `CRITICAL`
log · `/api/health` → **503** (load balancer එක ඒ node එකට sales යවන එක නවත්වනවා).

---

## 🟠 Security

### 4. `SESSION_SECRET` — දෙපැත්තෙන්ම අනතුරු
- **නැත්නම්:** random ephemeral secret එකක් → **හැම restart එකකදීම හැම cashier
  කෙනෙක්ම logout** (shift මැද, sale මැද). Cluster එකක tokens verify වෙන්නේ නැහැ.
- **Placeholder එකම තිබ්බොත්:** `.env.example` එකේ තියෙන value එක **public**.
  ඕන කෙනෙකුට **super-admin token එකක් forge කරන්න පුළුවන්**.

**Fix:** production එකේ නැත්නම් / කෙටි නම් (<32) / placeholder නම් → **startup
abort**, generate කරන command එකත් එක්ක. Dev එකේ පරණ විදිහටම warning විතරයි.

### 5. Restore කළාම හැමෝම lockout
Active super admin කෙනෙක් නැති JSON එකක් restore කළොත් **කාටවත් login වෙන්න බැහැ**
— shell access නැතුව හදාගන්න බැහැ. **Fix:** live data එකට අත ගහන්න කලින් reject.

---

## 🟡 Reliability & Performance

| # | ප්‍රශ්නය | Fix |
|---|---------|-----|
| 6 | Graceful shutdown නැහැ — restart එකකදී checkout එකක් මැදින් කැඩෙනවා | SIGTERM/SIGINT → drain + final flush (**exit 0, 12ms**) |
| 7 | `uncaughtException` handler නැහැ — process එක broken තත්ත්වයේ ජීවත් වෙනවා | flush + exit → clean restart |
| 8 | Directory fsync නැහැ — power cut එකකදී rename එක නැති වෙන්න පුළුවන් | file **සහ** directory දෙකම fsync |
| 9 | `save()` re-entrancy guard එක duplicate writes queue කළා | ඉවත් කළා (persist එක sync නිසා අවශ්‍ය නැහැ) |
| 10 | gzip නැහැ — bundle එක **1.6 MB** | compression → **457 kB** (POS tablet/phone වලට විශාල වෙනසක්) |
| 11 | Cache headers නැහැ — redeploy එකකදී stale shell එකක් | assets immutable · `index.html` no-cache |
| 12 | Malformed JSON → 500 | → **400** |
| 13 | Error වලට trace ID නැහැ | correlation ID (cashier කියවලා දෙන්න පුළුවන්) |
| 14 | Production එකේ stack traces leak | dev එකේ විතරයි |
| 15 | Build නැතුව `npm start` → අවුල් error | clear message එකක් එක්ක fail fast |
| 16 | `PORT=abc` → නිශ්ශබ්දව 3000 | validate + abort |
| 17 | Version එක hardcoded `'1.1.2'` | `package.json` එකෙන් |

---

## ✅ Verification

```
tsc --noEmit ............................ clean
production build ........................ OK
E2E: 6 suites ........................... 117 passed, 0 failed
```

| අලුතෙන් test කළ scenario | ප්‍රතිඵලය |
|---|---|
| වෙන cwd එකකින් production start | `200` (කලින් `500`) + stray DB නැහැ |
| Corrupt DB, backup නැහැ | refuse + quarantine ✅ |
| Corrupt DB, backup තියෙනවා | auto-recover ✅ |
| `SESSION_SECRET` නැහැ / placeholder | startup abort ✅ |
| SIGTERM keep-alive සමග | exit 0, 12ms, flushed ✅ |
| Admin නැති restore | 400, admin තාම login වෙනවා ✅ |
| gzip | 1,636,725 → 456,870 bytes ✅ |
| Malformed JSON | 400 + errorId ✅ |

---

## 📋 Deploy කරන්න කලින්

1. `SESSION_SECRET` හදන්න: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. `POS_DATA_DIR` **deploy folder එකෙන් පිටත** absolute path එකකට (redeploy එකකදී data යන්නේ නැහැ)
3. `NODE_ENV=production` · `npm run build` කරලා `npm start`
4. Default `Admin` password එක **වෙනස් කරන්න** (public documented)
5. HTTPS පස්සෙන් run කරන්න · PM2/systemd auto-restart එක්ක
6. `POS_DATA_DIR` එකේ copy එකක් **වෙන machine එකකට** schedule කරන්න
7. `/api/health` monitor කරන්න (503 = DB write කරන්න බැහැ)

සම්පූර්ණ විස්තර → `README.md` → *Production Deployment Checklist*.

> ⚠️ `xlsx@0.18.5` — prototype pollution + ReDoS advisories, upstream fix නැහැ.
> Excel import එක **admin-only** (authenticated) නිසා exposure එක අඩුයි, නමුත්
> දැනගෙන ඉන්න. Upstream release එකක් ආවොත් update කරන්න.
