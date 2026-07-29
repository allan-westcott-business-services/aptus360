-- ════════════════════════════════════════════════════════════════
-- 0063 — the standard VAT rate, managed and dated
--
-- 0062 let an organisation carry its own rate, and said a blank one
-- "takes the standard rate". That standard was a constant in a JavaScript
-- file, and a default of 20 on AV_Invoice.VAT_Rate. Neither was managed
-- and neither knew what day it was.
--
-- The rate changes. It has been 17.5, then 15, then 17.5, then 20 inside
-- twenty years. An invoice raised today against work done under a
-- previous rate needs the rate that was in force, and a credit against
-- an old invoice needs to match it. A constant cannot do that, and a
-- single editable number is worse — changing it silently rewrites what
-- every past invoice appears to have been raised at.
--
-- So: rates with the date they took effect, and a function that answers
-- "what was the standard rate on this day".
--
-- The invoice keeps storing its own VAT_Rate. That is the record of what
-- was actually charged, and it must not move when this table changes.
-- This decides the figure at the moment of raising; after that the
-- invoice owns it.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "VAT_Rate" (
  "VAT_Rate_ID"    bigserial PRIMARY KEY,
  "Rate"           numeric NOT NULL CHECK ("Rate" >= 0 AND "Rate" <= 100),
  -- The day it took effect. There is no end date: a rate runs until the
  -- next one starts, so an end date would be a second place to state the
  -- same fact and a chance for the two to disagree.
  "Effective_From" date NOT NULL,
  "Label"          text NOT NULL DEFAULT 'Standard',
  "Notes"          text,
  UNIQUE ("Label", "Effective_From")
);

ALTER TABLE "VAT_Rate" ENABLE ROW LEVEL SECURITY;

-- UK standard rate history. Enough of it to cover anything this app will
-- be asked to re-raise or credit.
INSERT INTO "VAT_Rate" ("Rate","Effective_From","Label","Notes") VALUES
  (17.5, '1991-04-01', 'Standard', 'Raised from 15%'),
  (15.0, '2008-12-01', 'Standard', 'Temporary reduction'),
  (17.5, '2010-01-01', 'Standard', 'Reduction reversed'),
  (20.0, '2011-01-04', 'Standard', 'Current')
ON CONFLICT ("Label", "Effective_From") DO NOTHING;


-- The rate in force on a given day. Defaults to today, so a caller that
-- doesn't care about history doesn't have to say so.
CREATE OR REPLACE FUNCTION vat_rate_at(p_on date DEFAULT CURRENT_DATE,
                                       p_label text DEFAULT 'Standard')
RETURNS numeric AS $$
  SELECT "Rate" FROM "VAT_Rate"
   WHERE "Label" = p_label AND "Effective_From" <= p_on
   ORDER BY "Effective_From" DESC
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Nothing before the first row: an invoice dated 1980 gets null rather
-- than a rate that was never in force. The caller decides what to do
-- about that; inventing one here would be worse.


-- ── Check ───────────────────────────────────────────────────────
-- The history, newest first:
--   SELECT "Effective_From", "Rate", "Label", "Notes"
--     FROM "VAT_Rate" ORDER BY "Label", "Effective_From" DESC;
--
-- Expect 17.5, 15, 17.5, 20, null:
--   SELECT vat_rate_at(DATE '2008-01-01'), vat_rate_at(DATE '2009-06-01'),
--          vat_rate_at(DATE '2010-06-01'), vat_rate_at(CURRENT_DATE),
--          vat_rate_at(DATE '1980-01-01');
--
-- Invoices whose stored rate isn't what was in force on their date.
-- Not necessarily wrong — an operator may have its own rate, or the
-- invoice may predate this table — but worth knowing about:
--   SELECT i."Invoice_Number", i."Invoice_Date", i."VAT_Rate",
--          vat_rate_at(i."Invoice_Date") AS standard_then,
--          o."Name", o."VAT_Registered", o."VAT_Rate" AS operator_rate
--     FROM "AV_Invoice" i
--     LEFT JOIN "Organisation" o ON o."Organisation_ID" = i."IDNO_Organisation_ID"
--    WHERE i."VAT_Rate" IS DISTINCT FROM vat_rate_at(i."Invoice_Date")
--    ORDER BY i."Invoice_Date" DESC;
