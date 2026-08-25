# Royal Hotel POS - Bar, Restaurant & Hotel Management System

> Commercial-grade Point of Sale system with multi-size bottle variants, hotel room management, daily stock sheet reconciliation, inventory, KOT, billing, and reporting.

![Version](https://img.shields.io/badge/version-1.1.2-blue)
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
- Password: `Araliya2000`

> Change password immediately after first login via Admin → Users

### Production Build

```bash
npm run build
npm start
```

- `dist/` contains frontend build
- `data/pos_database.json` contains all data (products, bills, etc)
- `data/backups/` contains auto snapshots (keeps last 30)

### Hostinger / Shared Hosting Deployment

1. Set env variable `POS_DATA_DIR=/home/uXXXXXX/pos_data` (outside webroot)
2. Upload `dist/` and `server.js` wrapper
3. Ensure `data/` directory is writable
4. Set `NODE_ENV=production` and strong `SESSION_SECRET`

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
- Use HTTPS in production
- Regularly backup `data/pos_database.json`
- Review audit logs in Admin → Audit Logs
- Disable negative stock if you want strict inventory

## 📝 License

MIT

## 👨‍💻 Author

Royal Hotel POS v1.1.0 - Fixed & Secured Edition
