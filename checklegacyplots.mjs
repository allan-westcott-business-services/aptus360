/* The original app's Plots and Plot_Utility rows, imported.

   ── What was asked for ──

   "In anticipation of the Customer and Contract data being migrated to
    Projects, I will also need to import Connection data from Plot
    Utility table", and then "Jointing Dates need to be added to the new
    table".

   333,950 plots and 33,059 connections. The chain is

     Plot_Utility -> Plot -> Contract -> Project

   and every link is an exact key, checked against the real exports:
   every plot belongs to a contract or a tender, all 1,915 contracts
   those plots name are in the contract file, and all 13,718 plots that
   have a connection are in the plot file. Nothing dangles.

   ── The things that must not go wrong ──

   1. A column written by the import that the app does not read. The
      jointing dates were ASKED FOR, so a date that imports and appears
      nowhere is the whole request quietly not delivered. Sections 1
      and 2.

   2. The chain matching on anything but the legacy keys. Three text
      matches are deliberate and safe — five pack statuses, three
      outcomes, and the adopter restricted to organisations that adopt
      networks — and everything else is an id. Section 3.

   3. The staging table not taking the file. Two files now, and a CSV
      load stops on the first column the table does not have. Section 4.

   4. Importing twice. 33,059 rows is not something to do by accident.
      Section 5.

   Run: node checklegacyplots.mjs */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = (p) => readFileSync(p, "utf8");
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const conns = src("./netlify/functions/connections.js");
const plotsApi = src("./netlify/functions/plots.js");
const sql = src("./import_legacy_plots.sql");
const staging = src("./supabase/migrations/0251_legacy_plot_import.sql");
const schema = src("./supabase/migrations/0250_jointing_dates_and_plot_keys.sql");

const listOf = (text, name) => {
  const i = text.indexOf(`const ${name} = [`);
  if (i < 0) return [];
  return [...text.slice(i, text.indexOf("].join(\",\")", i)).matchAll(/"([A-Za-z_]+)"/g)]
    .map((m) => m[1]);
};
const CONN_COLS = listOf(conns, "COLS");
const PLOT_COLS = listOf(plotsApi, "PLOT_COLUMNS");

// ─── 1. The asked-for columns exist, are read, and are on screen ───
{
  for (const col of ["Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"]) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(schema)) {
      fail(`0250 does not add Plot_Utility.${col}`);
    }
  }
  if (!/ADD COLUMN IF NOT EXISTS "Legacy_Plot_ID"/.test(schema)) {
    fail("0250 does not add Plot.Legacy_Plot_ID, which is what the connections join on");
  }
  for (const col of ["Planned_Jointing_Date", "Actual_Jointing_Date"]) {
    if (!CONN_COLS.includes(col)) {
      fail(`${col} is not in the connections endpoint's column list — it is `
        + "neither saved nor returned, and the date silently will not stick");
    }
  }
  if (!PLOT_COLS.includes("Legacy_Plot_ID")) {
    fail("Legacy_Plot_ID is not in the plots endpoint's column list");
  }
  /* And on the screen where connections are worked. A date that is
     imported and cannot be seen is the request not delivered. */
  const page = code("./src/features/connections/PlotConnectionsPage.jsx");
  for (const [col, label] of [["Planned_Jointing_Date", "planned"], ["Actual_Jointing_Date", "actual"]]) {
    if (!new RegExp(`r\\.${col}`).test(page)) {
      fail(`the ${label} jointing date is on no column of the connections grid`);
    }
    if (!new RegExp(`field: "${col}"`).test(page)) {
      fail(`the ${label} jointing date cannot be edited, so an import error is permanent`);
    }
  }
  /* Off by default, so a grid that is already thirteen columns wide is
     not rearranged for everybody who has never asked for them. */
  if ((page.match(/hiddenByDefault: true/g) || []).length < 2) {
    fail("the jointing columns are not hiddenByDefault, so they are forced on "
      + "every user of a screen they did not ask to change");
  }
}

// ─── 2. Everything written is a column the app reads ───
{
  const block = (table) => {
    const i = sql.indexOf(`INSERT INTO "${table}" (`);
    return i < 0 ? "" : sql.slice(i, sql.indexOf(")\nSELECT", i));
  };
  for (const [table, known] of [["Plot", PLOT_COLS], ["Plot_Utility", CONN_COLS]]) {
    const b = block(table);
    if (!b) { fail(`the import has no INSERT INTO "${table}"`); continue; }
    const cols = [...b.matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]).filter((c) => c !== table);
    for (const c of cols) {
      if (!known.includes(c)) {
        fail(`the import writes ${table}.${c}, which the app does not read — `
          + "either it is not a column or the endpoint omits it and the value is invisible");
      }
    }
    for (const c of ["Planned_Jointing_Date", "Actual_Jointing_Date"]) {
      if (table === "Plot_Utility" && !cols.includes(c)) {
        fail(`the import does not write ${c} — the thing that was asked for`);
      }
    }
  }
  /* MPAN_MPRN is deliberately left out until it is settled which column
     holds a supply number. Asserted so that writing it becomes a
     decision somebody makes rather than a line that drifts in. */
  if (/"MPAN_MPRN"/.test(block("Plot_Utility"))) {
    fail("the import writes MPAN_MPRN, and which column holds a supply number "
      + "has not been settled");
  }
}

// ─── 3. The chain joins on keys, not on names ───
{
  if (!/p\."Legacy_Contract_ID" = NULLIF\(btrim\(i\."Contract_ID"\), ''\)::bigint/.test(sql)) {
    fail("plots do not join to their project on the legacy contract id");
  }
  if (!/p\."Legacy_Plot_ID" = NULLIF\(btrim\(c\."Plot_ID"\), ''\)::bigint/.test(staging)) {
    fail("connections do not join to their plot on the legacy plot id");
  }
  /* The three text matches, each one deliberate. */
  if (!/upper\(btrim\(s\."Pack_Status"\)\) = upper\(btrim\(c\."Status_Of_Pack"\)\)/.test(staging)) {
    fail("the pack status is not matched");
  }
  if (!/upper\(btrim\(v\."Visit_Outcome"\)\) = upper\(btrim\(c\."Visit_Outcome"\)\)/.test(staging)) {
    fail("the visit outcome is not matched");
  }
  /* The adopter is a name, so it is restricted to organisations that
     actually adopt networks — otherwise "United Utilities" reaches a
     customer record of the same name and the connection is adopted by
     its own developer. */
  if (!/t\."Type_Key" IN \('idno', 'dno', 'gt', 'wu', 'igt', 'iwu'\)/.test(staging)) {
    fail("the adopter is matched without requiring an adopting role");
  }
  /* And nothing anywhere is matched loosely. */
  for (const [f, text] of [["0251", staging], ["the import", sql]]) {
    if (/ILIKE\s*'%/.test(text) || /similarity\(/.test(text)) {
      fail(`${f} matches something fuzzily`);
    }
  }
  /* The old plot address has nowhere to go, and nothing is invented for
     it. 136,251 plots carry one. */
  const plotInsert = sql.slice(sql.indexOf('INSERT INTO "Plot" ('));
  for (const c of ["House_Number", "Street_Name", "Postcode"]) {
    if (new RegExp(`"${c}"`).test(plotInsert.slice(0, plotInsert.indexOf("FROM")))) {
      fail(`the import writes the plot's ${c}, and Plot has no address columns`);
    }
  }
}

// ─── 4. The staging tables take both files as they are ───
{
  const PLOT_CSV = ["Plot_ID", "Contract_ID", "Plot", "Plot_Ref", "House_Number",
    "Street_Name", "Town", "County", "Postcode", "Property_Config_ID", "Heat_Source_ID",
    "Tender_ID", "KVA_Load", "Branch_ID", "Self_Lay_Provider", "POC_Reference",
    "Heat_Pump_Model_ID", "PV", "MPAN"];
  const CONN_CSV = ["Plot_Utility_ID", "Plot_ID", "Utility_ID", "Programmed_Date",
    "Connection_Date", "Visit_Outcome", "Meter_Number", "As_Laid_Date", "Adopter",
    "Team_ID", "Status_Of_Pack", "Service_Card_Submission_Date", "IDNO_ID", "MPAN_MPRN",
    "Meter_Card_Submission_Date", "Self_Lay_Provider", "Dead_Jointed_Date",
    "Expected_Asset_Value", "Planned_Jointing_Date", "Actual_Jointing_Date"];
  const tableOf = (name) => staging.slice(
    staging.indexOf(`CREATE TABLE IF NOT EXISTS "${name}" (`),
    staging.indexOf(");", staging.indexOf(`CREATE TABLE IF NOT EXISTS "${name}" (`)));
  for (const [name, cols] of [["Legacy_Plot_Import", PLOT_CSV],
    ["Legacy_Connection_Import", CONN_CSV]]) {
    const t = tableOf(name);
    if (!t) { fail(`${name} is not created`); continue; }
    for (const c of cols) {
      if (!new RegExp(`"${c}"`).test(t)) {
        fail(`${name} has no ${c} column, so the CSV load stops on it`);
      }
    }
    if (/\b(date|numeric|integer|boolean)\b/.test(t.replace(/_Import_ID[^,]*,/, ""))) {
      fail(`${name} has a typed column, so the file has to be clean before it loads`);
    }
  }
}

// ─── 5. Twice is the same as once ───
{
  for (const [table, key] of [["Plot", "Legacy_Plot_ID"],
    ["Plot_Utility", "Legacy_Plot_Utility_ID"]]) {
    if (!new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS[\\s\\S]{0,80}"${table}" \\("${key}"\\)`)
      .test(schema)) {
      fail(`${table}.${key} is not unique, so the import can insert the same row twice`);
    }
    if (!new RegExp(`x\\."${key}" = NULLIF`).test(sql)) {
      fail(`the import does not skip ${table} rows it has already created`);
    }
    if (!new RegExp(`DELETE FROM "${table}" WHERE "${key}" IS NOT NULL`).test(sql)) {
      fail(`the file does not say how to undo the ${table} import`);
    }
  }
  /* And the order, which matters both ways: connections are created
     after plots and deleted before them. */
  if (sql.indexOf('INSERT INTO "Plot" (') > sql.indexOf('INSERT INTO "Plot_Utility" (')) {
    fail("the connections are imported before the plots they hang off");
  }
  if (sql.indexOf('DELETE FROM "Plot_Utility"') > sql.indexOf('DELETE FROM "Plot" WHERE')) {
    fail("the undo removes the plots before the connections hanging off them");
  }
}

/* ─── 6. The status script does not call a pairing a connection ───

   This section exists because of a real mistake, not a hypothetical.
   where_am_i.sql reported `count(*) FROM "Plot_Utility"` under the
   heading "Connections in the system". It came back 3,409 before a
   single row had been imported, and the honest reading of that - "none
   should have been created yet" - was the user's, not mine.

   A Plot_Utility row is not a connection. It says this plot takes this
   utility, and it exists from the moment the plot does: plots.js creates
   one per new plot per Project_Scope utility, and 1,714 were back-filled
   on 26 Aug. The connection is the DATES on the row.

   So a bare count under that heading reads as "the import has run" when
   nothing has. The three figures below are what make it unambiguous, and
   each has to be separately derived - a copy of the total under a
   different name would pass a careless eye and say nothing. */
{
  const wai = src("./where_am_i.sql");
  /* Strings as well as comments: one of the Notes lines contains a
     semicolon inside a quoted string, which otherwise counts as a
     second statement and makes the one-result-set test lie. */
  const waiCode = wai.replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ").replace(/'(?:[^']|'')*'/g, "''");

  if ((waiCode.match(/;/g) || []).length !== 1) {
    fail("where_am_i.sql is more than one statement, and the Supabase editor "
      + "shows only the last result - which is how the checklist was lost");
  }
  if (/'Connections in the system'/.test(wai)) {
    fail("where_am_i.sql still labels a Plot_Utility count 'Connections in the "
      + "system', which reads as an import having run when none has");
  }
  /* Each figure restricted differently. Tested as a restriction on the
     count, not as the mere presence of the column name, because the
     column name also appears in the prose above. */
  const restricted = [
    [/count\(\*\)[^;]{0,120}FROM "Plot_Utility"\s*\n?\s*WHERE "Legacy_Plot_Utility_ID" IS NOT NULL/,
      "how many plot-utility rows came from the import"],
    [/count\(\*\)[^;]{0,200}FROM "Plot_Utility"\s*\n?\s*WHERE "Programmed_Date" IS NOT NULL/,
      "how many plot-utility rows have any date on them, which is the only "
      + "figure that says whether work has been booked"],
    [/count\(\*\)[^;]{0,120}FROM "Plot" WHERE "Legacy_Plot_ID" IS NOT NULL/,
      "how many plots came from the import"],
  ];
  for (const [re, what] of restricted) {
    if (!re.test(waiCode)) fail(`where_am_i.sql does not report ${what}`);
  }
  /* The plain totals must still be there. Removing them to make the
     point would be the opposite mistake: the user's own 28 projects and
     2,547 plots are the figures that tell them the import has not
     trampled their real data. */
  if (!/count\(\*\)::text FROM "Plot_Utility"\)\s*\|\|/.test(waiCode)) {
    fail("where_am_i.sql no longer reports the plain Plot_Utility total, so "
      + "there is nothing to compare the imported figure against");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Plots and connections import on exact keys, the jointing dates that were "
    + "asked for are stored, read and editable, running it twice changes "
    + "nothing, and the status script distinguishes a plot-utility pairing "
    + "from a connection that has a date on it.");
process.exit(bad ? 1 : 0);
