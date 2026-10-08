-- Does the wall between two accounts actually hold?
--
-- Run against a scratch database that has had 0001 applied. Every
-- block below is something a bug in application code might try. None
-- of them should succeed.
--
-- The test acts as a non-owner role, because a table's owner bypasses
-- RLS and testing as the owner proves nothing. Supabase does the same
-- thing: tables are owned by postgres and reached as `authenticated`.
--
-- SET ROLE, not SET LOCAL ROLE: SET LOCAL outside a transaction is a
-- no-op that only warns, so the first draft of this test ran entirely
-- as the owner and reported that every wall held when none had been
-- tested at all.

\set ON_ERROR_STOP off
\pset pager off

-- ── Two accounts, two members, a drawing each ──────────────────────

INSERT INTO "Account" ("Name") VALUES ('Westcott'), ('Northern Surveys');

INSERT INTO "Account_Member" ("Account_ID", "Auth_UID", "Email", "Role")
SELECT "Account_ID", '11111111-1111-1111-1111-111111111111', 'anna@westcott', 'owner'
  FROM "Account" WHERE "Name" = 'Westcott';
INSERT INTO "Account_Member" ("Account_ID", "Auth_UID", "Email", "Role")
SELECT "Account_ID", '22222222-2222-2222-2222-222222222222', 'ben@northern', 'owner'
  FROM "Account" WHERE "Name" = 'Northern Surveys';
-- A viewer on Westcott, who may read but not draw.
INSERT INTO "Account_Member" ("Account_ID", "Auth_UID", "Email", "Role")
SELECT "Account_ID", '33333333-3333-3333-3333-333333333333', 'viv@westcott', 'viewer'
  FROM "Account" WHERE "Name" = 'Westcott';

INSERT INTO "Project" ("Account_ID", "Site_Name", "Project_Ref")
SELECT "Account_ID", 'Richmond Point', 'W-001' FROM "Account" WHERE "Name" = 'Westcott';
INSERT INTO "Project" ("Account_ID", "Site_Name", "Project_Ref")
SELECT "Account_ID", 'Harrogate Rise', 'N-001' FROM "Account" WHERE "Name" = 'Northern Surveys';

INSERT INTO "GIS_Feature" ("Project_ID", "Account_ID", "Layer_Key", "Feature_Type", "Geometry", "Label")
SELECT p."Project_ID", p."Account_ID", 'electric', 'line',
       '[[0,0],[10,0]]'::jsonb, 'Westcott cable'
  FROM "Project" p WHERE p."Project_Ref" = 'W-001';
INSERT INTO "GIS_Feature" ("Project_ID", "Account_ID", "Layer_Key", "Feature_Type", "Geometry", "Label")
SELECT p."Project_ID", p."Account_ID", 'gas', 'line',
       '[[0,0],[20,0]]'::jsonb, 'Northern main'
  FROM "Project" p WHERE p."Project_Ref" = 'N-001';

\echo ''
\echo '════ 1. Anna (Westcott owner) sees only Westcott ════'
SET ROLE app_user;
SET "test.uid" = '11111111-1111-1111-1111-111111111111';
SELECT 'projects visible' AS check, count(*) AS n,
       string_agg("Site_Name", ', ') AS which FROM "Project";
SELECT 'features visible' AS check, count(*) AS n,
       string_agg("Label", ', ') AS which FROM "GIS_Feature";
RESET ROLE;

\echo ''
\echo '════ 2. Ben (Northern owner) sees only Northern ════'
SET ROLE app_user;
SET "test.uid" = '22222222-2222-2222-2222-222222222222';
SELECT 'projects visible' AS check, count(*) AS n,
       string_agg("Site_Name", ', ') AS which FROM "Project";
SELECT 'features visible' AS check, count(*) AS n,
       string_agg("Label", ', ') AS which FROM "GIS_Feature";
RESET ROLE;

\echo ''
\echo '════ 3. A signed-in stranger with no membership sees nothing ════'
SET ROLE app_user;
SET "test.uid" = '99999999-9999-9999-9999-999999999999';
SELECT 'projects visible' AS check, count(*) AS n FROM "Project";
SELECT 'features visible' AS check, count(*) AS n FROM "GIS_Feature";
RESET ROLE;

\echo ''
\echo '════ 4. Anna cannot file a feature under Northern (MUST FAIL) ════'
SET ROLE app_user;
SET "test.uid" = '11111111-1111-1111-1111-111111111111';
INSERT INTO "GIS_Feature" ("Project_ID", "Account_ID", "Layer_Key", "Feature_Type", "Geometry", "Label")
VALUES (2, 2, 'electric', 'line', '[[0,0],[1,1]]'::jsonb, 'smuggled in');
RESET ROLE;

\echo ''
\echo '════ 5. Anna cannot hand her feature to Northern (MUST FAIL) ════'
\echo '      This is the WITH CHECK half. USING lets her touch her own'
\echo '      row; without WITH CHECK she could set its account to theirs.'
SET ROLE app_user;
SET "test.uid" = '11111111-1111-1111-1111-111111111111';
UPDATE "GIS_Feature" SET "Account_ID" = 2 WHERE "Label" = 'Westcott cable';
RESET ROLE;

\echo ''
\echo '════ 6. Anna cannot delete a Northern feature ════'
SET ROLE app_user;
SET "test.uid" = '11111111-1111-1111-1111-111111111111';
DELETE FROM "GIS_Feature" WHERE "Label" = 'Northern main';
\echo '      (0 rows deleted = the row was invisible, which is correct)'
RESET ROLE;

\echo ''
\echo '════ 7. The composite key refuses a cross-account parent (MUST FAIL) ════'
\echo '      Even bypassing RLS entirely — as the service key does —'
\echo '      a feature claiming account 1 on account 2''s project is'
\echo '      not storable.'
INSERT INTO "GIS_Feature" ("Project_ID", "Account_ID", "Layer_Key", "Feature_Type", "Geometry", "Label")
VALUES (2, 1, 'electric', 'line', '[[0,0],[1,1]]'::jsonb, 'wrong parent');

\echo ''
\echo '════ 8. Viv is a viewer: reads yes, writes no ════'
SET ROLE app_user;
SET "test.uid" = '33333333-3333-3333-3333-333333333333';
SELECT 'features visible to viewer' AS check, count(*) AS n FROM "GIS_Feature";
\echo '      -- and the write (MUST FAIL):'
INSERT INTO "GIS_Feature" ("Project_ID", "Account_ID", "Layer_Key", "Feature_Type", "Geometry", "Label")
VALUES (1, 1, 'electric', 'line', '[[0,0],[1,1]]'::jsonb, 'viewer drew this');
RESET ROLE;

\echo ''
\echo '════ 9. Nothing was actually written by 4, 5, 7 or 8 ════'
SELECT "Account_ID", count(*) AS features, string_agg("Label", ', ') AS labels
  FROM "GIS_Feature" GROUP BY "Account_ID" ORDER BY "Account_ID";
