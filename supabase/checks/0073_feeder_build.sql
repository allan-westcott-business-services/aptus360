-- ════════════════════════════════════════════════════════════════
-- Why didn't Build LV Network draw anything?
--
-- Two quite different faults look identical on screen: nothing was
-- created, or things were created and aren't drawing. Query 1 settles
-- which, and the rest explain the first case.
--
-- Safe: read-only.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Were any feeders created? ─────────────────────────────────
-- Rows here mean the build worked and the problem is display — check
-- 0073 has been run, since an unknown line type has no colour or width
-- to draw with, and check the Electric menu isn't hiding LV feeder.
SELECT "Feature_ID", "Label",
       "Attributes" ->> 'Circuit_Letter' AS circuit,
       "Attributes" ->> 'Meters'         AS meters,
       "Attributes" ->> 'Cables'         AS cables,
       jsonb_array_length("Geometry")    AS points
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project>
   AND "Attributes" ->> 'Line_Type' = 'elec_feeder'
 ORDER BY "Feature_ID";

-- Does the line type exist? Without it feeders draw with no style.
SELECT "Type_Key", "Label", "Layer_Key", "Colour", "Is_Active"
  FROM "GIS_Line_Type" WHERE "Type_Key" = 'elec_feeder';


-- ── 2. Is there a circuit to build? ──────────────────────────────
SELECT "Attributes" ->> 'Circuit_Letter' AS circuit,
       "Attributes" ->> 'Circuit_Name'   AS name,
       COUNT(*)                          AS meters
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project>
   AND "Feature_Role" = 'meter' AND "Layer_Key" = 'electric'
   AND "Attributes" ->> 'Circuit_ID' IS NOT NULL
 GROUP BY 1, 2 ORDER BY 1;


-- ── 3. Are those meters linked to a plot seed? ───────────────────
-- The build scopes each circuit to its seeds. A meter with neither a
-- Seed_Feature_ID nor a Plot_ID that matches a seed is invisible to it,
-- and if none of a circuit's meters resolve, that circuit routes nothing.
SELECT m."Feature_ID", m."Label",
       m."Attributes" ->> 'Seed_Feature_ID' AS seed_attr,
       m."Plot_ID",
       (SELECT COUNT(*) FROM "GIS_Feature" s
         WHERE s."Project_ID" = m."Project_ID" AND s."Feature_Role" = 'plot'
           AND (s."Feature_ID"::text = m."Attributes" ->> 'Seed_Feature_ID'
                OR s."Plot_ID" = m."Plot_ID")) AS seeds_found
  FROM "GIS_Feature" m
 WHERE m."Project_ID" = <project>
   AND m."Feature_Role" = 'meter' AND m."Layer_Key" = 'electric'
   AND m."Attributes" ->> 'Circuit_ID' IS NOT NULL
 ORDER BY m."Feature_ID";


-- ── 4. Is there a trench network, and a substation on it? ────────
-- Cables route along trenches. No trenches, no cables.
SELECT "Attributes" ->> 'Line_Type' AS line_type, COUNT(*) AS runs,
       ROUND(SUM(("Attributes" ->> 'Length_m')::numeric), 1) AS metres
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project> AND "Feature_Type" = 'line'
   AND "Attributes" ->> 'Line_Type' LIKE 'trench%'
 GROUP BY 1 ORDER BY 1;

SELECT "Feature_ID", "Label", "Geometry" -> 0 AS at
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project> AND "Feature_Role" = 'substation';
