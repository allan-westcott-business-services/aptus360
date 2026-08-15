-- ════════════════════════════════════════════════════════════════
-- 0164 — services drawn without a size
--
-- Water services become 25mm, gas services 32mm, where nothing was set.
--
-- ── What was wrong ──
--
-- A service takes its size from the outline design's default, and where
-- nobody had filled that in it was drawn with no size at all. On the
-- bill that reads "Water Service (pipe size not set)" against four
-- hundred metres of perfectly ordinary 25mm — a quantity nobody can
-- order against, for a pipe nobody was ever in doubt about.
--
-- A service is not like a main. A main is sized by the load it carries,
-- which is why the gas and water builds calculate it, and why leaving
-- one unset is honest when the calculation cannot run. A service is the
-- same pipe on nearly every plot on nearly every site.
--
-- So the application now carries a floor — serviceDefaults.js — used
-- when neither the feature nor the project scope has said. This fills
-- in what was drawn before that existed.
--
-- ── Only the blanks ──
--
-- A size somebody wrote is somebody's answer, whatever it says. A
-- service drawn as 32mm water on a scheme where that is right stays
-- 32mm; this writes nothing where anything is set.
--
-- Nothing is touched on electric: a cable is a reference into
-- Electric_Cable_Size, not a piece of text, and there is no equivalent
-- of "just the usual one".
--
-- ── Found by line type ──
--
-- Unlike the trench migrations, which go by layer. A layer holds mains
-- and services together, and only the services are being defaulted —
-- so the line type is the thing that distinguishes them, and it is
-- stable: gas_service and water_service are seeded in 0050 and used
-- throughout the canvas.
-- ════════════════════════════════════════════════════════════════

UPDATE "GIS_Feature"
   SET "Attributes" = jsonb_set(
         COALESCE("Attributes", '{}'::jsonb),
         '{Size}', '"25mm"'::jsonb, true)
 WHERE "Feature_Type" = 'line'
   AND "Attributes" ->> 'Line_Type' = 'water_service'
   AND COALESCE("Attributes" ->> 'Size', '') = '';

UPDATE "GIS_Feature"
   SET "Attributes" = jsonb_set(
         COALESCE("Attributes", '{}'::jsonb),
         '{Size}', '"32mm"'::jsonb, true)
 WHERE "Feature_Type" = 'line'
   AND "Attributes" ->> 'Line_Type' = 'gas_service'
   AND COALESCE("Attributes" ->> 'Size', '') = '';


-- ── Check ───────────────────────────────────────────────────────
--
-- ** Run this one first. ** What is about to be filled in, and what is
-- already answered. Anything unexpected in the second column is a size
-- somebody wrote that this leaves alone — which is the intent, but
-- worth seeing before rather than after:
--
--   SELECT "Attributes" ->> 'Line_Type'                   AS line_type,
--          COALESCE(NULLIF("Attributes" ->> 'Size', ''), '(none)') AS size,
--          count(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'line'
--      AND "Attributes" ->> 'Line_Type' IN ('gas_service', 'water_service')
--    GROUP BY 1, 2 ORDER BY 1, 3 DESC;
--
-- Afterwards there should be no (none) row. And on the bill, the
-- "(pipe size not set)" line should be gone from water:
--
--   SELECT item, quantity FROM gis_bom(<project id>)
--    WHERE item ILIKE '%service%' ORDER BY item;
--
-- Water services also carry Water_Pipe_Size_ID where the build laid
-- them from the catalogue. This fills only the text, which is what the
-- bill reads for a service — a service filled in here will show its
-- size rather than falling into the unset row, without claiming a
-- catalogue row it does not have:
--
--   SELECT count(*) FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'Line_Type' = 'water_service'
--      AND "Attributes" ->> 'Water_Pipe_Size_ID' IS NULL;
--
-- Safe to run again: it only writes where no size is set.
