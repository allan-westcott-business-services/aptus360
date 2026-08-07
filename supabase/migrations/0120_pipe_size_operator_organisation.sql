-- ════════════════════════════════════════════════════════════════
-- 0120 — pipe size rules name operators, not IDNO and DNO rows
--
-- 0119 pointed Water_Pipe_Size_Operator at "IDNO" and "DNO". Both are
-- the wrong lists, in two different ways:
--
--   They carry no utility. So the screen offered every operator on the
--   system — electric and gas ones included — for a rule that can only
--   ever be about water.
--
--   And "DNO" is half a migration behind. 0047 moved operators onto
--   Organisation with a role, and 0062 says plainly that new work should
--   read that; the legacy tables stayed because the pickers had not all
--   followed. A DNO set up the modern way exists as an Organisation
--   holding the 'dno' role and has no row in "DNO" at all, so it was
--   missing from the screen with nothing to say why.
--
-- 0069 already built what this needs: Organisation_Utility records which
-- utilities a company works in, and the Operator_Utility view lists the
-- companies holding an IDNO or DNO role with those utilities alongside.
-- One list, complete, and answerable about water.
--
-- ── One column instead of two ──
--
-- 0069 makes the argument and it applies here: a company works in water
-- whether you deal with it as an IDNO or a DNO, so which role it holds
-- is not what a sizing rule is about. Organisation_ID alone.
--
-- What was ticked before is carried across where the legacy row can be
-- followed to an organisation, which is every IDNO — 0047 backfilled
-- Organisation_ID on that table. A "DNO" row that never had one is
-- dropped, and there should be none: the feature is days old and the
-- screen it was ticked on is the one being replaced.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Water_Pipe_Size_Operator"
  ADD COLUMN IF NOT EXISTS "Organisation_ID" bigint REFERENCES "Organisation";

-- Follow the legacy ids across while they are still here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Water_Pipe_Size_Operator' AND column_name = 'IDNO_ID'
  ) THEN
    UPDATE "Water_Pipe_Size_Operator" o
       SET "Organisation_ID" = i."Organisation_ID"
      FROM "IDNO" i
     WHERE i."IDNO_ID" = o."IDNO_ID"
       AND o."Organisation_ID" IS NULL
       AND i."Organisation_ID" IS NOT NULL;

    -- Anything that could not be followed. Nothing is silently kept in a
    -- state where it names no operator and would read as the house
    -- standard — which is the opposite of what was meant.
    DELETE FROM "Water_Pipe_Size_Operator" WHERE "Organisation_ID" IS NULL;

    ALTER TABLE "Water_Pipe_Size_Operator"
      DROP CONSTRAINT IF EXISTS water_pipe_size_operator_one;

    DROP INDEX IF EXISTS wpso_idno_idx;
    DROP INDEX IF EXISTS wpso_dno_idx;

    ALTER TABLE "Water_Pipe_Size_Operator"
      DROP COLUMN "IDNO_ID",
      DROP COLUMN "DNO_ID";
  END IF;
END $$;

ALTER TABLE "Water_Pipe_Size_Operator"
  ALTER COLUMN "Organisation_ID" SET NOT NULL;

-- One tick per operator per rule.
CREATE UNIQUE INDEX IF NOT EXISTS wpso_operator_idx
  ON "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID", "Organisation_ID");


-- ── Check ───────────────────────────────────────────────────────
-- The operators the water screen should offer — those working in water:
--   SELECT ou."Name", ou.role_keys
--     FROM "Operator_Utility" ou
--     JOIN "Utility" u ON u."Utility_ID" = ANY (ou.utility_ids)
--    WHERE lower(u."Utility") LIKE 'water%'
--    ORDER BY ou."Name";
--
-- Operators with no utilities assigned at all. These are hidden by the
-- screen and it says so — assign their utilities in Organisations:
--   SELECT "Name", role_keys FROM "Operator_Utility"
--    WHERE CARDINALITY(utility_ids) = 0 ORDER BY "Name";
--
-- Every rule and who it applies to:
--   SELECT w."Diameter_mm", w."Max_Meters",
--          COALESCE(string_agg(o."Name", ', ' ORDER BY o."Name"), 'any operator')
--     FROM "Water_Pipe_Size" w
--     LEFT JOIN "Water_Pipe_Size_Operator" x ON x."Water_Pipe_Size_ID" = w."Water_Pipe_Size_ID"
--     LEFT JOIN "Organisation" o ON o."Organisation_ID" = x."Organisation_ID"
--    GROUP BY w."Water_Pipe_Size_ID", w."Diameter_mm", w."Max_Meters"
--    ORDER BY w."Diameter_mm";
