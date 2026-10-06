-- ── Staging for the plots and their connections ──────────────────────
--
-- 333,950 plots and 33,059 connections out of the original app. Same
-- arrangement as 0248: every column text, loaded first and resolved
-- afterwards, so what each row points at can be looked at before
-- anything becomes real.
--
-- ── The chain ──
--
--   Plot_Utility -> Plot -> Contract -> Project
--
-- and each link is an exact key, checked against the real exports:
--
--   * every plot belongs to a Contract_ID or a Tender_ID — none to
--     neither;
--   * all 1,915 contracts those plots name are in the contract file;
--   * all 13,718 plots that have a connection are in the plot file.
--
-- So nothing here matches on a name or a description. If a row does not
-- land, it is because something upstream has not been imported yet, and
-- the reports say which.
--
-- ── Plots come in two halves ──
--
-- 159,300 belong to contracts and 175,423 to tenders. Only the contract
-- half can be imported today, because only the contracts are. The
-- tender half waits for the tender file, from the same staging table —
-- which is why Tender_ID is here from the start.

CREATE TABLE IF NOT EXISTS "Legacy_Plot_Import" (
  "Legacy_Plot_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Plot_ID"                text,
  "Contract_ID"            text,
  "Tender_ID"              text,
  "Plot"                   text,
  "Plot_Ref"               text,
  "House_Number"           text,
  "Street_Name"            text,
  "Town"                   text,
  "County"                 text,
  "Postcode"               text,
  "Property_Config_ID"     text,
  "Heat_Source_ID"         text,
  "KVA_Load"               text,
  "Branch_ID"              text,
  "Self_Lay_Provider"      text,
  "POC_Reference"          text,
  "Electric_Self_Lay_Provider" text,
  "Electric_IDNO_ID"       text,
  "Gas_Self_Lay_Provider"  text,
  "Gas_IDNO_ID"            text,
  "Water_Self_Lay_Provider" text,
  "Water_IDNO_ID"          text,
  "Main_POC_Reference"     text,
  "Interim_POC_Reference"  text,
  "TBS_POC_Reference"      text,
  "Electric_Main_POC_Reference"    text,
  "Electric_Interim_POC_Reference" text,
  "Electric_TBS_POC_Reference"     text,
  "Gas_Main_POC_Reference"         text,
  "Gas_Interim_POC_Reference"      text,
  "Gas_TBS_POC_Reference"          text,
  "Water_Main_POC_Reference"       text,
  "Water_Interim_POC_Reference"    text,
  "Water_TBS_POC_Reference"        text,
  "Heat_Pump_Model_ID"     text,
  "PV"                     text,
  "Sust_Clean_Award"       text,
  "Sust_Waste_Award"       text,
  "Sust_Clean_Today"       text,
  "Sust_Waste_Today"       text,
  "MPAN"                   text
);

CREATE TABLE IF NOT EXISTS "Legacy_Connection_Import" (
  "Legacy_Connection_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Plot_Utility_ID"        text,
  "Plot_ID"                text,
  "Utility_ID"             text,
  "Programmed_Date"        text,
  "Connection_Date"        text,
  "Visit_Outcome"          text,
  "Meter_Number"           text,
  "Meter_Photos"           text,
  "As_Laid_Date"           text,
  "Adopter"                text,
  "Team_ID"                text,
  "Status_Of_Pack"         text,
  "Service_Card_Submission_Date" text,
  "Days_To_Complete"       text,
  "Smart_Meter"            text,
  "IDNO_ID"                text,
  "MPAN_MPRN"              text,
  "Meter_Card_Submission_Date" text,
  "Joint_Type_ID"          text,
  "Cable_Size_In"          text,
  "Cable_Size_Out"         text,
  "Joint_Picture_Path"     text,
  "Source_Plot_Service_ID" text,
  "Self_Lay_Provider"      text,
  "Dead_Jointed_Date"      text,
  "Expected_Asset_Value"   text,
  "Service_Card_File_Path" text,
  "Planned_Jointing_Date"  text,
  "Actual_Jointing_Date"   text
);

COMMENT ON TABLE "Legacy_Plot_Import" IS
  'Raw rows from the original app''s Plot export, as text. Safe to empty '
  'once the plots are imported and checked.';
COMMENT ON TABLE "Legacy_Connection_Import" IS
  'Raw rows from the original app''s Plot_Utility export, as text.';

/* ── Indexed on the EXPRESSION, not the column ──
   
   Everything joins on NULLIF(btrim("Contract_ID"), '')::bigint, because
   the staging columns are text and "" is not a number. An index on the
   bare text column cannot serve that, so Postgres scans the whole table
   — and with 333,950 plot rows checked once per tender, the tender
   import ran for more than ten minutes before it was stopped.
   
   These make the same joins instant. Worth the five lines: the
   alternative is an import nobody can tell apart from a hung session. */
CREATE INDEX IF NOT EXISTS "Legacy_Plot_Import_Contract_IDX"
  ON "Legacy_Plot_Import" ((NULLIF(btrim("Contract_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS "Legacy_Plot_Import_Tender_IDX"
  ON "Legacy_Plot_Import" ((NULLIF(btrim("Tender_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS "Legacy_Plot_Import_Plot_IDX"
  ON "Legacy_Plot_Import" ((NULLIF(btrim("Plot_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS "Legacy_Connection_Import_Plot_IDX"
  ON "Legacy_Connection_Import" ((NULLIF(btrim("Plot_ID"), '')::bigint));

-- ── Lookups that come across as TEXT, not as ids ──────────────────────
--
-- The old connection rows name the pack status and the visit outcome in
-- words — "Returned", "Completed", "Dead Jointed" — where this system
-- keeps both as lookup tables. Those are matched on the text, which is
-- safe here in a way that matching a customer by name is not: there are
-- five pack statuses and three outcomes, somebody can read the whole
-- list in a second, and the report below shows any word that did not
-- match before anything is imported.
--
-- Adopter is the other one: 25,590 rows name a GTC, an ESP, a United
-- Utilities. Here that is an organisation holding an IDNO, GT, WU, IGT
-- or IWU role, and the old IDNO_ID column is nearly empty (125 rows) —
-- so the WORDS are where that fact actually lives.

CREATE OR REPLACE VIEW "Legacy_Connection_Resolved" AS
SELECT c.*,
       p."Plot_ID" AS new_plot_id,
       (SELECT s."Pack_Status_ID" FROM "Pack_Status" s
         WHERE upper(btrim(s."Pack_Status")) = upper(btrim(c."Status_Of_Pack"))
         LIMIT 1) AS pack_status_id,
       (SELECT v."Visit_Outcome_ID" FROM "Visit_Outcome" v
         WHERE upper(btrim(v."Visit_Outcome")) = upper(btrim(c."Visit_Outcome"))
         LIMIT 1) AS visit_outcome_id,
       /* The adopter, as an organisation that actually adopts networks.
          Restricted by role so "United Utilities" reaches the water
          undertaker and not a customer record of the same name. */
       (SELECT o."Organisation_ID" FROM "Organisation" o
          JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID"
          JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
         WHERE t."Type_Key" IN ('idno', 'dno', 'gt', 'wu', 'igt', 'iwu')
           AND r."Is_Active"
           AND COALESCE(btrim(c."Adopter"), '') <> ''
           AND upper(btrim(o."Name")) = upper(btrim(c."Adopter"))
         LIMIT 1) AS adopter_organisation_id,
       CASE
         WHEN p."Plot_ID" IS NULL THEN 'waiting on the plot being imported'
         ELSE 'ok'
       END AS plot_status
  FROM "Legacy_Connection_Import" c
  LEFT JOIN "Plot" p
    ON p."Legacy_Plot_ID" = NULLIF(btrim(c."Plot_ID"), '')::bigint;

COMMENT ON VIEW "Legacy_Connection_Resolved" IS
  'Each staged connection with the plot it belongs to and the lookups its '
  'words resolve to. plot_status says why not, where it could not.';

DO $$
BEGIN
  PERFORM 1 FROM information_schema.views
   WHERE table_name = 'Legacy_Connection_Resolved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legacy_Connection_Resolved was not created.';
  END IF;
  RAISE NOTICE 'Staging is ready for the plots and their connections. Load '
    'the two CSVs, then run import_legacy_plots.sql part 1.';
END $$;
