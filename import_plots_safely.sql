-- ════════════════════════════════════════════════════════════════════
--  Importing the plots without the points trigger running 159,300 times
-- ════════════════════════════════════════════════════════════════════
--
-- Run this INSTEAD of part 2 of import_legacy_plots.sql. It does the
-- same insert, with one trigger suspended around it and the work that
-- trigger does performed once per project afterwards instead of once
-- per row.
--
-- ── Why ──
--
-- Read off the live database, because none of these triggers are in any
-- committed migration — the Plot table pre-dates the baseline:
--
--   CREATE TRIGGER plot_points_trg AFTER INSERT OR DELETE ON "Plot"
--     FOR EACH ROW EXECUTE FUNCTION trg_recalc_points()
--
--       pid := COALESCE(NEW."Project_ID", OLD."Project_ID");
--       PERFORM recalc_project_points(pid);
--
-- FOR EACH ROW, and it recalculates the WHOLE project's points every
-- time. Importing 159,300 plots means 159,300 full recalculations, and
-- a project with 500 plots gets its points worked out 500 times over.
--
-- ── How much work that is, measured ──
--
-- recalc_project_points() is not in any committed migration either, so
-- I first wrote a stand-in, measured THAT, and reported numbers that
-- were my own stub's cost rather than yours. Those figures were worth
-- nothing. These are from the real function and the real file.
--
-- Its first statement is
--
--     SELECT COUNT(*) INTO plots FROM "Plot" WHERE "Project_ID" = p_project;
--
-- and it then UPDATEs the project's four points columns.
--
-- Your 159,300 plots sit on 1,915 contracts - median 44 each, mean 83,
-- largest 1,415. Inserting a project's plots one at a time counts them
-- again from scratch every time, so the counting alone reads
--
--     19,543,686 rows   with the trigger live
--        159,300 rows   counting once per project afterwards
--
-- 123 times the work. And every insert UPDATEs the Project row:
--
--        159,300 updates live
--          1,915 updates suspended
--
-- 83 times the writes, on a table of 5,727 rows - which is not just
-- slow, it leaves 159,300 dead row versions behind and the write-ahead
-- log to match.
--
-- Whether that is minutes or hours depends on whether "Plot" has an
-- index on "Project_ID", which I have not seen. It does not matter:
-- suspending it is strictly less work for the same answer either way.
--
-- ── The other trigger is left alone, deliberately ──
--
--   CREATE TRIGGER plot_ref_trg BEFORE INSERT OR UPDATE OF "Plot_Number",
--     "Project_ID", "Project_Developer_ID" ON "Plot" ...
--       NEW."Plot_Ref" := COALESCE(proj_ref || '-', '')
--                      || COALESCE(dev_code || '-', '')
--                      || NEW."Plot_Number";
--
-- So the Plot_Ref the import supplies from the old system is
-- OVERWRITTEN on every row, and each plot gets the new system's
-- reference instead: the project's reference, the developer code where
-- a site has more than one developer, then the plot number. That is the
-- right answer — an imported plot should read like one somebody added
-- in the app — but it is worth knowing the old Plot_Ref does not
-- survive, because the import appears to carry it.
--
-- ── One consequence, because it bites later ──
--
-- That trigger fires on INSERT and on UPDATE OF Plot_Number, Project_ID
-- or Project_Developer_ID. It does NOT fire when a PROJECT's reference
-- changes. So every plot reference here is built from its project's
-- reference as it stands today — and 1,849 of the 1,926 imported
-- projects carry a reference the import invented, which you have
-- decided to replace with the real ones.
--
-- That is recoverable without re-importing anything. After changing any
-- project reference, touching the plot numbers re-fires the trigger:
--
--     UPDATE "Plot" SET "Plot_Number" = "Plot_Number"
--      WHERE "Project_ID" IN (...the projects whose reference moved...);
--
-- so the order of these two jobs is a convenience, not a trap.

-- ────────────────────────────────────────────────────────────────────
--  PART A — suspend the points trigger
-- ────────────────────────────────────────────────────────────────────
--
-- Run this on its own first. "No rows returned" is success.

ALTER TABLE "Plot" DISABLE TRIGGER plot_points_trg;

-- ────────────────────────────────────────────────────────────────────
--  PART B — the plots
-- ────────────────────────────────────────────────────────────────────
--
-- 159,286 rows: 159,300 whose project is here, less four with no
-- plot number and ten that repeat a plot number on their project.
-- Expect it to take a minute or two and say "No rows returned".
--
-- Only the plots whose project is already here. The 174,650 belonging
-- to a tender land when you re-run this after the tender import, and
-- the NOT EXISTS below is what makes re-running safe.

-- ── Three things on this table that no migration mentions ──
--
-- Read off the live catalogue, after being caught by each of them in
-- turn rather than finding them first:
--
--   plot_number_per_developer   UNIQUE (Project_ID,
--                                       COALESCE(Project_Developer_ID,-1),
--                                       Plot_Number)
--   Plot_Legacy_Plot_UQ         UNIQUE (Legacy_Plot_ID) WHERE NOT NULL
--   Plot_Number                 NOT NULL
--
-- The import sets no Project_Developer_ID, so the first of those is
-- effectively UNIQUE (Project_ID, Plot_Number) - and the old data has
-- 8 contract-and-plot-number pairs that repeat, 10 rows across 5
-- contracts. Contract 1231 has three plots called S249, contract 1878
-- three called C22, and contract 476 has pairs on 17.05, 17.07, 17.08
-- and 17.09. Real duplicates in the old system, not an import artefact.
--
-- So: one row per (project, plot number), the lowest Plot_ID kept
-- because it is the earliest record. The rest are listed by the query
-- after part E rather than vanishing.
--
-- Plot_Legacy_Plot_UQ is what makes a re-run safe: even without the
-- NOT EXISTS below, the same plot could not land twice.

INSERT INTO "Plot" (
  "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "Heat_Source_ID", "KVA_Load", "PV", "Heat_Pump_Model_ID", "Legacy_Plot_ID"
)
SELECT
  d."Project_ID",
  d.plot_number,
  d.plot_ref,
  d.config_id,
  d.heat_source_id,
  d.kva,
  d.pv,
  d.heat_pump_id,
  d.legacy_plot_id
FROM (
  SELECT
    p."Project_ID",
    NULLIF(btrim(i."Plot"), '')                       AS plot_number,
    NULLIF(btrim(i."Plot_Ref"), '')                   AS plot_ref,
    (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
      WHERE m."Kind" = 'property_config'
        AND m."Legacy_ID" = btrim(i."Property_Config_ID"))  AS config_id,
    (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
      WHERE m."Kind" = 'heat_source'
        AND m."Legacy_ID" = btrim(i."Heat_Source_ID"))      AS heat_source_id,
    NULLIF(btrim(i."KVA_Load"), '')::numeric           AS kva,
    COALESCE(NULLIF(btrim(i."PV"), '')::boolean, false) AS pv,
    (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
      WHERE m."Kind" = 'heat_pump'
        AND m."Legacy_ID" = btrim(i."Heat_Pump_Model_ID")) AS heat_pump_id,
    NULLIF(btrim(i."Plot_ID"), '')::bigint             AS legacy_plot_id,
    /* The duplicate guard. Lowest Plot_ID wins. */
    row_number() OVER (
      PARTITION BY p."Project_ID", btrim(i."Plot")
      ORDER BY NULLIF(btrim(i."Plot_ID"), '')::bigint)      AS dup_rank
    FROM "Legacy_Plot_Import" i
    JOIN "Project" p
      ON p."Legacy_Contract_ID" = NULLIF(btrim(i."Contract_ID"), '')::bigint
   WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
     /* Plot_Number is NOT NULL, and four rows in 333,950 have an empty
        Plot - Plot_IDs 22396, 25772, 27909 and 133242, all of them
        empty throughout. Nothing to import, nothing to invent. */
     AND COALESCE(btrim(i."Plot"), '') <> ''
) d
WHERE d.dup_rank = 1
  AND NOT EXISTS (
    SELECT 1 FROM "Plot" x
     WHERE x."Legacy_Plot_ID" = d.legacy_plot_id
  )
  /* And not onto a plot number the project already has, however it got
     there. The pre-flight says no imported project has hand-added
     plots today, but a re-run after somebody adds one would collide. */
  AND NOT EXISTS (
    SELECT 1 FROM "Plot" y
     WHERE y."Project_ID" = d."Project_ID"
       AND y."Plot_Number" = d.plot_number
       AND y."Project_Developer_ID" IS NULL
  );

-- ────────────────────────────────────────────────────────────────────
--  PART C — put the trigger back, and do its work once per project
-- ────────────────────────────────────────────────────────────────────
--
-- Run this even if part B failed. A disabled trigger left disabled is
-- worse than the slow import: plots added in the app afterwards would
-- not update their project's points, and nothing would say so.
--
-- One statement, so the editor shows the result.

ALTER TABLE "Plot" ENABLE TRIGGER plot_points_trg;

-- ────────────────────────────────────────────────────────────────────
--  PART D — recalculate the points, once per project
-- ────────────────────────────────────────────────────────────────────
--
-- What the suspended trigger would have done, done properly. Only the
-- projects that actually received plots.

WITH touched AS (
  SELECT DISTINCT p."Project_ID"
    FROM "Plot" p
   WHERE p."Legacy_Plot_ID" IS NOT NULL
),
done AS (
  SELECT t."Project_ID", recalc_project_points(t."Project_ID") AS r
    FROM touched t
)
SELECT count(*)::text || ' project(s) had their points recalculated' AS result
  FROM done;

-- ────────────────────────────────────────────────────────────────────
--  PART E — check it
-- ────────────────────────────────────────────────────────────────────

SELECT 1 AS step, 'Plots imported' AS what,
       count(*)::text || ' carry a Legacy_Plot_ID' AS detail
  FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL
UNION ALL
SELECT 2, 'Still waiting on the tender import',
       count(*)::text || ' staged plots have no Plot row yet'
  FROM "Legacy_Plot_Import" i
 WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
   AND NOT EXISTS (SELECT 1 FROM "Plot" x
                    WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint)
UNION ALL
SELECT 3, 'The points trigger is back on',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgrelid = '"Plot"'::regclass
                            AND tgname = 'plot_points_trg'
                            AND tgenabled <> 'D')
            THEN 'yes - enabled'
            ELSE 'NO - still disabled. Run part C.' END
UNION ALL
SELECT 4, 'Plot references',
       'built by plot_ref_trg from the project reference, not from the '
         || 'old system. The old Plot_Ref is not kept.'
ORDER BY 1;

-- ────────────────────────────────────────────────────────────────────
--  PART F — what was left behind, and why
-- ────────────────────────────────────────────────────────────────────
--
-- Read-only. Nothing is dropped silently: every staged plot that has a
-- project here and did not become a row is listed with its reason.

SELECT reason, count(*) AS plots,
       string_agg(DISTINCT contract, ', ' ORDER BY contract) AS contracts,
       left(string_agg(plot_id, ', ' ORDER BY plot_id), 120) AS example_plot_ids
  FROM (
    SELECT btrim(i."Contract_ID") AS contract,
           btrim(i."Plot_ID")     AS plot_id,
           CASE
             WHEN COALESCE(btrim(i."Plot"), '') = ''
               THEN 'no plot number in the old data - nothing to import'
             ELSE 'another plot on this project already has that number'
           END AS reason
      FROM "Legacy_Plot_Import" i
      JOIN "Project" p
        ON p."Legacy_Contract_ID" = NULLIF(btrim(i."Contract_ID"), '')::bigint
     WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
       AND NOT EXISTS (SELECT 1 FROM "Plot" x
                        WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint)
  ) z
 GROUP BY reason ORDER BY 2 DESC;
