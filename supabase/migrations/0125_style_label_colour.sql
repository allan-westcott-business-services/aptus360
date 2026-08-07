-- ════════════════════════════════════════════════════════════════
-- 0125 — labels take a colour from the style
--
-- Every label on the drawing was painted #0f172a, written into the
-- canvas twice — once for points, once for lines. Near-black on white is
-- a reasonable default and a poor rule: an electric label over an amber
-- run reads, a label over a dark trench does not, and a drawing issued
-- to an operator with its own standard has no way to say what its text
-- should look like.
--
-- ── Why on the style and not on the utility ──
--
-- 0123 put the drawing colour on the utility because it is one fact per
-- utility — gas is green — and every layer, line type and style below it
-- inherits. A label colour is not that. It varies by what is being
-- labelled rather than by whose utility it is: the same scheme may want
-- plot numbers black, circuit tags in the circuit's own colour, and
-- everything off site in the off-site purple.
--
-- GIS_Style already answers "what does this look like", already cascades
-- from the layer down to the line type and the operator, and already has
-- a screen to edit it on. A second place to set a colour would be a
-- second place for the two to disagree.
--
-- So: scope a row to a layer and its labels change; scope one to a line
-- type and only that type's do.
--
-- ── Null means what it always was ──
--
-- Nothing is seeded. A null Label_Colour falls through to the same
-- near-black the canvas has always used, so no drawing looks different
-- until somebody sets one.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Style"
  ADD COLUMN IF NOT EXISTS "Label_Colour" text;

COMMENT ON COLUMN "GIS_Style"."Label_Colour" IS
  'Colour of the text drawn for features this row matches. Null inherits '
  'from a less specific row, and from the canvas default when none sets it.';


-- ── Check ───────────────────────────────────────────────────────
-- Rows that set one:
--   SELECT "Style_Name", "Layer_Key", "Line_Type", "Feature_Role", "Label_Colour"
--     FROM "GIS_Style" WHERE "Label_Colour" IS NOT NULL ORDER BY "Style_Name";
--
-- Making every label on the water layer read in the utility's blue —
-- the layer-scoped row is the one to set, since it matches a water
-- feature of any kind:
--   UPDATE "GIS_Style" SET "Label_Colour" = '#3b82f6'
--    WHERE "Style_Name" = 'Water (layer default)';
--
-- And only the mains, leaving services alone:
--   UPDATE "GIS_Style" SET "Label_Colour" = '#1d4ed8'
--    WHERE "Line_Type" = 'water_main';
