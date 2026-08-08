-- ════════════════════════════════════════════════════════════════
-- 0133 — weekend working on an assignment
--
-- A gang on a programme under pressure works Saturdays, and sometimes
-- half of one. So an assignment records which weekend halves it works,
-- and the days under it are laid from that: a booking that does not
-- work the weekend steps over it and carries on the next weekday,
-- rather than putting two days of work on a site nobody is at.
--
-- ── Why four columns and not four day rows ──
--
-- Call_Off_Work_Day can already say a Saturday morning was worked: a
-- row dated Saturday with Part = 'AM'. But those rows are the *result*
-- of the decision, and the decision has to survive the days changing.
-- A booking running Monday to Wednesday contains no weekend and so has
-- no rows to read; extend it to the Friday and something has to know
-- whether the Saturday counts. Reading rows that do not exist yet is
-- guessing, and the guess would be "no" on a gang that has worked every
-- Saturday this year.
--
-- Four columns rather than one text field or a mask, because each is a
-- separate answer somebody gives and each is queried on its own: "which
-- gangs are in on Sunday morning" is a question with a WHERE clause,
-- and against a packed string it is a LIKE nobody trusts.
--
-- ── Default false, and what that means for what already exists ──
--
-- Every assignment made before this is treated as not working weekends,
-- which is what the great majority of them are. The ones that did have
-- Saturday work already have Call_Off_Work_Day rows dated on a
-- Saturday, and this does not touch them — the rows are what happened
-- and stay exactly as recorded. The flag says what happens *next* time
-- the booking is laid out, so an old assignment that is reopened and
-- saved will drop a weekend day it does not now claim to work. That is
-- visible in the form before it is saved, and is the honest answer:
-- nobody has said that booking works Saturdays.
--
-- The seeding below covers the case that matters — a booking whose
-- existing days include weekend work gets the flags that describe it,
-- so reopening it does not quietly reschedule work already agreed.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Call_Off_Assignment"
  ADD COLUMN IF NOT EXISTS "Sat_AM" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "Sat_PM" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "Sun_AM" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "Sun_PM" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "Call_Off_Assignment"."Sat_AM" IS
  'Whether this booking works Saturday mornings. The days under it are '
  'laid from these four flags; a half not worked is stepped over and '
  'the work continues on the next available day.';


-- ── What the existing days already say ───────────────────────────
-- Guarded on the day table existing, which is the same tolerance the
-- rest of the application applies to it.
--
-- A day marked 'Full' sets both halves of that weekend day: a gang on
-- site all Saturday works the morning and the afternoon.
DO $$
BEGIN
  IF to_regclass('public."Call_Off_Work_Day"') IS NULL THEN
    RAISE NOTICE 'Call_Off_Work_Day not present — nothing to seed from';
    RETURN;
  END IF;

  UPDATE "Call_Off_Assignment" a
     SET "Sat_AM" = s.sat_am, "Sat_PM" = s.sat_pm,
         "Sun_AM" = s.sun_am, "Sun_PM" = s.sun_pm
    FROM (
      SELECT d."Assignment_ID",
             bool_or(EXTRACT(DOW FROM d."Work_Date") = 6
                     AND COALESCE(d."Part", 'Full') IN ('Full', 'AM')) AS sat_am,
             bool_or(EXTRACT(DOW FROM d."Work_Date") = 6
                     AND COALESCE(d."Part", 'Full') IN ('Full', 'PM')) AS sat_pm,
             bool_or(EXTRACT(DOW FROM d."Work_Date") = 0
                     AND COALESCE(d."Part", 'Full') IN ('Full', 'AM')) AS sun_am,
             bool_or(EXTRACT(DOW FROM d."Work_Date") = 0
                     AND COALESCE(d."Part", 'Full') IN ('Full', 'PM')) AS sun_pm
        FROM "Call_Off_Work_Day" d
       GROUP BY d."Assignment_ID"
    ) s
   WHERE s."Assignment_ID" = a."Assignment_ID"
     AND (s.sat_am OR s.sat_pm OR s.sun_am OR s.sun_pm);
END $$;


-- ── Check ───────────────────────────────────────────────────────
-- Which bookings claim weekend working:
--   SELECT "Assignment_ID", "Sat_AM", "Sat_PM", "Sun_AM", "Sun_PM"
--     FROM "Call_Off_Assignment"
--    WHERE "Sat_AM" OR "Sat_PM" OR "Sun_AM" OR "Sun_PM"
--    ORDER BY "Start_Date";
--
-- The seeding above should leave none of these — a booking with work
-- recorded on a weekend day but no flag saying it works weekends:
--   SELECT DISTINCT d."Assignment_ID", d."Work_Date", d."Part"
--     FROM "Call_Off_Work_Day" d
--     JOIN "Call_Off_Assignment" a ON a."Assignment_ID" = d."Assignment_ID"
--    WHERE EXTRACT(DOW FROM d."Work_Date") IN (0, 6)
--      AND NOT (a."Sat_AM" OR a."Sat_PM" OR a."Sun_AM" OR a."Sun_PM")
--    ORDER BY d."Work_Date";
--
-- Who is in this weekend:
--   SELECT t."Team_Name", a."Assignment_ID", a."Sat_AM", a."Sat_PM",
--          a."Sun_AM", a."Sun_PM"
--     FROM "Call_Off_Assignment" a
--     JOIN "Team" t ON t."Team_ID" = a."Team_ID"
--    WHERE (a."Sat_AM" OR a."Sat_PM" OR a."Sun_AM" OR a."Sun_PM")
--      AND a."End_Date" >= current_date
--    ORDER BY a."Start_Date";
