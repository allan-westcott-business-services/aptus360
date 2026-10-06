-- ════════════════════════════════════════════════════════════════════
--  The imported projects need a developer RECORD, not just the cache
-- ════════════════════════════════════════════════════════════════════
--
-- Run after the imports, and again after the customers are migrated.
-- Safe to run any number of times.
--
-- ── Why this exists ──
--
-- The import sets "Project"."Organisation_Branch_ID". That column is a
-- CACHE of the main developer, kept by sync_project_main_developer() on
-- "Project_Developer". The record is the Project_Developer row; the
-- column is a copy of it.
--
-- And the app deliberately does not read the copy. Three places go to
-- the record instead:
--
--   1. The projects list. netlify/functions/projects.js embeds
--      Project_Developer and takes the developer from the row marked
--      Is_Main. Its own comment says why it stopped trusting the cache:
--      project 25 showed Anwyl Homes in the list with Taylor Wimpey on
--      its Stakeholder tab.
--
--   2. The developer portal. netlify/functions/portal.js resolves which
--      portal a contact sees "through Project_Developer, which is the
--      record rather than the cached column on Project", and says what
--      happens without one: "A scheme with no developer recorded yields
--      nothing, rather than a portal opened on a guess."
--
--   3. The Stakeholder tab, which is where that record is edited.
--
-- So an import that writes only the cache produces projects that look
-- half-created: blank developer in the list, empty Stakeholder tab, and
-- invisible in the developer's own portal. Including every project
-- whose customer matched perfectly.
--
-- Nothing errors. That is recurring fault 4 - a value that is stored
-- and not read looks exactly like a value nobody set.
--
-- ── Why the sync trigger does not save us ──
--
-- It runs one way only. sync_project_main_developer() fires ON
-- Project_Developer and writes TO Project. There is no trigger in the
-- other direction, and there should not be: the record is the truth.
--
-- Which is the good news here. Insert the record and the cache follows
-- by itself, so the two cannot drift apart afterwards.
--
-- ── Migration 0233, and what it does NOT block ──
--
-- Inserting a Project_Developer row fires the sync trigger, which
-- UPDATEs Project - and if 0233 has not run, log_project_changes()
-- still names the dropped Customer_ID column and updates to Project
-- fail.
--
-- This file was written saying it would fail too. Measured, it does
-- not: the sync trigger's UPDATE is guarded by
--
--     AND p."Organisation_Branch_ID" IS DISTINCT FROM branch
--
-- and the import has already set that exact branch, so it matches zero
-- rows and the history trigger never fires. This script runs either
-- way.
--
-- The IMPORT is the thing that needs 0233. With the broken function in
-- place, an UPDATE that changes any value on Project fails, and so does
-- inserting a project at all - both confirmed against the real error:
--
--   ERROR: column "Customer_ID" not found in data type "Project"
--   CONTEXT: PL/pgSQL function log_project_changes() line 16
--
-- So the import stops at its first row rather than half way, which is
-- the one mercy in it. Query 1 below reports it anyway, because this
-- file is run after the import and a surprise there is worth ruling
-- out. where_am_i.sql row 0.5 asks the same question before you start.

-- ────────────────────────────────────────────────────────────────────
--  1. Can a project be saved at all?
-- ────────────────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_project_changes')
      THEN 'OK - no history trigger function to block anything.'
    WHEN EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname = 'log_project_changes'
                    AND prosrc ILIKE '%Customer_ID%')
      THEN 'STOP - run migration 0233 first. The history trigger names '
           || 'the dropped Customer_ID column, so the UPDATE this script '
           || 'triggers on Project will fail.'
    ELSE 'OK - the history trigger names no columns.'
  END AS "Before you go on";

-- ────────────────────────────────────────────────────────────────────
--  2. What this will do
-- ────────────────────────────────────────────────────────────────────
--
-- Read-only. Run it, read it, then run part 3.
--
-- "Will get a developer" is the number of imported projects that
-- resolved a branch and have no developer row yet. "Already has one"
-- is left alone - a developer somebody recorded by hand outranks
-- anything this script would add, and a second row fighting over
-- Is_Main is worse than no row at all.
--
-- "No branch to give" is expected and is not a fault: those are the
-- projects whose customer has not been migrated yet, or whose
-- organisation has several branches and the choice was left to a
-- person. Each one names its company in its own Notes. Run this file
-- again once they are attached and they will be picked up.
SELECT
  count(*) FILTER (
    WHERE p."Organisation_Branch_ID" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Project_Developer" d
                       WHERE d."Project_ID" = p."Project_ID")
  )                                                      AS "Will get a developer",
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM "Project_Developer" d
                   WHERE d."Project_ID" = p."Project_ID")
  )                                                      AS "Already has one",
  count(*) FILTER (
    WHERE p."Organisation_Branch_ID" IS NULL
  )                                                      AS "No branch to give",
  count(*)                                               AS "Imported projects"
  FROM "Project" p
 WHERE p."Legacy_Contract_ID" IS NOT NULL
    OR p."Legacy_Tender_ID" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
--  3. Create the records
-- ────────────────────────────────────────────────────────────────────
--
-- ── Restricted to imported projects, deliberately ──
--
-- The Legacy_ guard is the whole safety of this script. Without it this
-- would reach the real projects people are working on and add a main
-- developer to any that happen to hold a cached branch and no record -
-- and 0231 counted six of those on the live data. Those six want a
-- person deciding, on the Stakeholder tab, not a migration script
-- guessing from a stale cache.
--
-- ── Is_Main = true ──
--
-- The customer on the old Contract record is the only developer the
-- original app knew about, so it is the main one by default. Where a
-- project turns out to have several, somebody adds them on the
-- Stakeholder tab and moves the mark; this is a starting point that is
-- right far more often than it is wrong.
--
-- ── Customer_ID and Branch_ID are left NULL on purpose ──
--
-- They are still columns on Project_Developer, and they are dead: they
-- pointed at Customer and Customer_Branch, emptied on 26 Aug. Writing
-- the legacy Branch_ID here would have been the obvious thing to do
-- with the value the import already holds, and before 0231 it was a
-- landmine - the old sync body read
--
--     "Organisation_Branch_ID" = CASE
--        WHEN main."Branch_ID" IS NOT NULL THEN NULL
--        ELSE p."Organisation_Branch_ID" END
--
-- and would have nulled out the branch the next time anybody opened
-- the Stakeholder tab. 0231 removed that, so it would be survivable
-- now. It is still left empty: a dead column with a value in it is a
-- column somebody will one day believe.
--
-- The import keeps those legacy keys where they belong - on Project, as
-- Legacy_Customer_ID and Legacy_Branch_ID, named so nobody mistakes
-- them for live foreign keys.
--
-- ── Idempotent ──
--
-- NOT EXISTS on the project rather than on the (project, branch) pair.
-- A project that already has ANY developer is left entirely alone, so
-- running this twice adds nothing, and running it after somebody has
-- done the Stakeholder tab by hand does not argue with them.
INSERT INTO "Project_Developer" (
  "Project_ID", "Organisation_Branch_ID", "Is_Main", "Notes"
)
SELECT p."Project_ID",
       p."Organisation_Branch_ID",
       true,
       'Created by the data migration from the customer on the original '
       || 'app''s Contract record. Check this is the right branch before '
       || 'the developer is given portal access.'
  FROM "Project" p
 WHERE (p."Legacy_Contract_ID" IS NOT NULL OR p."Legacy_Tender_ID" IS NOT NULL)
   AND p."Organisation_Branch_ID" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Project_Developer" d
                    WHERE d."Project_ID" = p."Project_ID");

-- ────────────────────────────────────────────────────────────────────
--  4. Did it work?
-- ────────────────────────────────────────────────────────────────────
--
-- The first figure is what the projects list and the portal will now
-- see. The second must be zero: an imported project holding a cached
-- branch with no record behind it is exactly the state this file
-- exists to remove, so anything left here means part 3 did not reach
-- it.
SELECT
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM "Project_Developer" d
                   WHERE d."Project_ID" = p."Project_ID" AND d."Is_Main")
  )                                                      AS "With a main developer",
  count(*) FILTER (
    WHERE p."Organisation_Branch_ID" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Project_Developer" d
                       WHERE d."Project_ID" = p."Project_ID")
  )                                                      AS "Cache but no record - must be 0",
  count(*) FILTER (
    WHERE p."Organisation_Branch_ID" IS NULL
  )                                                      AS "Still waiting on a customer"
  FROM "Project" p
 WHERE p."Legacy_Contract_ID" IS NOT NULL
    OR p."Legacy_Tender_ID" IS NOT NULL;

-- And that the cache agrees with the record, which the sync trigger
-- should have seen to. Any row back from this is a trigger that did not
-- fire - check sync_project_main_developer() is attached to
-- Project_Developer.
SELECT p."Project_ID", p."Display_Ref",
       p."Organisation_Branch_ID" AS cached,
       d."Organisation_Branch_ID" AS on_the_record
  FROM "Project" p
  JOIN "Project_Developer" d
    ON d."Project_ID" = p."Project_ID" AND d."Is_Main"
 WHERE (p."Legacy_Contract_ID" IS NOT NULL OR p."Legacy_Tender_ID" IS NOT NULL)
   AND p."Organisation_Branch_ID" IS DISTINCT FROM d."Organisation_Branch_ID"
 LIMIT 20;

-- ────────────────────────────────────────────────────────────────────
--  5. Undo
-- ────────────────────────────────────────────────────────────────────
--
-- Only the rows this file created, found by the Notes text it wrote and
-- restricted to imported projects both. A developer somebody added by
-- hand is not touched.
--
-- Note this does NOT put Project."Organisation_Branch_ID" back to null.
-- The import set that, not this file, and the import's own undo deals
-- with it.
--
-- DELETE FROM "Project_Developer" d
--  USING "Project" p
--  WHERE p."Project_ID" = d."Project_ID"
--    AND (p."Legacy_Contract_ID" IS NOT NULL OR p."Legacy_Tender_ID" IS NOT NULL)
--    AND d."Notes" LIKE 'Created by the data migration from the customer%';
