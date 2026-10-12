import type { CartLine } from "./cart";

export interface Order {
  id: string;
  items: CartLine[];
  total: number;
  placedAt: string;
  status?: string;
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
  return { id: order.id, items, total: order.total, placedAt: order.placedAt, ...(status ? { status } : {}) };
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
  status?: string
): Order {
  return {
    id,
    items: items.map((line) => ({ ...line })),
    total,
    placedAt,
    ...(status ? { status } : {}),
  };
}

export function addOrder(history: Order[], order: Order): Order[] {
  return newestFirst([...history, { ...order, items: order.items.map((line) => ({ ...line })) }]);
}

export function orderToCart(order: Order): CartLine[] {
  return order.items.map((line) => ({ ...line }));
}
