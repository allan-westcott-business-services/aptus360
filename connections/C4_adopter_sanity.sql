-- ════════════════════════════════════════════════════════════════════
--  Does the adopter make sense? — after 0258
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. One result set. Run after 0258.
--
-- The adopter is now taken from the contract's IDNO, and the obvious
-- question about any mapping is whether it is RIGHT. Totals cannot
-- answer that: 30,587 resolved is the same number whether they
-- resolved to the right companies or the wrong ones, which is exactly
-- how the free-text Adopter looked correct for a fortnight.
--
-- So this checks the mapping against something independent of it: the
-- role model. An organisation adopting a water connection must hold a
-- water role — wu or iwu. One adopting gas must hold gt or igt. That
-- is a fact about the trade, recorded in the register, and nothing in
-- the IDNO map can influence it. If the two agree, the map is right
-- for reasons that have nothing to do with how it was built.
--
-- Row 1 is the one that matters. Everything else is context.

SELECT step AS "#", item AS "What", detail AS "Detail"
  FROM (

  WITH res AS (
    SELECT x.*,
           CASE btrim(x."Utility_ID")
             WHEN '1' THEN ARRAY['idno', 'dno']
             WHEN '2' THEN ARRAY['gt', 'igt']
             WHEN '3' THEN ARRAY['wu', 'iwu']
           END AS needs,
           CASE btrim(x."Utility_ID")
             WHEN '1' THEN 'Electric' WHEN '2' THEN 'Gas'
             WHEN '3' THEN 'Water' ELSE '(utility ' || btrim(x."Utility_ID") || ')'
           END AS util
      FROM "Legacy_Connection_Resolved" x
  ), holds AS (
    SELECT ro."Organisation_ID" AS oid, t."Type_Key" AS role
      FROM "Organisation_Role" ro
      JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = ro."Organisation_Type_ID"
     WHERE ro."Is_Active"
  )

  -- ── 1. The check ──────────────────────────────────────────────────
  SELECT 1::numeric AS step,
         '1 adopters with no role for the utility they adopt' AS item,
         CASE WHEN count(*) = 0
              THEN 'none — every resolved adopter holds a role for its own '
                   || 'utility, which the IDNO map had no way to arrange'
              ELSE 'STOPS IT — ' || sum(c.n)::text || ' connections: '
                   || string_agg(c.util || ' -> ' || c.nm || ' (holds '
                        || c.roles || ', via ' || c.src || ')', '; ')
         END AS detail
    FROM (
      SELECT r.util, o."Name" AS nm, r.adopter_source AS src, count(*) AS n,
             /* Aggregated in its own scalar subquery over a grouping
                column, not over o."Organisation_ID" — a correlated
                subquery naming a column that is not in the GROUP BY is
                "ungrouped column from outer query", however obviously
                functionally dependent it looks. */
             COALESCE((SELECT string_agg(DISTINCT h.role, ', ') FROM holds h
                        WHERE h.oid = min(o."Organisation_ID")),
                      'no roles at all') AS roles
        FROM res r
        JOIN "Organisation" o ON o."Organisation_ID" = r.adopter_organisation_id
       WHERE r.adopter_organisation_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM holds h
                          WHERE h.oid = o."Organisation_ID"
                            AND h.role = ANY (r.needs))
       GROUP BY r.util, o."Name", r.adopter_source) c

  -- ── 2. Where each utility's adopter came from ─────────────────────
  UNION ALL
  SELECT 2, '2 ' || r.util || ' — source', 
         string_agg(r.adopter_source || ': ' || r.n, ', ' ORDER BY r.adopter_source)
    FROM (SELECT util, adopter_source, count(*)::text AS n
            FROM res GROUP BY util, adopter_source) r
   GROUP BY r.util

  -- ── 3. How far the text disagreed with the contract ───────────────
  --
  -- The evidence for reading the contract rather than the text, kept
  -- here rather than in a commit message: these are connections where
  -- BOTH spoke and they named different companies.
  UNION ALL
  SELECT 3, '3 text contradicted the contract', 
         (SELECT count(*) FROM res r
            JOIN "Organisation" o ON o."Organisation_ID" = r.adopter_organisation_id
           WHERE r.adopter_source = 'contract IDNO'
             AND COALESCE(btrim(r."Adopter"), '') <> ''
             AND upper(btrim(r."Adopter")) <> upper(btrim(o."Name"))
             AND NOT EXISTS (
               SELECT 1 FROM "Legacy_Lookup_Map" m
                WHERE m."Kind" LIKE 'adopter%'
                  AND upper(btrim(m."Legacy_ID")) = upper(btrim(r."Adopter"))
                  AND m."New_ID" = r.adopter_organisation_id))::text
         || ' connections name one company in the text and another on '
         || 'the contract. The contract won.'

  -- ── 4. The work list: contracts naming nobody ─────────────────────
  UNION ALL
  SELECT 4, '4 no adopter from either source', 
         (SELECT count(*) FROM res WHERE adopter_source = 'neither')::text
         || ' connections across '
         || (SELECT count(DISTINCT pr."Project_ID") FROM res r
               JOIN "Plot" pl ON pl."Plot_ID" = r.new_plot_id
               JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
              WHERE r.adopter_source = 'neither')::text
         || ' projects — the contract names no IDNO for that utility and '
         || 'the connection names nobody either'

  UNION ALL
  SELECT 4.1, '4.2 worst of them', 
         COALESCE((SELECT string_agg(w.ref || ' (' || w.n || ')', ', ' ORDER BY w.n DESC)
            FROM (SELECT COALESCE(pr."AP_Number", pr."Project_Ref", '?') AS ref,
                         count(*) AS n
                    FROM res r
                    JOIN "Plot" pl ON pl."Plot_ID" = r.new_plot_id
                    JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
                   WHERE r.adopter_source = 'neither'
                   GROUP BY 1 ORDER BY count(*) DESC LIMIT 10) w), 'none')

  -- ── 5. The map, readable ──────────────────────────────────────────
  UNION ALL
  SELECT 5, '5 IDNO ' || m."Legacy_ID" || ' -> ' || o."Name",
         COALESCE((SELECT string_agg(DISTINCT h.role, ', ') FROM holds h
                    WHERE h.oid = m."New_ID"), 'NO ROLES — it will '
                  || 'fail row 1 the moment it is used')
    FROM "Legacy_Lookup_Map" m
    JOIN "Organisation" o ON o."Organisation_ID" = m."New_ID"
   WHERE m."Kind" = 'idno'

  ) z ORDER BY step, item;
