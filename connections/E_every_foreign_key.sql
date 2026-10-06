-- ════════════════════════════════════════════════════════════════════
--  Every foreign key on Plot_Utility, and what the import would
--  send through each one
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing. One result set.
--
-- ── Why this exists ──
--
-- Part B failed on Plot_Utility_IDNO_ID_fkey: IDNO_ID points at a table
-- called IDNO, and the import was writing an Organisation_ID into it.
-- My pre-flight asked the catalogue about NOT NULL columns, unique
-- constraints, check constraints and triggers, and never once asked
-- about foreign keys. The plot import failed three times the same way —
-- each failure a different kind of constraint I had not thought to
-- look for.
--
-- So this asks about all of them at once, and goes further: for every
-- foreign key on the table, it counts how many of the values the import
-- would actually send through it do not exist in the target. That turns
-- "which constraints are there" into "which ones would reject this
-- data", which is the question that matters.
--
-- I already expect a second failure behind the first one: 0066 adds
-- Team_ID REFERENCES "Team" and says of that table "deliberately
-- unseeded — the teams are yours to name". The import writes the old
-- system's raw Team_ID. Section 3 will say how many of those exist.
--
-- Sections 4 and 5 dump the two small lookups whole, so the mapping can
-- be built from what is actually in them rather than from my guess at
-- what they hold.

SELECT section AS "#", item AS "Item", detail AS "Detail"
  FROM (

  -- ── 1. The full column list, which I have never actually seen ──────
  --
  -- Everything I knew about this table came from the column list the
  -- import writes. If there is already a column meant for an
  -- organisation — 0062, 0070 and 0120 all add one alongside a legacy
  -- IDNO_ID and say plainly that new work should read it — then the
  -- adopter belongs there and not in IDNO_ID at all.
  SELECT 1::numeric AS section,
         '1 ' || c.column_name AS item,
         c.data_type
           || CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
           || COALESCE(' default ' || c.column_default, '') AS detail
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'Plot_Utility'

  -- ── 2. Every foreign key, with where it points ────────────────────
  UNION ALL
  SELECT 2, '2 ' || f.col || ' -> ' || f.target || '.' || f.target_col,
         f.conname
    FROM (
      SELECT c.conname::text AS conname, a.attname::text AS col,
             cl.relname::text AS target, ta.attname::text AS target_col
        FROM pg_constraint c
        JOIN unnest(c.conkey)  WITH ORDINALITY AS k(attnum, ord)  ON true
        JOIN unnest(c.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
        JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = k.attnum
        JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = fk.attnum
        JOIN pg_class cl ON cl.oid = c.confrelid
       WHERE c.conrelid = '"Plot_Utility"'::regclass AND c.contype = 'f'
    ) f

  -- ── 3. What the import would send through each one ────────────────
  --
  -- Built from the catalogue, so a key I have not thought about is
  -- still checked. The expression for each column is the one the import
  -- actually uses, which is the point: counting the staged values would
  -- miss that IDNO_ID is fed an Organisation_ID rather than a raw id.
  UNION ALL
  SELECT 3, '3 ' || f.col || ' -> ' || f.target,
         (xpath('/row/c/text()', query_to_xml(
            format('SELECT count(DISTINCT t.v) AS c FROM (%s) t '
                || 'WHERE t.v IS NOT NULL AND NOT EXISTS '
                || '(SELECT 1 FROM %I x WHERE x.%I = t.v)',
                e.expr, f.target, f.target_col),
            false, true, '')))[1]::text
         || ' of '
         || (xpath('/row/c/text()', query_to_xml(
              format('SELECT count(DISTINCT t.v) AS c FROM (%s) t '
                  || 'WHERE t.v IS NOT NULL', e.expr),
              false, true, '')))[1]::text
         || ' distinct value(s) are NOT in ' || f.target
         || '. Examples: '
         || COALESCE((xpath('/row/c/text()', query_to_xml(
              format('SELECT string_agg(s.v::text, '', '') AS c FROM '
                  || '(SELECT DISTINCT t.v FROM (%s) t WHERE t.v IS NOT NULL '
                  || 'AND NOT EXISTS (SELECT 1 FROM %I x WHERE x.%I = t.v) '
                  || 'ORDER BY t.v LIMIT 8) s',
                  e.expr, f.target, f.target_col),
              false, true, '')))[1]::text, 'none')
    FROM (
      SELECT c.conname::text AS conname, a.attname::text AS col,
             cl.relname::text AS target, ta.attname::text AS target_col
        FROM pg_constraint c
        JOIN unnest(c.conkey)  WITH ORDINALITY AS k(attnum, ord)  ON true
        JOIN unnest(c.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
        JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = k.attnum
        JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = fk.attnum
        JOIN pg_class cl ON cl.oid = c.confrelid
       WHERE c.conrelid = '"Plot_Utility"'::regclass AND c.contype = 'f'
    ) f
    JOIN (VALUES
      ('Plot_ID', $q$SELECT r.new_plot_id AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$),
      ('Utility_ID', $q$SELECT COALESCE((SELECT m."New_ID" FROM "Legacy_Lookup_Map" m WHERE m."Kind" = 'utility' AND m."Legacy_ID" = btrim(r."Utility_ID")), NULLIF(btrim(r."Utility_ID"), '')::bigint) AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$),
      ('Pack_Status_ID', $q$SELECT r.pack_status_id AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$),
      ('Visit_Outcome_ID', $q$SELECT r.visit_outcome_id AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$),
      ('IDNO_ID', $q$SELECT r.adopter_organisation_id AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$),
      ('Team_ID', $q$SELECT NULLIF(btrim(r."Team_ID"), '')::bigint AS v FROM "Legacy_Connection_Resolved" r WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1$q$)
    ) AS e(col, expr) ON e.col = f.col

  -- ── 3.1 Any key the import writes to that section 3 could not check ─
  UNION ALL
  SELECT 3.1, '3.1 keys with no expression here',
         COALESCE(string_agg(f.col, ', '),
                  'none - every foreign key was checked above')
    FROM (
      SELECT a.attname::text AS col
        FROM pg_constraint c
        JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       WHERE c.conrelid = '"Plot_Utility"'::regclass AND c.contype = 'f'
    ) f
   WHERE f.col NOT IN ('Plot_ID', 'Utility_ID', 'Pack_Status_ID',
                       'Visit_Outcome_ID', 'IDNO_ID', 'Team_ID')

  -- ── 4. The IDNO list, whole ───────────────────────────────────────
  --
  -- 0069 says an IDNO row carries IDNO_Name and an Organisation_ID, and
  -- 0047 backfilled that link. If the adopter has to go in IDNO_ID then
  -- the route is organisation -> IDNO row, and only the adopters with an
  -- IDNO row can go there at all - which would leave the water
  -- undertakers and the gas transporters nowhere to go.
  UNION ALL
  SELECT 4, '4 IDNO ' || COALESCE(x.nm, '(no name column read)'),
         'IDNO_ID ' || x.id::text || ', Organisation_ID '
         || COALESCE(x.org::text, 'NULL - not linked')
         || COALESCE(' = ' || o."Name", '')
    FROM (
      SELECT i."IDNO_ID" AS id, i."IDNO_Name" AS nm, i."Organisation_ID" AS org
        FROM "IDNO" i
    ) x
    LEFT JOIN "Organisation" o ON o."Organisation_ID" = x.org

  -- ── 5. The teams, whole ───────────────────────────────────────────
  UNION ALL
  SELECT 5, '5 Team', (SELECT count(*)::text FROM "Team") || ' row(s): '
         || COALESCE((SELECT string_agg(t."Team_ID"::text || ' ' || t."Team_Name",
                                        ', ' ORDER BY t."Team_ID")
                        FROM "Team" t), 'none - 0066 left it unseeded')

  ) z ORDER BY section, item;
