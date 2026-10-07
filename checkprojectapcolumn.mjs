/* The Projects list must show the AP number, and show it beside the
   project reference for people who have used the page before.

   Two separate things can go wrong, and the second is the one that
   caught us on the Plot Connections table this morning:

     1. The column is not defined at all.
     2. The column is defined, but every existing user has a saved
        prefs.order in localStorage that predates it. loadPrefs appends
        unknown keys to the END, so the column appears out past Quote
        Type and Estimator — which to the person who asked for it looks
        the same as it not being there.

   Both are asserted here against the source. A render test would mean
   standing up a 900-line component with lookups, drag state and
   localStorage to check an array's contents, which costs more than it
   proves. What actually breaks is somebody rewriting COLUMNS or
   loadPrefs, and reading those is enough to catch it. */

import { readFileSync } from "node:fs";

const FILE = "src/features/projects/ProjectsList.jsx";
const src = readFileSync(FILE, "utf8");
const flat = src.replace(/\s+/g, " ");   // the definitions wrap

let bad = false;
const fail = (msg, ...rest) => {
  bad = true;
  console.error(`FAIL  ${FILE}: ${msg}`);
  for (const r of rest) console.error(`        ${r}`);
};

/* 1. The column exists and reads the right field. */
const col = flat.match(/\{ key: "ap",[^}]*\}/);
if (!col) {
  fail("there is no AP Number column.",
       'Expected a COLUMNS entry with key: "ap".');
} else {
  if (!col[0].includes("p.AP_Number")) {
    fail("the AP Number column does not read p.AP_Number.", col[0]);
  }
  if (!/label: "AP Number"/.test(col[0])) {
    fail("the AP Number column is not labelled \"AP Number\".", col[0]);
  }
}

/* 2. A saved column order from before this column existed gets it put
      beside the project reference, not left where the append dropped
      it. */
const moved = /if \(order\[order\.length - 1\] === "ap"\)/.test(flat)
           && /without\.indexOf\("ref"\)/.test(flat);
if (!moved) {
  fail("nothing places AP Number beside Project Ref for existing users.",
       "loadPrefs appends an unknown key last, so anyone who has used",
       "this page before gets the column out past Estimator — which",
       "looks identical to the column being missing.");
}

/* 3. The append that this depends on is still there. Without it a new
      column never reaches a returning user's order at all. */
if (!/def\.order\.forEach\(\(k\) => !order\.includes\(k\) && order\.push\(k\)\)/.test(flat)) {
  fail("loadPrefs no longer appends new columns to a saved order.",
       "A column added from now on will be invisible to every existing",
       "user, with nothing to say so.");
}

if (bad) process.exit(1);
console.log("ok    AP Number column present, reads AP_Number, placed beside Project Ref");
