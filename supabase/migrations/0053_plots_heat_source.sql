-- ════════════════════════════════════════════════════════════════
-- 0053 — heat source on the placement list
--
-- Auto Service places one meter per utility at each plot seed, but an
-- electric-only plot must not get a gas meter. The original read the
-- plot's heat source to decide. gis_unplaced_plots doesn't return it, so
-- the canvas has no way to know and would put a gas meter on every plot
-- — a meter that gets designed, costed and quoted for.
--
-- Adding a column to a RETURNS TABLE needs the function dropped first.
-- CREATE OR REPLACE cannot change a return type, and the error it gives
-- ("cannot change return type of existing function") reads like a
-- permissions problem rather than the real cause.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS gis_unplaced_plots(bigint);

CREATE OR REPLACE FUNCTION gis_unplaced_plots(p_project bigint)
RETURNS TABLE (
  plot_id        bigint,
  plot_number    text,
  plot_ref       text,
  bedrooms       integer,
  config_code    text,
  developer_id   bigint,
  heat_source_id bigint,
  placed         boolean
) AS $$
  SELECT pl."Plot_ID", pl."Plot_Number", pl."Plot_Ref",
         pc."Bedrooms", pc."Code", pl."Project_Developer_ID",
         pl."Heat_Source_ID",
         EXISTS (SELECT 1 FROM "GIS_Feature" f
                  WHERE f."Plot_ID" = pl."Plot_ID" AND f."Feature_Role" = 'plot')
    FROM "Plot" pl
    LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
   WHERE pl."Project_ID" = p_project
   ORDER BY
     -- Plot numbers are text but usually numeric; sort them as people read them
     NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
     pl."Plot_Number";
$$ LANGUAGE sql STABLE;

-- Everything else about the function is unchanged; only the column and
-- its place in the SELECT are new. The existing callers read by name,
-- so nothing else needs touching.


-- ── Check ───────────────────────────────────────────────────────
-- Heat source 1 is gas. Anything else, or null, and Auto Service leaves
-- the gas meter off.
--
--   SELECT plot_id, plot_number, heat_source_id, placed
--     FROM gis_unplaced_plots(<project id>)
--    ORDER BY plot_number;
--
-- Plots that would get a gas meter today:
--   SELECT h."Heat_Source", COUNT(*)
--     FROM "Plot" pl
--     LEFT JOIN "Heat_Source" h ON h."Heat_Source_ID" = pl."Heat_Source_ID"
--    WHERE pl."Project_ID" = <project id>
--    GROUP BY h."Heat_Source";
