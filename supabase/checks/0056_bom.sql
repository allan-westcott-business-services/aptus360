-- ════════════════════════════════════════════════════════════════
-- 0056 check — bill of materials
--
-- Safe: read-only. Changes nothing.
-- Replace <project> with a project id throughout.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Is the function there? ────────────────────────────────────
-- Expect: true.
SELECT to_regprocedure('gis_bom(bigint)') IS NOT NULL AS have_bom_function;


-- ── 2. The bill itself ───────────────────────────────────────────
SELECT * FROM gis_bom(<project>);


-- ── 3. Does it agree with the features it came from? ─────────────
-- Expect: no rows. The function's metres must equal the sum of the
-- cached Length_m on the lines it aggregated — if these disagree the
-- grouping has dropped or double-counted something.
WITH bom AS (
  SELECT SUM(quantity) AS m FROM gis_bom(<project>) WHERE unit = 'm'
), raw AS (
  SELECT ROUND(SUM(COALESCE(("Attributes" ->> 'Length_m')::numeric, 0)), 2) AS m
    FROM "GIS_Feature"
   WHERE "Project_ID" = <project> AND "Feature_Type" = 'line'
)
SELECT bom.m AS bom_metres, raw.m AS feature_metres
  FROM bom, raw
 WHERE ROUND(bom.m, 1) IS DISTINCT FROM ROUND(raw.m, 1);


-- ── 4. Same for the counts ───────────────────────────────────────
-- Expect: no rows.
WITH bom AS (
  SELECT SUM(quantity) AS n FROM gis_bom(<project>) WHERE unit = 'no.'
), raw AS (
  SELECT COUNT(*)::numeric AS n FROM "GIS_Feature"
   WHERE "Project_ID" = <project> AND "Feature_Type" = 'point'
)
SELECT bom.n AS bom_points, raw.n AS feature_points
  FROM bom, raw
 WHERE bom.n IS DISTINCT FROM raw.n;


-- ── 5. Polygons must not appear ──────────────────────────────────
-- Expect: no rows. The boundary is not a material.
SELECT "Feature_ID", "Layer_Key", "Label"
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project> AND "Feature_Type" = 'polygon'
   AND EXISTS (SELECT 1 FROM gis_bom(<project>) b WHERE b.item = "Label");


-- ── 6. What is still unclassified ────────────────────────────────
-- Not a fault, but every row here is quantity that can't be split
-- between on site and off site — which is the split the bill exists
-- for. Lines get classified by being redrawn; points by Auto Service.
SELECT "Feature_Type",
       COALESCE("Attributes" ->> 'Line_Type', "Feature_Role", "Layer_Key") AS kind,
       COUNT(*) AS features,
       ROUND(SUM(COALESCE(("Attributes" ->> 'Length_m')::numeric, 0)), 1) AS metres
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project>
   AND "Feature_Type" <> 'polygon'
   AND "Attributes" ->> 'Site' IS NULL
 GROUP BY 1, 2
 ORDER BY 1, 2;


-- ── 7. Off-site trench with no surface ───────────────────────────
-- The reinstatement gap: metres that will be dug through something, but
-- nobody has said what.
SELECT COUNT(*) AS runs,
       ROUND(SUM(COALESCE(("Attributes" ->> 'Length_m')::numeric, 0)), 1) AS metres
  FROM "GIS_Feature"
 WHERE "Project_ID" = <project>
   AND "Layer_Key" = 'trench'
   AND "Attributes" ->> 'Site' = 'Off-site'
   AND COALESCE("Attributes" ->> 'Surface_Type', '') = '';
