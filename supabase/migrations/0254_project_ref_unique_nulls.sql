-- ════════════════════════════════════════════════════════════════════
--  0254 — the reference constraint that never fired
-- ════════════════════════════════════════════════════════════════════
--
-- 0001 created the table with
--
--   UNIQUE ("Project_Ref", "Revision", "Option_Letter")
--
-- and Postgres counts two NULLs as different values, so that index has
-- never stopped a duplicate reference on an ordinary project. An
-- ordinary project has no option letter: the column is NULL, NULL is
-- distinct from NULL, and the pair does not collide. The constraint
-- only ever protected lettered options - which is the one case that
-- does not need protecting, because 0077's next_option_letter() hands
-- those out.
--
-- It went unnoticed for the obvious reason: a constraint that is never
-- violated looks like a constraint that is working.
--
-- ── What it let through ──
--
-- 6 Oct, 06:32. A project created in the app took 2610.004, which an
-- imported contract had held since 14:21 the day before. Both rows
-- accepted, no error anywhere.
--
-- Two projects on one reference are not a cosmetic problem:
--
--   * project-options.js treats everything sharing (Project_Ref,
--     Revision) as one option set, so the unrelated project appears as
--     an option of this one - and its DELETE path nulls Option_Letter
--     across every row sharing the reference, which changes the other
--     project's Display_Ref.
--   * ProjectsList.jsx locks "Edit Project" when a higher revision of
--     the same reference exists, so one project can make an unrelated
--     one uneditable.
--   * plots.js builds Plot_Ref as `${projectRef}-${plotNumber}`, so
--     the plots of two projects collide too.
--
-- ── NULLS NOT DISTINCT, available since Postgres 15 ──
--
-- Supabase is well past that. The alternative was a unique index on
-- COALESCE("Option_Letter", ''), which works but hides the intent in an
-- expression; this says what is meant.
--
-- ── It will refuse to run while a duplicate exists ──
--
-- Deliberately. Run renumber_duplicate_project.sql first. The check
-- below raises with the references named, rather than letting
-- Postgres's own message name only the first one it trips over.

DO $$
DECLARE
  dupes text;
  n     integer;
BEGIN
  -- ── Empty option letters first ──
  --
  -- NULLS NOT DISTINCT makes two NULLs equal. It does not make '' and
  -- NULL equal, and both can be in the column: nullEmpty() in
  -- projects.js turns '' into NULL on the way in today, but rows
  -- written before it did are not re-saved by that. One '' and one
  -- NULL on the same reference would still slip past the new
  -- constraint, so they are normalised to NULL - which is what an
  -- unlettered project means, per 0077.
  UPDATE "Project" SET "Option_Letter" = NULL
   WHERE "Option_Letter" IS NOT NULL AND btrim("Option_Letter") = '';

  SELECT count(*), string_agg(DISTINCT d."Project_Ref", ', ')
    INTO n, dupes
    FROM (SELECT "Project_Ref", "Revision", "Option_Letter"
            FROM "Project"
           GROUP BY 1, 2, 3 HAVING count(*) > 1) d;

  IF n > 0 THEN
    RAISE EXCEPTION
      '% reference(s) are held by more than one project: %. '
      'Run renumber_duplicate_project.sql first - this constraint '
      'cannot be created while a duplicate exists, and creating it is '
      'what stops the next one.', n, dupes;
  END IF;
END $$;

-- The 0001 constraint is dropped by its generated name. IF EXISTS
-- rather than a bare DROP so this migration is safe to re-run, and so
-- it does not fail on a database where the constraint was already
-- replaced by hand.
ALTER TABLE "Project"
  DROP CONSTRAINT IF EXISTS "Project_Project_Ref_Revision_Option_Letter_key";

-- Named rather than left to Postgres, because projects.js matches on
-- the name to decide whether an insert failure is a reference collision
-- worth retrying or a different unique violation that belongs back to
-- the user. See REF_CONSTRAINTS in netlify/functions/_refs.js - the old
-- generated name is still listed there, so a database that has not run
-- this migration yet still behaves.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'Project_Ref_Revision_Option_UQ'
                    AND conrelid = '"Project"'::regclass) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_Ref_Revision_Option_UQ"
      UNIQUE NULLS NOT DISTINCT ("Project_Ref", "Revision", "Option_Letter");
  END IF;
END $$;
