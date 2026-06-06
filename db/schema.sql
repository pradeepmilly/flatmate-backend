-- FlatMate India — PostgreSQL Schema
-- Run: psql -U postgres -d flatmate_india -f db/schema.sql

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100),
  phone         VARCHAR(10) UNIQUE NOT NULL,
  aadhaar_hash  TEXT,                          -- bcrypt hash of full Aadhaar
  aadhaar_masked VARCHAR(20),                  -- e.g. XXXX-XXXX-3210
  role          VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'tenant')),
  locality      VARCHAR(150),
  about         TEXT,
  verified      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── OTPs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otps (
  id          SERIAL PRIMARY KEY,
  phone       VARCHAR(10) NOT NULL,
  otp         VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Auto-clean old OTPs after 10 minutes (index helps)
CREATE INDEX IF NOT EXISTS idx_otps_phone ON otps (phone);

-- ─── Properties ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          VARCHAR(200) NOT NULL,
  locality       VARCHAR(100) NOT NULL,
  address        TEXT NOT NULL,
  rent           INTEGER NOT NULL,
  deposit        INTEGER NOT NULL,
  bedrooms       INTEGER NOT NULL,
  bathrooms      INTEGER NOT NULL,
  area           INTEGER,
  available      BOOLEAN DEFAULT TRUE,
  available_from VARCHAR(50),
  amenities      TEXT[] DEFAULT '{}',
  description    TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_owner    ON properties (owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_locality ON properties (locality);
CREATE INDEX IF NOT EXISTS idx_properties_available ON properties (available);

-- ─── Applications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, property_id)   -- one application per tenant per property
);

CREATE INDEX IF NOT EXISTS idx_applications_owner  ON applications (owner_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications (tenant_id);

-- ─── Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  read         BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages (from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages (to_user_id);

-- ─── Tenant Conduct Reports (by owner about tenant) ───────────────────────────

CREATE TABLE IF NOT EXISTS tenant_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id          UUID REFERENCES properties(id) ON DELETE SET NULL,
  payment_timeliness   INTEGER CHECK (payment_timeliness BETWEEN 1 AND 5),
  nature               INTEGER CHECK (nature BETWEEN 1 AND 5),
  cleanliness          INTEGER CHECK (cleanliness BETWEEN 1 AND 5),
  cooperation          INTEGER CHECK (cooperation BETWEEN 1 AND 5),
  overall              INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  comment              TEXT,
  created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_reports_tenant ON tenant_reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_reports_owner  ON tenant_reports (owner_id);

-- ─── Owner Reviews (by tenant about owner) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS owner_reviews (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id        UUID REFERENCES properties(id) ON DELETE SET NULL,
  behaviour          INTEGER CHECK (behaviour BETWEEN 1 AND 5),
  building_condition INTEGER CHECK (building_condition BETWEEN 1 AND 5),
  roads              INTEGER CHECK (roads BETWEEN 1 AND 5),
  security           INTEGER CHECK (security BETWEEN 1 AND 5),
  cleanliness        INTEGER CHECK (cleanliness BETWEEN 1 AND 5),
  overall            INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  comment            TEXT,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_reviews_owner  ON owner_reviews (owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_reviews_tenant ON owner_reviews (tenant_id);

-- ─── Active Tenants ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS active_tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  move_in_date      DATE NOT NULL,
  move_out_date     DATE,
  monthly_rent      INTEGER NOT NULL,
  status            VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'moved_out')),
  last_payment_date DATE,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_tenants_owner  ON active_tenants (owner_id);
CREATE INDEX IF NOT EXISTS idx_active_tenants_tenant ON active_tenants (tenant_id);

-- ─── Notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL,   -- 'application', 'message', 'review', 'system'
  title      VARCHAR(200) NOT NULL,
  text       TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
