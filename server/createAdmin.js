
require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("./config/db");

async function createAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (
    !ADMIN_NAME ||
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD ||
    ADMIN_PASSWORD.length < 12
  ) {
    throw new Error(
      "Set ADMIN_NAME, ADMIN_EMAIL and a password of at least 12 characters in .env"
    );
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, role`,
    [ADMIN_NAME, ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
  );

  if (result.rowCount === 0) {
    console.log(
      "That email already exists. No account or password was changed."
    );
  } else {
    console.log("Administrator created:", result.rows[0]);
  }
}

createAdmin()
  .catch((error) => {
    console.error("Could not create administrator:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
