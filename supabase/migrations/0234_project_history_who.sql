-- ════════════════════════════════════════════════════════════════
-- 0234 — the project history records who made the change
--
-- Reported from use: the History tab's "By" column is empty.
--
-- ── Why a trigger cannot find out on its own ──
--
-- Every Netlify function talks to the database with the SERVICE key.
-- That is deliberate (it is how the functions enforce their own
-- rules), and it means the database never sees the signed-in user:
-- `auth.uid()` in a trigger is the service role, not a person. So
-- `log_project_changes()` has nothing to go on, and 0233 \u2014 written
-- blind, from outside \u2014 left `Changed_By` to the column default and
-- said so.
--
-- The function DOES know the user. So it says, on the row: every
-- save through projects.js sets `Updated_By` to the person's name,
-- settled server-side from the login (whoIs() in _supabase.js \u2014 the
-- Person record's name, or the email where no Person matches). The
-- trigger reads it off NEW and records it as `Changed_By`.
--
-- ── Order does not matter ──
--
-- The endpoint retries without `Updated_By` if the column is not
-- there yet, so deploying the app before running this cannot break a
-- save. Until this runs the history simply stays blank for who, as
-- it is now.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "Updated_By" text;

CREATE OR REPLACE FUNCTION public.log_project_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  o   jsonb;
  n   jsonb;
  k   text;
  who text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  n := to_jsonb(NEW);

  -- Who, from the row. NULL where the save came from somewhere that
  -- does not stamp it \u2014 a backfill, the SQL editor \u2014 and the History
  -- tab shows a dash for those, which is honest.
  who := NULLIF(n ->> 'Updated_By', '');

  FOR k IN SELECT jsonb_object_keys(n) LOOP
    -- Bookkeeping that changes on every save and says nothing. And
    -- `Updated_By` itself, which is the WHO, not a thing that changed:
    -- recorded as a field it would fill the tab with "Updated By:
    -- Jane \u2192 John" every time two people took turns.
    IF k IN ('Updated_At', 'Created_At', 'Updated_By') THEN
      CONTINUE;
    END IF;

    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      INSERT INTO "Project_History"
        ("Project_ID", "Field", "Old_Value", "New_Value", "Changed_By")
      VALUES (NEW."Project_ID", k, o ->> k, n ->> k, who);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ── Checks ──────────────────────────────────────────────────────
--
-- Edit a project's site name in the app, then:
--
--   SELECT "Field", "Old_Value", "New_Value", "Changed_By", "Changed_At"
--     FROM "Project_History"
--    WHERE "Project_ID" = <that project>
--    ORDER BY "Changed_At" DESC LIMIT 5;
--   -- expect Site_Name with your name in Changed_By
--
-- A name that comes back as an email means no active Person record
-- has that login's email; fix it on the Person, not here.
--
-- Rows written before this ran have no name and cannot be given one:
-- nothing recorded who made them.
