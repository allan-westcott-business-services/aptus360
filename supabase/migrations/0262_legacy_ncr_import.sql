-- ════════════════════════════════════════════════════════════════════
--  0262 — staging for the original app's non-compliance reports
-- ════════════════════════════════════════════════════════════════════
--
-- 1,797 NCRs and 98 attachment rows. Same arrangement as 0248 and
-- 0251: every column text, loaded first and resolved afterwards, so
-- what each row points at can be looked at before anything becomes
-- real.
--
-- Run 0261 first. It makes the room this fills.
--
-- ── Why nothing here joins on an id ──
--
-- The plot import could join on exact keys. This one cannot, because
-- the two systems number the same things differently:
--
--   old Region 1 is Midlands;      here Region 1 is North West
--   old Person 23 is Laura Cassidy; here Person 23 is Ben Mckay
--   old DNO 1 is Cadent (gas);     here DNO 1 is Northern Powergrid
--
-- Every one of those would import silently and read as the wrong name
-- on screen. So the three maps below carry the old id and the NAME it
-- meant, and the view resolves the name against the live table. A
-- name that does not resolve shows up in part 1 of the run script as
-- "NOT MATCHED" and the row is refused rather than guessed at.
--
-- The one exception is the contract: Project."Legacy_Contract_ID" is
-- the old Contract_ID, kept by the project import for exactly this.
-- All 223 contracts the export names are there.
--
-- ── Lower-case table names, on purpose ──
--
-- 0255 found this out the hard way: the Table Editor's "Import data
-- from CSV" button builds the table name unquoted, Postgres folds it
-- to lower case, and a mixed-case table cannot be found. These are
-- named in lower case from the start so the button works, with the
-- COLUMN names quoted and mixed-case to match the export headers
-- exactly — the importer maps columns by header name, so the order in
-- the file does not matter.
--
-- ════════════════════════════════════════════════════════════════════


-- ── The two exports, verbatim ──

CREATE TABLE IF NOT EXISTS legacy_ncr_import (
  "NCR_ID"           text,
  "NCR_Reference"    text,
  "Description"      text,
  "Region_ID"        text,
  "Business_Unit_ID" text,
  "Contract_ID"      text,
  "Address_Raw"      text,
  "Auditor_Type"     text,
  "Auditor_DNO_ID"   text,
  "Auditor_IDNO_ID"  text,
  "Owner_Person_ID"  text,
  "Utility"          text,
  "NCR_Status_ID"    text,
  "Date_Received"    text,
  "Close_Date"       text,
  "Created_At"       text,
  "Updated_At"       text,
  "Created_Via"      text,
  "Sub_Region_ID"    text
);

CREATE TABLE IF NOT EXISTS legacy_ncr_attachment_import (
  "NCR_Attachment_ID" text,
  "NCR_ID"            text,
  "Attachment_Type"   text,
  "File_Name"         text,
  "Storage_Path"      text,
  "Mime_Type"         text,
  "File_Size"         text,
  "Uploaded_By"       text,
  "Created_At"        text
);

/* Joins are on NULLIF(btrim(col), '')::bigint, because the staging
   columns are text and '' is not a number. An index on the bare text
   column cannot serve that expression — 0251 learned this when a
   staged join ran for ten minutes before it was stopped. */
CREATE INDEX IF NOT EXISTS legacy_ncr_import_id_idx
  ON legacy_ncr_import ((NULLIF(btrim("NCR_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS legacy_ncr_import_contract_idx
  ON legacy_ncr_import ((NULLIF(btrim("Contract_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS legacy_ncr_attachment_import_ncr_idx
  ON legacy_ncr_attachment_import ((NULLIF(btrim("NCR_ID"), '')::bigint));

/* Row Level Security, as 0255 reasoned: the Table Editor's import goes
   through PostgREST as the signed-in user, and a table with RLS on and
   no policy refuses the insert. So it is off while these are loaded.

   Unlike the plot files, the NCR descriptions name members of staff —
   a competency passport, who left PAT labels off. So the run script
   DROPS these tables at the end rather than leaving them empty, and
   that step is not optional. */
ALTER TABLE legacy_ncr_import            DISABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_ncr_attachment_import DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE legacy_ncr_import IS
  'Raw rows from the original app''s NCR export, as text. Descriptions '
  'name members of staff: drop this table once the import is checked.';
COMMENT ON TABLE legacy_ncr_attachment_import IS
  'Raw rows from the original app''s NCR_Attachment export, as text. '
  'The FILES are a separate job; these rows alone are broken links.';


-- ════════════════════════════════════════════════════════════════════
--  The three maps — old id, and the name it meant
-- ════════════════════════════════════════════════════════════════════
--
-- These are facts about the OLD system, read off its own exports. They
-- are small enough to read in full, which is the point: the id in the
-- export means nothing here, and the name is the only thing both
-- systems agree on.

-- ── Regions ──
--
-- Five of the old system's eight regions appear on an NCR. Two of them
-- are the same place: "North West 1" and "North West 2" were a split
-- this system does not have, and both become North West. That merge
-- was asked for.
--
-- The other three match by name on their own.

CREATE TABLE IF NOT EXISTS legacy_ncr_map_region (
  old_region_id bigint PRIMARY KEY,
  old_name      text NOT NULL,
  new_name      text NOT NULL
);

INSERT INTO legacy_ncr_map_region (old_region_id, old_name, new_name) VALUES
  (1, 'Midlands',     'Midlands'),
  (2, 'North East',   'North East'),
  (4, 'North West 2', 'North West'),
  (5, 'Yorkshire',    'Yorkshire'),
  (7, 'North West',   'North West')
ON CONFLICT (old_region_id) DO UPDATE
  SET old_name = EXCLUDED.old_name, new_name = EXCLUDED.new_name;

-- ── Auditors ──
--
-- The old system had two columns, Auditor_DNO_ID and Auditor_IDNO_ID,
-- and used "DNO" to mean the incumbent for whatever utility and "IDNO"
-- to mean the independent one — IWUs and IGTs included, which is what
-- they were called at the time. That is why 889 Water NCRs carry
-- Auditor_Type 'DNO': old DNO 3 is United Utilities.
--
-- Here all thirteen are organisations, holding five different roles
-- between them. 0261 replaced the two columns with one.
--
-- Four of the names needed a decision, and each is written out rather
-- than hidden in a normalisation rule:
--
--   'Electricity Northwest'          -> 'Electricity North West'
--   'Independent Water Networks Ltd' -> 'Independent Water Networks'
--   'ESP Water Ltd' / 'ESP Electricity Ltd' -> without the Ltd
--   'MUA Group' and 'MUA Gas Limited' -> 'MUA'
--
-- The last is the only one that is a judgement rather than a suffix.
-- The old system held MUA four times over — Group, Water, Gas,
-- Electricity — and this one holds a single MUA carrying the idno, igt
-- and iwu roles. Group (10 NCRs) and Gas (1 NCR) both land on it.

CREATE TABLE IF NOT EXISTS legacy_ncr_map_auditor (
  old_kind          text   NOT NULL CHECK (old_kind IN ('DNO', 'IDNO')),
  old_id            bigint NOT NULL,
  old_name          text   NOT NULL,
  organisation_name text   NOT NULL,
  PRIMARY KEY (old_kind, old_id)
);

INSERT INTO legacy_ncr_map_auditor (old_kind, old_id, old_name, organisation_name) VALUES
  ('DNO',   3, 'United Utilities',               'United Utilities'),            -- 846 NCRs
  ('IDNO',  4, 'GTC',                            'GTC'),                         -- 666
  ('DNO',  12, 'Severn Trent Water',             'Severn Trent Water'),          --  43
  ('IDNO', 31, 'ESP Electricity Ltd',            'ESP Electricity'),             --  29
  ('IDNO',  6, 'Independent Water Networks Ltd', 'Independent Water Networks'),  --  24
  ('IDNO', 24, 'ESP Water Ltd',                  'ESP Water'),                   --  14
  ('IDNO',  8, 'MUA Group',                      'MUA'),                         --  10
  ('DNO',   1, 'Cadent',                         'Cadent'),                      --   2
  ('IDNO', 46, 'Northumbrian Water',             'Northumbrian Water'),          --   2
  ('DNO',   2, 'Electricity Northwest',          'Electricity North West'),      --   1
  ('DNO',  10, 'SP Energy Networks',             'SP Energy Networks'),          --   1
  ('IDNO', 42, 'Yorkshire Water',                'Yorkshire Water'),             --   1
  ('IDNO', 43, 'MUA Gas Limited',                'MUA')                          --   1
ON CONFLICT (old_kind, old_id) DO UPDATE
  SET old_name = EXCLUDED.old_name,
      organisation_name = EXCLUDED.organisation_name;

-- ── People ──
--
-- 35 of the old system's 215 people own an NCR, and not one of them is
-- in this database yet. All 35 are created, leavers included and
-- marked inactive, because an NCR with no owner loses who was dealing
-- with it.
--
-- Five have no email address in the old system. Person."Email" is
-- UNIQUE and nullable, so they come across without one; they cannot
-- sign in until somebody adds it, which is already true of them today.
--
-- The ids here are the OLD ones and are used for nothing but the join.
-- Each person gets a new id from the sequence — old 23 is Laura
-- Cassidy and this database's 23 is already Ben Mckay, so reusing them
-- would attribute 29 NCRs to the wrong person.

CREATE TABLE IF NOT EXISTS legacy_ncr_map_person (
  old_person_id bigint PRIMARY KEY,
  person_name   text    NOT NULL,
  email         text,
  is_active     boolean NOT NULL
);

INSERT INTO legacy_ncr_map_person (old_person_id, person_name, email, is_active) VALUES
  ( 23, 'Laura Cassidy',      'laura.cassidy@aptusutilities.co.uk',      true),
  ( 31, 'Kate McDonough',     'kate.mcdonough@aptusutilities.co.uk',     true),
  ( 40, 'Mark Yates',         'mark.yates@aptusutilities.co.uk',         true),
  ( 41, 'Ryan Fisher',        'ryan.fisher@aptusutilities.co.uk',        true),
  ( 42, 'Luke Foskett',       'luke.foskett@aptusutilities.co.uk',       true),
  ( 43, 'Steve Norris',       'steve.norris@aptusutilities.co.uk',       true),
  ( 44, 'Mark Ransom',        'mark.ransom@aptusutilities.co.uk',        true),
  ( 45, 'Trevor Lamb',        'trevor.lamb@aptusutilities.co.uk',        true),
  ( 46, 'Peter Wood',         'peter.wood@aptusutilities.co.uk',         true),
  ( 47, 'Jonathan Wynne',     'jonathan.wynne@aptusutilities.co.uk',     true),
  ( 48, 'Scott Whelan',        NULL,                                     false),
  ( 49, 'Malcolm Darwen',     'malcolm.darwen@aptusutilities.co.uk',     true),
  ( 50, 'Scott Thompson',     'scott.thompson@aptusutilities.co.uk',     true),
  ( 51, 'Mark Godfrey',       'mark.godfrey@aptusutilities.co.uk',       true),
  ( 52, 'Alan Hook',          'alan.hook@aptusutilities.co.uk',          true),
  ( 53, 'Karl Evans',         'karl.evans@aptusutilities.co.uk',         true),
  ( 54, 'James Metcalfe',     'james.metcalfe@aptusutilities.co.uk',     true),
  ( 55, 'Steve Nicholson',    'steve.nicholson@aptusutilities.co.uk',    true),
  ( 56, 'John Goulding',       NULL,                                     false),
  ( 57, 'Rob Maxwell',         NULL,                                     false),
  ( 58, 'Mark Potter',        'mark.potter@aptusutilities.co.uk',        true),
  ( 59, 'Mark Bland',         'mark.bland@aptusutilities.co.uk',         true),
  ( 61, 'Adam Williamson',    'adam.williamson@aptusutilities.co.uk',    true),
  ( 62, 'Reece Page',          NULL,                                     false),
  ( 63, 'Stephen Chesworth',  'stephen.chesworth@aptusutilities.co.uk',  true),
  ( 64, 'James Learmouth',    'james.learmouth@aptusutilities.co.uk',    true),
  ( 65, 'Frank McCusker',     'frank.mcCusker@aptusutilities.co.uk',     true),
  ( 66, 'Dave McCormick',     'dave.mccormick@aptusutilities.co.uk',     true),
  ( 67, 'Charlotte Berryman', 'charlotte.berryman@aptusutilities.co.uk', true),
  ( 68, 'Kieran Clayton',     'kieran.clayton@aptusutilities.co.uk',     true),
  ( 69, 'Rowena McCalla',     'rowena.mccalla@aptusutilities.co.uk',     true),
  ( 70, 'Simon Connell',      'simon.connell@aptusutilities.co.uk',      true),
  ( 71, 'Peter Cairns',       'peter.cairns@aptusutilities.co.uk',       true),
  (246, 'Jordon Allison',      NULL,                                     true),
  (247, 'Declan Marsden',     'declan.marsden@aptusutilities.co.uk',     true)
ON CONFLICT (old_person_id) DO UPDATE
  SET person_name = EXCLUDED.person_name,
      email       = EXCLUDED.email,
      is_active   = EXCLUDED.is_active;

/* These three hold no customer data and are read by nothing but the
   import, so RLS on with no policy — the same as every other table
   here. They are dropped with the staging tables. */
ALTER TABLE legacy_ncr_map_region  ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_ncr_map_auditor ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_ncr_map_person  ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════════
--  Legacy_NCR_Resolved — every staged row, and what it resolves to
-- ════════════════════════════════════════════════════════════════════
--
-- One row per staged NCR. Each lookup comes back as the live id, or
-- NULL with a reason beside it, so part 1 of the run script can show
-- what would not land before anything is written.
--
-- The CASE at the end is the gate: 'ok' means every lookup the row
-- needs resolved. Anything else is a row the import refuses.

CREATE OR REPLACE VIEW "Legacy_NCR_Resolved" AS
WITH staged AS (
  SELECT i.*,
         NULLIF(btrim(i."NCR_ID"), '')::bigint          AS old_ncr_id,
         NULLIF(btrim(i."Region_ID"), '')::bigint       AS old_region_id,
         NULLIF(btrim(i."Contract_ID"), '')::bigint     AS old_contract_id,
         NULLIF(btrim(i."Owner_Person_ID"), '')::bigint AS old_person_id,
         NULLIF(btrim(i."NCR_Status_ID"), '')::bigint   AS old_status_id,
         NULLIF(btrim(i."Auditor_DNO_ID"), '')::bigint  AS old_dno_id,
         NULLIF(btrim(i."Auditor_IDNO_ID"), '')::bigint AS old_idno_id,
         NULLIF(btrim(i."Auditor_Type"), '')            AS old_auditor_type
    FROM legacy_ncr_import i
)
SELECT s.old_ncr_id,
       btrim(s."NCR_Reference")                  AS ncr_reference,
       NULLIF(btrim(s."Description"), '')        AS description,
       NULLIF(btrim(s."Address_Raw"), '')        AS address_raw,
       NULLIF(btrim(s."Utility"), '')            AS utility,
       NULLIF(btrim(s."Date_Received"), '')::date AS date_received,
       NULLIF(btrim(s."Close_Date"), '')::date    AS close_date,
       s.old_region_id, s.old_contract_id, s.old_person_id,
       s.old_status_id, s.old_dno_id, s.old_idno_id, s.old_auditor_type,

       /* Region: old id -> old name -> live region of that name. */
       mr.new_name AS region_name,
       r."Region_ID" AS region_id,

       /* Contract: the one exact key in the whole import. */
       p."Project_ID" AS project_id,

       /* Person: old id -> name -> the person created by part 2.
          Matched on the name from the map, which is the name part 2
          writes, so the two cannot disagree. */
       mp.person_name AS owner_name,
       pe."Person_ID" AS owner_person_id,

       /* Status: by name. 'With Developer' takes whatever id the
          sequence gave it, which is only 4 by coincidence. */
       ms.name AS status_name,
       st."NCR_Status_ID" AS ncr_status_id,

       /* Business unit: every row in the export is Operations. */
       bu."Business_Unit_ID" AS business_unit_id,

       /* Auditor. The old kind and id pick a name from the map; the
          name picks an organisation. Restricted to organisations that
          actually operate a network, so "United Utilities" reaches the
          water undertaker and not a customer record of the same name —
          the same guard 0251 uses for the adopter. */
       ma.organisation_name AS auditor_name,
       (SELECT o."Organisation_ID"
          FROM "Organisation" o
          JOIN "Organisation_Role" ro ON ro."Organisation_ID" = o."Organisation_ID"
          JOIN "Organisation_Type" t  ON t."Organisation_Type_ID" = ro."Organisation_Type_ID"
         WHERE t."Type_Key" IN ('dno', 'idno', 'gt', 'igt', 'wu', 'iwu')
           AND ro."Is_Active"
           AND upper(btrim(o."Name")) = upper(btrim(ma.organisation_name))
         LIMIT 1) AS auditor_organisation_id,

       /* Auditor_Type as this database says it: whether anybody
          outside raised it. 'DNO' and 'IDNO' described a world with
          two kinds of operator and there are five.

          Four rows say 'IDNO' and name nobody. Under 0261 that shape
          is refused outright — an NCR cannot be "audited by —" — so
          they come across with no auditor at all, which is what the
          old row actually tells us. Part 1 lists them by reference. */
       CASE
         WHEN s.old_auditor_type = 'Aptus' THEN 'Aptus'
         WHEN ma.organisation_name IS NOT NULL THEN 'Operator'
         ELSE NULL
       END AS auditor_type,

       CASE
         WHEN s.old_ncr_id IS NULL
           THEN 'no NCR_ID'
         WHEN btrim(COALESCE(s."NCR_Reference", '')) = ''
           THEN 'no NCR_Reference'
         WHEN s.old_region_id IS NOT NULL AND mr.new_name IS NULL
           THEN 'region ' || s.old_region_id || ' is not in the region map'
         WHEN s.old_region_id IS NOT NULL AND r."Region_ID" IS NULL
           THEN 'NOT MATCHED: no region called ' || mr.new_name
         WHEN s.old_contract_id IS NOT NULL AND p."Project_ID" IS NULL
           THEN 'contract ' || s.old_contract_id || ' is not on any project'
         WHEN s.old_person_id IS NOT NULL AND mp.person_name IS NULL
           THEN 'person ' || s.old_person_id || ' is not in the person map'
         WHEN s.old_person_id IS NOT NULL AND pe."Person_ID" IS NULL
           THEN 'waiting on part 2 creating ' || mp.person_name
         WHEN s.old_status_id IS NOT NULL AND st."NCR_Status_ID" IS NULL
           THEN 'NOT MATCHED: no status called ' || COALESCE(ms.name, '?')
         WHEN (s.old_dno_id IS NOT NULL OR s.old_idno_id IS NOT NULL)
              AND ma.organisation_name IS NULL
           THEN 'auditor ' || COALESCE(s.old_auditor_type, '?') || ' '
                || COALESCE(s.old_dno_id, s.old_idno_id) || ' is not in the auditor map'
         WHEN ma.organisation_name IS NOT NULL
              AND (SELECT o."Organisation_ID" FROM "Organisation" o
                     JOIN "Organisation_Role" ro ON ro."Organisation_ID" = o."Organisation_ID"
                     JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = ro."Organisation_Type_ID"
                    WHERE t."Type_Key" IN ('dno','idno','gt','igt','wu','iwu')
                      AND ro."Is_Active"
                      AND upper(btrim(o."Name")) = upper(btrim(ma.organisation_name))
                    LIMIT 1) IS NULL
           THEN 'NOT MATCHED: no network operator called ' || ma.organisation_name
         WHEN bu."Business_Unit_ID" IS NULL
           THEN 'NOT MATCHED: no business unit called Operations'
         ELSE 'ok'
       END AS state
  FROM staged s
  LEFT JOIN legacy_ncr_map_region  mr ON mr.old_region_id = s.old_region_id
  LEFT JOIN "Region" r              ON upper(btrim(r."Region")) = upper(btrim(mr.new_name))
  LEFT JOIN "Project" p             ON p."Legacy_Contract_ID" = s.old_contract_id
  LEFT JOIN legacy_ncr_map_person  mp ON mp.old_person_id = s.old_person_id
  LEFT JOIN "Person" pe             ON upper(btrim(pe."Person_Name")) = upper(btrim(mp.person_name))
  LEFT JOIN LATERAL (
      SELECT CASE s.old_status_id WHEN 1 THEN 'Open' WHEN 2 THEN 'On Hold'
                                  WHEN 3 THEN 'Closed' WHEN 4 THEN 'With Developer' END AS name
  ) ms ON true
  LEFT JOIN "NCR_Status" st ON upper(btrim(st."NCR_Status")) = upper(btrim(ms.name))
  LEFT JOIN "Business_Unit" bu ON upper(btrim(bu."Business_Unit")) = 'OPERATIONS'
  LEFT JOIN legacy_ncr_map_auditor ma
         ON (ma.old_kind = 'DNO'  AND ma.old_id = s.old_dno_id)
         OR (ma.old_kind = 'IDNO' AND ma.old_id = s.old_idno_id);

COMMENT ON VIEW "Legacy_NCR_Resolved" IS
  'Each staged NCR with the live ids its old ids and names resolve to. '
  'state says ok, or why the row would not land.';

/* The status names are written out above rather than read from the old
   NCR_Status export, because there are four of them and the export
   agrees with this database on three. If a fifth ever appears the
   LATERAL returns NULL, the state column says "NOT MATCHED: no status
   called ?", and the row is refused — which is the right outcome. */


DO $$
BEGIN
  PERFORM 1 FROM information_schema.views
   WHERE table_schema = 'public' AND table_name = 'Legacy_NCR_Resolved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legacy_NCR_Resolved was not created.';
  END IF;
  IF (SELECT count(*) FROM legacy_ncr_map_person)  <> 35 THEN
    RAISE EXCEPTION 'the person map should hold 35 rows, holds %',
      (SELECT count(*) FROM legacy_ncr_map_person);
  END IF;
  IF (SELECT count(*) FROM legacy_ncr_map_auditor) <> 13 THEN
    RAISE EXCEPTION 'the auditor map should hold 13 rows, holds %',
      (SELECT count(*) FROM legacy_ncr_map_auditor);
  END IF;
  IF (SELECT count(*) FROM legacy_ncr_map_region)  <> 5 THEN
    RAISE EXCEPTION 'the region map should hold 5 rows, holds %',
      (SELECT count(*) FROM legacy_ncr_map_region);
  END IF;
  RAISE NOTICE 'Staging is ready. Import NCR_rows.csv into legacy_ncr_import '
    'and NCR_Attachment_rows.csv into legacy_ncr_attachment_import, then run '
    'import_legacy_ncrs.sql part 1.';
END $$;
