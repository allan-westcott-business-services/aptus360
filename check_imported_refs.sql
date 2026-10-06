-- ════════════════════════════════════════════════════════════════════
--  How many imported projects are on a made-up reference
-- ════════════════════════════════════════════════════════════════════
--
-- One paste, one table back, read-only. Creates nothing, changes
-- nothing.
--
-- ── Why you are running this ──
--
-- You said Tansey Green was 1906.054 in the original system. The import
-- gave it 2610.004. Both of those facts matter, and the second one is
-- my fault twice over.
--
-- The contract import keeps an old reference where the row already has
-- one in YYMM.NNN shape — but it reads that from the CONTRACT file's
-- "Tender_Reference" column, and only 86 of the 1,926 contract rows
-- have one. The real reference for the rest is in the TENDER file,
-- under a differently named column, "Tender_Ref". The contract import
-- never looked there, although every contract row carries the
-- "Tender_ID" that would reach it.
--
-- So an imported contract with no reference of its own got one
-- generated from its Secured_Date, or its Date_Signed, or — with
-- neither — from TODAY. That last fallback is why Tansey Green reads
-- 2610.004: October 2026 is when the import ran, not when the project
-- was raised. It is also why it collided with a project somebody
-- created in the app this morning. Both were given October 2026
-- numbers by two different pieces of code that could not see each
-- other.
--
-- ── What this does NOT tell you ──
--
-- Rows 4 and 5 need the tender CSVs loaded to answer. Row 4.1 of
-- migration_status.sql says they are not yet, so those rows will say
-- so rather than guess. Everything above them answers now.
--
-- Do not run renumber_duplicate_project.sql until this is read. It
-- moves the APP-created project off 2610.004 and leaves Tansey Green
-- on a reference that was never its own, which is the wrong one of the
-- two to move if 1906.054 can be given back.

SELECT step AS "#", item AS "What", detail AS "Detail"
  FROM (

  SELECT 1::numeric AS step, 'Imported from contracts' AS item,
         count(*)::text || ' projects' AS detail
    FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL

  UNION ALL
  -- The ones that kept a real reference: the contract file had one in
  -- the right shape, so the import used it and numbered around it.
  SELECT 2, 'Kept their own old reference',
         count(*)::text || ' — the contract file carried it in YYMM.NNN shape'
    FROM "Project" p
    JOIN "Legacy_Project_Import" i
      ON i."Source" = 'contract'
     AND NULLIF(btrim(i."Contract_ID"), '')::bigint = p."Legacy_Contract_ID"
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(COALESCE(i."Tender_Reference", '')) = p."Project_Ref"

  UNION ALL
  -- Generated: numbered by the import rather than carried over.
  SELECT 3, 'Given a reference by the import',
         count(*)::text || ' — numbered from a date, not carried over'
    FROM "Project" p
    JOIN "Legacy_Project_Import" i
      ON i."Source" = 'contract'
     AND NULLIF(btrim(i."Contract_ID"), '')::bigint = p."Legacy_Contract_ID"
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(COALESCE(i."Tender_Reference", '')) <> p."Project_Ref"

  UNION ALL
  -- ── The worst of them ──
  --
  -- No Secured_Date AND no Date_Signed, so the month came from the day
  -- the import ran. These references say nothing true about the
  -- project at all, and they are the ones sitting in the same month as
  -- everything the app is issuing now.
  SELECT 3.1, 'of those, dated from the day the import ran',
         count(*)::text || ' — no Secured_Date and no Date_Signed, so the '
           || 'month is October 2026. These are the references nobody '
           || 'will recognise, and the ones that collide with new work'
    FROM "Project" p
    JOIN "Legacy_Project_Import" i
      ON i."Source" = 'contract'
     AND NULLIF(btrim(i."Contract_ID"), '')::bigint = p."Legacy_Contract_ID"
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(COALESCE(i."Tender_Reference", '')) <> p."Project_Ref"
     AND btrim(COALESCE(i."Secured_Date", '')) = ''
     AND btrim(COALESCE(i."Date_Signed", '')) = ''

  UNION ALL
  -- How many of the generated ones even have a tender to ask.
  SELECT 3.2, 'of those, with a linked tender to ask',
         count(*)::text || ' carry a Tender_ID, so a real reference may '
           || 'be recoverable from the tender file'
    FROM "Project" p
    JOIN "Legacy_Project_Import" i
      ON i."Source" = 'contract'
     AND NULLIF(btrim(i."Contract_ID"), '')::bigint = p."Legacy_Contract_ID"
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(COALESCE(i."Tender_Reference", '')) <> p."Project_Ref"
     AND btrim(COALESCE(i."Tender_ID", '')) <> ''

  UNION ALL
  -- ── Tansey Green, as the worked example ──
  SELECT 3.9, 'Tansey Green (contract 380), what the import had',
         COALESCE((
           SELECT 'Tender_Reference ' || COALESCE(NULLIF(btrim(i."Tender_Reference"), ''), '(empty)')
               || ' · Secured_Date ' || COALESCE(NULLIF(btrim(i."Secured_Date"), ''), '(empty)')
               || ' · Date_Signed ' || COALESCE(NULLIF(btrim(i."Date_Signed"), ''), '(empty)')
               || ' · Tender_ID ' || COALESCE(NULLIF(btrim(i."Tender_ID"), ''), '(empty)')
             FROM "Legacy_Project_Import" i
            WHERE i."Source" = 'contract'
              AND btrim(i."Contract_ID") = '380'), 'contract 380 is not staged')

  UNION ALL
  -- ── Needs the tender file ──
  SELECT 4, 'Tender file loaded',
         CASE WHEN to_regclass('"Legacy_Tender_Import"') IS NULL
              THEN 'the staging table does not exist — migration 0252 has '
                   || 'not been run'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Legacy_Tender_Import"',
                     false, true, '')))[1]::text::bigint, 0)::text
                   || ' of 5,454 rows. The next row can only answer once '
                   || 'these are loaded' END

  UNION ALL
  SELECT 5, 'References recoverable from the tender file',
         CASE WHEN to_regclass('"Legacy_Tender_Import"') IS NULL
                   THEN 'needs migration 0252'
              WHEN COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Legacy_Tender_Import"',
                     false, true, '')))[1]::text::bigint, 0) = 0
                   THEN 'load the three tender files first, then re-run this'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT count(*) AS c FROM "Project" p '
                     || 'JOIN "Legacy_Project_Import" i '
                     || '  ON i."Source" = ''contract'' '
                     || ' AND NULLIF(btrim(i."Contract_ID"), '''')::bigint '
                     || '     = p."Legacy_Contract_ID" '
                     || 'JOIN "Legacy_Tender_Import" t '
                     || '  ON btrim(t."Tender_ID") = btrim(i."Tender_ID") '
                     || 'WHERE p."Legacy_Contract_ID" IS NOT NULL '
                     || '  AND btrim(COALESCE(i."Tender_Reference", '''')) '
                     || '      <> p."Project_Ref" '
                     || '  AND t."Tender_Ref" ~ ''^[0-9]{4}[.][0-9]+$''',
                     false, true, '')))[1]::text::bigint, 0)::text
                   || ' projects could be given their real reference back'
         END

  UNION ALL
  -- And what it would cost: a reference already in use by something
  -- else is one that cannot simply be handed over.
  SELECT 9, 'Duplicate references right now',
         count(*)::text || ' — read show_duplicate_ref.sql for which'
    FROM (SELECT 1 FROM "Project"
           GROUP BY "Project_Ref", "Revision", "Option_Letter"
          HAVING count(*) > 1) d

  ) r ORDER BY step;
