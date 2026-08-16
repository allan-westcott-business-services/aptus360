-- ════════════════════════════════════════════════════════════════
-- 0169 — the field queue: two statuses and a submission record
--
-- A team leader works a queue of assignments in order. One is open at a
-- time; it leaves that state by being submitted or aborted, and either
-- releases the next.
--
-- ── Why only two new statuses ──
--
-- 0116 already put the state of the work on Call_Off_Assignment and made
-- the list of states a table, for exactly this reason: the states a
-- business uses change. Scheduled, In Progress and Complete are already
-- there and mean what the field needs them to mean.
--
-- What is missing is the gap between the operative finishing and the
-- office agreeing:
--
--   Submitted   the form and photos are in, the team has moved on
--   Aborted     not done, with a reason, and not to be returned to
--
-- Neither is closed. Submitted is not closed because the office has not
-- looked at it, and a closed status would drop it out of the lists that
-- exist to be worked through. Aborted is not closed because the work
-- still has to happen — it wants rescheduling, and hiding it would be
-- how it gets forgotten.
--
-- ── Submitted releases the next job, Complete does not ──
--
-- Complete means the office has approved the photos. If the queue waited
-- for that, an operative who submitted at nine would stand still until
-- somebody in an office opened their laptop — and the pressure that
-- creates lands on the reviewer, who starts approving without looking.
--
-- So the release is on Submitted. The office review is quality control
-- on the record, not permission to carry on working.
--
-- ── The submission is its own table, and versioned ──
--
-- Not columns on the assignment. A form can be returned for correction
-- and resubmitted, and the declaration on it is a statement somebody
-- made about site conditions at a moment. Editing that in place would
-- destroy the thing the office is checking.
--
-- So each submission is a row, numbered per assignment, and the earlier
-- ones stay. "What did they originally say" is answerable, which is the
-- question that gets asked when something has gone wrong months later.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "Call_Off_Status" ("Status_Name", "Colour", "Display_Order", "Is_Closed")
SELECT * FROM (VALUES
  ('Submitted', '#0891b2', 45, false),
  ('Aborted',   '#ea580c', 55, false)
) AS v(n, c, o, x)
WHERE NOT EXISTS (
  SELECT 1 FROM "Call_Off_Status" WHERE "Status_Name" IN ('Submitted', 'Aborted')
);


-- ── What was submitted ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Field_Submission" (
  "Field_Submission_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  "Assignment_ID"       bigint NOT NULL
    REFERENCES "Call_Off_Assignment" ("Assignment_ID") ON DELETE CASCADE,

  -- 1 for the first, 2 for a correction, and so on. The earlier rows
  -- stay: a returned form is answered by a new version, never by an
  -- edit, because the declaration was made against what was sent.
  "Version"             integer NOT NULL DEFAULT 1,

  -- The form itself, as the tablet sent it. Jsonb because the Work
  -- Instruction form's shape is the form's business and will change
  -- faster than this table should: a column per field would make every
  -- new question a migration.
  "Payload"             jsonb   NOT NULL DEFAULT '{}'::jsonb,

  -- Who actually pressed submit. Not derived from the team: a leader can
  -- change mid-queue, and the person who stood on site is the one whose
  -- declaration this is.
  "Submitted_By"        text,
  "Submitted_At"        timestamptz NOT NULL DEFAULT now(),

  -- Where the office got to. Null until somebody looks.
  --
  --   approved    the record is accepted
  --   returned    the form is wrong; edit and resubmit, no revisit
  --   revisit     the work is wrong; a new assignment is needed
  --
  -- Returned and revisit are separated because they look identical at
  -- the moment of clicking and cost completely different amounts — two
  -- minutes against a day — and only the person reviewing knows which
  -- they mean.
  "Review_Outcome"      text,
  "Review_Note"         text,
  "Reviewed_By"         text,
  "Reviewed_At"         timestamptz,

  CONSTRAINT field_submission_version  CHECK ("Version" >= 1),
  CONSTRAINT field_submission_outcome
    CHECK ("Review_Outcome" IS NULL
        OR "Review_Outcome" IN ('approved', 'returned', 'revisit')),
  -- Reviewed means somebody reviewed it. An outcome with nobody against
  -- it is a decision with no author.
  CONSTRAINT field_submission_reviewer
    CHECK (("Review_Outcome" IS NULL) = ("Reviewed_At" IS NULL)),

  UNIQUE ("Assignment_ID", "Version")
);

CREATE INDEX IF NOT EXISTS field_submission_assignment
  ON "Field_Submission" ("Assignment_ID");

-- The office's review queue: everything submitted and not yet answered.
CREATE INDEX IF NOT EXISTS field_submission_awaiting
  ON "Field_Submission" ("Submitted_At") WHERE "Review_Outcome" IS NULL;

ALTER TABLE "Field_Submission" ENABLE ROW LEVEL SECURITY;


-- ── Why a job was not done ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Field_Abort" (
  "Field_Abort_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  "Assignment_ID"  bigint NOT NULL
    REFERENCES "Call_Off_Assignment" ("Assignment_ID") ON DELETE CASCADE,

  -- From a short list, not free text. A month of "no access at plot 34"
  -- is a fact worth having; a month of prose is not.
  "Reason_Code"    text NOT NULL,
  "Note"           text,

  -- Who called it. An operative aborting their own job and the office
  -- aborting it for them are the same outcome and not the same evidence,
  -- and the difference matters when the pattern is read back.
  "Aborted_By"     text,
  "By_Office"      boolean NOT NULL DEFAULT false,
  "Aborted_At"     timestamptz NOT NULL DEFAULT now(),

  -- The assignment raised in its place, once the office schedules one.
  -- Null until then, which is what makes "aborted and not yet
  -- rescheduled" answerable.
  "Rescheduled_As" bigint
    REFERENCES "Call_Off_Assignment" ("Assignment_ID") ON DELETE SET NULL,

  -- An assignment is aborted once. A second row would be a second
  -- reason for one event.
  UNIQUE ("Assignment_ID")
);

CREATE INDEX IF NOT EXISTS field_abort_unscheduled
  ON "Field_Abort" ("Aborted_At") WHERE "Rescheduled_As" IS NULL;

ALTER TABLE "Field_Abort" ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
--
-- The statuses, which should now include Submitted and Aborted, neither
-- closed:
--
--   SELECT "Status_Name", "Display_Order", "Is_Closed"
--     FROM "Call_Off_Status" ORDER BY "Display_Order";
--
-- The office's review queue — submitted, nobody has looked yet. Its
-- length is worth watching: a queue that only grows is a check nobody
-- is doing:
--
--   SELECT s."Field_Submission_ID", s."Assignment_ID", s."Version",
--          s."Submitted_By", s."Submitted_At"
--     FROM "Field_Submission" s
--    WHERE s."Review_Outcome" IS NULL
--    ORDER BY s."Submitted_At";
--
-- Aborted and not yet rescheduled. Each of these is work somebody still
-- has to do and nobody is currently booked for:
--
--   SELECT a."Assignment_ID", a."Reason_Code", a."Aborted_At", a."By_Office"
--     FROM "Field_Abort" a
--    WHERE a."Rescheduled_As" IS NULL
--    ORDER BY a."Aborted_At";
--
-- Self-aborts by person and weekday. Not a fault on its own — but the
-- path of least resistance on a wet Friday is to abort what is left, and
-- this is where that would show:
--
--   SELECT "Aborted_By", to_char("Aborted_At", 'Day') AS day, count(*)
--     FROM "Field_Abort" WHERE NOT "By_Office"
--    GROUP BY 1, 2 ORDER BY 3 DESC;
