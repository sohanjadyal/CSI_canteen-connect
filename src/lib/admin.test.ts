import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Firestore functions
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn((_db: unknown, collection: string, id: string) => ({
  path: `${collection}/${id}`,
  id,
}));
const mockServerTimestamp = vi.fn(() => "MOCK_TIMESTAMP");

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
  return {
    ...actual,
    doc: (...args: unknown[]) => mockDoc(...(args as [unknown, string, string])),
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
    serverTimestamp: () => mockServerTimestamp(),
    onSnapshot: vi.fn(),
  };
});

vi.mock("./firebase", () => ({
  db: { _mockDb: true },
  isFirebaseConfigured: true,
}));

// Mock localStorage and window events in test environment
const mockStorage = new Map<string, string>();
const storageMock: Storage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mockStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    mockStorage.delete(key);
  },
  clear: () => {
    mockStorage.clear();
  },
  key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
  length: 0,
};

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true,
});

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

const dispatchSpy = vi.fn();
if (typeof window !== "undefined") {
  window.dispatchEvent = dispatchSpy as unknown as typeof window.dispatchEvent;
}

import {
  calculateAnalyticsMetrics,
  calculateHourlyDistribution,
  downloadCSV,
  formatCSVField,
  generateOrdersCSV,
  getEffectiveMenu,
  getNextStatus,
  isSameDay,
  isValidStatusTransition,
  normalizeOrderStatus,
  setItemStockAvailable,
  updateOrderStatus,
  COLLEGE_HOURLY_PERIODS,
  updateOrderPaymentStatus,
} from "./admin";
import { isAdminEmail, getAdminEmails, isVerifiedAdminUser } from "./auth-validation";
import type { Order } from "./history";
import type { MenuItem } from "./menu";

describe("admin authorization (RBAC)", () => {
  const originalEnv = import.meta.env.VITE_ADMIN_EMAILS;

  beforeEach(() => {
    delete (import.meta.env as Record<string, unknown>).VITE_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      import.meta.env.VITE_ADMIN_EMAILS = originalEnv;
    } else {
      delete (import.meta.env as Record<string, unknown>).VITE_ADMIN_EMAILS;
    }
  });

  it("returns empty admin list when VITE_ADMIN_EMAILS is not configured", () => {
    expect(getAdminEmails()).toEqual([]);
    expect(isAdminEmail("canteen@spit.ac.in")).toBe(false);
    expect(isAdminEmail("admin@spit.ac.in")).toBe(false);
  });

  it("identifies authorized admin emails from environment variable", () => {
    import.meta.env.VITE_ADMIN_EMAILS = "canteen@spit.ac.in,admin@spit.ac.in,staff@spit.ac.in";
    expect(getAdminEmails()).toEqual(["canteen@spit.ac.in", "admin@spit.ac.in", "staff@spit.ac.in"]);
    expect(isAdminEmail("canteen@spit.ac.in")).toBe(true);
    expect(isAdminEmail("admin@spit.ac.in")).toBe(true);
    expect(isAdminEmail("staff@spit.ac.in")).toBe(true);
  });

  it("handles case-insensitivity and trimming in admin emails", () => {
    import.meta.env.VITE_ADMIN_EMAILS = "canteen@spit.ac.in,admin@spit.ac.in";
    expect(isAdminEmail(" CANTEEN@SPIT.AC.IN ")).toBe(true);
    expect(isAdminEmail("Admin@Spit.Ac.In")).toBe(true);
  });

  it("rejects regular student emails from admin access", () => {
    import.meta.env.VITE_ADMIN_EMAILS = "canteen@spit.ac.in";
    expect(isAdminEmail("student@spit.ac.in")).toBe(false);
    expect(isAdminEmail("sohan.jadyal@spit.ac.in")).toBe(false);
    expect(isAdminEmail("random@gmail.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("requires email verification for verified admin status (isVerifiedAdminUser)", () => {
    import.meta.env.VITE_ADMIN_EMAILS = "canteen@spit.ac.in,admin@spit.ac.in";

    // Valid admin with verified email -> allowed
    expect(isVerifiedAdminUser({ email: "canteen@spit.ac.in", emailVerified: true })).toBe(true);
    expect(isVerifiedAdminUser({ email: "admin@spit.ac.in", emailVerified: true })).toBe(true);

    // Unverified admin email -> rejected (prevents unverified signup hijack)
    expect(isVerifiedAdminUser({ email: "canteen@spit.ac.in", emailVerified: false })).toBe(false);

    // Student account even if verified -> rejected
    expect(isVerifiedAdminUser({ email: "student@spit.ac.in", emailVerified: true })).toBe(false);

    // Missing user / null
    expect(isVerifiedAdminUser(null)).toBe(false);
    expect(isVerifiedAdminUser(undefined)).toBe(false);
  });
});

describe("order status lifecycle transitions", () => {
  it("normalizes status strings correctly", () => {
    expect(normalizeOrderStatus("received")).toBe("received");
    expect(normalizeOrderStatus("preparing")).toBe("preparing");
    expect(normalizeOrderStatus("ready")).toBe("ready");
    expect(normalizeOrderStatus("ready for pickup")).toBe("ready");
    expect(normalizeOrderStatus("Ready For Pickup")).toBe("ready");
    expect(normalizeOrderStatus("completed")).toBe("completed");
    expect(normalizeOrderStatus("cancelled")).toBe("cancelled");
    expect(normalizeOrderStatus(undefined)).toBe("received");
    expect(normalizeOrderStatus("unknown_status")).toBe("received");
  });

  it("computes next status in fulfillment flow", () => {
    expect(getNextStatus("received")).toBe("preparing");
    expect(getNextStatus("preparing")).toBe("ready");
    expect(getNextStatus("ready")).toBe("completed");
    expect(getNextStatus("ready for pickup")).toBe("completed");
    expect(getNextStatus("completed")).toBeNull();
    expect(getNextStatus("cancelled")).toBeNull();
  });

  it("validates allowed and disallowed status transitions", () => {
    // Valid sequential flows
    expect(isValidStatusTransition("received", "preparing")).toBe(true);
    expect(isValidStatusTransition("preparing", "ready")).toBe(true);
    expect(isValidStatusTransition("ready", "completed")).toBe(true);

    // Valid shortcuts or cancellations
    expect(isValidStatusTransition("received", "cancelled")).toBe(true);
    expect(isValidStatusTransition("preparing", "cancelled")).toBe(true);
    expect(isValidStatusTransition("ready", "cancelled")).toBe(true);

    // Terminal states cannot transition further
    expect(isValidStatusTransition("completed", "received")).toBe(false);
    expect(isValidStatusTransition("completed", "cancelled")).toBe(false);
    expect(isValidStatusTransition("cancelled", "preparing")).toBe(false);
  });
});

describe("date matching helper", () => {
  it("correctly identifies same local calendar day", () => {
    const d1 = new Date(2026, 9, 16, 10, 30);
    const d2 = new Date(2026, 9, 16, 18, 45);
    const d3 = new Date(2026, 9, 17, 10, 30);

    expect(isSameDay(d1, d2)).toBe(true);
    expect(isSameDay(d1, d3)).toBe(false);
  });
});

describe("revenue and sales analytics calculations", () => {
  const sampleMenu: MenuItem[] = [
    { id: 1, name: "Masala Dosa", category: "Meals", price: 60, veg: true, emoji: "🥞", description: "Dosa", available: true },
    { id: 2, name: "Vada Pav", category: "Snacks", price: 20, veg: true, emoji: "🍔", description: "Vada Pav", available: true },
    { id: 3, name: "Cold Coffee", category: "Beverages", price: 50, veg: true, emoji: "🧋", description: "Coffee", available: true },
  ];

  it("returns zero metrics when orders list is empty", () => {
    const metrics = calculateAnalyticsMetrics([], sampleMenu);
    expect(metrics.totalRevenue).toBe(0);
    expect(metrics.todayRevenue).toBe(0);
    expect(metrics.todayOrdersCount).toBe(0);
    expect(metrics.pendingOrdersCount).toBe(0);
    expect(metrics.completedOrdersCount).toBe(0);
    expect(metrics.cancelledOrdersCount).toBe(0);
    expect(metrics.totalOrdersCount).toBe(0);
    expect(metrics.averageOrderValue).toBe(0);
    expect(metrics.topSellers).toEqual([]);
  });

  it("calculates revenue only from completed orders", () => {
    const today = new Date(2026, 9, 16, 12, 0);
    const orders: Order[] = [
      {
        id: "ord-1",
        placedAt: new Date(2026, 9, 16, 10, 0).toISOString(),
        items: [{ id: 1, qty: 2 }], // 2 * 60 = 120
        total: 126, // total with tax/delivery
        status: "completed",
      },
      {
        id: "ord-2",
        placedAt: new Date(2026, 9, 16, 11, 0).toISOString(),
        items: [{ id: 2, qty: 3 }],
        total: 63,
        status: "received", // pending
      },
      {
        id: "ord-3",
        placedAt: new Date(2026, 9, 15, 14, 0).toISOString(), // yesterday
        items: [{ id: 3, qty: 1 }],
        total: 52.5,
        status: "completed",
      },
      {
        id: "ord-4",
        placedAt: new Date(2026, 9, 16, 9, 0).toISOString(),
        items: [{ id: 1, qty: 1 }],
        total: 63,
        status: "cancelled",
      },
    ];

    const metrics = calculateAnalyticsMetrics(orders, sampleMenu, today);

    // Completed are ord-1 (126, today) and ord-3 (52.5, yesterday)
    expect(metrics.totalRevenue).toBe(178.5);
    expect(metrics.todayRevenue).toBe(126);
    expect(metrics.todayOrdersCount).toBe(3); // ord-1, ord-2, ord-4 placed today
    expect(metrics.pendingOrdersCount).toBe(1); // ord-2
    expect(metrics.completedOrdersCount).toBe(2); // ord-1, ord-3
    expect(metrics.cancelledOrdersCount).toBe(1); // ord-4
    expect(metrics.totalOrdersCount).toBe(4);

    // Average Order Value = 178.5 / 2 = 89.25
    expect(metrics.averageOrderValue).toBe(89.25);

    // Top sellers breakdown excludes cancelled orders
    // ord-1: 2x id 1
    // ord-2: 3x id 2
    // ord-3: 1x id 3
    expect(metrics.topSellers.length).toBe(3);
    const topItem = metrics.topSellers[0];
    expect(topItem.id).toBe(2); // 3x Vada Pav
    expect(topItem.quantitySold).toBe(3);
    expect(topItem.name).toBe("Vada Pav");

    const secondItem = metrics.topSellers[1];
    expect(secondItem.id).toBe(1); // 2x Masala Dosa
    expect(secondItem.quantitySold).toBe(2);
  });

  it("aggregates orders and revenue by payment method correctly", () => {
    const orders: Order[] = [
      {
        id: "p-1",
        items: [{ id: 1, qty: 1 }],
        total: 100,
        placedAt: "2026-10-18T10:00:00.000Z",
        status: "completed",
        paymentMethod: "upi",
        paymentStatus: "paid",
      },
      {
        id: "p-2",
        items: [{ id: 2, qty: 1 }],
        total: 60,
        placedAt: "2026-10-18T11:00:00.000Z",
        status: "received",
        paymentMethod: "counter",
        paymentStatus: "pending",
      },
    ];

    const metrics = calculateAnalyticsMetrics(orders);
    expect(metrics.ordersByPaymentMethod.upi).toBe(1);
    expect(metrics.ordersByPaymentMethod.counter).toBe(1);

    expect(metrics.revenueByPaymentMethod.upi).toBe(100);
    expect(metrics.revenueByPaymentMethod.counter).toBe(60);

    expect(metrics.paidRevenue).toBe(100);
    expect(metrics.pendingCounterRevenue).toBe(60);
  });
});

describe("dynamic menu stock overrides", () => {
  const baseMenu: MenuItem[] = [
    { id: 1, name: "Masala Dosa", category: "Meals", price: 60, veg: true, emoji: "🥞", description: "", available: true },
    { id: 2, name: "Chole Bhature", category: "Meals", price: 90, veg: true, emoji: "🫓", description: "", available: false },
    { id: 3, name: "Samosa", category: "Snacks", price: 18, veg: true, emoji: "🥟", description: "", available: true },
  ];

  it("applies stock availability overrides without mutating base menu", () => {
    const overrides = {
      1: false, // mark Masala Dosa sold out
      2: true,  // mark Chole Bhature back in stock
    };

    const effective = getEffectiveMenu(baseMenu, overrides);

    expect(effective.find((m) => m.id === 1)?.available).toBe(false);
    expect(effective.find((m) => m.id === 2)?.available).toBe(true);
    expect(effective.find((m) => m.id === 3)?.available).toBe(true); // unchanged

    // Base menu remains untouched
    expect(baseMenu.find((m) => m.id === 1)?.available).toBe(true);
    expect(baseMenu.find((m) => m.id === 2)?.available).toBe(false);
  });
});

describe("Firestore functions (updateOrderStatus & setItemStockAvailable)", () => {
  beforeEach(() => {
    mockStorage.clear();
    dispatchSpy.mockClear();
    mockUpdateDoc.mockClear();
    mockSetDoc.mockClear();
    mockDoc.mockClear();
  });

  it("updateOrderStatus updates Firestore document with normalized status and serverTimestamp", async () => {
    const initialOrders: Order[] = [
      {
        id: "order-123",
        items: [{ id: 1, qty: 1 }],
        total: 60,
        placedAt: new Date().toISOString(),
        status: "received",
      },
    ];
    localStorage.setItem("canteen-orders", JSON.stringify(initialOrders));

    await updateOrderStatus("order-123", "ready for pickup");

    // Firestore call checks
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "orders", "order-123");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "orders/order-123", id: "order-123" }),
      {
        status: "ready", // normalized from 'ready for pickup'
        updatedAt: "MOCK_TIMESTAMP",
      }
    );

    // Local storage check
    const updated = JSON.parse(localStorage.getItem("canteen-orders") || "[]");
    expect(updated[0].status).toBe("ready");

    // Events dispatch check
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("updateOrderStatus handles Firestore errors gracefully without throwing", async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error("Firestore network disconnect"));
    const initialOrders: Order[] = [
      {
        id: "order-456",
        items: [{ id: 2, qty: 2 }],
        total: 40,
        placedAt: new Date().toISOString(),
        status: "received",
      },
    ];
    localStorage.setItem("canteen-orders", JSON.stringify(initialOrders));

    await expect(updateOrderStatus("order-456", "preparing")).resolves.not.toThrow();

    // Local storage still gets updated as offline fallback
    const updated = JSON.parse(localStorage.getItem("canteen-orders") || "[]");
    expect(updated[0].status).toBe("preparing");
  });

  it("setItemStockAvailable updates local storage and writes to Firestore settings/menu_stock", async () => {
    const result = await setItemStockAvailable(1, false);

    expect(result).toEqual({ 1: false });
    expect(JSON.parse(localStorage.getItem("canteen-menu-stock") || "{}")).toEqual({ 1: false });

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "settings", "menu_stock");
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "settings/menu_stock", id: "menu_stock" }),
      {
        overrides: { 1: false },
        updatedAt: "MOCK_TIMESTAMP",
      },
      { merge: true }
    );
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("setItemStockAvailable handles Firestore write failures gracefully", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("Firestore permission denied"));

    const result = await setItemStockAvailable(2, true);
    expect(result[2]).toBe(true);
    expect(JSON.parse(localStorage.getItem("canteen-menu-stock") || "{}")[2]).toBe(true);
  });

  it("updateOrderPaymentStatus writes new paymentStatus to Firestore orders and updates local storage", async () => {
    const initialOrders = [
      { id: "ord-pay-1", total: 100, placedAt: "2026-10-18T10:00:00.000Z", items: [{ id: 1, qty: 1 }], paymentStatus: "pending" },
    ];
    localStorage.setItem("canteen-orders", JSON.stringify(initialOrders));

    await updateOrderPaymentStatus("ord-pay-1", "paid");

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "orders", "ord-pay-1");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "orders/ord-pay-1", id: "ord-pay-1" }),
      {
        paymentStatus: "paid",
        updatedAt: "MOCK_TIMESTAMP",
      }
    );

    const updated = JSON.parse(localStorage.getItem("canteen-orders") || "[]");
    expect(updated[0].paymentStatus).toBe("paid");
    expect(dispatchSpy).toHaveBeenCalled();
  });
});

describe("Hourly Rush Distribution Analytics (calculateHourlyDistribution)", () => {
  it("generates 10 standard hourly buckets covering operating hours 08:00 to 18:00", () => {
    const buckets = calculateHourlyDistribution([]);
    expect(buckets).toHaveLength(10);
    expect(buckets[0].hour).toBe(8);
    expect(buckets[0].label).toBe("08:00 - 09:00");
    expect(buckets[0].periodName).toBe(COLLEGE_HOURLY_PERIODS[8]); // Breakfast
    expect(buckets[9].hour).toBe(17);
    expect(buckets[9].label).toBe("17:00 - 18:00");
  });

  it("accurately tallies order count and completed/preparing sales revenue by hour", () => {
    const orders: Order[] = [
      // 08:30 (Breakfast): 2 orders, 1 completed (100), 1 preparing (50) -> count 2, rev 150
      { id: "1", total: 100, placedAt: "2026-10-18T08:30:00.000", items: [], status: "completed" },
      { id: "2", total: 50, placedAt: "2026-10-18T08:45:00.000", items: [], status: "preparing" },
      // 11:15 (Morning Break): 1 order, cancelled -> count 1, rev 0
      { id: "3", total: 80, placedAt: "2026-10-18T11:15:00.000", items: [], status: "cancelled" },
      // 13:10 (Lunch Peak): 3 orders (total 350)
      { id: "4", total: 120, placedAt: "2026-10-18T13:10:00.000", items: [], status: "completed" },
      { id: "5", total: 130, placedAt: "2026-10-18T13:20:00.000", items: [], status: "completed" },
      { id: "6", total: 100, placedAt: "2026-10-18T13:40:00.000", items: [], status: "completed" },
    ];

    const buckets = calculateHourlyDistribution(orders);
    const bucket8 = buckets.find((b) => b.hour === 8);
    expect(bucket8?.orderCount).toBe(2);
    expect(bucket8?.revenue).toBe(150);

    const bucket11 = buckets.find((b) => b.hour === 11);
    expect(bucket11?.orderCount).toBe(1);
    expect(bucket11?.revenue).toBe(0); // Cancelled order excluded from revenue

    const bucket13 = buckets.find((b) => b.hour === 13);
    expect(bucket13?.orderCount).toBe(3);
    expect(bucket13?.revenue).toBe(350);
  });

  it("flags the peak surge hour with isPeak: true", () => {
    const orders: Order[] = [
      { id: "1", total: 50, placedAt: "2026-10-18T08:15:00.000", items: [], status: "completed" },
      { id: "2", total: 50, placedAt: "2026-10-18T13:10:00.000", items: [], status: "completed" },
      { id: "3", total: 50, placedAt: "2026-10-18T13:25:00.000", items: [], status: "completed" },
      { id: "4", total: 50, placedAt: "2026-10-18T13:45:00.000", items: [], status: "completed" },
      { id: "5", total: 50, placedAt: "2026-10-18T16:20:00.000", items: [], status: "completed" },
    ];

    const buckets = calculateHourlyDistribution(orders);
    const peakBucket = buckets.find((b) => b.isPeak);
    expect(peakBucket).toBeDefined();
    expect(peakBucket?.hour).toBe(13); // 1:00 PM is peak with 3 orders
    expect(peakBucket?.orderCount).toBe(3);
  });

  it("detects and flags the current operating hour bucket with isCurrentHour", () => {
    const refDate = new Date("2026-10-18T11:42:00.000"); // 11 AM
    const buckets = calculateHourlyDistribution([], refDate);

    const currentBucket = buckets.find((b) => b.isCurrentHour);
    expect(currentBucket).toBeDefined();
    expect(currentBucket?.hour).toBe(11);
    expect(currentBucket?.label).toBe("11:00 - 12:00");

    const otherBuckets = buckets.filter((b) => b.hour !== 11);
    expect(otherBuckets.every((b) => !b.isCurrentHour)).toBe(true);
  });

  it("ignores or handles out of bounds timestamps safely without error", () => {
    const orders: Order[] = [
      { id: "early", total: 50, placedAt: "2026-10-18T05:00:00.000", items: [], status: "completed" },
      { id: "late", total: 50, placedAt: "2026-10-18T22:00:00.000", items: [], status: "completed" },
      { id: "invalid", total: 50, placedAt: "invalid-date-string", items: [], status: "completed" },
    ];

    const buckets = calculateHourlyDistribution(orders);
    expect(buckets).toHaveLength(10);
    expect(buckets.every((b) => b.orderCount === 0)).toBe(true);
  });
});

describe("CSV Field Escaping & Sales Report Export", () => {
  describe("formatCSVField", () => {
    it("handles null, undefined, and plain values without quotes", () => {
      expect(formatCSVField(null)).toBe("");
      expect(formatCSVField(undefined)).toBe("");
      expect(formatCSVField(123)).toBe("123");
      expect(formatCSVField("Order123")).toBe("Order123");
      expect(formatCSVField("Completed")).toBe("Completed");
    });

    it("wraps values containing commas in double quotes (RFC-4180)", () => {
      expect(formatCSVField("2x Masala Dosa, 1x Chai")).toBe('"2x Masala Dosa, 1x Chai"');
    });

    it("escapes internal quotes by doubling them and wraps in quotes", () => {
      expect(formatCSVField('Chef\'s "Special" Dosa')).toBe('"Chef\'s ""Special"" Dosa"');
    });

    it("wraps values containing newlines in quotes", () => {
      expect(formatCSVField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(formatCSVField("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
    });
  });

  describe("generateOrdersCSV", () => {
    const testMenu: MenuItem[] = [
      { id: 1, name: "Masala Dosa", price: 80, category: "Meals", description: "Crispy dosa", veg: true, available: true, emoji: "🥞" },
      { id: 2, name: "Masala Chai", price: 20, category: "Beverages", description: "Hot masala chai", veg: true, available: true, emoji: "☕" },
      { id: 3, name: 'Chef\'s "Special" Thali, Deluxe', price: 150, category: "Meals", description: "Special royal thali", veg: true, available: true, emoji: "🍱" },
    ];

    it("generates correct header row with all specified accounting columns", () => {
      const csv = generateOrdersCSV([], testMenu);
      const lines = csv.split("\r\n");
      expect(lines[0]).toBe(
        "Order ID,Date & Timestamp,Items Summary,Subtotal (₹),Discount (₹),GST (₹),Total Paid (₹),Payment Method,Payment Status,Fulfillment Status"
      );
    });

    it("formats order rows with safe items summary, financial reconciliation, and status", () => {
      const orders: (Order & { paymentMethod?: string; paymentStatus?: string })[] = [
        {
          id: "ORD-991",
          placedAt: "2026-10-18T12:00:00.000Z",
          items: [
            { id: 1, qty: 2 }, // 2x 80 = 160
            { id: 2, qty: 1 }, // 1x 20 = 20 -> Subtotal = 180
          ],
          total: 189, // 180 + 5% GST (9) = 189
          status: "completed",
          paymentMethod: "upi",
          paymentStatus: "paid",
        },
      ];

      const csv = generateOrdersCSV(orders, testMenu);
      const lines = csv.split("\r\n");
      expect(lines).toHaveLength(2);

      const dataRow = lines[1];
      expect(dataRow).toContain("ORD-991");
      expect(dataRow).toContain("2026-10-18T12:00:00.000Z");
      // Items summary with comma is quoted
      expect(dataRow).toContain('"2x Masala Dosa, 1x Masala Chai"');
      expect(dataRow).toContain("180.00"); // Subtotal
      expect(dataRow).toContain("0.00");   // Discount
      expect(dataRow).toContain("9.00");   // GST (5%)
      expect(dataRow).toContain("189.00"); // Total Paid
      expect(dataRow).toContain("UPI");
      expect(dataRow).toContain("PAID");
      expect(dataRow).toContain("Completed");
    });

    it("properly escapes complex dish names containing both quotes and commas", () => {
      const orders: (Order & { paymentMethod?: string; paymentStatus?: string })[] = [
        {
          id: "ORD-992",
          placedAt: "2026-10-18T13:30:00.000Z",
          items: [{ id: 3, qty: 1 }],
          total: 157.5,
          status: "ready",
          paymentMethod: "wallet",
          paymentStatus: "paid",
        },
      ];

      const csv = generateOrdersCSV(orders, testMenu);
      // Items summary should safely escape internal quotes as "" and wrap whole summary in quotes
      expect(csv).toContain('""Special"" Thali');
      expect(csv).toContain("WALLET");
      expect(csv).toContain("Ready for Pickup");
    });

    it("calculates discounts when total paid reflects coupon deductions", () => {
      const orders: (Order & { paymentMethod?: string; paymentStatus?: string })[] = [
        {
          id: "ORD-COUPON",
          placedAt: "2026-10-18T14:00:00.000Z",
          items: [{ id: 1, qty: 3 }], // 3x 80 = 240 subtotal
          total: 199.5, // 240 - 50 discount = 190 + 5% GST (9.5) = 199.5
          status: "completed",
          paymentMethod: "counter",
          paymentStatus: "pending",
        },
      ];

      const csv = generateOrdersCSV(orders, testMenu);
      const dataRow = csv.split("\r\n")[1];
      expect(dataRow).toContain("240.00"); // Subtotal
      expect(dataRow).toContain("50.00");  // Discount
      expect(dataRow).toContain("9.50");   // GST
      expect(dataRow).toContain("199.50"); // Total Paid
      expect(dataRow).toContain("COUNTER");
      expect(dataRow).toContain("PENDING");
    });
  });

  describe("downloadCSV", () => {
    it("safely handles non-browser environments without errors", () => {
      const originalWindow = (globalThis as Record<string, unknown>).window;
      delete (globalThis as Record<string, unknown>).window;

      expect(() => downloadCSV("test.csv", "sample")).not.toThrow();

      (globalThis as Record<string, unknown>).window = originalWindow;
    });

    it("creates a blob, triggers an anchor click, and revokes object URL in browser environment", () => {
      vi.useFakeTimers();
      const mockClick = vi.fn();
      const mockLink = {
        setAttribute: vi.fn(),
        style: {},
        click: mockClick,
        parentNode: {
          removeChild: vi.fn(),
        },
      };
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      const originalDoc = (globalThis as Record<string, unknown>).document;
      (globalThis as Record<string, unknown>).document = {
        createElement: vi.fn((tag: string) => (tag === "a" ? mockLink : {})),
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
      };

      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-uuid");
      URL.revokeObjectURL = vi.fn();

      downloadCSV("test.csv", "Order ID,Total\n1,100");

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockLink.setAttribute).toHaveBeenCalledWith("download", "test.csv");
      expect(mockLink.setAttribute).toHaveBeenCalledWith("href", "blob:http://localhost/mock-uuid");
      expect(mockClick).toHaveBeenCalled();

      // Advance timers to trigger deferred cleanup
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-uuid");

      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      (globalThis as Record<string, unknown>).document = originalDoc;
      vi.useRealTimers();
    });
  });
});
