-- ── The enquiry sheet ──
--
-- A developer submits a new enquiry by answering questions we set. The
-- questions change: by audience, by what the last year taught us, by
-- what a particular client always forgets to say. So they are DATA,
-- edited in admin, not a form somebody rebuilds.
--
-- Three tables, and the shape matters more than the columns:
--
--   Enquiry_Form      a version of the sheet. Versions rather than one
--                     living form, because an enquiry answered last
--                     month was answered against the questions as they
--                     were THEN, and a submitted answer whose question
--                     has since changed is unreadable otherwise.
--
--   Enquiry_Question  one question, in a section, with a kind.
--
--   Enquiry_Option    the choices for a question that has them, and —
--                     this is the part worth reading twice — where a
--                     particular answer sends somebody NEXT.
--
-- ── Branching lives on the OPTION, not on the question ──
--
-- "If the answer is Yes, skip question 4 and go to 5" is a fact about
-- the answer Yes, not about the question. Putting it on the option
-- means a question with four choices can send four different ways
-- without a rules engine, and somebody reading the admin screen sees
-- the branch beside the answer that causes it.
--
-- A question also carries a default next (`Next_Question_ID`), for the
-- kinds that have no options: free text, a date, an attachment. Null
-- everywhere means "the next one in order", which is what almost every
-- question wants and nobody should have to say.
--
-- ── What we do NOT do ──
--
-- No conditions of the form "show if Q2 = Yes AND Q7 > 3". That is a
-- rules engine, and every one of them ends up needing a debugger. A
-- single jump per answer covers the sheet as described and can be read
-- by the person maintaining it, which matters more than covering a
-- case nobody has asked for.

CREATE TABLE IF NOT EXISTS "Enquiry_Form" (
  "Enquiry_Form_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Form_Name"        text NOT NULL,
  "Audience"         text,          -- developer, dno, idno; null = all
  "Version"          integer NOT NULL DEFAULT 1,
  -- Only one form is live per audience at a time. The rest are drafts
  -- being written, or history being kept.
  "Is_Live"          boolean NOT NULL DEFAULT false,
  "Notes"            text,
  "Created_At"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Enquiry_Question" (
  "Enquiry_Question_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Form_ID"     bigint NOT NULL REFERENCES "Enquiry_Form"
                          ON DELETE CASCADE,

  -- Sections are a heading and an ordering, not a table: a section
  -- with no questions is not a thing anybody needs to store.
  "Section"             text,
  "Sort_Order"          integer NOT NULL DEFAULT 0,

  "Question"            text NOT NULL,
  "Help_Text"           text,
  -- text | long_text | date | number | file | choice_one | choice_many
  "Kind"                text NOT NULL,
  "Is_Required"         boolean NOT NULL DEFAULT false,

  -- Where an answer goes next when the question has no options to
  -- carry it. Null means the next question in order.
  "Next_Question_ID"    bigint REFERENCES "Enquiry_Question",

  "Is_Active"           boolean NOT NULL DEFAULT true,

  CONSTRAINT enquiry_kind CHECK ("Kind" IN
    ('text','long_text','date','number','file','choice_one','choice_many'))
);

CREATE TABLE IF NOT EXISTS "Enquiry_Option" (
  "Enquiry_Option_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Question_ID" bigint NOT NULL REFERENCES "Enquiry_Question"
                          ON DELETE CASCADE,
  "Label"               text NOT NULL,
  "Sort_Order"          integer NOT NULL DEFAULT 0,

  -- Where THIS answer sends somebody. Null means carry on in order.
  "Next_Question_ID"    bigint REFERENCES "Enquiry_Question",
  -- Or end the sheet here: some answers mean there is nothing more to
  -- ask. Distinct from "next in order", which is why it is not just a
  -- null.
  "Ends_Form"           boolean NOT NULL DEFAULT false,

  "Is_Active"           boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS enquiry_q_form_idx
  ON "Enquiry_Question" ("Enquiry_Form_ID", "Sort_Order");
CREATE INDEX IF NOT EXISTS enquiry_o_q_idx
  ON "Enquiry_Option" ("Enquiry_Question_ID", "Sort_Order");

ALTER TABLE "Enquiry_Form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Option" ENABLE ROW LEVEL SECURITY;

-- ── What comes back ──
--
-- A submission, and one row per answer. The answer is stored as TEXT
-- whatever the kind, with the chosen options recorded separately: a
-- date typed in 2026 should still read as it was typed if the question
-- becomes a dropdown in 2027. Files are stored like the portal's other
-- documents and referenced by path.
CREATE TABLE IF NOT EXISTS "Enquiry_Submission" (
  "Enquiry_Submission_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Form_ID"       bigint NOT NULL REFERENCES "Enquiry_Form",
  "Organisation_ID"       bigint REFERENCES "Organisation",
  "Organisation_Branch_ID" bigint,
  "Submitted_By"          text,          -- the email that signed in
  "Submitted_At"          timestamptz NOT NULL DEFAULT now(),
  -- Set when somebody turns the enquiry into a job, so an enquiry can
  -- be followed to what it became.
  "Project_ID"            bigint REFERENCES "Project",
  "Status"                text NOT NULL DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS "Enquiry_Answer" (
  "Enquiry_Answer_ID"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_Submission_ID" bigint NOT NULL REFERENCES "Enquiry_Submission"
                            ON DELETE CASCADE,
  "Enquiry_Question_ID"   bigint NOT NULL REFERENCES "Enquiry_Question",
  -- The question AS ASKED, copied at submission. A question edited
  -- afterwards must not change what somebody appears to have been
  -- asked.
  "Question_Text"         text,
  "Answer_Text"           text,
  "Storage_Path"          text,
  "Answered_At"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enquiry_ans_sub_idx
  ON "Enquiry_Answer" ("Enquiry_Submission_ID");

ALTER TABLE "Enquiry_Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Answer" ENABLE ROW LEVEL SECURITY;

-- Checks worth running after this:
--
--   SELECT f."Form_Name", f."Audience", f."Is_Live", count(q.*) AS questions
--     FROM "Enquiry_Form" f
--     LEFT JOIN "Enquiry_Question" q ON q."Enquiry_Form_ID" = f."Enquiry_Form_ID"
--    GROUP BY 1,2,3;
