-- ════════════════════════════════════════════════════════════════
-- 0126 — point items are named, not initcapped
--
-- The bill built a point's item with initcap on the role key. That works
-- for 'meter' and fails for everything else the register has grown:
--
--   servicevalve  ->  Servicevalve
--   linkbox       ->  Linkbox
--   poc           ->  Poc
--   column        ->  Column
--   governor      ->  Governor
--
-- A bill is read by somebody ordering against it, and none of those is
-- what the thing is called. There is no rule that turns servicevalve
-- into "Service Valve" and poc into "POC" — the names are facts about
-- the trade rather than about the string — so they are listed.
--
-- initcap stays as the fallback. A role added later still reads as
-- something rather than as a blank, and it stands out on the bill as
-- the one that has not been named yet.
--
-- Built from the deployed definition in 0122. Nothing outside the point
-- item expression changes.
-- ════════════════════════════════════════════════════════════════

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
               -- The cable, on electric.
               WHEN f."Layer_Key" = 'electric' THEN
                 CASE
                   WHEN cs."Cable_Size_ID" IS NOT NULL THEN
                     ' — ' || COALESCE(ct."Cable_Type" || ' ', '') || cs."Size_Label"
                   WHEN f."Attributes" ->> 'VD_Cable_Size_ID' IS NOT NULL THEN
                     ' (cable not in the catalogue)'
                   ELSE ' (cable not set)'
                 END
               -- And the diameter, on water. Same four cases as the
               -- cable, and for the same reasons — with one more, for
               -- the pipes drawn before there was a table to point at.
               WHEN f."Layer_Key" = 'water' THEN
                 CASE
                   WHEN wp."Water_Pipe_Size_ID" IS NOT NULL THEN
                     ' — ' || COALESCE(NULLIF(wp."Size_Label", ''),
                                       wp."Diameter_mm"::text || 'mm')
                   WHEN f."Attributes" ->> 'Water_Pipe_Size_ID' IS NOT NULL THEN
                     ' (pipe size not in the catalogue)'
                   -- Typed by hand, before the size became a choice from
                   -- a table. Itemised as what it says rather than
                   -- called unset: it is a real size somebody wrote, and
                   -- burying 400 m of 63mm in a row marked "not set"
                   -- loses a quantity that is perfectly orderable.
                   WHEN NULLIF(f."Attributes" ->> 'Size', '') IS NOT NULL THEN
                     ' — ' || (f."Attributes" ->> 'Size')
                   ELSE ' (pipe size not set)'
                 END
               ELSE ''
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
    -- The pipe on a water line. Matched as text against the catalogue's
    -- own id, never casting the value out of Attributes: jsonb holds
    -- whatever was written into it, and one feature carrying "63mm"
    -- where an id was expected would fail the entire bill with an
    -- invalid input syntax error rather than spoiling one row. A
    -- digits-only guard in the same ON clause does not help — the
    -- planner may evaluate the cast first, and does.
    LEFT JOIN "Water_Pipe_Size" wp
      ON f."Layer_Key" = 'water'
     AND wp."Water_Pipe_Size_ID"::text = f."Attributes" ->> 'Water_Pipe_Size_ID'
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
        -- Named, not initcapped.
        --
        -- initcap turns a role key into a word, which is right for
        -- 'meter' and wrong for everything made of two words or an
        -- acronym: 'servicevalve' came out "Servicevalve", 'linkbox'
        -- "Linkbox", and 'poc' "Poc". A bill is read by people ordering
        -- against it, and none of those is what the thing is called.
        --
        -- Listed rather than derived, because there is no rule that
        -- turns servicevalve into "Service Valve" and poc into "POC" —
        -- the names are facts about the trade, not about the string.
        -- initcap stays as the fallback so a role added later still
        -- reads as something rather than blank, and shows up here as
        -- the odd one out when somebody looks.
        ELSE CASE COALESCE(NULLIF(f."Feature_Role", ''), 'point')
               WHEN 'servicevalve' THEN 'Service Valve'
               WHEN 'linkbox'      THEN 'Link Box'
               WHEN 'poc'          THEN 'POC'
               WHEN 'column'       THEN 'Lighting Column'
               WHEN 'governor'     THEN 'Gas Governor'
               WHEN 'meter'        THEN 'Meter'
               WHEN 'joint'        THEN 'Joint'
               WHEN 'substation'   THEN 'Substation'
               WHEN 'source'       THEN 'Source'
               ELSE initcap(COALESCE(NULLIF(f."Feature_Role", ''), 'Point'))
             END
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
-- Every point item on a project, which should read as trade names:
--   SELECT DISTINCT item FROM gis_bom(<project id>)
--    WHERE unit = 'no.' ORDER BY 1;
--
-- Service valves specifically, once Build Water Network has laid them:
--   SELECT item, quantity FROM gis_bom(<project id>)
--    WHERE item = 'Service Valve';
--
-- A role nobody has named yet shows up as a single capitalised word.
-- That is the list above wanting an entry:
--   SELECT DISTINCT "Feature_Role" FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'point'
--      AND "Feature_Role" NOT IN ('plot','spannode','servicevalve','linkbox',
--                                 'poc','column','governor','meter','joint',
--                                 'substation','source');
