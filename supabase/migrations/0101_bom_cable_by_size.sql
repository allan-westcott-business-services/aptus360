-- ════════════════════════════════════════════════════════════════
-- 0101 — electric cable itemised by type and size
--
-- The bill grouped every electric line by its line type, so all LV
-- feeders came out as one row however many different cables were in
-- them. A single figure of 1,240 m covering 95 mm² and 185 mm² together
-- is not something anyone can order against, and the reader has no way
-- to tell it is mixed.
--
-- So an electric line's item now carries the cable on it: the type from
-- Electric_Cable_Type and the size from Electric_Cable_Size, both, since
-- two constructions of the same size are separate items on a schedule.
--
-- Electric only. A trench is classified by what it is dug through and a
-- water main by its diameter; neither has a cable and neither changes.
--
-- ── Two rows that must not merge ────────────────────────────────
-- A cable with nothing specified gets its own row saying so, rather than
-- joining a sized one. Metres of unspecified cable inside an order
-- quantity is the kind of total that looks complete and is not, and this
-- project has already produced two of those.
--
-- A cable pointing at a catalogue row that no longer exists is named
-- separately again — that is a broken reference, not an unspecified
-- one, and the fix differs.
--
-- ── On and off site ─────────────────────────────────────────────
-- Unchanged, and deliberately so: 0093 confined the site split to
-- trench, because a metre of cable costs what it costs wherever it is
-- laid. Sizing the rows does not alter that.
--
-- Built from the deployed definition as returned by pg_get_functiondef,
-- which for this function matches the repo. Everything outside the item
-- expression and its two new joins is unchanged.
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
      -- Trench is classified; everything else is not. Judged on the
      -- layer rather than the type key so a trench type added later
      -- behaves the same without touching this.
      CASE WHEN f."Layer_Key" = 'trench'
           THEN COALESCE(f."Attributes" ->> 'Site', 'Unclassified')
           ELSE '' END                                                 AS site,
      COALESCE(u."Utility", l."Label", 'Unassigned')                   AS utility,
      CASE
        WHEN lt."Label" IS NOT NULL THEN
          lt."Label"
          -- The cable itself, on electric lines only.
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
    -- The cable on the line.
    --
    -- Matched as text, casting the catalogue's own id rather than the
    -- value out of Attributes. Attributes is jsonb and nothing constrains
    -- what ends up in that field, so one feature holding "185mm2 WAVE"
    -- would fail the entire bill with an invalid input syntax error.
    --
    -- A digits-only guard in this same ON clause does not prevent it:
    -- the planner is free to evaluate the cast before the test, and does.
    -- Not casting the untrusted side at all is the only form that cannot
    -- be reordered into failing.
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
      -- A meter is a meter wherever it sits.
      ''::text                                                AS site,
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
   -- Trench first, since it is the part with a site breakdown to read.
   ORDER BY CASE WHEN b.site = '' THEN 1 ELSE 0 END,
            CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- Electric rows should now name a cable. Anything reading "cable not
-- set" is a run nobody has specified — real, and worth chasing before
-- the quantities are ordered against:
--   SELECT item, unit, quantity FROM gis_bom(<project id>)
--    WHERE utility = 'Electric' ORDER BY item;
--
-- The site split is still trench alone, unchanged by this:
--   SELECT DISTINCT site, utility FROM gis_bom(<project id>) ORDER BY 2, 1;
