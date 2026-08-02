-- ════════════════════════════════════════════════════════════════
-- 0103 — joints itemised by type
--
-- Every joint came out of the bill as one line reading "Joint". A breech
-- joint, a service joint and a straight joint are three different items
-- at three different costs, and a single count of them is not something
-- anyone can order or price against.
--
-- The type is on the feature: Joint_Code where the placement wrote one,
-- Joint_Type in every case. Preferring the code means the name comes
-- from the Electric_Joint catalogue, so renaming a joint type in Admin
-- renames it on the bill rather than leaving the two disagreeing.
--
-- ── A second fault, fixed in passing ────────────────────────────
-- The points half excluded rows with:
--
--     AND f."Feature_Role" NOT IN ('plot', 'spannode')
--
-- NULL NOT IN (...) is NULL, not true, so every point with no role was
-- dropped from the bill entirely. The older gis_place_joints routine
-- writes Joint_Type but no Feature_Role, so joints placed by it have
-- never been counted at all — silently, and in the direction that makes
-- a bill look complete while being short.
--
-- Written so a point is excluded only when it really is a marker.
--
-- Everything outside the points CTE is 0101 unchanged.
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
      CASE WHEN f."Layer_Key" = 'trench'
           THEN COALESCE(f."Attributes" ->> 'Site', 'Unclassified')
           ELSE '' END                                                 AS site,
      COALESCE(u."Utility", l."Label", 'Unassigned')                   AS utility,
      CASE
        WHEN lt."Label" IS NOT NULL THEN
          lt."Label"
          || CASE
               WHEN f."Layer_Key" <> 'electric' THEN ''
               WHEN cs."Cable_Size_ID" IS NOT NULL THEN
                 ' — ' || COALESCE(ct."Cable_Type" || ' ', '') || cs."Size_Label"
               WHEN f."Attributes" ->> 'VD_Cable_Size_ID' IS NOT NULL THEN
                 ' (cable not in the catalogue)'
               ELSE ' (cable not set)'
             END
        WHEN f."Attributes" ->> 'Line_Type' IS NOT NULL
          THEN COALESCE(l."Label", f."Layer_Key")
               || ' (unrecognised type: ' || (f."Attributes" ->> 'Line_Type') || ')'
        ELSE COALESCE(l."Label", f."Layer_Key") || ' (no type set)'
      END                                                              AS item,
      COALESCE(st."Label", '')                                         AS surface,
      'm'::text                                                        AS unit,
      ROUND(SUM(COALESCE((f."Attributes" ->> 'Length_m')::numeric, 0)), 2) AS quantity,
      COUNT(*)                                                         AS features
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l         ON l."Layer_Key"    = f."Layer_Key"
    LEFT JOIN "Utility" u           ON u."Utility_ID"   = l."Utility_ID"
    LEFT JOIN "GIS_Line_Type" lt    ON lt."Type_Key"    = f."Attributes" ->> 'Line_Type'
    LEFT JOIN "GIS_Surface_Type" st ON st."Surface_Key" = f."Attributes" ->> 'Surface_Type'
    LEFT JOIN "Electric_Cable_Size" cs
      ON f."Layer_Key" = 'electric'
     AND cs."Cable_Size_ID"::text = f."Attributes" ->> 'VD_Cable_Size_ID'
    LEFT JOIN "Electric_Cable_Type" ct ON ct."Cable_Type_ID" = cs."Cable_Type_ID"
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'line'
    GROUP BY 1, 2, 3, 4
  ),
  points AS (
    SELECT
      ''::text                                                AS site,
      COALESCE(u."Utility", l."Label", 'Unassigned')           AS utility,
      CASE
        -- A joint, named by what kind it is. The catalogue first, so the
        -- bill says whatever Admin says.
        WHEN ej."Joint_Type" IS NOT NULL THEN ej."Joint_Type"
        -- Placed before the codes existed, or by the older routine:
        -- named from the type it does carry rather than lumped in with
        -- everything else.
        WHEN f."Attributes" ->> 'Joint_Type' IS NOT NULL
          THEN initcap(f."Attributes" ->> 'Joint_Type') || ' Joint'
        ELSE initcap(COALESCE(NULLIF(f."Feature_Role", ''), 'Point'))
      END                                                     AS item,
      ''::text                                                AS surface,
      'no.'::text                                             AS unit,
      COUNT(*)::numeric                                       AS quantity,
      COUNT(*)                                                AS features
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l ON l."Layer_Key"  = f."Layer_Key"
    LEFT JOIN "Utility" u   ON u."Utility_ID" = l."Utility_ID"
    -- Matched on the code the placement writes. Left join, so a joint
    -- with a code that is not in the catalogue still appears — named
    -- from its own type rather than vanishing.
    LEFT JOIN "Electric_Joint" ej
      ON ej."Joint_Code" = f."Attributes" ->> 'Joint_Code'
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'point'
      -- Markers, not materials: a plot seed says where a plot is, a span
      -- node is a point measurements are taken from.
      --
      -- Written as an explicit IS NULL test rather than NOT IN, because
      -- NULL NOT IN (...) is NULL and dropped every point with no role —
      -- which is every joint the older placement routine ever made.
      AND (f."Feature_Role" IS NULL
           OR f."Feature_Role" NOT IN ('plot', 'spannode'))
    GROUP BY 1, 2, 3, 4
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   ORDER BY CASE WHEN b.site = '' THEN 1 ELSE 0 END,
            CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- Joints, by kind. A single "Joint" row left in here means those
-- features carry neither a code nor a type:
--   SELECT item, quantity FROM gis_bom(<project id>)
--    WHERE unit = 'no.' ORDER BY item;
--
-- Joints on the drawing that the bill can name, and those it cannot:
--   SELECT "Attributes" ->> 'Joint_Code' AS code,
--          "Attributes" ->> 'Joint_Type' AS type,
--          "Feature_Role", COUNT(*)
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project id> AND "Feature_Type" = 'point'
--      AND ("Feature_Role" = 'joint' OR "Attributes" ? 'Joint_Type')
--    GROUP BY 1, 2, 3;
