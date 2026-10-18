"use strict";

const express = require("express");
const pool = require("../config/db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// Protect every report endpoint: authenticated administrators only.
router.use(requireAuth, requireAdmin);

// Safely format CSV fields, including commas, quotes and newlines.
// Prefix formula-like values to reduce spreadsheet formula injection.
function csvCell(value) {
  let text = value == null ? "" : String(value);

  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

function sendCsv(res, filename, headers, rows) {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map(row => row.map(csvCell).join(","))
  ].join("\r\n");

  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  // UTF-8 BOM helps Excel recognize the character encoding.
  res.send("\uFEFF" + csv);
}

// GET /api/reports/books.csv
router.get("/books.csv", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, author, category, price, stock_quantity,
            is_published, created_at
     FROM books
     ORDER BY title ASC
     LIMIT 10000`
  );

  const headers = [
    "Book ID", "Title", "Author", "Category", "Price KES",
    "Stock Quantity", "Inventory Value KES", "Published", "Created At"
  ];

  const rows = result.rows.map(book => {
    const price = Number(book.price);
    const quantity = Number(book.stock_quantity);

    return [
      book.id,
      book.title,
      book.author,
      book.category,
      book.price,
      book.stock_quantity,
      Number.isFinite(price) && Number.isFinite(quantity)
        ? (price * quantity).toFixed(2)
        : "",
      book.is_published,
      book.created_at
    ];
  });

  sendCsv(res, "book-inventory-report.csv", headers, rows);
}));

// GET /api/reports/orders.csv
router.get("/orders.csv", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, order_number, customer_name, customer_email,
            customer_phone, subtotal, delivery_fee, total_amount,
            payment_method, payment_status, order_status, created_at
     FROM orders
     ORDER BY created_at DESC
     LIMIT 10000`
  );

  const headers = [
    "Order ID", "Order Number", "Customer Name", "Customer Email",
    "Customer Phone", "Subtotal KES", "Delivery Fee KES",
    "Total KES", "Payment Method", "Payment Status",
    "Order Status", "Created At"
  ];

  const rows = result.rows.map(order => [
    order.id,
    order.order_number,
    order.customer_name,
    order.customer_email,
    order.customer_phone,
    order.subtotal,
    order.delivery_fee,
    order.total_amount,
    order.payment_method,
    order.payment_status,
    order.order_status,
    order.created_at
  ]);

  sendCsv(res, "orders-report.csv", headers, rows);
}));

// GET /api/reports/deliveries.csv
router.get("/deliveries.csv", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, order_number, customer_name, customer_phone,
            delivery_method, delivery_address, order_status,
            delivery_latitude, delivery_longitude,
            delivery_current_latitude, delivery_current_longitude,
            delivery_location_sharing, delivery_location_updated_at,
            created_at
     FROM orders
     WHERE delivery_method = 'delivery'
     ORDER BY created_at DESC
     LIMIT 10000`
  );

  const headers = [
    "Order ID", "Order Number", "Customer Name", "Customer Phone",
    "Delivery Method", "Delivery Address", "Order Status",
    "Destination Latitude", "Destination Longitude",
    "Current Latitude", "Current Longitude",
    "Location Sharing Enabled", "Location Last Updated", "Order Created At"
  ];

  const rows = result.rows.map(order => [
    order.id,
    order.order_number,
    order.customer_name,
    order.customer_phone,
    order.delivery_method,
    order.delivery_address,
    order.order_status,
    order.delivery_latitude,
    order.delivery_longitude,
    order.delivery_current_latitude,
    order.delivery_current_longitude,
    order.delivery_location_sharing,
    order.delivery_location_updated_at,
    order.created_at
  ]);

  sendCsv(res, "deliveries-report.csv", headers, rows);
}));

module.exports = router;
