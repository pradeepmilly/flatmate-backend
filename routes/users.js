/**
 * Users routes
 * GET  /api/users/:id           — get any user's public profile
 * GET  /api/users/lookup/phone/:phone     — lookup by phone
 * GET  /api/users/lookup/aadhaar/:last4   — lookup by last 4 digits of Aadhaar
 * PATCH /api/users/me           — update own profile (name, locality, about)
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth } = require("../middleware/auth");

// ─── Public profile ───────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, aadhaar_masked, role, locality, about, verified,
              to_char(created_at, 'Mon YYYY') AS joined_date
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = rows[0];

    // Attach reviews/reports depending on role
    if (user.role === "owner") {
      const { rows: reviews } = await pool.query(
        `SELECT r.*, u.name AS tenant_name,
                to_char(r.created_at, 'Mon YYYY') AS date
         FROM owner_reviews r
         JOIN users u ON u.id = r.tenant_id
         WHERE r.owner_id = $1
         ORDER BY r.created_at DESC`,
        [user.id]
      );
      const { rows: props } = await pool.query(
        `SELECT id, title, locality, rent, bedrooms, available FROM properties WHERE owner_id = $1`,
        [user.id]
      );
      user.reviews  = reviews;
      user.properties = props;
    } else {
      const { rows: reports } = await pool.query(
        `SELECT r.*, u.name AS owner_name,
                to_char(r.created_at, 'Mon YYYY') AS date
         FROM tenant_reports r
         JOIN users u ON u.id = r.owner_id
         WHERE r.tenant_id = $1
         ORDER BY r.created_at DESC`,
        [user.id]
      );
      user.reports = reports;
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ─── Lookup by phone ──────────────────────────────────────────────────────────

router.get("/lookup/phone/:phone", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, aadhaar_masked, role, locality, about, verified,
              to_char(created_at, 'Mon YYYY') AS joined_date
       FROM users WHERE phone = $1`,
      [req.params.phone]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Lookup by Aadhaar last-4 ─────────────────────────────────────────────────

router.get("/lookup/aadhaar/:last4", requireAuth, async (req, res, next) => {
  try {
    const pattern = `%-${req.params.last4}`;
    const { rows } = await pool.query(
      `SELECT id, name, phone, aadhaar_masked, role, locality, about, verified,
              to_char(created_at, 'Mon YYYY') AS joined_date
       FROM users WHERE aadhaar_masked LIKE $1`,
      [pattern]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Update own profile ───────────────────────────────────────────────────────

router.patch("/me", requireAuth, async (req, res, next) => {
  const { name, locality, about } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET name     = COALESCE($1, name),
           locality = COALESCE($2, locality),
           about    = COALESCE($3, about)
       WHERE id = $4
       RETURNING id, name, phone, aadhaar_masked, role, locality, about, verified`,
      [name || null, locality || null, about || null, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
