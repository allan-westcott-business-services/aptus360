-- ════════════════════════════════════════════════════════════════
-- 0147 — splitting a booking two ways
--
-- A booking says one team does one phase, on these plots, over these
-- days. Two things it could not say:
--
--   Which plots on which day. Four plots over three days is not four
--   plots on all three; the gang does some on the Tuesday and the rest
--   on the Wednesday, and a work instruction that says "plots 1-4"
--   against every day tells them to do all four every day.
--
--   Which utilities. One team laying gas and water on plots 1 and 2
--   while another lays the electric is two bookings of the same phase
--   on the same plots, and nothing distinguished them.
--
-- ── Plots per day ──
--
-- On the day row, not the booking. The day rows already exist, one per
-- date worked, and they already carry which half of the day and whether
-- it is off site. Which plots is the same kind of fact.
--
-- Null means what the booking says. That is the ordinary case — most
-- bookings do the same plots throughout — and it means every booking
-- made before today keeps working without a migration of its data.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Call_Off_Work_Day"
  ADD COLUMN IF NOT EXISTS "Plot_Range" text;

COMMENT ON COLUMN "Call_Off_Work_Day"."Plot_Range" IS
  'Which plots this day covers. Null means the whole booking range, which is what most days are.';


-- ── Utilities on a booking ──────────────────────────────────────
-- A table rather than a column, for the same reason the call-off's
-- utilities are one: gas and water together in one trench is the
-- ordinary case, and a single Utility_ID would force two bookings for
-- one gang doing one dig.
--
-- No rows means the booking covers whatever the call-off does. Again
-- the ordinary case, and again it means nothing has to be backfilled.

CREATE TABLE IF NOT EXISTS "Call_Off_Assignment_Utility" (
  "Assignment_Utility_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Assignment_ID"         bigint NOT NULL
    REFERENCES "Call_Off_Assignment" ("Assignment_ID") ON DELETE CASCADE,
  "Utility_ID"            bigint NOT NULL
    REFERENCES "Utility" ("Utility_ID"),
  "Created_At"            timestamptz NOT NULL DEFAULT now()
);

/* The same utility twice on one booking is not a second fact. */
CREATE UNIQUE INDEX IF NOT EXISTS call_off_assignment_utility_once
  ON "Call_Off_Assignment_Utility" ("Assignment_ID", "Utility_ID");

CREATE INDEX IF NOT EXISTS call_off_assignment_utility_assignment
  ON "Call_Off_Assignment_Utility" ("Assignment_ID");

ALTER TABLE "Call_Off_Assignment_Utility" ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
-- Bookings split by utility, and what each covers:
--   SELECT a."Assignment_ID", a."Plot_Range",
--          string_agg(u."Utility", ', ' ORDER BY u."Sort_Order") AS utilities
--     FROM "Call_Off_Assignment" a
--     JOIN "Call_Off_Assignment_Utility" au USING ("Assignment_ID")
--     JOIN "Utility" u USING ("Utility_ID")
--    GROUP BY a."Assignment_ID", a."Plot_Range";
--
-- Days that differ from their booking, which is the whole point of the
-- column and worth being able to list:
--   SELECT d."Assignment_ID", d."Work_Date", d."Plot_Range"
--     FROM "Call_Off_Work_Day" d
--    WHERE d."Plot_Range" IS NOT NULL
--    ORDER BY d."Assignment_ID", d."Work_Date";
