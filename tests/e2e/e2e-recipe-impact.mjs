/* E2E: per-portion recipes deduct their OWN materials + stock-impact endpoint */
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
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const getStock = async (token, id) => {
  const r = await api('/api/kitchen/ingredients', {}, token);
  return r.json.find(i => i.id === id)?.currentStock;
};

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
const token = login.json?.token;
const uniq = Date.now();

// 1. Product with TWO portions (variants) — same dish, different materials
const cat = await api('/api/categories', { method: 'POST', body: { name: `ImpCat-${uniq}` } }, token);
const catId = cat.json?.id;
const prod = await api('/api/products', {
  method: 'POST',
  body: {
    name: `ImpDish-${uniq}`, categoryId: catId, isKitchenItem: true,
    variants: [
      { size: 'Regular Portion', sellingPrice: 900, stock: 50, costPrice: 300 },
      { size: 'Full Portion (Large)', sellingPrice: 1600, stock: 50, costPrice: 550 },
    ],
  },
}, token);
const [vReg, vFull] = prod.json?.variants || [];
check('product with 2 portions created', !!vReg && !!vFull, JSON.stringify(prod.json)?.slice(0, 150));

// 2. Two ingredients
const rice = await api('/api/kitchen/ingredients', { method: 'POST', body: { name: `RiceImp-${uniq}`, unit: 'g', currentStock: 10000, minStockLevel: 100, costPerUnit: 250 } }, token);
const chicken = await api('/api/kitchen/ingredients', { method: 'POST', body: { name: `ChickenImp-${uniq}`, unit: 'g', currentStock: 5000, minStockLevel: 50, costPerUnit: 800 } }, token);
check('ingredients created', rice.status === 201 && chicken.status === 201, JSON.stringify([rice.status, chicken.status]));

// 3. DIFFERENT recipes per portion
const recReg = await api('/api/kitchen/recipes', {
  method: 'POST',
  body: { name: `RR-${uniq}`, variantId: vReg.id, servings: 1, items: [{ ingredientId: rice.json?.id, quantity: 250 }] },
}, token);
const recFull = await api('/api/kitchen/recipes', {
  method: 'POST',
  body: { name: `RF-${uniq}`, variantId: vFull.id, servings: 1, items: [
    { ingredientId: rice.json?.id, quantity: 400 },
    { ingredientId: chicken.json?.id, quantity: 150 },
  ] },
}, token);
check('recipes created for both portions', recReg.status === 201 && recFull.status === 201, JSON.stringify([recReg.status, recFull.status]));

// 4. GET /api/kitchen/recipes carries stockImpact
const recs = await api('/api/kitchen/recipes', {}, token);
const reg = recs.json.find(r => r.id === recReg.json?.id);
const full = recs.json.find(r => r.id === recFull.json?.id);
check('stockImpact present on Regular', Array.isArray(reg?.stockImpact) && reg.stockImpact[0]?.perPortion === 250 && reg.stockImpact[0]?.availableStock === 10000 && reg.stockImpact[0]?.sufficientForOne === true, JSON.stringify(reg?.stockImpact));
check('stockImpact present on Full (2 lines)', full?.stockImpact?.length === 2 && full.stockImpact[0]?.perPortion === 400 && full.stockImpact[1]?.perPortion === 150, JSON.stringify(full?.stockImpact));

// 5. Impact endpoint — sufficient for 1, insufficient for huge batch
const imp1 = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=1`, {}, token);
check('impact 1 portion: need 250g, allSufficient', imp1.status === 200 && imp1.json?.items?.[0]?.neededForPortions === 250 && imp1.json?.allSufficient === true, JSON.stringify(imp1.json));
const imp40 = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=40`, {}, token);
check('impact 40 portions: need 10000g, sufficient (exact)', imp40.json?.items?.[0]?.neededForPortions === 10000 && imp40.json?.allSufficient === true, JSON.stringify(imp40.json));
const imp41 = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=41`, {}, token);
check('impact 41 portions: short 250g, NOT sufficient', imp41.json?.items?.[0]?.shortBy === 250 && imp41.json?.allSufficient === false, JSON.stringify(imp41.json));
const impBad = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=0`, {}, token);
check('impact portions=0 defaults to 1', impBad.json?.portions === 1, JSON.stringify(impBad.json));
const impFull = await api(`/api/kitchen/recipes/${recFull.json?.id}/impact?portions=10`, {}, token);
check('impact Full 10 portions: rice 4000g + chicken 1500g', impFull.json?.items?.[0]?.neededForPortions === 4000 && impFull.json?.items?.[1]?.neededForPortions === 1500, JSON.stringify(impFull.json?.items));
const riceCost = rice.json?.costPerUnit, chickenCost = chicken.json?.costPerUnit;
check('impact Full 10 portions cost = 4000*riceCost + 1500*chickenCost',
  Math.abs(impFull.json?.totalCostForPortions - (4000 * riceCost + 1500 * chickenCost)) < 0.01,
  `got ${impFull.json?.totalCostForPortions}, expected ${4000 * riceCost + 1500 * chickenCost}`);

// 6. SELL 1 Regular → ONLY rice deducts (chicken untouched)
const sReg = await api('/api/bills/checkout', { method: 'POST', body: { items: [{ variantId: vReg.id, quantity: 1 }], paymentMethod: 'cash', amountReceived: 5000 } }, token);
check('sale 1 Regular ok', sReg.status === 201, `got ${sReg.status}`);
check('rice 10000 -> 9750 after Regular sale', (await getStock(token, rice.json?.id)) === 9750, `got ${await getStock(token, rice.json?.id)}`);
check('chicken UNCHANGED 5000 after Regular sale', (await getStock(token, chicken.json?.id)) === 5000, `got ${await getStock(token, chicken.json?.id)}`);

// 7. SELL 1 Full → rice -400 AND chicken -150
const sFull = await api('/api/bills/checkout', { method: 'POST', body: { items: [{ variantId: vFull.id, quantity: 1 }], paymentMethod: 'cash', amountReceived: 5000 } }, token);
check('sale 1 Full ok', sFull.status === 201, `got ${sFull.status}`);
check('rice 9750 -> 9350 after Full sale', (await getStock(token, rice.json?.id)) === 9350, `got ${await getStock(token, rice.json?.id)}`);
check('chicken 5000 -> 4850 after Full sale', (await getStock(token, chicken.json?.id)) === 4850, `got ${await getStock(token, chicken.json?.id)}`);

// 8. Void both → exact restore
await api(`/api/bills/${sReg.json?.id}/void`, { method: 'POST', body: { reason: 'impact test' } }, token);
await api(`/api/bills/${sFull.json?.id}/void`, { method: 'POST', body: { reason: 'impact test' } }, token);
check('rice restored to 10000', (await getStock(token, rice.json?.id)) === 10000, `got ${await getStock(token, rice.json?.id)}`);
check('chicken restored to 5000', (await getStock(token, chicken.json?.id)) === 5000, `got ${await getStock(token, chicken.json?.id)}`);

// 9. Impact endpoint reflects live stock after the void-restore (10000g again)
const impAfter = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=41`, {}, token);
check('impact reflects live stock (41 portions @ 10000 -> short 250)', impAfter.json?.items?.[0]?.shortBy === 250 && impAfter.json?.allSufficient === false, JSON.stringify(impAfter.json));
const impAfter40 = await api(`/api/kitchen/recipes/${recReg.json?.id}/impact?portions=40`, {}, token);
check('impact reflects live stock (40 portions @ 10000 -> exact OK)', impAfter40.json?.allSufficient === true && impAfter40.json?.items?.[0]?.remainingAfter === 0, JSON.stringify(impAfter40.json));

// Cleanup
await api(`/api/products/${prod.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/kitchen/ingredients/${rice.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/kitchen/ingredients/${chicken.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
if (recReg.json?.id) await api(`/api/kitchen/recipes/${recReg.json.id}/archive`, { method: 'PATCH' }, token).catch(() => {});
if (recFull.json?.id) await api(`/api/kitchen/recipes/${recFull.json.id}/archive`, { method: 'PATCH' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
