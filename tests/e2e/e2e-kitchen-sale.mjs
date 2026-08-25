/* Kitchen ingredient auto-deduction on POS sale + void restore */
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

// 1. Category + kitchen product
const cat = await api('/api/categories', { method: 'POST', body: { name: `KitCat-${uniq}` } }, token);
const catId = cat.json?.id;
const prod = await api('/api/products', {
  method: 'POST',
  body: {
    name: `FriedRice-${uniq}`, categoryId: catId, isKitchenItem: true,
    variants: [{ size: 'Portion', sellingPrice: 1200, stock: 100, costPrice: 600 }],
  },
}, token);
check('create kitchen product', prod.status === 201, `got ${prod.status} ${JSON.stringify(prod.json)?.slice(0, 150)}`);
const variantId = prod.json?.variants?.[0]?.id;

// 2. Ingredient
const ing = await api('/api/kitchen/ingredients', {
  method: 'POST',
  body: { name: `RiceIng-${uniq}`, unit: 'g', currentStock: 10000, minStockLevel: 1000, costPerUnit: 250 },
}, token);
const ingId = ing.json?.id;
check('create ingredient', ing.status === 201, `got ${ing.status}`);

// 3. Recipe linking product variant -> 250g rice per portion
const recipe = await api('/api/kitchen/recipes', {
  method: 'POST',
  body: { name: `RR-${uniq}`, variantId, servings: 1, items: [{ ingredientId: ingId, quantity: 250 }] },
}, token);
check('create recipe (250g rice per portion)', recipe.status === 201, `got ${recipe.status} ${JSON.stringify(recipe.json)}`);

// 4. Sell 3 portions through POS checkout
const sale = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 3 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
check('sale of 3 portions', sale.status === 201, `got ${sale.status} ${JSON.stringify(sale.json)?.slice(0, 200)}`);
const billId = sale.json?.id;
check('grandTotal = 3 x 1200 + 10% = 3960', Math.abs((sale.json?.grandTotal ?? 0) - 3960) < 0.01, `got ${sale.json?.grandTotal}`);

// 5. Ingredient deducted 10000 -> 9250
const ings1 = await api('/api/kitchen/ingredients', {}, token);
const ing1 = ings1.json?.find(i => i.id === ingId);
check('ingredient deducted 10000 -> 9250', ing1?.currentStock === 9250, `got ${JSON.stringify(ing1)}`);

// 6. Kitchen movements ledger has the deduction
const movs = await api('/api/kitchen/movements', {}, token);
const saleMov = (movs.json?.items || movs.json || []).find(m => m.ingredientId === ingId && m.movementType === 'sale');
check('kitchen movement ledger records deduction', !!saleMov && saleMov.quantityChange === -750, JSON.stringify(saleMov)?.slice(0, 200));

// 7. Not enough ingredients -> checkout blocked
const ing2 = await api('/api/kitchen/ingredients', { method: 'POST', body: { name: `LowIng-${uniq}`, unit: 'g', currentStock: 100, minStockLevel: 0, costPerUnit: 10 } }, token);
const ing2Id = ing2.json?.id;
const recipe2 = await api(`/api/kitchen/recipes/${recipe.json?.id}`, {
  method: 'PUT',
  body: { name: `RR-${uniq}`, variantId, servings: 1, items: [
    { ingredientId: ingId, quantity: 250 },
    { ingredientId: ing2Id, quantity: 500 },
  ] },
}, token);
check('recipe updated with 2nd ingredient (500g)', recipe2.status === 200, `got ${recipe2.status} ${JSON.stringify(recipe2.json)}`);
const blockedSale = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
check('checkout blocked when ingredient short (400)', blockedSale.status === 400, `got ${blockedSale.status} ${JSON.stringify(blockedSale.json)}`);
// product stock unchanged (still 97: 100 - 3 from the earlier successful sale)
const prods = await api('/api/products', {}, token);
const p = prods.json?.find(x => x.id === prod.json?.id);
check('product stock unchanged after blocked sale (97)', p?.variants?.[0]?.stock === 97, `got ${JSON.stringify(p?.variants?.[0]?.stock)}`);

// 8. Void the bill -> ingredient restored
const voidRes = await api(`/api/bills/${billId}/void`, { method: 'POST', body: { reason: 'kitchen restore test' } }, token);
check('void bill', voidRes.status === 200, `got ${voidRes.status} ${JSON.stringify(voidRes.json)}`);
const ings2 = await api('/api/kitchen/ingredients', {}, token);
const ing3 = ings2.json?.find(i => i.id === ingId);
check('ingredient restored 9250 -> 10000', ing3?.currentStock === 10000, `got ${JSON.stringify(ing3)}`);

// Cleanup
await api(`/api/products/${prod.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/categories/${catId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/kitchen/ingredients/${ingId}`, { method: 'DELETE' }, token).catch(() => {});
await api(`/api/kitchen/ingredients/${ing2Id}`, { method: 'DELETE' }, token).catch(() => {});
if (recipe.json?.id) await api(`/api/kitchen/recipes/${recipe.json.id}/archive`, { method: 'PATCH' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
