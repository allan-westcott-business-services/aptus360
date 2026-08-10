-- ════════════════════════════════════════════════════════════════
-- 0141 — Person gains the HR fields
--
-- Person stays the one list of people. It already exists, a trigger on
-- auth.users adds a row whenever a login is created, and 114 places in
-- the application read Person_ID. Moving everybody to a second table
-- would mean changing all of that; adding the HR fields here means
-- changing none of it.
--
-- The HR database holds mock data only, so nothing is imported. These
-- are its fields, not its contents.
--
-- ── Every column is nullable, deliberately ──
--
-- HR's `people` has first_name and last_name NOT NULL. Copying that
-- would break the auth trigger the next time somebody is added in
-- Authentication: the trigger supplies whatever it supplies, and a
-- NOT NULL column it does not know about fails the insert \u2014 inside a
-- trigger, where the error points at auth rather than at here.
--
-- Once the People screen is writing First_Name and Last_Name, those two
-- can be tightened. Not before.
--
-- ADD COLUMN IF NOT EXISTS throughout, so this is safe to run against
-- whatever Person currently holds, and safe to run twice.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Employee_Number" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "First_Name" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Last_Name" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Preferred_Name" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "DOB" date;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Gender" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Pronouns" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Ethnicity" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Disability" boolean;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Disability_Notes" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Nationality" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "NI_Number" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Personal_Email" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Work_Email" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Personal_Phone" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Work_Phone" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Right_To_Work" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "RTW_Expiry" date;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Created_At" timestamptz;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Notice_Period_Weeks" integer;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Probation_Months" integer;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Employment_Type" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Probation_End_Date" date;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Status" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Department_ID" bigint;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Eye_Colour" text;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Office_Location_ID" bigint;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Start_Date" date;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "Photo_URL" text;
