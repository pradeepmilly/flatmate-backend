require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const errorHandler = require("./middleware/errorHandler");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from frontend (local dev + production)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    service: "FlatMate India API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/auth",           require("./routes/auth"));
app.use("/api/users",          require("./routes/users"));
app.use("/api/properties",     require("./routes/properties"));
app.use("/api/applications",   require("./routes/applications"));
app.use("/api/messages",       require("./routes/messages"));
app.use("/api/reviews",        require("./routes/reviews"));
app.use("/api/active-tenants", require("./routes/activeTenants"));
app.use("/api/notifications",  require("./routes/notifications"));

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   FlatMate India API                 ║
  ║   Running on http://localhost:${PORT}   ║
  ╚══════════════════════════════════════╝
  `);
});
