import { useState } from "react";
import type { CartLine } from "../lib/cart";
import { MENU, type MenuItem } from "../lib/menu";
import { bestCouponFor, calculateBill, couponOptionsFor } from "../lib/pricing";
import { useAuth } from "../context/AuthContext";

interface Props {
  cart: CartLine[];
  menu?: MenuItem[];
  onChange: (id: number, delta: number) => void;
  onClose: () => void;
  onOrderPlaced: (total: number) => Promise<string | void> | void;
  onOpenAuth?: () => void;
}

export default function Cart({ cart, menu = MENU, onChange, onClose, onOrderPlaced, onOpenAuth }: Props) {
  const { user } = useAuth();
  const [coupon, setCoupon] = useState("");
  const [orderNumber, setOrderNumber] = useState<string | number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bill = calculateBill(cart, menu, coupon);
  const couponOptions = couponOptionsFor(bill.subtotal);
  const bestCoupon = bestCouponFor(bill.subtotal);

  async function placeOrder() {
    if (!user) {
      onOpenAuth?.();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const generatedOrderRef = await onOrderPlaced(bill.total);
      const displayId = generatedOrderRef
        ? (typeof generatedOrderRef === "string" && generatedOrderRef.length > 8
            ? generatedOrderRef.slice(0, 8)
            : generatedOrderRef)
        : Math.floor(1000 + Math.random() * 9000);
      setOrderNumber(displayId);
    } catch (err: unknown) {
      console.error("Order placement failed:", err);
      setError("Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>Your order</h2>
          <button className="close" onClick={onClose} aria-label="Close cart">×</button>
        </div>

        {orderNumber !== null ? (
          <div className="placed">
            <h3>Order #{orderNumber} placed</h3>
            <p>Pick it up at the counter in about 15 minutes.</p>
          </div>
        ) : cart.length === 0 ? (
          <p className="muted">Your cart is empty.</p>
        ) : (
          <>
            <ul className="lines">
              {cart.map((line) => {
                const item = menu.find((m) => m.id === line.id);
                if (!item) return null;
                return (
                  <li key={line.id}>
                    <span>{item.name}</span>
                    <div className="stepper">
                      <button onClick={() => onChange(line.id, -1)}>−</button>
                      <span>{line.qty}</span>
                      <button onClick={() => onChange(line.id, 1)}>+</button>
                    </div>
                    <span>₹{item.price * line.qty}</span>
                  </li>
                );
              })}
            </ul>

            <input
              className="coupon"
              placeholder="Coupon code"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              aria-label="Coupon code"
            />
            {bill.couponMessage && <p className="coupon-message">{bill.couponMessage}</p>}

            <section className="coupon-options" aria-labelledby="available-coupons">
              <div className="coupon-options-header">
                <h3 id="available-coupons">Available coupons</h3>
                {bestCoupon && (
                  <button onClick={() => setCoupon(bestCoupon.code)}>Apply best</button>
                )}
              </div>
              <ul>
                {couponOptions.map((option) => {
                  const applied = coupon.trim().toUpperCase() === option.code;
                  return (
                    <li key={option.code}>
                      <div>
                        <strong>{option.code}</strong>
                        <span>{option.description}</span>
                        <small>
                          {option.eligible ? `Save ₹${option.discount}` : `Add ₹${option.amountNeeded} more`}
                        </small>
                      </div>
                      <button
                        disabled={!option.eligible || applied}
                        onClick={() => setCoupon(option.code)}
                      >
                        {applied ? "Applied" : "Apply"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <dl className="bill">
              <dt>Subtotal</dt><dd>₹{bill.subtotal}</dd>
              {bill.discount > 0 && (<><dt>Discount</dt><dd>−₹{bill.discount}</dd></>)}
              <dt>Delivery</dt><dd>{bill.delivery === 0 ? "Free" : `₹${bill.delivery}`}</dd>
              <dt>GST (5%)</dt><dd>₹{bill.gst.toFixed(2)}</dd>
              <dt className="total">Total</dt><dd className="total">₹{bill.total.toFixed(2)}</dd>
            </dl>

            {error && <p className="auth-error" style={{ marginBottom: "12px" }}>{error}</p>}

            {!user ? (
              <div className="checkout-auth-prompt">
                <p>🔒 College ID required to place order</p>
                <button
                  type="button"
                  className="place-order auth-required-btn"
                  onClick={onOpenAuth}
                >
                  Log in to Place Order
                </button>
              </div>
            ) : (
              <button
                className="place-order"
                onClick={placeOrder}
                disabled={submitting}
              >
                {submitting ? "Placing order..." : "Place order"}
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
