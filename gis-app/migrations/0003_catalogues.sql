-- ════════════════════════════════════════════════════════════════════
-- 0003 — the drawing catalogues
--
-- What the canvas can draw: nine layers, seventeen line types, six
-- surface types. Read out of the live Aptus360 database with
-- export_catalogues.sql, because nothing in that application writes
-- these — they have been maintained directly in SQL and no migration
-- seeds them.
--
-- Utility is matched by NAME, not by id. The two databases allocate
-- their own, and matching on the name is the rule that stopped the
-- asset value import filing 1,270 water agreements under the wrong
-- water scheme. Generating this is what revealed that 0001 seeded only
-- Electric, Gas and Water while the lighting layer names a fourth,
-- "Private Street Lighting" — without it that layer would have come
-- across with no utility and nothing would have said so.
--
-- Two line types arrive INACTIVE, and that is faithful rather than an
-- oversight: trench_joint and trench_sep were retired in Aptus360
-- migration 0239. They are carried because drawings made before that
-- still reference them.
--
-- Colour is NULL on every utility-bearing layer and line type. The
-- canvas takes the colour from the utility in those cases; only the
-- layers with no utility — boundary, plot, trench, note, annotation —
-- carry one of their own.
--
-- Safe to run once. These are catalogues with natural keys, so a
-- second run collides on Layer_Key, Type_Key or Surface_Key rather
-- than silently doubling them.
-- ════════════════════════════════════════════════════════════════════

-- GIS_Layer
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'boundary', 'Site Boundary', '#0f172a', 10, true, NULL;
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'plot', 'Plots', '#2563eb', 20, true, NULL;
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'electric', 'Electric', NULL, 30, true, (SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = 'Electric');
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'gas', 'Gas', NULL, 40, true, (SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = 'Gas');
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'water', 'Water', NULL, 50, true, (SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = 'Water');
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'trench', 'Trenches', '#8b5e34', 60, true, NULL;
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'note', 'Notes', '#64748b', 70, true, NULL;
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'lighting', 'Street Lighting', NULL, 55, true, (SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = 'Private Street Lighting');
INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") SELECT 'annotation', 'Annotation', '#0f172a', 90, true, NULL;
-- GIS_Line_Type
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('elec_main', 'Electric Main', 'electric', NULL, 3.5, false, 10, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('elec_service', 'Electric Service', 'electric', NULL, 1.8, false, 20, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('gas_main', 'Gas Main', 'gas', NULL, 3.5, false, 30, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('gas_service', 'Gas Service', 'gas', NULL, 1.8, false, 40, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('water_main', 'Water Main', 'water', NULL, 3.5, false, 50, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('water_service', 'Water Service', 'water', NULL, 1.8, false, 60, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('trench_joint', 'Joint Trench', 'trench', '#a855f7', 6, false, 70, false);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('trench_sep', 'Separate Trench', 'trench', '#a855f7', 6, true, 80, false);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('trench_main', 'Mains Trench', 'trench', '#8b5e34', 6.0, false, 64, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('trench_service', 'Service Trench', 'trench', '#8b5e34', 3.5, false, 66, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('elec_hv', 'HV Cable', 'electric', '#b91c1c', 4.5, false, 12, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('light_main', 'Lighting Cable', 'lighting', NULL, 2.2, false, 56, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('light_service', 'Lighting Service', 'lighting', NULL, 1.4, false, 58, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('trench_main_existing', 'Existing trench (incumbent)', 'trench', '#9ca3af', 5.0, true, 68, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('elec_main_existing', 'Existing LV main (incumbent)', 'electric', '#a1887f', 3.5, true, 20, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('gas_main_existing', 'Existing gas main (incumbent)', 'gas', '#86a693', 3.5, true, 34, true);
INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") VALUES ('water_main_existing', 'Existing water main (incumbent)', 'water', '#8fa8bf', 3.5, true, 46, true);
-- GIS_Surface_Type
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('footway', 'Footway', NULL, 10, true, 1.45, NULL, NULL, NULL, NULL);
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('carriageway_12', 'Carriageway 1/2', NULL, 20, true, 1.75, NULL, NULL, NULL, NULL);
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('carriageway_34', 'Carriageway 3/4', NULL, 30, true, 2.10, NULL, NULL, NULL, NULL);
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('verge', 'Verge', NULL, 40, true, 0.90, NULL, NULL, NULL, NULL);
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('agricultural', 'Agricultural', NULL, 50, true, 0.85, NULL, NULL, NULL, NULL);
INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") VALUES ('unmade', 'Unmade', NULL, 35, true, 1.0, NULL, NULL, NULL, NULL);
-- 9 layers, 17 line types, 6 surface types
