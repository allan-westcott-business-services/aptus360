-- ════════════════════════════════════════════════════════════════════
--  The new project's reference — now move it
-- ════════════════════════════════════════════════════════════════════
--
-- File 2 of two. Run 1_look_at_the_duplicate.sql first, read it, then
-- run 2_renumber_the_project.sql. One statement each, because the
-- Supabase editor shows only the last result of whatever you paste.
--
-- ── What this is about ──
--
-- Project 3801, "Bodnant Avenue, Prestatyn", was created in the app at
-- 06:32 on 6 Oct on reference 2610.004. Project 3693, "Tansey Green,
-- Kingswinford", already held 2610.004 — it came in with the contract
-- import at 14:21 the day before.
--
-- Nothing is wrong with either project. The new one is real work that
-- needs keeping; it just needs a reference of its own.
--
-- ── Why the database allowed it ──
--
-- The unique constraint is on ("Project_Ref", "Revision",
-- "Option_Letter"), and Postgres counts two NULLs as different values.
-- An ordinary project has no option letter, so the third column is NULL
-- on both rows and the pair never collides. That constraint has never
-- protected a normal project, only lettered options. Migration 0254
-- closes it, and must run AFTER these two — it cannot be created while
-- a duplicate is sitting there.
--
-- ── Which row moves ──
--
-- The app-created one, every time: it is the one with no legacy id.
-- Moving the imported project would break the link back to contract 380
-- that the migration established.
--
-- ── Only run this once file 1 shows a clean preview ──
--
-- "already_using_the_new_ref" must read 0 there. This file changes one
-- project's reference and nothing else — not its plots, not its
-- drawings, not its scopes — and writes a line into its Notes saying
-- what changed and why.
--
-- Safe to run twice: the second run finds no duplicate and does
-- nothing.
-- ────────────────────────────────────────────────────────────────────
--  PART 2 — do it
-- ────────────────────────────────────────────────────────────────────
--
-- Only run this once part 1 shows "already_using_the_new_ref" as 0.
--
-- Nothing else on the project changes - not its plots, not its
-- drawings, not its scopes. Plot_Ref strings built from the old
-- reference are not rewritten, because a project created this morning
-- is very unlikely to have any; part 1's project_id is what to check
-- if you want to be sure.
--
-- Safe to run twice: the second run finds no duplicate and changes
-- nothing.

WITH dupe AS (
  SELECT p."Project_ID", p."Project_Ref", p."Revision", p."Option_Letter",
         substring(p."Project_Ref" FROM '^(\d{4})\.') AS prefix
    FROM "Project" p
    JOIN (SELECT "Project_Ref", "Revision", "Option_Letter"
            FROM "Project"
           GROUP BY 1, 2, 3 HAVING count(*) > 1) d
      ON  d."Project_Ref"   IS NOT DISTINCT FROM p."Project_Ref"
      AND d."Revision"      IS NOT DISTINCT FROM p."Revision"
      AND d."Option_Letter" IS NOT DISTINCT FROM p."Option_Letter"
   WHERE p."Legacy_Contract_ID" IS NULL
     AND p."Legacy_Tender_ID"   IS NULL
),
free AS (
  SELECT d."Project_ID",
         d."prefix" || '.' || lpad((COALESCE(max(
           (regexp_match(p."Project_Ref", '^\d{4}\.0*(\d+)$'))[1]::int), 0)
           + 1)::text, 3, '0') AS new_ref
    FROM dupe d
    LEFT JOIN "Project" p
           ON p."Project_Ref" LIKE d."prefix" || '.%'
          AND p."Project_Ref" ~ '^\d{4}\.\d+$'
   GROUP BY d."Project_ID", d."prefix"
),
moved AS (
  UPDATE "Project" t
     SET "Project_Ref" = f.new_ref,
         "Notes" = COALESCE(NULLIF(btrim(t."Notes"), '') || E'\n', '')
                   || 'Reference changed from ' || t."Project_Ref" || ' to '
                   || f.new_ref || ' on ' || to_char(now(), 'DD Mon YYYY')
                   || ': the reference was already held by an imported '
                   || 'contract.'
    FROM free f
   WHERE t."Project_ID" = f."Project_ID"
     -- Belt and braces. The free CTE should never produce a ref in use,
     -- but an UPDATE that silently takes one would turn one duplicate
     -- into a different duplicate.
     AND NOT EXISTS (SELECT 1 FROM "Project" x
                      WHERE x."Project_Ref" = f.new_ref)
  RETURNING t."Project_ID", t."Site_Name", t."Project_Ref" AS new_ref
)
SELECT 1 AS step, 'Renumbered' AS what,
       CASE WHEN count(*) = 0
            THEN 'nothing to do - no app-created project is sharing a '
                 || 'reference. Run part 1.'
            ELSE string_agg("Site_Name" || ' (id ' || "Project_ID"::text
                            || ') is now ' || new_ref, '; ') END AS detail
  FROM moved
UNION ALL
SELECT 2, 'Duplicate references left',
       CASE WHEN count(*) = 0
            THEN '0 - migration 0254 can be run now, and row 9.1 of the '
                 || 'status script will read done'
            ELSE count(*)::text || ' still sharing a reference - run '
                 || 'show_duplicate_ref.sql again' END
  FROM (SELECT 1 FROM "Project" p
         WHERE NOT EXISTS (SELECT 1 FROM moved m
                            WHERE m."Project_ID" = p."Project_ID")
         GROUP BY p."Project_Ref", p."Revision", p."Option_Letter"
        HAVING count(*) > 1) d
ORDER BY 1;
