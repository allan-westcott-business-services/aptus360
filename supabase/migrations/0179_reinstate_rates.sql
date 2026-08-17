-- ════════════════════════════════════════════════════════════════
-- 0179 — how long reinstatement takes
--
-- Nothing estimated it. The phase existed, took days, and got a blank
-- end date that somebody filled in from memory — the same state
-- jointing was in until 0176.
--
-- ── What drives it ──
--
-- Area and surface. Reinstating a hundred metres of carriageway is a
-- different job from a hundred metres of verge, and the difference is
-- the surface rather than the length. Both are already recorded: the
-- trench carries its length and width, and its surface type.
--
-- So the rate is square metres an hour, per surface, and it belongs on
-- GIS_Surface_Type — one row per surface, already on the Dig & Lay
-- Rates screen.
--
-- ── Seeded empty, deliberately ──
--
-- The dig rates in this system were seeded with plausible figures and
-- have driven every estimate since without anybody examining them.
--
-- There is no free source for these. SROH and the council standard
-- details specify materials, layer depths and compaction and say
-- nothing about durations; the recognised output rates are in Spon's
-- Civil Engineering and Highway Works Price Book, which is a commercial
-- annual. Everything else findable is the wrong country.
--
-- So a surface with no rate produces no estimate and says so, which is
-- what a blank end date already means. Once somebody who has laid
-- tarmac puts a number in, the phase estimates itself — and the figure
-- has an author.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Surface_Type"
  -- Square metres reinstated an hour, by a gang working at the pace the
  -- rate tables assume. Null means nobody has said, which is different
  -- from zero.
  ADD COLUMN IF NOT EXISTS "Reinstate_M2_Hr" numeric,
  -- Where the figure came from, the same way Dig_Rate records it: a rate
  -- from eleven real jobs is a different thing from one somebody
  -- estimated, and a table that cannot tell them apart invites treating
  -- both as measured.
  ADD COLUMN IF NOT EXISTS "Reinstate_Source" text,
  ADD COLUMN IF NOT EXISTS "Reinstate_Sample_Size" integer,
  -- Setting up: signing, guarding, barriers, and getting the materials
  -- to the face. Per visit rather than per square metre, the same way
  -- the dig carries the machine's setup — a two-metre patch and a
  -- forty-metre run are guarded much the same.
  ADD COLUMN IF NOT EXISTS "Reinstate_Setup_Minutes" integer;

ALTER TABLE "GIS_Surface_Type"
  DROP CONSTRAINT IF EXISTS surface_reinstate_positive;
ALTER TABLE "GIS_Surface_Type"
  ADD CONSTRAINT surface_reinstate_positive
  CHECK ("Reinstate_M2_Hr" IS NULL OR "Reinstate_M2_Hr" > 0);

ALTER TABLE "GIS_Surface_Type"
  DROP CONSTRAINT IF EXISTS surface_reinstate_setup;
ALTER TABLE "GIS_Surface_Type"
  ADD CONSTRAINT surface_reinstate_setup
  CHECK ("Reinstate_Setup_Minutes" IS NULL OR "Reinstate_Setup_Minutes" >= 0);

ALTER TABLE "GIS_Surface_Type"
  DROP CONSTRAINT IF EXISTS surface_reinstate_source;
ALTER TABLE "GIS_Surface_Type"
  ADD CONSTRAINT surface_reinstate_source
  CHECK ("Reinstate_Source" IS NULL
      OR "Reinstate_Source" IN ('estimate', 'measured'));

-- Source and sample size are written together with the rate, never
-- separately: a sample size against no rate says nothing, and a rate
-- whose provenance can be edited on its own is a rate that can be made
-- to look measured.
ALTER TABLE "GIS_Surface_Type"
  DROP CONSTRAINT IF EXISTS surface_reinstate_provenance;
ALTER TABLE "GIS_Surface_Type"
  ADD CONSTRAINT surface_reinstate_provenance
  CHECK ("Reinstate_Source" IS NULL OR "Reinstate_M2_Hr" IS NOT NULL);

COMMENT ON COLUMN "GIS_Surface_Type"."Reinstate_M2_Hr" IS 'Square metres reinstated an hour at the pace the rate tables assume. Null means nobody has set it, and the phase gets no estimate rather than a guessed one.';


-- ── Check ───────────────────────────────────────────────────────
--
-- What has been set, and by what authority. Expect every rate null
-- until a project manager fills them in:
--
--   SELECT "Label", "Reinstate_M2_Hr", "Reinstate_Setup_Minutes",
--          "Reinstate_Source", "Reinstate_Sample_Size"
--     FROM "GIS_Surface_Type" WHERE "Is_Active" ORDER BY "Sort_Order";
--
-- ** Surfaces still without a rate. ** Each is a phase that gets no
-- estimate and a blank end date somebody fills in by hand:
--
--   SELECT "Label" FROM "GIS_Surface_Type"
--    WHERE "Is_Active" AND "Reinstate_M2_Hr" IS NULL ORDER BY "Sort_Order";
--
-- Rates still marked as estimates once real jobs have run. The field
-- app records when a job starts and when it is submitted, so these can
-- be corrected from what actually happened:
--
--   SELECT "Label", "Reinstate_M2_Hr", "Reinstate_Sample_Size"
--     FROM "GIS_Surface_Type"
--    WHERE "Reinstate_Source" = 'estimate' ORDER BY "Sort_Order";
