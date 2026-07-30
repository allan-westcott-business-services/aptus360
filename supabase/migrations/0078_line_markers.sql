-- ════════════════════════════════════════════════════════════════
-- 0078 — markers repeated along a line
--
-- A drawing convention this app could describe but not store: an E every
-- ten metres along an electric main, a tick along a ducted section, an
-- arrow showing flow. gisStyle.js has read these eight columns since
-- 0051 and they have never existed, so markerConfig has always returned
-- null and nothing was ever drawn.
--
-- Interval is in metres, not pixels, because it describes the drawing
-- rather than the view — markers stay where they are when you zoom. What
-- cannot survive a zoom is the appearance: at half a pixel per metre a
-- marker every ten metres is one every five pixels, which is a smear. So
-- there is a minimum on-screen gap, and below it the step grows to a
-- whole multiple of the interval. Markers thin out rather than slide, so
-- the ones still visible are where they always were.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Style"
  -- One or two characters drawn along the line. Longer than that stops
  -- being a marker and starts being a label.
  ADD COLUMN IF NOT EXISTS "Marker_Text"        text,
  -- Or a symbol from the same set point features use.
  ADD COLUMN IF NOT EXISTS "Marker_Symbol"      text,
  ADD COLUMN IF NOT EXISTS "Marker_Interval_M"  numeric,
  ADD COLUMN IF NOT EXISTS "Marker_Size_Px"     numeric,
  -- Null follows the line's own colour, which is what you want unless
  -- the marker has to stand out against it.
  ADD COLUMN IF NOT EXISTS "Marker_Colour"      text,
  -- Turned along the line by default. Off for anything that should stay
  -- upright whatever direction the run takes.
  ADD COLUMN IF NOT EXISTS "Marker_Rotate"      boolean,
  -- Sideways from the line, so a marker can sit beside it rather than on
  -- it — useful where two services share a trench.
  ADD COLUMN IF NOT EXISTS "Marker_Offset_Px"   numeric,
  ADD COLUMN IF NOT EXISTS "Marker_Min_Gap_Px"  numeric;

ALTER TABLE "GIS_Style"
  DROP CONSTRAINT IF EXISTS "GIS_Style_Marker_Text_check";
ALTER TABLE "GIS_Style"
  ADD CONSTRAINT "GIS_Style_Marker_Text_check"
  CHECK ("Marker_Text" IS NULL OR char_length("Marker_Text") <= 3);

ALTER TABLE "GIS_Style"
  DROP CONSTRAINT IF EXISTS "GIS_Style_Marker_Interval_check";
ALTER TABLE "GIS_Style"
  ADD CONSTRAINT "GIS_Style_Marker_Interval_check"
  CHECK ("Marker_Interval_M" IS NULL OR "Marker_Interval_M" > 0);

-- Deliberately unseeded. Which runs carry which marker is a drawing
-- standard, and standards differ between operators — guessing one would
-- put letters on every drawing in the system.


-- ── Check ───────────────────────────────────────────────────────
-- Styles that will draw markers:
--   SELECT "Style_Name", "Line_Type", "Marker_Text", "Marker_Symbol",
--          "Marker_Interval_M", "Marker_Size_Px", "Marker_Rotate"
--     FROM "GIS_Style"
--    WHERE "Marker_Text" IS NOT NULL OR "Marker_Symbol" IS NOT NULL
--    ORDER BY "Sort_Order";
--
-- An example, if you want one to look at — an E every 10 m along
-- electric mains, in the line's own colour:
--   UPDATE "GIS_Style"
--      SET "Marker_Text" = 'E', "Marker_Interval_M" = 10,
--          "Marker_Size_Px" = 11, "Marker_Rotate" = true
--    WHERE "Line_Type" = 'elec_main';
--
-- To stop it drawing again, clear the text and the symbol:
--   UPDATE "GIS_Style" SET "Marker_Text" = NULL, "Marker_Symbol" = NULL
--    WHERE "Line_Type" = 'elec_main';
