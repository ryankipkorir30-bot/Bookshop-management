const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Require an encrypted connection in production.
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: false
    }
  })
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error.message);
});

module.exports = pool;