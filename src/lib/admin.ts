import {
  collection,
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { docToOrder, type PaymentMethod, type PaymentStatus } from "./orders";
import { parseHistory, type Order } from "./history";
import { MENU, type MenuItem } from "./menu";

export type OrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "received",
  "preparing",
  "ready",
  "completed",
];

export interface TopSellerItem {
  id: number;
  name: string;
  category: string;
  emoji: string;
  price: number;
  quantitySold: number;
  totalRevenue: number;
}

export interface AnalyticsMetrics {
  totalRevenue: number;
  todayRevenue: number;
  todayOrdersCount: number;
  pendingOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  totalOrdersCount: number;
  averageOrderValue: number;
  topSellers: TopSellerItem[];
  revenueByStatus: Record<string, number>;
  ordersByStatus: Record<string, number>;
  ordersByPaymentMethod: Record<string, number>;
  revenueByPaymentMethod: Record<string, number>;
  paidRevenue: number;
  pendingCounterRevenue: number;
}

export type StockOverrides = Record<number, boolean>;

const STOCK_KEY = "canteen-menu-stock";

/**
 * Normalizes status strings (e.g. "ready for pickup" -> "ready")
 */
export function normalizeOrderStatus(status?: string): OrderStatus {
  if (!status) return "received";
  const lower = status.trim().toLowerCase();
  if (lower === "ready for pickup") return "ready";
  if (lower === "received" || lower === "preparing" || lower === "ready" || lower === "completed" || lower === "cancelled") {
    return lower as OrderStatus;
  }
  return "received";
}

/**
 * Gets the next sequential status in the fulfillment lifecycle
 */
export function getNextStatus(currentStatus?: string): OrderStatus | null {
  const norm = normalizeOrderStatus(currentStatus);
  switch (norm) {
    case "received":
      return "preparing";
    case "preparing":
      return "ready";
    case "ready":
      return "completed";
    default:
      return null;
  }
}

/**
 * Validates if an order can transition from current status to next status
 */
export function isValidStatusTransition(fromStatus: string, toStatus: string): boolean {
  const from = normalizeOrderStatus(fromStatus);
  const to = normalizeOrderStatus(toStatus);

  if (from === to) return true;
  if (from === "completed" || from === "cancelled") return false;

  if (to === "cancelled") {
    return true;
  }

  if (from === "received") return to === "preparing" || to === "ready";
  if (from === "preparing") return to === "ready" || to === "completed";
  if (from === "ready") return to === "completed";

  return false;
}

/**
 * Checks whether two dates correspond to the same local calendar day
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Calculates revenue and sales analytics across orders
 */
export function calculateAnalyticsMetrics(
  orders: Order[],
  menu: MenuItem[] = MENU,
  referenceDate: Date = new Date()
): AnalyticsMetrics {
  let totalRevenue = 0;
  let todayRevenue = 0;
  let todayOrdersCount = 0;
  let pendingOrdersCount = 0;
  let completedOrdersCount = 0;
  let cancelledOrdersCount = 0;

  const ordersByStatus: Record<string, number> = {
    received: 0,
    preparing: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
  };

  const revenueByStatus: Record<string, number> = {
    received: 0,
    preparing: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
  };

  const ordersByPaymentMethod: Record<string, number> = {
    upi: 0,
    counter: 0,
  };

  const revenueByPaymentMethod: Record<string, number> = {
    upi: 0,
    counter: 0,
  };

  let paidRevenue = 0;
  let pendingCounterRevenue = 0;

  const itemSalesMap = new Map<number, { qty: number; revenue: number }>();

  for (const order of orders) {
    const status = normalizeOrderStatus(order.status);
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
    revenueByStatus[status] = (revenueByStatus[status] || 0) + order.total;

    const paymentMethod: PaymentMethod = order.paymentMethod || "counter";
    const paymentStatus: PaymentStatus =
      order.paymentStatus || (paymentMethod === "counter" ? "pending" : "pending");

    ordersByPaymentMethod[paymentMethod] = (ordersByPaymentMethod[paymentMethod] || 0) + 1;
    revenueByPaymentMethod[paymentMethod] = (revenueByPaymentMethod[paymentMethod] || 0) + order.total;

    if (paymentStatus === "paid") {
      paidRevenue += order.total;
    } else {
      pendingCounterRevenue += order.total;
    }

    const orderDate = new Date(order.placedAt);
    const isToday = !Number.isNaN(orderDate.getTime()) && isSameDay(orderDate, referenceDate);

    if (isToday) {
      todayOrdersCount += 1;
    }

    if (status === "completed") {
      completedOrdersCount += 1;
      totalRevenue += order.total;
      if (isToday) {
        todayRevenue += order.total;
      }
    } else if (status === "cancelled") {
      cancelledOrdersCount += 1;
    } else {
      pendingOrdersCount += 1;
    }

    // Accumulate items for top seller breakdown from all non-cancelled orders
    if (status !== "cancelled" && Array.isArray(order.items)) {
      for (const line of order.items) {
        if (!line || typeof line.id !== "number") continue;
        const current = itemSalesMap.get(line.id) || { qty: 0, revenue: 0 };
        const menuItem = menu.find((m) => m.id === line.id);
        const unitPrice = menuItem ? menuItem.price : 0;
        itemSalesMap.set(line.id, {
          qty: current.qty + (line.qty || 0),
          revenue: current.revenue + (line.qty || 0) * unitPrice,
        });
      }
    }
  }

  const topSellers: TopSellerItem[] = Array.from(itemSalesMap.entries())
    .map(([id, data]) => {
      const menuItem = menu.find((m) => m.id === id);
      return {
        id,
        name: menuItem?.name || `Item #${id}`,
        category: menuItem?.category || "Other",
        emoji: menuItem?.emoji || "🍽️",
        price: menuItem?.price || 0,
        quantitySold: data.qty,
        totalRevenue: Math.round(data.revenue * 100) / 100,
      };
    })
    .sort((a, b) => b.quantitySold - a.quantitySold || b.totalRevenue - a.totalRevenue);

  const averageOrderValue =
    completedOrdersCount > 0
      ? Math.round((totalRevenue / completedOrdersCount) * 100) / 100
      : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    todayOrdersCount,
    pendingOrdersCount,
    completedOrdersCount,
    cancelledOrdersCount,
    totalOrdersCount: orders.length,
    averageOrderValue,
    topSellers,
    revenueByStatus,
    ordersByStatus,
    ordersByPaymentMethod,
    revenueByPaymentMethod,
    paidRevenue: Math.round(paidRevenue * 100) / 100,
    pendingCounterRevenue: Math.round(pendingCounterRevenue * 100) / 100,
  };
}

/**
 * Updates an order's status in Firestore and in the local cache
 */
export async function updateOrderStatus(orderId: string, newStatus: string): Promise<void> {
  const normalized = normalizeOrderStatus(newStatus);

  if (isFirebaseConfigured) {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        status: normalized,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Could not update order status in Firestore:", err);
    }
  }

  // Update local cache for offline/instant local update
  try {
    const raw = localStorage.getItem("canteen-orders");
    if (raw) {
      const orders = parseHistory(raw);
      const updated = orders.map((o) => (o.id === orderId ? { ...o, status: normalized } : o));
      localStorage.setItem("canteen-orders", JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("canteen-orders-updated", { detail: updated }));
    }
  } catch (err) {
    console.warn("Could not update local storage cache:", err);
  }
}

/**
 * Updates an order's payment status in Firestore and in the local cache
 */
export async function updateOrderPaymentStatus(
  orderId: string,
  newPaymentStatus: PaymentStatus
): Promise<void> {
  if (isFirebaseConfigured) {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        paymentStatus: newPaymentStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Could not update order payment status in Firestore:", err);
    }
  }

  // Update local cache for offline/instant local update
  try {
    const raw = localStorage.getItem("canteen-orders");
    if (raw) {
      const orders = parseHistory(raw);
      const updated = orders.map((o) =>
        o.id === orderId ? { ...o, paymentStatus: newPaymentStatus } : o
      );
      localStorage.setItem("canteen-orders", JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("canteen-orders-updated", { detail: updated }));
    }
  } catch (err) {
    console.warn("Could not update local storage cache for payment status:", err);
  }
}

/**
 * Subscribes to all orders in real time for staff kitchen dashboard
 */
export function subscribeAllOrders(
  onOrders: (orders: Order[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  let unsubFirestore = () => {};

  // Try real-time Firestore subscription if configured
  if (isFirebaseConfigured) {
    try {
      const ordersRef = collection(db, "orders");
      unsubFirestore = onSnapshot(
        ordersRef,
        (snapshot) => {
          const remoteOrders = snapshot.docs.map((docSnap) =>
            docToOrder(docSnap.id, docSnap.data() as Record<string, unknown>)
          );
          remoteOrders.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));

          // Also merge with any offline local orders
          const localOrders = parseHistory(localStorage.getItem("canteen-orders"));
          const merged = [...remoteOrders];
          for (const local of localOrders) {
            if (!merged.some((r) => r.id === local.id)) {
              merged.push(local);
            }
          }
          merged.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
          onOrders(merged);
        },
        (error) => {
          console.warn("Firestore all-orders subscription error:", error);
          onError?.(error);
          onOrders(parseHistory(localStorage.getItem("canteen-orders")));
        }
      );
    } catch (err) {
      console.warn("Firestore listener initialization failed:", err);
      onError?.(err);
      onOrders(parseHistory(localStorage.getItem("canteen-orders")));
    }
  } else {
    // Initial load from local cache when Firebase is not configured
    onOrders(parseHistory(localStorage.getItem("canteen-orders")));
  }

  // Listen to local window events for multi-tab sync
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "canteen-orders") {
      onOrders(parseHistory(e.newValue));
    }
  };
  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<Order[]>;
    if (custom.detail) {
      onOrders(custom.detail);
    } else {
      onOrders(parseHistory(localStorage.getItem("canteen-orders")));
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener("canteen-orders-updated", handleCustom);

  return () => {
    unsubFirestore();
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("canteen-orders-updated", handleCustom);
  };
}

/**
 * Menu stock management helpers
 */
export function getLocalStockOverrides(): StockOverrides {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalStockOverrides(overrides: StockOverrides): void {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent("canteen-stock-updated", { detail: overrides }));
  } catch (err) {
    console.warn("Failed to save local stock overrides:", err);
  }
}

export async function setItemStockAvailable(itemId: number, available: boolean): Promise<StockOverrides> {
  const current = getLocalStockOverrides();
  const updated = { ...current, [itemId]: available };
  saveLocalStockOverrides(updated);

  if (isFirebaseConfigured) {
    try {
      const stockDocRef = doc(db, "settings", "menu_stock");
      await setDoc(stockDocRef, { overrides: updated, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn("Failed to sync stock override to Firestore:", err);
    }
  }

  return updated;
}

export function subscribeMenuStock(onUpdate: (overrides: StockOverrides) => void): Unsubscribe {
  let unsubFirestore = () => {};

  if (isFirebaseConfigured) {
    try {
      const stockDocRef = doc(db, "settings", "menu_stock");
      unsubFirestore = onSnapshot(
        stockDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.overrides && typeof data.overrides === "object") {
              saveLocalStockOverrides(data.overrides as StockOverrides);
              onUpdate(data.overrides as StockOverrides);
            }
          }
        },
        (err) => console.warn("Firestore stock snapshot error:", err)
      );
    } catch (err) {
      console.warn("Could not listen to Firestore stock:", err);
    }
  }

  const handleCustom = (e: Event) => {
    const custom = e as CustomEvent<StockOverrides>;
    if (custom.detail) {
      onUpdate(custom.detail);
    } else {
      onUpdate(getLocalStockOverrides());
    }
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STOCK_KEY) {
      onUpdate(getLocalStockOverrides());
    }
  };

  window.addEventListener("canteen-stock-updated", handleCustom);
  window.addEventListener("storage", handleStorage);

  onUpdate(getLocalStockOverrides());

  return () => {
    unsubFirestore();
    window.removeEventListener("canteen-stock-updated", handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getEffectiveMenu(baseMenu: MenuItem[], overrides: StockOverrides): MenuItem[] {
  return baseMenu.map((item) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, item.id);
    return {
      ...item,
      available: hasOverride ? Boolean(overrides[item.id]) : item.available,
    };
  });
}

export interface HourlyRushBucket {
  hour: number;
  label: string;
  periodName?: string;
  orderCount: number;
  revenue: number;
  isPeak: boolean;
  isCurrentHour: boolean;
}

/**
 * Common campus break and rush periods mapped to hourly operating windows
 */
export const COLLEGE_HOURLY_PERIODS: Record<number, string> = {
  8: "Breakfast",
  11: "Morning Break",
  13: "Lunch Peak",
  16: "Evening Snacks",
};

/**
 * Calculates hourly order distribution across college canteen operating hours (08:00 - 18:00).
 * Flags the peak surge hour and current hour for kitchen batch preparation.
 */
export function calculateHourlyDistribution(
  orders: Order[],
  referenceDate?: Date
): HourlyRushBucket[] {
  const now = referenceDate || new Date();
  const currentHour = now.getHours();

  // Operating hours: 8:00 AM (08:00) through 6:00 PM (18:00) -> 10 buckets
  const buckets: HourlyRushBucket[] = [];
  for (let h = 8; h <= 17; h++) {
    const startStr = String(h).padStart(2, "0") + ":00";
    const endStr = String(h + 1).padStart(2, "0") + ":00";
    buckets.push({
      hour: h,
      label: `${startStr} - ${endStr}`,
      periodName: COLLEGE_HOURLY_PERIODS[h],
      orderCount: 0,
      revenue: 0,
      isPeak: false,
      isCurrentHour: h === currentHour,
    });
  }

  for (const order of orders) {
    if (!order.placedAt) continue;
    const orderDate = new Date(order.placedAt);
    if (Number.isNaN(orderDate.getTime())) continue;

    const orderHour = orderDate.getHours();
    if (orderHour >= 8 && orderHour <= 17) {
      const bucketIndex = orderHour - 8;
      buckets[bucketIndex].orderCount += 1;
      const status = normalizeOrderStatus(order.status);
      if (status !== "cancelled") {
        buckets[bucketIndex].revenue =
          Math.round((buckets[bucketIndex].revenue + (order.total || 0)) * 100) / 100;
      }
    }
  }

  const maxOrders = Math.max(...buckets.map((b) => b.orderCount));
  if (maxOrders > 0) {
    for (const bucket of buckets) {
      if (bucket.orderCount === maxOrders) {
        bucket.isPeak = true;
      }
    }
  }

  return buckets;
}

/**
 * RFC-4180 compliant CSV field escaping.
 * Fields containing commas, quotes, or newlines are wrapped in quotes with internal quotes doubled.
 */
export function formatCSVField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC-4180 compliant CSV string from an array of order records.
 * Columns: Order ID, Date & Timestamp, Items Summary, Subtotal, Discount, GST, Total Paid,
 * Payment Method, Payment Status, Fulfillment Status.
 */
export function generateOrdersCSV(orders: Order[], menu: MenuItem[] = MENU): string {
  const headers = [
    "Order ID",
    "Date & Timestamp",
    "Items Summary",
    "Subtotal (₹)",
    "Discount (₹)",
    "GST (₹)",
    "Total Paid (₹)",
    "Payment Method",
    "Payment Status",
    "Fulfillment Status",
  ];

  const rows: string[] = [headers.map(formatCSVField).join(",")];

  for (const order of orders) {
    let itemsSummary = "";
    let itemsSubtotal = 0;

    if (Array.isArray(order.items) && order.items.length > 0) {
      const summaryParts: string[] = [];
      for (const line of order.items) {
        const item = menu.find((m) => m.id === line.id);
        const name = item ? item.name : `Item #${line.id}`;
        const unitPrice = item ? item.price : 0;
        itemsSubtotal += unitPrice * line.qty;
        summaryParts.push(`${line.qty}x ${name}`);
      }
      itemsSummary = summaryParts.join(", ");
    } else {
      itemsSummary = "No items";
    }

    const totalPaid = typeof order.total === "number" ? order.total : 0;
    const subtotal = itemsSubtotal > 0 ? itemsSubtotal : Math.round((totalPaid / 1.05) * 100) / 100;
    const calculatedPreTax = Math.round((totalPaid / 1.05) * 100) / 100;
    const discount = Math.max(0, Math.round((subtotal - calculatedPreTax) * 100) / 100);
    const taxableAmount = Math.max(0, subtotal - discount);
    const gst = Math.round(taxableAmount * 0.05 * 100) / 100;

    const rawOrder = order as Order & { paymentMethod?: string; paymentStatus?: string };
    const paymentMethod = rawOrder.paymentMethod ? rawOrder.paymentMethod.toUpperCase() : "COUNTER";
    const paymentStatus = rawOrder.paymentStatus
      ? rawOrder.paymentStatus.toUpperCase()
      : order.status === "completed"
      ? "PAID"
      : "PENDING";
    const fulfillmentStatus =
      ORDER_STATUS_LABELS[normalizeOrderStatus(order.status)] || order.status || "Received";

    const row = [
      formatCSVField(order.id),
      formatCSVField(order.placedAt),
      formatCSVField(itemsSummary),
      formatCSVField(subtotal.toFixed(2)),
      formatCSVField(discount.toFixed(2)),
      formatCSVField(gst.toFixed(2)),
      formatCSVField(totalPaid.toFixed(2)),
      formatCSVField(paymentMethod),
      formatCSVField(paymentStatus),
      formatCSVField(fulfillmentStatus),
    ];

    rows.push(row.join(","));
  }

  return rows.join("\r\n");
}

/**
 * Initiates browser download of CSV string as a file.
 * Prepends UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility on Windows.
 * Uses deferred revokeObjectURL to prevent browsers from aborting the download stream.
 */
export function downloadCSV(filename: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  // Prepend UTF-8 BOM so Excel opens Hindi/special characters and currency symbols properly
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Defer cleanup so browser download manager has time to capture the blob stream
  setTimeout(() => {
    try {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error if already removed
    }
  }, 1000);
}

