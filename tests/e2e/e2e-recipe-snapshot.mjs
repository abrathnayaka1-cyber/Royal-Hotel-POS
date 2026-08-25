/* Verify: void restores EXACT sale-time kitchen deductions even if the recipe changed/archived */
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

const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
const token = login.json?.token;
const uniq = Date.now();

const cat = await api('/api/categories', { method: 'POST', body: { name: `SnapCat-${uniq}` } }, token);
const catId = cat.json?.id;
const prod = await api('/api/products', {
  method: 'POST',
  body: { name: `SnapProd-${uniq}`, categoryId: catId, isKitchenItem: true, variants: [{ size: 'Portion', sellingPrice: 500, stock: 50, costPrice: 200 }] },
}, token);
const variantId = prod.json?.variants?.[0]?.id;

const ing = await api('/api/kitchen/ingredients', { method: 'POST', body: { name: `SnapIng-${uniq}`, unit: 'g', currentStock: 5000, minStockLevel: 100, costPerUnit: 100 } }, token);
const ingId = ing.json?.id;

const recipe = await api('/api/kitchen/recipes', {
  method: 'POST',
  body: { name: `SnapR-${uniq}`, variantId, servings: 1, items: [{ ingredientId: ingId, quantity: 250 }] },
}, token);
const recipeId = recipe.json?.id;
check('recipe created (250g/portion)', recipe.status === 201, `got ${recipe.status}`);

// Sale of 3 portions -> deduct 750g
const sale = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 3 }], paymentMethod: 'cash', amountReceived: 5000 },
}, token);
const billId = sale.json?.id;
check('sale of 3 portions', sale.status === 201, `got ${sale.status}`);

// Bill carries the deduction snapshot
check('bill.kitchenDeductions snapshot = 750g',
  Array.isArray(sale.json?.kitchenDeductions) && sale.json.kitchenDeductions.length === 1 && sale.json.kitchenDeductions[0].quantity === 750 && sale.json.kitchenDeductions[0].ingredientId === ingId,
  JSON.stringify(sale.json?.kitchenDeductions));

let ings = await api('/api/kitchen/ingredients', {}, token);
check('ingredient 5000 -> 4250 after sale', ings.json?.find(i => i.id === ingId)?.currentStock === 4250, JSON.stringify(ings.json?.find(i => i.id === ingId)));

// NOW archive the recipe (worst case: old code would restore NOTHING)
const arch = await api(`/api/kitchen/recipes/${recipeId}/archive`, { method: 'PATCH', body: {} }, token);
check('recipe archived', arch.status === 200, `got ${arch.status} ${JSON.stringify(arch.json)}`);

// Void the bill -> must restore exactly 750g from the snapshot
const vv = await api(`/api/bills/${billId}/void`, { method: 'POST', body: { reason: 'snapshot restore test' } }, token);
check('void bill', vv.status === 200, `got ${vv.status} ${JSON.stringify(vv.json)}`);

ings = await api('/api/kitchen/ingredients', {}, token);
check('ingredient restored 4250 -> 5000 EXACTLY (not 0, not 1000)',
  ings.json?.find(i => i.id === ingId)?.currentStock === 5000,
  JSON.stringify(ings.json?.find(i => i.id === ingId)));

// Scenario 2: recipe EDITED after sale -> still restores sale-time qty
const prod2 = await api('/api/products', {
  method: 'POST',
  body: { name: `SnapProd2-${uniq}`, categoryId: catId, isKitchenItem: true, variants: [{ size: 'Portion', sellingPrice: 500, stock: 50, costPrice: 200 }] },
}, token);
const variant2 = prod2.json?.variants?.[0]?.id;
const recipe2 = await api('/api/kitchen/recipes', {
  method: 'POST',
  body: { name: `SnapR2-${uniq}`, variantId: variant2, servings: 1, items: [{ ingredientId: ingId, quantity: 100 }] },
}, token);
const sale2 = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: variant2, quantity: 2 }], paymentMethod: 'cash', amountReceived: 5000 },
}, token);
const bill2 = sale2.json?.id;
// edit recipe to 400g before void
const editR = await api(`/api/kitchen/recipes/${recipe2.json?.id}`, {
  method: 'PUT',
  body: { name: `SnapR2-${uniq}`, variantId: variant2, servings: 1, items: [{ ingredientId: ingId, quantity: 400 }] },
}, token);
check('recipe edited to 400g', editR.status === 200, `got ${editR.status}`);
const vv2 = await api(`/api/bills/${bill2}/void`, { method: 'POST', body: { reason: 'edited recipe restore' } }, token);
check('void bill 2', vv2.status === 200, `got ${vv2.status}`);
ings = await api('/api/kitchen/ingredients', {}, token);
// before: 5000. sale2 deducted 200g -> 4800. void must restore 200g -> 5000 (not 800g!)
check('ingredient restored to 5000 (sale-time 200g, not edited 800g)',
  ings.json?.find(i => i.id === ingId)?.currentStock === 5000,
  JSON.stringify(ings.json?.find(i => i.id === ingId)));

// Cleanup
await api(`/api/products/${prod.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/products/${prod2.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/kitchen/ingredients/${ingId}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
