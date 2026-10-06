/* Importing the original app's Tenders and Contracts as Projects.

   ── What was asked for ──

   "I need to import data from the original Aptus360 App ... The
    challenge is linking Primary keys with the tables of the new system
    for data such as the Customer which is managed via Organisations and
    Organisation Branches."

   The old system had a Tender that progressed to a Contract. Here there
   is one Project with stages, so two files become one set of projects.

   ── The things that must not go wrong ──

   1. A column written by the import that the APP cannot read.
      PROJECT_COLUMNS in projects.js is the list the endpoint selects,
      and a column missing from it comes back undefined — recurring
      fault 4, where the symptom is a silent empty field rather than an
      error. An imported figure nobody can see is an imported figure
      nobody can correct. Sections 1 and 2.

   2. A column written by the import that does not EXIST. The import is
      SQL run straight at the database, so there is nothing to catch it
      but this. Section 3.

   3. The staging table not matching the file. A CSV load fails on the
      first unknown column, and the file is the one thing here that
      cannot be changed. Section 4.

   4. Two projects with the same ref. Display_Ref is built from it, so a
      duplicate reads as the same project in every dropdown in the
      application. It happened twice while this was being written — once
      because preserved refs took no part in the sequence, and once
      because they were reserved under the month of the row rather than
      the month in the reference. Section 5 holds the shape that fixed
      it. Both were found by counting the rows, not by reading the SQL,
      which is why the counting query is part of the file.

   Run: node checklegacyimport.mjs */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = (p) => readFileSync(p, "utf8");

const api = src("./netlify/functions/projects.js");
const sql = src("./import_legacy_projects.sql");
const staging = src("./supabase/migrations/0248_legacy_import.sql");
/* 0249 replaced the resolution view: matching a customer on
   Organisation.Code found nothing in the real data — two of the 419
   organisations have a code and neither is an Audacia one — so it
   resolves on the legacy keys instead. */
const view = src("./supabase/migrations/0249_legacy_customer_keys.sql");
const schema = src("./supabase/migrations/0247_project_tender_quote_value.sql");

/* The columns the endpoint reads, from its own list. */
const PROJECT_COLUMNS = (() => {
  const i = api.indexOf("const PROJECT_COLUMNS = [");
  const j = api.indexOf("].join(\",\")", i);
  return [...api.slice(i, j).matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]);
})();

// ─── 1. The new columns exist, and the app can read them ───
{
  for (const col of ["Tender_Quote_Value", "Legacy_Contract_ID", "Legacy_Tender_ID"]) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(schema)) {
      fail(`0247 does not add ${col}`);
    }
    if (!PROJECT_COLUMNS.includes(col)) {
      fail(`${col} is not in PROJECT_COLUMNS — it arrives undefined and the `
        + "field is silently empty on every project that has one");
    }
  }
  /* And the quote value is on screen. A figure that arrives by import
     and appears nowhere is one nobody can correct — the same fault the
     KPI date was added to the Details form to fix. */
  const form = src("./src/features/projects/ProjectDetailsForm.jsx")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/f\.Tender_Quote_Value/.test(form)) {
    fail("the tender quote value is nowhere on the Details form, so an imported "
      + "figure cannot be seen or put right");
  }
  if (!/set\("Tender_Quote_Value"\)/.test(form)) {
    fail("the tender quote value is shown but cannot be edited");
  }
  /* The uniqueness that makes the import re-runnable. */
  for (const idx of ["Project_Legacy_Contract_UQ", "Project_Legacy_Tender_UQ"]) {
    if (!sqlHas(schema, idx)) fail(`0247 does not make ${idx}, so the import can insert twice`);
  }
}
function sqlHas(text, needle) { return text.includes(needle); }

// ─── 2. Everything the import writes is a column the app knows ───
{
  const i = sql.indexOf('INSERT INTO "Project" (');
  const j = sql.indexOf(")\nSELECT", i);
  if (i < 0 || j < 0) fail("the import's INSERT INTO \"Project\" could not be found");
  else {
    const cols = [...sql.slice(i, j).matchAll(/"([A-Za-z_]+)"/g)]
      .map((m) => m[1]).filter((c) => c !== "Project");
    if (!cols.length) fail("the import names no columns");
    for (const c of cols) {
      if (!PROJECT_COLUMNS.includes(c)) {
        fail(`the import writes Project.${c}, which the app does not read — `
          + "either it is not a column at all, or it is one the endpoint omits "
          + "and the imported value is invisible");
      }
    }
    /* The ones the whole exercise is for. */
    for (const c of ["Legacy_Contract_ID", "Site_Name", "Project_Ref", "Project_Status_ID"]) {
      if (!cols.includes(c)) fail(`the import does not write ${c}`);
    }
  }
}

// ─── 3. It writes a branch, not an organisation ───
{
  /* A Project hangs off Organisation_Branch. Writing an Organisation_ID
     would be a column that does not exist, and the error would arrive
     1,900 rows into somebody's evening. */
  /* The INSERT's column list and nothing else. Scanning the whole file
     from there caught the worked example at the foot of it, which joins
     Organisation quite correctly — a check that fails on its own
     documentation is one people learn to ignore. */
  const insertCols = (() => {
    const i = sql.indexOf('INSERT INTO "Project" (');
    return i < 0 ? "" : sql.slice(i, sql.indexOf(")\nSELECT", i));
  })();
  if (/"Organisation_ID"/.test(insertCols)) {
    fail("the import writes Organisation_ID onto Project, which is not a column "
      + "— a project hangs off a branch");
  }
  if (!/"Organisation_Branch_ID"/.test(sql)) fail("the import never sets the branch");
  /* And only where there was no choice to make, which is what was asked
     for: a project on the wrong branch shows one developer another
     developer's work in the portal, invisibly.

     Asserted at both ends — the import must take the settled branch, and
     the view must refuse to settle one where there is a choice. */
  if (!/n\.settled_branch_id,/.test(sql)) {
    fail("the import attaches a branch that is not the settled one, so it can "
      + "choose for somebody where there was a choice to make");
  }
  if (!/settled_branch_id/.test(view)) {
    fail("the resolution does not work out a settled branch at all");
  }
  if (!/AND b\."Is_Active"\) = 1/.test(view)) {
    fail("settled_branch_id does not require the organisation to have exactly "
      + "one branch, so it settles one where there are several");
  }
  if (!/organisation has several branches/.test(view)) {
    fail("the resolution does not separate the several-branch case, so there is "
      + "no worklist for the ones somebody has to choose");
  }
  /* The customer is found by CODE. Names are typed by people and drift;
     a fuzzy name match would attach a site to the wrong builder. */
  if (!/upper\(btrim\(r\."Reference"\)\) = upper\(btrim\(c\.audacia_code\)\)/.test(view)) {
    fail("the Audacia code is not matched against a customer role's Reference");
  }
  if (!/t\."Type_Key" = 'customer'/.test(view)) {
    fail("the Audacia code can reach an organisation that is not a customer");
  }
  if (/ILIKE\s*'%/.test(view) || /similarity\(/.test(view)) {
    fail("the organisation is matched fuzzily, which attaches sites to the wrong builder");
  }
}

// ─── 4. The staging table takes the file as it is ───
{
  /* Every column in the contract export, as the file itself has them.
     A CSV load stops on the first column the table does not have. */
  const CSV = ["Contract_ID", "AP_Number", "Customer_ID", "Region_ID", "Site_Name",
    "Branch_ID", "Fire_Service_ID", "Date_Signed", "Contract_Status_ID",
    "Tender_Reference", "Tender_Quote_Value", "Site_Address", "Site_Contact",
    "Auto_Created", "Gas_Reference", "Electric_Reference", "Water_Reference",
    "Electric_IDNO_ID", "Gas_IDNO_ID", "Water_IDNO_ID", "Audacia_Customer_Name",
    "Default_Plot_Heat_Source_ID", "Audacia_Plot_Count", "Auto_Plot_Count",
    "Secured_Date", "Minimum_Service_Call_Off", "Eastings", "Northings",
    "Lay_Only_MU", "Heat_Pump_Model_ID", "Clean_Water_Incumbent_ID",
    "Waste_Water_Incumbent_ID"];
  const table = staging.slice(staging.indexOf('CREATE TABLE IF NOT EXISTS "Legacy_Project_Import"'),
    staging.indexOf('COMMENT ON TABLE "Legacy_Project_Import"'));
  for (const c of CSV) {
    if (!new RegExp(`"${c}"`).test(table)) {
      fail(`the staging table has no ${c} column, so the CSV load stops on it`);
    }
  }
  /* Text, all of it. A date column and a "" in the file is a load that
     fails halfway with 1,000 rows in. */
  if (/\b(date|numeric|integer|boolean)\b/.test(
    table.replace(/Legacy_Project_Import_ID[^,]*,/, ""))) {
    fail("a staging column is typed, so the file has to be clean before it can "
      + "be loaded at all");
  }
  /* And Source defaults, or a straight CSV load fails on every row for
     want of a column the export does not have. */
  if (!/"Source"\s+text NOT NULL DEFAULT 'contract'/.test(table)) {
    fail("Source has no default — the export has no such column and the load "
      + "fails on every row");
  }
}

// ─── 5. Two projects cannot take the same ref ───
{
  /* Preserved refs take no part in the sequence AND reserve their own
     number, keyed on the month inside the REFERENCE. Both halves were
     missing in turn, and each put duplicate refs into a test import. */
  /* The CTE's DEFINITION, not its name anywhere in the file. Written
     loosely first and the mutation that renamed it went through, because
     the name still appeared in the comment above it and in the FROM
     below — the third time in this session that matching a string which
     also occurs in prose let a fault pass. */
  if (!/keeps_own_ref AS \(/.test(sql)) {
    fail("preserved references are not held apart from the generated ones");
  }
  if (!/SELECT split_part\(btrim\("Tender_Reference"\), '\.', 1\) AS yymm/.test(sql)) {
    fail("a preserved reference is reserved under the month of the ROW rather "
      + "than the month in the reference — 1603.008 gets handed out twice");
  }
  if (!/UNION ALL[\s\S]{0,400}keeps_own_ref/.test(sql)) {
    fail("the taken-numbers list does not include the preserved references, so "
      + "the generator can hand one of them out again");
  }
  if (!/WHERE k\."Tender_Reference" IS NULL\s*\n\s*OR k\."Tender_Reference" !~/.test(sql)) {
    fail("rows that keep their own reference are still numbered, which leaves "
      + "gaps and can collide");
  }
  /* The counting query that found both faults stays in the file. */
  if (!/GROUP BY 1 HAVING count\(\*\) > 1/.test(sql)) {
    fail("the file no longer offers a way to count duplicates");
  }
}

// ─── 6. Nothing is guessed that cannot be un-guessed ───
{
  /* Old lookup numbers are not assumed to carry over. */
  if (!/CREATE TABLE IF NOT EXISTS "Legacy_Lookup_Map"/.test(staging)) {
    fail("there is no lookup mapping table, so old numbers are assumed to have "
      + "carried over");
  }
  if (!/Kind' = 'status'|"Kind" = 'status'/.test(sql)) {
    fail("the status is not taken from the mapping table");
  }
  /* And the import refuses to run with the statuses unmapped, because
     the status is what says whether a project is at tender or contract
     stage — the whole point of the two old tables becoming one. */
  if (!/RAISE EXCEPTION 'These old status ids have no row in Legacy_Lookup_Map/.test(sql)) {
    fail("the import will run with statuses unmapped, putting every project at "
      + "the wrong stage");
  }
  /* No fabricated safety net. An interactive BEGIN that the Supabase
     editor commits anyway is worse than none, because it is believed. */
  if (/^\s*BEGIN;\s*$/m.test(sql)) {
    fail("the import opens a transaction it never closes — true at a psql "
      + "prompt and not in the Supabase editor, so the dry run is imaginary");
  }
  if (!/DELETE FROM "Project" WHERE "Legacy_Contract_ID" IS NOT NULL/.test(sql)) {
    fail("the file does not say how to undo the import");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The legacy import writes columns the app can read, matches customers by "
    + "code, attaches a branch only where there was no choice to make, and "
    + "cannot hand the same reference to two projects.");
process.exit(bad ? 1 : 0);
