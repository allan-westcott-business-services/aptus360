-- ════════════════════════════════════════════════════════════════
-- 0146 — which utilities a call-off covers
--
-- A call-off is a request to come and do a piece of work, and what is
-- being laid is part of the request. A gang turning up to an E/G dig
-- needs to know it is electric and gas before they load the van.
--
-- ── Why a table and not a column ──
--
-- One call-off can be more than one utility. "E/G Mains" is electric
-- and gas in the same trench, and that is the ordinary case rather than
-- the exception. A Utility_ID on the submission would force one row per
-- utility and split a single dig into two call-offs that have to be
-- kept in step by hand.
--
-- ── Why not read it from the plots ──
--
-- The plots carry energisation dates per utility, so in principle the
-- utilities could be inferred. They are recorded here instead because
-- the call-off is a statement of intent made before the work: a call-off
-- can be raised for gas on a site whose plots have not been given gas
-- dates yet, and inferring would show it as covering nothing.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Call_Off_Utility" (
  "Call_Off_Utility_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Submission_ID"       bigint NOT NULL
    REFERENCES "Mains_Call_Off_Submission" ("Submission_ID") ON DELETE CASCADE,
  "Utility_ID"          bigint NOT NULL
    REFERENCES "Utility" ("Utility_ID"),
  "Created_At"          timestamptz NOT NULL DEFAULT now()
);

/* ON DELETE CASCADE on the submission, unlike the HR tables: this is
   not a record of what happened, it is a property of a call-off. A
   deleted call-off leaving its utilities behind is orphaned rows
   nothing can reach. */

/* The same utility twice on one call-off is not a second fact. Without
   this a double-click on the tick box records it twice and the call-off
   reads as "Gas, Gas". */
CREATE UNIQUE INDEX IF NOT EXISTS call_off_utility_once
  ON "Call_Off_Utility" ("Submission_ID", "Utility_ID");

/* Looked up by call-off on every read of the screen. */
CREATE INDEX IF NOT EXISTS call_off_utility_submission
  ON "Call_Off_Utility" ("Submission_ID");

ALTER TABLE "Call_Off_Utility" ENABLE ROW LEVEL SECURITY;


-- ── Check ───────────────────────────────────────────────────────
-- What each call-off covers:
--   SELECT s."Submission_ID", s."AP_Number",
--          string_agg(u."Utility", ', ' ORDER BY u."Sort_Order") AS utilities
--     FROM "Mains_Call_Off_Submission" s
--     LEFT JOIN "Call_Off_Utility" cu USING ("Submission_ID")
--     LEFT JOIN "Utility" u USING ("Utility_ID")
--    GROUP BY s."Submission_ID", s."AP_Number"
--    ORDER BY s."Submission_ID";
--
-- Call-offs nobody has said the utilities for. Not a fault in itself —
-- every call-off raised before this migration is one — but the list
-- should shrink rather than grow:
--   SELECT count(*) FROM "Mains_Call_Off_Submission" s
--    WHERE NOT EXISTS (SELECT 1 FROM "Call_Off_Utility" cu
--                       WHERE cu."Submission_ID" = s."Submission_ID");
