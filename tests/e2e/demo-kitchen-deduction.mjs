/* Live demo: Food & Kitchen portion sale -> kitchen materials deduction */
const BASE = 'http://localhost:3000';
async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const login = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
const token = login.json?.token;

// Find the seeded recipe item (Special Chicken Fried Rice / Regular Portion)
const items = await api('/api/kitchen/menu-items', {}, token);
const target = items.json.find(i => i.recipeId);
console.log('Target menu item:', target.productName, '/', target.variantSize, `(selling Rs. ${target.sellingPrice})`);

// Ingredient stock BEFORE
const before = await api('/api/kitchen/ingredients', {}, token);
const stockOf = (id) => before.json.find(i => i.id === id)?.currentStock;
const recipe = await api('/api/kitchen/recipes', {}, token);
const lines = recipe.json.find(r => r.id === target.recipeId).items;
console.log('\nMaterials stock BEFORE sale:');
for (const l of lines) console.log(`  ${l.ingredientName}: ${stockOf(l.ingredientId)}${l.unit}`);

// SELL 2 portions via POS checkout
const sale = await api('/api/bills/checkout', {
  method: 'POST',
  body: { items: [{ variantId: target.variantId, quantity: 2 }], paymentMethod: 'cash', amountReceived: 100000 },
}, token);
console.log(`\nSale: 2 x ${target.productName} -> bill ${sale.json?.billNumber}, grandTotal Rs. ${sale.json?.grandTotal}`);

// Ingredient stock AFTER
const after = await api('/api/kitchen/ingredients', {}, token);
console.log('\nMaterials stock AFTER sale (deduction):');
for (const l of lines) {
  const b = stockOf(l.ingredientId);
  const a = after.json.find(i => i.id === l.ingredientId)?.currentStock;
  console.log(`  ${l.ingredientName}: ${b} -> ${a}  (${a - b} = ${l.quantity} x 2)`);
}

// Kitchen dashboard today stats
const dash = await api('/api/kitchen/dashboard', {}, token);
console.log(`\nKitchen Dashboard (today): foodSales=Rs.${dash.json?.todayFoodSales}, itemsSold=${dash.json?.todayFoodItemsSold}, foodCost=Rs.${dash.json?.todayFoodCost}, foodCostPct=${dash.json?.foodCostPct}%`);

// Kitchen reports: consumption today (movement ledger, aggregated per ingredient)
const rep = await api('/api/kitchen/reports?type=consumption', {}, token);
const rows = rep.json?.rows || [];
console.log(`\nKitchen consumption report (today) — total cost value Rs. ${rep.json?.totalCostValue}`);
for (const r of rows) console.log(`  ${r.ingredientName}: sales=${r.consumedBySales}${r.unit}, wastage=${r.wastage}${r.unit}, stockOut=${r.stockOut}${r.unit} (Rs. ${r.costValue})`);

// Cleanup: void the bill to restore materials
const vv = await api(`/api/bills/${sale.json?.id}/void`, { method: 'POST', body: { reason: 'demo cleanup' } }, token);
const restored = await api('/api/kitchen/ingredients', {}, token);
console.log('\nAfter void (restore check):');
for (const l of lines) {
  const a = restored.json.find(i => i.id === l.ingredientId)?.currentStock;
  console.log(`  ${l.ingredientName}: ${a}${l.unit}`);
}
