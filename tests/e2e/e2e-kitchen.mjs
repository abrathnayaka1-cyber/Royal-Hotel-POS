/* Kitchen module E2E — Royal Hotel POS */
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

// 1. Create kitchen manager user
const km = await api('/api/users', {
  method: 'POST',
  body: { username: `km${uniq}`, name: 'KM Test', password: 'KMpass123!', role: 'kitchen_manager' },
}, token);
check('create kitchen_manager', km.status === 201, `got ${km.status} ${JSON.stringify(km.json)}`);
const kmLogin = await api('/api/auth/login', { method: 'POST', body: { username: km.json?.username, password: 'KMpass123!' } });
const kmToken = kmLogin.json?.token;
check('kitchen manager login', kmLogin.status === 200, `got ${kmLogin.status}`);

// 2. Permission isolation
const kmUsers = await api('/api/users', {}, kmToken);
check('KM blocked from users (403)', kmUsers.status === 403, `got ${kmUsers.status}`);
const kmSettings = await api('/api/settings', { method: 'PUT', body: { businessName: 'Hacked' } }, kmToken);
check('KM blocked from settings WRITE (403)', kmSettings.status === 403, `got ${kmSettings.status}`);
const kmKitchen = await api('/api/kitchen/ingredients', {}, kmToken);
check('KM allowed kitchen ingredients (200)', kmKitchen.status === 200, `got ${kmKitchen.status}`);
const adminKitchen = await api('/api/kitchen/ingredients', {}, token);
check('Admin allowed kitchen ingredients (200)', adminKitchen.status === 200, `got ${adminKitchen.status}`);

// 3. Ingredient create (as KM)
const ing = await api('/api/kitchen/ingredients', {
  method: 'POST',
  body: { name: `Rice-${uniq}`, unit: 'g', currentStock: 5000, minStockLevel: 1000, costPerUnit: 250 },
}, kmToken);
check('create ingredient (KM)', ing.status === 201, `got ${ing.status} ${JSON.stringify(ing.json)}`);
const ingId = ing.json?.id;

// 4. Stock in (KM)
const stockIn = await api('/api/kitchen/stock-in', {
  method: 'POST',
  body: { ingredientId: ingId, quantity: 2000, costPerUnit: 260, reason: 'E2E stock in', supplier: 'Test Supplier' },
}, kmToken);
check('kitchen stock-in', stockIn.status === 200 || stockIn.status === 201, `got ${stockIn.status} ${JSON.stringify(stockIn.json)}`);

// 5. Ingredient updated stock
const ings = await api('/api/kitchen/ingredients', {}, kmToken);
const ingRow = ings.json?.find(i => i.id === ingId);
check('ingredient stock = 7000', ingRow?.currentStock === 7000, `got ${JSON.stringify(ingRow)}`);

// 6. Create recipe + menu item link (own product to avoid polluting shared catalogue)
const menuItem = await api('/api/kitchen/menu-items', {}, kmToken);
check('menu-items list ok', menuItem.status === 200, `got ${menuItem.status}`);
const kitCat = await api('/api/categories', { method: 'POST', body: { name: `KitCat-${uniq}` } }, token);
const kitCatId = kitCat.json?.id;
const kitProd = await api('/api/products', {
  method: 'POST',
  body: { name: `KitDish-${uniq}`, categoryId: kitCatId, isKitchenItem: true, variants: [{ size: 'Portion', sellingPrice: 800, stock: 50, costPrice: 300 }] },
}, token);
check('create own kitchen product', kitProd.status === 201, `got ${kitProd.status} ${JSON.stringify(kitProd.json)}`);
const target = kitProd.json;

if (target) {
  const variantId = target.variants?.find(v => v.isActive)?.id;
  const recipe = await api('/api/kitchen/recipes', {
    method: 'POST',
    body: {
      name: `Recipe-${uniq}`,
      variantId,
      servingSize: '1 portion',
      servings: 1,
      items: [{ ingredientId: ingId, quantity: 250 }],
    },
  }, kmToken);
  check('create recipe', recipe.status === 201, `got ${recipe.status} ${JSON.stringify(recipe.json)}`);
  const recipeId = recipe.json?.id;

  // 7. Wastage (KM)
  const waste = await api('/api/kitchen/wastage', {
    method: 'POST',
    body: { ingredientId: ingId, quantity: 100, category: 'Spoilage', reason: 'E2E spoilage test' },
  }, kmToken);
  check('create wastage', waste.status === 201, `got ${waste.status} ${JSON.stringify(waste.json)}`);

  // 8. Physical count with small variance (no approval needed)
  const count = await api('/api/kitchen/counts', {
    method: 'POST',
    body: {
      lines: [{ ingredientId: ingId, physical: 6800 }],
      notes: 'E2E count',
    },
  }, kmToken);
  check('physical count (small variance auto-applied)', count.status === 201, `got ${count.status} ${JSON.stringify(count.json)}`);

  // 9. Large variance -> requires admin approval
  const bigCount = await api('/api/kitchen/counts', {
    method: 'POST',
    body: {
      lines: [{ ingredientId: ingId, physical: 1000 }],
      notes: 'E2E big variance',
    },
  }, kmToken);
  check('large variance creates approval request', bigCount.status === 201, `got ${bigCount.status} ${JSON.stringify(bigCount.json)}`);

  const requests = await api('/api/kitchen/requests', {}, kmToken);
  const pendingReq = requests.json?.find(r => r.status === 'pending');
  check('pending request exists', !!pendingReq, JSON.stringify(requests.json)?.slice(0, 300));

  if (pendingReq) {
    // KM cannot approve (only super admin)
    const kmApprove = await api(`/api/kitchen/requests/${pendingReq.id}/approve`, { method: 'POST', body: {} }, kmToken);
    check('KM cannot approve (403)', kmApprove.status === 403, `got ${kmApprove.status}`);
    const adminApprove = await api(`/api/kitchen/requests/${pendingReq.id}/approve`, { method: 'POST', body: {} }, token);
    check('admin approves', adminApprove.status === 200, `got ${adminApprove.status} ${JSON.stringify(adminApprove.json)}`);
  }

  // 10. Food cost
  const fc = await api('/api/kitchen/food-cost', {}, kmToken);
  check('food cost ok', fc.status === 200, `got ${fc.status}`);

  // 11. Kitchen reports
  const kr = await api('/api/kitchen/reports', {}, kmToken);
  check('kitchen reports ok', kr.status === 200, `got ${kr.status}`);
}

// 12. Cashier blocked from kitchen
const cash = await api('/api/users', { method: 'POST', body: { username: `cash${uniq}`, name: 'Cash K', password: 'Cashier123', role: 'cashier' } }, token);
if (cash.status === 201) {
  const cl = await api('/api/auth/login', { method: 'POST', body: { username: cash.json?.username, password: 'Cashier123' } });
  const kd = await api('/api/kitchen/dashboard', {}, cl.json?.token);
  check('cashier blocked from kitchen (403)', kd.status === 403, `got ${kd.status}`);
  await api(`/api/users/${cash.json?.id}`, { method: 'DELETE' }, token).catch(() => {});
}

// Cleanup
if (km.json?.id) await api(`/api/users/${km.json.id}`, { method: 'DELETE' }, token).catch(() => {});
if (ingId) await api(`/api/kitchen/ingredients/${ingId}`, { method: 'DELETE' }, token).catch(() => {});
if (kitProd.json?.id) await api(`/api/products/${kitProd.json.id}`, { method: 'DELETE' }, token).catch(() => {});
if (kitCatId) await api(`/api/categories/${kitCatId}`, { method: 'DELETE' }, token).catch(() => {});

console.log(results.join('\n'));
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
