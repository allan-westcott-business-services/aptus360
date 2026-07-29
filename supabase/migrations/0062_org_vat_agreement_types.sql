-- ════════════════════════════════════════════════════════════════
-- 0062 — VAT against the operator, agreement types by utility
--
-- Three things, all so that raising an invoice asks for less and gets
-- more of it right.
--
-- VAT belongs to the operator being invoiced, not to the invoice. An
-- IDNO either is registered or isn't, and if it is it has a rate. Typing
-- that in per invoice is a field that can only be got wrong, and getting
-- it wrong is a number HMRC cares about.
--
-- Two columns rather than one, because a rate of 0 and "not registered"
-- are different facts. A registered operator on a zero-rated supply is
-- not the same as one outside the scheme, and a single nullable rate
-- can't tell you which you are looking at.
--
-- And the agreement type carries the utility, so the invoice form no
-- longer needs to ask for both.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "VAT_Registered" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "VAT_Rate"       numeric;

COMMENT ON COLUMN "Organisation"."VAT_Rate" IS
  'Per cent. Read only when VAT_Registered; null then means the standard rate.';

-- Which operator an invoice is raised against, as an organisation. The
-- old IDNO_ID stays for now — 0048 started this move and the pickers
-- have not all followed yet — but new work should read this one.
ALTER TABLE "AV_Invoice"
  ADD COLUMN IF NOT EXISTS "IDNO_Organisation_ID" bigint REFERENCES "Organisation";

CREATE INDEX IF NOT EXISTS av_invoice_org_idx
  ON "AV_Invoice" ("IDNO_Organisation_ID");


-- The role view names its columns, so the new ones have to be added to
-- it or a picker can't see them. Appended at the end: CREATE OR REPLACE
-- VIEW will add columns but won't reorder or drop them.
CREATE OR REPLACE VIEW "Organisation_By_Role" AS
SELECT o."Organisation_ID", o."Name", o."Code", o."Is_Active",
       t."Type_Key", t."Label" AS role_label,
       st."Subtype_Key", st."Label" AS trade_label,
       r."Reference",
       o."VAT_Registered", o."VAT_Rate"
  FROM "Organisation" o
  JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID" AND r."Is_Active"
  JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
  LEFT JOIN "Organisation_Subtype" st
         ON st."Organisation_Subtype_ID" = r."Organisation_Subtype_ID"
 WHERE o."Is_Active";


-- ── Agreement types ──────────────────────────────────────────────
-- 0024 seeded these as legal instruments: Adoption Agreement, Asset
-- Purchase, Deed of Grant, Connection Agreement. In use they name the
-- utility and scheme the asset value is being claimed under, which is
-- also what tells an invoice which utility it covers.
INSERT INTO "AV_Agreement_Type" ("AV_Agreement_Type","Utility_ID","Sort_Order","Is_Active")
SELECT v.label, u."Utility_ID", v.sort, true
  FROM (VALUES
    ('Electric',         'electric', 10),
    ('Gas',              'gas',      20),
    ('Water',            'water',    30),
    ('Water NAV Clean',  'water',    40),
    ('Water NAV Waste',  'water',    50)
  ) AS v(label, util, sort)
  LEFT JOIN "Utility" u ON LOWER(u."Utility") = v.util
ON CONFLICT DO NOTHING;

-- Keep the utility and order right on a re-run, and on any that were
-- already there under the same name.
UPDATE "AV_Agreement_Type" t
   SET "Utility_ID" = u."Utility_ID",
       "Sort_Order" = v.sort,
       "Is_Active"  = true
  FROM (VALUES
    ('Electric',         'electric', 10),
    ('Gas',              'gas',      20),
    ('Water',            'water',    30),
    ('Water NAV Clean',  'water',    40),
    ('Water NAV Waste',  'water',    50)
  ) AS v(label, util, sort)
  LEFT JOIN "Utility" u ON LOWER(u."Utility") = v.util
 WHERE t."AV_Agreement_Type" = v.label;

-- The originals go quiet, but only where nothing points at them. An
-- agreement type still on an invoice or an AV agreement stays, or the
-- record it belongs to starts reading blank.
UPDATE "AV_Agreement_Type" t
   SET "Is_Active" = false
 WHERE t."AV_Agreement_Type" IN
       ('Adoption Agreement','Asset Purchase','Deed of Grant','Connection Agreement')
   AND NOT EXISTS (SELECT 1 FROM "AV_Invoice" i
                    WHERE i."AV_Agreement_Type_ID" = t."AV_Agreement_Type_ID")
   AND NOT EXISTS (SELECT 1 FROM "AV_Agreement" a
                    WHERE a."AV_Agreement_Type_ID" = t."AV_Agreement_Type_ID");


-- ── Check ───────────────────────────────────────────────────────
-- The five, each on a utility. Anything with a null utility didn't match
-- a Utility row by name and needs setting by hand:
--   SELECT t."AV_Agreement_Type", u."Utility", t."Sort_Order", t."Is_Active"
--     FROM "AV_Agreement_Type" t
--     LEFT JOIN "Utility" u ON u."Utility_ID" = t."Utility_ID"
--    ORDER BY t."Sort_Order";
--
-- Which of the originals are still in use, and so still active:
--   SELECT t."AV_Agreement_Type", t."Is_Active",
--          (SELECT COUNT(*) FROM "AV_Invoice" i
--            WHERE i."AV_Agreement_Type_ID" = t."AV_Agreement_Type_ID") AS invoices
--     FROM "AV_Agreement_Type" t
--    WHERE t."AV_Agreement_Type" IN
--          ('Adoption Agreement','Asset Purchase','Deed of Grant','Connection Agreement');
--
-- Operators and their VAT position. A registered operator with no rate
-- takes the standard rate:
--   SELECT o."Name", o."VAT_Registered", o."VAT_Rate"
--     FROM "Organisation" o
--     JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID"
--     JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
--    WHERE t."Type_Key" IN ('idno','dno') AND o."Is_Active"
--    ORDER BY o."Name";
