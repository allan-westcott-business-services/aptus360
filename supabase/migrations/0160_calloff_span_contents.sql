-- ════════════════════════════════════════════════════════════════
-- 0160 — what is in each section of a mains call-off
--
-- The pipes and cables laid along a run, as one line of text, saved on
-- the section row.
--
-- ── Why it is stored ──
--
-- The same reason the estimate is (0159). It comes from the drawing —
-- which mains are routed along the trench sections a run crosses — and
-- the scheduling side holds none of the drawing. Recomputing it there
-- would mean loading every GIS feature on the project to render a table
-- of four rows.
--
-- And it would answer the wrong question. A call-off is a request for
-- work as it was understood on the day it was raised. What is in the
-- trench now is a different fact from what was in it then, and a
-- section that quietly gained a water main between the call-off and the
-- visit should show that it changed, not pretend it always had one.
--
-- ── Text, not a set of flags ──
--
-- The utilities are already recorded properly, on Call_Off_Utility.
-- This is not that. It is what a gang needs to read: "95 · 125mm PE ·
-- 63mm", the sizes as well as the kinds, in the order they are read on
-- a drawing. Modelling sizes relationally here would be a second
-- inventory of the network kept in step by hand — the drawing is the
-- inventory, and this is a note of what it said.
--
-- Null where the drawing could not answer: a section with nothing
-- routed in it yet, or a call-off raised before this existed. Null is
-- not an empty string — "nothing is laid here" and "nobody recorded it"
-- are different, and the screens say so differently.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Mains_Call_Off_Span"
  ADD COLUMN IF NOT EXISTS "Contents" text;

COMMENT ON COLUMN "Mains_Call_Off_Span"."Contents" IS
  'Pipes and cables along this section, as one line, from the drawing at the moment the call-off was raised. Null where unknown. Display only — the utilities themselves are on Call_Off_Utility.';


-- ── Check ───────────────────────────────────────────────────────
--
-- Recent Span sections, what each carries and what it was estimated at.
-- A section with contents and no estimate, or the other way round, is
-- worth a look: both come from the same walk of the drawing, so one
-- without the other means that walk half succeeded.
--
--   SELECT p."Span_ID", p."Plots", p."Estimated_Length_m",
--          p."Estimated_Half_Days", p."Contents"
--     FROM "Mains_Call_Off_Span" p
--     JOIN "Mains_Call_Off_Submission" s USING ("Submission_ID")
--    WHERE s."Selection_Mode" = 'Span'
--    ORDER BY p."Span_ID" DESC
--    LIMIT 20;
--
--   SELECT count(*) FILTER (WHERE "Contents" IS NULL
--                             AND "Estimated_Half_Days" IS NOT NULL) AS days_no_contents,
--          count(*) FILTER (WHERE "Contents" IS NOT NULL
--                             AND "Estimated_Half_Days" IS NULL) AS contents_no_days
--     FROM "Mains_Call_Off_Span";
--
-- Both should be zero on call-offs raised since this went in.
