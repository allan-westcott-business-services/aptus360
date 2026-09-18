-- ── The enquiry sheet a developer fills in ──
--
-- A new enquiry is a form somebody at a developer completes, and the
-- questions on it are OURS to change without a deploy: they differ by
-- utility, they change when a NAV changes what it wants, and the person
-- who knows what to ask is not the person who can ship code.
--
-- So the form is data. Four tables, and the shape of them is the part
-- worth getting right now, because everything built on top inherits it.
--
--   Enquiry_Form        a version of the sheet. Forms are versioned
--                       rather than edited in place: an enquiry
--                       submitted last month was answered against the
--                       questions as they were, and rewording a
--                       question must not silently rewrite what
--                       somebody said.
--
--   Enquiry_Section     a page or group of questions, so a long sheet
--                       reads as several short ones.
--
--   Enquiry_Question    one question: its type, whether it is required,
--                       and where it sits.
--
--   Enquiry_Option      a choice, for the questions that have them.
--
-- ── Branching ──
--
-- "If the answer is Yes, skip question 4 and jump to 5."
--
-- Held as rules ON THE OPTION, not on the question: a jump is a
-- property of the ANSWER given, and every alternative — a rule table
-- keyed on question plus value, an expression on the question — ends up
-- re-deriving which answer it was. `Next_Question_ID` and
-- `Next_Section_ID` say where an answer leads; both null means carry on
-- in order, which is what almost every answer does.
--
-- A jump goes FORWARD only. That is a constraint worth having and not
-- an oversight: a form that can jump backwards can loop, and a loop in
-- a form somebody is filling in is a trap with no way out. Enforced
-- where the rule is written rather than by the renderer, because a
-- renderer that has to detect loops is a renderer nobody can reason
-- about.
--
-- ── What is NOT here ──
--
-- The answers. They are a separate concern with a separate lifetime —
-- a submitted enquiry outlives the form it was answered against — and
-- they come with the submission work, not with the question editor.

CREATE TABLE IF NOT EXISTS "Enquiry_Form" (
  "Enquiry_Form_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Form_Name"        text NOT NULL,
  "Version"          integer NOT NULL DEFAULT 1,
  -- Only one form is offered to a developer at a time. A new version is
  -- published by making it current; the old one stays for the enquiries
  -- that were answered against it.
  "Is_Current"       boolean NOT NULL DEFAULT false,
  "Utility"          text,
  "Notes"            text,
  "Created_At"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Enquiry_Section" (
  "Enquiry_Section_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Form_ID"    bigint NOT NULL REFERENCES "Enquiry_Form" ON DELETE CASCADE,
  "Title"              text NOT NULL,
  "Blurb"              text,
  "Sort_Order"         integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Enquiry_Question" (
  "Enquiry_Question_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Section_ID"  bigint NOT NULL REFERENCES "Enquiry_Section" ON DELETE CASCADE,
  "Question"            text NOT NULL,
  "Help_Text"           text,
  -- The five kinds asked for. `document` is an attachment; `choice` is
  -- one answer from a list, drawn as radios or a dropdown by how many
  -- options it has; `multi` is any number of them.
  "Answer_Type"         text NOT NULL,
  "Is_Required"         boolean NOT NULL DEFAULT false,
  "Sort_Order"          integer NOT NULL DEFAULT 0,
  CONSTRAINT enquiry_answer_type CHECK ("Answer_Type" IN
    ('text', 'long_text', 'number', 'date', 'document', 'choice', 'multi'))
);

CREATE TABLE IF NOT EXISTS "Enquiry_Option" (
  "Enquiry_Option_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Question_ID" bigint NOT NULL REFERENCES "Enquiry_Question" ON DELETE CASCADE,
  "Label"               text NOT NULL,
  "Sort_Order"          integer NOT NULL DEFAULT 0,
  -- Where this ANSWER leads. Both null: carry on in order.
  "Next_Question_ID"    bigint REFERENCES "Enquiry_Question",
  "Next_Section_ID"     bigint REFERENCES "Enquiry_Section"
);

ALTER TABLE "Enquiry_Form"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Section"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Option"   ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS enquiry_section_form_idx
  ON "Enquiry_Section" ("Enquiry_Form_ID", "Sort_Order");
CREATE INDEX IF NOT EXISTS enquiry_question_section_idx
  ON "Enquiry_Question" ("Enquiry_Section_ID", "Sort_Order");
CREATE INDEX IF NOT EXISTS enquiry_option_question_idx
  ON "Enquiry_Option" ("Enquiry_Question_ID", "Sort_Order");

-- Only one current form per utility, so "which sheet does a developer
-- get" has one answer rather than the newest row winning by accident.
CREATE UNIQUE INDEX IF NOT EXISTS enquiry_form_current_idx
  ON "Enquiry_Form" (COALESCE("Utility", '')) WHERE "Is_Current";

-- Checks worth running after this:
--
--   SELECT f."Form_Name", s."Title", q."Question", q."Answer_Type"
--     FROM "Enquiry_Form" f
--     JOIN "Enquiry_Section" s ON s."Enquiry_Form_ID" = f."Enquiry_Form_ID"
--     JOIN "Enquiry_Question" q ON q."Enquiry_Section_ID" = s."Enquiry_Section_ID"
--    WHERE f."Is_Current"
--    ORDER BY s."Sort_Order", q."Sort_Order";
