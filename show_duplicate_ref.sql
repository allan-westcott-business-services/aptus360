-- ════════════════════════════════════════════════════════════════════
--  Which two projects share a reference
-- ════════════════════════════════════════════════════════════════════
--
-- One statement, read-only. Paste the whole file.
--
-- This is part 1 of clear_duplicate_ref.sql on its own, because part 3
-- of that file deleted nothing: its rule looks for a project that
-- shares a reference, carries no legacy id, and is named like a test,
-- and no row matched all three. Which means the pair is not the "Test
-- Site" one I assumed - either that was dealt with already, or the two
-- projects sharing a reference are something else entirely, quite
-- possibly two imported contracts.
--
-- It refused rather than widening its aim, which is what it should do.
-- This says what the pair actually is.
--
-- Option_Letter is shown as (null) or (empty) rather than blank,
-- because those are different values to the unique constraint and look
-- identical on screen.

SELECT p."Project_ID"                                     AS project_id,
       p."Project_Ref"                                    AS reference,
       p."Revision"                                       AS revision,
       CASE WHEN p."Option_Letter" IS NULL      THEN '(null)'
            WHEN btrim(p."Option_Letter") = ''  THEN '(empty)'
            ELSE p."Option_Letter" END                    AS option_letter,
       COALESCE(NULLIF(btrim(p."Site_Name"), ''), '(no name)') AS site_name,
       CASE WHEN p."Legacy_Contract_ID" IS NOT NULL
                 THEN 'contract ' || p."Legacy_Contract_ID"
            WHEN p."Legacy_Tender_ID" IS NOT NULL
                 THEN 'tender ' || p."Legacy_Tender_ID"
            ELSE 'no - made in this app' END              AS imported,
       p."Created_At"                                     AS created,
       left(COALESCE(p."Notes", ''), 70)                  AS notes
  FROM "Project" p
  JOIN (SELECT "Project_Ref", "Revision", "Option_Letter"
          FROM "Project"
         GROUP BY 1, 2, 3 HAVING count(*) > 1) d
    -- IS NOT DISTINCT FROM on all three, not just Option_Letter. GROUP
    -- BY puts two NULLs in one group but "=" against a NULL is NULL, so
    -- a plain join can find nothing where the grouping found a pair -
    -- the join silently drops the very rows it is meant to return.
    -- Project_Ref and Revision are both NOT NULL today, so this is only
    -- belt and braces there, but a column that goes nullable later
    -- should not quietly break this.
    ON  d."Project_Ref"    IS NOT DISTINCT FROM p."Project_Ref"
    AND d."Revision"       IS NOT DISTINCT FROM p."Revision"
    AND d."Option_Letter"  IS NOT DISTINCT FROM p."Option_Letter"
 ORDER BY p."Project_Ref", p."Revision", p."Project_ID";
