import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: 'super_admin' | 'cashier';
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
  grandTotal: number;
  amountReceived: number;
  changeAmount: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other' | 'split';
  paymentDetails?: any;
  status: 'paid' | 'held' | 'cancelled' | 'voided';
  notes?: string;
  createdAt: string;
  paidAt?: string;
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
  auditLogs: AuditLog[];
  settings: SystemSettings;
  counters: {
    billSeq: number;
    invoiceSeq: number;
    kotSeq: number;
    bookingSeq: number;
  };
}

const DATA_DIR = process.env.POS_DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pos_database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure data and backup directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

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
  // Rockland Old Arrack / Gal Arrack
  {
    id: 'prod-1',
    name: 'Rockland Old Arrack (Gal Arrack)',
    categoryId: 'cat-1',
    companyId: 'comp-1',
    description: 'Traditional blended coconut spirit aged in teak vats.',
    isKitchenItem: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: [
      { id: 'var-1-750', productId: 'prod-1', size: '750ml Bottle', sku: 'RK-ARR-750', costPrice: 3100, sellingPrice: 3850, stock: 24, minStockLevel: 5, isActive: true },
      { id: 'var-1-375', productId: 'prod-1', size: '375ml Half', sku: 'RK-ARR-375', costPrice: 1600, sellingPrice: 1980, stock: 36, minStockLevel: 6, isActive: true },
      { id: 'var-1-180', productId: 'prod-1', size: '180ml Quarter', sku: 'RK-ARR-180', costPrice: 800, sellingPrice: 1050, stock: 45, minStockLevel: 10, isActive: true },
      { id: 'var-1-100', productId: 'prod-1', size: '100ml Shot Plus', sku: 'RK-ARR-100', costPrice: 460, sellingPrice: 620, stock: 50, minStockLevel: 10, isActive: true },
      { id: 'var-1-50', productId: 'prod-1', size: '50ml Peg / Double', sku: 'RK-ARR-50', costPrice: 230, sellingPrice: 330, stock: 90, minStockLevel: 15, isActive: true },
      { id: 'var-1-25', productId: 'prod-1', size: '25ml Single Shot', sku: 'RK-ARR-25', costPrice: 120, sellingPrice: 180, stock: 120, minStockLevel: 20, isActive: true },
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

const initialUsers: User[] = [
  {
    id: 'user-admin',
    name: 'Super Admin',
    email: 'admin@pos.local',
    username: 'Admin',
    role: 'super_admin',
    passwordHash: bcrypt.hashSync('Araliya2000', 10),
    isActive: true,
    createdAt: new Date().toISOString(),
  }
];

export class Database {
  private data: DatabaseSchema;
  private isSaving: boolean = false;

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

          // Ensure Admin user exists with correct credentials (Admin / Araliya2000)
          const adminUserIndex = parsed.users.findIndex((u: User) => u.role === 'super_admin' || u.username.toLowerCase() === 'admin');
          if (adminUserIndex !== -1) {
            parsed.users[adminUserIndex].name = 'Super Admin';
            parsed.users[adminUserIndex].username = 'Admin';
            parsed.users[adminUserIndex].passwordHash = bcrypt.hashSync('Araliya2000', 10);
            parsed.users[adminUserIndex].isActive = true;
            parsed.users[adminUserIndex].role = 'super_admin';
          } else {
            parsed.users.unshift({
              id: 'user-admin',
              name: 'Super Admin',
              email: 'admin@pos.local',
              username: 'Admin',
              role: 'super_admin',
              passwordHash: bcrypt.hashSync('Araliya2000', 10),
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

          // Ensure counters has bookingSeq
          if (!parsed.counters) {
            parsed.counters = { billSeq: 1001, invoiceSeq: 5001, kotSeq: 101, bookingSeq: 2001 };
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
      }
    } catch (err) {
      console.error('[DB] Error loading database file, re-initializing fresh database:', err);
    }

    // Seed default database
    const initialDb: DatabaseSchema = {
      users: initialUsers,
      categories: initialCategories,
      companies: initialCompanies,
      products: initialProducts,
      rooms: initialRooms,
      roomBookings: [],
      heldBills: [],
      kots: [],
      bills: [],
      stockMovements: [],
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
      settings: defaultSettings,
      counters: {
        billSeq: 1001,
        invoiceSeq: 5001,
        kotSeq: 101,
        bookingSeq: 2001
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

    this.persist(initialDb);
    return initialDb;
  }

  private persist(state: DatabaseSchema) {
    try {
      // Atomic write with temp file to prevent corruption
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      // Ensure data is flushed to disk
      const fd = fs.openSync(tempPath, 'r+');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Error persisting database to disk:', err);
      // Attempt cleanup of temp file
      try {
        const tmpFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('pos_database.json.tmp'));
        tmpFiles.forEach(f => {
          try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch {}
        });
      } catch {}
    }
  }

  public save() {
    // Simple debounced save to avoid excessive disk I/O during rapid operations
    // For now, immediate save but with isSaving guard to prevent overlapping
    if (this.isSaving) {
      // If already saving, schedule another save shortly
      setTimeout(() => this.persist(this.data), 100);
      return;
    }
    this.isSaving = true;
    try {
      this.persist(this.data);
    } finally {
      this.isSaving = false;
    }
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

  public getNextBookingNumber(): string {
    if (!this.data.counters.bookingSeq) {
      this.data.counters.bookingSeq = 2001;
    }
    const prefix = this.data.settings.roomBookingPrefix || 'RBK-';
    const seq = this.data.counters.bookingSeq++;
    this.save();
    return `${prefix}${seq}`;
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
        .filter(f => f.startsWith('pos_backup_') && f.endsWith('.json'))
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
    this.data.auditLogs = this.data.auditLogs || [];
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
