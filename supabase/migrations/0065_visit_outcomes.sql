-- ════════════════════════════════════════════════════════════════
-- 0065 — visit outcomes
--
-- 0022 seeded a guess: Completed, Partially Complete, and four separate
-- Aborted reasons. In use there are four, and two of them describe a
-- specific site condition rather than a generic failure — Dead Jointed
-- and No Mains are what the engineer found, not just that the visit
-- didn't finish.
--
-- Is_Aborted still matters: it is what tells the scheduling form a plot
-- is free to be scheduled again, so it has to be right on each of them.
-- Only Aborted frees the plot. Dead Jointed and No Mains are outcomes
-- of work that did happen, so the visit is not repeated on the strength
-- of them alone.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "Visit_Outcome" ("Visit_Outcome","Sort_Order","Is_Aborted","Is_Active") VALUES
  ('Completed',    10, false, true),
  ('Aborted',      20, true,  true),
  ('Dead Jointed', 30, false, true),
  ('No Mains',     40, false, true)
ON CONFLICT ("Visit_Outcome") DO UPDATE SET
  "Sort_Order" = EXCLUDED."Sort_Order",
  "Is_Aborted" = EXCLUDED."Is_Aborted",
  "Is_Active"  = true;

-- The originals go quiet, but only where nothing is recorded against
-- them. An outcome still on a connection stays, or that row starts
-- reading blank and the history of what happened is lost.
UPDATE "Visit_Outcome" v
   SET "Is_Active" = false
 WHERE v."Visit_Outcome" IN
       ('Partially Complete','Aborted — No Access','Aborted — Not Ready',
        'Aborted — Weather','Aborted — Other')
   AND NOT EXISTS (SELECT 1 FROM "Plot_Utility" pu
                    WHERE pu."Visit_Outcome_ID" = v."Visit_Outcome_ID");


-- ── Check ───────────────────────────────────────────────────────
-- Expect the four active, in order, with only Aborted flagged:
--   SELECT "Visit_Outcome", "Sort_Order", "Is_Aborted", "Is_Active"
--     FROM "Visit_Outcome" ORDER BY "Is_Active" DESC, "Sort_Order";
--
-- Any of the old ones still active are still in use. This says how many
-- connections are holding them, so they can be moved across by hand:
--   SELECT v."Visit_Outcome", COUNT(pu.*) AS connections
--     FROM "Visit_Outcome" v
--     LEFT JOIN "Plot_Utility" pu ON pu."Visit_Outcome_ID" = v."Visit_Outcome_ID"
--    WHERE v."Visit_Outcome" NOT IN ('Completed','Aborted','Dead Jointed','No Mains')
--    GROUP BY 1 HAVING COUNT(pu.*) > 0;
--
-- To move the old aborted reasons onto the single Aborted outcome:
--   UPDATE "Plot_Utility" SET "Visit_Outcome_ID" =
--          (SELECT "Visit_Outcome_ID" FROM "Visit_Outcome" WHERE "Visit_Outcome" = 'Aborted')
--    WHERE "Visit_Outcome_ID" IN
--          (SELECT "Visit_Outcome_ID" FROM "Visit_Outcome"
--            WHERE "Visit_Outcome" LIKE 'Aborted —%');
