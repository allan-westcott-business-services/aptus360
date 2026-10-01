-- ── One style per exact scope, and the scope had grown ───────────────
--
-- Reported, creating an off-site variation of an electric main:
--
--   A style already covers that exact combination. Edit that one instead.
--
-- which is the endpoint's translation of a 23505 from
-- `gis_style_scope_uniq`. That index says what makes one style
-- different from another, and it was last written in 0195:
--
--   COALESCE("Layer_Key",''), COALESCE("Line_Type",''),
--   COALESCE("Feature_Role",''), COALESCE("Supply_Type",''),
--   COALESCE("Utility_ID",-1), COALESCE("Organisation_ID",-1)
--
-- **`Site` is not in it, and neither is `Conditions`.** So an electric
-- main's default and its off-site variation have the same key, and the
-- second of them cannot be saved — which is not a rule anybody agreed
-- to. `styleMatches` has scored Site at 16 since 0051 and conditions
-- since 0240; the index simply never caught up.
--
-- ── Why COALESCE, still ──
--
-- NULL never equals NULL, so a plain unique index would let the same
-- scope be written twice — the trap 0031 had to clean up after, and the
-- reason this index is written the way it is.
--
-- `Conditions` is jsonb and joins as jsonb, not as text: jsonb equality
-- ignores the order keys were written in, so {"field","value"} and
-- {"value","field"} are the one condition they plainly are. Compared as
-- text they would be two, and the same rule saved twice would be two
-- rows fighting over one drawing.
--
-- ── If this fails ──
--
-- It can only fail on data that already breaks the NEW rule, which is
-- data the old rule could never have produced: a wider index cannot
-- collide on a pair that did not collide already. If it does, two rows
-- genuinely claim the same scope, and this finds them:
--
--   SELECT COALESCE("Layer_Key",''), COALESCE("Line_Type",''),
--          COALESCE("Feature_Role",''), COALESCE("Site",''),
--          COALESCE("Supply_Type",''), COALESCE("Utility_ID",-1),
--          COALESCE("Organisation_ID",-1), COALESCE("Conditions",'[]'::jsonb),
--          count(*), array_agg("GIS_Style_ID")
--     FROM "GIS_Style" GROUP BY 1,2,3,4,5,6,7,8 HAVING count(*) > 1;

-- What is being replaced, said out loud before it goes. The migrations
-- folder is known to be behind the live database, so the definition
-- this drops may not be the one written above — and a dropped index
-- nobody recorded is a rule nobody can get back.
DO $$
DECLARE d text;
BEGIN
  SELECT indexdef INTO d FROM pg_indexes
   WHERE tablename = 'GIS_Style' AND indexname = 'gis_style_scope_uniq';
  IF d IS NULL THEN
    RAISE NOTICE 'There was no gis_style_scope_uniq to replace.';
  ELSE
    RAISE NOTICE 'Replacing: %', d;
  END IF;
END $$;

DROP INDEX IF EXISTS gis_style_scope_uniq;

CREATE UNIQUE INDEX gis_style_scope_uniq ON "GIS_Style" (
  COALESCE("Layer_Key", ''),
  COALESCE("Line_Type", ''),
  COALESCE("Feature_Role", ''),
  -- On site and off site are two different answers about one feature,
  -- and have been since 0051. The index is the last thing to hear it.
  COALESCE("Site", ''),
  COALESCE("Supply_Type", ''),
  COALESCE("Utility_ID", -1),
  COALESCE("Organisation_ID", -1),
  -- Since 0240 a rule can be narrowed by what the feature carries, and
  -- two rules narrowed differently are two rules.
  COALESCE("Conditions", '[]'::jsonb)
);

COMMENT ON INDEX gis_style_scope_uniq IS
  'One style per exact scope. Every column styleMatches narrows by, so that '
  'two rules the cascade would tell apart can both exist.';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'gis_style_scope_uniq' AND i.indisunique;
  IF n = 0 THEN
    RAISE EXCEPTION 'gis_style_scope_uniq is missing — two styles could now '
      'claim the same scope with nothing to stop them.';
  END IF;
  RAISE NOTICE 'Style scope now includes Site and Conditions. A feature can '
    'carry a default and a variation for each case that differs.';
END $$;
