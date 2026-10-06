-- ════════════════════════════════════════════════════════════════════
--  PART C — put pu_pack_trg back
-- ════════════════════════════════════════════════════════════════════
--
-- Run this even if PART B failed. A disabled trigger left behind is a
-- bug that shows up weeks later in the app, not here.

ALTER TABLE "Plot_Utility" ENABLE TRIGGER pu_pack_trg;

SELECT 'pu_pack_trg' AS "Trigger",
       CASE WHEN tgenabled = 'D' THEN 'STILL DISABLED - run this again'
            ELSE 'back on' END AS "State"
  FROM pg_trigger
 WHERE tgrelid = '"Plot_Utility"'::regclass AND tgname = 'pu_pack_trg';
