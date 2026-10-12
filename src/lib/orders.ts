import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CartLine } from "./cart";
import type { Order } from "./history";

export interface DatabaseOrder {
  id?: string;
  userId: string;
  items: CartLine[];
  totalBill: number;
  status: "received" | "preparing" | "ready" | "completed" | "cancelled" | string;
  timestamp: unknown;
  placedAt?: string;
}

/**
 * Pushes a new order document into the 'orders' Firestore collection.
 * Required fields per specification:
 * - userId
 * - items
 * - totalBill
 * - status: 'received'
 * - timestamp
 */
export async function saveOrderToDatabase(
  userId: string,
  items: CartLine[],
  totalBill: number
): Promise<string> {
  const placedAtIso = new Date().toISOString();
  const orderData = {
    userId,
    items: items.map((line) => ({ id: line.id, qty: line.qty })),
    totalBill,
    status: "received",
    timestamp: serverTimestamp(),
    placedAt: placedAtIso,
  };

  const docRef = await addDoc(collection(db, "orders"), orderData);
  return docRef.id;
}

/**
 * Normalizes a Firestore order document into the app's Order model
 */
export function docToOrder(id: string, data: Record<string, unknown>): Order {
  let placedAt = new Date().toISOString();
  if (data.placedAt && typeof data.placedAt === "string") {
    placedAt = data.placedAt;
  } else if (data.timestamp && typeof (data.timestamp as { toDate?: () => Date }).toDate === "function") {
    placedAt = (data.timestamp as { toDate: () => Date }).toDate().toISOString();
  } else if (typeof data.timestamp === "string") {
    placedAt = data.timestamp;
  }

  const items: CartLine[] = Array.isArray(data.items)
    ? data.items.map((line: Record<string, unknown>) => ({
        id: Number(line.id),
        qty: Number(line.qty),
      }))
    : [];

  const total = typeof data.totalBill === "number" ? data.totalBill : Number(data.total) || 0;

  return {
    id,
    items,
    total,
    placedAt,
    status: (data.status as string) || "received",
  };
}

/**
 * Subscribes to real-time order updates for a given user from Firestore
 */
export function subscribeUserOrders(
  userId: string,
  onOrders: (orders: Order[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  try {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("userId", "==", userId));

    return onSnapshot(
      q,
      (snapshot) => {
        const orders: Order[] = snapshot.docs.map((doc) =>
          docToOrder(doc.id, doc.data() as Record<string, unknown>)
        );
        // Sort newest first by placedAt
        orders.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
        onOrders(orders);
      },
      (error) => {
        console.warn("Firestore subscription error (falling back to local cache):", error);
        onError?.(error);
      }
    );
  } catch (err) {
    console.warn("Could not set up Firestore snapshot listener:", err);
    onError?.(err);
    return () => {};
  }
}
