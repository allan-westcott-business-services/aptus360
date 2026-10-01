-- ── An answer that rules the others out ──────────────────────────────
--
-- Asked for, about a "Several choices" question reading "Do you require
-- temporary electric and water supplies?" with the answers
--
--   No - we do not require any
--   Yes, electric
--   Yes, water
--
--   "I need a single question that allows the user to answer yes or no.
--    If the user selects Yes to the first answer, I want the checkboxes
--    underneath to become visible. In this example, selecting 'No - we
--    do not require any' would mean that the 'Yes, electric' and 'Yes,
--    water' checkboxes would be disabled. I want to do this in a single
--    question rather than split across 2 questions."
--
-- Without it the sheet has to ask twice — "do you need any?" and then
-- "which?" — which is two questions where the developer has one thought,
-- and two jump targets to keep in step with each other.
--
-- ── Why a flag on the ANSWER ──
--
-- It is a fact about that answer: "none of these" is incompatible with
-- the rest, and nothing else about the question changes. A column on the
-- QUESTION would have to name which answer is the exclusive one, which
-- is a foreign key to a row in the same table pointing back at itself,
-- and it could not say "No" and "Not applicable" are both exclusive.
--
-- More than one is allowed deliberately. A sheet asking which utilities
-- are wanted may reasonably offer both "None" and "Not yet decided", and
-- each rules the others out without ruling the other one out any
-- differently.
--
-- ── Nothing changes for an existing sheet ──
--
-- DEFAULT false, so every answer already written goes on behaving as it
-- does: tickable alongside any other. The flag only does something where
-- somebody sets it.

ALTER TABLE "Enquiry_Option"
  ADD COLUMN IF NOT EXISTS "Is_Exclusive" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "Enquiry_Option"."Is_Exclusive" IS
  'On a Several-choices question: choosing this answer clears every other '
  'and disables them, and choosing any other clears this. For "none of the '
  'above" answers. Ignored on a single-choice question, where the answers '
  'already exclude each other.';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'Enquiry_Option' AND column_name = 'Is_Exclusive';
  IF n = 0 THEN
    RAISE EXCEPTION 'Enquiry_Option."Is_Exclusive" was not added, so an answer '
      'cannot be made to rule the others out.';
  END IF;
  RAISE NOTICE 'An enquiry answer can now rule the others out. Every existing '
    'answer is false and behaves exactly as before.';
END $$;

-- Checks worth running after this:
--
--   -- Which answers rule the others out, and on which question
--   SELECT q."Question", o."Label"
--     FROM "Enquiry_Option" o
--     JOIN "Enquiry_Question" q USING ("Enquiry_Question_ID")
--    WHERE o."Is_Exclusive";
--
--   -- A question where EVERY answer is exclusive is a single-choice
--   -- question wearing the wrong type. Not refused — somebody may be
--   -- part way through editing one — but worth a look.
--   SELECT q."Enquiry_Question_ID", q."Question", count(*) AS answers,
--          count(*) FILTER (WHERE o."Is_Exclusive") AS exclusive
--     FROM "Enquiry_Question" q
--     JOIN "Enquiry_Option" o USING ("Enquiry_Question_ID")
--    WHERE q."Answer_Type" = 'choice_many'
--    GROUP BY 1, 2
--   HAVING count(*) = count(*) FILTER (WHERE o."Is_Exclusive");
