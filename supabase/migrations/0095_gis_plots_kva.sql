-- ════════════════════════════════════════════════════════════════
-- 0095 — the plot's load reaches the canvas
--
-- The circuit report shows every meter at 0 kVA. It reads the load from
-- the plot list the canvas holds, which comes from gis_unplaced_plots,
-- and that function has never returned it. So plot?.kva_load is
-- undefined on every row and each meter falls through to the fallback,
-- which is zero.
--
-- Third time for this function. 0053 added the heat source, 0059 the
-- property config, and both say the same thing: a caller assumed a
-- column was coming back that the RETURNS TABLE never listed. Nothing
-- fails when that happens — the field is simply undefined, and undefined
-- reads on screen as a legitimate-looking zero.
--
-- Adding a column to a RETURNS TABLE needs the function dropped first;
-- CREATE OR REPLACE cannot change a return type.
--
-- ── This migration alone will not fix the report ────────────────
-- It carries the load through to the canvas, but there has to be a load
-- to carry. Plot.KVA_Load is currently null on every plot, because
-- 0080_default_plot_kva.sql has not been run against this database. Run
-- 0080 first, or this returns null for every row and the report still
-- reads zero.
--
-- 0080 sets every plot to 2.2 kVA. That is a placeholder, not reference
-- data — a circuit's total will look authoritative and will be 2.2 times
-- the number of houses on it until real per-house-type figures arrive.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS gis_unplaced_plots(bigint);

CREATE OR REPLACE FUNCTION gis_unplaced_plots(p_project bigint)
RETURNS TABLE (
  plot_id            bigint,
  plot_number        text,
  plot_ref           text,
  bedrooms           integer,
  config_code        text,
  property_config_id bigint,
  developer_id       bigint,
  heat_source_id     bigint,
  -- Left as it is on the row, null included. A plot with no load
  -- recorded is not a plot with no load, and the two have to stay
  -- distinguishable all the way to the screen — substituting a zero
  -- here would hide the very gap this migration exists to expose.
  kva_load           numeric,
  placed             boolean
) AS $$
  SELECT pl."Plot_ID", pl."Plot_Number", pl."Plot_Ref",
         pc."Bedrooms", pc."Code", pl."Property_Config_ID",
         pl."Project_Developer_ID", pl."Heat_Source_ID",
         pl."KVA_Load",
         EXISTS (SELECT 1 FROM "GIS_Feature" f
                  WHERE f."Plot_ID" = pl."Plot_ID" AND f."Feature_Role" = 'plot')
    FROM "Plot" pl
    LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
   WHERE pl."Project_ID" = p_project
   ORDER BY
     NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
     pl."Plot_Number";
$$ LANGUAGE sql STABLE;


-- ── Check ───────────────────────────────────────────────────────
-- The column now comes back. Expect a figure per plot, not null:
--   SELECT plot_number, kva_load FROM gis_unplaced_plots(<project id>)
--    ORDER BY plot_number LIMIT 20;
--
-- Plots still without a load — these are the ones that will read as
-- "no load recorded" on the circuit report:
--   SELECT COUNT(*) FROM gis_unplaced_plots(<project id>) WHERE kva_load IS NULL;
