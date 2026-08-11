-- ════════════════════════════════════════════════════════════════
-- 0149 — jointing belongs to a service call-off
--
-- A mains dig is excavated, laid and reinstated. The joints onto it are
-- service work, called off separately, so a mains call-off should never
-- raise a jointing assignment.
--
-- Nothing in the application names a phase: the sequence lives entirely
-- in Work_Type_Task_Type, which is the right place for it and also
-- means the rule can be changed by anyone with the admin screen open.
-- This corrects the rows; checkphases.mjs holds the fixture so the
-- offline board and the tests cannot drift from it.
--
-- ── Existing call-offs ──
--
-- Only the rule is changed here, not work already raised. A mains
-- call-off with a jointing assignment already booked keeps it: somebody
-- may be standing on site on the strength of it, and deleting a booking
-- because a rule changed underneath it is not a correction, it is a
-- surprise. The query at the foot lists them so they can be dealt with
-- deliberately.
-- ════════════════════════════════════════════════════════════════

DELETE FROM "Work_Type_Task_Type" wtt
 USING "Work_Type" wt, "Task_Type" tt
 WHERE wtt."Work_Type_ID" = wt."Work_Type_ID"
   AND wtt."Task_Type_ID" = tt."Task_Type_ID"
   AND tt."Task_Type_Name" ILIKE 'joint%'
   AND wt."Work_Type_Name" ILIKE '%mains%';


-- ── Check ───────────────────────────────────────────────────────
-- What each kind of call-off is now made of:
--   SELECT wt."Work_Type_Name",
--          string_agg(tt."Task_Type_Name", ' -> '
--                     ORDER BY wtt."Display_Order") AS phases
--     FROM "Work_Type_Task_Type" wtt
--     JOIN "Work_Type" wt USING ("Work_Type_ID")
--     JOIN "Task_Type" tt USING ("Task_Type_ID")
--    GROUP BY wt."Work_Type_Name";
--
-- Jointing already booked against a mains call-off, which this leaves
-- alone. Worth looking at, and worth cancelling deliberately rather
-- than by migration:
--   SELECT a."Assignment_ID", s."AP_Number", tt."Task_Type_Name"
--     FROM "Call_Off_Assignment" a
--     JOIN "Mains_Call_Off_Submission" s USING ("Submission_ID")
--     JOIN "Work_Type" wt ON wt."Work_Type_ID" = s."Work_Type_ID"
--     JOIN "Task_Type" tt ON tt."Task_Type_ID" = a."Task_Type_ID"
--    WHERE tt."Task_Type_Name" ILIKE 'joint%'
--      AND wt."Work_Type_Name" ILIKE '%mains%';
