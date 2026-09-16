-- ── A wash out at the end of a water main ──
--
-- Water that stops moving at a blind end goes stale, so every dead end
-- of a main carries a wash out to flush and drain that leg before it is
-- handed over. Build Water Network places one at each end of pipe — not
-- at junctions, which are not ends, and not at the POC, which is an end
-- by geometry and the one place the water comes IN.
--
-- ── Why a role rather than a joint type ──
--
-- The same reasoning 0209 records for the cut-out. A wash out is not a
-- break in the main and ends no run; a role none of the network rules
-- name is passive by construction, where a joint with a different type
-- would sit one typo away from cutting a main in half.
--
-- Generated ones are replaced on every rebuild, like the service
-- valves: a wash out belongs to the network that was built. One placed
-- by hand carries no Generated flag and is left where it is.

-- ── The constraint carries every role, not just the new one ──
--
-- A CHECK is replaced wholesale, so the list below must be the WHOLE
-- list as it stands after 0211, plus this one. Copying an older
-- migration's list — 0209's, say — would silently REVOKE the roles
-- added since: every primary, ring substation and open point on every
-- drawing would become a row its own table refuses, and the next write
-- to one would fail. 0211 says the same thing about 0209 for the same
-- reason. If another role is added before this migration is run
-- anywhere, it belongs in this list too.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb','hdcutout',
     'primary','ringsub','openpoint',
     'washout'));

-- ── The symbol ──
--
-- A filled disc with WO inside it. The letters come from SYMBOL_TEXT in
-- gisStyle.js, which both the canvas and the print read, so the shape
-- here is the disc and the letters follow it wherever it is drawn.
--
-- ── No colour, deliberately ──
--
-- Left null so the cascade falls through to the water layer's own
-- style: the disc comes out the colour of the main it terminates, and
-- changing the main's colour changes the wash outs with it. Setting a
-- colour here would freeze one against the other and is exactly the
-- thing somebody would then have to remember to change twice.
--
-- Size and visibility ARE here, as a starting point: 9 px, which is
-- large enough to hold two letters legibly. Both are meant to be edited
-- in Admin › GIS Styles — Symbol size, Scale symbol, and the Min/Max
-- scale rules that hide a symbol when zoomed out — which is why they
-- are a style row rather than numbers in the canvas.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Sort_Order","Notes")
VALUES
  ('Wash out', 'washout', 'washout', 9, 201,
   'A wash out at a dead end of a water main. Colour is left unset so it follows the water layer, and the WO letters are part of the symbol.')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   -- The role is allowed, and nothing else lost its place:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
--   -- And the style is there exactly once, with no colour of its own:
--   SELECT "Style_Name","Symbol","Symbol_Size_Px","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" = 'washout';
