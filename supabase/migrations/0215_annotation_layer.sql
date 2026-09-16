-- ── Annotation is not apparatus ──
--
-- Section marks were put on the `trench` layer, because that is what
-- they are placed on. That was wrong, and wrong in a way that hid them:
-- the layer is one of the keys the drawing hides by, so switching the
-- trench off switched off every section mark with it — and Print to
-- Scale switches the trench off deliberately, so a mark vanished from
-- exactly the sheet it was drawn for.
--
-- A section mark is a note ABOUT the dig, not part of it. So it gets a
-- layer of its own, which can be turned off on its own, and which
-- survives the trench being hidden.
--
-- The same layer is where any future annotation belongs: north points,
-- notes, revision clouds, detail bubbles. None of those are apparatus
-- either, and none should disappear because somebody hid a utility.
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order") VALUES
  ('annotation', 'Annotation', '#0f172a', 90)
ON CONFLICT ("Layer_Key") DO NOTHING;

-- Marks already placed move with it. Written as an UPDATE rather than
-- left to be redrawn, because a mark carries a position somebody chose
-- and a section they may already have issued.
UPDATE "GIS_Feature"
   SET "Layer_Key" = 'annotation'
 WHERE "Feature_Role" = 'sectionmark'
   AND "Layer_Key" IS DISTINCT FROM 'annotation';

-- Checks worth running after this:
--
--   SELECT "Layer_Key", COUNT(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'sectionmark' GROUP BY 1;
--   -- expect every one on 'annotation'
