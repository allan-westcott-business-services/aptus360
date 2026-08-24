-- ════════════════════════════════════════════════════════════════
-- 0180 — energising the substation, once
--
-- The first electric service call-off on a site needs work at the
-- substation that none of the ones after it do: the transformer is
-- energised and the network goes live. It is real work, it takes a day,
-- and it was nowhere in the plan — so the first call-off was scheduled
-- as though it were the fifth.
--
-- ── Why a phase and not a call-off of its own ──
--
-- Because it happens as part of that visit and is booked against the
-- same team on the same days. A call-off of its own would be a second
-- thing to schedule, assign and review for work that is not separable
-- from the one beside it.
--
-- ── Why a flag on the submission ──
--
-- Work_Type_Task_Type says which phases a work type has, and every
-- electric service call-off has the same ones. This is not a property
-- of the work type: it is true of one call-off on a project and false
-- of every other, so it belongs on the call-off.
--
-- ── What "first" means ──
--
-- The first that has not been withdrawn. An abandoned call-off did not
-- energise anything, and treating it as the first would leave the site
-- with no energisation booked at all.
--
-- Aborted is not withdrawn: that visit is being rescheduled, and the
-- energisation is still coming with it.
-- ════════════════════════════════════════════════════════════════

-- The phase itself. Not mapped against a work type, because it is not
-- true of every call-off of that type — the flag below is what puts it
-- on the one that carries it.
--
-- ── Where it sits, and why 15 ──
--
-- In the order the work happens: the cable goes in, the substation is
-- switched on, the joints are made onto a live network, and the ground
-- is reinstated last. 15 puts it after excavate-and-lay and before
-- jointing.
--
-- Every other phase takes its order from Work_Type_Task_Type, which
-- says where a phase sits within its work type. This one belongs to no
-- work type, so the task type's own Display_Order is the only order it
-- has, and the page sorts on it.
--
-- The first version of this file seeded it at 40 — the end of the list
-- — and the phase read as work happening after the ground was closed.
INSERT INTO "Task_Type" ("Task_Type_Name", "Display_Order", "Is_Active")
SELECT 'Energisation', 15, true
 WHERE NOT EXISTS (
   SELECT 1 FROM "Task_Type" WHERE "Task_Type_Name" = 'Energisation');

-- And moved, where an earlier run of this file seeded it at 40.
--
-- The insert above is guarded on the name, so on any database that has
-- already had this file pasted into it the row exists and the insert
-- does nothing — leaving the phase exactly where the fault put it. The
-- correction has to be a separate statement or it never runs anywhere
-- it is needed.
--
-- Safe to run twice: it sets the value rather than adjusting it, and
-- does nothing on a row already at 15.
UPDATE "Task_Type"
   SET "Display_Order" = 15
 WHERE "Task_Type_Name" = 'Energisation'
   AND "Display_Order" IS DISTINCT FROM 15;

ALTER TABLE "Mains_Call_Off_Submission"
  -- Whether this call-off carries the substation energisation. Set when
  -- it is raised, from whether any earlier electric service call-off on
  -- the project still stands.
  ADD COLUMN IF NOT EXISTS "Needs_Energisation" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "Mains_Call_Off_Submission"."Needs_Energisation" IS 'True on the first electric service call-off for a project — the visit that energises the substation. Judged at the moment of raising, against call-offs that have not been withdrawn.';

-- One per project. Two call-offs each believing they energise the
-- substation is a day booked twice and a question nobody can answer
-- from the data.
CREATE UNIQUE INDEX IF NOT EXISTS calloff_one_energisation
  ON "Mains_Call_Off_Submission" ("Project_ID")
  WHERE "Needs_Energisation";


-- ── Check ───────────────────────────────────────────────────────
--
-- Which call-off carries it, per project. Expect none or one:
--
--   SELECT s."Project_ID", s."Submission_ID", s."Status", s."Preferred_Date"
--     FROM "Mains_Call_Off_Submission" s
--    WHERE s."Needs_Energisation" ORDER BY s."Project_ID";
--
-- ** Projects with electric service call-offs and no energisation. **
-- Each is a site where the substation is never switched on by anybody's
-- programme — which happens if the call-off carrying it is later
-- withdrawn, since the flag stays where it was put:
--
--   SELECT DISTINCT s."Project_ID"
--     FROM "Mains_Call_Off_Submission" s
--     JOIN "Work_Type" wt       ON wt."Work_Type_ID" = s."Work_Type_ID"
--     JOIN "Call_Off_Utility" u ON u."Submission_ID" = s."Submission_ID"
--     JOIN "Utility" ut         ON ut."Utility_ID" = u."Utility_ID"
--    WHERE wt."Selection_Mode" = 'PlotList'
--      AND ut."Utility" ILIKE 'electric'
--      AND s."Status" NOT LIKE 'Withdrawn%'
--      AND NOT EXISTS (
--        SELECT 1 FROM "Mains_Call_Off_Submission" e
--         WHERE e."Project_ID" = s."Project_ID" AND e."Needs_Energisation")
--    ORDER BY 1;
--
-- Selection_Mode is on Work_Type, not on the submission — the endpoint
-- uses it to decide which child table a call-off's rows live in and
-- does not store it. Written here because the first version of this
-- query read it off the submission and would not run.
