"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const bookRoutes = require("./routes/bookRoutes");
const orderRoutes = require("./routes/orderRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const app = express();
const PORT = Number(process.env.PORT) || 5000;

const uploadsDirectory = path.resolve(__dirname, "../uploads");
const booksUploadsDirectory = path.join(uploadsDirectory, "books");

// Ensure the upload destination exists before Multer tries to save files.
fs.mkdirSync(booksUploadsDirectory, { recursive: true });

app.disable("x-powered-by");

app.use(cors({
  origin: true,
  credentials: true
}));

// Helmet defaults are retained; this policy permits local book covers and
// the usual inline styles/scripts used by this existing frontend.
// If the project already has a carefully configured CSP, keep that policy.
app.use(helmet({
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Publicly serve uploaded book-cover files at /uploads/books/<filename>.
app.use("/uploads", express.static(uploadsDirectory, {
  dotfiles: "deny",
  index: false,
  fallthrough: true,
  maxAge: "1d"
}));

// Serve the existing client pages (including /admin/dashboard.html).
app.use(express.static(path.resolve(__dirname, "../client")));

// Health check used to confirm the server and database are reachable.
app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      message: "Bookshop API and database are healthy."
    });
  } catch (error) {
    next(error);
  }
});

// API routes.
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reports", reportRoutes);
// Unknown API endpoints should return JSON rather than an HTML page.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

// Central error handler. Avoid leaking stack traces or secrets to clients.
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  const status = Number(error.status || error.statusCode) || 500;
  res.status(status).json({
    success: false,
    message: status >= 500
      ? "An internal server error occurred."
      : (error.message || "Request failed.")
  });
});

const server = app.listen(PORT, () => {
  console.log(`Bookshop server running at http://localhost:${PORT}`);
});

// Graceful shutdown for local development and deployment.
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down bookshop server...`);
  server.close(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error("Error closing PostgreSQL pool:", error.message);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
