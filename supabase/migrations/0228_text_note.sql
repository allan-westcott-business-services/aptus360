-- ── A note written on the drawing ──
--
-- Free text somebody puts on the plan: "existing main to be
-- abandoned", "depth to be confirmed on site", a reference to a detail
-- sheet. It is moved, resized, coloured and given a leader pointing at
-- whatever it is about.
--
-- A role rather than anything cleverer, for the reason 0209, 0213 and
-- 0214 all record: a role that appears in none of the network rules'
-- role lists is passive by construction. A note carries nothing,
-- connects nothing and ends no run, and nothing about it should be
-- able to cut a trench in half or land in a bill.
--
-- ── On the annotation layer ──
--
-- Which is what 0215 made that layer for, in as many words: "the same
-- layer is where any future annotation belongs: north points, notes,
-- revision clouds, detail bubbles". So a note survives the trench
-- being hidden — which Print to Scale does deliberately — and can be
-- turned off on its own without taking a utility with it.
--
-- ── The constraint carries every role ──
--
-- A CHECK is replaced wholesale, so the list below is the WHOLE list
-- as it stands after 0214, plus this one. Copying an older migration's
-- list would silently revoke the roles added since; 0213 and 0214 both
-- record the same warning, each having nearly made that mistake.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb','hdcutout',
     'primary','ringsub','openpoint',
     'washout',
     'sectionmark',
     'textnote'));

-- ── Where a note's words live ──
--
-- In `Label`, like every other feature's name, and NOT in a column of
-- its own. The DXF export writes a point's Label as a TEXT entity, the
-- search box reads it and a schedule lists it — so text held anywhere
-- else would be invisible to all three, and adding it to each of them
-- is three places to remember instead of none.
--
-- Everything else about a note is in `Attributes`, which is where the
-- rest of the drawing keeps what belongs to one kind of feature:
--
--   Text_Size_M    the text height in METRES OF GROUND, so a note is
--                  the same size on a sheet at 1:200 as at 1:500. The
--                  section mark's two-metre bar is sized the same way
--                  and for the same reason.
--   Text_Width_M   the wrap width, likewise in metres. Set by dragging
--                  the right-hand edge.
--   Note_Fill      the plate behind the text, or null for none. A note
--                  is written over a basemap and black text on an
--                  aerial photograph is not text.
--   Note_Colour    the ink, where it should not be the style's.
--   Leader_At      the point on the ground the leader arrow points at,
--                  or absent for a note that needs no leader.
--
-- No migration adds them: Attributes is jsonb and a note without one
-- reads its default from textNotes.js, which is the one place those
-- defaults are written down.

-- ── The style ──
--
-- The colour and the Min/Max scale rules apply; the symbol does not,
-- because a note is drawn as its own plate and letters rather than
-- from the symbol catalogue. The row is here so a drawing covered in
-- notes can be turned off at a zoom, and so the ink has somewhere to
-- be set for everybody rather than note by note.
--
-- Near-black, like the section mark: nothing in the ground is this
-- colour, which is the point of it.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Text note', 'textnote', 'square', 6, '#0f172a', 203,
   'A note written on the drawing. Sized in metres of ground and drawn as its own plate; the colour and the Min/Max scale rules apply, the symbol does not.')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--   -- expect 'textnote' in the list, and every role before it
--
--   SELECT "Style_Name","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" = 'textnote';
--
--   SELECT "Layer_Key", COUNT(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'textnote' GROUP BY 1;
--   -- expect every one on 'annotation'
