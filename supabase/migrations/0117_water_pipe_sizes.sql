-- ════════════════════════════════════════════════════════════════
-- 0117 — water pipe sizes
--
-- What size of pipe carries how many plots.
--
-- ── Why this is a table and not a calculation ──
--
-- Electric sizes a cable by working one out: load, impedance, volt drop,
-- a length and a transformer, and the answer falls out of the physics.
-- Water here does not. A pipe size is read off a table against the
-- number of water meters fed beyond the point being sized — twenty per
-- 63mm — and that table belongs to whoever sets the standard, not to
-- this application.
--
-- So there is no formula in the code and no default beyond the one row
-- given. The rest is configured in Admin › Water Pipe Sizes.
--
-- ── Max_Meters is a ceiling, not a band ──
--
-- Each row says the most meters that size will carry. The sizing picks
-- the smallest row that will take the number in question, so the bands
-- fall out of the ceilings and cannot leave a gap: rows of 20, 50 and
-- 100 mean 21 meters takes the 50 and nothing has to say so. Adding a
-- size later needs one row rather than the boundaries of its neighbours
-- being corrected.
--
-- A count above every row is not silently given the largest pipe. The
-- build reports it, because a network needing more than the table
-- allows is a design question and not a rounding one.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Water_Pipe_Size" (
  "Water_Pipe_Size_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- The size as it is spoken and drawn: 63, 90, 125.
  "Diameter_mm"        numeric NOT NULL UNIQUE,

  -- What it is called on a drawing and in a schedule. Blank means the
  -- diameter with "mm" after it, which is what everyone writes anyway —
  -- it is here for the material or class that sometimes rides along,
  -- "63mm MDPE".
  "Size_Label"         text,

  -- The most water meters this size will feed.
  "Max_Meters"         integer NOT NULL,

  "Display_Order"      integer NOT NULL DEFAULT 100,
  "Is_Active"          boolean NOT NULL DEFAULT true,

  CONSTRAINT water_pipe_size_max CHECK ("Max_Meters" > 0),
  CONSTRAINT water_pipe_size_dia CHECK ("Diameter_mm" > 0)
);

-- The one standard given: twenty meters per 63mm. Seeded only into an
-- empty table, so configuring the rest is not undone by running this
-- again.
INSERT INTO "Water_Pipe_Size"
  ("Diameter_mm", "Size_Label", "Max_Meters", "Display_Order")
SELECT * FROM (VALUES
  (63, '63mm', 20, 10)
) AS v(d, l, m, o)
WHERE NOT EXISTS (SELECT 1 FROM "Water_Pipe_Size");


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Diameter_mm", "Size_Label", "Max_Meters" FROM "Water_Pipe_Size"
--    WHERE "Is_Active" ORDER BY "Max_Meters";
--
-- The size a given number of meters calls for — the same rule the build
-- applies, written out:
--   SELECT "Diameter_mm" FROM "Water_Pipe_Size"
--    WHERE "Is_Active" AND "Max_Meters" >= 34
--    ORDER BY "Max_Meters" LIMIT 1;
--
-- Nothing comes back where the table stops short of the network, which
-- is the case the build reports rather than rounding up.
