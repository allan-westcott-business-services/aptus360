-- ════════════════════════════════════════════════════════════════════
--  Stage 1 — the original app's Customers become Organisations
-- ════════════════════════════════════════════════════════════════════
--
-- Run 0249 and 0253 first. Then:
--
--   1. Load the Customer CSV into "Legacy_Customer_Import" and the
--      Customer_Branch CSV into "Legacy_Branch_Import". The columns map
--      one-to-one by name, so a straight CSV load works.
--
--   2. Run PART 1. Nothing is created. It says what matches, what will
--      be made, and the two things worth looking at by eye.
--
--   3. Run PART 2, which creates them.
--
--   4. Run PART 3 to check, and keep the result.
--
-- Safe to run again. Everything is matched on the legacy keys 0249 put
-- on Organisation and Organisation_Branch, both uniquely indexed, so a
-- second run inserts nothing.
--
-- ── What this does NOT do ──
--
-- It does not touch the 419 organisations already here except to claim
-- the 13 that are the same company under the same name - and claiming
-- means setting Legacy_Customer_ID and adding a customer role, never
-- rewriting a name, address or anything else somebody has maintained.
--
-- It does not carry Payment_Terms_Days or Letter_Grace_Days. Every one
-- of the 623 branches says 30 and 15; a constant is a default nobody
-- changed, and there is nowhere in this schema that holds it.
--
-- It does not write Organisation.Code. The Audacia code goes on the
-- customer role's Reference, which is where 0249's resolution reads it
-- from. Two homes for one value is how they drift apart.

-- ════════════════════════════════════════════════════════════════════
--  PART 1 — what is there, and what will happen
-- ════════════════════════════════════════════════════════════════════

-- 1.1 The headline.
SELECT verdict, count(*) AS customers
  FROM "Legacy_Organisation_Resolved"
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.2 The ones that match something already here. Worth reading in
--     full: these are the rows where this import touches an
--     organisation somebody else has been maintaining, and a wrong
--     match merges two companies into one.
SELECT r."Customer_ID" AS old_id, r.clean_name AS old_name,
       o."Organisation_ID", o."Name" AS name_here,
       (SELECT count(*) FROM "Organisation_Role" ro
         WHERE ro."Organisation_ID" = o."Organisation_ID") AS roles_it_has,
       (SELECT count(*) FROM "Organisation_Branch" b
         WHERE b."Organisation_ID" = o."Organisation_ID")  AS branches_it_has
  FROM "Legacy_Organisation_Resolved" r
  JOIN "Organisation" o ON o."Organisation_ID" = r.organisation_id
 WHERE r.verdict = 'matches one already here by name'
 ORDER BY o."Name";

-- 1.3 Names that are an instruction rather than a company. One row in
--     the real export - "*** DO NOT TENDER FOR***PH Property Holdings
--     Ltd" - and it is imported VERBATIM on purpose: somebody put that
--     warning there for a reason, and moving it to a Notes field nobody
--     opens would hide it. Listed so it is a decision rather than a
--     surprise.
SELECT "Customer_ID", "Customer_Name"
  FROM "Legacy_Customer_Import"
 WHERE "Customer_Name" ~ '^\s*[*]'
    OR "Customer_Name" ILIKE '%do not%'
    OR "Customer_Name" ILIKE '%duplicate%'
 ORDER BY 2;

-- 1.4 The branches, and how their addresses collapse. 251 have no
--     address at all, which is the old data and not a fault here.
SELECT CASE WHEN address_1 IS NULL AND town IS NULL THEN 'no address'
            WHEN town IS NULL                       THEN 'street only'
            ELSE 'street and town' END              AS address,
       count(*) AS branches,
       count(*) FILTER (WHERE county IS NOT NULL)   AS with_a_county,
       count(*) FILTER (WHERE is_head_office)       AS head_offices
  FROM "Legacy_Branch_Resolved"
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.5 Customers with more than one branch. The contract import lands
--     1,036 of its 1,926 rows on a specific branch by its old key, so
--     these mostly resolve themselves - but a project whose contract
--     named no branch and whose customer has several still needs one
--     choosing by hand, and these are the companies it will happen on.
SELECT o.clean_name AS customer, count(*) AS branches,
       string_agg(COALESCE(b."Branch_Name", '(unnamed)'), ' | '
                  ORDER BY b."Branch_Name") AS branch_names
  FROM "Legacy_Branch_Import" b
  JOIN "Legacy_Organisation_Resolved" o
    ON NULLIF(btrim(o."Customer_ID"), '')::bigint
     = NULLIF(btrim(b."Customer_ID"), '')::bigint
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC, 1;

-- 1.6 Branches whose customer is not in the customer file. These cannot
--     be created - a branch with no organisation has nothing to hang
--     off - and are listed rather than silently dropped.
SELECT b."Branch_ID", b."Customer_ID", b."Branch_Name"
  FROM "Legacy_Branch_Import" b
 WHERE NOT EXISTS (SELECT 1 FROM "Legacy_Customer_Import" c
                    WHERE NULLIF(btrim(c."Customer_ID"), '')::bigint
                        = NULLIF(btrim(b."Customer_ID"), '')::bigint)
 ORDER BY 2, 1;

-- ════════════════════════════════════════════════════════════════════
--  PART 2 — create them
-- ════════════════════════════════════════════════════════════════════

-- 2.1 Claim the ones already here.
--
-- Only Legacy_Customer_ID, and only where it is empty. The name,
-- address and everything else belongs to whoever has been maintaining
-- that organisation; this import has no business rewriting it from a
-- file the old system stopped updating.
UPDATE "Organisation" o
   SET "Legacy_Customer_ID" = r.legacy_id
  FROM "Legacy_Organisation_Resolved" r
 WHERE o."Organisation_ID" = r.organisation_id
   AND r.verdict = 'matches one already here by name'
   AND o."Legacy_Customer_ID" IS NULL;

-- 2.1b Fill in what those ones are MISSING, and only that.
--
-- Found by the ten-customer trial, which is what a trial is for. The
-- three claimed organisations in it came out with no town and no
-- county: 2.1 refuses to overwrite a maintained address, and their
-- addresses were empty, so there was nothing to protect and nothing
-- arrived either.
--
-- COALESCE on every column, so a value somebody has set is untouchable
-- and only a NULL is filled. The head office's address, as in 2.2.
UPDATE "Organisation" o
   SET "Address_1" = COALESCE(o."Address_1", h.address_1),
       "Town"      = COALESCE(o."Town",      h.town),
       "County"    = COALESCE(o."County",    h.county),
       "Postcode"  = COALESCE(o."Postcode",  h.postcode)
  FROM "Legacy_Organisation_Resolved" r
  LEFT JOIN LATERAL (
    SELECT b.address_1, b.town, b.county, b.postcode
      FROM "Legacy_Branch_Resolved" b
     WHERE b.legacy_customer_id = r.legacy_id
     ORDER BY b.is_head_office DESC, b.legacy_branch_id
     LIMIT 1
  ) h ON true
 WHERE o."Organisation_ID" = r.organisation_id
   AND o."Legacy_Customer_ID" = r.legacy_id
   /* Only where there is something to put in. Asking merely "is any
      column null" fired again on a second run for the two whose head
      office has no postcode either: it rewrote the same values and
      reported UPDATE 2, which reads as a change when nothing changed.
      Found by running it twice. */
   AND ((o."Address_1" IS NULL AND h.address_1 IS NOT NULL)
     OR (o."Town"      IS NULL AND h.town      IS NOT NULL)
     OR (o."County"    IS NULL AND h.county    IS NOT NULL)
     OR (o."Postcode"  IS NULL AND h.postcode  IS NOT NULL));

-- 2.1c And give an existing customer role its Audacia code, where it
--      has none.
--
-- The same trial finding. Rowland Homes came out with no code although
-- its Customer_Ref is ROW01: it already held a customer role, so 2.3's
-- guard correctly skipped it, and that role's Reference was empty.
--
-- Reference is the column 0249's resolution falls back to when the
-- legacy keys are absent, so an empty one costs those contracts their
-- match. Only filled where empty - a reference somebody has typed is
-- theirs.
UPDATE "Organisation_Role" ro
   SET "Reference" = NULLIF(btrim(COALESCE(c."Customer_Ref", '')), '')
  FROM "Organisation" o, "Legacy_Customer_Import" c
 WHERE ro."Organisation_ID" = o."Organisation_ID"
   AND o."Legacy_Customer_ID" = NULLIF(btrim(c."Customer_ID"), '')::bigint
   AND ro."Organisation_Type_ID" = (SELECT t."Organisation_Type_ID"
                                      FROM "Organisation_Type" t
                                     WHERE t."Type_Key" = 'customer')
   AND btrim(COALESCE(ro."Reference", '')) = ''
   AND btrim(COALESCE(c."Customer_Ref", '')) <> '';

-- 2.2 Create the ones that are not here.
--
-- ── The address comes from the head office ──
--
-- Organisation has Address_1, Address_2, Town, County and Postcode;
-- Organisation_Branch has Address_1, Town and Postcode and no County.
-- So the head office's address goes on the organisation, where the
-- county survives, as well as on its own branch row in 2.4.
--
-- A customer with no head office marked falls back to its first branch,
-- and one with no branches at all gets no address, which is true rather
-- than invented.
--
-- Is_Active is true: these are the customers the business works with,
-- and the old system had no flag to say otherwise.
INSERT INTO "Organisation" (
  "Name", "Address_1", "Address_2", "Town", "County", "Postcode",
  "Is_Active", "Legacy_Customer_ID", "Notes"
)
SELECT r.clean_name,
       h.address_1, NULL, h.town, h.county, h.postcode,
       true,
       r.legacy_id,
       'Imported from the original app''s Customer ' || r."Customer_ID" || '.'
  FROM "Legacy_Organisation_Resolved" r
  LEFT JOIN LATERAL (
    SELECT b.address_1, b.town, b.county, b.postcode
      FROM "Legacy_Branch_Resolved" b
     WHERE b.legacy_customer_id = r.legacy_id
     ORDER BY b.is_head_office DESC, b.legacy_branch_id
     LIMIT 1
  ) h ON true
 WHERE r.verdict = 'will be created'
   AND r.legacy_id IS NOT NULL
   /* Belt and braces over the unique index: a second run finds the row
      and does nothing rather than raising. */
   AND NOT EXISTS (SELECT 1 FROM "Organisation" o
                    WHERE o."Legacy_Customer_ID" = r.legacy_id);

-- 2.3 Give every one of them the customer role.
--
-- Type 1 is 'customer'. Read by Type_Key rather than written as 1,
-- because an id is a fact about this database and the key is a fact
-- about the trade.
--
-- Reference carries the Audacia code. This is the column 0249's
-- resolution reads when it falls back from the legacy keys to the code,
-- so an empty one costs those 58 contracts their match.
INSERT INTO "Organisation_Role" (
  "Organisation_ID", "Organisation_Type_ID", "Reference", "Is_Active"
)
SELECT o."Organisation_ID",
       (SELECT t."Organisation_Type_ID" FROM "Organisation_Type" t
         WHERE t."Type_Key" = 'customer'),
       NULLIF(btrim(COALESCE(c."Customer_Ref", '')), ''),
       true
  FROM "Organisation" o
  JOIN "Legacy_Customer_Import" c
    ON NULLIF(btrim(c."Customer_ID"), '')::bigint = o."Legacy_Customer_ID"
 WHERE o."Legacy_Customer_ID" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "Organisation_Role" ro
      WHERE ro."Organisation_ID" = o."Organisation_ID"
        AND ro."Organisation_Type_ID" = (SELECT t."Organisation_Type_ID"
                                           FROM "Organisation_Type" t
                                          WHERE t."Type_Key" = 'customer'));

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
  FROM "Legacy_Branch_Resolved" b
 WHERE x."Organisation_ID"  = b.organisation_id
   AND x."Branch_Name"      = b.branch_name
   AND x."Legacy_Branch_ID" IS NULL
   AND b.legacy_branch_id   IS NOT NULL;

-- 2.4 The branches.
--
-- Branch_Dropdown is left alone: it is maintained by
-- org_branch_dropdown_trg and writing it here would fight the trigger.
--
-- An unnamed branch becomes 'Head Office' where it is the head office
-- and 'Branch' otherwise, because the screens sort and show by name and
-- a blank one cannot be picked from a list.
INSERT INTO "Organisation_Branch" (
  "Organisation_ID", "Branch_Name", "Address_1", "Town", "Postcode",
  "Is_Active", "Legacy_Branch_ID"
)
SELECT b.organisation_id,
       b.branch_name,
       b.address_1, b.town, b.postcode,
       true,
       b.legacy_branch_id
  FROM "Legacy_Branch_Resolved" b
 WHERE b.organisation_id IS NOT NULL
   AND b.legacy_branch_id IS NOT NULL
   AND b.existing_branch_id IS NULL
   /* And nothing already under that name on that organisation. The
      unique constraint is on (Organisation_ID, Branch_Name), so a
      branch somebody created by hand - or one a half-finished run left
      behind - would abort the insert for every other row. Skipping it
      makes a part-run resumable instead. */
   AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" x
                    WHERE x."Organisation_ID" = b.organisation_id
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

-- 2.5 The contacts, where the old customer recorded one.
--
-- 285 of the 509 have a name and nothing else - no email, no phone, no
-- job title, because the old Customer table held one text field. It
-- goes on the head office, marked primary, since a contact recorded
-- against the company is the company's main contact.
--
-- There is no legacy key for a contact, so this is idempotent on the
-- NAME within the branch. Two people of the same name on one branch
-- would be one row, which is a price worth paying for not creating a
-- duplicate every time this runs.
INSERT INTO "Organisation_Contact" (
  "Organisation_Branch_ID", "Contact_Name", "Is_Primary", "Is_Active", "Notes"
)
SELECT hb."Organisation_Branch_ID",
       btrim(c."Customer_Contact"),
       true, true,
       'Imported from the original app''s Customer record.'
  FROM "Legacy_Customer_Import" c
  JOIN "Organisation" o
    ON o."Legacy_Customer_ID" = NULLIF(btrim(c."Customer_ID"), '')::bigint
  JOIN LATERAL (
    SELECT b."Organisation_Branch_ID"
      FROM "Organisation_Branch" b
     WHERE b."Organisation_ID" = o."Organisation_ID"
     ORDER BY (b."Branch_Name" = 'Head Office') DESC, b."Organisation_Branch_ID"
     LIMIT 1
  ) hb ON true
 WHERE btrim(COALESCE(c."Customer_Contact", '')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "Organisation_Contact" oc
      WHERE oc."Organisation_Branch_ID" = hb."Organisation_Branch_ID"
        AND upper(btrim(oc."Contact_Name")) = upper(btrim(c."Customer_Contact")));

-- ════════════════════════════════════════════════════════════════════
--  PART 3 — did it work
-- ════════════════════════════════════════════════════════════════════

-- 3.1 The counts. Organisations imported should be 509 less the ones
--     with no name; branches 623 less any whose customer was missing.
SELECT
  (SELECT count(*) FROM "Organisation" WHERE "Legacy_Customer_ID" IS NOT NULL)
    AS organisations_imported,
  (SELECT count(*) FROM "Organisation_Branch" WHERE "Legacy_Branch_ID" IS NOT NULL)
    AS branches_imported,
  (SELECT count(*) FROM "Organisation_Role" ro
     JOIN "Organisation" o ON o."Organisation_ID" = ro."Organisation_ID"
     JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = ro."Organisation_Type_ID"
    WHERE o."Legacy_Customer_ID" IS NOT NULL AND t."Type_Key" = 'customer')
    AS with_the_customer_role,
  (SELECT count(*) FROM "Legacy_Customer_Import") AS customers_staged,
  (SELECT count(*) FROM "Legacy_Branch_Import")   AS branches_staged;

-- 3.2 Must come back empty: an imported organisation with no branch
--     cannot be chosen on a project, because a project hangs off a
--     branch and not off a company.
SELECT o."Organisation_ID", o."Name", o."Legacy_Customer_ID"
  FROM "Organisation" o
 WHERE o."Legacy_Customer_ID" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Organisation_Branch" b
                    WHERE b."Organisation_ID" = o."Organisation_ID")
 ORDER BY 2
 LIMIT 20;

-- 3.3 And must come back empty: a staged customer that produced
--     nothing. Anything here is a row the import could not place and
--     did not say so.
SELECT r."Customer_ID", r.clean_name, r.verdict
  FROM "Legacy_Organisation_Resolved" r
 WHERE NOT EXISTS (SELECT 1 FROM "Organisation" o
                    WHERE o."Legacy_Customer_ID" = r.legacy_id)
   AND r.legacy_id IS NOT NULL
 ORDER BY 1
 LIMIT 20;

-- 3.4 What this unlocks: how many of the staged contracts can now find
--     their customer. Run it only once the contract CSV is loaded -
--     before that it correctly returns zeros.
SELECT
  count(*)                                                        AS contracts_staged,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM "Organisation_Branch" b
     WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint))
                                                                  AS land_on_a_branch,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM "Organisation_Branch" b
     WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint)
    AND EXISTS (
    SELECT 1 FROM "Organisation" o
     WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint))
                                                                  AS organisation_only,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM "Organisation_Branch" b
     WHERE b."Legacy_Branch_ID" = NULLIF(btrim(i."Branch_ID"), '')::bigint)
    AND NOT EXISTS (
    SELECT 1 FROM "Organisation" o
     WHERE o."Legacy_Customer_ID" = NULLIF(btrim(i."Customer_ID"), '')::bigint))
                                                                  AS still_unmatched
  FROM "Legacy_Project_Import" i
 WHERE i."Source" = 'contract';

-- ════════════════════════════════════════════════════════════════════
--  PART 4 — undo
-- ════════════════════════════════════════════════════════════════════
--
-- In this order: contacts, then branches, then roles, then the
-- organisations. Each restricted to what the import created.
--
-- The 13 claimed organisations are NOT deleted - they were here first.
-- The first statement only un-claims them.
--
-- Matched on the Notes this import writes, with COALESCE around it: the
-- claimed organisations have no Notes, and NULL IS DISTINCT FROM 'x' is
-- true, so the original form here would have un-claimed the right rows
-- by luck of a different operator. The trial's version used NOT LIKE
-- and silently matched nothing. Spelled out rather than relying on
-- either.
--
-- UPDATE "Organisation" SET "Legacy_Customer_ID" = NULL
--  WHERE "Legacy_Customer_ID" IS NOT NULL
--    AND COALESCE("Notes", '') NOT LIKE 'Imported from the original app%';
--
-- Note what this does NOT undo: 2.1b and 2.1c filled in an address and
-- a role reference where they were empty. Nothing records which were
-- null beforehand, so they stay - and nothing was overwritten to put
-- them there.
--
-- org_branch_keep_one refuses to delete an organisation's LAST branch,
-- which is right for a person and wrong for an undo. Suspended around
-- the branch delete, as 0231 did for the history trigger. If the DELETE
-- fails the trigger stays off - run the ENABLE on its own first.
--
-- DELETE FROM "Organisation_Contact" oc
--  USING "Organisation_Branch" b, "Organisation" o
--  WHERE b."Organisation_Branch_ID" = oc."Organisation_Branch_ID"
--    AND o."Organisation_ID" = b."Organisation_ID"
--    AND b."Legacy_Branch_ID" IS NOT NULL
--    AND oc."Notes" = 'Imported from the original app''s Customer record.';
--
-- ALTER TABLE "Organisation_Branch" DISABLE TRIGGER org_branch_keep_one;
-- DELETE FROM "Organisation_Branch" WHERE "Legacy_Branch_ID" IS NOT NULL;
-- ALTER TABLE "Organisation_Branch" ENABLE TRIGGER org_branch_keep_one;
--
-- DELETE FROM "Organisation_Role" ro
--  USING "Organisation" o
--  WHERE o."Organisation_ID" = ro."Organisation_ID"
--    AND o."Notes" LIKE 'Imported from the original app%';
--
-- UPDATE "Organisation" SET "Legacy_Customer_ID" = NULL
--  WHERE "Legacy_Customer_ID" IS NOT NULL
--    AND COALESCE("Notes", '') NOT LIKE 'Imported from the original app%';
--
-- DELETE FROM "Organisation" WHERE "Notes" LIKE 'Imported from the original app%';
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
