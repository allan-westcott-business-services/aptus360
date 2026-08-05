-- ════════════════════════════════════════════════════════════════
-- 0114 — teams
--
-- A team is a gang that turns up and does the work: a name, whether it
-- is ours or a supplier's, what it costs, what it is qualified to do and
-- where it works.
--
-- Column names taken from the original application so the two can read
-- the same rows.
--
-- ── The part worth reading twice ──
--
-- A team member is either one of our people or a supplier's contact,
-- never both and never neither. A subcontract gang is not made of Person
-- records — those are staff — and forcing them to be would mean creating
-- a Person for every jointer a supplier sends.
--
-- Enforced by a constraint rather than by the form, because a row with
-- both set or neither set is meaningless and would be found much later,
-- by somebody wondering why a team has a blank member.
-- ════════════════════════════════════════════════════════════════


-- ── Crafts: what a team is qualified to do ──────────────────────
CREATE TABLE IF NOT EXISTS "Craft" (
  "Craft_ID"    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Craft_Name"  text NOT NULL,
  "Sort_Order"  integer NOT NULL DEFAULT 100,
  "Is_Active"   boolean NOT NULL DEFAULT true
);

INSERT INTO "Craft" ("Craft_Name", "Sort_Order")
SELECT * FROM (VALUES
  ('Multi Utility 1', 10),
  ('Multi Utility 2', 20),
  ('Multi Utility 3', 30),
  ('Jointing',        40),
  ('Reinstatement',   50),
  ('Street Lighting', 60)
) AS v(n, o)
WHERE NOT EXISTS (SELECT 1 FROM "Craft");


-- ── The team ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Team" (
  "Team_ID"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Team_Name"   text NOT NULL,
  -- Null for one of ours; set for a gang a supplier provides. It also
  -- decides whose contacts may be added as members.
  "Supplier_ID" bigint,
  "Rate"        numeric,
  "Rate_Unit"   text,
  "Active"      boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS team_supplier_idx ON "Team" ("Supplier_ID");


-- ── Who is on it ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Team_Member" (
  "Team_Member_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Team_ID"        bigint NOT NULL
    REFERENCES "Team" ("Team_ID") ON DELETE CASCADE,

  -- One or the other, never both.
  "Person_ID"      bigint,
  "Contact_ID"     bigint,

  -- What they do on this team, which is not necessarily what they do
  -- elsewhere — a supervisor on one gang can be a jointer on another.
  "Role_ID"        bigint,
  "Is_Team_Leader" boolean NOT NULL DEFAULT false,

  CONSTRAINT team_member_one_of CHECK (
    ("Person_ID" IS NOT NULL AND "Contact_ID" IS NULL)
    OR ("Person_ID" IS NULL AND "Contact_ID" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS team_member_team_idx ON "Team_Member" ("Team_ID");
CREATE INDEX IF NOT EXISTS team_member_person_idx ON "Team_Member" ("Person_ID");

-- One row per person per team, and per contact per team. Without these a
-- form that adds on every save accumulates duplicates and a gang of four
-- reads as a gang of nine.
--
-- Partial, because the unused column is null on every row and a plain
-- unique constraint over both would let (1, null) repeat freely.
CREATE UNIQUE INDEX IF NOT EXISTS team_member_person_once
  ON "Team_Member" ("Team_ID", "Person_ID") WHERE "Person_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_member_contact_once
  ON "Team_Member" ("Team_ID", "Contact_ID") WHERE "Contact_ID" IS NOT NULL;


-- ── What it can do, and where ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "Team_Craft" (
  "Team_Craft_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Team_ID"       bigint NOT NULL
    REFERENCES "Team" ("Team_ID") ON DELETE CASCADE,
  "Craft_ID"      bigint NOT NULL
    REFERENCES "Craft" ("Craft_ID") ON DELETE CASCADE,
  CONSTRAINT team_craft_once UNIQUE ("Team_ID", "Craft_ID")
);

CREATE TABLE IF NOT EXISTS "Team_Region" (
  "Team_Region_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Team_ID"        bigint NOT NULL
    REFERENCES "Team" ("Team_ID") ON DELETE CASCADE,
  "Region_ID"      bigint NOT NULL
    REFERENCES "Region" ("Region_ID") ON DELETE CASCADE,
  CONSTRAINT team_region_once UNIQUE ("Team_ID", "Region_ID")
);

CREATE INDEX IF NOT EXISTS team_craft_team_idx ON "Team_Craft" ("Team_ID");
CREATE INDEX IF NOT EXISTS team_region_team_idx ON "Team_Region" ("Team_ID");


-- ── Check ───────────────────────────────────────────────────────
-- Teams with their size, crafts and regions:
--   SELECT t."Team_Name", t."Active",
--          (SELECT COUNT(*) FROM "Team_Member" m WHERE m."Team_ID" = t."Team_ID") AS members,
--          (SELECT COUNT(*) FROM "Team_Craft"  c WHERE c."Team_ID" = t."Team_ID") AS crafts,
--          (SELECT COUNT(*) FROM "Team_Region" r WHERE r."Team_ID" = t."Team_ID") AS regions
--     FROM "Team" t ORDER BY t."Team_Name";
--
-- Teams eligible for a phase in a region — the question the call-off
-- assignments page will ask:
--   SELECT DISTINCT t."Team_Name"
--     FROM "Team" t
--     JOIN "Team_Craft"  tc ON tc."Team_ID" = t."Team_ID"
--     JOIN "Team_Region" tr ON tr."Team_ID" = t."Team_ID"
--    WHERE t."Active" AND tc."Craft_ID" = <craft id> AND tr."Region_ID" = <region id>
--    ORDER BY t."Team_Name";
--
-- Any member row that is neither a person nor a contact, which the
-- constraint should make impossible:
--   SELECT * FROM "Team_Member"
--    WHERE "Person_ID" IS NULL AND "Contact_ID" IS NULL;
