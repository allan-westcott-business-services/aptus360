-- ════════════════════════════════════════════════════════════════
-- 0175 — a work instruction is filled in across a day, not in one go
--
-- Some of it at the start, the photographs as work happens, the
-- declaration at the end. A form that exists only between opening and
-- submitting is one that loses a morning when the tablet sleeps or the
-- van moves out of signal — and the next thing that happens is somebody
-- fills it in on paper and types it up at home, which is the outcome
-- this whole exercise is meant to avoid.
--
-- So a submission starts as a draft and is saved as it goes.
--
-- ── One row, not two tables ──
--
-- A draft is the same thing as a submission, earlier. Giving drafts
-- their own table would mean copying a row across at the moment of
-- submitting, which is a step that can half-happen, and two schemas to
-- keep in step every time the form gains a field.
--
-- ── Submitted_At becomes nullable ──
--
-- It defaulted to now(), so a draft looked submitted the moment it was
-- created. Null now means "not yet", which is what a draft is, and the
-- office's review queue reads the flag rather than inferring from a
-- date.
--
-- ── Started is worth recording on its own ──
--
-- A job that has been In Progress since eight and is still open at
-- three is visible; one that only changes state at the end is not. It
-- is also the first useful thing the office learns all day: somebody is
-- on site.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Field_Submission"
  ADD COLUMN IF NOT EXISTS "Is_Draft" boolean NOT NULL DEFAULT false,
  -- When the gang said they were starting. Not the same as when the
  -- draft row was made, though usually within a second of it — a draft
  -- can be created by a resubmit after the office returns a form, and
  -- nobody started anything.
  ADD COLUMN IF NOT EXISTS "Started_At" timestamptz;

ALTER TABLE "Field_Submission"
  ALTER COLUMN "Submitted_At" DROP NOT NULL,
  ALTER COLUMN "Submitted_At" DROP DEFAULT;

COMMENT ON COLUMN "Field_Submission"."Is_Draft" IS 'True while the gang is still filling it in. A draft is the same row as the submission it becomes, so nothing is copied at the moment of submitting.';

COMMENT ON COLUMN "Field_Submission"."Submitted_At" IS 'When it was sent to the office, or null while it is still a draft.';

-- A gang has one draft per assignment at a time. Two would be two
-- half-filled forms with no way to say which is the real one.
CREATE UNIQUE INDEX IF NOT EXISTS field_submission_one_draft
  ON "Field_Submission" ("Assignment_ID") WHERE "Is_Draft";

-- The office's review queue: submitted, not yet answered. Drafts are
-- excluded — a form somebody is still writing is not waiting on
-- anybody.
DROP INDEX IF EXISTS field_submission_awaiting;
CREATE INDEX IF NOT EXISTS field_submission_awaiting
  ON "Field_Submission" ("Submitted_At")
  WHERE "Review_Outcome" IS NULL AND NOT "Is_Draft";

-- Reviewed means somebody reviewed it, and a draft has not been. The
-- constraint from 0169 said the outcome and the time go together; this
-- adds that neither belongs on a draft.
ALTER TABLE "Field_Submission"
  DROP CONSTRAINT IF EXISTS field_submission_draft_unreviewed;
ALTER TABLE "Field_Submission"
  ADD CONSTRAINT field_submission_draft_unreviewed
  CHECK (NOT "Is_Draft" OR "Review_Outcome" IS NULL);


-- ── Check ───────────────────────────────────────────────────────
--
-- Drafts in progress, oldest first. A draft open for days is a job
-- somebody started and walked away from, and it is the queue's way of
-- saying so:
--
--   SELECT "Field_Submission_ID", "Assignment_ID", "Started_At",
--          jsonb_object_keys("Payload") AS filled_in
--     FROM "Field_Submission"
--    WHERE "Is_Draft" ORDER BY "Started_At";
--
-- The office's review queue, which should hold no drafts:
--
--   SELECT "Field_Submission_ID", "Assignment_ID", "Version", "Submitted_At"
--     FROM "Field_Submission"
--    WHERE "Review_Outcome" IS NULL AND NOT "Is_Draft"
--    ORDER BY "Submitted_At";
--
-- Nothing submitted without a time on it, and nothing drafted with one:
--
--   SELECT count(*) FILTER (WHERE NOT "Is_Draft" AND "Submitted_At" IS NULL) AS sent_without_a_time,
--          count(*) FILTER (WHERE "Is_Draft" AND "Submitted_At" IS NOT NULL)  AS drafts_marked_sent
--     FROM "Field_Submission";
