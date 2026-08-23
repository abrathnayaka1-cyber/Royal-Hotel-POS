-- ============================================================================
-- COMMERCIAL BAR & RESTAURANT POS SYSTEM - MYSQL / MARIADB DATABASE SCHEMA
-- Target Environment: Hostinger Web Hosting / Shared Hosting
-- Character Set: utf8mb4 / utf8mb4_unicode_ci
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- ----------------------------------------------------------------------------
-- Table: users
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `email` VARCHAR(128) NOT NULL,
  `role` ENUM('super_admin', 'cashier') NOT NULL DEFAULT 'cashier',
  `password_hash` VARCHAR(255) NOT NULL,
  `pin` VARCHAR(32) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: user_sessions (Token storage for stateless PHP API)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `token` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user_id` (`user_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: categories
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'bar',
  `icon` VARCHAR(64) NOT NULL DEFAULT 'tag',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_categories_is_active` (`is_active`),
  KEY `idx_categories_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: companies (Brands / Distilleries / Breweries / Suppliers)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_companies_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: products
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category_id` VARCHAR(64) NOT NULL,
  `company_id` VARCHAR(64) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `image` TEXT DEFAULT NULL,
  `is_kitchen_item` TINYINT(1) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(5,2) DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_archived` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_company` (`company_id`),
  KEY `idx_products_status` (`is_active`, `is_archived`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_products_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: product_variants (Multi-size liquor bottles, shots, portions)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `product_variants`;
CREATE TABLE `product_variants` (
  `id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `size` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(128) NOT NULL,
  `barcode` VARCHAR(128) DEFAULT NULL,
  `cost_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `selling_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `stock` INT NOT NULL DEFAULT 0,
  `min_stock_level` INT NOT NULL DEFAULT 5,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_variants_product` (`product_id`),
  KEY `idx_variants_sku` (`sku`),
  KEY `idx_variants_barcode` (`barcode`),
  KEY `idx_variants_stock` (`stock`),
  CONSTRAINT `fk_variants_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: stock_movements (Complete Inventory Audit Log)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `stock_movements`;
CREATE TABLE `stock_movements` (
  `id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(191) NOT NULL,
  `variant_id` VARCHAR(64) NOT NULL,
  `variant_size` VARCHAR(64) NOT NULL,
  `quantity_change` INT NOT NULL,
  `quantity_before` INT NOT NULL,
  `quantity_after` INT NOT NULL,
  `movement_type` ENUM('opening_stock', 'stock_in', 'stock_out', 'sale', 'adjustment', 'damaged', 'expired', 'return') NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `user_name` VARCHAR(128) NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `reference_id` VARCHAR(128) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_mov_product` (`product_id`),
  KEY `idx_stock_mov_variant` (`variant_id`),
  KEY `idx_stock_mov_type` (`movement_type`),
  KEY `idx_stock_mov_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: held_bills (Parked orders / active bar tabs)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `held_bills`;
CREATE TABLE `held_bills` (
  `id` VARCHAR(64) NOT NULL,
  `bill_number` VARCHAR(64) NOT NULL,
  `table_number` VARCHAR(64) DEFAULT NULL,
  `customer_name` VARCHAR(128) DEFAULT NULL,
  `customer_phone` VARCHAR(64) DEFAULT NULL,
  `cashier_id` VARCHAR(64) NOT NULL,
  `cashier_name` VARCHAR(128) NOT NULL,
  `order_type` VARCHAR(32) NOT NULL DEFAULT 'dine_in',
  `items_json` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_held_bills_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: kots (Kitchen Order Tickets)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `kots`;
CREATE TABLE `kots` (
  `id` VARCHAR(64) NOT NULL,
  `kot_number` VARCHAR(64) NOT NULL,
  `bill_number` VARCHAR(64) DEFAULT NULL,
  `table_number` VARCHAR(64) DEFAULT NULL,
  `order_type` VARCHAR(32) NOT NULL DEFAULT 'dine_in',
  `cashier_id` VARCHAR(64) NOT NULL,
  `cashier_name` VARCHAR(128) NOT NULL,
  `items_json` LONGTEXT NOT NULL,
  `status` ENUM('pending', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kots_kot_number` (`kot_number`),
  KEY `idx_kots_status` (`status`),
  KEY `idx_kots_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: bills (Completed Transactions & Tax Invoices)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `bills`;
CREATE TABLE `bills` (
  `id` VARCHAR(64) NOT NULL,
  `bill_number` VARCHAR(64) NOT NULL,
  `invoice_number` VARCHAR(64) NOT NULL,
  `order_type` VARCHAR(32) NOT NULL DEFAULT 'dine_in',
  `table_number` VARCHAR(64) DEFAULT NULL,
  `customer_name` VARCHAR(128) DEFAULT NULL,
  `customer_phone` VARCHAR(64) DEFAULT NULL,
  `cashier_id` VARCHAR(64) NOT NULL,
  `cashier_name` VARCHAR(128) NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `service_charge` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `grand_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `amount_received` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `change_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(32) NOT NULL DEFAULT 'cash',
  `payment_details` TEXT DEFAULT NULL,
  `status` ENUM('paid', 'voided', 'cancelled') NOT NULL DEFAULT 'paid',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bills_bill_number` (`bill_number`),
  UNIQUE KEY `uk_bills_invoice_number` (`invoice_number`),
  KEY `idx_bills_cashier` (`cashier_id`),
  KEY `idx_bills_status` (`status`),
  KEY `idx_bills_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: bill_items (Line items snapshot for every transaction)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `bill_items`;
CREATE TABLE `bill_items` (
  `id` VARCHAR(64) NOT NULL,
  `bill_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(191) NOT NULL,
  `variant_id` VARCHAR(64) NOT NULL,
  `size` VARCHAR(64) NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `cost_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `quantity` INT NOT NULL DEFAULT 1,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `tax` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `is_kitchen_item` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bill_items_bill` (`bill_id`),
  KEY `idx_bill_items_product` (`product_id`),
  KEY `idx_bill_items_variant` (`variant_id`),
  CONSTRAINT `fk_bill_items_bill` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: audit_logs (System Action Tracking)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `user_name` VARCHAR(128) NOT NULL,
  `user_role` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `entity` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(64) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: system_settings
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
  `id` INT NOT NULL DEFAULT 1,
  `business_name` VARCHAR(191) NOT NULL DEFAULT 'Royal Green Garden Bar & Restaurant',
  `business_tagline` VARCHAR(191) DEFAULT 'Fine Liquor, Cuisine & Hospitality',
  `address` TEXT DEFAULT NULL,
  `phone` VARCHAR(128) DEFAULT '+94 32 226 5500 / +94 77 123 4567',
  `email` VARCHAR(128) DEFAULT 'royalgreengardenputtalam@gmail.com',
  `website` VARCHAR(128) DEFAULT 'www.royalgreengarden.lk',
  `currency` VARCHAR(16) NOT NULL DEFAULT 'LKR',
  `currency_symbol` VARCHAR(16) NOT NULL DEFAULT 'Rs.',
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `service_charge_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `allow_negative_stock` TINYINT(1) NOT NULL DEFAULT 0,
  `enable_discounts` TINYINT(1) NOT NULL DEFAULT 1,
  `max_discount_percentage` DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  `invoice_prefix` VARCHAR(32) NOT NULL DEFAULT 'INV-',
  `bill_prefix` VARCHAR(32) NOT NULL DEFAULT 'BILL-',
  `kot_prefix` VARCHAR(32) NOT NULL DEFAULT 'KOT-',
  `receipt_header` TEXT DEFAULT NULL,
  `receipt_footer` TEXT DEFAULT NULL,
  `low_stock_default_threshold` INT NOT NULL DEFAULT 5,
  `printer_type` VARCHAR(32) NOT NULL DEFAULT 'thermal',
  `thermal_width` VARCHAR(16) NOT NULL DEFAULT '80mm',
  `auto_print_after_payment` TINYINT(1) NOT NULL DEFAULT 0,
  `allow_cashier_to_print` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- INITIAL SEED DATA
-- ============================================================================

-- 1. Initial Super Admin Account (Username: Admin, Password: Araliya2000)
-- ZERO DEFAULT CASHIERS - Cashiers are created via Admin Dashboard only!
INSERT INTO `users` (`id`, `name`, `username`, `email`, `role`, `password_hash`, `pin`, `is_active`, `created_at`)
VALUES (
  'user-admin-001',
  'Super Administrator',
  'Admin',
  'admin@royalgreengarden.lk',
  'super_admin',
  '$2y$10$SF.8LYDoVpu8AsEPoKHQyuVQDi79n0CYwYbjgVa7vgQ8S4YiqB5q2',
  '9999',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE `id`=`id`;

-- 2. System Settings Initial Record
INSERT INTO `system_settings` (
  `id`,
  `business_name`,
  `business_tagline`,
  `address`,
  `phone`,
  `email`,
  `website`,
  `currency`,
  `currency_symbol`,
  `tax_rate`,
  `service_charge_rate`,
  `allow_negative_stock`,
  `enable_discounts`,
  `max_discount_percentage`,
  `invoice_prefix`,
  `bill_prefix`,
  `kot_prefix`,
  `receipt_header`,
  `receipt_footer`,
  `low_stock_default_threshold`,
  `printer_type`,
  `thermal_width`,
  `auto_print_after_payment`,
  `allow_cashier_to_print`
) VALUES (
  1,
  'Royal Green Garden Bar & Restaurant',
  'Fine Liquor, Cuisine & Hospitality',
  'No. 42 Beach Road, Puttalam, Sri Lanka',
  '+94 32 226 5500 / +94 77 123 4567',
  'royalgreengardenputtalam@gmail.com',
  'www.royalgreengarden.lk',
  'LKR',
  'Rs.',
  0.00,
  10.00,
  0,
  1,
  20.00,
  'INV-',
  'BILL-',
  'KOT-',
  'Welcome to Royal Green Garden',
  'Thank you for visiting Royal Green Garden! Please visit again.',
  5,
  'thermal',
  '80mm',
  0,
  1
) ON DUPLICATE KEY UPDATE `id`=`id`;

-- 3. Initial Bar & Restaurant Categories
INSERT INTO `categories` (`id`, `name`, `type`, `icon`, `is_active`, `display_order`) VALUES
('cat-arrack', 'Arrack & Local Spirits', 'bar', 'wine', 1, 1),
('cat-whisky', 'Whisky & Scotch', 'bar', 'glass-water', 1, 2),
('cat-beer', 'Beer & Stout', 'bar', 'beer', 1, 3),
('cat-gin-vodka', 'Gin, Vodka & Rum', 'bar', 'wine', 1, 4),
('cat-wine', 'Wines & Champagne', 'bar', 'wine', 1, 5),
('cat-cocktails', 'Cocktails & Shooters', 'bar', 'martini', 1, 6),
('cat-bites', 'Bar Bites & Devilled', 'restaurant', 'flame', 1, 7),
('cat-mains', 'Mains, Rice & Noodles', 'restaurant', 'utensils', 1, 8),
('cat-softdrinks', 'Chasers & Beverages', 'restaurant', 'coffee', 1, 9)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- 4. Initial Liquor Brands & Distilleries
INSERT INTO `companies` (`id`, `name`, `description`, `is_active`) VALUES
('comp-dcscl', 'DCSCL (Distilleries Co. of Sri Lanka)', 'Old Arrack, Extra Special, Gal Arrack', 1),
('comp-idb', 'IDL (International Distilleries Ltd)', 'Ascot, Old Keg, White Diamond, Blue Ribbon', 1),
('comp-rockland', 'Rockland Distilleries', 'Ceylon Arrack, Rockland Dry Gin, Old Dutch', 1),
('comp-lion', 'Lion Brewery Ceylon PLC', 'Lion Lager, Lion Stout, Carlsberg', 1),
('comp-heineken', 'Heineken Lanka Limited', 'Heineken, Tiger, Anchor', 1),
('comp-kitchen', 'Royal Green Garden In-House Kitchen', 'Fresh authentic seafood, bites, rice and grill', 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- 5. Standard Initial Inventory Products & Multi-Size Variants
-- Product 1: DCSCL Extra Special Arrack
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-extra-special', 'Extra Special Arrack', 'cat-arrack', 'comp-dcscl', 'Sri Lanka classic premium coconut distilled arrack', 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-white-label', 'White Label Arrack', 'cat-arrack', 'comp-dcscl', 'Popular high quality blended spirit', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-old-arrack', 'Old Arrack (DCSL)', 'cat-arrack', 'comp-dcscl', 'Aged pure coconut arrack in wooden vats', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-galilee-brandy', 'Galilee Brandy', 'cat-arrack', 'comp-idb', 'Smooth French blend aromatic brandy', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-black-opal', 'Black Opal Arrack', 'cat-arrack', 'comp-idb', 'Rich dark refined coconut spirit', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-double-distilled', 'Double Distilled Arrack', 'cat-arrack', 'comp-dcscl', 'Pot-distilled double refined coconut arrack', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-rockland-ex', 'Rockland EX Arrack', 'cat-arrack', 'comp-rockland', 'Extra special Rockland distillery signature blend', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-rockland-old-arrack', 'Rockland Old Arrack', 'cat-arrack', 'comp-rockland', 'Traditional wood vat aged Rockland old arrack', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0),
('prod-navy-special', 'Navy Special Arrack', 'cat-arrack', 'comp-dcscl', 'Classic robust navy recipe arrack', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-es-750', 'prod-extra-special', '750ml', 'ARR-ES-750', '4790001001', 2950.00, 3650.00, 48, 10, 1),
('var-es-375', 'prod-extra-special', '375ml', 'ARR-ES-375', '4790001002', 1520.00, 1890.00, 36, 10, 1),
('var-es-180', 'prod-extra-special', '180ml', 'ARR-ES-180', '4790001003', 760.00, 980.00, 50, 15, 1),
('var-wl-750', 'prod-white-label', '750ml', 'ARR-WL-750', '4790001004', 3000.00, 3750.00, 30, 8, 1),
('var-wl-375', 'prod-white-label', '375ml', 'ARR-WL-375', '4790001005', 1550.00, 1950.00, 25, 8, 1),
('var-wl-180', 'prod-white-label', '180ml', 'ARR-WL-180', '4790001006', 780.00, 1000.00, 40, 10, 1),
('var-oa-750', 'prod-old-arrack', '750ml', 'ARR-OA-750', '4790001007', 3200.00, 3950.00, 24, 6, 1),
('var-oa-375', 'prod-old-arrack', '375ml', 'ARR-OA-375', '4790001008', 1650.00, 2050.00, 28, 6, 1),
('var-gb-750', 'prod-galilee-brandy', '750ml', 'ARR-GB-750', '4790001009', 3300.00, 4100.00, 20, 5, 1),
('var-gb-375', 'prod-galilee-brandy', '375ml', 'ARR-GB-375', '4790001010', 1700.00, 2150.00, 22, 5, 1),
('var-bo-750', 'prod-black-opal', '750ml', 'ARR-BO-750', '4790001011', 3400.00, 4250.00, 18, 5, 1),
('var-bo-375', 'prod-black-opal', '375ml', 'ARR-BO-375', '4790001012', 1750.00, 2200.00, 20, 5, 1),
('var-dd-750', 'prod-double-distilled', '750ml', 'ARR-DD-750', '4790001013', 3600.00, 4500.00, 22, 5, 1),
('var-dd-375', 'prod-double-distilled', '375ml', 'ARR-DD-375', '4790001014', 1850.00, 2350.00, 24, 5, 1),
('var-rex-750', 'prod-rockland-ex', '750ml', 'ARR-REX-750', '4790001015', 3350.00, 4150.00, 25, 5, 1),
('var-roa-750', 'prod-rockland-old-arrack', '750ml', 'ARR-ROA-750', '4790001016', 3250.00, 4000.00, 26, 5, 1),
('var-roa-375', 'prod-rockland-old-arrack', '375ml', 'ARR-ROA-375', '4790001017', 1680.00, 2100.00, 30, 6, 1),
('var-ns-750', 'prod-navy-special', '750ml', 'ARR-NS-750', '4790001018', 3100.00, 3800.00, 28, 5, 1),
('var-ns-375', 'prod-navy-special', '375ml', 'ARR-NS-375', '4790001019', 1600.00, 1980.00, 32, 6, 1),
('var-ns-180', 'prod-navy-special', '180ml', 'ARR-NS-180', '4790001020', 800.00, 1020.00, 45, 10, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 2: Rockland Old Dutch Arrack
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-old-dutch', 'Rockland Old Dutch Arrack', 'cat-arrack', 'comp-rockland', 'Rich oak aged smooth arrack', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-od-750', 'prod-old-dutch', '750ml Full Bottle', 'ARR-OD-750', '4790002001', 3400.00, 4200.00, 30, 8, 1),
('var-od-375', 'prod-old-dutch', '375ml Half Bottle', 'ARR-OD-375', '4790002002', 1750.00, 2250.00, 24, 8, 1),
('var-od-shot', 'prod-old-dutch', '50ml Shot', 'ARR-OD-50', NULL, 240.00, 380.00, 60, 15, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 3: Lion Lager Beer
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-lion-lager', 'Lion Lager Beer', 'cat-beer', 'comp-lion', 'Chilled crisp Sri Lankan premium lager', 'https://images.unsplash.com/photo-1608278243343-455928b975e1?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-lion-625', 'prod-lion-lager', '625ml Large Bottle', 'BER-LL-625', '4790003001', 580.00, 750.00, 120, 24, 1),
('var-lion-can', 'prod-lion-lager', '330ml Can', 'BER-LL-330', '4790003002', 380.00, 500.00, 96, 20, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 4: Lion Strong Beer (8.8%)
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-lion-strong', 'Lion Strong Beer (8.8%)', 'cat-beer', 'comp-lion', 'Deep rich golden malt strong beer', 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-ls-625', 'prod-lion-strong', '625ml Large Bottle', 'BER-LS-625', '4790003003', 620.00, 820.00, 80, 18, 1),
('var-ls-can', 'prod-lion-strong', '500ml Mega Can', 'BER-LS-500', '4790003004', 520.00, 700.00, 72, 18, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 5: Johnnie Walker Black Label 12Y
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-jw-black', 'Johnnie Walker Black Label 12YO', 'cat-whisky', NULL, 'Blended Scotch Whisky with rich smoky notes', 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-jw-750', 'prod-jw-black', '750ml Full Bottle', 'WHK-JWB-750', '5000267014', 16500.00, 21500.00, 15, 4, 1),
('var-jw-shot', 'prod-jw-black', '50ml Double Shot', 'WHK-JWB-50', NULL, 1100.00, 1600.00, 40, 10, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 6: Spicy Devilled Pork / Chicken (Kitchen Item)
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-devilled-pork', 'Spicy Devilled Pork (Chef Special)', 'cat-bites', 'comp-kitchen', 'Tender pork cubes tossed with fresh capsicum, onions and fiery chili sauce', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60', 1, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-dp-reg', 'prod-devilled-pork', 'Regular Portion (2 Pax)', 'KIT-DP-REG', NULL, 850.00, 1650.00, 50, 10, 1),
('var-dp-lrg', 'prod-devilled-pork', 'Large Portion (4 Pax)', 'KIT-DP-LRG', NULL, 1500.00, 2800.00, 30, 5, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 7: Hot Butter Cuttlefish (Kitchen Item)
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-hbc', 'Hot Butter Cuttlefish (HBC)', 'cat-bites', 'comp-kitchen', 'Crispy battered lagoon cuttlefish with butter chili scallions', 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500&auto=format&fit=crop&q=60', 1, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-hbc-reg', 'prod-hbc', 'Standard Portion', 'KIT-HBC-REG', NULL, 1100.00, 2200.00, 40, 8, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 8: Royal Seafood Mixed Fried Rice
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-seafood-rice', 'Royal Seafood Mixed Fried Rice', 'cat-mains', 'comp-kitchen', 'Basmati rice with prawns, calamari, fried egg and chili paste', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=60', 1, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-sfr-reg', 'prod-seafood-rice', 'Regular Portion (1-2 Pax)', 'KIT-SFR-REG', NULL, 900.00, 1850.00, 60, 10, 1),
('var-sfr-lrg', 'prod-seafood-rice', 'Large Portion (3-4 Pax)', 'KIT-SFR-LRG', NULL, 1600.00, 3200.00, 35, 5, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

-- Product 9: Chasers & Soft Drinks
INSERT INTO `products` (`id`, `name`, `category_id`, `company_id`, `description`, `image`, `is_kitchen_item`, `tax_rate`, `is_active`, `is_archived`) VALUES
('prod-soda', 'Elephant House Soda / Ginger Beer', 'cat-softdrinks', NULL, 'Chilled sparkling soda and EGB chaser', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60', 0, 0.00, 1, 0)
ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `product_variants` (`id`, `product_id`, `size`, `sku`, `barcode`, `cost_price`, `selling_price`, `stock`, `min_stock_level`, `is_active`) VALUES
('var-soda-bot', 'prod-soda', 'Soda Glass Bottle (300ml)', 'BEV-SOD-300', '4790004001', 90.00, 180.00, 150, 30, 1),
('var-egb-bot', 'prod-soda', 'EGB Ginger Beer (300ml)', 'BEV-EGB-300', '4790004002', 110.00, 220.00, 100, 25, 1)
ON DUPLICATE KEY UPDATE `id`=`id`;

SET FOREIGN_KEY_CHECKS = 1;
