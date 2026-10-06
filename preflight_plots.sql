-- ════════════════════════════════════════════════════════════════════
--  Before importing the plots — one paste, one table back
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing.
--
-- Part 1 of import_legacy_plots.sql asks most of this, but as EIGHT
-- separate SELECTs — and the Supabase editor shows only the last, so
-- seven of them are thrown away. This is the same ground in one result
-- set, plus two questions that file does not ask.
--
-- "STOPS IT" means fix before running the import. Everything else is a
-- fact to know.
--
-- ── Why the constraints are read from the database ──
--
-- The Plot table is not created by any committed migration — it
-- pre-dates the baseline, like 0221, 0222 and 0238. So what is NOT NULL
-- on it cannot be read from the repository, and a test schema built
-- from an endpoint's column list does not have the constraints either.
-- That gap has already cost four failed runs this migration. Rows 4 and
-- 5 ask the live catalogue instead.

SELECT step AS "#", item AS "What", verdict AS "State", detail AS "Detail"
  FROM (

  -- ── What is staged ────────────────────────────────────────────────
  SELECT 1::numeric AS step, 'Plot rows staged' AS item,
         CASE WHEN count(*) > 0 THEN 'ok' ELSE 'STOPS IT' END AS verdict,
         count(*)::text || ' rows' AS detail
    FROM "Legacy_Plot_Import"

  UNION ALL
  SELECT 1.1, 'Connection rows staged',
         CASE WHEN count(*) > 0 THEN 'ok' ELSE 'part 3 has nothing to do' END,
         count(*)::text || ' rows'
    FROM "Legacy_Connection_Import"

  UNION ALL
  -- Staged twice is the easy mistake: the tables have no key to collide
  -- on, so a second run of the loader silently doubles everything.
  SELECT 1.2, 'Each plot staged once',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'STOPS IT - loaded twice' END,
         CASE WHEN count(*) = 0
              THEN 'no Plot_ID appears more than once'
              ELSE count(*)::text || ' Plot_IDs appear more than once. '
                   || 'DELETE FROM "Legacy_Plot_Import"; and load the file once.'
         END
    FROM (SELECT 1 FROM "Legacy_Plot_Import"
           WHERE COALESCE(btrim("Plot_ID"), '') <> ''
           GROUP BY btrim("Plot_ID") HAVING count(*) > 1) d

  -- ── How many will land now ────────────────────────────────────────
  UNION ALL
  SELECT 2, 'Plots whose project is already here', 'these land',
         count(*)::text || ' - matched on Contract_ID'
    FROM "Legacy_Plot_Import" i
   WHERE EXISTS (SELECT 1 FROM "Project" p
                  WHERE p."Legacy_Contract_ID"
                        = NULLIF(btrim(i."Contract_ID"), '')::bigint)

  UNION ALL
  SELECT 2.1, 'Plots waiting on the tender import', 'these wait',
         count(*)::text || ' carry a Tender_ID and no contract. They land '
           || 'when you re-run the import after the tenders.'
    FROM "Legacy_Plot_Import" i
   WHERE COALESCE(btrim(i."Tender_ID"), '') <> ''
     AND NOT EXISTS (SELECT 1 FROM "Project" p
                      WHERE p."Legacy_Contract_ID"
                            = NULLIF(btrim(i."Contract_ID"), '')::bigint)

  UNION ALL
  SELECT 2.2, 'Plots belonging to neither', 'look at these',
         count(*)::text || ' have no Contract_ID and no Tender_ID'
    FROM "Legacy_Plot_Import" i
   WHERE COALESCE(btrim(i."Contract_ID"), '') = ''
     AND COALESCE(btrim(i."Tender_ID"), '') = ''

  UNION ALL
  SELECT 2.3, 'Plots already imported', 'skipped on a re-run',
         count(*)::text || ' Plot rows carry a Legacy_Plot_ID'
    FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL

  -- ── What the insert must satisfy ──────────────────────────────────
  UNION ALL
  -- The import writes nine columns. Anything else NOT NULL without a
  -- default makes every row fail with 23502 — which is how the contract
  -- import found out about Project_Status_ID, after it had started.
  SELECT 4, 'Columns the import does not fill',
         CASE WHEN count(*) = 0 THEN 'ok'
              ELSE 'STOPS IT - every row would fail' END,
         CASE WHEN count(*) = 0
              THEN 'nothing on Plot is NOT NULL beyond what the import writes'
              ELSE 'NOT NULL with no default: ' || string_agg(column_name, ', ')
         END
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Plot'
     AND is_nullable = 'NO'
     AND column_default IS NULL
     AND is_identity = 'NO'
     AND column_name NOT IN ('Project_ID', 'Plot_Number', 'Plot_Ref',
                             'Property_Config_ID', 'Heat_Source_ID', 'KVA_Load',
                             'PV', 'Heat_Pump_Model_ID', 'Legacy_Plot_ID')

  UNION ALL
  -- 333,950 inserts through a row trigger is a different proposition
  -- from 333,950 plain inserts. Worth seeing before it runs, not after.
  SELECT 4.1, 'Triggers that will fire on every row',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'know about these' END,
         CASE WHEN count(*) = 0 THEN 'none'
              ELSE count(*)::text || ': ' || string_agg(tgname, ', ') END
    FROM pg_trigger
   WHERE tgrelid = '"Plot"'::regclass AND NOT tgisinternal

  -- ── The lookups the import maps through ───────────────────────────
  --
  -- Legacy_Lookup_Map currently holds only 'status' and 'region'. These
  -- three kinds are read by the plot import and nothing has filled
  -- them, so every plot would import with those columns empty.
  UNION ALL
  SELECT 5, 'Property configs to map',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'map these first' END,
         count(*)::text || ' distinct old id(s) with no row in '
           || 'Legacy_Lookup_Map under Kind = ''property_config'''
    FROM (SELECT DISTINCT btrim(i."Property_Config_ID") AS v
            FROM "Legacy_Plot_Import" i
           WHERE COALESCE(btrim(i."Property_Config_ID"), '') <> ''
             AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                              WHERE m."Kind" = 'property_config'
                                AND m."Legacy_ID" = btrim(i."Property_Config_ID"))) x

  UNION ALL
  SELECT 5.1, 'Heat sources to map',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'map these first' END,
         count(*)::text || ' distinct old id(s), Kind = ''heat_source'''
    FROM (SELECT DISTINCT btrim(i."Heat_Source_ID") AS v
            FROM "Legacy_Plot_Import" i
           WHERE COALESCE(btrim(i."Heat_Source_ID"), '') <> ''
             AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                              WHERE m."Kind" = 'heat_source'
                                AND m."Legacy_ID" = btrim(i."Heat_Source_ID"))) x

  UNION ALL
  SELECT 5.2, 'Heat pump models to map',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'map these first' END,
         count(*)::text || ' distinct old id(s), Kind = ''heat_pump'''
    FROM (SELECT DISTINCT btrim(i."Heat_Pump_Model_ID") AS v
            FROM "Legacy_Plot_Import" i
           WHERE COALESCE(btrim(i."Heat_Pump_Model_ID"), '') <> ''
             AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                              WHERE m."Kind" = 'heat_pump'
                                AND m."Legacy_ID" = btrim(i."Heat_Pump_Model_ID"))) x

  UNION ALL
  -- How much rides on them: a lookup left unmapped is not fatal, it is
  -- a column left empty on this many plots.
  SELECT 5.3, 'Plots riding on those lookups', 'for scale',
         (SELECT count(*) FROM "Legacy_Plot_Import"
           WHERE COALESCE(btrim("Property_Config_ID"), '') <> '')::text
           || ' have a config, '
           || (SELECT count(*) FROM "Legacy_Plot_Import"
                WHERE COALESCE(btrim("Heat_Source_ID"), '') <> '')::text
           || ' a heat source, '
           || (SELECT count(*) FROM "Legacy_Plot_Import"
                WHERE COALESCE(btrim("Heat_Pump_Model_ID"), '') <> '')::text
           || ' a heat pump model'

  -- ── And the thing that cannot be undone ───────────────────────────
  UNION ALL
  SELECT 9, 'Plots already on an imported project', 'read this',
         CASE WHEN (SELECT count(*) FROM "Plot" p
                     JOIN "Project" pr ON pr."Project_ID" = p."Project_ID"
                    WHERE pr."Legacy_Contract_ID" IS NOT NULL
                      AND p."Legacy_Plot_ID" IS NULL) = 0
              THEN 'none - nothing on an imported project was added by hand'
              ELSE (SELECT count(*) FROM "Plot" p
                     JOIN "Project" pr ON pr."Project_ID" = p."Project_ID"
                    WHERE pr."Legacy_Contract_ID" IS NOT NULL
                      AND p."Legacy_Plot_ID" IS NULL)::text
                   || ' plot(s) were added by hand to an imported project. '
                   || 'The import will add its own alongside them, which may '
                   || 'duplicate a plot number.'
         END

  ) r ORDER BY step;
