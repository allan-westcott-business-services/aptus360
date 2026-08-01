-- ════════════════════════════════════════════════════════════════
-- 0097 — an ASHP plot's load follows the unit fitted to it
--
-- Until now every plot read a single figure from House_Type_Consumption
-- keyed on bedrooms and heating source. For an air source plot that is
-- now composed instead:
--
--   load = the GAS BOILER figure for the bedroom count
--        + the fitted unit's Rated_Power_kVA ÷ 2
--
-- The gas figure standing in for the dwelling's own demand, and half the
-- pump's rating for the heating on top of it. The ASHP rows in
-- House_Type_Consumption stop being read for air source plots — they are
-- left in place rather than deleted, because nothing else should depend
-- on them and removing reference data is not this migration's business.
--
-- This is the connection 0081 left open: "the load a plot draws follows
-- from the unit fitted to it. That connection is not made here — it
-- changes how every plot is costed, and is worth doing deliberately."
--
-- ── It changes what every ASHP plot costs ───────────────────────
-- Circuit totals, POC headroom and anything quoted from them all move.
-- supabase/checks/ashp_load_preview.sql shows the before and after per
-- house type without altering anything; run it first.
--
-- ── Air source only ─────────────────────────────────────────────
-- GSHP keeps reading its own House_Type_Consumption row. The heat pump
-- register is the MCS list of air source units, so a ground source plot
-- has no model to halve, and the rule has nothing to work from. Same
-- test the application uses for whether to offer the model picker, so
-- the two cannot disagree about which plots are affected.
--
-- ── An ASHP plot with no model reads as no load ─────────────────
-- Deliberate, and the part most worth arguing with. The rule needs a
-- unit; without one there is no honest figure. Falling back to the old
-- ASHP row would produce a number that looks like the others and is
-- arrived at differently, and it would understate — which is the
-- dangerous direction for a supply. So it reports 'not set' and shows as
-- a visible gap. Check how many plots that affects before running:
-- the query at the foot of ashp_load_preview.sql counts them.
--
-- Written from the deployed function as returned by pg_get_functiondef,
-- with the load expression replaced. The copy in this repo's history is
-- several revisions behind.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS gis_unplaced_plots(bigint);

CREATE OR REPLACE FUNCTION gis_unplaced_plots(p_project bigint)
RETURNS TABLE (
  plot_id             bigint,
  plot_number         text,
  plot_ref            text,
  bedrooms            integer,
  config_code         text,
  property_config_id  bigint,
  developer_id        bigint,
  heat_source_id      bigint,
  heat_pump_model_id  bigint,
  kva_load            numeric,
  kva_source          text,
  placed              boolean
) AS $$
  WITH gas AS (
    -- The gas boiler source, found by name rather than by id: the ids
    -- are whatever the table was seeded with, and a lookup renamed in
    -- Admin should still work. Ordered and limited so a second matching
    -- row cannot make the join non-deterministic.
    SELECT h."Heat_Source_ID"
    FROM "Heat_Source" h
    WHERE h."Heat_Source" ILIKE '%gas%'
    ORDER BY h."Heat_Source_ID"
    LIMIT 1
  )
  SELECT pl."Plot_ID", pl."Plot_Number", pl."Plot_Ref",
         pc."Bedrooms", pc."Code", pl."Property_Config_ID",
         pl."Project_Developer_ID", pl."Heat_Source_ID",
         pl."Heat_Pump_Model_ID",
         COALESCE(
           -- A figure entered on the plot still wins over everything.
           pl."KVA_Load",
           CASE
             WHEN hs."Heat_Source" ~* '(^|[^a-z])ashp([^a-z]|$)|air\s*source'
               -- Null if either part is missing, rather than treating an
               -- absent half as zero: half a load is not a load.
               --
               -- Rounded, because dividing a numeric carries the result
               -- out to twenty places and that figure is quoted, summed
               -- and exported. Two decimals matches how loads are held
               -- everywhere else.
               THEN ROUND(gtc."Consumption_kVA" + hpm."Rated_Power_kVA" / 2, 2)
             ELSE htc."Consumption_kVA"
           END
         ),
         CASE
           WHEN pl."KVA_Load" IS NOT NULL THEN 'entered'
           WHEN hs."Heat_Source" ~* '(^|[^a-z])ashp([^a-z]|$)|air\s*source' THEN
             CASE
               WHEN gtc."Consumption_kVA" IS NOT NULL
                AND hpm."Rated_Power_kVA" IS NOT NULL THEN 'heat pump'
               -- Named separately so the gap says which half is absent.
               WHEN hpm."Rated_Power_kVA" IS NULL      THEN 'no heat pump'
               ELSE 'no gas base'
             END
           WHEN htc."Consumption_kVA" IS NOT NULL THEN 'house type'
           ELSE 'not set'
         END,
         EXISTS (SELECT 1 FROM "GIS_Feature" f
                  WHERE f."Plot_ID" = pl."Plot_ID" AND f."Feature_Role" = 'plot')
    FROM "Plot" pl
    LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
    LEFT JOIN "Heat_Source" hs     ON hs."Heat_Source_ID" = pl."Heat_Source_ID"
    LEFT JOIN "Heat_Pump_Model" hpm
      ON hpm."Heat_Pump_Model_ID" = pl."Heat_Pump_Model_ID"
    -- The plot's own heating source, for everything that is not air source.
    LEFT JOIN "House_Type_Consumption" htc
      ON htc."Bedrooms" = pc."Bedrooms"
     AND htc."Heat_Source_ID" = pl."Heat_Source_ID"
    -- The gas boiler row for the same bedroom count, which is the base an
    -- air source plot builds on.
    LEFT JOIN "House_Type_Consumption" gtc
      ON gtc."Bedrooms" = pc."Bedrooms"
     AND gtc."Heat_Source_ID" = (SELECT "Heat_Source_ID" FROM gas)
   WHERE pl."Project_ID" = p_project
   ORDER BY
     NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
     pl."Plot_Number";
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- Where every plot's figure now comes from. 'no heat pump' is the count
-- worth watching — those plots have no load at all until a model is set:
--   SELECT kva_source, COUNT(*) FROM gis_unplaced_plots(<project id>)
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- The composition on a few plots, to check it against a hand sum:
--   SELECT plot_number, bedrooms, heat_pump_model_id, kva_load, kva_source
--     FROM gis_unplaced_plots(<project id>) LIMIT 10;
--
-- To go back to the previous behaviour, re-run 0096.
