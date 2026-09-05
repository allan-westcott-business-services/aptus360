-- ════════════════════════════════════════════════════════════════
-- 0204 — feeder end points are not materials
--
-- A feeder end point is where the build breaks a run: the origin, a
-- junction, a leaf end, or the place a cable's count changes. It is a
-- position on the drawing that lengths and levels are quoted at, made
-- and deleted by Build LV Network on every run. Nobody orders one.
--
-- 0058 excluded plot seeds and 0075 excluded span nodes for exactly the
-- same reason, and this is the third of the same kind: a point that
-- says WHERE something is measured rather than WHAT is to be bought.
--
-- Everything physical stays. A link box, a joint, a meter, a POC, a
-- substation and a lighting column are all things that get bought,
-- whatever else they also are — and a link box standing at a feeder end
-- point is still a chamber with fuses in it, counted here as it always
-- was, because it is a linkbox and not a feederpoint.
--
-- Rebuilt from 0167 with one role added to the exclusion list, rather
-- than patched, because gis_bom is one function and the whole of it has
-- to be replaced to change any of it.
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
                   WHEN COALESCE(f."Attributes" ->> 'Manual_VD_Cable_Size_ID',
                                 f."Attributes" ->> 'VD_Cable_Size_ID') IS NOT NULL THEN
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
                   WHEN COALESCE(f."Attributes" ->> 'Manual_Water_Pipe_Size_ID',
                                 f."Attributes" ->> 'Water_Pipe_Size_ID') IS NOT NULL THEN
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
               -- And the diameter on gas, the same four cases as water.
               WHEN f."Layer_Key" = 'gas' THEN
                 CASE
                   WHEN gp."Gas_Pipe_Size_ID" IS NOT NULL THEN
                     ' — ' || COALESCE(NULLIF(gp."Size_Label", ''),
                                       gp."Diameter_mm"::text || 'mm')
                   WHEN COALESCE(f."Attributes" ->> 'Manual_Gas_Pipe_Size_ID',
                                 f."Attributes" ->> 'Gas_Pipe_Size_ID') IS NOT NULL THEN
                     ' (pipe size not in the catalogue)'
                   -- Typed by hand, before the size became a choice from
                   -- a table. Itemised as what it says rather than
                   -- called unset, exactly as water does it.
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
    -- ── The size in force, not the calculated one ──
    --
    -- Every utility line carries two: what the build worked out, and
    -- what a designer overrode it with. sizeMode.js has always read the
    -- override where there is one and the calculated size everywhere
    -- else — "the sizes that would be built" — and the bill read only
    -- the first of the two.
    --
    -- So a length overridden to 180mm was ordered as the 125mm the build
    -- had calculated, and nothing on the sheet said otherwise.
    --
    -- COALESCE in the join rather than a second join and a CASE: the
    -- override and the calculated size are the same kind of thing
    -- pointing at the same catalogue, and one of them is in force.
    LEFT JOIN "Electric_Cable_Size" cs
      ON f."Layer_Key" = 'electric'
     AND cs."Cable_Size_ID"::text = COALESCE(
           f."Attributes" ->> 'Manual_VD_Cable_Size_ID',
           f."Attributes" ->> 'VD_Cable_Size_ID')
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
     AND wp."Water_Pipe_Size_ID"::text = COALESCE(
           f."Attributes" ->> 'Manual_Water_Pipe_Size_ID',
           f."Attributes" ->> 'Water_Pipe_Size_ID')
    -- Gas, joined for the first time.
    --
    -- Gas mains were itemised as "Gas Main" with no size at all, so a
    -- scheme with 180mm, 125mm and 90mm in it came out as one row of
    -- metres nobody could order against. Water has been itemised by
    -- diameter since 0117 and gas has the same catalogue; it simply was
    -- never joined.
    LEFT JOIN "Gas_Pipe_Size" gp
      ON f."Layer_Key" = 'gas'
     AND gp."Gas_Pipe_Size_ID"::text = COALESCE(
           f."Attributes" ->> 'Manual_Gas_Pipe_Size_ID',
           f."Attributes" ->> 'Gas_Pipe_Size_ID')
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
           OR f."Feature_Role" NOT IN ('plot', 'spannode', 'feederpoint'))
    GROUP BY 1, 2, 3, 4, 8, 9
  )
  SELECT * FROM (SELECT * FROM lines UNION ALL SELECT * FROM points) b
   ORDER BY CASE WHEN b.site = '' THEN 1 ELSE 0 END,
            CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;

-- ── Check ───────────────────────────────────────────────────────
-- Expect no feeder end points on the bill:
--   SELECT item, unit, quantity FROM gis_bom(<project>) WHERE unit = 'no.';
--
-- The points on the bill should be the drawing's points less its seeds,
-- span nodes and feeder end points. Expect no rows:
--   WITH bom AS (SELECT SUM(quantity) n FROM gis_bom(<project>) WHERE unit = 'no.'),
--        raw AS (SELECT COUNT(*)::numeric n FROM "GIS_Feature"
--                 WHERE "Project_ID" = <project> AND "Feature_Type" = 'point'
--                   AND ("Feature_Role" IS NULL
--                        OR "Feature_Role" NOT IN ('plot','spannode','feederpoint')))
--   SELECT bom.n AS on_bill, raw.n AS in_drawing FROM bom, raw
--    WHERE bom.n IS DISTINCT FROM raw.n;
--
-- And the link box is still counted, because it is a linkbox:
--   SELECT item, quantity FROM gis_bom(<project>) WHERE item = 'Link Box';
