-- ── A contact of the ORGANISATION, not only of a branch ──
--
-- Contacts are recorded against a branch: Organisation_Contact carries
-- an Organisation_Branch_ID and nothing wider. That covers the common
-- case and leaves out two that were asked for:
--
--   a contact of the whole ORGANISATION, who should see every site of
--   every branch
--
--   a contact for one SITE, who should see that site and no more
--
-- So the table gains both. Which one a row means is decided by which
-- is filled in, narrowest first: a project if there is one, else a
-- branch, else the organisation.
--
-- ── Why not another Portal_Access row ──
--
-- Because somebody recording a contact has already said everything the
-- portal needs to know: who they are, which company, which office,
-- which job. Asking them to say it twice — once here and once as a
-- portal account — is how the two came apart in the first place: a
-- contact was added against a branch, the portal knew nothing about
-- them, and the sign-in put them where an account with no record goes.
--
-- Portal_Access still exists and still wins where both are present. It
-- is the explicit grant, for an account that is not a contact of
-- anybody: an auditor, a consultant, somebody at a partner business.

ALTER TABLE "Organisation_Contact"
  ADD COLUMN IF NOT EXISTS "Organisation_ID" bigint REFERENCES "Organisation",
  ADD COLUMN IF NOT EXISTS "Project_ID" bigint REFERENCES "Project";

COMMENT ON COLUMN "Organisation_Contact"."Organisation_ID" IS
  'A contact of the whole organisation: every site of every branch. '
  'Leave null where the contact belongs to one branch.';
COMMENT ON COLUMN "Organisation_Contact"."Project_ID" IS
  'A contact for one site. Narrowest scope; beats the branch and the '
  'organisation on the same row.';

CREATE INDEX IF NOT EXISTS org_contact_email_idx
  ON "Organisation_Contact" (lower("Email"));
CREATE INDEX IF NOT EXISTS org_contact_org_idx
  ON "Organisation_Contact" ("Organisation_ID");

-- ── Where a branch contact's organisation is ──
--
-- Filled in from the branch for rows that have one, so a single query
-- can answer "which organisation is this contact of" without joining
-- every time. Existing rows keep their branch; this only adds what was
-- already implied by it.
UPDATE "Organisation_Contact" c
   SET "Organisation_ID" = b."Organisation_ID"
  FROM "Organisation_Branch" b
 WHERE c."Organisation_Branch_ID" = b."Organisation_Branch_ID"
   AND c."Organisation_ID" IS NULL;

-- Checks worth running after this:
--
--   SELECT "Contact_Name","Email","Organisation_ID","Organisation_Branch_ID",
--          "Project_ID","Is_Active"
--     FROM "Organisation_Contact" ORDER BY "Contact_Name";
