import { describe, expect, it } from "vitest";
import {
  calculateAnalyticsMetrics,
  getEffectiveMenu,
  getNextStatus,
  isSameDay,
  isValidStatusTransition,
  normalizeOrderStatus,
} from "./admin";
import { isAdminEmail, getAdminEmails } from "./auth-validation";
import type { Order } from "./history";
import type { MenuItem } from "./menu";

describe("admin authorization (RBAC)", () => {
  it("identifies default staff/admin emails", () => {
    expect(isAdminEmail("canteen@spit.ac.in")).toBe(true);
    expect(isAdminEmail("admin@spit.ac.in")).toBe(true);
    expect(isAdminEmail("staff@spit.ac.in")).toBe(true);
    expect(isAdminEmail("canteenadmin@spit.ac.in")).toBe(true);
  });

  it("handles case-insensitivity and trimming in admin emails", () => {
    expect(isAdminEmail(" CANTEEN@SPIT.AC.IN ")).toBe(true);
    expect(isAdminEmail("Admin@Spit.Ac.In")).toBe(true);
  });

  it("rejects regular student emails from admin access", () => {
    expect(isAdminEmail("student@spit.ac.in")).toBe(false);
    expect(isAdminEmail("sohan.jadyal@spit.ac.in")).toBe(false);
    expect(isAdminEmail("random@gmail.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("returns list of default admin emails when env var is not set", () => {
    const emails = getAdminEmails();
    expect(emails).toContain("canteen@spit.ac.in");
    expect(emails).toContain("admin@spit.ac.in");
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
