export type UserRole = 'super_admin' | 'cashier' | 'kitchen_manager';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  pin?: string;
  createdAt: string;
  lastLogin?: string;
  lastLoginAt?: string;
}

export type CategoryType = 'bar' | 'restaurant' | 'service' | 'other';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  description?: string;
  icon?: string;
  isActive: boolean;
  displayOrder?: number;
  /** Hidden from the cashier POS sidebar — visible/manageable in Super Admin panel only. */
  hiddenInPOS?: boolean;
}

export interface Company {
  id: string;
  name: string;
  contactPerson?: string;
  description?: string;
  isActive: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string; // e.g., '750ml Bottle', '375ml Half', '180ml Quarter', '100ml Shot Plus', '50ml Peg', '25ml Single Shot', 'Full', 'Regular', 'Can'
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockLevel: number;
  isActive: boolean;
  /** Shot / peg poured from the 750ml bottle stock (no independent stock; server derives shots remaining). */
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
  isKitchenItem: boolean;
  taxRate?: number;
  isActive: boolean;
  isArchived?: boolean;
  createdAt: string;
  variants: ProductVariant[];
  /** When true, this item serves shots (100/50/25ml) deducted from its 750ml bottle total stock. */
  servesShots?: boolean;
  /** Server-derived: total ml still pourable as shots from the 750ml bottle stock. */
  availableShotMl?: number;
  /** ml already poured (sold as shots) from the currently open 750ml bottle. */
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
  discount: number;
  tax: number;
  total: number;
  notes?: string;
  isKitchenItem?: boolean;
}

export type OrderType = 'dine_in' | 'takeaway' | 'bar_counter' | 'room_service';

export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';

export interface Room {
  id: string;
  roomNumber: string;
  roomType: string; // e.g. 'Deluxe AC Double', 'Standard Non-AC', 'Luxury Cabana', 'Family Suite'
  floor: string; // e.g. 'Ground Floor', '1st Floor', '2nd Floor', 'Garden Villa'
  capacity: number; // e.g. 2, 4
  ratePerDay: number;
  rateHalfDay?: number;
  amenities: string[]; // e.g. ['AC', 'Hot Water', 'King Bed', 'TV', 'Free Wi-Fi', 'Balcony']
  status: RoomStatus;
  currentBookingId?: string;
  currentGuestName?: string;
  currentGuestPhone?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export type RoomBookingStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

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
  paymentMethod: PaymentMethod;
  paymentDetails?: any;
  status: RoomBookingStatus;
  cashierId: string;
  cashierName: string;
  notes?: string;
  createdAt: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}

export interface HeldBill {
  id: string;
  billNumber: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  cashierId: string;
  cashierName: string;
  orderType: OrderType;
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

export type KOTStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface KOT {
  id: string;
  kotNumber: string;
  orderId?: string;
  billNumber?: string;
  tableNumber?: string;
  orderType: OrderType;
  cashierId: string;
  cashierName: string;
  items: OrderItem[];
  status: KOTStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'other' | 'split';
export type BillStatus = 'paid' | 'held' | 'cancelled' | 'voided';

export interface Bill {
  id: string;
  billNumber: string;
  invoiceNumber: string;
  orderType: OrderType;
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
  paymentMethod: PaymentMethod;
  paymentDetails?: any;
  status: BillStatus;
  notes?: string;
  /** Kitchen ingredient deductions made for this bill (snapshot at sale time). */
  kitchenDeductions?: { ingredientId: string; ingredientName: string; unit: string; quantity: number }[];
  createdAt: string;
  paidAt?: string;
}

export type StockMovementType =
  | 'opening_stock'
  | 'purchase'
  | 'stock_in'
  | 'sale'
  | 'stock_out'
  | 'adjustment'
  | 'damaged'
  | 'expired'
  | 'return'
  | 'correction';

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
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  movementType: StockMovementType;
  reason?: string;
  referenceId?: string;
  costPrice?: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface InventoryItemView {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  companyId?: string;
  companyName: string;
  variantId: string;
  size: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStockLevel: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  stockValue: number;
  retailValue: number;
  isActive: boolean;
  isShot?: boolean;
  shotVolumeMl?: number;
  isShotSourceBottle?: boolean;
  openBottleUsedMl?: number;
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

export interface DailyStockSheetItem {
  no: number;
  productId: string;
  variantId: string;
  productName: string;
  companyName?: string;
  categoryName: string;
  size: string;
  displayName: string;
  inHand: number;      // Opening Stock
  received: number;    // Stock In / Received Today
  stock: number;       // Total Available = In-Hand + Received
  balance: number;     // Closing Balance / In-Hand Count
  sold: number;        // Total Sold = Stock - Balance
  price: number;       // Unit Selling Price (Rs.)
  value: number;       // Sales Value = Sold * Price (Rs.)
  costPrice?: number;
  isKitchenItem?: boolean;
  /** Shot size — balance is auto-derived from the 750ml bottle stock and cannot be adjusted directly. */
  isShot?: boolean;
}

export interface DailyStockSheetReport {
  date: string;
  formattedDate: string;
  totalInHand: number;
  totalReceived: number;
  totalStock: number;
  totalBalance: number;
  totalSold: number;
  totalValue: number;
  departmentCounts?: {
    total: number;
    bar: number;
    restaurant: number;
  };
  items: DailyStockSheetItem[];
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
  taxRate: number;
  serviceChargeRate: number;
  allowNegativeStock: boolean;
  enableDiscounts: boolean;
  maxDiscountPercentage: number;
  invoicePrefix: string;
  billPrefix: string;
  kotPrefix: string;
  receiptHeader?: string;
  receiptFooter: string;
  lowStockDefaultThreshold: number;
  // Thermal Printer Settings
  printerType?: 'thermal' | 'a4' | 'other';
  thermalWidth?: '58mm' | '80mm';
  autoPrintAfterPayment?: boolean;
  allowCashierToPrint?: boolean;
}

// ==========================================
// FOOD & KITCHEN MODULE (v1.2.0 — Kitchen Manager role)
// ==========================================
// Mirrors server/db.ts — additive collections using the same movement-ledger
// architecture as the product stock system.

export interface KitchenIngredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  costPerUnit: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Derived on GET /api/kitchen/ingredients */
  isLowStock?: boolean;
  isOutOfStock?: boolean;
  stockValue?: number;
}

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
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  movementType: KitchenMovementType;
  reason?: string;
  referenceId?: string;
  costPerUnit?: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface KitchenRecipeItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
}

export interface KitchenRecipeVersion {
  version: number;
  items: KitchenRecipeItem[];
  savedAt: string;
  savedById: string;
  savedByName: string;
}

export interface KitchenRecipe {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  servings: number;
  items: KitchenRecipeItem[];
  isActive: boolean;
  version: number;
  history: KitchenRecipeVersion[];
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** Derived on GET */
  recipeCostPerServing?: number;
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
  variance: number;
  varianceCost: number;
  status: 'applied' | 'pending_approval' | 'no_variance';
}

export interface KitchenPhysicalCount {
  id: string;
  countNumber: string;
  lines: KitchenCountLine[];
  totalVarianceCost: number;
  status: 'applied' | 'partial' | 'pending_approval';
  notes?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

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

export interface KitchenDashboardData {
  todayFoodSales: number;
  todayFoodCost: number;
  foodCostPct: number;
  grossFoodProfit: number;
  todayFoodItemsSold: number;
  todayFoodBillsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: { id: string; name: string; stock: number; min: number; unit: string; status: string }[];
  todayWastageCost: number;
  todayWastageCount: number;
  pendingApprovals: number;
  totalIngredientValue: number;
  activeRecipeCount: number;
  recentMovements: KitchenStockMovement[];
  recentActivity: AuditLog[];
  /** Food & Kitchen menu variants that have NO recipe — materials stock is NOT deducted when they sell. */
  menuItemsWithoutRecipe: { productId: string; productName: string; variantId: string; variantSize: string; sellingPrice: number }[];
}

export interface KitchenMenuItem {
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  sellingPrice: number;
  recipeId: string | null;
  recipeCost: number | null;
}

export interface KitchenFoodCostRow {
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  sellingPrice: number;
  recipeId: string | null;
  recipeCost: number | null;
  grossProfit: number | null;
  foodCostPct: number | null;
  grossMarginPct: number | null;
  hasRecipe: boolean;
}
