-- ════════════════════════════════════════════════════════════════
-- 0178 — the machine a team digs with, and how fast that team works
--
-- Every dig estimate has assumed the same machine and the same pace.
-- Neither is true: a gang with a 13t excavator moves several times the
-- ground a 1.5t micro does, and an experienced gang delivers up to half
-- again what an apprentice one manages on the same machine.
--
-- Both were invisible in the plan, so a fortnight booked for one team
-- was a fortnight booked for any team.
--
-- ── Why they are separate numbers ──
--
-- The machine is a rate the tables already hold: Dig_Rate is keyed by
-- machine and carries the cubic metres an hour each one shifts. A team
-- points at one.
--
-- The gang's pace is not in those tables and should not be. Dig_Rate
-- describes the job — this much earth, this machine, this surface — and
-- is calibrated from real work. A multiplier describes the gang. Two
-- rate tables would drift, and nobody would know which was being
-- corrected.
--
-- ── Why the call-off carries its own ──
--
-- A call-off is raised from the drawing before any team is assigned, so
-- it cannot inherit from one. It takes the system default machine, is
-- editable when raised, and the team's own machine applies once the
-- office schedules it.
--
-- The estimate stored on a span is what Planning defaults an end date
-- from, so it has to be a real figure from the start rather than a
-- placeholder.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Team"
  -- The machine this team normally digs with. Null means the default in
  -- Dig_Rate, which is what every team used before this.
  ADD COLUMN IF NOT EXISTS "Dig_Rate_ID" bigint
    REFERENCES "Dig_Rate" ("Dig_Rate_ID") ON DELETE SET NULL,

  -- How this team compares to the pace the rate tables assume. 1 is the
  -- tables' own figure; 1.5 is a team delivering half again.
  --
  -- Bounded, because the field is typed by hand and a team entered at 0
  -- would take no time at all while one at 10 would finish a street in
  -- an afternoon. Wide enough for any real gang, narrow enough to catch
  -- a slip.
  ADD COLUMN IF NOT EXISTS "Efficiency" numeric NOT NULL DEFAULT 1;

ALTER TABLE "Team"
  DROP CONSTRAINT IF EXISTS team_efficiency_range;
ALTER TABLE "Team"
  ADD CONSTRAINT team_efficiency_range
  CHECK ("Efficiency" >= 0.25 AND "Efficiency" <= 3);

COMMENT ON COLUMN "Team"."Efficiency" IS 'How this team compares to the pace the Dig_Rate tables assume. 1 is the tables figure; 1.5 is a team delivering half again. Applied to digging, jointing and reinstating, not to setting up — moving and matting a machine takes what it takes.';


-- The machine a call-off assumes. Set when it is raised, from the
-- system default, and editable there.
ALTER TABLE "Mains_Call_Off_Submission"
  ADD COLUMN IF NOT EXISTS "Dig_Rate_ID" bigint
    REFERENCES "Dig_Rate" ("Dig_Rate_ID") ON DELETE SET NULL;

COMMENT ON COLUMN "Mains_Call_Off_Submission"."Dig_Rate_ID" IS 'The machine assumed when this call-off was estimated. Null means the Dig_Rate default. The assigned team may dig with something else, which is said rather than silently re-estimated.';


-- ── Check ───────────────────────────────────────────────────────
--
-- Teams and what they dig with. Null is the default machine, 1 is the
-- tables' own pace — expect every team to read that way until somebody
-- sets them:
--
--   SELECT t."Team_Name", d."Label" AS machine, t."Efficiency"
--     FROM "Team" t
--     LEFT JOIN "Dig_Rate" d ON d."Dig_Rate_ID" = t."Dig_Rate_ID"
--    WHERE t."Active" ORDER BY t."Team_Name";
--
-- Teams whose pace has been moved off 1. Each is a claim that a gang is
-- faster or slower than the tables, and it wants to be a judgement
-- somebody made rather than a typo:
--
--   SELECT "Team_Name", "Efficiency" FROM "Team"
--    WHERE "Efficiency" <> 1 ORDER BY "Efficiency";
--
-- Call-offs raised against a machine that is not the default. Worth
-- seeing, because each one is somebody overriding the assumption:
--
--   SELECT s."Submission_ID", d."Label" AS machine
--     FROM "Mains_Call_Off_Submission" s
--     JOIN "Dig_Rate" d ON d."Dig_Rate_ID" = s."Dig_Rate_ID"
--    WHERE NOT d."Is_Default" ORDER BY s."Submission_ID" DESC;
