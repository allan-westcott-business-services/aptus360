-- ════════════════════════════════════════════════════════════════
-- 0142 — Human Resources: the tables
--
-- 71 tables lifted from the HR Supabase project, converted to this
-- database's conventions. `people` is not here: it merges into the
-- existing Person table, which 0143 does.
--
-- ── What changed on the way across ──
--
--   uuid keys became bigint identity, and snake_case became the quoted
--   Mixed_Case every other table here uses. Not taste: 48 of the 97
--   foreign keys point at `people`, which becomes Person, which is
--   bigint — so those had to convert whatever happened to the rest, and
--   a schema with two id styles is one where every join crosses between
--   them. Code here also coerces ids with Number(), and Number() of a
--   uuid is NaN, which compares equal to nothing and fails silently.
--
--   Nothing else came across. The HR database holds mock data only, so
--   this is the shape without the contents — no id mapping, no load,
--   nothing to trace back to.
--
-- ── Foreign keys are not here ──
--
-- They are all in 0143, added after every table exists. 97 keys across
-- 72 tables have an ordering; discovering it by rearranging CREATE
-- statements until the file runs is not a good use of anybody's time.
--
-- ── Row level security ──
--
-- On for every table, with no policies, as everywhere else here: the
-- anon key reads nothing and all access goes through the functions.
-- Six tables are additionally left OUT of the allow-list in
-- netlify/functions/admin.js — see the note at the foot of this file.
-- ════════════════════════════════════════════════════════════════


-- ── Accreditation_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Accreditation_Type" (
  "Accreditation_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Professional_Body" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Accreditation_Type" ENABLE ROW LEVEL SECURITY;

-- ── Address ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Address" (
  "Address_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Address_Line_1" text,
  "Address_Line_2" text,
  "City" text,
  "County" text,
  "Postcode" text,
  "Country" text DEFAULT 'United Kingdom',
  "Effective_From" date,
  "Effective_To" date,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;

-- ── Applicant ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Applicant" (
  "Applicant_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "First_Name" text NOT NULL,
  "Last_Name" text NOT NULL,
  "Email" text,
  "Phone" text,
  "CV_Reference" text,
  "Linkedin_URL" text,
  "In_Talent_Pool" boolean DEFAULT false,
  "Talent_Pool_Notes" text,
  "Gdpr_Consent" boolean DEFAULT false,
  "Gdpr_Consent_Date" date,
  "Hired_As" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Applicant" ENABLE ROW LEVEL SECURITY;

-- ── Application ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Application" (
  "Application_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Candidate_ID" bigint,
  "Advert_ID" bigint,
  "Application_Date" date,
  "Status" text DEFAULT 'Received',
  "Created_At" timestamptz DEFAULT now(),
  "Vacancy_ID" bigint,
  "Applicant_ID" bigint,
  "Interview_Invite_Sent" date,
  "Interview_Response" text,
  "Progressed_To_Candidate" boolean DEFAULT false,
  "Talent_Pool" boolean DEFAULT false,
  "Talent_Pool_Notes" text,
  "Notes" text
);
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;

-- ── Audit_Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Audit_Log" (
  "Audit_Log_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Table_Name" text NOT NULL,
  "Record_ID" bigint,
  "Action" text NOT NULL,
  "Changed_By" text,
  "Changed_At" timestamptz DEFAULT now(),
  "Old_Values" jsonb,
  "New_Values" jsonb
);
ALTER TABLE "Audit_Log" ENABLE ROW LEVEL SECURITY;

-- ── Bank_Details ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "Bank_Details" (
  "Bank_Details_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Account_Name" text,
  "Bank_Name" text,
  "Sort_Code" text,
  "Account_Number" text,
  "Building_Society_Roll" text,
  "Payment_Method" text DEFAULT 'BACS',
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Bank_Details" ENABLE ROW LEVEL SECURITY;

-- ── Benefit_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Benefit_Type" (
  "Benefit_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Category" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Benefit_Type" ENABLE ROW LEVEL SECURITY;

-- ── Candidate_Attachment ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Candidate_Attachment" (
  "Candidate_Attachment_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Candidate_ID" bigint NOT NULL,
  "Filename" text NOT NULL,
  "File_Type" text,
  "File_Size" integer,
  "File_Data" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Candidate_Attachment" ENABLE ROW LEVEL SECURITY;

-- ── Candidate ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Candidate" (
  "Candidate_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "First_Name" text NOT NULL,
  "Last_Name" text NOT NULL,
  "Email" text,
  "Phone" text,
  "CV_Reference" text,
  "Hired_As" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Candidate" ENABLE ROW LEVEL SECURITY;

-- ── Certificate_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Certificate_Type" (
  "Certificate_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Issuing_Body" text,
  "Validity_Months" integer,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Certificate_Type" ENABLE ROW LEVEL SECURITY;

-- ── Contingent_Worker ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Contingent_Worker" (
  "Contingent_Worker_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Worker_Type" text NOT NULL,
  "Agency_ID" bigint,
  "Contract_Start" date,
  "Contract_End" date,
  "Day_Rate" numeric,
  "Pay_Currency" text DEFAULT 'GBP',
  "Ir35_Status" text,
  "Purchase_Order" text,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Contingent_Worker" ENABLE ROW LEVEL SECURITY;

-- ── DBS_Check ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "DBS_Check" (
  "DBS_Check_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Check_Type" text NOT NULL,
  "Certificate_Number" text,
  "Application_Date" date,
  "Issue_Date" date,
  "Expiry_Date" date,
  "Status" text DEFAULT 'Pending',
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "DBS_Check" ENABLE ROW LEVEL SECURITY;

-- ── Department ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Department" (
  "Department_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Code" text,
  "Cost_Centre" text,
  "Parent_ID" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;

-- ── Disciplinary ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "Disciplinary" (
  "Disciplinary_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Interaction_ID" bigint NOT NULL,
  "Stage" text,
  "Alleged_Misconduct" text,
  "Outcome" text,
  "Appeal_Lodged" boolean DEFAULT false,
  "Appeal_Outcome" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Disciplinary" ENABLE ROW LEVEL SECURITY;

-- ── Documents_Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Documents_Log" (
  "Documents_Log_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Document_Type" text,
  "File_Reference" text,
  "Issue_Date" date,
  "Expiry_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Documents_Log" ENABLE ROW LEVEL SECURITY;

-- ── Driving_Licence_Check ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Driving_Licence_Check" (
  "Driving_Licence_Check_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Licence_Number" text,
  "Expiry_Date" date,
  "Check_Date" date,
  "Categories" text,
  "Endorsements" text,
  "Points" integer,
  "Result" text,
  "Next_Check_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Driving_Licence_Check" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Accreditation ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Accreditation" (
  "Employee_Accreditation_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Accreditation_Type_ID" bigint NOT NULL,
  "Membership_Number" text,
  "Issue_Date" date,
  "Renewal_Date" date,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Accreditation" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Benefit ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Benefit" (
  "Employee_Benefit_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Benefit_Type_ID" bigint,
  "Provider" text,
  "Start_Date" date,
  "End_Date" date,
  "Employer_Contribution" numeric,
  "Employee_Contribution" numeric,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Benefit" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Certificate ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Certificate" (
  "Employee_Certificate_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Certificate_Type_ID" bigint NOT NULL,
  "Issue_Date" date,
  "Expiry_Date" date,
  "Certificate_Number" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Certificate" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Onboarding_Content ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Onboarding_Content" (
  "Employee_Onboarding_Content_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Content_ID" bigint NOT NULL,
  "Completion_Date" date,
  "Score" numeric,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Onboarding_Content" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Onboarding_Task ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Onboarding_Task" (
  "Employee_Onboarding_Task_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Task_ID" bigint NOT NULL,
  "Completion_Date" date,
  "Completed_By" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Onboarding_Task" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Pay ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Pay" (
  "Employee_Pay_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Salary_Band_ID" bigint,
  "Salary" numeric NOT NULL,
  "Pay_Frequency" text DEFAULT 'Monthly',
  "Effective_Date" date NOT NULL,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Pay" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Role ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Role" (
  "Employee_Role_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Role_ID" bigint NOT NULL,
  "Start_Date" date NOT NULL,
  "End_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Role" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Skill ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Skill" (
  "Employee_Skill_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Skill_ID" bigint NOT NULL,
  "Proficiency_Level" text,
  "Date_Acquired" date,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Skill" ENABLE ROW LEVEL SECURITY;

-- ── Employee_Training ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employee_Training" (
  "Employee_Training_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Course_ID" bigint NOT NULL,
  "Date_Attended" date NOT NULL,
  "Passed" boolean,
  "Score" numeric,
  "Renewal_Due" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employee_Training" ENABLE ROW LEVEL SECURITY;

-- ── Employment ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Employment" (
  "Employment_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Start_Date" date NOT NULL,
  "Employment_Type" text,
  "Probation_End_Date" date,
  "Status" text DEFAULT 'Active',
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Employment" ENABLE ROW LEVEL SECURITY;

-- ── Equipment_Assignment ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Equipment_Assignment" (
  "Equipment_Assignment_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Equipment_Type_ID" bigint NOT NULL,
  "Asset_Tag" text,
  "Serial_Number" text,
  "Issued_Date" date NOT NULL,
  "Condition_Issued" text,
  "Returned_Date" date,
  "Condition_Returned" text,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Equipment_Assignment" ENABLE ROW LEVEL SECURITY;

-- ── Equipment_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Equipment_Type" (
  "Equipment_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Equipment_Type" ENABLE ROW LEVEL SECURITY;

-- ── Grievance ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "Grievance" (
  "Grievance_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Interaction_ID" bigint NOT NULL,
  "Category" text,
  "Respondent" text,
  "Outcome" text,
  "Appeal_Lodged" boolean DEFAULT false,
  "Appeal_Outcome" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Grievance" ENABLE ROW LEVEL SECURITY;

-- ── Headcount_Budget ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Headcount_Budget" (
  "Headcount_Budget_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Department_ID" bigint,
  "Financial_Year" text NOT NULL,
  "Budgeted_Headcount" integer,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Headcount_Budget" ENABLE ROW LEVEL SECURITY;

-- ── Hierarchy ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Hierarchy" (
  "Hierarchy_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Manager_ID" bigint NOT NULL,
  "Effective_From" date NOT NULL,
  "Effective_To" date,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Hierarchy" ENABLE ROW LEVEL SECURITY;

-- ── Interaction_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Interaction_Type" (
  "Interaction_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Interaction_Type" ENABLE ROW LEVEL SECURITY;

-- ── Interaction ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Interaction" (
  "Interaction_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Interaction_Type_ID" bigint NOT NULL,
  "Interaction_Date" date NOT NULL,
  "Conducted_By" text,
  "Notes" text,
  "Outcome" text,
  "Follow_Up_Date" date,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Interaction" ENABLE ROW LEVEL SECURITY;

-- ── Interview_Format_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Interview_Format_Type" (
  "Interview_Format_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Interview_Format_Type" ENABLE ROW LEVEL SECURITY;

-- ── Interview_Stage ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Interview_Stage" (
  "Interview_Stage_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Application_ID" bigint NOT NULL,
  "Stage_Type" text,
  "Stage_Date" date,
  "Interviewer" text,
  "Outcome" text,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now(),
  "Stage_Number" integer,
  "Stage_Time" text,
  "Method" text,
  "Stage_Types" text,
  "Interviewers" text,
  "Suggested_Vacancy_ID" bigint
);
ALTER TABLE "Interview_Stage" ENABLE ROW LEVEL SECURITY;

-- ── Job_Advert ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Job_Advert" (
  "Job_Advert_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Role_ID" bigint,
  "Title" text,
  "Advert_Text" text,
  "Posted_Date" date,
  "Closing_Date" date,
  "Channels" text[],
  "Salary_Shown" text,
  "Status" text DEFAULT 'Draft',
  "Created_At" timestamptz DEFAULT now(),
  "Vacancy_ID" bigint,
  "Platform" text,
  "Platform_Name" text,
  "URL" text,
  "Cost" numeric
);
ALTER TABLE "Job_Advert" ENABLE ROW LEVEL SECURITY;

-- ── Job_Site ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Job_Site" (
  "Job_Site_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "URL" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Job_Site" ENABLE ROW LEVEL SECURITY;

-- ── Job_Title ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Job_Title" (
  "Job_Title_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Title" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Job_Title" ENABLE ROW LEVEL SECURITY;

-- ── Leave_Entitlement ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Leave_Entitlement" (
  "Leave_Entitlement_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Leave_Type_ID" bigint,
  "Year" integer NOT NULL,
  "Days_Entitlement" numeric NOT NULL,
  "Days_Carried_Over" numeric,
  "Days_Adjustment" numeric,
  "Adjustment_Reason" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Leave_Entitlement" ENABLE ROW LEVEL SECURITY;

-- ── Leave_Request ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Leave_Request" (
  "Leave_Request_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Leave_Type_ID" bigint,
  "Start_Date" date NOT NULL,
  "End_Date" date NOT NULL,
  "Total_Days" numeric NOT NULL,
  "Half_Day" boolean DEFAULT false,
  "Half_Day_Period" text,
  "Status" text DEFAULT 'Pending',
  "Approved_By" bigint,
  "Approved_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Leave_Request" ENABLE ROW LEVEL SECURITY;

-- ── Leave_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Leave_Type" (
  "Leave_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Is_Paid" boolean DEFAULT true,
  "Default_Days" numeric,
  "Colour" text DEFAULT '#3b82f6',
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Leave_Type" ENABLE ROW LEVEL SECURITY;

-- ── Leaver_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Leaver_Type" (
  "Leaver_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Leaver_Type" ENABLE ROW LEVEL SECURITY;

-- ── Leaver ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Leaver" (
  "Leaver_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Leaver_Type_ID" bigint,
  "Notice_Given_Date" date,
  "Last_Working_Day" date NOT NULL,
  "Exit_Interview_Done" boolean DEFAULT false,
  "Eligible_For_Rehire" boolean,
  "Linked_Disciplinary" bigint,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now(),
  "Notice_Flexible" boolean,
  "Notice_Served_Weeks" integer,
  "Notice_Waived" boolean DEFAULT false
);
ALTER TABLE "Leaver" ENABLE ROW LEVEL SECURITY;

-- ── Mentoring_Relationship ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Mentoring_Relationship" (
  "Mentoring_Relationship_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Mentor_ID" bigint NOT NULL,
  "Mentee_ID" bigint NOT NULL,
  "Start_Date" date,
  "End_Date" date,
  "Focus_Areas" text,
  "Meeting_Frequency" text,
  "Status" text DEFAULT 'Active',
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Mentoring_Relationship" ENABLE ROW LEVEL SECURITY;

-- ── Next_Of_Kin ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Next_Of_Kin" (
  "Next_Of_Kin_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Name" text NOT NULL,
  "Relationship" text,
  "Phone" text,
  "Email" text,
  "Is_Primary" boolean DEFAULT false,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Next_Of_Kin" ENABLE ROW LEVEL SECURITY;

-- ── Objective ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Objective" (
  "Objective_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Review_ID" bigint,
  "Title" text NOT NULL,
  "Description" text,
  "Target_Date" date,
  "Status" text DEFAULT 'Not Started',
  "Weight" numeric,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Objective" ENABLE ROW LEVEL SECURITY;

-- ── Offer ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Offer" (
  "Offer_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Application_ID" bigint NOT NULL,
  "Salary_Offered" numeric,
  "Start_Date" date,
  "Status" text DEFAULT 'Pending',
  "Notes" text,
  "Created_At" timestamptz DEFAULT now(),
  "Offered_By" bigint,
  "Offer_Date" date,
  "Probation_Months" integer,
  "Notice_Weeks" integer,
  "Other_Terms" text,
  "Response_Date" date,
  "Variation_Requested" text,
  "Variation_Approved" boolean,
  "Variation_Outcome" text,
  "Escalated" boolean DEFAULT false
);
ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;

-- ── Office_Location ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Office_Location" (
  "Office_Location_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Address_Line_1" text,
  "Address_Line_2" text,
  "City" text,
  "County" text,
  "Postcode" text,
  "Country" text DEFAULT 'United Kingdom',
  "Phone" text,
  "Email" text,
  "Is_Primary" boolean DEFAULT false,
  "Created_At" timestamptz DEFAULT now(),
  "Location_Type" text DEFAULT 'Office'
);
ALTER TABLE "Office_Location" ENABLE ROW LEVEL SECURITY;

-- ── OH_Referral ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "OH_Referral" (
  "OH_Referral_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Referral_Date" date NOT NULL,
  "Reason" text,
  "Referred_By" bigint,
  "Appointment_Date" date,
  "Outcome" text,
  "Recommendations" text,
  "Follow_Up_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "OH_Referral" ENABLE ROW LEVEL SECURITY;

-- ── Onboarding_Content ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Onboarding_Content" (
  "Onboarding_Content_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Title" text NOT NULL,
  "Content_Type" text,
  "Version" text,
  "URL_Or_Path" text,
  "Department_ID" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Onboarding_Content" ENABLE ROW LEVEL SECURITY;

-- ── Onboarding_Content_Type ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Onboarding_Content_Type" (
  "Onboarding_Content_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Onboarding_Content_Type" ENABLE ROW LEVEL SECURITY;

-- ── Onboarding_Task ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Onboarding_Task" (
  "Onboarding_Task_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Task_Name" text NOT NULL,
  "Description" text,
  "Department_ID" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Onboarding_Task" ENABLE ROW LEVEL SECURITY;

-- ── Performance_Review ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Performance_Review" (
  "Performance_Review_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Reviewer_ID" bigint,
  "Review_Date" date NOT NULL,
  "Rating" text,
  "Objectives" text,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now(),
  "Next_Review_Date" date,
  "Rating_Score" integer,
  "Probation_Review" boolean DEFAULT false,
  "Conducted_By" bigint
);
ALTER TABLE "Performance_Review" ENABLE ROW LEVEL SECURITY;

-- ── Person_Document ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Person_Document" (
  "Person_Document_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Document_Type" text NOT NULL,
  "Reference_Number" text,
  "Issue_Date" date,
  "Expiry_Date" date,
  "Issuing_Authority" text,
  "Verified_By" bigint,
  "Verified_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Person_Document" ENABLE ROW LEVEL SECURITY;

-- ── PIP_Record ─────────────────────────────────────────────
-- Sensitive: created here but deliberately not served by the
-- admin endpoint. See the foot of this file.
CREATE TABLE IF NOT EXISTS "PIP_Record" (
  "PIP_Record_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Start_Date" date NOT NULL,
  "End_Date" date,
  "Reason" text,
  "Targets" text,
  "Review_Date" date,
  "Outcome" text,
  "Conducted_By" bigint,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "PIP_Record" ENABLE ROW LEVEL SECURITY;

-- ── Recruitment_Agency ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Recruitment_Agency" (
  "Recruitment_Agency_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Contact_Name" text,
  "Email" text,
  "Phone" text,
  "Website" text,
  "Account_Manager" text,
  "Fee_Percentage" numeric,
  "Terms_Agreed" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Recruitment_Agency" ENABLE ROW LEVEL SECURITY;

-- ── Referee ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Referee" (
  "Referee_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Candidate_ID" bigint NOT NULL,
  "Name" text,
  "Company" text,
  "Email" text,
  "Phone" text,
  "Reference_Received" date,
  "Outcome" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Referee" ENABLE ROW LEVEL SECURITY;

-- ── Return_To_Work_Form ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Return_To_Work_Form" (
  "Return_To_Work_Form_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Sickness_Record_ID" bigint,
  "Person_ID" bigint NOT NULL,
  "Meeting_Date" date NOT NULL,
  "Conducted_By" bigint,
  "Employee_Fit" boolean DEFAULT true,
  "Phased_Return" boolean DEFAULT false,
  "Adjusted_Duties" boolean DEFAULT false,
  "Support_Agreed" text,
  "Next_Review_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Return_To_Work_Form" ENABLE ROW LEVEL SECURITY;

-- ── Job_Role ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Job_Role" (
  "Job_Role_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Job_Title_ID" bigint,
  "Department_ID" bigint,
  "Salary_Band_ID" bigint,
  "Fte" numeric,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Job_Role" ENABLE ROW LEVEL SECURITY;

-- ── Salary_Band ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Salary_Band" (
  "Salary_Band_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Band_Name" text NOT NULL,
  "Grade" text,
  "Min_Salary" numeric NOT NULL,
  "Max_Salary" numeric NOT NULL,
  "Currency" text DEFAULT 'GBP',
  "Effective_Date" date NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Salary_Band" ENABLE ROW LEVEL SECURITY;

-- ── Sector_Magazine ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Sector_Magazine" (
  "Sector_Magazine_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Publisher" text,
  "Sector" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Sector_Magazine" ENABLE ROW LEVEL SECURITY;

-- ── Sickness_Category ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Sickness_Category" (
  "Sickness_Category_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Sickness_Category" ENABLE ROW LEVEL SECURITY;

-- ── Sickness_Record ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Sickness_Record" (
  "Sickness_Record_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Interaction_ID" bigint NOT NULL,
  "Sickness_Category_ID" bigint,
  "Fit_Note_Received" boolean DEFAULT false,
  "Return_To_Work_Date" date,
  "Self_Cert" boolean DEFAULT false,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Sickness_Record" ENABLE ROW LEVEL SECURITY;

-- ── Skill_Category ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Skill_Category" (
  "Skill_Category_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Skill_Category" ENABLE ROW LEVEL SECURITY;

-- ── Skill ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Skill" (
  "Skill_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Category_ID" bigint,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;

-- ── Succession_Plan ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Succession_Plan" (
  "Succession_Plan_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Role_ID" bigint,
  "Primary_Successor_ID" bigint,
  "Secondary_Successor_ID" bigint,
  "Readiness" text,
  "Development_Needed" text,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Succession_Plan" ENABLE ROW LEVEL SECURITY;

-- ── Timesheet_Entry ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Timesheet_Entry" (
  "Timesheet_Entry_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Timesheet_ID" bigint NOT NULL,
  "Work_Date" date NOT NULL,
  "Hours_Worked" numeric NOT NULL,
  "Project_Code" text,
  "Description" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Timesheet_Entry" ENABLE ROW LEVEL SECURITY;

-- ── Timesheet ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Timesheet" (
  "Timesheet_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Week_Start_Date" date NOT NULL,
  "Submitted_Date" date,
  "Approved_By" bigint,
  "Approved_Date" date,
  "Status" text DEFAULT 'Draft',
  "Total_Hours" numeric,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Timesheet" ENABLE ROW LEVEL SECURITY;

-- ── Training_Course ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Training_Course" (
  "Training_Course_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name" text NOT NULL,
  "Provider" text,
  "Course_Type" text,
  "Internal_External" text,
  "Renewal_Months" integer,
  "Created_At" timestamptz DEFAULT now()
);
ALTER TABLE "Training_Course" ENABLE ROW LEVEL SECURITY;

-- ── Vacancy ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Vacancy" (
  "Vacancy_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Title" text NOT NULL,
  "Department_ID" bigint,
  "Job_Title_ID" bigint,
  "Salary_Band_ID" bigint,
  "Salary_From" numeric,
  "Salary_To" numeric,
  "Fte" numeric,
  "Description" text,
  "Requirements" text,
  "Status" text DEFAULT 'Open',
  "Headcount_Approved" boolean DEFAULT false,
  "Hiring_Manager_ID" bigint,
  "Opened_Date" date,
  "Target_Fill_Date" date,
  "Filled_Date" date,
  "Notes" text,
  "Created_At" timestamptz DEFAULT now(),
  "Office_Location_ID" bigint
);
ALTER TABLE "Vacancy" ENABLE ROW LEVEL SECURITY;

-- ── Working_Pattern ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Working_Pattern" (
  "Working_Pattern_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Person_ID" bigint NOT NULL,
  "Contracted_Hours" numeric,
  "Work_Days" text[],
  "Remote_Days" integer,
  "Office_Days" integer,
  "Effective_From" date,
  "Effective_To" date,
  "Created_At" timestamptz DEFAULT now(),
  "Pattern_Name" text,
  "Shift_Type" text
);
ALTER TABLE "Working_Pattern" ENABLE ROW LEVEL SECURITY;


-- ── Tables deliberately not in the admin allow-list ──────────────
-- Bank_Details holds sort codes and account numbers. DBS_Check,
-- Disciplinary, Grievance, OH_Referral and PIP_Record hold the records
-- that do a person the most harm if they leak.
--
-- The allow-list in netlify/functions/admin.js is the whole security
-- model: a table in it is served to any caller who names it. HR has no
-- authentication yet (HANDOVER item 1), so these six are created here
-- and left out of that list. The data is present and migratable; it is
-- simply not reachable from a browser until there is something to check
-- who is asking. Adding each is one line, once there is.
