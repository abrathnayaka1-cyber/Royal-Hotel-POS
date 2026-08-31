# Royal Hotel POS - Bar, Restaurant & Hotel Management System

> Commercial-grade Point of Sale system with multi-size bottle variants, hotel room management, function & event bookings, daily stock sheet reconciliation, inventory, KOT, billing, and reporting.

![Version](https://img.shields.io/badge/version-1.4.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D22-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## 🌟 Features

### POS & Billing
- Fast touch-friendly POS interface with product grid & category tabs
- Multi-size variants (750ml, 375ml, 180ml, shots, portions)
- Barcode & SKU scanner support
- Cart with discount (percentage / fixed), tax, service charge
- Hold / Park bills (HOLD- prefix, doesn't consume BILL sequence)
- Kitchen Order Tickets (KOT) with status workflow (pending → preparing → ready → completed)
- Multiple payment methods: Cash, Card, Bank Transfer, Split
- Thermal receipt printing (58mm / 80mm) with auto-print option

### Hotel & Room Management
- Room creation, status tracking (available, occupied, reserved, cleaning, maintenance)
- Room booking with check-in/out, duration auto-calculation
- Advance payment & balance due tracking
- Room service integration
- Booking ticket printing

### Functions & Events (v1.4.0 — Function Hall Bookings from the POS)
- **Function halls entered straight from the POS register** — a dedicated FUNCTIONS button in the sidebar opens hall cards + event bookings for everyone (cashiers & admins, no admin panel needed)
- Event types: wedding, birthday, party, meeting, corporate, other — with day / evening / full-day sessions
- Per-plate food pricing (rate × plates), hall charge, extra services/decor, discount & advance payments
- Same-hall/same-date double-booking guard, server-derived totals, advance ≤ grand total validation
- Event ticket printing (thermal 58mm/80mm) + payment recording, event completion (final settlement) and cancellation — all from the POS
- Super Admin manages hall master data (add / edit / delete / maintenance) under **Admin → Functions & Events**

### Food & Kitchen Module (v1.2.0 — Kitchen Manager Role)
- New **KITCHEN_MANAGER** role using the EXISTING login & RBAC system (no second auth)
- Restricted **Kitchen Manager Suite**: Dashboard, Ingredients, Kitchen Stock, Recipes & Production, Wastage, Physical Stock Count, Food Cost, Kitchen Reports — other sections shown 🔒 LOCKED
- **Automatic ingredient deduction**: recipe-linked menu items sold through the POS checkout deduct ingredients (e.g. Rice −750g, Chicken −240g for 3 fried rice) with a full movement ledger; bill void restores them
- Kitchen ingredient store with min-stock alerts, stock in/out, wastage register (spoilage, burnt, expiry, staff meal, …)
- Physical stock counts with expected vs physical vs variance (Rs.); variances above Rs. 5,000/line require **Super Admin approval** (Kitchen Manager creates request → Admin approves/rejects → stock updated via ledger)
- Recipes are versioned (history never destroyed) and drive Food Cost % / gross margin per menu item
- Backend RBAC: every `/api/kitchen/*` endpoint = `authenticateUser → requireKitchenPermission → controller`; cashiers get 403, and Kitchen Managers get 403 on ALL Super Admin endpoints (users, inventory, reports, settings, backups, …)
- All kitchen activity audit-logged (`KITCHEN_*` actions) in the existing Audit Logs
- Super Admin keeps complete control: manage Kitchen Manager accounts (Users) and the full kitchen module incl. approvals (Admin → Food & Kitchen)

### Inventory & Stock Control
- Real-time inventory with low-stock & out-of-stock alerts
- Stock In / Stock Out / Adjustment with audit trail
- Stock movement history (opening, purchase, sale, adjustment, damaged, expired, return)
- Allow / Disallow negative stock (configurable)
- Daily Stock Sheet (Physical register reconciliation) - matches paper format: In-Hand, Received, Stock, Balance, Sold, Value
- Physical audit reconciliation

### Reports & Analytics
- Sales analytics with date range, cashier filter
- Payment breakdown, top selling products, cashier performance
- Daily Stock Sheet export (Excel)
- Bills & Invoices with void/restore
- Audit logs with pagination & export

### v1.4.0 — Hotel Functions & Events (Function Hall Bookings)
- **New Functions & Events module enterable from the POS register** — the sidebar FUNCTIONS button opens function hall cards and event bookings for cashiers & admins alike
- Function halls (Grand Ballroom, Garden Lawns, Conference Hall seeded) with capacity, per-booking rates, amenities and maintenance status — hall master data managed by Super Admin (Admin → Functions & Events)
- Full booking lifecycle in the POS: create (wedding / birthday / meeting / party / corporate / other + day/evening/full-day session), same-date double-booking guard, per-plate food charge, extra services, advance payments, event completion with final settlement, and cancellation
- Thermal **Function Booking Ticket** printing (58mm/80mm) with event details, charges and advance/balance — auto-print after payment when enabled
- Audit-logged (`FUNCTION_*` actions) and RBAC-guarded: any role can book & settle events; only Super Admin can create/edit/delete halls
- Endpoints: `/api/function-halls`, `/api/function-bookings` (+ `/:id/payment`, `/:id/checkout`, `/:id/cancel`) — 21/21 new E2E checks under `tests/e2e/e2e-functions.mjs` (full suite still green)

### v1.3.0 — AI System Health Check (Gemini)
- **Gemini-powered health assistant** (optional, server-side): the Super Admin dashboard's **AI System Health Check** card runs a live snapshot of the `whole` system — DB writability, low/out-of-stock variants, today's revenue & bills, active room bookings, held bills, pending KOTs, kitchen ingredients — and asks the Gemini LLM to return a plain-English health report (status, issues, recommended actions).
- **Degrades gracefully without a key**: with no `GEMINI_API_KEY` the same endpoint returns a deterministic **rule-based** report (same schema), so the Super Admin always sees a status plus a clear prompt to set the key for AI analysis.
- **Informs the Super Admin in-app**: results persist to the database and render as a status banner (all systems healthy / attention required / critical) with issues & recommended actions — no external services required.
- Endpoints: `GET /api/ai/health-check` (latest report) and `POST /api/ai/health-check` (run a fresh check, Super Admin only). A rule-based report is seeded on boot so the card is never empty.
- Configure via `GEMINI_API_KEY` (get one at https://aistudio.google.com/apikey) and optional `GEMINI_MODEL` (default `gemini-3.6-flash`). The retired `gemini-2.0-flash` value is automatically remapped to the new default.

### v1.1.2 — Recipe Stock-Impact & Verification
- **Live stock impact in the recipe editor**: every ingredient row shows "1 portion deducts −X · Stock A → B" (green when enough, red when short)
- **Stock Check panel**: verify ANY number of portions against current material stock before saving the recipe (need / stock / short, total cost)
- **`GET /api/kitchen/recipes/:id/impact?portions=N`** — server-side verify endpoint
- **Per-portion materials verified end-to-end**: two portions of one dish with different materials deduct only their own materials on sale (21/21 new E2E checks; total suite 117/117)

### v1.1.1 — Stock-Integrity & Data-Consistency Fixes
- **Bill void now restores EXACT sale-time kitchen ingredient deductions** (snapshot stored on the bill) — editing/archiving a recipe after a sale no longer over/under-restores ingredients on void
- **Service charge rate persisted per bill** (`bill.serviceChargeRate`) — receipts, PDF invoices and the receipt modal show the rate that was in effect at sale time, not the current setting
- **Per-item client discounts ignored server-side** — stored line totals always match the amount actually charged (keeps `Σ items = subtotal` invariant)
- **96/96 E2E regression tests** under `tests/e2e/` (POS, shots, voids, rooms, KOT, kitchen RBAC, recipe deduction, approvals)

### Security (Fixed in v1.1.0)
- **Removed critical backdoor**: legacy `pos_tok_` tokens that granted admin access removed
- HMAC-signed tokens with `rh_` prefix, timing-safe comparison
- Helmet security headers
- Rate limiting (global 500/15min, auth 30/15min)
- Brute-force protection with IP-based lockout & auto-cleanup
- Revoked token list with TTL cleanup (no memory leak)
- Input validation with Zod
- Secure password hashing with bcrypt async
- CORS configured properly
- Path traversal protection for backup restore
- XSS protection via HTML escaping

### Other Fixes
- Fixed grandTotal rounding: now preserves 2 decimal precision instead of Math.round
- Fixed discount validation against max discount percentage
- Fixed held bills consuming BILL sequence (now HOLD-)
- Fixed stock validation in all paths (IN, OUT, ADJUST)
- Fixed KOT status transition validation
- Fixed token key inconsistency (pos_auth_token everywhere)
- Fixed vite.config alias `@` → `./src`
- Fixed tsconfig strict mode
- Added ErrorBoundary for UI crash protection
- Added health check endpoint `/api/health`
- Added debounced save, atomic file writes with fsync
- Updated branding to Royal Hotel (configurable via settings / env)
- Improved .gitignore (data/, backups ignored)
- Removed unused @google/genai dependency

## 🚀 Quick Start

### Prerequisites
- Node.js >= 22
- npm or bun

### Installation

```bash
# Clone
git clone https://github.com/abrathnayaka1-cyber/Royal-Hotel-POS.git
cd Royal-Hotel-POS

# Install dependencies
npm install

# Copy env example
cp .env.example .env

# Edit .env and set SESSION_SECRET (generate with: openssl rand -hex 64)
# SESSION_SECRET=your_very_long_random_secret_here

# Run development (Express + Vite middleware)
npm run dev
```

App runs at `http://localhost:3000`

### Default Login
- Username: `Admin`
- Password: `Araliya2000` (development / local only)

> Change password immediately after first login via Admin → Users.
>
> **Production:** if `DEFAULT_ADMIN_PASSWORD` is not set in `.env`, the server
> generates a random one-time Super Admin password and prints it to the server
> log on first boot (it never uses the publicly-known default in production).
> Set `DEFAULT_ADMIN_PASSWORD` to your own strong password instead. The app now
> loads `.env` before the database starts, so this value and `POS_DATA_DIR` are
> applied correctly. An initial Admin account that has never logged in is also
> repaired once if an older release ignored the configured password.

### Locked-out Admin recovery

If the existing Super Admin password is lost, set a temporary recovery value and
restart the server:

```env
ADMIN_PASSWORD_RESET=<a-new-strong-password>
```

Log in with username `Admin`, then **remove `ADMIN_PASSWORD_RESET` and restart
again**. Do not leave it configured: it is an explicit emergency override and can
re-apply on a later restart after the password is changed in the UI. The reset is
recorded in Audit Logs; the password itself is never logged.

### Production Build

```bash
npm run build
npm start
```

- `dist/` contains frontend build
- `data/pos_database.json` contains all data (products, bills, etc)
- `data/backups/` contains auto snapshots (keeps last 30)

### Production Deployment Checklist

Run through this before going live. The server enforces items 1–3 itself and
will refuse to start if they are wrong, rather than failing silently later.

| # | Item | Why |
|---|------|-----|
| 1 | `NODE_ENV=production` | Serves the built `dist/` bundle instead of the Vite dev server |
| 2 | Strong `SESSION_SECRET` (32+ chars, not the placeholder) | **Startup fails otherwise.** Keep it stable or every cashier is logged out on each restart; use the same value on all instances |
| 3 | `POS_DATA_DIR` = writable absolute path outside the deploy folder | Redeploys can't wipe live sales data. **Startup fails if unwritable** |
| 4 | `npm run build` before `npm start` | Startup fails with a clear message if `dist/` is missing |
| 5 | Run behind HTTPS (Nginx/Apache/Cloudflare) | Login tokens must not cross the network in plaintext |
| 6 | Use a process manager (PM2/systemd) with auto-restart | Restarts cleanly on crash; the app handles SIGTERM gracefully |
| 7 | Change the default `Admin` password | Default is publicly documented |
| 8 | Schedule off-machine copies of `POS_DATA_DIR` | Local snapshots don't survive disk loss |

The app resolves `dist/` and its database **relative to the application folder,
not the current working directory**, so PM2 / systemd / cPanel / cron can launch
it from anywhere safely.

#### PM2

```bash
npm ci && npm run build
pm2 start dist/server.cjs --name royal-pos --time
pm2 save && pm2 startup
```

#### systemd

```ini
[Service]
WorkingDirectory=/opt/royal-hotel-pos
EnvironmentFile=/opt/royal-hotel-pos/.env
ExecStart=/usr/bin/node dist/server.cjs
Restart=always
KillSignal=SIGTERM
TimeoutStopSec=20
```

#### Hostinger / Shared Hosting

1. Set env variable `POS_DATA_DIR=/home/uXXXXXX/pos_data` (outside webroot)
2. Upload the whole app folder including the built `dist/` and `server.js` wrapper
3. Ensure `POS_DATA_DIR` is writable by the app user
4. Set `NODE_ENV=production` and a strong `SESSION_SECRET`

### Health Monitoring

`GET /api/health` returns `200` when healthy and **`503` when the database
cannot be written to**, so a load balancer stops sending sales to a node that
can no longer persist them.

```json
{ "status": "ok", "version": "1.1.3", "uptime": 1234.5,
  "database": { "writable": true } }
```

**AI System Health Check (v1.3.0, in-app):** the Super Admin dashboard's
"AI System Health Check" card (`Admin → Dashboard`) runs a deeper, persistent
health report — low/out-of-stock, revenue, bookings, kitchen ingredients,
DB writability — and surfaces it in-app. With a `GEMINI_API_KEY` the report is
written by the Gemini LLM (issues + recommended actions); without one it falls
back to a rule-based summary. A rule-based report is seeded on every boot.

### Data Safety Behaviour

- Saves are atomic (temp file → `fsync` → `rename`), so a power cut cannot leave a half-written database.
- If the database file is ever unreadable, the server **quarantines** it as `pos_database.json.corrupt.<timestamp>`, automatically restores the newest valid file from `data/backups/`, and only then continues.
- If nothing is recoverable it **refuses to start** instead of seeding an empty shop over a real installation.
- `SIGTERM`/`SIGINT` drain in-flight requests and force a final flush to disk.

### Database Backup & Restore

- **Admin → System Settings → Database Backup**
  - Create Snapshot: instant server backup
  - Export DB (JSON): download to local PC
  - Restore: upload JSON to restore 100% data
  - Server snapshots list with rollback

## 📁 Project Structure

```
Royal-Hotel-POS/
├── server/
│   └── db.ts          # File-based JSON DB with atomic writes
├── src/
│   ├── components/
│   │   ├── admin/     # Dashboard, Products, Inventory, Rooms, Reports, etc
│   │   ├── auth/      # LoginScreen
│   │   ├── layout/    # Navbar
│   │   └── pos/       # POSScreen, Cart, ProductGrid, Modals, etc
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── POSContext.tsx
│   ├── lib/
│   │   ├── api.ts     # Secure fetch wrapper with 401/429 handling
│   │   ├── exportUtils.ts
│   │   └── printEngine.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
├── server.ts          # Express + Vite + Security hardened
├── vite.config.ts
└── package.json
```

## 🔒 Security Notes

- Set `SESSION_SECRET` in production (64+ chars random)
- Set `DEFAULT_ADMIN_PASSWORD` (or the server generates a random one on first boot)
- Optionally pin `CORS_ORIGINS` in production
- Use HTTPS in production
- Regularly backup `data/pos_database.json` (and keep off-machine copies)
- Review audit logs in Admin → Audit Logs
- Disable negative stock if you want strict inventory
- Change the default `Admin` password immediately after first login

> ⚠️ **Legacy PHP backend** (`api/` + `config/`): these files are a separate,
> older MySQL-based backend. If you deploy them on a PHP host, set
> `INIT_ADMIN_SECRET` and `CORS_ORIGINS`, and see `SECURITY-AUDIT.md`. They are
> **not used** by the Node server (`server.ts`).

## 📝 License

MIT

## 👨‍💻 Author

Royal Hotel POS v1.1.0 - Fixed & Secured Edition
