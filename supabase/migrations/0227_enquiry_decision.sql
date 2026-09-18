-- ── Recording the decision, not just the outcome ──
--
-- `Enquiry_Submission` carries a Status and a Project_ID, which say
-- WHAT was decided. They do not say who decided, when, or why — and
-- those are the three things anybody asks about a decline four months
-- later, usually because the developer has come back asking.
--
-- So three columns. None is required: an enquiry decided before this
-- existed has no answers to give, and inventing them would be worse
-- than leaving them empty.
--
--   Decided_At     when it was accepted or declined
--   Decided_By     the email of whoever did it. An email rather than a
--                  Person_ID because a decision outlives an employment,
--                  and a name that stops resolving is worse than a
--                  plain address that still reads.
--   Decision_Note  why. Optional on an accept, where the reason is
--                  usually "it is work"; the one that matters is a
--                  decline.

ALTER TABLE "Enquiry_Submission"
  ADD COLUMN IF NOT EXISTS "Decided_At"    timestamptz,
  ADD COLUMN IF NOT EXISTS "Decided_By"    text,
  ADD COLUMN IF NOT EXISTS "Decision_Note" text;

COMMENT ON COLUMN "Enquiry_Submission"."Decided_By" IS
  'Email of whoever accepted or declined. An address rather than a '
  'Person_ID: a decision outlives an employment.';

-- What is waiting, oldest first — the order a queue is worked.
CREATE INDEX IF NOT EXISTS enquiry_submission_waiting_idx
  ON "Enquiry_Submission" ("Status", "Submitted_At");

-- Checks worth running after this:
--
--   SELECT "Enquiry_Submission_ID","Status","Decided_By","Decided_At",
--          "Decision_Note"
--     FROM "Enquiry_Submission" ORDER BY "Submitted_At" DESC;
