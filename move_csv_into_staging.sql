-- ════════════════════════════════════════════════════════════════════
--  Move the imported rows into the real staging tables
-- ════════════════════════════════════════════════════════════════════
--
-- Run this AFTER importing the CSVs into the lower-case twins that
-- migration 0255 created.
--
-- One statement. It copies both files across, empties the twins so a
-- second import cannot double anything up, and reports what landed.
--
-- Safe to run again: with the twins empty it copies nothing and the
-- report says 0 moved.

WITH moved_plots AS (
  INSERT INTO "Legacy_Plot_Import" (
  "Plot_ID", "Contract_ID", "Tender_ID", "Plot", "Plot_Ref",
  "House_Number", "Street_Name", "Town", "County", "Postcode",
  "Property_Config_ID", "Heat_Source_ID", "KVA_Load", "Branch_ID",
  "Self_Lay_Provider", "POC_Reference", "Electric_Self_Lay_Provider",
  "Electric_IDNO_ID", "Gas_Self_Lay_Provider", "Gas_IDNO_ID",
  "Water_Self_Lay_Provider", "Water_IDNO_ID", "Main_POC_Reference",
  "Interim_POC_Reference", "TBS_POC_Reference",
  "Electric_Main_POC_Reference", "Electric_Interim_POC_Reference",
  "Electric_TBS_POC_Reference", "Gas_Main_POC_Reference",
  "Gas_Interim_POC_Reference", "Gas_TBS_POC_Reference",
  "Water_Main_POC_Reference", "Water_Interim_POC_Reference",
  "Water_TBS_POC_Reference", "Heat_Pump_Model_ID", "PV",
  "Sust_Clean_Award", "Sust_Waste_Award", "Sust_Clean_Today",
  "Sust_Waste_Today", "MPAN"
  )
  SELECT
  "Plot_ID", "Contract_ID", "Tender_ID", "Plot", "Plot_Ref",
  "House_Number", "Street_Name", "Town", "County", "Postcode",
  "Property_Config_ID", "Heat_Source_ID", "KVA_Load", "Branch_ID",
  "Self_Lay_Provider", "POC_Reference", "Electric_Self_Lay_Provider",
  "Electric_IDNO_ID", "Gas_Self_Lay_Provider", "Gas_IDNO_ID",
  "Water_Self_Lay_Provider", "Water_IDNO_ID", "Main_POC_Reference",
  "Interim_POC_Reference", "TBS_POC_Reference",
  "Electric_Main_POC_Reference", "Electric_Interim_POC_Reference",
  "Electric_TBS_POC_Reference", "Gas_Main_POC_Reference",
  "Gas_Interim_POC_Reference", "Gas_TBS_POC_Reference",
  "Water_Main_POC_Reference", "Water_Interim_POC_Reference",
  "Water_TBS_POC_Reference", "Heat_Pump_Model_ID", "PV",
  "Sust_Clean_Award", "Sust_Waste_Award", "Sust_Clean_Today",
  "Sust_Waste_Today", "MPAN"
    FROM legacy_plot_import
  RETURNING 1
),
moved_conns AS (
  INSERT INTO "Legacy_Connection_Import" (
  "Plot_Utility_ID", "Plot_ID", "Utility_ID", "Programmed_Date",
  "Connection_Date", "Visit_Outcome", "Meter_Number", "Meter_Photos",
  "As_Laid_Date", "Adopter", "Team_ID", "Status_Of_Pack",
  "Service_Card_Submission_Date", "Days_To_Complete", "Smart_Meter",
  "IDNO_ID", "MPAN_MPRN", "Meter_Card_Submission_Date",
  "Joint_Type_ID", "Cable_Size_In", "Cable_Size_Out",
  "Joint_Picture_Path", "Source_Plot_Service_ID", "Self_Lay_Provider",
  "Dead_Jointed_Date", "Expected_Asset_Value",
  "Service_Card_File_Path", "Planned_Jointing_Date",
  "Actual_Jointing_Date"
  )
  SELECT
  "Plot_Utility_ID", "Plot_ID", "Utility_ID", "Programmed_Date",
  "Connection_Date", "Visit_Outcome", "Meter_Number", "Meter_Photos",
  "As_Laid_Date", "Adopter", "Team_ID", "Status_Of_Pack",
  "Service_Card_Submission_Date", "Days_To_Complete", "Smart_Meter",
  "IDNO_ID", "MPAN_MPRN", "Meter_Card_Submission_Date",
  "Joint_Type_ID", "Cable_Size_In", "Cable_Size_Out",
  "Joint_Picture_Path", "Source_Plot_Service_ID", "Self_Lay_Provider",
  "Dead_Jointed_Date", "Expected_Asset_Value",
  "Service_Card_File_Path", "Planned_Jointing_Date",
  "Actual_Jointing_Date"
    FROM legacy_connection_import
  RETURNING 1
),
/* Emptied in the same statement, so the twins cannot be copied twice.
   DELETE rather than TRUNCATE: TRUNCATE cannot run in a statement that
   is also reading the table. */
cleared_plots AS (
  DELETE FROM legacy_plot_import
   WHERE EXISTS (SELECT 1 FROM moved_plots) RETURNING 1
),
cleared_conns AS (
  DELETE FROM legacy_connection_import
   WHERE EXISTS (SELECT 1 FROM moved_conns) RETURNING 1
)
SELECT 1 AS step, 'Plots moved' AS what,
       (SELECT count(*) FROM moved_plots)::text
         || ' row(s). The plot file is 333,950 rows - if this says less, '
         || 'the import did not finish and you can import the rest and '
         || 'run this again.' AS detail
UNION ALL
SELECT 2, 'Connections moved',
       (SELECT count(*) FROM moved_conns)::text
         || ' row(s). Plot_Utility_rows_1.csv is 33,059 rows.'
UNION ALL
/* ── Why the moved counts are ADDED here ──

   This read the two tables directly and reported 0 of each immediately
   after successfully moving 33,059 rows. Everything in one statement
   sees one snapshot, so a count here cannot see the INSERTs in the CTEs
   above it, however it is written - the rows are real, the count is
   taken from before they existed. Adding what the CTEs returned is what
   makes the two halves agree.

   Run it a second time and the moved counts are 0, so this still reads
   true. */
SELECT 3, 'In the real staging tables now',
       ((SELECT count(*) FROM "Legacy_Plot_Import")
         + (SELECT count(*) FROM moved_plots))::text || ' plot row(s), '
         || ((SELECT count(*) FROM "Legacy_Connection_Import")
              + (SELECT count(*) FROM moved_conns))::text
         || ' connection row(s)'
ORDER BY 1;
