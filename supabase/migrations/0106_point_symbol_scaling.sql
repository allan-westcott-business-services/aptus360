-- ════════════════════════════════════════════════════════════════
-- 0106 — point symbols that scale with the zoom
--
-- A point is drawn at Symbol_Size_Px and nothing else: 6 pixels at 10%
-- and 6 pixels at 800%. Zoom in and the symbols stay put while the
-- drawing grows around them, until a meter that should sit neatly at the
-- end of its service is a dot beside a cable four times its width.
--
-- Lines have had the answer to this from the start — Width_M with
-- Scale_Width and a pair of clamps — and these are the same four fields
-- for symbols. Nothing about how lines behave changes.
--
-- ── The clamps are the point of it ──────────────────────────────
-- A size in metres alone gives a symbol that vanishes at site scale and
-- fills the screen at 800%. Min and Max hold it between something
-- visible and something that still lets you see what it is standing on,
-- exactly as Min_Width_Px and Max_Width_Px do for a trench.
--
-- All null, so every existing style keeps its fixed pixel size until
-- somebody chooses otherwise. Scale_Symbol defaults false rather than
-- null for the same reason Scale_Width does: a boolean that is neither
-- true nor false is a third state nobody wanted.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Style"
  ADD COLUMN IF NOT EXISTS "Symbol_Size_M"  numeric,
  ADD COLUMN IF NOT EXISTS "Scale_Symbol"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "Min_Symbol_Px"  numeric,
  ADD COLUMN IF NOT EXISTS "Max_Symbol_Px"  numeric;

COMMENT ON COLUMN "GIS_Style"."Symbol_Size_M" IS
  'Real size of the symbol in metres. Used only when Scale_Symbol is true.';
COMMENT ON COLUMN "GIS_Style"."Scale_Symbol" IS
  'Draw the symbol to scale from Symbol_Size_M rather than at the fixed '
  'Symbol_Size_Px.';
COMMENT ON COLUMN "GIS_Style"."Min_Symbol_Px" IS
  'Smallest the symbol is drawn, however far out the zoom. Null means no '
  'floor, and a symbol that disappears at site scale.';
COMMENT ON COLUMN "GIS_Style"."Max_Symbol_Px" IS
  'Largest the symbol is drawn, however far in the zoom.';


-- ── Check ───────────────────────────────────────────────────────
-- Which styles scale their symbols, and between what:
--   SELECT "Style_Name", "Symbol_Size_Px", "Scale_Symbol", "Symbol_Size_M",
--          "Min_Symbol_Px", "Max_Symbol_Px"
--     FROM "GIS_Style" WHERE "Is_Active" ORDER BY "Sort_Order";
--
-- A starting point for meters, if they should be about their real size
-- and never smaller than a dot nor larger than a plot number:
--   UPDATE "GIS_Style"
--      SET "Scale_Symbol" = true, "Symbol_Size_M" = 0.6,
--          "Min_Symbol_Px" = 3, "Max_Symbol_Px" = 18
--    WHERE "Feature_Role" = 'meter';
