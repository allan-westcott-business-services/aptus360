-- ════════════════════════════════════════════════════════════════════
--  Importing the original app's Tenders and Contracts as Projects
-- ════════════════════════════════════════════════════════════════════
--
-- The original app had a Tender that progressed to a Contract. Here a
-- Project has stages, so the two files become one set of projects and
-- the second file has to recognise sites the first one already made.
--
-- Run 0247 and 0248 first. Then:
--
--   1. Load the contract CSV into "Legacy_Project_Import". The Source
--      column defaults to 'contract', so a straight CSV load works; the
--      file's own columns map one-to-one by name.
--
--   2. Run PART 1 below. Nothing is created. It says what matches, what
--      does not, and what you have to decide.
--
--   3. Fill in "Legacy_Lookup_Map" from the queries in part 1.
--
--   4. Run PART 2, which creates the projects.
--
-- PART 2 is safe to run again. It inserts only rows it has not already
-- inserted, matched on Legacy_Contract_ID — so fix an organisation code,
-- re-run, and the newly matched rows appear without disturbing the rest.
--
-- ════════════════════════════════════════════════════════════════════
--  PART 1 — what we have, and what has to be decided
-- ════════════════════════════════════════════════════════════════════

-- 1.1 The headline. Every staged row, and whether its customer resolved.
SELECT branch_status,
       count(*)                       AS rows,
       count(DISTINCT audacia_code)   AS customer_codes
  FROM "Legacy_Project_Resolved"
 GROUP BY 1
 ORDER BY 2 DESC;

-- 1.2 Customers that do not exist here, or exist without their Audacia
--     code. The biggest single lever: one organisation given its code
--     fixes every site that builder has. Worked through in row order,
--     so the ones that matter most are at the top.
SELECT audacia_code,
       max(audacia_name)              AS name_in_the_old_system,
       count(*)                       AS sites_waiting
  FROM "Legacy_Project_Resolved"
 WHERE organisation_id IS NULL
   AND audacia_code IS NOT NULL
 GROUP BY 1
 ORDER BY 3 DESC, 1;

-- 1.3 The branch decisions. An organisation with several branches, and
--     the sites waiting on one being chosen. These import with no
--     customer attached and are set by hand afterwards in the project.
SELECT o."Name"                       AS organisation,
       r.audacia_code,
       r.branch_count,
       count(*)                       AS sites,
       string_agg(r."Site_Name", ' | ' ORDER BY r."Site_Name")  AS site_names
  FROM "Legacy_Project_Resolved" r
  JOIN "Organisation" o ON o."Organisation_ID" = r.organisation_id
 WHERE r.branch_status = 'organisation has several branches - pick one by hand'
 GROUP BY 1, 2, 3
 ORDER BY 4 DESC;

-- 1.4 Organisations that matched but have no active branch. A project
--     cannot hang off an organisation, only off a branch — so each of
--     these needs one creating before its sites can be attached.
SELECT o."Name" AS organisation, r.audacia_code, count(*) AS sites
  FROM "Legacy_Project_Resolved" r
  JOIN "Organisation" o ON o."Organisation_ID" = r.organisation_id
 WHERE r.branch_status = 'organisation has no active branch'
 GROUP BY 1, 2
 ORDER BY 3 DESC;

-- 1.5 ── The lookup ids that have to be mapped by hand ──
--
--     Region, status, fire service, IDNO and the water incumbents are
--     numbered in both systems and there is no reason the numbers agree.
--     This lists every old id that actually appears, how many rows use
--     it, and whether you have mapped it yet.
--
--     Fill the gaps with, for example:
--
--       INSERT INTO "Legacy_Lookup_Map" ("Kind","Legacy_ID","New_ID","Note")
--       VALUES ('status','4', 12, 'old "Secured" -> new "Contract - secured"');
--
--     An id left unmapped is left EMPTY on the imported project. That is
--     recoverable; a wrong guess sitting in a field nobody checks is not.
WITH used AS (
  SELECT 'status'          AS kind, "Contract_Status_ID"       AS legacy_id FROM "Legacy_Project_Import"
  UNION ALL SELECT 'status',        "Tender_Status_ID"         FROM "Legacy_Project_Import"
  UNION ALL SELECT 'region',        "Region_ID"                FROM "Legacy_Project_Import"
  UNION ALL SELECT 'fire_service',  "Fire_Service_ID"          FROM "Legacy_Project_Import"
  UNION ALL SELECT 'idno',          "Electric_IDNO_ID"         FROM "Legacy_Project_Import"
  UNION ALL SELECT 'idno',          "Gas_IDNO_ID"              FROM "Legacy_Project_Import"
  UNION ALL SELECT 'idno',          "Water_IDNO_ID"            FROM "Legacy_Project_Import"
  UNION ALL SELECT 'water_incumbent', "Clean_Water_Incumbent_ID" FROM "Legacy_Project_Import"
  UNION ALL SELECT 'water_incumbent', "Waste_Water_Incumbent_ID" FROM "Legacy_Project_Import"
  UNION ALL SELECT 'heat_source',   "Default_Plot_Heat_Source_ID" FROM "Legacy_Project_Import"
  UNION ALL SELECT 'heat_pump',     "Heat_Pump_Model_ID"       FROM "Legacy_Project_Import"
)
SELECT u.kind, u.legacy_id, count(*) AS rows,
       m."New_ID",
       CASE WHEN m."Kind" IS NULL THEN 'NOT MAPPED - will be left empty'
            WHEN m."New_ID" IS NULL THEN 'mapped to nothing, deliberately'
            ELSE 'mapped' END AS state
  FROM used u
  LEFT JOIN "Legacy_Lookup_Map" m
         ON m."Kind" = u.kind AND m."Legacy_ID" = u.legacy_id
 WHERE COALESCE(btrim(u.legacy_id), '') <> ''
 GROUP BY u.kind, u.legacy_id, m."New_ID", m."Kind"
 ORDER BY u.kind, count(*) DESC;

-- 1.6 Rows that would not make a sensible project. Look before you run
--     part 2: these import with gaps, or in the case of a missing site
--     name, as a project nobody can identify in a list.
SELECT 'no site name'            AS problem, count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("Site_Name"), '') = ''
UNION ALL
SELECT 'no AP number',           count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("AP_Number"), '') = ''
UNION ALL
SELECT 'no secured date',        count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("Secured_Date"), '') = ''
UNION ALL
SELECT 'no status',              count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("Contract_Status_ID"), '') = '' AND COALESCE(btrim("Tender_Status_ID"), '') = ''
UNION ALL
SELECT 'quote value not a number', count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("Tender_Quote_Value"), '') <> '' AND btrim("Tender_Quote_Value") !~ '^-?[0-9]+(\.[0-9]+)?$'
UNION ALL
SELECT 'secured date not a date', count(*) FROM "Legacy_Project_Import" WHERE COALESCE(btrim("Secured_Date"), '') <> '' AND btrim("Secured_Date") !~ '^\d{4}-\d{2}-\d{2}'
ORDER BY 2 DESC;

-- 1.7 The same AP number twice. The old system allowed it; worth seeing,
--     because they will become two projects that look identical in a
--     list. (AP2003 is the only one in the contract file.)
SELECT "AP_Number", count(*), string_agg("Site_Name", ' | ') AS sites
  FROM "Legacy_Project_Import"
 WHERE COALESCE(btrim("AP_Number"), '') <> ''
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC;

-- ════════════════════════════════════════════════════════════════════
--  PART 2 — create the projects
-- ════════════════════════════════════════════════════════════════════
--
-- Everything from here writes. Run part 1 first and be satisfied with
-- what it says.
--
-- ── There is no dry run, and that is deliberate ──
--
-- This began life wrapped in BEGIN with no COMMIT, so a careless run
-- would undo itself. That is true at a psql prompt and NOT true in the
-- Supabase SQL editor, which commits as it goes — and a safety net that
-- is only sometimes there is worse than none, because you would believe
-- in it. So instead:
--
--   * it is safe to run again. Rows already imported are skipped on
--     Legacy_Contract_ID, so fixing an organisation code and running it
--     a second time brings in the newly matched rows and disturbs
--     nothing else.
--
--   * it is one statement to undo, as long as nobody has started
--     working on the imported projects:
--
--       DELETE FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL;
--
--     That is exactly why the legacy id is on the row. Take a Supabase
--     backup first all the same.

-- 2.1 Refuse to run with the statuses unmapped.
--
--     The status is the one field that cannot be left empty and fixed
--     later, because it is what says whether a project is at tender or
--     contract stage — the whole point of the two old tables becoming
--     one. Everything else degrades to an empty field; this one would
--     put nearly two thousand projects into the wrong half of the
--     business, where nobody would think to look for them.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT s, ', ') INTO missing
    FROM (
      SELECT btrim("Contract_Status_ID") AS s FROM "Legacy_Project_Import"
       WHERE COALESCE(btrim("Contract_Status_ID"), '') <> ''
      UNION
      SELECT btrim("Tender_Status_ID") FROM "Legacy_Project_Import"
       WHERE COALESCE(btrim("Tender_Status_ID"), '') <> ''
    ) u
   WHERE NOT EXISTS (
     SELECT 1 FROM "Legacy_Lookup_Map" m
      WHERE m."Kind" = 'status' AND m."Legacy_ID" = u.s
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'These old status ids have no row in Legacy_Lookup_Map: %. '
      'Map them (query 1.5) before importing, or every project carrying one '
      'lands at the wrong stage.', missing;
  END IF;
END $$;

-- 2.2 The projects.
--
-- ── Project_Ref ──
--
-- Your refs are YYMM.NNN, dated from when the project was raised. An
-- imported project keeps the old Tender_Reference where it already has
-- one in that shape (86 of the contract rows do); otherwise it gets a
-- ref dated from its Secured_Date, numbered on from whatever that month
-- already holds — so a 2019 site reads as a 2019 ref, and sorting by ref
-- still sorts by age.
--
-- ── Postcode ──
--
-- Lifted off the end of Site_Address, which is where the old system kept
-- it, and left in the address as well. Taking it out of the address
-- would change text somebody wrote; copying it into its own column is
-- what the new screens read.
WITH ranked AS (
  SELECT r.*,
         /* The month this project belongs to, from its secured date,
            falling back to the signing date and then to today — a ref
            has to exist, and a project with no date at all is one of a
            handful rather than a category. */
         to_char(COALESCE(
           NULLIF(btrim(r."Secured_Date"), '')::date,
           NULLIF(btrim(r."Date_Signed"), '')::date,
           CURRENT_DATE), 'YYMM') AS yymm
    FROM "Legacy_Project_Resolved" r
   WHERE NOT EXISTS (
     SELECT 1 FROM "Project" p
      WHERE p."Legacy_Contract_ID" = NULLIF(btrim(r."Contract_ID"), '')::bigint
   )
     AND COALESCE(btrim(r."Contract_ID"), '') <> ''
),
keeps_own_ref AS (
  /* The rows that keep the reference they already have, which is any
     Tender_Reference already in YYMM.NNN shape. They are numbered by
     somebody else and take no part in the sequence below. */
  /* Keyed on the month in the REFERENCE, not the month the row would
     otherwise have been given. Those are different things: a site
     secured in 2021 can carry a 1603 reference, and reserving 1603.008
     under 2106 left the generator free to hand 1603.008 out again. Six
     duplicate refs in a test import, found by counting them rather than
     by reading the SQL. */
  SELECT split_part(btrim("Tender_Reference"), '.', 1) AS yymm,
         btrim("Tender_Reference") AS ref
    FROM ranked
   WHERE "Tender_Reference" ~ '^\d{4}\.\d+$'
),
taken AS (
  /* The highest number each month already holds — from projects that
     are here, including ones an earlier run of this script created, AND
     from the refs being kept above.

     The second half was missing and it put seven duplicate refs into a
     test import: a preserved 2106.015 and a generated 2106.015 in the
     same month, neither aware of the other. Display_Ref is built from
     this, so two projects would have read as the same project in every
     dropdown in the application. */
  SELECT yymm, max(n) AS high FROM (
    SELECT split_part("Project_Ref", '.', 1) AS yymm,
           NULLIF(regexp_replace(split_part("Project_Ref", '.', 2), '\D', '', 'g'), '')::int AS n
      FROM "Project"
     WHERE "Project_Ref" ~ '^\d{4}\.'
    UNION ALL
    SELECT k.yymm,
           NULLIF(regexp_replace(split_part(k.ref, '.', 2), '\D', '', 'g'), '')::int
      FROM keeps_own_ref k
  ) all_refs
   GROUP BY yymm
),
numbered AS (
  SELECT k.*,
         COALESCE(t.high, 0)
           /* Only the rows that need a number are counted, or a month
              with three preserved refs would leave three gaps. */
           + row_number() OVER (
               PARTITION BY k.yymm
               ORDER BY k."Contract_ID"::bigint)
           AS seq
    FROM ranked k
    LEFT JOIN taken t ON t.yymm = k.yymm
   WHERE k."Tender_Reference" IS NULL
      OR k."Tender_Reference" !~ '^\d{4}\.\d+$'
),
/* and the preserved ones, which join the insert carrying their own. */
all_rows AS (
  SELECT n.*, n.yymm || '.' || lpad(n.seq::text, 3, '0') AS new_ref FROM numbered n
  UNION ALL
  SELECT r.*, NULL::bigint AS seq, btrim(r."Tender_Reference") AS new_ref
    FROM ranked r
   WHERE r."Tender_Reference" ~ '^\d{4}\.\d+$'
)
INSERT INTO "Project" (
  "Project_Ref", "AP_Number", "Tender_Ref",
  "Organisation_Branch_ID", "Region_ID",
  "Site_Name", "Site_Address", "Postcode",
  "Date_Received", "Secured_Date", "Date_Signed",
  "Project_Status_ID", "Fire_Service_ID",
  "Tender_Quote_Value", "Minimum_Service_Call_Off", "Lay_Only_MU",
  "Legacy_Contract_ID", "Legacy_Customer_ID", "Legacy_Branch_ID", "Notes"
)
SELECT
  /* Either the reference this project already had, or the one allocated
     for it above. Settled in all_rows so the two cannot collide. */
  n.new_ref,
  NULLIF(btrim(n."AP_Number"), ''),
  NULLIF(btrim(n."Tender_Reference"), ''),
  /* Only where there was no choice to make: the office the old system
     named, or a company with exactly one branch. Null today, because
     the customers have not been migrated — and the keys below are what
     make that recoverable without importing again. */
  n.settled_branch_id,
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'region' AND m."Legacy_ID" = btrim(n."Region_ID")),
  NULLIF(btrim(n."Site_Name"), ''),
  NULLIF(btrim(n."Site_Address"), ''),
  /* A UK postcode at the end of the address, upper-cased and spaced the
     way the rest of the system holds one. Null where the address does
     not end in one, rather than a guess at the last few characters. */
  NULLIF(upper(btrim(substring(upper(COALESCE(n."Site_Address", ''))
    FROM '([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\s*$'))), ''),
  /* ── Date_Received, which the old contract record does not have ──

     NOT NULL on Project, and over there the received date belonged to
     the TENDER — a contract is what a tender became. So the best date
     this record carries stands in for it, and the Notes say so on every
     project where it was invented: a received date that is really a
     secured date will otherwise be read as fact. The tender file can
     replace it with the real one. */
  COALESCE(NULLIF(btrim(n."Secured_Date"), '')::date,
           NULLIF(btrim(n."Date_Signed"), '')::date,
           DATE '1900-01-01'),
  NULLIF(btrim(n."Secured_Date"), '')::date,
  NULLIF(btrim(n."Date_Signed"), '')::date,
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'status'
      AND m."Legacy_ID" = COALESCE(NULLIF(btrim(n."Contract_Status_ID"), ''),
                                   btrim(n."Tender_Status_ID"))),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'fire_service' AND m."Legacy_ID" = btrim(n."Fire_Service_ID")),
  NULLIF(btrim(n."Tender_Quote_Value"), '')::numeric,
  NULLIF(btrim(n."Minimum_Service_Call_Off"), '')::int,
  COALESCE(NULLIF(btrim(n."Lay_Only_MU"), '')::boolean, false),
  NULLIF(btrim(n."Contract_ID"), '')::bigint,
  /* The customer and office this project had in the old system. One
     UPDATE attaches 1,647 of them once the customers are migrated — see
     the foot of this file — and they cost nothing in the meantime. */
  n.legacy_customer_id,
  n.legacy_branch_id,
  /* What could not be carried across, written where somebody will see
     it on the project itself rather than in a spreadsheet nobody opens.
     Only the facts that are lost otherwise. */
  NULLIF(concat_ws(E'\n',
    'Imported from the original app (Contract ' || btrim(n."Contract_ID") || ').',
    'Date received is a stand-in: the original app kept it on the tender, '
      || 'not the contract.',
    /* WHO the customer is, on every project that has not got one
       attached — which today is all of them. Whoever opens this project
       to pick a branch should not have to go back to the old system to
       find out which company it was. */
    CASE WHEN n.settled_branch_id IS NULL
      THEN 'Customer (not attached yet): '
        || COALESCE(NULLIF(btrim(n."Audacia_Customer_Name"), ''), 'not named in the old record')
        || ' [' || n.branch_status || ']' END,
    CASE WHEN COALESCE(btrim(n."Gas_Reference"), '') <> ''
      THEN 'Gas ref: ' || btrim(n."Gas_Reference") END,
    CASE WHEN COALESCE(btrim(n."Electric_Reference"), '') <> ''
      THEN 'Electric ref: ' || btrim(n."Electric_Reference") END,
    CASE WHEN COALESCE(btrim(n."Water_Reference"), '') <> ''
      THEN 'Water ref: ' || btrim(n."Water_Reference") END,
    CASE WHEN COALESCE(btrim(n."Audacia_Plot_Count"), '') <> ''
      THEN 'Plot count in the old system: ' || btrim(n."Audacia_Plot_Count") END
  ), '')
  FROM all_rows n;

-- 2.3 Say what happened.
DO $$
DECLARE made integer; nobranch integer;
BEGIN
  SELECT count(*) INTO made FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL;
  SELECT count(*) INTO nobranch FROM "Project"
   WHERE "Legacy_Contract_ID" IS NOT NULL AND "Organisation_Branch_ID" IS NULL;
  RAISE NOTICE 'Projects from the original app: %. Of those, % have no customer '
    'attached yet — query 1.3 and 1.4 say why, and each is named in its own '
    'Notes.', made, nobranch;
END $$;

-- 2.4 What it looks like afterwards. Worth a glance before anybody
--     starts working in the new projects.
--
--   SELECT "Project_Ref", "AP_Number", "Site_Name", "Postcode",
--          "Organisation_Branch_ID", "Tender_Quote_Value", "Secured_Date"
--     FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL
--    ORDER BY "Project_Ref" LIMIT 50;
--
--   -- The ones still waiting on a customer, which is the worklist.
--   SELECT "Project_Ref", "Site_Name", "Notes"
--     FROM "Project"
--    WHERE "Legacy_Contract_ID" IS NOT NULL AND "Organisation_Branch_ID" IS NULL
--    ORDER BY "Project_Ref";

-- ════════════════════════════════════════════════════════════════════
--  LATER — attaching the customers, once they are migrated
-- ════════════════════════════════════════════════════════════════════
--
-- The contracts are imported before the customers, so every project
-- arrives with no customer attached and the company named in its Notes.
-- Users pick a branch as they open each project.
--
-- But the old keys came across with them, so when the customers and
-- branches are migrated — carrying Legacy_Customer_ID on Organisation
-- and Legacy_Branch_ID on Organisation_Branch — these two statements
-- attach 1,647 of the 1,926 without anybody choosing anything. Run them
-- in this order: the first is exact, the second only fills what the
-- first could not.
--
-- Neither touches a project somebody has already set by hand, because
-- both only write where the branch is still null.
--
--   -- 1. The office the old system actually named. 1,036 rows.
--   UPDATE "Project" p
--      SET "Organisation_Branch_ID" = b."Organisation_Branch_ID"
--     FROM "Organisation_Branch" b
--    WHERE b."Legacy_Branch_ID" = p."Legacy_Branch_ID"
--      AND p."Organisation_Branch_ID" IS NULL;
--
--   -- 2. The company, where it has exactly one branch. 516 more.
--   --    Deliberately not where it has several: that is the choice
--   --    this import refuses to make for you.
--   UPDATE "Project" p
--      SET "Organisation_Branch_ID" = b."Organisation_Branch_ID"
--     FROM "Organisation" o
--     JOIN "Organisation_Branch" b
--       ON b."Organisation_ID" = o."Organisation_ID" AND b."Is_Active"
--    WHERE o."Legacy_Customer_ID" = p."Legacy_Customer_ID"
--      AND p."Organisation_Branch_ID" IS NULL
--      AND (SELECT count(*) FROM "Organisation_Branch" x
--            WHERE x."Organisation_ID" = o."Organisation_ID" AND x."Is_Active") = 1;
--
--   -- And what is left, which is the worklist for people:
--   SELECT "Project_Ref", "Site_Name", "Notes"
--     FROM "Project"
--    WHERE "Legacy_Contract_ID" IS NOT NULL
--      AND "Organisation_Branch_ID" IS NULL
--    ORDER BY "Project_Ref";
--
-- 279 of the 1,926 will still have nothing, because their customer was
-- never in the old app's Customer table at all — they exist only as an
-- Audacia name on the contract, such as "[EON01] Eon Energy Services".
-- Those organisations have to be created before they can be attached,
-- and the names are in the Notes.
--
-- ════════════════════════════════════════════════════════════════════
--  AFTERWARDS — the tender file
-- ════════════════════════════════════════════════════════════════════
--
-- NOT into this staging table. This section used to say to load it here
-- with Source = 'tender', which predates 0252: the tender export has a
-- table of its own, "Legacy_Tender_Import", because the two files do
-- not share a column list. Nothing has read Source = 'tender' since.
-- Follow the old instruction and 5,454 tender rows land among the
-- contracts, where this import would try to make projects out of them.
--
-- The whole of that work is import_legacy_tenders.sql, which does more
-- than the sketch that used to sit here: it matches a tender to the
-- contract it became on three routes - the reference, a plot naming
-- both, and site name with customer - and merges 1,159 of the 5,454
-- rather than creating a second project. Run it after this file.

