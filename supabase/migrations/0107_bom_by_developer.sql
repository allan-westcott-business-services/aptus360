-- ════════════════════════════════════════════════════════════════
-- 0107 — the bill, by developer
--
-- A site with two developers on it produces two bills, and until now
-- only one of them: everything drawn, whoever it belongs to. Assigning
-- features to a developer area put the answer on the features; this puts
-- it in the bill.
--
-- A developer column rather than a parameter. One query returns the
-- whole site broken out, so the screen can switch between "everything"
-- and one developer without asking again — and the two are guaranteed to
-- agree, because they are the same rows added up differently.
--
-- ── Shared infrastructure has no developer ──────────────────────
-- The substation, the point of connection and the incomer between them
-- feed the whole site, and the developer assignment leaves them alone on
-- purpose. They come back with a null developer and are shown as shared
-- rather than dropped: a bill for one developer that quietly omits the
-- substation is a bill nobody can reconcile against the site total.
--
-- ── This supersedes 0103 ────────────────────────────────────────
-- The whole function is restated because that is how it has to be
-- changed. Everything from 0101 (cable by type and size) and 0103
-- (joints by kind, and the NULL Feature_Role fix) is here unchanged;
-- running this after either is safe, and running it instead of 0103 is
-- also safe.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS gis_bom(bigint);

CREATE OR REPLACE FUNCTION gis_bom(p_project bigint)
RETURNS TABLE (
  site       text,
  utility    text,
  item       text,
  surface    text,
  unit       text,
  quantity   numeric,
  features   bigint,
  developer_id    bigint,
  developer_name  text
) AS $$
  WITH devs AS (
    -- What each developer on this project is called. The branch name is
    -- what the rest of the application shows; the code is a fallback for
    -- a developer with no branch behind it.
    SELECT pd."Project_Developer_ID" AS id,
           COALESCE(NULLIF(b."Branch_Dropdown", ''), NULLIF(b."Branch_Name", ''),
                    NULLIF(pd."Developer_Code", ''), 'Developer ' || pd."Project_Developer_ID")
             AS name
      FROM "Project_Developer" pd
      LEFT JOIN "Customer_Branch" b ON b."Branch_ID" = pd."Branch_ID"
     WHERE pd."Project_ID" = p_project
  ),
  lines AS (
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
      COUNT(*)                                                         AS features,
      d.id                                                             AS developer_id,
      d.name                                                           AS developer_name
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l         ON l."Layer_Key"    = f."Layer_Key"
    LEFT JOIN "Utility" u           ON u."Utility_ID"   = l."Utility_ID"
    LEFT JOIN "GIS_Line_Type" lt    ON lt."Type_Key"    = f."Attributes" ->> 'Line_Type'
    LEFT JOIN "GIS_Surface_Type" st ON st."Surface_Key" = f."Attributes" ->> 'Surface_Type'
    LEFT JOIN "Electric_Cable_Size" cs
      ON f."Layer_Key" = 'electric'
     AND cs."Cable_Size_ID"::text = f."Attributes" ->> 'VD_Cable_Size_ID'
    LEFT JOIN "Electric_Cable_Type" ct ON ct."Cable_Type_ID" = cs."Cable_Type_ID"
    -- Matched as text for the same reason the cable is: nothing
    -- constrains what ends up in a jsonb field, and one stray value
    -- would fail the whole bill rather than one row.
    LEFT JOIN devs d ON d.id::text = f."Attributes" ->> 'Project_Developer_ID'
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'line'
    GROUP BY 1, 2, 3, 4, 8, 9
  ),
  points AS (
    SELECT
      ''::text                                                AS site,
      COALESCE(u."Utility", l."Label", 'Unassigned')           AS utility,
      CASE
        WHEN ej."Joint_Type" IS NOT NULL THEN ej."Joint_Type"
        WHEN f."Attributes" ->> 'Joint_Type' IS NOT NULL
          THEN initcap(f."Attributes" ->> 'Joint_Type') || ' Joint'
        ELSE initcap(COALESCE(NULLIF(f."Feature_Role", ''), 'Point'))
      END                                                     AS item,
      ''::text                                                AS surface,
      'no.'::text                                             AS unit,
      COUNT(*)::numeric                                       AS quantity,
      COUNT(*)                                                AS features,
      d.id                                                    AS developer_id,
      d.name                                                  AS developer_name
    FROM "GIS_Feature" f
    LEFT JOIN "GIS_Layer" l ON l."Layer_Key"  = f."Layer_Key"
    LEFT JOIN "Utility" u   ON u."Utility_ID" = l."Utility_ID"
    LEFT JOIN "Electric_Joint" ej
      ON ej."Joint_Code" = f."Attributes" ->> 'Joint_Code'
    LEFT JOIN devs d ON d.id::text = f."Attributes" ->> 'Project_Developer_ID'
    WHERE f."Project_ID" = p_project
      AND f."Feature_Type" = 'point'
      -- NULL NOT IN (...) is NULL, which dropped every point with no
      -- role — which is every joint the older placement routine made.
      AND (f."Feature_Role" IS NULL
           OR f."Feature_Role" NOT IN ('plot', 'spannode'))
    GROUP BY 1, 2, 3, 4, 8, 9
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   ORDER BY CASE WHEN b.site = '' THEN 1 ELSE 0 END,
            CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- The split. A null developer is shared plant, or something drawn
-- outside every developer area:
--   SELECT COALESCE(developer_name, '(shared / unassigned)') AS whose,
--          unit, ROUND(SUM(quantity), 1) AS qty
--     FROM gis_bom(<project id>)
--    GROUP BY 1, 2 ORDER BY 1, 2;
--
-- The whole site is the same rows without the grouping, so the parts
-- must add up to it — if they do not, something is assigned twice:
--   SELECT unit, ROUND(SUM(quantity), 1) FROM gis_bom(<project id>)
--    GROUP BY 1;
