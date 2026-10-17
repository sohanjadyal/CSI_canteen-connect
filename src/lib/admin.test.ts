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
  getEffectiveMenu,
  getNextStatus,
  isSameDay,
  isValidStatusTransition,
  normalizeOrderStatus,
  setItemStockAvailable,
  updateOrderStatus,
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
});
