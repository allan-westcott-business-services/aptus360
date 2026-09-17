-- ── A contact who sees ONE site ──
--
-- Portal access already answers two of the three questions somebody
-- asks about a contact:
--
--   Organisation, no branch   every site of every branch
--   Organisation and branch   that branch's sites only
--
-- The third is the narrowest and was missing: a contact who is there
-- for ONE scheme. A consultant on a single job, a land owner, a housing
-- association's site manager — people who should see that site's
-- progress and no part of the rest of the group's work.
--
-- So Portal_Access gains a Project_ID. Null means the row is scoped the
-- way it always was, by branch or by organisation, and nothing about
-- existing accounts changes.
--
-- ── Narrowest wins, and it is a CEILING not a floor ──
--
-- Where a row names a project, that project is the whole of what the
-- account sees — even though the row also names the organisation the
-- project belongs to. The organisation on the row says WHO they are;
-- the project says what they may see. Reading the organisation as a
-- grant as well would make the narrowest scope the widest, which is
-- the opposite of what somebody setting it intends and the kind of
-- mistake nobody notices until a contact mentions a site they should
-- never have heard of.
--
-- Resolved in portal.js, beside the rest of the scoping, so there is
-- one place that decides who sees what.

ALTER TABLE "Portal_Access"
  ADD COLUMN IF NOT EXISTS "Project_ID" bigint REFERENCES "Project";

COMMENT ON COLUMN "Portal_Access"."Project_ID" IS
  'One site, and only that site. Null means the row is scoped by '
  'Branch_ID where it has one, and by Organisation_ID otherwise.';

CREATE INDEX IF NOT EXISTS portal_access_project_idx
  ON "Portal_Access" ("Project_ID");

-- Checks worth running after this:
--
--   -- Who is scoped to a single site:
--   SELECT p."Email", p."Audience", o."Name", pr."Project_Name"
--     FROM "Portal_Access" p
--     LEFT JOIN "Organisation" o ON o."Organisation_ID" = p."Organisation_ID"
--     LEFT JOIN "Project" pr ON pr."Project_ID" = p."Project_ID"
--    WHERE p."Project_ID" IS NOT NULL;
