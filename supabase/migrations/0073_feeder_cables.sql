-- ════════════════════════════════════════════════════════════════
-- 0073 — LV feeder cables
--
-- Build LV Network draws the cables that carry a circuit from the
-- substation out to its plots. They are their own line type rather than
-- ordinary electric mains, for one practical reason: rebuilding the
-- network deletes and redraws them, and that delete has to be able to
-- tell a generated feeder from a cable somebody drew by hand.
--
-- Nothing else about them is special. They are electric lines, they
-- appear in the bill of materials with everything else, and the Electric
-- menu can hide them like any other class.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "GIS_Line_Type"
  ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order")
VALUES
  ('elec_feeder', 'LV feeder', 'electric', '#ea580c', 2.6, false, 16)
ON CONFLICT ("Type_Key") DO NOTHING;

-- The attributes a feeder carries, recorded here because nothing else
-- documents them:
--   Circuit_ID, Circuit_Name, Circuit_Letter — which feeder it belongs to
--   Meters      — how many meters are beyond this run
--   KVA         — their total load
--   Cables      — how many cables the run needs, ceil(meters / 70)
--   Generated   — true, so a rebuild knows it may delete this
--
-- Generated is the one that matters. Without it a rebuild would either
-- leave orphaned cables behind or delete work someone did by hand.


-- ── Check ───────────────────────────────────────────────────────
-- Feeders on a project, by circuit:
--   SELECT "Attributes" ->> 'Circuit_Letter' AS circuit,
--          COUNT(*) AS runs,
--          SUM(("Attributes" ->> 'Cables')::int) AS cables,
--          ROUND(SUM(("Attributes" ->> 'Length_m')::numeric), 1) AS metres
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project>
--      AND "Attributes" ->> 'Line_Type' = 'elec_feeder'
--    GROUP BY 1 ORDER BY 1;
--
-- Expect none: a generated feeder with no circuit. It would survive
-- every rebuild of every circuit and never be redrawn.
--   SELECT "Feature_ID", "Label" FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'Line_Type' = 'elec_feeder'
--      AND "Attributes" ->> 'Circuit_ID' IS NULL;
