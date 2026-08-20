-- ════════════════════════════════════════════════════════════════
-- 0185 — the spare length past the last plot
--
-- An LV run stops at the service joint serving the last plot on the
-- leg. The cable does not stop there: the gang digs a little further,
-- lays a short tail and buries the bottle end in it, because a bottle
-- end has to sit in trench like everything else.
--
-- The app draws that tail now rather than relying on the designer to
-- extend the trench by hand. A length nobody can forget is worth more
-- than a rule everybody knows.
--
-- ── Why it is a setting and not a constant ──
--
-- 1.5 m is what our designs use. It is a working practice rather than a
-- law, and the next adopting authority may want two. A number compiled
-- into the drawing routine is one that needs a release to change, and
-- this one belongs beside the volt drop limits it sits with — the same
-- row, read the same way, changed on the same screen.
--
-- ── Where it goes ──
--
-- Electric_VD_Setting, which is the one-row table holding the limits
-- and constants the electric design works to. It already carries
-- Max_Volt_Drop_Pct, Max_Loop_Ohms, the distributed load factor and the
-- unbalanced constant, and is enforced as exactly one row so the app
-- cannot read a different answer depending on scan order.
--
-- Not on the substation, and not on the project: the tail is a property
-- of how we build, not of a particular site or a particular
-- transformer. Putting it on either would mean setting it again on
-- every job.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** Nothing should come back. A row means 0185 has
-- already been run.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'Electric_VD_Setting'
--      AND column_name = 'Bottle_End_Tail_M';


ALTER TABLE "Electric_VD_Setting"
  -- Metres of trench and cable laid past the last service joint on a
  -- run, with the bottle end at the far end of it.
  --
  -- NOT NULL with a default, unlike the nullable columns 0184 added:
  -- there is always an answer, and a null here would leave the drawing
  -- routine choosing one silently. Zero is a legitimate setting and
  -- means "no tail" — the bottle end then sits at the service joint,
  -- which is what the drawing did before this existed.
  ADD COLUMN IF NOT EXISTS "Bottle_End_Tail_M" numeric NOT NULL DEFAULT 1.5;

COMMENT ON COLUMN "Electric_VD_Setting"."Bottle_End_Tail_M" IS
  'Metres of trench and cable past the last service joint on a run, with the bottle end at its far end. 0 means no tail.';


-- ── Check ───────────────────────────────────────────────────────
--
-- 1. The column exists, is not null, and defaults to 1.5:
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'Electric_VD_Setting'
--      AND column_name = 'Bottle_End_Tail_M';
--
-- 2. The one row has it, and the rest of the row is untouched:
--
--   SELECT "Bottle_End_Tail_M", "Max_Volt_Drop_Pct", "Max_Loop_Ohms",
--          "Distributed_Load_Factor", "Unbalanced"
--     FROM "Electric_VD_Setting";
--
--   One row. Bottle_End_Tail_M reads 1.5; every other value is what it
--   was before this ran.
--
-- 3. And still exactly one row, which the app depends on:
--
--   SELECT COUNT(*) FROM "Electric_VD_Setting";
-- ════════════════════════════════════════════════════════════════
