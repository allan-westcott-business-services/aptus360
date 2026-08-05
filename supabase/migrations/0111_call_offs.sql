-- ════════════════════════════════════════════════════════════════
-- 0111 — call-offs
--
-- A call-off is a request to come and do a piece of work on a site: lay
-- this run of mains, connect these plots, energise these columns. One
-- submission carries who is asking, when they want it, and what state
-- the ground is in; the rows underneath say which pieces of work.
--
-- ── Three shapes of row, one submission ──
--
-- What is being called off depends on the work type, and the three are
-- genuinely different things rather than one thing with a flag:
--
--   Span        a run of trench, from one plot to another
--   PlotList    individual plots to be serviced
--   ColumnList  street lighting columns to be energised
--
-- Work_Type.Selection_Mode says which, and the form follows it. Three
-- tables rather than one with mostly-null columns: a span has a length
-- and a direction, a plot has neither, and a column is identified from
-- an entirely different register.
--
-- ── Column names ──
--
-- Taken from the original application rather than chosen, so the two can
-- read the same data. That is why Mains_Call_Off_Span holds "Plots" as
-- text rather than a pair of plot ids, and why the submission carries
-- Customer_Name alongside Customer_ID.
--
-- The denormalised names are deliberate there and kept here: a call-off
-- is a record of what was asked for on a day, and a customer renamed
-- afterwards should not silently rewrite last year's submissions.
-- ════════════════════════════════════════════════════════════════

-- ── Work types ──────────────────────────────────────────────────
-- Selection_Mode drives which kind of row the form collects. Null means
-- the type is internal and not offered on the customer-facing form —
-- jointing is the example in the original.
CREATE TABLE IF NOT EXISTS "Work_Type" (
  "Work_Type_ID"    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Work_Type_Name"  text NOT NULL,
  "Selection_Mode"  text,
  "Display_Order"   integer NOT NULL DEFAULT 100,
  "Is_Active"       boolean NOT NULL DEFAULT true,
  CONSTRAINT work_type_mode CHECK (
    "Selection_Mode" IS NULL
    OR "Selection_Mode" IN ('Span', 'PlotList', 'ColumnList'))
);

INSERT INTO "Work_Type" ("Work_Type_Name", "Selection_Mode", "Display_Order")
SELECT * FROM (VALUES
  ('Mains Call Off',        'Span',       10),
  ('Service Call Off',      'PlotList',   20),
  ('Street Light Call Off', 'ColumnList', 30),
  -- Internal: no Selection_Mode, so it does not appear on the form.
  ('Jointing',              NULL,         90)
) AS v(n, m, o)
WHERE NOT EXISTS (SELECT 1 FROM "Work_Type");


-- ── The submission ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Mains_Call_Off_Submission" (
  "Submission_ID"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Status"               text NOT NULL DEFAULT 'Pending Review',

  -- Who it is for. Both the id and the name: the id to join on, the name
  -- so the submission still reads correctly if the customer is renamed
  -- or the branch closed.
  "Customer_ID"          bigint,
  "Customer_Name"        text,
  "Branch_ID"            bigint,
  "Branch_Name"          text,
  -- The project this belongs to.
  --
  -- The original hangs call-offs off Contract; this application is
  -- organised around Project, and a call-off is asked for against a
  -- project. Contract_ID is kept alongside so a submission can still
  -- carry the contract reference it was raised under, but the project is
  -- what it belongs to and what it is listed against.
  "Project_ID"           bigint,
  "Contract_ID"          bigint,
  "AP_Number"            text,
  "Site_Name"            text,
  "Site_Address"         text,

  "Work_Type_ID"         bigint REFERENCES "Work_Type" ("Work_Type_ID"),

  -- Who asked. Not null in the original, with the staff member's name
  -- standing in when the form is filled in on a customer's behalf.
  "Contact_Name"         text NOT NULL,
  "Contact_Phone"        text NOT NULL DEFAULT 'N/A',
  "Contact_Company"      text,

  "Preferred_Date"       date NOT NULL,
  "Alternative_Date"     date,

  -- The state of the site, asked as three questions rather than assumed.
  -- Yes/no/unknown, so "nobody has said" is distinct from "no".
  "Obstruction_Free"     text,
  "Ground_Unmade"        text,
  "Line_Level_Required"  text,

  "Notes"                text,
  -- A snapshot of what was selected on the drawing, where the selection
  -- was made there. Kept as sent rather than as ids, because the
  -- drawing will change and the request should not.
  "GIS_Data"             jsonb,

  "Created_By"           text,
  "Created_At"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcos_project_idx
  ON "Mains_Call_Off_Submission" ("Project_ID");
CREATE INDEX IF NOT EXISTS mcos_contract_idx
  ON "Mains_Call_Off_Submission" ("Contract_ID");
CREATE INDEX IF NOT EXISTS mcos_status_idx
  ON "Mains_Call_Off_Submission" ("Status");


-- ── Span rows: runs of trench ───────────────────────────────────
-- Plots is free text — "12-18", "12, 14, 16" — because that is what the
-- original stores and how the work is described on site. Parsing it into
-- a pair of ids would be tidier and would lose what somebody wrote.
CREATE TABLE IF NOT EXISTS "Mains_Call_Off_Span" (
  "Span_ID"             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Submission_ID"       bigint NOT NULL
    REFERENCES "Mains_Call_Off_Submission" ("Submission_ID") ON DELETE CASCADE,
  "Plots"               text,
  -- Distribution or Provision: which side of the meter the run is.
  "D_or_P"              text,
  "Energisation_Date"   date,
  "Estimated_Length_m"  numeric,
  "Sort_Order"          integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS mcosp_submission_idx
  ON "Mains_Call_Off_Span" ("Submission_ID");


-- ── Plot rows: one per plot ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Service_Call_Off_Plot" (
  "Service_Plot_ID"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Submission_ID"       bigint NOT NULL
    REFERENCES "Mains_Call_Off_Submission" ("Submission_ID") ON DELETE CASCADE,
  -- The plot number as written, not the Plot_ID: a call-off names plots
  -- the way the site does, and a submission should survive a plot being
  -- renumbered or removed.
  "Plot"                text NOT NULL,
  "Energisation_Date"   date,
  "Sort_Order"          integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS scop_submission_idx
  ON "Service_Call_Off_Plot" ("Submission_ID");


-- ── Column rows: street lighting ────────────────────────────────
CREATE TABLE IF NOT EXISTS "Street_Light_Call_Off" (
  "Street_Light_Call_Off_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Submission_ID"       bigint NOT NULL
    REFERENCES "Mains_Call_Off_Submission" ("Submission_ID") ON DELETE CASCADE,
  "Street_Light_ID"     bigint NOT NULL,
  "Energisation_Date"   date,
  "Sort_Order"          integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS slco_submission_idx
  ON "Street_Light_Call_Off" ("Submission_ID");


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Work_Type_Name", "Selection_Mode" FROM "Work_Type"
--    ORDER BY "Display_Order";
--
-- What the customer-facing form offers — internal types are excluded by
-- having no Selection_Mode:
--   SELECT "Work_Type_Name" FROM "Work_Type"
--    WHERE "Is_Active" AND "Selection_Mode" IS NOT NULL
--    ORDER BY "Display_Order", "Work_Type_Name";
--
-- A submission with its rows, whichever kind:
--   SELECT s."Submission_ID", s."Status", w."Selection_Mode",
--          (SELECT COUNT(*) FROM "Mains_Call_Off_Span"    x WHERE x."Submission_ID" = s."Submission_ID") AS spans,
--          (SELECT COUNT(*) FROM "Service_Call_Off_Plot"  x WHERE x."Submission_ID" = s."Submission_ID") AS plots,
--          (SELECT COUNT(*) FROM "Street_Light_Call_Off"  x WHERE x."Submission_ID" = s."Submission_ID") AS columns
--     FROM "Mains_Call_Off_Submission" s
--     LEFT JOIN "Work_Type" w ON w."Work_Type_ID" = s."Work_Type_ID"
--    ORDER BY s."Submission_ID" DESC;
