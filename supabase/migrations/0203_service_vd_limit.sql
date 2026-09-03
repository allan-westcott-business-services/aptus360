-- ════════════════════════════════════════════════════════════════
-- 0203 — the service tail's own permitted volt drop
--
-- Two limits, because the journey has two parts. Max_Volt_Drop_Pct is
-- the feeder's allowance, origin to end of line along the mains — 5%
-- as this scheme runs it. The tail from the main to the customer's
-- cut-out has its own allowance on top: 2%. A cut-out figure is judged
-- against the SUM, so a node at 6.3% with a 0.07% tail is inside a
-- 5+2 scheme, and painting it red against the mains limit alone was
-- judging the whole journey by half the allowance.
--
-- One column on the one-row settings table; the lookups endpoint
-- selects *, so it flows to the app unasked. Default 2, this scheme's
-- own figure.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Electric_VD_Setting"
  ADD COLUMN IF NOT EXISTS "Max_Service_Volt_Drop_Pct" numeric NOT NULL DEFAULT 2;

COMMENT ON COLUMN "Electric_VD_Setting"."Max_Service_Volt_Drop_Pct" IS
  'Permitted volt drop along a service tail, on top of Max_Volt_Drop_Pct. '
  'The at-cut-out figure is judged against the sum of the two.';


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Max_Volt_Drop_Pct", "Max_Service_Volt_Drop_Pct"
--     FROM "Electric_VD_Setting";
-- Expect one row: your mains limit (5) and the service allowance (2).
