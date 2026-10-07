-- ════════════════════════════════════════════════════════════════════
-- 0256 — what the connections import needs to exist first
-- ════════════════════════════════════════════════════════════════════
--
-- The pre-flight on the live database found three things missing and
-- one thing that cannot be fixed by a rename. This migration puts them
-- all in place and then reports what it did. Run it, read the table,
-- then run the import.
--
-- ── 1. Three pack statuses the new table does not have ──
--
-- Pack_Status holds Pack Not Submitted, Pack In Progress, Submitted,
-- Accepted and Rejected. The old data also uses Returned (22,072),
-- Issued (284) and IT Issues (22). Unlike Visit_Outcome, the import has
-- nowhere to put the word — Pack_Status_ID is the only column — so
-- 22,378 rows would lose their status entirely.
--
-- Worse than lost: pu_pack_trg fires BEFORE INSERT and reads
--
--     IF cur IS NULL OR cur IN ('Pack Not Submitted','Pack In Progress')
--        THEN NEW."Pack_Status_ID" := <Submitted>
--
-- so a Returned row that resolves to NULL and carries a service card
-- submission date would be stamped **Submitted**. Not a gap — a wrong
-- value that reads as a real one. Adding the three states closes that.
--
-- ── 2. Four adopters that are not in the organisation register ──
--
-- IWNL (3,327), MUA (2,252), MUA Water (71), Lastmile (193) and Thames
-- Water (38) name no organisation at all. The first four are the same
-- two companies under short forms. Created here, marked in Notes, and
-- worth checking in Admin › Organisations — the legal names are my
-- reading of the abbreviations, not something the data states.
--
-- ── 3. Six adopters that ARE in the register, under longer names ──
--
-- ENW is Electricity North West. NWL is Northumbrian Water. Severn
-- Trent is Severn Trent Water. Leep Utilities is Leep Networks. These
-- need an alias, not an organisation.
--
-- ── 4. ESP, which is three companies and needs the utility to tell ──
--
-- 2,827 ESP rows are on electricity, 2,669 on gas, and the register
-- holds ESP Electricity (idno), ES Pipelines (igt) and ESP Water (iwu)
-- as separate organisations. A map keyed on the name alone would have
-- to pick one and be wrong about 2,669 rows either way. So the alias
-- map is keyed on Kind = 'adopter:<utility id>' first, falling back to
-- Kind = 'adopter'.
--
-- There is deliberately NO bare 'ESP' alias. If ESP turns up on water —
-- it does not in this export — it stays unmatched rather than guessed.
--
-- ── Every step is guarded ──
--
-- Pack_Status and Plot_Utility pre-date the migration baseline, so
-- their real column lists are not in this repository. Three plot-import
-- failures came from exactly that. Each step here runs in its own block
-- with its own exception handler: a column I do not know about makes
-- one step report a failure instead of undoing the other three.
--
-- Safe to run twice. Nothing is inserted that is already there.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Legacy_Lookup_Map" (
  "Kind"      text NOT NULL,
  "Legacy_ID" text NOT NULL,
  "New_ID"    bigint,
  "Note"      text,
  PRIMARY KEY ("Kind", "Legacy_ID")
);

CREATE TABLE IF NOT EXISTS "Legacy_Migration_Log" (
  "Step"   text PRIMARY KEY,
  "State"  text,
  "Detail" text
);


-- ── Step 1: the three missing pack statuses ──────────────────────────

DO $$
DECLARE nm text; nxt bigint; added int := 0;
BEGIN
  FOREACH nm IN ARRAY ARRAY['Returned', 'Issued', 'IT Issues'] LOOP
    IF NOT EXISTS (SELECT 1 FROM "Pack_Status"
                    WHERE upper(btrim("Pack_Status")) = upper(nm)) THEN
      SELECT COALESCE(max("Pack_Status_ID"), 0) + 1 INTO nxt FROM "Pack_Status";
      INSERT INTO "Pack_Status" ("Pack_Status_ID", "Pack_Status") VALUES (nxt, nm);
      added := added + 1;
    END IF;
  END LOOP;

  INSERT INTO "Legacy_Migration_Log" VALUES ('1 pack statuses', 'ok',
    added::text || ' added; the table now holds ' ||
    (SELECT string_agg("Pack_Status", ', ' ORDER BY "Pack_Status_ID")
       FROM "Pack_Status"))
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "Legacy_Migration_Log" VALUES ('1 pack statuses', 'FAILED',
    SQLERRM || ' - 22,378 rows will lose their pack status, and any of '
    || 'them carrying a service card date will be stamped Submitted by '
    || 'pu_pack_trg. Do not run the import until this is fixed.')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
END $$;


-- ── Step 2: the four organisations that are genuinely absent ─────────
--
-- Roles are resolved by Type_Key, never by Organisation_Type_ID: the
-- two systems reuse id numbers for different things and this one is
-- read from the register by name.
--
-- Organisation_Utility is written too where it exists. 0172's own note
-- says an operator with no utilities against it "appears in the list
-- and is offered by nothing" — a new adopter that no picker offers
-- would be a quiet trap.

DO $$
DECLARE
  org  record;
  oid  bigint;
  made int := 0;
  rk   text;
  uid  bigint;
  have_ou boolean := to_regclass('"Organisation_Utility"') IS NOT NULL;
BEGIN
  FOR org IN
    SELECT * FROM (VALUES
      ('Independent Water Networks', ARRAY['iwu'],              ARRAY['Water'],
       'Created by the connections import for adopter "IWNL" (3,327 connections). Check the legal name.'),
      ('MUA',                        ARRAY['idno','igt','iwu'], ARRAY['Electric','Gas','Water'],
       'Created by the connections import for adopters "MUA" (2,252) and "MUA Water" (71). Multi Utility Assets — check the legal name.'),
      ('Last Mile',                  ARRAY['idno','igt','iwu'], ARRAY['Electric','Gas','Water'],
       'Created by the connections import for adopter "Lastmile" (193 connections). Check the legal name.'),
      ('Thames Water',               ARRAY['wu'],               ARRAY['Water'],
       'Created by the connections import for adopter "Thames Water" (38 connections).')
    ) AS v(nm, roles, utils, note)
  LOOP
    SELECT "Organisation_ID" INTO oid FROM "Organisation"
     WHERE upper(btrim("Name")) = upper(org.nm) LIMIT 1;

    IF oid IS NULL THEN
      INSERT INTO "Organisation" ("Name", "Is_Active", "Notes")
      VALUES (org.nm, true, org.note)
      RETURNING "Organisation_ID" INTO oid;
      made := made + 1;
    END IF;

    FOREACH rk IN ARRAY org.roles LOOP
      INSERT INTO "Organisation_Role" ("Organisation_ID", "Organisation_Type_ID", "Is_Active")
      SELECT oid, t."Organisation_Type_ID", true
        FROM "Organisation_Type" t
       WHERE t."Type_Key" = rk
         AND NOT EXISTS (SELECT 1 FROM "Organisation_Role" r
                          WHERE r."Organisation_ID" = oid
                            AND r."Organisation_Type_ID" = t."Organisation_Type_ID");
    END LOOP;

    IF have_ou THEN
      FOREACH rk IN ARRAY org.utils LOOP
        SELECT "Utility_ID" INTO uid FROM "Utility"
         WHERE upper(btrim("Utility")) = upper(rk) LIMIT 1;
        IF uid IS NOT NULL THEN
          EXECUTE 'INSERT INTO "Organisation_Utility" ("Organisation_ID", "Utility_ID") '
               || 'SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM "Organisation_Utility" '
               || 'WHERE "Organisation_ID" = $1 AND "Utility_ID" = $2)'
            USING oid, uid;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  INSERT INTO "Legacy_Migration_Log" VALUES ('2 organisations', 'ok',
    made::text || ' created'
    || CASE WHEN have_ou THEN ', with their utilities set'
            ELSE ' - no Organisation_Utility table here, so set the '
                 || 'utilities in Admin > Organisations or no picker '
                 || 'will offer them' END)
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "Legacy_Migration_Log" VALUES ('2 organisations', 'FAILED',
    SQLERRM || ' - 5,881 connections will import without an adopter. '
    || 'Not fatal: the import matches on the legacy id, so filling '
    || 'these in and re-running fills them.')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
END $$;


-- ── Step 3: the maps ────────────────────────────────────────────────
--
-- The utility map is written explicitly even though the old ids and the
-- new ids happen to agree. The staged data proves which is which
-- without reference to either table: old utility 1 carries a 13-digit
-- MPAN and is adopted by ENW, old 2 carries a 10-digit MPRN and is
-- adopted by Cadent, old 3 carries no supply number at all and every
-- adopter on it is a water company. Relying on a coincidence that
-- nobody wrote down is how old config 1 (1BD) became new config 1
-- (3BS).

DO $$
DECLARE ok_util int; ok_ad int;
BEGIN
  INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
  SELECT 'utility', v.old, u."Utility_ID",
         'Old ' || v.old || ' = ' || v.nm || ' - proved from the staged data: '
         || v.why
    FROM (VALUES
      ('1', 'Electric', '13-digit MPAN on 8,960 rows, adopted by ENW'),
      ('2', 'Gas',      '10-digit MPRN on 7,559 rows, adopted by Cadent'),
      ('3', 'Water',    'no supply number at all, every adopter a water company')
    ) AS v(old, nm, why)
    JOIN "Utility" u ON upper(btrim(u."Utility")) = upper(v.nm)
  ON CONFLICT ("Kind", "Legacy_ID") DO UPDATE
    SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

  -- Aliases that need no utility to resolve: one organisation each.
  INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
  SELECT 'adopter', v.alias, o."Organisation_ID",
         v.alias || ' -> ' || v.org
    FROM (VALUES
      ('ENW',            'Electricity North West'),
      ('NWL',            'Northumbrian Water'),
      ('Severn Trent',   'Severn Trent Water'),
      ('Leep Utilities', 'Leep Networks'),
      ('IWNL',           'Independent Water Networks'),
      ('MUA',            'MUA'),
      ('MUA Water',      'MUA'),
      ('Lastmile',       'Last Mile'),
      ('Thames Water',   'Thames Water')
    ) AS v(alias, org)
    JOIN "Organisation" o ON upper(btrim(o."Name")) = upper(v.org)
  ON CONFLICT ("Kind", "Legacy_ID") DO UPDATE
    SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

  -- ESP, which only the utility can disambiguate.
  INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
  SELECT 'adopter:' || v.util, v.alias, o."Organisation_ID",
         v.alias || ' on utility ' || v.util || ' -> ' || v.org
    FROM (VALUES
      ('1', 'ESP', 'ESP Electricity'),
      ('2', 'ESP', 'ES Pipelines')
    ) AS v(util, alias, org)
    JOIN "Organisation" o ON upper(btrim(o."Name")) = upper(v.org)
  ON CONFLICT ("Kind", "Legacy_ID") DO UPDATE
    SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

  SELECT count(*) INTO ok_util FROM "Legacy_Lookup_Map"
   WHERE "Kind" = 'utility' AND "New_ID" IS NOT NULL;
  SELECT count(*) INTO ok_ad FROM "Legacy_Lookup_Map"
   WHERE "Kind" LIKE 'adopter%' AND "New_ID" IS NOT NULL;

  INSERT INTO "Legacy_Migration_Log" VALUES ('3 maps', 'ok',
    ok_util::text || ' of 3 utilities and ' || ok_ad::text
    || ' of 11 adopter aliases point at something. An alias that '
    || 'resolved to nothing leaves the adopter blank, never wrong.')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "Legacy_Migration_Log" VALUES ('3 maps', 'FAILED', SQLERRM)
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
END $$;


-- ── Step 4: the view learns the aliases, and learns to count ────────
--
-- Two changes.
--
-- The adopter now tries the per-utility alias, then the plain alias,
-- then the exact name as before. Order matters: the specific beats the
-- general, and the general beats nothing.
--
-- And dup_rank. Plot_Utility carries UNIQUE ("Plot_ID", "Utility_ID"),
-- and the old data holds 283 plot-and-utility pairs more than once
-- because the old system kept one row per VISIT. Each pair is an
-- earlier Aborted visit with no date and no meter, then a later
-- Completed one with both. dup_rank = 1 is the completed visit:
-- a connection date beats none, a later date beats an earlier one, and
-- a higher legacy id breaks the tie.
--
-- I reported 2 of these and there are 283. I had counted them through
-- new_plot_id, which is NULL for any connection whose plot is not
-- imported, so the NULLs hid them. The partition here is on the RAW
-- legacy plot id for that reason.

CREATE OR REPLACE VIEW "Legacy_Connection_Resolved" AS
  SELECT c."Legacy_Connection_Import_ID",
     c."Plot_Utility_ID", c."Plot_ID", c."Utility_ID",
     c."Programmed_Date", c."Connection_Date", c."Visit_Outcome",
     c."Meter_Number", c."Meter_Photos", c."As_Laid_Date", c."Adopter",
     c."Team_ID", c."Status_Of_Pack", c."Service_Card_Submission_Date",
     c."Days_To_Complete", c."Smart_Meter", c."IDNO_ID", c."MPAN_MPRN",
     c."Meter_Card_Submission_Date", c."Joint_Type_ID",
     c."Cable_Size_In", c."Cable_Size_Out", c."Joint_Picture_Path",
     c."Source_Plot_Service_ID", c."Self_Lay_Provider",
     c."Dead_Jointed_Date", c."Expected_Asset_Value",
     c."Service_Card_File_Path", c."Planned_Jointing_Date",
     c."Actual_Jointing_Date",
     p."Plot_ID" AS new_plot_id,
     ( SELECT s."Pack_Status_ID"
         FROM "Pack_Status" s
        WHERE upper(btrim(s."Pack_Status")) = upper(btrim(c."Status_Of_Pack"))
        LIMIT 1) AS pack_status_id,
     ( SELECT v."Visit_Outcome_ID"
         FROM "Visit_Outcome" v
        WHERE upper(btrim(v."Visit_Outcome")) = upper(btrim(c."Visit_Outcome"))
        LIMIT 1) AS visit_outcome_id,
     COALESCE(
       ( SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
          WHERE m."Kind" = 'adopter:' || btrim(c."Utility_ID")
            AND upper(btrim(m."Legacy_ID")) = upper(btrim(c."Adopter"))
            AND COALESCE(btrim(c."Adopter"), '') <> ''
          LIMIT 1),
       ( SELECT m."New_ID" FROM "Legacy_Lookup_Map" m
          WHERE m."Kind" = 'adopter'
            AND upper(btrim(m."Legacy_ID")) = upper(btrim(c."Adopter"))
            AND COALESCE(btrim(c."Adopter"), '') <> ''
          LIMIT 1),
       ( SELECT o."Organisation_ID"
           FROM "Organisation" o
           JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID"
           JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
          WHERE t."Type_Key" = ANY (ARRAY['idno','dno','gt','wu','igt','iwu'])
            AND r."Is_Active"
            AND COALESCE(btrim(c."Adopter"), '') <> ''
            AND upper(btrim(o."Name")) = upper(btrim(c."Adopter"))
          LIMIT 1)) AS adopter_organisation_id,
     CASE WHEN p."Plot_ID" IS NULL
          THEN 'waiting on the plot being imported'::text
          ELSE 'ok'::text END AS plot_status,
     /* The dates in this staging are all ISO yyyy-mm-dd - checked
        across all 33,380 rows - so they sort correctly as text and no
        cast is needed here. A cast in a view would make every reader
        of it fail on one bad value. */
     row_number() OVER (
       PARTITION BY NULLIF(btrim(c."Plot_ID"), ''),
                    NULLIF(btrim(c."Utility_ID"), '')
       ORDER BY (NULLIF(btrim(c."Connection_Date"), '') IS NOT NULL) DESC,
                NULLIF(btrim(c."Connection_Date"), '') DESC NULLS LAST,
                NULLIF(btrim(c."Plot_Utility_ID"), '')::bigint DESC
     ) AS dup_rank
    FROM "Legacy_Connection_Import" c
    LEFT JOIN "Plot" p
      ON p."Legacy_Plot_ID" = NULLIF(btrim(c."Plot_ID"), '')::bigint;


-- ── What happened ───────────────────────────────────────────────────
--
-- One statement, so the editor shows it.

SELECT * FROM (
  SELECT 0::numeric AS "#", l."Step" AS "Step", l."State" AS "State",
         l."Detail" AS "Detail"
    FROM "Legacy_Migration_Log" l
   WHERE l."Step" IN ('1 pack statuses', '2 organisations', '3 maps')

  UNION ALL
  SELECT 4, '4 adopters still unresolved',
         CASE WHEN count(*) = 0 THEN 'ok' ELSE 'these import blank' END,
         COALESCE(string_agg(DISTINCT btrim(r."Adopter"), ', '),
                  'none - every adopter now resolves')
    FROM "Legacy_Connection_Resolved" r
   WHERE COALESCE(btrim(r."Adopter"), '') <> ''
     AND r.adopter_organisation_id IS NULL

  UNION ALL
  SELECT 4.1, '4.1 adopters now resolved', 'count',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE adopter_organisation_id IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Legacy_Connection_Import"
              WHERE COALESCE(btrim("Adopter"), '') <> '')::text
         || ' that name one'

  UNION ALL
  SELECT 4.2, '4.2 pack statuses now resolved', 'count',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE pack_status_id IS NOT NULL)::text || ' of '
         || (SELECT count(*) FROM "Legacy_Connection_Import"
              WHERE COALESCE(btrim("Status_Of_Pack"), '') <> '')::text
         || ' that have one'

  UNION ALL
  SELECT 5, '5 rows the import will write', 'count',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE new_plot_id IS NOT NULL AND dup_rank = 1)::text
         || ' of ' || (SELECT count(*) FROM "Legacy_Connection_Import")::text
         || ' staged'

  UNION ALL
  SELECT 5.1, '5.1 rows dup_rank drops', 'count',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE new_plot_id IS NOT NULL AND dup_rank > 1)::text
         || ' superseded visits, and ' ||
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE new_plot_id IS NULL)::text || ' waiting on their plot'
) z ORDER BY "#";
