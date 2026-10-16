import { useEffect, useState } from "react";
import KitchenQueue from "./KitchenQueue";
import RevenueMetrics from "./RevenueMetrics";
import MenuManager from "./MenuManager";
import { useAuth } from "../../context/AuthContext";
import { subscribeAllOrders, subscribeMenuStock, getEffectiveMenu, type StockOverrides } from "../../lib/admin";
import { MENU, type MenuItem } from "../../lib/menu";
import type { Order } from "../../lib/history";
import { isFirebaseConfigured } from "../../lib/firebase";

interface Props {
  onBackToMenu: () => void;
  onOpenAuth?: (notice?: string) => void;
}

export type AdminTab = "kitchen" | "analytics" | "menu";

export default function AdminDashboard({ onBackToMenu, onOpenAuth }: Props) {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("kitchen");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockOverrides, setStockOverrides] = useState<StockOverrides>({});

  // Subscribe to all orders across all students
  useEffect(() => {
    const unsubOrders = subscribeAllOrders((allOrders) => {
      setOrders(allOrders);
    });

    const unsubStock = subscribeMenuStock((overrides) => {
      setStockOverrides(overrides);
    });

    return () => {
      unsubOrders();
      unsubStock();
    };
  }, []);

  const effectiveMenu: MenuItem[] = getEffectiveMenu(MENU, stockOverrides);

  // Guard: If not admin, show unauthorized access screen
  if (!isAdmin) {
    return (
      <div className="admin-unauthorized-guard">
        <div className="guard-card">
          <div className="guard-icon">🔒</div>
          <h2>Admin & Staff Access Restricted</h2>
          <p>
            The Canteen Staff Dashboard is restricted to verified canteen administration accounts
            ending with <code>@spit.ac.in</code> (e.g. <code>canteen@spit.ac.in</code> or{" "}
            <code>admin@spit.ac.in</code>).
          </p>

          {user ? (
            <div className="guard-logged-in-user">
              <span>
                Currently signed in as: <strong>{user.email}</strong> (Student Account)
              </span>
            </div>
          ) : null}

          <div className="guard-actions">
            <button
              type="button"
              className="btn-guard-login"
              onClick={() =>
                onOpenAuth?.(
                  "Please sign in with a verified staff email (@spit.ac.in) to access the staff panel."
                )
              }
            >
              Sign In as Staff
            </button>
            <button type="button" className="btn-guard-back" onClick={onBackToMenu}>
              Return to Student Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeOrdersCount = orders.filter((o) => {
    const s = (o.status || "received").toLowerCase();
    return s === "received" || s === "preparing" || s === "ready";
  }).length;

  return (
    <div className="admin-dashboard-container">
      {/* Top Banner / Staff Info */}
      <div className="admin-top-banner">
        <div className="admin-branding">
          <div className="admin-title-row">
            <h2>🍳 Canteen Staff Portal</h2>
            <span className="live-status-pill">
              <span className="pulse-dot" />
              {isFirebaseConfigured ? "Live Cloud Sync" : "Local Sync Mode"}
            </span>
          </div>
          <p className="admin-subtext">
            Live order fulfillment queue, kitchen controls & revenue analytics.
          </p>
        </div>

        <div className="admin-user-info">
          <span className="staff-pill" title={user?.email || ""}>
            🛡️ Staff: <strong>{user?.email?.split("@")[0]}</strong>
          </span>
          <button type="button" className="btn-exit-admin" onClick={onBackToMenu}>
            ← Back to Menu
          </button>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <nav className="admin-tabs" role="tablist" aria-label="Admin panel navigation">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "kitchen"}
          className={`admin-tab-btn ${activeTab === "kitchen" ? "active" : ""}`}
          onClick={() => setActiveTab("kitchen")}
        >
          🍳 Kitchen Queue
          {activeOrdersCount > 0 && <span className="admin-tab-counter">{activeOrdersCount}</span>}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "analytics"}
          className={`admin-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          📊 Revenue & Analytics
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "menu"}
          className={`admin-tab-btn ${activeTab === "menu" ? "active" : ""}`}
          onClick={() => setActiveTab("menu")}
        >
          📋 Menu Stock Control
        </button>
      </nav>

      {/* Tab Panels */}
      <div className="admin-content-panel">
        {activeTab === "kitchen" && <KitchenQueue orders={orders} menu={effectiveMenu} />}
        {activeTab === "analytics" && <RevenueMetrics orders={orders} menu={effectiveMenu} />}
        {activeTab === "menu" && <MenuManager menu={effectiveMenu} />}
      </div>
    </div>
  );
}
