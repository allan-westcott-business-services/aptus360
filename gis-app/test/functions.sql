-- Do the ten functions actually work on this schema?
--
-- Compiling proves nothing: three of them were reworked, and the
-- interesting failures are at run time — a NOT NULL that only bites on
-- insert, a table that is no longer there, a trigger that was never
-- attached to the new table.
--
-- Run after isolation.sql on the same scratch database, which leaves
-- two accounts with a project each.

\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '════ A. gis_line_length — pure arithmetic ════'
SELECT gis_line_length('[[0,0],[3,4]]'::jsonb)          AS "3-4-5 triangle, expect 5.00",
       gis_line_length('[[0,0],[10,0],[10,10]]'::jsonb) AS "two legs, expect 20.00",
       gis_line_length('[[0,0]]'::jsonb)                AS "one point, expect 0";

\echo ''
\echo '════ B. gis_point_in_ring — including the vertex case ════'
SELECT gis_point_in_ring(5, 5, '[[0,0],[10,0],[10,10],[0,10]]'::jsonb) AS "inside, expect t",
       gis_point_in_ring(15, 5, '[[0,0],[10,0],[10,10],[0,10]]'::jsonb) AS "outside, expect f",
       -- The asymmetric comparison exists for this: a point level with
       -- a horizontal edge, which on a grid-planned site is common.
       gis_point_in_ring(5, 0, '[[0,0],[10,0],[10,10],[0,10]]'::jsonb) AS "on bottom edge",
       gis_point_in_ring(5, 5, '[[0,0],[10,0]]'::jsonb) AS "not a ring, expect f";

\echo ''
\echo '════ C. gis_length_trg — does the trigger fill Length_m? ════'
\echo '      This is the trigger behind the bill of materials. It is'
\echo '      attached to a NEW table, so being in 0002 is not enough.'
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label")
VALUES (1, 1, 'trench', 'line', '[[0,0],[30,0]]'::jsonb, 'measured trench');
SELECT "Label", "Attributes" ->> 'Length_m' AS "Length_m, expect 30.00"
  FROM "GIS_Feature" WHERE "Label" = 'measured trench';

\echo '      -- and on UPDATE of the geometry:'
UPDATE "GIS_Feature" SET "Geometry" = '[[0,0],[45,0]]'::jsonb WHERE "Label" = 'measured trench';
SELECT "Attributes" ->> 'Length_m' AS "after update, expect 45.00"
  FROM "GIS_Feature" WHERE "Label" = 'measured trench';

\echo ''
\echo '════ D. gis_project_utilities — REWORKED, reads Project_Utility ════'
INSERT INTO "Project_Utility" ("Project_ID","Account_ID","Utility_ID")
SELECT 1, 1, "Utility_ID" FROM "Utility" WHERE "Utility" IN ('Electric','Water');
SELECT * FROM gis_project_utilities(1);
\echo '      expect Electric/electric and Water/water, not Gas'

\echo ''
\echo '════ E. gis_seed_reference — unchanged, reads Project eastings ════'
UPDATE "Project" SET "Eastings" = 412000, "Northings" = 398000 WHERE "Project_ID" = 1;
INSERT INTO "GIS_Basemap" ("Project_ID","Account_ID","Image_Url") VALUES (1, 1, 'x.png');
SELECT gis_seed_reference(1) AS "expect t";
SELECT "Ref_Easting", "Ref_Northing" FROM "GIS_Basemap" WHERE "Project_ID" = 1;
\echo '      -- second call must be false: already calibrated'
SELECT gis_seed_reference(1) AS "expect f";

\echo ''
\echo '════ F. gis_to_grid — canvas to national grid ════'
SELECT * FROM gis_to_grid(1, 100, 50);
\echo '      expect easting 412100, northing 397950 (y is inverted)'

\echo ''
\echo '════ G. gis_place_joints — REWORKED for NOT NULL Account_ID ════'
\echo '      Two lines meeting at a point should get a straight joint;'
\echo '      three should get a tee.'
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry") VALUES
  (1, 1, 'trench', 'line', '[[100,100],[200,100]]'::jsonb),
  (1, 1, 'trench', 'line', '[[200,100],[300,100]]'::jsonb),
  (1, 1, 'trench', 'line', '[[200,100],[200,200]]'::jsonb);
-- Expect 2, and the second one is the test keeping itself honest.
-- The tee is the three lines above meeting at (200,100). The straight
-- joint is at (0,0), where the trench from block C meets the Westcott
-- cable that isolation.sql left there. A joint finder that only saw
-- the lines it was pointed at would miss it.
SELECT gis_place_joints(1) AS "joints placed, expect 2";
SELECT "Label", "Attributes" ->> 'Joint_Type' AS kind,
       "Attributes" ->> 'Ways_In' AS ways, "Account_ID"
  FROM "GIS_Feature" WHERE "Attributes" ? 'Joint_Type';
\echo '      Account_ID must be 1, taken from the project, not passed in'
\echo '      -- running it again must place nothing (a joint is already there):'
SELECT gis_place_joints(1) AS "expect 0";

\echo ''
\echo '════ H. gis_place_joints on an invisible project (MUST FAIL) ════'
\echo '      A project the caller cannot see has no account to draw on.'
SET ROLE app_user;
SET "test.uid" = '11111111-1111-1111-1111-111111111111';
SELECT gis_place_joints(2);
RESET ROLE;

\echo ''
\echo '════ I. gis_trace_network — numbering outward from a source ════'
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label")
VALUES (1, 1, 'electric', 'point', '[[0,500]]'::jsonb, 'substation')
RETURNING "Feature_ID" AS substation_id \gset sub_
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label","Attributes")
VALUES (1, 1, 'electric', 'line', '[[0,500],[50,500]]'::jsonb, 'way 1 hop A',
        jsonb_build_object('Connects', jsonb_build_array(:sub_substation_id)));
SELECT gis_trace_network(1, :sub_substation_id) AS "features numbered, expect 1";
SELECT "Label", "Attributes" ->> 'Way' AS way, "Attributes" ->> 'Hop_Letter' AS hop
  FROM "GIS_Feature" WHERE "Attributes" ? 'Way';

\echo ''
\echo '════ J. gis_assign_meters — nearest cable to a plot ════'
INSERT INTO "Plot" ("Project_ID","Account_ID","Plot_Number") VALUES (1, 1, '42')
RETURNING "Plot_ID" \gset plot_
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label","Plot_ID","Feature_Role")
VALUES (1, 1, 'plot', 'point', '[[205,105]]'::jsonb, 'plot 42', :plot_Plot_ID, 'plot');
SELECT gis_assign_meters(1) AS "plots assigned, expect 1";
SELECT "Label", "Attributes" ->> 'Meter_Distance_m' AS distance
  FROM "GIS_Feature" WHERE "Attributes" ? 'Meter_Cable';
\echo '      expect 7.1, and that number is worth understanding:'
\echo '      the plot sits at (205,105) and the nearest trench VERTEX is'
\echo '      (200,100) — 7.07m diagonally. The nearest POINT on the line'
\echo '      is 5m directly below. gis_assign_meters measures to vertices,'
\echo '      not perpendicular to segments, so a plot beside the middle of'
\echo '      a long straight cable reads as far from it. Carried across as'
\echo '      it behaves today; changing it is a decision, not a port.'

\echo ''
\echo '════ K. gis_plot_developer — one boundary claims the plot ════'
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label","Attributes")
VALUES (1, 1, 'boundary', 'polygon', '[[150,50],[350,50],[350,250],[150,250]]'::jsonb,
        'Barratt parcel', '{"Project_Developer_ID": 77}'::jsonb);
SELECT gis_plot_developer(:plot_Plot_ID) AS "expect 77";
\echo '      -- a second boundary claiming it too must give NULL, not a guess:'
INSERT INTO "GIS_Feature" ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label","Attributes")
VALUES (1, 1, 'boundary', 'polygon', '[[150,50],[350,50],[350,250],[150,250]]'::jsonb,
        'Persimmon parcel', '{"Project_Developer_ID": 88}'::jsonb);
SELECT gis_plot_developer(:plot_Plot_ID) AS "expect NULL";

\echo ''
\echo '════ L. The catalogues came across whole ════'
SELECT (SELECT count(*) FROM "GIS_Layer")        AS "layers, expect 9",
       (SELECT count(*) FROM "GIS_Line_Type")    AS "line types, expect 17",
       (SELECT count(*) FROM "GIS_Surface_Type") AS "surfaces, expect 6";

\echo ''
\echo '════ M. Every layer that names a utility actually resolved it ════'
\echo '      A missing utility makes the subquery return NULL rather'
\echo '      than fail, so an unlinked layer is silent. This is the'
\echo '      check that makes it loud. Expect no rows.'
SELECT l."Layer_Key", l."Label"
  FROM "GIS_Layer" l
 WHERE l."Layer_Key" IN ('electric','gas','water','lighting')
   AND l."Utility_ID" IS NULL;

\echo ''
\echo '      -- and what each one resolved TO:'
SELECT l."Layer_Key", u."Utility"
  FROM "GIS_Layer" l JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
 ORDER BY l."Sort_Order";

\echo ''
\echo '════ N. Every line type sits on a layer that exists ════'
\echo '      Expect no rows. GIS_Line_Type.Layer_Key is a bare text'
\echo '      column with no foreign key behind it, here or in Aptus360,'
\echo '      so a typo in a catalogue is a line type nothing can draw.'
SELECT t."Type_Key", t."Layer_Key"
  FROM "GIS_Line_Type" t
 WHERE NOT EXISTS (SELECT 1 FROM "GIS_Layer" l WHERE l."Layer_Key" = t."Layer_Key");
