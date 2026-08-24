-- ============================================================
-- 0001_init.sql
-- CCMS initial schema: users, shops, transactions, transaction_edits, inventory
-- Design reference: ARCHITECTURE.md section 2
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- Shared trigger: keep updated_at accurate regardless of caller
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         CITEXT NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- SHOPS (case-insensitive identity via normalized_shop_name)
-- ============================================================
CREATE TABLE shops (
  id                    SERIAL PRIMARY KEY,
  shop_name             VARCHAR(150) NOT NULL,
  normalized_shop_name  VARCHAR(150) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_shops_normalized_name UNIQUE (normalized_shop_name)
);

CREATE OR REPLACE FUNCTION shops_set_normalized_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_shop_name = LOWER(TRIM(NEW.shop_name));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_normalize_name
  BEFORE INSERT OR UPDATE OF shop_name ON shops
  FOR EACH ROW EXECUTE FUNCTION shops_set_normalized_name();

CREATE TRIGGER shops_set_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_shops_normalized_name ON shops (normalized_shop_name text_pattern_ops);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
  id                   SERIAL PRIMARY KEY,
  shop_id              INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  transaction_date     DATE NOT NULL,
  bundles_10           INTEGER NOT NULL DEFAULT 0 CHECK (bundles_10 >= 0),
  bundles_50           INTEGER NOT NULL DEFAULT 0 CHECK (bundles_50 >= 0),
  bundles_100          INTEGER NOT NULL DEFAULT 0 CHECK (bundles_100 >= 0),
  total_change_value   NUMERIC(12,2) NOT NULL CHECK (total_change_value >= 0),
  commission_rate      NUMERIC(5,4)  NOT NULL CHECK (commission_rate IN (0.0150, 0.0300)),
  profit               NUMERIC(12,2) NOT NULL CHECK (profit >= 0),
  amount_collected     NUMERIC(12,2) NOT NULL CHECK (amount_collected >= 0),
  status               VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  created_by           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by           INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_at_least_one_bundle CHECK (bundles_10 > 0 OR bundles_50 > 0 OR bundles_100 > 0),
  CONSTRAINT chk_amount_collected_math CHECK (amount_collected = total_change_value + profit)
);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_transactions_date        ON transactions (transaction_date);
CREATE INDEX idx_transactions_shop_id     ON transactions (shop_id);
CREATE INDEX idx_transactions_created_by  ON transactions (created_by);
CREATE INDEX idx_transactions_status_date ON transactions (status, transaction_date);

-- ============================================================
-- TRANSACTION_EDITS (before-snapshot history for auditability)
-- ============================================================
CREATE TABLE transaction_edits (
  id                            SERIAL PRIMARY KEY,
  transaction_id                INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  previous_shop_id              INTEGER NOT NULL,
  previous_transaction_date     DATE NOT NULL,
  previous_bundles_10           INTEGER NOT NULL,
  previous_bundles_50           INTEGER NOT NULL,
  previous_bundles_100          INTEGER NOT NULL,
  previous_total_change_value   NUMERIC(12,2) NOT NULL,
  previous_commission_rate      NUMERIC(5,4) NOT NULL,
  previous_profit               NUMERIC(12,2) NOT NULL,
  previous_amount_collected     NUMERIC(12,2) NOT NULL,
  edit_type                     VARCHAR(10) NOT NULL CHECK (edit_type IN ('UPDATE', 'VOID')),
  edited_by                     INTEGER NOT NULL REFERENCES users(id),
  edited_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transaction_edits_transaction_id ON transaction_edits (transaction_id);

-- ============================================================
-- INVENTORY (current snapshot, one row per bundle type)
-- ============================================================
CREATE TABLE inventory (
  bundle_type   SMALLINT PRIMARY KEY CHECK (bundle_type IN (10, 50, 100)),
  bundle_count  INTEGER NOT NULL DEFAULT 0 CHECK (bundle_count >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER inventory_set_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Row existence for the three fixed denominations (MC section 2).
-- Real starting counts are set by the seed script, not here.
INSERT INTO inventory (bundle_type, bundle_count) VALUES (10, 0), (50, 0), (100, 0);
