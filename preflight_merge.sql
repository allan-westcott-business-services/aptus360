-- ════════════════════════════════════════════════════════════════════
--  Before merging: is the database ready for the code?
-- ════════════════════════════════════════════════════════════════════
--
-- One paste into the Supabase SQL editor, one table back, read-only.
-- Creates nothing, changes nothing.
--
-- Every row is one thing the deployed code needs. "READY" means the
-- database already has it. "RUN IT FIRST" means merging before you do
-- will break something, and the Detail column says what.
--
-- ── Why this exists ──
--
-- I have been telling you for days not to merge until migrations
-- 0241-0246 have run, "or the fail-closed access-control code locks
-- every staff account out". Checking the branch properly rather than
-- repeating the note: **0241-0246 are already on main, and so is the
-- access-control code that reads them.** They are not in this PR at
-- all. So merging this PR does not introduce that code — whatever
-- state that gate is in, it has been in it since main last deployed,
-- and this PR neither helps nor worsens it.
--
-- Which means the question was never "has the gate been crossed" but
-- "is it still open", and that is a question for the database, not for
-- a note in a handover. Hence this.
--
-- Row 9 is the one that matters for a merge today: migration 0254, the
-- only schema change this PR carries that the code depends on.

SELECT step AS "#", item AS "Needs", state AS "State", detail AS "Detail"
  FROM (

  -- ── 0241-0246: already on main, so already live ───────────────────
  SELECT 1::numeric AS step, '0241 style switches can inherit' AS item,
         CASE WHEN bool_and(is_nullable = 'YES') THEN 'READY'
              ELSE 'RUN IT FIRST' END AS state,
         'saving a style variation fails on a NOT NULL otherwise ('
           || count(*)::text || ' of 3 columns nullable)' AS detail
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'GIS_Style'
     AND column_name IN ('Dashed', 'Scale_Width', 'Scale_Symbol')

  UNION ALL
  -- The index is replaced rather than added, so its presence proves
  -- nothing — the 0195 version has the same name. What proves it is the
  -- two columns 0242 added to the scope.
  SELECT 2, '0242 style scope includes Site and Conditions',
         CASE WHEN count(*) = 2 THEN 'READY' ELSE 'RUN IT FIRST' END,
         'an off-site variation is refused as a duplicate otherwise ('
           || count(*)::text || ' of 2 columns in the index)'
    FROM (SELECT 1 FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
           WHERE c.relname = 'gis_style_scope_uniq'
             AND pg_get_indexdef(i.indexrelid) LIKE '%Site%'
          UNION ALL
          SELECT 1 FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
           WHERE c.relname = 'gis_style_scope_uniq'
             AND pg_get_indexdef(i.indexrelid) LIKE '%Conditions%') x

  UNION ALL
  SELECT 3, '0243 an answer that rules the others out',
         CASE WHEN count(*) = 1 THEN 'READY' ELSE 'RUN IT FIRST' END,
         'Enquiry_Option."Is_Exclusive"'
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Enquiry_Option'
     AND column_name = 'Is_Exclusive'

  UNION ALL
  SELECT 4, '0244 an answer that asks for more',
         CASE WHEN count(*) = 2 THEN 'READY' ELSE 'RUN IT FIRST' END,
         'Enquiry_Option."Needs_Detail" and "Detail_Prompt" ('
           || count(*)::text || ' of 2)'
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Enquiry_Option'
     AND column_name IN ('Needs_Detail', 'Detail_Prompt')

  UNION ALL
  -- ── The one the warning was about ──
  --
  -- The table existing is not the point. 0245 BACKFILLS it, so that
  -- everybody keeps the screens they already had when the ticks start
  -- being read. An empty table with the code live is the lock-out.
  SELECT 5,
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL
              THEN '0245 menu access (table absent)'
              ELSE '0245 menu access, backfilled' END,
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL THEN 'RUN IT FIRST'
              WHEN COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Person_Menu_Visible"',
                     false, true, '')))[1]::text::bigint, 0) = 0 THEN 'RUN IT FIRST'
              ELSE 'READY' END,
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL
              THEN 'no ticks at all, so nothing to read and nobody gets in'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Person_Menu_Visible"',
                     false, true, '')))[1]::text::bigint, 0)::text
                   || ' tick(s) across '
                   || COALESCE((xpath('/row/c/text()', query_to_xml(
                        'SELECT count(DISTINCT "Person_ID") AS c FROM "Person_Menu_Visible"',
                        false, true, '')))[1]::text::bigint, 0)::text
                   || ' person(s)' END

  UNION ALL
  SELECT 6, '0246 admin granted a tab at a time',
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL THEN 'RUN IT FIRST'
              WHEN COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Person_Menu_Visible" '
                     || 'WHERE "Menu_Key" LIKE ''admin:%''',
                     false, true, '')))[1]::text::bigint, 0) = 0 THEN 'RUN IT FIRST'
              ELSE 'READY' END,
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL THEN 'needs 0245 first'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Person_Menu_Visible" '
                     || 'WHERE "Menu_Key" LIKE ''admin:%''',
                     false, true, '')))[1]::text::bigint, 0)::text
                   || ' admin tab tick(s). Without them one Admin tick '
                   || 'grants all 49 tabs, People & Roles included' END

  UNION ALL
  -- ── Anyone who would be shut out right now ──
  --
  -- A live person with no ticks at all. Not a migration question: it is
  -- somebody added since the backfill, who has never been given a
  -- screen. Worth seeing before a deploy either way.
  SELECT 7, 'Staff with no menu ticks at all', 'LOOK',
         CASE WHEN to_regclass('"Person_Menu_Visible"') IS NULL THEN 'needs 0245 first'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Person" p '
                     || 'WHERE NOT EXISTS (SELECT 1 FROM "Person_Menu_Visible" m '
                     || '  WHERE m."Person_ID" = p."Person_ID")',
                     false, true, '')))[1]::text::bigint, 0)::text
                   || ' of '
                   || COALESCE((xpath('/row/c/text()', query_to_xml(
                        'SELECT count(*) AS c FROM "Person"',
                        false, true, '')))[1]::text::bigint, 0)::text
                   || ' people. Each one sees no screens until somebody '
                   || 'ticks them in People & Roles' END

  -- ── What THIS pull request actually needs ─────────────────────────
  UNION ALL
  SELECT 9,
         '0254 the project reference constraint',
         CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                            WHERE conname = 'Project_Ref_Revision_Option_UQ'
                              AND conrelid = '"Project"'::regclass)
              THEN 'READY' ELSE 'RUN IT FIRST' END,
         'the only schema change this PR carries that its code needs: '
           || 'projects.js retries an insert when the reference collides, '
           || 'and without this constraint there is no collision to catch'

  UNION ALL
  SELECT 9.1, 'and no duplicate reference left to block it',
         CASE WHEN count(*) = 0 THEN 'READY' ELSE 'RUN IT FIRST' END,
         count(*)::text || ' reference(s) held by more than one project. '
           || '0254 refuses to install while any exists - '
           || 'renumber_duplicate_project.sql clears it'
    FROM (SELECT 1 FROM "Project"
           GROUP BY "Project_Ref", "Revision", "Option_Letter"
          HAVING count(*) > 1) d

  ) pre ORDER BY step;
