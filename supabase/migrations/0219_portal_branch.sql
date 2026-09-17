-- ── A portal account belongs to a BRANCH ──
--
-- 0218 scoped a portal account to a customer or an organisation. That
-- is one level too coarse for how this business records people: an
-- organisation has branches, and a contact is assigned to a branch.
-- "Barratt" is not who signs in; "Barratt, Northampton" is.
--
-- The branch matters for two reasons. A group with several offices
-- runs several schemes, and an account tied to the whole group would
-- show an office in Leeds the Northampton jobs. And a contact who
-- works at two branches signs in meaning one of them.
--
-- Nullable, because an account scoped to the whole organisation is a
-- legitimate thing for a small developer with one office, and because
-- every row 0218 created has no branch to move to.
ALTER TABLE "Portal_Access"
  ADD COLUMN IF NOT EXISTS "Branch_ID" bigint REFERENCES "Organisation_Branch";

COMMENT ON COLUMN "Portal_Access"."Branch_ID" IS
  'Organisation_Branch the contact works from. Null means the whole '
  'organisation, which suits a developer with one office.';

CREATE INDEX IF NOT EXISTS portal_access_branch
  ON "Portal_Access" ("Branch_ID");

-- Checks worth running after this:
--
--   SELECT p."Email", o."Name", b."Branch_Name"
--     FROM "Portal_Access" p
--     LEFT JOIN "Organisation" o ON o."Organisation_ID" = p."Organisation_ID"
--     LEFT JOIN "Organisation_Branch" b ON b."Organisation_Branch_ID" = p."Branch_ID"
--    WHERE p."Audience" <> 'staff';
