-- ── Admin, granted a tab at a time ────────────────────────────────────
--
-- Asked for:
--
--   "I want to give access to some Admin features to some users without
--    giving them access to all."
--
-- Menu access (0245) grants SCREENS, and Admin is one screen with
-- forty-nine tabs behind it. One tick handed somebody all of them —
-- including People & Roles, which grants menu access, and Portal
-- Accounts, which creates logins for people outside the business. An
-- engineer who maintains pipe sizes should inherit neither.
--
-- ── No new table, no new idea ──
--
-- A tab is granted exactly as a screen is: a row in Person_Menu_Visible
-- whose Menu_Key is the tab key with an `admin:` prefix.
--
--   admin:Dig_Rate
--
-- The prefix keeps the two apart in one column, and holding any of them
-- IS holding Admin — the app treats a tab grant as the screen grant, so
-- there is one decision rather than two.
--
-- ── What this migration does ──
--
-- Everybody who can open Admin today gets every tab. Nothing changes for
-- anyone on the day it goes live; the restricting is then done by hand,
-- one tick at a time, in Admin > People & Roles > Menu Access.
--
-- The plain `admin` row is LEFT in place. It is still honoured by the
-- app, so nobody is mid-air if this runs and the deploy is held back,
-- and removing it is a tidy-up with no benefit — the query at the foot
-- of this file does it when you want it done.
--
-- Run it BEFORE deploying, like 0245. Safe to run twice.

INSERT INTO "Person_Menu_Visible" ("Person_ID", "Menu_Key")
SELECT m."Person_ID", tab."Menu_Key"
  FROM "Person_Menu_Visible" m
 CROSS JOIN (VALUES
    ('admin:Property_Config'), ('admin:Property_Type'), ('admin:Heat_Source'),
    ('admin:Quote_Type'), ('admin:Points_Config'), ('admin:Project_Status'),
    ('admin:Scope_Status'), ('admin:Design_Status'), ('admin:Status_Transition'),
    ('admin:Visit_Outcome'), ('admin:Pack_Status'), ('admin:NRS_Sub_Type'),
    ('admin:Electric_Specs'), ('admin:POCAdmin'), ('admin:POC_Type'),
    ('admin:AV_Status'), ('admin:Quotation_Status'), ('admin:POC_Status'),
    ('admin:Utility'), ('admin:Organisation'), ('admin:Customer'),
    ('admin:IDNO_Source_Mapping'), ('admin:Person'), ('admin:Team'),
    ('admin:Project_Tab_Visibility'), ('admin:Dependency_Type'), ('admin:Task_Dependency'),
    ('admin:Task_Type'), ('admin:Call_Off_Status'), ('admin:Water_Pipe_Size'),
    ('admin:Gas_Pipe_Size'), ('admin:Gas_Diversity'), ('admin:Dig_Rate'),
    ('admin:GIS_Surface_Type'), ('admin:RolesCrafts'), ('admin:Regions'),
    ('admin:Region'), ('admin:Sub_Region'), ('admin:Craft'),
    ('admin:Role'), ('admin:IDNO'), ('admin:DNO'),
    ('admin:AV_Agreement_Type'), ('admin:VAT_Rate'), ('admin:GIS_Style'),
    ('admin:DXF_Layer_Map'), ('admin:Enquiry_Form'), ('admin:CAD_Layer'),
    ('admin:Portal_Access')
 ) AS tab("Menu_Key")
 WHERE m."Menu_Key" = 'admin'
   AND NOT EXISTS (
     SELECT 1 FROM "Person_Menu_Visible" x
      WHERE x."Person_ID" = m."Person_ID"
        AND x."Menu_Key"  = tab."Menu_Key"
   );

DO $$
DECLARE
  admins integer;
  tabbed integer;
BEGIN
  SELECT count(DISTINCT "Person_ID") INTO admins
    FROM "Person_Menu_Visible" WHERE "Menu_Key" = 'admin';
  SELECT count(DISTINCT "Person_ID") INTO tabbed
    FROM "Person_Menu_Visible" WHERE "Menu_Key" LIKE 'admin:%';

  -- Somebody who could open Admin and now holds no tab would find the
  -- screen empty. Worth stopping for: it is the one way this migration
  -- can take something away.
  IF admins > tabbed THEN
    RAISE EXCEPTION 'People who can open Admin: %. People with any Admin '
      'tab: %. Somebody would lose Admin. Nothing should be deployed until '
      'this comes back equal.', admins, tabbed;
  END IF;

  RAISE NOTICE 'Admin is now granted a tab at a time: % people, each with '
    'all 49 tabs. Take tabs AWAY in Admin > People & Roles > Menu Access.',
    tabbed;
END $$;

-- Checks worth running after this:
--
--   -- Who can edit what in Admin
--   SELECT p."Person_Name",
--          replace(m."Menu_Key", 'admin:', '') AS tab
--     FROM "Person_Menu_Visible" m
--     JOIN "Person" p USING ("Person_ID")
--    WHERE m."Menu_Key" LIKE 'admin:%'
--    ORDER BY p."Person_Name", tab;
--
--   -- The two that hand out access. Keep this list short.
--   SELECT p."Person_Name", p."Email", m."Menu_Key"
--     FROM "Person_Menu_Visible" m
--     JOIN "Person" p USING ("Person_ID")
--    WHERE m."Menu_Key" IN ('admin:Person', 'admin:Portal_Access')
--    ORDER BY p."Person_Name";
--
--   -- Tidying up the old whole-of-Admin rows, once the tabs are set as
--   -- you want them. Not done automatically: while both exist, either
--   -- one opens Admin, which is what makes the deploy order forgiving.
--   -- DELETE FROM "Person_Menu_Visible" WHERE "Menu_Key" = 'admin';
