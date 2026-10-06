-- ════════════════════════════════════════════════════════════════════
--  A ten-customer trial, to see how they land before doing all 509
-- ════════════════════════════════════════════════════════════════════
--
-- Run 0249 and 0253 first, and load both CSVs into
-- "Legacy_Customer_Import" and "Legacy_Branch_Import". Loading them
-- creates nothing — the staging tables are inert, and the full import
-- is a separate decision.
--
-- Then run this. It imports ten customers, their branches and their
-- contacts, and nothing else. Part 4 takes it all back out again.
--
-- ── Why these ten ──
--
-- Not the first ten by id, which would all be the same easy shape.
-- These were chosen so the trial exercises every case that could go
-- wrong, and so the ones that carry real volume are the ones you look
-- at:
--
--   518  Persimmon Homes        16 branches, every one with a town.
--                               The extreme case for "which branch?"
--   681  Taylor Wimpey          12 branches, 3 of them with no town,
--                               and it MATCHES one already here
--   774  Bellway Homes           8 branches, no Audacia code at all,
--                               and two branches share a name
--   769  Countryside Properties  6 branches, MATCHES one already here
--    73  BDW Trading Limited     6 branches named "Redrow - ...", only
--                               3 with a town
--   647  Story Homes             3 branches, 77 contracts behind it —
--                               the most of any customer
--   577  Rowland Homes Ltd       1 branch, MATCHES one already here
--   197  Eccleston Homes         1 branch, straightforward
--   551  R.P Tyson Construction  1 branch, 75 contracts
--     4  *** DO NOT TENDER       the one name that is an instruction
--        FOR***PH Property       rather than a company, and its branch
--        Holdings Ltd            has no address at all
--
-- Three of the ten match an organisation already here, so the claim
-- path runs as well as the create path. Change the list in 1.1 if you
-- would rather look at different ones.
--
-- ── What to look at afterwards ──
--
-- Open Admin → Organisations. Each of the ten should be there with its
-- branches under it, the head office's address on the company, and the
-- Audacia code on its Customer role. Persimmon should have sixteen
-- branches; PH Property Holdings should still carry its warning in its
-- name.

-- ────────────────────────────────────────────────────────────────────
--  PART 1 — what these ten will do
-- ────────────────────────────────────────────────────────────────────

-- 1.1 The ten, and what will happen to each. Read-only.
--
-- This list is the only place the ten are named. Everything below reads
-- it, so changing it here changes the whole trial.
CREATE OR REPLACE VIEW "Trial_Ten_Customers" AS
SELECT r.*
  FROM "Legacy_Organisation_Resolved" r
 WHERE btrim(r."Customer_ID") IN
       ('518', '681', '774', '769', '73', '647', '577', '197', '551', '4');

SELECT t."Customer_ID" AS old_id,
       left(t.clean_name, 36)                                   AS name,
       t.verdict,
       (SELECT count(*) FROM "Legacy_Branch_Resolved" b
         WHERE b.legacy_customer_id = t.legacy_id)              AS branches,
       (SELECT count(*) FROM "Legacy_Branch_Resolved" b
         WHERE b.legacy_customer_id = t.legacy_id
           AND b.town IS NOT NULL)                              AS with_a_town,
       COALESCE(NULLIF(btrim(t."Customer_Ref"), ''), '-')        AS audacia_code,
       CASE WHEN btrim(COALESCE(t."Customer_Contact", '')) <> ''
            THEN 'yes' ELSE '-' END                             AS has_a_contact
  FROM "Trial_Ten_Customers" t
 ORDER BY 4 DESC, 2;

-- 1.2 The branches, in full. Ten customers is few enough to read every
--     row, which is the point of a trial.
SELECT left(t.clean_name, 24)                                   AS customer,
       COALESCE(NULLIF(btrim(b."Branch_Name"), ''), '(unnamed)') AS branch,
       CASE WHEN b.is_head_office THEN 'HO' ELSE '' END          AS ho,
       left(COALESCE(b.address_1, '-'), 40)                      AS address_1,
       COALESCE(b.town, '-')                                     AS town,
       COALESCE(b.county, '-')                                   AS county,
       COALESCE(b.postcode, '-')                                 AS postcode
  FROM "Trial_Ten_Customers" t
  JOIN "Legacy_Branch_Resolved" b ON b.legacy_customer_id = t.legacy_id
 ORDER BY 1, b.is_head_office DESC, 2;

-- ────────────────────────────────────────────────────────────────────
--  PART 2 — import just those ten
-- ────────────────────────────────────────────────────────────────────

-- 2.1 Claim the ones already here. Only Legacy_Customer_ID: the name
--     and address belong to whoever has been maintaining them.
UPDATE "Organisation" o
   SET "Legacy_Customer_ID" = t.legacy_id
  FROM "Trial_Ten_Customers" t
 WHERE o."Organisation_ID" = t.organisation_id
   AND t.verdict = 'matches one already here by name'
   AND o."Legacy_Customer_ID" IS NULL;

-- 2.1b Fill what they are MISSING, and only that.
--
-- The first run of this trial showed why: the three claimed
-- organisations came out with no town and no county, because 2.1 will
-- not overwrite a maintained address and theirs were empty. COALESCE,
-- so a value somebody set is untouchable.
UPDATE "Organisation" o
   SET "Address_1" = COALESCE(o."Address_1", h.address_1),
       "Town"      = COALESCE(o."Town",      h.town),
       "County"    = COALESCE(o."County",    h.county),
       "Postcode"  = COALESCE(o."Postcode",  h.postcode)
  FROM "Trial_Ten_Customers" t
  LEFT JOIN LATERAL (
    SELECT b.address_1, b.town, b.county, b.postcode
      FROM "Legacy_Branch_Resolved" b
     WHERE b.legacy_customer_id = t.legacy_id
     ORDER BY b.is_head_office DESC, b.legacy_branch_id
     LIMIT 1
  ) h ON true
 WHERE o."Organisation_ID" = t.organisation_id
   AND o."Legacy_Customer_ID" = t.legacy_id
   /* Only where there is something to put in. Asking merely "is any
      column null" fired again on a second run for the two whose head
      office has no postcode either: it rewrote the same values and
      reported UPDATE 2, which reads as a change when nothing changed.
      Found by running it twice. */
   AND ((o."Address_1" IS NULL AND h.address_1 IS NOT NULL)
     OR (o."Town"      IS NULL AND h.town      IS NOT NULL)
     OR (o."County"    IS NULL AND h.county    IS NOT NULL)
     OR (o."Postcode"  IS NULL AND h.postcode  IS NOT NULL));

-- 2.1c And give an existing customer role its Audacia code where it has
--      none. Rowland Homes came out with no code although its
--      Customer_Ref is ROW01: it already held a customer role, so 2.3
--      skipped it, and Reference is what 0249 falls back to.
UPDATE "Organisation_Role" ro
   SET "Reference" = NULLIF(btrim(COALESCE(t."Customer_Ref", '')), '')
  FROM "Organisation" o, "Trial_Ten_Customers" t
 WHERE ro."Organisation_ID" = o."Organisation_ID"
   AND o."Legacy_Customer_ID" = t.legacy_id
   AND ro."Organisation_Type_ID" = (SELECT ty."Organisation_Type_ID"
                                      FROM "Organisation_Type" ty
                                     WHERE ty."Type_Key" = 'customer')
   AND btrim(COALESCE(ro."Reference", '')) = ''
   AND btrim(COALESCE(t."Customer_Ref", '')) <> '';

-- 2.2 Create the rest, taking the address from the head office so the
--     county is not lost.
INSERT INTO "Organisation" (
  "Name", "Address_1", "Address_2", "Town", "County", "Postcode",
  "Is_Active", "Legacy_Customer_ID", "Notes"
)
SELECT t.clean_name, h.address_1, NULL, h.town, h.county, h.postcode,
       true, t.legacy_id,
       'Imported from the original app''s Customer ' || t."Customer_ID"
       || '. Ten-customer trial.'
  FROM "Trial_Ten_Customers" t
  LEFT JOIN LATERAL (
    SELECT b.address_1, b.town, b.county, b.postcode
      FROM "Legacy_Branch_Resolved" b
     WHERE b.legacy_customer_id = t.legacy_id
     ORDER BY b.is_head_office DESC, b.legacy_branch_id
     LIMIT 1
  ) h ON true
 WHERE t.verdict = 'will be created'
   AND t.legacy_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Organisation" o
                    WHERE o."Legacy_Customer_ID" = t.legacy_id);

-- 2.3 The customer role, with the Audacia code on its Reference.
INSERT INTO "Organisation_Role" (
  "Organisation_ID", "Organisation_Type_ID", "Reference", "Is_Active"
)
SELECT o."Organisation_ID",
       (SELECT ty."Organisation_Type_ID" FROM "Organisation_Type" ty
         WHERE ty."Type_Key" = 'customer'),
       NULLIF(btrim(COALESCE(t."Customer_Ref", '')), ''),
       true
  FROM "Trial_Ten_Customers" t
  JOIN "Organisation" o ON o."Legacy_Customer_ID" = t.legacy_id
 WHERE NOT EXISTS (
   SELECT 1 FROM "Organisation_Role" ro
    WHERE ro."Organisation_ID" = o."Organisation_ID"
      AND ro."Organisation_Type_ID" = (SELECT ty."Organisation_Type_ID"
                                         FROM "Organisation_Type" ty
                                        WHERE ty."Type_Key" = 'customer'));

-- 2.4a Adopt the branch the database made for us.
--
-- "Organisation" has an AFTER INSERT trigger, organisation_default_branch,
-- which creates a bare branch called 'Head Office' for every new
-- organisation - the Organisations screen says so: "A Head Office
-- branch is created automatically."
--
-- 411 of the 623 old branches are themselves called 'Head Office'. So
-- for those the trigger gets there first, 2.4's name guard correctly
-- refuses to insert a second row with the same name, and the REAL
-- branch is silently dropped: no Legacy_Branch_ID, and therefore no
-- link for the 1,036 contracts that resolve through exactly that key.
--
-- Measured before this step existed: the ten-customer trial inserted 52
-- branches where 55 were expected, and the three missing were the three
-- called 'Head Office'.
--
-- So the empty one is adopted rather than avoided. Only where it has no
-- Legacy_Branch_ID, so a branch already claimed by an earlier run or
-- created by a person is never taken over, and COALESCE on the address
-- so nothing typed is overwritten.
UPDATE "Organisation_Branch" x
   SET "Legacy_Branch_ID" = b.legacy_branch_id,
       "Address_1"        = COALESCE(x."Address_1", b.address_1),
       "Town"             = COALESCE(x."Town",      b.town),
       "Postcode"         = COALESCE(x."Postcode",  b.postcode)
  FROM "Trial_Ten_Customers" t
  JOIN "Organisation" o ON o."Legacy_Customer_ID" = t.legacy_id
  JOIN "Legacy_Branch_Resolved" b ON b.legacy_customer_id = t.legacy_id
 WHERE x."Organisation_ID"  = o."Organisation_ID"
   AND x."Branch_Name"      = b.branch_name
   AND x."Legacy_Branch_ID" IS NULL
   AND b.legacy_branch_id   IS NOT NULL;

-- 2.4 Their branches. Branch_Dropdown is left to its trigger.
INSERT INTO "Organisation_Branch" (
  "Organisation_ID", "Branch_Name", "Address_1", "Town", "Postcode",
  "Is_Active", "Legacy_Branch_ID"
)
SELECT o."Organisation_ID",
       b.branch_name,
       b.address_1, b.town, b.postcode, true, b.legacy_branch_id
  FROM "Trial_Ten_Customers" t
  JOIN "Organisation" o ON o."Legacy_Customer_ID" = t.legacy_id
  JOIN "Legacy_Branch_Resolved" b ON b.legacy_customer_id = t.legacy_id
 WHERE b.legacy_branch_id IS NOT NULL
   AND b.existing_branch_id IS NULL
   /* Nothing already under that name on that organisation - see the
      note in import_legacy_organisations.sql 2.4. This is what lets a
      run that stopped half way be run again. */
   AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" x
                    WHERE x."Organisation_ID" = o."Organisation_ID"
                      AND x."Branch_Name" = b.branch_name);

-- 2.4b Remove the placeholder once real branches have arrived.
--
-- organisation_default_branch exists so an organisation always has one
-- branch - org_branch_keep_one refuses to leave it with none. Once the
-- import has brought the real ones, an empty 'Head Office' with no
-- address and no legacy key is a row nobody put there and nobody wants
-- in the picker.
--
-- Deleted only when ALL of these hold, so nothing a person made can be
-- caught by it:
--   * it carries no Legacy_Branch_ID, so 2.4a did not adopt it
--   * it has no address at all
--   * its organisation came from this import
--   * and that organisation still has other branches, so the
--     keep-one trigger has nothing to object to
DELETE FROM "Organisation_Branch" x
 USING "Organisation" o
 WHERE o."Organisation_ID"   = x."Organisation_ID"
   /* Only organisations this import CREATED. A placeholder made
      seconds ago on a brand-new organisation cannot be referenced by
      anything; one on an organisation that was already here might be -
      Project, Project_Developer, Enquiry_Submission and the contacts
      all point at a branch, and deleting a referenced row is how an
      import breaks work somebody has done. Those keep their
      placeholder, which is untidy and safe. */
   AND o."Notes" LIKE 'Imported from the original app%'
   AND o."Legacy_Customer_ID" IS NOT NULL
   AND x."Legacy_Branch_ID"   IS NULL
   AND x."Branch_Name"        = 'Head Office'
   AND x."Address_1" IS NULL AND x."Town" IS NULL AND x."Postcode" IS NULL
   AND EXISTS (SELECT 1 FROM "Organisation_Branch" y
                WHERE y."Organisation_ID" = x."Organisation_ID"
                  AND y."Organisation_Branch_ID" <> x."Organisation_Branch_ID");

-- 2.5 The contact the old record held, on the head office.
INSERT INTO "Organisation_Contact" (
  "Organisation_Branch_ID", "Contact_Name", "Is_Primary", "Is_Active", "Notes"
)
SELECT hb."Organisation_Branch_ID", btrim(t."Customer_Contact"), true, true,
       'Imported from the original app''s Customer record. Ten-customer trial.'
  FROM "Trial_Ten_Customers" t
  JOIN "Organisation" o ON o."Legacy_Customer_ID" = t.legacy_id
  JOIN LATERAL (
    SELECT b."Organisation_Branch_ID" FROM "Organisation_Branch" b
     WHERE b."Organisation_ID" = o."Organisation_ID"
     ORDER BY (b."Branch_Name" = 'Head Office') DESC, b."Organisation_Branch_ID"
     LIMIT 1
  ) hb ON true
 WHERE btrim(COALESCE(t."Customer_Contact", '')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "Organisation_Contact" oc
      WHERE oc."Organisation_Branch_ID" = hb."Organisation_Branch_ID"
        AND upper(btrim(oc."Contact_Name")) = upper(btrim(t."Customer_Contact")));

-- ────────────────────────────────────────────────────────────────────
--  PART 3 — what landed
-- ────────────────────────────────────────────────────────────────────

-- 3.1 One row per customer, as the app will now show it.
SELECT left(o."Name", 32)                                        AS organisation,
       o."Legacy_Customer_ID"                                    AS from_old_id,
       COALESCE(o."Town", '-')                                   AS town,
       COALESCE(o."County", '-')                                 AS county,
       (SELECT count(*) FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = o."Organisation_ID")         AS branches,
       (SELECT COALESCE(NULLIF(btrim(ro."Reference"), ''), '-')
          FROM "Organisation_Role" ro
          JOIN "Organisation_Type" ty
            ON ty."Organisation_Type_ID" = ro."Organisation_Type_ID"
         WHERE ro."Organisation_ID" = o."Organisation_ID"
           AND ty."Type_Key" = 'customer' LIMIT 1)               AS code,
       (SELECT count(*) FROM "Organisation_Contact" oc
          JOIN "Organisation_Branch" b
            ON b."Organisation_Branch_ID" = oc."Organisation_Branch_ID"
         WHERE b."Organisation_ID" = o."Organisation_ID")         AS contacts
  FROM "Organisation" o
 WHERE o."Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers")
 ORDER BY 5 DESC, 1;

-- 3.2 The totals. Branches should be 55 — Persimmon's 16, Taylor
--     Wimpey's 12, Bellway's 8, Countryside's and BDW's 6 each, Story's
--     3, and one each for Rowland, Eccleston, R.P Tyson and PH Property.
SELECT count(*)                                                  AS organisations,
       (SELECT count(*) FROM "Organisation_Branch" b
          JOIN "Organisation" o2 ON o2."Organisation_ID" = b."Organisation_ID"
         WHERE o2."Legacy_Customer_ID" IN
               (SELECT legacy_id FROM "Trial_Ten_Customers"))     AS branches,
       (SELECT count(*) FROM "Organisation_Role" ro
          JOIN "Organisation" o2 ON o2."Organisation_ID" = ro."Organisation_ID"
          JOIN "Organisation_Type" ty
            ON ty."Organisation_Type_ID" = ro."Organisation_Type_ID"
         WHERE o2."Legacy_Customer_ID" IN
               (SELECT legacy_id FROM "Trial_Ten_Customers")
           AND ty."Type_Key" = 'customer')                        AS customer_roles
  FROM "Organisation" o
 WHERE o."Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers");

-- 3.3 Must come back empty: one of the ten with no branch cannot be put
--     on a project, because a project hangs off a branch.
SELECT o."Organisation_ID", o."Name"
  FROM "Organisation" o
 WHERE o."Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers")
   AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
                    WHERE b."Organisation_ID" = o."Organisation_ID");

-- ────────────────────────────────────────────────────────────────────
--  PART 4 — take it back out
-- ────────────────────────────────────────────────────────────────────
--
-- Uncomment and run to undo the trial completely, in this order.
--
-- The three that were already here are un-claimed, not deleted — they
-- were here before this ran. Their customer role is removed only where
-- this trial added it, which is why the role delete names the trial's
-- own Notes-marked organisations rather than all ten.
--
-- ── org_branch_keep_one ──
--
-- "Organisation_Branch" has a BEFORE DELETE trigger refusing to remove
-- an organisation's LAST branch: "An organisation must keep at least
-- one branch - rename this one instead." Correct for a person on the
-- Stakeholder tab; wrong for an undo, whose whole job is to put things
-- back as they were, branchless organisations included.
--
-- So it is suspended around the branch delete, the way 0231 suspended
-- the history trigger around its backfill. If the DELETE fails the
-- trigger stays off - run the ENABLE on its own before doing anything
-- else.
--
-- Note it also removes a placeholder that 2.4a ADOPTED on one of the
-- three organisations that were already here. That row was empty when
-- the trigger made it and is empty-equivalent now; the organisation is
-- left with none, which is the state it was in before the trial.
--
-- DELETE FROM "Organisation_Contact" oc
--  USING "Organisation_Branch" b, "Organisation" o
--  WHERE b."Organisation_Branch_ID" = oc."Organisation_Branch_ID"
--    AND o."Organisation_ID" = b."Organisation_ID"
--    AND o."Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers")
--    AND oc."Notes" LIKE '%Ten-customer trial.';
--
-- ALTER TABLE "Organisation_Branch" DISABLE TRIGGER org_branch_keep_one;
--
-- DELETE FROM "Organisation_Branch" b
--  USING "Organisation" o
--  WHERE o."Organisation_ID" = b."Organisation_ID"
--    AND o."Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers")
--    AND b."Legacy_Branch_ID" IS NOT NULL;
--
-- ALTER TABLE "Organisation_Branch" ENABLE TRIGGER org_branch_keep_one;
--
-- DELETE FROM "Organisation_Role" ro
--  USING "Organisation" o
--  WHERE o."Organisation_ID" = ro."Organisation_ID"
--    AND o."Notes" LIKE '%Ten-customer trial.';
--
-- COALESCE on the Notes, because NULL NOT LIKE '...' is NULL and not
-- true: the three claimed organisations have no Notes, so the first
-- version of this matched none of them and reported UPDATE 0.
--
-- UPDATE "Organisation" SET "Legacy_Customer_ID" = NULL
--  WHERE "Legacy_Customer_ID" IN (SELECT legacy_id FROM "Trial_Ten_Customers")
--    AND COALESCE("Notes", '') NOT LIKE '%Ten-customer trial.';
--
-- DELETE FROM "Organisation" WHERE "Notes" LIKE '%Ten-customer trial.';
--
--
-- Finally, put back the placeholder on any organisation left with none.
-- 2.4a ADOPTS an empty 'Head Office' where the old branch had the same
-- name, so the delete above takes it with the rest and a claimed
-- organisation ends up branchless - one short of where it started, and
-- short of the invariant organisation_default_branch exists to keep.
-- Measured: 418 branches back where 419 began.
--
-- INSERT INTO "Organisation_Branch" ("Organisation_ID", "Branch_Name")
-- SELECT o."Organisation_ID", 'Head Office'
--   FROM "Organisation" o
--  WHERE NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
--                     WHERE b."Organisation_ID" = o."Organisation_ID")
--  ON CONFLICT DO NOTHING;
--
-- DROP VIEW IF EXISTS "Trial_Ten_Customers";
