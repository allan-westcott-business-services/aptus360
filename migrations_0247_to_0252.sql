-- ════════════════════════════════════════════════════════════════════
--  Aptus360 — migrations 0247 to 0252, in order, in one file
-- ════════════════════════════════════════════════════════════════════
--
-- Everything the legacy import needs, concatenated in the order they
-- must run. Paste the whole thing into the Supabase SQL editor once.
--
--   0247  Tender_Quote_Value on Project, and the legacy contract and
--         tender keys.
--   0248  Staging for the contract file, and the view that works out
--         what each row points at.
--   0249  The legacy customer and branch keys, on Project and on
--         Organisation / Organisation_Branch, and the corrected
--         resolution view.
--   0250  The jointing dates on Plot_Utility, asked for, plus the
--         legacy plot keys.
--   0251  Staging for the plot and plot-utility files.
--   0252  Staging for the tender file, and the view that decides which
--         tender became which contract.
--
-- Every one is safe to run twice: columns are ADD COLUMN IF NOT EXISTS,
-- tables are CREATE TABLE IF NOT EXISTS, and the views are replaced.
-- Running this file again after the imports changes nothing.
--
-- You should see six NOTICE lines, one per migration, and no errors.
-- Each migration ends by checking its own work, so a NOTICE is the
-- migration saying it did what it said it would.
--
-- Nothing here imports any data. The import scripts come after:
--
--   import_legacy_projects.sql   the contracts
--   import_legacy_tenders.sql    the tenders
--   import_legacy_plots.sql      the plots and their connections
--


-- ═══════════════════════════════════════════════════════════════
--  0247_project_tender_quote_value.sql
-- ═══════════════════════════════════════════════════════════════

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



-- ═══════════════════════════════════════════════════════════════
--  0248_legacy_import.sql
-- ═══════════════════════════════════════════════════════════════

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
     a table of its own - "Legacy_Tender_Import". Nothing executable has
     read Source = 'tender' since. Follow the old instruction and 5,454
     tender rows land in the contract staging table, where the contract
     import will try to make projects out of them.

     Contract CSV here. Tender CSV into "Legacy_Tender_Import". */
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



-- ═══════════════════════════════════════════════════════════════
--  0249_legacy_customer_keys.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Where a project's customer used to be ─────────────────────────────
--
-- The contracts are being imported before the customers are. That is a
-- deliberate order: the old system has 509 customers and 623 branches
-- and the new one has fourteen, so there is no list to attach a project
-- to yet, and users will pick a branch by hand as they open each
-- project.
--
-- What this migration protects is the OTHER 86%.
--
--   1,036 of the 1,926 contracts carry a Branch_ID, and every one of
--   them exists in the old Customer_Branch table — nothing dangles.
--   516 more carry a Customer_ID. 95 more can be reached by their
--   Audacia code.
--
-- Those are exact keys, and they are worth keeping. Written onto the
-- project now, they cost nothing; thrown away now, the only way to get
-- them back is to import again over projects people have started
-- working in.
--
-- So when the customers and branches are migrated — whenever that is —
-- linking all of them is one UPDATE (the queries are at the foot of
-- import_legacy_projects.sql), and anything still unmatched is still
-- picked by hand. Nothing is re-imported and nobody loses work.
--
-- ── Not foreign keys ──
--
-- They point at tables in another system. A real constraint would be a
-- promise this database cannot keep, and the day somebody deletes an
-- organisation it would refuse the delete for a reason nobody could
-- read. They are a record of where a row came from, nothing more.

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "Legacy_Customer_ID" bigint,
  ADD COLUMN IF NOT EXISTS "Legacy_Branch_ID"   bigint;

COMMENT ON COLUMN "Project"."Legacy_Customer_ID" IS
  'Customer_ID in the original app. Kept so this project can be attached to '
  'its customer automatically once the customers are migrated.';
COMMENT ON COLUMN "Project"."Legacy_Branch_ID" IS
  'Branch_ID in the original app, against the old Customer_Branch table. The '
  'most precise of the three: it names the office, not just the company.';

-- The same, on the organisation side, so the join has somewhere to land.
-- Added now rather than with the customer import, because the view below
-- reads them and a view cannot reference a column that does not exist.
ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "Legacy_Customer_ID" bigint;
ALTER TABLE "Organisation_Branch"
  ADD COLUMN IF NOT EXISTS "Legacy_Branch_ID" bigint;

COMMENT ON COLUMN "Organisation"."Legacy_Customer_ID" IS
  'Customer_ID in the original app, set when the customers are migrated. '
  'Null for organisations created here.';
COMMENT ON COLUMN "Organisation_Branch"."Legacy_Branch_ID" IS
  'Branch_ID in the original app''s Customer_Branch table.';

CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_Legacy_Customer_UQ"
  ON "Organisation" ("Legacy_Customer_ID") WHERE "Legacy_Customer_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_Branch_Legacy_UQ"
  ON "Organisation_Branch" ("Legacy_Branch_ID") WHERE "Legacy_Branch_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Project_Legacy_Branch_IDX"
  ON "Project" ("Legacy_Branch_ID") WHERE "Legacy_Branch_ID" IS NOT NULL;

-- ── The resolution, corrected ─────────────────────────────────────────
--
-- 0248 matched a customer on Organisation.Code against the Audacia code
-- in Audacia_Customer_Name. Measured against the real data, that finds
-- NOTHING: two of the 419 organisations have a Code and neither is an
-- Audacia code. The code lives on Organisation_Role.Reference for the
-- handful of customers that carry one — four of them, covering 66 of
-- the 1,926 contracts.
--
-- So the view now resolves the way the data actually allows, most
-- precise first:
--
--   1. the old Branch_ID, against a migrated branch   (1,036 rows)
--   2. the old Customer_ID, against a migrated org    (  516 rows)
--   3. the Audacia code, against a customer role's
--      Reference, which is where this system records
--      it                                            (   95 rows)
--
-- All three find nothing today, because the customers have not been
-- migrated. That is the point: the view is written against the end
-- state, so the same query that reports "no customer yet" now reports
-- the link later without being touched.
--
-- Name matching is deliberately absent. "Story Homes" and "Story Group"
-- are two different customers in this data, and attaching a site to the
-- wrong one shows a developer another developer's work in the portal.

-- Dropped first, not replaced. CREATE OR REPLACE VIEW can add columns to
-- the end of a view and nothing else — it cannot rename or reorder them,
-- and this one's shape changes:
--
--   ERROR: cannot change name of view column "organisation_id"
--          to "legacy_customer_id"
--
-- which is what this migration did on its first run. Nothing reads the
-- view but the import script, so dropping it costs nothing.
DROP VIEW IF EXISTS "Legacy_Project_Resolved";

CREATE VIEW "Legacy_Project_Resolved" AS
WITH coded AS (
  SELECT i.*,
         NULLIF(substring(i."Audacia_Customer_Name" FROM '^\[([^\]]+)\]'), '')
           AS audacia_code,
         btrim(regexp_replace(COALESCE(i."Audacia_Customer_Name", ''),
           '^\[[^\]]*\]', '')) AS audacia_name,
         NULLIF(btrim(i."Customer_ID"), '')::bigint AS legacy_customer_id,
         NULLIF(btrim(i."Branch_ID"), '')::bigint   AS legacy_branch_id
    FROM "Legacy_Project_Import" i
),
matched AS (
  SELECT c.*,
         /* 1. The office, which is the most precise thing the old data
               has — and the only one that needs no decision afterwards. */
         (SELECT b."Organisation_Branch_ID" FROM "Organisation_Branch" b
           WHERE b."Legacy_Branch_ID" = c.legacy_branch_id) AS branch_by_legacy,
         /* 2. The company. */
         (SELECT o."Organisation_ID" FROM "Organisation" o
           WHERE o."Legacy_Customer_ID" = c.legacy_customer_id) AS org_by_legacy,
         /* 3. The Audacia code, against the reference this system keeps
               on a customer role. Only a CUSTOMER role: the same code
               could otherwise reach a supplier or a local authority. */
         (SELECT r."Organisation_ID" FROM "Organisation_Role" r
            JOIN "Organisation_Type" t
              ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
           WHERE t."Type_Key" = 'customer'
             AND r."Is_Active"
             AND c.audacia_code IS NOT NULL
             AND upper(btrim(r."Reference")) = upper(btrim(c.audacia_code))
           LIMIT 1) AS org_by_code
    FROM coded c
),
settled AS (
  SELECT m.*, COALESCE(m.org_by_legacy, m.org_by_code) AS organisation_id
    FROM matched m
)
SELECT s.*,
       (SELECT count(*) FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = s.organisation_id AND b."Is_Active") AS branch_count,
       (SELECT b."Organisation_Branch_ID" FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = s.organisation_id AND b."Is_Active"
         LIMIT 1) AS only_branch_id,
       /* What the project should be attached to, where that is known
          without anybody choosing: the office named by the old data,
          or the company's branch where it has exactly one. */
       COALESCE(
         s.branch_by_legacy,
         CASE WHEN (SELECT count(*) FROM "Organisation_Branch" b
                     WHERE b."Organisation_ID" = s.organisation_id
                       AND b."Is_Active") = 1
              THEN (SELECT b."Organisation_Branch_ID" FROM "Organisation_Branch" b
                     WHERE b."Organisation_ID" = s.organisation_id
                       AND b."Is_Active" LIMIT 1) END
       ) AS settled_branch_id,
       CASE
         WHEN s.branch_by_legacy IS NOT NULL THEN 'ok - the office the old system named'
         WHEN s.organisation_id IS NULL AND s.legacy_branch_id IS NOT NULL
           THEN 'waiting on the customer branches being migrated'
         WHEN s.organisation_id IS NULL AND s.legacy_customer_id IS NOT NULL
           THEN 'waiting on the customers being migrated'
         WHEN s.organisation_id IS NULL AND s.audacia_code IS NOT NULL
           THEN 'no customer here with that Audacia reference'
         WHEN s.organisation_id IS NULL
           THEN 'nothing in the old row to identify a customer'
         WHEN (SELECT count(*) FROM "Organisation_Branch" b
                WHERE b."Organisation_ID" = s.organisation_id AND b."Is_Active") = 0
           THEN 'organisation has no active branch'
         WHEN (SELECT count(*) FROM "Organisation_Branch" b
                WHERE b."Organisation_ID" = s.organisation_id AND b."Is_Active") > 1
           THEN 'organisation has several branches - pick one by hand'
         ELSE 'ok - the organisation has one branch'
       END AS branch_status
  FROM settled s;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE (table_name = 'Project' AND column_name IN ('Legacy_Customer_ID', 'Legacy_Branch_ID'))
      OR (table_name = 'Organisation' AND column_name = 'Legacy_Customer_ID')
      OR (table_name = 'Organisation_Branch' AND column_name = 'Legacy_Branch_ID');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Expected four legacy key columns across Project, '
      'Organisation and Organisation_Branch; found %.', n;
  END IF;
  RAISE NOTICE 'Projects will keep the customer and branch they had in the '
    'original app, so they can be attached automatically once the customers '
    'are migrated. Until then the customer is picked by hand.';
END $$;



-- ═══════════════════════════════════════════════════════════════
--  0250_jointing_dates_and_plot_keys.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Jointing dates, and the keys that carry plots across ─────────────
--
-- For importing the original app's Plot and Plot_Utility tables:
-- 333,950 plots and 33,059 connections.
--
-- ── The jointing dates ──
--
-- Asked for: "Jointing Dates need to be added to the new table."
--
-- Planned_Jointing_Date and Actual_Jointing_Date are on 10,709 and
-- 10,662 of the old connection rows and have nowhere to land here. A
-- service is jointed onto the main as a dated event, planned and then
-- done, and the gap between the two is the thing anybody asks about —
-- so losing them would lose the record of when work was actually
-- carried out on a third of the connections.
--
-- Beside Dead_Jointed_Date, which is already on this table and is the
-- same kind of fact.
--
-- ── Legacy_Plot_ID ──
--
-- The whole chain hangs off it. A connection names a plot, a plot names
-- a contract, and the contract is already imported carrying
-- Legacy_Contract_ID — so with this column the connections land on
-- exactly the right plots with no matching, no names and no guessing:
--
--   Plot_Utility -> Plot -> Contract -> Project
--
-- Checked against the real exports: every one of the 13,718 plots that
-- has a connection is in the plot file, and every one of the 1,915
-- contracts those plots belong to is in the contract file. Nothing
-- dangles anywhere in that chain.
--
-- ── Legacy_Plot_Utility_ID ──
--
-- The same job one level down, and what makes the connection import
-- re-runnable: 33,059 rows is not something to import twice by
-- accident, and a half-finished run should be finishable rather than
-- undone.
--
-- Both are UNIQUE where set, and neither is a foreign key: they point
-- at tables in another system, so a constraint would be a promise this
-- database cannot keep.

ALTER TABLE "Plot_Utility"
  ADD COLUMN IF NOT EXISTS "Planned_Jointing_Date"  date,
  ADD COLUMN IF NOT EXISTS "Actual_Jointing_Date"   date,
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_Utility_ID" bigint;

ALTER TABLE "Plot"
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_ID" bigint;

COMMENT ON COLUMN "Plot_Utility"."Planned_Jointing_Date" IS
  'When the service was planned to be jointed onto the main.';
COMMENT ON COLUMN "Plot_Utility"."Actual_Jointing_Date" IS
  'When it actually was. The gap between this and the planned date is what '
  'anybody asks about.';
COMMENT ON COLUMN "Plot_Utility"."Legacy_Plot_Utility_ID" IS
  'Plot_Utility_ID in the original app. Null for connections created here.';
COMMENT ON COLUMN "Plot"."Legacy_Plot_ID" IS
  'Plot_ID in the original app. What the connection import joins on, and the '
  'only link between an old connection and the plot it belongs to.';

CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Legacy_Plot_UQ"
  ON "Plot" ("Legacy_Plot_ID") WHERE "Legacy_Plot_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Utility_Legacy_UQ"
  ON "Plot_Utility" ("Legacy_Plot_Utility_ID") WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE (table_name = 'Plot_Utility'
          AND column_name IN ('Planned_Jointing_Date', 'Actual_Jointing_Date',
                              'Legacy_Plot_Utility_ID'))
      OR (table_name = 'Plot' AND column_name = 'Legacy_Plot_ID');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Expected the two jointing dates and the two legacy keys; '
      'found % of 4.', n;
  END IF;
  RAISE NOTICE 'Connections can now record when a service was planned to be '
    'jointed and when it was, and plots can say which plot in the original '
    'app they came from.';
END $$;



-- ═══════════════════════════════════════════════════════════════
--  0251_legacy_plot_import.sql
-- ═══════════════════════════════════════════════════════════════

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



-- ═══════════════════════════════════════════════════════════════
--  0252_legacy_tender_import.sql
-- ═══════════════════════════════════════════════════════════════

-- ── The tenders, and working out which became which contract ─────────
--
-- 5,454 tenders. A tender that was won became a separate Contract
-- record over there and is ONE project here, so the job is not loading
-- them — it is deciding, for each tender, whether it is already in this
-- system under its contract.
--
-- ── Why that is hard, and how hard ──
--
-- The old system barely recorded the link. Measured on the real files:
--
--   Tender_Ref on the contract   86 contracts carry one, all 86 match
--   a plot naming both          only 20 tender/contract pairs
--   site name AND customer      1,622 tenders, 14 of them ambiguous
--
-- The first two are exact and tiny. The third is a name match, which
-- everywhere else in this import I have refused — but it is a different
-- risk here. Attaching a project to the wrong CUSTOMER shows one
-- developer another developer's work and nobody sees it happen.
-- Merging a tender into the wrong project of the SAME customer at a
-- site of the same name is a smaller mistake, it is visible on the
-- project, and contract site names are nearly unique: 15 repeats in
-- 1,910. Asked for and agreed before building.
--
-- Where the pair is ambiguous — several contracts share that site and
-- customer — nothing is matched and the tender is listed instead. 14 of
-- them.
--
-- ── What a match is worth ──
--
-- The tender holds what the contract record never had: the real
-- Date_Received (which imported contracts currently carry a stand-in
-- for), the KPI date, the date sent, the estimator, the BDD/KAM, the
-- points. Matching fills those in on a project that already exists
-- rather than making a second one beside it.

-- ── This one has to come after the others ────────────────────────────
--
-- The view below reads Project."Legacy_Contract_ID" (0247),
-- Project."Legacy_Customer_ID" (0249) and "Legacy_Plot_Import" (0251).
-- Run out of order, Postgres says only
--
--   column p.Legacy_Contract_ID does not exist
--
-- which names the symptom and not the cause. So it is said here
-- instead, before anything is created.

DO $$
DECLARE missing text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'Project' AND column_name = 'Legacy_Contract_ID')
    THEN missing := array_append(missing, '0247 (Project.Legacy_Contract_ID)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'Project' AND column_name = 'Legacy_Customer_ID')
    THEN missing := array_append(missing, '0249 (Project.Legacy_Customer_ID)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name = 'Legacy_Plot_Import')
    THEN missing := array_append(missing, '0251 (Legacy_Plot_Import)'); END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Run these first: %. The order is 0247, 0248, 0249, 0250, '
      '0251, then this one.', array_to_string(missing, ', ');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Legacy_Tender_Import" (
  "Legacy_Tender_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Tender_ID"                text,
  "Date_Received"            text,
  "Customer_ID"              text,
  "Region_ID"                text,
  "Tender_Status_ID"         text,
  "Quote_Type_ID"            text,
  "BDD_KAM_ID"               text,
  "Estimator"                text,
  "Auto_Base_Points"         text,
  "I_and_C"                  text,
  "Revision"                 text,
  "Good_To_Go"               text,
  "Branch_ID"                text,
  "Is_Priority"              text,
  "Site_Name"                text,
  "Site_Address"             text,
  "Tender_Quote_Value"       text,
  "Secured_Date"             text,
  "Linked_Plot_Count"        text,
  "Tender_Ref"               text,
  "Notes"                    text,
  "Phase_Type_ID"            text,
  "Postcode"                 text,
  "Sub_Region_ID"            text,
  "KPI_Date"                 text,
  "Date_Sent"                text,
  "Quote_Value_To_Client"    text,
  "Quote_Value_To_Aptus"     text,
  "Status_Changed_Date"      text,
  "Manual_Base_Points"       text,
  "Option_Letter"            text,
  "Tender_Base_Points"       text,
  "Tender_Total_Points"      text,
  "Tender_Manual_Total_Points" text,
  "Heat_Pump_Model_ID"       text,
  "Tender_Notes"             text,
  "PV_Input_Level"           text
);

COMMENT ON TABLE "Legacy_Tender_Import" IS
  'Raw rows from the original app''s Tender export, as text.';

CREATE INDEX IF NOT EXISTS "Legacy_Tender_Import_Ref_IDX"
  ON "Legacy_Tender_Import" ("Tender_Ref");

-- ── Which project, if any, each tender already is ─────────────────────
--
-- Three routes, most confident first, and the route is reported so a
-- merge can be argued with rather than taken on trust.

CREATE OR REPLACE VIEW "Legacy_Tender_Match" AS
WITH t AS (
  SELECT i.*,
         NULLIF(btrim(i."Tender_ID"), '')::bigint   AS tender_id,
         NULLIF(btrim(i."Customer_ID"), '')::bigint AS customer_id,
         upper(btrim(COALESCE(i."Site_Name", '')))  AS site_key
    FROM "Legacy_Tender_Import" i
),
/* 1. The contract names the tender's reference. Exact. */
by_ref AS (
  SELECT t.tender_id, p."Project_ID"
    FROM t JOIN "Project" p
      ON p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(p."Tender_Ref") = btrim(t."Tender_Ref")
   WHERE COALESCE(btrim(t."Tender_Ref"), '') <> ''
),
/* 2. A plot that names both. Exact, and rare. */
by_plot AS (
  SELECT DISTINCT NULLIF(btrim(lp."Tender_ID"), '')::bigint AS tender_id,
         p."Project_ID"
    FROM "Legacy_Plot_Import" lp
    JOIN "Project" p
      ON p."Legacy_Contract_ID" = NULLIF(btrim(lp."Contract_ID"), '')::bigint
   WHERE COALESCE(btrim(lp."Tender_ID"), '') <> ''
     AND COALESCE(btrim(lp."Contract_ID"), '') <> ''
),
/* 3. Same site, same customer — and only where that pair names exactly
      one project. Several and it is left alone. */
site_pairs AS (
  SELECT upper(btrim(p."Site_Name")) AS site_key,
         p."Legacy_Customer_ID"      AS customer_id,
         min(p."Project_ID")         AS project_id,
         count(*)                    AS how_many
    FROM "Project" p
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND COALESCE(btrim(p."Site_Name"), '') <> ''
   GROUP BY 1, 2
)
SELECT t.*,
       COALESCE(r."Project_ID", pl."Project_ID",
                CASE WHEN sp.how_many = 1 THEN sp.project_id END) AS matched_project_id,
       CASE
         WHEN r."Project_ID"  IS NOT NULL THEN 'tender reference on the contract'
         WHEN pl."Project_ID" IS NOT NULL THEN 'a plot naming both'
         WHEN sp.how_many = 1             THEN 'same site and customer'
         WHEN sp.how_many > 1             THEN 'AMBIGUOUS - several projects share that site and customer'
         ELSE 'no contract - this tender becomes its own project'
       END AS match_route
  FROM t
  LEFT JOIN by_ref  r  ON r.tender_id  = t.tender_id
  LEFT JOIN by_plot pl ON pl.tender_id = t.tender_id
  LEFT JOIN site_pairs sp
         ON sp.site_key = t.site_key
        AND sp.customer_id IS NOT DISTINCT FROM t.customer_id;

COMMENT ON VIEW "Legacy_Tender_Match" IS
  'Each staged tender with the project it already is, where that can be '
  'established, and which of the three routes said so.';

DO $$
BEGIN
  PERFORM 1 FROM information_schema.views WHERE table_name = 'Legacy_Tender_Match';
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy_Tender_Match was not created.'; END IF;
  RAISE NOTICE 'Staging is ready for the tenders. Load the CSV, then run '
    'import_legacy_tenders.sql part 1 to see what matches what.';
END $$;
