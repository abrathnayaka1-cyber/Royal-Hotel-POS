/* E2E — 750ml bottle shot-pool verification (Rockland Old (Gal) 750ml)
 *
 * Proves the stock-sheet behaviour the operator asked for:
 *   1. The item is labelled like the physical sheet: "Rockland Old (Gal) 750ml" (stock 24).
 *   2. EVERY shot sold (25/50/100ml) visibly reduces the bottle pool's remaining ml.
 *   3. The full-bottle count drops by 1 exactly when a cumulative 750ml has been poured.
 *   4. /api/inventory exposes the same ml numbers the POS shows.
 */
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name} ${extra}`); }
}
async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// 1. Login
const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
check('login works', login.status === 200, `got ${login.status}`);
const token = login.json?.token;

// 2. Find the Rockland Old (Gal) product
const prods = await api('/api/products', {}, token);
const rockland = prods.json?.find((p) => p.id === 'prod-1');
check('product renamed to "Rockland Old (Gal)"', rockland?.name === 'Rockland Old (Gal)', `got ${JSON.stringify(rockland?.name)}`);
const bottle = rockland?.variants?.find((v) => v.id === 'var-1-750');
const shot25 = rockland?.variants?.find((v) => v.id === 'var-1-25');
const shot50 = rockland?.variants?.find((v) => v.id === 'var-1-50');
const shot100 = rockland?.variants?.find((v) => v.id === 'var-1-100');
check('750ml variant size label', bottle?.size === '750ml', `got ${JSON.stringify(bottle?.size)}`);
check('combined label reads "Rockland Old (Gal) 750ml"', `${rockland?.name} ${bottle?.size}` === 'Rockland Old (Gal) 750ml');

/* Reset the shot pool to a KNOWN baseline before measuring anything.
 *
 * The assertions below are absolute (24 bottles = 18,000ml), so a previous run
 * of this suite (or any real sale of this product) used to break every check.
 * Two admin calls put it back: set the bottle count to 24, and clear the
 * partially-poured bottle (toggling `servesShots` off and back on zeroes
 * `openBottleUsedMl` without touching the variants).
 */
const reset = await api('/api/inventory/adjust', {
  method: 'POST',
  body: { variantId: bottle?.id, newStock: 24, reason: 'E2E baseline reset' },
}, token);
check('baseline reset: 750ml stock set to 24', reset.status === 200, `got ${reset.status} ${JSON.stringify(reset.json)?.slice(0, 120)}`);
const off = await api('/api/products/prod-1', { method: 'PUT', body: { servesShots: false } }, token);
const on = await api('/api/products/prod-1', { method: 'PUT', body: { servesShots: true } }, token);
check('baseline reset: open bottle cleared', off.status === 200 && on.status === 200 && (on.json?.openBottleUsedMl ?? 0) === 0,
  `got ${off.status}/${on.status} used=${on.json?.openBottleUsedMl}`);

const baseline = await api('/api/products', {}, token);
const baseProduct = baseline.json?.find((p) => p.id === 'prod-1');
check('starting bottle stock = 24', baseProduct?.variants?.find((v) => v.id === 'var-1-750')?.stock === 24,
  `got ${baseProduct?.variants?.find((v) => v.id === 'var-1-750')?.stock}`);
check('starting pool = 24 × 750 = 18,000ml', baseProduct?.availableShotMl === 18000, `got ${baseProduct?.availableShotMl}`);

// 3. Sell ONE 25ml shot — the pool must drop by exactly 25ml
const state = async () => {
  const r = await api('/api/products', {}, token);
  const p = r.json?.find((x) => x.id === 'prod-1');
  return {
    stock: p?.variants?.find((v) => v.id === 'var-1-750')?.stock,
    pool: p?.availableShotMl,
    used: p?.openBottleUsedMl,
  };
};

const sell = async (items) => {
  const r = await api('/api/bills/checkout', {
    method: 'POST',
    body: { items, orderType: 'dine_in', paymentMethod: 'cash', amountReceived: 10000000, discount: 0 },
  }, token);
  return r;
};

let s = await sell([{ variantId: shot25.id, quantity: 1 }]);
check('sell 1 × 25ml shot', s.status === 201, `got ${s.status} ${JSON.stringify(s.json)?.slice(0, 160)}`);
let after = await state();
check('after 1 shot: pool 18,000 → 17,975ml (−25ml)', after.pool === 17975, `got ${after.pool}`);
check('after 1 shot: open bottle shows 25ml used', after.used === 25, `got ${after.used}`);
check('after 1 shot: bottle count still 24 (750ml not yet poured)', after.stock === 24, `got ${after.stock}`);

// 4. Sell 29 more 25ml shots → cumulative 750ml → one full bottle consumed
s = await sell([{ variantId: shot25.id, quantity: 29 }]);
check('sell 29 × 25ml shots', s.status === 201, `got ${s.status}`);
after = await state();
check('after 750ml poured: bottle count 24 → 23', after.stock === 23, `got ${after.stock}`);
check('after 750ml poured: pool 23 × 750 = 17,250ml', after.pool === 17250, `got ${after.pool}`);
check('after 750ml poured: open bottle resets to 0ml used', after.used === 0, `got ${after.used}`);

// 5. Mixed shots: 1 × 50ml + 2 × 100ml = 250ml more
s = await sell([{ variantId: shot50.id, quantity: 1 }, { variantId: shot100.id, quantity: 2 }]);
check('sell 1 × 50ml + 2 × 100ml shots', s.status === 201, `got ${s.status}`);
after = await state();
check('after mixed shots: 250ml poured from open bottle', after.used === 250, `got ${after.used}`);
check('after mixed shots: pool 17,250 → 17,000ml', after.pool === 17000, `got ${after.pool}`);
check('after mixed shots: bottle count still 23', after.stock === 23, `got ${after.stock}`);

// 6. Inventory API carries the same ml numbers the POS/inventory screens render
const inv = await api('/api/inventory', {}, token);
const bottleRow = inv.json?.find((r) => r.variantId === 'var-1-750');
const shotRow = inv.json?.find((r) => r.variantId === 'var-1-25');
check('inventory: bottle row remainingMl = 17,000', bottleRow?.remainingMl === 17000, `got ${bottleRow?.remainingMl}`);
check('inventory: bottle row openBottleUsedMl = 250', bottleRow?.openBottleUsedMl === 250, `got ${bottleRow?.openBottleUsedMl}`);
check('inventory: 25ml shot row pool = 17,000ml', shotRow?.shotPoolMl === 17000, `got ${shotRow?.shotPoolMl}`);
check('inventory: 25ml shots left = floor(17,000 / 25) = 680', shotRow?.stock === 680, `got ${shotRow?.stock}`);
check('inventory: label "Rockland Old (Gal) 750ml"', `${bottleRow?.productName} ${bottleRow?.size}` === 'Rockland Old (Gal) 750ml');

// 7. Stock movements ledger recorded the full-bottle consumption
const moves = await api('/api/stock-movements', {}, token);
const movesList = Array.isArray(moves.json) ? moves.json : (moves.json?.movements || []);
const shotMoves = movesList.filter((m) => m?.productId === 'prod-1' && String(m?.reason || '').includes('bottle(s)'));
check('stock ledger has the "emptied 1 x 750ml bottle" movement', shotMoves.length >= 1, `got ${shotMoves.length}`);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
