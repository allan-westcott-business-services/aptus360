/* The energisation grid's column order.

   Gas, water, electric. Two screens draw this grid — the call-off tab
   on a project, and the call-off page — and the first time this was
   asked for, only one of them was changed. The order now lives in
   rules.js and both read it; this checks they still do, and that a
   utility nobody thought of still appears.
   
   Ordering here rather than by Sort_Order in Admin is deliberate: that
   column orders utilities on the GIS layer list, the pipe size screens
   and the POC forms too. */
import { readFileSync } from "node:fs";
import { UTILITY_COLUMN_ORDER, byUtilityColumn } from "./src/features/calloffs/rules.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// The order itself.
if (UTILITY_COLUMN_ORDER.join(",") !== "Gas,Water,Electric") {
  fail(`order is ${UTILITY_COLUMN_ORDER.join(", ")}, wanted Gas, Water, Electric`);
}

// Sorting, from the order the utilities are actually numbered in.
const utils = [
  { Utility: "Electric", Sort_Order: 10 },
  { Utility: "Gas", Sort_Order: 20 },
  { Utility: "Water", Sort_Order: 30 },
];
const got = utils.slice().sort(byUtilityColumn).map((u) => u.Utility);
if (got.join(",") !== "Gas,Water,Electric") {
  fail(`sorted to ${got.join(", ")}`);
}

// A utility nobody named must still appear, at the end, rather than
// being dropped or thrown to the front.
const withNew = [...utils, { Utility: "Fibre", Sort_Order: 40 }]
  .sort(byUtilityColumn).map((u) => u.Utility);
if (withNew.join(",") !== "Gas,Water,Electric,Fibre") {
  fail(`an unlisted utility sorted to ${withNew.join(", ")}`);
}

// Both screens read it, rather than one keeping a copy.
for (const f of [
  "src/features/calloffs/CallOffsTab.jsx",
  "src/features/calloffs/CallOffsPage.jsx",
]) {
  const src = readFileSync(f, "utf8");
  if (!src.includes("byUtilityColumn")) {
    fail(`${f} does not use the shared column order`);
  }
  if (/COLUMN_ORDER\s*=\s*\[/.test(src)) {
    fail(`${f} has its own copy of the order`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Energisation columns behave (${UTILITY_COLUMN_ORDER.join(" \u00b7 ")}).`);
process.exit(bad ? 1 : 0);
