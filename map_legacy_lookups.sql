-- ════════════════════════════════════════════════════════════════════
--  The lookup map: old ids to new ones, for the contract import
-- ════════════════════════════════════════════════════════════════════
--
-- Run after 0247-0253 and after the contract CSV is staged. Run it
-- before import_legacy_projects.sql, which REFUSES to start while any
-- old status id has no row here:
--
--   RAISE EXCEPTION 'These old status ids have no row in
--                    Legacy_Lookup_Map: %'
--
-- Safe to run again. Everything is keyed on (Kind, Legacy_ID) and
-- upserted, so a second run rewrites the same values.
--
-- ── Everything is matched BY NAME ──
--
-- Not by id. The ids in this file would be a copy of what one query
-- returned on one afternoon, and a reseeded status table would make
-- them point at the wrong thing in silence - which is the whole reason
-- Legacy_Lookup_Map exists rather than the import assuming the numbers
-- agree. Matching on (Stage, Status) means this file is still correct
-- if the ids move.
--
-- If a name here does not exist, the INSERT writes NULL and part 3
-- lists it. It does not guess.

-- ────────────────────────────────────────────────────────────────────
--  PART 1 — the three statuses the new system does not have
-- ────────────────────────────────────────────────────────────────────
--
-- Agreed before writing: the old contract lifecycle is richer than the
-- new Contract stage, which has only Mobilising, On Site and
-- Commercially Complete.
--
--   Operationally Complete   1,049 contracts   54% of them
--   MU Completed               122
--   Contract Revoked            23
--
-- Operationally Complete is the one that matters. It is NOT
-- Commercially Complete - work finished is not the same as invoiced and
-- closed, and Commercially Complete is terminal, so putting 1,049
-- projects there would mark them finished when they are not. On Site is
-- wrong in the other direction.
--
-- Sort_Order and Row_Colour are read off the existing Contract rows
-- rather than typed, so these sit in the right place on the board in
-- whatever palette is in use. The order is the lifecycle:
--
--   Mobilising -> On Site -> MU Completed -> Operationally Complete
--                                         -> Commercially Complete
--
-- with Revoked terminal, after the lot.
INSERT INTO "Project_Status" ("Stage", "Status", "Sort_Order", "Row_Colour", "Is_Terminal")
SELECT 'Contract', v.status, c.base + v.step * c.gap, c.colour, v.terminal
  FROM (VALUES
         /* The two that sit in the live part of the lifecycle go
            between On Site and Commercially Complete. Revoked is
            terminal and is not a step on the way to anything, so it
            goes after the last Contract status rather than in the
            middle of the run - which is where an earlier version of
            this put it. */
         ('MU Completed',            1, false, false),
         ('Operationally Complete',  2, false, false),
         ('Contract Revoked',        1, true,  true)
       ) AS v(status, step, after_all, terminal)
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN v.after_all
           THEN (SELECT max(ps."Sort_Order") FROM "Project_Status" ps
                  WHERE ps."Stage" = 'Contract')
           ELSE COALESCE(
                  (SELECT ps."Sort_Order" FROM "Project_Status" ps
                    WHERE ps."Stage" = 'Contract' AND ps."Status" = 'On Site'),
                  (SELECT max(ps."Sort_Order") FROM "Project_Status" ps
                    WHERE ps."Stage" = 'Contract'))
      END AS base,
      CASE WHEN v.after_all THEN 10
           ELSE GREATEST(1, COALESCE(
             (SELECT ps2."Sort_Order" FROM "Project_Status" ps2
               WHERE ps2."Stage" = 'Contract' AND ps2."Status" = 'Commercially Complete')
             - (SELECT ps3."Sort_Order" FROM "Project_Status" ps3
                 WHERE ps3."Stage" = 'Contract' AND ps3."Status" = 'On Site'), 9) / 3)
      END AS gap,
      (SELECT ps."Row_Colour" FROM "Project_Status" ps
        WHERE ps."Stage" = 'Contract' AND ps."Row_Colour" IS NOT NULL
        LIMIT 1) AS colour
  ) c
 WHERE NOT EXISTS (SELECT 1 FROM "Project_Status" x
                    WHERE x."Stage" = 'Contract' AND x."Status" = v.status);

-- ────────────────────────────────────────────────────────────────────
--  PART 2 — the map
-- ────────────────────────────────────────────────────────────────────

-- 2.1 Statuses. All seven, because the import refuses to run with any
--     of them missing and Project.Project_Status_ID is NOT NULL.
--
--     Secured, Secured (LOI) and Secured (EOI) all become Mobilising:
--     the job is won and not yet on site, which is what Mobilising
--     means here. The old system drew a distinction between the three
--     paperwork routes to being secured; the new one does not, and
--     nothing downstream reads it.
INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
SELECT 'status', v.old_id,
       (SELECT ps."Project_Status_ID" FROM "Project_Status" ps
         WHERE ps."Stage" = 'Contract' AND ps."Status" = v.new_name),
       v.note
  FROM (VALUES
    ('1', 'Commercially Complete',  'Commercially Complete - exact match. 138 contracts.'),
    ('2', 'Contract Revoked',       'Contract Revoked - added by part 1. 23 contracts.'),
    ('3', 'MU Completed',           'MU Completed - added by part 1. 122 contracts.'),
    ('4', 'Operationally Complete', 'Operationally Complete - added by part 1. 1,049 contracts, 54% of them.'),
    ('5', 'Mobilising',             'Secured - won, not yet on site. 538 contracts.'),
    ('6', 'Mobilising',             'Secured (EOI) - as Secured. 2 contracts.'),
    ('7', 'Mobilising',             'Secured (LOI) - as Secured. 23 contracts.')
  ) AS v(old_id, new_name, note)
    ON CONFLICT ("Kind", "Legacy_ID")
    DO UPDATE SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

-- 2.2 Regions. Project.Region_ID is nullable, so an unmapped one is
--     recoverable - but these are unambiguous, so there is no reason to
--     leave them.
--
--     The old system had North West, North West 1 and North West 2 as
--     three separate regions and the new one has a single North West,
--     so all three fold into it. South West has no equivalent here: 4
--     contracts import with no region and somebody sets it, which is
--     better than inventing a region nobody uses.
INSERT INTO "Legacy_Lookup_Map" ("Kind", "Legacy_ID", "New_ID", "Note")
SELECT 'region', v.old_id,
       (SELECT r."Region_ID" FROM "Region" r WHERE r."Region" = v.new_name),
       v.note
  FROM (VALUES
    ('1', 'Midlands',   'Midlands. 180 contracts.'),
    ('2', 'North East', 'North East. 244 contracts.'),
    ('3', 'North West', 'North West 1 - folded into North West. 8 contracts.'),
    ('4', 'North West', 'North West 2 - folded into North West. 5 contracts.'),
    ('5', 'Yorkshire',  'Yorkshire. 107 contracts.'),
    ('7', 'North West', 'North West. 1,378 contracts - 72% of them.'),
    ('8', NULL,         'South West - no such region here. 4 contracts import without one.')
  ) AS v(old_id, new_name, note)
    ON CONFLICT ("Kind", "Legacy_ID")
    DO UPDATE SET "New_ID" = EXCLUDED."New_ID", "Note" = EXCLUDED."Note";

-- ────────────────────────────────────────────────────────────────────
--  PART 3 — check it before running the import
-- ────────────────────────────────────────────────────────────────────
--
-- One result set. Every old status id that appears in the staged
-- contracts, what it will become, and how many projects ride on it.
--
-- "NOT MAPPED" in the last column on a status row means the import will
-- refuse to start. On a region row it means those projects import with
-- no region, which is recoverable.
SELECT m."Kind"                                        AS kind,
       m."Legacy_ID"                                   AS old_id,
       COALESCE(ps."Status", r."Region", 'NOT MAPPED') AS becomes,
       COALESCE(ps."Stage", '')                        AS stage,
       (SELECT count(*) FROM "Legacy_Project_Import" i
         WHERE i."Source" = 'contract'
           AND btrim(CASE WHEN m."Kind" = 'status' THEN i."Contract_Status_ID"
                                                   ELSE i."Region_ID" END) = m."Legacy_ID")
                                                       AS contracts,
       m."Note"                                        AS note
  FROM "Legacy_Lookup_Map" m
  LEFT JOIN "Project_Status" ps ON ps."Project_Status_ID" = m."New_ID" AND m."Kind" = 'status'
  LEFT JOIN "Region"         r  ON r."Region_ID"          = m."New_ID" AND m."Kind" = 'region'
 ORDER BY m."Kind", 5 DESC;
