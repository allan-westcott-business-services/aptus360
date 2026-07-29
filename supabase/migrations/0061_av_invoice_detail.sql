-- ════════════════════════════════════════════════════════════════
-- 0061 — asset value invoices on the project page
--
-- The register added in 0060 answers "what have we earned and not yet
-- claimed". The project page needs the other view: the invoices
-- themselves, each opening to the plot lines it is made of.
--
-- The original's contract page shows invoice date, number, D365 number,
-- sub total, VAT, total, raised by, document type, agreement type and a
-- PDF, over lines carrying plot, value, connected date and notes.
-- AV_Invoice already covers most of it. Four things are missing.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "AV_Invoice"
  -- The number this invoice was given in the finance system. Kept apart
  -- from Invoice_Number because the two are set by different people at
  -- different times, and reconciling them is the whole point of having
  -- both.
  ADD COLUMN IF NOT EXISTS "D365_Number"   text,
  -- A credit is an invoice with the sign reversed, not a separate thing.
  ADD COLUMN IF NOT EXISTS "Document_Type" text NOT NULL DEFAULT 'Invoice',
  -- Where the signed PDF lives once it exists. A path rather than the
  -- bytes: Supabase storage holds the file, this holds the pointer.
  ADD COLUMN IF NOT EXISTS "PDF_Path"      text;

ALTER TABLE "AV_Invoice"
  DROP CONSTRAINT IF EXISTS "AV_Invoice_Document_Type_check";
ALTER TABLE "AV_Invoice"
  ADD CONSTRAINT "AV_Invoice_Document_Type_check"
  CHECK ("Document_Type" IN ('Invoice','Credit'));

ALTER TABLE "AV_Invoice_Line"
  ADD COLUMN IF NOT EXISTS "Notes" text;

CREATE INDEX IF NOT EXISTS av_invoice_d365_idx ON "AV_Invoice" ("D365_Number");


-- ── Lines, with the connection date they were earned by ──────────
-- Connected date is not stored on the line. It belongs to the plot's
-- connection record and would go stale the moment that was corrected —
-- and a line's whole justification is that the meter went in on a date,
-- so it should read the same figure the connections screen shows.
CREATE OR REPLACE VIEW "AV_Invoice_Line_Detail" AS
  SELECT
    l."AV_Invoice_Line_ID",
    l."AV_Invoice_ID",
    i."Project_ID",
    l."Plot_ID",
    l."Plot_Ref",
    pl."Plot_Number",
    l."Description",
    l."Notes",
    l."Net_Value",
    l."Source_Row",
    l."Utility_ID",
    pu."Connection_Date",
    pu."Meter_Number"
  FROM "AV_Invoice_Line" l
  JOIN "AV_Invoice" i ON i."AV_Invoice_ID" = l."AV_Invoice_ID"
  LEFT JOIN "Plot" pl ON pl."Plot_ID" = l."Plot_ID"
  LEFT JOIN "Plot_Utility" pu
    ON pu."Plot_ID" = l."Plot_ID"
   AND pu."Utility_ID" = l."Utility_ID";


-- ── Invoice totals that can't disagree with their lines ──────────
-- Sub total is the sum of the lines. Storing it as well as the lines is
-- what lets the two drift, and an invoice whose header says one thing
-- and whose lines say another is worse than either. Net_Value stays as
-- the raised figure; this exposes both so the screen can show a warning
-- rather than silently pick one.
CREATE OR REPLACE VIEW "AV_Invoice_Detail" AS
  SELECT
    i.*,
    u."Utility",
    idno."IDNO_Name",
    agt."AV_Agreement_Type",
    COALESCE(sums.line_total, 0) AS lines_total,
    COALESCE(sums.line_count, 0) AS line_count,
    ROUND(COALESCE(sums.line_total, 0), 2)
      IS DISTINCT FROM ROUND(i."Net_Value", 2) AS totals_disagree
  FROM "AV_Invoice" i
  LEFT JOIN "Utility" u    ON u."Utility_ID" = i."Utility_ID"
  LEFT JOIN "IDNO" idno    ON idno."IDNO_ID" = i."IDNO_ID"
  LEFT JOIN "AV_Agreement_Type" agt
    ON agt."AV_Agreement_Type_ID" = i."AV_Agreement_Type_ID"
  LEFT JOIN LATERAL (
    SELECT SUM(l."Net_Value") AS line_total, COUNT(*) AS line_count
      FROM "AV_Invoice_Line" l
     WHERE l."AV_Invoice_ID" = i."AV_Invoice_ID"
  ) sums ON true;


-- ── Check ───────────────────────────────────────────────────────
-- Invoices for a project, as the tab shows them:
--   SELECT "Invoice_Number", "Invoice_Date", "Net_Value", lines_total,
--          line_count, totals_disagree
--     FROM "AV_Invoice_Detail" WHERE "Project_ID" = <project>
--    ORDER BY "Invoice_Date" DESC;
--
-- Expect no rows: a header that disagrees with its own lines.
--   SELECT "AV_Invoice_ID", "Invoice_Number", "Net_Value", lines_total
--     FROM "AV_Invoice_Detail" WHERE totals_disagree;
--
-- Lines with no connection record — billing a plot the connections
-- screen has no meter for:
--   SELECT "AV_Invoice_Line_ID", "Plot_Ref"
--     FROM "AV_Invoice_Line_Detail"
--    WHERE "Plot_ID" IS NOT NULL AND "Connection_Date" IS NULL;
