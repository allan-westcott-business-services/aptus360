-- ════════════════════════════════════════════════════════════════════
--  Importing the original app's Plots and their Connections
-- ════════════════════════════════════════════════════════════════════
--
-- 333,950 plots and 33,059 connections. The chain is
--
--   Plot_Utility -> Plot -> Contract -> Project
--
-- and every link is an exact key, so nothing here matches on a name.
--
-- Run 0250 and 0251 first, and import the contracts first — a plot
-- cannot exist without its project.
--
--   1. Load the plot CSV into "Legacy_Plot_Import" and the plot-utility
--      CSV into "Legacy_Connection_Import". The columns map one-to-one
--      by name; nothing needs renaming.
--
--   2. Run PART 1. Nothing is created.
--
--   3. Run PART 2 (plots), then PART 3 (connections). In that order:
--      part 3 joins on the plots part 2 creates.
--
-- Both parts are safe to run again — rows already imported are skipped
-- on their legacy id — and each is one DELETE to undo. Take a backup
-- first all the same.
--
-- ════════════════════════════════════════════════════════════════════
--  PART 1 — what will land, and what will not
-- ════════════════════════════════════════════════════════════════════

-- 1.1 The plots, and whether their project is here yet.
SELECT CASE
         WHEN p."Project_ID" IS NOT NULL THEN 'ok - project imported'
         WHEN COALESCE(btrim(i."Tender_ID"), '') <> ''
           THEN 'belongs to a TENDER - waiting on the tender file'
         WHEN COALESCE(btrim(i."Contract_ID"), '') <> ''
           THEN 'contract not imported'
         ELSE 'belongs to neither a contract nor a tender'
       END AS state,
       count(*) AS plots
  FROM "Legacy_Plot_Import" i
  LEFT JOIN "Project" p
    ON p."Legacy_Contract_ID" = NULLIF(btrim(i."Contract_ID"), '')::bigint
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.2 The connections, and whether their plot is here yet. Run this
--     again after part 2 — it should then read "ok" for all of them
--     whose plot came from a contract.
SELECT plot_status, count(*) FROM "Legacy_Connection_Resolved"
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.3 ── The words that have to match a lookup ──
--
--     Pack status and visit outcome arrive as text. Anything reading
--     "NOT MATCHED" is left empty on the imported connection, so look
--     before importing: five statuses and three outcomes is a list
--     somebody can read in a second.
SELECT 'pack status' AS lookup, c."Status_Of_Pack" AS word, count(*) AS rows,
       CASE WHEN max(r.pack_status_id) IS NULL THEN 'NOT MATCHED' ELSE 'ok' END AS state
  FROM "Legacy_Connection_Import" c
  JOIN "Legacy_Connection_Resolved" r
    ON r."Legacy_Connection_Import_ID" = c."Legacy_Connection_Import_ID"
 WHERE COALESCE(btrim(c."Status_Of_Pack"), '') <> ''
 GROUP BY 1, 2
UNION ALL
SELECT 'visit outcome', c."Visit_Outcome", count(*),
       CASE WHEN max(r.visit_outcome_id) IS NULL THEN 'NOT MATCHED' ELSE 'ok' END
  FROM "Legacy_Connection_Import" c
  JOIN "Legacy_Connection_Resolved" r
    ON r."Legacy_Connection_Import_ID" = c."Legacy_Connection_Import_ID"
 WHERE COALESCE(btrim(c."Visit_Outcome"), '') <> ''
 GROUP BY 1, 2
 ORDER BY 1, 3 DESC;

-- 1.4 The adopters. 25,590 rows name one, and this is where that fact
--     lives — the old IDNO_ID column is on 125 rows. An adopter with no
--     organisation holding an IDNO/DNO/GT/WU role is left empty, and
--     creating that organisation is the fix.
SELECT c."Adopter", count(*) AS rows,
       CASE WHEN max(r.adopter_organisation_id) IS NULL
            THEN 'no organisation with that name and an adopter role'
            ELSE 'ok' END AS state
  FROM "Legacy_Connection_Import" c
  JOIN "Legacy_Connection_Resolved" r
    ON r."Legacy_Connection_Import_ID" = c."Legacy_Connection_Import_ID"
 WHERE COALESCE(btrim(c."Adopter"), '') <> ''
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.5 ── The utilities, which are numbers at both ends ──
--
--     The old file uses 1, 2 and 3 and so does this system. The numbers
--     LOOK the same, which is exactly the sort of thing that is wrong
--     once and silently — so read this before importing rather than
--     taking my word for it. A row mapped in Legacy_Lookup_Map wins; a
--     row without one keeps its number.
SELECT c."Utility_ID" AS old_id, count(*) AS rows,
       m."New_ID" AS mapped_to,
       u."Utility" AS this_system_calls_it,
       CASE WHEN m."New_ID" IS NULL THEN 'unmapped - keeps its number'
            ELSE 'mapped' END AS state
  FROM "Legacy_Connection_Import" c
  LEFT JOIN "Legacy_Lookup_Map" m
         ON m."Kind" = 'utility' AND m."Legacy_ID" = btrim(c."Utility_ID")
  LEFT JOIN "Utility" u
         ON u."Utility_ID" = COALESCE(m."New_ID", NULLIF(btrim(c."Utility_ID"), '')::bigint)
 GROUP BY 1, 3, 4 ORDER BY 2 DESC;

-- 1.6 Plot lookups that have to be mapped by hand, same as 0245's. An
--     unmapped id leaves the field empty on the plot.
WITH used AS (
  SELECT 'property_config' AS kind, "Property_Config_ID" AS legacy_id FROM "Legacy_Plot_Import"
  UNION ALL SELECT 'heat_source', "Heat_Source_ID" FROM "Legacy_Plot_Import"
  UNION ALL SELECT 'heat_pump',   "Heat_Pump_Model_ID" FROM "Legacy_Plot_Import"
)
SELECT u.kind, u.legacy_id, count(*) AS plots, m."New_ID",
       CASE WHEN m."Kind" IS NULL THEN 'NOT MAPPED - left empty' ELSE 'mapped' END AS state
  FROM used u
  LEFT JOIN "Legacy_Lookup_Map" m ON m."Kind" = u.kind AND m."Legacy_ID" = u.legacy_id
 WHERE COALESCE(btrim(u.legacy_id), '') <> ''
 GROUP BY u.kind, u.legacy_id, m."New_ID", m."Kind"
 ORDER BY u.kind, count(*) DESC;

-- 1.7 ── Plots that will NOT be imported, and why ──
--
--     Run this after the tenders have been imported. Before then, the
--     answer is simply "their project does not exist yet".
--
--     The interesting case is the last one. A tender that was won became
--     a contract, and both are ONE project here — but several REVISIONS
--     of that tender can match the same project, and a project records
--     one Legacy_Tender_ID. The revisions that lost carry their own
--     copies of the plots, at the same site, numbered the same.
--
--     Those are skipped on purpose. Importing them would put two plot 1s
--     on one project, which is worse than leaving the tender-stage copy
--     behind: the contract's plots are the ones that were built.
--
--     Measured on the real files: 6,546 plots across 67 tenders.
SELECT CASE
         WHEN m.matched_project_id IS NOT NULL
           THEN 'a revision of a tender already merged into its contract - skipped on purpose'
         WHEN COALESCE(btrim(i."Tender_ID"), '') <> ''
           THEN 'its tender has not been imported yet'
         WHEN COALESCE(btrim(i."Contract_ID"), '') <> ''
           THEN 'its contract has not been imported yet'
         ELSE 'belongs to neither'
       END AS why,
       count(*) AS plots,
       count(DISTINCT COALESCE(i."Tender_ID", i."Contract_ID")) AS records
  FROM "Legacy_Plot_Import" i
  LEFT JOIN "Legacy_Tender_Match" m ON m."Tender_ID" = i."Tender_ID"
 WHERE NOT EXISTS (SELECT 1 FROM "Plot" x
                    WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint)
 GROUP BY 1 ORDER BY 2 DESC;

-- ════════════════════════════════════════════════════════════════════
--  PART 2 — the plots
-- ════════════════════════════════════════════════════════════════════
--
-- Only the ones whose project is already here. The tender half of the
-- file simply does not match and is left for the tender import; run
-- this again afterwards and they will land then.
--
-- ── The plot address goes nowhere ──
--
-- 136,251 plots carry a house number, street, town, county and
-- postcode, and the new Plot table has no address at all — a plot is
-- identified by its number within a project. Nothing is invented for
-- them here. If the addresses matter, they want columns of their own
-- and this import can be re-run to fill them.

INSERT INTO "Plot" (
  "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "Heat_Source_ID", "KVA_Load", "PV", "Heat_Pump_Model_ID", "Legacy_Plot_ID"
)
SELECT
  p."Project_ID",
  NULLIF(btrim(i."Plot"), ''),
  NULLIF(btrim(i."Plot_Ref"), ''),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'property_config' AND m."Legacy_ID" = btrim(i."Property_Config_ID")),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_source' AND m."Legacy_ID" = btrim(i."Heat_Source_ID")),
  NULLIF(btrim(i."KVA_Load"), '')::numeric,
  COALESCE(NULLIF(btrim(i."PV"), '')::boolean, false),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_pump' AND m."Legacy_ID" = btrim(i."Heat_Pump_Model_ID")),
  NULLIF(btrim(i."Plot_ID"), '')::bigint
  FROM "Legacy_Plot_Import" i
  JOIN "Project" p
    ON p."Legacy_Contract_ID" = NULLIF(btrim(i."Contract_ID"), '')::bigint
 WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "Plot" x
      WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint
   );

-- And the tender half, once the tenders have been imported. 174,650 of
-- the plots belong to a Tender_ID rather than a Contract_ID, and they
-- land here the moment those projects exist — which is why this file is
-- worth running again after import_legacy_tenders.sql rather than only
-- once.
--
-- A tender that became a contract is ONE project carrying both ids, so
-- its plots are already in above and the NOT EXISTS below skips them.

INSERT INTO "Plot" (
  "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "Heat_Source_ID", "KVA_Load", "PV", "Heat_Pump_Model_ID", "Legacy_Plot_ID"
)
SELECT
  p."Project_ID",
  NULLIF(btrim(i."Plot"), ''),
  NULLIF(btrim(i."Plot_Ref"), ''),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'property_config' AND m."Legacy_ID" = btrim(i."Property_Config_ID")),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_source' AND m."Legacy_ID" = btrim(i."Heat_Source_ID")),
  NULLIF(btrim(i."KVA_Load"), '')::numeric,
  COALESCE(NULLIF(btrim(i."PV"), '')::boolean, false),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_pump' AND m."Legacy_ID" = btrim(i."Heat_Pump_Model_ID")),
  NULLIF(btrim(i."Plot_ID"), '')::bigint
  FROM "Legacy_Plot_Import" i
  JOIN "Project" p
    ON p."Legacy_Tender_ID" = NULLIF(btrim(i."Tender_ID"), '')::bigint
 WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "Plot" x
      WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint
   );

DO $$
DECLARE made integer; waiting integer;
BEGIN
  SELECT count(*) INTO made FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL;
  SELECT count(*) INTO waiting FROM "Legacy_Plot_Import" i
   WHERE NOT EXISTS (SELECT 1 FROM "Plot" x
                      WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint);
  RAISE NOTICE 'Plots from the original app: %. Not imported: % — run query '
    '1.7 for what they are.', made, waiting;
END $$;

-- ════════════════════════════════════════════════════════════════════
--  PART 3 — the connections
-- ════════════════════════════════════════════════════════════════════
--
-- Run after part 2. A connection whose plot is not here yet is skipped
-- and picked up on a later run.
--
-- MPAN_MPRN is deliberately NOT written: the new table has both
-- Meter_Reference and Reference and which one holds a supply number has
-- not been settled. 16,525 rows carry one. Settle it and this import
-- fills them in on a re-run — the rows are matched on their legacy id,
-- so nothing is duplicated.

INSERT INTO "Plot_Utility" (
  "Plot_ID", "Utility_ID", "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome", "Visit_Outcome_ID", "IDNO_ID",
  "AV_Value", "Self_Lay_Provider", "Dead_Jointed_Date", "Team_ID",
  "Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"
)
SELECT
  r.new_plot_id,
  COALESCE(
    (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
      WHERE m."Kind" = 'utility' AND m."Legacy_ID" = btrim(r."Utility_ID")),
    NULLIF(btrim(r."Utility_ID"), '')::bigint),
  NULLIF(btrim(r."Programmed_Date"), '')::date,
  NULLIF(btrim(r."Connection_Date"), '')::date,
  NULLIF(btrim(r."As_Laid_Date"), '')::date,
  NULLIF(btrim(r."Meter_Number"), ''),
  NULLIF(btrim(r."Service_Card_Submission_Date"), '')::date,
  NULLIF(btrim(r."Meter_Card_Submission_Date"), '')::date,
  r.pack_status_id,
  /* The words as well as the id. The new table keeps both columns, and
     an outcome whose word did not match a lookup is better recorded as
     the word than lost entirely. */
  NULLIF(btrim(r."Visit_Outcome"), ''),
  r.visit_outcome_id,
  /* The adopter, which is what the old IDNO_ID column should have held
     and mostly did not. */
  r.adopter_organisation_id,
  NULLIF(btrim(r."Expected_Asset_Value"), '')::numeric,
  COALESCE(NULLIF(btrim(r."Self_Lay_Provider"), '')::boolean, false),
  NULLIF(btrim(r."Dead_Jointed_Date"), '')::date,
  NULLIF(btrim(r."Team_ID"), '')::bigint,
  NULLIF(btrim(r."Planned_Jointing_Date"), '')::date,
  NULLIF(btrim(r."Actual_Jointing_Date"), '')::date,
  NULLIF(btrim(r."Plot_Utility_ID"), '')::bigint
  FROM "Legacy_Connection_Resolved" r
 WHERE r.new_plot_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "Plot_Utility" x
      WHERE x."Legacy_Plot_Utility_ID" = NULLIF(btrim(r."Plot_Utility_ID"), '')::bigint
   );

DO $$
DECLARE made integer; waiting integer; noadopter integer;
BEGIN
  SELECT count(*) INTO made FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
  SELECT count(*) INTO waiting FROM "Legacy_Connection_Resolved" WHERE new_plot_id IS NULL;
  SELECT count(*) INTO noadopter FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "IDNO_ID" IS NULL;
  RAISE NOTICE 'Connections from the original app: %. Waiting on their plot: %. '
    'Without an adopter: % — query 1.4 says which names did not match.',
    made, waiting, noadopter;
END $$;

-- ── Undoing either part ───────────────────────────────────────────────
--
--   DELETE FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
--   DELETE FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL;
--
-- In that order: the connections hang off the plots.
--
-- ── Afterwards ───────────────────────────────────────────────────────
--
--   -- Connections per utility, which should look like the old system's
--   SELECT u."Utility", count(*) FROM "Plot_Utility" pu
--     JOIN "Utility" u USING ("Utility_ID")
--    WHERE pu."Legacy_Plot_Utility_ID" IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
--
--   -- A project's plots and how many are connected
--   SELECT p."Project_Ref", p."Site_Name", count(DISTINCT pl."Plot_ID") AS plots,
--          count(pu."Plot_Utility_ID") AS connections
--     FROM "Project" p
--     JOIN "Plot" pl ON pl."Project_ID" = p."Project_ID"
--     LEFT JOIN "Plot_Utility" pu ON pu."Plot_ID" = pl."Plot_ID"
--    WHERE p."Legacy_Contract_ID" IS NOT NULL
--    GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 20;
