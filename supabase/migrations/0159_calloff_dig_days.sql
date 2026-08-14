-- ════════════════════════════════════════════════════════════════
-- 0159 — the dig and lay estimate, kept on the call-off
--
-- Planning needs to know how long a call-off's trenching takes, so an
-- assignment can open with an end date already in it rather than an
-- empty box.
--
-- ── Why it is stored rather than worked out again ──
--
-- The estimate comes from the drawing: the trench sections a run
-- crosses, what is laid in each, and how wide and deep that makes them.
-- Planning has none of that. Recomputing it there would mean loading
-- every GIS feature on the project to open one assignment, which is a
-- large read for a default somebody may immediately change.
--
-- Worse, it would move. A call-off is a request for work as it was
-- understood on the day it was raised. If the estimate were recomputed
-- whenever Planning opened it, routing another cable into a trench
-- would silently lengthen a booking a team had already been given. The
-- figure belongs to the call-off, so it is written once when the
-- call-off is created and does not change afterwards.
--
-- ── Half-days, not hours ──
--
-- Because that is the unit the planner books in: assignments.js works
-- in halves throughout, and a booking is placed half by half around
-- weekends and non-working days. Storing hours would mean every reader
-- converting them, and two readers disagreeing about the length of a
-- day.
--
-- ── Two columns, at two levels ──
--
-- The total on the submission is what an assignment covering the whole
-- call-off defaults from. The per-section figure is on the span row
-- because a call-off split between two teams is two bookings, and each
-- should get the length of the sections it actually covers rather than
-- the whole job. Nothing reads the per-section figure yet; it is stored
-- now because it is free to store at the moment the total is worked out
-- and impossible to recover later, once the drawing has moved on.
--
-- Null means the call-off was raised before this existed, or that the
-- drawing could not answer — a section whose ends are not both on the
-- trench network has no route to measure. Null is not zero, and the
-- form leaves the end date empty rather than defaulting to the start
-- date, because an estimate of "no work" is not something this can
-- honestly produce.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Mains_Call_Off_Submission"
  ADD COLUMN IF NOT EXISTS "Estimated_Half_Days" integer;

COMMENT ON COLUMN "Mains_Call_Off_Submission"."Estimated_Half_Days" IS
  'Half-days to excavate and lay every section on this call-off, from the drawing at the moment it was raised. Null where unknown. Planning defaults an assignment end date from it.';

ALTER TABLE "Mains_Call_Off_Span"
  ADD COLUMN IF NOT EXISTS "Estimated_Half_Days" integer;

COMMENT ON COLUMN "Mains_Call_Off_Span"."Estimated_Half_Days" IS
  'Half-days to excavate and lay this section. Null where the drawing could not answer for it.';

-- Not negative, and not a fraction. A gang cannot be sent for part of a
-- half-day, so anything arriving here has already been rounded up.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mains_call_off_submission_half_days'
  ) THEN
    ALTER TABLE "Mains_Call_Off_Submission"
      ADD CONSTRAINT mains_call_off_submission_half_days
      CHECK ("Estimated_Half_Days" IS NULL OR "Estimated_Half_Days" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mains_call_off_span_half_days'
  ) THEN
    ALTER TABLE "Mains_Call_Off_Span"
      ADD CONSTRAINT mains_call_off_span_half_days
      CHECK ("Estimated_Half_Days" IS NULL OR "Estimated_Half_Days" >= 0);
  END IF;
END $$;


-- ── Check ───────────────────────────────────────────────────────
--
-- Recent Span call-offs and what each was estimated at. The total
-- should be the sum of its sections, or null where no section could be
-- estimated:
--
--   SELECT s."Submission_ID", s."Estimated_Half_Days" AS total,
--          count(p.*) AS sections,
--          sum(p."Estimated_Half_Days")  AS sum_of_sections,
--          count(*) FILTER (WHERE p."Estimated_Half_Days" IS NULL) AS not_estimated
--     FROM "Mains_Call_Off_Submission" s
--     LEFT JOIN "Mains_Call_Off_Span" p USING ("Submission_ID")
--    WHERE s."Selection_Mode" = 'Span'
--    GROUP BY s."Submission_ID", s."Estimated_Half_Days"
--    ORDER BY s."Submission_ID" DESC
--    LIMIT 20;
--
-- Where sum_of_sections is below total, some sections could not be
-- estimated and not_estimated says how many. That is a call-off whose
-- ends are not all on the trench network, not a fault in the sum.
--
-- Call-offs raised before this existed, which get no default end date:
--
--   SELECT count(*) FROM "Mains_Call_Off_Submission"
--    WHERE "Selection_Mode" = 'Span' AND "Estimated_Half_Days" IS NULL;
