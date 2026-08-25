-- Where everything stands. One row per thing worth knowing, with what
-- it should say next to what it does say.
--
-- Read the "state" column: OK means done, and anything else names what
-- is still outstanding.

WITH chk AS (
  SELECT 1 AS ord, '0189  cable sizes'        AS item, '37'      AS expected,
         (SELECT count(*)::text FROM "Electric_Cable_Size") AS actual
  UNION ALL SELECT 2, '0189  cable types', '13',
         (SELECT count(*)::text FROM "Electric_Cable_Type")
  UNION ALL SELECT 3, '0189  impedance matrix', '66',
         (SELECT count(*)::text FROM "Electric_Impedance")
  UNION ALL SELECT 4, '0190  joint allowance (m)', '3',
         (SELECT COALESCE("Joint_Equivalent_M"::text,'NULL') FROM "Electric_VD_Setting" LIMIT 1)
  UNION ALL SELECT 5, '0191  cable 51 rating A', '174',
         (SELECT COALESCE("Rating_Amps"::text,'NULL') FROM "Electric_Cable_Size" WHERE "Cable_Size_ID"=51)
  UNION ALL SELECT 6, '0191  cable 51 vd base', '3094',
         (SELECT COALESCE("Volt_Drop_Base"::text,'NULL') FROM "Electric_Cable_Size" WHERE "Cable_Size_ID"=51)
  UNION ALL SELECT 7, '0191  cable 51 loop Z', '0.9785',
         (SELECT COALESCE("Loop_Impedance_Ohm"::text,'NULL') FROM "Electric_Cable_Size" WHERE "Cable_Size_ID"=51)
  UNION ALL SELECT 8, '0192  scopes defaulted to 51', '1 or more',
         (SELECT count(*)::text FROM "Project_Scope" WHERE "Default_Service_Cable_Size_ID"=51)
  UNION ALL SELECT 9, '0193  transformers', '5',
         (SELECT count(*)::text FROM "Electric_Transformer_Size")
  UNION ALL SELECT 10, '0193  duplicate ratings', '0',
         (SELECT count(*)::text FROM (SELECT "Rating_kVA" FROM "Electric_Transformer_Size"
                                       GROUP BY 1 HAVING count(*) > 1) d)
  UNION ALL SELECT 11, '      impedance rows orphaned', '0',
         (SELECT count(*)::text FROM "Electric_Impedance" i
           WHERE NOT EXISTS (SELECT 1 FROM "Electric_Transformer_Size" t
                              WHERE t."Transformer_Size_ID" = i."Transformer_Size_ID"))
  UNION ALL SELECT 12, '      transformers with no loop Z', '0',
         (SELECT count(*)::text FROM "Electric_Transformer_Size" WHERE "Loop_Impedance_Ohm" IS NULL)
  UNION ALL SELECT 13, '      mains cables with figures', '6',
         (SELECT count(*)::text FROM "Electric_Cable_Size"
           WHERE "Loop_Impedance_Ohm" IS NOT NULL AND "Volt_Drop_Base" IS NOT NULL)
  UNION ALL SELECT 14, '      services with no cable set', '0',
         (SELECT count(*)::text FROM "GIS_Feature"
           WHERE "Feature_Type"='line' AND "Layer_Key"='electric'
             AND "Attributes"->>'Line_Type' ILIKE '%service%'
             AND "Attributes"->>'VD_Cable_Size_ID' IS NULL)
  UNION ALL SELECT 15, '      origins with no source impedance', '0',
         (SELECT count(*)::text FROM "GIS_Feature" f
           WHERE f."Layer_Key"='electric'
             AND f."Feature_Role" IN ('poc','substation')
             AND COALESCE(
                   NULLIF(f."Attributes"->>'Source_Loop_Impedance_Ohm',''),
                   NULLIF(f."Attributes"->>'VD_Transformer_Size_ID','')) IS NULL)
  UNION ALL SELECT 16, '      POCs with output voltage 240', '0',
         (SELECT count(*)::text FROM "GIS_Feature"
           WHERE "Layer_Key"='electric' AND "Feature_Role"='poc'
             AND "Attributes"->>'Output_V' = '240')
)
SELECT item, expected, actual,
       CASE
         WHEN item LIKE '0192%' THEN CASE WHEN actual <> '0' THEN 'OK' ELSE 'not run' END
         WHEN expected = actual THEN 'OK'
         WHEN actual = 'NULL'   THEN '-- not run'
         ELSE '-- CHECK'
       END AS state
  FROM chk ORDER BY ord;
