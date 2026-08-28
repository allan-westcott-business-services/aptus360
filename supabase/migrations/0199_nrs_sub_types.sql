-- ════════════════════════════════════════════════════════════════
-- 0199 — two more kinds of non-residential supply
--
--   Landlord Supply        the landlord's own connection to a block:
--                          stair lighting, lifts, door entry, the bits
--                          of a building nobody's flat pays for
--   Communication Cabinet   a street cabinet for fibre or telecoms
--
-- Both could have been typed into Admin › Non-Res Supply Type in less
-- time than this file took, and that is the reason it exists: a row
-- typed on live is on live only. Every other environment then has a
-- gap where that id should be, and a supply referencing it points at
-- nothing — which reads as a supply with no type rather than as a
-- database missing a row.
--
-- ── Sort_Order ──
--
-- 80 and 90. The existing eight run in tens to 70 with "Other" parked
-- at 99, which is a list built expecting more: leaving that gap was
-- somebody's decision and this uses it rather than renumbering around
-- it.
--
-- Landlord before Communication, so the two supplies that belong to a
-- building sit next to Community Building and Commercial Unit, and the
-- one that belongs to the street sits after them.
-- ════════════════════════════════════════════════════════════════

-- ── Run this first ───────────────────────────────────────────────
-- Neither should already be there. A row here means somebody added one
-- by hand, and the insert below would make a second with a different
-- id — two types with one name, and half the supplies on each.
--
--   SELECT "NRS_Sub_Type_ID", "Label", "Sort_Order", "Is_Active"
--     FROM "NRS_Sub_Type"
--    WHERE "Label" ILIKE '%landlord%' OR "Label" ILIKE '%communication%'
--       OR "Label" ILIKE '%comms%';


INSERT INTO "NRS_Sub_Type" ("Label", "Sort_Order", "Is_Active")
SELECT v."Label", v."Sort_Order", true
  FROM (VALUES
    ('Landlord Supply', 80),
    ('Communication Cabinet', 90)
  ) AS v("Label", "Sort_Order")
 WHERE NOT EXISTS (
   SELECT 1 FROM "NRS_Sub_Type" t WHERE t."Label" = v."Label");
-- Guarded rather than a plain INSERT, so running it twice adds nothing.
-- There is no unique index on Label to lean on: this table is edited
-- from an admin screen that does not stop a duplicate either, so the
-- guard is the only thing between a second run and two Landlord
-- Supplies.
--
-- The id is left to the sequence rather than named. The eight existing
-- rows happen to be 1–8, and writing 9 and 10 here would collide on any
-- database where somebody has already added one of their own.


-- ── Verifying ────────────────────────────────────────────────────
-- Ten types, the two new ones between EV Charging and Other:
--
--   SELECT "NRS_Sub_Type_ID", "Label", "Sort_Order", "Is_Active"
--     FROM "NRS_Sub_Type" ORDER BY "Sort_Order";
--
-- They appear in the Type dropdown on Project › Non-Res Supplies with
-- no deploy: the list is read from this table through the nrsSubTypes
-- lookup, and nothing in the code names a type.
--
-- ── What this does not do ──
--
-- Nothing behaves differently for either type yet. A supply's type is
-- a label on the record: it is shown in the Type column, it filters,
-- and no rule reads it.
--
-- Worth knowing before either is used in anger, because both invite a
-- rule that does not exist:
--
--   A landlord supply is metered and takes a load like any other
--   connection, so it is already handled.
--
--   A communication cabinet usually is not an electrical connection at
--   all, or is a small unmetered one. If those should be left out of
--   the requested kVA on a POC application, or shown differently on the
--   drawing, that is a change to the code and not to this table — and
--   it needs deciding rather than assuming, because a cabinet that
--   draws nothing and a cabinet on a 6 kVA supply are both real.
--
-- To take one off the dropdown later without touching the supplies
-- already using it:
--
--   UPDATE "NRS_Sub_Type" SET "Is_Active" = false
--    WHERE "Label" = 'Communication Cabinet';
