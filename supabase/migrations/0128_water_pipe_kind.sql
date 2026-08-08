-- ════════════════════════════════════════════════════════════════
-- 0128 — mains rules and service rules, told apart
--
-- Water_Pipe_Size held one set of rules, and the build read all of them
-- when sizing a main. A service is a different pipe answering a
-- different question — one property, not the estate beyond a point —
-- and its sizes are smaller, its ceilings lower, and its operator may
-- rule on it separately.
--
-- With one list the two could not coexist: a 25mm service rule carrying
-- one plot would have been picked as the smallest pipe that carries one
-- plot, and every short spur of main on the site would have come out
-- 25mm.
--
-- ── Everything already there is a mains rule ──
--
-- Which is what it was, so the column defaults to 'main' and the backfill
-- is the same statement. Nothing changes for a network built before this.
--
-- ── The operators still apply ──
--
-- Water_Pipe_Size_Operator is unchanged: it points at a rule, and a rule
-- is now either mains or service. So "this NAV allows sixteen on 63mm
-- mains and twenty-five metres of 25mm service" is two rules, both named
-- to them, which is what was wanted.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Water_Pipe_Size"
  ADD COLUMN IF NOT EXISTS "Pipe_Kind" text NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'water_pipe_size_kind_check'
  ) THEN
    ALTER TABLE "Water_Pipe_Size"
      ADD CONSTRAINT water_pipe_size_kind_check
      CHECK ("Pipe_Kind" IN ('main', 'service'));
  END IF;
END $$;

COMMENT ON COLUMN "Water_Pipe_Size"."Pipe_Kind" IS
  'main or service. A mains rule sizes the pipe along the trench by the '
  'plots beyond it; a service rule sizes the spur to one property.';

CREATE INDEX IF NOT EXISTS water_pipe_size_kind_idx
  ON "Water_Pipe_Size" ("Pipe_Kind", "Max_Meters");


-- ── Check ───────────────────────────────────────────────────────
-- The two sets, side by side:
--   SELECT "Pipe_Kind", "Diameter_mm", "Max_Meters", "Size_Label"
--     FROM "Water_Pipe_Size" WHERE "Is_Active"
--    ORDER BY "Pipe_Kind", "Max_Meters";
--
-- Everything seeded before this migration should read as mains:
--   SELECT COUNT(*) FROM "Water_Pipe_Size" WHERE "Pipe_Kind" <> 'main';
--
-- A rule and the operators it is written for — unchanged by this, and
-- worth confirming the pair still line up:
--   SELECT w."Pipe_Kind", w."Diameter_mm", o."Name"
--     FROM "Water_Pipe_Size" w
--     JOIN "Water_Pipe_Size_Operator" x ON x."Water_Pipe_Size_ID" = w."Water_Pipe_Size_ID"
--     JOIN "Organisation" o ON o."Organisation_ID" = x."Organisation_ID"
--    ORDER BY 1, 2;
