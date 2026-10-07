-- ════════════════════════════════════════════════════════════════════
--  AP1989 — every staged connection, one per row
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Around 250 rows: export it and put it beside the Plot
-- Connections screen.
--
-- This is for the rows that do not match. The summary says there are
-- three more electric, three more gas and two more water in the staged
-- file than the old system shows, and a total does not say WHICH.
-- Sorted by utility then plot number so the two lists line up.
--
-- "would_be" says what T2 does with each row:
--
--   write       the one that lands
--   superseded  an earlier visit on a plot and utility that has a
--               later one - plot 41 on water is this
--
-- If a row here is not on your screen, that row is in the export and
-- not in the live system, which dates the export rather than the
-- import. If one on your screen is missing here, the opposite.

SELECT
  u."Utility"                                          AS "Utility",
  pl."Plot_Number"                                     AS "Plot",
  CASE WHEN r.dup_rank = 1 THEN 'write' ELSE 'superseded' END AS "would_be",
  NULLIF(btrim(r."Visit_Outcome"), '')                 AS "Visit outcome",
  NULLIF(btrim(r."Connection_Date"), '')               AS "Connected",
  NULLIF(btrim(r."Meter_Number"), '')                  AS "Meter",
  NULLIF(btrim(r."Adopter"), '')                       AS "Adopter in the file",
  NULLIF(btrim(r."Status_Of_Pack"), '')                AS "Pack status",
  NULLIF(btrim(r."MPAN_MPRN"), '')                     AS "MPAN/MPRN",
  r."Plot_Utility_ID"                                  AS "Old connection id",
  r."Plot_ID"                                          AS "Old plot id"
FROM "Legacy_Connection_Resolved" r
JOIN "Plot" pl    ON pl."Plot_ID" = r.new_plot_id
JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
LEFT JOIN "Utility" u ON u."Utility_ID" = COALESCE(
  (SELECT k."New_ID" FROM "Legacy_Lookup_Map" k
    WHERE k."Kind" = 'utility' AND k."Legacy_ID" = btrim(r."Utility_ID")),
  NULLIF(btrim(r."Utility_ID"), '')::bigint)
WHERE btrim(pr."AP_Number") = 'AP1989'
ORDER BY u."Utility",
         /* Plot numbers sort as text otherwise, which puts 100 before
            38 and makes two lists impossible to run an eye down. */
         NULLIF(regexp_replace(pl."Plot_Number", '[^0-9]', '', 'g'), '')::bigint
           NULLS LAST,
         pl."Plot_Number",
         r.dup_rank;
