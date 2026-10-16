import { useState } from "react";
import type { Order } from "../../lib/history";
import { MENU, type MenuItem } from "../../lib/menu";
import {
  getNextStatus,
  normalizeOrderStatus,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  updateOrderStatus,
  type OrderStatus,
} from "../../lib/admin";

interface Props {
  orders: Order[];
  menu?: MenuItem[];
}

export default function KitchenQueue({ orders, menu = MENU }: Props) {
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Status counts for tab badges
  const counts = {
    all: orders.length,
    active: orders.filter((o) => {
      const s = normalizeOrderStatus(o.status);
      return s === "received" || s === "preparing" || s === "ready";
    }).length,
    received: orders.filter((o) => normalizeOrderStatus(o.status) === "received").length,
    preparing: orders.filter((o) => normalizeOrderStatus(o.status) === "preparing").length,
    ready: orders.filter((o) => normalizeOrderStatus(o.status) === "ready").length,
    completed: orders.filter((o) => normalizeOrderStatus(o.status) === "completed").length,
    cancelled: orders.filter((o) => normalizeOrderStatus(o.status) === "cancelled").length,
  };

  const filteredOrders = orders.filter((order) => {
    const status = normalizeOrderStatus(order.status);
    if (filterStatus === "active") {
      if (status !== "received" && status !== "preparing" && status !== "ready") return false;
    } else if (filterStatus !== "all" && status !== filterStatus) {
      return false;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const matchesId = order.id.toLowerCase().includes(query);
      const matchesItem = order.items.some((line) => {
        const item = menu.find((m) => m.id === line.id);
        return item && item.name.toLowerCase().includes(query);
      });
      return matchesId || matchesItem;
    }

    return true;
  });

  async function handleAdvanceStatus(orderId: string, currentStatus?: string) {
    const next = getNextStatus(currentStatus);
    if (!next) return;
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, next);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSetStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
    } finally {
      setUpdatingId(null);
    }
  }

  function getNextActionLabel(status?: string): string | null {
    const s = normalizeOrderStatus(status);
    switch (s) {
      case "received":
        return "🍳 Start Preparing";
      case "preparing":
        return "🔔 Mark as Ready";
      case "ready":
        return "✅ Complete Order";
      default:
        return null;
    }
  }

  function formatTimeAgo(isoString: string): string {
    const time = Date.parse(isoString);
    if (Number.isNaN(time)) return "";
    const diffMins = Math.floor((Date.now() - time) / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 min ago";
    if (diffMins < 60) return `${diffMins} mins ago`;
    const hours = Math.floor(diffMins / 60);
    return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  }

  function isUrgent(isoString: string, status?: string): boolean {
    const s = normalizeOrderStatus(status);
    if (s === "completed" || s === "cancelled") return false;
    const time = Date.parse(isoString);
    if (Number.isNaN(time)) return false;
    return Date.now() - time > 15 * 60 * 1000; // >15 mins
  }

  return (
    <div className="kitchen-queue-container">
      <div className="kitchen-controls">
        <div className="kitchen-search-bar">
          <input
            type="search"
            placeholder="Search by order ID or dish name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search orders"
            className="admin-search-input"
          />
        </div>

        <div className="kitchen-status-tabs" role="tablist" aria-label="Order status filters">
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "active" ? "active" : ""}`}
            onClick={() => setFilterStatus("active")}
          >
            🔥 Active Queue
            <span className="tab-pill">{counts.active}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "received" ? "active" : ""}`}
            onClick={() => setFilterStatus("received")}
          >
            📥 Received
            <span className="tab-pill">{counts.received}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "preparing" ? "active" : ""}`}
            onClick={() => setFilterStatus("preparing")}
          >
            🍳 Preparing
            <span className="tab-pill">{counts.preparing}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "ready" ? "active" : ""}`}
            onClick={() => setFilterStatus("ready")}
          >
            🔔 Ready
            <span className="tab-pill">{counts.ready}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "completed" ? "active" : ""}`}
            onClick={() => setFilterStatus("completed")}
          >
            ✅ Completed
            <span className="tab-pill">{counts.completed}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "all" ? "active" : ""}`}
            onClick={() => setFilterStatus("all")}
          >
            All Orders
            <span className="tab-pill">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`kitchen-tab ${filterStatus === "cancelled" ? "active" : ""}`}
            onClick={() => setFilterStatus("cancelled")}
          >
            ❌ Cancelled
            <span className="tab-pill">{counts.cancelled}</span>
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="kitchen-empty-state">
          <span className="empty-icon">🍳</span>
          <h3>No orders in this view</h3>
          <p>
            {searchQuery
              ? "No orders match your search query."
              : "All caught up! New orders placed by students will appear here in real time."}
          </p>
        </div>
      ) : (
        <div className="kitchen-orders-grid">
          {filteredOrders.map((order) => {
            const status = normalizeOrderStatus(order.status);
            const urgent = isUrgent(order.placedAt, status);
            const nextAction = getNextActionLabel(status);
            const isBusy = updatingId === order.id;

            return (
              <article
                key={order.id}
                className={`kitchen-order-card status-border-${status} ${urgent ? "order-card-urgent" : ""}`}
              >
                <div className="kitchen-card-header">
                  <div>
                    <div className="order-number-row">
                      <span className="order-tag">
                        #{order.id.length > 8 ? order.id.slice(0, 8) : order.id}
                      </span>
                      <span className={`order-status-badge status-${status}`}>
                        {ORDER_STATUS_LABELS[status] || status}
                      </span>
                      {urgent && <span className="urgent-badge">⏳ Waiting &gt; 15m</span>}
                    </div>
                    <div className="order-meta-info">
                      <time dateTime={order.placedAt} title={new Date(order.placedAt).toLocaleString()}>
                        {formatTimeAgo(order.placedAt)} ({new Date(order.placedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                      </time>
                    </div>
                  </div>
                  <div className="order-total-badge">
                    <strong>₹{order.total.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="kitchen-card-items">
                  <span className="items-title">Items ({order.items.reduce((s, i) => s + i.qty, 0)}):</span>
                  <ul className="items-list">
                    {order.items.map((line) => {
                      const item = menu.find((m) => m.id === line.id);
                      return (
                        <li key={line.id} className="item-row">
                          <span className="item-qty">{line.qty} ×</span>
                          <span className="item-name">
                            {item?.emoji} {item?.name ?? `Item #${line.id}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="kitchen-card-actions">
                  <div className="action-buttons-group">
                    {nextAction && (
                      <button
                        type="button"
                        className={`btn-advance-status action-${status}`}
                        onClick={() => handleAdvanceStatus(order.id, status)}
                        disabled={isBusy}
                      >
                        {isBusy ? "Updating..." : nextAction}
                      </button>
                    )}

                    {status !== "completed" && status !== "cancelled" && (
                      <button
                        type="button"
                        className="btn-cancel-order"
                        onClick={() => handleSetStatus(order.id, "cancelled")}
                        disabled={isBusy}
                        title="Cancel this order"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="manual-status-selector">
                    <label htmlFor={`status-select-${order.id}`}>Status:</label>
                    <select
                      id={`status-select-${order.id}`}
                      value={status}
                      onChange={(e) => handleSetStatus(order.id, e.target.value)}
                      disabled={isBusy}
                      className="admin-select"
                    >
                      {ORDER_STATUS_FLOW.map((s) => (
                        <option key={s} value={s}>
                          {ORDER_STATUS_LABELS[s]}
                        </option>
                      ))}
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
