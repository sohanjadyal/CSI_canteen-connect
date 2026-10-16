import { useState } from "react";
import { CATEGORIES, type Category, type MenuItem } from "../../lib/menu";
import { setItemStockAvailable } from "../../lib/admin";

interface Props {
  menu: MenuItem[];
  onStockChanged?: () => void;
}

export default function MenuManager({ menu }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<Category | "All">("All");
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const filteredItems = menu.filter((item) => {
    if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const inStockCount = menu.filter((m) => m.available).length;
  const soldOutCount = menu.filter((m) => !m.available).length;

  async function handleToggleStock(item: MenuItem) {
    setTogglingId(item.id);
    const newStatus = !item.available;
    try {
      await setItemStockAvailable(item.id, newStatus);
      setFeedbackNotice(
        `${item.emoji} ${item.name} is now marked ${newStatus ? "IN STOCK" : "SOLD OUT"}.`
      );
      setTimeout(() => setFeedbackNotice(null), 3000);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="menu-manager-container">
      <div className="menu-manager-header">
        <div className="manager-title-group">
          <h3>Menu Stock Availability</h3>
          <p className="manager-subtitle">
            Toggle dishes as sold out in real time when ingredients run low. Changes reflect
            immediately for students placing orders.
          </p>
        </div>

        <div className="stock-summary-pills">
          <span className="stock-pill in-stock">
            ✅ {inStockCount} In Stock
          </span>
          <span className="stock-pill sold-out">
            ⛔ {soldOutCount} Sold Out
          </span>
        </div>
      </div>

      {feedbackNotice && (
        <div className="stock-toast-notice" role="status">
          <span>⚡ {feedbackNotice}</span>
        </div>
      )}

      <div className="manager-toolbar">
        <input
          type="search"
          placeholder="Filter dishes by name or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter dishes"
          className="admin-search-input"
        />

        <div className="category-filters" role="tablist">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`manager-cat-btn ${selectedCategory === c ? "active" : ""}`}
              onClick={() => setSelectedCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="empty">No menu items match your criteria.</p>
      ) : (
        <div className="menu-stock-grid">
          {filteredItems.map((item) => {
            const isBusy = togglingId === item.id;
            return (
              <div
                key={item.id}
                className={`menu-stock-card ${!item.available ? "card-is-sold-out" : ""}`}
              >
                <div className="stock-card-top">
                  <span className="stock-emoji">{item.emoji}</span>
                  <div className="stock-info">
                    <div className="stock-name-row">
                      <span
                        className={item.veg ? "dot veg" : "dot non-veg"}
                        title={item.veg ? "Veg" : "Non-veg"}
                      />
                      <h4>{item.name}</h4>
                    </div>
                    <span className="stock-meta">
                      {item.category} • ₹{item.price}
                    </span>
                  </div>
                </div>

                <p className="stock-desc">{item.description}</p>

                <div className="stock-card-footer">
                  <div className="stock-badge-col">
                    <span className={`status-pill ${item.available ? "pill-available" : "pill-sold-out"}`}>
                      {item.available ? "In Stock" : "Sold Out"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`btn-stock-toggle ${item.available ? "toggle-sold-out" : "toggle-in-stock"}`}
                    onClick={() => handleToggleStock(item)}
                    disabled={isBusy}
                  >
                    {isBusy
                      ? "Updating..."
                      : item.available
                      ? "Mark Sold Out"
                      : "Mark Available"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
