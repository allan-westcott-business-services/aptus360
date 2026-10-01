-- ── An answer that asks for more ─────────────────────────────────────
--
-- Asked for:
--
--   "Sometimes we will have radio buttons and/or check boxes that, if
--    selected, will require a supporting text box in which additional
--    information is required."
--
-- The case on screen is "Other - please specify" under "What load does
-- your compound require?", beside "Standard - 20 kVA". Choosing Other
-- answers nothing on its own: the figure is the answer, and without
-- somewhere to put it the enquiry arrives saying only that the standard
-- did not suit.
--
-- ── A flag on the ANSWER, like 0243 ──
--
-- Same reasoning. It is a fact about that answer — "Other" wants
-- explaining and "Standard - 20 kVA" does not — and nothing else about
-- the question changes. On the question it would have to name which
-- answer, and could not say that two of them want detail.
--
-- Radio and checkbox both, because the report says both. Nothing here
-- is specific to how many answers can be chosen at once.
--
-- ── Detail_Prompt ──
--
-- What the box is labelled. Null means "Please specify", which suits
-- most of them; a question wanting "How many, and of what size?" can
-- say so rather than leaving the developer to guess what is wanted
-- from a bare box.
--
-- ── Where the typed text goes ──
--
-- Nowhere new. An enquiry answer is already stored as the option's
-- LABEL — `Enquiry_Answer.Answer_Text`, so it reads years later beside
-- the question it answered — and the detail is appended to it:
--
--   Other - please specify: 11 kVA three phase
--
-- A column of its own would need every reader of an answer to know to
-- look in two places, and the one that forgot would show half an
-- answer. The whole answer is the sentence.
--
-- ── Nothing changes for an existing sheet ──
--
-- DEFAULT false. Every answer already written goes on being answered by
-- choosing it.

ALTER TABLE "Enquiry_Option"
  ADD COLUMN IF NOT EXISTS "Needs_Detail"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "Detail_Prompt"  text;

COMMENT ON COLUMN "Enquiry_Option"."Needs_Detail" IS
  'Choosing this answer opens a text box that must be filled in before the '
  'developer can go on. For "Other - please specify" and the like. The typed '
  'text is appended to this answer''s label in Enquiry_Answer.Answer_Text.';
COMMENT ON COLUMN "Enquiry_Option"."Detail_Prompt" IS
  'What to label that box. Null reads "Please specify".';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'Enquiry_Option'
     AND column_name IN ('Needs_Detail', 'Detail_Prompt');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Enquiry_Option is missing Needs_Detail or Detail_Prompt, '
      'so an answer cannot ask for more.';
  END IF;
  RAISE NOTICE 'An enquiry answer can now ask for supporting detail. Every '
    'existing answer is false and behaves exactly as before.';
END $$;

-- Checks worth running after this:
--
--   -- Which answers ask for detail, and what they call the box
--   SELECT q."Question", o."Label",
--          COALESCE(o."Detail_Prompt", 'Please specify') AS prompt
--     FROM "Enquiry_Option" o
--     JOIN "Enquiry_Question" q USING ("Enquiry_Question_ID")
--    WHERE o."Needs_Detail";
--
--   -- An answer that both rules the others out AND wants detail is
--   -- legitimate ("None - and here is why"), but worth a look: most
--   -- "none of the above" answers want nothing typed after them.
--   SELECT q."Question", o."Label"
--     FROM "Enquiry_Option" o
--     JOIN "Enquiry_Question" q USING ("Enquiry_Question_ID")
--    WHERE o."Needs_Detail" AND o."Is_Exclusive";
