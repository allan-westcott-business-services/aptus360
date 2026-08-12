-- ════════════════════════════════════════════════════════════════
-- 0156 — a gas service is 25mm
--
-- A domestic gas service feeds one dwelling, so the answer is the same
-- every time. Auto Service now stamps 25mm on every gas service it
-- draws; this does the same for the ones already on the drawings, which
-- were laid with no size at all and so were itemised in the bill as
-- "Gas Service" with nothing to order against.
--
-- ── The catalogue row first ──
--
-- The size has to exist before a pipe can point at it. Added only if it
-- is missing, and only to low pressure, which is what a domestic
-- service is.
--
-- Max_kW is the ceiling this size is allowed to carry. 60 kW covers a
-- dwelling with room to spare — the diversity tables put a single house
-- well below it — and a service that genuinely needs more than that is
-- one somebody should size by hand rather than have a default quietly
-- accept.
--
-- ── Then the pipes ──
--
-- Only gas services, and only where nothing has been set. A size
-- somebody chose is a decision, and a migration that overwrites
-- decisions is one nobody can trust to run twice.
--
-- Manual_Gas_Pipe_Size_ID is not touched at all: it is the override,
-- and writing a default into it would make every existing service look
-- as though somebody had deliberately chosen 25mm.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "Gas_Pipe_Size" ("Diameter_mm", "Size_Label", "Max_kW", "Pressure_Tier")
SELECT 25, '25mm', 60, 'LP'
 WHERE NOT EXISTS (
   SELECT 1 FROM "Gas_Pipe_Size"
    WHERE "Diameter_mm" = 25
      AND COALESCE("Pressure_Tier", 'LP') = 'LP'
 );


-- ── The services already drawn ──────────────────────────────────
UPDATE "GIS_Feature" f
   SET "Attributes" = f."Attributes"
       || jsonb_build_object(
            'Gas_Pipe_Size_ID', gp."Gas_Pipe_Size_ID",
            'Size', COALESCE(NULLIF(gp."Size_Label", ''), '25mm'))
  FROM "Gas_Pipe_Size" gp
 WHERE gp."Diameter_mm" = 25
   AND COALESCE(gp."Pressure_Tier", 'LP') = 'LP'
   AND f."Layer_Key" = 'gas'
   AND f."Feature_Type" = 'line'
   AND f."Attributes" ->> 'Line_Type' ILIKE '%service%'
   -- Nothing already sized, by the build or by hand.
   AND f."Attributes" ->> 'Gas_Pipe_Size_ID' IS NULL
   AND f."Attributes" ->> 'Manual_Gas_Pipe_Size_ID' IS NULL;


-- ── Check ───────────────────────────────────────────────────────
-- What every gas service is now sized at. Anything still unsized has a
-- size set by hand or a line type this did not match:
--   SELECT COALESCE(f."Attributes" ->> 'Size', '(none)') AS size,
--          count(*)
--     FROM "GIS_Feature" f
--    WHERE f."Layer_Key" = 'gas'
--      AND f."Feature_Type" = 'line'
--      AND f."Attributes" ->> 'Line_Type' ILIKE '%service%'
--    GROUP BY 1
--    ORDER BY 2 DESC;
