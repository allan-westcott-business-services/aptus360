-- ════════════════════════════════════════════════════════════════
-- 0115 — a telephone number on a person
--
-- Needed on the person record, and by teams: a team's contact details
-- are its leader's, so a gang without a leader's number is a gang
-- nobody can ring.
--
-- ADD COLUMN IF NOT EXISTS, so this is a no-op where the column already
-- exists — it may well, from the original application.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "Telephone" text;

COMMENT ON COLUMN "Person"."Telephone" IS
  'Contact number. Also shown as a team''s number where this person '
  'leads one.';


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Person_Name", "Email", "Telephone" FROM "Person"
--    WHERE "Is_Active" ORDER BY "Person_Name";
--
-- Team leaders with no number, which is what leaves a team
-- uncontactable:
--   SELECT t."Team_Name", p."Person_Name"
--     FROM "Team" t
--     JOIN "Team_Member" m ON m."Team_ID" = t."Team_ID" AND m."Is_Team_Leader"
--     JOIN "Person" p ON p."Person_ID" = m."Person_ID"
--    WHERE p."Telephone" IS NULL OR p."Telephone" = ''
--    ORDER BY t."Team_Name";
