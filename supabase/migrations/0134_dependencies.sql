-- ════════════════════════════════════════════════════════════════
-- 0134 — dependencies between phases
--
-- Jointing follows excavation and lay. Reinstatement follows it too.
-- That is not a preference somebody expresses on each call-off, it is
-- how the work goes: you cannot joint a cable that is not in the ground
-- and you cannot reinstate a trench that is still open.
--
-- So it is a rule between *phases*, not between bookings. Stored once
-- and applied to every call-off, rather than drawn again on each one
-- and forgotten on the one where it mattered.
--
-- ── The three kinds ──
--
-- Finish to start — the first must finish before the second begins.
--   The ordinary one: reinstatement waits for the trench to be closed.
--
-- Start to start — the first must have begun. Two gangs on the same
--   stretch, the second following the first along it.
--
-- Start with delay to start — the first must have begun, and by some
--   margin. Half a day is the case this was asked for: the jointers
--   arrive after lunch on the day the diggers started, not with them.
--
-- The margin is Lag_Halves, in half-days, because that is the unit the
-- schedule is kept in — a Call_Off_Work_Day is a half or a whole. A
-- number rather than three hard-coded kinds, so "start with a day's
-- delay" needs a row and not a release.
--
-- ── What the application does with them ──
--
-- Two things, and they are worth telling apart.
--
-- Moving a booking moves what depends on it, by the same amount. That
-- keeps an arrangement somebody has already made: if jointing was set
-- to start the day after the dig, it still starts the day after when
-- the dig moves. It is not a re-plan, it is the plan travelling.
--
-- The kinds above are what say whether an arrangement is *legal* — a
-- jointing booking dragged to before the dig finishes breaks a finish
-- to start. That check reads these rows.
-- ════════════════════════════════════════════════════════════════


-- ── The kinds ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Dependency_Type" (
  "Dependency_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Dependency_Type"    text NOT NULL,
  /* What the rule is about, in a value code reads. The name above is
     for people and will be edited; this will not. */
  "Kind"               text NOT NULL
    CHECK ("Kind" IN ('finish_to_start', 'start_to_start')),
  /* How far into the first the second may begin, in half-days. Zero for
     the plain kinds. Only meaningful with start_to_start — a finish to
     start with a lag is a different rule and would need its own row. */
  "Lag_Halves"         integer NOT NULL DEFAULT 0,
  "Sort_Order"         integer NOT NULL DEFAULT 100,
  "Is_Active"          boolean NOT NULL DEFAULT true
);

INSERT INTO "Dependency_Type" ("Dependency_Type", "Kind", "Lag_Halves", "Sort_Order")
SELECT * FROM (VALUES
  ('Finish to start',                  'finish_to_start', 0, 10),
  ('Start to start',                   'start_to_start',  0, 20),
  ('Start to start, half a day later', 'start_to_start',  1, 30)
) AS v(n, k, l, o)
WHERE NOT EXISTS (SELECT 1 FROM "Dependency_Type");


-- ── The rules ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Task_Dependency" (
  "Task_Dependency_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* The phase that must happen first, and the one that follows. */
  "Predecessor_Task_Type_ID" bigint NOT NULL REFERENCES "Task_Type" ("Task_Type_ID"),
  "Successor_Task_Type_ID"   bigint NOT NULL REFERENCES "Task_Type" ("Task_Type_ID"),
  "Dependency_Type_ID"       bigint NOT NULL REFERENCES "Dependency_Type" ("Dependency_Type_ID"),
  /* Null means every work type. A mains call-off and a service call-off
     both joint after they dig, and saying so once is better than saying
     it twice and having one of them fall out of step. */
  "Work_Type_ID"             bigint REFERENCES "Work_Type" ("Work_Type_ID"),
  "Is_Active"                boolean NOT NULL DEFAULT true,
  /* A phase cannot depend on itself: that is a cycle of one, and the
     shortest way to hang the thing that walks the graph. */
  CONSTRAINT task_dependency_not_self
    CHECK ("Predecessor_Task_Type_ID" <> "Successor_Task_Type_ID")
);

CREATE UNIQUE INDEX IF NOT EXISTS task_dependency_pair_idx
  ON "Task_Dependency" ("Predecessor_Task_Type_ID", "Successor_Task_Type_ID",
                        COALESCE("Work_Type_ID", -1));


-- ── Jointing and reinstatement follow the dig ───────────────────
--
-- Matched on the phase's name, because that is what identifies these
-- three on a seeded database and the ids differ between environments.
-- "Lay" is accepted for the first because a scheme that separates
-- excavation from laying still has the dig as the thing that comes
-- first; where both exist the excavation is chosen.
--
-- Guarded so it seeds once. Somebody who deletes a rule meant to delete
-- it, and a migration re-run should not put it back.
DO $$
DECLARE dig bigint; fts bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM "Task_Dependency") THEN
    RAISE NOTICE 'Task_Dependency already has rows — not seeding';
    RETURN;
  END IF;

  SELECT "Task_Type_ID" INTO dig FROM "Task_Type"
   WHERE lower("Task_Type_Name") LIKE 'excav%'
   ORDER BY "Display_Order" LIMIT 1;
  IF dig IS NULL THEN
    SELECT "Task_Type_ID" INTO dig FROM "Task_Type"
     WHERE lower("Task_Type_Name") LIKE 'lay%'
     ORDER BY "Display_Order" LIMIT 1;
  END IF;

  SELECT "Dependency_Type_ID" INTO fts FROM "Dependency_Type"
   WHERE "Kind" = 'finish_to_start' AND "Lag_Halves" = 0 LIMIT 1;

  IF dig IS NULL OR fts IS NULL THEN
    RAISE NOTICE 'No excavation phase or no finish-to-start type — not seeding';
    RETURN;
  END IF;

  INSERT INTO "Task_Dependency"
    ("Predecessor_Task_Type_ID", "Successor_Task_Type_ID", "Dependency_Type_ID")
  SELECT dig, t."Task_Type_ID", fts
    FROM "Task_Type" t
   WHERE lower(t."Task_Type_Name") LIKE 'joint%'
      OR lower(t."Task_Type_Name") LIKE 'reinstate%';
END $$;


-- ── Check ───────────────────────────────────────────────────────
-- The rules, in words:
--   SELECT p."Task_Type_Name" AS must_happen_first,
--          d."Dependency_Type"  AS then,
--          s."Task_Type_Name" AS may_start,
--          d."Lag_Halves",
--          COALESCE(w."Work_Type_Name", 'all work types') AS applies_to
--     FROM "Task_Dependency" td
--     JOIN "Task_Type" p ON p."Task_Type_ID" = td."Predecessor_Task_Type_ID"
--     JOIN "Task_Type" s ON s."Task_Type_ID" = td."Successor_Task_Type_ID"
--     JOIN "Dependency_Type" d ON d."Dependency_Type_ID" = td."Dependency_Type_ID"
--     LEFT JOIN "Work_Type" w ON w."Work_Type_ID" = td."Work_Type_ID"
--    WHERE td."Is_Active"
--    ORDER BY p."Task_Type_Name", s."Task_Type_Name";
--
-- Expect two rows on a seeded database: excavation before jointing, and
-- excavation before reinstatement, both finish to start.
--
-- Bookings that break their rule today — jointing that starts before
-- the dig has finished. Nothing enforces this retrospectively; it is
-- worth knowing what is already out of order before turning the check
-- on in anger:
--   SELECT a_s."Assignment_ID", s."Task_Type_Name", a_s."Start_Date",
--          p."Task_Type_Name" AS after, a_p."End_Date"
--     FROM "Task_Dependency" td
--     JOIN "Dependency_Type" d ON d."Dependency_Type_ID" = td."Dependency_Type_ID"
--     JOIN "Call_Off_Assignment" a_p ON a_p."Task_Type_ID" = td."Predecessor_Task_Type_ID"
--     JOIN "Call_Off_Assignment" a_s ON a_s."Task_Type_ID" = td."Successor_Task_Type_ID"
--                                   AND a_s."Submission_ID" = a_p."Submission_ID"
--     JOIN "Task_Type" p ON p."Task_Type_ID" = td."Predecessor_Task_Type_ID"
--     JOIN "Task_Type" s ON s."Task_Type_ID" = td."Successor_Task_Type_ID"
--    WHERE d."Kind" = 'finish_to_start' AND a_s."Start_Date" <= a_p."End_Date"
--    ORDER BY a_s."Start_Date";
