-- ── A cross-section marker ──
--
-- The mark that says "the section is taken here": a bar across the dig
-- with an arrowhead at each end. Placed by hand on a trench, drawn two
-- metres of real ground long and square to the line it sits on, and
-- right-clicked to show the section through the trench at that point.
--
-- A role rather than a joint type, for the reason 0209 and 0213 both
-- record: a role none of the network rules name is passive by
-- construction. This one is annotation — it carries nothing, connects
-- nothing and ends no run — so it must not be able to cut a trench in
-- half by being mistaken for a fitting.
--
-- ── The constraint carries every role ──
--
-- A CHECK is replaced wholesale, so the list below is the WHOLE list as
-- it stands after 0213, plus this one. Copying an older migration's
-- list would silently revoke the roles added since; 0213 records the
-- same warning, having nearly made that mistake.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb','hdcutout',
     'primary','ringsub','openpoint',
     'washout',
     'sectionmark'));

-- ── The style ──
--
-- The mark is drawn by the canvas as its own shape — a bar and two
-- heads, sized in metres — rather than from a symbol in the catalogue,
-- because a symbol has no direction and this one means nothing except
-- square to its trench. The style row is here for its COLOUR and its
-- visibility rules, which are worth being able to set: a drawing full
-- of section marks is one somebody will want to turn off at a zoom.
--
-- Black, because it is annotation rather than apparatus. Nothing in the
-- ground is this colour, which is the point: a section mark is a note
-- about the drawing, not a thing that was dug.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Cross-section mark', 'sectionmark', 'square', 6, '#0f172a', 202,
   'A section marker on a trench. Drawn 2m of ground long and square to its line; the colour and the Min/Max scale rules apply, the symbol does not.')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
--   SELECT "Style_Name","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" = 'sectionmark';
