const jwt = require("jsonwebtoken");

/**
 * Protect routes — verifies JWT from Authorization: Bearer <token>
 * Attaches req.user = { id, phone, role } on success
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;   // { id, phone, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restrict to a specific role
 * Usage: requireRole("owner")  or  requireRole("tenant")
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Only ${role}s can access this endpoint` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
