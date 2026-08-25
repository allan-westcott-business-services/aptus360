-- ════════════════════════════════════════════════════════════════
-- 0190 — the joint allowance the calculation already reads
--
-- GISCanvasPage.jsx reads Electric_VD_Setting.Joint_Equivalent_M in
-- three places, voltDrop.js charges it in legVoltDrop, and
-- checksourceimpedance.mjs asserts that every settings object carries
-- it. Nothing creates the column.
--
-- So `Number(vs.Joint_Equivalent_M) || 0` has been resolving to 0 on
-- every load since the code went in, and the allowance has never once
-- fired. The check passes because it reads the source rather than the
-- database. The comments in voltDrop.js cite migration 0187 for this;
-- 0187 in this repository is the reducer role, so the file was either
-- renumbered or never written.
--
-- ── What it is ──
-- Cutting a main and jointing a service onto it puts resistance in the
-- run that undisturbed cable does not have. It is charged as an
-- EQUIVALENT LENGTH of the leg's own cable, so the cost scales with the
-- cable — a joint in 300mm waveform is not a joint in 95mm — and so it
-- lands in ohms and in %VD together, both being computed from length.
--
-- ── The default is 3, and that CHANGES EXISTING FIGURES ──
-- Three metres is what voltDrop.js documents. Applying it moves every
-- loop impedance and every volt drop upward the first time a drawing is
-- opened after this runs, in proportion to how many plot connections
-- are made along the route. A run with ten connections gains thirty
-- metres of charged length.
--
-- That direction is the safe one: readings become more pessimistic, so
-- a design that passed and should not have will now show it, rather
-- than the reverse. But it is a change to numbers that may already have
-- been submitted, so it is stated here rather than left to be noticed.
--
-- To keep the figures exactly as they are today and turn the allowance
-- on deliberately later:
--
--   ALTER TABLE "Electric_VD_Setting" ALTER COLUMN "Joint_Equivalent_M" SET DEFAULT 0;
--   UPDATE "Electric_VD_Setting" SET "Joint_Equivalent_M" = 0;
--
-- Zero switches it off entirely and gives the calculation this app had
-- before, which is the way back if a design was submitted on the old
-- numbers.
--
-- Not null, because null would flow into Number(...) || 0 and be
-- indistinguishable from a deliberate zero.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Electric_VD_Setting"
  ADD COLUMN IF NOT EXISTS "Joint_Equivalent_M" numeric NOT NULL DEFAULT 3;

COMMENT ON COLUMN "Electric_VD_Setting"."Joint_Equivalent_M" IS
  'Metres of the leg''s own cable charged for each plot connection made '
  'on that leg. Applies to loop impedance and volt drop together, both '
  'being computed from length. Zero disables the allowance.';


-- ── Guard ────────────────────────────────────────────────────────
-- The app reads the first row it finds and the calculation depends on
-- there being exactly one. A negative figure would shorten the charged
-- run and report a drop better than the truth, which is the one
-- direction a wrong number here must not go. voltDrop.js already
-- guards against it at the point of use; this stops it being stored.
ALTER TABLE "Electric_VD_Setting"
  DROP CONSTRAINT IF EXISTS "Electric_VD_Setting_Joint_Equivalent_M_check";
ALTER TABLE "Electric_VD_Setting"
  ADD CONSTRAINT "Electric_VD_Setting_Joint_Equivalent_M_check"
  CHECK ("Joint_Equivalent_M" >= 0);


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Joint_Equivalent_M", "Max_Loop_Ohms", "Max_Volt_Drop_Pct",
--          "Distributed_Load_Factor", "Unbalanced"
--     FROM "Electric_VD_Setting";
--
-- One row, and Joint_Equivalent_M reads 3.
--
-- How much length the allowance adds to a circuit, before anyone is
-- surprised by a figure moving — one row per circuit, the metres its
-- plot connections will now be charged:
--   SELECT f."Attributes" ->> 'Circuit_Letter' AS circuit,
--          count(*) AS connections,
--          count(*) * (SELECT "Joint_Equivalent_M" FROM "Electric_VD_Setting" LIMIT 1) AS added_m
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Role" = 'meter' AND f."Project_ID" = <project>
--    GROUP BY 1 ORDER BY 1;
