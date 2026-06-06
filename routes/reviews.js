/**
 * Reviews routes
 *
 * Tenant conduct reports (owner writes about tenant):
 * POST /api/reviews/tenant-reports         — owner submits report
 * GET  /api/reviews/tenant-reports/:userId — reports about a tenant
 *
 * Owner reviews (tenant writes about owner):
 * POST /api/reviews/owner-reviews          — tenant submits review
 * GET  /api/reviews/owner-reviews/:userId  — reviews about an owner
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth, requireRole } = require("../middleware/auth");

// ─── Owner submits tenant conduct report ──────────────────────────────────────

router.post("/tenant-reports", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { tenant_id, property_id, payment_timeliness, nature, cleanliness, cooperation, overall, comment } = req.body;

  if (!tenant_id || !overall) return res.status(400).json({ error: "tenant_id and overall rating are required" });

  try {
    // Verify tenant exists
    const { rows: tRows } = await pool.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'tenant'`, [tenant_id]);
    if (tRows.length === 0) return res.status(404).json({ error: "Tenant not found" });

    const { rows } = await pool.query(
      `INSERT INTO tenant_reports
         (owner_id, tenant_id, property_id, payment_timeliness, nature, cleanliness, cooperation, overall, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.user.id, tenant_id, property_id || null, payment_timeliness, nature, cleanliness, cooperation, overall, comment || null]
    );

    // Notify tenant
    const { rows: ownerRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, text) VALUES ($1, 'review', 'Conduct Report Added', $2)`,
      [tenant_id, `${ownerRows[0]?.name || "An owner"} submitted a conduct report about you`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Get tenant conduct reports ───────────────────────────────────────────────

router.get("/tenant-reports/:userId", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              u.name AS owner_name,
              to_char(r.created_at, 'Mon YYYY') AS date
       FROM tenant_reports r
       JOIN users u ON u.id = r.owner_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Tenant submits owner review ──────────────────────────────────────────────

router.post("/owner-reviews", requireAuth, requireRole("tenant"), async (req, res, next) => {
  const { owner_id, property_id, behaviour, building_condition, roads, security, cleanliness, overall, comment } = req.body;

  if (!owner_id || !overall) return res.status(400).json({ error: "owner_id and overall rating are required" });

  try {
    const { rows: oRows } = await pool.query(`SELECT id, name FROM users WHERE id = $1 AND role = 'owner'`, [owner_id]);
    if (oRows.length === 0) return res.status(404).json({ error: "Owner not found" });

    const { rows } = await pool.query(
      `INSERT INTO owner_reviews
         (tenant_id, owner_id, property_id, behaviour, building_condition, roads, security, cleanliness, overall, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.id, owner_id, property_id || null, behaviour, building_condition, roads, security, cleanliness, overall, comment || null]
    );

    // Notify owner
    const { rows: tenantRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, text) VALUES ($1, 'review', 'New Review', $2)`,
      [owner_id, `${tenantRows[0]?.name || "A tenant"} left you a ${overall}★ review`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Get owner reviews ────────────────────────────────────────────────────────

router.get("/owner-reviews/:userId", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              u.name AS tenant_name,
              to_char(r.created_at, 'Mon YYYY') AS date
       FROM owner_reviews r
       JOIN users u ON u.id = r.tenant_id
       WHERE r.owner_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
