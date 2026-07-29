-- ════════════════════════════════════════════════════════════════
-- 0075 — span nodes are not materials
--
-- A span node is a numbered point on a circuit — a place on the drawing
-- that measurements are taken from. Nobody orders one, and 0058 excluded
-- plot seeds for exactly the same reason.
--
-- Everything else on the points list stays. A meter, a joint, a link box,
-- a POC, a substation and a lighting column are all things that get
-- bought, whatever else they also are.
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
      COALESCE(u."Utility", l."Label", 'Unassigned')                 AS utility,
      CASE
        WHEN lt."Label" IS NOT NULL THEN lt."Label"
        WHEN f."Attributes" ->> 'Line_Type' IS NOT NULL
          THEN COALESCE(l."Label", f."Layer_Key")
               || ' (unrecognised type: ' || (f."Attributes" ->> 'Line_Type') || ')'
        ELSE COALESCE(l."Label", f."Layer_Key") || ' (no type set)'
      END                                                            AS item,
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
      COALESCE(u."Utility", l."Label", 'Unassigned')           AS utility,
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
      -- Markers, not materials: a plot seed says where a plot is, a span
      -- node is a point measurements are taken from.
      AND f."Feature_Role" NOT IN ('plot', 'spannode')
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   ORDER BY CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;

-- NOT IN rather than IS DISTINCT FROM: Feature_Role is NOT NULL with a
-- default, so there is no null to trip over, and the list reads as what
-- it is — the roles that are not materials.


-- ── Check ───────────────────────────────────────────────────────
-- Expect no plot seeds or span nodes on the bill:
--   SELECT item, unit, quantity FROM gis_bom(<project>) WHERE unit = 'no.';
--
-- The point count should be the project's points less its seeds and span
-- nodes. Expect no rows:
--   WITH bom AS (SELECT SUM(quantity) n FROM gis_bom(<project>) WHERE unit = 'no.'),
--        raw AS (SELECT COUNT(*)::numeric n FROM "GIS_Feature"
--                 WHERE "Project_ID" = <project> AND "Feature_Type" = 'point'
--                   AND "Feature_Role" NOT IN ('plot','spannode'))
--   SELECT bom.n AS on_bill, raw.n AS in_drawing FROM bom, raw
--    WHERE bom.n IS DISTINCT FROM raw.n;
