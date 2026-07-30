-- ════════════════════════════════════════════════════════════════
-- 0076 — an LV feeder is an LV main
--
-- 0073 gave generated feeders their own line type so a rebuild could
-- tell them from cables drawn by hand. That was solving the right
-- problem with the wrong thing: feeder and main are two words for the
-- same cable, and putting them on separate line types split one quantity
-- across two rows of the bill and two entries in the Electric menu.
--
-- The discriminator a rebuild actually needs is already there: the
-- Generated attribute, set when the router draws a run. That says what
-- the type was never really saying — who drew it, not what it is.
--
-- So feeders become mains, and the type goes.
-- ════════════════════════════════════════════════════════════════

UPDATE "GIS_Feature"
   SET "Attributes" = jsonb_set("Attributes", '{Line_Type}', '"elec_main"')
 WHERE "Attributes" ->> 'Line_Type' = 'elec_feeder';

-- Removed rather than deactivated: nothing points at it now, and an
-- inactive type still shows in the styles admin as something choosable.
DELETE FROM "GIS_Line_Type" WHERE "Type_Key" = 'elec_feeder';

-- Any style written against it goes the same way.
DELETE FROM "GIS_Style" WHERE "Line_Type" = 'elec_feeder';


-- ── Check ───────────────────────────────────────────────────────
-- Expect no rows: nothing still carrying the old type.
--   SELECT "Feature_ID", "Label" FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'Line_Type' = 'elec_feeder';
--
-- Generated runs are still identifiable, which is what a rebuild needs:
--   SELECT ("Attributes" ->> 'Generated')::boolean AS generated,
--          COUNT(*) AS runs,
--          ROUND(SUM(("Attributes" ->> 'Length_m')::numeric), 1) AS metres
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project>
--      AND "Attributes" ->> 'Line_Type' = 'elec_main'
--    GROUP BY 1;
--
-- Electric main on the bill should now be one row carrying both:
--   SELECT item, quantity, features FROM gis_bom(<project>)
--    WHERE item LIKE 'Electric main%';
