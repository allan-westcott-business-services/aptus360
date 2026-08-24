-- ════════════════════════════════════════════════════════════════
-- 0187 — reducers are a feature role
--
-- Where a gas main steps down a bore — 180 to 125, 125 to 90, 90 to 63
-- — the change is made with a reducer. The application places them:
-- reducers.js works out where the steps are, placeReducers writes one
-- feature per step and removes the ones whose step has gone.
--
-- All of which has never once reached the database.
--
-- ── Why this was invisible ──
--
-- Feature_Role is constrained to a list, and 'reducer' was never added
-- to it. So every insert is rejected — not silently, but at the point
-- of writing the first reducer, inside a withUndo block, on a routine
-- nobody runs on a drawing they care about twice. The take-off has been
-- short one fitting per size change since the feature shipped.
--
-- It is the same fault as 0181, which added 'hvtt' for exactly this
-- reason, and the same fault as 0165, which rebuilt the list from an
-- older copy and dropped two roles that were in use. The list is the
-- one thing in this schema that has to be restated in full every time,
-- and restating it is where it goes wrong.
--
-- ── The whole list again ──
--
-- Taken from what the application writes, not from 0181. That is the
-- instruction 0168 left and 0181 repeated, and it is the only method
-- that catches a role dropped by the previous statement rather than
-- carrying it forward. `node checklighting.mjs` does the same scan and
-- fails if the two disagree, which is what found this.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** Nothing should be using the role yet, because
-- nothing can. If this returns rows, the constraint was relaxed by hand
-- at some point and the statement below will accept them anyway:
--
--   SELECT "Project_ID", count(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'reducer' GROUP BY 1;

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer'));


-- ── Check ───────────────────────────────────────────────────────
--
-- The list should hold fifteen roles, ending in reducer:
--
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
-- And a reducer should now be accepted. On a project you can throw
-- away:
--
--   INSERT INTO "GIS_Feature"
--     ("Project_ID","Layer_Key","Feature_Type","Feature_Role","Geometry")
--   VALUES (<project>, 'gas', 'point', 'reducer', '[[0,0]]'::jsonb)
--   RETURNING "Feature_ID";
--
-- then delete it again.
--
-- ── Afterwards ──
--
-- Every gas drawing already on the system is short its reducers, and
-- placing them is not automatic — it is Place Reducers on the gas menu,
-- per project. These are the drawings that have gas mains of more than
-- one bore and no reducer against them:
--
--   SELECT f."Project_ID", count(DISTINCT f."Attributes" ->> 'Size') AS bores
--     FROM "GIS_Feature" f
--    WHERE f."Layer_Key" = 'gas'
--      AND f."Feature_Type" = 'line'
--      AND f."Attributes" ->> 'Size' IS NOT NULL
--      AND NOT EXISTS (
--        SELECT 1 FROM "GIS_Feature" r
--         WHERE r."Project_ID" = f."Project_ID"
--           AND r."Feature_Role" = 'reducer')
--    GROUP BY 1 HAVING count(DISTINCT f."Attributes" ->> 'Size') > 1
--    ORDER BY 2 DESC;
-- ════════════════════════════════════════════════════════════════
