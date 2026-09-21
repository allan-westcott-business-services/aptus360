-- ════════════════════════════════════════════════════════════════
-- 0233 — the project history trigger no longer names columns
--
-- `log_project_changes()` fires on every INSERT and UPDATE of
-- "Project" and records what changed in "Project_History". It did so
-- by naming the columns it watched, one by one, in a dynamic query:
--
--     SELECT ($1)."Customer_ID"::text, ($2)."Customer_ID"::text
--
-- `Customer_ID` was dropped from "Project" on 20 Sept. From that
-- moment every save on a project failed \u2014 first the edits (found by
-- 0231's backfill), then, reported from use, creating a project at
-- all:
--
--     ERROR: column "Customer_ID" not found in data type "Project"
--     CONTEXT: PL/pgSQL function log_project_changes() line 16 at EXECUTE
--
-- ── Why it is being replaced rather than edited ──
--
-- Its body was never in this folder and has not been read: it was
-- asked for twice and not received, and people cannot make projects
-- while the question waits. So this is a rewrite from what is known
-- \u2014 the table it writes (0077 shows the four columns), the readers of
-- that table (activity.js, ActivityTab.jsx), and the error text,
-- which says exactly how it worked.
--
-- A trigger that names columns will break again the next time one is
-- dropped, and there is a drop still to come. So this one names
-- none. It turns OLD and NEW into JSON and compares every key. A
-- column dropped tomorrow simply stops appearing; one added tomorrow
-- is recorded without anybody remembering to list it.
--
-- ── What it records, compared with before ──
--
-- Probably more. The old list was curated (the activity tab labels
-- about thirty fields); this records every column that changes, so
-- `Points_Breakdown` and `Total_Design_Points` will show up when the
-- scoring runs, where before they may not have. That is the trade:
-- over-recording is a longer activity tab, and blocking every save is
-- nobody working. `Updated_At` is skipped, because it changes on
-- every save and says nothing.
--
-- Nothing is recorded on INSERT. Creating a project is not a change
-- to one, and 0077 already writes its own "Created" line where a
-- copy is made. If the old body did record creation, the activity
-- tab will show one fewer line per new project from here on.
--
-- `Changed_By` is left to the column's default. If the old body set
-- it from the request's JWT, that attribution is lost here and wants
-- putting back once the original is read \u2014 it is the one thing this
-- rewrite cannot reconstruct from the outside.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_project_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  o jsonb;
  n jsonb;
  k text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);

  FOR k IN SELECT jsonb_object_keys(n) LOOP
    -- Bookkeeping that changes on every save and says nothing.
    IF k IN ('Updated_At', 'Created_At') THEN
      CONTINUE;
    END IF;

    -- IS DISTINCT FROM, so null against null is no change and null
    -- against a value is one.
    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      INSERT INTO "Project_History" ("Project_ID", "Field", "Old_Value", "New_Value")
      VALUES (NEW."Project_ID", k, o ->> k, n ->> k);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ── Checks ──────────────────────────────────────────────────────
--
-- Make a project, edit its site name, and:
--
--   SELECT "Field", "Old_Value", "New_Value", "Changed_At"
--     FROM "Project_History"
--    WHERE "Project_ID" = <that project>
--    ORDER BY "Changed_At" DESC LIMIT 10;
--   -- expect one row: Site_Name, the old name, the new name
--
-- And that the trigger is still attached to what it was:
--
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--     FROM pg_trigger
--    WHERE tgrelid = '"Project"'::regclass AND NOT tgisinternal;
--   -- expect project_history_trg, enabled ('O'), calling this function
--
-- If 0231 was run with the trigger disabled and the ENABLE at its
-- foot did not run, tgenabled reads 'D' and the table is recording
-- nothing:
--
--   ALTER TABLE "Project" ENABLE TRIGGER project_history_trg;
