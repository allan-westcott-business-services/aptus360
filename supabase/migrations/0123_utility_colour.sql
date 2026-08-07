-- ════════════════════════════════════════════════════════════════
-- 0123 — a default colour per utility
--
-- Gas is green in six places. GIS_Line_Type carries a colour per type,
-- so gas_main and gas_service each hold their own copy; GIS_Layer holds
-- one for the gas layer; and 0051 seeded a GIS_Style row from each of
-- those, copying the colour again. Changing "the colour of gas" meant
-- finding all of them, and missing one gave a drawing where the
-- services were the old green and the mains the new one.
--
-- So the colour moves up to the utility and everything below follows it.
--
-- ── Why almost nothing is rewritten here ──
--
-- The obvious migration clears the duplicated colours so they fall
-- through to the utility. It cannot: Colour is NOT NULL on both
-- GIS_Layer and GIS_Line_Type.
--
--   null value in column "Colour" of relation "GIS_Layer"
--   violates not-null constraint
--
-- Those constraints could be dropped. They should not be, and it turns
-- out they need not be. Nothing in this application edits either table:
-- there is no admin screen for layers or line types, the rows are seeded
-- by migration, and a layer stands one-to-one with its utility — the
-- electric layer is the electric utility. A colour stored there is the
-- same fact written twice rather than a decision worth preserving.
--
-- So the inheriting is done when the drawing is read, in
-- netlify/functions/gis.js, which fills a layer's and a line type's
-- colour from the utility. Two advantages over rewriting the rows:
-- clearing Utility."Colour" puts everything back exactly as it was, and
-- the stored values are never destroyed on the strength of a comparison.
--
-- ── The style rows are the exception ──
--
-- GIS_Style is editable, its Colour is nullable, and null already means
-- "inherit" to the cascade in gisStyle.js. The rows 0051 seeded from the
-- line types carry a colour that is only a copy, and a copy there
-- outranks everything below it — so those are cleared, and only those.
--
-- A style colour that differs from the utility's was somebody's choice
-- and is left alone. Compared case-insensitively, because #10B981 and
-- #10b981 are the same green and only one of them would have matched.
--
-- Nothing looks different the moment this runs: every colour it clears
-- is replaced by the identical one from the utility.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Utility"
  ADD COLUMN IF NOT EXISTS "Colour" text;

COMMENT ON COLUMN "Utility"."Colour" IS
  'The default colour for everything on this utility. Layers and line '
  'types follow it; a GIS_Style row is where to depart from it.';


-- ── Seed it from what the layers already say ────────────────────
-- The layer bound to this utility, lowest sort order first where a
-- utility somehow has two. Only where the utility has none set, so
-- re-running cannot undo somebody's choice.
UPDATE "Utility" u
   SET "Colour" = sub."Colour"
  FROM (
    SELECT DISTINCT ON (l."Utility_ID")
           l."Utility_ID", l."Colour"
      FROM "GIS_Layer" l
     WHERE l."Utility_ID" IS NOT NULL
       AND NULLIF(l."Colour", '') IS NOT NULL
     ORDER BY l."Utility_ID", l."Sort_Order", l."Layer_Key"
  ) sub
 WHERE sub."Utility_ID" = u."Utility_ID"
   AND NULLIF(u."Colour", '') IS NULL;


-- ── Clear the style copies that only repeat it ──────────────────
-- Whether the row names the layer, the line type or the utility.
UPDATE "GIS_Style" s
   SET "Colour" = NULL
  FROM "Utility" u
 WHERE lower(s."Colour") = lower(u."Colour")
   AND (
     s."Utility_ID" = u."Utility_ID"
     OR EXISTS (
       SELECT 1 FROM "GIS_Layer" l
        WHERE l."Utility_ID" = u."Utility_ID"
          AND (l."Layer_Key" = s."Layer_Key"
               OR EXISTS (SELECT 1 FROM "GIS_Line_Type" t
                           WHERE t."Type_Key" = s."Line_Type"
                             AND t."Layer_Key" = l."Layer_Key"))
     )
   );


-- ── Check ───────────────────────────────────────────────────────
-- One colour per utility:
--   SELECT "Utility", "Colour" FROM "Utility" ORDER BY "Sort_Order";
--
-- Changing gas should now be one statement, and every gas main,
-- service, meter and joint should follow it:
--   UPDATE "Utility" SET "Colour" = '#059669' WHERE "Utility" = 'Gas';
--
-- Style rows that still carry a colour. Each one is a deliberate
-- departure and will not follow the utility — which is the point of
-- them, but worth reading once:
--   SELECT "Style_Name", "Layer_Key", "Line_Type", "Feature_Role", "Colour"
--     FROM "GIS_Style" WHERE "Colour" IS NOT NULL ORDER BY "Style_Name";
--
-- Line types whose stored colour differs from their layer's. These are
-- kept as they are when the drawing is read, rather than following the
-- utility — the endpoint treats a difference as deliberate:
--   SELECT t."Type_Key", t."Colour" AS its_own, l."Colour" AS layer
--     FROM "GIS_Line_Type" t
--     JOIN "GIS_Layer" l ON l."Layer_Key" = t."Layer_Key"
--    WHERE lower(t."Colour") <> lower(l."Colour");
--
-- Anything on a layer with no utility — trench is the one that matters —
-- is untouched by all of this:
--   SELECT "Layer_Key", "Colour" FROM "GIS_Layer" WHERE "Utility_ID" IS NULL;
