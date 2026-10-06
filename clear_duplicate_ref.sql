-- ════════════════════════════════════════════════════════════════════
--  The one duplicate reference — look at it, then clear it
-- ════════════════════════════════════════════════════════════════════
--
-- Row 9.1 of migration_status.sql says 1. It is not something the
-- import did: two projects were already sharing a reference before any
-- of this started, and the UNIQUE constraint let them, because
-- Postgres treats two NULL Option_Letters as different values and so
-- the pair never collided.
--
-- Three parts. Run 1 and 2, read them, then run 3. Each part is ONE
-- statement, because the Supabase editor only shows the last result of
-- whatever you paste - so paste one part at a time.
--
-- Parts 1 and 2 are read-only. Part 3 deletes one project.


-- ────────────────────────────────────────────────────────────────────
--  PART 1 — what the two projects are
-- ────────────────────────────────────────────────────────────────────
--
-- Everything sharing a reference, side by side. "imported" says whether
-- it came from the old system; a project with no legacy id and a name
-- like a test is the one to go.

SELECT p."Project_ID"                                  AS project_id,
       p."Project_Ref"                                 AS reference,
       p."Revision"                                    AS revision,
       p."Option_Letter"                               AS option_letter,
       COALESCE(NULLIF(btrim(p."Site_Name"), ''), '(no name)') AS site_name,
       CASE WHEN p."Legacy_Contract_ID" IS NOT NULL THEN 'contract '
                                                         || p."Legacy_Contract_ID"
            WHEN p."Legacy_Tender_ID"   IS NOT NULL THEN 'tender '
                                                         || p."Legacy_Tender_ID"
            ELSE 'no - made in this app' END           AS imported,
       p."Created_At"                                  AS created,
       left(COALESCE(p."Notes", ''), 60)               AS notes
  FROM "Project" p
  JOIN (SELECT "Project_Ref", "Revision", "Option_Letter"
          FROM "Project"
         GROUP BY 1, 2, 3 HAVING count(*) > 1) d
    ON  d."Project_Ref" = p."Project_Ref"
    AND d."Revision"    = p."Revision"
    AND d."Option_Letter" IS NOT DISTINCT FROM p."Option_Letter"
 ORDER BY p."Project_Ref", p."Project_ID";


-- ────────────────────────────────────────────────────────────────────
--  PART 2 — what hangs off the one you are about to delete
-- ────────────────────────────────────────────────────────────────────
--
-- Do not skip this. A project is the parent of plots, drawings, grid
-- links, house types and more, and some of those foreign keys may be
-- ON DELETE CASCADE - which means the delete would take them with it
-- without saying so.
--
-- Every child table is found from the database's own foreign keys
-- rather than from a list written here, so nothing added since is
-- missed. "rows" is what is actually pointing at this project, and
-- "on delete" is what would happen to them:
--
--   blocks the delete  - the delete fails, nothing is lost
--   DELETED TOO        - cascade, they go with it
--   left orphaned      - the column is set to null or its default
--
-- The first two rows are the answer. The rest is the detail behind it.
--
-- The first run of this came back with NO rows at all, which reads like
-- "nothing hangs off it" and is not the same thing - a database with no
-- foreign keys to Project, or a rule that matched no project to delete,
-- gives exactly the same empty result. So the first two rows are always
-- there: which project part 3 would delete, and the total pointing at
-- it. An empty table below them now means something.

WITH victim AS (
  -- The same rule part 3 uses, so part 2 reports on the row part 3
  -- would actually delete. Kept as an array rather than one id, so it
  -- is still right if there were ever two of them.
  SELECT array_agg(p."Project_ID") AS ids,
         string_agg(COALESCE(NULLIF(btrim(p."Site_Name"), ''), '(no name)')
                    || ' (id ' || p."Project_ID"::text || ')', '; ') AS named
    FROM "Project" p
    JOIN (SELECT "Project_Ref", "Revision", "Option_Letter"
            FROM "Project"
           GROUP BY 1, 2, 3 HAVING count(*) > 1) d
      ON  d."Project_Ref" = p."Project_Ref"
      AND d."Revision"    = p."Revision"
      AND d."Option_Letter" IS NOT DISTINCT FROM p."Option_Letter"
   WHERE p."Legacy_Contract_ID" IS NULL
     AND p."Legacy_Tender_ID"   IS NULL
     AND p."Site_Name" ILIKE '%test%'
),
kids AS (
  SELECT k.conrelid::regclass::text AS child_table,
         CASE k.confdeltype WHEN 'a' THEN 'blocks the delete'
                            WHEN 'r' THEN 'blocks the delete'
                            WHEN 'c' THEN 'DELETED TOO'
                            WHEN 'n' THEN 'left orphaned (set null)'
                            WHEN 'd' THEN 'left orphaned (set default)'
                            ELSE k.confdeltype::text END AS on_delete,
         -- The query is built as text, so a child table with an odd
         -- name is quoted properly and nothing is resolved too early.
         (xpath('/row/c/text()', query_to_xml(
            format('SELECT count(*) AS c FROM %s WHERE %I = ANY (%L::bigint[])',
                   k.conrelid::regclass, a.attname, v.ids),
            false, true, '')))[1]::text::bigint AS rows
    FROM pg_constraint k
    JOIN pg_attribute  a ON a.attrelid  = k.conrelid
                        AND a.attnum    = k.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = k.confrelid
                        AND fa.attnum   = k.confkey[1]
    CROSS JOIN victim v
   WHERE k.contype    = 'f'
     AND k.confrelid  = '"Project"'::regclass
     AND fa.attname   = 'Project_ID'
     AND array_length(k.conkey, 1) = 1
     AND v.ids IS NOT NULL
)
SELECT child_table AS "What", on_delete AS "On delete", rows AS "Rows" FROM (
  SELECT 0 AS ord, 'THE PROJECT PART 3 WOULD DELETE' AS child_table,
         COALESCE((SELECT named FROM victim),
                  'nothing matches - part 3 would delete nothing') AS on_delete,
         NULL::bigint AS rows
  UNION ALL
  SELECT 1, 'TOTAL pointing at it',
         CASE WHEN NOT EXISTS (SELECT 1 FROM (
                     SELECT 1 FROM "Project"
                      GROUP BY "Project_Ref", "Revision", "Option_Letter"
                     HAVING count(*) > 1) any_dupe)
                   THEN 'no duplicate references at all - nothing to do'
              WHEN (SELECT ids FROM victim) IS NULL
                   THEN 'read part 1 - the duplicate is not a test project'
              WHEN COALESCE((SELECT sum(rows) FROM kids), 0) = 0
                   THEN 'nothing. Part 3 is safe'
              ELSE 'read the rows below before running part 3' END,
         COALESCE((SELECT sum(rows) FROM kids), 0)
  UNION ALL
  SELECT 2, child_table, on_delete, rows FROM kids
) x ORDER BY ord, rows DESC NULLS LAST, child_table;


-- ────────────────────────────────────────────────────────────────────
--  PART 3 — delete it
-- ────────────────────────────────────────────────────────────────────
--
-- One statement: the delete and the proof, so the editor shows you the
-- result rather than "No rows returned".
--
-- The project is found by rule, not by id. It must share its reference
-- with another project, carry no legacy id of either kind, and have a
-- name containing "test". If no row matches all three it deletes
-- nothing and the report says so - it will not fall back to deleting
-- something else.
--
-- Safe to run twice. The second run matches nothing.

WITH gone AS (
  DELETE FROM "Project" p
   WHERE p."Project_ID" IN (
           SELECT q."Project_ID"
             FROM "Project" q
             JOIN (SELECT "Project_Ref", "Revision", "Option_Letter"
                     FROM "Project"
                    GROUP BY 1, 2, 3 HAVING count(*) > 1) d
               ON  d."Project_Ref" = q."Project_Ref"
               AND d."Revision"    = q."Revision"
               AND d."Option_Letter" IS NOT DISTINCT FROM q."Option_Letter"
            WHERE q."Legacy_Contract_ID" IS NULL
              AND q."Legacy_Tender_ID"   IS NULL
              AND q."Site_Name" ILIKE '%test%')
  RETURNING p."Project_ID", p."Project_Ref", p."Site_Name"
)
SELECT 1 AS step, 'Deleted' AS what,
       CASE WHEN count(*) = 0
            THEN 'nothing matched - either it is already gone, or the '
                 || 'duplicate is not a test project. Read part 1 again.'
            ELSE count(*)::text || ': ' || string_agg(
                   "Site_Name" || ' (' || "Project_Ref" || ', id '
                   || "Project_ID"::text || ')', '; ') END AS detail
  FROM gone
UNION ALL
-- ── Why this excludes "gone" by hand ──
--
-- The first version of this counted duplicates straight out of
-- "Project" and reported "1 still sharing a reference" immediately
-- after successfully deleting the only one. Everything in a statement
-- sees the same snapshot, so this count cannot see the DELETE in the
-- CTE above it, however it is written. Subtracting the rows the CTE
-- returned is what makes the two halves agree.
SELECT 2, 'Duplicate references left',
       CASE WHEN count(*) = 0 THEN '0 - row 9.1 of the status script will '
                                   || 'read done now'
            ELSE count(*)::text || ' still sharing a reference - run part 1 '
                 || 'again to see which' END
  FROM (SELECT "Project_Ref", "Revision", "Option_Letter"
          FROM "Project" p
         WHERE NOT EXISTS (SELECT 1 FROM gone g
                            WHERE g."Project_ID" = p."Project_ID")
         GROUP BY 1, 2, 3 HAVING count(*) > 1) d
ORDER BY 1;
