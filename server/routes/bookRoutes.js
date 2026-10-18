
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { requireAuth, requireAdmin } =
  require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

const uploadDir = path.join(__dirname, "../../uploads/books");

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// Public catalog: only published books
router.get("/", asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 100);
  const category = String(req.query.category || "").trim().slice(0, 100);

  const result = await pool.query(
    `SELECT id, title, author, category, description,
            price, stock_quantity, cover_image
     FROM books
     WHERE is_published = TRUE
       AND ($1 = '' OR title ILIKE '%' || $1 || '%'
            OR author ILIKE '%' || $1 || '%')
       AND ($2 = '' OR category = $2)
     ORDER BY created_at DESC
     LIMIT 100`,
    [search, category]
  );

  res.json({ success: true, books: result.rows });
}));

// Admin-only book creation with image validation
router.post(
  "/",
  requireAuth,
  requireAdmin,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    const { title, author, category, description, price, stock_quantity } =
      req.body;

    if (
      typeof title !== "string" || !title.trim() ||
      title.trim().length > 200 ||
      typeof author !== "string" || !author.trim() ||
      author.trim().length > 150
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid book title and author are required."
      });
    }

    const bookPrice = Number(price);
    const stock = Number(stock_quantity);

    if (
      price === "" || !Number.isFinite(bookPrice) ||
      bookPrice < 0 || bookPrice > 100000000 ||
      !Number.isInteger(stock) || stock < 0 ||
      stock > 1000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid price and whole-number stock quantity."
      });
    }

    if (typeof description === "string" && description.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Description must be 5,000 characters or fewer."
      });
    }

    let coverImage = null;
    let savedPath = null;

    const suppliedCover = String(req.body.cover_image || "").trim();

    // Cover image is optional. If supplied, accept only HTTP(S) URLs.
    if (suppliedCover && !req.file) {
      let parsedCover;
      try {
        parsedCover = new URL(suppliedCover);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Enter a complete image URL beginning with https:// or http://, or leave it blank."
        });
      }

      if (!["http:", "https:"].includes(parsedCover.protocol) ||
          !parsedCover.hostname.includes(".")) {
        return res.status(400).json({
          success: false,
          message: "Enter a complete public HTTP or HTTPS image URL, or leave it blank."
        });
      }

      coverImage = parsedCover.href;
    }

    if (req.file) {
      const { fileTypeFromBuffer } = await import("file-type");
      const detected = await fileTypeFromBuffer(req.file.buffer);

      const extensions = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
      };

      if (!detected || !extensions[detected.mime]) {
        return res.status(400).json({
          success: false,
          message: "Use a valid JPEG, PNG or WebP cover image."
        });
      }

      await fs.mkdir(uploadDir, { recursive: true });

      const filename = randomUUID() + extensions[detected.mime];
      savedPath = path.join(uploadDir, filename);

      await fs.writeFile(savedPath, req.file.buffer, { flag: "wx" });
      coverImage = `/uploads/books/${filename}`;
    }

    try {
      const result = await pool.query(
        `INSERT INTO books
         (title, author, category, description, price,
          stock_quantity, cover_image, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING *`,
        [
          title.trim(),
          author.trim(),
          typeof category === "string" ? category.trim().slice(0, 100) || null : null,
          typeof description === "string" ? description.trim() || null : null,
          bookPrice,
          stock,
          coverImage
        ]
      );

      res.status(201).json({
        success: true,
        message: "Book added to the catalog.",
        book: result.rows[0]
      });
    } catch (error) {
      if (savedPath) await fs.unlink(savedPath).catch(() => {});
      throw error;
    }
  })
);

// Admin catalog, including unpublished books
router.get(
  "/admin",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM books ORDER BY created_at DESC LIMIT 500"
    );

    res.json({ success: true, books: result.rows });
  })
);


// Admin-only book editing
router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
  const {
  title,
  author,
  category,
  description,
  price,
  cost_price,
  stock_quantity
} = req.body;

    if (!/^[1-9]\d{0,17}$/.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid book ID." });
    }

    if (
      typeof title !== "string" || !title.trim() || title.trim().length > 200 ||
      typeof author !== "string" || !author.trim() || author.trim().length > 150
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid book title and author are required."
      });
    }

    const bookPrice = Number(price);
    const stock = Number(stock_quantity);

    if (
      price === "" || price == null || !Number.isFinite(bookPrice) ||
      bookPrice < 0 || bookPrice > 100000000 ||
      stock_quantity === "" || stock_quantity == null ||
      !Number.isInteger(stock) || stock < 0 || stock > 1000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid price and whole-number stock quantity."
      });
    }

    if (category != null && (typeof category !== "string" || category.length > 100)) {
      return res.status(400).json({ success: false, message: "Category must be 100 characters or fewer." });
    }

    if (description != null && (typeof description !== "string" || description.length > 5000)) {
      return res.status(400).json({ success: false, message: "Description must be 5,000 characters or fewer." });
    }

    const existingResult = await pool.query(
      "SELECT * FROM books WHERE id = $1",
      [id]
    );

    if (!existingResult.rowCount) {
      return res.status(404).json({ success: false, message: "Book not found." });
    }

    const existing = existingResult.rows[0];
    let coverImage = existing.cover_image;
    let savedPath = null;
    let oldUploadedPath = null;

    const suppliedCover = String(req.body.cover_image || "").trim();

    if (req.file) {
      const { fileTypeFromBuffer } = await import("file-type");
      const detected = await fileTypeFromBuffer(req.file.buffer);
      const extensions = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
      };

      if (!detected || !extensions[detected.mime]) {
        return res.status(400).json({
          success: false,
          message: "Use a valid JPEG, PNG or WebP cover image."
        });
      }

      await fs.mkdir(uploadDir, { recursive: true });
      const filename = randomUUID() + extensions[detected.mime];
      savedPath = path.join(uploadDir, filename);
      await fs.writeFile(savedPath, req.file.buffer, { flag: "wx" });
      coverImage = `/uploads/books/${filename}`;
    } else if (suppliedCover) {
      let parsedCover;
      try {
        parsedCover = new URL(suppliedCover);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Enter a complete HTTP or HTTPS image URL."
        });
      }

      if (!["http:", "https:"].includes(parsedCover.protocol) ||
          !parsedCover.hostname.includes(".")) {
        return res.status(400).json({
          success: false,
          message: "Enter a complete public HTTP or HTTPS image URL."
        });
      }

      coverImage = parsedCover.href;
    }

    try {
  const costPriceInput = req.body.cost_price;
const costPrice =
  costPriceInput === "" || costPriceInput == null
    ? null
    : Number(costPriceInput);

if (
  costPriceInput !== "" &&
  costPriceInput != null &&
  (!Number.isFinite(costPrice) ||
    costPrice < 0 ||
    costPrice > 100000000)
) {
  return res.status(400).json({
    success: false,
    message: "Enter a valid cost price between KSh 0 and KSh 100,000,000."
  });
}

if (costPrice !== null && costPrice > bookPrice) {
  return res.status(400).json({
    success: false,
    message: "Cost price cannot exceed the selling price."
  });
}

const result = await pool.query(
  `INSERT INTO books
   (title, author, category, description, price, cost_price,
    stock_quantity, cover_image, is_published)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
   RETURNING *`,
  [
    title.trim(),
    author.trim(),
    typeof category === "string"
      ? category.trim().slice(0, 100) || null
      : null,
    typeof description === "string" ? description.trim() || null : null,
    bookPrice,
    costPrice,
    stock,
    coverImage
  ]
);

      if (savedPath && existing.cover_image &&
          existing.cover_image.startsWith("/uploads/books/")) {
        oldUploadedPath = path.join(
          uploadDir,
          path.basename(existing.cover_image)
        );
      }

      if (oldUploadedPath) await fs.unlink(oldUploadedPath).catch(() => {});

      return res.json({
        success: true,
        message: "Book updated successfully.",
        book: result.rows[0]
      });
    } catch (error) {
      if (savedPath) await fs.unlink(savedPath).catch(() => {});
      throw error;
    }
  })
);

// Admin-only book deletion. Preserve books referenced by order history.
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!/^[1-9]\d{0,17}$/.test(id)) {
      return res.status(400).json({ success: false, message: "Invalid book ID." });
    }

    const result = await pool.query(
      `DELETE FROM books b
       WHERE b.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM order_items oi WHERE oi.book_id = b.id
         )
       RETURNING b.id, b.title, b.cover_image`,
      [id]
    );

    if (!result.rowCount) {
      const check = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM books WHERE id = $1) AS book_exists,
                EXISTS(SELECT 1 FROM order_items WHERE book_id = $1) AS has_orders`,
        [id]
      );

      if (!check.rows[0].book_exists) {
        return res.status(404).json({ success: false, message: "Book not found." });
      }

      if (check.rows[0].has_orders) {
        return res.status(409).json({
          success: false,
          message: "This book has order history and cannot be deleted. You can edit it or set its stock to zero."
        });
      }

      return res.status(409).json({
        success: false,
        message: "The book could not be deleted. Please refresh and try again."
      });
    }

    const cover = result.rows[0].cover_image;
    if (cover && cover.startsWith("/uploads/books/")) {
      const filename = path.basename(cover);
      await fs.unlink(path.join(uploadDir, filename)).catch(() => {});
    }

    res.json({
      success: true,
      message: "Book deleted successfully.",
      book: result.rows[0]
    });
  })
);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: "Image upload failed or exceeded the 5 MB limit."
    });
  }

  console.error("Book API error:", error.message);

  res.status(500).json({
    success: false,
    message: "Unable to complete the book request."
  });
});

module.exports = router;
