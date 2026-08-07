-- ════════════════════════════════════════════════════════════════
-- 0123 — a default colour per utility
--
-- Gas is green in six places. GIS_Line_Type carries a colour per type,
-- so gas_main and gas_service each hold their own copy; GIS_Layer holds
-- one for the gas layer; and 0051 seeded a GIS_Style row from each of
-- those, copying the colour again. Changing "the colour of gas" meant
-- finding all of them, and missing one meant a drawing where the
-- services were the old green and the mains the new one.
--
-- So the colour moves up to the utility, and everything below inherits
-- it unless it says otherwise.
--
-- ── Inherit, not override ──
--
-- A null colour on a line type, a layer or a style row now means "the
-- utility's". A colour that is set is a deliberate departure and is
-- left alone — a trench type drawn brown on the electric layer stays
-- brown, because somebody meant that.
--
-- ── Which copies are cleared ──
--
-- The ones that merely repeat what the utility already says. A colour
-- equal to the utility's default was never a decision: it is what the
-- seed put there when there was nowhere else to put it. A colour that
-- differs was chosen, and survives.
--
-- Compared case-insensitively, because #10B981 and #10b981 are the same
-- green and only one of them would have matched.
--
-- Nothing looks different the moment this runs — every cleared colour is
-- replaced by the identical one from the utility. What changes is that
-- there is now one place to change it.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Utility"
  ADD COLUMN IF NOT EXISTS "Colour" text;

COMMENT ON COLUMN "Utility"."Colour" IS
  'The default colour for everything on this utility. Layers, line types '
  'and styles inherit it unless they set one of their own.';

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


-- ── Clear the copies that only repeat it ────────────────────────

-- Not the layers.
--
-- GIS_Layer."Colour" is NOT NULL, so there is no way to say "inherit"
-- on a layer — clearing it fails outright:
--
--   null value in column "Colour" of relation "GIS_Layer"
--   violates not-null constraint
--
-- The constraint could be dropped, and should not be. Nothing in the
-- application edits a layer's colour: there is no admin screen for
-- GIS_Layer at all, the rows are seeded by migration, and a layer stands
-- one-to-one with its utility — the electric layer is the electric
-- utility. A colour set there is not somebody's decision that could be
-- overridden, it is the same fact written twice.
--
-- So the layer keeps its value and the endpoint prefers the utility's
-- over it. The place to depart from a utility's colour is a line type or
-- a style row, both of which are editable and both of which take null to
-- mean inherit.

-- Line types, by way of the layer they belong to.
UPDATE "GIS_Line_Type" t
   SET "Colour" = NULL
  FROM "GIS_Layer" l
  JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
 WHERE l."Layer_Key" = t."Layer_Key"
   AND lower(t."Colour") = lower(u."Colour");

-- Style rows, whether they name the layer, the line type or the utility.
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
-- One colour per utility, and what still departs from it:
--   SELECT "Utility", "Colour" FROM "Utility" ORDER BY "Sort_Order";
--
--   SELECT t."Type_Key", t."Colour" AS its_own, u."Colour" AS utility
--     FROM "GIS_Line_Type" t
--     JOIN "GIS_Layer" l  ON l."Layer_Key"  = t."Layer_Key"
--     JOIN "Utility" u    ON u."Utility_ID" = l."Utility_ID"
--    WHERE t."Colour" IS NOT NULL
--    ORDER BY 1;
--
-- Changing gas should now be one statement, and every gas main, service,
-- meter and joint should follow it:
--   UPDATE "Utility" SET "Colour" = '#059669' WHERE "Utility" = 'Gas';
--
-- Anything on a layer with no utility — trench is the one that matters —
-- is untouched by all of this and keeps its own colour:
--   SELECT "Layer_Key", "Colour" FROM "GIS_Layer" WHERE "Utility_ID" IS NULL;
--
-- Layer colours are left as they are and no longer read where a utility
-- has one. These two should agree; where they do not, the utility wins
-- and the layer's value is simply unused:
--   SELECT l."Layer_Key", l."Colour" AS layer, u."Colour" AS utility
--     FROM "GIS_Layer" l
--     JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
--    WHERE lower(l."Colour") <> lower(u."Colour");
