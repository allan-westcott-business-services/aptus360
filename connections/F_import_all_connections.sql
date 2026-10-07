-- ════════════════════════════════════════════════════════════════════
--  Every connection — the full run
-- ════════════════════════════════════════════════════════════════════
--
-- Run the WHOLE file in one go, not a part at a time. It takes a
-- minute or two and writes around 33,000 rows.
--
-- ── Before this ──
--
--   reload_connections.psql   the current export staged, once
--   0256                      pack statuses, adopter aliases, the
--                             utility map, dup_rank on the view
--   0258                      the adopter from the contract IDNO
--   T2                        AP1989 proved on the real data
--
-- AP1989's 238 rows are already in. This adds everything else and
-- leaves them alone: the import skips a row whose legacy id is already
-- there, so the test run does not have to be undone first.
--
-- ── Why the trigger work is inside a DO block ──
--
-- Standing pu_pack_trg down, writing the rows and putting it back have
-- to live or die together. Run as three separate statements, a failure
-- in the middle leaves the trigger disabled on a live table - which is
-- exactly what happened on the first attempt at this, and why PART C
-- had to be run on its own afterwards.
--
-- A plpgsql block is its own transaction whatever the editor does with
-- the script around it. If the insert raises, everything inside is
-- rolled back, the handler makes sure the trigger is on, and the
-- original error is re-raised unchanged.
--
-- ── What it writes, and what it refuses to ──
--
--   its plot is here      13 connections belong to plots that are
--                         still waiting on the tender import
--   dup_rank = 1          the completed visit, not the aborted attempt
--                         it superseded. UNIQUE ("Plot_ID",
--                         "Utility_ID") would reject the earlier one
--   not already here      by legacy id, so a re-run adds nothing, AND
--                         by plot and utility, so a connection
--                         somebody entered in the app is never
--                         trampled
--
-- The adopter goes in IDNO_Organisation_ID, from the contract's IDNO
-- where there is one. The legacy IDNO_ID is left alone - an IDNO here
-- is an Organisation with a Role of IDNO. Team_ID is not written: the
-- old system's team ids do not line up with the thirteen teams named
-- since, and four of them collide numerically. MPAN_MPRN is not
-- written until it is settled whether a supply number belongs in
-- Meter_Reference or Reference; every row carries its legacy id, so a
-- re-run fills it in without duplicating.
--
-- ── Undoing it ──
--
--   DELETE FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
--
-- Only the imported rows. Anything entered in the app has no legacy id.
-- ════════════════════════════════════════════════════════════════════

DO $do$
BEGIN

EXECUTE 'ALTER TABLE "Plot_Utility" DISABLE TRIGGER pu_pack_trg';

INSERT INTO "Plot_Utility" (
  "Plot_ID", "Utility_ID", "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome", "Visit_Outcome_ID",
  "IDNO_Organisation_ID",
  "AV_Value", "Self_Lay_Provider", "Dead_Jointed_Date",
  "Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"
)
SELECT
  d.new_plot_id, d.utility_id, d.programmed, d.connected, d.as_laid,
  d.meter, d.service_card, d.meter_card, d.pack_status, d.outcome_word,
  d.outcome_id, d.adopter_org,
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
    NULLIF(btrim(r."Visit_Outcome"), '')                  AS outcome_word,
    r.visit_outcome_id                                    AS outcome_id,
    r.adopter_organisation_id                             AS adopter_org,
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

EXECUTE 'ALTER TABLE "Plot_Utility" ENABLE TRIGGER pu_pack_trg';

EXCEPTION WHEN OTHERS THEN
  /* The rollback above has already undone the DISABLE, so this is
     belt and braces rather than the thing that saves it - and it costs
     nothing to be certain about a trigger on a live table. RAISE with
     no argument re-raises the original error untouched: a handler that
     swallows it and reports something friendlier is a handler that
     hides which constraint actually refused the data. */
  EXECUTE 'ALTER TABLE "Plot_Utility" ENABLE TRIGGER pu_pack_trg';
  RAISE;
END $do$;

-- ── What landed ────────────────────────────────────────────────────
--
-- One statement, so the editor shows it. Rows 3 and 4 are the ones to
-- read: they separate what the old system never said from what the
-- import lost, and both should be 0.

SELECT * FROM (
  WITH mine AS (
    SELECT pu.* FROM "Plot_Utility" pu
     WHERE pu."Legacy_Plot_Utility_ID" IS NOT NULL
  )
  SELECT 1::numeric AS "#", 'Connections imported' AS "What",
         (SELECT count(*) FROM mine)::text || ' rows' AS "Detail"

  UNION ALL
  SELECT 1.1, 'By utility',
         COALESCE((SELECT string_agg(u."Utility" || ': ' || c.n, ', ' ORDER BY u."Utility")
                     FROM (SELECT "Utility_ID" AS uid, count(*)::text AS n
                             FROM mine GROUP BY "Utility_ID") c
                     JOIN "Utility" u ON u."Utility_ID" = c.uid), 'none')

  UNION ALL
  SELECT 2, 'With an adopter',
         (SELECT count(*) FROM mine WHERE "IDNO_Organisation_ID" IS NOT NULL)::text
         || ' of ' || (SELECT count(*) FROM mine)::text
         || '. The rest are rows where the contract names no IDNO for '
         || 'that utility and the connection names nobody either.'

  UNION ALL
  SELECT 3, 'Lost an adopter that WAS stated',
         (SELECT count(*) FROM mine m
            JOIN "Legacy_Connection_Resolved" r
              ON r."Plot_Utility_ID" = m."Legacy_Plot_Utility_ID"::text
           WHERE m."IDNO_Organisation_ID" IS NULL
             AND r.adopter_source <> 'neither')::text
         || ' rows — expected 0'

  UNION ALL
  SELECT 4, 'Pack status rewritten',
         (SELECT count(*) FROM mine m
            JOIN "Legacy_Connection_Import" i
              ON NULLIF(btrim(i."Plot_Utility_ID"), '')::bigint = m."Legacy_Plot_Utility_ID"
            JOIN "Pack_Status" s ON s."Pack_Status_ID" = m."Pack_Status_ID"
           WHERE upper(btrim(s."Pack_Status")) <> upper(btrim(i."Status_Of_Pack")))::text
         || ' rows hold a status the old system did not say — expected 0'

  UNION ALL
  SELECT 5, 'Legacy IDNO_ID / Team_ID written',
         (SELECT count(*) FROM mine WHERE "IDNO_ID" IS NOT NULL)::text || ' / '
         || (SELECT count(*) FROM mine WHERE "Team_ID" IS NOT NULL)::text
         || ' — both expected 0'

  UNION ALL
  SELECT 6, 'Not imported',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE new_plot_id IS NULL)::text || ' waiting on their plot, '
         || (SELECT count(*) FROM "Legacy_Connection_Resolved"
              WHERE new_plot_id IS NOT NULL AND dup_rank > 1)::text
         || ' superseded visits dropped'

  UNION ALL
  SELECT 7, 'Plots with at least one connection',
         (SELECT count(DISTINCT "Plot_ID") FROM mine)::text || ' of '
         || (SELECT count(*) FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL)::text
         || ' imported plots'

  UNION ALL
  SELECT 8, 'AP1989 is still exactly as the test left it',
         (SELECT count(*) FROM mine m
           WHERE m."Plot_ID" IN (SELECT pl."Plot_ID" FROM "Plot" pl
                                   JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
                                  WHERE btrim(pr."AP_Number") = 'AP1989'))::text
         || ' rows — expected 238'

  UNION ALL
  SELECT 9, 'The trigger',
         (SELECT CASE WHEN tgenabled = 'D'
                      THEN 'STILL DISABLED — tell me before you do anything else'
                      ELSE 'enabled' END
            FROM pg_trigger WHERE tgrelid = '"Plot_Utility"'::regclass
             AND tgname = 'pu_pack_trg')
) z ORDER BY "#";
