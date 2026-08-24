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
  RoomBooking
} from '../types.ts';
import { fetchApi } from '../lib/api.ts';
import { printThermalReceipt, printRoomBookingTicket } from '../lib/printEngine.ts';
import { useAuth } from './AuthContext.tsx';

interface POSContextType {
  products: Product[];
  categories: Category[];
  companies: Company[];
  rooms: Room[];
  roomBookings: RoomBooking[];
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
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);
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

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [prodsData, catsData, compsData, settsData, heldData, roomsData, bookingsData] = await Promise.all([
        fetchApi<Product[]>('/products'),
        fetchApi<Category[]>('/categories'),
        fetchApi<Company[]>('/companies'),
        fetchApi<SystemSettings>('/settings'),
        fetchApi<HeldBill[]>('/orders/held'),
        fetchApi<Room[]>('/rooms'),
        fetchApi<RoomBooking[]>('/room-bookings'),
      ]);

      setProducts(prodsData || []);
      setCategories(catsData || []);
      setCompanies(compsData || []);
      setSettings(settsData || null);
      setHeldBills(heldData || []);
      setRooms(roomsData || []);
      setRoomBookings(bookingsData || []);
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const { subtotal, computedDiscount, serviceCharge, tax, grandTotal, totalItemsCount } = useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    
    let disc = 0;
    const maxDiscountPct = settings?.maxDiscountPercentage || 100;
    
    if (discountPercentage > 0) {
      const clampedPct = Math.min(discountPercentage, maxDiscountPct, 100);
      disc = (sub * clampedPct) / 100;
    } else if (discountAmount > 0) {
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

    for (const p of products) {
      if (!p.isActive || p.isArchived) continue;
      for (const v of p.variants) {
        if (!v.isActive) continue;
        if (
          (v.barcode && v.barcode.toLowerCase() === cleanCode) ||
          (v.sku && v.sku.toLowerCase() === cleanCode)
        ) {
          addToCart(p, v, 1);
          return true;
        }
      }
    }
    return false;
  };

  return (
    <POSContext.Provider
      value={{
        products,
        categories,
        companies,
        rooms,
        roomBookings,
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
