-- ════════════════════════════════════════════════════════════════
-- 0150 — the work instruction, and what was said about a booking
--
-- Two things a planner needs against a booking that the schedule alone
-- cannot hold.
--
-- ── Work instruction created ──
--
-- Whether the paperwork that sends a gang to site has been raised. It
-- is not the booking's status: a booking can be scheduled for a
-- fortnight's time with no instruction written yet, and a planner
-- working through the week needs to see which ones still need doing.
--
-- Default false, because an instruction that has not been written is
-- the ordinary state of a booking somebody has just made.
--
-- ── Comments ──
--
-- A table rather than a column, for the same reason NCR comments are:
-- a note is written by somebody at a time, and flattening them into one
-- field loses who said what and when, which is the part anybody looks
-- back for.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Call_Off_Assignment"
  ADD COLUMN IF NOT EXISTS "Work_Instruction_Created" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "Call_Off_Assignment"."Work_Instruction_Created" IS
  'Whether the work instruction has been raised. Not the same as the booking status.';


CREATE TABLE IF NOT EXISTS "Call_Off_Assignment_Comment" (
  "Assignment_Comment_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Assignment_ID"         bigint NOT NULL
    REFERENCES "Call_Off_Assignment" ("Assignment_ID") ON DELETE CASCADE,
  "Comment"               text NOT NULL,
  "Created_By"            text,
  "Created_At"            timestamptz NOT NULL DEFAULT now()
);

/* Read newest first against one booking, every time the modal opens. */
CREATE INDEX IF NOT EXISTS call_off_assignment_comment_assignment
  ON "Call_Off_Assignment_Comment" ("Assignment_ID", "Created_At" DESC);

ALTER TABLE "Call_Off_Assignment_Comment" ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
-- Bookings still waiting on their instruction:
--   SELECT a."Assignment_ID", s."AP_Number", a."Start_Date"
--     FROM "Call_Off_Assignment" a
--     JOIN "Mains_Call_Off_Submission" s USING ("Submission_ID")
--    WHERE NOT a."Work_Instruction_Created"
--      AND a."Start_Date" >= CURRENT_DATE
--    ORDER BY a."Start_Date";
