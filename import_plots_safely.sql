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
-- ── How slow, honestly: I do not know ──
--
-- recalc_project_points() is not in any committed migration either, so
-- I have not seen it. I wrote a stand-in, measured that, and what I was
-- measuring was my own guess — which turned out to be quadratic and
-- timed out, telling me about my stub rather than about your database.
-- The number is not knowable from here.
--
-- What IS knowable is the shape: recomputing a whole project once per
-- inserted row is work thrown away 159,299 times out of 159,300,
-- whatever one run costs. Suspending it is strictly less work for the
-- same answer, so it is right whether the real function takes a
-- microsecond or a second.
--
-- Suspending it and recalculating once per project at the end gives the
-- same answer: the function takes a project and recomputes it from
-- whatever is there, so running it once after all the plots have landed
-- is the same arithmetic on the same data.
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
-- The same insert as part 2 of import_legacy_plots.sql. 159,300 rows.
-- Expect it to take a minute or two and say "No rows returned".
--
-- Only the plots whose project is already here. The 174,650 belonging
-- to a tender land when you re-run this after the tender import, and
-- the NOT EXISTS below is what makes re-running safe.

INSERT INTO "Plot" (
  "Project_ID", "Plot_Number", "Plot_Ref", "Property_Config_ID",
  "Heat_Source_ID", "KVA_Load", "PV", "Heat_Pump_Model_ID", "Legacy_Plot_ID"
)
SELECT
  p."Project_ID",
  NULLIF(btrim(i."Plot"), ''),
  NULLIF(btrim(i."Plot_Ref"), ''),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'property_config' AND m."Legacy_ID" = btrim(i."Property_Config_ID")),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_source' AND m."Legacy_ID" = btrim(i."Heat_Source_ID")),
  NULLIF(btrim(i."KVA_Load"), '')::numeric,
  COALESCE(NULLIF(btrim(i."PV"), '')::boolean, false),
  (SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
    WHERE m."Kind" = 'heat_pump' AND m."Legacy_ID" = btrim(i."Heat_Pump_Model_ID")),
  NULLIF(btrim(i."Plot_ID"), '')::bigint
  FROM "Legacy_Plot_Import" i
  JOIN "Project" p
    ON p."Legacy_Contract_ID" = NULLIF(btrim(i."Contract_ID"), '')::bigint
 WHERE COALESCE(btrim(i."Plot_ID"), '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "Plot" x
      WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"), '')::bigint
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
