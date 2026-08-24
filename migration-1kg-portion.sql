-- ============================================================================
-- MIGRATION: Legacy POS menu imports — 1KG PORTION + BEER PUB
-- ============================================================================
-- Run this on an EXISTING Royal Hotel POS MySQL database to add:
--   1. New category: "1KG Portion (Bulk Food)" (restaurant type → items show
--      under the FOOD & KITCHEN quick-filter group in the POS screen)
--   2. 36 bulk food products — ALL kitchen items (is_kitchen_item = 1 → KOT)
--   3. New category: "Beer Pub" (restaurant type → FOOD & KITCHEN group) with
--      7 legacy bar-counter buttons; only "Beef Noodles Medium" is a KOT item
--   4. hide_from_POS flag (hidden_in_pos): both categories' buttons stay OUT of
--      the cashier POS sidebar — visible/manageable in the Super Admin panel
--
-- Safe to re-run: idempotent inserts + IF NOT EXISTS column add.
-- Cost prices are seeded as 0.00 — update them in Admin → Products.
-- ============================================================================

-- 0. Schema: hidden_in_pos flag (safe on MariaDB / MySQL 8+; ignore error if
--    the column already exists on older MySQL versions)
ALTER TABLE `categories` ADD COLUMN IF NOT EXISTS `hidden_in_pos` TINYINT(1) NOT NULL DEFAULT 0 AFTER `display_order`;

-- 1. Category ---------------------------------------------------------------
INSERT INTO `categories` (`id`, `name`, `type`, `icon`, `is_active`, `display_order`, `hidden_in_pos`) VALUES
('cat-1kg-portion', '1KG Portion (Bulk Food)', 'restaurant', 'utensils', 1, 10, 1)
ON DUPLICATE KEY UPDATE `type`=VALUES(`type`), `hidden_in_pos`=VALUES(`hidden_in_pos`);

-- 2. Products (all kitchen items) --------------------------------------------
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-1kg-01', 'Pork Stew 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Slow-braised pork stew — bulk 1KG portion (approx. 8-10 servings).', NULL, 1, 0.00, 1, 0),
('prod-1kg-02', 'Hot Butter Cuttlefish 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy butter-tossed cuttlefish — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-03', 'Boiled Vegetable 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Fresh boiled mixed vegetables — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-04', 'Fish Fried 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy fried fish — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-05', 'Beef Deviled 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Spicy devilled beef with capsicum & onions — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-06', 'Sausages Deviled 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Devilled sausages tossed with onions & chili — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-07', 'French Fries 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Golden crispy french fries — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-08', 'Mutton Black Curry', 'cat-1kg-portion', 'comp-kitchen', 'Slow-cooked black roasted mutton curry — standard portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-09', 'Cooking Charge', 'cat-1kg-portion', 'comp-kitchen', 'Kitchen cooking / preparation charge for outside or special-order food.', NULL, 1, 0.00, 1, 0),
('prod-1kg-10', 'Beef Black Curry 500ml', 'cat-1kg-portion', 'comp-kitchen', 'Black roasted beef curry — 500ml portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-11', 'Prawn Deviled 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Spicy devilled prawns with capsicum & onions — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-12', 'Fish Fingers 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crumbed golden fish fingers — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-13', 'Sausage Deviled 500g', 'cat-1kg-portion', 'comp-kitchen', 'Devilled sausages with onions & chili — 500g portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-14', 'Battered Vegetables 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy battered mixed vegetables — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-15', 'Kadala 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Tempered black chickpeas (kadala) — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-16', 'Potato Wedges 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Seasoned crispy potato wedges — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-17', 'Hot Battered Mushroom 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Hot battered crispy mushrooms — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-18', 'Fish Cutlet 10pc', 'cat-1kg-portion', 'comp-kitchen', 'Golden fried fish cutlets — 10 pieces portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-19', 'Fried Cashew 500g', 'cat-1kg-portion', 'comp-kitchen', 'Salted fried cashew nuts — 500g portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-20', 'Boiled Egg 10 Portion', 'cat-1kg-portion', 'comp-kitchen', 'Boiled eggs — 10 portions pack.', NULL, 1, 0.00, 1, 0),
('prod-1kg-21', 'Fruit Platter', 'cat-1kg-portion', 'comp-kitchen', 'Fresh seasonal fruit platter — standard portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-22', 'Hot Battered Cuttlefish 500g', 'cat-1kg-portion', 'comp-kitchen', 'Hot battered crispy cuttlefish — 500g portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-23', 'French Fries 500g', 'cat-1kg-portion', 'comp-kitchen', 'Golden crispy french fries — 500g portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-24', 'Chicken Deviled 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Spicy devilled chicken with capsicum & onions — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-25', 'Mixture 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Spicy fried bar mixture — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-26', 'Chicken Fried 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy fried chicken — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-27', 'Beef Fried 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy fried beef — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-28', 'Sausage Fried 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Fried sausages — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-29', 'Prawns Fried 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy fried prawns — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-30', 'Fish Devilled 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Spicy devilled fish with capsicum & onions — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-31', 'Chicken Black Curry 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Black roasted chicken curry — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-32', 'Beef Black Curry 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Black roasted beef curry — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-33', 'Chicken Stew 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Slow-braised chicken stew — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-34', 'Fish Stew 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Slow-braised fish stew — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-35', 'Beef Stew 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Slow-braised beef stew — bulk 1KG portion.', NULL, 1, 0.00, 1, 0),
('prod-1kg-36', 'Battered Prawns 1KG', 'cat-1kg-portion', 'comp-kitchen', 'Crispy battered prawns — bulk 1KG portion.', NULL, 1, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- 3. Variants (portion sizes & prices from the menu) -------------------------
INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-1kg-01', 'prod-1kg-01', '1KG Portion', 'K1G-PSTW', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-02', 'prod-1kg-02', '1KG Portion', 'K1G-HBCF', NULL, 0.00, 7000.00, 50, 10, 1),
('var-1kg-03', 'prod-1kg-03', '1KG Portion', 'K1G-BVEG', NULL, 0.00, 3500.00, 50, 10, 1),
('var-1kg-04', 'prod-1kg-04', '1KG Portion', 'K1G-FFRY', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-05', 'prod-1kg-05', '1KG Portion', 'K1G-BDEV', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-06', 'prod-1kg-06', '1KG Portion', 'K1G-SDEV', NULL, 0.00, 4500.00, 50, 10, 1),
('var-1kg-07', 'prod-1kg-07', '1KG Portion', 'K1G-FF1K', NULL, 0.00, 4000.00, 50, 10, 1),
('var-1kg-08', 'prod-1kg-08', 'Standard Portion', 'K1G-MBC', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-09', 'prod-1kg-09', 'Per Order', 'K1G-CCHG', NULL, 0.00, 0.00, 9999, 0, 1),
('var-1kg-10', 'prod-1kg-10', '500ml Portion', 'K1G-BBC5', NULL, 0.00, 3000.00, 50, 10, 1),
('var-1kg-11', 'prod-1kg-11', '1KG Portion', 'K1G-PDEV', NULL, 0.00, 7000.00, 50, 10, 1),
('var-1kg-12', 'prod-1kg-12', '1KG Portion', 'K1G-FFIN', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-13', 'prod-1kg-13', '500g Portion', 'K1G-SDV5', NULL, 0.00, 2000.00, 50, 10, 1),
('var-1kg-14', 'prod-1kg-14', '1KG Portion', 'K1G-BVEG1', NULL, 0.00, 4000.00, 50, 10, 1),
('var-1kg-15', 'prod-1kg-15', '1KG Portion', 'K1G-KAD', NULL, 0.00, 2400.00, 50, 10, 1),
('var-1kg-16', 'prod-1kg-16', '1KG Portion', 'K1G-PWED', NULL, 0.00, 2000.00, 50, 10, 1),
('var-1kg-17', 'prod-1kg-17', '1KG Portion', 'K1G-HBM', NULL, 0.00, 2500.00, 50, 10, 1),
('var-1kg-18', 'prod-1kg-18', '10 Pieces', 'K1G-FCUT', NULL, 0.00, 600.00, 50, 10, 1),
('var-1kg-19', 'prod-1kg-19', '500g Portion', 'K1G-FCAS', NULL, 0.00, 5000.00, 50, 10, 1),
('var-1kg-20', 'prod-1kg-20', '10 Portions', 'K1G-BEGG', NULL, 0.00, 1200.00, 50, 10, 1),
('var-1kg-21', 'prod-1kg-21', 'Standard Portion', 'K1G-FPLT', NULL, 0.00, 1800.00, 50, 10, 1),
('var-1kg-22', 'prod-1kg-22', '500g Portion', 'K1G-HBC5', NULL, 0.00, 3500.00, 50, 10, 1),
('var-1kg-23', 'prod-1kg-23', '500g Portion', 'K1G-FF5H', NULL, 0.00, 2000.00, 50, 10, 1),
('var-1kg-24', 'prod-1kg-24', '1KG Portion', 'K1G-CDEV', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-25', 'prod-1kg-25', '1KG Portion', 'K1G-MIX', NULL, 0.00, 1500.00, 50, 10, 1),
('var-1kg-26', 'prod-1kg-26', '1KG Portion', 'K1G-CFRY', NULL, 0.00, 5000.00, 50, 10, 1),
('var-1kg-27', 'prod-1kg-27', '1KG Portion', 'K1G-BFRY', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-28', 'prod-1kg-28', '1KG Portion', 'K1G-SFRY', NULL, 0.00, 4000.00, 50, 10, 1),
('var-1kg-29', 'prod-1kg-29', '1KG Portion', 'K1G-PFRY', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-30', 'prod-1kg-30', '1KG Portion', 'K1G-FDEV', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-31', 'prod-1kg-31', '1KG Portion', 'K1G-CBC', NULL, 0.00, 5500.00, 50, 10, 1),
('var-1kg-32', 'prod-1kg-32', '1KG Portion', 'K1G-BBC1', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-33', 'prod-1kg-33', '1KG Portion', 'K1G-CSTW', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-34', 'prod-1kg-34', '1KG Portion', 'K1G-FSTW', NULL, 0.00, 6000.00, 50, 10, 1),
('var-1kg-35', 'prod-1kg-35', '1KG Portion', 'K1G-BSTW', NULL, 0.00, 6500.00, 50, 10, 1),
('var-1kg-36', 'prod-1kg-36', '1KG Portion', 'K1G-BPRN', NULL, 0.00, 7000.00, 50, 10, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- ============================================================================
-- BEER PUB — Price-point bar counter buttons (from legacy POS menu)
-- Category: 'Beer Pub' (bar type → BAR SPIRITS group). 'Beef Noodles Medium'
-- only is a kitchen item (is_kitchen_item = 1 → KOT); the rest are bar items.
-- ============================================================================

-- 4. Category ---------------------------------------------------------------
-- NOTE: Beer Pub intentionally uses type 'restaurant' so its items appear
-- under FOOD & KITCHEN in the cashier POS, with its button hidden from the
-- cashier interface (admin-visible only).
INSERT INTO `categories` (`id`, `name`, `type`, `icon`, `is_active`, `display_order`, `hidden_in_pos`) VALUES
('cat-beer-pub', 'Beer Pub', 'restaurant', 'beer', 1, 11, 1)
ON DUPLICATE KEY UPDATE `type`=VALUES(`type`), `hidden_in_pos`=VALUES(`hidden_in_pos`);

-- 5. Products ---------------------------------------------------------------
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-bp-01', 'Beer 900', 'cat-beer-pub', NULL, 'Beer price-point button — serve/bottle sold at Rs. 900.', NULL, 0, 0.00, 1, 0),
('prod-bp-02', 'Beer 950', 'cat-beer-pub', NULL, 'Beer price-point button — serve/bottle sold at Rs. 950.', NULL, 0, 0.00, 1, 0),
('prod-bp-03', 'Beer 870', 'cat-beer-pub', NULL, 'Beer price-point button — serve/bottle sold at Rs. 870.', NULL, 0, 0.00, 1, 0),
('prod-bp-04', 'Beer 800', 'cat-beer-pub', NULL, 'Beer price-point button — serve/bottle sold at Rs. 800.', NULL, 0, 0.00, 1, 0),
('prod-bp-05', 'Beef Noodles Medium', 'cat-beer-pub', 'comp-kitchen', 'Stir-fried beef noodles — medium portion (kitchen item, fires KOT).', NULL, 1, 0.00, 1, 0),
('prod-bp-06', 'Beer 630', 'cat-beer-pub', NULL, 'Beer price-point button — serve/bottle sold at Rs. 630.', NULL, 0, 0.00, 1, 0),
('prod-bp-07', 'Arrack', 'cat-beer-pub', NULL, 'Arrack serve — bar counter button at Rs. 1,400.', NULL, 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- 6. Variants ----------------------------------------------------------------
INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-bp-01', 'prod-bp-01', 'Bottle / Serve', 'BP-BEER-900', NULL, 0.00, 900.00, 100, 24, 1),
('var-bp-02', 'prod-bp-02', 'Bottle / Serve', 'BP-BEER-950', NULL, 0.00, 950.00, 100, 24, 1),
('var-bp-03', 'prod-bp-03', 'Bottle / Serve', 'BP-BEER-870', NULL, 0.00, 870.00, 100, 24, 1),
('var-bp-04', 'prod-bp-04', 'Bottle / Serve', 'BP-BEER-800', NULL, 0.00, 800.00, 100, 24, 1),
('var-bp-05', 'prod-bp-05', 'Medium Portion', 'BP-BNDL-MED', NULL, 0.00, 1000.00, 50, 10, 1),
('var-bp-06', 'prod-bp-06', 'Bottle / Serve', 'BP-BEER-630', NULL, 0.00, 630.00, 100, 24, 1),
('var-bp-07', 'prod-bp-07', 'Serve', 'BP-ARR-1400', NULL, 0.00, 1400.00, 100, 10, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;
