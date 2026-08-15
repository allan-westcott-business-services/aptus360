-- ════════════════════════════════════════════════════════════════
-- 0166 — the property boundary point is styled like everything else
--
-- Its size, the zoom it appears at, its colour and whether it is drawn
-- at all were four numbers written into the canvas. Now they are a row
-- on GIS_Style, editable on the GIS Styles screen with every other
-- symbol.
--
-- ── Why it was not already ──
--
-- Because it is not a feature. It is Boundary_At, an attribute of the
-- plot seed, painted in a pass of its own — so the style cascade, which
-- resolves against a feature's layer, line type and role, had nothing
-- to resolve against.
--
-- ── The scope, and why it is honest ──
--
-- Layer_Key 'plot', Feature_Role 'boundary'.
--
-- GIS_Style's scope columns are free text and describe what a rule
-- applies to, rather than pointing at anything. There is no feature
-- with the role 'boundary' and there does not need to be: the row says
-- "the boundary point on the plot layer", which is exactly what it
-- styles.
--
-- It cannot match anything else by accident. A plot seed carries the
-- role 'plot', so the cascade sorting a real feature never reaches this
-- row, and this row's own lookup asks for a subject nothing else can
-- present.
--
-- ── The four columns it uses ──
--
--   Symbol_Size_Px   the radius of the ring, 9 as drawn today
--   Min_Scale        the zoom it appears at, 3 as drawn today
--   Colour           the ink, #334155 as drawn today
--   Is_Active        whether it is drawn at all
--
-- Seeded at what the canvas already draws, so applying this changes
-- nothing on screen until somebody edits it. A migration that quietly
-- redraws every plot on every project is not one anybody would thank
-- you for.
--
-- Below Min_Scale the point is still marked, with a small tick rather
-- than the lettered ring — that is a legibility fallback rather than a
-- setting, so it is not on the row. Turning the row off removes both.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "GIS_Style"
  ("Style_Name","Layer_Key","Feature_Role","Symbol","Symbol_Size_Px",
   "Min_Scale","Colour","Sort_Order","Is_Active","Notes")
SELECT 'Property boundary point', 'plot', 'boundary', 'circle', 9,
       3, '#334155', 210, true,
       'Where a plot''s supplies enter it. Drawn from Boundary_At on the plot '
       || 'seed rather than from a feature of its own. Symbol_Size_Px is the '
       || 'radius of the ring, Min_Scale the zoom it appears at.'
 WHERE NOT EXISTS (
   SELECT 1 FROM "GIS_Style"
    WHERE "Layer_Key" = 'plot' AND "Feature_Role" = 'boundary'
      AND "Organisation_ID" IS NULL
 );


-- ── Check ───────────────────────────────────────────────────────
--
-- The row, and what it is set to:
--
--   SELECT "Style_Name", "Symbol_Size_Px", "Min_Scale", "Colour", "Is_Active"
--     FROM "GIS_Style"
--    WHERE "Layer_Key" = 'plot' AND "Feature_Role" = 'boundary';
--
-- It should not match a plot seed. A seed carries the role 'plot', so
-- this returns nothing — if it ever returns rows, the scope has been
-- widened and every seed is being drawn as a boundary point:
--
--   SELECT count(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'boundary';
--
-- An operator wanting its own size adds a second row with the same
-- scope and its Organisation_ID set, the way every other standard
-- override works. The unique index over the scope columns allows one
-- per organisation and one with none:
--
--   SELECT "Organisation_ID", "Symbol_Size_Px", "Min_Scale"
--     FROM "GIS_Style"
--    WHERE "Layer_Key" = 'plot' AND "Feature_Role" = 'boundary'
--    ORDER BY "Organisation_ID" NULLS FIRST;
