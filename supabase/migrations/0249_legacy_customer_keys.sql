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
