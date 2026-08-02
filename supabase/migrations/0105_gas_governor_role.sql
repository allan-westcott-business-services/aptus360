-- ════════════════════════════════════════════════════════════════
-- 0105 — a gas governor is a thing that can be drawn
--
-- Feature_Role is a checked list, and 'governor' is not on it — so
-- placing one fails on the constraint rather than on anything the
-- application says, with an error nobody outside the database would
-- recognise.
--
-- The gas equivalent of a substation: where the incoming supply is
-- reduced and metered before it feeds the site. Its own role rather than
-- reusing 'source', because the two are separate items on a schedule and
-- a drawing that calls both the same thing cannot count either.
--
-- The whole list is restated because that is how a CHECK constraint is
-- changed; nothing else in it moves.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor'));


-- ── Check ───────────────────────────────────────────────────────
-- The constraint as it now stands:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
-- What has been placed, by role — a governor should appear here once one
-- is drawn:
--   SELECT "Feature_Role", COUNT(*) FROM "GIS_Feature"
--    WHERE "Project_ID" = <project id> AND "Feature_Type" = 'point'
--    GROUP BY 1 ORDER BY 2 DESC;
