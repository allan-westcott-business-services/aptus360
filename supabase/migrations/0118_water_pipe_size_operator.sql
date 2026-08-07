-- ════════════════════════════════════════════════════════════════
-- 0118 — water pipe sizes by operator
--
-- Whose rule this is.
--
-- 0117 made one table: a diameter and the plots it carries. But the
-- standard is not the industry's, it is the adopting operator's — one
-- NAV allows twenty plots on 63mm and another allows sixteen on the
-- same pipe, and a scheme adopted by the second one designed to the
-- first is a scheme that gets rejected.
--
-- So a rule may now name a DNO, an IDNO, both, or neither.
--
-- ── Neither means everyone ──
--
-- A row with both columns empty is the house standard and applies to any
-- project. That is what the seeded 63mm row is, and it goes on working
-- untouched for every scheme that has no operator-specific rule.
--
-- ── Most specific wins, per diameter ──
--
-- The build reads the table for the project's operator and, where a
-- diameter appears more than once, keeps the row that names that
-- operator over the one that names nobody. Per diameter rather than per
-- table, so an operator who differs on 63mm alone needs one row and
-- still inherits the 90 and the 125 — the alternative, taking whichever
-- tier has any rows at all, would silently drop every size that
-- operator had not restated.
--
-- Rows naming a different operator are not considered at all.
--
-- ── The uniqueness moves ──
--
-- Diameter_mm was unique, which was right when there was one rule per
-- size and is wrong now: 63mm exists once per operator. The constraint
-- becomes the three together.
--
-- As an index over COALESCE rather than a plain UNIQUE, because in
-- Postgres two NULLs are distinct by default — a plain constraint would
-- let two house-standard rows for 63mm sit side by side, disagreeing,
-- with nothing to say which the build used. NULLS NOT DISTINCT would say
-- it too but needs Postgres 15, and this should not care.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Water_Pipe_Size"
  ADD COLUMN IF NOT EXISTS "DNO_ID"  bigint REFERENCES "DNO"  ("DNO_ID"),
  ADD COLUMN IF NOT EXISTS "IDNO_ID" bigint REFERENCES "IDNO" ("IDNO_ID");

-- The old rule: one row per diameter, full stop.
ALTER TABLE "Water_Pipe_Size"
  DROP CONSTRAINT IF EXISTS "Water_Pipe_Size_Diameter_mm_key";

-- The new one: one row per diameter per operator.
CREATE UNIQUE INDEX IF NOT EXISTS water_pipe_size_rule_idx
  ON "Water_Pipe_Size" (
    "Diameter_mm",
    COALESCE("DNO_ID", 0),
    COALESCE("IDNO_ID", 0)
  );

COMMENT ON COLUMN "Water_Pipe_Size"."DNO_ID" IS
  'The DNO this rule applies to. Empty means any.';
COMMENT ON COLUMN "Water_Pipe_Size"."IDNO_ID" IS
  'The IDNO/NAV this rule applies to. Empty means any.';


-- ── Check ───────────────────────────────────────────────────────
-- The house standard, and who departs from it:
--   SELECT w."Diameter_mm", w."Max_Meters",
--          COALESCE(i."IDNO_Name", d."DNO_Name", 'any operator') AS applies_to
--     FROM "Water_Pipe_Size" w
--     LEFT JOIN "IDNO" i ON i."IDNO_ID" = w."IDNO_ID"
--     LEFT JOIN "DNO"  d ON d."DNO_ID"  = w."DNO_ID"
--    WHERE w."Is_Active"
--    ORDER BY w."Diameter_mm", applies_to;
--
-- What one operator's table actually resolves to — the rule the build
-- applies, written out. Most specific per diameter:
--   SELECT DISTINCT ON ("Diameter_mm") "Diameter_mm", "Max_Meters", "IDNO_ID"
--     FROM "Water_Pipe_Size"
--    WHERE "Is_Active"
--      AND ("IDNO_ID" IS NULL OR "IDNO_ID" = 3)
--      AND "DNO_ID" IS NULL
--    ORDER BY "Diameter_mm", ("IDNO_ID" IS NOT NULL) DESC;
--
-- The uniqueness, which should refuse the second of these:
--   INSERT INTO "Water_Pipe_Size" ("Diameter_mm", "Max_Meters") VALUES (90, 50);
--   INSERT INTO "Water_Pipe_Size" ("Diameter_mm", "Max_Meters") VALUES (90, 44);
