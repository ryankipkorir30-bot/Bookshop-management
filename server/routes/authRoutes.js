
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password ||
      password.length > 200
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email and password."
      });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role
       FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(500).json({
        success: false,
        message: "Server authentication is not configured."
      });
    }

    const token = jwt.sign(
      { id: String(user.id), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h", issuer: "chachapkorir-bookshop" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to sign in right now."
    });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({
        success: false,
        message: "Account not found."
      });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Account lookup error:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { full_name, email, password, phone } = req.body || {};

    if (
      typeof full_name !== "string" ||
      full_name.trim().length < 2 ||
      full_name.trim().length > 120
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter your full name (2–120 characters)."
      });
    }

    if (
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 200
    ) {
      return res.status(400).json({
        success: false,
        message: "Your password must contain 8–200 characters."
      });
    }

    if (
      phone != null &&
      (typeof phone !== "string" || phone.trim().length > 30)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid phone number."
      });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(500).json({
        success: false,
        message: "Server authentication is not configured."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (
         full_name, email, password_hash, phone, role
       )
       VALUES ($1, $2, $3, $4, 'customer')
       ON CONFLICT (email) DO NOTHING
       RETURNING id, full_name, email, role`,
      [
        full_name.trim(),
        normalizedEmail,
        passwordHash,
        phone ? phone.trim() : null
      ]
    );

    if (!result.rowCount) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      { id: String(user.id), role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "2h",
        issuer: "chachapkorir-bookshop"
      }
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to create your account right now."
    });
  }
});

module.exports = router;
