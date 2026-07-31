-- ════════════════════════════════════════════════════════════════
-- 0093 — the site split belongs to trench alone
--
-- Everything in the bill was broken down by on-site and off-site.
-- Trench needs it: what a trench is dug through and reinstated to
-- differs either side of the boundary, and so does the rate.
--
-- Nothing else does. A metre of cable costs what it costs wherever it is
-- laid, and a meter is a meter. Splitting them anyway doubles the rows,
-- makes every quantity something to add up by hand, and invites the
-- reader to look for a difference that is not there.
--
-- So the site column carries a value on trench rows and is blank
-- elsewhere, and the totals for cable and materials come out whole.
--
-- Unclassified is kept as a value rather than folded into on-site: a
-- trench with no classification is a question, and a bill that answers
-- it silently is worse than one that shows it.
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
        WHEN lt."Label" IS NOT NULL THEN lt."Label"
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
-- Trench rows carry a site; nothing else does:
--   SELECT site, item, surface, unit, quantity FROM gis_bom(<project>)
--    ORDER BY site, item;
--
-- Expect only trench items to have a site:
--   SELECT DISTINCT site, item FROM gis_bom(<project>) WHERE site <> '';
--
-- Cable should now total once, not twice. Compare with what you had:
--   SELECT item, SUM(quantity) FROM gis_bom(<project>)
--    WHERE unit = 'm' AND site = '' GROUP BY 1 ORDER BY 1;
