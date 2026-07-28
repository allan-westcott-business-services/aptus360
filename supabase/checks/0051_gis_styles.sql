-- ════════════════════════════════════════════════════════════════
-- 0051 check — styling rules
--
-- Safe: read-only. Changes nothing.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Did the table and the layer column arrive? ────────────────
-- Expect: one row, both true.
SELECT to_regclass('"GIS_Style"') IS NOT NULL AS have_style_table,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'GIS_Layer' AND column_name = 'Utility_ID') AS have_layer_utility;


-- ── 2. Every rule, most specific first ───────────────────────────
-- This is the order the canvas resolves in: a rule naming an operator
-- beats one naming only a line type, whatever the sort order says.
SELECT s."Style_Name",
       o."Name" AS operator, u."Utility", s."Line_Type", s."Layer_Key", s."Feature_Role",
       s."Colour", s."Width_Px", s."Width_M", s."Scale_Width",
       s."Min_Scale", s."Max_Scale", s."Is_Active",
       (CASE WHEN s."Organisation_ID" IS NOT NULL THEN 16 ELSE 0 END
      + CASE WHEN s."Line_Type"       IS NOT NULL THEN 8  ELSE 0 END
      + CASE WHEN s."Feature_Role"    IS NOT NULL THEN 4  ELSE 0 END
      + CASE WHEN s."Utility_ID"      IS NOT NULL THEN 2  ELSE 0 END
      + CASE WHEN s."Layer_Key"       IS NOT NULL THEN 1  ELSE 0 END) AS specificity
  FROM "GIS_Style" s
  LEFT JOIN "Organisation" o ON o."Organisation_ID" = s."Organisation_ID"
  LEFT JOIN "Utility"      u ON u."Utility_ID"      = s."Utility_ID"
 ORDER BY specificity DESC, s."Sort_Order", s."GIS_Style_ID";


-- ── 3. Which layers found a utility ──────────────────────────────
-- Expect: electric, gas and water matched. boundary, plot, trench and
-- note are correctly null — they aren't a utility.
SELECT l."Layer_Key", l."Label", u."Utility"
  FROM "GIS_Layer" l
  LEFT JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
 ORDER BY l."Sort_Order";


-- ── 4. Line types with no rule of their own ──────────────────────
-- Not a fault: these fall back to their layer's rule. Worth seeing, so
-- an unstyled type is a decision rather than an oversight.
SELECT t."Type_Key", t."Label"
  FROM "GIS_Line_Type" t
 WHERE t."Is_Active"
   AND NOT EXISTS (SELECT 1 FROM "GIS_Style" s WHERE s."Line_Type" = t."Type_Key")
 ORDER BY t."Sort_Order";


-- ── 5. Rules that can never show anything ────────────────────────
-- Expect: no rows. A minimum above the maximum hides the object at
-- every zoom, which looks exactly like the object having been deleted.
SELECT "GIS_Style_ID", "Style_Name", "Min_Scale", "Max_Scale"
  FROM "GIS_Style"
 WHERE "Min_Scale" IS NOT NULL AND "Max_Scale" IS NOT NULL
   AND "Min_Scale" > "Max_Scale";
