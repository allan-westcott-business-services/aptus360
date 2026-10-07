-- ════════════════════════════════════════════════════════════════════
--  PART B — the connections
-- ════════════════════════════════════════════════════════════════════
--
-- Run PART A first. This writes 33,052 rows and takes a little while.
-- "Success. No rows returned" is what success looks like.
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
-- MPAN_MPRN is still not written. The new table has Meter_Reference and
-- Reference and which one holds a supply number has not been settled.
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
