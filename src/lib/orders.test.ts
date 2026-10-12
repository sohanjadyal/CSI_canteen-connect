import { describe, expect, it } from "vitest";
import { docToOrder } from "./orders";

describe("orders serialization and normalization", () => {
  it("normalizes a standard Firestore order document", () => {
    const rawData = {
      userId: "user-123",
      items: [
        { id: 1, qty: 2 },
        { id: 4, qty: 1 },
      ],
      totalBill: 250,
      status: "received",
      placedAt: "2026-10-12T10:00:00.000Z",
    };

    const order = docToOrder("doc-abc", rawData);
    expect(order.id).toBe("doc-abc");
    expect(order.total).toBe(250);
    expect(order.status).toBe("received");
    expect(order.items).toEqual([
      { id: 1, qty: 2 },
      { id: 4, qty: 1 },
    ]);
    expect(order.placedAt).toBe("2026-10-12T10:00:00.000Z");
  });

  it("handles Firestore Timestamp objects with toDate()", () => {
    const fakeTimestamp = {
      toDate: () => new Date("2026-10-12T12:30:00.000Z"),
    };
    const rawData = {
      userId: "user-456",
      items: [{ id: 2, qty: 3 }],
      totalBill: 120,
      status: "preparing",
      timestamp: fakeTimestamp,
    };

    const order = docToOrder("doc-xyz", rawData);
    expect(order.id).toBe("doc-xyz");
    expect(order.placedAt).toBe("2026-10-12T12:30:00.000Z");
    expect(order.status).toBe("preparing");
  });

  it("handles missing items or fallback total gracefully", () => {
    const rawData = {
      userId: "user-789",
      total: 80,
    };

    const order = docToOrder("doc-empty", rawData);
    expect(order.items).toEqual([]);
    expect(order.total).toBe(80);
    expect(order.status).toBe("received");
  });
});
