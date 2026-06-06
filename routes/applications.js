/**
 * Applications routes
 * POST /api/applications               — tenant applies for a property
 * GET  /api/applications/mine          — tenant: my applications
 * GET  /api/applications/received      — owner: applications for my properties
 * PATCH /api/applications/:id/status   — owner: accept or reject
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth, requireRole } = require("../middleware/auth");

// ─── Tenant applies ───────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("tenant"), async (req, res, next) => {
  const { property_id, message } = req.body;
  if (!property_id || !message) return res.status(400).json({ error: "property_id and message are required" });

  try {
    // Find property owner
    const { rows: propRows } = await pool.query(`SELECT owner_id FROM properties WHERE id = $1`, [property_id]);
    if (propRows.length === 0) return res.status(404).json({ error: "Property not found" });

    const owner_id = propRows[0].owner_id;

    const { rows } = await pool.query(
      `INSERT INTO applications (tenant_id, owner_id, property_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, owner_id, property_id, message]
    );

    // Notify owner
    const { rows: tenantRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, text)
       VALUES ($1, 'application', 'New Application', $2)`,
      [owner_id, `${tenantRows[0]?.name || "A tenant"} has applied for your property`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "You have already applied for this property" });
    next(err);
  }
});

// ─── Tenant: my applications ──────────────────────────────────────────────────

router.get("/mine", requireAuth, requireRole("tenant"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              p.title AS property_title, p.locality, p.rent,
              u.name AS owner_name,
              to_char(a.created_at, 'DD Mon YYYY') AS date
       FROM applications a
       JOIN properties p ON p.id = a.property_id
       JOIN users u ON u.id = a.owner_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Owner: received applications ─────────────────────────────────────────────

router.get("/received", requireAuth, requireRole("owner"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              p.title AS property_title, p.locality,
              u.name AS tenant_name, u.phone AS tenant_phone,
              u.locality AS tenant_locality, u.verified AS tenant_verified,
              (SELECT ROUND(AVG(overall),1) FROM tenant_reports WHERE tenant_id = a.tenant_id) AS tenant_rating,
              (SELECT COUNT(*) FROM tenant_reports WHERE tenant_id = a.tenant_id) AS tenant_report_count,
              to_char(a.created_at, 'DD Mon YYYY') AS date
       FROM applications a
       JOIN properties p ON p.id = a.property_id
       JOIN users u ON u.id = a.tenant_id
       WHERE a.owner_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Owner: update application status ────────────────────────────────────────

router.patch("/:id/status", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { status } = req.body;
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be 'accepted' or 'rejected'" });
  }

  try {
    const { rows: appRows } = await pool.query(`SELECT * FROM applications WHERE id = $1`, [req.params.id]);
    if (appRows.length === 0) return res.status(404).json({ error: "Application not found" });
    if (appRows[0].owner_id !== req.user.id) return res.status(403).json({ error: "Not your application" });

    const { rows } = await pool.query(
      `UPDATE applications SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    // Notify tenant
    const { rows: ownerRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    const { rows: propRows }  = await pool.query(`SELECT title FROM properties WHERE id = $1`, [appRows[0].property_id]);
    const notifText = status === "accepted"
      ? `Your application for ${propRows[0]?.title} was accepted by ${ownerRows[0]?.name}`
      : `Your application for ${propRows[0]?.title} was not taken forward`;

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, text) VALUES ($1, 'application', $2, $3)`,
      [appRows[0].tenant_id, status === "accepted" ? "Application Accepted 🎉" : "Application Update", notifText]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
