-- ════════════════════════════════════════════════════════════════
-- 0237 — the plot's link to the breakdown, under its own name
--
-- 0236 added `Plot.House_Type_ID` referencing "Project_House_Type" —
-- with IF NOT EXISTS. The live Plot table ALREADY HAD a column of that
-- name, from schema added by hand and never recorded in this folder:
--
--     FOREIGN KEY ("House_Type_ID")
--       REFERENCES "Property_Type" ("Property_Type_ID")
--
-- holding values on 35 plots. The guard saw the column, skipped the
-- line in silence, and the breakdown then wrote Project_House_Type ids
-- into a column checked against Property_Type. Adding plots with a
-- code failed:
--
--     insert or update on table "Plot" violates foreign key
--     constraint "Plot_House_Type_ID_fkey"
--
-- and the breakdown's plot counts were counting the old column, so a
-- house type showed the plots whose OLD property type shared its id.
--
-- ── The old column is left exactly as it is ──
--
-- Nothing in the app reads it, but 35 plots hold values and nobody
-- here knows what put them there. Repointing it would lose that; the
-- link gets its own name instead: Project_House_Type_ID, after the
-- table it points at.
--
-- ── And this one checks rather than trusts ──
--
-- IF NOT EXISTS is what caused this. After adding the column, the DO
-- block below confirms it points where it should and STOPS the
-- migration if it does not — so a column of this name that somebody
-- made by hand cannot be adopted silently a second time.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Plot"
  ADD COLUMN IF NOT EXISTS "Project_House_Type_ID" bigint
    REFERENCES "Project_House_Type" ("House_Type_ID") ON DELETE SET NULL;

DO $$
DECLARE
  target text;
BEGIN
  SELECT c.confrelid::regclass::text INTO target
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = '"Plot"'::regclass
     AND c.contype = 'f'
     AND a.attname = 'Project_House_Type_ID';

  IF target IS DISTINCT FROM '"Project_House_Type"' THEN
    RAISE EXCEPTION
      'Plot.Project_House_Type_ID references %, not "Project_House_Type" — a column of this name existed before this migration. Stopping rather than adopting it.',
      COALESCE(target, 'nothing');
  END IF;
END $$;

-- ── Checks ──────────────────────────────────────────────────────
--
-- The new link, pointing at the breakdown:
--
--   SELECT conname, confrelid::regclass
--     FROM pg_constraint
--    WHERE conrelid = '"Plot"'::regclass AND contype = 'f'
--      AND conname LIKE '%House_Type%';
--   -- expect Plot_Project_House_Type_ID_fkey → "Project_House_Type"
--   -- and the old Plot_House_Type_ID_fkey → "Property_Type", untouched
--
-- The old column's 35 values, untouched:
--
--   SELECT COUNT(*) FROM "Plot" WHERE "House_Type_ID" IS NOT NULL;
