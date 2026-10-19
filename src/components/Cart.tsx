import { useEffect, useState } from "react";
import type { CartLine } from "../lib/cart";
import { MENU, type MenuItem } from "../lib/menu";
import { bestCouponFor, calculateBill, couponOptionsFor } from "../lib/pricing";
import { useAuth } from "../context/AuthContext";
import type { PaymentMethod, PaymentStatus } from "../lib/orders";
import { buildUpiPaymentUri, generateUpiQrCode, getCanteenVpa } from "../lib/upi";

interface Props {
  cart: CartLine[];
  menu?: MenuItem[];
  onChange: (id: number, delta: number) => void;
  onClose: () => void;
  onOrderPlaced: (
    total: number,
    paymentMethod: PaymentMethod,
    paymentStatus: PaymentStatus
  ) => Promise<string | void> | void;
  onOpenAuth?: () => void;
}

export default function Cart({
  cart,
  menu = MENU,
  onChange,
  onClose,
  onOrderPlaced,
  onOpenAuth,
}: Props) {
  const { user } = useAuth();
  const [coupon, setCoupon] = useState("");
  const [orderNumber, setOrderNumber] = useState<string | number | null>(null);
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment workflow state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  const [upiUri, setUpiUri] = useState<string>("");
  const [tempTxnRef] = useState<string>(() => `CC${Date.now().toString().slice(-6)}`);

  const bill = calculateBill(cart, menu, coupon);
  const couponOptions = couponOptionsFor(bill.subtotal);
  const bestCoupon = bestCouponFor(bill.subtotal);

  const canteenVpa = getCanteenVpa();

  // Generate UPI URI & QR Code when bill or reference changes
  useEffect(() => {
    if (bill.total <= 0) return;

    const uri = buildUpiPaymentUri({
      vpa: canteenVpa,
      payeeName: "SPIT Canteen",
      amount: bill.total,
      transactionRef: tempTxnRef,
      note: `Canteen Connect Ref ${tempTxnRef}`,
    });

    setUpiUri(uri);

    let active = true;
    generateUpiQrCode(uri)
      .then((dataUrl) => {
        if (active) {
          setUpiQrDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.warn("Failed to generate UPI QR code:", err);
      });

    return () => {
      active = false;
    };
  }, [bill.total, tempTxnRef]);

  async function placeOrder() {
    if (!user) {
      onOpenAuth?.();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Both UPI and Counter orders are placed with paymentStatus: "pending"
      // Canteen staff verifies and marks the order as paid upon food pickup
      const paymentStatus: PaymentStatus = "pending";
      const generatedOrderRef = await onOrderPlaced(bill.total, paymentMethod, paymentStatus);
      const displayId = generatedOrderRef
        ? typeof generatedOrderRef === "string" && generatedOrderRef.length > 8
          ? generatedOrderRef.slice(0, 8)
          : generatedOrderRef
        : Math.floor(1000 + Math.random() * 9000);
      setConfirmedPaymentMethod(paymentMethod);
      setOrderNumber(displayId);
    } catch (err: unknown) {
      console.error("Order placement failed:", err);
      if (err instanceof Error) {
        setError(err.message || "Failed to place order. Please try again.");
      } else {
        setError("Failed to place order. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>Your order</h2>
          <button className="close" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </div>

        {orderNumber !== null ? (
          <div className="placed">
            <span className="order-success-icon">🎉</span>
            <h3>Order #{orderNumber} placed!</h3>

            <div className="placed-payment-pill">
              {confirmedPaymentMethod === "upi" && (
                <span className="payment-tag tag-upi">
                  ⚡ UPI Payment: ₹{bill.total.toFixed(2)} (Verify at counter)
                </span>
              )}
              {confirmedPaymentMethod === "counter" && (
                <span className="payment-tag tag-counter">
                  🟡 Pay ₹{bill.total.toFixed(2)} at Counter upon pickup
                </span>
              )}
            </div>

            <p>Pick it up at the counter in about 15 minutes.</p>
            <button className="place-order" onClick={onClose} style={{ marginTop: "16px" }}>
              Back to Menu
            </button>
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
                          {option.eligible
                            ? `Save ₹${option.discount}`
                            : `Add ₹${option.amountNeeded} more`}
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
              <dt>Subtotal</dt>
              <dd>₹{bill.subtotal}</dd>
              {bill.discount > 0 && (
                <>
                  <dt>Discount</dt>
                  <dd>−₹{bill.discount}</dd>
                </>
              )}
              <dt>Delivery</dt>
              <dd>{bill.delivery === 0 ? "Free" : `₹${bill.delivery}`}</dd>
              <dt>GST (5%)</dt>
              <dd>₹{bill.gst.toFixed(2)}</dd>
              <dt className="total">Total</dt>
              <dd className="total">₹{bill.total.toFixed(2)}</dd>
            </dl>

            {/* Payment Method Selector */}
            <div className="checkout-payment-section">
              <h3 className="payment-section-title">Payment Method</h3>
              <div className="payment-options-grid" role="radiogroup" aria-label="Select payment method">
                {/* Option 1: Instant UPI QR */}
                <label
                  className={`payment-option-card ${paymentMethod === "upi" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="upi"
                    checked={paymentMethod === "upi"}
                    onChange={() => {
                      setPaymentMethod("upi");
                      setError(null);
                    }}
                  />
                  <div className="payment-card-content">
                    <div className="payment-card-title-row">
                      <span className="payment-icon">⚡</span>
                      <strong>Instant UPI QR</strong>
                    </div>
                    <span className="payment-desc">Scan dynamic QR code</span>
                    <span className="payment-vpa-pill">{canteenVpa}</span>
                  </div>
                </label>

                {/* Option 2: Pay at Counter */}
                <label
                  className={`payment-option-card ${paymentMethod === "counter" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="counter"
                    checked={paymentMethod === "counter"}
                    onChange={() => {
                      setPaymentMethod("counter");
                      setError(null);
                    }}
                  />
                  <div className="payment-card-content">
                    <div className="payment-card-title-row">
                      <span className="payment-icon">💵</span>
                      <strong>Pay at Counter</strong>
                    </div>
                    <span className="payment-desc">Cash or POS at pickup</span>
                  </div>
                </label>
              </div>

              {/* Dynamic Payment Method Details Panel */}
              <div className="payment-method-details-panel">
                {paymentMethod === "upi" && (
                  <div className="upi-details-box">
                    <div className="upi-qr-container">
                      {upiQrDataUrl ? (
                        <img
                          src={upiQrDataUrl}
                          alt="Dynamic UPI QR Code"
                          className="upi-qr-image"
                        />
                      ) : (
                        <div className="upi-qr-loading">Generating Dynamic UPI QR...</div>
                      )}
                      <div className="upi-qr-info">
                        <span className="upi-canteen-vpa">
                          VPA: <strong>{canteenVpa}</strong>
                        </span>
                        <span className="upi-amount-pill">
                          Amount: <strong>₹{bill.total.toFixed(2)}</strong>
                        </span>
                        <span className="upi-ref-tag">Order Ref: #{tempTxnRef}</span>
                      </div>
                    </div>

                    <div className="upi-mobile-action">
                      <a
                        href={upiUri}
                        className="btn-open-upi-app"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        📲 Pay via UPI App (GPay/PhonePe/Paytm)
                      </a>
                    </div>

                    <p className="upi-verify-notice">
                      ℹ️ Scan to pay via any UPI app. Show your transaction confirmation at the counter upon picking up your order.
                    </p>
                  </div>
                )}

                {paymentMethod === "counter" && (
                  <div className="counter-details-box">
                    <p className="counter-instructions">
                      🍽️ Place your order now. You will pay <strong>₹{bill.total.toFixed(2)}</strong> in
                      cash or via physical counter POS upon collecting your food.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="auth-error" style={{ marginBottom: "12px" }}>
                {error}
              </p>
            )}

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
                {submitting
                  ? "Placing order..."
                  : `Place order (₹${bill.total.toFixed(2)})`}
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
