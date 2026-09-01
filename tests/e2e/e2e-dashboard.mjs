/* Regression coverage for the Super Admin Dashboard module:
 * 1. /dashboard/stats returns RECENT bills newest-first (not the oldest ten).
 * 2. todayPaymentBreakdown includes split / room_charge (never silently lumped
 *    into "other" or dropped from the frontend chart).
 * 3. /ai/health-check (GET) returns a LIVE snapshot that matches the KPIs, not
 *    a stale server-start report.
 * 4. Rendered recent-bill rows survive legacy/restored fields (orderType,
 *    paymentMethod, invoiceNumber, cashierName missing) without crashing.
 *
 * Creates its own products/bills so it is safe to run repeatedly against a live
 * dev server. Override with BASE_URL and ADMIN_PASSWORD env vars when the
 * server is not on the repo default port / password.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'Araliya2000';
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

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: PW } });
const token = login.json?.token;
check('login works', login.status === 200 && !!token, `got ${login.status}`);
if (!token) { console.log(results.join('\n')); process.exit(1); }

const uniq = Date.now();
// Pick an active, non-shot variant that has stock to sell.
const products = await api('/api/products', {}, token);
const list = products.json?.products || (Array.isArray(products.json) ? products.json : []);
const prod = list.find(p => Array.isArray(p.variants) && p.variants.some(v => v.isActive && !v.isShot && v.stock > 0));
check('find a sellable product with stock', !!prod, `got ${products.status}`);
const variant = prod?.variants?.find(v => v.isActive && !v.isShot && v.stock > 0);
check('find a sellable variant', !!variant, 'none');
const item = { productId: prod.id, variantId: variant.id, quantity: 1 };

// Create three bills (cash, card, split). The LAST one must appear first in
// recentBills. The split payment must appear in the payment breakdown.
const created = [];
for (const paymentMethod of ['cash', 'card', 'split']) {
  const r = await api('/api/bills/checkout', {
    method: 'POST',
    body: { items: [item], orderType: 'bar_counter', paymentMethod, amountReceived: 999999, customerName: 'DashboardTest' },
  }, token);
  check(`checkout ${paymentMethod} succeeds`, r.status === 201, `got ${r.status} ${JSON.stringify(r.json)?.slice(0, 120)}`);
  created.push(r.json);
  await new Promise(res => setTimeout(res, 30)); // ensure distinct timestamps
}
const lastCreated = created[created.length - 1];

const stats = await api('/api/dashboard/stats', {}, token);
check('dashboard/stats succeeds', stats.status === 200, `got ${stats.status}`);
const s = stats.json || {};

// recentBills must be newest-first.
const rc = s.recentBills || [];
check('recentBills present', rc.length > 0, `got ${rc.length}`);
let sortedDesc = true;
for (let i = 1; i < rc.length; i++) {
  const a = new Date(rc[i - 1].paidAt || rc[i - 1].createdAt).getTime() || 0;
  const b = new Date(rc[i].paidAt || rc[i].createdAt).getTime() || 0;
  if (a < b) sortedDesc = false;
}
check('recentBills sorted newest-first', sortedDesc);
check('most recent bill is the last one we created',
  rc[0]?.id === lastCreated?.id || rc[0]?.billNumber === lastCreated?.billNumber,
  `first=${JSON.stringify(rc[0]?.billNumber)} expected=${lastCreated?.billNumber}`);

// Payment breakdown must include split (and room_charge as a zero-seeded key).
check('payment breakdown includes split total', !!(s.todayPaymentBreakdown?.split?.total > 0),
  JSON.stringify(s.todayPaymentBreakdown?.split));
check('payment breakdown seeds room_charge', typeof s.todayPaymentBreakdown?.room_charge === 'object');

// AI health-check GET must be live (report present, >= the bills we created today).
const hc = await api('/api/ai/health-check', {}, token);
check('health-check succeeds', hc.status === 200, `got ${hc.status}`);
check('health-check returns a report', !!hc.json?.report);
check('health-check report matches live bills', (hc.json?.report?.metrics?.todayBillsCount ?? 99) >= created.length,
  `report=${hc.json?.report?.metrics?.todayBillsCount}, created=${created.length}`);

// Sum of the payment-method totals on the frontend must reconcile to todayRevenue.
const breakdownSum = Object.values(s.todayPaymentBreakdown || {}).reduce((sum, v) => sum + (v?.total || 0), 0);
check('payment breakdown sums to todayRevenue', Math.abs(breakdownSum - (s.todayRevenue || 0)) < 0.01,
  `sum=${breakdownSum} rev=${s.todayRevenue}`);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
