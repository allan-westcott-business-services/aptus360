-- ════════════════════════════════════════════════════════════════
-- 0059 — house type on placement, and span nodes
--
-- Two things.
--
-- The plot seed editor reads plot.property_config_id to fill its House
-- Type picker, and gis_unplaced_plots never returned it. It returns
-- config_code, which is the label — enough to draw the seed in the right
-- bedroom colour, which is why the colour looked right while the field
-- sat empty. Same shape as the heat source gap 0053 closed.
--
-- And span nodes: the numbered points along a circuit, starting with one
-- at the substation. Feature_Role has to allow them before any can be
-- stored.
--
-- Adding a column to a RETURNS TABLE needs the function dropped first.
-- CREATE OR REPLACE cannot change a return type.
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
  placed             boolean
) AS $$
  SELECT pl."Plot_ID", pl."Plot_Number", pl."Plot_Ref",
         pc."Bedrooms", pc."Code", pl."Property_Config_ID",
         pl."Project_Developer_ID", pl."Heat_Source_ID",
         EXISTS (SELECT 1 FROM "GIS_Feature" f
                  WHERE f."Plot_ID" = pl."Plot_ID" AND f."Feature_Role" = 'plot')
    FROM "Plot" pl
    LEFT JOIN "Property_Config" pc ON pc."Property_Config_ID" = pl."Property_Config_ID"
   WHERE pl."Project_ID" = p_project
   ORDER BY
     NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
     pl."Plot_Number";
$$ LANGUAGE sql STABLE;


-- ── Span nodes ───────────────────────────────────────────────────
-- The numbered points along a circuit. The first sits on the substation
-- and is labelled A0, B0 and so on — the origin every other point on
-- that circuit is measured from.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode'));

-- One origin per circuit. Re-running Link to Circuit must not leave two
-- points sitting on the substation claiming to be the same node.
CREATE UNIQUE INDEX IF NOT EXISTS gis_span_origin_uniq
  ON "GIS_Feature" ("Project_ID", (("Attributes" ->> 'Circuit_ID')))
  WHERE "Feature_Role" = 'spannode'
    AND ("Attributes" ->> 'Span_Seq') = '0';

INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Span node', 'spannode', 'circle', 7, '#334155', 195,
   'Numbered points along a circuit. Seq 0 sits on the substation.')
ON CONFLICT DO NOTHING;


-- ── Check ───────────────────────────────────────────────────────
-- Expect property_config_id back, and non-null wherever the plot has a
-- house type:
--   SELECT plot_id, plot_number, config_code, property_config_id, heat_source_id
--     FROM gis_unplaced_plots(<project>) ORDER BY plot_number;
--
-- One origin node per circuit, on the substation:
--   SELECT "Label", "Attributes" ->> 'Circuit_Letter' AS circuit,
--          "Attributes" ->> 'Span_Seq' AS seq
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project> AND "Feature_Role" = 'spannode'
--    ORDER BY 2, 3;
