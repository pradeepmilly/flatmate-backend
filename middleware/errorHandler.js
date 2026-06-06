/**
 * Central error handler — catches anything passed to next(err)
 */
function errorHandler(err, req, res, next) {
  console.error(err);

  // Postgres unique-violation (e.g. duplicate phone)
  if (err.code === "23505") {
    return res.status(409).json({ error: "Duplicate entry — record already exists" });
  }

  // Postgres foreign-key violation
  if (err.code === "23503") {
    return res.status(400).json({ error: "Referenced record does not exist" });
  }

  // Validation errors from express-validator
  if (err.type === "validation") {
    return res.status(422).json({ error: "Validation failed", details: err.details });
  }

  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
