-- ════════════════════════════════════════════════════════════════════
--  PART B, second attempt — the connections
-- ════════════════════════════════════════════════════════════════════
--
-- Replaces B_the_connections.sql. Run PART A first, then this, then C,
-- then D. "Success. No rows returned" is what success looks like.
--
-- ── What changed, and why ──
--
-- **The adopter now goes in IDNO_Organisation_ID.**
--
-- The first attempt wrote an Organisation_ID into IDNO_ID, which points
-- at the IDNO table, and failed on the first row. Plot_Utility already
-- has IDNO_Organisation_ID REFERENCES "Organisation" — 0062 and 0070
-- added that column to AV_Invoice and AV_Agreement with the note that
-- "the old IDNO_ID stays for now but new work should read this one",
-- and 0120 finished the same move for the pipe size rules. So the
-- adopter was never meant to go in IDNO_ID at all.
--
-- IDNO_ID is filled too, but only by following the organisation BACK to
-- an IDNO row — never by assuming the numbers line up. Seven IDNO rows
-- exist and each carries an Organisation_ID; an adopter that is a water
-- undertaker or a gas transporter has no IDNO row and leaves IDNO_ID
-- null, which is correct rather than unfortunate: it is not an IDNO.
--
-- **Team_ID is no longer written at all.**
--
-- Team_ID REFERENCES "Team", which 0066 created and left deliberately
-- unseeded. Thirteen real teams have been named since. The old system's
-- team ids run to 65, and of those:
--
--   61 do not exist in Team and would have failed the key
--    4 DO exist, and would have landed 2,605 connections on
--      MU Team 1 - North West, MU Team Yorkshire, Jointing Team North
--      West and Jointing Team Midlands
--
-- There is nothing to suggest old team 1 is the same crew as new team 1.
-- This is the property config trap - old 1 was 1BD, new 1 was 3BS -
-- except that here 61 of the 65 fail loudly, which is the only reason
-- the other 4 did not slip through silently.
--
-- Nothing is lost by leaving it out. The old Team_ID stays in
-- Legacy_Connection_Import, every imported row carries its
-- Legacy_Plot_Utility_ID, and an export of the old system's Team table
-- would let it be mapped by name and backfilled on a re-run - the same
-- way the property configs and the heat sources were done.
--
-- ── Unchanged ──
--
-- The three filters: its plot is here, dup_rank = 1 so the completed
-- visit wins over the aborted attempt it superseded, and not already
-- here - by legacy id so a re-run adds nothing, and by plot and utility
-- so a connection entered in the app is never trampled.
--
-- MPAN_MPRN is still not written. The table has both Meter_Reference
-- and Reference and which one holds a supply number is still not
-- settled. 16,525 rows carry one and a re-run will fill them in.

INSERT INTO "Plot_Utility" (
  "Plot_ID", "Utility_ID", "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome", "Visit_Outcome_ID",
  "IDNO_Organisation_ID", "IDNO_ID",
  "AV_Value", "Self_Lay_Provider", "Dead_Jointed_Date",
  "Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"
)
SELECT
  d.new_plot_id, d.utility_id, d.programmed, d.connected, d.as_laid,
  d.meter, d.service_card, d.meter_card, d.pack_status, d.outcome_word,
  d.outcome_id, d.adopter_org, d.adopter_idno,
  d.av, d.self_lay, d.dead_jointed,
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
    /* The adopter, in the column that was built for it. */
    r.adopter_organisation_id                             AS adopter_org,
    /* And the legacy column, reached by following the organisation to
       its IDNO row rather than by hoping the ids agree. Null for a
       water undertaker or a gas transporter, which is what it should
       be - they are not IDNOs. */
    (SELECT i."IDNO_ID" FROM "IDNO" i
      WHERE i."Organisation_ID" = r.adopter_organisation_id
      LIMIT 1)                                            AS adopter_idno,
    NULLIF(btrim(r."Expected_Asset_Value"), '')::numeric   AS av,
    COALESCE(NULLIF(btrim(r."Self_Lay_Provider"), '')::boolean, false) AS self_lay,
    NULLIF(btrim(r."Dead_Jointed_Date"), '')::date        AS dead_jointed,
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
