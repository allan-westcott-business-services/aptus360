-- ════════════════════════════════════════════════════════════════
-- 0104 — a joint is an electric thing
--
-- Joints join cables. Gas and water are jointed too, but not with these:
-- the Electric_Joint catalogue is straight, tee, service, pot end and
-- breech, and every one of them is a cable joint.
--
-- The older gis_place_joints routine put them on the trench layer,
-- because it worked from where line ends happened to coincide across
-- every utility and had no way to know whose junction it had found. The
-- bill then reported the same joint type under two utilities — Electric
-- for the ones the feeder placement made, Trench for the older ones —
-- which reads as a fault in the bill and is a fault in the data.
--
-- Two things wrong with those rows, both fixed here:
--
--   the layer   — trench, so they were counted against Trench
--   the role    — absent, so nothing in the application recognised them
--                 as joints at all: not the Joints row on the Electric
--                 menu, not Bulk Delete's "All joints", and until 0103
--                 not the bill either
--
-- Only rows that actually carry a Joint_Type are touched. A point on the
-- trench layer that is not a joint is left exactly as it is.
--
-- ── The routine that made them ──────────────────────────────────
-- gis_place_joints is left in place but is no longer reachable from the
-- application: the menu item that called it is gone in this release,
-- replaced by Place Feeder Joints, which classifies from the routed
-- network and writes the layer, role, type and code properly. Dropping
-- the function would break anything else still calling it, and nothing
-- is gained by that today.
-- ════════════════════════════════════════════════════════════════

UPDATE "GIS_Feature"
   SET "Layer_Key"    = 'electric',
       "Feature_Role" = 'joint'
 WHERE "Feature_Type" = 'point'
   AND "Attributes" ? 'Joint_Type'
   AND ("Layer_Key" <> 'electric' OR "Feature_Role" IS DISTINCT FROM 'joint');


-- ── Check ───────────────────────────────────────────────────────
-- Nothing should come back: every joint is now electric and carries the
-- role the application looks for.
--   SELECT "Layer_Key", "Feature_Role", COUNT(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'point' AND "Attributes" ? 'Joint_Type'
--      AND ("Layer_Key" <> 'electric' OR "Feature_Role" IS DISTINCT FROM 'joint')
--    GROUP BY 1, 2;
--
-- And the bill should now show one row per joint type:
--   SELECT utility, item, quantity FROM gis_bom(<project id>)
--    WHERE unit = 'no.' ORDER BY item;
--
-- Joints moved this way keep the type the older routine gave them —
-- 'tee' or 'straight' — which it worked out from geometry alone. Where
-- the feeder network has been routed, Place Feeder Joints reclassifies
-- them properly; it leaves alone any joint it agrees with.
