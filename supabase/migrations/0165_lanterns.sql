-- ════════════════════════════════════════════════════════════════
-- 0165 — lanterns
--
-- A street lighting design is columns and lanterns. The column is
-- already a role; the lantern is not, and this adds it.
--
-- ── Two objects, not one ──
--
-- A column carries a lantern, and they are bought, installed and
-- replaced separately — a lantern is changed on a column that stays
-- where it is. So they are two features and two rows on the bill,
-- rather than a column with a lantern written on it.
--
-- ── The lantern holds the association ──
--
-- Attributes.Column_Feature_ID, on the lantern, pointing at its column.
-- That way round because it is the way the rule reads: a lantern must
-- have a column, a column need not have a lantern. One column can carry
-- two — a twin head is ordinary — and nothing about the column has to
-- change when it does.
--
-- ── Deliberately not Connects ──
--
-- Connects is the network graph: what the trace walks and what circuits
-- are measured along. A lantern sitting on a column is not an
-- electrical junction, and putting it there would send the circuit
-- trace up the column and back down again.
--
-- The lantern sits on top of the column. It is not connected to it, and
-- the data says the same thing.
--
-- ── The geometry is the column's ──
--
-- A lantern is written at the column's own point, not beside it. There
-- is one thing on the ground and it has one position; two positions
-- would be two answers to where the light is, and the drawing would
-- show a lantern drifting off its column the moment either was moved.
--
-- Nothing enforces that here. A jsonb attribute cannot be a foreign
-- key, and a trigger to keep two geometries equal would be a rule
-- living in the database that the canvas already keeps — it writes the
-- column's point and moves both together. The check queries below are
-- how a drift would be found.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','lantern'));


-- The symbol. A diamond rather than the column's circle, and smaller:
-- the two are drawn at the same point, so a lantern hidden under its
-- own column would look like nothing was placed.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Lantern', 'lantern', 'diamond', 4, '#f59e0b', 205,
   'Street lighting lantern. Sits on a column; Attributes.Column_Feature_ID says which.')
ON CONFLICT DO NOTHING;


-- ── Check ───────────────────────────────────────────────────────
--
-- What has been placed, by role:
--
--   SELECT "Feature_Role", COUNT(*) FROM "GIS_Feature"
--    WHERE "Project_ID" = <project id> AND "Feature_Type" = 'point'
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- ** A lantern with no column. ** Should always be none: the canvas
-- places a lantern only onto a column, so a row here means one was
-- written another way or its column has since been deleted:
--
--   SELECT l."Feature_ID", l."Label"
--     FROM "GIS_Feature" l
--     LEFT JOIN "GIS_Feature" c
--       ON c."Feature_ID" = (l."Attributes" ->> 'Column_Feature_ID')::bigint
--      AND c."Feature_Role" = 'column'
--    WHERE l."Feature_Role" = 'lantern'
--      AND (l."Attributes" ->> 'Column_Feature_ID' IS NULL OR c."Feature_ID" IS NULL);
--
-- ** A lantern that has drifted off its column. ** Also should be none.
-- Both are written at the same point and moved together, so anything
-- here is a lantern whose column moved without it:
--
--   SELECT l."Feature_ID", l."Label", l."Geometry", c."Geometry" AS column_at
--     FROM "GIS_Feature" l
--     JOIN "GIS_Feature" c
--       ON c."Feature_ID" = (l."Attributes" ->> 'Column_Feature_ID')::bigint
--    WHERE l."Feature_Role" = 'lantern'
--      AND l."Geometry" IS DISTINCT FROM c."Geometry";
--
-- Columns carrying more than one lantern. Not a fault — a twin head is
-- ordinary — but worth being able to see:
--
--   SELECT l."Attributes" ->> 'Column_Feature_ID' AS column_id, count(*)
--     FROM "GIS_Feature" l
--    WHERE l."Feature_Role" = 'lantern'
--    GROUP BY 1 HAVING count(*) > 1;
