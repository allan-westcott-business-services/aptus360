-- ════════════════════════════════════════════════════════════════════
--  AV1 — somewhere to put the export
-- ════════════════════════════════════════════════════════════════════
--
-- Run this in the Supabase SQL editor. It creates one table and does
-- nothing else. Then load the CSV into it with `load_av.psql`.
--
-- Every column is text. Not laziness — the export has 2,518 blank
-- values and 6,205 blank dates, and a typed column turns each of those
-- into a COPY failure on line whatever. Text takes the file as it
-- stands and the import does the converting, where a bad value can be
-- reported instead of stopping the load.
--
-- Column names and order match the CSV header exactly, so COPY needs no
-- column list and cannot silently shift a column.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Legacy_AV_Agreement_Import" (
  "AV_Agreement_ID"           text,
  "Contract_ID"               text,
  "AV_Agreement_Type_ID"      text,
  "IDNO_ID"                   text,
  "IDNO_Reference"            text,
  "Asset_Value"               text,
  "Date_Agreed"               text,
  "Attachment_Path"           text,
  "Attachment_Name"           text,
  "Created_At"                text,
  "Tender_ID"                 text,
  "Initial_AV_Fee_Percentage" text,
  "Initial_AV_Fee"            text,
  "Estimated_Plot_AV_Value"   text
);

ALTER TABLE "Legacy_AV_Agreement_Import" ENABLE ROW LEVEL SECURITY;

-- The import joins on the contract and the legacy agreement id.
CREATE INDEX IF NOT EXISTS legacy_av_contract_idx
  ON "Legacy_AV_Agreement_Import" ((NULLIF(btrim("Contract_ID"), '')::bigint));

SELECT 'ready' AS "Status",
       'Now load the CSV with load_av.psql, then run AV2.' AS "Next";
