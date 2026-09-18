-- ── A sheet somebody has filled in ──
--
-- Answers live apart from questions, and this is the reason: a
-- submitted enquiry outlives the form it was answered against. The
-- questions get reworded, reordered and retired; what somebody said in
-- March must still read in March's terms.
--
-- So an enquiry records the form VERSION it was answered against, and
-- each answer records the question it answered. Reading an old enquiry
-- means reading the old questions, which is why 0225 versions forms
-- rather than editing them in place.
--
-- ── Whose enquiry it is ──
--
-- The BRANCH's, not the sender's. A developer's office is the unit that
-- does business with us: the person who typed it may leave, be covered
-- by a colleague, or send one on somebody else's behalf, and an enquiry
-- that belonged to them alone would disappear with them. The sender is
-- recorded too, because somebody has to be replied to.
--
-- ── Nothing becomes a project by itself ──
--
-- A submitted enquiry waits until somebody here accepts it. That is a
-- decision with money attached — it creates work, a reference and a
-- place in a pipeline — and an inbox that fills itself is an inbox
-- nobody reads. `Status` carries it, and `Project_ID` is filled in only
-- when a project is made, which is also the record that it was.

CREATE TABLE IF NOT EXISTS "Enquiry" (
  "Enquiry_ID"          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Which sheet, as it was on the day.
  "Enquiry_Form_ID"     bigint NOT NULL REFERENCES "Enquiry_Form",

  -- Whose it is, and who sent it.
  "Organisation_Branch_ID" bigint REFERENCES "Organisation_Branch",
  "Organisation_ID"     bigint REFERENCES "Organisation",
  "Submitted_By_Email"  text,
  "Submitted_By_Name"   text,

  "Site_Name"           text,
  "Site_Postcode"       text,

  -- draft while they are filling it in, submitted when they send it,
  -- then accepted or declined by somebody here. A declined enquiry is
  -- kept: "we said no in April" is a thing to be able to answer.
  "Status"              text NOT NULL DEFAULT 'draft',
  "Submitted_At"        timestamptz,
  "Decided_At"          timestamptz,
  "Decided_By"          text,
  "Decision_Note"       text,

  -- Filled in when accepted, and the record that it was.
  "Project_ID"          bigint REFERENCES "Project",

  "Created_At"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enquiry_status CHECK ("Status" IN
    ('draft', 'submitted', 'accepted', 'declined'))
);

CREATE TABLE IF NOT EXISTS "Enquiry_Answer" (
  "Enquiry_Answer_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_ID"          bigint NOT NULL REFERENCES "Enquiry" ON DELETE CASCADE,
  "Enquiry_Question_ID" bigint NOT NULL REFERENCES "Enquiry_Question",

  -- One column per shape of answer rather than one text column for all
  -- of them: a date kept as text is a date nobody can order, and a
  -- number kept as text is one nobody can total. `Chosen` holds the
  -- option ids for a choice or a multi, which is what makes an answer
  -- still readable after somebody rewords the option's label.
  "Answer_Text"         text,
  "Answer_Number"       numeric,
  "Answer_Date"         date,
  "Chosen"              bigint[],

  "Created_At"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enquiry_answer_once UNIQUE ("Enquiry_ID", "Enquiry_Question_ID")
);

CREATE TABLE IF NOT EXISTS "Enquiry_Attachment" (
  "Enquiry_Attachment_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Enquiry_ID"            bigint NOT NULL REFERENCES "Enquiry" ON DELETE CASCADE,
  "Enquiry_Question_ID"   bigint REFERENCES "Enquiry_Question",
  "File_Name"            text NOT NULL,
  -- The path in storage. Composed server-side from the enquiry and the
  -- question, never taken from the caller: a path from a body is a path
  -- somebody else can walk.
  "Storage_Path"         text NOT NULL,
  "Uploaded_At"          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "Enquiry"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Answer"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enquiry_Attachment" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS enquiry_branch_idx
  ON "Enquiry" ("Organisation_Branch_ID", "Status");
CREATE INDEX IF NOT EXISTS enquiry_status_idx ON "Enquiry" ("Status");
CREATE INDEX IF NOT EXISTS enquiry_answer_idx ON "Enquiry_Answer" ("Enquiry_ID");

-- Checks worth running after this:
--
--   -- What is waiting to be accepted:
--   SELECT e."Enquiry_ID", b."Branch_Name", e."Site_Name", e."Submitted_At"
--     FROM "Enquiry" e
--     LEFT JOIN "Organisation_Branch" b
--       ON b."Organisation_Branch_ID" = e."Organisation_Branch_ID"
--    WHERE e."Status" = 'submitted' ORDER BY e."Submitted_At";
