-- ════════════════════════════════════════════════════════════════
-- 0195 — a style scope includes the supply type
--
-- 0194 added Supply_Type to GIS_Style, added the black triangle rule
-- for non-residential supplies, and reported success. The column
-- arrived. The rule did not.
--
-- ── Why the insert did nothing ──
--
-- 0051 defines what makes a style scope unique:
--
--   CREATE UNIQUE INDEX gis_style_scope_uniq ON "GIS_Style" (
--     COALESCE("Layer_Key", ''), COALESCE("Line_Type", ''),
--     COALESCE("Feature_Role", ''), COALESCE("Utility_ID", -1),
--     COALESCE("Organisation_ID", -1));
--
-- The triangle rule is Feature_Role 'meter' with everything else null,
-- which under that index is the SAME SCOPE as the plain 'Meter' rule
-- seeded in 0051. So the insert collided, and 0194 wrote it with
-- ON CONFLICT DO NOTHING — which is exactly what it says it will do.
--
-- 0194 added a new dimension to how a style is matched and did not add
-- it to how a scope is identified. Every rule scoped by supply type is
-- therefore unwritable while the general rule it is meant to beat
-- exists, which is every rule this feature needs.
--
-- ── The shape of it ──
--
-- Recurring fault 22, and the clearest instance of it yet: a feature
-- that shipped, ran, and stayed politely inert. The placement is
-- correct, the attributes are correct, resolveStyle matches on
-- Supply_Type correctly and ranks it above Feature_Role correctly.
-- Three supplies have been placed on live drawings and drawn as plain
-- meters, and nothing anywhere reported a fault, because nothing was
-- faulty except a row that was never there.
--
-- ON CONFLICT DO NOTHING is the tolerant fallback in question. It is
-- there so a migration can be re-run, and it also swallows a scope
-- collision that means the seed can never succeed. Same catch, two
-- jobs, one of them hiding a permanent failure.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** It should return one row — the plain Meter rule
-- — and no triangle. If it already returns two, 0194's insert somehow
-- landed and this migration has nothing to do but widen the index:
--
--   SELECT "GIS_Style_ID","Style_Name","Feature_Role","Supply_Type",
--          "Symbol","Sort_Order"
--     FROM "GIS_Style" WHERE "Feature_Role" = 'meter'
--    ORDER BY "Sort_Order";

BEGIN;

-- Supply_Type joins the scope, COALESCEd like the rest of them: NULL
-- never equals NULL, so a plain unique index would let the same scope
-- be seeded twice, which is the trap 0031 had to clean up after and the
-- reason the index is written this way at all.
--
-- Existing rows all have Supply_Type null and so COALESCE to '', which
-- is the value they compared as before. No existing pair of rows can
-- collide that did not collide already, so this widens the index and
-- cannot fail on data.
DROP INDEX IF EXISTS gis_style_scope_uniq;

CREATE UNIQUE INDEX gis_style_scope_uniq ON "GIS_Style" (
  COALESCE("Layer_Key", ''),
  COALESCE("Line_Type", ''),
  COALESCE("Feature_Role", ''),
  COALESCE("Supply_Type", ''),
  COALESCE("Utility_ID", -1),
  COALESCE("Organisation_ID", -1)
);

-- And now the rule 0194 meant to write.
--
-- A black triangle, against the plot seed's house. Filled rather than
-- outlined: triangle is not in STROKE_ONLY, and a solid mark reads at
-- site scale where an outline closes up. Larger than the meter's 8 px
-- because these are the supplies somebody is looking for.
--
-- Sort_Order 205 puts it after the plain meter rule at 200, and
-- resolveStyle ranks Supply_Type above Feature_Role anyway, so it wins
-- on specificity rather than on order.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Supply_Type","Symbol","Symbol_Size_Px","Colour","Sort_Order")
VALUES
  ('Non-residential supply', 'meter', 'nrs', 'triangle', 10, '#000000', 205)
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Check ───────────────────────────────────────────────────────
--
-- ** This is the point of the migration. Run it. ** Two rows, and the
-- second one is the triangle. If it returns one row, the insert was
-- swallowed again and the index is still wrong — do not shrug at this
-- the way 0194's success message invited:
--
--   SELECT "Style_Name","Feature_Role","Supply_Type","Symbol",
--          "Symbol_Size_Px","Colour","Sort_Order"
--     FROM "GIS_Style" WHERE "Feature_Role" = 'meter'
--    ORDER BY "Sort_Order";
--
-- The index should now name six expressions, including Supply_Type:
--
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'gis_style_scope_uniq';
--
-- ── Afterwards ──
--
-- Nothing needs replacing on any drawing. Every non-residential supply
-- already placed carries Supply_Type 'nrs' and starts drawing as a
-- triangle on the next reload — the feature was right, the style row
-- was missing. These are the ones that will change:
--
--   SELECT "Project_ID", count(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'meter'
--      AND "Attributes" ->> 'Supply_Type' = 'nrs'
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- ── Still to do ──
--
-- The GIS Styles admin screen cannot see Supply_Type: the explicit
-- column list in netlify/functions/gis-styles.js was not updated by
-- 0194 either, so the screen shows this row as a second identical Meter
-- rule and cannot scope a new rule by supply type. Recurring fault 4,
-- same migration, and a separate fix.
-- ════════════════════════════════════════════════════════════════
