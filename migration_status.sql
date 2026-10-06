-- ════════════════════════════════════════════════════════════════════
--  Where the whole migration has got to
-- ════════════════════════════════════════════════════════════════════
--
-- One paste into the Supabase SQL editor, one table back. Read-only:
-- it creates nothing and changes nothing, so it is safe to run at any
-- point and as often as you like.
--
-- Every row is a step, in the order the steps happen. The State column
-- says "done", "not yet", or "LOOK" where something wants a human.
--
-- ── It does not fall over on a migration you have not run yet ──
--
-- The first version of this asked the plot and tender staging tables
-- for their row counts directly, which meant that if the migration
-- that creates them had not been run, the whole script stopped at
--
--   ERROR: relation "Legacy_Plot_Import" does not exist
--
-- and told you nothing about the eleven stages that HAVE been done.
-- Row 0.1 now reports which migrations are in, and the counts that
-- depend on a later migration are asked for only once the table is
-- actually there. A stage you have not reached reads "not yet" instead
-- of taking the script down with it.

WITH here AS (
  -- What exists. All of this reads the catalogue, never the tables, so
  -- none of it can fail on something that is not there yet.
  SELECT to_regclass('"Legacy_Plot_Import"')       IS NOT NULL AS plot_stage,
         to_regclass('"Legacy_Connection_Import"') IS NOT NULL AS conn_stage,
         to_regclass('"Legacy_Tender_Import"')     IS NOT NULL AS tender_stage,
         to_regclass('"Legacy_Customer_Import"')   IS NOT NULL AS cust_stage,
         to_regclass('"Legacy_Lookup_Map"')        IS NOT NULL AS lookup_map,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'Project'
                    AND column_name = 'Legacy_Tender_ID')      AS tender_key,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'Plot'
                    AND column_name = 'Legacy_Plot_ID')         AS plot_key
),
counted AS (
  -- The counts that would be a parse error if the table were absent.
  -- query_to_xml takes the query as TEXT, so nothing is resolved until
  -- the CASE has decided to run it.
  SELECT
    CASE WHEN h.tender_stage THEN
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM "Legacy_Tender_Import"',
        false, true, '')))[1]::text::bigint END AS tenders_staged,
    CASE WHEN h.plot_stage THEN
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM "Legacy_Plot_Import"',
        false, true, '')))[1]::text::bigint END AS plots_staged,
    CASE WHEN h.conn_stage THEN
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM "Legacy_Connection_Import"',
        false, true, '')))[1]::text::bigint END AS conns_staged,
    CASE WHEN h.plot_key THEN
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL',
        false, true, '')))[1]::text::bigint END AS plots_imported
    FROM here h
)
SELECT step AS "#", stage AS "Stage", state AS "State", detail AS "Detail"
  FROM (

  -- ── Stage 0: has the groundwork been laid ─────────────────────────
  --
  -- Each migration is spotted by something it creates, rather than by a
  -- version number written down somewhere, so this is the database's
  -- own answer and not a note that can go stale.
  SELECT 0.1 AS step, 'Migrations 0247-0253 run' AS stage,
         CASE WHEN m.missing = '' THEN 'done' ELSE 'not yet' END AS state,
         CASE WHEN m.missing = ''
              THEN 'all seven are in'
              ELSE 'still to run: ' || m.missing
                   || ' - the stages below that need them read "not yet"'
         END AS detail
    FROM here h
    CROSS JOIN LATERAL (
      SELECT btrim(
        CASE WHEN h.tender_key   THEN '' ELSE '0247, ' END ||
        CASE WHEN h.lookup_map   THEN '' ELSE '0248, ' END ||
        CASE WHEN h.plot_key     THEN '' ELSE '0250, ' END ||
        CASE WHEN h.plot_stage   THEN '' ELSE '0251, ' END ||
        CASE WHEN h.tender_stage THEN '' ELSE '0252, ' END ||
        CASE WHEN h.cust_stage   THEN '' ELSE '0253, ' END, ', ') AS missing
    ) m
  -- 0249 is not on that list because the Organisation keys it adds are
  -- what stage 1 below counts: if they were missing, row 1.1 could not
  -- have been written at all.

  -- ── Stage 1: organisations ────────────────────────────────────────
  UNION ALL
  SELECT 1.1, 'Organisations imported',
         CASE WHEN count(*) >= 509 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' of 509'
    FROM "Organisation" WHERE "Legacy_Customer_ID" IS NOT NULL
  UNION ALL
  SELECT 1.2, 'Their branches',
         CASE WHEN count(*) >= 623 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' of 623'
    FROM "Organisation_Branch" WHERE "Legacy_Branch_ID" IS NOT NULL
  UNION ALL
  -- An organisation with no branch cannot be put on a project at all,
  -- because a project points at a branch and not at the company.
  SELECT 1.3, 'Imported org with no branch (must be 0)',
         CASE WHEN count(*) = 0 THEN 'done' ELSE 'LOOK' END,
         count(*)::text || ' - one of these cannot be put on a project'
    FROM "Organisation" o
   WHERE o."Legacy_Customer_ID" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
                      WHERE b."Organisation_ID" = o."Organisation_ID")

  -- ── Stage 2: the lookup map ───────────────────────────────────────
  UNION ALL
  SELECT 2.1, 'Contract statuses and regions mapped',
         CASE WHEN count(*) >= 14 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' rows - run map_legacy_lookups.sql for these'
    FROM "Legacy_Lookup_Map" WHERE "Kind" IN ('status', 'region')
  UNION ALL
  -- The tender statuses live under their own Kind. They are a separate
  -- namespace from the contract ones, which is why mapping the contract
  -- statuses did nothing for these.
  SELECT 2.2, 'Tender statuses mapped',
         CASE WHEN count(*) > 0 THEN 'done' ELSE 'LOOK' END,
         CASE WHEN count(*) = 0
              THEN 'none yet - this BLOCKS part 3 of the tender import. '
                   || 'Without it every tender-only project lands on one '
                   || 'status. Needs the old Tender_Status table, 13 ids '
                   || 'and names.'
              ELSE count(*)::text || ' of 13' END
    FROM "Legacy_Lookup_Map" WHERE "Kind" = 'tender_status'

  -- ── Stage 3: the contracts ────────────────────────────────────────
  UNION ALL
  SELECT 3.1, 'Contract CSV staged',
         CASE WHEN count(*) >= 1926 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' of 1,926'
    FROM "Legacy_Project_Import" WHERE "Source" = 'contract'
  UNION ALL
  SELECT 3.2, 'Contracts imported as projects',
         CASE WHEN count(*) >= 1926 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' of 1,926'
    FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL
  UNION ALL
  -- The customer shown in the projects list comes from Project_Developer,
  -- not from the branch on the project, so an import that sets the branch
  -- and stops leaves the column blank with nothing obviously wrong.
  SELECT 3.3, 'Showing a customer in the list',
         CASE WHEN count(*) > 0 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' have a Project_Developer record. Without it '
           || 'the list and the portal show nothing - attach_developers.sql '
           || 'is what creates them.'
    FROM "Project" p
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Project_Developer" d
                  WHERE d."Project_ID" = p."Project_ID" AND d."Is_Main")

  -- ── Stage 4: the tenders ──────────────────────────────────────────
  UNION ALL
  SELECT 4.1, 'Tender CSV staged',
         CASE WHEN COALESCE(c.tenders_staged, 0) >= 5454 THEN 'done'
              ELSE 'not yet' END,
         COALESCE(c.tenders_staged, 0)::text
           || ' of 5,454 - three loader files, run in order'
    FROM counted c
  UNION ALL
  SELECT 4.2, 'Tenders merged into a contract already here',
         CASE WHEN count(*) > 0 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' projects carry both a contract and a tender'
    FROM "Project"
   WHERE "Legacy_Contract_ID" IS NOT NULL AND "Legacy_Tender_ID" IS NOT NULL
  UNION ALL
  SELECT 4.3, 'Tender-only projects created',
         CASE WHEN count(*) > 0 THEN 'done' ELSE 'not yet' END,
         count(*)::text || ' of about 3,773 - do not run part 3 of the '
           || 'tender import until row 2.2 above says done'
    FROM "Project"
   WHERE "Legacy_Tender_ID" IS NOT NULL AND "Legacy_Contract_ID" IS NULL

  -- ── Stage 5: plots and connections ────────────────────────────────
  UNION ALL
  SELECT 5.1, 'Plot CSV staged',
         CASE WHEN COALESCE(c.plots_staged, 0) > 0 THEN 'done'
              ELSE 'not yet' END,
         COALESCE(c.plots_staged, 0)::text || ' of 333,950 - too big for '
           || 'the SQL editor either way, so this one needs psql against '
           || 'the connection string'
    FROM counted c
  UNION ALL
  SELECT 5.2, 'Plot-to-utility CSV staged',
         CASE WHEN COALESCE(c.conns_staged, 0) > 0 THEN 'done'
              ELSE 'not yet' END,
         COALESCE(c.conns_staged, 0)::text || ' of 33,059'
    FROM counted c
  UNION ALL
  SELECT 5.3, 'Plots imported',
         CASE WHEN COALESCE(c.plots_imported, 0) > 0 THEN 'done'
              ELSE 'not yet' END,
         COALESCE(c.plots_imported, 0)::text || ' plots carry a Legacy_Plot_ID'
    FROM counted c

  -- ── Things to keep an eye on, whenever ────────────────────────────
  UNION ALL
  -- GROUP BY treats two NULL Option_Letters as the same value, which the
  -- UNIQUE constraint does not - so this finds pairs the constraint lets
  -- through. It counts anything that pre-dates the import as well.
  SELECT 9.1, 'Duplicate references (must be 0)',
         CASE WHEN count(*) = 0 THEN 'done' ELSE 'LOOK' END,
         count(*)::text || ' - includes any that pre-date the import'
    FROM (SELECT "Project_Ref", "Revision", "Option_Letter"
            FROM "Project" GROUP BY 1, 2, 3 HAVING count(*) > 1) d
  UNION ALL
  -- Expected, not a fault: these contracts had no customer key in the
  -- old data at all, so there was nothing to resolve.
  SELECT 9.2, 'Imported projects with no customer',
         'expected',
         count(*)::text || ' - no customer key in the old data. Each names '
           || 'its company in its own Notes.'
    FROM "Project"
   WHERE "Legacy_Contract_ID" IS NOT NULL AND "Organisation_Branch_ID" IS NULL

  ) s ORDER BY step;
