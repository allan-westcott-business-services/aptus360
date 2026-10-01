-- ── Menu access starts working, so first give people what they have ──
--
-- Asked for:
--
--   "I need to restrict access to the GIS Canvas to users once they have
--    logged in to main app."
--
-- The app is already shut to anybody without a login. What was asked for
-- is the next thing in: only SOME staff should be able to open the GIS
-- Canvas. People & Roles has had a Menu Access tab for a long time — a
-- tick per screen per person, written here — and nothing read it. The
-- ticks recorded a decision the app ignored.
--
-- Now they are read, in the browser (src/lib/access.js) and again on the
-- server (netlify/functions/_access.js), and the rule is the strict one:
-- no tick, no screen.
--
-- ── Which is why this file exists ──
--
-- Switched on against a sparse table, the strict rule locks out
-- everybody, including whoever deployed it: every sidebar empty, every
-- area square gone, and the Admin screen that grants access behind the
-- same rule as everything else. Not recoverable from inside the app.
--
-- So before anything starts refusing, everybody active is granted every
-- screen that exists today. Nothing changes for anyone on the day this
-- goes live; the restricting is then done BY HAND, one tick at a time,
-- starting with taking GIS Canvas off the people who should not have it.
--
-- Deliberately not clever. A rule like "grant what their role implies"
-- needs role-to-screen mappings nobody has written down, and getting it
-- wrong silently removes somebody's work screen. Grant everything,
-- revoke visibly.
--
-- ── Run this BEFORE deploying the code ──
--
-- Either order ends in the same place, but this way round nobody is
-- locked out in between.
--
-- ── Safe to run twice ──
--
-- WHERE NOT EXISTS rather than ON CONFLICT, because this table has no
-- unique index on (Person_ID, Menu_Key) and adding one now would fail on
-- any duplicate rows already in it. Running it again grants only what is
-- missing, so it is also the way to take in a new screen later.

-- ── The table, if it is not there ──
--
-- It predates the migrations folder: People & Roles reads it through the
-- generic admin endpoint, and that read is wrapped in a catch which
-- turns a missing table into an empty list. So the panel looks like it
-- is working whether the table exists or not, and a deploy against a
-- database without it would refuse everybody with no clue as to why.
-- Declared here so that cannot happen.
CREATE TABLE IF NOT EXISTS "Person_Menu_Visible" (
  "Person_Menu_Visible_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID"              bigint NOT NULL,
  "Menu_Key"               text   NOT NULL
);

COMMENT ON TABLE "Person_Menu_Visible" IS
  'One row per screen a person may open. The Menu_Key is a view key from '
  'src/lib/navigation.js. No row means no access: the app refuses the screen '
  'and the endpoints behind it refuse the work. Edited in Admin > People & '
  'Roles > Menu Access.';

CREATE INDEX IF NOT EXISTS "Person_Menu_Visible_Person_IDX"
  ON "Person_Menu_Visible" ("Person_ID");

-- ── The grant ──
--
-- Every built screen, as navigation.js lists them on the day this was
-- written. checkmenuaccess.mjs compares this list against that file and
-- fails if they have drifted, because a screen missing from here is a
-- screen nobody is granted on deploy day.
WITH built("Menu_Key") AS (
  VALUES
    ('customer-projects'), ('bd-projects'), ('organisations'), ('enquiries'),
    ('projects'), ('gis-canvas'),
    ('call-offs'), ('planning'), ('ops-projects'), ('teams'),
    ('plot-connections'), ('vehicles'), ('vyn-tracker'),
    ('av-invoices'), ('generate-av-invoices'), ('commercial-projects'),
    ('hr-dashboard'), ('hr-people'), ('hr-roles'), ('hr-pay'), ('hr-leave'),
    ('hr-benefits'), ('hr-performance'), ('hr-skills'), ('hr-recruitment'),
    ('hr-onboarding'), ('hr-interactions'), ('hr-compliance'),
    ('hr-contractors'), ('hr-leavers'), ('hr-reports'), ('hr-admin'),
    ('hsqe-dashboard'), ('ncr-list'),
    ('finance-projects'), ('admin')
)
INSERT INTO "Person_Menu_Visible" ("Person_ID", "Menu_Key")
SELECT p."Person_ID", b."Menu_Key"
  FROM "Person" p
 CROSS JOIN built b
 WHERE p."Is_Active"
   AND NOT EXISTS (
     SELECT 1 FROM "Person_Menu_Visible" m
      WHERE m."Person_ID" = p."Person_ID"
        AND m."Menu_Key"  = b."Menu_Key"
   );

-- ── Say what happened, and refuse a state that would lock people out ──
DO $$
DECLARE
  people   integer;
  granted  integer;
  orphans  integer;
BEGIN
  SELECT count(*) INTO people FROM "Person" WHERE "Is_Active";
  SELECT count(*) INTO granted FROM "Person_Menu_Visible";

  -- An active person with no grants at all after this has run means the
  -- insert did not reach them, and after the deploy they cannot open
  -- anything. Worth stopping for: it is far cheaper to fix here than to
  -- be told by the person it happened to.
  SELECT count(*) INTO orphans
    FROM "Person" p
   WHERE p."Is_Active"
     AND NOT EXISTS (
       SELECT 1 FROM "Person_Menu_Visible" m WHERE m."Person_ID" = p."Person_ID"
     );
  IF orphans > 0 THEN
    /* Deliberately not claiming anything about what was or was not
       committed: run as a script this file is a statement at a time,
       and run in the SQL editor it is one transaction. Either way the
       instruction is the same — do not deploy until this comes back
       clean. */
    RAISE EXCEPTION 'Still no menu access, and so locked out after the '
      'deploy, for this many active people: %. Grant them and run this '
      'again before deploying the code.', orphans;
  END IF;

  RAISE NOTICE 'Menu access backfilled: % active people, % grants in total. '
    'Everybody can open everything they could before. Now take screens AWAY '
    'in Admin > People & Roles > Menu Access.', people, granted;
END $$;

-- Checks worth running after this:
--
--   -- Who can open the GIS Canvas
--   SELECT p."Person_Name", p."Email"
--     FROM "Person_Menu_Visible" m
--     JOIN "Person" p USING ("Person_ID")
--    WHERE m."Menu_Key" = 'gis-canvas'
--    ORDER BY p."Person_Name";
--
--   -- Anybody active with nothing granted: these people see an empty
--   -- app and cannot get in. Should be no rows.
--   SELECT p."Person_ID", p."Person_Name", p."Email"
--     FROM "Person" p
--    WHERE p."Is_Active"
--      AND NOT EXISTS (SELECT 1 FROM "Person_Menu_Visible" m
--                       WHERE m."Person_ID" = p."Person_ID");
--
--   -- YOUR OWN account, which is the one to check before deploying.
--   -- The app finds a person by the sign-in email, so no row here means
--   -- no access whatever the ticks say.
--   SELECT p."Person_ID", p."Person_Name", count(m."Menu_Key") AS screens
--     FROM "Person" p
--     LEFT JOIN "Person_Menu_Visible" m USING ("Person_ID")
--    WHERE lower(p."Email") = lower('allan@westcottservices.com')
--      AND p."Is_Active"
--    GROUP BY p."Person_ID", p."Person_Name";
--
--   -- Grants naming a screen this build does not have. Harmless, but
--   -- they are usually a key renamed in navigation.js and not here.
--   SELECT DISTINCT "Menu_Key" FROM "Person_Menu_Visible"
--    WHERE "Menu_Key" NOT IN (
--      SELECT * FROM (VALUES ('customer-projects'), ('bd-projects'),
--        ('organisations'), ('enquiries'), ('projects'), ('gis-canvas'),
--        ('call-offs'), ('planning'), ('ops-projects'), ('teams'),
--        ('plot-connections'), ('vehicles'), ('vyn-tracker'),
--        ('av-invoices'), ('generate-av-invoices'), ('commercial-projects'),
--        ('hr-dashboard'), ('hr-people'), ('hr-roles'), ('hr-pay'),
--        ('hr-leave'), ('hr-benefits'), ('hr-performance'), ('hr-skills'),
--        ('hr-recruitment'), ('hr-onboarding'), ('hr-interactions'),
--        ('hr-compliance'), ('hr-contractors'), ('hr-leavers'),
--        ('hr-reports'), ('hr-admin'), ('hsqe-dashboard'), ('ncr-list'),
--        ('finance-projects'), ('admin')) v
--    );
