/**
 * Auth routes
 * POST /api/auth/send-otp    — send OTP to phone (demo: always 1234)
 * POST /api/auth/verify-otp  — verify OTP, return JWT + user profile
 */

const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const pool    = require("../db/connection");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSmsOtp(phone, otp) {
  // Swap this block with your MSG91 / Twilio call in production
  if (process.env.USE_REAL_OTP === "true") {
    const url = `https://api.msg91.com/api/v5/otp?template_id=${process.env.MSG91_TEMPLATE_ID}&mobile=91${phone}&authkey=${process.env.MSG91_AUTH_KEY}&otp=${otp}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.type !== "success") throw new Error("SMS gateway error");
  } else {
    // Demo mode — OTP is always 1234, just log it
    console.log(`[DEMO OTP] Phone: ${phone}  OTP: ${otp}`);
  }
}

// ─── POST /api/auth/send-otp ──────────────────────────────────────────────────

router.post(
  "/send-otp",
  [
    body("phone").isLength({ min: 10, max: 10 }).withMessage("Phone must be 10 digits"),
    body("aadhaar").notEmpty().withMessage("Aadhaar is required"),
    body("role").isIn(["owner", "tenant"]).withMessage("Role must be owner or tenant"),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { phone, aadhaar, role } = req.body;

    try {
      // Generate OTP (demo: always 1234)
      const otp = process.env.USE_REAL_OTP === "true" ? generateOtp() : "1234";
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP
      await pool.query(
        `INSERT INTO otps (phone, otp, expires_at) VALUES ($1, $2, $3)`,
        [phone, otp, expiresAt]
      );

      await sendSmsOtp(phone, otp);

      res.json({
        success: true,
        message: process.env.USE_REAL_OTP === "true"
          ? "OTP sent via SMS"
          : "Demo mode: use OTP 1234",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────

router.post(
  "/verify-otp",
  [
    body("phone").isLength({ min: 10, max: 10 }),
    body("otp").isLength({ min: 4, max: 6 }),
    body("aadhaar").notEmpty(),
    body("role").isIn(["owner", "tenant"]),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { phone, otp, aadhaar, role, name } = req.body;

    try {
      // Check OTP
      const { rows: otpRows } = await pool.query(
        `SELECT * FROM otps
         WHERE phone = $1 AND otp = $2 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [phone, otp]
      );

      if (otpRows.length === 0) {
        return res.status(401).json({ error: "Invalid or expired OTP" });
      }

      // Mark OTP as used
      await pool.query(`UPDATE otps SET used = TRUE WHERE id = $1`, [otpRows[0].id]);

      // Upsert user
      const aadhaarMasked = `XXXX-XXXX-${aadhaar.replace(/\s|-/g, "").slice(-4)}`;
      const aadhaarHash   = await bcrypt.hash(aadhaar.replace(/\s|-/g, ""), 10);

      const { rows: userRows } = await pool.query(
        `INSERT INTO users (phone, role, aadhaar_hash, aadhaar_masked, name, verified)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (phone) DO UPDATE
           SET aadhaar_hash   = EXCLUDED.aadhaar_hash,
               aadhaar_masked = EXCLUDED.aadhaar_masked,
               verified       = TRUE,
               name           = COALESCE(users.name, EXCLUDED.name)
         RETURNING id, name, phone, aadhaar_masked, role, locality, about, verified, created_at`,
        [phone, role, aadhaarHash, aadhaarMasked, name || null]
      );

      const user = userRows[0];

      // Sign JWT
      const token = jwt.sign(
        { id: user.id, phone: user.phone, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      res.json({ token, user });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

const { requireAuth } = require("../middleware/auth");

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, aadhaar_masked, role, locality, about, verified, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
