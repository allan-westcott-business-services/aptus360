/* What the ASHP rule would change, before changing it.

   The proposed load for an ASHP plot is the gas boiler figure for its
   bedroom count plus half the fitted unit's rated power, in place of the
   ASHP row it reads today. This runs the comparison without altering
   anything, because the rule moves the load on every ASHP plot and the
   site total behind it — worth seeing on real plots first.

   Matched on the heat source's name rather than its id, the way the
   application does: the ids are whatever the table was seeded with, and
   a lookup renamed in Admin should still work. */

WITH gas AS (
  SELECT h."Heat_Source_ID"
  FROM "Heat_Source" h
  WHERE h."Heat_Source" ILIKE '%gas%'
  ORDER BY h."Heat_Source_ID"
  LIMIT 1
)
SELECT
  p."Project_Ref",
  pc."Bedrooms",
  hs."Heat_Source",
  hpm."Model"                              AS heat_pump,
  hpm."Rated_Power_kVA"                    AS pump_kva,
  htc."Consumption_kVA"                    AS now_kva,
  gtc."Consumption_kVA"                    AS gas_base,
  ROUND(gtc."Consumption_kVA" + hpm."Rated_Power_kVA" / 2, 2) AS proposed_kva,
  ROUND(gtc."Consumption_kVA" + hpm."Rated_Power_kVA" / 2
        - htc."Consumption_kVA", 2)        AS change_per_plot,
  COUNT(*)                                 AS plots,
  ROUND(SUM(htc."Consumption_kVA"), 1)     AS now_total,
  ROUND(SUM(gtc."Consumption_kVA" + hpm."Rated_Power_kVA" / 2), 1) AS proposed_total
FROM "Plot" pl
JOIN "Project" p           ON p."Project_ID" = pl."Project_ID"
LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
LEFT JOIN "Heat_Source" hs ON hs."Heat_Source_ID" = pl."Heat_Source_ID"
LEFT JOIN "Heat_Pump_Model" hpm ON hpm."Heat_Pump_Model_ID" = pl."Heat_Pump_Model_ID"
LEFT JOIN "House_Type_Consumption" htc
       ON htc."Bedrooms" = pc."Bedrooms"
      AND htc."Heat_Source_ID" = pl."Heat_Source_ID"
LEFT JOIN "House_Type_Consumption" gtc
       ON gtc."Bedrooms" = pc."Bedrooms"
      AND gtc."Heat_Source_ID" = (SELECT "Heat_Source_ID" FROM gas)
WHERE hs."Heat_Source" ~* '(^|[^a-z])ashp([^a-z]|$)|air\s*source'
GROUP BY 1, 2, 3, 4, 5, 6, 7
ORDER BY 1, 2;


/* Plots the rule cannot price, because it needs a fitted unit and there
   isn't one. Run this too — under the proposed rule these read as no
   load at all rather than falling back to a house type figure, which is
   deliberate but only safe if the list is short.

--  SELECT p."Project_Ref", COUNT(*) AS ashp_plots_without_a_model
--    FROM "Plot" pl
--    JOIN "Project" p ON p."Project_ID" = pl."Project_ID"
--    LEFT JOIN "Heat_Source" hs ON hs."Heat_Source_ID" = pl."Heat_Source_ID"
--   WHERE hs."Heat_Source" ~* '(^|[^a-z])ashp([^a-z]|$)|air\s*source'
--     AND pl."Heat_Pump_Model_ID" IS NULL
--   GROUP BY 1;
*/
