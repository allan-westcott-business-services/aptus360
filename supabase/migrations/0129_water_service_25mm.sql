-- ════════════════════════════════════════════════════════════════
-- 0129 — a water service is 25mm
--
-- Two things: the rule, and the pipes already drawn without one.
--
-- ── The rule ──
--
-- 0128 split the size table into mains and service rules and left the
-- service side empty, so Auto Service had nothing to size a spur from
-- and the bill read "Water Service (pipe size not set)" for every one
-- of them. One service rule: 25mm, one property.
--
-- Max_Meters is 1 because that is what a service feeds. The sizing asks
-- for the smallest rule that carries one meter, so an operator who
-- wants 32mm on theirs adds a rule for 32mm against their own name and
-- it wins for them — the same mechanism the mains use, no code and no
-- second table.
--
-- Seeded only where no service rule exists, so this cannot overwrite a
-- table somebody has already set up.
--
-- ── The pipes ──
--
-- Every water service already on a drawing is set to that rule. They
-- were laid by Auto Service before it knew about sizes, so they carry
-- no diameter at all — which is not a decision anybody made, it is the
-- absence of one, and 25mm is what they are.
--
-- Both columns, as the application writes them: Water_Pipe_Size_ID is
-- what a schedule joins on and Size is what the drawing reads. Written
-- together here for the same reason they are written together there.
--
-- Anything with a size already is left exactly as it is. A spur somebody
-- sized by hand is a decision, and this is a backfill of the ones with
-- no decision on them.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "Water_Pipe_Size"
  ("Pipe_Kind", "Diameter_mm", "Size_Label", "Max_Meters", "Display_Order")
SELECT 'service', 25, '25mm', 1, 10
 WHERE NOT EXISTS (
   SELECT 1 FROM "Water_Pipe_Size" WHERE "Pipe_Kind" = 'service'
 );


-- ── The services already drawn ──────────────────────────────────
UPDATE "GIS_Feature" f
   SET "Attributes" = f."Attributes"
     || jsonb_build_object(
          'Water_Pipe_Size_ID', w."Water_Pipe_Size_ID",
          'Size', COALESCE(NULLIF(w."Size_Label", ''), w."Diameter_mm"::text || 'mm'))
  FROM "Water_Pipe_Size" w
 WHERE w."Pipe_Kind" = 'service'
   AND w."Diameter_mm" = 25
   AND f."Layer_Key" = 'water'
   AND f."Feature_Type" = 'line'
   AND f."Attributes" ->> 'Line_Type' LIKE '%service%'
   -- Only the ones with nothing on them.
   AND f."Attributes" ->> 'Water_Pipe_Size_ID' IS NULL
   AND NULLIF(f."Attributes" ->> 'Size', '') IS NULL;


-- ── Check ───────────────────────────────────────────────────────
-- The service rules, which should be the one until somebody adds more:
--   SELECT "Diameter_mm", "Size_Label", "Max_Meters" FROM "Water_Pipe_Size"
--    WHERE "Pipe_Kind" = 'service' ORDER BY "Max_Meters";
--
-- Water services with no size left on this project. Should be none:
--   SELECT COUNT(*) FROM "GIS_Feature"
--    WHERE "Project_ID" = <project id> AND "Layer_Key" = 'water'
--      AND "Attributes" ->> 'Line_Type' LIKE '%service%'
--      AND "Attributes" ->> 'Water_Pipe_Size_ID' IS NULL;
--
-- And on the bill, "Water Service (pipe size not set)" should have
-- become "Water Service — 25mm":
--   SELECT item, quantity FROM gis_bom(<project id>)
--    WHERE utility = 'Water' AND item LIKE 'Water Service%';
