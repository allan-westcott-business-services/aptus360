-- ════════════════════════════════════════════════════════════════
-- 0071 — an invoice's totals are not fields
--
-- 0045 derives Net, VAT and Gross from the lines, by a trigger on
-- AV_Invoice_Line. That covers a line changing. It does not cover the
-- invoice itself being written — so a hand-edited VAT sticks until the
-- next line edit silently replaces it, and changing VAT_Rate leaves the
-- VAT figure at the old rate entirely.
--
-- Both were reachable from the screen: a scroll wheel over the VAT box
-- set it to -0.01, and the header then disagreed with its own lines.
--
-- A BEFORE trigger on AV_Invoice settles it. Writing the values into NEW
-- rather than issuing an UPDATE means no recursion, and it applies to
-- every writer — the app, the SQL editor, a future import.
--
-- Net_Value is deliberately left alone here: the line trigger owns it,
-- and recomputing it on insert would zero an invoice raised before its
-- lines exist.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION av_invoice_derive_totals() RETURNS trigger AS $$
BEGIN
  NEW."VAT_Value"   := ROUND(COALESCE(NEW."Net_Value", 0)
                             * COALESCE(NEW."VAT_Rate", 0) / 100, 2);
  NEW."Gross_Value" := ROUND(COALESCE(NEW."Net_Value", 0), 2) + NEW."VAT_Value";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS av_invoice_derive_totals_trg ON "AV_Invoice";
CREATE TRIGGER av_invoice_derive_totals_trg
  BEFORE INSERT OR UPDATE OF "Net_Value", "VAT_Rate", "VAT_Value", "Gross_Value"
  ON "AV_Invoice"
  FOR EACH ROW EXECUTE FUNCTION av_invoice_derive_totals();


-- Bring existing invoices back in line. Anything edited by hand — the
-- -0.01 VAT among them — is corrected here.
UPDATE "AV_Invoice" SET "Net_Value" = "Net_Value";
-- Assigning a column to itself looks pointless and is the point: it
-- fires the trigger above on every row without changing what the row
-- says, so the derived figures are recalculated from what is stored.


-- ── Check ───────────────────────────────────────────────────────
-- Expect no rows: VAT or gross that doesn't follow from net and rate.
--   SELECT "AV_Invoice_ID", "Invoice_Number", "Net_Value", "VAT_Rate",
--          "VAT_Value", "Gross_Value"
--     FROM "AV_Invoice"
--    WHERE "VAT_Value" IS DISTINCT FROM ROUND(COALESCE("Net_Value",0) * COALESCE("VAT_Rate",0) / 100, 2)
--       OR "Gross_Value" IS DISTINCT FROM ROUND(COALESCE("Net_Value",0), 2)
--                                        + ROUND(COALESCE("Net_Value",0) * COALESCE("VAT_Rate",0) / 100, 2);
--
-- Invoices whose header still disagrees with its lines. Net follows the
-- lines, so these are invoices with no lines, or lines added before the
-- trigger existed:
--   SELECT "AV_Invoice_ID", "Invoice_Number", "Net_Value", lines_total, line_count
--     FROM "AV_Invoice_Detail" WHERE totals_disagree;
--
-- To settle one, touch its lines and let the 0045 trigger recompute:
--   UPDATE "AV_Invoice_Line" SET "Net_Value" = "Net_Value"
--    WHERE "AV_Invoice_ID" = <id>;
