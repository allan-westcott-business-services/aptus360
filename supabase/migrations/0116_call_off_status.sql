-- ════════════════════════════════════════════════════════════════
-- 0116 — call-off statuses, and a status per team assignment
--
-- ── Why the status moves ──
--
-- The status was on the submission, so one call-off had one state. But a
-- call-off is worked by several teams across several phases, and they
-- are not in the same state as each other: the excavation gang finished
-- on Thursday while the jointers have not started. One status for the
-- whole request could only ever describe the furthest behind or the
-- furthest ahead, and either way it described nobody's work accurately.
--
-- So the status of the *work* now sits on Call_Off_Assignment, which is
-- the row that names a team, a phase and a span — the smallest thing
-- that has a state of its own.
--
-- Mains_Call_Off_Submission."Status" is left exactly as it is. It still
-- answers a real and different question — where the *request* is: raised,
-- reviewed, withdrawn — and the call-offs list filters on it. Removing
-- it here would have emptied that list rather than improved it.
--
-- ── Why a table rather than a list in the code ──
--
-- The statuses were seven strings in CallOffsPage.jsx. Colours cannot be
-- assigned to a constant in a source file without a deploy, and the
-- names themselves are the sort of thing a business changes — "Complete"
-- becomes "Completed", somebody wants "On Hold". A table makes both an
-- admin screen.
--
-- ── Why the key is the name ──
--
-- Call_Off_Assignment."Status" holds the text, not an id, and points at
-- Status_Name with ON UPDATE CASCADE. Two reasons:
--
--   The submission's Status is already text, and a call-off whose two
--   status columns were an id here and a string there would be read
--   wrongly by somebody eventually.
--
--   ON UPDATE CASCADE means renaming "Complete" to "Completed" in admin
--   rewrites every assignment holding it, in one statement, rather than
--   orphaning them. The usual argument against a natural key — that
--   renaming breaks the references — is the one thing this does handle.
-- ════════════════════════════════════════════════════════════════

-- ── The statuses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Call_Off_Status" (
  "Call_Off_Status_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Status_Name"        text NOT NULL UNIQUE,

  -- The pill. Colour is the background; Text_Colour is optional and
  -- blank means the app works out black or white from the background's
  -- brightness, which is right nearly always — amber wants dark text,
  -- green wants white, and nobody should have to think about it. It is
  -- there for the case where the automatic answer is legible but ugly:
  -- a pale green pill whose text reads better in dark green than black.
  "Colour"             text,
  "Text_Colour"        text,

  "Display_Order"      integer NOT NULL DEFAULT 100,

  -- Done with, one way or another. The call-offs list opens on work
  -- still to do, and this is what it filters by — held here rather than
  -- as a set of names in the code, so a new closing status added in
  -- admin behaves like the ones already there instead of quietly
  -- appearing in the open list forever.
  "Is_Closed"          boolean NOT NULL DEFAULT false,
  "Is_Active"          boolean NOT NULL DEFAULT true
);

-- The seven that were in the code, with the colours they were already
-- drawn in where they had one. Seeded only into an empty table: running
-- this twice must not undo somebody's renaming.
INSERT INTO "Call_Off_Status"
  ("Status_Name", "Colour", "Display_Order", "Is_Closed")
SELECT * FROM (VALUES
  ('Pending Review',       '#6b7280', 10, false),
  ('Reviewed',             '#0ea5e9', 20, false),
  ('Scheduled',            '#f59e0b', 30, false),
  ('In Progress',          '#6366f1', 40, false),
  ('Complete',             '#22c55e', 50, true),
  ('Withdrawn (Customer)', '#ef4444', 60, true),
  ('Withdrawn (Aptus)',    '#b91c1c', 70, true)
) AS v(n, c, o, x)
WHERE NOT EXISTS (SELECT 1 FROM "Call_Off_Status");


-- ── Status on the assignment ────────────────────────────────────
-- Guarded, because Call_Off_Assignment arrives in an earlier migration
-- and this should be runnable against a database that has it and one
-- that is being built from nothing.
DO $$
BEGIN
  IF to_regclass('public."Call_Off_Assignment"') IS NULL THEN
    RAISE NOTICE 'Call_Off_Assignment not present — skipping status column';
    RETURN;
  END IF;

  ALTER TABLE "Call_Off_Assignment"
    ADD COLUMN IF NOT EXISTS "Status" text;

  -- Everything already assigned gets the first status rather than null.
  -- An assignment with no status is not a state anybody chose, and a
  -- pill with nothing in it reads as a fault.
  UPDATE "Call_Off_Assignment"
     SET "Status" = 'Pending Review'
   WHERE "Status" IS NULL;

  ALTER TABLE "Call_Off_Assignment"
    ALTER COLUMN "Status" SET DEFAULT 'Pending Review';

  -- And the reference, once the data is clean enough to take it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_off_assignment_status_fk'
  ) THEN
    ALTER TABLE "Call_Off_Assignment"
      ADD CONSTRAINT call_off_assignment_status_fk
      FOREIGN KEY ("Status") REFERENCES "Call_Off_Status" ("Status_Name")
      ON UPDATE CASCADE;
  END IF;
END $$;


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Status_Name", "Colour", "Is_Closed" FROM "Call_Off_Status"
--    ORDER BY "Display_Order";
--
-- Where each team's work has got to, which is the question the old
-- single status could not answer:
--   SELECT a."Assignment_ID", t."Team_Name", tt."Task_Type_Name", a."Status"
--     FROM "Call_Off_Assignment" a
--     LEFT JOIN "Team" t       ON t."Team_ID"      = a."Team_ID"
--     LEFT JOIN "Task_Type" tt ON tt."Task_Type_ID" = a."Task_Type_ID"
--    WHERE a."Submission_ID" = 1
--    ORDER BY a."Start_Date";
--
-- A rename cascading, rather than orphaning:
--   UPDATE "Call_Off_Status" SET "Status_Name" = 'Completed'
--    WHERE "Status_Name" = 'Complete';
--   SELECT DISTINCT "Status" FROM "Call_Off_Assignment";
