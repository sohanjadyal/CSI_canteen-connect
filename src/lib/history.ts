import type { CartLine } from "./cart";
import type { MenuItem } from "./menu";

export type PaymentMethod = "counter" | "upi" | "wallet";
export type PaymentStatus = "pending" | "paid";

export interface Order {
  id: string;
  items: CartLine[];
  total: number;
  placedAt: string;
  status?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
}

function normalizeCartLine(value: unknown): CartLine | null {
  if (!value || typeof value !== "object") return null;
  const line = value as Record<string, unknown>;
  if (!Number.isInteger(line.id) || !Number.isInteger(line.qty) || (line.qty as number) <= 0) return null;
  return { id: line.id as number, qty: line.qty as number };
}

export function normalizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCartLine).filter((line): line is CartLine => line !== null);
}

function normalizeOrder(value: unknown): Order | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  if (
    typeof order.id !== "string" ||
    typeof order.total !== "number" ||
    !Number.isFinite(order.total) ||
    typeof order.placedAt !== "string" ||
    Number.isNaN(Date.parse(order.placedAt)) ||
    !Array.isArray(order.items)
  ) {
    return null;
  }

  const items = normalizeCart(order.items);
  if (items.length === 0) return null;
  const status = typeof order.status === "string" ? order.status : undefined;
  const paymentMethod =
    order.paymentMethod === "counter" || order.paymentMethod === "upi" || order.paymentMethod === "wallet"
      ? (order.paymentMethod as PaymentMethod)
      : undefined;
  const paymentStatus =
    order.paymentStatus === "pending" || order.paymentStatus === "paid"
      ? (order.paymentStatus as PaymentStatus)
      : undefined;

  return {
    id: order.id,
    items,
    total: order.total,
    placedAt: order.placedAt,
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
  };
}

export function newestFirst(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
}

export function parseHistory(raw: string | null): Order[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return newestFirst(parsed.map(normalizeOrder).filter((order): order is Order => order !== null));
  } catch {
    return [];
  }
}

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    return normalizeCart(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function createOrder(
  id: string,
  items: CartLine[],
  total: number,
  placedAt: string,
  status?: string,
  paymentMethod?: PaymentMethod,
  paymentStatus?: PaymentStatus
): Order {
  return {
    id,
    items: items.map((line) => ({ ...line })),
    total,
    placedAt,
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
  };
}

export function addOrder(history: Order[], order: Order): Order[] {
  return newestFirst([...history, { ...order, items: order.items.map((line) => ({ ...line })) }]);
}

export function mergeOrders(...histories: Order[][]): Order[] {
  const ordersById = new Map<string, Order>();

  for (const history of histories) {
    for (const order of history) {
      ordersById.set(order.id, { ...order, items: order.items.map((line) => ({ ...line })) });
    }
  }

  const merged = newestFirst([...ordersById.values()]);
  const current = histories[0];
  if (
    current &&
    merged.length === current.length &&
    merged.every((order, index) => {
      const existing = current[index];
      return (
        order.id === existing.id &&
        order.total === existing.total &&
        order.placedAt === existing.placedAt &&
        order.status === existing.status &&
        order.paymentMethod === existing.paymentMethod &&
        order.paymentStatus === existing.paymentStatus &&
        order.items.length === existing.items.length &&
        order.items.every((line, itemIndex) => {
          const existingLine = existing.items[itemIndex];
          return line.id === existingLine.id && line.qty === existingLine.qty;
        })
      );
    })
  ) {
    return current;
  }
  return merged;
}

export function orderToCart(order: Order, menu?: MenuItem[]): CartLine[] {
  if (!menu) {
    return order.items.map((line) => ({ ...line }));
  }
  return order.items
    .filter((line) => {
      const item = menu.find((menuItem) => menuItem.id === line.id);
      return item ? item.available : false;
    })
    .map((line) => ({ ...line }));
}
