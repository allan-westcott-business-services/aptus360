-- ════════════════════════════════════════════════════════════════
-- 0109 — contingency by plot count
--
-- A POC application asks for the residential load plus a contingency,
-- and the contingency is a stepped allowance: nothing on a handful of
-- plots, a little on a street, more on an estate. The bands are a
-- commercial decision that changes from time to time, so they belong in
-- a table rather than in the application.
--
-- ── Bands, not a formula ──
-- Inclusive at both ends, so 1–9, 10–100, 101–9999 is exactly what it
-- reads as and there is no argument about which band 100 falls in. The
-- last band's upper bound is a large number rather than null: a band
-- with no end is a band nobody can see the shape of, and 9999 says
-- plainly that it means "everything above".
--
-- Overlaps are not prevented. Two bands claiming the same count is a
-- mistake, but it is a mistake in judgement rather than in structure —
-- the lookup takes the first match by lower bound, and the admin screen
-- is where it should be visible. A constraint here would refuse an edit
-- half way through re-banding, which is how people end up deleting
-- everything and starting again.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Contingency_Level" (
  "Contingency_Level_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "From_Plot_Count"      integer NOT NULL,
  "To_Plot_Count"        integer NOT NULL,
  "Additional_kVA"       numeric NOT NULL DEFAULT 0,
  "Is_Active"            boolean NOT NULL DEFAULT true,
  "Notes"                text,
  CONSTRAINT contingency_range CHECK ("To_Plot_Count" >= "From_Plot_Count")
);

CREATE INDEX IF NOT EXISTS contingency_from_idx
  ON "Contingency_Level" ("From_Plot_Count");

COMMENT ON COLUMN "Contingency_Level"."From_Plot_Count" IS
  'Lowest plot count in this band, inclusive.';
COMMENT ON COLUMN "Contingency_Level"."To_Plot_Count" IS
  'Highest plot count in this band, inclusive.';
COMMENT ON COLUMN "Contingency_Level"."Additional_kVA" IS
  'Added to the residential load on a POC application for a site in this band.';


-- The bands as they stand. Skipped where the table already holds
-- something, so re-running cannot overwrite a set someone has adjusted.
INSERT INTO "Contingency_Level"
  ("From_Plot_Count", "To_Plot_Count", "Additional_kVA")
SELECT * FROM (VALUES
  (1,   9,    0),
  (10,  100,  10),
  (101, 9999, 20)
) AS v(f, t, k)
WHERE NOT EXISTS (SELECT 1 FROM "Contingency_Level");


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "From_Plot_Count", "To_Plot_Count", "Additional_kVA"
--     FROM "Contingency_Level" WHERE "Is_Active"
--    ORDER BY "From_Plot_Count";
--
-- Which band a given site falls in — 139 plots should return 20:
--   SELECT "Additional_kVA" FROM "Contingency_Level"
--    WHERE "Is_Active" AND 139 BETWEEN "From_Plot_Count" AND "To_Plot_Count"
--    ORDER BY "From_Plot_Count" LIMIT 1;
--
-- Gaps and overlaps, which the table allows and the eye should catch:
--   SELECT a."From_Plot_Count" AS a_from, a."To_Plot_Count" AS a_to,
--          b."From_Plot_Count" AS b_from, b."To_Plot_Count" AS b_to
--     FROM "Contingency_Level" a JOIN "Contingency_Level" b
--       ON a."Contingency_Level_ID" < b."Contingency_Level_ID"
--      AND a."To_Plot_Count" >= b."From_Plot_Count"
--      AND a."From_Plot_Count" <= b."To_Plot_Count"
--    WHERE a."Is_Active" AND b."Is_Active";
