-- ════════════════════════════════════════════════════════════════════
--  Before importing the asset values — one paste, one table back
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing.
--
-- ── What I already know, so this does not ask ──
--
-- `AV_Agreement` pre-dates the migration baseline, so I read the
-- migrations that touch it rather than guessing. Three things came out
-- of that, and all three change the import:
--
--  * The value column here is `AV_Value`, not `Asset_Value`.
--    `Asset_Value` is real but belongs to AV_Quotation — the competing
--    quotes, not the signed agreement. The export happens to use the
--    quotation's name for the agreement's value, so copying the column
--    name across would have put the money nowhere.
--
--  * `Utility_ID` is NOT NULL and is set by trigger from
--    `AV_Agreement_Type_ID` (0067). So the import carries the agreement
--    type and does not write the utility at all — writing it myself
--    would only be a second chance to disagree with the type.
--
--  * The type ids are not shared. 0024 seeded four legal instruments
--    under ids 1-4; 0062 then added Electric, Gas, Water, Water NAV
--    Clean, Water NAV Waste by name. So legacy type 2 "Electric" is
--    almost certainly not type 2 here. Section 5 asks for the names.
--
-- ── What the export looks like ──
--
-- 6,205 agreements across 1,668 contracts. Every one names a contract;
-- none names a tender, so nothing is waiting on the tender import.
-- No (contract, type) pair appears twice, so the unique index 0067
-- added — one agreement per type per project — is not violated by the
-- export's own shape. Whether it collides with rows already here is
-- section 4.
--
-- `Date_Agreed` is empty on all 6,205 rows. 2,518 have no value and
-- 324 name no operator; those come in as they are rather than being
-- held back, because an agreement with no value agreed yet is a real
-- state, not a broken row.
--
-- ── The operators ──
--
-- The asset values name 25 IDNOs. The map 0258 built covers 19 of
-- them, and it was built from the register and checked against the
-- role model, so those inherit a mapping that has already been proven.
-- Six are new to this import — section 8 asks whether the register
-- already holds them, before I propose creating anything.
--
-- "STOPS IT" means fix before importing. Everything else is a fact.

SELECT item AS "What", detail AS "Detail"
  FROM (

  -- ── 1. Every column ───────────────────────────────────────────────
  --
  -- Settles AV_Value, and settles the one thing that could stop this
  -- outright: whether the legacy `IDNO_ID` is NOT NULL. The user's rule
  -- is that operators are organisations with a role now, so this import
  -- writes `IDNO_Organisation_ID` and leaves `IDNO_ID` alone — the same
  -- decision as the connections import. If `IDNO_ID` is NOT NULL that
  -- is not possible and STOPS IT.
  SELECT 1::numeric AS step, '1 ' || c.column_name AS item,
         c.data_type
           || CASE WHEN c.is_nullable = 'NO' THEN '  NOT NULL' ELSE '' END
           || COALESCE('  default ' || c.column_default, '') AS detail
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'AV_Agreement'

  -- ── 2. Foreign keys. The class I forgot last time ─────────────────
  --
  -- Part B of the connections import failed on Plot_Utility's
  -- IDNO_ID_fkey because my pre-flight tested for unique, primary and
  -- check constraints and never for foreign ones. Asked for by name
  -- this time.
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
       WHERE c.conrelid = '"AV_Agreement"'::regclass AND c.contype = 'f'
    ) f

  -- ── 3. Unique constraints, bare indexes, checks, triggers ─────────
  --
  -- Indexes separately from constraints, because the plot import found
  -- plot_number_per_developer — an index with no constraint behind it —
  -- by failing on it.
  UNION ALL
  SELECT 3, '3 unique constraints and indexes',
         COALESCE(string_agg(d, '  |  '), 'none')
    FROM (
      SELECT pg_get_constraintdef(c.oid) AS d
        FROM pg_constraint c
       WHERE c.conrelid = '"AV_Agreement"'::regclass AND c.contype IN ('u', 'p')
      UNION ALL
      SELECT pg_get_indexdef(i.oid)
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
       WHERE x.indrelid = '"AV_Agreement"'::regclass AND x.indisunique
         AND NOT EXISTS (SELECT 1 FROM pg_constraint c2
                          WHERE c2.conindid = x.indexrelid)) u

  UNION ALL
  SELECT 3.1, '3.1 check constraints',
         COALESCE(string_agg(pg_get_constraintdef(oid), '  |  '), 'none')
    FROM pg_constraint
   WHERE conrelid = '"AV_Agreement"'::regclass AND contype = 'c'

  UNION ALL
  SELECT 3.2, '3.2 triggers',
         COALESCE(string_agg(tgname, ', '), 'none')
    FROM pg_trigger
   WHERE tgrelid = '"AV_Agreement"'::regclass AND NOT tgisinternal

  -- The bodies, because 0067's trigger is the thing setting Utility_ID
  -- and I want to see it as it actually stands rather than as the
  -- migration left it.
  UNION ALL
  SELECT 3.3, '3.3 what those triggers do',
         COALESCE((SELECT string_agg(p.proname || ': '
                     || replace(replace(p.prosrc, E'\n', ' '), '  ', ' '),
                     '  |  ')
                     FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                    WHERE t.tgrelid = '"AV_Agreement"'::regclass
                      AND NOT t.tgisinternal), 'none')

  -- ── 4. What is already here, and would it collide ─────────────────
  --
  -- The unique index allows one agreement per type per project. If a
  -- project already carries an agreement of a type the export also has
  -- for it, the import fails on that row. This counts what is here and
  -- how many of those projects came from a legacy contract — a row on a
  -- project with no Legacy_Contract_ID cannot collide with the export,
  -- because the export is matched by contract.
  UNION ALL
  SELECT 4, '4 agreements already here',
         count(*)::text || ' rows, on '
         || count(DISTINCT a."Project_ID")::text || ' projects, of which '
         || count(DISTINCT a."Project_ID") FILTER (
              WHERE p."Legacy_Contract_ID" IS NOT NULL)::text
         || ' came from a legacy contract. Those are the only ones the '
         || 'export can collide with.'
    FROM "AV_Agreement" a
    LEFT JOIN "Project" p ON p."Project_ID" = a."Project_ID"

  -- ── 5. The agreement types here, by name ──────────────────────────
  --
  -- Matched by name, never by id — the two systems reuse id numbers for
  -- different things, which is how the plot import put connections on
  -- the wrong utility the first time round.
  --
  -- The export's types are Gas, Electric, Water NAV Clean, Water NAV
  -- Waste, Water, and "NA - Self Lay Provider". The last has no utility
  -- and one single agreement; with Utility_ID NOT NULL and the trigger
  -- deriving it from the type, that row has nowhere to put a utility.
  -- One row, so I intend to leave it out and name it rather than invent
  -- a utility for it.
  UNION ALL
  SELECT 5, '5 AV_Agreement_Type here',
         CASE WHEN to_regclass('"AV_Agreement_Type"') IS NULL
              THEN 'STOPS IT: no such table'
              ELSE COALESCE((xpath('/row/c/text()', query_to_xml(
                     'SELECT string_agg("AV_Agreement_Type_ID" || '' = '' '
                     || '|| "AV_Agreement_Type" '
                     || '|| '' (utility '' || COALESCE("Utility_ID"::text, ''none'') || '')'', '
                     || ''', '' ORDER BY "AV_Agreement_Type_ID") AS c '
                     || 'FROM "AV_Agreement_Type"', false, true, '')))[1]::text,
                   'STOPS IT: the table is empty')
         END

  -- ── 6. The IDNO map 0258 built, which this import reuses ──────────
  UNION ALL
  SELECT 6, '6 IDNO map already in place',
         count(*)::text || ' IDNOs point at an organisation. 19 of the 25 '
         || 'the asset values name are among them, so most of this import '
         || 'inherits a map already checked against the role model.'
    FROM "Legacy_Lookup_Map" WHERE "Kind" = 'idno' AND "New_ID" IS NOT NULL

  -- ── 7. Projects reachable by contract ─────────────────────────────
  UNION ALL
  SELECT 7, '7 projects carrying a legacy contract id',
         count(*) FILTER (WHERE "Legacy_Contract_ID" IS NOT NULL)::text
         || ' of ' || count(*)::text || ' projects. The export names '
         || '1,668 contracts; how many of those land is reported by the '
         || 'import itself, once the rows are staged.'
    FROM "Project"

  -- ── 8. The six operators 0258 never had to map ────────────────────
  --
  -- The connections named 21 IDNOs. The asset values name six more.
  -- Asked by name against the register, exactly and loosely, so that a
  -- company that is already there under a slightly different legal name
  -- is found rather than created a second time.
  UNION ALL
  SELECT 8 + v.ord / 100.0,
         '8 IDNO ' || v.id || ' ' || v.nm || ' (' || v.n || ')',
         COALESCE(
           (SELECT 'exact: ' || string_agg(o."Name", ', ')
              FROM "Organisation" o
             WHERE upper(btrim(o."Name")) = upper(v.nm)),
           (SELECT 'close: ' || string_agg(o."Name", ', ')
              FROM "Organisation" o
             WHERE o."Name" ILIKE '%' || v.stem || '%'),
           'nothing in the register matches')
    FROM (VALUES
      (1, '14', 'Hartlepool Water',      'Hartlepool',    '143 agreements'),
      (2, '35', 'National Grid',         'National Grid', '33 agreements'),
      (3, '26', 'Scottish and Southern', 'Scottish',      '3 agreements'),
      (4, '29', 'Indigo Networks',       'Indigo',        '2 agreements'),
      (5, '17', 'Fulcrum',               'Fulcrum',       '1 agreement'),
      (6, '39', 'Flo Gas',               'Flo',           '1 agreement')
    ) AS v(ord, id, nm, stem, n)

  ) z ORDER BY step, item;
