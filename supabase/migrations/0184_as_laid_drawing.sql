-- ════════════════════════════════════════════════════════════════
-- 0184 — the as-laid drawing an Electric Service call-off carries
--
-- A jointing gang is sent to site with a picture of the electric design
-- they are jointing into. The sketch tab of the work instruction draws
-- on top of it, so the joint locations they mark are marked against the
-- run as laid rather than on a blank page.
--
-- ── On the call-off, not the assignment ──
--
-- This is a change from what was first proposed, and the reason is
-- worth stating because the instruction said "attached to the
-- assignment".
--
-- The canvas is the only thing in this application that can draw the
-- network — the same argument the span pictures make, and the reason
-- there is no renderer on the server. The canvas is open when a service
-- call-off is raised. It is not open when a jointing assignment is
-- made: that happens on the Call-offs page, days later, with no
-- drawing on screen and nothing to capture.
--
-- Holding the path on the assignment would therefore mean either
-- copying it down from the call-off at the moment the assignment is
-- created — one fact in two rows, drifting the first time the design
-- is redrawn — or sending a planner back to the canvas to take a
-- picture before they could book a gang.
--
-- So the drawing belongs to the call-off and every assignment under it
-- reads the same one. Where a per-assignment view is genuinely wanted
-- later — the original app carried a zoomed-in one as well — it is an
-- override column on the assignment, null meaning "the call-off's",
-- which is the shape that does not duplicate anything.
--
-- ── One drawing, and no template ──
--
-- The original offered a Document Template picker with a table behind
-- it. There is none here: the jointing work instruction is the document
-- for an Electric Service call-off, always. A dropdown with one entry
-- is a question with one answer, and a table to hold that one entry is
-- a configuration screen nobody will open.
--
-- ── The path, not the URL ──
--
-- As GIS_Basemap, Connection_Photo and the call-off span images all do:
-- the row holds the object's path inside the bucket and the public URL
-- is built when it is read. A URL in the column means renaming the
-- bucket strands every row, and it is a second copy of where the file
-- lives — the fault 0183 has just finished removing from the colours.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** Nothing should have these columns yet. Rows
-- coming back means this migration has already been run.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'Mains_Call_Off_Submission'
--      AND column_name IN ('As_Laid_Path', 'As_Laid_Captured_At');


ALTER TABLE "Mains_Call_Off_Submission"
  -- The object's path inside the call-off-as-laid bucket. Null until
  -- the drawing has been captured, which is the ordinary state of a
  -- call-off raised before this shipped.
  ADD COLUMN IF NOT EXISTS "As_Laid_Path" text,
  -- When it was taken. A drawing captured before the design was
  -- finished is worse than none, because it looks authoritative — this
  -- is what lets the page say how old it is and lets somebody decide to
  -- take it again.
  ADD COLUMN IF NOT EXISTS "As_Laid_Captured_At" timestamptz;

COMMENT ON COLUMN "Mains_Call_Off_Submission"."As_Laid_Path" IS
  'Path inside the call-off-as-laid bucket. The public URL is built on read, never stored.';

COMMENT ON COLUMN "Mains_Call_Off_Submission"."As_Laid_Captured_At" IS
  'When the drawing was taken off the canvas. Null means it has not been.';


-- ── When the instruction was raised ─────────────────────────────
--
-- 0150 added Work_Instruction_Created as a boolean, which answers "has
-- it" and not "since when". A planner working through a week needs the
-- second: an instruction raised in March against a booking that has
-- moved since is not the instruction the gang is holding.
--
-- The boolean stays. It is what the Planning modal and the Call-offs
-- page both read, and deriving it from a null date would be a second
-- way of asking one question.

ALTER TABLE "Call_Off_Assignment"
  ADD COLUMN IF NOT EXISTS "Work_Instruction_Created_At" timestamptz;

COMMENT ON COLUMN "Call_Off_Assignment"."Work_Instruction_Created_At" IS
  'When the work instruction was raised. Null on rows raised before 0184.';

-- Not backfilled, on purpose. The date is not recoverable for
-- instructions already raised, and writing now() for them would date
-- every historic one to the day this migration was run — which reads as
-- fact and is not.


-- ── Check ───────────────────────────────────────────────────────
--
-- 1. The three columns exist and every one of them is nullable. A NOT
--    NULL here would reject every call-off raised before its drawing is
--    captured:
--
--   SELECT table_name, column_name, is_nullable
--     FROM information_schema.columns
--    WHERE (table_name = 'Mains_Call_Off_Submission'
--           AND column_name IN ('As_Laid_Path','As_Laid_Captured_At'))
--       OR (table_name = 'Call_Off_Assignment'
--           AND column_name = 'Work_Instruction_Created_At')
--    ORDER BY table_name, column_name;
--
-- 2. Nothing was disturbed. Instructions already raised keep their
--    flag, and none has gained a date:
--
--   SELECT COUNT(*) FILTER (WHERE "Work_Instruction_Created")        AS raised,
--          COUNT(*) FILTER (WHERE "Work_Instruction_Created_At"
--                                 IS NOT NULL)                       AS dated
--     FROM "Call_Off_Assignment";
--
--   raised as it was before; dated 0.
--
-- ── Then, in the dashboard, not here ────────────────────────────
--
-- Storage → New bucket → name `call-off-as-laid`, PUBLIC.
--
-- Buckets are made in the dashboard, so a migration claiming to create
-- one would appear to have worked while the first upload failed.
--
-- Public because the work instruction is opened on a tablet by a gang
-- that is not signed in to this application, and a signed URL would
-- expire part way through a day's work. The objects are drawings of
-- cable runs — no personal data — and the path carries the call-off id,
-- so a guessed URL yields a picture of a trench.
--
-- Uploads do NOT go direct from the browser. As with the span images,
-- the canvas sends the PNG to a function holding the service-role key
-- and that writes it, so the bucket needs no write policy of its own.
-- ════════════════════════════════════════════════════════════════
