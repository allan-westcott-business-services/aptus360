-- ════════════════════════════════════════════════════════════════
-- 0050 — mains and service trench
--
-- 0038 seeded the trench layer with two types along one axis: whether
-- the trench is shared. A joint trench carries several services in one
-- dig; a separate trench is one service on its own, because the spacing
-- rules won't let it share. Useful distinctions, but not the one the
-- drawing tool needs first.
--
-- Mains and service is the axis that matches the rest of the model —
-- elec_main / elec_service, gas_main / gas_service — and the one that
-- drives quantities, since a mains run and a service spur are costed
-- differently. This adds the pair in mid brown, solid, mains heavier.
--
-- The old two are left in place. Deactivating them is at the foot of
-- this file, guarded so it can't hide a type something is already drawn
-- with. Run supabase/checks/0050_trench_types.sql first.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "GIS_Line_Type"
  ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active")
VALUES
  ('trench_main',   'Mains trench',   'trench','#8b5e34',6.0,false,64,true),
  ('trench_service','Service trench', 'trench','#8b5e34',3.5,false,66,true)
ON CONFLICT ("Type_Key") DO UPDATE SET
  "Label"     = EXCLUDED."Label",
  "Layer_Key" = EXCLUDED."Layer_Key",
  "Colour"    = EXCLUDED."Colour",
  "Width_px"  = EXCLUDED."Width_px",
  "Dashed"    = EXCLUDED."Dashed",
  "Is_Active" = true;
-- DO UPDATE rather than DO NOTHING so a re-run restores the intended
-- colour and weight. Sort_Order is deliberately not overwritten: it is
-- the one field someone may reasonably reorder by hand.

-- The layer swatch in the Layers panel reads GIS_Layer, while the line
-- takes its colour from GIS_Line_Type. Left alone, the legend would
-- show purple beside brown lines.
UPDATE "GIS_Layer"
   SET "Colour" = '#8b5e34'
 WHERE "Layer_Key" = 'trench'
   AND "Colour" IS DISTINCT FROM '#8b5e34';


-- ── Retiring the original pair ───────────────────────────────────
-- Deactivating hides a type from the drawing picker. It does not touch
-- anything already drawn: the canvas falls back to the layer colour for
-- a type it can't find, so existing trenches keep rendering, in brown,
-- but lose their individual weight and dash.
--
-- Guarded by NOT EXISTS, so this is a no-op on any project that has
-- used them. Check first, then run it if the count is zero.
UPDATE "GIS_Line_Type" t
   SET "Is_Active" = false
 WHERE t."Type_Key" IN ('trench_joint','trench_sep')
   AND NOT EXISTS (
     SELECT 1 FROM "GIS_Feature" f
      WHERE f."Attributes" ->> 'Line_Type' = t."Type_Key"
   );

-- To bring either back:
--   UPDATE "GIS_Line_Type" SET "Is_Active" = true
--    WHERE "Type_Key" IN ('trench_joint','trench_sep');
--
-- To move existing trenches onto the new types instead of keeping the
-- old ones alive — joint trench carries the mains, so it maps to mains;
-- check the counts before running either:
--   UPDATE "GIS_Feature"
--      SET "Attributes" = "Attributes" || '{"Line_Type":"trench_main"}'::jsonb
--    WHERE "Attributes" ->> 'Line_Type' = 'trench_joint';
--   UPDATE "GIS_Feature"
--      SET "Attributes" = "Attributes" || '{"Line_Type":"trench_service"}'::jsonb
--    WHERE "Attributes" ->> 'Line_Type' = 'trench_sep';
-- Geometry is untouched by those, so gis_length_trg does not refire and
-- Length_m stays as it was — which is correct, the line hasn't moved.

-- ── Check ───────────────────────────────────────────────────────
--   supabase/checks/0050_trench_types.sql
