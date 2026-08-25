# Royal Hotel POS — Security Audit & Hardening

> **Sinhala summary:** මේ report එකෙන් ඔබේ POS system එකේ තිබුණු ආරක්ෂක දුර්වලතා සහ ඒවාට
> දැමූ පිළියම් විස්තර කෙරේ. වැදගත්ම දුර්වලතා (පෙරනිමි admin මුරපදය publicly තිබීම,
> අවසරයකින් තොර admin initialize කිරීමේ endpoint එක, current password නොමැතිව password
> වෙනස් කිරීම) දැන් සම්පූර්ණයෙන් හදලා තියෙනවා.

Date: 2026-08-25 · Scope: the whole repository (Node/Express app `server.ts` + `server/db.ts`,
the React frontend `src/`, and the legacy PHP backend under `api/` + `config/`).

---

## TL;DR — What was wrong and what was fixed

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | 🔴 Critical | **Unauthenticated admin bootstrap** — `api/init-admin.php` created `Admin / Araliya2000` (PIN `9999`) with **no authentication**; an attacker could hit it first and take over the whole system. | ✅ Fixed |
| 2 | 🔴 Critical | **Publicly-known default admin password** — `Araliya2000` was hardcoded in `server/db.ts`, printed in the README, *and displayed on the login screen itself*. | ✅ Fixed |
| 3 | 🔴 High | **PHP password change without current password** — `api/auth/change-password.php` skipped verification when `currentPassword` was empty, so any stolen session could silently take over an account. | ✅ Fixed |
| 4 | 🟠 High | **No brute-force protection on the PHP login** — unlimited guesses against the default password / 4-digit cashier PINs. | ✅ Fixed |
| 5 | 🟠 Medium | **CORS reflected any origin + `credentials: true`** (both Node and PHP). | ✅ Fixed |
| 6 | 🟠 Medium | **Session cookie `HttpOnly=false`** (PHP) — an XSS could read the token. | ✅ Fixed |
| 7 | 🟡 Info | PINs stored in plaintext; token in `localStorage`; `trust proxy = 1`. | ⚠️ Documented (see Recommendations) |

---

## Detailed findings & fixes

### 1. 🔴 `api/init-admin.php` — unauthenticated, known-credential admin bootstrap

**Before:** the endpoint required **no authentication**, and on first invocation
created `Admin` with password `Araliya2000` and PIN `9999`. On a shared PHP host
(Hostinger), anyone who reached `/api/init-admin.php` before the owner did could
claim the Super Admin account.

**Fix:** the script is now gated behind an `INIT_ADMIN_SECRET` environment variable
(≥16 chars) that must be presented via the `X-Init-Secret` header (or `?secret=`).
It also generates a **random 24-character one-time password** (returned once in the
response) instead of the hardcoded one, and sets **no default PIN**.

### 2. 🔴 Publicly-known default admin password

**Before:** `Araliya2000` was hardcoded as the fallback in `server/db.ts`, documented
in `README.md`, and **shown directly on the login screen**
(`src/components/auth/LoginScreen.tsx` → "Default: Admin / Araliya2000").

**Fixes:**
- Removed the credential hint from the login screen (replaced with "Access is
  restricted to authorised staff").
- In **production**, when `DEFAULT_ADMIN_PASSWORD` is not set, the server now
  generates a **random one-time password** and prints it to the server log on
  first seed — the known default is never used in production.
- Development keeps `Araliya2000` so local quick-start and the E2E test suite
  (`tests/e2e/`) are unaffected.

### 3. 🔴 `api/auth/change-password.php` — password change without current password

**Before:** `if (!empty($currentPassword)) { …verify… }` meant an **empty**
`currentPassword` skipped verification entirely — the exact vulnerability the Node
app had already fixed ("Current password is ALWAYS required").

**Fix:** the current password is now mandatory and always verified with
`password_verify()` before the new hash is written.

### 4. 🟠 `api/auth/login.php` — no brute-force protection

**Before:** unlimited login attempts; the documented default password and 4-digit
PINs could be guessed at full speed.

**Fix:** added file-backed throttling (no DB schema change) in `api/middleware.php`:
failed attempts are recorded per `(IP + identifier)`, and an identifier is locked
for 60 seconds after 5 consecutive failures. The PIN comparison now also uses
`hash_equals()` (constant-time).

### 5. 🟠 CORS reflected arbitrary origins with credentials

**Node (`server.ts`):** replaced `origin: true` with a `corsOrigin` function that
honours an optional `CORS_ORIGINS` allowlist (comma-separated). When the allowlist
is empty, behaviour is unchanged (any origin) so a LAN POS keeps working; when set,
disallowed origins get no CORS headers.

**PHP (`api/middleware.php`):** previously echoed `HTTP_ORIGIN` straight into
`Access-Control-Allow-Origin` while also sending `Access-Control-Allow-Credentials`.
Now only origins in `CORS_ORIGINS` are reflected; with no allowlist the API is
same-origin only (safe default).

### 6. 🟠 `HttpOnly=false` session cookie (PHP)

**Before:** `api/auth/login.php` and `logout.php` set `httponly => false`, so
client-side JavaScript could read `pos_auth_token` (an XSS would exfiltrate it).

**Fix:** `httponly => true`. The frontend authenticates via the `Authorization`
header, which is unaffected.

---

## What was already well-protected (verified, no change needed)

The Node/Express app is already unusually well hardened:

- HMAC-SHA256 signed tokens (`rh_` prefix) with `timingSafeEqual` verification and
  a revoked-token list with TTL cleanup.
- The legacy `pos_tok_` admin-impersonation backdoor is **removed** from the Node app.
- `SESSION_SECRET` enforced in production (refuses to start on missing/short/placeholder).
- Helmet headers, global + auth rate limiting, per-IP login lockout (5 attempts / 60s).
- bcrypt password hashing; Zod input validation throughout.
- **Server-authoritative pricing** — the client can't set prices/discounts; item
  sanitization blocks tampered variants, bad quantities, and overselling.
- Path-traversal protection on backup restore; 100MB cap and "must contain an active
  Super Admin" guard on DB restore; atomic writes with fsync; corrupt-DB quarantine.
- Role-based access control (`super_admin` / `cashier` / `kitchen_manager`), with the
  kitchen module behind its own permission layer.
- No `innerHTML`/`eval`/`dangerouslySetInnerHTML` in the React frontend (XSS is
  mitigated by React's automatic escaping).

---

## Remaining recommendations (not code-blocking, apply operationally)

1. **Change the `Admin` password immediately** — on any install that was ever
   created with `Araliya2000`, change it via *Admin → Users*. This audit cannot
   rotate passwords on your live database for you.
2. **Run behind HTTPS** — login tokens must never cross the network in plaintext.
3. **PIN login is weak by design.** PINs are stored in plaintext and the UI allows
   short PINs (2–16). Prefer password login for privileged accounts, or lengthen
   cashier PINs (e.g. ≥6 digits). The Node app already rate-limits + locks out PIN
   attempts; the PHP app now does too.
4. **Tokens live in `localStorage`** on the client. This is standard for this
   architecture and is acceptable *as long as there is no XSS* (there currently is
   none). If you later add third-party scripts, revisit this.
5. **`trust proxy = 1`** is set for rate limiting. Only correct when there is
   exactly one reverse proxy in front; if you expose the app directly to the
   internet, an attacker could spoof `X-Forwarded-For` and bypass IP-based lockouts.
   Keep it behind your proxy.
6. **Legacy PHP backend:** if you are not using the `api/` + `config/` files,
   **remove them from any public webroot** — they are a second, independent attack
   surface. If you *are* using them, set `INIT_ADMIN_SECRET` and `CORS_ORIGINS`,
   and rotate the MySQL credentials in `config/config.php`.
7. **Dependency hygiene:** `xlsx@0.18.5` (client-side SheetJS) is the final npm
   release of that package and has known CVEs; it is only used to *parse* uploads
   in the browser, but consider migrating if uploads are ever accepted from
   untrusted sources.

---

## Files changed

- `server.ts` — CORS allowlist (`CORS_ORIGINS`).
- `server/db.ts` — production random first-run admin password; `crypto` import.
- `src/components/auth/LoginScreen.tsx` — removed on-screen default credentials.
- `api/middleware.php` — strict CORS + brute-force helpers.
- `api/auth/login.php` — brute-force protection, constant-time PIN compare, HttpOnly cookie.
- `api/auth/logout.php` — HttpOnly cookie.
- `api/auth/change-password.php` — mandatory current-password verification.
- `api/init-admin.php` — secret-gated, random one-time password, no default PIN.
- `.env.example`, `README.md` — documentation updates.
