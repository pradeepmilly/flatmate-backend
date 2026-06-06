/**
 * Notifications routes
 * GET   /api/notifications         — get my notifications
 * PATCH /api/notifications/read-all — mark all as read
 * PATCH /api/notifications/:id/read — mark one as read
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT *,
              CASE
                WHEN created_at > NOW() - INTERVAL '1 hour'  THEN 'Just now'
                WHEN created_at > NOW() - INTERVAL '24 hours' THEN EXTRACT(HOUR FROM NOW() - created_at)::int || 'h ago'
                WHEN created_at > NOW() - INTERVAL '7 days'  THEN EXTRACT(DAY FROM NOW() - created_at)::int || 'd ago'
                ELSE to_char(created_at, 'DD Mon YYYY')
              END AS time_ago
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch("/read-all", requireAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
