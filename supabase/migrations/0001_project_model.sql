-- ═══════════════════════════════════════════════════════════════
-- Project model — merges Tender + Contract into one record.
--
-- Creates the new tables ALONGSIDE the existing ones. Nothing is
-- dropped here; the old app keeps working until cutover.
--
-- Run with:  supabase db push
-- ═══════════════════════════════════════════════════════════════

-- ── Stage-scoped status list (replaces Tender_Status + Contract_Status) ──
CREATE TABLE IF NOT EXISTS "Project_Status" (
  "Project_Status_ID" serial PRIMARY KEY,
  "Stage"             text    NOT NULL CHECK ("Stage" IN ('Tender', 'Contract')),
  "Status"            text    NOT NULL,
  "Sort_Order"        integer NOT NULL DEFAULT 0,
  "Row_Colour"        text,
  "Is_Terminal"       boolean NOT NULL DEFAULT false,
  UNIQUE ("Stage", "Status")
);

-- ── Per-scope commercial status (was the child tender's status) ──
CREATE TABLE IF NOT EXISTS "Scope_Status" (
  "Scope_Status_ID" serial PRIMARY KEY,
  "Status"          text    NOT NULL UNIQUE,
  "Sort_Order"      integer NOT NULL DEFAULT 0,
  "Is_Terminal"     boolean NOT NULL DEFAULT false
);

-- ── Project: one row per enquiry, for its whole life ──
CREATE TABLE IF NOT EXISTS "Project" (
  "Project_ID"          bigserial PRIMARY KEY,
  "Project_Ref"         text NOT NULL,
  "Revision"            integer NOT NULL DEFAULT 0,
  "Option_Letter"       text,
  "Project_Status_ID"   integer NOT NULL REFERENCES "Project_Status",

  "Customer_ID"         bigint,
  "Branch_ID"           bigint,
  "Region_ID"           bigint,
  "Sub_Region_ID"       bigint,
  "Site_Name"           text,
  "Site_Address"        text,
  "Postcode"            text,
  "Eastings"            numeric,
  "Northings"           numeric,

  "Date_Received"       date NOT NULL,
  "KPI_Date"            date,
  "Date_Sent"           date,
  "Secured_Date"        date,
  "Status_Changed_Date" date,
  "BDD_KAM_ID"          bigint,
  "Estimator_ID"        bigint,
  "Quote_Type_ID"       bigint,
  "I_and_C"             boolean NOT NULL DEFAULT false,
  "Is_Priority"         boolean NOT NULL DEFAULT false,
  "Notes"               text,

  -- award stage: null until promoted
  "Contract_Number"     text UNIQUE,
  "Date_Signed"         date,
  "Site_Contact"        text,
  "Fire_Service_ID"     bigint,
  "Heat_Pump_Model_ID"  bigint,
  "Default_Plot_Heat_Source_ID" bigint,
  "Lay_Only_MU"         boolean NOT NULL DEFAULT false,
  "Minimum_Service_Call_Off" numeric,
  "Audacia_Customer_Name"    text,
  "Audacia_Plot_Count"       numeric,

  "Created_At"          timestamptz NOT NULL DEFAULT now(),
  "Updated_At"          timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("Project_Ref", "Revision", "Option_Letter")
);

CREATE INDEX IF NOT EXISTS project_status_idx   ON "Project" ("Project_Status_ID");
CREATE INDEX IF NOT EXISTS project_customer_idx ON "Project" ("Customer_ID");
CREATE INDEX IF NOT EXISTS project_received_idx ON "Project" ("Date_Received" DESC);

-- ── Project_Scope: 0..6 rows, one per design type the project needs ──
-- Replaces Utility_Outline_Design AND the child-tender mechanism.
CREATE TABLE IF NOT EXISTS "Project_Scope" (
  "Project_Scope_ID"  bigserial PRIMARY KEY,
  "Project_ID"        bigint NOT NULL REFERENCES "Project" ON DELETE CASCADE,
  "Utility_ID"        bigint NOT NULL REFERENCES "Utility",

  -- commercial (was the child tender)
  "Scope_Status_ID"   integer REFERENCES "Scope_Status",
  "Date_Sent"         date,
  "Secured_Date"      date,
  "Quote_Value_To_Client" numeric,
  "Quote_Value_To_Aptus"  numeric,

  -- design (was Utility_Outline_Design)
  "Designer_ID"       bigint,
  "Design_Status_ID"  bigint,
  "Target_Date"       date,
  "Actual_Date"       date,
  "Revision"          integer NOT NULL DEFAULT 0,
  "POC_Status_ID"     bigint,
  "Design_Checked_By" bigint,
  "Carried_Forward"   boolean NOT NULL DEFAULT false,
  "External_Design"   boolean NOT NULL DEFAULT false,
  "External_Supplier_ID" bigint,
  "Auto_Base_Points"  numeric,
  "Manual_Base_Points" numeric,
  "Base_Points_Overridden" boolean NOT NULL DEFAULT false,

  -- adopting operator: replaces the fixed Electric/Gas/Water triplet
  -- on Contract, and extends to street lighting scopes for free
  "IDNO_ID"           bigint,
  "Reference"         text,

  "Created_At"        timestamptz NOT NULL DEFAULT now(),
  "Updated_At"        timestamptz NOT NULL DEFAULT now(),

  UNIQUE ("Project_ID", "Utility_ID")
);

CREATE INDEX IF NOT EXISTS scope_project_idx ON "Project_Scope" ("Project_ID");

-- ── Seed statuses ──
INSERT INTO "Project_Status" ("Stage", "Status", "Sort_Order", "Is_Terminal") VALUES
  ('Tender',   'New',                   10, false),
  ('Tender',   'Tendering',             20, false),
  ('Tender',   'Peer Check',            30, false),
  ('Tender',   'Awaiting Approval',     40, false),
  ('Tender',   'Pending',               50, false),
  ('Tender',   'On Hold',               60, false),
  ('Tender',   'Secured',               70, false),
  ('Tender',   'Lost',                  80, true),
  ('Tender',   'Withdrawn',             90, true),
  ('Contract', 'Mobilising',            10, false),
  ('Contract', 'On Site',               20, false),
  ('Contract', 'Commercially Complete', 30, true)
ON CONFLICT ("Stage", "Status") DO NOTHING;

INSERT INTO "Scope_Status" ("Status", "Sort_Order", "Is_Terminal") VALUES
  ('Quoting',   10, false),
  ('Quoted',    20, false),
  ('Secured',   30, false),
  ('Lost',      40, true),
  ('Withdrawn', 50, true)
ON CONFLICT ("Status") DO NOTHING;

-- ── Keep Updated_At honest ──
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."Updated_At" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_updated_at ON "Project";
CREATE TRIGGER project_updated_at BEFORE UPDATE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS scope_updated_at ON "Project_Scope";
CREATE TRIGGER scope_updated_at BEFORE UPDATE ON "Project_Scope"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ──
-- On by default with NO policies: the anon key can read nothing. All access
-- goes through Netlify functions using the service role key, which bypasses
-- RLS. Add policies later only if the browser needs direct access again.
ALTER TABLE "Project"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project_Scope"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project_Status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Scope_Status"   ENABLE ROW LEVEL SECURITY;
