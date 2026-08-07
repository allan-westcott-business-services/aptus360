-- ════════════════════════════════════════════════════════════════
-- 0119 — a water pipe size rule may name several operators
--
-- 0118 put DNO_ID and IDNO_ID on Water_Pipe_Size, one of each. That
-- holds while a rule belongs to one operator and breaks the moment two
-- of them share a standard — which is the ordinary case, not the odd
-- one: most NAVs work to the same twenty-per-63mm figure and a handful
-- differ. Under 0118 the only way to say "these four, but not that one"
-- was four identical rows per diameter, maintained in parallel forever.
--
-- So the operators move to a table of their own, as Team_Craft and
-- Team_Region already do for teams. The house pattern for a
-- many-to-many here is a junction table and a row of checkboxes, and
-- this is that.
--
-- ── A row names one operator ──
--
-- Either a DNO or an IDNO, never both and never neither. Both would be
-- a single row claiming to be two different assignments, and the
-- resolution would have to guess which was meant; neither would be a
-- row that says nothing while looking like it says something. The check
-- constraint refuses both.
--
-- ── No rows means everyone ──
--
-- A rule with no operator rows is the house standard and applies to any
-- project — the same meaning "both columns empty" carried in 0118, and
-- what the seeded 63mm row keeps being. That is why this migration can
-- copy the old columns across and drop them without anything changing
-- for a database where nobody had scoped a rule yet.
--
-- ── The uniqueness goes ──
--
-- 0118's index was (Diameter_mm, DNO_ID, IDNO_ID), which cannot be
-- expressed once the operators are rows: "one rule per diameter per set
-- of operators" is not a constraint a unique index can carry. Dropped
-- rather than approximated. Two rules that both apply to the same
-- project and the same diameter are resolved by the build the same way
-- it resolves everything else — the one naming the operator wins, and
-- of two equally specific rules the lower Display_Order does — so the
-- outcome is defined even where the table is untidy.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Water_Pipe_Size_Operator" (
  "Water_Pipe_Size_Operator_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Water_Pipe_Size_ID" bigint NOT NULL
    REFERENCES "Water_Pipe_Size" ("Water_Pipe_Size_ID") ON DELETE CASCADE,
  "DNO_ID"  bigint REFERENCES "DNO"  ("DNO_ID"),
  "IDNO_ID" bigint REFERENCES "IDNO" ("IDNO_ID"),

  CONSTRAINT water_pipe_size_operator_one CHECK (
    ("DNO_ID" IS NULL) <> ("IDNO_ID" IS NULL))
);

CREATE INDEX IF NOT EXISTS wpso_size_idx
  ON "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID");

-- One assignment per operator per rule. Ticking a box that is already
-- ticked should be impossible rather than merely pointless.
CREATE UNIQUE INDEX IF NOT EXISTS wpso_idno_idx
  ON "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID", "IDNO_ID")
  WHERE "IDNO_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wpso_dno_idx
  ON "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID", "DNO_ID")
  WHERE "DNO_ID" IS NOT NULL;


-- ── Carry across what 0118 recorded ────────────────────────────
-- Guarded so this runs against a database that has the old columns and
-- one that never got them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Water_Pipe_Size' AND column_name = 'IDNO_ID'
  ) THEN
    INSERT INTO "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID", "IDNO_ID")
    SELECT "Water_Pipe_Size_ID", "IDNO_ID" FROM "Water_Pipe_Size"
     WHERE "IDNO_ID" IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID", "DNO_ID")
    SELECT "Water_Pipe_Size_ID", "DNO_ID" FROM "Water_Pipe_Size"
     WHERE "DNO_ID" IS NOT NULL
    ON CONFLICT DO NOTHING;

    /* The old index first: it is defined over the columns about to go,
       and dropping the columns would take it with them anyway — said
       here so the order is deliberate rather than incidental. */
    DROP INDEX IF EXISTS water_pipe_size_rule_idx;

    ALTER TABLE "Water_Pipe_Size"
      DROP COLUMN "IDNO_ID",
      DROP COLUMN "DNO_ID";
  END IF;
END $$;


-- ── Check ───────────────────────────────────────────────────────
-- Every rule and who it applies to:
--   SELECT w."Diameter_mm", w."Max_Meters",
--          COALESCE(string_agg(COALESCE(i."IDNO_Name", d."DNO_Name"), ', '
--                              ORDER BY COALESCE(i."IDNO_Name", d."DNO_Name")),
--                   'any operator') AS applies_to
--     FROM "Water_Pipe_Size" w
--     LEFT JOIN "Water_Pipe_Size_Operator" o ON o."Water_Pipe_Size_ID" = w."Water_Pipe_Size_ID"
--     LEFT JOIN "IDNO" i ON i."IDNO_ID" = o."IDNO_ID"
--     LEFT JOIN "DNO"  d ON d."DNO_ID"  = o."DNO_ID"
--    WHERE w."Is_Active"
--    GROUP BY w."Water_Pipe_Size_ID", w."Diameter_mm", w."Max_Meters"
--    ORDER BY w."Diameter_mm";
--
-- The constraint, which should refuse both of these:
--   INSERT INTO "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID") VALUES (1);
--   INSERT INTO "Water_Pipe_Size_Operator" ("Water_Pipe_Size_ID","DNO_ID","IDNO_ID")
--        VALUES (1, 1, 1);
