/**
 * ============================================================================
 * reset-stock.ts — Set EVERY item's stock to 0 (rebuild stock from scratch)
 * ============================================================================
 *
 * Command-line version of the in-app feature
 * (Admin → Inventory → "Reset All Stock to 0"). Use it on the SERVER when you
 * want to zero all stock without going through the browser — e.g. starting a
 * fresh physical count, a new season, or cleaning up test/demo numbers.
 *
 * WHAT IT DOES (per hotel database):
 *   1. Writes a full backup snapshot (data/backups/) BEFORE changing anything.
 *   2. Sets every non-shot product variant's stock to 0 and clears the
 *      open-bottle (shot pouring) tracker on shot-serving products.
 *   3. (default) Sets every kitchen ingredient's currentStock to 0.
 *   4. Records a 'correction' movement per zeroed line in the stock ledger
 *      (unless --clear-history is given, which wipes the ledgers entirely).
 *   5. Writes one STOCK_RESET_ALL entry to the audit log.
 *
 * Bills, invoices, KOTs, products, prices, users and settings are NEVER
 * touched — only stock quantities and (optionally) the movement ledger.
 *
 * USAGE:
 *   # Dry run — shows what WOULD be zeroed, changes nothing:
 *   npx tsx scripts/reset-stock.ts --dry-run
 *
 *   # Reset for real (all hotels, bar + kitchen stock, ledger kept):
 *   npx tsx scripts/reset-stock.ts --confirm "RESET ALL STOCK"
 *
 *   # Bar products only (leave kitchen ingredients untouched):
 *   npx tsx scripts/reset-stock.ts --confirm "RESET ALL STOCK" --no-kitchen
 *
 *   # Also wipe the stock movement history for a completely clean start:
 *   npx tsx scripts/reset-stock.ts --confirm "RESET ALL STOCK" --clear-history
 *
 *   # One hotel only (multi-hotel installs):
 *   npx tsx scripts/reset-stock.ts --confirm "RESET ALL STOCK" --hotel royal
 *
 * The server must be STOPPED while running this (or restarted afterwards) so
 * it reloads the zeroed database from disk.
 * ============================================================================
 */

import 'dotenv/config';
import {
  getAllDatabases,
  getHotelInfo,
  DEFAULT_HOTEL_ID,
  type Database,
} from '../server/db.ts';

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = has('--dry-run');
const clearHistory = has('--clear-history');
const includeKitchen = !has('--no-kitchen');
const hotelArg = valueOf('--hotel');
const confirm = (valueOf('--confirm') || '').trim().toUpperCase();

const CONFIRM_PHRASE = 'RESET ALL STOCK';

function parseMlFromSize(size: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*ml/i.exec(size || '');
  return m ? Number(m[1]) : null;
}

function resetOneDatabase(database: Database, opts: { dryRun: boolean; clearHistory: boolean; includeKitchen: boolean }) {
  // Access the tenant database through its raw schema. (The Database class
  // exposes `raw` publicly; recordStockMovement/recordKitchenMovement/
  // logAudit/backupDatabase/save are public methods.)
  const raw = database.raw as any;
  const hotelLabel = getHotelInfo((database as any).id || DEFAULT_HOTEL_ID)?.name || (database as any).id || 'hotel';

  let variantsToZero = 0;
  let variantsAlreadyZero = 0;
  let shotProducts = 0;
  let ingredientsToZero = 0;
  let ingredientsAlreadyZero = 0;

  for (const product of raw.products || []) {
    let touched = false;
    const servesShots = Boolean(product.servesShots);
    for (const variant of product.variants || []) {
      // Shot variants hold no independent stock — they pour from the 750ml bottle.
      const isShot = servesShots && variant.isShot && (Number(variant.shotVolumeMl) || parseMlFromSize(String(variant.size || '')) || 0) > 0;
      if (isShot) continue;
      if ((Number(variant.stock) || 0) === 0) variantsAlreadyZero++;
      else { variantsToZero++; touched = true; }
    }
    if (servesShots && (Number(product.openBottleUsedMl) > 0 || touched)) shotProducts++;
  }

  if (opts.includeKitchen && Array.isArray(raw.kitchenIngredients)) {
    for (const ing of raw.kitchenIngredients) {
      if ((Number(ing.currentStock) || 0) === 0) ingredientsAlreadyZero++;
      else ingredientsToZero++;
    }
  }

  const productMovements = Array.isArray(raw.stockMovements) ? raw.stockMovements.length : 0;
  const kitchenMovements = Array.isArray(raw.kitchenMovements) ? raw.kitchenMovements.length : 0;

  console.log(`\n── Hotel: ${hotelLabel}`);
  console.log(`   product sizes to zero:        ${variantsToZero} (already 0: ${variantsAlreadyZero})`);
  console.log(`   shot-pouring products reset:  ${shotProducts}`);
  if (opts.includeKitchen) {
    console.log(`   kitchen ingredients to zero:   ${ingredientsToZero} (already 0: ${ingredientsAlreadyZero})`);
  } else {
    console.log(`   kitchen ingredients:           SKIPPED (--no-kitchen)`);
  }
  if (opts.clearHistory) {
    console.log(`   movement history:              WILL BE WIPED (${productMovements} product + ${kitchenMovements} kitchen records)`);
  } else {
    console.log(`   movement history:              kept (a correction ledger row is added per zeroed item)`);
  }

  if (opts.dryRun) return;

  // 1) Safety backup first.
  const backup = database.backupDatabase();
  console.log(`   safety backup:                 ${backup.filename}`);

  const nowIso = new Date().toISOString();
  const resetRef = `RESET-CLI-${nowIso.replace(/[-:T.Z]/g, '').slice(0, 14)}`;
  const reason = 'Full stock reset to zero via CLI script — rebuilding stock from physical count';
  const actor = { id: 'cli-reset', name: 'CLI reset-stock script' };

  // 2) Zero product variants.
  let zeroed = 0;
  for (const product of raw.products || []) {
    let touched = false;
    const servesShots = Boolean(product.servesShots);
    for (const variant of product.variants || []) {
      const shotVol = Number(variant.shotVolumeMl) || parseMlFromSize(String(variant.size || '')) || 0;
      const isShot = servesShots && variant.isShot && shotVol > 0;
      if (isShot) continue;
      const before = Number(variant.stock) || 0;
      if (before === 0) continue;
      variant.stock = 0;
      zeroed++;
      touched = true;
      database.recordStockMovement(
        product.id, product.name, variant.id, variant.size,
        -before, before, 0, 'correction',
        actor.id, actor.name, reason, resetRef
      );
    }
    if (servesShots && (Number(product.openBottleUsedMl) > 0 || touched)) {
      product.openBottleUsedMl = 0;
    }
  }

  // 3) Zero kitchen ingredients.
  let ingredientsZeroed = 0;
  if (opts.includeKitchen && Array.isArray(raw.kitchenIngredients)) {
    for (const ing of raw.kitchenIngredients) {
      const before = Number(ing.currentStock) || 0;
      if (before === 0) continue;
      ing.currentStock = 0;
      ing.updatedAt = nowIso;
      ingredientsZeroed++;
      database.recordKitchenMovement(
        ing, -before, before, 0, 'count_correction',
        actor.id, actor.name, reason, resetRef
      );
    }
  }

  // 4) Optional ledger wipe.
  let clearedProduct = 0;
  let clearedKitchen = 0;
  if (opts.clearHistory) {
    clearedProduct = Array.isArray(raw.stockMovements) ? raw.stockMovements.length : 0;
    clearedKitchen = Array.isArray(raw.kitchenMovements) ? raw.kitchenMovements.length : 0;
    raw.stockMovements = [];
    raw.kitchenMovements = [];
  }

  database.save();
  database.logAudit(
    actor.id, actor.name, 'super_admin', 'STOCK_RESET_ALL', 'INVENTORY', resetRef,
    `CLI FULL STOCK RESET to zero: ${zeroed} product size(s) reset, ` +
    (opts.includeKitchen ? `${ingredientsZeroed} kitchen ingredient(s) reset, ` : 'kitchen store not touched, ') +
    (opts.clearHistory ? `movement history WIPED (${clearedProduct} product + ${clearedKitchen} kitchen records). ` : 'movement history kept. ') +
    `Reason: ${reason}. Safety backup: ${backup.filename}`
  );
  database.save();

  console.log(`   ✓ DONE — ${zeroed} product size(s)` +
    (opts.includeKitchen ? `, ${ingredientsZeroed} ingredient(s)` : '') +
    ` set to 0. Ref ${resetRef}`);
}

// ---- Main ----------------------------------------------------------------
console.log('==============================================');
console.log(' Royal Hotel POS — Full Stock Reset to Zero');
console.log('==============================================');

if (dryRun) {
  console.log('MODE: DRY RUN — no changes will be written.');
} else if (confirm !== CONFIRM_PHRASE) {
  console.error('\nERROR: this permanently zeroes stock. Re-run with:');
  console.error(`  npx tsx scripts/reset-stock.ts --confirm "${CONFIRM_PHRASE}"`);
  console.error('\nOr preview first with:  npx tsx scripts/reset-stock.ts --dry-run');
  process.exit(1);
} else {
  console.log('MODE: LIVE — stock will be reset (a safety backup is taken first).');
}

const all = getAllDatabases();
const targets = hotelArg
  ? all.filter((d: any) => d.id === hotelArg || (getHotelInfo(d.id)?.name || '').toLowerCase().includes(hotelArg.toLowerCase()))
  : all;

if (targets.length === 0) {
  console.error(`\nNo hotel database matched --hotel "${hotelArg}". Known hotels: ${all.map((d: any) => d.id).join(', ')}`);
  process.exit(1);
}

for (const database of targets) {
  resetOneDatabase(database, { dryRun, clearHistory, includeKitchen });
}

if (dryRun) {
  console.log('\nDry run complete. Nothing was changed. Re-run with --confirm to apply.');
} else {
  console.log('\nAll done. Restart the POS server so it loads the reset database.');
  console.log('Then rebuild opening stock with Smart Import or Stock In.');
}
