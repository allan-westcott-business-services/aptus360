-- ── Somewhere to put the original app's records before they are real ──
--
-- The original app had a Tender that progressed to a Contract. The new
-- system has one Project, where tender and contract are stages. So two
-- files become one set of projects, and the second file has to recognise
-- sites the first one already created rather than duplicating them.
--
-- ── Why a staging table and not a direct import ──
--
-- Because the hard part is not inserting rows, it is deciding what each
-- row POINTS AT. The old Customer_ID and Branch_ID refer to tables that
-- no longer exist; a project now hangs off Organisation_Branch. Loading
-- the file first and resolving afterwards means the resolution can be
-- looked at, argued with and re-run, with the original text still
-- sitting there to check against.
--
-- Every column is text. A CSV load that fails halfway on a bad date
-- leaves a mess that is hard to reason about, and "" is not a date.
-- Converting happens at the point of insert, where a bad value can be
-- reported against the row it came from.

CREATE TABLE IF NOT EXISTS "Legacy_Project_Import" (
  "Legacy_Project_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* 'contract' or 'tender'. Which file this row came out of.

     DEFAULTED rather than merely NOT NULL, because the export files do
     not have this column and a plain NOT NULL makes a straight CSV load
     fail on every row.

     ── THE TENDER FILE DOES NOT GO IN THIS TABLE ──

     This comment used to say to load it here and then set Source =
     'tender'. That was written before 0252, which gives the tender file
     a table of its own — "Legacy_Tender_Import" — because the two
     exports do not share a column list and the tender import matches on
     routes the contract import has no use for.

     Nothing executable has read Source = 'tender' since. Every mention
     left in the import files is inside a comment. Follow the old
     instruction and 5,454 tender rows land in the contract staging
     table, where the contract import will try to make projects out of
     them.

     So: the contract CSV here, as it stands. The tender CSV into
     "Legacy_Tender_Import". The column stays because the table may
     already hold rows carrying it. */
  "Source"                   text NOT NULL DEFAULT 'contract',
  "Contract_ID"              text,
  "Tender_ID"                text,
  "AP_Number"                text,
  "Customer_ID"              text,
  "Region_ID"                text,
  "Site_Name"                text,
  "Branch_ID"                text,
  "Fire_Service_ID"          text,
  "Date_Signed"              text,
  "Contract_Status_ID"       text,
  "Tender_Status_ID"         text,
  "Tender_Reference"         text,
  "Tender_Quote_Value"       text,
  "Site_Address"             text,
  "Site_Contact"             text,
  "Auto_Created"             text,
  "Gas_Reference"            text,
  "Electric_Reference"       text,
  "Water_Reference"          text,
  "Electric_IDNO_ID"         text,
  "Gas_IDNO_ID"              text,
  "Water_IDNO_ID"            text,
  "Audacia_Customer_Name"    text,
  "Default_Plot_Heat_Source_ID" text,
  "Audacia_Plot_Count"       text,
  "Auto_Plot_Count"          text,
  "Secured_Date"             text,
  "Minimum_Service_Call_Off" text,
  "Eastings"                 text,
  "Northings"                text,
  "Lay_Only_MU"              text,
  "Heat_Pump_Model_ID"       text,
  "Clean_Water_Incumbent_ID" text,
  "Waste_Water_Incumbent_ID" text
);

COMMENT ON TABLE "Legacy_Project_Import" IS
  'Raw rows from the original app''s Tender and Contract exports, as text. '
  'Loaded first and resolved afterwards, so what each row points at can be '
  'looked at before anything becomes a Project. Safe to empty once the '
  'import is done and checked.';

CREATE INDEX IF NOT EXISTS "Legacy_Project_Import_Source_IDX"
  ON "Legacy_Project_Import" ("Source");

-- ── Old lookup id to new lookup id ────────────────────────────────────
--
-- Region, status, fire service, IDNO and the water incumbents are all
-- numbered in the old system and numbered again in this one, and there
-- is NO reason the numbers agree. Assuming they do is how a project ends
-- up in the wrong region with nothing to show it happened.
--
-- So nothing is assumed. This table is filled in by hand, once, from the
-- report in import_legacy_projects.sql, which lists every old id that
-- actually appears along with how many rows use it. An old id with no
-- row here resolves to null and the project is imported without it,
-- which is recoverable; a wrong guess is not.

CREATE TABLE IF NOT EXISTS "Legacy_Lookup_Map" (
  -- 'status', 'region', 'fire_service', 'idno', 'water_incumbent', 'heat_source'
  "Kind"      text   NOT NULL,
  "Legacy_ID" text   NOT NULL,
  "New_ID"    bigint,
  "Note"      text,
  PRIMARY KEY ("Kind", "Legacy_ID")
);

COMMENT ON TABLE "Legacy_Lookup_Map" IS
  'Old lookup id to new lookup id, filled in by hand before the import '
  'runs. Nothing is assumed to have kept its number. A missing row means '
  'the field is left empty on the imported project rather than guessed.';

-- ── What each staged row resolves to ──────────────────────────────────
--
-- A view rather than columns on the staging table, so it re-reads the
-- current Organisation and Organisation_Branch rows every time. Fix an
-- organisation's code or add a branch, look again, and the answer has
-- moved — no re-staging, no stale resolution sitting in a column.
--
-- ── The customer ──
--
-- Audacia_Customer_Name reads "[ESH01] ESH Construction". The code in
-- the brackets is the Audacia code, and Organisation.Code is where that
-- lives in this system, so the organisation is found by CODE and not by
-- name. Names are typed by people and drift; a code is a key that
-- happens to be printed.
--
-- The old Customer_ID is deliberately not used. It points at a table
-- that was emptied in August and dropped in September, so it can only
-- mislead.
--
-- ── The branch, which is the part that cannot be automatic ──
--
-- A Project hangs off an Organisation_Branch, not an Organisation. Where
-- an organisation has exactly one branch there is no decision to make.
-- Where it has several, this leaves it NULL and says so, because the
-- old Branch_ID points at the old Customer_Branch table and the region
-- of a site is not a reliable guide to which office of a builder is
-- running it. A project on the wrong branch shows one developer another
-- developer's work in the portal, and it is invisible until somebody
-- notices their sites are wrong.

-- Dropped first, not replaced.
--
-- 0249 replaces this view with a different shape, so re-running this
-- file afterwards hits
--
--   ERROR: cannot drop columns from view
--
-- which is what a second run of the whole migration set did. The view
-- holds no data and only the import reads it, so dropping it costs
-- nothing and makes the set safe to run in any order, any number of
-- times.
DROP VIEW IF EXISTS "Legacy_Project_Resolved";

CREATE VIEW "Legacy_Project_Resolved" AS
WITH coded AS (
  SELECT i.*,
         /* The code between the brackets, where there is one. 1,882 of
            the 1,926 contract rows have one; the rest fall through to a
            name match below. */
         NULLIF(substring(i."Audacia_Customer_Name" FROM '^\[([^\]]+)\]'), '')
           AS audacia_code,
         btrim(regexp_replace(COALESCE(i."Audacia_Customer_Name", ''),
           '^\[[^\]]*\]', '')) AS audacia_name
    FROM "Legacy_Project_Import" i
),
org AS (
  SELECT c.*,
         COALESCE(
           (SELECT o."Organisation_ID" FROM "Organisation" o
             WHERE c.audacia_code IS NOT NULL
               AND upper(btrim(o."Code")) = upper(btrim(c.audacia_code))
             LIMIT 1),
           /* Only where there is no code, and only on an exact name.
              A fuzzy match here would attach a site to the wrong
              builder, which is the one mistake this whole arrangement
              exists to avoid. */
           (SELECT o."Organisation_ID" FROM "Organisation" o
             WHERE c.audacia_code IS NULL
               AND c.audacia_name <> ''
               AND upper(btrim(o."Name")) = upper(c.audacia_name)
             LIMIT 1)
         ) AS organisation_id
    FROM coded c
)
SELECT o.*,
       (SELECT count(*) FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = o.organisation_id
           AND b."Is_Active") AS branch_count,
       (SELECT b."Organisation_Branch_ID" FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = o.organisation_id
           AND b."Is_Active"
         LIMIT 1) AS only_branch_id,
       CASE
         WHEN o.organisation_id IS NULL AND o.audacia_code IS NOT NULL
           THEN 'no organisation with that Audacia code'
         WHEN o.organisation_id IS NULL
           THEN 'no customer code or name to match on'
         WHEN (SELECT count(*) FROM "Organisation_Branch" b
                WHERE b."Organisation_ID" = o.organisation_id AND b."Is_Active") = 0
           THEN 'organisation has no active branch'
         WHEN (SELECT count(*) FROM "Organisation_Branch" b
                WHERE b."Organisation_ID" = o.organisation_id AND b."Is_Active") > 1
           THEN 'organisation has several branches - pick one by hand'
         ELSE 'ok'
       END AS branch_status
  FROM org o;

COMMENT ON VIEW "Legacy_Project_Resolved" IS
  'Each staged row with the organisation it matched by Audacia code, and '
  'the branch where there is only one to choose. branch_status says why '
  'not, where it could not.';

DO $$
BEGIN
  PERFORM 1 FROM information_schema.views WHERE table_name = 'Legacy_Project_Resolved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legacy_Project_Resolved was not created.';
  END IF;
  RAISE NOTICE 'Staging is ready. Load the CSV into Legacy_Project_Import '
    '(Source = ''contract''), then run import_legacy_projects.sql part 1 to '
    'see what matches before anything is created.';
END $$;
