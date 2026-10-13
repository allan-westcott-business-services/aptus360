-- ════════════════════════════════════════════════════════════════════
--  Where the NCR import has got to
-- ════════════════════════════════════════════════════════════════════
--
-- Writes nothing. Ends by saying which step is next.
--
-- ONE statement, because the Supabase editor shows only the last
-- result set — a second query here would hide this one.
--
-- It exists because "relation legacy_ncr_import does not exist" is the
-- error you get for running the right line at the wrong moment, and
-- nothing in the editor tells you which moment you are at.
--
-- ── Why the counts go through query_to_xml ──
--
-- This query has to parse and run when the staging tables do NOT
-- exist, which is the whole point of it. A plain
-- (SELECT count(*) FROM legacy_ncr_import) is resolved at parse time,
-- so in that state the query itself fails with the very error it was
-- written to explain.
--
-- query_to_xml takes the query as a string, so nothing is resolved
-- until it runs, and it is VOLATILE so the planner will not fold it
-- out of the unused branch of a CASE. Ugly, and the alternative is a
-- tool that only works once you no longer need it.

WITH there AS (
  SELECT
    to_regclass('public."Business_Unit"')              IS NOT NULL AS bu,
    to_regclass('public."NCR_Attachment"')             IS NOT NULL AS att,
    to_regclass('public.legacy_ncr_import')            IS NOT NULL AS stage,
    to_regclass('public.legacy_ncr_attachment_import') IS NOT NULL AS stage_att,
    to_regclass('public.legacy_ncr_map_person')        IS NOT NULL AS map_person,
    to_regclass('public."Legacy_NCR_Resolved"')        IS NOT NULL AS view_,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'NCR'
               AND column_name = 'Auditor_Organisation_ID')        AS auditor_org,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'NCR'
               AND column_name = 'Address_Raw')                    AS addr,
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'NCR'
               AND column_name = 'Auditor_DNO_ID')                 AS old_dno,
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public."NCR"'::regclass
               AND conname = 'ncr_owner_person_fk')                AS fks,
    (SELECT count(*) FROM "NCR")                                   AS ncrs,
    (SELECT count(*) FROM "Person")                                AS people
),
counts AS (
  SELECT t.*,
    /* Rows in the staging, if there is any staging. */
    CASE WHEN t.stage THEN (xpath('/row/c/text()', query_to_xml(
      'SELECT count(*) AS c FROM public.legacy_ncr_import',
      false, true, '')))[1]::text::bigint ELSE 0 END AS staged,
    CASE WHEN t.stage_att THEN (xpath('/row/c/text()', query_to_xml(
      'SELECT count(*) AS c FROM public.legacy_ncr_attachment_import',
      false, true, '')))[1]::text::bigint ELSE 0 END AS staged_att,
    /* How many of the 35 people part 2 creates are still missing.
       Matched on the name, which is what part 2 matches on. */
    CASE WHEN t.map_person THEN (xpath('/row/c/text()', query_to_xml(
      'SELECT count(*) AS c FROM public.legacy_ncr_map_person m '
      || 'WHERE NOT EXISTS (SELECT 1 FROM public."Person" p WHERE '
      || 'upper(btrim(p."Person_Name")) = upper(btrim(m.person_name)))',
      false, true, '')))[1]::text::bigint ELSE NULL END AS people_missing
  FROM there t
),
step AS (
  SELECT CASE
    WHEN NOT auditor_org OR NOT addr OR NOT bu OR NOT att OR old_dno OR NOT fks
      THEN 'Run migration 0261_ncr_import_schema.sql'
    /* Finished, before the staging is asked about. 0262's tables are
       MEANT to be gone at the end, and the first version of this read
       their absence as 0262 never having run — so the step after the
       last one was the second one. */
    WHEN ncrs = 1797 AND NOT stage
      THEN 'Nothing — the reports are in and the staging is gone'
    WHEN NOT stage OR NOT stage_att OR NOT view_ OR NOT map_person
      THEN 'Run migration 0262_legacy_ncr_import.sql'
    WHEN staged = 0
      THEN 'Table Editor -> legacy_ncr_import -> Import data from CSV -> NCR_rows.csv, '
           || 'and the same for legacy_ncr_attachment_import'
    WHEN staged_att = 0
      THEN 'Table Editor -> legacy_ncr_attachment_import -> Import data from CSV -> '
           || 'NCR_Attachment_rows.csv'
    WHEN people_missing > 0
      THEN 'import_legacy_ncrs.sql PART 1 to read it, then PART 2 — '
           || people_missing::text || ' of the 35 people are not here yet'
    WHEN ncrs = 0
      THEN 'import_legacy_ncrs.sql PART 3 (the 3.0 line is in it)'
    WHEN ncrs <> 1797
      THEN 'PART 3 wrote ' || ncrs::text || ' reports, not 1797 — run PART 1 and read the state column'
    WHEN stage
      THEN 'Check PART 3''s figures, then PART 4 to drop the staging'
    ELSE 'Nothing — the reports are in and the staging is gone'
  END AS next_step FROM counts
)
SELECT '1 what 0261 makes' AS section, 'Business_Unit table' AS item,
       CASE WHEN bu THEN 'yes' ELSE 'NO' END AS state FROM counts
UNION ALL SELECT '1 what 0261 makes', 'NCR.Address_Raw',
       CASE WHEN addr THEN 'yes' ELSE 'NO' END FROM counts
UNION ALL SELECT '1 what 0261 makes', 'NCR.Auditor_Organisation_ID',
       CASE WHEN auditor_org THEN 'yes' ELSE 'NO' END FROM counts
UNION ALL SELECT '1 what 0261 makes', 'the old Auditor_DNO_ID, gone',
       CASE WHEN old_dno THEN 'NO - still there' ELSE 'yes' END FROM counts
UNION ALL SELECT '1 what 0261 makes', 'NCR_Attachment table',
       CASE WHEN att THEN 'yes' ELSE 'NO' END FROM counts
UNION ALL SELECT '1 what 0261 makes', 'the four foreign keys',
       CASE WHEN fks THEN 'yes' ELSE 'NO' END FROM counts

UNION ALL SELECT '2 what 0262 makes', 'legacy_ncr_import',
       CASE WHEN stage THEN 'yes, ' || staged::text || ' rows staged' ELSE 'NO' END FROM counts
UNION ALL SELECT '2 what 0262 makes', 'legacy_ncr_attachment_import',
       CASE WHEN stage_att THEN 'yes, ' || staged_att::text || ' rows staged' ELSE 'NO' END FROM counts
UNION ALL SELECT '2 what 0262 makes', 'Legacy_NCR_Resolved view',
       CASE WHEN view_ THEN 'yes' ELSE 'NO' END FROM counts
UNION ALL SELECT '2 what 0262 makes', 'the three maps',
       CASE WHEN map_person THEN 'yes' ELSE 'NO' END FROM counts

UNION ALL SELECT '3 the real tables', 'NCR rows',
       ncrs::text || CASE WHEN ncrs = 0 THEN ' - nothing imported yet'
                          WHEN ncrs = 1797 THEN ' - all of them'
                          ELSE ' - expected 1797' END FROM counts
UNION ALL SELECT '3 the real tables', 'Person rows',
       people::text || CASE WHEN people_missing IS NULL THEN ''
                            WHEN people_missing = 0 THEN ' - all 35 from the old system are here'
                            ELSE ' - ' || people_missing::text || ' of the 35 still to create' END
       FROM counts

UNION ALL SELECT '4 next', next_step, '' FROM step
ORDER BY 1, 2;
