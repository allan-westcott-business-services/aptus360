-- ════════════════════════════════════════════════════════════════
-- 0102 — default equipment per outline design
--
-- What a project's mains and services are made of is decided once, at
-- design stage, and then repeated on every run drawn. Setting it on each
-- feature afterwards is both tedious and unreliable: a cable missed on
-- one run is invisible until the bill comes out short, which this
-- project has already produced twice.
--
-- Held on Project_Scope because that is exactly one row per project and
-- utility, which is exactly the grain of the decision. A default on the
-- project would have to say which utility it meant; one on the feature
-- is the thing being defaulted.
--
-- ── Why four columns and not two ────────────────────────────────
-- Electric has a catalogue — Electric_Cable_Size, with a type and a
-- usage — so an electric default is a reference to a row in it, and a
-- foreign key means a size cannot be deleted out from under a project
-- silently. Gas and water have no such catalogue: their sizes are free
-- text on the feature today, and inventing one here would be a much
-- larger change than this and not the one that was asked for.
--
-- So an electric scope fills the two id columns and the others fill the
-- two text columns. The screen shows a picker or a box accordingly, and
-- nothing has to pretend a pipe size is a cable id.
--
-- Null everywhere means no default, and a feature drawn under one is
-- left as it was drawn — not given a guess.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Project_Scope"
  ADD COLUMN IF NOT EXISTS "Default_Main_Cable_Size_ID"    bigint
    REFERENCES "Electric_Cable_Size" ("Cable_Size_ID"),
  ADD COLUMN IF NOT EXISTS "Default_Service_Cable_Size_ID" bigint
    REFERENCES "Electric_Cable_Size" ("Cable_Size_ID"),
  ADD COLUMN IF NOT EXISTS "Default_Main_Size"             text,
  ADD COLUMN IF NOT EXISTS "Default_Service_Size"          text;

COMMENT ON COLUMN "Project_Scope"."Default_Main_Cable_Size_ID" IS
  'Electric only: the cable new mains runs are drawn with on this project.';
COMMENT ON COLUMN "Project_Scope"."Default_Service_Cable_Size_ID" IS
  'Electric only: the cable new service runs are drawn with on this project.';
COMMENT ON COLUMN "Project_Scope"."Default_Main_Size" IS
  'Gas and water: the pipe new mains runs are drawn with. Free text, as '
  'pipe sizes are on the features themselves.';
COMMENT ON COLUMN "Project_Scope"."Default_Service_Size" IS
  'Gas and water: the pipe new service runs are drawn with.';


-- ── Check ───────────────────────────────────────────────────────
-- What each outline design will draw with:
--   SELECT s."Project_ID", u."Utility",
--          cs."Size_Label"  AS default_main_cable,
--          ss."Size_Label"  AS default_service_cable,
--          s."Default_Main_Size", s."Default_Service_Size"
--     FROM "Project_Scope" s
--     LEFT JOIN "Utility" u             ON u."Utility_ID"   = s."Utility_ID"
--     LEFT JOIN "Electric_Cable_Size" cs ON cs."Cable_Size_ID" = s."Default_Main_Cable_Size_ID"
--     LEFT JOIN "Electric_Cable_Size" ss ON ss."Cable_Size_ID" = s."Default_Service_Cable_Size_ID"
--    WHERE s."Project_ID" = <project id>;
