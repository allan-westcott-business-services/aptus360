-- ════════════════════════════════════════════════════════════════
-- 0197 — the incumbent's existing network
--
-- A plot let to a self-lay provider connects to a main that is already
-- in the ground and is not ours. To draw that connection, the existing
-- trench and the existing main in it have to be drawable — and, more
-- importantly, have to be TELLABLE APART from the network we build.
--
-- Four types, one naming rule: `_existing` on the end.
--
--   trench_main_existing   the incumbent's trench, already dug
--   elec_main_existing     their LV main in it
--   gas_main_existing      their gas main
--   water_main_existing    their water main
--
-- ── Why the suffix, and not a flag on the feature ──
--
-- Two functions in the canvas already decide what a main is by reading
-- the type key, and they read it two different ways:
--
--   mainsOnLayer    Line_Type ENDS WITH '_main'
--   mainsTrenches   Line_Type CONTAINS 'main'
--
-- `elec_main_existing` does not end with '_main', so mainsOnLayer will
-- not pick it up — which is right: that function finds the mains a
-- service tees a vertex into and a joint is placed on, and neither
-- happens on somebody else's cable.
--
-- `trench_main_existing` does contain 'main', so mainsTrenches WILL pick
-- it up, and Auto Service will happily run a service to it. That is
-- wanted for a self-lay plot and wrong for every other one. **The code
-- to choose between them is not in this migration**, so until it lands,
-- an existing trench drawn near an ordinary plot can be picked as that
-- plot's nearest main. Draw them, by all means; do not run Auto Service
-- over a drawing carrying them until the rule is in.
--
-- ── An existing trench is not our dig ──
--
-- This is the half worth reading twice. Trench length feeds the dig
-- estimate, the dig-rate day count, the trench sizing, the call-off
-- quantities and the bill of materials. Every one of those walks the
-- trench layer, and none of them knows about `_existing` yet.
--
-- So a drawing carrying an existing trench will, today, bill for
-- digging it. That is the one direction a wrong number is dangerous in
-- for a quantity: it inflates a price rather than a design, and nobody
-- checking the drawing would see why.
--
-- The queries at the foot list what has been drawn with these types, so
-- the effect on any bill can be found rather than guessed at.
-- ════════════════════════════════════════════════════════════════

-- ── Run this first ───────────────────────────────────────────────
-- Nothing should be drawn with these keys yet. A row here means the
-- keys were taken by something else, and the seed below would silently
-- adopt it.
--
--   SELECT "Attributes" ->> 'Line_Type' AS type, COUNT(*)
--     FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'Line_Type' LIKE '%_existing'
--    GROUP BY 1;


INSERT INTO "GIS_Line_Type"
  ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active")
VALUES
  -- Dashed, and in grey rather than the layer's own colour.
  --
  -- Both carry the same meaning: this is on the drawing for reference
  -- and is not part of the build. A solid line in the electric layer's
  -- amber says "we are laying this", which is the one thing an existing
  -- main is not — and a designer reads the weight and the dash of a
  -- line long before reading any label on it.
  --
  -- The mains keep their utility's hue at low saturation so gas, water
  -- and electric can still be told apart at a glance.
  ('trench_main_existing', 'Existing trench (incumbent)',    'trench',   '#9ca3af', 5.0, true, 68, true),
  ('elec_main_existing',   'Existing LV main (incumbent)',   'electric', '#a1887f', 3.5, true, 20, true),
  ('gas_main_existing',    'Existing gas main (incumbent)',  'gas',      '#86a693', 3.5, true, 34, true),
  ('water_main_existing',  'Existing water main (incumbent)','water',    '#8fa8bf', 3.5, true, 46, true)
ON CONFLICT ("Type_Key") DO UPDATE SET
  "Label"     = EXCLUDED."Label",
  "Layer_Key" = EXCLUDED."Layer_Key",
  "Colour"    = EXCLUDED."Colour",
  "Width_px"  = EXCLUDED."Width_px",
  "Dashed"    = EXCLUDED."Dashed",
  "Is_Active" = true;
-- DO UPDATE rather than DO NOTHING, so a re-run restores the intended
-- weight and dash — the same reasoning as 0050. Sort_Order is left
-- alone deliberately: it is the one field somebody may reorder by hand.


-- ── Verifying ────────────────────────────────────────────────────
-- Four rows, all dashed:
--
--   SELECT "Type_Key","Label","Layer_Key","Colour","Dashed"
--     FROM "GIS_Line_Type"
--    WHERE "Type_Key" LIKE '%_existing'
--    ORDER BY "Layer_Key";
--
-- What has been drawn with them, by project — run this before reading
-- any bill of materials or dig estimate on a drawing that has them,
-- until the exclusions land:
--
--   SELECT f."Project_ID",
--          f."Attributes" ->> 'Line_Type' AS type,
--          COUNT(*) AS lines
--     FROM "GIS_Feature" f
--    WHERE f."Attributes" ->> 'Line_Type' LIKE '%_existing'
--    GROUP BY 1,2
--    ORDER BY 1,2;
--
-- To take them off the drawing picker again without deleting anything
-- already drawn with them:
--
--   UPDATE "GIS_Line_Type" SET "Is_Active" = false
--    WHERE "Type_Key" LIKE '%_existing';
