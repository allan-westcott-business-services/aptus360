-- ════════════════════════════════════════════════════════════════
-- 0050 check — trench types, and whether the old pair is still in use
--
-- Safe: read-only. Changes nothing.
--
-- Run query 1 BEFORE 0050's guarded deactivation, so you know whether
-- it will do anything. A non-zero count means that type is drawn on a
-- real project and 0050 will leave it active on purpose.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Is anything drawn with the original pair? ─────────────────
-- Expect: two rows. features = 0 means nothing uses it and 0050's
-- guard will deactivate it. Anything above 0 and it stays.
SELECT t."Type_Key",
       t."Label",
       t."Is_Active",
       COUNT(f."Feature_ID") AS features,
       COUNT(DISTINCT f."Project_ID") AS projects
  FROM "GIS_Line_Type" t
  LEFT JOIN "GIS_Feature" f
    ON f."Attributes" ->> 'Line_Type' = t."Type_Key"
 WHERE t."Type_Key" IN ('trench_joint','trench_sep')
 GROUP BY t."Type_Key", t."Label", t."Is_Active"
 ORDER BY t."Type_Key";


-- ── 2. The trench layer as the picker will show it ───────────────
-- Expect: trench_main and trench_service present, active, both
-- #8b5e34, not dashed, mains the wider of the two.
SELECT "Type_Key", "Label", "Colour", "Width_px", "Dashed", "Sort_Order", "Is_Active"
  FROM "GIS_Line_Type"
 WHERE "Layer_Key" = 'trench'
 ORDER BY "Sort_Order";


-- ── 3. Does the legend swatch match the lines? ───────────────────
-- Expect: one row, #8b5e34. The Layers panel reads this, the lines
-- read GIS_Line_Type, and they should agree.
SELECT "Layer_Key", "Label", "Colour"
  FROM "GIS_Layer"
 WHERE "Layer_Key" = 'trench';


-- ── 4. Trench lengths, once some are drawn ───────────────────────
-- Length_m is maintained by gis_length_trg on insert and on any change
-- to Geometry, so this needs no recalculation — it is what dragging a
-- vertex, deleting one, or joining two trenches has already produced.
SELECT f."Project_ID",
       f."Attributes" ->> 'Line_Type'            AS line_type,
       COUNT(*)                                  AS runs,
       ROUND(SUM((f."Attributes" ->> 'Length_m')::numeric), 1) AS total_m
  FROM "GIS_Feature" f
 WHERE f."Layer_Key" = 'trench'
   AND f."Feature_Type" = 'line'
 GROUP BY f."Project_ID", f."Attributes" ->> 'Line_Type'
 ORDER BY f."Project_ID", line_type;


-- ── 5. Any trench whose cached length disagrees with its geometry ─
-- Expect: no rows. Rows here would mean something wrote Geometry
-- without going through the trigger.
SELECT f."Feature_ID",
       (f."Attributes" ->> 'Length_m')::numeric AS cached,
       ROUND(gis_line_length(f."Geometry"), 4)  AS from_geometry
  FROM "GIS_Feature" f
 WHERE f."Feature_Type" = 'line'
   AND f."Layer_Key" = 'trench'
   AND ROUND((f."Attributes" ->> 'Length_m')::numeric, 4)
       IS DISTINCT FROM ROUND(gis_line_length(f."Geometry"), 4);
