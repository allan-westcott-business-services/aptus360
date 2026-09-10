-- ── A heavy duty cut-out on an LV feeder ──
--
-- A cut-out spliced into a main so a supply can be taken from it. It is
-- a fitting the cable passes THROUGH, not a break in it: the conductor
-- is continuous, so it introduces no loss, ends no section and creates
-- no feeder end point.
--
-- That is the whole of its behaviour, and it is why this migration adds
-- a role and a style and nothing else. Every rule that makes a fitting
-- matter to the network — `jointMarks` for a stop, `isBreak` for a
-- section end, `feedsNothing` for the trace — names the roles it acts
-- on, so a role none of them mentions is passive by construction rather
-- than by a flag somebody has to remember.
--
-- ── Why a role rather than a joint with a type ──
--
-- A straight joint carries `Joint_Type` and DOES break the cable. Using
-- the same role with a different type would put a passive fitting one
-- typo away from cutting a run in half, and every rule that reads
-- `Feature_Role === 'joint'` would have to learn the exception.

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb','hdcutout'));

-- ── The symbol ──
--
-- A rectangle with two circles in it, drawn by the canvas: the fuse
-- ways are the symbol and no style row can carry them. `Symbol` is
-- 'square' so that anything reading the style table rather than the
-- canvas draws something of the right shape rather than a default
-- circle.
--
-- Slate, like the board. A cut-out sits on one cable and that cable's
-- colour already says which circuit it is on; a colour of its own would
-- be a second claim about the same thing.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Heavy duty cut-out', 'hdcutout', 'square', 9, '#0f172a', 199,
   'A cut-out spliced into an LV feeder. The cable runs through it: no loss, no break, no feeder end point.')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   -- The role is allowed, and nothing else lost its place:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
--   -- And the style is there exactly once:
--   SELECT "Style_Name","Symbol","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" = 'hdcutout';
