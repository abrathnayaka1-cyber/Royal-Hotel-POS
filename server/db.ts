import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveDataDir } from './paths.ts';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  /**
   * KITCHEN_MANAGER (v1.2.0): restricted role with access ONLY to the
   * Food & Kitchen module (ingredients, recipes, wastage, counts, food cost,
   * kitchen reports). Uses the SAME authentication system as every other
   * role — no separate login. All Super-Admin-only APIs continue to reject
   * this role through requireRole('super_admin') → 403.
   */
  role: 'super_admin' | 'cashier' | 'kitchen_manager';
  passwordHash: string; // bcrypt hash
  isActive: boolean;
  pin?: string;
  createdAt: string;
  lastLogin?: string;
  lastLoginAt?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'bar' | 'restaurant' | 'service' | 'other';
  icon?: string;
  isActive: boolean;
  displayOrder: number;
  /**
   * When true the category button is HIDDEN from the cashier POS interface
   * (sidebar). Products in a hidden category still show under the type-based
   * quick filters (e.g. FOOD & KITCHEN) and ALL ITEMS. The category remains
   * fully visible/manageable in the Super Admin panel only.
   */
  hiddenInPOS?: boolean;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string; // e.g. '750ml', '375ml', '180ml', '100ml', '50ml', '25ml', 'Full', 'Regular', 'Portion', 'Bottle', 'Glass'
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockLevel: number;
  isActive: boolean;
  /**
   * Shot / peg poured from the 750ml bottle stock.
   * Shot variants keep NO independent stock — every shot sold reduces the
   * 750ml bottle stock (via the product's open-bottle ml tracker).
   */
  isShot?: boolean;
  /** Pour volume in ml for shot variants (e.g. 100, 50, 25). */
  shotVolumeMl?: number;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  companyId?: string;
  description?: string;
  image?: string;
  isKitchenItem: boolean; // triggers KOT
  taxRate?: number; // percentage
  isActive: boolean;
  isArchived?: boolean;
  createdAt: string;
  variants: ProductVariant[];
  /** When true, this item serves shots (100/50/25ml) poured from its 750ml bottle stock. */
  servesShots?: boolean;
  /** ml already poured (sold as shots) from the currently open 750ml bottle. 0..749 */
  openBottleUsedMl?: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  size: string;
  unitPrice: number;
  costPrice?: number;
  quantity: number;
  discount: number; // line discount
  tax: number;
  total: number;
  notes?: string;
  isKitchenItem?: boolean;
  kotStatus?: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
}

export interface HeldBill {
  id: string;
  billNumber: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  cashierId: string;
  cashierName: string;
  orderType: 'dine_in' | 'takeaway' | 'bar_counter' | 'room_service';
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountPercentage?: number;
  tax: number;
  grandTotal: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KOT {
  id: string;
  kotNumber: string;
  orderId?: string;
  billNumber?: string;
  tableNumber?: string;
  orderType: 'dine_in' | 'takeaway' | 'bar_counter' | 'room_service';
  cashierId: string;
  cashierName: string;
  items: OrderItem[];
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  invoiceNumber: string;
  orderType: 'dine_in' | 'takeaway' | 'bar_counter' | 'room_service';
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  cashierId: string;
  cashierName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountPercentage?: number;
  tax: number;
  taxRate?: number;
  serviceCharge?: number;
  serviceChargeRate?: number;
  grandTotal: number;
  amountReceived: number;
  changeAmount: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other' | 'split';
  paymentDetails?: any;
  status: 'paid' | 'held' | 'cancelled' | 'voided';
  notes?: string;
  /** Kitchen ingredient deductions made for this bill (snapshot at sale time). */
  kitchenDeductions?: KitchenDeductionSnapshot[];
  createdAt: string;
  paidAt?: string;
}

/**
 * Snapshot of kitchen-ingredient deductions made for a bill at sale time.
 * Stored on the Bill so a void restores EXACTLY what was deducted, even if
 * the recipe was edited, archived or replaced after the sale.
 */
export interface KitchenDeductionSnapshot {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  /** Total quantity deducted for this bill (positive number). */
  quantity: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  companyId?: string;
  companyName?: string;
  categoryId?: string;
  categoryName?: string;
  variantId: string;
  variantSize: string;
  quantityChange: number; // + or -
  quantityBefore: number;
  quantityAfter: number;
  movementType: 'opening_stock' | 'purchase' | 'stock_in' | 'sale' | 'stock_out' | 'adjustment' | 'damaged' | 'expired' | 'return' | 'correction';
  reason?: string;
  referenceId?: string; // e.g. Bill ID or Delivery Note #
  costPrice?: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomType: string;
  floor: string;
  capacity: number;
  ratePerDay: number;
  rateHalfDay?: number;
  amenities: string[];
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';
  currentBookingId?: string;
  currentGuestName?: string;
  currentGuestPhone?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface RoomBooking {
  id: string;
  bookingNumber: string;
  roomId: string;
  roomNumber: string;
  roomType: string;
  guestName: string;
  guestPhone: string;
  guestIdOrPassport: string;
  guestAddress?: string;
  numberOfGuests: number;
  checkInDate: string;
  checkOutDate: string;
  durationDays: number;
  ratePerDay: number;
  totalRoomCharge: number;
  extraCharges: number;
  discount: number;
  tax: number;
  grandTotal: number;
  advancePaid: number;
  balanceDue: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other';
  paymentDetails?: any;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  cashierId: string;
  cashierName: string;
  notes?: string;
  createdAt: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

// ==========================================
// FOOD & KITCHEN MODULE (v1.2.0 — Kitchen Manager role)
// ==========================================
// Additive collections that follow the SAME architecture as the existing
// product/variant stock system: every ingredient quantity change goes through
// a movement ledger record (recordKitchenMovement mirrors recordStockMovement),
// and every action is written to the existing auditLogs via logAudit().
// No existing table is modified; these arrays are ensured on DB load.

/** Kitchen ingredient (Rice, Chicken, Cooking Oil, …) tracked in the kitchen store. */
export interface KitchenIngredient {
  id: string;
  name: string;
  /** Unit label, e.g. 'g', 'kg', 'ml', 'l', 'pcs'. */
  unit: string;
  /** Current quantity on hand (in `unit`). */
  currentStock: number;
  /** Minimum stock level before the LOW STOCK alert fires. */
  minStockLevel: number;
  /** Latest cost per 1 unit (Rs.). Used for wastage/variance/food cost. */
  costPerUnit: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Movement ledger for kitchen ingredients — mirrors StockMovement for products. */
export type KitchenMovementType =
  | 'opening_stock'
  | 'stock_in'
  | 'stock_out'
  | 'sale'
  | 'wastage'
  | 'adjustment'
  | 'count_correction';

export interface KitchenStockMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityChange: number; // signed
  quantityBefore: number;
  quantityAfter: number;
  movementType: KitchenMovementType;
  reason?: string;
  /** Bill number (sale / void restore), count number, request number, … */
  referenceId?: string;
  costPerUnit?: number;
  userId: string;
  userName: string;
  createdAt: string;
}

/** One ingredient line of a recipe. */
export interface KitchenRecipeItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  /** Quantity per ONE portion of the menu item. */
  quantity: number;
}

/** Historical snapshot of a recipe (never destroyed — required by past sales). */
export interface KitchenRecipeVersion {
  version: number;
  items: KitchenRecipeItem[];
  savedAt: string;
  savedById: string;
  savedByName: string;
}

/**
 * Recipe linking a POS menu item variant (e.g. "Special Chicken Fried Rice —
 * Regular Portion") to its ingredient quantities per portion. When the variant
 * is sold through the EXISTING POS checkout, ingredients are deducted
 * automatically from the kitchen store.
 */
export interface KitchenRecipe {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  /** Portions the ingredient quantities produce (default 1). */
  servings: number;
  items: KitchenRecipeItem[];
  isActive: boolean;
  version: number;
  /** Previous versions kept for history. */
  history: KitchenRecipeVersion[];
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const KITCHEN_WASTAGE_CATEGORIES = [
  'Spoilage',
  'Spillage',
  'Burnt Food',
  'Preparation Loss',
  'Cutting Loss',
  'Expired Material',
  'Damaged Material',
  'Over Portion',
  'Staff Meal',
  'Other',
] as const;

export type KitchenWastageCategory = (typeof KITCHEN_WASTAGE_CATEGORIES)[number];

export interface KitchenWastageRecord {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  /** Rs. value of the wasted quantity. */
  cost: number;
  category: KitchenWastageCategory;
  reason?: string;
  notes?: string;
  movementId: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface KitchenCountLine {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  expected: number;
  physical: number;
  variance: number; // physical - expected
  varianceCost: number;
  /** Applied immediately (within approval threshold) or waiting for admin approval. */
  status: 'applied' | 'pending_approval' | 'no_variance';
}

export interface KitchenPhysicalCount {
  id: string;
  countNumber: string;
  lines: KitchenCountLine[];
  totalVarianceCost: number;
  /** applied = every variance line applied; partial = some lines pending approval. */
  status: 'applied' | 'partial' | 'pending_approval';
  notes?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

/**
 * High-risk adjustment approval workflow (large stock corrections).
 * Kitchen Manager creates the request; Super Admin approves/rejects;
 * only approval updates stock (through a movement record).
 */
export interface KitchenAdjustmentRequest {
  id: string;
  requestNumber: string;
  type: 'stock_adjustment';
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentQty: number;
  requestedQty: number;
  diffQty: number;
  varianceCost: number;
  reason: string;
  countNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

// ==========================================
// SMART STOCK IMPORT (Excel / CSV / PDF)
// ==========================================

export type StockImportType = 'purchase' | 'physical_count';

export type StockImportRowStatus =
  | 'MATCHED'
  | 'NEW_ITEM'
  | 'PRICE_CHANGE'
  | 'DUPLICATE'
  | 'NEEDS_REVIEW'
  | 'INVALID';

export interface StockImportRowResult {
  productName: string;
  size: string;
  sku?: string;
  productId?: string;
  variantId?: string;
  status: StockImportRowStatus;
  quantity: number;          // Purchase: units added. Physical count: counted quantity.
  stockBefore?: number;
  stockAfter?: number;
  adjustment?: number;       // Physical count difference (+/-)
  oldCostPrice?: number;
  newCostPrice?: number;
  oldSellingPrice?: number;
  newSellingPrice?: number;
  note?: string;
}

export interface StockImport {
  id: string;                // e.g. IMP-20260824-0001
  importType: StockImportType;
  fileName?: string;
  fileType?: string;         // xlsx | xls | csv | pdf | manual
  fileHash?: string;         // SHA-256 fingerprint for duplicate detection
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  summary: {
    matched: number;
    newProducts: number;
    newVariants: number;
    newCategories: number;
    newCompanies: number;
    priceChanges: number;
    totalUnitsAdded: number;
    totalAdjustment: number;
    rowsImported: number;
    rowsExcluded: number;
  };
  createdCategories: string[];
  createdCompanies: string[];
  createdProducts: string[];
  rows: StockImportRowResult[];
  userId: string;
  userName: string;
  createdAt: string;
}

export interface SystemSettings {
  businessName: string;
  businessTagline?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  currency: string;
  currencySymbol: string;
  taxRate: number; // e.g. 0% or 10%
  serviceChargeRate: number; // e.g. 10%
  allowNegativeStock: boolean;
  enableDiscounts: boolean;
  maxDiscountPercentage: number;
  invoicePrefix: string;
  billPrefix: string;
  kotPrefix: string;
  receiptHeader?: string;
  receiptFooter: string;
  lowStockDefaultThreshold: number;
  roomBookingPrefix?: string;
  // Thermal Printer Settings
  printerType?: 'thermal' | 'a4' | 'other';
  thermalWidth?: '58mm' | '80mm';
  autoPrintAfterPayment?: boolean;
  allowCashierToPrint?: boolean;
}

export interface DatabaseSchema {
  users: User[];
  categories: Category[];
  companies: Company[];
  products: Product[];
  rooms: Room[];
  roomBookings: RoomBooking[];
  heldBills: HeldBill[];
  kots: KOT[];
  bills: Bill[];
  stockMovements: StockMovement[];
  stockImports: StockImport[];
  auditLogs: AuditLog[];
  // Food & Kitchen module (v1.2.0) — additive, ensured on load
  kitchenIngredients: KitchenIngredient[];
  kitchenMovements: KitchenStockMovement[];
  kitchenRecipes: KitchenRecipe[];
  kitchenWastage: KitchenWastageRecord[];
  kitchenCounts: KitchenPhysicalCount[];
  kitchenAdjustmentRequests: KitchenAdjustmentRequest[];
  settings: SystemSettings;
  counters: {
    billSeq: number;
    invoiceSeq: number;
    kotSeq: number;
    bookingSeq: number;
    holdSeq?: number;
    importSeq?: number;
    kitchenCountSeq?: number;
    kitchenRequestSeq?: number;
  };
}

// Data directory is resolved independently of process.cwd() so that PM2 /
// systemd / cPanel / Docker launches can never point the app at a different
// (empty) database. See server/paths.ts for the full rationale.
const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'pos_database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure data and backup directories exist. If this fails the process must NOT
// continue silently — running with an unwritable data dir means every sale is
// lost on restart.
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch (err) {
  console.error(`[DB][FATAL] Data directory is not writable: ${DATA_DIR}`);
  console.error('[DB][FATAL] Set POS_DATA_DIR to a writable absolute path, or fix permissions.');
  throw err;
}

console.log(`[DB] Data directory: ${DATA_DIR}`);

// Initial default settings - Updated branding to Royal Hotel
const defaultSettings: SystemSettings = {
  businessName: process.env.BUSINESS_NAME || "Royal Hotel & Restaurant",
  businessTagline: process.env.BUSINESS_TAGLINE || "Fine Liquor, Cuisine & Hospitality",
  address: "No. 42 Beach Road, Puttalam, Sri Lanka",
  phone: "+94 32 226 5500 / +94 77 123 4567",
  email: "info@royalhotel.lk",
  website: "www.royalhotel.lk",
  currency: "LKR",
  currencySymbol: "Rs.",
  taxRate: 0,
  serviceChargeRate: 10,
  allowNegativeStock: false,
  enableDiscounts: true,
  maxDiscountPercentage: 20,
  invoicePrefix: "INV-",
  billPrefix: "BILL-",
  kotPrefix: "KOT-",
  roomBookingPrefix: "RBK-",
  receiptHeader: "Welcome to Royal Hotel",
  receiptFooter: "Thank you for visiting Royal Hotel! Please visit again.",
  lowStockDefaultThreshold: 5,
  printerType: "thermal",
  thermalWidth: "80mm",
  autoPrintAfterPayment: false,
  allowCashierToPrint: true,
};

// Initial Seed Data with Real Commercial Bar & Restaurant Products
const initialCategories: Category[] = [
  { id: 'cat-1', name: 'Arrack', type: 'bar', displayOrder: 1, isActive: true },
  { id: 'cat-2', name: 'Whisky', type: 'bar', displayOrder: 2, isActive: true },
  { id: 'cat-3', name: 'Beer', type: 'bar', displayOrder: 3, isActive: true },
  { id: 'cat-4', name: 'Brandy & Rum', type: 'bar', displayOrder: 4, isActive: true },
  { id: 'cat-5', name: 'Vodka & Gin', type: 'bar', displayOrder: 5, isActive: true },
  { id: 'cat-6', name: 'Wine', type: 'bar', displayOrder: 6, isActive: true },
  { id: 'cat-7', name: 'Bites & Starters', type: 'restaurant', displayOrder: 7, isActive: true },
  { id: 'cat-8', name: 'Rice & Main Meals', type: 'restaurant', displayOrder: 8, isActive: true },
  { id: 'cat-9', name: 'Kottu & Rotti', type: 'restaurant', displayOrder: 9, isActive: true },
  { id: 'cat-10', name: 'Soft Drinks & Water', type: 'restaurant', displayOrder: 10, isActive: true },
  { id: 'cat-11', name: 'Bar Services & Mixers', type: 'service', displayOrder: 11, isActive: true },
  // Hidden in cashier POS — items appear under the FOOD & KITCHEN filter only;
  // the category buttons themselves are admin-panel-visible only (POS stays clean).
  { id: 'cat-1kg-portion', name: '1KG Portion (Bulk Food)', type: 'restaurant', displayOrder: 12, isActive: true, hiddenInPOS: true },
  { id: 'cat-beer-pub', name: 'Beer Pub', type: 'restaurant', displayOrder: 13, isActive: true, hiddenInPOS: true },
];

const initialCompanies: Company[] = [
  { id: 'comp-1', name: 'Rockland Distilleries', description: 'Premium Arrack & Spirits', isActive: true },
  { id: 'comp-2', name: 'IDL (International Distilleries)', description: 'Ascot, Old Keg, White Diamond', isActive: true },
  { id: 'comp-3', name: 'DCSL (Distilleries Company of Sri Lanka)', description: 'Extra Special, Double Distilled', isActive: true },
  { id: 'comp-4', name: 'Lion Brewery Ceylon', description: 'Lion Lager, Stout, Carlsberg', isActive: true },
  { id: 'comp-5', name: 'W. M. Mendis & Co.', description: 'Mendis Old Arrack, Coconut Arrack', isActive: true },
  { id: 'comp-6', name: 'Diageo / Global Brands', description: 'Johnnie Walker, Smirnoff, Gordon’s', isActive: true },
  { id: 'comp-7', name: 'In-House Kitchen', description: 'Fresh restaurant food & bites', isActive: true },
  { id: 'comp-8', name: 'Elephant House / Coca-Cola', description: 'Soft beverages and chasers', isActive: true },
];

const initialProducts: Product[] = [
  // Rockland Old (Gal) — labelled like the physical stock sheet: name + size
  // reads "Rockland Old (Gal) 750ml". Serves shots poured from the 750ml bottle stock.
  {
    id: 'prod-1',
    name: 'Rockland Old (Gal)',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    description: 'Traditional blended coconut spirit aged in teak vats.',
    isKitchenItem: false,
    isActive: true,
    servesShots: true,
    openBottleUsedMl: 0,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1-750', productId: 'prod-1', size: '750ml', sku: 'RK-ARR-750', costPrice: 3100, sellingPrice: 3850, stock: 24, minStockLevel: 5, isActive: true },
      { id: 'var-1-375', productId: 'prod-1', size: '375ml Half', sku: 'RK-ARR-375', costPrice: 1600, sellingPrice: 1980, stock: 36, minStockLevel: 6, isActive: true },
      { id: 'var-1-180', productId: 'prod-1', size: '180ml Quarter', sku: 'RK-ARR-180', costPrice: 800, sellingPrice: 1050, stock: 45, minStockLevel: 10, isActive: true },
      { id: 'var-1-100', productId: 'prod-1', size: '100ml Shot Plus', sku: 'RK-ARR-100', costPrice: 460, sellingPrice: 620, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 100 },
      { id: 'var-1-50', productId: 'prod-1', size: '50ml Peg / Double', sku: 'RK-ARR-50', costPrice: 230, sellingPrice: 330, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 50 },
      { id: 'var-1-25', productId: 'prod-1', size: '25ml Single Shot', sku: 'RK-ARR-25', costPrice: 120, sellingPrice: 180, stock: 0, minStockLevel: 0, isActive: true, isShot: true, shotVolumeMl: 25 },
    ]
  },
  // DCSL Extra Special Arrack
  {
    id: 'prod-2',
    name: 'Extra Special Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-3',
    description: 'Sri Lanka’s iconic smooth coconut blended arrack.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-2-750', productId: 'prod-2', size: '750ml', sku: 'DCSL-ES-750', costPrice: 2950, sellingPrice: 3650, stock: 30, minStockLevel: 5, isActive: true },
      { id: 'var-2-375', productId: 'prod-2', size: '375ml', sku: 'DCSL-ES-375', costPrice: 1520, sellingPrice: 1890, stock: 40, minStockLevel: 8, isActive: true },
      { id: 'var-2-180', productId: 'prod-2', size: '180ml', sku: 'DCSL-ES-180', costPrice: 760, sellingPrice: 980, stock: 55, minStockLevel: 10, isActive: true },
    ]
  },
  // White Label Arrack
  {
    id: 'prod-wl',
    name: 'White Label Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-3',
    description: 'Popular high quality blended spirit.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-wl-750', productId: 'prod-wl', size: '750ml', sku: 'WL-ARR-750', costPrice: 3000, sellingPrice: 3750, stock: 25, minStockLevel: 5, isActive: true },
      { id: 'var-wl-375', productId: 'prod-wl', size: '375ml', sku: 'WL-ARR-375', costPrice: 1550, sellingPrice: 1950, stock: 35, minStockLevel: 8, isActive: true },
      { id: 'var-wl-180', productId: 'prod-wl', size: '180ml', sku: 'WL-ARR-180', costPrice: 780, sellingPrice: 1000, stock: 45, minStockLevel: 10, isActive: true },
    ]
  },
  // Old Arrack (DCSL)
  {
    id: 'prod-oa',
    name: 'Old Arrack (DCSL)',
    categoryId: 'cat-1',
    companyId: 'comp-3',
    description: 'Aged pure coconut arrack in wooden vats.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-oa-750', productId: 'prod-oa', size: '750ml', sku: 'OA-ARR-750', costPrice: 3200, sellingPrice: 3950, stock: 20, minStockLevel: 5, isActive: true },
      { id: 'var-oa-375', productId: 'prod-oa', size: '375ml', sku: 'OA-ARR-375', costPrice: 1650, sellingPrice: 2050, stock: 30, minStockLevel: 6, isActive: true },
    ]
  },
  // Galilee Brandy
  {
    id: 'prod-gb',
    name: 'Galilee Brandy',
    categoryId: 'cat-1',
    companyId: 'comp-2',
    description: 'Smooth French blend aromatic brandy.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-gb-750', productId: 'prod-gb', size: '750ml', sku: 'GB-BRN-750', costPrice: 3300, sellingPrice: 4100, stock: 18, minStockLevel: 4, isActive: true },
      { id: 'var-gb-375', productId: 'prod-gb', size: '375ml', sku: 'GB-BRN-375', costPrice: 1700, sellingPrice: 2150, stock: 24, minStockLevel: 6, isActive: true },
    ]
  },
  // Black Opal Arrack
  {
    id: 'prod-bo',
    name: 'Black Opal Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-2',
    description: 'Rich dark refined coconut spirit.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bo-750', productId: 'prod-bo', size: '750ml', sku: 'BO-ARR-750', costPrice: 3400, sellingPrice: 4250, stock: 15, minStockLevel: 4, isActive: true },
      { id: 'var-bo-375', productId: 'prod-bo', size: '375ml', sku: 'BO-ARR-375', costPrice: 1750, sellingPrice: 2200, stock: 22, minStockLevel: 5, isActive: true },
    ]
  },
  // Double Distilled Arrack
  {
    id: 'prod-dd',
    name: 'Double Distilled Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-3',
    description: 'Pot-distilled double refined coconut arrack.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-dd-750', productId: 'prod-dd', size: '750ml', sku: 'DD-ARR-750', costPrice: 3600, sellingPrice: 4500, stock: 20, minStockLevel: 5, isActive: true },
      { id: 'var-dd-375', productId: 'prod-dd', size: '375ml', sku: 'DD-ARR-375', costPrice: 1850, sellingPrice: 2350, stock: 28, minStockLevel: 6, isActive: true },
    ]
  },
  // Rockland EX Arrack
  {
    id: 'prod-rex',
    name: 'Rockland EX Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    description: 'Extra special Rockland distillery signature blend.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-rex-750', productId: 'prod-rex', size: '750ml', sku: 'REX-ARR-750', costPrice: 3350, sellingPrice: 4150, stock: 22, minStockLevel: 5, isActive: true },
    ]
  },
  // Rockland Old Arrack
  {
    id: 'prod-roa',
    name: 'Rockland Old Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    description: 'Traditional wood vat aged Rockland old arrack.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-roa-750', productId: 'prod-roa', size: '750ml', sku: 'ROA-ARR-750', costPrice: 3250, sellingPrice: 4000, stock: 26, minStockLevel: 5, isActive: true },
      { id: 'var-roa-375', productId: 'prod-roa', size: '375ml', sku: 'ROA-ARR-375', costPrice: 1680, sellingPrice: 2100, stock: 32, minStockLevel: 6, isActive: true },
    ]
  },
  // Navy Special Arrack
  {
    id: 'prod-ns',
    name: 'Navy Special Arrack',
    categoryId: 'cat-1',
    companyId: 'comp-3',
    description: 'Classic robust navy recipe arrack.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-ns-750', productId: 'prod-ns', size: '750ml', sku: 'NS-ARR-750', costPrice: 3100, sellingPrice: 3800, stock: 24, minStockLevel: 5, isActive: true },
      { id: 'var-ns-375', productId: 'prod-ns', size: '375ml', sku: 'NS-ARR-375', costPrice: 1600, sellingPrice: 1980, stock: 30, minStockLevel: 6, isActive: true },
      { id: 'var-ns-180', productId: 'prod-ns', size: '180ml', sku: 'NS-ARR-180', costPrice: 800, sellingPrice: 1020, stock: 40, minStockLevel: 8, isActive: true },
    ]
  },
  // Johnnie Walker Black Label
  {
    id: 'prod-3',
    name: 'Johnnie Walker Black Label 12Y',
    categoryId: 'cat-2',
    companyId: 'comp-6',
    description: 'Iconic blended Scotch whisky with rich, smoky complexity.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-3-1000', productId: 'prod-3', size: '1000ml Bottle', sku: 'JW-BLK-1000', costPrice: 17500, sellingPrice: 22000, stock: 12, minStockLevel: 3, isActive: true },
      { id: 'var-3-750', productId: 'prod-3', size: '750ml Bottle', sku: 'JW-BLK-750', costPrice: 13500, sellingPrice: 17500, stock: 18, minStockLevel: 4, isActive: true },
      { id: 'var-3-50', productId: 'prod-3', size: '50ml Double Peg', sku: 'JW-BLK-50', costPrice: 950, sellingPrice: 1450, stock: 40, minStockLevel: 10, isActive: true },
      { id: 'var-3-25', productId: 'prod-3', size: '25ml Single Shot', sku: 'JW-BLK-25', costPrice: 480, sellingPrice: 780, stock: 60, minStockLevel: 10, isActive: true },
    ]
  },
  // Lion Lager Beer
  {
    id: 'prod-4',
    name: 'Lion Lager Beer 4.8%',
    categoryId: 'cat-3',
    companyId: 'comp-4',
    description: 'Golden roasted malt lager brewed in Sri Lanka.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-4-625', productId: 'prod-4', size: '625ml Large Bottle', sku: 'LION-LAG-625', costPrice: 580, sellingPrice: 750, stock: 96, minStockLevel: 12, isActive: true },
      { id: 'var-4-330', productId: 'prod-4', size: '330ml Can', sku: 'LION-LAG-330', costPrice: 380, sellingPrice: 490, stock: 72, minStockLevel: 12, isActive: true },
      { id: 'var-4-pitcher', productId: 'prod-4', size: 'Pitcher (1.5L)', sku: 'LION-LAG-PIT', costPrice: 1350, sellingPrice: 1800, stock: 30, minStockLevel: 5, isActive: true },
    ]
  },
  // Lion Strong Beer 8.8%
  {
    id: 'prod-5',
    name: 'Lion Strong Beer 8.8%',
    categoryId: 'cat-3',
    companyId: 'comp-4',
    description: 'Full-bodied extra strong lager with rich golden color.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-5-625', productId: 'prod-5', size: '625ml Large Bottle', sku: 'LION-STR-625', costPrice: 660, sellingPrice: 850, stock: 84, minStockLevel: 12, isActive: true },
      { id: 'var-5-330', productId: 'prod-5', size: '330ml Can', sku: 'LION-STR-330', costPrice: 420, sellingPrice: 550, stock: 60, minStockLevel: 10, isActive: true },
    ]
  },
  // Smirnoff Red Vodka
  {
    id: 'prod-6',
    name: 'Smirnoff Red Vodka 21',
    categoryId: 'cat-5',
    companyId: 'comp-6',
    description: 'Triple distilled premium classic vodka.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-6-750', productId: 'prod-6', size: '750ml Bottle', sku: 'SMIR-RED-750', costPrice: 8200, sellingPrice: 10800, stock: 15, minStockLevel: 4, isActive: true },
      { id: 'var-6-50', productId: 'prod-6', size: '50ml Peg', sku: 'SMIR-RED-50', costPrice: 580, sellingPrice: 850, stock: 45, minStockLevel: 10, isActive: true },
    ]
  },
  // Hot Butter Cuttlefish (Kitchen Food)
  {
    id: 'prod-7',
    name: 'Hot Butter Cuttlefish (HBC)',
    categoryId: 'cat-7',
    companyId: 'comp-7',
    description: 'Crispy fried cuttlefish tossed with spring onions, dried chilies, and garlic butter.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-7-full', productId: 'prod-7', size: 'Full Portion (Large)', sku: 'KIT-HBC-FUL', costPrice: 1400, sellingPrice: 2250, stock: 50, minStockLevel: 10, isActive: true },
      { id: 'var-7-reg', productId: 'prod-7', size: 'Regular Portion', sku: 'KIT-HBC-REG', costPrice: 900, sellingPrice: 1450, stock: 60, minStockLevel: 10, isActive: true },
    ]
  },
  // Devilled Chicken
  {
    id: 'prod-8',
    name: 'Spicy Devilled Chicken',
    categoryId: 'cat-7',
    companyId: 'comp-7',
    description: 'Tender chicken cubes wok-fried with bell peppers, tomatoes, onions and spicy sauce.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-8-full', productId: 'prod-8', size: 'Full (4-5 Pax)', sku: 'KIT-DEV-FUL', costPrice: 1100, sellingPrice: 1850, stock: 45, minStockLevel: 8, isActive: true },
      { id: 'var-8-reg', productId: 'prod-8', size: 'Regular (2 Pax)', sku: 'KIT-DEV-REG', costPrice: 650, sellingPrice: 1150, stock: 60, minStockLevel: 10, isActive: true },
    ]
  },
  // Chicken Fried Rice
  {
    id: 'prod-9',
    name: 'Special Chicken Fried Rice',
    categoryId: 'cat-8',
    companyId: 'comp-7',
    description: 'Fragrant basmati rice stir-fried with egg, seasoned chicken, and chili paste.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-9-full', productId: 'prod-9', size: 'Full (Large)', sku: 'KIT-CFR-FUL', costPrice: 900, sellingPrice: 1650, stock: 50, minStockLevel: 10, isActive: true },
      { id: 'var-9-reg', productId: 'prod-9', size: 'Regular Portion', sku: 'KIT-CFR-REG', costPrice: 550, sellingPrice: 950, stock: 60, minStockLevel: 10, isActive: true },
    ]
  },
  // Cheese Kottu
  {
    id: 'prod-10',
    name: 'Cheese Chicken Kottu',
    categoryId: 'cat-9',
    companyId: 'comp-7',
    description: 'Chopped Godamba rotti with savory chicken, gravy, eggs, vegetables, and creamy cheese.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-10-full', productId: 'prod-10', size: 'Full Plate', sku: 'KIT-CHK-FUL', costPrice: 1100, sellingPrice: 1750, stock: 40, minStockLevel: 8, isActive: true },
      { id: 'var-10-reg', productId: 'prod-10', size: 'Regular Plate', sku: 'KIT-CHK-REG', costPrice: 700, sellingPrice: 1150, stock: 50, minStockLevel: 8, isActive: true },
    ]
  },
  // Coca Cola / Sprite
  {
    id: 'prod-11',
    name: 'Coca Cola / Soda Mixer',
    categoryId: 'cat-10',
    companyId: 'comp-8',
    description: 'Chilled glass bottle / can mixer for cocktails and spirits.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-11-can', productId: 'prod-11', size: '330ml Can', sku: 'BEV-COC-330', costPrice: 140, sellingPrice: 250, stock: 120, minStockLevel: 20, isActive: true },
      { id: 'var-11-bot', productId: 'prod-11', size: '750ml PET Bottle', sku: 'BEV-COC-750', costPrice: 220, sellingPrice: 380, stock: 80, minStockLevel: 15, isActive: true },
    ]
  },
  // Ice Bucket & Mixers Service
  {
    id: 'prod-12',
    name: 'Ice Bucket & Glass Setup',
    categoryId: 'cat-11',
    companyId: 'comp-7',
    description: 'Large ice bucket with tongs, sliced lime, and clean bar glassware set.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-12-large', productId: 'prod-12', size: 'Large Bucket + Lime', sku: 'SER-ICE-LRG', costPrice: 50, sellingPrice: 300, stock: 100, minStockLevel: 10, isActive: true },
      { id: 'var-12-reg', productId: 'prod-12', size: 'Regular Ice Bucket', sku: 'SER-ICE-REG', costPrice: 30, sellingPrice: 200, stock: 100, minStockLevel: 10, isActive: true },
    ]
  },

  // ==========================================================================
  // 1KG PORTION — Bulk Kitchen Food Items (all isKitchenItem = true → KOT)
  // Category: cat-1kg-portion (type: restaurant → listed under FOOD & KITCHEN)
  // ==========================================================================
  {
    id: 'prod-1kg-01',
    name: 'Pork Stew 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Slow-braised pork stew — bulk 1KG portion (approx. 8-10 servings).',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-01', productId: 'prod-1kg-01', size: '1KG Portion', sku: 'K1G-PSTW', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-02',
    name: 'Hot Butter Cuttlefish 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy butter-tossed cuttlefish — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-02', productId: 'prod-1kg-02', size: '1KG Portion', sku: 'K1G-HBCF', costPrice: 0, sellingPrice: 7000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-03',
    name: 'Boiled Vegetable 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Fresh boiled mixed vegetables — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-03', productId: 'prod-1kg-03', size: '1KG Portion', sku: 'K1G-BVEG', costPrice: 0, sellingPrice: 3500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-04',
    name: 'Fish Fried 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy fried fish — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-04', productId: 'prod-1kg-04', size: '1KG Portion', sku: 'K1G-FFRY', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-05',
    name: 'Beef Deviled 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Spicy devilled beef with capsicum & onions — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-05', productId: 'prod-1kg-05', size: '1KG Portion', sku: 'K1G-BDEV', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-06',
    name: 'Sausages Deviled 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Devilled sausages tossed with onions & chili — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-06', productId: 'prod-1kg-06', size: '1KG Portion', sku: 'K1G-SDEV', costPrice: 0, sellingPrice: 4500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-07',
    name: 'French Fries 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Golden crispy french fries — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-07', productId: 'prod-1kg-07', size: '1KG Portion', sku: 'K1G-FF1K', costPrice: 0, sellingPrice: 4000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-08',
    name: 'Mutton Black Curry',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Slow-cooked black roasted mutton curry — standard portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-08', productId: 'prod-1kg-08', size: 'Standard Portion', sku: 'K1G-MBC', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-09',
    name: 'Cooking Charge',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Kitchen cooking / preparation charge for outside or special-order food.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-09', productId: 'prod-1kg-09', size: 'Per Order', sku: 'K1G-CCHG', costPrice: 0, sellingPrice: 0, stock: 9999, minStockLevel: 0, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-10',
    name: 'Beef Black Curry 500ml',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Black roasted beef curry — 500ml portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-10', productId: 'prod-1kg-10', size: '500ml Portion', sku: 'K1G-BBC5', costPrice: 0, sellingPrice: 3000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-11',
    name: 'Prawn Deviled 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Spicy devilled prawns with capsicum & onions — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-11', productId: 'prod-1kg-11', size: '1KG Portion', sku: 'K1G-PDEV', costPrice: 0, sellingPrice: 7000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-12',
    name: 'Fish Fingers 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crumbed golden fish fingers — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-12', productId: 'prod-1kg-12', size: '1KG Portion', sku: 'K1G-FFIN', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-13',
    name: 'Sausage Deviled 500g',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Devilled sausages with onions & chili — 500g portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-13', productId: 'prod-1kg-13', size: '500g Portion', sku: 'K1G-SDV5', costPrice: 0, sellingPrice: 2000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-14',
    name: 'Battered Vegetables 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy battered mixed vegetables — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-14', productId: 'prod-1kg-14', size: '1KG Portion', sku: 'K1G-BVEG1', costPrice: 0, sellingPrice: 4000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-15',
    name: 'Kadala 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Tempered black chickpeas (kadala) — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-15', productId: 'prod-1kg-15', size: '1KG Portion', sku: 'K1G-KAD', costPrice: 0, sellingPrice: 2400, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-16',
    name: 'Potato Wedges 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Seasoned crispy potato wedges — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-16', productId: 'prod-1kg-16', size: '1KG Portion', sku: 'K1G-PWED', costPrice: 0, sellingPrice: 2000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-17',
    name: 'Hot Battered Mushroom 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Hot battered crispy mushrooms — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-17', productId: 'prod-1kg-17', size: '1KG Portion', sku: 'K1G-HBM', costPrice: 0, sellingPrice: 2500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-18',
    name: 'Fish Cutlet 10pc',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Golden fried fish cutlets — 10 pieces portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-18', productId: 'prod-1kg-18', size: '10 Pieces', sku: 'K1G-FCUT', costPrice: 0, sellingPrice: 600, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-19',
    name: 'Fried Cashew 500g',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Salted fried cashew nuts — 500g portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-19', productId: 'prod-1kg-19', size: '500g Portion', sku: 'K1G-FCAS', costPrice: 0, sellingPrice: 5000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-20',
    name: 'Boiled Egg 10 Portion',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Boiled eggs — 10 portions pack.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-20', productId: 'prod-1kg-20', size: '10 Portions', sku: 'K1G-BEGG', costPrice: 0, sellingPrice: 1200, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-21',
    name: 'Fruit Platter',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Fresh seasonal fruit platter — standard portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-21', productId: 'prod-1kg-21', size: 'Standard Portion', sku: 'K1G-FPLT', costPrice: 0, sellingPrice: 1800, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-22',
    name: 'Hot Battered Cuttlefish 500g',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Hot battered crispy cuttlefish — 500g portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-22', productId: 'prod-1kg-22', size: '500g Portion', sku: 'K1G-HBC5', costPrice: 0, sellingPrice: 3500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-23',
    name: 'French Fries 500g',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Golden crispy french fries — 500g portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-23', productId: 'prod-1kg-23', size: '500g Portion', sku: 'K1G-FF5H', costPrice: 0, sellingPrice: 2000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-24',
    name: 'Chicken Deviled 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Spicy devilled chicken with capsicum & onions — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-24', productId: 'prod-1kg-24', size: '1KG Portion', sku: 'K1G-CDEV', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-25',
    name: 'Mixture 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Spicy fried bar mixture — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-25', productId: 'prod-1kg-25', size: '1KG Portion', sku: 'K1G-MIX', costPrice: 0, sellingPrice: 1500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-26',
    name: 'Chicken Fried 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy fried chicken — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-26', productId: 'prod-1kg-26', size: '1KG Portion', sku: 'K1G-CFRY', costPrice: 0, sellingPrice: 5000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-27',
    name: 'Beef Fried 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy fried beef — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-27', productId: 'prod-1kg-27', size: '1KG Portion', sku: 'K1G-BFRY', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-28',
    name: 'Sausage Fried 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Fried sausages — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-28', productId: 'prod-1kg-28', size: '1KG Portion', sku: 'K1G-SFRY', costPrice: 0, sellingPrice: 4000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-29',
    name: 'Prawns Fried 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy fried prawns — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-29', productId: 'prod-1kg-29', size: '1KG Portion', sku: 'K1G-PFRY', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-30',
    name: 'Fish Devilled 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Spicy devilled fish with capsicum & onions — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-30', productId: 'prod-1kg-30', size: '1KG Portion', sku: 'K1G-FDEV', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-31',
    name: 'Chicken Black Curry 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Black roasted chicken curry — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-31', productId: 'prod-1kg-31', size: '1KG Portion', sku: 'K1G-CBC', costPrice: 0, sellingPrice: 5500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-32',
    name: 'Beef Black Curry 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Black roasted beef curry — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-32', productId: 'prod-1kg-32', size: '1KG Portion', sku: 'K1G-BBC1', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-33',
    name: 'Chicken Stew 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Slow-braised chicken stew — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-33', productId: 'prod-1kg-33', size: '1KG Portion', sku: 'K1G-CSTW', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-34',
    name: 'Fish Stew 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Slow-braised fish stew — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-34', productId: 'prod-1kg-34', size: '1KG Portion', sku: 'K1G-FSTW', costPrice: 0, sellingPrice: 6000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-35',
    name: 'Beef Stew 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Slow-braised beef stew — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-35', productId: 'prod-1kg-35', size: '1KG Portion', sku: 'K1G-BSTW', costPrice: 0, sellingPrice: 6500, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-1kg-36',
    name: 'Battered Prawns 1KG',
    categoryId: 'cat-1kg-portion',
    companyId: 'comp-7',
    description: 'Crispy battered prawns — bulk 1KG portion.',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1kg-36', productId: 'prod-1kg-36', size: '1KG Portion', sku: 'K1G-BPRN', costPrice: 0, sellingPrice: 7000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },

  // ==========================================================================
  // BEER PUB — Price-point bar counter buttons (from legacy POS menu)
  // Category: cat-beer-pub (type: bar). Generic beer price buttons keep the
  // counter workflow: tap the tile matching the bottle/serve price.
  // "Beef Noodles Medium" is the only kitchen item here (fires a KOT).
  // ==========================================================================
  {
    id: 'prod-bp-01',
    name: 'Beer 900',
    categoryId: 'cat-beer-pub',
    description: 'Beer price-point button — serve/bottle sold at Rs. 900.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-01', productId: 'prod-bp-01', size: 'Bottle / Serve', sku: 'BP-BEER-900', costPrice: 0, sellingPrice: 900, stock: 100, minStockLevel: 24, isActive: true },
    ]
  },
  {
    id: 'prod-bp-02',
    name: 'Beer 950',
    categoryId: 'cat-beer-pub',
    description: 'Beer price-point button — serve/bottle sold at Rs. 950.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-02', productId: 'prod-bp-02', size: 'Bottle / Serve', sku: 'BP-BEER-950', costPrice: 0, sellingPrice: 950, stock: 100, minStockLevel: 24, isActive: true },
    ]
  },
  {
    id: 'prod-bp-03',
    name: 'Beer 870',
    categoryId: 'cat-beer-pub',
    description: 'Beer price-point button — serve/bottle sold at Rs. 870.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-03', productId: 'prod-bp-03', size: 'Bottle / Serve', sku: 'BP-BEER-870', costPrice: 0, sellingPrice: 870, stock: 100, minStockLevel: 24, isActive: true },
    ]
  },
  {
    id: 'prod-bp-04',
    name: 'Beer 800',
    categoryId: 'cat-beer-pub',
    description: 'Beer price-point button — serve/bottle sold at Rs. 800.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-04', productId: 'prod-bp-04', size: 'Bottle / Serve', sku: 'BP-BEER-800', costPrice: 0, sellingPrice: 800, stock: 100, minStockLevel: 24, isActive: true },
    ]
  },
  {
    id: 'prod-bp-05',
    name: 'Beef Noodles Medium',
    categoryId: 'cat-beer-pub',
    companyId: 'comp-7',
    description: 'Stir-fried beef noodles — medium portion (kitchen item, fires KOT).',
    isKitchenItem: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-05', productId: 'prod-bp-05', size: 'Medium Portion', sku: 'BP-BNDL-MED', costPrice: 0, sellingPrice: 1000, stock: 50, minStockLevel: 10, isActive: true },
    ]
  },
  {
    id: 'prod-bp-06',
    name: 'Beer 630',
    categoryId: 'cat-beer-pub',
    description: 'Beer price-point button — serve/bottle sold at Rs. 630.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-06', productId: 'prod-bp-06', size: 'Bottle / Serve', sku: 'BP-BEER-630', costPrice: 0, sellingPrice: 630, stock: 100, minStockLevel: 24, isActive: true },
    ]
  },
  {
    id: 'prod-bp-07',
    name: 'Arrack',
    categoryId: 'cat-beer-pub',
    description: 'Arrack serve — bar counter button at Rs. 1,400.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-bp-07', productId: 'prod-bp-07', size: 'Serve', sku: 'BP-ARR-1400', costPrice: 0, sellingPrice: 1400, stock: 100, minStockLevel: 10, isActive: true },
    ]
  }
];

// Initial Rooms Seed Data
const initialRooms: Room[] = [
  {
    id: 'room-101',
    roomNumber: '101',
    roomType: 'Deluxe AC Double',
    floor: 'Ground Floor',
    capacity: 2,
    ratePerDay: 8500,
    rateHalfDay: 5000,
    amenities: ['AC', 'Attached Bathroom', 'Hot Water', 'King Size Bed', 'LED TV', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-102',
    roomNumber: '102',
    roomType: 'Deluxe AC Double',
    floor: 'Ground Floor',
    capacity: 2,
    ratePerDay: 8500,
    rateHalfDay: 5000,
    amenities: ['AC', 'Attached Bathroom', 'Hot Water', 'King Size Bed', 'LED TV', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-103',
    roomNumber: '103',
    roomType: 'Standard Non-AC Double',
    floor: 'Ground Floor',
    capacity: 2,
    ratePerDay: 5500,
    rateHalfDay: 3500,
    amenities: ['Ceiling Fan', 'Attached Bathroom', 'Queen Bed', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-201',
    roomNumber: '201',
    roomType: 'Luxury AC Suite (Balcony & Garden View)',
    floor: '1st Floor',
    capacity: 2,
    ratePerDay: 14500,
    rateHalfDay: 8500,
    amenities: ['AC', 'Private Balcony', 'Hot Water Jacuzzi', 'King Bed', 'Mini Fridge', 'Smart TV', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-202',
    roomNumber: '202',
    roomType: 'Executive AC Family Room',
    floor: '1st Floor',
    capacity: 4,
    ratePerDay: 16000,
    rateHalfDay: 9500,
    amenities: ['AC', '2 Queen Beds', 'Attached Bathroom', 'Hot Water', 'Smart TV', 'Dining Table', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-203',
    roomNumber: '203',
    roomType: 'Deluxe AC Twin Room',
    floor: '1st Floor',
    capacity: 2,
    ratePerDay: 9000,
    rateHalfDay: 5500,
    amenities: ['AC', '2 Single Beds', 'Attached Bathroom', 'Hot Water', 'LED TV', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-cabana-1',
    roomNumber: 'Cabana 01',
    roomType: 'Royal Garden Villa / Cabana',
    floor: 'Garden Villa',
    capacity: 2,
    ratePerDay: 18500,
    rateHalfDay: 11000,
    amenities: ['AC', 'Private Garden Deck', 'King Bed', 'Rain Shower', 'Mini Bar', 'Coffee Maker', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'room-cabana-2',
    roomNumber: 'Cabana 02',
    roomType: 'Royal Garden Villa / Cabana',
    floor: 'Garden Villa',
    capacity: 2,
    ratePerDay: 18500,
    rateHalfDay: 11000,
    amenities: ['AC', 'Private Garden Deck', 'King Bed', 'Rain Shower', 'Mini Bar', 'Coffee Maker', 'Free Wi-Fi'],
    status: 'available',
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

// Initial Users - Only Super Admin seeded. Zero default cashiers.
import bcrypt from 'bcryptjs';

/**
 * First-run Super Admin password.
 *
 * - `DEFAULT_ADMIN_PASSWORD` env → used as-is.
 * - Production with NO env → a random one-time password is generated and
 *   printed to the server log (only when a fresh database is actually seeded,
 *   or a legacy account with no hash is repaired). The publicly-known default
 *   `Araliya2000` is NEVER used in production, so a fresh install cannot be
 *   taken over with a documented credential.
 * - Development (or explicit env) → the documented `Araliya2000` so the local
 *   quick-start and the E2E test suite keep working.
 */
function resolveDefaultAdminPassword(): string {
  if (process.env.DEFAULT_ADMIN_PASSWORD) return process.env.DEFAULT_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    const generated = crypto.randomBytes(18).toString('base64url');
    console.warn('[SECURITY] No DEFAULT_ADMIN_PASSWORD set — generated a random one-time Super Admin password for this fresh database.');
    console.warn('[SECURITY]   Username: Admin');
    console.warn(`[SECURITY]   Password: ${generated}`);
    console.warn('[SECURITY] Log in now and change it immediately (Admin → Users). This value is shown once and is never stored in plain text.');
    return generated;
  }
  return 'Araliya2000';
}

// ==========================================
// FOOD & KITCHEN SEED DATA (fresh databases only)
// ==========================================
// Only used when a BRAND NEW database is created. Existing databases simply
// get empty kitchen arrays (ensured on load) — no existing data is touched.

const initialKitchenIngredients: KitchenIngredient[] = [
  { id: 'king-1',  name: 'Rice (Samba)',       unit: 'g',  currentStock: 25000, minStockLevel: 5000, costPerUnit: 0.28, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-2',  name: 'Chicken (Boneless)', unit: 'g',  currentStock: 8000,  minStockLevel: 2000, costPerUnit: 1.60, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-3',  name: 'Fish (Tuna)',        unit: 'g',  currentStock: 4000,  minStockLevel: 1500, costPerUnit: 1.80, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-4',  name: 'Prawns',             unit: 'g',  currentStock: 2000,  minStockLevel: 800,  costPerUnit: 3.20, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-5',  name: 'Karawala (Dried Fish)', unit: 'g', currentStock: 1200, minStockLevel: 500, costPerUnit: 2.10, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-6',  name: 'Mixed Vegetables',   unit: 'g',  currentStock: 10000, minStockLevel: 3000, costPerUnit: 0.45, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-7',  name: 'Eggs',               unit: 'pcs', currentStock: 300,   minStockLevel: 90,   costPerUnit: 28.0, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-8',  name: 'Potatoes',           unit: 'g',  currentStock: 12000, minStockLevel: 4000, costPerUnit: 0.32, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-9',  name: 'Carrots',            unit: 'g',  currentStock: 6000,  minStockLevel: 2000, costPerUnit: 0.40, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-10', name: 'Onions (Big)',       unit: 'g',  currentStock: 9000,  minStockLevel: 3000, costPerUnit: 0.35, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-11', name: 'Garlic',             unit: 'g',  currentStock: 1500,  minStockLevel: 500,  costPerUnit: 0.90, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-12', name: 'Ginger',             unit: 'g',  currentStock: 1200,  minStockLevel: 400,  costPerUnit: 0.85, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-13', name: 'Turmeric Powder',    unit: 'g',  currentStock: 800,   minStockLevel: 200,  costPerUnit: 1.20, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-14', name: 'Chili (Kochchi)',    unit: 'g',  currentStock: 1000,  minStockLevel: 300,  costPerUnit: 1.50, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-15', name: 'Curry Powder',       unit: 'g',  currentStock: 1500,  minStockLevel: 400,  costPerUnit: 1.10, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-16', name: 'Salt & Pepper',      unit: 'g',  currentStock: 2000,  minStockLevel: 500,  costPerUnit: 0.20, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-17', name: 'Cooking Oil',        unit: 'ml', currentStock: 15000, minStockLevel: 4000, costPerUnit: 0.22, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-18', name: 'Coconut Milk',       unit: 'ml', currentStock: 6000,  minStockLevel: 2000, costPerUnit: 0.30, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-19', name: 'Sauces & Paste',     unit: 'g',  currentStock: 3000,  minStockLevel: 800,  costPerUnit: 0.75, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'king-20', name: 'Godamba Rotti',      unit: 'pcs', currentStock: 120,  minStockLevel: 40,   costPerUnit: 45.0, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const initialKitchenRecipes: KitchenRecipe[] = [
  {
    id: 'krec-1',
    productId: 'prod-9',
    productName: 'Special Chicken Fried Rice',
    variantId: 'var-9-reg',
    variantSize: 'Regular Portion',
    servings: 1,
    items: [
      { ingredientId: 'king-1',  ingredientName: 'Rice (Samba)',     unit: 'g',  quantity: 250 },
      { ingredientId: 'king-2',  ingredientName: 'Chicken (Boneless)', unit: 'g', quantity: 80 },
      { ingredientId: 'king-9',  ingredientName: 'Carrots',          unit: 'g',  quantity: 20 },
      { ingredientId: 'king-10', ingredientName: 'Onions (Big)',     unit: 'g',  quantity: 15 },
      { ingredientId: 'king-7',  ingredientName: 'Eggs',             unit: 'pcs', quantity: 1 },
      { ingredientId: 'king-17', ingredientName: 'Cooking Oil',      unit: 'ml', quantity: 15 },
      { ingredientId: 'king-14', ingredientName: 'Chili (Kochchi)',  unit: 'g',  quantity: 2 },
    ],
    isActive: true,
    version: 1,
    history: [],
    createdById: 'user-admin',
    createdByName: 'Super Admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function makeInitialUsers(): User[] {
  return [
    {
      id: 'user-admin',
      name: 'Super Admin',
      email: 'admin@pos.local',
      username: 'Admin',
      role: 'super_admin',
      passwordHash: bcrypt.hashSync(resolveDefaultAdminPassword(), 10),
      isActive: true,
      createdAt: new Date().toISOString(),
    }
  ];
}

export class Database {
  private data: DatabaseSchema;
  private lastPersistError: Error | null = null;
  private pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.users)) {
          // Clean legacy demo cashiers if they exist
          parsed.users = parsed.users.filter((u: User) => u.id !== 'user-cashier-1' && u.id !== 'user-cashier-2');

          // Ensure a usable Super Admin account exists. The stored password hash
          // is never overwritten; a missing hash is repaired with the (random in
          // production) first-run password, see resolveDefaultAdminPassword().
          const adminUserIndex = parsed.users.findIndex((u: User) => u.role === 'super_admin' || u.username.toLowerCase() === 'admin');
          if (adminUserIndex !== -1) {
            // Only guarantee that a usable super admin account exists.
            // The stored password hash is NEVER overwritten here - doing so silently
            // reverted every password change on the next server restart.
            const admin = parsed.users[adminUserIndex];
            admin.role = 'super_admin';
            admin.isActive = true;
            if (!admin.name) admin.name = 'Super Admin';
            if (!admin.username) admin.username = 'Admin';
            if (!admin.passwordHash) admin.passwordHash = bcrypt.hashSync(resolveDefaultAdminPassword(), 10);
          } else {
            parsed.users.unshift({
              id: 'user-admin',
              name: 'Super Admin',
              email: 'admin@pos.local',
              username: 'Admin',
              role: 'super_admin',
              passwordHash: bcrypt.hashSync(resolveDefaultAdminPassword(), 10),
              isActive: true,
              createdAt: new Date().toISOString(),
            });
          }

          // Ensure rooms array exists
          if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
            parsed.rooms = initialRooms;
          }

          // Ensure roomBookings array exists
          if (!Array.isArray(parsed.roomBookings)) {
            parsed.roomBookings = [];
          }

          // Ensure stockImports array exists (Smart Stock Import history)
          if (!Array.isArray(parsed.stockImports)) {
            parsed.stockImports = [];
          }

          // ==========================================
          // FOOD & KITCHEN MODULE (v1.2.0) — SAFE ADDITIVE MIGRATION
          // Only ensures the new collections exist. Never drops, truncates,
          // deletes or rewrites any existing data.
          // ==========================================
          if (!Array.isArray(parsed.kitchenIngredients)) parsed.kitchenIngredients = [];
          if (!Array.isArray(parsed.kitchenMovements)) parsed.kitchenMovements = [];
          if (!Array.isArray(parsed.kitchenRecipes)) parsed.kitchenRecipes = [];
          if (!Array.isArray(parsed.kitchenWastage)) parsed.kitchenWastage = [];
          if (!Array.isArray(parsed.kitchenCounts)) parsed.kitchenCounts = [];
          if (!Array.isArray(parsed.kitchenAdjustmentRequests)) parsed.kitchenAdjustmentRequests = [];
          if (parsed.counters) {
            if (!parsed.counters.kitchenCountSeq) parsed.counters.kitchenCountSeq = 1;
            if (!parsed.counters.kitchenRequestSeq) parsed.counters.kitchenRequestSeq = 1;
          }


          // First-run visibility migration for the legacy menu categories:
          // their category buttons stay OUT of the cashier POS (sidebar) and
          // their items group under FOOD & KITCHEN. Only applied when the flag
          // was never set, so later Super Admin toggles are respected.
          if (Array.isArray(parsed.categories)) {
            ['cat-1kg-portion', 'cat-beer-pub'].forEach(legacyId => {
              const legacyCat = parsed.categories.find((c: Category) => c.id === legacyId);
              if (legacyCat && legacyCat.hiddenInPOS === undefined) {
                legacyCat.hiddenInPOS = true;
                // Beer Pub groups under FOOD & KITCHEN (restaurant) per menu layout
                if (legacyId === 'cat-beer-pub') legacyCat.type = 'restaurant';
              }
            });
          }

          // One-time label migration: the flagship Rockland Old 750ml item is
          // labelled exactly like the physical stock sheet / price list photo —
          // "Rockland Old (Gal) 750ml" (product name + variant size). Only the
          // exact legacy seed label is rewritten; custom admin names are kept.
          if (Array.isArray(parsed.products)) {
            const legacyRockland = parsed.products.find(
              (p: Product) => p.id === 'prod-1' && p.name === 'Rockland Old Arrack (Gal Arrack)'
            );
            if (legacyRockland) {
              legacyRockland.name = 'Rockland Old (Gal)';
              const galVariant = (legacyRockland.variants || []).find(
                (v: ProductVariant) => v.id === 'var-1-750' && v.size === '750ml Bottle'
              );
              if (galVariant) galVariant.size = '750ml';
            }
          }

          // Normalize shot-serving products (shots pour from the 750ml bottle stock)
          if (Array.isArray(parsed.products)) {
            parsed.products.forEach((p: Product) => {
              if (p.servesShots) {
                const used = Number(p.openBottleUsedMl);
                p.openBottleUsedMl = Number.isFinite(used) && used > 0 ? used % 750 : 0;
                // Shot variants never hold independent stock
                (p.variants || []).forEach(v => {
                  if (v.isShot) v.stock = 0;
                });
              }
            });
          }

          // Ensure counters has bookingSeq
          if (!parsed.counters) {
            parsed.counters = { billSeq: 1001, invoiceSeq: 5001, kotSeq: 101, bookingSeq: 2001, holdSeq: 1 };
          } else if (!parsed.counters.bookingSeq) {
            parsed.counters.bookingSeq = 2001;
          }

          // Ensure settings has all defaults including roomBookingPrefix
          parsed.settings = {
            ...defaultSettings,
            ...parsed.settings,
          };

          this.persist(parsed);
          return parsed;
        }
        // The file exists but failed the shape check (missing products/users
        // arrays). Treat it exactly like a parse failure rather than silently
        // overwriting it below.
        throw new Error('Database file is present but has an unrecognised structure.');
      }
    } catch (err) {
      // ==================================================================
      // DATA-LOSS GUARD
      // ------------------------------------------------------------------
      // Previously ANY read/parse error here fell through and seeded a fresh
      // demo database, which then got persisted straight over the damaged
      // file — permanently destroying every product, bill, and stock record.
      // A truncated write (power cut mid-save) was enough to wipe the shop.
      //
      // Now: quarantine the unreadable file, try the newest known-good
      // backup, and only seed fresh when there is genuinely nothing to
      // recover.
      // ==================================================================
      if (fs.existsSync(DB_FILE)) {
        console.error('[DB] Existing database file could not be read:', err);

        const quarantinePath = `${DB_FILE}.corrupt.${Date.now()}`;
        try {
          fs.copyFileSync(DB_FILE, quarantinePath);
          console.error(`[DB] Damaged database preserved at: ${quarantinePath}`);
        } catch (copyErr) {
          console.error('[DB] Could not quarantine the damaged database file:', copyErr);
        }

        const recovered = this.recoverFromBackup();
        if (recovered) return recovered;

        // Nothing recoverable. Refuse to boot rather than start an empty POS
        // on top of a real installation — an operator must decide.
        console.error('[DB][FATAL] Database is unreadable and no usable backup was found.');
        console.error(`[DB][FATAL] Inspect ${quarantinePath} and restore a backup from ${BACKUP_DIR}.`);
        console.error('[DB][FATAL] To start intentionally from an empty database, move the damaged file aside.');
        throw new Error('Refusing to start: database unreadable and unrecoverable (see logs above).');
      }
      // No database file at all → genuine first run, fall through and seed.
      console.log('[DB] No existing database found — creating a new one.');
    }

    // Seed default database
    const initialDb: DatabaseSchema = {
      users: makeInitialUsers(),
      categories: initialCategories,
      companies: initialCompanies,
      products: initialProducts,
      rooms: initialRooms,
      roomBookings: [],
      heldBills: [],
      kots: [],
      bills: [],
      stockMovements: [],
      stockImports: [],
      auditLogs: [
        {
          id: 'audit-1',
          userId: 'user-admin',
          userName: 'Super Admin',
          userRole: 'super_admin',
          action: 'SYSTEM_INITIALIZED',
          entity: 'SYSTEM',
          details: 'Commercial Bar & Restaurant POS Database initialized with product catalog and Super Admin account.',
          createdAt: new Date().toISOString()
        }
      ],
      kitchenIngredients: initialKitchenIngredients,
      kitchenMovements: [],
      kitchenRecipes: initialKitchenRecipes,
      kitchenWastage: [],
      kitchenCounts: [],
      kitchenAdjustmentRequests: [],
      settings: defaultSettings,
      counters: {
        billSeq: 1001,
        invoiceSeq: 5001,
        kotSeq: 101,
        bookingSeq: 2001,
        holdSeq: 1,
        kitchenCountSeq: 1,
        kitchenRequestSeq: 1
      }
    };

    // Populate initial opening stock movements for all product variants
    initialDb.products.forEach(p => {
      p.variants.forEach(v => {
        initialDb.stockMovements.push({
          id: `mov-init-${v.id}`,
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          variantSize: v.size,
          quantityChange: v.stock,
          quantityBefore: 0,
          quantityAfter: v.stock,
          movementType: 'opening_stock',
          reason: 'Initial system opening inventory setup',
          userId: 'user-admin',
          userName: 'Ruwan Perera (Super Admin)',
          createdAt: new Date().toISOString()
        });
      });
    });

    // Populate opening kitchen ingredient movements (Food & Kitchen module)
    initialKitchenIngredients.forEach(ing => {
      initialDb.kitchenMovements.push({
        id: `kmov-init-${ing.id}`,
        ingredientId: ing.id,
        ingredientName: ing.name,
        unit: ing.unit,
        quantityChange: ing.currentStock,
        quantityBefore: 0,
        quantityAfter: ing.currentStock,
        movementType: 'opening_stock',
        reason: 'Initial kitchen store opening stock setup',
        userId: 'user-admin',
        userName: 'Super Admin',
        createdAt: new Date().toISOString()
      });
    });

    this.persist(initialDb);
    return initialDb;
  }

  /**
   * Restore state from the most recent structurally-valid backup file.
   * Returns null when nothing usable exists.
   */
  private recoverFromBackup(): DatabaseSchema | null {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return null;
      const candidates = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('royal_hotel_backup_') && f.endsWith('.json'))
        .map(f => {
          const full = path.join(BACKUP_DIR, f);
          return { full, name: f, time: fs.statSync(full).mtime.getTime() };
        })
        .sort((a, b) => b.time - a.time);

      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(candidate.full, 'utf-8'));
          if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.users)) {
            console.warn(`[DB] RECOVERED database from backup: ${candidate.name}`);
            console.warn('[DB] Transactions recorded after that backup are not included — verify before trading.');
            this.persist(parsed);
            return parsed as DatabaseSchema;
          }
        } catch {
          // try the next-oldest backup
        }
      }
    } catch (err) {
      console.error('[DB] Backup recovery scan failed:', err);
    }
    return null;
  }

  private persist(state: DatabaseSchema) {
    // Atomic write: write to a temp file, fsync it, then rename over the real
    // file. rename(2) is atomic on POSIX, so a crash mid-save can never leave a
    // half-written database behind.
    const tempPath = `${DB_FILE}.tmp.${process.pid}.${Date.now()}`;
    try {
      const payload = JSON.stringify(state, null, 2);

      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeFileSync(fd, payload, 'utf-8');
        fs.fsyncSync(fd); // flush file contents
      } finally {
        fs.closeSync(fd);
      }

      fs.renameSync(tempPath, DB_FILE);

      // Also fsync the DIRECTORY so the rename itself survives a power cut.
      try {
        const dirFd = fs.openSync(DATA_DIR, 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch {
        // Not supported on every platform (e.g. some Windows setups) — the
        // file contents are already durable, so this is best-effort.
      }

      this.lastPersistError = null;
    } catch (err) {
      // Surface loudly: a silent failure here means staff keep ringing up
      // sales that will vanish on the next restart.
      console.error('[DB][CRITICAL] FAILED TO SAVE DATABASE — recent changes are only in memory:', err);
      this.lastPersistError = err instanceof Error ? err : new Error(String(err));

      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}

      // Clean up any stale temp files left by earlier crashed writes.
      try {
        fs.readdirSync(DATA_DIR)
          .filter(f => f.startsWith('pos_database.json.tmp'))
          .forEach(f => {
            const full = path.join(DATA_DIR, f);
            try {
              if (Date.now() - fs.statSync(full).mtime.getTime() > 60_000) fs.unlinkSync(full);
            } catch {}
          });
      } catch {}
    }
  }

  /** Last persistence failure, surfaced by the health endpoint. */
  public getLastPersistError(): Error | null {
    return this.lastPersistError;
  }

  /** Force a synchronous flush — used on graceful shutdown. */
  public flush() {
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer);
      this.pendingSaveTimer = null;
    }
    this.persist(this.data);
  }

  public save() {
    // `persist` is fully synchronous, so on Node's single thread a save can
    // never overlap another. The old re-entrancy guard queued an EXTRA
    // unconditional timer write on every nested save, causing duplicate disk
    // writes under load. Writing straight through is both simpler and safer:
    // every mutation is durable the moment the call returns.
    this.persist(this.data);
  }

  // Get raw schema access
  public get raw(): DatabaseSchema {
    return this.data;
  }

  // Sequence Generators
  public getNextBillNumber(): string {
    const seq = this.data.counters.billSeq++;
    this.save();
    return `${this.data.settings.billPrefix}${seq}`;
  }

  public getNextInvoiceNumber(): string {
    const seq = this.data.counters.invoiceSeq++;
    this.save();
    return `${this.data.settings.invoicePrefix}${seq}`;
  }

  public getNextKOTNumber(): string {
    const seq = this.data.counters.kotSeq++;
    this.save();
    return `${this.data.settings.kotPrefix}${seq}`;
  }

  public getNextHoldNumber(): string {
    if (!this.data.counters.holdSeq) {
      this.data.counters.holdSeq = 1;
    }
    const seq = this.data.counters.holdSeq++;
    this.save();
    return `HOLD-${seq}`;
  }

  /** Unique Smart Stock Import reference, e.g. IMP-20260824-0001 */
  public getNextImportId(): string {
    if (!this.data.counters.importSeq) {
      this.data.counters.importSeq = 1;
    }
    const seq = this.data.counters.importSeq++;
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    this.save();
    return `IMP-${ymd}-${String(seq).padStart(4, '0')}`;
  }

  public getNextBookingNumber(): string {
    if (!this.data.counters.bookingSeq) {
      this.data.counters.bookingSeq = 2001;
    }
    const prefix = this.data.settings.roomBookingPrefix || 'RBK-';
    const seq = this.data.counters.bookingSeq++;
    this.save();
    return `${prefix}${seq}`;
  }

  /** Unique Kitchen Physical Count reference, e.g. KCOUNT-0001 */
  public getNextKitchenCountNumber(): string {
    if (!this.data.counters.kitchenCountSeq) {
      this.data.counters.kitchenCountSeq = 1;
    }
    const seq = this.data.counters.kitchenCountSeq++;
    this.save();
    return `KCOUNT-${String(seq).padStart(4, '0')}`;
  }

  /** Unique Kitchen Adjustment Request reference, e.g. KADJ-0001 */
  public getNextKitchenRequestNumber(): string {
    if (!this.data.counters.kitchenRequestSeq) {
      this.data.counters.kitchenRequestSeq = 1;
    }
    const seq = this.data.counters.kitchenRequestSeq++;
    this.save();
    return `KADJ-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Kitchen movement ledger helper — mirrors recordStockMovement() for product
   * variants. EVERY kitchen ingredient quantity change MUST go through this so
   * the audit trail stays complete (stock is never mutated without a record).
   */
  public recordKitchenMovement(
    ingredient: KitchenIngredient,
    quantityChange: number,
    quantityBefore: number,
    quantityAfter: number,
    movementType: KitchenStockMovement['movementType'],
    userId: string,
    userName: string,
    reason?: string,
    referenceId?: string,
    customCreatedAt?: string
  ): KitchenStockMovement {
    const movement: KitchenStockMovement = {
      id: `kmov-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantityChange,
      quantityBefore,
      quantityAfter,
      movementType,
      reason,
      referenceId,
      costPerUnit: ingredient.costPerUnit,
      userId,
      userName,
      createdAt: customCreatedAt || new Date().toISOString()
    };
    this.data.kitchenMovements.unshift(movement);
    // Keep the ledger bounded like the existing audit log (5000 records)
    if (this.data.kitchenMovements.length > 5000) {
      this.data.kitchenMovements.pop();
    }
    this.save();
    return movement;
  }

  // Audit Logging helper
  public logAudit(userId: string, userName: string, userRole: string, action: string, entity: string, entityId?: string, details?: string) {
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId,
      userName,
      userRole,
      action,
      entity,
      entityId,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(log);
    // Keep max 5000 logs in memory
    if (this.data.auditLogs.length > 5000) {
      this.data.auditLogs.pop();
    }
    this.save();
    return log;
  }

  public backupDatabase(): { filename: string; timestamp: string; size: number } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `royal_hotel_backup_${timestamp}.json`;
    // Security: Ensure filename is safe
    const safeFilename = path.basename(filename);
    const backupPath = path.join(BACKUP_DIR, safeFilename);
    // Prevent path traversal
    if (!backupPath.startsWith(BACKUP_DIR)) {
      throw new Error('Invalid backup path');
    }
    const content = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(backupPath, content, 'utf-8');
    
    // Prune old backups keeping last 30
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('royal_hotel_backup_') && f.endsWith('.json'))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 30) {
        files.slice(30).forEach(f => {
          try {
            fs.unlinkSync(path.join(BACKUP_DIR, f.name));
          } catch (_) {}
        });
      }
    } catch (_) {}

    return {
      filename,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf-8')
    };
  }

  public listBackups() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return [];
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stats = fs.statSync(path.join(BACKUP_DIR, f));
          return {
            filename: f,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return files;
    } catch (e) {
      return [];
    }
  }

  public restoreFromData(importedData: DatabaseSchema): boolean {
    if (!importedData || !Array.isArray(importedData.products) || !Array.isArray(importedData.users)) {
      throw new Error('Invalid POS database JSON structure.');
    }
    // Validate critical fields
    if (!importedData.settings || !importedData.counters) {
      throw new Error('Invalid database: missing settings or counters');
    }
    // Ensure no path traversal in data
    const jsonStr = JSON.stringify(importedData);
    if (jsonStr.length > 100 * 1024 * 1024) { // 100MB max
      throw new Error('Database file too large (max 100MB)');
    }

    // LOCKOUT GUARD: restoring a file whose users list has no usable super
    // admin (wrong export, hand-edited JSON, backup from before the first
    // admin existed) left NOBODY able to log in — unrecoverable without
    // shell access to the server. Reject before touching live data.
    const hasUsableAdmin = importedData.users.some(
      (u: User) => u && u.role === 'super_admin' && u.isActive !== false && !!u.passwordHash
    );
    if (!hasUsableAdmin) {
      throw new Error(
        'Restore rejected: this file contains no active Super Admin with a password. ' +
        'Restoring it would lock everyone out of the system.'
      );
    }
    // Create pre-restore safety backup
    this.backupDatabase();
    this.data = importedData;
    // Ensure required arrays exist
    this.data.rooms = this.data.rooms || [];
    this.data.roomBookings = this.data.roomBookings || [];
    this.data.heldBills = this.data.heldBills || [];
    this.data.kots = this.data.kots || [];
    this.data.bills = this.data.bills || [];
    this.data.stockMovements = this.data.stockMovements || [];
    this.data.stockImports = this.data.stockImports || [];
    this.data.auditLogs = this.data.auditLogs || [];
    // Food & Kitchen module collections (additive — never destructive)
    this.data.kitchenIngredients = this.data.kitchenIngredients || [];
    this.data.kitchenMovements = this.data.kitchenMovements || [];
    this.data.kitchenRecipes = this.data.kitchenRecipes || [];
    this.data.kitchenWastage = this.data.kitchenWastage || [];
    this.data.kitchenCounts = this.data.kitchenCounts || [];
    this.data.kitchenAdjustmentRequests = this.data.kitchenAdjustmentRequests || [];
    this.data.settings = { ...defaultSettings, ...this.data.settings };
    this.save();
    return true;
  }

  public restoreBackupFile(filename: string): boolean {
    const backupPath = path.join(BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found on server.');
    }
    const raw = fs.readFileSync(backupPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return this.restoreFromData(parsed);
  }

  // Stock Movement helper
  public recordStockMovement(
    productId: string,
    productName: string,
    variantId: string,
    variantSize: string,
    quantityChange: number,
    quantityBefore: number,
    quantityAfter: number,
    movementType: StockMovement['movementType'],
    userId: string,
    userName: string,
    reason?: string,
    referenceId?: string,
    costPrice?: number,
    customCreatedAt?: string
  ): StockMovement {
    const prod = this.data.products.find(p => p.id === productId);
    const comp = prod ? this.data.companies.find(c => c.id === prod.companyId) : undefined;
    const cat = prod ? this.data.categories.find(c => c.id === prod.categoryId) : undefined;

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      productId,
      productName: prod ? prod.name : productName,
      companyId: prod ? prod.companyId : undefined,
      companyName: comp ? comp.name : 'In-House / Other',
      categoryId: prod ? prod.categoryId : undefined,
      categoryName: cat ? cat.name : undefined,
      variantId,
      variantSize,
      quantityChange,
      quantityBefore,
      quantityAfter,
      movementType,
      reason,
      referenceId,
      costPrice: costPrice !== undefined ? costPrice : undefined,
      userId,
      userName,
      createdAt: customCreatedAt || new Date().toISOString()
    };
    this.data.stockMovements.unshift(movement);
    this.save();
    return movement;
  }
}

export const db = new Database();
