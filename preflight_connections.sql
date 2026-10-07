-- ════════════════════════════════════════════════════════════════════
--  Before importing the connections — one paste, one table back
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing.
--
-- ── Why this is longer than the last one ──
--
-- The plot import failed three times in twenty minutes, and every one
-- was something the repository does not contain: two triggers, a NOT
-- NULL column, and a unique index. Each time I patched the one that had
-- just broken and ran again. The pre-flight I had written asked about
-- NOT NULL columns and triggers and never looked at a unique constraint
-- at all.
--
-- So this one asks the catalogue about EVERYTHING on Plot_Utility
-- before anything is written: what is NOT NULL, what is unique, what
-- fires on insert, and what the old data would do to each.
--
-- "STOPS IT" means fix before running. Everything else is a fact.

SELECT step AS "#", item AS "What", verdict AS "State", detail AS "Detail"
  FROM (

  -- ── What is staged, and how much can land ─────────────────────────
  SELECT 1::numeric AS step, 'Connections staged' AS item,
         CASE WHEN count(*) > 0 THEN 'ok' ELSE 'STOPS IT' END AS verdict,
         count(*)::text || ' rows' AS detail
    FROM "Legacy_Connection_Import"

  UNION ALL
  SELECT 1.1, 'Whose plot is already imported', 'these land',
         count(*)::text || ' connections'
    FROM "Legacy_Connection_Resolved" WHERE new_plot_id IS NOT NULL

  UNION ALL
  SELECT 1.2, 'Waiting on their plot', 'these wait',
         count(*)::text || ' - their plot belongs to a tender, or was one '
           || 'of the 14 that could not be imported'
    FROM "Legacy_Connection_Resolved" WHERE new_plot_id IS NULL

  UNION ALL
  SELECT 1.3, 'Already imported', 'skipped on a re-run',
         count(*)::text || ' Plot_Utility rows carry a Legacy_Plot_Utility_ID'
    FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL

  -- ── Everything the catalogue knows about the target table ─────────
  UNION ALL
  SELECT 2, 'Columns the import does not fill',
         CASE WHEN count(*) = 0 THEN 'ok'
              ELSE 'STOPS IT - every row would fail' END,
         CASE WHEN count(*) = 0
              THEN 'nothing on Plot_Utility is NOT NULL beyond what the '
                   || 'import writes'
              ELSE 'NOT NULL with no default: ' || string_agg(column_name, ', ')
         END
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Plot_Utility'
     AND is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO'
     AND column_name NOT IN (
       'Plot_ID', 'Utility_ID', 'Programmed_Date', 'Connection_Date',
       'As_Laid_Date', 'Meter_Number', 'Service_Card_Submission_Date',
       'Meter_Card_Submission_Date', 'Pack_Status_ID', 'Visit_Outcome',
       'Visit_Outcome_ID', 'IDNO_ID', 'AV_Value', 'Self_Lay_Provider',
       'Dead_Jointed_Date', 'Team_ID', 'Planned_Jointing_Date',
       'Actual_Jointing_Date', 'Legacy_Plot_Utility_ID')

  UNION ALL
  -- ── The check the plot pre-flight did not have ──
  --
  -- plot_number_per_developer was a unique index no migration mentions,
  -- and the import found it by failing. Every unique constraint and
  -- index on this table, listed before anything is written.
  SELECT 2.1, 'Unique constraints and indexes', 'read these',
         COALESCE(string_agg(d, '  |  '), 'none')
    FROM (
      SELECT pg_get_constraintdef(c.oid) AS d
        FROM pg_constraint c
       WHERE c.conrelid = '"Plot_Utility"'::regclass AND c.contype IN ('u', 'p')
      UNION ALL
      SELECT pg_get_indexdef(i.oid)
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
       WHERE x.indrelid = '"Plot_Utility"'::regclass AND x.indisunique
         AND NOT EXISTS (SELECT 1 FROM pg_constraint c2
                          WHERE c2.conindid = x.indexrelid)) u

  UNION ALL
  SELECT 2.2, 'Check constraints', 'read these',
         COALESCE(string_agg(pg_get_constraintdef(oid), '  |  '), 'none')
    FROM pg_constraint
   WHERE conrelid = '"Plot_Utility"'::regclass AND contype = 'c'

  UNION ALL
  SELECT 2.3, 'Triggers that fire on every row',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'know about these' END,
         CASE WHEN count(*) = 0 THEN 'none'
              ELSE string_agg(tgname || ' (' ||
                     CASE WHEN tgtype & 4 > 0 THEN 'INSERT' ELSE 'other' END
                     || ')', ', ') END
    FROM pg_trigger
   WHERE tgrelid = '"Plot_Utility"'::regclass AND NOT tgisinternal

  UNION ALL
  -- One connection per plot per utility is the obvious shape for a
  -- unique index here, and the old data may well break it.
  SELECT 2.4, 'Plot and utility pairs that repeat in the old data',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'see 2.1 - may matter' END,
         COALESCE(sum(n - 1), 0)::text || ' extra row(s) across '
           || count(*)::text || ' repeated (plot, utility) pair(s)'
    FROM (SELECT count(*) AS n
            FROM "Legacy_Connection_Resolved" r
           WHERE r.new_plot_id IS NOT NULL
           GROUP BY r.new_plot_id, btrim(r."Utility_ID")
          HAVING count(*) > 1) d

  -- ── The utility, which is an id and therefore a trap ──────────────
  --
  -- Every other lookup this import uses is matched on the WORD:
  -- Pack_Status, Visit_Outcome and the adopter organisation are all
  -- resolved by name in Legacy_Connection_Resolved, so they cannot
  -- silently point at the wrong thing.
  --
  -- The utility is not. The insert reads Legacy_Lookup_Map for
  -- Kind = 'utility' and, finding nothing, FALLS BACK TO THE OLD ID:
  --
  --     COALESCE((SELECT "New_ID" ... 'utility'), "Utility_ID"::bigint)
  --
  -- The property configs showed what that costs - old 1 was 1BD where
  -- new 1 was 3BS. If the two Utility tables disagree, every connection
  -- lands on the wrong utility and every count still adds up.
  UNION ALL
  SELECT 3, 'Utilities mapped',
         CASE WHEN count(*) = 0 THEN 'STOPS IT - nothing mapped'
              ELSE 'ok' END,
         count(*)::text || ' row(s) in Legacy_Lookup_Map under '
           || 'Kind = ''utility''. With none, the import uses the OLD id '
           || 'unchanged, which is only right if the two tables agree.'
    FROM "Legacy_Lookup_Map" WHERE "Kind" = 'utility'

  UNION ALL
  SELECT 3.1, 'What the old ids would become unmapped', 'check this',
         COALESCE((SELECT string_agg(x.t, ', ' ORDER BY x.t) FROM (
           SELECT DISTINCT btrim(c."Utility_ID") || ' -> '
                  || COALESCE((SELECT u."Utility" FROM "Utility" u
                                WHERE u."Utility_ID" = NULLIF(btrim(c."Utility_ID"), '')::bigint),
                              'NO SUCH UTILITY') AS t
             FROM "Legacy_Connection_Import" c
            WHERE COALESCE(btrim(c."Utility_ID"), '') <> '') x), 'none')

  -- ── The three name-matched lookups ────────────────────────────────
  UNION ALL
  SELECT 4, 'Pack statuses that match a name', 'for scale',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE pack_status_id IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Legacy_Connection_Import"
              WHERE COALESCE(btrim("Status_Of_Pack"), '') <> '')::text
         || ' that have one'

  UNION ALL
  SELECT 4.1, 'Visit outcomes that match a name', 'for scale',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE visit_outcome_id IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Legacy_Connection_Import"
              WHERE COALESCE(btrim("Visit_Outcome"), '') <> '')::text
         || ' that have one. The word is kept either way.'

  UNION ALL
  SELECT 4.2, 'Adopters that match an organisation', 'for scale',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE adopter_organisation_id IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Legacy_Connection_Import"
              WHERE COALESCE(btrim("Adopter"), '') <> '')::text
         || ' that name one'

  UNION ALL
  SELECT 4.3, 'Adopter names that match nothing', 'look at these',
         COALESCE((SELECT string_agg(y.nm, ', ' ORDER BY y.nm) FROM (
           SELECT DISTINCT btrim(r."Adopter") AS nm
             FROM "Legacy_Connection_Resolved" r
            WHERE COALESCE(btrim(r."Adopter"), '') <> ''
              AND r.adopter_organisation_id IS NULL
            LIMIT 20) y), 'none - every adopter resolved')

  ) z ORDER BY step;
