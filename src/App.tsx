import { useEffect, useState } from "react";
import Cart from "./components/Cart";
import MenuCard from "./components/MenuCard";
import Orders from "./components/Orders";
import AuthModal from "./components/AuthModal";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { addToCart, changeQty, itemCount, type CartLine } from "./lib/cart";
import { addOrder, createOrder, orderToCart, parseCart, parseHistory, type Order } from "./lib/history";
import { CATEGORIES, filterMenu, MENU, sortMenu, type Category, type SortOrder } from "./lib/menu";
import { saveOrderToDatabase, subscribeUserOrders } from "./lib/orders";

const CART_KEY = "canteen-cart";
const ORDERS_KEY = "canteen-orders";

function CanteenApp() {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [vegOnly, setVegOnly] = useState(false);
  const [sort, setSort] = useState<SortOrder>("recommended");
  const [cart, setCart] = useState<CartLine[]>(() => parseCart(localStorage.getItem(CART_KEY)));
  const [orders, setOrders] = useState<Order[]>(() => parseHistory(localStorage.getItem(ORDERS_KEY)));
  const [cartOpen, setCartOpen] = useState(false);
  const [view, setView] = useState<"menu" | "orders">("menu");

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | undefined>();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }, [orders]);

  // Sync real-time orders from Firestore when user is logged in
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeUserOrders(
      user.uid,
      (remoteOrders) => {
        if (remoteOrders.length > 0) {
          setOrders(remoteOrders);
        }
      },
      (err) => {
        console.warn("Real-time orders sync error:", err);
      }
    );
    return () => unsubscribe();
  }, [user]);

  function openAuth(notice?: string, mode: "login" | "signup" = "login") {
    setAuthNotice(notice);
    setAuthMode(mode);
    setAuthModalOpen(true);
  }

  async function placeOrder(total: number): Promise<string> {
    if (!user) {
      openAuth("Please log in with your college email (@spit.ac.in) to place your order.");
      throw new Error("Authentication required");
    }

    const placedAt = new Date().toISOString();
    let orderId = String(Date.now());

    try {
      // Step 5: Save order to database collection 'orders'
      // containing: userId, items, totalBill, status: 'received', and timestamp
      const docId = await saveOrderToDatabase(user.uid, cart, total);
      if (docId) {
        orderId = docId;
      }
    } catch (err) {
      console.warn("Failed to push order to Firestore, recording locally:", err);
    }

    const order = createOrder(orderId, cart, total, placedAt, "received");
    setOrders((history) => addOrder(history, order));
    setCart([]);
    return orderId;
  }

  function reorder(order: Order) {
    setCart(orderToCart(order));
    setView("menu");
    setCartOpen(true);
  }

  const items = filterMenu(sortMenu(MENU, sort), { query, category, vegOnly });

  return (
    <>
      <header className="header">
        <h1>Canteen Connect</h1>
        <div className="header-actions">
          <button className="header-link" onClick={() => setView(view === "menu" ? "orders" : "menu")}>
            {view === "menu" ? "Orders" : "Menu"}
          </button>

          {user ? (
            <div className="header-auth">
              <span className="user-pill" title={user.email || ""}>
                👤 {user.email?.split("@")[0]}
              </span>
              <button className="auth-btn logout" onClick={() => logout()}>
                Log out
              </button>
            </div>
          ) : (
            <button className="auth-btn" onClick={() => openAuth()}>
              Log in
            </button>
          )}

          <button className="cart-button" onClick={() => setCartOpen(true)}>
            Cart <span className="badge">{itemCount(cart)}</span>
          </button>
        </div>
      </header>

      <main className="page">
        {view === "orders" ? (
          <Orders
            orders={orders}
            onReorder={reorder}
            userEmail={user?.email}
            onOpenAuth={() => openAuth("Sign in with your SPIT college email to view your synced orders.")}
          />
        ) : (
          <>
            <div className="toolbar">
              <input
                type="search"
                placeholder="Search dosa, chai, biryani..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the menu"
              />
              <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)} aria-label="Sort">
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
              <label className="veg-toggle">
                <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} />
                Veg only
              </label>
            </div>

            <nav className="tabs">
              {CATEGORIES.map((c) => (
                <button key={c} className={c === category ? "tab active" : "tab"} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </nav>

            {items.length === 0 ? (
              <p className="empty">Nothing matches that. Try another search.</p>
            ) : (
              <div className="grid">
                {items.map((item) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    qty={cart.find((l) => l.id === item.id)?.qty ?? 0}
                    onAdd={() => setCart(addToCart(cart, item.id))}
                    onChange={(delta) => setCart(changeQty(cart, item.id, delta))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {cartOpen && (
        <Cart
          cart={cart}
          onChange={(id, delta) => setCart(changeQty(cart, id, delta))}
          onClose={() => setCartOpen(false)}
          onOrderPlaced={placeOrder}
          onOpenAuth={() => openAuth("Please log in with your college email (@spit.ac.in) to place your order.")}
        />
      )}

      {authModalOpen && (
        <AuthModal
          initialMode={authMode}
          titleNotice={authNotice}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CanteenApp />
    </AuthProvider>
  );
}
