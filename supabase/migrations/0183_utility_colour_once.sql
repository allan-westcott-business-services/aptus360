-- ════════════════════════════════════════════════════════════════
-- 0183 — a utility's colour, recorded once
--
-- Electric is amber, gas is red, water is green. That fact was written
-- in three places and the three did not agree:
--
--   Utility.Colour        #ffbb00   #ff0000   #2ccc00
--   GIS_Layer.Colour      #f59e0b   #10b981   #3b82f6
--   GIS_Line_Type.Colour  #f59e0b   #10b981   #3b82f6
--
-- Gas was green on the drawing and red in the utility table. Water was
-- blue on the drawing and green in the utility table. Both wrong on the
-- drawing, and wrong in the way that matters: red and green are the
-- trade's colours for gas and water, and a plan showing gas in green is
-- not a plan anybody should be digging to.
--
-- ── Why they drifted ──
--
-- GIS_Layer and GIS_Line_Type were seeded with a palette in 0051, before
-- the utilities carried colours at all. Nothing has edited them since,
-- because nothing in the application can: neither colour is exposed on
-- any screen. So they sat as a second and third copy of a fact, going
-- stale quietly, exactly the way the span node cable sizes did.
--
-- ── What already happened, and why it was not enough ──
--
-- `netlify/functions/gis.js` began overlaying the utility's colour at
-- read time, so the canvas has been drawing the right colours for a
-- while. It says so in a comment: it works at read time "because Colour
-- is NOT NULL on both tables". That was a reason to postpone the fix,
-- not a fix. The wrong values are still in the rows, still shipped to
-- anything that reads the tables directly, and still the first thing
-- somebody sees opening the table in the SQL editor. Two records of one
-- fact, one of them a lie, is the fault whether or not a layer of code
-- covers it up.
--
-- This deletes the copies. Colour becomes nullable on both tables and
-- NULL where a utility owns it, which turns the read-time overlay from
-- a correction into an inheritance: there is now nothing to correct.
--
-- ── Street lighting ──
--
-- Its layer carries an amber of its own and is wanted in electric's.
-- A lighting cable is an electric cable to anyone reading a drawing, and
-- the two are never both isolated, so sharing the colour costs nothing
-- and saves a fourth shade nobody asked for.
--
-- The layer is also tied to its utility here. 0072 tied it only where a
-- utility named exactly 'Private Street Lighting' existed — on an
-- instance whose row is named anything else the layer has no utility at
-- all, so it would inherit nothing and keep its stale amber.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** What the three tables say today. Expect the
-- disagreement described above; if they already agree, this migration
-- has been run.
--
--   SELECT u."Utility", u."Colour" AS utility_colour,
--          l."Layer_Key", l."Colour" AS layer_colour
--     FROM "Utility" u
--     LEFT JOIN "GIS_Layer" l ON l."Utility_ID" = u."Utility_ID"
--    ORDER BY u."Sort_Order";


-- ── 1. The one record ────────────────────────────────────────────
--
-- Matched on name rather than on Utility_ID, which is not stable
-- between instances. Only rows that exist are touched, and a utility
-- already carrying the right colour is left alone by the WHERE.

UPDATE "Utility" SET "Colour" = '#ffbb00'
 WHERE "Utility" ILIKE 'electric%' AND "Colour" IS DISTINCT FROM '#ffbb00';

UPDATE "Utility" SET "Colour" = '#ff0000'
 WHERE "Utility" ILIKE 'gas%' AND "Colour" IS DISTINCT FROM '#ff0000';

UPDATE "Utility" SET "Colour" = '#2ccc00'
 WHERE "Utility" ILIKE 'water%' AND "Colour" IS DISTINCT FROM '#2ccc00';

-- Street lighting in electric's amber, under whatever it is called
-- locally — 'Street Lighting', 'Private Street Lighting', 'S38
-- Lighting' all match.
UPDATE "Utility" SET "Colour" = '#ffbb00'
 WHERE ("Utility" ILIKE '%lighting%' OR "Is_Lighting" = true)
   AND "Colour" IS DISTINCT FROM '#ffbb00';


-- ── 2. The lighting layer needs its utility ──────────────────────
--
-- Without this it inherits nothing. Preferring the private lighting row
-- where there is one keeps 0072's choice; otherwise any lighting
-- utility will do, lowest id first so the result does not depend on
-- scan order.

UPDATE "GIS_Layer" l
   SET "Utility_ID" = (
     SELECT u."Utility_ID" FROM "Utility" u
      WHERE u."Utility" ILIKE '%lighting%' OR u."Is_Lighting" = true
      ORDER BY (u."Utility" ILIKE 'private%') DESC, u."Utility_ID"
      LIMIT 1)
 WHERE l."Layer_Key" = 'lighting'
   AND l."Utility_ID" IS NULL
   AND EXISTS (SELECT 1 FROM "Utility" u
                WHERE u."Utility" ILIKE '%lighting%' OR u."Is_Lighting" = true);


-- ── 3. Colour becomes optional, meaning "ask my utility" ─────────

ALTER TABLE "GIS_Layer"     ALTER COLUMN "Colour" DROP NOT NULL;
ALTER TABLE "GIS_Line_Type" ALTER COLUMN "Colour" DROP NOT NULL;


-- ── 4. Delete the copies ─────────────────────────────────────────
--
-- Line types FIRST. Whether a type's colour is a copy is decided by
-- comparing it against the layer's, so the layer's has to still be
-- there when the comparison is made. Reversing these two clears the
-- layers and then finds nothing to compare against, which leaves every
-- line type holding its stale colour — and a line type colour is an
-- override, so those would then win over the utility for good.
--
-- A type coloured differently from its layer keeps it. That was
-- somebody drawing a distinction: HV is a deeper red than LV on purpose
-- and must not be swept into the utility's amber.

UPDATE "GIS_Line_Type" t
   SET "Colour" = NULL
  FROM "GIS_Layer" l
 WHERE t."Layer_Key" = l."Layer_Key"
   AND l."Utility_ID" IS NOT NULL
   AND t."Colour" IS NOT NULL
   AND lower(t."Colour") = lower(l."Colour");

-- Layers second. A layer stands one-to-one with its utility — the
-- electric layer IS the electric utility — so what it stored was never
-- an override, and all of it goes.
--
-- A layer with no utility keeps its colour and always will. Trench,
-- boundary, plot and note are not utilities and have nowhere else for a
-- colour to live.

UPDATE "GIS_Layer"
   SET "Colour" = NULL
 WHERE "Utility_ID" IS NOT NULL;


-- ── Check ───────────────────────────────────────────────────────
--
-- 1. Every utility layer now inherits, and the four colours are right:
--
--   SELECT l."Layer_Key", l."Colour" AS stored, u."Colour" AS inherited
--     FROM "GIS_Layer" l
--     JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
--    ORDER BY l."Sort_Order";
--
--   stored must be NULL on every row. inherited must read #ffbb00 for
--   electric and lighting, #ff0000 for gas, #2ccc00 for water.
--
-- 2. The non-utility layers are untouched and still coloured:
--
--   SELECT "Layer_Key", "Colour" FROM "GIS_Layer"
--    WHERE "Utility_ID" IS NULL ORDER BY "Sort_Order";
--
--   trench, boundary, plot and note, each with a colour. A NULL here
--   would draw grey and means step 4 ran too widely.
--
-- 3. The deliberate exceptions survived. HV keeps its deeper red:
--
--   SELECT "Type_Key", "Colour" FROM "GIS_Line_Type"
--    WHERE "Colour" IS NOT NULL ORDER BY "Type_Key";
--
--   elec_hv must be in this list. elec_main, gas_main and water_main
--   must NOT be — those were copies and are now inherited.
--
-- 4. Nothing lost its colour altogether. This should return no rows:
--
--   SELECT l."Layer_Key" FROM "GIS_Layer" l
--     LEFT JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
--    WHERE COALESCE(u."Colour", l."Colour") IS NULL;
--
-- Nothing here is destructive in a way that cannot be undone: the
-- colours removed were duplicates of the utility's or stale defaults,
-- and a layer can be given its own colour again with a single UPDATE.
-- ════════════════════════════════════════════════════════════════
