-- ════════════════════════════════════════════════════════════════
-- 0181 — High volume top tees
--
-- Where a gas service leaves the main, the connection is made with a
-- top tee: a fitting clamped around the main with an outlet taking the
-- service off it. Every gas service has one, so a drawing that shows
-- the services and not the tees is short one fitting per plot on the
-- take-off schedule.
--
-- The application now places them — after the gas services are laid,
-- and on demand for a drawing that has none. They are real features
-- rather than a mark drawn each frame, because a fitting has to be
-- selectable, movable and deletable like anything else in the ground.
--
-- ── Why a migration at all ──
--
-- Feature_Role is constrained to a list, so without this every attempt
-- to place one is rejected by the database and the routine fails on its
-- first write.
--
-- ── The whole list again ──
--
-- Restated from what the application writes rather than from the
-- previous statement of it. That is the instruction 0168 left, and it
-- left it because 0165 rebuilt the list from 0105 and dropped
-- servicevalve and pumping on the way — both of which the application
-- had been writing for months.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** Nothing should be using the role yet. If this
-- returns rows, an earlier attempt got through and the constraint below
-- will accept them anyway:
--
--   SELECT "Project_ID", count(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'hvtt' GROUP BY 1;

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt'));


-- ── Check ───────────────────────────────────────────────────────
--
-- The list should hold fourteen roles, ending in hvtt:
--
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
-- And a tee should now be accepted. On a project you can throw away:
--
--   INSERT INTO "GIS_Feature"
--     ("Project_ID","Layer_Key","Feature_Type","Feature_Role","Geometry")
--   VALUES (<project>, 'gas', 'point', 'hvtt', '[[0,0]]'::jsonb)
--   RETURNING "Feature_ID";
--
-- then delete it again.
-- ════════════════════════════════════════════════════════════════
