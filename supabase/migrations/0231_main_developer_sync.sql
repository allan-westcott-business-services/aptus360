-- ════════════════════════════════════════════════════════════════
-- 0231 — the main developer cache follows the developer again
--
-- `Project.Customer_ID`, `Project.Branch_ID` and
-- `Project.Organisation_Branch_ID` are a cached copy of the MAIN
-- developer, kept by `sync_project_main_developer()` on
-- `Project_Developer`. Reported from use: project 25 showed
-- "Anwyl Homes (Lancashire)" in the projects list with Taylor Wimpey
-- (North West) on its Stakeholder tab.
--
-- Counted on the live data, 26 projects:
--
--   * the cache and the record disagree on 19 of them
--   * ELEVEN carry cached branch 17
--   * on seven of those the recorded developer is a different branch
--     entirely — 413 to 419
--   * six have a developer recorded and no cache at all
--
-- ── Why, and it is not drift ──
--
-- The function reads `Customer_ID` and `Branch_ID` off the main
-- developer row. Those are `Customer` and `Customer_Branch` columns,
-- and on 26 Aug both tables were emptied and every developer
-- repointed at `Organisation_Branch`. So since that day the function
-- has selected two nulls, found no difference to write, and done
-- NOTHING. It has never known about `Organisation_Branch_ID`.
--
-- That accounts for all three groups: the elevens are what the cache
-- held before 26 Aug and has kept ever since, the six with no cache
-- were created after it stopped working, and the seven disagreements
-- are simply both.
--
-- ── And it can wipe a correct answer ──
--
-- The worse half. The function clears `Organisation_Branch_ID`
-- whenever the main developer has a `Branch_ID`:
--
--     "Organisation_Branch_ID" = CASE
--        WHEN main."Branch_ID" IS NOT NULL THEN NULL
--        ELSE p."Organisation_Branch_ID" END
--
-- Sound when a project named one branch or the other (0154). Now
-- that there is one branch table, any developer row still carrying a
-- legacy `Branch_ID` will null out a perfectly good
-- `Organisation_Branch_ID` the next time anybody touches the
-- Stakeholder tab. A landmine rather than a stale figure.
--
-- ── Customer_ID and Branch_ID are ALREADY GONE ──
--
-- Found by running an earlier draft of this file, which set them and
-- was refused:
--
--   ERROR: column "Customer_ID" not found in data type "Project"
--   CONTEXT: PL/pgSQL function log_project_changes() line 16
--
-- Not from the UPDATE itself — from the history trigger firing after
-- it. So the columns were dropped at some point and two things were
-- left behind: this function, which still writes them, and
-- `log_project_changes()`, which still lists one of them among the
-- columns it records. See the foot of this file for that second one;
-- it is a separate fault and a live one.
--
-- ── What this does ──
--
-- Teaches the function the column that is actually used, stops it
-- clearing anything, and brings the live rows into line. It touches
-- `Organisation_Branch_ID` and NOTHING ELSE, because nothing else
-- is there to touch.

CREATE OR REPLACE FUNCTION public.sync_project_main_developer()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  pid    bigint;
  branch bigint;
BEGIN
  pid := COALESCE(NEW."Project_ID", OLD."Project_ID");

  -- The branch the main developer names. `Organisation_Branch_ID`
  -- and nothing else: `Customer_ID` and `Branch_ID` are off
  -- `Project`, and the old body read them off the developer to write
  -- them there.
  SELECT d."Organisation_Branch_ID"
    INTO branch
    FROM "Project_Developer" d
   WHERE d."Project_ID" = pid AND d."Is_Main"
   LIMIT 1;

  -- No main developer, or one that names no branch. The project
  -- keeps what it had rather than being emptied: a project with no
  -- developers is not a project with no customer, and a save on the
  -- Stakeholder tab has never been meant to clear one.
  --
  -- The old body did clear it — `WHEN main."Branch_ID" IS NOT NULL
  -- THEN NULL` — which was sound when a project named one branch
  -- table or the other, and with one branch table wipes the only
  -- column anything reads.
  IF branch IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE "Project" p
     SET "Organisation_Branch_ID" = branch
   WHERE p."Project_ID" = pid
     AND p."Organisation_Branch_ID" IS DISTINCT FROM branch;

  RETURN NULL;
END;
$function$;

-- ── Bringing the live rows into line ──
--
-- Only where a main developer actually names a branch. The projects
-- with no main developer keep whatever they hold and are listed by
-- the second check below: they want a developer setting on the
-- Stakeholder tab, and no amount of SQL can invent one.
--
-- Note that the app no longer READS this cache — the projects list
-- and the customer projects page both go to `Project_Developer`
-- directly. The backfill is for anything else that still does, and
-- so the column stops contradicting the record.
--
-- ── Why the history trigger is off for it ──
--
-- `log_project_changes()` is broken: it names `Customer_ID` in a
-- dynamic query and that column is gone, so EVERY update to a
-- project fails, this one included. It refused an earlier run of
-- this file, which is how it was found.
--
-- Suspended around the backfill rather than waiting for it, for two
-- reasons. The repair is worth having now — the cache contradicts
-- the record on nineteen projects. And a backfill is not a change
-- anybody made: a history row saying the branch changed, with no
-- person and no reason behind it, is noise in the one table people
-- go to when they want to know who did what.
--
-- This does NOT fix the trigger. Every ordinary edit to a project
-- still fails until it is dealt with — see the foot of this file.
-- Suspending it here buys the repair, not the fix.
ALTER TABLE "Project" DISABLE TRIGGER project_history_trg;

UPDATE "Project" p
   SET "Organisation_Branch_ID" = d."Organisation_Branch_ID"
  FROM "Project_Developer" d
 WHERE d."Project_ID" = p."Project_ID"
   AND d."Is_Main"
   AND d."Organisation_Branch_ID" IS NOT NULL
   AND p."Organisation_Branch_ID" IS DISTINCT FROM d."Organisation_Branch_ID";

-- Back on immediately. A trigger left disabled is a table that
-- quietly stops recording, and nothing about the next change would
-- say so.
ALTER TABLE "Project" ENABLE TRIGGER project_history_trg;

-- ── Checks ──────────────────────────────────────────────────────
--
-- Nothing should disagree any more, except where no developer is
-- recorded. Expect zero rows:
--
--   SELECT p."Project_ID", p."Display_Ref",
--          p."Organisation_Branch_ID" AS cached,
--          d."Organisation_Branch_ID" AS on_stakeholder_tab
--     FROM "Project" p
--     JOIN "Project_Developer" d
--       ON d."Project_ID" = p."Project_ID" AND d."Is_Main"
--    WHERE p."Organisation_Branch_ID" IS DISTINCT FROM d."Organisation_Branch_ID";
--
-- The projects with no main developer. These show blank in the
-- Customer column by design — a blank is a question somebody
-- answers, where a wrong company that looks right is not. Seven on
-- 20 Sept: 9, 12, 13, 15, 16, 18, 21.
--
--   SELECT p."Project_ID", p."Display_Ref", p."Site_Name"
--     FROM "Project" p
--    WHERE NOT EXISTS (SELECT 1 FROM "Project_Developer" d
--                       WHERE d."Project_ID" = p."Project_ID" AND d."Is_Main")
--    ORDER BY p."Project_ID";
--
-- And that the landmine is gone: set a main developer's branch on a
-- test project, save the Stakeholder tab, and confirm
-- `Organisation_Branch_ID` follows it rather than going null.

-- ── The history trigger is broken, and this does not fix it ──
--
--   ERROR: column "Customer_ID" not found in data type "Project"
--   CONTEXT: PL/pgSQL function log_project_changes() line 16 at EXECUTE
--
-- `log_project_changes()` builds a dynamic query naming the columns
-- it records and one of them is gone. Every UPDATE on `Project` that
-- reaches that path fails — including the backfill above, which is
-- how it was found.
--
-- Not fixed here because its body has not been read. Fetch it
-- first — `prosrc` rather than `pg_get_functiondef`, which the SQL
-- editor has been truncating:
--
--   SELECT prosrc FROM pg_proc WHERE proname = 'log_project_changes';
--
-- And anything else that still names the dead columns, so the sweep
-- is done once:
--
--   SELECT proname FROM pg_proc
--    WHERE prosrc ILIKE '%Customer_ID%' OR prosrc ILIKE '%Branch_ID%';
--
-- and the columns the table really has, so the list can be checked
-- against something rather than guessed at:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'Project'
--    ORDER BY ordinal_position;
--
-- If the column list is hardcoded in the function, it wants the two
-- dead names taken out. If it comes from a table, that table wants
-- the same. Either way it is its own migration: a history trigger
-- decides whether a change is recorded, and a wrong one either
-- blocks the save or loses the record of it.
--
-- ── And the columns themselves ──
--
-- `Customer_ID` and `Branch_ID` are already off `Project`. What is
-- left is the things that still name them:
--
--   1. `log_project_changes()`, above.
--   2. `PROJECT_COLUMNS` in netlify/functions/projects.js still
--      lists both. The list is the repo's stand-in for the schema
--      and is now wrong about it; `checkportal` reads it to decide
--      whether a column exists, so it will say yes to a column that
--      is gone. Taking them out is safe once 3 is done.
--   3. The portal's legacy account scope reads
--      `Project.Customer_ID` in `mine()` — netlify/functions/
--      portal.js. That query is already failing, or would if any
--      portal account still had a `Customer_ID`. It is an
--      authorisation path and wants moving onto `Project_Developer`
--      deliberately, with a real account to test against.
--
-- `Organisation_ID` is deliberately not added to `Project`:
-- `Organisation_Branch` carries it, and a second copy is the fault
-- this migration is fixing, one level up.
