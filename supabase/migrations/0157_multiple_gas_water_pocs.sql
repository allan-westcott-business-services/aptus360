-- ════════════════════════════════════════════════════════════════
-- 0157 — a site can be fed from more than one side
--
-- 0057 added a partial unique index allowing one POC per utility per
-- project. That matched what the application did at the time: it took
-- the first POC it found, so a second could only ever be ignored, and
-- the index said so rather than leaving it to convention.
--
-- It is no longer true of gas and water. Two gas mains in different
-- roads, each serving its own part of an estate with the networks never
-- meeting, is an ordinary scheme — and it could not be drawn at all.
--
-- ── Electric keeps the rule ──
--
-- Its POC feeds the substation and the substation feeds every circuit.
-- A second POC would mean a second incomer, which is a different kind
-- of scheme and not one this application draws. A constraint that
-- refuses it is better than a drawing that half-supports it.
--
-- So the index is not dropped, only narrowed: still one POC on the
-- electric layer, and as many as the design needs on the others.
-- ════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS gis_poc_one_per_utility;

CREATE UNIQUE INDEX IF NOT EXISTS gis_poc_one_electric
  ON "GIS_Feature" ("Project_ID")
  WHERE "Feature_Role" = 'poc' AND "Layer_Key" = 'electric';

COMMENT ON INDEX gis_poc_one_electric IS
  'One electric POC per project: it feeds the substation, which feeds every circuit. Gas and water may have several — a site can be fed from more than one side.';


-- ── Check ───────────────────────────────────────────────────────
-- How many POCs each project has, by utility. More than one on gas or
-- water is now expected; more than one on electric is impossible:
--   SELECT "Project_ID", "Layer_Key", count(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'poc'
--    GROUP BY 1, 2
--   HAVING count(*) > 1
--    ORDER BY 1, 2;
