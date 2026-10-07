-- A copy of the live shape, exactly as the pre-flight reported it.
-- Used only to run the import here before it is run there.

DROP TABLE IF EXISTS "AV_Agreement", "AV_Agreement_Type", "Utility",
  "Organisation", "IDNO", "Project", "Legacy_Lookup_Map",
  "Legacy_Migration_Log", "Legacy_AV_Agreement_Import" CASCADE;

CREATE TABLE "Utility" ("Utility_ID" bigint PRIMARY KEY, "Utility" text);
INSERT INTO "Utility" VALUES (1,'Electric'),(2,'Gas'),(3,'Water');

CREATE TABLE "Organisation" ("Organisation_ID" bigserial PRIMARY KEY, "Name" text);
CREATE TABLE "IDNO" ("IDNO_ID" bigint PRIMARY KEY, "IDNO_Name" text,
                     "Organisation_ID" bigint REFERENCES "Organisation");

CREATE TABLE "Project" ("Project_ID" bigserial PRIMARY KEY,
                        "Legacy_Contract_ID" bigint, "AP_Number" text);

CREATE TABLE "AV_Agreement_Type" (
  "AV_Agreement_Type_ID" bigint PRIMARY KEY,
  "AV_Agreement_Type" text, "Utility_ID" bigint REFERENCES "Utility");
-- Exactly as section 5 reported. Note the ids: nothing lines up with the
-- legacy ones, and 7, 8 and 9 are all water but not the same water.
INSERT INTO "AV_Agreement_Type" VALUES
  (1,'Adoption Agreement',NULL),(2,'Asset Purchase',NULL),
  (3,'Deed of Grant',NULL),(4,'Connection Agreement',NULL),
  (5,'Electric',1),(6,'Gas',2),
  (7,'Water NAV Waste',3),(8,'Water NAV Clean',3),(9,'Water',3);

CREATE TABLE "AV_Agreement" (
  "AV_Agreement_ID"         bigserial PRIMARY KEY,
  "AV_Agreement_Type_ID"    bigint REFERENCES "AV_Agreement_Type",
  "AV_Value"                numeric,
  "Agreement_Date"          date,
  "Contract_Path"           text,
  "Created_At"              timestamptz NOT NULL DEFAULT now(),
  "Estimated_Plot_AV_Value" numeric,
  "IDNO_ID"                 bigint REFERENCES "IDNO",
  "IDNO_Organisation_ID"    bigint REFERENCES "Organisation",
  "IDNO_Reference"          text,
  "Initial_AV_Fee"          numeric,
  "Initial_AV_Fee_Percent"  numeric,
  "Notes"                   text,
  "Project_ID"              bigint NOT NULL REFERENCES "Project",
  "Status"                  text,
  "Updated_At"              timestamptz NOT NULL DEFAULT now(),
  "Utility_ID"              bigint NOT NULL REFERENCES "Utility");

CREATE UNIQUE INDEX av_agreement_project_type_uniq
  ON "AV_Agreement" ("Project_ID", COALESCE("AV_Agreement_Type_ID", ('-1'::integer)::bigint));

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."Updated_At" = now(); RETURN NEW; END; $$;
CREATE TRIGGER av_agreement_updated_at BEFORE INSERT OR UPDATE ON "AV_Agreement"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION av_agreement_utility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."AV_Agreement_Type_ID" IS NOT NULL THEN
    SELECT COALESCE(t."Utility_ID", NEW."Utility_ID") INTO NEW."Utility_ID"
      FROM "AV_Agreement_Type" t
     WHERE t."AV_Agreement_Type_ID" = NEW."AV_Agreement_Type_ID";
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER av_agreement_utility_trg
  BEFORE INSERT OR UPDATE OF "AV_Agreement_Type_ID", "Utility_ID" ON "AV_Agreement"
  FOR EACH ROW EXECUTE FUNCTION av_agreement_utility();

CREATE TABLE "Legacy_Lookup_Map" (
  "Kind" text, "Legacy_ID" text, "New_ID" bigint, "Note" text,
  PRIMARY KEY ("Kind", "Legacy_ID"));
CREATE TABLE "Legacy_Migration_Log" (
  "Step" text PRIMARY KEY, "State" text, "Detail" text);
