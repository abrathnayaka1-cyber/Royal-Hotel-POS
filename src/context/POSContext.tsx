import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Product,
  ProductVariant,
  OrderItem,
  OrderType,
  HeldBill,
  Bill,
  KOT,
  SystemSettings,
  Category,
  Company,
  Room,
  RoomBooking,
  FunctionHall,
  FunctionBooking
} from '../types.ts';
import { fetchApi } from '../lib/api.ts';
import { printThermalReceipt, printRoomBookingTicket, printFunctionBookingTicket } from '../lib/printEngine.ts';
import { useAuth } from './AuthContext.tsx';

interface POSContextType {
  products: Product[];
  categories: Category[];
  companies: Company[];
  rooms: Room[];
  roomBookings: RoomBooking[];
  functionHalls: FunctionHall[];
  functionBookings: FunctionBooking[];
  settings: SystemSettings | null;
  isLoading: boolean;
  selectedCategory: string;
  searchQuery: string;
  selectedCompany: string;
  cart: OrderItem[];
  orderType: OrderType;
  tableNumber: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  discountPercentage: number;
  discountAmount: number;
  activeHeldBillId: string | null;
  heldBills: HeldBill[];
  recentCompletedBill: Bill | null;
  isVariantModalOpen: boolean;
  selectedProductForVariant: Product | null;
  isPaymentModalOpen: boolean;
  isHeldBillsModalOpen: boolean;
  isReceiptModalOpen: boolean;
  isKOTModalOpen: boolean;
  isBookingModalOpen: boolean;
  selectedRoomForBooking: Room | null;
  recentBookingTicket: RoomBooking | null;
  isBookingTicketModalOpen: boolean;
  subtotal: number;
  totalDiscount: number;
  serviceCharge: number;
  tax: number;
  grandTotal: number;
  totalItemsCount: number;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCompany: (comp: string) => void;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (table: string) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  setNotes: (notes: string) => void;
  setDiscountPercentage: (pct: number) => void;
  setDiscountAmount: (amount: number) => void;
  openVariantModal: (product: Product) => void;
  closeVariantModal: () => void;
  addToCart: (product: Product, variant: ProductVariant, quantity?: number, itemNotes?: string) => void;
  availableStockFor: (variant: ProductVariant) => number;
  isDamageModalOpen: boolean;
  setIsDamageModalOpen: (open: boolean) => void;
  updateCartQuantity: (variantId: string, quantity: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  setIsPaymentModalOpen: (open: boolean) => void;
  setIsHeldBillsModalOpen: (open: boolean) => void;
  setIsReceiptModalOpen: (open: boolean) => void;
  setIsKOTModalOpen: (open: boolean) => void;
  holdCurrentBill: () => Promise<HeldBill>;
  loadHeldBill: (heldBill: HeldBill) => void;
  deleteHeldBill: (heldBillId: string) => Promise<void>;
  createKOT: () => Promise<KOT>;
  completeCheckout: (paymentMethod: Bill['paymentMethod'], amountReceived: number, paymentDetails?: unknown) => Promise<Bill>;
  refreshProducts: () => Promise<void>;
  refreshHeldBills: () => Promise<void>;
  handleBarcodeScan: (barcode: string) => boolean;
  scanNotice: { message: string; type: 'success' | 'warning' | 'error' } | null;
  clearScanNotice: () => void;
  openRoomBookingModal: (room?: Room | null) => void;
  closeRoomBookingModal: () => void;
  openBookingTicketModal: (booking: RoomBooking) => void;
  closeBookingTicketModal: () => void;
  refreshRooms: () => Promise<void>;
  refreshRoomBookings: () => Promise<void>;
  createRoomBooking: (payload: Record<string, unknown>) => Promise<RoomBooking>;
  checkoutRoomBooking: (bookingId: string, checkoutData: Record<string, unknown>) => Promise<RoomBooking>;
  cancelRoomBooking: (bookingId: string, reason?: string) => Promise<void>;
  addRoomPayment: (bookingId: string, paymentData: Record<string, unknown>) => Promise<RoomBooking>;
  createRoom: (roomData: Partial<Room>) => Promise<Room>;
  updateRoom: (roomId: string, roomData: Partial<Room>) => Promise<Room>;
  deleteRoom: (roomId: string) => Promise<void>;
  printRoomTicket: (booking: RoomBooking) => Promise<boolean>;
  // Hotel Functions & Events (v1.4.0)
  isFunctionBookingModalOpen: boolean;
  selectedHallForBooking: FunctionHall | null;
  recentFunctionTicket: FunctionBooking | null;
  isFunctionTicketModalOpen: boolean;
  openFunctionBookingModal: (hall?: FunctionHall | null) => void;
  closeFunctionBookingModal: () => void;
  openFunctionTicketModal: (booking: FunctionBooking) => void;
  closeFunctionTicketModal: () => void;
  refreshFunctionHalls: () => Promise<void>;
  refreshFunctionBookings: () => Promise<void>;
  createFunctionHall: (hallData: Partial<FunctionHall>) => Promise<FunctionHall>;
  updateFunctionHall: (hallId: string, hallData: Partial<FunctionHall>) => Promise<FunctionHall>;
  deleteFunctionHall: (hallId: string) => Promise<void>;
  createFunctionBooking: (payload: Record<string, unknown>) => Promise<FunctionBooking>;
  completeFunctionBooking: (bookingId: string, checkoutData: Record<string, unknown>) => Promise<FunctionBooking>;
  cancelFunctionBooking: (bookingId: string, reason?: string) => Promise<void>;
  addFunctionPayment: (bookingId: string, paymentData: Record<string, unknown>) => Promise<FunctionBooking>;
  printFunctionTicket: (booking: FunctionBooking) => Promise<boolean>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);
  const [functionHalls, setFunctionHalls] = useState<FunctionHall[]>([]);
  const [functionBookings, setFunctionBookings] = useState<FunctionBooking[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [activeHeldBillId, setActiveHeldBillId] = useState<string | null>(null);

  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [recentCompletedBill, setRecentCompletedBill] = useState<Bill | null>(null);

  const [isVariantModalOpen, setIsVariantModalOpen] = useState<boolean>(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isHeldBillsModalOpen, setIsHeldBillsModalOpen] = useState<boolean>(false);
  const [isDamageModalOpen, setIsDamageModalOpen] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [isKOTModalOpen, setIsKOTModalOpen] = useState<boolean>(false);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<Room | null>(null);
  const [recentBookingTicket, setRecentBookingTicket] = useState<RoomBooking | null>(null);
  const [isBookingTicketModalOpen, setIsBookingTicketModalOpen] = useState<boolean>(false);

  const [isFunctionBookingModalOpen, setIsFunctionBookingModalOpen] = useState<boolean>(false);
  const [selectedHallForBooking, setSelectedHallForBooking] = useState<FunctionHall | null>(null);
  const [recentFunctionTicket, setRecentFunctionTicket] = useState<FunctionBooking | null>(null);
  const [isFunctionTicketModalOpen, setIsFunctionTicketModalOpen] = useState<boolean>(false);

  const [scanNotice, setScanNotice] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  const clearScanNotice = useCallback(() => {
    setScanNotice(null);
  }, []);

  useEffect(() => {
    if (!scanNotice) return;
    const timer = setTimeout(() => {
      setScanNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [scanNotice]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      // Data isolation: Kitchen Managers only need the catalogue + settings for
      // the Food & Kitchen suite — skip held bills, rooms & bookings entirely.
      const isKitchenOnly = user?.role === 'kitchen_manager';
      const [prodsData, catsData, compsData, settsData, heldData, roomsData, bookingsData, hallsData, functionBookingsData] = await Promise.all([
        fetchApi<Product[]>('/products'),
        fetchApi<Category[]>('/categories'),
        fetchApi<Company[]>('/companies'),
        fetchApi<SystemSettings>('/settings'),
        isKitchenOnly ? Promise.resolve([] as HeldBill[]) : fetchApi<HeldBill[]>('/orders/held'),
        isKitchenOnly ? Promise.resolve([] as Room[]) : fetchApi<Room[]>('/rooms'),
        isKitchenOnly ? Promise.resolve([] as RoomBooking[]) : fetchApi<RoomBooking[]>('/room-bookings'),
        isKitchenOnly ? Promise.resolve([] as FunctionHall[]) : fetchApi<FunctionHall[]>('/function-halls'),
        isKitchenOnly ? Promise.resolve([] as FunctionBooking[]) : fetchApi<FunctionBooking[]>('/function-bookings'),
      ]);

      setProducts(prodsData || []);
      setCategories(catsData || []);
      setCompanies(compsData || []);
      setSettings(settsData || null);
      setHeldBills(heldData || []);
      setRooms(roomsData || []);
      setRoomBookings(bookingsData || []);
      setFunctionHalls(hallsData || []);
      setFunctionBookings(functionBookingsData || []);
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const refreshProducts = async () => {
    const prods = await fetchApi<Product[]>('/products');
    setProducts(prods || []);
  };

  const refreshHeldBills = async () => {
    const held = await fetchApi<HeldBill[]>('/orders/held');
    setHeldBills(held || []);
  };

  const refreshRooms = async () => {
    const rData = await fetchApi<Room[]>('/rooms');
    setRooms(rData || []);
  };

  const refreshRoomBookings = async () => {
    const bData = await fetchApi<RoomBooking[]>('/room-bookings');
    setRoomBookings(bData || []);
  };

  const openRoomBookingModal = (room?: Room | null) => {
    setSelectedRoomForBooking(room || null);
    setIsBookingModalOpen(true);
  };

  const closeRoomBookingModal = () => {
    setIsBookingModalOpen(false);
    setSelectedRoomForBooking(null);
  };

  const openBookingTicketModal = (booking: RoomBooking) => {
    setRecentBookingTicket(booking);
    setIsBookingTicketModalOpen(true);
  };

  const closeBookingTicketModal = () => {
    setIsBookingTicketModalOpen(false);
    setRecentBookingTicket(null);
  };

  const createRoom = async (roomData: Partial<Room>): Promise<Room> => {
    const newRoom = await fetchApi<Room>('/rooms', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
    await refreshRooms();
    return newRoom;
  };

  const updateRoom = async (roomId: string, roomData: Partial<Room>): Promise<Room> => {
    const updated = await fetchApi<Room>(`/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(roomData),
    });
    await refreshRooms();
    return updated;
  };

  const deleteRoom = async (roomId: string): Promise<void> => {
    await fetchApi(`/rooms/${roomId}`, {
      method: 'DELETE',
    });
    await refreshRooms();
  };

  const createRoomBooking = async (payload: Record<string, unknown>): Promise<RoomBooking> => {
    const res = await fetchApi<{ success: boolean; booking: RoomBooking; room: Room }>('/room-bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    await refreshRooms();
    await refreshRoomBookings();
    
    setRecentBookingTicket(res.booking);
    setIsBookingModalOpen(false);
    setIsBookingTicketModalOpen(true);

    if (settings?.autoPrintAfterPayment) {
      setTimeout(() => {
        printRoomBookingTicket(res.booking, res.room, settings).catch(() => {});
      }, 300);
    }

    return res.booking;
  };

  const checkoutRoomBooking = async (bookingId: string, checkoutData: Record<string, unknown>): Promise<RoomBooking> => {
    const res = await fetchApi<{ success: boolean; booking: RoomBooking; room: Room }>(`/room-bookings/${bookingId}/checkout`, {
      method: 'PUT',
      body: JSON.stringify(checkoutData),
    });

    await refreshRooms();
    await refreshRoomBookings();
    return res.booking;
  };

  const cancelRoomBooking = async (bookingId: string, reason?: string): Promise<void> => {
    await fetchApi(`/room-bookings/${bookingId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });

    await refreshRooms();
    await refreshRoomBookings();
  };

  const addRoomPayment = async (bookingId: string, paymentData: Record<string, unknown>): Promise<RoomBooking> => {
    const res = await fetchApi<{ success: boolean; booking: RoomBooking }>(`/room-bookings/${bookingId}/payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    await refreshRoomBookings();
    return res.booking;
  };

  const printRoomTicket = async (booking: RoomBooking): Promise<boolean> => {
    const matchedRoom = rooms.find(r => r.id === booking.roomId) || null;
    return printRoomBookingTicket(booking, matchedRoom, settings);
  };

  // ==========================================
  // HOTEL FUNCTIONS & EVENTS (v1.4.0)
  // ==========================================

  const refreshFunctionHalls = async () => {
    const hData = await fetchApi<FunctionHall[]>('/function-halls');
    setFunctionHalls(hData || []);
  };

  const refreshFunctionBookings = async () => {
    const bData = await fetchApi<FunctionBooking[]>('/function-bookings');
    setFunctionBookings(bData || []);
  };

  const openFunctionBookingModal = (hall?: FunctionHall | null) => {
    setSelectedHallForBooking(hall || null);
    setIsFunctionBookingModalOpen(true);
  };

  const closeFunctionBookingModal = () => {
    setIsFunctionBookingModalOpen(false);
    setSelectedHallForBooking(null);
  };

  const openFunctionTicketModal = (booking: FunctionBooking) => {
    setRecentFunctionTicket(booking);
    setIsFunctionTicketModalOpen(true);
  };

  const closeFunctionTicketModal = () => {
    setIsFunctionTicketModalOpen(false);
    setRecentFunctionTicket(null);
  };

  const createFunctionHall = async (hallData: Partial<FunctionHall>): Promise<FunctionHall> => {
    const newHall = await fetchApi<FunctionHall>('/function-halls', {
      method: 'POST',
      body: JSON.stringify(hallData),
    });
    await refreshFunctionHalls();
    return newHall;
  };

  const updateFunctionHall = async (hallId: string, hallData: Partial<FunctionHall>): Promise<FunctionHall> => {
    const updated = await fetchApi<FunctionHall>(`/function-halls/${hallId}`, {
      method: 'PUT',
      body: JSON.stringify(hallData),
    });
    await refreshFunctionHalls();
    return updated;
  };

  const deleteFunctionHall = async (hallId: string): Promise<void> => {
    await fetchApi(`/function-halls/${hallId}`, {
      method: 'DELETE',
    });
    await refreshFunctionHalls();
  };

  const createFunctionBooking = async (payload: Record<string, unknown>): Promise<FunctionBooking> => {
    const res = await fetchApi<{ success: boolean; booking: FunctionBooking; hall: FunctionHall }>('/function-bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    await refreshFunctionBookings();

    setRecentFunctionTicket(res.booking);
    setIsFunctionBookingModalOpen(false);
    setIsFunctionTicketModalOpen(true);

    if (settings?.autoPrintAfterPayment) {
      setTimeout(() => {
        printFunctionBookingTicket(res.booking, res.hall, settings).catch(() => {});
      }, 300);
    }

    return res.booking;
  };

  const completeFunctionBooking = async (bookingId: string, checkoutData: Record<string, unknown>): Promise<FunctionBooking> => {
    const res = await fetchApi<{ success: boolean; booking: FunctionBooking }>(`/function-bookings/${bookingId}/checkout`, {
      method: 'PUT',
      body: JSON.stringify(checkoutData),
    });

    await refreshFunctionBookings();
    return res.booking;
  };

  const cancelFunctionBooking = async (bookingId: string, reason?: string): Promise<void> => {
    await fetchApi(`/function-bookings/${bookingId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });

    await refreshFunctionBookings();
  };

  const addFunctionPayment = async (bookingId: string, paymentData: Record<string, unknown>): Promise<FunctionBooking> => {
    const res = await fetchApi<{ success: boolean; booking: FunctionBooking }>(`/function-bookings/${bookingId}/payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    await refreshFunctionBookings();
    return res.booking;
  };

  const printFunctionTicket = async (booking: FunctionBooking): Promise<boolean> => {
    const matchedHall = functionHalls.find(h => h.id === booking.hallId) || null;
    return printFunctionBookingTicket(booking, matchedHall, settings);
  };

  const { subtotal, computedDiscount, serviceCharge, tax, grandTotal, totalItemsCount } = useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    
    let disc = 0;
    // When "Enable Discounts" is off in System Settings, no discount may be
    // applied even if a stale discount is still set in the cart.
    const discountsEnabled = settings?.enableDiscounts !== false;
    const maxDiscountPct = settings?.maxDiscountPercentage || 100;
    
    if (discountsEnabled && discountPercentage > 0) {
      const clampedPct = Math.min(discountPercentage, maxDiscountPct, 100);
      disc = (sub * clampedPct) / 100;
    } else if (discountsEnabled && discountAmount > 0) {
      const maxDiscountAmount = (sub * maxDiscountPct) / 100;
      disc = Math.min(discountAmount, sub, maxDiscountAmount);
    }

    const taxableAmount = Math.max(0, sub - disc);
    const serviceChargeRate = settings?.serviceChargeRate || 0;
    const svc = (taxableAmount * serviceChargeRate) / 100;

    const taxRate = settings?.taxRate || 0;
    const tx = (taxableAmount * taxRate) / 100;

    const grand = Number((taxableAmount + svc + tx).toFixed(2));
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal: Number(sub.toFixed(2)),
      computedDiscount: Number(disc.toFixed(2)),
      serviceCharge: Number(svc.toFixed(2)),
      tax: Number(tx.toFixed(2)),
      grandTotal: grand,
      totalItemsCount: count,
    };
  }, [cart, discountPercentage, discountAmount, settings]);

  const openVariantModal = (product: Product) => {
    const activeVariants = product.variants.filter(v => v.isActive);
    if (activeVariants.length === 1) {
      addToCart(product, activeVariants[0], 1);
    } else if (activeVariants.length > 0) {
      setSelectedProductForVariant(product);
      setIsVariantModalOpen(true);
    }
  };

  const closeVariantModal = () => {
    setIsVariantModalOpen(false);
    setSelectedProductForVariant(null);
  };

  /** Pour volume of a shot variant (explicit or parsed from the size label). */
  const shotMlOf = (v: ProductVariant): number => {
    if (Number(v.shotVolumeMl) > 0) return Number(v.shotVolumeMl);
    const m = /(\d+(?:\.\d+)?)\s*ml/i.exec(v.size || '');
    return m ? Number(m[1]) : 0;
  };

  /** Stock left for a variant taking what is already in the cart into account. */
  const availableStockFor = (variant: ProductVariant): number => {
    const product = products.find(p => p.id === variant.productId);

    // Shot variants pour from the shared 750ml bottle pool of the product
    if (product?.servesShots && variant.isShot) {
      const vol = shotMlOf(variant);
      if (vol <= 0) return 0;
      let poolMl = Math.max(0, Number(product.availableShotMl) || 0);
      // Subtract everything already in the cart that drinks from the same bottles
      for (const item of cart) {
        if (item.productId !== product.id) continue;
        const v = product.variants.find(x => x.id === item.variantId);
        if (!v) continue;
        if (v.isShot) {
          poolMl -= (shotMlOf(v) || 0) * item.quantity;
        } else if (/750\s*ml/i.test(v.size)) {
          poolMl -= 750 * item.quantity;
        }
      }
      return Math.floor(Math.max(0, poolMl) / vol);
    }

    // The 750ml bottle of a shot-serving product: reserve bottles the cart's shots will need
    if (product?.servesShots && !variant.isShot && /750\s*ml/i.test(variant.size)) {
      const inCartBottles = cart.find(i => i.variantId === variant.id)?.quantity || 0;
      let shotMlInCart = 0;
      for (const item of cart) {
        if (item.productId !== product.id) continue;
        const v = product.variants.find(x => x.id === item.variantId);
        if (v?.isShot) shotMlInCart += (shotMlOf(v) || 0) * item.quantity;
      }
      const poolMl = Math.max(0, Number(product.availableShotMl) || 0);
      const openBottleRemainderMl = poolMl % 750; // ml left in the currently open bottle
      const bottlesReservedForShots = Math.ceil(Math.max(0, shotMlInCart - openBottleRemainderMl) / 750);
      return variant.stock - inCartBottles - bottlesReservedForShots;
    }

    const inCart = cart.find(i => i.variantId === variant.id)?.quantity || 0;
    return variant.stock - inCart;
  };

  const addToCart = (
    product: Product,
    variant: ProductVariant,
    quantity: number = 1,
    itemNotes?: string
  ) => {
    if (quantity <= 0) return;

    // Block overselling in the UI as well - the card click used to add
    // out-of-stock single-variant products straight to the cart.
    const allowNegativeStock = settings?.allowNegativeStock === true;
    if (!allowNegativeStock) {
      const remaining = availableStockFor(variant);
      if (remaining < quantity) {
        window.alert(
          variant.isShot
            ? (remaining <= 0
                ? `${product.name} (${variant.size}) — no more shots left in the 750ml bottle stock.`
                : `Only ${remaining} x ${product.name} (${variant.size}) shot(s) left in the 750ml bottle stock.`)
            : (remaining <= 0
                ? `${product.name} (${variant.size}) is out of stock.`
                : `Only ${remaining} x ${product.name} (${variant.size}) left in stock.`)
        );
        closeVariantModal();
        return;
      }
    }
    
    setCart(prevCart => {
      const existingIndex = prevCart.findIndex(item => item.variantId === variant.id);

      if (existingIndex > -1) {
        const updated = [...prevCart];
        const currentQty = updated[existingIndex].quantity;
        const newQty = currentQty + quantity;
        const unitPrice = variant.sellingPrice;
        const lineTotal = Number((newQty * unitPrice).toFixed(2));

        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQty,
          total: lineTotal,
          notes: itemNotes || updated[existingIndex].notes,
        };
        return updated;
      } else {
        const unitPrice = variant.sellingPrice;
        const newItem: OrderItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          size: variant.size,
          unitPrice,
          costPrice: variant.costPrice,
          quantity,
          discount: 0,
          tax: 0,
          total: Number((unitPrice * quantity).toFixed(2)),
          notes: itemNotes,
          isKitchenItem: product.isKitchenItem,
        };
        return [...prevCart, newItem];
      }
    });

    closeVariantModal();
  };

  const updateCartQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }

    // Never allow the cart quantity to exceed the stock on hand
    const allowNegativeStock = settings?.allowNegativeStock === true;
    if (!allowNegativeStock) {
      let variantRef: ProductVariant | null = null;
      for (const p of products) {
        const v = p.variants.find(x => x.id === variantId);
        if (v) { variantRef = v; break; }
      }
      if (variantRef) {
        const currentQty = cart.find(i => i.variantId === variantId)?.quantity || 0;
        // availableStockFor already subtracts what is in the cart (incl. shared 750ml shot pool)
        const maxQty = availableStockFor(variantRef) + currentQty;
        if (quantity > maxQty) {
          window.alert(
            variantRef.isShot
              ? `Only ${Math.max(0, maxQty)} shot(s) can still be poured from the 750ml bottle stock.`
              : `Only ${Math.max(0, maxQty)} unit(s) available in stock.`
          );
          quantity = Math.max(1, maxQty);
        }
      }
    }

    setCart(prevCart =>
      prevCart.map(item => {
        if (item.variantId === variantId) {
          return {
            ...item,
            quantity,
            total: Number((item.unitPrice * quantity).toFixed(2)),
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (variantId: string) => {
    setCart(prevCart => prevCart.filter(item => item.variantId !== variantId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountPercentage(0);
    setDiscountAmount(0);
    setNotes('');
    setTableNumber('');
    setCustomerName('');
    setCustomerPhone('');
    setActiveHeldBillId(null);
  };

  const holdCurrentBill = async (): Promise<HeldBill> => {
    if (cart.length === 0) {
      throw new Error('Cart is empty. Add items before holding.');
    }

    const payload = {
      items: cart,
      orderType,
      tableNumber,
      customerName,
      customerPhone,
      subtotal,
      discount: computedDiscount,
      discountPercentage,
      tax,
      grandTotal,
      notes,
      existingHeldId: activeHeldBillId || undefined,
    };

    const savedHeld = await fetchApi<HeldBill>('/orders/hold', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    await refreshHeldBills();
    clearCart();
    return savedHeld;
  };

  const loadHeldBill = (heldBill: HeldBill) => {
    setCart(heldBill.items);
    setOrderType(heldBill.orderType);
    setTableNumber(heldBill.tableNumber || '');
    setCustomerName(heldBill.customerName || '');
    setCustomerPhone(heldBill.customerPhone || '');
    setNotes(heldBill.notes || '');
    setDiscountPercentage(heldBill.discountPercentage || 0);
    setDiscountAmount(heldBill.discountPercentage ? 0 : heldBill.discount || 0);
    setActiveHeldBillId(heldBill.id);
    setIsHeldBillsModalOpen(false);
  };

  const deleteHeldBill = async (heldBillId: string) => {
    await fetchApi(`/orders/held/${heldBillId}`, { method: 'DELETE' });
    if (activeHeldBillId === heldBillId) {
      setActiveHeldBillId(null);
    }
    await refreshHeldBills();
  };

  const createKOT = async (): Promise<KOT> => {
    if (cart.length === 0) {
      throw new Error('Cart is empty. Cannot generate KOT.');
    }

    const payload = {
      items: cart,
      orderType,
      tableNumber: tableNumber || (orderType === 'bar_counter' ? 'Bar Counter' : 'Walk-in'),
      notes,
    };

    const kot = await fetchApi<KOT>('/kot', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return kot;
  };

  const completeCheckout = async (
    paymentMethod: Bill['paymentMethod'],
    amountReceived: number,
    paymentDetails?: unknown
  ): Promise<Bill> => {
    if (cart.length === 0) {
      throw new Error('Cart is empty. Cannot complete sale.');
    }

    if (paymentMethod === 'cash' && amountReceived < grandTotal) {
      throw new Error(`Received amount Rs. ${amountReceived} is less than Grand Total Rs. ${grandTotal}`);
    }

    const payload = {
      items: cart,
      orderType,
      tableNumber,
      customerName,
      customerPhone,
      subtotal,
      discount: computedDiscount,
      discountPercentage,
      tax,
      taxRate: settings?.taxRate || 0,
      serviceCharge,
      grandTotal,
      amountReceived,
      changeAmount: Number(Math.max(0, amountReceived - grandTotal).toFixed(2)),
      paymentMethod,
      paymentDetails,
      notes,
      heldBillId: activeHeldBillId || undefined,
    };

    const completedBill = await fetchApi<Bill>('/bills/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setRecentCompletedBill(completedBill);
    await refreshProducts();
    await refreshHeldBills();
    clearCart();
    setIsPaymentModalOpen(false);
    setIsReceiptModalOpen(true);

    if (settings?.autoPrintAfterPayment) {
      setTimeout(() => {
        printThermalReceipt(completedBill, settings).catch(err => {
          console.warn('Auto print thermal receipt failed:', err);
        });
      }, 300);
    }

    return completedBill;
  };

  const handleBarcodeScan = (scannedCode: string): boolean => {
    if (!scannedCode) return false;
    const cleanCode = scannedCode.trim().toLowerCase();

    let matchedProduct: Product | null = null;
    let matchedVariant: ProductVariant | null = null;

    for (const p of products) {
      if (!p.isActive || p.isArchived) continue;
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (
          (v.barcode && v.barcode.trim().toLowerCase() === cleanCode) ||
          (v.sku && v.sku.trim().toLowerCase() === cleanCode)
        ) {
          matchedProduct = p;
          matchedVariant = v;
          break;
        }
      }
      if (matchedProduct) break;
    }

    if (!matchedProduct || !matchedVariant) {
      setScanNotice({
        type: 'error',
        message: `No item found matching barcode/SKU "${scannedCode}".`,
      });
      return false;
    }

    // CHECK BAR ITEM RESTRICTION:
    // Barcode purchasing is strictly allowed for Bar items only.
    // Kitchen / Food items or items in 'restaurant' category CANNOT be purchased via barcode.
    const category = categories.find(c => c.id === matchedProduct!.categoryId);
    const isKitchen = Boolean(matchedProduct.isKitchenItem || category?.type === 'restaurant');

    if (isKitchen) {
      setScanNotice({
        type: 'warning',
        message: `Barcode purchasing is allowed for BAR ITEMS only. "${matchedProduct.name}" is a Kitchen/Restaurant item.`,
      });
      return false;
    }

    // Check if matched variant is a Shot size vs Bottle size
    const isShot = Boolean(matchedProduct.servesShots && matchedVariant.isShot);

    // Valid Bar Item - Add to Cart
    addToCart(matchedProduct, matchedVariant, 1);
    setScanNotice({
      type: 'success',
      message: isShot
        ? `Added to cart: ${matchedProduct.name} (${matchedVariant.size} 🥃 Shot) via Barcode`
        : `Added to cart: ${matchedProduct.name} (${matchedVariant.size} 🍾 Bottle) via Barcode`,
    });
    return true;
  };

  return (
    <POSContext.Provider
      value={{
        products,
        categories,
        companies,
        rooms,
        roomBookings,
        functionHalls,
        functionBookings,
        settings,
        isLoading,
        selectedCategory,
        searchQuery,
        selectedCompany,
        cart,
        orderType,
        tableNumber,
        customerName,
        customerPhone,
        notes,
        discountPercentage,
        discountAmount,
        activeHeldBillId,
        heldBills,
        recentCompletedBill,
        isVariantModalOpen,
        selectedProductForVariant,
        isPaymentModalOpen,
        isHeldBillsModalOpen,
        isReceiptModalOpen,
        isKOTModalOpen,
        isBookingModalOpen,
        selectedRoomForBooking,
        recentBookingTicket,
        isBookingTicketModalOpen,
        subtotal,
        totalDiscount: computedDiscount,
        serviceCharge,
        tax,
        grandTotal,
        totalItemsCount,
        setSelectedCategory,
        setSearchQuery,
        setSelectedCompany,
        setOrderType,
        setTableNumber,
        setCustomerName,
        setCustomerPhone,
        setNotes,
        setDiscountPercentage,
        setDiscountAmount,
        openVariantModal,
        closeVariantModal,
        addToCart,
        availableStockFor,
        isDamageModalOpen,
        setIsDamageModalOpen,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        setIsPaymentModalOpen,
        setIsHeldBillsModalOpen,
        setIsReceiptModalOpen,
        setIsKOTModalOpen,
        holdCurrentBill,
        loadHeldBill,
        deleteHeldBill,
        createKOT,
        completeCheckout,
        refreshProducts,
        refreshHeldBills,
        scanNotice,
        clearScanNotice,
        handleBarcodeScan,
        openRoomBookingModal,
        closeRoomBookingModal,
        openBookingTicketModal,
        closeBookingTicketModal,
        refreshRooms,
        refreshRoomBookings,
        createRoomBooking,
        checkoutRoomBooking,
        cancelRoomBooking,
        addRoomPayment,
        createRoom,
        updateRoom,
        deleteRoom,
        printRoomTicket,
        isFunctionBookingModalOpen,
        selectedHallForBooking,
        recentFunctionTicket,
        isFunctionTicketModalOpen,
        openFunctionBookingModal,
        closeFunctionBookingModal,
        openFunctionTicketModal,
        closeFunctionTicketModal,
        refreshFunctionHalls,
        refreshFunctionBookings,
        createFunctionHall,
        updateFunctionHall,
        deleteFunctionHall,
        createFunctionBooking,
        completeFunctionBooking,
        cancelFunctionBooking,
        addFunctionPayment,
        printFunctionTicket,
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}
