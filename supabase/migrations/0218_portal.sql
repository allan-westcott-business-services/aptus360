-- ── Who else logs in, and what they see ──
--
-- Until now everyone signing in was staff, and the app opened on the
-- section menu. Four audiences now sign in at the same door:
--
--   staff      Aptus staff and contractors - the app as it is
--   developer  a client developer, who sees THEIR sites and nothing else
--   dno        a DNO, gas transporter or water undertaker
--   idno       an IDNO, iGT or NAV
--
-- The audience is a fact about the account, not a preference: somebody
-- choosing "Client Developer" at the door and signing in with a staff
-- account gets the staff app, because the account says so. The squares
-- on the landing page are a signpost, not a permission.
--
-- ── Scoped to whoever they are ──
--
-- A developer account belongs to a CUSTOMER, because that is what a
-- project carries: Project.Customer_ID, and Project_Developer for the
-- sites where more than one developer is involved. A DNO or IDNO
-- account belongs to an ORGANISATION, which is what those are recorded
-- as. Both columns exist and a non-staff account needs the one that
-- suits it.
--
-- That link is the whole security story for the portal: an account
-- with neither sees no sites at all, which is the safe failure.

CREATE TABLE IF NOT EXISTS "Portal_Access" (
  "Portal_Access_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The account, by the email it signs in with. Matched case-insensitively.
  "Email"             text NOT NULL,
  "Audience"          text NOT NULL,
  -- Whose sites they see. Null for staff, one of these for the rest.
  "Customer_ID"       bigint REFERENCES "Customer",
  "Organisation_ID"   bigint REFERENCES "Organisation",
  "Full_Name"         text,
  "Is_Active"         boolean NOT NULL DEFAULT true,
  "Notes"             text,
  CONSTRAINT portal_audience CHECK
    ("Audience" IN ('staff','developer','dno','idno')),
  CONSTRAINT portal_scope CHECK
    ("Audience" = 'staff'
      OR "Customer_ID" IS NOT NULL OR "Organisation_ID" IS NOT NULL),
  CONSTRAINT portal_email_once UNIQUE ("Email")
);
ALTER TABLE "Portal_Access" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS portal_access_email
  ON "Portal_Access" (lower("Email"));

-- ── What a developer is shown about a site ──
--
-- Milestones with dates: outline design complete, POC applied for and
-- to whom, quotation received, accepted, works started, energised.
--
-- Recorded rather than derived, deliberately. The dates live in half a
-- dozen places across the system and several of them are nullable, so a
-- portal that derived them would show a developer a blank where the
-- truth is "not yet" and a wrong date where the truth is "changed". A
-- recorded milestone is a statement somebody can stand behind, and the
-- refresh that writes it is a job with one place to look when a date
-- is wrong.
--
-- Source says where a date came from, so a stale one can be traced
-- rather than argued about.
CREATE TABLE IF NOT EXISTS "Project_Milestone" (
  "Project_Milestone_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"        bigint NOT NULL REFERENCES "Project" ON DELETE CASCADE,
  "Milestone_Key"     text NOT NULL,
  "Label"             text NOT NULL,
  "Achieved_On"       date,
  "Due_On"            date,
  -- "POC applied for" is only half an answer without the recipient.
  "Party"             text,
  "Detail"            text,
  "Source"            text,
  "Sort_Order"        integer NOT NULL DEFAULT 0,
  "Updated_At"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT milestone_once UNIQUE ("Project_ID", "Milestone_Key")
);
ALTER TABLE "Project_Milestone" ENABLE ROW LEVEL SECURITY;

-- ── Documents, both directions ──
--
-- We ask a developer for things (a layout, a signed agreement) and we
-- give them things to review, sign and approve. One table, with a
-- direction, because they are the same object at different moments:
-- the thing asked for becomes the thing uploaded.
--
-- The file itself lives in Supabase Storage; this row is the record of
-- it. Storage_Path is null until somebody uploads, which is exactly
-- what makes a row a REQUEST rather than a document.
CREATE TABLE IF NOT EXISTS "Portal_Document" (
  "Portal_Document_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"        bigint NOT NULL REFERENCES "Project" ON DELETE CASCADE,
  -- 'from_developer' we asked for it; 'to_developer' we are giving it.
  "Direction"         text NOT NULL,
  "Title"             text NOT NULL,
  "Detail"            text,
  "Storage_Path"      text,
  "File_Name"         text,
  "Uploaded_By"       text,
  "Uploaded_At"       timestamptz,
  -- For a document we sent: what we need back.
  "Response_Needed"   text,
  "Responded_At"      timestamptz,
  "Due_On"            date,
  "Is_Active"         boolean NOT NULL DEFAULT true,
  "Sort_Order"        integer NOT NULL DEFAULT 0,
  CONSTRAINT portal_doc_direction CHECK
    ("Direction" IN ('from_developer','to_developer')),
  CONSTRAINT portal_doc_response CHECK
    ("Response_Needed" IS NULL
      OR "Response_Needed" IN ('review','sign','approve','acknowledge'))
);
ALTER TABLE "Portal_Document" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS portal_doc_project ON "Portal_Document" ("Project_ID");
CREATE INDEX IF NOT EXISTS milestone_project ON "Project_Milestone" ("Project_ID");

-- ── The milestones a site has ──
--
-- Seeded as definitions rather than per project: a project gets rows
-- when a date is first recorded against it, so a site with nothing
-- achieved yet shows the list with nothing filled in rather than an
-- empty page. The keys are what the refresh job writes against.
CREATE TABLE IF NOT EXISTS "Milestone_Type" (
  "Milestone_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Milestone_Key"     text NOT NULL UNIQUE,
  "Label"             text NOT NULL,
  "Detail"            text,
  "Wants_Party"       boolean NOT NULL DEFAULT false,
  "Sort_Order"        integer NOT NULL DEFAULT 0,
  "Is_Active"         boolean NOT NULL DEFAULT true
);
ALTER TABLE "Milestone_Type" ENABLE ROW LEVEL SECURITY;

INSERT INTO "Milestone_Type"
  ("Milestone_Key","Label","Detail","Wants_Party","Sort_Order")
VALUES
  ('enquiry',        'Enquiry received',      NULL, false, 10),
  ('outline_design', 'Outline design complete', 'The first design issued for your comment', false, 20),
  ('poc_applied',    'POC application submitted', 'Applied to the network owner', true, 30),
  ('poc_quoted',     'POC quotation received', NULL, true, 40),
  ('poc_accepted',   'POC quotation accepted', NULL, false, 50),
  ('detailed_design','Detailed design complete', NULL, false, 60),
  ('adoption_agreed','Adoption agreement signed', NULL, true, 70),
  ('works_start',    'Works started on site',  NULL, false, 80),
  ('energised',      'Energised / commissioned', NULL, false, 90),
  ('complete',       'Site complete',          NULL, false, 100)
ON CONFLICT ("Milestone_Key") DO NOTHING;

-- Checks worth running after this:
--
--   SELECT "Audience", COUNT(*) FROM "Portal_Access" GROUP BY 1;
--   SELECT "Milestone_Key","Label" FROM "Milestone_Type" ORDER BY "Sort_Order";
