/**
 * Active Tenants routes
 * GET   /api/active-tenants           — owner: list their active tenants
 * POST  /api/active-tenants           — owner: record a move-in
 * PATCH /api/active-tenants/:id       — owner: update rent / last payment date
 * PATCH /api/active-tenants/:id/moveout — owner: record move-out
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth, requireRole } = require("../middleware/auth");

// ─── List active tenants ──────────────────────────────────────────────────────

router.get("/", requireAuth, requireRole("owner"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT at.*,
              u.name AS tenant_name, u.phone AS tenant_phone,
              u.locality AS tenant_locality, u.verified AS tenant_verified,
              p.title AS property_title, p.locality AS property_locality
       FROM active_tenants at
       JOIN users u ON u.id = at.tenant_id
       JOIN properties p ON p.id = at.property_id
       WHERE at.owner_id = $1
       ORDER BY at.move_in_date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Record move-in ───────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { tenant_phone, property_id, move_in_date, monthly_rent } = req.body;

  if (!tenant_phone || !property_id || !move_in_date || !monthly_rent) {
    return res.status(400).json({ error: "tenant_phone, property_id, move_in_date, monthly_rent are required" });
  }

  try {
    // Look up tenant by phone
    const { rows: tRows } = await pool.query(
      `SELECT id, name FROM users WHERE phone = $1 AND role = 'tenant'`,
      [tenant_phone]
    );
    if (tRows.length === 0) return res.status(404).json({ error: "No tenant found with that phone number" });

    // Verify property belongs to owner
    const { rows: pRows } = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [property_id, req.user.id]
    );
    if (pRows.length === 0) return res.status(403).json({ error: "Property not found or not yours" });

    const { rows } = await pool.query(
      `INSERT INTO active_tenants (owner_id, tenant_id, property_id, move_in_date, monthly_rent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, tRows[0].id, property_id, move_in_date, monthly_rent]
    );

    // Mark property as occupied
    await pool.query(`UPDATE properties SET available = FALSE WHERE id = $1`, [property_id]);

    res.status(201).json({ ...rows[0], tenant_name: tRows[0].name, tenant_phone });
  } catch (err) {
    next(err);
  }
});

// ─── Update (rent / last payment) ────────────────────────────────────────────

router.patch("/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { monthly_rent, last_payment_date } = req.body;
  try {
    const { rows: own } = await pool.query(`SELECT owner_id FROM active_tenants WHERE id = $1`, [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: "Record not found" });
    if (own[0].owner_id !== req.user.id) return res.status(403).json({ error: "Not your record" });

    const { rows } = await pool.query(
      `UPDATE active_tenants
       SET monthly_rent      = COALESCE($1, monthly_rent),
           last_payment_date = COALESCE($2, last_payment_date)
       WHERE id = $3
       RETURNING *`,
      [monthly_rent || null, last_payment_date || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Record move-out ──────────────────────────────────────────────────────────

router.patch("/:id/moveout", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { move_out_date } = req.body;
  try {
    const { rows: own } = await pool.query(`SELECT * FROM active_tenants WHERE id = $1`, [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: "Record not found" });
    if (own[0].owner_id !== req.user.id) return res.status(403).json({ error: "Not your record" });

    const { rows } = await pool.query(
      `UPDATE active_tenants
       SET status = 'moved_out', move_out_date = $1
       WHERE id = $2
       RETURNING *`,
      [move_out_date || new Date().toISOString().slice(0, 10), req.params.id]
    );

    // Mark property as available again
    await pool.query(`UPDATE properties SET available = TRUE WHERE id = $1`, [own[0].property_id]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
