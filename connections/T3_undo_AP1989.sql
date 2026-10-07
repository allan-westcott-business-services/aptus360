-- ════════════════════════════════════════════════════════════════════
--  Undo the AP1989 test run
-- ════════════════════════════════════════════════════════════════════
--
-- Removes exactly what T2 wrote: imported connections (they carry a
-- Legacy_Plot_Utility_ID) on plots belonging to AP1989. A connection
-- somebody entered in the app has no legacy id and is not touched.
--
-- The count comes back as the result, counted BEFORE the delete in the
-- same statement — a count taken alongside a delete in one statement
-- sees the rows still there, which has caught me out twice.

WITH gone AS (
  DELETE FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL
     AND "Plot_ID" IN (
       SELECT pl."Plot_ID" FROM "Plot" pl
         JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')
  RETURNING 1
)
SELECT count(*)::text || ' imported connection(s) removed from AP1989'
         AS "Undone"
  FROM gone;
