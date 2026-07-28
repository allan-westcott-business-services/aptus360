-- ════════════════════════════════════════════════════════════════
-- 0057 — POC, substation, circuits
--
-- Three things from the original that this app had no room for.
--
--   A POC is where the site's network meets the DNO's. One per utility,
--   carrying the agreed output — kVA for electric, kW for gas, litres a
--   second for water.
--
--   A substation is always electric and sits on the site. Circuits feed
--   back to it and it connects on to the POC. It has a number of LV
--   ways, each with a fuse, and each way carries one circuit.
--
--   A circuit is a group of plots. Membership lives on each plot's
--   electric meter rather than in a table of its own, exactly as the
--   original has it: a plot moves between circuits by one attribute
--   changing, with nothing else to rebuild or fall out of step.
--
-- Feature_Role is the blocker. 0042 constrained it to shape, plot and
-- meter, so a POC or a substation could not be stored at all — the
-- insert fails on a check constraint, which reads like a bad request
-- rather than a missing migration.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN ('shape','plot','meter','poc','substation','joint','source'));
-- joint and source are in the list because the canvas and the GIS Styles
-- screen have offered them as point roles since 0051, with no way for a
-- feature to hold one. Adding them here costs nothing and closes a gap
-- that would have surfaced as a puzzling failure later.

-- One POC per utility per project, as the original assumes when it takes
-- the first it finds. A partial unique index says so rather than leaving
-- it to convention.
CREATE UNIQUE INDEX IF NOT EXISTS gis_poc_one_per_utility
  ON "GIS_Feature" ("Project_ID", "Layer_Key")
  WHERE "Feature_Role" = 'poc';

-- Circuit membership is queried per project whenever a circuit is
-- defined, deleted or reported on.
CREATE INDEX IF NOT EXISTS gis_feature_circuit_idx
  ON "GIS_Feature" ("Project_ID", (("Attributes" ->> 'Circuit_ID')))
  WHERE "Feature_Role" = 'meter';


-- ── How they are drawn ───────────────────────────────────────────
-- A substation is the biggest thing on an LV drawing and should read as
-- such; a POC is a terminal and takes the hexagon. Sizes are half-width,
-- as everywhere else in GIS_Style.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Substation', 'substation', 'square',  11, '#dc2626', 180,
   'On-site substation. Circuits feed back to it and it connects on to the POC.'),
  ('Point of connection', 'poc', 'hexagon', 9, '#0f766e', 185,
   'Where the network meets the DNO''s. One per utility.')
ON CONFLICT DO NOTHING;


-- ── Check ───────────────────────────────────────────────────────
-- Expect: the constraint listing seven roles.
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
-- Circuits as defined, with their load. A circuit whose amps exceed the
-- way fuse is worth knowing about before the cabling is drawn:
--   SELECT f."Attributes" ->> 'Circuit_Name'   AS circuit,
--          f."Attributes" ->> 'Circuit_Letter' AS letter,
--          COUNT(*)                            AS meters,
--          ROUND(SUM(COALESCE(pl."KVA_Load", 0)), 1) AS kva
--     FROM "GIS_Feature" f
--     LEFT JOIN "Plot" pl ON pl."Plot_ID" = f."Plot_ID"
--    WHERE f."Project_ID" = <project>
--      AND f."Feature_Role" = 'meter'
--      AND f."Layer_Key" = 'electric'
--      AND f."Attributes" ->> 'Circuit_ID' IS NOT NULL
--    GROUP BY 1, 2
--    ORDER BY 2;
--
-- Which way each circuit sits on:
--   SELECT "Label", "Attributes" -> 'Way_Circuits' AS ways
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project> AND "Feature_Role" = 'substation';
