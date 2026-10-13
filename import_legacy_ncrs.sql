-- ════════════════════════════════════════════════════════════════════
--  Importing the original app's non-compliance reports
-- ════════════════════════════════════════════════════════════════════
--
-- 1,797 NCRs and 98 attachment rows.
--
-- Run 0261 and 0262 first. 0261 makes the room — the Business_Unit
-- table, the site address, the auditor as an organisation, the
-- NCR_Attachment table and the four foreign keys NCR never had. 0262
-- builds the staging and the three maps.
--
--   1. Table Editor -> legacy_ncr_import -> Import data from CSV ->
--      NCR_rows.csv
--      Table Editor -> legacy_ncr_attachment_import -> Import data
--      from CSV -> NCR_Attachment_rows.csv
--
--      Both table names are lower case so the button can find them;
--      the columns map one-to-one by header, so nothing needs
--      renaming and the order in the file does not matter.
--
--   2. Run PART 1. Nothing is written. Read it.
--
--   3. Run PART 2 — the 35 people. Then PART 1 again: every
--      "waiting on part 2" should have become "ok".
--
--   4. Run PART 3 — the NCRs.
--
--   5. Run PART 4 — drop the staging. Not optional: the descriptions
--      name members of staff.
--
-- Parts 2 and 3 are safe to run again: part 2 skips a person who is
-- already there, part 3 skips an NCR_ID that is already there. Take a
-- backup first all the same.
--
-- ── The duplicate reference, and how it was settled ──
--
-- NCR_Reference is unique, and the first export used NCR11444 twice:
--
--   NCR_ID 1341  2025-12-01  Deacons Close, contract 1843
--               "AC - 5614 The shower hoses can reach into the toilet."
--   NCR_ID 1342  2025-12-04  Marton Avenue, Middlesbrough, no contract
--               "AC-1093 - unable to locate FH Aptus suggest not installed."
--
-- Two different reports on two different sites. The later of the two,
-- NCR_ID 1342, has been given NCR11445 in the original system — a
-- number nothing else uses, the gap between NCR11444 and NCR11446.
--
-- So a fresh export carries it and there is nothing to do. An export
-- taken before 13 Oct still repeats NCR11444, and 3.0 is the one line
-- that brings it into line. Either way part 3 refuses to start while a
-- reference is repeated.
--
-- ════════════════════════════════════════════════════════════════════
--  PART 1 — what will land, and what will not
-- ════════════════════════════════════════════════════════════════════

-- 1.1 Every staged row, and whether it resolves.
--
--     Before part 2 this is mostly "waiting on part 2 creating <name>".
--     After part 2 it should be "ok" for all 1,797.
SELECT state, count(*) AS ncrs
  FROM "Legacy_NCR_Resolved"
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.2 The duplicate reference, which blocks part 3.
SELECT 'duplicate reference' AS problem,
       ncr_reference,
       string_agg(old_ncr_id::text, ' and ' ORDER BY old_ncr_id) AS ncr_ids
  FROM "Legacy_NCR_Resolved"
 GROUP BY 1, 2 HAVING count(*) > 1;

-- 1.3 ── The names that have to match, and what they matched ──
--
--     Three lookups come across as names rather than ids, because the
--     two systems number them differently. Anything reading
--     "NOT MATCHED" stops the rows that need it.

--     Regions. Five old regions, four live ones: North West 1 and
--     North West 2 were a split this system does not have.
SELECT 'region' AS lookup,
       m.old_region_id::text || ' = ' || m.old_name AS "in the old system",
       m.new_name AS "becomes",
       CASE WHEN r."Region_ID" IS NULL THEN 'NOT MATCHED'
            ELSE 'ok - Region ' || r."Region_ID" END AS state,
       (SELECT count(*) FROM "Legacy_NCR_Resolved" v
         WHERE v.old_region_id = m.old_region_id) AS ncrs
  FROM legacy_ncr_map_region m
  LEFT JOIN "Region" r ON upper(btrim(r."Region")) = upper(btrim(m.new_name))
 ORDER BY 5 DESC;

--     Auditors. Thirteen operators, which the old system filed as five
--     DNOs and eight IDNOs. Here they are organisations holding five
--     different roles between them.
SELECT 'auditor' AS lookup,
       m.old_kind || ' ' || m.old_id::text || ' = ' || m.old_name AS "in the old system",
       m.organisation_name AS "becomes",
       CASE WHEN o."Organisation_ID" IS NULL THEN 'NOT MATCHED'
            ELSE 'ok - Organisation ' || o."Organisation_ID" END AS state,
       (SELECT count(*) FROM "Legacy_NCR_Resolved" v
         WHERE (m.old_kind = 'DNO'  AND v.old_dno_id  = m.old_id)
            OR (m.old_kind = 'IDNO' AND v.old_idno_id = m.old_id)) AS ncrs
  FROM legacy_ncr_map_auditor m
  LEFT JOIN LATERAL (
      SELECT o."Organisation_ID" FROM "Organisation" o
        JOIN "Organisation_Role" ro ON ro."Organisation_ID" = o."Organisation_ID"
        JOIN "Organisation_Type" t  ON t."Organisation_Type_ID" = ro."Organisation_Type_ID"
       WHERE t."Type_Key" IN ('dno','idno','gt','igt','wu','iwu')
         AND ro."Is_Active"
         AND upper(btrim(o."Name")) = upper(btrim(m.organisation_name))
       LIMIT 1
  ) o ON true
 ORDER BY 5 DESC;

--     Statuses. By name, always: 'With Developer' has whatever id the
--     sequence gave it when 0261 inserted it.
SELECT 'status' AS lookup,
       v.old_status_id::text || ' = ' || COALESCE(v.status_name, '?') AS "in the old system",
       COALESCE(v.status_name, '?') AS "becomes",
       CASE WHEN v.ncr_status_id IS NULL THEN 'NOT MATCHED'
            ELSE 'ok - NCR_Status ' || v.ncr_status_id END AS state,
       count(*) AS ncrs
  FROM "Legacy_NCR_Resolved" v
 GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC;

-- 1.4 ── The three things the import changes about the data ──
--
--     Each is a decision, not a side effect, and each is small enough
--     to check by eye.

--     a. Four rows say an independent operator raised the NCR and name
--        nobody. 0261 refuses that shape — an NCR cannot read "audited
--        by —" — so they come across with no auditor, which is what
--        the old row actually says. Fill them in afterwards if anyone
--        remembers who.
SELECT 'auditor said IDNO, named nobody' AS note,
       old_ncr_id, ncr_reference, date_received, left(COALESCE(description,''), 60) AS description
  FROM "Legacy_NCR_Resolved"
 WHERE old_auditor_type = 'IDNO' AND old_dno_id IS NULL AND old_idno_id IS NULL
 ORDER BY old_ncr_id;

--     b. Two MUA entities become one. The old system held MUA four
--        times over — Group, Water, Gas, Electricity — and this one
--        holds a single MUA carrying the idno, igt and iwu roles.
SELECT 'MUA, four entities to one' AS note,
       m.old_kind || ' ' || m.old_id::text || ' = ' || m.old_name AS "in the old system",
       m.organisation_name AS "becomes",
       (SELECT count(*) FROM "Legacy_NCR_Resolved" v
         WHERE (m.old_kind = 'DNO'  AND v.old_dno_id  = m.old_id)
            OR (m.old_kind = 'IDNO' AND v.old_idno_id = m.old_id)) AS ncrs
  FROM legacy_ncr_map_auditor m
 WHERE m.organisation_name = 'MUA'
 ORDER BY 4 DESC;

--     c. Three columns in the export have nowhere to go: Created_At,
--        Updated_At and Created_Via. NCR has no such columns, and
--        Date_Received is the date that matters. Created_Via says
--        'xlsx' on four rows and nothing on the other 1,793.
SELECT 'dropped on import' AS note, 'Created_At'  AS column_name,
       count(NULLIF(btrim("Created_At"), ''))  AS rows_with_a_value FROM legacy_ncr_import
UNION ALL SELECT 'dropped on import', 'Updated_At',
       count(NULLIF(btrim("Updated_At"), ''))  FROM legacy_ncr_import
UNION ALL SELECT 'dropped on import', 'Created_Via',
       count(NULLIF(btrim("Created_Via"), '')) FROM legacy_ncr_import
UNION ALL SELECT 'dropped on import', 'Sub_Region_ID',
       count(NULLIF(btrim("Sub_Region_ID"), '')) FROM legacy_ncr_import;

-- 1.5 The 35 people part 2 creates, and whether any of them is already
--     here. None should be: the live Person table holds 26 people and
--     not one of these names is among them. A name that DOES match is
--     a person who would be reused rather than duplicated, which is
--     the right outcome, but worth seeing first.
SELECT CASE WHEN p."Person_ID" IS NULL THEN 'part 2 will create'
            ELSE 'already here as Person ' || p."Person_ID" END AS state,
       count(*) AS people,
       string_agg(m.person_name, ', ' ORDER BY m.person_name) AS who
  FROM legacy_ncr_map_person m
  LEFT JOIN "Person" p
    ON upper(btrim(p."Person_Name")) = upper(btrim(m.person_name))
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.6 The attachments, and the NCRs they belong to.
--
--     These rows are NOT imported by part 3. A row whose file was
--     never copied into storage is a broken link, which is worse than
--     no row at all — so they wait on the files. Part 1 counts them so
--     the job is not forgotten.
SELECT 'attachments staged' AS item, count(*)::text AS detail
  FROM legacy_ncr_attachment_import
UNION ALL SELECT 'NCRs they belong to',
       count(DISTINCT NULLIF(btrim("NCR_ID"), ''))::text FROM legacy_ncr_attachment_import
UNION ALL SELECT 'whose NCR is in the export',
       count(*)::text FROM legacy_ncr_attachment_import a
       WHERE EXISTS (SELECT 1 FROM legacy_ncr_import i
                      WHERE btrim(i."NCR_ID") = btrim(a."NCR_ID"))
UNION ALL SELECT 'files copied into storage so far', 'none - see part 4';


-- ════════════════════════════════════════════════════════════════════
--  PART 2 — the 35 people
-- ════════════════════════════════════════════════════════════════════
--
-- Each gets a NEW Person_ID from the sequence. The old ids are not
-- reused: old 23 is Laura Cassidy and this database's 23 is already
-- Ben Mckay, so keeping them would attribute 442 NCRs to the wrong
-- person.
--
-- Four are leavers and come across inactive. Five have no email in the
-- old system and come across without one — Person."Email" is nullable,
-- and they cannot sign in until somebody adds it, which is already
-- true of them today.
--
-- Matched on the name, so running this twice creates nobody twice.

INSERT INTO "Person" ("Person_Name", "Email", "Is_Active")
SELECT m.person_name, m.email, m.is_active
  FROM legacy_ncr_map_person m
 WHERE NOT EXISTS (
         SELECT 1 FROM "Person" p
          WHERE upper(btrim(p."Person_Name")) = upper(btrim(m.person_name)));

-- What part 2 did. 35 the first time, 0 every time after.
SELECT count(*) AS "people from the old system now here"
  FROM legacy_ncr_map_person m
  JOIN "Person" p ON upper(btrim(p."Person_Name")) = upper(btrim(m.person_name));


-- ════════════════════════════════════════════════════════════════════
--  PART 3 — the NCRs
-- ════════════════════════════════════════════════════════════════════

-- 3.0 ── The duplicate reference ──
--
--      Settled: the later of the two reports, NCR_ID 1342 at Marton
--      Avenue, is NCR11445 — unused, and the gap between NCR11444 and
--      NCR11446. NCR_ID 1341 at Deacons Close keeps NCR11444.
--
--      A fresh export already says so, and part 1's 1.2 comes back
--      empty. If the CSV in legacy_ncr_import was taken before 13 Oct
--      it still repeats NCR11444, and this is the line that settles
--      it.
--
--      One line, deliberately. It was four, laid out to read nicely,
--      and the editor was handed a selection that started at the
--      WHERE — "syntax error at or near WHERE". A statement somebody
--      is invited to run on its own should not be splittable by where
--      they happen to start dragging.

UPDATE legacy_ncr_import SET "NCR_Reference" = 'NCR11445' WHERE btrim("NCR_ID") = '1342' AND btrim("NCR_Reference") = 'NCR11444';

--      Guarded on the old reference as well as the id, so running it
--      against an export that is already right changes nothing rather
--      than overwriting whatever 1342 says now. UPDATE 0 is the
--      answer to hope for; UPDATE 1 means it was needed. Either way
--      carry on to 3.1.

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(ncr_reference || ' (NCR ' || ids || ')', ', ')
    INTO dup
    FROM (SELECT ncr_reference,
                 string_agg(old_ncr_id::text, ' and ' ORDER BY old_ncr_id) AS ids
            FROM "Legacy_NCR_Resolved"
           GROUP BY ncr_reference HAVING count(*) > 1) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'NCR_Reference is unique and this export repeats: %. For NCR11444 the UPDATE in 3.0 settles it (1342 becomes NCR11445); for anything else, decide which report keeps the reference first.', dup;
  END IF;

  IF EXISTS (SELECT 1 FROM "Legacy_NCR_Resolved" WHERE state <> 'ok') THEN
    RAISE EXCEPTION
      '% staged rows do not resolve. Run part 1 and look at the state column.',
      (SELECT count(*) FROM "Legacy_NCR_Resolved" WHERE state <> 'ok');
  END IF;
END $$;

-- 3.1 ── The NCRs ──
--
--      The original NCR_IDs are kept, because NCR_Attachment."NCR_ID"
--      refers to them and part 4 has 98 rows that do.
--
--      OVERRIDING SYSTEM VALUE is needed because NCR_ID is GENERATED
--      ALWAYS AS IDENTITY: without it Postgres refuses the id and
--      assigns its own.

INSERT INTO "NCR" (
  "NCR_ID", "NCR_Reference", "Description", "Date_Received", "Close_Date",
  "Region_ID", "Business_Unit_ID", "Project_ID", "Owner_Person_ID",
  "Auditor_Type", "Auditor_Organisation_ID", "Utility", "NCR_Status_ID",
  "Address_Raw"
)
OVERRIDING SYSTEM VALUE
SELECT v.old_ncr_id, v.ncr_reference, v.description, v.date_received, v.close_date,
       v.region_id, v.business_unit_id, v.project_id, v.owner_person_id,
       v.auditor_type, v.auditor_organisation_id, v.utility, v.ncr_status_id,
       v.address_raw
  FROM "Legacy_NCR_Resolved" v
 WHERE v.state = 'ok'
   AND NOT EXISTS (SELECT 1 FROM "NCR" n WHERE n."NCR_ID" = v.old_ncr_id);

-- 3.2 ── Move the sequence past the imported ids ──
--
--      Without this the sequence sits where it started and the next
--      NCR raised in the application collides with an imported row. It
--      reads as the app being broken rather than as an import that was
--      not finished.

SELECT setval(pg_get_serial_sequence('"NCR"', 'NCR_ID'),
              GREATEST((SELECT max("NCR_ID") FROM "NCR"), 1));

-- 3.3 ── What landed ──

SELECT 'NCRs imported'        AS item, count(*)::text AS detail FROM "NCR"
UNION ALL SELECT 'expected',  '1797'
UNION ALL SELECT 'NCR_ID range', min("NCR_ID")::text || ' - ' || max("NCR_ID")::text FROM "NCR"
UNION ALL SELECT 'next NCR_ID the app will use',
       (SELECT last_value + 1 FROM pg_sequences
         WHERE schemaname = 'public' AND sequencename = 'NCR_NCR_ID_seq')::text
UNION ALL SELECT 'with a project',     count("Project_ID")::text FROM "NCR"
UNION ALL SELECT 'with no project',    count(*) FILTER (WHERE "Project_ID" IS NULL)::text FROM "NCR"
UNION ALL SELECT 'with an owner',      count("Owner_Person_ID")::text FROM "NCR"
UNION ALL SELECT 'with a site address', count("Address_Raw")::text FROM "NCR"
UNION ALL SELECT 'audited by an operator',
       count(*) FILTER (WHERE "Auditor_Type" = 'Operator')::text FROM "NCR"
UNION ALL SELECT 'audited by Aptus',
       count(*) FILTER (WHERE "Auditor_Type" = 'Aptus')::text FROM "NCR"
UNION ALL SELECT 'no auditor recorded',
       count(*) FILTER (WHERE "Auditor_Type" IS NULL)::text FROM "NCR";

-- 3.4 ── Read it back by name, not by id ──
--
--      This is the check that matters. Every id the import wrote was
--      translated from one that meant something else in the old
--      system, so the only way to see whether it is right is to read
--      the NAMES back out and compare them with the old ones.

SELECT 'region'  AS reads_as, r."Region" AS name, count(*) AS ncrs
  FROM "NCR" n JOIN "Region" r ON r."Region_ID" = n."Region_ID" GROUP BY 1,2
UNION ALL
SELECT 'status', s."NCR_Status", count(*)
  FROM "NCR" n JOIN "NCR_Status" s ON s."NCR_Status_ID" = n."NCR_Status_ID" GROUP BY 1,2
UNION ALL
SELECT 'auditor', o."Name", count(*)
  FROM "NCR" n JOIN "Organisation" o ON o."Organisation_ID" = n."Auditor_Organisation_ID" GROUP BY 1,2
UNION ALL
SELECT 'owner', p."Person_Name", count(*)
  FROM "NCR" n JOIN "Person" p ON p."Person_ID" = n."Owner_Person_ID" GROUP BY 1,2
 ORDER BY 1, 3 DESC;


-- ════════════════════════════════════════════════════════════════════
--  PART 4 — the attachments, and clearing up
-- ════════════════════════════════════════════════════════════════════
--
-- The 98 attachment rows are NOT imported yet. Storage_Path is a path
-- inside a bucket — 1919/1780322384346-N0022305-1-Nightingale-road...
-- .pdf — and the FILES are still in the original system's storage. A
-- row whose file was never copied across is a broken link in the
-- application, which is worse than no row at all.
--
-- So: copy the files into this project's bucket first, keeping the
-- same paths, and then run 4.1. Until then leave 4.1 commented out and
-- the staging table where it is.
--
-- INSERT INTO "NCR_Attachment" (
--   "NCR_Attachment_ID", "NCR_ID", "Attachment_Type", "File_Name",
--   "Storage_Path", "Mime_Type", "File_Size", "Created_At")
-- OVERRIDING SYSTEM VALUE
-- SELECT NULLIF(btrim(a."NCR_Attachment_ID"), '')::bigint,
--        NULLIF(btrim(a."NCR_ID"), '')::bigint,
--        NULLIF(btrim(a."Attachment_Type"), ''),
--        btrim(a."File_Name"),
--        btrim(a."Storage_Path"),
--        NULLIF(btrim(a."Mime_Type"), ''),
--        NULLIF(btrim(a."File_Size"), '')::bigint,
--        COALESCE(NULLIF(btrim(a."Created_At"), '')::timestamptz, now())
--   FROM legacy_ncr_attachment_import a
--  WHERE EXISTS (SELECT 1 FROM "NCR" n
--                 WHERE n."NCR_ID" = NULLIF(btrim(a."NCR_ID"), '')::bigint)
--    AND NOT EXISTS (SELECT 1 FROM "NCR_Attachment" x
--                     WHERE x."Storage_Path" = btrim(a."Storage_Path"));
-- SELECT setval(pg_get_serial_sequence('"NCR_Attachment"', 'NCR_Attachment_ID'),
--               GREATEST((SELECT max("NCR_Attachment_ID") FROM "NCR_Attachment"), 1));
--
-- Uploaded_By is empty on all 98 rows in the export, so it is not
-- written. Created_At falls back to now() rather than being left null:
-- the column is NOT NULL.

-- 4.2 ── Drop the staging ──
--
--      Not optional, and not "once we get round to it". The NCR
--      descriptions name members of staff — whose competency passport
--      lapsed, who left the PAT labels off — and these tables have row
--      level security switched off so the CSV button could write to
--      them.
--
--      Run this once parts 1 to 3 read right. Everything they hold is
--      in the real tables by then, and the CSVs are still on disk if
--      any of it is needed again.

-- DROP VIEW  IF EXISTS "Legacy_NCR_Resolved";
-- DROP TABLE IF EXISTS legacy_ncr_import;
-- DROP TABLE IF EXISTS legacy_ncr_attachment_import;
-- DROP TABLE IF EXISTS legacy_ncr_map_region;
-- DROP TABLE IF EXISTS legacy_ncr_map_auditor;
-- DROP TABLE IF EXISTS legacy_ncr_map_person;
