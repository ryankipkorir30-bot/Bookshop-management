
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Please log in first."
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);

    if (!req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Invalid login token."
      });
    }

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Your session is invalid or expired."
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required."
    });
  }

  next();
}

module.exports = { requireAuth, requireAdmin };
