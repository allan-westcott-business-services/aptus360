-- ════════════════════════════════════════════════════════════════════
--  The connections — run 0256 first, then these parts in order
-- ════════════════════════════════════════════════════════════════════
--
-- Run PART A, then B, then C, then D. One at a time: the editor only
-- shows the last result set, so a part that reports something you need
-- to read has to be the thing you ran.
--
-- Nothing here is irreversible. Every row is stamped with its
-- Legacy_Plot_Utility_ID and PART E can undo the lot.
--
-- ════════════════════════════════════════════════════════════════════
--  PART A — stand pu_pack_trg down, and say what it would have done
-- ════════════════════════════════════════════════════════════════════
--
-- pu_pack_trg fires BEFORE INSERT on Plot_Utility:
--
--     IF NEW."Service_Card_Submission_Date" IS NOT NULL AND OLD IS NULL
--        AND (status IS NULL OR status IN ('Pack Not Submitted',
--                                          'Pack In Progress'))
--        THEN NEW."Pack_Status_ID" := <Submitted>
--
-- That is right for a pack being submitted in the app today. It is
-- wrong for history: it would rewrite what the old system recorded.
-- With 0256 run, Returned, Issued and IT Issues all resolve and the
-- trigger leaves them alone — but a row the old system marked Pack In
-- Progress, or left blank, would still come out as Submitted.
--
-- So the import lands exactly what the old system said, and this part
-- counts the rows the trigger would have changed so you can decide
-- afterwards. Running it is a one-line UPDATE either way; silently
-- inventing a status during a migration is not undoable.
--
-- It is cheap, by the way — two lookups against a five-row table. Not
-- the 19.5 million rows recalc_project_points turned out to read.

ALTER TABLE "Plot_Utility" DISABLE TRIGGER pu_pack_trg;

SELECT 'pu_pack_trg' AS "Trigger",
       (SELECT CASE WHEN tgenabled = 'D' THEN 'disabled' ELSE 'STILL ON' END
          FROM pg_trigger WHERE tgrelid = '"Plot_Utility"'::regclass
           AND tgname = 'pu_pack_trg') AS "State",
       (SELECT count(*) FROM "Legacy_Connection_Resolved" r
         WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1
           AND COALESCE(btrim(r."Service_Card_Submission_Date"), '') <> ''
           AND (r.pack_status_id IS NULL
                OR r.pack_status_id IN (SELECT "Pack_Status_ID" FROM "Pack_Status"
                                         WHERE "Pack_Status" IN ('Pack Not Submitted',
                                                                 'Pack In Progress')))
       )::text || ' rows it would have stamped Submitted' AS "Would have changed";


-- ════════════════════════════════════════════════════════════════════
--  PART B — the connections
-- ════════════════════════════════════════════════════════════════════
--
-- Three filters, and each one is a failure the plot import taught:
--
--   new_plot_id IS NOT NULL   its plot is here. 13 are not, because
--                             their plot belongs to a tender.
--   dup_rank = 1              the completed visit, not the aborted
--                             attempt it superseded. UNIQUE ("Plot_ID",
--                             "Utility_ID") would reject 315 rows
--                             without this.
--   not already here          twice over: not by legacy id, so a
--                             re-run adds nothing, AND not by plot and
--                             utility, so a connection somebody
--                             entered in the app is never trampled.
--
-- MPAN_MPRN is still not written. The new table has Meter_Reference
-- and Reference and which holds a supply number has not been settled.
-- 16,525 rows carry one; settle it and a re-run fills them in, because
-- the rows are matched on their legacy id.

INSERT INTO "Plot_Utility" (
  "Plot_ID", "Utility_ID", "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome", "Visit_Outcome_ID", "IDNO_ID",
  "AV_Value", "Self_Lay_Provider", "Dead_Jointed_Date", "Team_ID",
  "Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"
)
SELECT
  d.new_plot_id, d.utility_id, d.programmed, d.connected, d.as_laid,
  d.meter, d.service_card, d.meter_card, d.pack_status, d.outcome_word,
  d.outcome_id, d.adopter, d.av, d.self_lay, d.dead_jointed, d.team,
  d.planned_joint, d.actual_joint, d.legacy_id
FROM (
  SELECT
    r.new_plot_id,
    COALESCE(
      (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
        WHERE m."Kind" = 'utility' AND m."Legacy_ID" = btrim(r."Utility_ID")),
      NULLIF(btrim(r."Utility_ID"), '')::bigint)          AS utility_id,
    NULLIF(btrim(r."Programmed_Date"), '')::date          AS programmed,
    NULLIF(btrim(r."Connection_Date"), '')::date          AS connected,
    NULLIF(btrim(r."As_Laid_Date"), '')::date             AS as_laid,
    NULLIF(btrim(r."Meter_Number"), '')                   AS meter,
    NULLIF(btrim(r."Service_Card_Submission_Date"), '')::date AS service_card,
    NULLIF(btrim(r."Meter_Card_Submission_Date"), '')::date   AS meter_card,
    r.pack_status_id                                      AS pack_status,
    /* The word as well as the id. An outcome whose word matched no
       lookup is better recorded as the word than lost. */
    NULLIF(btrim(r."Visit_Outcome"), '')                  AS outcome_word,
    r.visit_outcome_id                                    AS outcome_id,
    r.adopter_organisation_id                             AS adopter,
    NULLIF(btrim(r."Expected_Asset_Value"), '')::numeric   AS av,
    COALESCE(NULLIF(btrim(r."Self_Lay_Provider"), '')::boolean, false) AS self_lay,
    NULLIF(btrim(r."Dead_Jointed_Date"), '')::date        AS dead_jointed,
    NULLIF(btrim(r."Team_ID"), '')::bigint                AS team,
    NULLIF(btrim(r."Planned_Jointing_Date"), '')::date    AS planned_joint,
    NULLIF(btrim(r."Actual_Jointing_Date"), '')::date     AS actual_joint,
    NULLIF(btrim(r."Plot_Utility_ID"), '')::bigint        AS legacy_id
   FROM "Legacy_Connection_Resolved" r
  WHERE r.new_plot_id IS NOT NULL
    AND r.dup_rank = 1
) d
WHERE NOT EXISTS (
        SELECT 1 FROM "Plot_Utility" x
         WHERE x."Legacy_Plot_Utility_ID" = d.legacy_id)
  AND NOT EXISTS (
        SELECT 1 FROM "Plot_Utility" y
         WHERE y."Plot_ID" = d.new_plot_id
           AND y."Utility_ID" = d.utility_id);


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


-- ════════════════════════════════════════════════════════════════════
--  PART D — check it
-- ════════════════════════════════════════════════════════════════════

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
         count(*)::text || ' of the imported rows have no IDNO_ID'
    FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "IDNO_ID" IS NULL

  UNION ALL
  SELECT 2.1, 'Without a pack status',
         count(*)::text || ' of the imported rows have no Pack_Status_ID'
    FROM "Plot_Utility"
   WHERE "Legacy_Plot_Utility_ID" IS NOT NULL AND "Pack_Status_ID" IS NULL

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


-- ════════════════════════════════════════════════════════════════════
--  PART E — undo, if it comes to that
-- ════════════════════════════════════════════════════════════════════
--
-- Only the imported rows. Anything entered in the app has no legacy id
-- and is not touched.
--
--   DELETE FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
--
-- And if you decide the trigger's inference is what you want after all
-- — blank and Pack In Progress rows with a service card date becoming
-- Submitted — this applies it to the imported rows only:
--
--   UPDATE "Plot_Utility" SET "Pack_Status_ID" =
--     (SELECT "Pack_Status_ID" FROM "Pack_Status" WHERE "Pack_Status" = 'Submitted')
--    WHERE "Legacy_Plot_Utility_ID" IS NOT NULL
--      AND "Service_Card_Submission_Date" IS NOT NULL
--      AND ("Pack_Status_ID" IS NULL OR "Pack_Status_ID" IN
--           (SELECT "Pack_Status_ID" FROM "Pack_Status"
--             WHERE "Pack_Status" IN ('Pack Not Submitted','Pack In Progress')));
