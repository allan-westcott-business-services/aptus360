-- ════════════════════════════════════════════════════════════════
-- 0090 — a cable on the feeders already drawn
--
-- Build LV Network now puts the smallest LV mains cable on every run it
-- draws, but only on runs it draws. Anything generated before that
-- carries none, and volt drop reports "cable not set" on it — which is
-- true, and fixable without redrawing the network.
--
-- Smallest is read as highest impedance per km, not by parsing a size
-- label: 95 sorts before 185 as text, but 630 would not, and impedance
-- is the property that actually orders them.
--
-- Restricted to LV mains with figures. A service cable or an HV triplex
-- is not what a feeder is built from, and both have higher impedance
-- than any WAVE — without the restriction they would win outright. An
-- earth cable has the highest of all and no voltage rating at all, which
-- is why an unrated type is excluded rather than allowed through.
--
-- Only where nothing is set. A cable someone chose is a decision.
-- ════════════════════════════════════════════════════════════════

WITH pick AS (
  SELECT s."Cable_Size_ID"
    FROM "Electric_Cable_Size" s
    JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
    JOIN "Voltage_Rating" v ON v."Voltage_Rating_ID" = t."Voltage_Rating_ID"
   WHERE s."Is_Active" AND t."Is_Active"
     AND v."Voltage_Rating" = 'LV'
     AND t."Usage_Type" = 'Mains'
     AND (s."Loop_Impedance_Ohm" IS NOT NULL OR s."Volt_Drop_Base" IS NOT NULL)
   ORDER BY s."Loop_Impedance_Ohm" DESC NULLS LAST, s."Cable_Size_ID"
   LIMIT 1
)
UPDATE "GIS_Feature" f
   SET "Attributes" = jsonb_set(f."Attributes", '{VD_Cable_Size_ID}',
                                to_jsonb((SELECT "Cable_Size_ID" FROM pick)))
 WHERE (f."Attributes" ->> 'Generated')::boolean IS TRUE
   AND f."Attributes" ->> 'Line_Type' = 'elec_main'
   AND f."Attributes" ->> 'VD_Cable_Size_ID' IS NULL
   AND EXISTS (SELECT 1 FROM pick);


-- Span nodes too, for the same reason and by the same rule. The origin
-- is skipped: nothing feeds the substation, and the sum starts at the
-- transformer.
WITH pick AS (
  SELECT s."Cable_Size_ID"
    FROM "Electric_Cable_Size" s
    JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
    JOIN "Voltage_Rating" v ON v."Voltage_Rating_ID" = t."Voltage_Rating_ID"
   WHERE s."Is_Active" AND t."Is_Active"
     AND v."Voltage_Rating" = 'LV'
     AND t."Usage_Type" = 'Mains'
     AND (s."Loop_Impedance_Ohm" IS NOT NULL OR s."Volt_Drop_Base" IS NOT NULL)
   ORDER BY s."Loop_Impedance_Ohm" DESC NULLS LAST, s."Cable_Size_ID"
   LIMIT 1
)
UPDATE "GIS_Feature" f
   SET "Attributes" = jsonb_set(f."Attributes", '{VD_Cable_Size_ID}',
                                to_jsonb((SELECT "Cable_Size_ID" FROM pick)))
 WHERE f."Feature_Role" = 'spannode'
   AND COALESCE((f."Attributes" ->> 'Span_Seq')::int, -1) <> 0
   AND f."Attributes" ->> 'VD_Cable_Size_ID' IS NULL
   AND EXISTS (SELECT 1 FROM pick);


-- ── Check ───────────────────────────────────────────────────────
-- Which cable was chosen, and whether it is the one you expect:
--   SELECT t."Cable_Type", s."Size_Label", s."Loop_Impedance_Ohm", s."Volt_Drop_Base"
--     FROM "Electric_Cable_Size" s
--     JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
--     JOIN "Voltage_Rating" v ON v."Voltage_Rating_ID" = t."Voltage_Rating_ID"
--    WHERE s."Is_Active" AND t."Is_Active" AND v."Voltage_Rating" = 'LV'
--      AND t."Usage_Type" = 'Mains'
--      AND (s."Loop_Impedance_Ohm" IS NOT NULL OR s."Volt_Drop_Base" IS NOT NULL)
--    ORDER BY s."Loop_Impedance_Ohm" DESC NULLS LAST LIMIT 3;
--
-- What now carries a cable, by circuit:
--   SELECT f."Attributes" ->> 'Circuit_Letter' AS circuit,
--          f."Feature_Role", COUNT(*) AS features,
--          COUNT(f."Attributes" ->> 'VD_Cable_Size_ID') AS with_cable
--     FROM "GIS_Feature" f
--    WHERE f."Project_ID" = <project>
--      AND (f."Feature_Role" = 'spannode'
--           OR f."Attributes" ->> 'Line_Type' = 'elec_main')
--    GROUP BY 1, 2 ORDER BY 1, 2;
--
-- Expect only the origin: a span node still without one.
--   SELECT f."Attributes" ->> 'Span_Label' AS node
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Role" = 'spannode'
--      AND f."Attributes" ->> 'VD_Cable_Size_ID' IS NULL;
