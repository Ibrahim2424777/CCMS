-- ============================================================
-- 0002_fractional_bundles.sql
-- Allow partial bundles (e.g. half a Rs. 100 bundle = 50 notes = Rs. 5,000).
-- Bundle quantities and inventory counts move from whole-integer to
-- NUMERIC(10,2) - precision to hundredths exactly represents a whole number
-- of notes, since 1 note = 0.01 of a 100-note bundle. Existing whole-number
-- data converts losslessly (integer -> numeric is an implicit, automatic
-- cast in Postgres). Existing CHECK constraints (>= 0, at-least-one-bundle)
-- remain valid and attached across the type change with no changes needed.
-- ============================================================

ALTER TABLE transactions
  ALTER COLUMN bundles_10  TYPE NUMERIC(10,2),
  ALTER COLUMN bundles_50  TYPE NUMERIC(10,2),
  ALTER COLUMN bundles_100 TYPE NUMERIC(10,2);

ALTER TABLE transaction_edits
  ALTER COLUMN previous_bundles_10  TYPE NUMERIC(10,2),
  ALTER COLUMN previous_bundles_50  TYPE NUMERIC(10,2),
  ALTER COLUMN previous_bundles_100 TYPE NUMERIC(10,2);

ALTER TABLE inventory
  ALTER COLUMN bundle_count TYPE NUMERIC(10,2);
