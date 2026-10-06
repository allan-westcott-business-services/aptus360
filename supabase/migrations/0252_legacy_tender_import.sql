-- ── The tenders, and working out which became which contract ─────────
--
-- 5,454 tenders. A tender that was won became a separate Contract
-- record over there and is ONE project here, so the job is not loading
-- them — it is deciding, for each tender, whether it is already in this
-- system under its contract.
--
-- ── Why that is hard, and how hard ──
--
-- The old system barely recorded the link. Measured on the real files:
--
--   Tender_Ref on the contract   86 contracts carry one, all 86 match
--   a plot naming both          only 20 tender/contract pairs
--   site name AND customer      1,622 tenders, 14 of them ambiguous
--
-- The first two are exact and tiny. The third is a name match, which
-- everywhere else in this import I have refused — but it is a different
-- risk here. Attaching a project to the wrong CUSTOMER shows one
-- developer another developer's work and nobody sees it happen.
-- Merging a tender into the wrong project of the SAME customer at a
-- site of the same name is a smaller mistake, it is visible on the
-- project, and contract site names are nearly unique: 15 repeats in
-- 1,910. Asked for and agreed before building.
--
-- Where the pair is ambiguous — several contracts share that site and
-- customer — nothing is matched and the tender is listed instead. 14 of
-- them.
--
-- ── What a match is worth ──
--
-- The tender holds what the contract record never had: the real
-- Date_Received (which imported contracts currently carry a stand-in
-- for), the KPI date, the date sent, the estimator, the BDD/KAM, the
-- points. Matching fills those in on a project that already exists
-- rather than making a second one beside it.

-- ── This one has to come after the others ────────────────────────────
--
-- The view below reads Project."Legacy_Contract_ID" (0247),
-- Project."Legacy_Customer_ID" (0249) and "Legacy_Plot_Import" (0251).
-- Run out of order, Postgres says only
--
--   column p.Legacy_Contract_ID does not exist
--
-- which names the symptom and not the cause. So it is said here
-- instead, before anything is created.

DO $$
DECLARE missing text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'Project' AND column_name = 'Legacy_Contract_ID')
    THEN missing := array_append(missing, '0247 (Project.Legacy_Contract_ID)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'Project' AND column_name = 'Legacy_Customer_ID')
    THEN missing := array_append(missing, '0249 (Project.Legacy_Customer_ID)'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name = 'Legacy_Plot_Import')
    THEN missing := array_append(missing, '0251 (Legacy_Plot_Import)'); END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Run these first: %. The order is 0247, 0248, 0249, 0250, '
      '0251, then this one.', array_to_string(missing, ', ');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Legacy_Tender_Import" (
  "Legacy_Tender_Import_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Tender_ID"                text,
  "Date_Received"            text,
  "Customer_ID"              text,
  "Region_ID"                text,
  "Tender_Status_ID"         text,
  "Quote_Type_ID"            text,
  "BDD_KAM_ID"               text,
  "Estimator"                text,
  "Auto_Base_Points"         text,
  "I_and_C"                  text,
  "Revision"                 text,
  "Good_To_Go"               text,
  "Branch_ID"                text,
  "Is_Priority"              text,
  "Site_Name"                text,
  "Site_Address"             text,
  "Tender_Quote_Value"       text,
  "Secured_Date"             text,
  "Linked_Plot_Count"        text,
  "Tender_Ref"               text,
  "Notes"                    text,
  "Phase_Type_ID"            text,
  "Postcode"                 text,
  "Sub_Region_ID"            text,
  "KPI_Date"                 text,
  "Date_Sent"                text,
  "Quote_Value_To_Client"    text,
  "Quote_Value_To_Aptus"     text,
  "Status_Changed_Date"      text,
  "Manual_Base_Points"       text,
  "Option_Letter"            text,
  "Tender_Base_Points"       text,
  "Tender_Total_Points"      text,
  "Tender_Manual_Total_Points" text,
  "Heat_Pump_Model_ID"       text,
  "Tender_Notes"             text,
  "PV_Input_Level"           text
);

COMMENT ON TABLE "Legacy_Tender_Import" IS
  'Raw rows from the original app''s Tender export, as text.';

CREATE INDEX IF NOT EXISTS "Legacy_Tender_Import_Ref_IDX"
  ON "Legacy_Tender_Import" ("Tender_Ref");

-- ── Which project, if any, each tender already is ─────────────────────
--
-- Three routes, most confident first, and the route is reported so a
-- merge can be argued with rather than taken on trust.

CREATE OR REPLACE VIEW "Legacy_Tender_Match" AS
WITH t AS (
  SELECT i.*,
         NULLIF(btrim(i."Tender_ID"), '')::bigint   AS tender_id,
         NULLIF(btrim(i."Customer_ID"), '')::bigint AS customer_id,
         upper(btrim(COALESCE(i."Site_Name", '')))  AS site_key
    FROM "Legacy_Tender_Import" i
),
/* 1. The contract names the tender's reference. Exact. */
by_ref AS (
  SELECT t.tender_id, p."Project_ID"
    FROM t JOIN "Project" p
      ON p."Legacy_Contract_ID" IS NOT NULL
     AND btrim(p."Tender_Ref") = btrim(t."Tender_Ref")
   WHERE COALESCE(btrim(t."Tender_Ref"), '') <> ''
),
/* 2. A plot that names both. Exact, and rare. */
by_plot AS (
  SELECT DISTINCT NULLIF(btrim(lp."Tender_ID"), '')::bigint AS tender_id,
         p."Project_ID"
    FROM "Legacy_Plot_Import" lp
    JOIN "Project" p
      ON p."Legacy_Contract_ID" = NULLIF(btrim(lp."Contract_ID"), '')::bigint
   WHERE COALESCE(btrim(lp."Tender_ID"), '') <> ''
     AND COALESCE(btrim(lp."Contract_ID"), '') <> ''
),
/* 3. Same site, same customer — and only where that pair names exactly
      one project. Several and it is left alone. */
site_pairs AS (
  SELECT upper(btrim(p."Site_Name")) AS site_key,
         p."Legacy_Customer_ID"      AS customer_id,
         min(p."Project_ID")         AS project_id,
         count(*)                    AS how_many
    FROM "Project" p
   WHERE p."Legacy_Contract_ID" IS NOT NULL
     AND COALESCE(btrim(p."Site_Name"), '') <> ''
   GROUP BY 1, 2
)
SELECT t.*,
       COALESCE(r."Project_ID", pl."Project_ID",
                CASE WHEN sp.how_many = 1 THEN sp.project_id END) AS matched_project_id,
       CASE
         WHEN r."Project_ID"  IS NOT NULL THEN 'tender reference on the contract'
         WHEN pl."Project_ID" IS NOT NULL THEN 'a plot naming both'
         WHEN sp.how_many = 1             THEN 'same site and customer'
         WHEN sp.how_many > 1             THEN 'AMBIGUOUS - several projects share that site and customer'
         ELSE 'no contract - this tender becomes its own project'
       END AS match_route
  FROM t
  LEFT JOIN by_ref  r  ON r.tender_id  = t.tender_id
  LEFT JOIN by_plot pl ON pl.tender_id = t.tender_id
  LEFT JOIN site_pairs sp
         ON sp.site_key = t.site_key
        AND sp.customer_id IS NOT DISTINCT FROM t.customer_id;

COMMENT ON VIEW "Legacy_Tender_Match" IS
  'Each staged tender with the project it already is, where that can be '
  'established, and which of the three routes said so.';

DO $$
BEGIN
  PERFORM 1 FROM information_schema.views WHERE table_name = 'Legacy_Tender_Match';
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy_Tender_Match was not created.'; END IF;
  RAISE NOTICE 'Staging is ready for the tenders. Load the CSV, then run '
    'import_legacy_tenders.sql part 1 to see what matches what.';
END $$;
