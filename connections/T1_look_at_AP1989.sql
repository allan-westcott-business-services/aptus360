-- ════════════════════════════════════════════════════════════════════
--  Before the test run — what AP1989 actually has
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing. One result set.
--
-- Run 0256_connection_lookups.sql first if you have not already; this
-- reads the view it replaces.
--
-- Everything below is scoped to the one contract. The figures it
-- reports are what T2 will write, counted the same way T2 selects
-- them, so the two cannot disagree about what "this contract" means.

SELECT step AS "#", item AS "What", detail AS "Detail"
  FROM (

  SELECT 0::numeric AS step, 'The project' AS item,
         CASE WHEN count(*) = 0
              THEN 'STOPS IT - no project has AP_Number AP1989'
              ELSE string_agg(COALESCE(p."Project_Ref", '(no ref)')
                     || ' — ' || COALESCE(p."Site_Name", '(no site name)')
                     || '  [Project_ID ' || p."Project_ID" || ']', '; ')
         END AS detail
    FROM "Project" p WHERE btrim(p."AP_Number") = 'AP1989'

  UNION ALL
  SELECT 0.1, 'Plots on it',
         count(*)::text || ' plots, of which '
         || count(*) FILTER (WHERE "Legacy_Plot_ID" IS NOT NULL)::text
         || ' came from the old system'
    FROM "Plot" WHERE "Project_ID" IN
      (SELECT "Project_ID" FROM "Project" WHERE btrim("AP_Number") = 'AP1989')

  UNION ALL
  SELECT 1, 'Connections T2 would write',
         count(*)::text || ' rows'
    FROM "Legacy_Connection_Resolved" r
   WHERE r.dup_rank = 1
     AND r.new_plot_id IN (
       SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
              ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')

  UNION ALL
  SELECT 1.1, 'By utility',
         COALESCE(string_agg(t.u || ': ' || t.n, ', ' ORDER BY t.u),
                  'none')
    FROM (
      SELECT COALESCE(u."Utility", '(unmapped utility ' || btrim(r."Utility_ID") || ')') AS u,
             count(*)::text AS n
        FROM "Legacy_Connection_Resolved" r
        LEFT JOIN "Utility" u ON u."Utility_ID" = COALESCE(
          (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
            WHERE m."Kind" = 'utility' AND m."Legacy_ID" = btrim(r."Utility_ID")),
          NULLIF(btrim(r."Utility_ID"), '')::bigint)
       WHERE r.dup_rank = 1
         AND r.new_plot_id IN (
           SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
                  ON pr."Project_ID" = pl."Project_ID"
            WHERE btrim(pr."AP_Number") = 'AP1989')
       GROUP BY 1) t

  UNION ALL
  SELECT 1.2, 'Superseded visits it would drop',
         count(*)::text || ' earlier aborted visits on a plot and utility '
         || 'that also has a later one'
    FROM "Legacy_Connection_Resolved" r
   WHERE r.dup_rank > 1
     AND r.new_plot_id IN (
       SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
              ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')

  UNION ALL
  SELECT 2, 'Already there',
         count(*)::text || ' connections exist on these plots now, of '
         || 'which ' || count(*) FILTER (WHERE pu."Legacy_Plot_Utility_ID" IS NOT NULL)::text
         || ' came from the old system. T2 leaves every one of them alone.'
    FROM "Plot_Utility" pu
   WHERE pu."Plot_ID" IN (
     SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
            ON pr."Project_ID" = pl."Project_ID"
      WHERE btrim(pr."AP_Number") = 'AP1989')

  UNION ALL
  SELECT 3, 'Adopters named on them',
         COALESCE(string_agg(DISTINCT btrim(r."Adopter"), ', '),
                  'none - no adopter is named on this contract')
    FROM "Legacy_Connection_Resolved" r
   WHERE r.dup_rank = 1
     AND COALESCE(btrim(r."Adopter"), '') <> ''
     AND r.new_plot_id IN (
       SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
              ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')

  UNION ALL
  SELECT 3.1, 'Any of those that will not resolve',
         COALESCE(string_agg(DISTINCT btrim(r."Adopter"), ', '),
                  'none - every adopter on this contract resolves')
    FROM "Legacy_Connection_Resolved" r
   WHERE r.dup_rank = 1
     AND COALESCE(btrim(r."Adopter"), '') <> ''
     AND r.adopter_organisation_id IS NULL
     AND r.new_plot_id IN (
       SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
              ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')

  UNION ALL
  SELECT 4, 'Pack statuses on them',
         COALESCE(string_agg(DISTINCT btrim(r."Status_Of_Pack"), ', '),
                  'none recorded')
    FROM "Legacy_Connection_Resolved" r
   WHERE r.dup_rank = 1
     AND COALESCE(btrim(r."Status_Of_Pack"), '') <> ''
     AND r.new_plot_id IN (
       SELECT pl."Plot_ID" FROM "Plot" pl JOIN "Project" pr
              ON pr."Project_ID" = pl."Project_ID"
        WHERE btrim(pr."AP_Number") = 'AP1989')

  ) z ORDER BY step;
