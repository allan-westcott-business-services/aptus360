-- ── The public schema as the database actually holds it ─────────────
--
-- Paste into the Supabase SQL editor and copy the single column of
-- output. Tables with their columns, defaults and constraints; indexes;
-- functions; triggers; RLS and its policies; column comments.
--
-- ── What it is for ──
--
-- `supabase/migrations/` is behind this database and has been for a
-- while: 0198, 0208, 0210, 0221, 0222 and 0238 are absent, and three
-- faults this week came from the folder and the database disagreeing —
-- a CHECK constraint that could not be created, NOT NULL columns the
-- cascade needed to leave null, and a unique index missing two of the
-- columns styles are scoped by. This is how you see what is really
-- there.
--
-- `supabase db dump --schema public` is the better tool where the CLI
-- is available: it is Postgres's own dumper and it knows about grants,
-- sequences owned by other tables, extensions and much else this does
-- not. This exists because it runs in a browser with no tooling at all.
--
-- ── It replays ──
--
-- Verified against Postgres 16: the output runs into an empty database
-- and produces the same tables, constraints, indexes, function,
-- trigger, policies and RLS settings. Serial columns go back as serial
-- rather than as a nextval() naming a sequence that is never created,
-- which is what the round trip caught the first time.
--
-- Not covered, deliberately: data, grants and roles, extensions,
-- schemas other than public, and anything Supabase manages itself
-- (auth, storage). For those, use the CLI.

WITH cols AS (
  SELECT c.relname AS tbl, a.attnum AS ord,
         '  ' || quote_ident(a.attname) || ' '
           /* A column fed by its own sequence goes back as serial, and
              its DEFAULT with it. Written out as nextval('...') the dump
              names a sequence it never creates, and will not replay —
              which is how this was found. */
           || CASE
                WHEN pg_get_serial_sequence(quote_ident(n.nspname) || '.'
                       || quote_ident(c.relname), a.attname) IS NOT NULL
                THEN CASE format_type(a.atttypid, a.atttypmod)
                       WHEN 'bigint' THEN 'bigserial'
                       WHEN 'smallint' THEN 'smallserial'
                       ELSE 'serial' END
                ELSE format_type(a.atttypid, a.atttypmod)
                     || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                     || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
              END AS line
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND a.attnum > 0 AND NOT a.attisdropped
),
cons AS (
  SELECT c.relname AS tbl, con.conname AS name,
         '  CONSTRAINT ' || quote_ident(con.conname) || ' '
           || pg_get_constraintdef(con.oid) AS line
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
),
tbls AS (
  SELECT c.relname AS tbl, c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT ddl FROM (
  SELECT 1 AS sect, t.tbl AS k, 0 AS ord,
         E'\n-- ══ ' || t.tbl || CASE WHEN t.rls THEN '  (RLS ON)' ELSE '' END
         || E' ══\nCREATE TABLE ' || quote_ident(t.tbl) || ' (' AS ddl
    FROM tbls t
  /* The last line inside a CREATE TABLE takes no comma, or the output
     is a schema you cannot run. */
  UNION ALL
  SELECT 1, b.tbl, b.ord,
         b.line || CASE WHEN b.ord = max(b.ord) OVER (PARTITION BY b.tbl)
                        THEN '' ELSE ',' END
    FROM (SELECT tbl, ord, line FROM cols
          UNION ALL SELECT tbl, 9000 + row_number() OVER (PARTITION BY tbl ORDER BY name),
                           line FROM cons) b
  UNION ALL SELECT 1, t.tbl, 9999, E');' FROM tbls t

  UNION ALL
  SELECT 2, i.tablename, 0,
         i.indexdef || ';'
    FROM pg_indexes i
   WHERE i.schemaname = 'public'
     /* Constraint-backed indexes are already written inline above. */
     AND NOT EXISTS (SELECT 1 FROM pg_constraint c2
                      JOIN pg_class ic ON ic.oid = c2.conrelid
                     WHERE c2.conname = i.indexname AND ic.relname = i.tablename)

  UNION ALL
  SELECT 3, p.proname, 0,
         E'\n' || pg_get_functiondef(p.oid) || ';'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'

  UNION ALL
  SELECT 4, c.relname, 0, pg_get_triggerdef(tg.oid) || ';'
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT tg.tgisinternal

  /* Policies without this are policies that do not apply. The header
     above each table says RLS is on; a replay needs the statement. */
  UNION ALL
  SELECT 5, t.tbl, -1,
         'ALTER TABLE ' || quote_ident(t.tbl) || ' ENABLE ROW LEVEL SECURITY;'
    FROM tbls t WHERE t.rls

  UNION ALL
  SELECT 5, pol.tablename, 0,
         'CREATE POLICY ' || quote_ident(pol.policyname) || ' ON '
         || quote_ident(pol.tablename) || ' FOR ' || pol.cmd
         || COALESCE(' USING (' || pol.qual || ')', '')
         || COALESCE(' WITH CHECK (' || pol.with_check || ')', '') || ';'
    FROM pg_policies pol WHERE pol.schemaname = 'public'

  UNION ALL
  SELECT 6, c.relname, a.attnum,
         'COMMENT ON COLUMN ' || quote_ident(c.relname) || '.'
         || quote_ident(a.attname) || ' IS '
         || quote_literal(col_description(c.oid, a.attnum)) || ';'
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND a.attnum > 0
     AND col_description(c.oid, a.attnum) IS NOT NULL
) x
ORDER BY sect, k, ord;
