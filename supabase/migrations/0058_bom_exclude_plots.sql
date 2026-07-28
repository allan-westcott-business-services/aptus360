-- ════════════════════════════════════════════════════════════════
-- 0058 — plot seeds are not materials
--
-- 0056 counted every point on the drawing. A plot seed is a marker
-- saying where a plot sits, not something anyone orders, so it has no
-- place on a bill of materials — it inflates the point count and adds a
-- line nobody can price.
--
-- Everything else stays. A meter, a joint, a POC and a substation are
-- all materials, whatever else they also are.
--
-- The return type is unchanged, so CREATE OR REPLACE is enough — no DROP
-- needed, and callers keep working through the swap.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gis_bom(p_project bigint)
RETURNS TABLE (
  site      text,
  utility   text,
  item      text,
  surface   text,
  unit      text,
  quantity  numeric,
  features  bigint
) AS $$
  WITH lines AS (
    SELECT
      COALESCE(f."Attributes" ->> 'Site', 'Unclassified')            AS site,
      COALESCE(u."Utility", 'None')                                 AS utility,
      COALESCE(lt."Label", l."Label", f."Layer_Key")                 AS item,
      COALESCE(st."Label", '')                                       AS surface,
      'm'::text                                                      AS unit,
      ROUND(SUM(COALESCE((f."Attributes" ->> 'Length_m')::numeric, 0)), 2) AS quantity,
      COUNT(*)                                                       AS features
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l         ON l."Layer_Key"    = f."Layer_Key"
    LEFT JOIN "Utility" u           ON u."Utility_ID"   = l."Utility_ID"
    LEFT JOIN "GIS_Line_Type" lt    ON lt."Type_Key"    = f."Attributes" ->> 'Line_Type'
    LEFT JOIN "GIS_Surface_Type" st ON st."Surface_Key" = f."Attributes" ->> 'Surface_Type'
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'line'
    GROUP BY 1, 2, 3, 4
  ),
  points AS (
    SELECT
      COALESCE(f."Attributes" ->> 'Site', 'Unclassified')      AS site,
      COALESCE(u."Utility", 'None')                           AS utility,
      initcap(COALESCE(NULLIF(f."Feature_Role", ''), 'Point')) AS item,
      ''::text                                                AS surface,
      'no.'::text                                             AS unit,
      COUNT(*)::numeric                                       AS quantity,
      COUNT(*)                                                AS features
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l ON l."Layer_Key"  = f."Layer_Key"
    LEFT JOIN "Utility" u   ON u."Utility_ID" = l."Utility_ID"
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'point'
      -- A plot seed marks where a plot is. Nobody orders one.
      AND f."Feature_Role" IS DISTINCT FROM 'plot'
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   ORDER BY CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;


-- ── On the 'None' utility ───────────────────────────────────────
-- Utility comes from the feature's layer, through GIS_Layer.Utility_ID,
-- which 0051 filled in by matching layer names to utility names. 'None'
-- means that layer has no utility, and there are two quite different
-- reasons it can appear.
--
-- Correct: a trench is not electric or gas — it is a hole that may carry
-- several, which is why it carries a surface instead. Notes are the same.
--
-- Not correct: an electric, gas or water layer whose name didn't match a
-- utility, so the backfill missed it and its cables land under 'None'
-- alongside the trenches. This query tells the two apart — anything
-- other than boundary, plot, trench and note appearing here is the
-- second kind:
--
--   SELECT l."Layer_Key", l."Label", u."Utility"
--     FROM "GIS_Layer" l
--     LEFT JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
--    WHERE l."Is_Active"
--    ORDER BY l."Sort_Order";
--
-- To fix one by hand:
--   UPDATE "GIS_Layer" SET "Utility_ID" =
--          (SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = 'Electric')
--    WHERE "Layer_Key" = 'electric';


-- ── Check ───────────────────────────────────────────────────────
--   supabase/checks/0056_bom.sql — query 4 now expects the bill's point
--   count to equal the project's points minus its plot seeds.
