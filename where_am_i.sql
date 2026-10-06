-- ════════════════════════════════════════════════════════════════════
--  Where has the import got to?
-- ════════════════════════════════════════════════════════════════════
--
-- One paste, one table back. Every row is a step, in the order the
-- steps happen, and says done or not and what the next thing is.
--
-- Read-only. It creates nothing, changes nothing, and is safe to run at
-- any point, including before anything at all has been run.
--
-- A step reading "not yet" is not a fault — it is simply the next
-- thing. Work down the list.
--
-- ── If it refuses to run at all ──
--
--   ERROR: relation "Legacy_Project_Import" does not exist
--
-- That IS the answer: the migrations have not been run. Postgres parses
-- the whole statement before executing any of it, so a script cannot
-- count rows in a table that might not be there — which is why this one
-- cannot report that step for itself. Run
-- migrations_0247_to_0252.sql, then run this again.

WITH ok AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Project' AND column_name = 'Tender_Quote_Value')   AS m0247,
    EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'Legacy_Project_Import')                            AS m0248,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Project' AND column_name = 'Legacy_Customer_ID')   AS m0249,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'Plot_Utility' AND column_name = 'Actual_Jointing_Date') AS m0250,
    EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'Legacy_Plot_Import')                               AS m0251,
    EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'Legacy_Tender_Import')                             AS m0252
),
n AS (
  SELECT
    (SELECT count(*) FROM "Legacy_Project_Import")                                  AS staged_contracts,
    (SELECT count(*) FROM "Legacy_Tender_Import")                                   AS staged_tenders,
    (SELECT count(*) FROM "Legacy_Plot_Import")                                     AS staged_plots,
    (SELECT count(*) FROM "Legacy_Connection_Import")                               AS staged_conns,
    (SELECT count(*) FROM "Legacy_Lookup_Map")                                      AS lookup_rows,
    (SELECT count(*) FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL)         AS from_contracts,
    (SELECT count(*) FROM "Project" WHERE "Legacy_Tender_ID" IS NOT NULL
                                      AND "Legacy_Contract_ID" IS NULL)             AS tender_only,
    (SELECT count(*) FROM "Project" WHERE "Legacy_Tender_ID" IS NOT NULL
                                      AND "Legacy_Contract_ID" IS NOT NULL)         AS merged,
    (SELECT count(*) FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL
                                      AND "Organisation_Branch_ID" IS NULL)         AS no_customer,
    (SELECT count(*) FROM "Plot"         WHERE "Legacy_Plot_ID" IS NOT NULL)        AS plots_in,
    (SELECT count(*) FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL) AS conns_in,
    (SELECT count(*) FROM "Project")                                                AS projects_all
),
steps(sort, step, done, detail) AS (
  SELECT 1, '1. Migrations 0247-0252',
         (SELECT m0247 AND m0248 AND m0249 AND m0250 AND m0251 AND m0252 FROM ok),
         (SELECT concat_ws(', ',
            CASE WHEN NOT m0247 THEN '0247 missing' END,
            CASE WHEN NOT m0248 THEN '0248 missing' END,
            CASE WHEN NOT m0249 THEN '0249 missing' END,
            CASE WHEN NOT m0250 THEN '0250 missing' END,
            CASE WHEN NOT m0251 THEN '0251 missing' END,
            CASE WHEN NOT m0252 THEN '0252 missing' END) FROM ok)
  UNION ALL
  SELECT 2, '2. Contract CSV loaded', (SELECT staged_contracts > 0 FROM n),
         (SELECT staged_contracts || ' rows staged (the export has 1,926)' FROM n)
  UNION ALL
  SELECT 3, '3. Tender CSV loaded', (SELECT staged_tenders > 0 FROM n),
         (SELECT staged_tenders || ' rows staged (the export has 5,454)' FROM n)
  UNION ALL
  SELECT 4, '4. Plot CSV loaded', (SELECT staged_plots > 0 FROM n),
         (SELECT staged_plots || ' rows staged (the export has 333,950)' FROM n)
  UNION ALL
  SELECT 5, '5. Plot Utility CSV loaded', (SELECT staged_conns > 0 FROM n),
         (SELECT staged_conns || ' rows staged (the export has 33,059)' FROM n)
  UNION ALL
  SELECT 6, '6. Lookups mapped by hand', (SELECT lookup_rows > 0 FROM n),
         (SELECT lookup_rows || ' rows in Legacy_Lookup_Map. The contract import '
                 || 'refuses to run until the statuses are mapped.' FROM n)
  UNION ALL
  SELECT 7, '7. Contracts imported', (SELECT from_contracts > 0 FROM n),
         (SELECT from_contracts || ' projects from contracts, ' || merged
                 || ' of them also matched to a tender' FROM n)
  UNION ALL
  SELECT 8, '8. Tenders imported', (SELECT tender_only > 0 OR merged > 0 FROM n),
         (SELECT tender_only || ' tender-only projects' FROM n)
  UNION ALL
  SELECT 9, '9. Plots imported', (SELECT plots_in > 0 FROM n),
         (SELECT plots_in || ' plots' FROM n)
  UNION ALL
  SELECT 10, '10. Connection dates imported', (SELECT conns_in > 0 FROM n),
         (SELECT conns_in || ' plot-utility rows carry a Legacy_Plot_Utility_ID. '
                 || 'Rows without one are the app''s own and are not a sign the '
                 || 'import has run - see row 0.4.' FROM n)
  UNION ALL
  SELECT 11, '11. Customers attached', (SELECT from_contracts > 0 AND no_customer = 0 FROM n),
         (SELECT CASE WHEN from_contracts = 0 THEN 'nothing imported yet'
                 ELSE no_customer || ' imported projects still have no customer. '
                      || 'Expected until the customers are migrated; each one names '
                      || 'its company in its own Notes.' END FROM n)
)
-- ── ONE result set, deliberately ──
--
-- This was two statements, a checklist and a totals line. The Supabase
-- SQL editor shows only the LAST result, so the checklist — the part
-- worth reading — was thrown away and only four numbers came back.
--
-- So the totals are rows 0a to 0d of the same list. One statement, one
-- table, nothing discarded.
SELECT sort AS "#", step AS "Step",
       CASE WHEN done THEN 'done' ELSE 'not yet' END AS "State",
       NULLIF(detail, '') AS "Detail"
  FROM (
    SELECT 0.1 AS sort, 'Projects in the system'  AS step, true AS done,
           (SELECT count(*)::text FROM "Project") AS detail
    UNION ALL
    SELECT 0.2, 'Of those, imported from the original app', true,
           (SELECT count(*)::text FROM "Project"
             WHERE "Legacy_Contract_ID" IS NOT NULL OR "Legacy_Tender_ID" IS NOT NULL)
    UNION ALL
    SELECT 0.3, 'Plots in the system', true,
           (SELECT count(*)::text FROM "Plot") || ' ('
             || (SELECT count(*)::text FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL)
             || ' imported)'
    UNION ALL
    /* NOT "connections". A Plot_Utility row says this plot takes this
       utility; it exists from the moment the plot does. plots.js creates
       one per new plot per Project_Scope utility, and 1,714 were
       back-filled on 26 Aug. So a large number here is the app working,
       not an import that has run.

       The connection is the DATES on the row. Hence the second figure,
       which is the one that answers "has any work been booked". */
    SELECT 0.4, 'Plot-to-utility rows (app-created, not an import)', true,
           (SELECT count(*)::text FROM "Plot_Utility") || ' rows, '
             || (SELECT count(*)::text FROM "Plot_Utility"
                  WHERE "Legacy_Plot_Utility_ID" IS NOT NULL)
             || ' imported, '
             || (SELECT count(*)::text FROM "Plot_Utility"
                  WHERE "Programmed_Date" IS NOT NULL
                     OR "Connection_Date" IS NOT NULL
                     OR "As_Laid_Date" IS NOT NULL)
             || ' with any date on them'
    UNION ALL
    /* ── The one that stops the import dead ──

       log_project_changes() fires on every INSERT and UPDATE of
       Project. It used to name the columns it recorded, one of which
       was Customer_ID, dropped on 20 Sept. From that moment every save
       on a project failed:

         ERROR: column "Customer_ID" not found in data type "Project"
         CONTEXT: PL/pgSQL function log_project_changes() line 16

       0233 rewrote it to name no columns. If 0233 has NOT run, the
       import cannot place a single project: measured against the broken
       function, both an INSERT of a project and an UPDATE that changes
       any value on one fail outright. So it stops at the first row
       rather than half way, which is the only mercy in it.

       It also means nobody can create a project in the app at all -
       which 0233 says was how it was found. So a working New Project
       button is itself evidence this has run.

       Read straight off the function's own source rather than inferred
       from a migration list, because the migrations have not been run
       in order. */
    SELECT 0.5, 'Project saves work at all (migration 0233)',
           NOT EXISTS (SELECT 1 FROM pg_proc
                        WHERE proname = 'log_project_changes'
                          AND prosrc ILIKE '%Customer_ID%'),
           CASE
             WHEN NOT EXISTS (SELECT 1 FROM pg_proc
                               WHERE proname = 'log_project_changes')
               THEN 'No log_project_changes function at all - nothing to block it.'
             WHEN EXISTS (SELECT 1 FROM pg_proc
                           WHERE proname = 'log_project_changes'
                             AND prosrc ILIKE '%Customer_ID%')
               THEN 'STOP. The history trigger still names the dropped '
                    || 'Customer_ID column, so every UPDATE on Project fails '
                    || 'and the import would die part way through. Run 0233 first.'
             ELSE 'The history trigger names no columns, so saves work.'
           END
    UNION ALL
    SELECT sort::numeric, step, done, detail FROM steps
  ) all_rows
 ORDER BY sort;
