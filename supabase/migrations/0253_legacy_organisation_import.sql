-- ════════════════════════════════════════════════════════════════════
--  0253 — somewhere to put the original app's Customers and Branches
-- ════════════════════════════════════════════════════════════════════
--
-- The first stage of the migration, and the one the others wait on. The
-- original app had
--
--   Customer  →  has many  →  Customer_Branch
--
-- and this one has
--
--   Organisation  →  has many  →  Organisation_Branch
--                 →  has many  →  Organisation_Contact
--
-- with an Organisation_Type saying what kind of business it is. A
-- customer is type 1, "Customer (Housing Developer)".
--
-- ── Why this goes first ──
--
-- Because the contract import resolves its customer through these rows.
-- Measured on the real exports, 1,926 contracts resolve like this:
--
--   old Branch_ID, an exact key giving branch AND organisation   1,036
--   old Customer_ID, an exact key giving the organisation          516
--   the Audacia code against the old Branch_Ref                     40
--   the Audacia code against the old Customer_Ref                   58
--   nothing to match on                                            276
--
-- 1,552 of 1,926 on exact primary keys, and 1,036 of those land on a
-- SPECIFIC branch rather than needing one picked by hand. None of it
-- works until the organisations exist, which is why 0249 put
-- Legacy_Customer_ID on Organisation and Legacy_Branch_ID on
-- Organisation_Branch, both with partial unique indexes.
--
-- ── What the measurements settled ──
--
-- 509 old customers, 623 old branches, against 419 organisations that
-- already exist here - of which only 14 hold a customer role and 382
-- are Local Authorities.
--
--   * 496 of the 509 need creating. 13 already exist under exactly the
--     same name, and there are ZERO duplicate names among the 509, so
--     an exact name match is unambiguous where it applies.
--
--   * Payment_Terms_Days is 30 and Letter_Grace_Days is 15 on every one
--     of the 623 branches. A single constant carries no information -
--     they are defaults nobody ever changed - so they are not carried
--     over and nothing is lost. That is measured, not assumed.
--
--   * The four old address lines collapse cleanly. After discarding
--     'TBC' (5 rows), every branch has either NO address (251) or two
--     or more lines (372) - not one in between. So the last non-empty
--     line is the town and the earlier ones are the street address,
--     with no edge case: Leyland, Newcastle Upon Tyne, Ashington,
--     Leicester and Wigan all land correctly as towns.
--
--   * County is set on 372 branches and Organisation_Branch has no
--     County column. The ORGANISATION does, so the head office's county
--     lands there and is not lost.
--
-- Every column is text, for the same reason as 0248: a CSV load that
-- fails halfway on a bad value leaves a mess, and '' is not a date or a
-- number. Converting happens at the point of insert.

CREATE TABLE IF NOT EXISTS "Legacy_Customer_Import" (
  "Legacy_Customer_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Customer_ID"               text,
  "Customer_Name"             text,
  /* The Audacia code at customer level - 'PHP01', 'ROW01'. Filled on
     478 of the 509. This is what ends up on the customer role's
     Reference, which is where 0249 looks for it. */
  "Customer_Ref"              text,
  /* A person's name, no more - 285 of the 509 have one. There is no
     email or phone beside it in the old table. */
  "Customer_Contact"          text
);

COMMENT ON TABLE "Legacy_Customer_Import" IS
  'Raw rows from the original app''s Customer export, as text. Safe to '
  'empty once the import is done and checked.';

CREATE INDEX IF NOT EXISTS "Legacy_Customer_Import_ID_IDX"
  ON "Legacy_Customer_Import" ((NULLIF(btrim("Customer_ID"), '')::bigint));

CREATE TABLE IF NOT EXISTS "Legacy_Branch_Import" (
  "Legacy_Branch_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Branch_ID"               text,
  "Customer_ID"             text,
  "Branch_Name"             text,
  /* 437 of 623 are the head office. The organisation takes its address
     from that one. */
  "Head_Office"             text,
  "Address1"                text,
  "Address2"                text,
  "Address3"                text,
  "Address4"                text,
  "County"                  text,
  "Postcode"                text,
  /* The Audacia code at BRANCH level. Filled on 434 of 623, and 274 of
     the 537 codes in the contract export match one. Kept for the
     fallback route, not written anywhere on the new side - a branch has
     no reference column, and inventing one for a code that only an
     import reads would be a column nobody maintains. */
  "Branch_Ref"              text,
  /* 30 and 15 on every row. Staged so the file loads as it stands, and
     deliberately not carried any further. */
  "Payment_Terms_Days"      text,
  "Letter_Grace_Days"       text
);

COMMENT ON TABLE "Legacy_Branch_Import" IS
  'Raw rows from the original app''s Customer_Branch export, as text.';

CREATE INDEX IF NOT EXISTS "Legacy_Branch_Import_Cust_IDX"
  ON "Legacy_Branch_Import" ((NULLIF(btrim("Customer_ID"), '')::bigint));
CREATE INDEX IF NOT EXISTS "Legacy_Branch_Import_ID_IDX"
  ON "Legacy_Branch_Import" ((NULLIF(btrim("Branch_ID"), '')::bigint));

-- ── What each staged customer resolves to ────────────────────────────
--
-- A view, so it re-reads the current Organisation rows every time. Fix a
-- name, look again, and the answer has moved.
--
-- Two routes, in order:
--
--   1. Legacy_Customer_ID, where a previous run already claimed it.
--      This is what makes the import idempotent.
--   2. An exact name match, case-insensitive and trimmed. Allowed here
--      and nowhere else in this migration chain because it was measured
--      safe: zero duplicate names among the 509, so a match is one
--      organisation or none. The contract import refuses name matching
--      for the customer precisely because attaching a project to the
--      wrong builder is invisible - but that is matching a SITE's
--      customer, where this is matching a company to itself.

-- CASCADE, because the ten-customer trial builds "Trial_Ten_Customers"
-- on top of this one. Without it, re-running 0253 after the trial hits
--
--   ERROR: cannot drop view "Legacy_Organisation_Resolved" because
--          other objects depend on it
--   DETAIL: view "Trial_Ten_Customers" depends on it
--
-- which is exactly when you most want to re-run it: after the trial has
-- shown you something that needs changing. The trial rebuilds its own
-- view at the top of its part 1, so nothing is lost.
DROP VIEW IF EXISTS "Legacy_Organisation_Resolved" CASCADE;

CREATE VIEW "Legacy_Organisation_Resolved" AS
SELECT i.*,
       NULLIF(btrim(i."Customer_ID"), '')::bigint AS legacy_id,
       btrim(COALESCE(i."Customer_Name", ''))     AS clean_name,
       COALESCE(
         (SELECT o."Organisation_ID" FROM "Organisation" o
           WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint),
         (SELECT o."Organisation_ID" FROM "Organisation" o
           WHERE upper(btrim(o."Name")) = upper(btrim(COALESCE(i."Customer_Name", '')))
             AND btrim(COALESCE(i."Customer_Name", '')) <> ''
           LIMIT 1)
       ) AS organisation_id,
       CASE
         WHEN (SELECT o."Organisation_ID" FROM "Organisation" o
                WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint)
              IS NOT NULL                       THEN 'already imported'
         WHEN (SELECT o."Organisation_ID" FROM "Organisation" o
                WHERE upper(btrim(o."Name")) = upper(btrim(COALESCE(i."Customer_Name", '')))
                  AND btrim(COALESCE(i."Customer_Name", '')) <> '' LIMIT 1)
              IS NOT NULL                       THEN 'matches one already here by name'
         WHEN btrim(COALESCE(i."Customer_Name", '')) = ''
                                                THEN 'no name - cannot create'
         ELSE                                        'will be created'
       END AS verdict
  FROM "Legacy_Customer_Import" i;

COMMENT ON VIEW "Legacy_Organisation_Resolved" IS
  'Each staged customer with the organisation it matches, by legacy key '
  'first and then by an exact name. verdict says which.';

-- ── The branch address, worked out in one place ───────────────────────
--
-- So the import and the report cannot disagree about what an address
-- collapses to, and so the rule can be read and argued with on its own.

-- CASCADE for the same reason, in case anything is built on this one.
DROP VIEW IF EXISTS "Legacy_Branch_Resolved" CASCADE;

CREATE VIEW "Legacy_Branch_Resolved" AS
WITH cleaned AS (
  SELECT b.*,
         NULLIF(btrim(b."Branch_ID"), '')::bigint   AS legacy_branch_id,
         NULLIF(btrim(b."Customer_ID"), '')::bigint AS legacy_customer_id,
         /* 'TBC' is a placeholder somebody typed, not an address. Five
            branches carry it as their only line. */
         ARRAY(SELECT v FROM unnest(ARRAY[b."Address1", b."Address2",
                                          b."Address3", b."Address4"]) v
                WHERE btrim(COALESCE(v, '')) <> ''
                  AND upper(btrim(v)) NOT IN ('TBC', 'N/A', 'NA', 'TBA',
                                              'UNKNOWN', 'NONE', '-', '.')
              ) AS lines
    FROM "Legacy_Branch_Import" b
)
SELECT c.*,
       /* Everything but the last line. Null rather than '' where there
          is nothing, so an empty address is empty and not blank text. */
       NULLIF(array_to_string(
         c.lines[1:greatest(COALESCE(array_length(c.lines, 1), 0) - 1, 0)], ', '
       ), '')                                                    AS address_1,
       /* The last line is the town. Only where there are two or more:
          with one line it would be a street called a town, and the
          measurement says there are none of those anyway. */
       CASE WHEN COALESCE(array_length(c.lines, 1), 0) >= 2
            THEN c.lines[array_length(c.lines, 1)] END           AS town,
       NULLIF(btrim(COALESCE(c."Postcode", '')), '')             AS postcode,
       NULLIF(btrim(COALESCE(c."County", '')), '')               AS county,
       lower(btrim(COALESCE(c."Head_Office", ''))) IN ('true', 't', '1', 'yes')
                                                                 AS is_head_office,
       (SELECT o."Organisation_ID" FROM "Organisation" o
         WHERE o."Legacy_Customer_ID" = c.legacy_customer_id)     AS organisation_id,
       (SELECT b2."Organisation_Branch_ID" FROM "Organisation_Branch" b2
         WHERE b2."Legacy_Branch_ID" = c.legacy_branch_id)        AS existing_branch_id,
       /* ── The name to insert, unique within the organisation ──

          "Organisation_Branch" is UNIQUE on (Organisation_ID,
          Branch_Name). Reported from use:

            ERROR: 23505: duplicate key value violates unique constraint
            "Organisation_Branch_Organisation_ID_Branch_Name_key"

          One pair in the whole export collides - Bellway Homes has two
          branches both called "West Midlands, Staffordshire" - and one
          is enough to abort the insert for all 623.

          An unnamed branch takes 'Head Office' or 'Branch', which is
          what the screens sort and pick by; a blank cannot be chosen
          from a list. Where that or a real name repeats, the second and
          later ones carry something to tell them apart: the town, then
          the postcode, then the old Branch_ID. Bellway's two have
          neither town nor postcode, so they become "... (202)" and
          "... (203)" - ugly but true, and a person can rename them. */
       CASE WHEN row_number() OVER (
                   PARTITION BY c.legacy_customer_id,
                     COALESCE(NULLIF(btrim(COALESCE(c."Branch_Name", '')), ''),
                              CASE WHEN lower(btrim(COALESCE(c."Head_Office", '')))
                                        IN ('true', 't', '1', 'yes')
                                   THEN 'Head Office' ELSE 'Branch' END)
                   ORDER BY c.legacy_branch_id) = 1
            THEN COALESCE(NULLIF(btrim(COALESCE(c."Branch_Name", '')), ''),
                          CASE WHEN lower(btrim(COALESCE(c."Head_Office", '')))
                                    IN ('true', 't', '1', 'yes')
                               THEN 'Head Office' ELSE 'Branch' END)
            ELSE COALESCE(NULLIF(btrim(COALESCE(c."Branch_Name", '')), ''),
                          CASE WHEN lower(btrim(COALESCE(c."Head_Office", '')))
                                    IN ('true', 't', '1', 'yes')
                               THEN 'Head Office' ELSE 'Branch' END)
                 || ' (' || COALESCE(
                      NULLIF(btrim(COALESCE(c."Address4", c."Address3",
                                            c."Address2", '')), ''),
                      NULLIF(btrim(COALESCE(c."Postcode", '')), ''),
                      c.legacy_branch_id::text) || ')'
       END                                                        AS branch_name
  FROM cleaned c;

COMMENT ON VIEW "Legacy_Branch_Resolved" IS
  'Each staged branch with its address collapsed to Address_1 and Town, '
  'and the organisation it belongs to once that has been imported.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'Organisation'
                    AND column_name = 'Legacy_Customer_ID') THEN
    RAISE EXCEPTION '0249 has not run - Organisation.Legacy_Customer_ID is '
      'missing, and without it this import cannot be idempotent.';
  END IF;
  RAISE NOTICE 'Staging is ready. Load the Customer CSV into '
    'Legacy_Customer_Import and the Customer_Branch CSV into '
    'Legacy_Branch_Import, then run import_legacy_organisations.sql '
    'part 1 to see what matches before anything is created.';
END $$;
