-- The MSDB is a role the database allows, and has a style row.
--
-- `Feature_Role` is a CHECK constraint listing every role by name, so a
-- new one is refused until it is added here. Placing a board returned
--
--   new row for relation "GIS_Feature" violates check constraint
--   "GIS_Feature_Feature_Role_check"
--
-- which is the database doing exactly what it was told: an unknown role
-- is a typo far more often than it is a new feature, and the constraint
-- has caught real ones.
--
-- ── The list is carried whole ──
--
-- The constraint is dropped and recreated rather than amended, because
-- Postgres has no ADD VALUE for a CHECK. So the whole list is written
-- out, and every role 0201 allowed is still allowed: dropping one here
-- would make every existing feature of that role unwritable, and the
-- rows would stay in place looking fine until somebody edited one.

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb'));

-- ── The symbol ──
--
-- A square with DB in it, drawn by the canvas: the letters are the
-- symbol and no style row can carry them. `Symbol` is 'square' so that
-- anything reading the style table rather than the canvas — a legend, a
-- future export — draws something of the right shape rather than a
-- default circle.
--
-- Slate rather than a utility colour. A board is one object on one
-- circuit and the cable either side says which; giving it a colour of
-- its own would be a second claim about the same thing.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('MSDB', 'msdb', 'square', 9, '#0f172a', 198,
   'Multi service distribution board. One cable in, one out; the flats it feeds are a table on the board rather than points on the drawing.')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   -- The role is allowed, and nothing else lost its place:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
--   -- The style row is there:
--   SELECT * FROM "GIS_Style" WHERE "Feature_Role" = 'msdb';
