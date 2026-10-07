-- ════════════════════════════════════════════════════════════════════
-- 0258 — the adopter comes from the contract's IDNO
-- ════════════════════════════════════════════════════════════════════
--
-- Reported: the adopters on AP1989 are GTC and IWNL, not United
-- Utilities. They are. The import was reading the wrong field.
--
-- ── What the import was doing ──
--
-- `Legacy_Connection_Import."Adopter"` is free text on the connection,
-- and 0256 built an alias map to resolve it. It resolved cleanly —
-- every one of 25,590 — which looked like success and was not, because
-- the field itself is wrong.
--
-- The adopter is recorded on the CONTRACT, once per utility:
-- `Legacy_Project_Import` carries Electric_IDNO_ID, Gas_IDNO_ID and
-- Water_IDNO_ID. Contract 326 (AP1989) reads 4, 4, 6 — GTC on
-- electric and gas, Independent Water Networks on water, exactly as
-- reported.
--
-- The text field does not merely lag it. Correlated across every
-- contract:
--
--     IDNO  6  water   IWNL 2,385   but United Utilities 1,056
--     IDNO 21  water   United Utilities 768   but IWNL 93
--     IDNO 24  water   United Utilities 763   but ESP Water 321
--
-- A thousand connections on IWNL contracts carry "United Utilities" in
-- the text. It was never maintained. Two other places were checked and
-- ruled out first, so nobody re-checks them: the connection's own
-- IDNO_ID is carried by 125 rows of 33,475, and the plot export's
-- per-utility IDNO columns are empty on all 333,950 plots.
--
-- ── Why the IDNO table was asked for rather than inferred ──
--
-- The same correlation that found the fault could have named the ids,
-- and it would have been wrong twice: it put IDNO 34 at Severn Trent
-- (it is Dee Valley Water) and IDNO 42 at IWNL on a majority vote (it
-- is Yorkshire Water). A field that disagrees with itself a thousand
-- times is not a source for the names it disagrees about.
--
-- ── What this does ──
--
-- 1. Creates the three operators the old register has and the new one
--    does not: Dee Valley Water, Northern Gas Networks, Western Power
--    Distribution. Marked for review.
--
--    Western Power Distribution is kept as itself rather than folded
--    into National Grid Electricity Distribution. They are the same
--    company under two names in the world; whether they are one row
--    here is an editorial decision about the register, and a migration
--    that quietly makes it has destroyed the evidence for making it
--    differently. 102 connections.
--
-- 2. Maps every IDNO that appears on a connection to an organisation,
--    by name, under Kind = 'idno'.
--
-- 3. Teaches the view to read it: the contract's IDNO for that
--    connection's utility, falling back to the old name-based chain
--    only where the contract names no IDNO at all — which is 9,174
--    connections, 27 per cent, so the fallback is not a corner case.
--
-- ── What is deliberately left unmapped ──
--
-- IDNO 35, "National Grid", one connection. The only organisation of
-- that name in the register is a CUSTOMER; the operator is called
-- National Grid Electricity Distribution. One row is not worth
-- guessing over and the report below names it.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

-- ── The index the view will lean on ───────────────────────────────
--
-- The adopter lookup walks connection -> plot -> project -> contract
-- on every row. Without this the contract lookup is a sequential scan
-- of Legacy_Project_Import per connection: 33,475 x 5,727.

CREATE INDEX IF NOT EXISTS legacy_project_import_contract_idx
  ON "Legacy_Project_Import" ((NULLIF(btrim("Contract_ID"), '')::bigint));


-- ── Step 1: the three operators the register does not have ──────────

DO $$
DECLARE org record; oid bigint; made int := 0; rk text; uid bigint;
  have_ou boolean := to_regclass('"Organisation_Utility"') IS NOT NULL;
BEGIN
  FOR org IN
    SELECT * FROM (VALUES
      ('Dee Valley Water', ARRAY['wu'], ARRAY['Water'],
       'Created by the connections import for IDNO 34 (186 connections). Check the legal name.'),
      ('Northern Gas Networks', ARRAY['gt'], ARRAY['Gas'],
       'Created by the connections import for IDNO 33 (63 connections).'),
      ('Western Power Distribution', ARRAY['dno'], ARRAY['Electric'],
       'Created by the connections import for IDNO 47 (102 connections). The same company as National Grid Electricity Distribution under its former name — kept separate here because merging them is a decision about the register, not something a migration should make quietly.')
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

  INSERT INTO "Legacy_Migration_Log" VALUES ('0258 organisations', 'ok',
    made::text || ' created')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "Legacy_Migration_Log" VALUES ('0258 organisations', 'FAILED',
    SQLERRM || ' - 351 connections would import without an adopter')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
END $$;


-- ── Step 2: IDNO id -> organisation, by name ────────────────────────
--
-- Every id that actually appears on a connection. The name on the left
-- is the old register's, verbatim; the one on the right is the new
-- register's. Where they differ it is a suffix or a trading name, and
-- the pairing is written out rather than derived, because "drop Ltd
-- and match" would also pair Dee Valley Water with nothing and say so
-- silently.

DO $$
DECLARE ok_n int; miss text;
BEGIN
  INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
  SELECT 'idno', v.id, o."Organisation_ID",
         'IDNO ' || v.id || ' ' || v.old_name || ' -> ' || v.new_name
    FROM (VALUES
      ('4',  'GTC',                            'GTC'),
      ('6',  'Independent Water Networks Ltd', 'Independent Water Networks'),
      ('7',  'Last Mile',                      'Last Mile'),
      ('8',  'MUA Group',                      'MUA'),
      ('15', 'Welsh Water',                    'Welsh Water'),
      ('18', 'MUA Water Limited',              'MUA'),
      ('19', 'ES Pipelines Ltd',               'ES Pipelines'),
      ('21', 'United Utilities Water',         'United Utilities'),
      ('22', 'Icosa',                          'Icosa Water'),
      ('24', 'ESP Water Ltd',                  'ESP Water'),
      ('31', 'ESP Electricity Ltd',            'ESP Electricity'),
      ('32', 'Cadent Gas Limited',             'Cadent'),
      ('33', 'Northern Gas Networks Ltd',      'Northern Gas Networks'),
      ('34', 'Dee Valley Water',               'Dee Valley Water'),
      ('37', 'MUA Electricity Limited',        'MUA'),
      ('38', 'South Staffordshire Water',      'South Staffordshire Water'),
      ('42', 'Yorkshire Water',                'Yorkshire Water'),
      ('43', 'MUA Gas Limited',                'MUA'),
      ('44', 'Northern Powergrid',             'Northern Powergrid'),
      ('46', 'Northumbrian Water',             'Northumbrian Water'),
      ('47', 'Western Power Distribution',     'Western Power Distribution')
    ) AS v(id, old_name, new_name)
    JOIN "Organisation" o ON upper(btrim(o."Name")) = upper(v.new_name)
  ON CONFLICT ("Kind", "Legacy_ID") DO UPDATE
    SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

  SELECT count(*) INTO ok_n FROM "Legacy_Lookup_Map"
   WHERE "Kind" = 'idno' AND "New_ID" IS NOT NULL;

  INSERT INTO "Legacy_Migration_Log" VALUES ('0258 idno map', 'ok',
    ok_n::text || ' of 21 IDNOs point at an organisation. Any short of '
    || '21 means an organisation is missing and those connections fall '
    || 'back to the text name.')
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
EXCEPTION WHEN OTHERS THEN
  INSERT INTO "Legacy_Migration_Log" VALUES ('0258 idno map', 'FAILED', SQLERRM)
  ON CONFLICT ("Step") DO UPDATE
    SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";
END $$;


-- ── Step 3: the view reads the contract ─────────────────────────────
--
-- Order matters and is the whole correction: the contract's IDNO
-- first, the text second. The text is kept as a fallback rather than
-- dropped because 9,174 connections sit on contracts that name no IDNO
-- for their utility, and a wrong-ish name is better than nothing on a
-- row where the right source is silent. Where both speak, the contract
-- wins.
--
-- `adopter_source` is new and says which answered, so the import can be
-- audited row by row instead of by total.

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
       /* The contract's IDNO for this utility. The authority. */
       ( SELECT m."New_ID"
           FROM "Project" prj
           JOIN "Legacy_Project_Import" lpi
             ON NULLIF(btrim(lpi."Contract_ID"), '')::bigint = prj."Legacy_Contract_ID"
           JOIN "Legacy_Lookup_Map" m
             ON m."Kind" = 'idno'
            AND m."Legacy_ID" = CASE btrim(c."Utility_ID")
                  WHEN '1' THEN NULLIF(btrim(lpi."Electric_IDNO_ID"), '')
                  WHEN '2' THEN NULLIF(btrim(lpi."Gas_IDNO_ID"), '')
                  WHEN '3' THEN NULLIF(btrim(lpi."Water_IDNO_ID"), '')
                END
          WHERE prj."Project_ID" = p."Project_ID"
          LIMIT 1),
       /* Only then the text, and only where the contract is silent. */
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
     row_number() OVER (
       PARTITION BY NULLIF(btrim(c."Plot_ID"), ''),
                    NULLIF(btrim(c."Utility_ID"), '')
       ORDER BY (NULLIF(btrim(c."Connection_Date"), '') IS NOT NULL) DESC,
                NULLIF(btrim(c."Connection_Date"), '') DESC NULLS LAST,
                NULLIF(btrim(c."Plot_Utility_ID"), '')::bigint DESC
     ) AS dup_rank,
     /* Appended, not slotted in beside the adopter where it belongs:
        CREATE OR REPLACE VIEW can add columns to the end and nothing
        else, so a new column in the middle is "cannot change name of
        view column" and a DROP ... CASCADE to get round it would take
        anything built on this view with it. */
     CASE
       WHEN EXISTS ( SELECT 1
           FROM "Project" prj
           JOIN "Legacy_Project_Import" lpi
             ON NULLIF(btrim(lpi."Contract_ID"), '')::bigint = prj."Legacy_Contract_ID"
           JOIN "Legacy_Lookup_Map" m
             ON m."Kind" = 'idno'
            AND m."Legacy_ID" = CASE btrim(c."Utility_ID")
                  WHEN '1' THEN NULLIF(btrim(lpi."Electric_IDNO_ID"), '')
                  WHEN '2' THEN NULLIF(btrim(lpi."Gas_IDNO_ID"), '')
                  WHEN '3' THEN NULLIF(btrim(lpi."Water_IDNO_ID"), '')
                END
          WHERE prj."Project_ID" = p."Project_ID")
         THEN 'contract IDNO'
       WHEN COALESCE(btrim(c."Adopter"), '') <> '' THEN 'adopter text'
       ELSE 'neither'
     END AS adopter_source
    FROM "Legacy_Connection_Import" c
    LEFT JOIN "Plot" p
      ON p."Legacy_Plot_ID" = NULLIF(btrim(c."Plot_ID"), '')::bigint;


-- ── What happened ───────────────────────────────────────────────────

SELECT * FROM (
  SELECT 0::numeric AS "#", l."Step" AS "Step", l."State" AS "State",
         l."Detail" AS "Detail"
    FROM "Legacy_Migration_Log" l
   WHERE l."Step" LIKE '0258%'

  UNION ALL
  SELECT 1, '1 where the adopter comes from', 'count',
         COALESCE((SELECT string_agg(t.src || ': ' || t.n, ', ' ORDER BY t.src)
                     FROM (SELECT adopter_source AS src, count(*)::text AS n
                             FROM "Legacy_Connection_Resolved"
                            GROUP BY adopter_source) t), 'none')

  UNION ALL
  SELECT 2, '2 connections that now resolve', 'count',
         (SELECT count(*) FROM "Legacy_Connection_Resolved"
           WHERE adopter_organisation_id IS NOT NULL)::text
         || ' of ' || (SELECT count(*) FROM "Legacy_Connection_Import")::text

  UNION ALL
  SELECT 3, '3 the contract names an IDNO this map cannot place',
         'look at these',
         COALESCE((SELECT string_agg(DISTINCT x.id, ', ') FROM (
           SELECT CASE btrim(c."Utility_ID")
                    WHEN '1' THEN NULLIF(btrim(lpi."Electric_IDNO_ID"), '')
                    WHEN '2' THEN NULLIF(btrim(lpi."Gas_IDNO_ID"), '')
                    WHEN '3' THEN NULLIF(btrim(lpi."Water_IDNO_ID"), '')
                  END AS id
             FROM "Legacy_Connection_Import" c
             JOIN "Plot" p ON p."Legacy_Plot_ID" = NULLIF(btrim(c."Plot_ID"), '')::bigint
             JOIN "Project" prj ON prj."Project_ID" = p."Project_ID"
             JOIN "Legacy_Project_Import" lpi
               ON NULLIF(btrim(lpi."Contract_ID"), '')::bigint = prj."Legacy_Contract_ID") x
          WHERE x.id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "Legacy_Lookup_Map" m
                             WHERE m."Kind" = 'idno' AND m."Legacy_ID" = x.id
                               AND m."New_ID" IS NOT NULL)),
          'none - every IDNO on a connection resolves')

  UNION ALL
  SELECT 4, '4 AP1989, the contract this started with', 'check this',
         COALESCE((SELECT string_agg(DISTINCT u."Utility" || ' -> ' || o."Name", ', ')
            FROM "Legacy_Connection_Resolved" r
            JOIN "Plot" pl ON pl."Plot_ID" = r.new_plot_id
            JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
            JOIN "Organisation" o ON o."Organisation_ID" = r.adopter_organisation_id
            LEFT JOIN "Utility" u ON u."Utility_ID" = COALESCE(
              (SELECT k."New_ID" FROM "Legacy_Lookup_Map" k
                WHERE k."Kind" = 'utility' AND k."Legacy_ID" = btrim(r."Utility_ID")),
              NULLIF(btrim(r."Utility_ID"), '')::bigint)
           WHERE btrim(pr."AP_Number") = 'AP1989'),
          'nothing resolves on AP1989 - that is wrong, stop here')
) z ORDER BY "#", "Step";
