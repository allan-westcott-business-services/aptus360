-- ════════════════════════════════════════════════════════════════
-- 0098 — a breech joint is its own kind
--
-- The joint catalogue holds Straight, Tee, Service and Pot End. Placing
-- joints from the routed network needs a fourth: the point where an LV
-- feeder divides and carries on in two directions.
--
-- Not the same as the Tee already there. A tee takes a spur off a run
-- that continues past it; a breech is where the run itself becomes two,
-- and the two are different items with different costs. Tee is left in
-- place — anything already using it keeps working, and a service teed
-- off a main is still a tee.
--
-- Ids are left to the sequence: nothing references these by number.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "Electric_Joint" ("Joint_Type", "Joint_Code", "Description", "Sort_Order", "Is_Active")
SELECT 'Breech Joint', 'BRE',
       'Where an LV feeder divides and continues in two directions', 15, true
 WHERE NOT EXISTS (
   SELECT 1 FROM "Electric_Joint" WHERE "Joint_Code" = 'BRE'
 );


-- ── Check ───────────────────────────────────────────────────────
-- The four codes the automatic placement uses must all be present and
-- active. BRE, SVC and STR are placed by Build LV Network; TEE remains
-- for joints placed by hand.
--   SELECT "Joint_Code", "Joint_Type", "Is_Active"
--     FROM "Electric_Joint" ORDER BY "Sort_Order";
--
-- What has been placed on a drawing, by kind:
--   SELECT "Attributes" ->> 'Joint_Type' AS kind, COUNT(*)
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project id> AND "Feature_Role" = 'joint'
--    GROUP BY 1 ORDER BY 2 DESC;
