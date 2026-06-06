/**
 * Messages routes
 * GET  /api/messages/threads         — list all conversations for current user
 * GET  /api/messages/:userId         — get messages between me and :userId
 * POST /api/messages/:userId         — send a message to :userId
 * PATCH /api/messages/:userId/read   — mark all messages from :userId as read
 */

const router = require("express").Router();
const pool   = require("../db/connection");
const { requireAuth } = require("../middleware/auth");

// ─── List conversation threads ────────────────────────────────────────────────

router.get("/threads", requireAuth, async (req, res, next) => {
  try {
    // Get distinct conversation partners
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (partner_id)
              partner_id,
              partner_name,
              partner_role,
              last_message,
              last_time,
              unread_count
       FROM (
         SELECT
           CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END AS partner_id,
           u.name AS partner_name,
           u.role AS partner_role,
           m.text AS last_message,
           m.created_at AS last_time,
           (SELECT COUNT(*) FROM messages
            WHERE to_user_id = $1
              AND from_user_id = CASE WHEN m.from_user_id = $1 THEN m.to_user_id ELSE m.from_user_id END
              AND read = FALSE) AS unread_count
         FROM messages m
         JOIN users u ON u.id = CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END
         WHERE from_user_id = $1 OR to_user_id = $1
         ORDER BY m.created_at DESC
       ) t
       ORDER BY partner_id, last_time DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Get messages with a specific user ────────────────────────────────────────

router.get("/:userId", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, u.name AS from_name
       FROM messages m
       JOIN users u ON u.id = m.from_user_id
       WHERE (from_user_id = $1 AND to_user_id = $2)
          OR (from_user_id = $2 AND to_user_id = $1)
       ORDER BY m.created_at ASC`,
      [req.user.id, req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── Send a message ───────────────────────────────────────────────────────────

router.post("/:userId", requireAuth, async (req, res, next) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "text is required" });

  const toUserId = req.params.userId;
  if (toUserId === req.user.id) return res.status(400).json({ error: "Cannot message yourself" });

  try {
    // Verify recipient exists
    const { rows: recipRows } = await pool.query(`SELECT id, name FROM users WHERE id = $1`, [toUserId]);
    if (recipRows.length === 0) return res.status(404).json({ error: "Recipient not found" });

    const { rows } = await pool.query(
      `INSERT INTO messages (from_user_id, to_user_id, text) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, toUserId, text.trim()]
    );

    // Notify recipient
    const { rows: senderRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, text) VALUES ($1, 'message', 'New Message', $2)`,
      [toUserId, `${senderRows[0]?.name || "Someone"} sent you a message`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── Mark messages from a user as read ───────────────────────────────────────

router.patch("/:userId/read", requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE messages SET read = TRUE WHERE from_user_id = $1 AND to_user_id = $2 AND read = FALSE`,
      [req.params.userId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
