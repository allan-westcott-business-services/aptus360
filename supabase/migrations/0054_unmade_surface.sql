-- ════════════════════════════════════════════════════════════════
-- 0054 — Unmade surface type
--
-- A sixth surface for trenches. Unmade ground — a track, a haul road, a
-- verge that was never made up — sits between the made highway surfaces
-- and the soft ones: more to reinstate than a verge, far less than a
-- carriageway. Hence sort order 35, after Carriageway 3/4 and before
-- Verge, so the list still reads hardest to softest.
--
-- No code change goes with this. The pickers on the canvas, the feature
-- editor and the bulk editor all read GIS_Surface_Type, so a row added
-- here appears in all three on the next load.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Sort_Order") VALUES
  ('unmade', 'Unmade', 35)
ON CONFLICT ("Surface_Key") DO UPDATE SET
  "Label"      = EXCLUDED."Label",
  "Sort_Order" = EXCLUDED."Sort_Order",
  "Is_Active"  = true;
-- DO UPDATE rather than DO NOTHING so a re-run restores it if someone
-- has deactivated it, matching how 0052 seeds the other five.


-- ── Check ───────────────────────────────────────────────────────
-- Expect six rows, in the order the pickers will show them:
-- Footway, Carriageway 1/2, Carriageway 3/4, Unmade, Verge, Agricultural.
--
--   SELECT "Surface_Key", "Label", "Sort_Order", "Is_Active"
--     FROM "GIS_Surface_Type"
--    WHERE "Is_Active"
--    ORDER BY "Sort_Order";
--
-- The fuller picture, including how much trench has been dug through
-- each, is in supabase/checks/0052_surface_and_site.sql.
