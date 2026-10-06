-- ════════════════════════════════════════════════════════════════════
--  PART D — check it
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. What to expect, from the run on my copy of your data:
--
--   33,052 imported, 315 superseded visits dropped, 13 waiting
--   electric / gas / water roughly 11,250 / 9,640 / 11,880
--   around 7,200 with no adopter - those had a BLANK adopter in the
--     old system, not a name that failed to match
--   row 2.4 must be 0: Team_ID is deliberately not written
--
-- Rows 2.1 and 2.2 are the ones that matter. They distinguish "the old
-- system did not say" from "the import lost it", and both were 0 on my
-- copy. Anything other than 0 in either is worth stopping for.

SELECT * FROM (
  SELECT 1::numeric AS "#", 'Connections imported' AS "What",
         count(*)::text || ' rows carry a Legacy_Plot_Utility_ID' AS "Detail"
    FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL

  UNION ALL
  SELECT 1.1, 'By utility',
         COALESCE(string_agg(t.u || ': ' || t.n, ', ' ORDER BY t.u), 'none')
    FROM (SELECT u."Utility" AS u, count(*)::text AS n
            FROM "Plot_Utility" pu
            JOIN "Utility" u ON u."Utility_ID" = pu."Utility_ID"
           WHERE pu."Legacy_Plot_Utility_ID" IS NOT NULL
           GROUP BY u."Utility") t

  UNION ALL
  SELECT 2, 'Without an adopter',
         count(*)::text || ' of the imported rows have no IDNO_Organisation_ID'
    FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "IDNO_Organisation_ID" IS NULL

  UNION ALL
  -- IDNO_ID is the legacy column, filled only where the adopter's
  -- organisation actually has an IDNO row. A water undertaker or a gas
  -- transporter has none, and leaving it null is correct.
  SELECT 2.3, 'Legacy IDNO_ID filled',
         count(*)::text || ' of the imported rows reach an IDNO row too'
    FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "IDNO_ID" IS NOT NULL

  UNION ALL
  SELECT 2.4, 'Team_ID deliberately not written',
         count(*)::text || ' imported rows carry a Team_ID - expected 0. '
         || 'The old team ids are in Legacy_Connection_Import and can be '
         || 'mapped by name once the old Team table is exported.'
    FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "Team_ID" IS NOT NULL

  UNION ALL
  -- The two that would mean something went wrong rather than something
  -- was blank to begin with. Both should be 0.
  SELECT 2.1, 'Lost an adopter that WAS named',
         count(*)::text || ' rows named an adopter and did not get one'
    FROM "Plot_Utility" pu
    JOIN "Legacy_Connection_Import" i
      ON NULLIF(btrim(i."Plot_Utility_ID"), '')::bigint = pu."Legacy_Plot_Utility_ID"
   WHERE pu."IDNO_Organisation_ID" IS NULL
     AND COALESCE(btrim(i."Adopter"), '') <> ''

  UNION ALL
  SELECT 2.2, 'Pack status rewritten',
         count(*)::text || ' rows hold a status the old system did not say'
    FROM "Plot_Utility" pu
    JOIN "Legacy_Connection_Import" i
      ON NULLIF(btrim(i."Plot_Utility_ID"), '')::bigint = pu."Legacy_Plot_Utility_ID"
    JOIN "Pack_Status" s ON s."Pack_Status_ID" = pu."Pack_Status_ID"
   WHERE upper(btrim(s."Pack_Status")) <> upper(btrim(i."Status_Of_Pack"))

  UNION ALL
  SELECT 3, 'Not imported',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE new_plot_id IS NULL)::text || ' waiting on their plot, '
         || (SELECT count(*) FROM "Legacy_Connection_Resolved"
              WHERE new_plot_id IS NOT NULL AND dup_rank > 1)::text
         || ' superseded visits dropped'

  UNION ALL
  SELECT 4, 'Plots with at least one connection',
         (SELECT count(DISTINCT "Plot_ID") FROM "Plot_Utility"
           WHERE "Legacy_Plot_Utility_ID" IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL)::text
         || ' imported plots'

  UNION ALL
  SELECT 5, 'The trigger',
         (SELECT CASE WHEN tgenabled = 'D' THEN 'STILL DISABLED - run PART C'
                      ELSE 'enabled' END
            FROM pg_trigger WHERE tgrelid = '"Plot_Utility"'::regclass
             AND tgname = 'pu_pack_trg')
) z ORDER BY "#";


-- ── Undo, if it comes to that ───────────────────────────────────────
--
-- Only the imported rows. Anything entered in the app has no legacy id
-- and is not touched.
--
--   DELETE FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
--
-- ── And if you want the trigger's inference after all ───────────────
--
-- This is the thing PART A counted. It applies to the imported rows
-- only: a blank or Pack In Progress status, with a service card date,
-- becomes Submitted.
--
--   UPDATE "Plot_Utility" SET "Pack_Status_ID" =
--     (SELECT "Pack_Status_ID" FROM "Pack_Status" WHERE "Pack_Status" = 'Submitted')
--    WHERE "Legacy_Plot_Utility_ID" IS NOT NULL
--      AND "Service_Card_Submission_Date" IS NOT NULL
--      AND ("Pack_Status_ID" IS NULL OR "Pack_Status_ID" IN
--           (SELECT "Pack_Status_ID" FROM "Pack_Status"
--             WHERE "Pack_Status" IN ('Pack Not Submitted','Pack In Progress')));
