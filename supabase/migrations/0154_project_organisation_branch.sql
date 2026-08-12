-- ════════════════════════════════════════════════════════════════
-- 0154 — a project can name an organisation's branch
--
-- There are two branch tables. Customer_Branch is the old one, and what
-- Project.Branch_ID points at. Organisation_Branch is where a branch
-- goes when one is added under an Organisation, which is how customers
-- are entered now.
--
-- The project form offered only the old table, so a housing developer
-- added today had a branch nothing could select. Merging the two lists
-- was not possible without this column: the two ids are separate
-- sequences, so an Organisation_Branch_ID written into Branch_ID would
-- point at whatever Customer_Branch row happened to share the number —
-- silently, and at the wrong customer.
--
-- ── Additive on purpose ──
--
-- Branch_ID is left exactly as it is. Every project already made points
-- at a Customer_Branch and keeps doing so; nothing has to be migrated,
-- and nothing that reads Branch_ID today changes behaviour.
--
-- A project names one or the other, never both. The check makes that a
-- rule rather than a convention, because two branches on one project is
-- a question nobody can answer later.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "Organisation_Branch_ID" bigint
    REFERENCES "Organisation_Branch" ("Organisation_Branch_ID");

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS project_one_branch;
ALTER TABLE "Project" ADD CONSTRAINT project_one_branch
  CHECK ("Branch_ID" IS NULL OR "Organisation_Branch_ID" IS NULL);

COMMENT ON COLUMN "Project"."Organisation_Branch_ID" IS
  'The customer branch where it is an Organisation_Branch. Branch_ID holds the same thing for the older Customer_Branch table; a project uses one or the other.';

CREATE INDEX IF NOT EXISTS project_organisation_branch
  ON "Project" ("Organisation_Branch_ID");


-- ── Check ───────────────────────────────────────────────────────
-- Which table each project takes its branch from:
--   SELECT count(*) FILTER (WHERE "Branch_ID" IS NOT NULL)              AS customer_branch,
--          count(*) FILTER (WHERE "Organisation_Branch_ID" IS NOT NULL) AS organisation_branch,
--          count(*) FILTER (WHERE "Branch_ID" IS NULL
--                             AND "Organisation_Branch_ID" IS NULL)     AS none
--     FROM "Project";
