-- ════════════════════════════════════════════════════════════════════
--  AV3 — where did the asset value agreements land?
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. One result set.
--
-- The import reported 6,204 agreements on 1,668 projects. If a project
-- page shows none, the first thing to settle is whether that project is
-- one of the 1,668 — only projects whose contract was in the export got
-- any, and there are 1,958 projects.
--
-- So this does three things: counts what is actually there, checks the
-- view the screen reads against the table the import wrote, and names
-- ten projects that definitely have agreements. Open one of those. If
-- it shows them, the first project simply had none. If it does not,
-- the fault is in the app and not the data.
-- ════════════════════════════════════════════════════════════════════

SELECT item AS "What", detail AS "Detail"
  FROM (

  SELECT 1::numeric AS step, '1 in the table' AS item,
         count(*)::text || ' agreements on '
         || count(DISTINCT "Project_ID")::text || ' projects' AS detail
    FROM "AV_Agreement"

  -- The screen reads the view, not the table. If these two disagree the
  -- view is dropping rows and that is the fault.
  UNION ALL
  SELECT 2, '2 in the view the screen reads',
         count(*)::text || ' agreements on '
         || count(DISTINCT "Project_ID")::text || ' projects'
         || CASE WHEN count(*) = (SELECT count(*) FROM "AV_Agreement")
                 THEN ' — same as the table, so the view is fine'
                 ELSE ' — STOPS IT: the view is dropping rows' END
    FROM "AV_Agreement_Detail"

  UNION ALL
  SELECT 3, '3 projects with none',
         (SELECT count(*) FROM "Project" p
           WHERE NOT EXISTS (SELECT 1 FROM "AV_Agreement" a
                              WHERE a."Project_ID" = p."Project_ID"))::text
         || ' of ' || (SELECT count(*) FROM "Project")::text
         || ' projects have no agreement. A project whose contract was '
         || 'not in the export is expected to have none.'

  -- ── Ten projects that definitely have agreements ──────────────────
  UNION ALL
  SELECT 4 + row_number() OVER (ORDER BY n DESC, ref) / 100.0,
         '4 open this one: ' || ref,
         n::text || ' agreements — ' || types
    FROM (
      SELECT COALESCE(NULLIF(btrim(p."AP_Number"), ''),
                      NULLIF(btrim(p."Project_Ref"), ''),
                      'Project ' || p."Project_ID"::text) AS ref,
             count(*) AS n,
             string_agg(t."AV_Agreement_Type", ', '
                        ORDER BY t."AV_Agreement_Type") AS types
        FROM "AV_Agreement" a
        JOIN "Project" p ON p."Project_ID" = a."Project_ID"
        LEFT JOIN "AV_Agreement_Type" t
               ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
       GROUP BY 1
       ORDER BY count(*) DESC, 1
       LIMIT 10
    ) x

  ) z ORDER BY step, item;
