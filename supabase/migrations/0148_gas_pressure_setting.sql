-- ════════════════════════════════════════════════════════════════
-- 0148 — the pressure a gas network has to hold up
--
-- One row, the same shape as Electric_VD_Setting: limits that belong to
-- the business rather than to a project, read by the gas levels check
-- and editable in Admin.
--
-- ── The minimum ──
--
-- 19 mbar at the outlet of the meter is the usual low-pressure design
-- floor: a domestic meter regulator needs about that to hold 21 mbar at
-- the appliance, and the standard allowance from the governor is 23
-- down to 19 across the network.
--
-- A default, not a rule. Operators differ and a scheme fed at 21 mbar
-- has less to give away, so it is a column somebody can change rather
-- than a constant somebody has to find in the code.
--
-- ── Amber before red ──
--
-- Percent of the way from the minimum to the source. A node at 19.2
-- mbar passes and will not survive the next plot being added, and a
-- report that says nothing until it fails is one that gets acted on
-- too late. Same idea as RAG_Amber_Pct on the electric side.
--
-- ── The tee allowance ──
--
-- Equivalent length for a service tee, in pipe diameters. About 60 for
-- a tee through the branch. Here rather than in the code because it is
-- the number most likely to want changing once a job has been measured
-- against a model: our own GASWorkS model carried fitting allowances
-- that turned out not to be service tees, so it could not be taken
-- from there and has not yet been calibrated.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Gas_Pressure_Setting" (
  "Gas_Pressure_Setting_ID" bigserial PRIMARY KEY,
  "Min_Pressure_mBar"       numeric NOT NULL DEFAULT 19,
  "Amber_Pct"               numeric NOT NULL DEFAULT 80,
  "Tee_Diameters"           numeric NOT NULL DEFAULT 60,
  "Efficiency"              numeric NOT NULL DEFAULT 0.95,
  "Temperature_C"           numeric NOT NULL DEFAULT 5,
  -- Exactly one row, enforced rather than assumed: the app reads the
  -- first it finds, and a second would silently change the answer
  -- depending on order. Same guard as the electric settings.
  "Only_Row"                boolean NOT NULL DEFAULT true UNIQUE
);

INSERT INTO "Gas_Pressure_Setting" ("Only_Row") VALUES (true)
  ON CONFLICT DO NOTHING;

ALTER TABLE "Gas_Pressure_Setting" ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
--   SELECT * FROM "Gas_Pressure_Setting";
