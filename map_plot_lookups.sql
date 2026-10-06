-- ════════════════════════════════════════════════════════════════════
--  The plot lookups: old ids to new ones
-- ════════════════════════════════════════════════════════════════════
--
-- Run this before importing the plots. Three parts, each one statement,
-- so paste them one at a time.
--
-- ── Everything is matched by CODE and by NAME, never by id ──
--
-- This is not a style preference here, it is the difference between a
-- correct import and a catastrophic one. The two systems reuse the same
-- id numbers for different things:
--
--     old 1  is 1BD        new 1  is 3BS
--     old 12 is 3BS        new 3  is 1BD
--
-- So carrying the ids across would turn 22,960 one-bed dwellings into
-- three-bed semis and 52,429 three-bed semis into one-beds, silently,
-- with every number in the system still adding up.
--
-- The heat sources are worse: the old ids and the new ids line up on
-- nothing at all.
--
--     old 1  Gas Heated                             new 1  ASHP
--     old 2  Electric Direct Heated (Unconstrained) new 2  GSHP
--     old 3  Electric Heated by Heat Pump           new 3  Gas boiler
--                                                   new 4  Electric
--                                                   new 5  District heating
--
-- Carried across by id, 164,406 gas-heated plots become air source heat
-- pumps.

-- ────────────────────────────────────────────────────────────────────
--  PART 1 — two property configs the new system is missing
-- ────────────────────────────────────────────────────────────────────
--
-- 6BD (108 plots) and 6BS (2 plots) are real dwellings; the new table
-- simply stops at five bedrooms. Added rather than left empty, per your
-- decision.
--
-- The other ten unmatched codes are NOT added: COMM, OTHER, PS1, PS3,
-- FP1, FP3, TS1, TS3, LLS1, LLS3. Every one carries
-- "AUTO-IMPORTED FROM SITE SUMMARY — review" in the old system, where
-- the review never happened. 2,227 plots land with no config and
-- somebody decides what they should be.
--
-- Property_Type_ID is copied from an existing row of the same kind —
-- 6BD takes 4BD's type, 6BS takes 4BS's — so this works without
-- knowing what the type ids are. Guarded on the column existing at all,
-- because the new table is not in any committed migration either.

-- ── Written to not care how the id column is defined ──
--
-- The first version assumed Property_Config_ID fills itself and let the
-- insert leave it out. Against a table where it is a plain column that
-- fails with
--
--     null value in column "Property_Config_ID" violates not-null
--
-- which is what happened the first time this ran. Whether that column is
-- an identity, a serial with a default, or a plain bigint somebody
-- assigns by hand is not in any committed migration, so the script asks
-- the catalogue and supplies an id only where it has to.

DO $$
DECLARE
  has_type   boolean;
  self_fills boolean;
  cols       text;
  idsel      text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'Property_Config'
                    AND column_name = 'Property_Type_ID')
    INTO has_type;

  SELECT (c.is_identity = 'YES' OR c.column_default IS NOT NULL)
    INTO self_fills
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'Property_Config'
     AND c.column_name = 'Property_Config_ID';

  IF self_fills THEN
    cols  := '"Bedrooms", "Code"';
    idsel := '6, v.code';
  ELSE
    cols  := '"Property_Config_ID", "Bedrooms", "Code"';
    idsel := '(SELECT COALESCE(max(z."Property_Config_ID"), 0) FROM "Property_Config" z)'
             || ' + row_number() OVER (ORDER BY v.code), 6, v.code';
  END IF;

  IF has_type THEN
    cols  := cols  || ', "Property_Type_ID"';
    idsel := idsel || ', (SELECT x."Property_Type_ID" FROM "Property_Config" x'
                   || '    WHERE x."Code" = v.like_code LIMIT 1)';
  END IF;

  EXECUTE format($q$
    INSERT INTO "Property_Config" (%s)
    SELECT %s
      FROM (VALUES ('6BD', '4BD'), ('6BS', '4BS')) AS v(code, like_code)
     WHERE NOT EXISTS (SELECT 1 FROM "Property_Config" y WHERE y."Code" = v.code)
  $q$, cols, idsel);
END $$;

-- ────────────────────────────────────────────────────────────────────
--  PART 2 — the map
-- ────────────────────────────────────────────────────────────────────
--
-- All 35 old configs and all 3 old heat sources. A code with no match
-- writes NULL rather than guessing, and part 3 lists those.
--
-- Safe to run again: keyed on (Kind, Legacy_ID) and upserted.

INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
SELECT 'property_config', v.old_id,
       (SELECT pc."Property_Config_ID" FROM "Property_Config" pc
         WHERE pc."Code" = v.code),
       v.note
  FROM (VALUES
    ('1', '1BD', '1BD — 22,960 plots'),
    ('2', '1BF', '1BF — 4,248 plots'),
    ('3', '2BS', '2BS — 15,404 plots'),
    ('4', '1BB', '1BB — 91 plots'),
    ('6', '2BB', '2BB — 1,720 plots'),
    ('7', '2BF', '2BF — 5,060 plots'),
    ('8', '2BT', '2BT — 4,816 plots'),
    ('9', '1BS', '1BS — 583 plots'),
    ('10', '2BD', '2BD — 506 plots'),
    ('11', '3BD', '3BD — 14,935 plots'),
    ('12', '3BS', '3BS — 52,429 plots'),
    ('13', '4BS', '4BS — 5,952 plots'),
    ('14', '4BD', '4BD — 31,355 plots'),
    ('15', '5BD', '5BD — 4,025 plots'),
    ('16', '6BD', '6BD — 108 plots'),
    ('18', '3BF', '3BF — 285 plots'),
    ('19', '3BT', '3BT — 4,007 plots'),
    ('20', '3BB', '3BB — 286 plots'),
    ('21', '1BT', '1BT — 176 plots'),
    ('22', 'PS1', 'PS1 — 6 plots'),
    ('23', 'FP3', 'FP3 — 2 plots'),
    ('24', 'OTHER', 'OTHER — 486 plots'),
    ('25', '5BT', '5BT — 151 plots'),
    ('26', '4BB', '4BB — 33 plots'),
    ('27', '4BT', '4BT — 613 plots'),
    ('28', 'COMM', 'COMM — 1,606 plots'),
    ('29', '6BS', '6BS — 2 plots'),
    ('30', 'TS3', 'TS3 — 17 plots'),
    ('31', 'LLS1', 'LLS1 — 28 plots'),
    ('32', 'FP1', 'FP1 — 41 plots'),
    ('33', '5BS', '5BS — 256 plots'),
    ('34', 'TS1', 'TS1 — 26 plots'),
    ('35', 'PS3', 'PS3 — 9 plots'),
    ('36', '4BF', '4BF — 11 plots'),
    ('37', 'LLS3', 'LLS3 — 6 plots')
  ) AS v(old_id, code, note)
    ON CONFLICT ("Kind", "Legacy_ID")
    DO UPDATE SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

-- ────────────────────────────────────────────────────────────────────
--  PART 2b — the heat sources
-- ────────────────────────────────────────────────────────────────────
--
-- Matched on meaning, because the names do not correspond:
--
--   Gas Heated                             -> Gas boiler      164,406 plots
--   Electric Direct Heated (Unconstrained) -> Electric          1,088 plots
--   Electric Heated by Heat Pump           -> ASHP             30,210 plots
--
-- The third is the one that was a decision rather than a translation.
-- The old system has ONE heat pump; the new one splits air source from
-- ground source, and nothing in the old data says which. You chose
-- ASHP, as the common case in volume housing. It is on 30,210 plots and
-- it feeds the load calculations, so it is worth knowing it was a
-- choice and not something the data told us.

INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
SELECT 'heat_source', v.old_id,
       (SELECT hs."Heat_Source_ID" FROM "Heat_Source" hs
         WHERE hs."Heat_Source" = v.new_name),
       v.note
  FROM (VALUES
    ('1', 'Gas boiler', 'Gas Heated -> Gas boiler. 164,406 plots.'),
    ('2', 'Electric',   'Electric Direct Heated (Unconstrained) -> Electric. 1,088 plots.'),
    ('3', 'ASHP',       'Electric Heated by Heat Pump -> ASHP. 30,210 plots. '
                        || 'A DECISION, not a translation: the old system has one '
                        || 'heat pump and the new one splits ASHP from GSHP.')
  ) AS v(old_id, new_name, note)
    ON CONFLICT ("Kind", "Legacy_ID")
    DO UPDATE SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

-- ────────────────────────────────────────────────────────────────────
--  PART 3 — check it before importing
-- ────────────────────────────────────────────────────────────────────
--
-- One result set. Every old id, what it becomes, and how many plots
-- ride on it. "NOT MAPPED" means those plots import with that column
-- empty — recoverable, but see it first.

SELECT m."Kind"                                   AS kind,
       m."Legacy_ID"                              AS old_id,
       COALESCE(pc."Code", hs."Heat_Source",
                'NOT MAPPED')                     AS becomes,
       (SELECT count(*) FROM "Legacy_Plot_Import" i
         WHERE btrim(CASE WHEN m."Kind" = 'property_config'
                          THEN i."Property_Config_ID"
                          ELSE i."Heat_Source_ID" END) = m."Legacy_ID")
                                                  AS plots,
       m."Note"                                   AS note
  FROM "Legacy_Lookup_Map" m
  LEFT JOIN "Property_Config" pc
         ON pc."Property_Config_ID" = m."New_ID" AND m."Kind" = 'property_config'
  LEFT JOIN "Heat_Source" hs
         ON hs."Heat_Source_ID" = m."New_ID" AND m."Kind" = 'heat_source'
 WHERE m."Kind" IN ('property_config', 'heat_source')
 ORDER BY m."Kind", 4 DESC;
