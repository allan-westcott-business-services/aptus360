-- ════════════════════════════════════════════════════════════════════
--  Export the three drawing catalogues
-- ════════════════════════════════════════════════════════════════════
--
-- Run in the Supabase SQL editor on the LIVE Aptus360 database.
-- Read-only: it reads three tables and writes nothing.
--
-- GIS_Layer, GIS_Line_Type and GIS_Surface_Type decide what the canvas
-- can draw — which layers exist, which line types sit on each, and
-- what surfaces a trench can be dug through. Nothing in the
-- application writes them; they have been maintained directly in SQL,
-- which is why they are not seeded by any migration and have to be
-- read out of the live database.
--
-- The result is one column of INSERT statements. Copy the whole column
-- and send it back, and it becomes migration 0003 of the GIS database.
--
-- Utility_ID is deliberately resolved to the utility's NAME rather
-- than carried across as a number. The two databases allocate their
-- own ids, and matching on the name is the rule that stopped the asset
-- value import filing 1,270 water agreements under the wrong scheme.
--
-- Booleans are rendered ::text. format('%s') on a boolean gives t and
-- f, which look fine in a result grid and are not SQL literals — the
-- generated statements fail with "column t does not exist". Found by
-- running the output rather than reading it.
-- ════════════════════════════════════════════════════════════════════

SELECT line FROM (

  SELECT 0 AS ord, 0 AS sub, '-- GIS_Layer' AS line

  UNION ALL
  SELECT 1, l."Layer_ID",
         format('INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order","Is_Active","Utility_ID") '
             || 'SELECT %L, %L, %L, %s, %s, %s;',
           l."Layer_Key", l."Label", l."Colour", l."Sort_Order", l."Is_Active"::text,
           CASE WHEN u."Utility" IS NULL THEN 'NULL'
                ELSE format('(SELECT "Utility_ID" FROM "Utility" WHERE "Utility" = %L)', u."Utility")
           END)
    FROM "GIS_Layer" l
    LEFT JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"

  UNION ALL
  SELECT 2, 0, ''
  UNION ALL
  SELECT 3, 0, '-- GIS_Line_Type'

  UNION ALL
  SELECT 4, t."Line_Type_ID",
         format('INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active") '
             || 'VALUES (%L, %L, %L, %L, %s, %s, %s, %s);',
           t."Type_Key", t."Label", t."Layer_Key", t."Colour",
           t."Width_px", t."Dashed"::text, t."Sort_Order", t."Is_Active"::text)
    FROM "GIS_Line_Type" t

  UNION ALL
  SELECT 5, 0, ''
  UNION ALL
  SELECT 6, 0, '-- GIS_Surface_Type'

  UNION ALL
  SELECT 7, s."GIS_Surface_Type_ID",
         format('INSERT INTO "GIS_Surface_Type" ("Surface_Key","Label","Reinstatement_Rate","Sort_Order","Is_Active","Dig_Factor","Reinstate_M2_Hr","Reinstate_Source","Reinstate_Sample_Size","Reinstate_Setup_Minutes") '
             || 'VALUES (%L, %L, %s, %s, %s, %s, %s, %s, %s, %s);',
           s."Surface_Key", s."Label",
           COALESCE(s."Reinstatement_Rate"::text, 'NULL'),
           s."Sort_Order", s."Is_Active"::text, s."Dig_Factor",
           COALESCE(s."Reinstate_M2_Hr"::text, 'NULL'),
           COALESCE(quote_literal(s."Reinstate_Source"), 'NULL'),
           COALESCE(s."Reinstate_Sample_Size"::text, 'NULL'),
           COALESCE(s."Reinstate_Setup_Minutes"::text, 'NULL'))
    FROM "GIS_Surface_Type" s

  -- A count at the end, so a truncated copy is obvious rather than
  -- silently short.
  UNION ALL
  SELECT 8, 0, ''
  UNION ALL
  SELECT 9, 0, format('-- %s layers, %s line types, %s surface types',
                      (SELECT count(*) FROM "GIS_Layer"),
                      (SELECT count(*) FROM "GIS_Line_Type"),
                      (SELECT count(*) FROM "GIS_Surface_Type"))

) x ORDER BY ord, sub;
