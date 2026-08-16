-- ════════════════════════════════════════════════════════════════
-- 0170 — why a job could not be done
--
-- 0169 left Reason_Code as free text. This makes it a list.
--
-- ── Why a list ──
--
-- A month of "no access at plot 34" is a fact worth having. A month of
-- prose is a month of reading. The whole reason an abort is recorded
-- rather than just allowed is so the pattern can be seen — which sites
-- keep turning the gang away, which developer keeps saying the ground
-- is ready when it is not — and free text cannot be counted.
--
-- ── Why a table rather than a list in the code ──
--
-- The same argument 0116 makes about the statuses. These names are the
-- sort of thing a business changes: somebody will want "Traffic
-- management not in place" split in two, or a reason nobody thought of
-- on the first morning. A table makes that an admin screen instead of a
-- deploy.
--
-- ── Why some of them demand a note ──
--
-- "Other" without a note is worse than no reason at all: it looks like
-- an answer and says nothing. Needs_Note is on the row rather than in
-- the tablet, so the rule travels with the reason — add a vague one
-- later and it comes with the requirement attached.
--
-- ── The office and the operative use the same list ──
--
-- Both routes end in the same row and the same reason. What differs is
-- By_Office, which says who called it — the same outcome, not the same
-- evidence, and the difference is what makes a run of self-aborts on
-- wet Fridays visible.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Field_Abort_Reason" (
  "Reason_Code"  text PRIMARY KEY,
  "Label"        text NOT NULL,

  -- Some reasons are only ever the office's to give: a job called off by
  -- the customer is not something the gang discovers on the doorstep.
  "Office_Only"  boolean NOT NULL DEFAULT false,

  -- Where the reason alone does not say enough.
  "Needs_Note"   boolean NOT NULL DEFAULT false,

  "Sort_Order"   integer NOT NULL DEFAULT 100,
  "Is_Active"    boolean NOT NULL DEFAULT true
);

INSERT INTO "Field_Abort_Reason"
  ("Reason_Code", "Label", "Office_Only", "Needs_Note", "Sort_Order")
SELECT * FROM (VALUES
  ('no_access',      'No access to the property',        false, false, 10),
  ('not_ready',      'Site not ready',                   false, false, 20),
  ('no_materials',   'Materials or plant not on site',   false, false, 30),
  ('services',       'Unidentified services — unsafe to dig', false, true, 40),
  ('no_tm',          'Traffic management not in place',  false, false, 50),
  ('weather',        'Weather',                          false, false, 60),
  ('customer',       'Customer refused or not in',       false, false, 70),
  -- The office's own: a call-off pulled, a job double-booked, a team
  -- moved to something more urgent. An operative on site does not
  -- discover any of these.
  ('rescheduled',    'Moved by the office',              true,  false, 80),
  ('withdrawn',      'Work withdrawn',                   true,  true,  90),
  ('other',          'Something else',                   false, true, 100)
) AS v(c, l, o, n, s)
WHERE NOT EXISTS (SELECT 1 FROM "Field_Abort_Reason");

ALTER TABLE "Field_Abort_Reason" ENABLE ROW LEVEL SECURITY;

-- Pointed at by name, with ON UPDATE CASCADE, for the reason 0116 gives
-- about the statuses: renaming a code in admin rewrites every row
-- holding it, in one statement, rather than leaving orphans.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_abort_reason_fk'
  ) THEN
    -- Anything already recorded against a code that is not in the list
    -- becomes 'other', so the constraint can go on. There should be
    -- none: nothing has been able to abort a job until now.
    UPDATE "Field_Abort" SET "Reason_Code" = 'other'
     WHERE "Reason_Code" NOT IN (SELECT "Reason_Code" FROM "Field_Abort_Reason");

    ALTER TABLE "Field_Abort"
      ADD CONSTRAINT field_abort_reason_fk
      FOREIGN KEY ("Reason_Code") REFERENCES "Field_Abort_Reason" ("Reason_Code")
      ON UPDATE CASCADE;
  END IF;
END $$;


-- ── Check ───────────────────────────────────────────────────────
--
-- The list as an operative sees it — everything not office-only:
--
--   SELECT "Reason_Code", "Label", "Needs_Note"
--     FROM "Field_Abort_Reason"
--    WHERE "Is_Active" AND NOT "Office_Only"
--    ORDER BY "Sort_Order";
--
-- Why work is being lost, most common first. This is the question the
-- list exists to answer:
--
--   SELECT r."Label", count(*) AS times
--     FROM "Field_Abort" a
--     JOIN "Field_Abort_Reason" r USING ("Reason_Code")
--    GROUP BY r."Label" ORDER BY times DESC;
--
-- And the same by site, which is where a pattern usually is:
--
--   SELECT s."Site_Name", r."Label", count(*)
--     FROM "Field_Abort" a
--     JOIN "Field_Abort_Reason" r USING ("Reason_Code")
--     JOIN "Call_Off_Assignment" ca USING ("Assignment_ID")
--     JOIN "Mains_Call_Off_Submission" s USING ("Submission_ID")
--    GROUP BY 1, 2 ORDER BY 3 DESC;
