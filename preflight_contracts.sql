-- ════════════════════════════════════════════════════════════════════
--  Before importing the contracts — one paste, one table back
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing.
--
-- Part 1 of import_legacy_projects.sql asks these questions too, but as
-- seven separate SELECTs - and the Supabase editor shows only the LAST
-- result, so six of them are thrown away. This is the same ground in
-- one result set.
--
-- Every row says what it is and whether it stops the import. "STOPS IT"
-- means fix before running; everything else is a fact to know.

SELECT step, verdict, detail FROM (

  SELECT 1::numeric AS step, 'Contracts staged' AS verdict,
         count(*)::text || ' rows' AS detail
    FROM "Legacy_Project_Import" WHERE "Source" = 'contract'

  UNION ALL
  -- The import RAISES if any staged status has no mapping, and
  -- Project.Project_Status_ID is NOT NULL, so this one is fatal.
  SELECT 2,
         CASE WHEN count(*) = 0 THEN 'Statuses all mapped'
              ELSE 'STOPS IT - unmapped statuses' END,
         CASE WHEN count(*) = 0 THEN 'the import''s own guard will pass'
              ELSE 'old ids: ' || string_agg(DISTINCT s, ', ') END
    FROM (SELECT btrim(i."Contract_Status_ID") AS s
            FROM "Legacy_Project_Import" i
           WHERE i."Source" = 'contract'
             AND btrim(COALESCE(i."Contract_Status_ID", '')) <> ''
             AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                              WHERE m."Kind" = 'status'
                                AND m."Legacy_ID" = btrim(i."Contract_Status_ID")
                                AND m."New_ID" IS NOT NULL)) x

  UNION ALL
  -- ── The one this check originally missed ──
  --
  -- Step 2 asks whether every status that IS set has a mapping, and
  -- says nothing about rows with no status at all. 31 contracts have
  -- neither a Contract_Status_ID nor a Tender_Status_ID, the lookup
  -- found nothing, and Project_Status_ID is NOT NULL:
  --
  --   ERROR: 23502: null value in column "Project_Status_ID"
  --
  -- which is how far it got before anybody noticed. The import now
  -- gives those the first Contract-stage status and says so in the
  -- project's Notes; this row is here so the number is seen first.
  SELECT 2.5, 'Contracts with no status at all',
         count(*)::text || ' rows - these take the first contract status, '
           || 'and their Notes say so'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND btrim(COALESCE(i."Contract_Status_ID", '')) = ''
     AND btrim(COALESCE(i."Tender_Status_ID", '')) = ''

  UNION ALL
  -- And that there IS a contract status to fall back to.
  SELECT 2.6,
         CASE WHEN EXISTS (SELECT 1 FROM "Project_Status" WHERE "Stage" = 'Contract')
              THEN 'A default contract status exists'
              ELSE 'STOPS IT - no Contract-stage status to fall back to' END,
         COALESCE((SELECT ps."Status" FROM "Project_Status" ps
                    WHERE ps."Stage" = 'Contract'
                    ORDER BY ps."Sort_Order" LIMIT 1), 'none')
           || ' is what a statusless contract will get'

  UNION ALL
  -- Region is nullable, so an unmapped one is a fact rather than a fault.
  SELECT 3, 'Regions unmapped',
         count(*)::text || ' contracts import with no region'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND btrim(COALESCE(i."Region_ID", '')) <> ''
     AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                      WHERE m."Kind" = 'region'
                        AND m."Legacy_ID" = btrim(i."Region_ID")
                        AND m."New_ID" IS NOT NULL)

  UNION ALL
  -- What stage 1 bought. The branch route is the precise one: it names
  -- the office, so nothing has to be picked by hand afterwards.
  SELECT 4, 'Customer found - on a specific branch',
         count(*)::text || ' contracts'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND EXISTS (SELECT 1 FROM "Organisation_Branch" b
                  WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint)

  UNION ALL
  SELECT 5, 'Customer found - organisation only',
         count(*)::text || ' contracts, branch picked by hand later'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
                  WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint)
     AND EXISTS (SELECT 1 FROM "Organisation" o
                  WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint)

  UNION ALL
  SELECT 6, 'No customer key',
         count(*)::text || ' contracts - some still match on the Audacia code'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
                  WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint)
     AND NOT EXISTS (SELECT 1 FROM "Organisation" o
                  WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint)

  UNION ALL
  -- A row with no site name makes a project nobody can identify.
  SELECT 7,
         CASE WHEN count(*) = 0 THEN 'Every contract has a site name'
              ELSE 'Worth a look - contracts with no site name' END,
         count(*)::text || ' rows'
    FROM "Legacy_Project_Import" i
   WHERE i."Source" = 'contract'
     AND btrim(COALESCE(i."Site_Name", '')) = ''

  UNION ALL
  -- Project_Ref is UNIQUE on (Project_Ref, Revision, Option_Letter) and
  -- there are 28 real projects already holding references in the same
  -- YYMM.NNN sequence. The import reserves around them; this says how
  -- many it has to work around.
  SELECT 8, 'References already in use',
         count(*)::text || ' projects here already, in the same sequence'
    FROM "Project"

  UNION ALL
  -- Already imported, so a re-run has less to do.
  SELECT 9, 'Contracts already imported',
         count(*)::text || ' projects carry a Legacy_Contract_ID'
    FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL

  UNION ALL
  -- 0233 rewrote log_project_changes to name no columns. If it still
  -- names the dropped Customer_ID, no project can be inserted at all.
  SELECT 10,
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc
                            WHERE proname = 'log_project_changes'
                              AND prosrc ILIKE '%Customer_ID%')
              THEN 'STOPS IT - run migration 0233 first'
              ELSE 'Project saves work (0233 is in)' END,
         'the history trigger must not name a dropped column'

) pre ORDER BY step;
