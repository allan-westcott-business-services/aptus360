-- ════════════════════════════════════════════════════════════════
-- 0132 — a planner colour per person
--
-- The Planning board groups the schedule by project manager, and a
-- group header the colour of every other group header is a grouping
-- nobody can read at a glance. So each person carries a colour, chosen
-- on the board and stored here.
--
-- ── Why on Person rather than in the board ──
--
-- The original holds it on Person for the same reason, and it is the
-- right place: it is a fact about somebody that outlives the session,
-- and two planners looking at the same schedule should see the same
-- colours. A palette assigned by position would renumber itself the
-- moment a manager took on their first job or finished their last.
--
-- ── Nullable, and meaning nothing ──
--
-- Null is "nobody has chosen", and the board draws that group in the
-- neutral slate it always used. Not defaulted to a colour: a default
-- would make every manager look deliberately coloured, and there would
-- be no way to tell the ones somebody had actually set.
--
-- Nothing looks different until a colour is chosen.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "Planner_Colour" text;

COMMENT ON COLUMN "Person"."Planner_Colour" IS
  'Colour for this person''s group on the Planning board. Null means '
  'none chosen, which draws in the neutral grey.';


-- ── Check ───────────────────────────────────────────────────────
-- Who has a colour, and who has not. Only people who manage a project
-- ever appear on the board, so the rest being null is expected:
--   SELECT p."Person_Name", p."Planner_Colour",
--          COUNT(pr."Project_ID") AS projects_managed
--     FROM "Person" p
--     LEFT JOIN "Project" pr ON pr."Project_Manager_ID" = p."Person_ID"
--    GROUP BY p."Person_ID", p."Person_Name", p."Planner_Colour"
--   HAVING COUNT(pr."Project_ID") > 0
--    ORDER BY p."Person_Name";
--
-- Clearing one puts that group back to the neutral grey:
--   UPDATE "Person" SET "Planner_Colour" = NULL WHERE "Person_ID" = <id>;
