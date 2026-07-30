-- ════════════════════════════════════════════════════════════════
-- 0077 — project options
--
-- An option is a parallel version of the same enquiry: the same site,
-- the same customer, quoted a different way. 2607.004(A) and 2607.004(B)
-- are alternatives offered together, and one of them may be secured.
--
-- Not to be confused with POC application options, which are the
-- variants a DNO offers within a single quotation.
--
-- The schema has been ready for this since 0001: Project carries
-- Option_Letter and is unique on (Project_Ref, Revision, Option_Letter).
-- An option is therefore a sibling row, not a child table — which is
-- what makes every existing screen work on one without changing, since
-- an option simply is a project.
--
-- The difference from a revision is that an option does not supersede
-- anything. A revision replaces what came before; options stand beside
-- each other until one is chosen.
-- ════════════════════════════════════════════════════════════════

-- ── The reference as it should be read ───────────────────────────
-- Generated rather than assembled by each screen: the format is a fact
-- about the project, and four screens formatting it four ways is how
-- 2607.004(A) becomes 2607.004 (A) somewhere.
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "Display_Ref" text
  GENERATED ALWAYS AS (
    "Project_Ref"
    || CASE WHEN "Option_Letter" IS NOT NULL AND "Option_Letter" <> ''
            THEN '(' || "Option_Letter" || ')' ELSE '' END
  ) STORED;

CREATE INDEX IF NOT EXISTS project_display_ref_idx ON "Project" ("Display_Ref");


-- ── Letters ──────────────────────────────────────────────────────
-- A, B … Z, then AA. The same sequence circuits use, for the same
-- reason: it has to keep going past 26 without collapsing.
CREATE OR REPLACE FUNCTION option_letter(n integer) RETURNS text AS $$
DECLARE out text := ''; i integer := n;
BEGIN
  IF i IS NULL OR i < 1 THEN RETURN NULL; END IF;
  WHILE i > 0 LOOP
    out := chr(65 + ((i - 1) % 26)) || out;
    i := (i - 1) / 26;
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The lowest letter not already used on this reference and revision, so
-- deleting option B and adding one gives B back rather than leaving a
-- gap that grows for ever.
CREATE OR REPLACE FUNCTION next_option_letter(p_ref text, p_rev integer)
RETURNS text AS $$
DECLARE n integer := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM "Project"
     WHERE "Project_Ref" = p_ref AND "Revision" = p_rev
       AND "Option_Letter" = option_letter(n)
  ) LOOP
    n := n + 1;
  END LOOP;
  RETURN option_letter(n);
END;
$$ LANGUAGE plpgsql STABLE;


-- ── Adding an option ─────────────────────────────────────────────
-- Copies the project as it stands. Developers, plots and scopes come
-- across, because an option quoted on a different plot mix is a
-- different enquiry, not an option.
CREATE OR REPLACE FUNCTION create_project_option(p_project bigint)
RETURNS bigint AS $$
DECLARE
  src "Project"%ROWTYPE;
  new_id bigint;
  letter text;
  dev RECORD;
  new_dev bigint;
  dev_map jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO src FROM "Project" WHERE "Project_ID" = p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project % not found', p_project; END IF;

  -- The first option turns the original into A, so the set reads
  -- A and B rather than an unlettered one beside a B.
  IF src."Option_Letter" IS NULL OR src."Option_Letter" = '' THEN
    UPDATE "Project" SET "Option_Letter" = 'A' WHERE "Project_ID" = p_project;
    src."Option_Letter" := 'A';
  END IF;

  letter := next_option_letter(src."Project_Ref", src."Revision");

  INSERT INTO "Project" (
    "Project_Ref","Revision","Option_Letter","Project_Status_ID",
    "Customer_ID","Branch_ID","Region_ID","Sub_Region_ID",
    "Site_Name","Site_Address","Postcode","Eastings","Northings",
    "Date_Received","KPI_Date","BDD_KAM_ID","Estimator_ID","Quote_Type_ID",
    "I_and_C","Is_Priority","Notes","Manual_Base_Points",
    "Fire_Service_ID","Town_Council_ID","County_Council_ID",
    "Heat_Pump_Model_ID","Default_Heat_Source_ID"
  ) VALUES (
    src."Project_Ref", src."Revision", letter,
    -- Keeps its status: an option is offered alongside, not instead of.
    src."Project_Status_ID",
    src."Customer_ID", src."Branch_ID", src."Region_ID", src."Sub_Region_ID",
    src."Site_Name", src."Site_Address", src."Postcode", src."Eastings", src."Northings",
    src."Date_Received", src."KPI_Date", src."BDD_KAM_ID", src."Estimator_ID", src."Quote_Type_ID",
    src."I_and_C", src."Is_Priority", src."Notes", src."Manual_Base_Points",
    src."Fire_Service_ID", src."Town_Council_ID", src."County_Council_ID",
    src."Heat_Pump_Model_ID", src."Default_Heat_Source_ID"
  ) RETURNING "Project_ID" INTO new_id;

  FOR dev IN SELECT * FROM "Project_Developer" WHERE "Project_ID" = p_project LOOP
    INSERT INTO "Project_Developer"
      ("Project_ID","Customer_ID","Branch_ID","Is_Main","Developer_Code","Notes")
    VALUES (new_id, dev."Customer_ID", dev."Branch_ID", dev."Is_Main",
            dev."Developer_Code", dev."Notes")
    RETURNING "Project_Developer_ID" INTO new_dev;
    dev_map := dev_map || jsonb_build_object(dev."Project_Developer_ID"::text, new_dev);
  END LOOP;

  INSERT INTO "Plot" (
    "Project_ID","Plot_Number","Property_Config_ID","PV",
    "Heat_Pump_Model_ID","KVA_Load","Self_Lay_Provider","Project_Developer_ID",
    "Heat_Source_ID"
  )
  SELECT new_id, pl."Plot_Number", pl."Property_Config_ID", pl."PV",
         pl."Heat_Pump_Model_ID", pl."KVA_Load", pl."Self_Lay_Provider",
         (dev_map ->> pl."Project_Developer_ID"::text)::bigint,
         pl."Heat_Source_ID"
    FROM "Plot" pl WHERE pl."Project_ID" = p_project;

  INSERT INTO "Project_Scope" (
    "Project_ID","Utility_ID","Scope_Status_ID","Revision","IDNO_ID","Reference"
  )
  SELECT new_id, sc."Utility_ID", sc."Scope_Status_ID", sc."Revision",
         sc."IDNO_ID", sc."Reference"
    FROM "Project_Scope" sc WHERE sc."Project_ID" = p_project;

  INSERT INTO "Project_History" ("Project_ID","Field","Old_Value","New_Value")
  VALUES (new_id, 'Option', NULL, letter);

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;


-- ── Every option of a project ────────────────────────────────────
CREATE OR REPLACE VIEW "Project_Option" AS
  SELECT p."Project_ID", p."Project_Ref", p."Revision", p."Option_Letter",
         p."Display_Ref", p."Project_Status_ID", p."Site_Name",
         (SELECT COUNT(*) FROM "Project" o
           WHERE o."Project_Ref" = p."Project_Ref" AND o."Revision" = p."Revision") AS option_count
    FROM "Project" p;


-- ── Check ───────────────────────────────────────────────────────
-- Expect A, B, C in order, all sharing a reference and revision:
--   SELECT "Display_Ref", "Option_Letter", "Site_Name"
--     FROM "Project" WHERE "Project_Ref" = '2607.004'
--    ORDER BY "Revision", "Option_Letter";
--
-- Expect A: option_letter(1). Expect AA: option_letter(27).
--   SELECT option_letter(1), option_letter(26), option_letter(27);
--
-- Projects with exactly one option have no letter, which is right — a
-- lone project is not "option A of one":
--   SELECT "Display_Ref", option_count FROM "Project_Option"
--    WHERE option_count = 1 AND "Option_Letter" IS NOT NULL;
