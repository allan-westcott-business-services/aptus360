/* The screen that edits the dig and lay rates.

   The arithmetic is checked in checkdigrate.mjs. What is checked here is
   that the screen can actually reach the tables, and that the two
   properties which are not ordinary editing survive: one machine is
   assumed and only one, and a rate cannot claim to be measured without
   a sample behind it.

   Both of those are the reason this is its own screen rather than three
   entries in the generic editor. */
import { readFileSync } from "node:fs";
import { ADMIN_TABLES } from "./src/lib/adminTables.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const endpoint = readFileSync("./netlify/functions/admin.js", "utf8");
const screen = readFileSync("./src/features/admin/DigRatesAdmin.jsx", "utf8");
const page = readFileSync("./src/features/admin/AdminPage.jsx", "utf8");

// 1. Every table the screen reads is on the endpoint's allow-list.
//
//    The allow-list is the whole security model there, so a table left
//    off it is not a missing feature — it is a screen that loads, shows
//    nothing, and says the server refused. Which is what happened: the
//    surfaces were not on it, and the screen quoted a Surface Types
//    screen that did not exist.
{
  const reads = [...screen.matchAll(/adminList\("([A-Za-z_]+)"\)/g)].map((m) => m[1]);
  const writes = [...screen.matchAll(/adminUpdate\("([A-Za-z_]+)"/g)].map((m) => m[1]);
  if (!reads.length) fail("the screen reads no tables at all");

  for (const t of new Set([...reads, ...writes])) {
    if (!new RegExp(`\\b${t}:\\s*\\{`).test(endpoint)) {
      fail(`${t} is not on the admin endpoint's allow-list`);
    }
  }

  /* And everything it writes, it also reads — a table written without
     being loaded is a screen editing something it cannot show. */
  for (const t of new Set(writes)) {
    if (!reads.includes(t)) fail(`${t} is written but never loaded`);
  }
}

// 2. The screen is reachable: registered, and routed.
//
//    Registered without routing falls through to the generic editor,
//    which would show Dig_Rate as five plain columns — including Source
//    and Sample_Size as free fields, which is the one thing this screen
//    exists to prevent.
{
  const entry = ADMIN_TABLES.find((t) => t.special === "digrates");
  if (!entry) fail("no menu entry points at the dig rates screen");
  if (entry && entry.key !== "Dig_Rate") {
    fail(`the dig rates entry is keyed on ${entry.key}`);
  }
  if (!/special === "digrates"/.test(page)) {
    fail("AdminPage does not route the dig rates screen");
  }
  if (!/import DigRatesAdmin/.test(page)) fail("AdminPage does not import the screen");

  /* The surfaces are editable somewhere, since this screen shows them
     read-only and says so. */
  const surf = ADMIN_TABLES.find((t) => t.key === "GIS_Surface_Type");
  if (!surf) fail("nothing in Admin edits the surface types");
  else if (!surf.fields?.some((f) => f.col === "Dig_Factor")) {
    fail("the surface editor has no dig factor, so the screen points nowhere");
  }
}

// 3. Source and Sample_Size are never plain fields.
//
//    They are what lets a duration say whether anybody has checked it:
//    every screen showing one reads them and says either "Planning
//    estimate — not measured" or "From 31 recorded jobs". Editable
//    freely, anyone could mark a guess as measured and the sentence
//    would lie on every screen at once.
{
  /* Written only together, and only alongside a rate. */
  const calls = [...screen.matchAll(/adminUpdate\("Dig_Rate",[^;]*?\{([^}]*)\}/gs)]
    .map((m) => m[1]);
  for (const args of calls) {
    const hasSource = /Source:/.test(args);
    const hasSample = /Sample_Size:/.test(args);
    if (hasSource !== hasSample) {
      fail("Source and Sample_Size are written apart from each other");
    }
    if (hasSource && !/Base_Rate_M3_Hr:/.test(args)) {
      fail("a rate was marked measured without its measured output");
    }
  }
  if (!calls.some((a) => /Source:\s*"measured"/.test(a))) {
    fail("nothing on the screen can record a measured rate");
  }

  /* And not offered as an input anywhere on the form. */
  if (/name="Source"|draft\.Source|d, Source:/.test(screen)) {
    fail("Source is editable as an ordinary field");
  }
  if (/draft\.Sample_Size|d, Sample_Size:/.test(screen)) {
    fail("Sample_Size is editable as an ordinary field");
  }
  /* The generic editor would do exactly that, which is why Dig_Rate
     must not be described with a fields list. */
  const entry = ADMIN_TABLES.find((t) => t.key === "Dig_Rate");
  if (entry?.fields) fail("Dig_Rate has a generic fields list, which would expose Source");
}

// 4. The default machine is moved, not ticked.
//
//    Dig_Rate has a unique index over Is_Default, so setting a second
//    one fails with a constraint error nobody could act on. The flag has
//    to be cleared where it was before it is written where it is wanted.
{
  const fn = screen.slice(screen.indexOf("async function makeDefault"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  if (!/Is_Default: false/.test(body)) {
    fail("making a machine default never clears the old one");
  }
  if (!/Is_Default: true/.test(body)) fail("making a machine default never sets it");
  if (body.indexOf("Is_Default: false") > body.indexOf("Is_Default: true")) {
    fail("the new default is set before the old one is cleared, which the index refuses");
  }
}

// 5. The worked example runs the real model.
//
//    A screen that showed what a rate does using its own copy of the
//    arithmetic would be a second implementation, and the first thing to
//    go wrong would be an example disagreeing with the trench it claims
//    to describe.
{
  if (!/from "\.\.\/\.\.\/features\/gis\/digRate\.js"/.test(screen)) {
    fail("the screen does not use digRate.js for its example");
  }
  if (!/digEstimate\(/.test(screen)) fail("the example does not call digEstimate");
  if (!/trenchSize\(/.test(screen)) fail("the example does not size its trench");
}

// The example is labelled as one, before its numbers.
//
//    Six durations in bold on an admin screen read as this company's
//    figures for a job somebody is planning. They are not: it is one
//    invented trench put through the tables so a rate can be seen as
//    days.
{
  const page = readFileSync("./src/features/admin/DigRatesAdmin.jsx", "utf8");
  if (!/An example, not a job/.test(page)) {
    fail("the worked example is not labelled as an example");
  }
  /* Above the numbers: somebody who reads the figures first and the
     caption second has already taken them for data. */
  const whatAt = page.indexOf("dr-example-what");
  const headAt = page.indexOf("dr-example-head");
  if (whatAt < 0 || headAt < 0 || whatAt > headAt) {
    fail("the caption sits below the numbers it qualifies");
  }
}

// Reinstatement rates, and what an unset one means.
{
  const page = readFileSync("./src/features/admin/DigRatesAdmin.jsx", "utf8");
  const sql = readFileSync("./supabase/migrations/0179_reinstate_rates.sql", "utf8");

  if (!/Reinstate_M2_Hr/.test(sql)) fail("there is no reinstatement rate to set");
  /* Seeded empty on purpose: there is no public source for these, and a
     figure invented here would be worse than the blank end date
     reinstatement has now. */
  if (/INSERT INTO "GIS_Surface_Type"[\s\S]{0,400}Reinstate_M2_Hr/.test(sql)) {
    fail("the migration seeds reinstatement rates nobody has agreed");
  }
  /* Provenance travels with the rate, as it does for the machines. */
  if (!/Reinstate_Source/.test(sql)) fail("a reinstatement rate has no provenance");
  /* The constraint's own body, not its name — the name appears in the
     DROP above it, so a search for it passed while the CHECK had been
     replaced with `true`. */
  if (!/surface_reinstate_provenance\s*\n\s*CHECK \("Reinstate_Source" IS NULL OR "Reinstate_M2_Hr" IS NOT NULL\)/
    .test(sql)) {
    fail("a source can be set on a surface with no rate");
  }

  /* And the screen shows both, and says what a blank means. */
  /* Used in the markup, not merely styled — the class survives in the
     stylesheet after the element using it has gone, so a search of the
     whole file passed while the cell rendered empty. */
  if (!/<span className="dr-unset">/.test(page)) {
    fail("an unset rate shows as an empty cell");
  }
  if (!/no estimate for this surface until a rate is set/.test(page)) {
    fail("nothing says what an unset rate costs");
  }
  if (!/no public\s*\n?\s*source for these figures/.test(page)) {
    fail("the screen does not say why the rates are missing");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Dig rates admin behaves (allow-listed, routed, one default, no free Source).");
process.exit(bad ? 1 : 0);
