-- ════════════════════════════════════════════════════════════════════
--  AP1989 — counted the way you counted it
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. One result set.
--
-- You reported, from the original system:
--
--     Water     87 plots, 88 connections (plot 41 twice, one aborted)
--     Electric  68 plots, 68 connections
--     Gas       83 plots, 84 connections
--
-- T1 reported connections only - 71 / 87 / 90 - so part of the gap is
-- that we were counting two different things. This counts both, per
-- utility, and spells out every repeated plot so the duplicates can be
-- matched one by one rather than inferred from a total.
--
-- Rows 3 and 4 are the ones that will settle the adopter. You say the
-- IDNOs on this contract are GTC and IWNL. The staged file's free-text
-- Adopter column says GTC and United Utilities, and its IDNO_ID column
-- is empty on every row of this contract - 125 rows in the whole
-- 33,059 carry one at all. So either the export predates a change, or
-- the screen you are reading takes the adopter from somewhere this
-- file does not contain. Row 4 shows the raw values, unmapped.

SELECT step AS "#", item AS "What", detail AS "Detail"
  FROM (

  WITH mine AS (
    SELECT r.*, pl."Plot_Number"
      FROM "Legacy_Connection_Resolved" r
      JOIN "Plot" pl ON pl."Plot_ID" = r.new_plot_id
      JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
     WHERE btrim(pr."AP_Number") = 'AP1989'
  ), named AS (
    SELECT m.*, COALESCE(u."Utility", '(utility ' || btrim(m."Utility_ID") || ')') AS util
      FROM mine m
      LEFT JOIN "Utility" u ON u."Utility_ID" = COALESCE(
        (SELECT k."New_ID" FROM "Legacy_Lookup_Map" k
          WHERE k."Kind" = 'utility' AND k."Legacy_ID" = btrim(m."Utility_ID")),
        NULLIF(btrim(m."Utility_ID"), '')::bigint)
  )

  SELECT 1::numeric AS step, '1 ' || n.util AS item,
         count(DISTINCT n."Plot_Number")::text || ' plots, '
         || count(*)::text || ' connections staged ('
         || count(*) FILTER (WHERE n.dup_rank = 1)::text || ' would be written, '
         || count(*) FILTER (WHERE n.dup_rank > 1)::text || ' dropped as superseded)'
           AS detail
    FROM named n GROUP BY n.util

  UNION ALL
  SELECT 2, '2 repeated: plot ' || d."Plot_Number" || ' on ' || d.util,
         d.n::text || ' rows — outcomes: ' || d.outcomes
         || '; dates: ' || d.dates
    FROM (
      SELECT n."Plot_Number", n.util, count(*) AS n,
             string_agg(COALESCE(NULLIF(btrim(n."Visit_Outcome"), ''), '(none)'),
                        ', ' ORDER BY n.dup_rank) AS outcomes,
             string_agg(COALESCE(NULLIF(btrim(n."Connection_Date"), ''), '(none)'),
                        ', ' ORDER BY n.dup_rank) AS dates
        FROM named n
       GROUP BY n."Plot_Number", n.util
      HAVING count(*) > 1) d

  UNION ALL
  SELECT 3, '3 adopter on ' || n.util,
         COALESCE(NULLIF(btrim(n."Adopter"), ''), '(blank)')
         || ' — ' || count(*)::text || ' connections'
    FROM named n GROUP BY n.util, COALESCE(NULLIF(btrim(n."Adopter"), ''), '(blank)')

  UNION ALL
  SELECT 4, '4 the old IDNO_ID column',
         count(*) FILTER (WHERE COALESCE(btrim(n."IDNO_ID"), '') <> '')::text
         || ' of ' || count(*)::text || ' rows on this contract carry one'
         || COALESCE(' — values: ' || string_agg(DISTINCT btrim(n."IDNO_ID"), ', ')
                       FILTER (WHERE COALESCE(btrim(n."IDNO_ID"), '') <> ''), '')
    FROM named n

  UNION ALL
  SELECT 5, '5 plots on the project with no connection at all',
         (SELECT count(*) FROM "Plot" pl JOIN "Project" pr
                 ON pr."Project_ID" = pl."Project_ID"
           WHERE btrim(pr."AP_Number") = 'AP1989'
             AND NOT EXISTS (SELECT 1 FROM mine m WHERE m.new_plot_id = pl."Plot_ID"))::text
         || ' of ' || (SELECT count(*) FROM "Plot" pl JOIN "Project" pr
                              ON pr."Project_ID" = pl."Project_ID"
                        WHERE btrim(pr."AP_Number") = 'AP1989')::text
         || ' plots. A contract with far more plots than connections is '
         || 'ordinary on a part-built site — it is only worth a look if '
         || 'the plot count itself is wrong.'

  UNION ALL
  SELECT 6, '6 staged connections whose plot did NOT import',
         (SELECT count(*) FROM "Legacy_Connection_Resolved" r
           WHERE r.new_plot_id IS NULL
             AND NULLIF(btrim(r."Plot_ID"), '')::bigint IN (
               SELECT NULLIF(btrim(i."Plot_ID"), '')::bigint
                 FROM "Legacy_Plot_Import" i
                WHERE NULLIF(btrim(i."Contract_ID"), '')::bigint = (
                  SELECT "Legacy_Contract_ID" FROM "Project"
                   WHERE btrim("AP_Number") = 'AP1989')))::text
         || ' — these belong to AP1989 in the old system and have no Plot '
         || 'row here, so nothing would be written for them'

  ) z ORDER BY step, item;
