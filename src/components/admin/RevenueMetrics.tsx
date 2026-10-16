import type { Order } from "../../lib/history";
import { MENU, type MenuItem } from "../../lib/menu";
import { calculateAnalyticsMetrics } from "../../lib/admin";

interface Props {
  orders: Order[];
  menu?: MenuItem[];
}

export default function RevenueMetrics({ orders, menu = MENU }: Props) {
  const metrics = calculateAnalyticsMetrics(orders, menu);

  const maxSold = metrics.topSellers.length > 0 ? metrics.topSellers[0].quantitySold : 1;

  const totalStatusCount = metrics.totalOrdersCount || 1;
  const statusPercentages = {
    received: Math.round(((metrics.ordersByStatus.received || 0) / totalStatusCount) * 100),
    preparing: Math.round(((metrics.ordersByStatus.preparing || 0) / totalStatusCount) * 100),
    ready: Math.round(((metrics.ordersByStatus.ready || 0) / totalStatusCount) * 100),
    completed: Math.round(((metrics.ordersByStatus.completed || 0) / totalStatusCount) * 100),
    cancelled: Math.round(((metrics.ordersByStatus.cancelled || 0) / totalStatusCount) * 100),
  };

  return (
    <div className="analytics-container">
      {/* KPI Highlight Cards */}
      <div className="analytics-kpi-grid">
        <div className="kpi-card highlight-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <span className="kpi-label">Today's Revenue</span>
            <div className="kpi-value">₹{metrics.todayRevenue.toFixed(2)}</div>
            <span className="kpi-subtext">From orders completed today</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">📈</div>
          <div className="kpi-content">
            <span className="kpi-label">Total Revenue</span>
            <div className="kpi-value">₹{metrics.totalRevenue.toFixed(2)}</div>
            <span className="kpi-subtext">All-time completed sales</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">📦</div>
          <div className="kpi-content">
            <span className="kpi-label">Today's Order Volume</span>
            <div className="kpi-value">{metrics.todayOrdersCount}</div>
            <span className="kpi-subtext">
              {metrics.pendingOrdersCount} currently in kitchen queue
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">🏷️</div>
          <div className="kpi-content">
            <span className="kpi-label">Average Order Value (AOV)</span>
            <div className="kpi-value">₹{metrics.averageOrderValue.toFixed(2)}</div>
            <span className="kpi-subtext">Per completed order</span>
          </div>
        </div>
      </div>

      <div className="analytics-two-columns">
        {/* Top Sellers Table / Ranking */}
        <section className="analytics-section">
          <div className="section-header">
            <h3>🔥 Top Selling Dishes</h3>
            <span className="section-subtitle">Ranked by order volume</span>
          </div>

          {metrics.topSellers.length === 0 ? (
            <p className="empty">No sales recorded yet. Completed orders will appear here.</p>
          ) : (
            <div className="top-sellers-list">
              {metrics.topSellers.slice(0, 8).map((item, index) => {
                const percentage = Math.round((item.quantitySold / maxSold) * 100);
                return (
                  <div key={item.id} className="top-seller-row">
                    <span className="seller-rank">#{index + 1}</span>
                    <span className="seller-emoji">{item.emoji}</span>
                    <div className="seller-info">
                      <div className="seller-name-row">
                        <strong>{item.name}</strong>
                        <span className="seller-category-tag">{item.category}</span>
                      </div>
                      <div className="seller-bar-track">
                        <div
                          className="seller-bar-fill"
                          style={{ width: `${Math.max(percentage, 8)}%` }}
                        />
                      </div>
                    </div>
                    <div className="seller-stats">
                      <span className="seller-qty">{item.quantitySold} sold</span>
                      <span className="seller-rev">₹{item.totalRevenue.toFixed(0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Order Fulfillment Breakdown */}
        <section className="analytics-section">
          <div className="section-header">
            <h3>📊 Queue & Fulfillment Status</h3>
            <span className="section-subtitle">Live breakdown across {metrics.totalOrdersCount} orders</span>
          </div>

          <div className="distribution-bar">
            {statusPercentages.received > 0 && (
              <div
                className="dist-segment dist-received"
                style={{ width: `${statusPercentages.received}%` }}
                title={`Received: ${metrics.ordersByStatus.received} (${statusPercentages.received}%)`}
              />
            )}
            {statusPercentages.preparing > 0 && (
              <div
                className="dist-segment dist-preparing"
                style={{ width: `${statusPercentages.preparing}%` }}
                title={`Preparing: ${metrics.ordersByStatus.preparing} (${statusPercentages.preparing}%)`}
              />
            )}
            {statusPercentages.ready > 0 && (
              <div
                className="dist-segment dist-ready"
                style={{ width: `${statusPercentages.ready}%` }}
                title={`Ready: ${metrics.ordersByStatus.ready} (${statusPercentages.ready}%)`}
              />
            )}
            {statusPercentages.completed > 0 && (
              <div
                className="dist-segment dist-completed"
                style={{ width: `${statusPercentages.completed}%` }}
                title={`Completed: ${metrics.ordersByStatus.completed} (${statusPercentages.completed}%)`}
              />
            )}
            {statusPercentages.cancelled > 0 && (
              <div
                className="dist-segment dist-cancelled"
                style={{ width: `${statusPercentages.cancelled}%` }}
                title={`Cancelled: ${metrics.ordersByStatus.cancelled} (${statusPercentages.cancelled}%)`}
              />
            )}
          </div>

          <ul className="status-legend-list">
            <li className="legend-item">
              <span className="legend-dot status-received" />
              <span className="legend-name">Received:</span>
              <strong>{metrics.ordersByStatus.received || 0}</strong>
              <small>({statusPercentages.received}%)</small>
            </li>
            <li className="legend-item">
              <span className="legend-dot status-preparing" />
              <span className="legend-name">Preparing:</span>
              <strong>{metrics.ordersByStatus.preparing || 0}</strong>
              <small>({statusPercentages.preparing}%)</small>
            </li>
            <li className="legend-item">
              <span className="legend-dot status-ready" />
              <span className="legend-name">Ready for Pickup:</span>
              <strong>{metrics.ordersByStatus.ready || 0}</strong>
              <small>({statusPercentages.ready}%)</small>
            </li>
            <li className="legend-item">
              <span className="legend-dot status-completed" />
              <span className="legend-name">Completed:</span>
              <strong>{metrics.ordersByStatus.completed || 0}</strong>
              <small>({statusPercentages.completed}%)</small>
            </li>
            <li className="legend-item">
              <span className="legend-dot status-cancelled" />
              <span className="legend-name">Cancelled:</span>
              <strong>{metrics.ordersByStatus.cancelled || 0}</strong>
              <small>({statusPercentages.cancelled}%)</small>
            </li>
          </ul>

          <div className="fulfillment-summary-box">
            <div className="summary-item">
              <span className="summary-label">Active Kitchen Workload</span>
              <strong className="summary-val">{metrics.pendingOrdersCount} orders</strong>
            </div>
            <div className="summary-item">
              <span className="summary-label">Completion Rate</span>
              <strong className="summary-val">
                {metrics.totalOrdersCount > 0
                  ? `${Math.round((metrics.completedOrdersCount / metrics.totalOrdersCount) * 100)}%`
                  : "0%"}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
