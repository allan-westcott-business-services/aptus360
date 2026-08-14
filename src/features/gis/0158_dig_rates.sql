-- ════════════════════════════════════════════════════════════════
-- 0158 — excavation and lay rates
--
-- How long a length of trench takes to dig and to lay, from the
-- dimensions the canvas already works out.
--
-- ── These are estimates, and they are not NJUG ──
--
-- NJUG Volume 1 is a positioning and depth standard. It says how deep a
-- gas main sits and how far it sits from the electric. It says nothing
-- about how long the hole takes, and there is no published figure for
-- ten metres of anything. What is seeded below is an ordinary-case
-- planning model built on standard civils output rates, keyed to the
-- depths NJUG does set.
--
-- Every rate row carries "Source" and "Sample_Size" for that reason.
-- 'estimate' with a sample of zero is what ships. As real jobs are
-- recorded the row is replaced with 'measured' and a count, and the
-- screens change what they say about the figure without any code
-- changing. A number that looks measured when it was assumed is worse
-- than no number, because nobody questions it.
--
-- ── Why these are tables when the NJUG figures are not ──
--
-- trenchSize.js keeps its table in code and gives the reason: a
-- published standard changes when the standard changes, not per
-- project. Rates are the opposite case. They are a company's own, they
-- differ by machine and by ground, and the whole point is that they
-- move as jobs come in — a rate that needed a deploy to correct would
-- never get corrected.
--
-- ── Three tables and one column ──
--
--   Dig_Rate          machine output, m³/hr, in unmade ground
--   Dig_Depth_Factor  how much slower the same machine is when deep
--   Dig_Lay_Rate      laying speed, m/hr, by utility
--   GIS_Surface_Type."Dig_Factor"   how much slower each surface is
--
-- The surface multiplier goes on the surface rather than into a fourth
-- table because the trench already records its surface. A second list
-- keyed by the same six values is a second place to remember them, and
-- the one that gets missed is the one giving a carriageway a verge's
-- rate.
--
-- Unmade ground is the baseline at 1.0 and everything else is a
-- multiplier off it: soft enough that the machine is the constraint
-- rather than the surface, hard enough not to be a special case.
-- ════════════════════════════════════════════════════════════════


-- ── Machine output ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Dig_Rate" (
  "Dig_Rate_ID"      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- What the canvas stores when a machine is chosen.
  "Machine_Key"      text NOT NULL UNIQUE,
  "Label"            text NOT NULL,

  -- Cubic metres an hour, digging trench in unmade ground: spoil to the
  -- side, banksman, trimming as it goes. Machine working time, not a
  -- gang rate for the whole operation.
  "Base_Rate_M3_Hr"  numeric NOT NULL,

  -- Positioning, mats, scanning and marking out. Once per trench run
  -- rather than per cubic metre, because it does not scale with the
  -- quantity.
  "Setup_Minutes"    integer NOT NULL DEFAULT 15,

  -- The machine assumed where nobody has chosen one. Exactly one row
  -- should carry it; the constraint below enforces that.
  "Is_Default"       boolean NOT NULL DEFAULT false,

  -- Where the figure came from and how much is behind it. 'estimate'
  -- until somebody has measured it.
  "Source"           text NOT NULL DEFAULT 'estimate',
  "Sample_Size"      integer NOT NULL DEFAULT 0,

  "Sort_Order"       integer NOT NULL DEFAULT 100,
  "Is_Active"        boolean NOT NULL DEFAULT true,

  CONSTRAINT dig_rate_positive CHECK ("Base_Rate_M3_Hr" > 0),
  CONSTRAINT dig_rate_setup    CHECK ("Setup_Minutes" >= 0),
  CONSTRAINT dig_rate_sample   CHECK ("Sample_Size" >= 0),
  CONSTRAINT dig_rate_source   CHECK ("Source" IN ('estimate', 'measured'))
);

-- One default, not none and not two. A partial unique index rather than
-- a check, because the rule is about the table and not about a row.
CREATE UNIQUE INDEX IF NOT EXISTS dig_rate_one_default
  ON "Dig_Rate" (("Is_Default")) WHERE "Is_Default";

INSERT INTO "Dig_Rate"
  ("Machine_Key","Label","Base_Rate_M3_Hr","Setup_Minutes","Is_Default","Sort_Order")
SELECT * FROM (VALUES
  ('micro_1_5t',    '1.5t micro',     2.5, 15, false, 10),
  -- The default: the machine most utility trench in unmade ground is
  -- actually dug with.
  ('mini_3t',       '3t mini',        4.5, 15, true,  20),
  ('midi_5t',       '5t midi',        7.0, 20, false, 30),
  ('excavator_8t',  '8t excavator',  10.0, 20, false, 40),
  ('excavator_13t', '13t excavator', 15.0, 25, false, 50)
) AS v(k, l, r, s, d, o)
WHERE NOT EXISTS (SELECT 1 FROM "Dig_Rate");


-- ── Depth ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Dig_Depth_Factor" (
  "Dig_Depth_Factor_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Half open: from inclusive, to exclusive, so a trench at exactly
  -- 0.60m takes the shallower band and cannot match two. The deepest
  -- band has no ceiling — anything deeper than the table describes
  -- belongs to it rather than to nothing.
  "Depth_From_M"        numeric NOT NULL,
  "Depth_To_M"          numeric,

  "Factor"              numeric NOT NULL,
  "Note"                text,

  CONSTRAINT dig_depth_order  CHECK ("Depth_To_M" IS NULL OR "Depth_To_M" > "Depth_From_M"),
  CONSTRAINT dig_depth_factor CHECK ("Factor" > 0)
);

-- Applied after the volume, so it is not counting the extra dig twice.
-- What it prices is the things that change with depth and not with
-- quantity: the spoil has further to travel, the accuracy matters more,
-- and past about a metre the sides have to be held.
--
-- The step at 1.20m is the largest and it is the real one. Below it a
-- trench is dug; above it a trench is dug and supported, and support is
-- a separate operation happening in the same hole.
INSERT INTO "Dig_Depth_Factor"
  ("Depth_From_M","Depth_To_M","Factor","Note")
SELECT * FROM (VALUES
  (0.00, 0.60,        1.00, 'Straightforward dig'),
  (0.60, 1.00,        1.15, 'Spoil lift and accuracy'),
  (1.00, 1.20,        1.30, 'Battering starts'),
  (1.20, NULL::numeric, 1.60, 'Supported — box or full batter')
) AS v(f, t, x, n)
WHERE NOT EXISTS (SELECT 1 FROM "Dig_Depth_Factor");


-- ── Laying ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Dig_Lay_Rate" (
  "Dig_Lay_Rate_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- The layer key the canvas uses: electric, gas, water, telecoms.
  -- 'other' is the fallback for anything not named.
  "Utility_Key"     text NOT NULL UNIQUE,

  -- Metres an hour in an open trench.
  "Rate_M_Hr"       numeric NOT NULL,
  "Note"            text,

  "Source"          text NOT NULL DEFAULT 'estimate',
  "Sample_Size"     integer NOT NULL DEFAULT 0,
  "Is_Active"       boolean NOT NULL DEFAULT true,

  CONSTRAINT dig_lay_positive CHECK ("Rate_M_Hr" > 0),
  CONSTRAINT dig_lay_source   CHECK ("Source" IN ('estimate', 'measured'))
);

-- Per utility rather than per size. The difference between 63mm and
-- 180mm is small next to the difference between drawing in a cable and
-- jointing pipe, and a size band here would be false precision on top
-- of an estimate.
INSERT INTO "Dig_Lay_Rate" ("Utility_Key","Rate_M_Hr","Note")
SELECT * FROM (VALUES
  ('electric', 30, 'Drawn in rather than assembled'),
  ('telecoms', 40, 'Duct, lightest thing in the trench'),
  ('water',    25, 'Jointed pipe'),
  ('gas',      22, 'Jointed pipe, plus the testing that goes with it'),
  ('other',    25, 'Anything not named above')
) AS v(u, r, n)
WHERE NOT EXISTS (SELECT 1 FROM "Dig_Lay_Rate");


-- ── Surface ──────────────────────────────────────────────────────

ALTER TABLE "GIS_Surface_Type"
  ADD COLUMN IF NOT EXISTS "Dig_Factor" numeric NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN "GIS_Surface_Type"."Dig_Factor" IS
  'How much slower this surface is to dig than unmade ground, which is 1.0. Above 1 is breaking out, not making good — reinstatement is not estimated.';

-- The six surfaces, by key. Unmade is 1.0 by definition and is listed
-- rather than left out, so the baseline is stated where the others are
-- read and not implied by its absence.
--
-- Only where the column is still at its default, so a factor somebody
-- has tuned is not overwritten by re-running this.
UPDATE "GIS_Surface_Type" SET "Dig_Factor" = v.f
  FROM (VALUES
    ('agricultural',   0.85),
    ('verge',          0.90),
    ('unmade',         1.00),
    ('footway',        1.45),
    ('carriageway_12', 1.75),
    ('carriageway_34', 2.10)
  ) AS v(key, f)
 WHERE "Surface_Key" = v.key
   AND "Dig_Factor" = 1.0
   AND v.f <> 1.0;

-- A surface added later keeps the 1.0 default, which estimates it as
-- unmade ground rather than as free. Neutral rather than wrong, and the
-- check below is what finds it.


-- ── Access ───────────────────────────────────────────────────────
-- On with no policies, as everywhere else: the anon key reads nothing
-- and all access goes through the functions.

ALTER TABLE "Dig_Rate"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dig_Depth_Factor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dig_Lay_Rate"     ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
--
-- The rates, and which one is assumed:
--
--   SELECT "Machine_Key", "Label", "Base_Rate_M3_Hr", "Setup_Minutes",
--          "Is_Default", "Source", "Sample_Size"
--     FROM "Dig_Rate" WHERE "Is_Active" ORDER BY "Sort_Order";
--
-- The bands, which should meet with no gap and no overlap:
--
--   SELECT "Depth_From_M", "Depth_To_M", "Factor", "Note"
--     FROM "Dig_Depth_Factor" ORDER BY "Depth_From_M";
--
-- The six surfaces, hardest to softest, with what each costs. Expect
-- Footway 1.45, Carriageway 1/2 1.75, Carriageway 3/4 2.10, Unmade
-- 1.00, Verge 0.90, Agricultural 0.85:
--
--   SELECT "Surface_Key", "Label", "Sort_Order", "Dig_Factor"
--     FROM "GIS_Surface_Type" WHERE "Is_Active" ORDER BY "Sort_Order";
--
-- A surface with no factor of its own, which is estimated as unmade
-- ground. Expect only Unmade itself; anything else here is a surface
-- added since this migration and wanting a figure:
--
--   SELECT "Surface_Key", "Label" FROM "GIS_Surface_Type"
--    WHERE "Is_Active" AND "Dig_Factor" = 1.0;
--
-- Ten metres of joint trench, 0.45m wide and 0.90m deep, in unmade
-- ground, with the default machine — the worked example the reference
-- table was built from. Expect about 1.03 hours of digging before
-- setup:
--
--   SELECT round(10 * 0.45 * 0.90 / r."Base_Rate_M3_Hr"
--                * d."Factor" * s."Dig_Factor", 2) AS dig_hours
--     FROM "Dig_Rate" r
--     JOIN "Dig_Depth_Factor" d
--       ON 0.90 >= d."Depth_From_M"
--      AND (d."Depth_To_M" IS NULL OR 0.90 < d."Depth_To_M")
--     JOIN "GIS_Surface_Type" s ON s."Surface_Key" = 'unmade'
--    WHERE r."Is_Default";
--
-- ── Calibrating ─────────────────────────────────────────────────
--
-- To replace an estimate with what actually happened:
--
--   UPDATE "Dig_Rate"
--      SET "Base_Rate_M3_Hr" = 5.2, "Source" = 'measured', "Sample_Size" = 31
--    WHERE "Machine_Key" = 'mini_3t';
--
-- The screens then say "From 31 recorded jobs" instead of "Planning
-- estimate", with no code change. Log the machine and whether any
-- hand-digging near live services was needed alongside each job before
-- averaging: hand-dig is usually the largest single source of variance
-- on utility trenching, and left in it pollutes every rate above.
