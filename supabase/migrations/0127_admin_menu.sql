-- ════════════════════════════════════════════════════════════════
-- 0127 — the admin menu is data
--
-- The order of the admin screens, the sections they sit under and the
-- names on them were a list in src/lib/adminTables.js. Reordering one
-- meant editing a source file and deploying, which puts a question of
-- housekeeping — where does Water Pipe Sizes belong, is it "Utility" or
-- "Utilities" — behind a release.
--
-- So the shape of the menu moves into a table and the screens stay in
-- code. That split is the point of this migration:
--
--   A row here says a heading exists, what it is called, where it sits,
--   and which screen a menu entry opens.
--
--   What that screen *is* — its columns, its field types, whether it is
--   the generic editor or a bespoke one — stays in adminTables.js,
--   because it is a fact about the code rather than a preference.
--
-- ── Nothing can be locked away ──
--
-- Two rules in the application, both worth knowing about here:
--
--   A screen in the code with no row in this table still appears, after
--   the ones that have rows. A screen added by a future migration turns
--   up somewhere obvious rather than nowhere.
--
--   The Menu Layout screen itself is pinned by the application and is
--   not in this table. Deleting every row leaves a menu with one entry:
--   the one that puts the rest back.
--
-- ── Kinds ──
--
--   section  a heading, in caps, with a rule above it
--   group    a quieter sub-heading under a section
--   screen   an entry that opens something; Screen_Key names which
--
-- Seeded from the list as it stood, so the first load looks exactly like
-- the last one before it.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Admin_Menu" (
  "Admin_Menu_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  "Kind"           text NOT NULL CHECK ("Kind" IN ('section', 'group', 'screen')),

  -- Which screen this opens. Null for a heading, and deliberately not a
  -- foreign key: the screens live in the application, not in a table,
  -- and a key that no longer exists is a row to be shown as broken
  -- rather than one the database should have refused.
  "Screen_Key"     text,

  "Label"          text NOT NULL,
  "Display_Order"  integer NOT NULL DEFAULT 100,
  "Is_Active"      boolean NOT NULL DEFAULT true,

  CONSTRAINT admin_menu_screen_has_key CHECK (
    ("Kind" = 'screen') = ("Screen_Key" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS admin_menu_order_idx ON "Admin_Menu" ("Display_Order");

-- One entry per screen. Two rows opening the same screen is a menu
-- disagreeing with itself about where something lives.
CREATE UNIQUE INDEX IF NOT EXISTS admin_menu_screen_idx
  ON "Admin_Menu" ("Screen_Key") WHERE "Screen_Key" IS NOT NULL;


-- Only into an empty table: running this again must not undo somebody's
-- arrangement.
--
-- One row per screen. The first attempt at this seed carried two for
-- Team — a bespoke Teams screen and a plain table editor over the same
-- table, both keyed "Team" — and the unique index above refused it:
--
--   duplicate key value violates unique constraint "admin_menu_screen_idx"
--   Key ("Screen_Key")=(Team) already exists
--
-- Which was the index doing its job. The menu resolves a key with
-- find(), so the second entry had never opened: it rendered the bespoke
-- screen while claiming to be its own thing, and nothing said so until
-- the arrangement became data. The duplicate is gone from
-- adminTables.js and this seed has one row for it.
INSERT INTO "Admin_Menu" ("Kind", "Screen_Key", "Label", "Display_Order")
SELECT * FROM (VALUES
  ('section', NULL, 'Properties & Plots', 10),
  ('screen', 'Property_Config', 'House Types', 20),
  ('screen', 'Property_Type', 'Property Type', 30),
  ('screen', 'Heat_Source', 'Heat Source', 40),
  ('section', NULL, 'Projects & Design', 50),
  ('screen', 'Quote_Type', 'Quote Type', 60),
  ('screen', 'Points_Config', 'Points Configuration', 70),
  ('screen', 'Project_Status', 'Project Status', 80),
  ('screen', 'Scope_Status', 'Scope Status', 90),
  ('screen', 'Design_Status', 'Design Status', 100),
  ('screen', 'Status_Transition', 'Status Workflow', 110),
  ('screen', 'Visit_Outcome', 'Visit Outcome', 120),
  ('screen', 'Pack_Status', 'Service Card Pack Status', 130),
  ('screen', 'NRS_Sub_Type', 'Non-Res Supply Type', 140),
  ('screen', 'Electric_Specs', 'Electric Specs', 150),
  ('screen', 'POC_Type', 'POC Type', 160),
  ('screen', 'AV_Status', 'Asset Value Status', 170),
  ('screen', 'Quotation_Status', 'Quotation Status', 180),
  ('screen', 'POC_Status', 'POC Status', 190),
  ('screen', 'Utility', 'Utility', 200),
  ('section', NULL, 'Organisations & People', 210),
  ('group', NULL, 'Organisations', 220),
  ('screen', 'Organisation', 'Organisations', 230),
  ('screen', 'Customer', 'Customers & Branches', 240),
  ('screen', 'IDNO_Source_Mapping', 'IDNO Source Mapping', 250),
  ('screen', 'Person', 'People & Roles', 260),
  ('screen', 'Team', 'Teams', 270),
  ('screen', 'Task_Type', 'Work Phases', 280),
  ('screen', 'Call_Off_Status', 'Call-Off Statuses', 290),
  ('screen', 'Water_Pipe_Size', 'Water Pipe Sizes', 300),
  ('screen', 'Craft', 'Crafts', 310),
  ('screen', 'Role', 'Role', 320),
  ('screen', 'Region', 'Region', 330),
  ('screen', 'Sub_Region', 'Sub Region', 340),
  ('section', NULL, 'Utilities & Connections', 350),
  ('group', NULL, 'Utilities', 360),
  ('screen', 'IDNO', 'IDNO / IGT / NAV', 370),
  ('screen', 'DNO', 'DNO', 380),
  ('screen', 'Local_Authority', 'Local Authority', 390),
  ('screen', 'AV_Agreement_Type', 'AV Agreement Type', 400),
  ('screen', 'Fire_Service', 'Fire Authority', 410),
  ('screen', 'VAT_Rate', 'VAT Rates', 420),
  ('section', NULL, 'Drawings', 430),
  ('group', NULL, 'Styles', 440),
  ('screen', 'GIS_Style', 'GIS Styles', 450)
) AS v(k, s, l, o)
WHERE NOT EXISTS (SELECT 1 FROM "Admin_Menu");


-- ── Check ───────────────────────────────────────────────────────
-- The menu as it will render:
--   SELECT "Display_Order", "Kind", COALESCE("Screen_Key", '') AS opens, "Label"
--     FROM "Admin_Menu" WHERE "Is_Active" ORDER BY "Display_Order";
--
-- Gaps of ten, so a row can be moved between two others without
-- renumbering the lot. Anything at the same number is ordered by id,
-- which is stable but arbitrary — worth tidying if this returns rows:
--   SELECT "Display_Order", COUNT(*) FROM "Admin_Menu"
--    GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Screens named here that the application does not have. These show in
-- the layout editor as missing rather than vanishing quietly:
--   SELECT "Label", "Screen_Key" FROM "Admin_Menu" WHERE "Kind" = 'screen';
