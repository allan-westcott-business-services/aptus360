-- ════════════════════════════════════════════════════════════════
-- 0257 — the bill of materials orders the measured length
--
-- Reported: the Bill of Materials picks up the drawn length and not
-- the measured length. It does, for every line on the drawing - cable,
-- gas pipe, water pipe and trench alike, because they are one
-- aggregation.
--
-- ── Where it came from ──
--
-- 0056 built the bill to read `Length_m`, and said why in as many
-- words: "it reads the same Length_m that gis_length_trg maintains
-- rather than recomputing lengths from geometry and quietly
-- disagreeing with what the canvas shows." That was right at the time.
-- There was one length.
--
-- Then the measured length was split off into its own attribute,
-- because `Length_m` had two writers with opposite meanings - the
-- trigger recomputing it from the geometry, and a person stating what
-- the run really is. The note left in lengths.js at the time reads:
--
--     `Length_m` goes back to being the trigger's own mirror of the
--     drawing (the bill of materials reads it in SQL and is
--     unaffected).
--
-- Unaffected was true and wrong. The bill went on reading the mirror
-- of the drawing, so a 300 m trench measured at 330 m was still
-- ordered as 300 m, and nothing on the sheet said so. Every other
-- consumer was moved to runLength(); the one that turns into a
-- purchase order was the one left behind.
--
-- ── What changes ──
--
-- The quantity on every line row becomes the measurement where a
-- person has entered one and the drawn length everywhere else - the
-- same rule as runLength() in lengths.js, so the sheet and the canvas
-- cannot disagree.
--
-- **This will change bills that have already been read.** Only on
-- projects where somebody entered a measured length, and only upwards
-- or downwards by exactly the difference they typed. That is the bill
-- becoming right rather than changing its mind, but it is a visible
-- change to a document people have ordered against, so it is said here
-- rather than left to be discovered.
--
-- Point counts and MSDB tails are untouched. A count is a count, and
-- the tails are distances typed into a board rather than lengths off
-- the drawing.
--
-- ── A crash that was already there ──
--
-- The old expression cast Length_m straight out of jsonb. A single
-- feature carrying a non-numeric length - typed into the SQL editor,
-- imported, whatever - made the WHOLE bill fail with "invalid input
-- syntax for type numeric" rather than spoiling one row. Verified: the
-- old function raises on it, this one bills that row at nothing and
-- leaves the rest of the sheet standing. The cable and pipe joins
-- below have guarded against exactly this since 0117; the quantity
-- never did.
--
-- ── What this does NOT change ──
--
-- The labour rows - excavation and laying hours - are built in the
-- browser from trench geometry (bomLabour.js -> contentsOf -> lengthOf)
-- and still read the drawn length. That is a second decision, not an
-- oversight: the hours question is whether a measured run means more
-- digging, which is a trade judgement rather than a bug, and the same
-- function's geometry is also what decides which cables are INSIDE a
-- trench - a spatial test that must stay drawn. Raised rather than
-- quietly changed.
--
-- ── Why the whole function again ──
--
-- A Postgres function has no way to amend one line, so it is replaced
-- wholesale. This is 0229 with the quantity expression changed and
-- nothing else - including its exclusion of section marks and text
-- notes, which this therefore also installs on any database that got
-- the other 0229 instead.
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
      -- ── The length that was measured, where somebody measured one ──
      --
      -- Length_m is written by gis_length_trg off the geometry on every
      -- change: the DRAWN length. Measured_Length_m is written by a
      -- person and by nothing else, and means the run is not what the
      -- flat plan shows - a duct that rises and falls, a trench round
      -- an obstruction, slack. The bill orders against the real run.
      --
      -- Same rule as runLength() in lengths.js, so the sheet and the
      -- canvas cannot disagree: the measurement where there is one,
      -- the drawing otherwise. A zero or a negative is not a
      -- measurement and falls through to the drawing.
      --
      -- Tested as text before casting, never cast and then tested.
      -- jsonb holds whatever was written into it, and one feature
      -- carrying "130m" where a number was expected would fail the
      -- entire bill with an invalid input syntax error rather than
      -- spoiling one row - the same trap the cable join below avoids,
      -- and the planner is free to evaluate a cast before the guard
      -- that was meant to protect it.
      ROUND(SUM(
        CASE
          WHEN f."Attributes" ->> 'Measured_Length_m' ~ '^[0-9]+(\.[0-9]+)?$'
           AND (f."Attributes" ->> 'Measured_Length_m')::numeric > 0
            THEN (f."Attributes" ->> 'Measured_Length_m')::numeric
          WHEN f."Attributes" ->> 'Length_m' ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN (f."Attributes" ->> 'Length_m')::numeric
          ELSE 0
        END), 2)                                                       AS quantity,
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
               -- initcap has no way to know that three of those letters
               -- are an acronym, and "Msdb" is not what it is called.
               WHEN 'msdb'         THEN 'MSDB'
               -- Same reason: a heavy duty cut-out is HDCO on every
               -- schedule, every call-off and every van. initcap made
               -- it "Hdcutout", which is the role key wearing a capital
               -- letter and is not the name of anything.
               WHEN 'hdcutout'     THEN 'HDCO'
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
      -- A supply is a connection somebody asked for, not a thing that
      -- arrives on a lorry. The NULL test and the list stay on adjacent
      -- lines: NULL NOT IN (...) is NULL rather than true, so without
      -- the first every point with no role vanishes -- which cost a
      -- whole class of joints once, and is why checkbomroles reads
      -- these two lines together.
      AND (f."Feature_Role" IS NULL
           OR f."Feature_Role" NOT IN ('plot', 'spannode', 'feederpoint', 'nrs',
                                       'sectionmark', 'textnote'))
    GROUP BY 1, 2, 3, 4, 8, 9
  ),

  -- The tails inside a board: one row per flat, its distance in metres,
  -- against the cable the board names for them.
  --
  -- `jsonb_array_elements` on a column that is not an array throws, so
  -- the shape is checked first: a board somebody has half filled in
  -- must not take the whole bill down with it.
  tails AS (
    SELECT
      COALESCE(NULLIF(f."Attributes" ->> 'Site', ''), '')      AS site,
      COALESCE(u."Utility", '')                                AS utility,
      'MSDB tails'
      || CASE
           WHEN cs."Cable_Size_ID" IS NOT NULL THEN
             ' — ' || COALESCE(ct."Cable_Type" || ' ', '') || cs."Size_Label"
           ELSE ' (cable not set)'
         END                                                   AS item,
      ''::text                                                 AS surface,
      'm'::text                                                AS unit,
      SUM(COALESCE((a ->> 'distanceM')::numeric, 0))           AS quantity,
      COUNT(DISTINCT f."Feature_ID")::bigint                   AS features,
      d.id                                                     AS developer_id,
      d.name                                                   AS developer_name
    FROM "GIS_Feature" f
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(f."Attributes" -> 'MSDB_Apartments') = 'array'
          THEN f."Attributes" -> 'MSDB_Apartments'
        ELSE '[]'::jsonb
      END) AS a
    LEFT JOIN "GIS_Layer" l ON l."Layer_Key"  = f."Layer_Key"
    LEFT JOIN "Utility" u   ON u."Utility_ID" = l."Utility_ID"
    LEFT JOIN "Electric_Cable_Size" cs
      ON cs."Cable_Size_ID"::text = NULLIF(f."Attributes" ->> 'MSDB_Tail_Cable_ID', '')
    LEFT JOIN "Electric_Cable_Type" ct ON ct."Cable_Type_ID" = cs."Cable_Type_ID"
    LEFT JOIN devs d ON d.id::text = f."Attributes" ->> 'Project_Developer_ID'
    WHERE f."Project_ID" = p_project
      AND f."Feature_Role" = 'msdb'
    GROUP BY 1, 2, 3, 4, 8, 9
    HAVING SUM(COALESCE((a ->> 'distanceM')::numeric, 0)) > 0
  )
  SELECT * FROM (
    SELECT * FROM lines
    UNION ALL SELECT * FROM points
    UNION ALL SELECT * FROM tails
  ) b
   ORDER BY CASE WHEN b.site = '' THEN 1 ELSE 0 END,
            CASE b.site WHEN 'On-site' THEN 0 WHEN 'Off-site' THEN 1 ELSE 2 END,
            b.utility, b.item, b.surface;
$$ LANGUAGE sql STABLE;

-- ── Check ───────────────────────────────────────────────────────
--
-- Nothing on a project where nobody has measured anything. Every line
-- whose quantity the measurement moves, with both figures side by
-- side, so the change to the bill can be read before it is believed:
--
--   SELECT f."Feature_ID",
--          f."Layer_Key",
--          f."Attributes" ->> 'Length_m'          AS drawn,
--          f."Attributes" ->> 'Measured_Length_m' AS measured
--     FROM "GIS_Feature" f
--    WHERE f."Project_ID" = <project>
--      AND f."Feature_Type" = 'line'
--      AND f."Attributes" ->> 'Measured_Length_m' ~ '^[0-9]+(\.[0-9]+)?$'
--      AND (f."Attributes" ->> 'Measured_Length_m')::numeric > 0
--    ORDER BY f."Layer_Key", f."Feature_ID";
--
-- Which projects this changes the bill on at all, and by how much:
--
--   SELECT f."Project_ID",
--          COUNT(*) AS lines_measured,
--          ROUND(SUM((f."Attributes" ->> 'Measured_Length_m')::numeric
--                  - COALESCE(NULLIF(f."Attributes" ->> 'Length_m','')::numeric, 0)), 2)
--            AS metres_added
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Type" = 'line'
--      AND f."Attributes" ->> 'Measured_Length_m' ~ '^[0-9]+(\.[0-9]+)?$'
--      AND (f."Attributes" ->> 'Measured_Length_m')::numeric > 0
--    GROUP BY 1 ORDER BY 1;
--
-- And a value nobody could cast does not take the bill down - expect
-- the row to be billed at its drawn length rather than an error:
--
--   SELECT item, quantity FROM gis_bom(<project>) WHERE unit = 'm';
