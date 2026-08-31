-- ============================================================================
-- MIGRATION: FULL STOCK RESET — set EVERY item's stock to 0
-- ============================================================================
-- Use this on a ROYAL HOTEL POS MySQL / MariaDB database (the PHP API
-- deployment — the Node.js build stores its data in data/pos_database.json
-- and should use the in-app "Reset All Stock to 0" button or
-- `scripts/reset-stock.ts` instead).
--
-- What it does:
--   1. (Optional but recommended) Backs up the current stock numbers into a
--      `stock_reset_backup_<date>` table FIRST, so the reset is reversible.
--   2. Sets every product variant's `stock` to 0.
--   3. Writes one 'adjustment' stock_movement row per variant that actually
--      had stock, so the movement ledger stays honest (reports reconcile).
--   4. Leaves products, prices, bills, invoices, KOTs, users and settings
--      completely untouched — ONLY stock quantities change.
--
-- Afterwards, rebuild opening stock from the admin panel:
--   Inventory → Smart Import (purchase invoice / physical count sheet),
--   or the per-item Stock In buttons.
--
-- HOW TO RUN:
--   - phpMyAdmin:  open this file in the SQL tab and click Go.
--   - CLI:         mysql -u USER -p DATABASE < migration-reset-stock.sql
--
-- Re-running it is safe: the backup table keeps one dated snapshot per run and
-- the adjustment step only touches rows whose stock is not already 0.
-- ============================================================================

-- 1. Safety snapshot of the current stock (one table per run, dated) ---------
SET @reset_stamp := DATE_FORMAT(NOW(), '%Y%m%d_%H%i%s');
SET @backup_ddl := CONCAT(
  'CREATE TABLE IF NOT EXISTS `stock_reset_backup_', @reset_stamp, '` AS ',
  'SELECT id, product_id, size, sku, stock AS stock_before, NOW() AS backed_up_at ',
  'FROM `product_variants`'
);
PREPARE stmt FROM @backup_ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Ledger records FIRST (they need the old stock values) -------------------
-- One adjustment row per variant that currently holds stock: quantity_change
-- is -stock (before), quantity_after is 0.
INSERT INTO `stock_movements`
  (`product_id`, `variant_id`, `movement_type`, `quantity_change`, `quantity_before`, `quantity_after`, `reason`, `created_at`, `user_id`, `user_name`)
SELECT
  v.`product_id`,
  v.`id`,
  'adjustment',
  -v.`stock`,
  v.`stock`,
  0,
  'Full stock reset to zero — rebuilding stock books from physical count',
  NOW(),
  'system',
  'Stock Reset Script'
FROM `product_variants` v
WHERE v.`stock` <> 0;

-- 3. Zero every variant's stock ------------------------------------------------
UPDATE `product_variants` SET `stock` = 0;

-- 4. Verify --------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM `product_variants`) AS total_variants,
  (SELECT COUNT(*) FROM `product_variants` WHERE `stock` = 0) AS variants_at_zero,
  (SELECT COUNT(*) FROM `product_variants` WHERE `stock` <> 0) AS variants_with_stock;

-- The named backup table (drop it ONLY after you have confirmed the new opening
-- stock is in place and reports reconcile):
SELECT CONCAT('Backup saved in table: stock_reset_backup_', @reset_stamp) AS backup_table;

-- To restore the pre-reset numbers later:
--   UPDATE `product_variants` v
--   JOIN `stock_reset_backup_<DATE>` b ON b.id = v.id
--   SET v.stock = b.stock_before;
