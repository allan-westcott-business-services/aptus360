-- ════════════════════════════════════════════════════════════════════
--  The new project's reference — look at it first
-- ════════════════════════════════════════════════════════════════════
--
-- File 1 of two. Run 1_look_at_the_duplicate.sql first, read it, then
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
-- ── This file changes nothing ──
--
-- Read-only. It shows the project that part 2 would move and the
-- reference it would move to. Before running file 2, check that
-- "already_using_the_new_ref" reads 0.
-- ────────────────────────────────────────────────────────────────────
--  PART 1 — what would happen
-- ────────────────────────────────────────────────────────────────────

WITH dupe AS (
  SELECT p."Project_ID", p."Project_Ref", p."Revision", p."Option_Letter",
         p."Site_Name",
         -- The month comes from the reference itself, not from today, so
         -- the project stays filed under the month it was raised in.
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
  -- The next number in that month. max() of the numeric tail, not of
  -- the text: ordered as text, '2610.9' sorts above '2610.012' and the
  -- next number comes out lower than one already in use. That is the
  -- same fault the app's own generator has.
  SELECT d."Project_ID",
         d."prefix" || '.' || lpad((COALESCE(max(
           (regexp_match(p."Project_Ref", '^\d{4}\.0*(\d+)$'))[1]::int), 0)
           + 1)::text, 3, '0') AS new_ref
    FROM dupe d
    LEFT JOIN "Project" p
           ON p."Project_Ref" LIKE d."prefix" || '.%'
          AND p."Project_Ref" ~ '^\d{4}\.\d+$'
   GROUP BY d."Project_ID", d."prefix"
)
SELECT d."Project_ID"                      AS project_id,
       d."Site_Name"                        AS site_name,
       d."Project_Ref"                      AS ref_now,
       f.new_ref                            AS ref_after,
       (SELECT count(*) FROM "Project" x
         WHERE x."Project_Ref" = f.new_ref) AS already_using_the_new_ref,
       (SELECT string_agg(x."Site_Name" || ' (' || x."Project_ID"::text || ')', '; ')
          FROM "Project" x
         WHERE x."Project_Ref"   IS NOT DISTINCT FROM d."Project_Ref"
           AND x."Revision"      IS NOT DISTINCT FROM d."Revision"
           AND x."Option_Letter" IS NOT DISTINCT FROM d."Option_Letter"
           AND x."Project_ID"   <> d."Project_ID")
                                            AS leaves_the_ref_to
  FROM dupe d JOIN free f ON f."Project_ID" = d."Project_ID";


-- ────────────────────────────────────────────────────────────────────
