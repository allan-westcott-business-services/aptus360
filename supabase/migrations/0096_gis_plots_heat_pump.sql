-- ════════════════════════════════════════════════════════════════
-- 0096 — the heat pump model reaches the canvas
--
-- The plot seed editor shows "— None —" for a plot that has a model
-- set. It reads the plot list the canvas holds, which comes from
-- gis_unplaced_plots, and that function returns Heat_Source_ID but not
-- Heat_Pump_Model_ID. So the field is undefined and the picker falls to
-- its empty option, which looks exactly like a plot with no model.
--
-- Worse than a display gap. The editor initialises its form from that
-- undefined value and writes the form back on save, so opening a plot
-- seed and pressing Save cleared the model from a plot that had one.
-- The accompanying change to FeatureEditor.jsx stops it writing a field
-- it never received; this migration makes sure it receives it.
--
-- Fourth time for this function: 0053 added the heat source, 0059 the
-- property config, a later revision the kVA and its source, and now the
-- pump. The pattern is always the same — a caller reads a property the
-- RETURNS TABLE never listed, nothing errors, and undefined reads on
-- screen as a legitimate-looking empty value.
--
-- ── Written from the live function, not from this repo ──────────
-- The definition below is the deployed one as returned by
-- pg_get_functiondef, with a single column added. The copy of this
-- function in this repo's migration history is several revisions behind
-- and does not carry the kVA fallback; replacing the live one with it
-- would silently zero every plot's load. If this migration is ever
-- re-run against a database that has moved on again, check the live
-- definition first rather than trusting this file.
--
-- Adding a column to a RETURNS TABLE needs the function dropped first;
-- CREATE OR REPLACE cannot change a return type.
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
  -- The only addition. Everything else is the live definition unchanged.
  heat_pump_model_id  bigint,
  kva_load            numeric,
  kva_source          text,
  placed              boolean
) AS $$
  SELECT pl."Plot_ID", pl."Plot_Number", pl."Plot_Ref",
         pc."Bedrooms", pc."Code", pl."Property_Config_ID",
         pl."Project_Developer_ID", pl."Heat_Source_ID",
         pl."Heat_Pump_Model_ID",
         COALESCE(pl."KVA_Load", htc."Consumption_kVA"),
         CASE
           WHEN pl."KVA_Load" IS NOT NULL          THEN 'entered'
           WHEN htc."Consumption_kVA" IS NOT NULL  THEN 'house type'
           ELSE 'not set'
         END,
         EXISTS (SELECT 1 FROM "GIS_Feature" f
                  WHERE f."Plot_ID" = pl."Plot_ID" AND f."Feature_Role" = 'plot')
    FROM "Plot" pl
    LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
    LEFT JOIN "House_Type_Consumption" htc
      ON htc."Bedrooms" = pc."Bedrooms"
     AND htc."Heat_Source_ID" = pl."Heat_Source_ID"
   WHERE pl."Project_ID" = p_project
   ORDER BY
     NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
     pl."Plot_Number";
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- The model now comes back alongside the source it belongs to:
--   SELECT plot_number, heat_source_id, heat_pump_model_id, kva_load, kva_source
--     FROM gis_unplaced_plots(<project id>) LIMIT 10;
--
-- The kVA fallback still works — this must not have been lost:
--   SELECT kva_source, COUNT(*) FROM gis_unplaced_plots(<project id>)
--    GROUP BY 1;
--
-- Plots carrying a model whose heating source no longer takes one.
-- These are the ones a Save may already have cleared, or that were set
-- before the source was changed:
--   SELECT pl."Plot_Number", pl."Heat_Source_ID", pl."Heat_Pump_Model_ID"
--     FROM "Plot" pl
--    WHERE pl."Heat_Pump_Model_ID" IS NOT NULL
--      AND pl."Project_ID" = <project id>;
