-- ── The tender quote value, and where a project came from ────────────
--
-- Both of these exist for the import of the original app's Tender and
-- Contract records, where a Tender progressed to a Contract and the new
-- system has one Project with stages instead.
--
-- ── Tender_Quote_Value ──
--
-- 1,895 of the 1,926 contract rows carry one. Asked for as a field on
-- the project rather than anywhere else: the new system keeps quote
-- values per utility on Project_Scope, and the old figure is not per
-- utility — it is what the whole job was quoted at. Writing it onto one
-- utility's outline design would be attributing it by guesswork, and
-- summing those per-utility figures afterwards would then double-count
-- it.
--
-- numeric(14,2), the same shape as the other money on Project_Scope. Not
-- a float: 165218.06 is a price somebody agreed, and a float is a price
-- that nearly is.
--
-- ── Legacy_Contract_ID and Legacy_Tender_ID ──
--
-- Which record in the old system this project came from. Two columns
-- rather than one with a marker, because a project CAN come from both —
-- a tender that was won became a contract, they are separate rows over
-- there, and they are one project here. One column could not say that,
-- and the import has to be able to recognise the second file's rows as
-- sites it has already created rather than making a duplicate.
--
-- UNIQUE, which is what makes the import re-runnable: running it twice
-- updates rather than inserting a second copy, and a half-finished
-- import can be finished rather than undone.
--
-- Null for everything created in the new system, which is most of what
-- will exist in a year. Nothing reads these except the import and
-- anybody tracing a project back.

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "Tender_Quote_Value" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "Legacy_Contract_ID"  bigint,
  ADD COLUMN IF NOT EXISTS "Legacy_Tender_ID"    bigint;

COMMENT ON COLUMN "Project"."Tender_Quote_Value" IS
  'What the whole job was quoted at, carried over from the original app''s '
  'Tender_Quote_Value. Not the same thing as the per-utility figures on '
  'Project_Scope and not a total of them.';
COMMENT ON COLUMN "Project"."Legacy_Contract_ID" IS
  'Contract_ID in the original app, where this project came from one. Null '
  'for anything created in the new system.';
COMMENT ON COLUMN "Project"."Legacy_Tender_ID" IS
  'Tender_ID in the original app. A project can carry both: a tender that '
  'was won became a separate contract record over there and is one project '
  'here.';

CREATE UNIQUE INDEX IF NOT EXISTS "Project_Legacy_Contract_UQ"
  ON "Project" ("Legacy_Contract_ID") WHERE "Legacy_Contract_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Project_Legacy_Tender_UQ"
  ON "Project" ("Legacy_Tender_ID") WHERE "Legacy_Tender_ID" IS NOT NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'Project'
     AND column_name IN ('Tender_Quote_Value', 'Legacy_Contract_ID', 'Legacy_Tender_ID');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Project is missing one of Tender_Quote_Value, '
      'Legacy_Contract_ID or Legacy_Tender_ID (% of 3 present).', n;
  END IF;
  RAISE NOTICE 'Project can now carry a tender quote value and say which '
    'original-app record it came from.';
END $$;
