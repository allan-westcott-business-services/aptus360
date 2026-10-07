-- ════════════════════════════════════════════════════════════════════
--  0255 — tables the "Import data from CSV" button can actually see
-- ════════════════════════════════════════════════════════════════════
--
-- Run this once. Then the Table Editor's CSV import works for the plot
-- and connection files, and you never touch a command line.
--
-- ── The problem it solves ──
--
-- On 5 Oct, importing a CSV through the Table Editor gave
--
--   relation "public.legacy_customer_import" does not exist
--
-- The button builds the table name UNQUOTED. Postgres folds an
-- unquoted name to lower case, and every table in this schema is
-- mixed-case — "Legacy_Plot_Import", not legacy_plot_import — so it
-- looks for a table that is not there and stops.
--
-- That is a NAMING problem, not a size one. Give the button a table
-- whose name really is lower case and it works.
--
-- So this creates two lower-case twins. Their COLUMN names stay
-- mixed-case and quoted, exactly matching the headers in your exports,
-- because the importer maps columns by header NAME — which also means
-- the column ORDER in your CSV does not matter.
--
-- ── What you do after running this ──
--
--   1. Table Editor -> legacy_plot_import -> Import data from CSV ->
--      the plot export.
--   2. Table Editor -> legacy_connection_import -> Import data from CSV
--      -> Plot_Utility_rows_1.csv.
--   3. Run move_csv_into_staging.sql, which copies the rows into the
--      real tables and empties the twins.
--
-- Either import can be done in several goes with the file split up —
-- the twins do not care how many times you add to them.
--
-- ── Safe to run again ──
--
-- IF NOT EXISTS throughout. Running it twice creates nothing and loses
-- nothing.

CREATE TABLE IF NOT EXISTS legacy_plot_import (
  "Plot_ID" text,
  "Contract_ID" text,
  "Tender_ID" text,
  "Plot" text,
  "Plot_Ref" text,
  "House_Number" text,
  "Street_Name" text,
  "Town" text,
  "County" text,
  "Postcode" text,
  "Property_Config_ID" text,
  "Heat_Source_ID" text,
  "KVA_Load" text,
  "Branch_ID" text,
  "Self_Lay_Provider" text,
  "POC_Reference" text,
  "Electric_Self_Lay_Provider" text,
  "Electric_IDNO_ID" text,
  "Gas_Self_Lay_Provider" text,
  "Gas_IDNO_ID" text,
  "Water_Self_Lay_Provider" text,
  "Water_IDNO_ID" text,
  "Main_POC_Reference" text,
  "Interim_POC_Reference" text,
  "TBS_POC_Reference" text,
  "Electric_Main_POC_Reference" text,
  "Electric_Interim_POC_Reference" text,
  "Electric_TBS_POC_Reference" text,
  "Gas_Main_POC_Reference" text,
  "Gas_Interim_POC_Reference" text,
  "Gas_TBS_POC_Reference" text,
  "Water_Main_POC_Reference" text,
  "Water_Interim_POC_Reference" text,
  "Water_TBS_POC_Reference" text,
  "Heat_Pump_Model_ID" text,
  "PV" text,
  "Sust_Clean_Award" text,
  "Sust_Waste_Award" text,
  "Sust_Clean_Today" text,
  "Sust_Waste_Today" text,
  "MPAN" text
);

CREATE TABLE IF NOT EXISTS legacy_connection_import (
  "Plot_Utility_ID" text,
  "Plot_ID" text,
  "Utility_ID" text,
  "Programmed_Date" text,
  "Connection_Date" text,
  "Visit_Outcome" text,
  "Meter_Number" text,
  "Meter_Photos" text,
  "As_Laid_Date" text,
  "Adopter" text,
  "Team_ID" text,
  "Status_Of_Pack" text,
  "Service_Card_Submission_Date" text,
  "Days_To_Complete" text,
  "Smart_Meter" text,
  "IDNO_ID" text,
  "MPAN_MPRN" text,
  "Meter_Card_Submission_Date" text,
  "Joint_Type_ID" text,
  "Cable_Size_In" text,
  "Cable_Size_Out" text,
  "Joint_Picture_Path" text,
  "Source_Plot_Service_ID" text,
  "Self_Lay_Provider" text,
  "Dead_Jointed_Date" text,
  "Expected_Asset_Value" text,
  "Service_Card_File_Path" text,
  "Planned_Jointing_Date" text,
  "Actual_Jointing_Date" text
);

-- Row Level Security is on by default for a new table on Supabase, and
-- the Table Editor's import goes through PostgREST as you. These are
-- scratch tables that exist for a few minutes during a migration, hold
-- no customer data that is not already in the real staging tables, and
-- are dropped afterwards — so they are left open rather than given a
-- policy set that would be deleted before anybody read it.
ALTER TABLE legacy_plot_import       DISABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_connection_import DISABLE ROW LEVEL SECURITY;
