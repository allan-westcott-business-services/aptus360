-- ════════════════════════════════════════════════════════════════
-- 0056 — bill of materials
--
-- Quantities for everything drawn on a project, apart from polygons —
-- a site boundary is a fact about the land, not something anyone orders.
--
-- In the database rather than the browser, for the same reason as the
-- rest of the calculations: it holds however the data is changed,
-- including by hand in the SQL editor, and it reads the same Length_m
-- that gis_length_trg maintains rather than recomputing lengths from
-- geometry and quietly disagreeing with what the canvas shows.
--
-- Lines are summed in metres and points are counted. They can't share a
-- unit, so the unit travels on the row.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS gis_bom(bigint);

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
    -- Surface is blank rather than null so both halves line up in a
    -- spreadsheet without a gap that reads as missing data.
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
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   -- On site, then off site, then anything unclassified: the order the
   -- work happens in, rather than alphabetical.
   ORDER BY CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;

-- Polygons are excluded by the Feature_Type filters rather than by a
-- NOT IN list, so a feature type added later has to be brought in
-- deliberately instead of appearing in quantities by accident.


-- ── Check ───────────────────────────────────────────────────────
--   supabase/checks/0056_bom.sql
