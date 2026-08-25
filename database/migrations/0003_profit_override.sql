-- ============================================================
-- 0003_profit_override.sql
-- Allow an admin to manually override the auto-calculated profit on a
-- transaction (e.g. a negotiated one-off rate). amount_collected still
-- always equals total_change_value + profit (chk_amount_collected_math
-- stays untouched and satisfied), and commission_rate keeps recording
-- which standard tier (1.5% / 3%) the bundle mix falls into regardless
-- of whether profit was overridden - it's a classification of the
-- transaction, not a promise that profit = total_change_value * rate.
-- profit_overridden makes the override visible/auditable rather than
-- silently indistinguishable from a normal auto-calculated value.
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN profit_overridden BOOLEAN NOT NULL DEFAULT FALSE;
