-- ════════════════════════════════════════════════════════════════
-- 0186 — the mains joints booked on a day
--
-- A day of a jointing assignment says which plots are connected on it.
-- It does not say which mains joints are made, and those are a separate
-- decision: a breech joint is a mains joint and can be made on its own,
-- in a visit where none of the plots beyond it are connected. A gang
-- makes A1 on the Monday and connects the plots past it on the Tuesday.
--
-- So the two selections are independent and the day has to carry both.
-- Deriving the joints from the plots chosen would be wrong in exactly
-- the case the planner most needs: the day where a joint is made and
-- nothing is connected.
--
-- ── Stored the way the plots are ──
--
-- Text, in the same shape as Plot_Range: "A1, A4" against "18-22, 35".
-- Not a join table, for the reason Plot_Range is not one — a day's
-- selection is read and written whole, never queried across, and a row
-- per joint per day would be three tables to keep in step for a list
-- that is always used as a list.
--
-- Node labels rather than Feature_IDs. The label is what the drawing,
-- the levels check, the circuit report and the call-off all call that
-- place, and what a gang reads; an id means nothing on site and would
-- put a fifth spelling of "which node" into the schema. A node renamed
-- by hand keeps its booking, which is the behaviour that matches how
-- the rest of the app names them.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** Nothing should come back.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name IN ('Call_Off_Work_Day', 'Call_Off_Assignment')
--      AND column_name = 'Node_Range';


ALTER TABLE "Call_Off_Work_Day"
  -- The mains joints made on this day, by node label: "A1, A4".
  -- Null means none were booked on it, which is the ordinary case on a
  -- day that only connects plots. Empty and null mean the same thing
  -- and both are written as null.
  ADD COLUMN IF NOT EXISTS "Node_Range" text;

COMMENT ON COLUMN "Call_Off_Work_Day"."Node_Range" IS
  'Mains joints made on this day, by span node label, comma separated. Null means none.';


-- The same on the assignment, for a booking that is not split by day.
-- Plot_Range sits there for exactly this reason: a one-day booking
-- records its selection on the assignment and has no day rows to carry
-- it.
ALTER TABLE "Call_Off_Assignment"
  ADD COLUMN IF NOT EXISTS "Node_Range" text;

COMMENT ON COLUMN "Call_Off_Assignment"."Node_Range" IS
  'Mains joints on this booking, by span node label. Per-day selections live on Call_Off_Work_Day.';


-- ── Check ───────────────────────────────────────────────────────
--
-- 1. Both columns exist and are nullable. A NOT NULL would reject every
--    booking that connects plots and makes no joint:
--
--   SELECT table_name, column_name, is_nullable
--     FROM information_schema.columns
--    WHERE column_name = 'Node_Range'
--    ORDER BY table_name;
--
-- 2. Nothing was disturbed \u2014 every existing booking still has its
--    plots and no joints:
--
--   SELECT COUNT(*)                                        AS days,
--          COUNT(*) FILTER (WHERE "Plot_Range" IS NOT NULL) AS with_plots,
--          COUNT(*) FILTER (WHERE "Node_Range" IS NOT NULL) AS with_joints
--     FROM "Call_Off_Work_Day";
--
--   with_joints must be 0. Anything else means this ran twice against
--   different data, or something wrote to it before the app could.
--
-- ── Then ────────────────────────────────────────────────────────
--
--   NOTIFY pgrst, 'reload schema';
--
-- PostgREST caches the schema it started with, so a column added from
-- the SQL editor is invisible to the API until it reloads. That has
-- cost a round twice on this project already \u2014 0184 and 0185.
-- ════════════════════════════════════════════════════════════════
