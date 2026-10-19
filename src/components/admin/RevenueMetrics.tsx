import { useMemo, useState } from "react";
import type { Order } from "../../lib/history";
import { MENU, type MenuItem } from "../../lib/menu";
import {
  calculateAnalyticsMetrics,
  calculateHourlyDistribution,
  downloadCSV,
  generateOrdersCSV,
  isSameDay,
} from "../../lib/admin";

type ExportDateFilter = "today" | "week" | "all";

interface Props {
  orders: Order[];
  menu?: MenuItem[];
}

export default function RevenueMetrics({ orders, menu = MENU }: Props) {
  const [dateFilter, setDateFilter] = useState<ExportDateFilter>("today");
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const metrics = calculateAnalyticsMetrics(orders, menu);

  // Filter orders according to selected date range for export and hourly rush breakdown
  const filteredOrders = useMemo(() => {
    if (dateFilter === "today") {
      const today = new Date();
      return orders.filter((o) => {
        if (!o.placedAt) return false;
        const d = new Date(o.placedAt);
        return !Number.isNaN(d.getTime()) && isSameDay(d, today);
      });
    }
    if (dateFilter === "week") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return orders.filter((o) => {
        if (!o.placedAt) return false;
        const t = new Date(o.placedAt).getTime();
        return !Number.isNaN(t) && t >= sevenDaysAgo;
      });
    }
    return orders;
  }, [orders, dateFilter]);

  const hourlyRush = useMemo(() => {
    return calculateHourlyDistribution(filteredOrders);
  }, [filteredOrders]);

  const peakRushBucket = useMemo(() => {
    return hourlyRush.find((b) => b.isPeak);
  }, [hourlyRush]);

  const maxRushOrders = useMemo(() => {
    return Math.max(...hourlyRush.map((b) => b.orderCount), 1);
  }, [hourlyRush]);

  const totalRushOrdersInWindow = useMemo(() => {
    return hourlyRush.reduce((acc, b) => acc + b.orderCount, 0);
  }, [hourlyRush]);

  function handleExportCSV() {
    const filterLabels: Record<ExportDateFilter, string> = {
      today: "today",
      week: "past_7_days",
      all: "all_time",
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `canteen_sales_${filterLabels[dateFilter]}_${dateStr}.csv`;
    const csvContent = generateOrdersCSV(filteredOrders, menu);
    downloadCSV(filename, csvContent);

    setExportFeedback(`✓ Exported ${filteredOrders.length} records (${filterLabels[dateFilter]})`);
    setTimeout(() => setExportFeedback(null), 3500);
  }

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
      {/* Export Toolbar / Controls */}
      <div className="analytics-export-toolbar">
        <div className="export-toolbar-info">
          <span className="export-toolbar-title">📊 Operational Reports & Analytics</span>
          <span className="export-toolbar-subtitle">
            Showing {filteredOrders.length} of {orders.length} orders
          </span>
        </div>

        <div className="export-toolbar-actions">
          <div className="date-filter-group" role="group" aria-label="Report Date Filter">
            <button
              type="button"
              className={`date-filter-btn ${dateFilter === "today" ? "active" : ""}`}
              onClick={() => setDateFilter("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={`date-filter-btn ${dateFilter === "week" ? "active" : ""}`}
              onClick={() => setDateFilter("week")}
            >
              Past 7 Days
            </button>
            <button
              type="button"
              className={`date-filter-btn ${dateFilter === "all" ? "active" : ""}`}
              onClick={() => setDateFilter("all")}
            >
              All Time
            </button>
          </div>

          <button
            type="button"
            className="btn-export-csv"
            onClick={handleExportCSV}
            title="Download formatted RFC-4180 CSV sales report"
          >
            📥 Export Report (CSV)
          </button>
        </div>
      </div>

      {exportFeedback && (
        <div className="export-feedback-banner" role="status">
          <span>{exportFeedback}</span>
        </div>
      )}

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

      {/* Hourly Rush Volume Breakdown (08:00 - 18:00) */}
      <section className="analytics-section hourly-rush-section">
        <div className="section-header hourly-rush-header">
          <div>
            <h3>⏰ Hourly Rush Distribution (08:00 – 18:00)</h3>
            <span className="section-subtitle">
              Order volume & rush surge patterns across college lecture & break hours
            </span>
          </div>
          <div className="hourly-rush-badges">
            {peakRushBucket && peakRushBucket.orderCount > 0 ? (
              <span className="rush-badge peak-badge">
                🔥 Peak Rush: {peakRushBucket.label} ({peakRushBucket.orderCount} orders)
              </span>
            ) : (
              <span className="rush-badge normal-badge">Steady Flow (No acute surge)</span>
            )}
            <span className="rush-badge total-badge">
              Window Volume: {totalRushOrdersInWindow} orders
            </span>
          </div>
        </div>

        <div className="hourly-chart-container">
          <div className="hourly-chart-grid">
            {hourlyRush.map((bucket) => {
              const heightPercent =
                bucket.orderCount > 0
                  ? Math.max(Math.round((bucket.orderCount / maxRushOrders) * 100), 12)
                  : 4;

              return (
                <div
                  key={bucket.hour}
                  className={`hourly-bar-col ${bucket.isPeak ? "is-peak" : ""} ${
                    bucket.isCurrentHour ? "is-current" : ""
                  }`}
                >
                  <div className="bar-tooltip">
                    <strong>{bucket.orderCount} orders</strong>
                    <span>₹{bucket.revenue.toFixed(0)}</span>
                    {bucket.periodName && <small className="tooltip-period">{bucket.periodName}</small>}
                  </div>

                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: `${heightPercent}%` }}
                    >
                      {bucket.isPeak && <span className="bar-flame">🔥</span>}
                    </div>
                  </div>

                  <div className="bar-labels">
                    <span className="bar-time">
                      {String(bucket.hour).padStart(2, "0")}:00
                    </span>
                    {bucket.periodName ? (
                      <span className="bar-period-tag">{bucket.periodName}</span>
                    ) : (
                      <span className="bar-period-placeholder">&nbsp;</span>
                    )}
                    {bucket.isCurrentHour && <span className="bar-now-pill">NOW</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rush-advisory-box">
          <div className="advisory-icon">💡</div>
          <div className="advisory-content">
            <strong>Kitchen Batch Preparation Advisory:</strong>
            <p>
              College canteens experience acute surges during fixed lecture breaks: <strong>11:00 AM Morning Break</strong> and <strong>13:00 (1:15 PM) Lunch Peak</strong>.
              Kitchen staff should batch-prep high volume items (samosas, dosa batter, tea/chai) 20–30 minutes ahead of these peak windows to minimize student counter queues.
            </p>
          </div>
        </div>
      </section>

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

      {/* Payment Channels Breakdown */}
      <section className="analytics-section payment-analytics-section" style={{ marginTop: "20px" }}>
        <div className="section-header">
          <h3>💳 Payment Channels & Settlement</h3>
          <span className="section-subtitle">Revenue and volume by checkout method</span>
        </div>

        <div className="payment-channels-grid">
          <div className="channel-card channel-upi">
            <div className="channel-icon">⚡</div>
            <div className="channel-info">
              <h4>Instant UPI QR</h4>
              <div className="channel-revenue">₹{(metrics.revenueByPaymentMethod?.upi || 0).toFixed(2)}</div>
              <span className="channel-orders">{metrics.ordersByPaymentMethod?.upi || 0} orders</span>
            </div>
          </div>

          <div className="channel-card channel-counter">
            <div className="channel-icon">💵</div>
            <div className="channel-info">
              <h4>Pay at Counter</h4>
              <div className="channel-revenue">₹{(metrics.revenueByPaymentMethod?.counter || 0).toFixed(2)}</div>
              <span className="channel-orders">
                {metrics.ordersByPaymentMethod?.counter || 0} orders
                {metrics.pendingCounterRevenue > 0 && ` (₹${metrics.pendingCounterRevenue.toFixed(0)} pending pickup)`}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
