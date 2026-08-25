# E2E Regression Tests — Royal Hotel POS

Live API tests that exercise the running server on `http://localhost:3000`.
They create their own data (products, categories, users, bookings, …) and
clean up after themselves, so they are safe to run repeatedly.

## Requirements

- Server running: `npm run dev` (or `npm start` after `npm run build`)
- Default admin login must be `Admin` / `Araliya2000`

## Run

```bash
# All suites
for t in tests/e2e/*.mjs; do node "$t"; done

# Single suite
node tests/e2e/e2e-test.mjs
```

## Suites

| File | Coverage |
|---|---|
| `e2e-test.mjs` | Login, product/category CRUD, checkout math (service charge), stock deduction, oversell/tamper/negative-qty blocking, void + stock restore, hold bills, KOT lifecycle + invalid transitions, room booking + double-booking guard + checkout, reports & daily stock sheet, cashier 403s |
| `e2e-edge.mjs` | Discount clamp (maxDiscountPercentage), change-password without current password, double void, cashier room-rate 403 / status 200, held-bill consumption on checkout, shot/peg 750ml pool math (sell/oversell/void restore), damage report + daily stock sheet reconciliation, hold discount, settings validation, unauthenticated 401 |
| `e2e-kitchen.mjs` | Kitchen Manager role: login, RBAC isolation (users/settings-write 403, kitchen 200), ingredient CRUD, stock-in, recipes, wastage, physical counts (auto-apply vs approval), approval workflow (KM 403 / admin 200), food cost, kitchen reports, cashier 403 |
| `e2e-kitchen-sale.mjs` | Recipe auto-deduction on POS checkout (ledger records), blocked checkout when ingredients are short (product stock untouched), void restores ingredients exactly |
| `e2e-recipe-snapshot.mjs` | Void restores **exact sale-time** kitchen deductions from the bill snapshot even when the recipe was archived or edited afterwards |

> Note: `data/pos_database.json` is git-ignored; to start from a clean seed,
> stop the server, delete `data/pos_database.json`, and restart.
