/**
 * Properties routes
 * GET  /api/properties              — search (locality, maxRent, bedrooms)
 * GET  /api/properties/mine         — owner's own listings
 * GET  /api/properties/:id          — single property detail
 * POST /api/properties              — create (owner only)
 * PATCH /api/properties/:id         — update (owner only, own property)
 * DELETE /api/properties/:id        — delete (owner only, own property)
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth, requireRole } = require("../middleware/auth");

// ─── Search / list available properties ──────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  const { locality, max_rent, bedrooms } = req.query;

  let query = `
    SELECT p.*,
           u.name AS owner_name, u.verified AS owner_verified,
           to_char(p.created_at, 'DD Mon YYYY') AS listed_date,
           (SELECT ROUND(AVG(overall), 1) FROM owner_reviews WHERE owner_id = p.owner_id) AS owner_rating,
           (SELECT COUNT(*) FROM owner_reviews WHERE owner_id = p.owner_id) AS owner_review_count
    FROM properties p
    JOIN users u ON u.id = p.owner_id
    WHERE p.available = TRUE
  `;
  const params = [];

  if (locality) {
    params.push(`%${locality}%`);
    query += ` AND p.locality ILIKE $${params.length}`;
  }
  if (max_rent) {
    params.push(parseInt(max_rent));
    query += ` AND p.rent <= $${params.length}`;
  }
  if (bedrooms) {
    params.push(parseInt(bedrooms));
    query += ` AND p.bedrooms = $${params.length}`;
  }

  query += ` ORDER BY p.created_at DESC`;

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Owner's own listings ─────────────────────────────────────────────────────

router.get("/mine", requireAuth, requireRole("owner"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM properties WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Single property ──────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              u.id AS owner_id, u.name AS owner_name, u.phone AS owner_phone,
              u.verified AS owner_verified, u.locality AS owner_locality,
              to_char(u.created_at, 'Mon YYYY') AS owner_joined,
              (SELECT ROUND(AVG(overall), 1) FROM owner_reviews WHERE owner_id = p.owner_id) AS owner_rating,
              (SELECT COUNT(*) FROM owner_reviews WHERE owner_id = p.owner_id) AS owner_review_count
       FROM properties p
       JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Property not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Create property ──────────────────────────────────────────────────────────

router.post("/", requireAuth, requireRole("owner"), async (req, res, next) => {
  const { title, locality, address, rent, deposit, bedrooms, bathrooms, area, available_from, amenities, description } = req.body;

  if (!title || !locality || !address || !rent || !deposit || !bedrooms || !bathrooms) {
    return res.status(400).json({ error: "title, locality, address, rent, deposit, bedrooms, bathrooms are required" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO properties
         (owner_id, title, locality, address, rent, deposit, bedrooms, bathrooms, area, available_from, amenities, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.user.id, title, locality, address, rent, deposit, bedrooms, bathrooms, area || null, available_from || "Immediate", amenities || [], description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Update property ──────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
  try {
    // Verify ownership
    const { rows: own } = await pool.query(`SELECT owner_id FROM properties WHERE id = $1`, [req.params.id]);
    if (own.length === 0) return res.status(404).json({ error: "Property not found" });
    if (own[0].owner_id !== req.user.id) return res.status(403).json({ error: "Not your property" });

    const fields = ["title","locality","address","rent","deposit","bedrooms","bathrooms","area","available","available_from","amenities","description"];
    const updates = [];
    const values  = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE properties SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Delete property ──────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requireRole("owner"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT owner_id FROM properties WHERE id = $1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Property not found" });
    if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: "Not your property" });

    await pool.query(`DELETE FROM properties WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
