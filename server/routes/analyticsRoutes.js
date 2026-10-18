"use strict";

const express = require("express");
const router = express.Router();

// Keep these paths consistent with your existing project.
const pool = require("../config/db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
/*
 * GET /api/analytics/overview
 * Summary cards for the admin dashboard.
 */
router.get("/overview", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS total_orders,

        (SELECT COUNT(*)
         FROM orders
         WHERE created_at >= NOW() - INTERVAL '30 days'
        ) AS recent_orders,

        (SELECT COUNT(*)
         FROM orders
         WHERE order_status = 'pending'
        ) AS pending_orders,

        (SELECT COUNT(*)
         FROM orders
         WHERE order_status = 'processing'
        ) AS processing_orders,

        (SELECT COUNT(*) FROM books) AS total_books,

        (SELECT COALESCE(SUM(stock_quantity), 0)
         FROM books
        ) AS stock_units,

        (SELECT COUNT(*)
         FROM books
         WHERE is_published = TRUE
           AND stock_quantity <= 5
        ) AS low_stock_books,

        (SELECT COALESCE(SUM(p.amount), 0)
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.status = 'completed'
           AND p.created_at >= NOW() - INTERVAL '30 days'
           AND o.order_status <> 'cancelled'
        ) AS paid_revenue_30d,

        (SELECT COALESCE(SUM(oi.quantity), 0)
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.payment_status = 'paid'
           AND o.order_status <> 'cancelled'
           AND o.created_at >= NOW() - INTERVAL '30 days'
        ) AS books_sold_30d
    `);

    const row = result.rows[0];

    res.json({
      success: true,
      overview: {
        totalOrders: Number(row.total_orders),
        recentOrders: Number(row.recent_orders),
        pendingOrders: Number(row.pending_orders),
        processingOrders: Number(row.processing_orders),
        totalBooks: Number(row.total_books),
        stockUnits: Number(row.stock_units),
        lowStockBooks: Number(row.low_stock_books),
        paidRevenue30d: Number(row.paid_revenue_30d),
        booksSold30d: Number(row.books_sold_30d)
      },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load dashboard overview."
    });
  }
});

/*
 * GET /api/analytics/sales?period=day
 * GET /api/analytics/sales?period=month
 * GET /api/analytics/sales?period=year
 *
 * Daily: last 30 days
 * Monthly: last 12 months
 * Yearly: last 5 years
 */
router.get("/sales", requireAuth, requireAdmin, async (req, res) => {
  try {
    const period = String(req.query.period || "day").toLowerCase();

    const settings = {
      day: { interval: "30 days", bucket: "day" },
      month: { interval: "12 months", bucket: "month" },
      year: { interval: "5 years", bucket: "year" }
    };

    if (!settings[period]) {
      return res.status(400).json({
        success: false,
        message: "Period must be day, month, or year."
      });
    }

    const { interval, bucket } = settings[period];

    const result = await pool.query(`
      WITH paid_orders AS (
        SELECT
          order_id,
          MIN(created_at) AS paid_at,
          SUM(amount) AS amount
        FROM payments
        WHERE status = 'completed'
        GROUP BY order_id
      ),
      date_series AS (
        SELECT generate_series(
          date_trunc('${bucket}', NOW() - INTERVAL '${interval}'),
          date_trunc('${bucket}', NOW()),
          INTERVAL '1 ${bucket}'
        ) AS period_start
      ),
      revenue_by_period AS (
        SELECT
          date_trunc('${bucket}', p.paid_at) AS period_start,
          SUM(p.amount) AS revenue,
          COUNT(*) AS paid_orders
        FROM paid_orders p
        JOIN orders o ON o.id = p.order_id
        WHERE p.paid_at >= NOW() - INTERVAL '${interval}'
          AND o.order_status <> 'cancelled'
          AND o.payment_status = 'paid'
        GROUP BY date_trunc('${bucket}', p.paid_at)
      ),
      books_by_period AS (
        SELECT
          date_trunc('${bucket}', p.paid_at) AS period_start,
          COALESCE(SUM(oi.quantity), 0) AS books_sold
        FROM paid_orders p
        JOIN orders o ON o.id = p.order_id
        JOIN order_items oi ON oi.order_id = o.id
        WHERE p.paid_at >= NOW() - INTERVAL '${interval}'
          AND o.order_status <> 'cancelled'
          AND o.payment_status = 'paid'
        GROUP BY date_trunc('${bucket}', p.paid_at)
      ),
      sales_by_period AS (
        SELECT
          r.period_start,
          r.revenue,
          r.paid_orders,
          COALESCE(b.books_sold, 0) AS books_sold
        FROM revenue_by_period r
        LEFT JOIN books_by_period b
          ON b.period_start = r.period_start
      )
      SELECT
        ds.period_start AS date,
        COALESCE(s.revenue, 0) AS revenue,
        COALESCE(s.books_sold, 0) AS "booksSold",
        COALESCE(s.paid_orders, 0) AS "paidOrders"
      FROM date_series ds
      LEFT JOIN sales_by_period s
        ON s.period_start = ds.period_start
      ORDER BY ds.period_start ASC
    `);

    const sales = result.rows.map(row => ({
      date: row.date,
      revenue: Number(row.revenue),
      booksSold: Number(row.booksSold),
      paidOrders: Number(row.paidOrders)
    }));

    const totals = sales.reduce((sum, row) => ({
      revenue: sum.revenue + row.revenue,
      booksSold: sum.booksSold + row.booksSold,
      paidOrders: sum.paidOrders + row.paidOrders
    }), { revenue: 0, booksSold: 0, paidOrders: 0 });

    res.json({
      success: true,
      period,
      description: `Sales summary for the selected ${period} view.`,
      totals,
      sales,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Sales analytics error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load sales analytics."
    });
  }
});


/*
 * GET /api/analytics/sales-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns paid sales and order details for a selected date range.
 */
router.get("/sales-range", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const validDate = value =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value;

    if (!validDate(startDate) || !validDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Provide valid startDate and endDate in YYYY-MM-DD format."
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "The start date must not be after the end date."
      });
    }

    const result = await pool.query(`
      SELECT
        o.id,
        o.order_number,
        o.customer_name,
        o.created_at,
        o.payment_status,
        o.order_status,
        o.total_amount
      FROM orders o
      WHERE o.created_at >= $1::date
        AND o.created_at < ($2::date + INTERVAL '1 day')
        AND o.payment_status = 'paid'
        AND o.order_status <> 'cancelled'
      ORDER BY o.created_at DESC
    `, [startDate, endDate]);

    const orders = result.rows.map(row => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      createdAt: row.created_at,
      paymentStatus: row.payment_status,
      orderStatus: row.order_status,
      totalAmount: Number(row.total_amount)
    }));

    const totalRevenue = orders.reduce(
      (sum, order) => sum + order.totalAmount, 0
    );

    res.json({
      success: true,
      startDate,
      endDate,
      summary: {
        paidOrders: orders.length,
        totalRevenue: Number(totalRevenue.toFixed(2))
      },
      orders,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Custom sales report error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to generate the custom sales report."
    });
  }
});

module.exports = router;