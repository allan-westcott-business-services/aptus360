/* What a bulk change to a selection of plots writes, and the way back
   from an entered load.

   Reported: "In the Project > Plots page, when I change the Heat Source
   or the ASHP model, the kVA value in the Plot table is not updating."

   Nothing was wrong with the page — it refetches after every bulk
   apply. `Plot.KVA_Load` is an OVERRIDE, and `gis_unplaced_plots`
   resolves a load as COALESCE(the entered figure, the one worked out
   from the house type and heat source). An entered figure therefore
   wins for ever, and on project 32 all 42 plots carried one: 1.7 kVA,
   the same on every plot, which is one bulk action rather than
   somebody's forty-two considered figures.

   The bar could SET an override and had no way to REMOVE one — blank
   means "leave it alone" — so a plot could depart from the calculated
   figure and never come back. The heat source has had its way back,
   "Project default", since it was asked for.

   Run: node checkplotbulk.mjs */

import { readFileSync } from "node:fs";
import {
  planBulkChanges, CALCULATED, PROJECT_DEFAULT, isCalculated, LOAD_FIELDS,
} from "./src/features/plots/plotBulk.js";
import { takesHeatPump } from "./src/lib/heatPump.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const EMPTY = {
  Property_Config_ID: "", Heat_Source_ID: "", Heat_Pump_Model_ID: "",
  KVA_Load: "", Gas_Load_kW: "", PV: "",
  SLP_Utility_ID: "", SLP_Value: "",
};
/* Named as the live table names them, because the rules key on the name
   and not on an id. */
const heatSources = [
  { Heat_Source_ID: 1, Heat_Source: "Mains gas boiler" },
  { Heat_Source_ID: 2, Heat_Source: "ASHP" },
  { Heat_Source_ID: 3, Heat_Source: "Air source heat pump" },
  { Heat_Source_ID: 4, Heat_Source: "GSHP" },
  { Heat_Source_ID: 5, Heat_Source: "Electric storage heaters" },
];
const plan = (bulk) => planBulkChanges({ ...EMPTY, ...bulk }, { heatSources });

// ─── 1. An untouched bar writes nothing ───
{
  const changes = plan({});
  const keys = Object.keys(changes);
  if (keys.length) {
    fail(`an empty bulk bar would write ${JSON.stringify(changes)} — every `
      + `selected plot would be changed by somebody pressing Apply`);
  }
  /* "" is "leave it alone", and that has to hold for every field
     independently: a bar with one thing set must write one thing. */
  const one = plan({ PV: "y" });
  if (Object.keys(one).join(",") !== "PV") {
    fail(`setting PV alone writes ${JSON.stringify(one)}`);
  }
}

// ─── 2. The reported fault: the way back to the calculated figure ───
{
  for (const f of LOAD_FIELDS) {
    /* A figure entered is a figure written. */
    const set = plan({ [f]: "8.5" });
    if (set[f] !== 8.5) fail(`${f}: entering 8.5 wrote ${JSON.stringify(set[f])}`);

    /* And "calculated" clears it — null, not 0 and not "". Zero is a
       load of nothing, which is a plot that draws nothing; "" would not
       satisfy the COALESCE either and the resolver would go on reading
       an override. */
    const cleared = plan({ [f]: CALCULATED });
    if (!(f in cleared)) {
      fail(`${f}: asking for the calculated figure writes nothing, so the `
        + `override stays and the heat source still cannot move it`);
    } else if (cleared[f] !== null) {
      fail(`${f}: asking for the calculated figure wrote `
        + `${JSON.stringify(cleared[f])}, which is still an override`);
    }

    /* Blank still means leave it alone, or opening the bar and pressing
       Apply would wipe the loads off the selection. */
    if (f in plan({ [f]: "" })) fail(`${f}: blank writes something`);
    if (f in plan({ [f]: null })) fail(`${f}: an absent value writes something`);

    /* Zero is a figure somebody can mean, and a bar that dropped it
       would silently leave the old load in place. Tested as a number as
       well as a string: the bar holds strings, where "0" is truthy and
       hides a falsy test, and this function is callable either way. */
    for (const z of ["0", 0]) {
      const zero = plan({ [f]: z });
      if (zero[f] !== 0) {
        fail(`${f}: entering ${JSON.stringify(z)} wrote ${JSON.stringify(zero[f])}`);
      }
    }
  }

  /* Both loads, because they are the same decision asked twice. One of
     them having a way back and the other not is the shape of the fault
     being fixed. */
  if (LOAD_FIELDS.length !== 2 || !LOAD_FIELDS.includes("KVA_Load")
      || !LOAD_FIELDS.includes("Gas_Load_kW")) {
    fail(`the loads that have a way back are ${JSON.stringify(LOAD_FIELDS)}`);
  }
  if (!isCalculated(CALCULATED) || isCalculated("") || isCalculated("2.2")) {
    fail("the sentinel is not distinguishable from a figure");
  }
  /* A sentinel that could be typed into a number box would be a figure
     and a command at once. */
  if (Number.isFinite(Number(CALCULATED))) {
    fail(`${CALCULATED} reads as a number`);
  }
}

// ─── 3. The heat pump model follows the heat source ───
{
  /* Switching to gas and leaving the model behind is how a plot ends up
     costed for both. */
  const gas = plan({ Heat_Source_ID: "1" });
  if (gas.Heat_Source_ID !== 1) fail("the heat source was not written");
  if (gas.Heat_Pump_Model_ID !== null) {
    fail("switching to gas left the heat pump model on the plot");
  }
  const storage = plan({ Heat_Source_ID: "5" });
  if (storage.Heat_Pump_Model_ID !== null) {
    fail("switching to storage heaters left the heat pump model");
  }

  /* An air source plot keeps one, under either spelling of the name —
     the register is the MCS list and the lookup can be renamed. */
  for (const id of ["2", "3"]) {
    const ashp = plan({ Heat_Source_ID: id });
    if ("Heat_Pump_Model_ID" in ashp) {
      fail(`switching to ${heatSources.find((h) => String(h.Heat_Source_ID) === id)
        .Heat_Source} cleared the heat pump model`);
    }
  }

  /* Changing only the model — which is half of what was reported —
     writes only the model. */
  const model = plan({ Heat_Pump_Model_ID: "4" });
  if (model.Heat_Pump_Model_ID !== 4) {
    fail(`changing only the heat pump model wrote ${JSON.stringify(model)}`);
  }
  if ("Heat_Source_ID" in model) fail("changing the model touched the heat source");

  /* Source and model together: both, and the model survives. */
  const both = plan({ Heat_Source_ID: "2", Heat_Pump_Model_ID: "4" });
  if (both.Heat_Source_ID !== 2 || both.Heat_Pump_Model_ID !== 4) {
    fail(`choosing an air source and a model wrote ${JSON.stringify(both)}`);
  }

  /* Back to the project default clears both: a plot needs a way back to
     inheriting, and a heat pump on a plot whose source is unknown is a
     cost with nothing asking for it. */
  const def = plan({ Heat_Source_ID: PROJECT_DEFAULT });
  if (def.Heat_Source_ID !== null || def.Heat_Pump_Model_ID !== null) {
    fail(`the project default wrote ${JSON.stringify(def)}`);
  }
  if (def.Heat_Source_ID === 0 || Number.isFinite(def.Heat_Source_ID)) {
    fail("the project default was written as a number rather than cleared");
  }

  /* ── One spelling of "takes a heat pump" ──

     This used to ask /pump|ashp|gshp|wshp/i, written here and nowhere
     else, while the picker, the GIS editor and 0097's own regex all
     asked `takesHeatPump`. So a bulk change to GSHP kept a model that
     0097 would never read and no load was ever composed from.

     Asserted against `takesHeatPump` itself rather than against a list,
     so the two cannot drift apart again. */
  for (const hs of heatSources) {
    const c = plan({ Heat_Source_ID: String(hs.Heat_Source_ID) });
    const kept = !("Heat_Pump_Model_ID" in c);
    if (kept !== takesHeatPump(hs.Heat_Source)) {
      fail(`"${hs.Heat_Source}" ${kept ? "keeps" : "clears"} the heat pump `
        + `model, and takesHeatPump says it ${takesHeatPump(hs.Heat_Source)
          ? "takes one" : "does not"}`);
    }
  }
  /* A source not in the lookup at all takes no pump: an id with no row
     is not a reason to leave a model on a plot. */
  const unknown = plan({ Heat_Source_ID: "999" });
  if (unknown.Heat_Pump_Model_ID !== null) {
    fail("an unrecognised heat source left the heat pump model in place");
  }
}

// ─── 4. Self-lay is not in here ───
{
  /* It writes Plot_Utility, one row per plot per utility, while
     everything else writes Plot. Folding it in would make `changes` a
     bag that means a different table depending on which key is in it. */
  const c = plan({ SLP_Utility_ID: "2", SLP_Value: "y" });
  if (Object.keys(c).length) {
    fail(`self-lay reached the Plot changes as ${JSON.stringify(c)}`);
  }
}

// ─── 5. The page uses it, and offers the way back ───
{
  const src = readFileSync("src/features/plots/PlotsTab.jsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  if (!/planBulkChanges\(bulk, \{ heatSources/.test(code)) {
    fail("the plots page builds its own bulk changes rather than using the "
      + "rules that are checked here");
  }
  /* The old fourth spelling must not come back. */
  if (/pump\|ashp\|gshp\|wshp/.test(code)) {
    fail("the plots page still has its own idea of which sources take a heat pump");
  }
  /* Both loads get the control, not just the one that was reported. */
  const boxes = code.match(/<LoadBox /g) || [];
  if (boxes.length !== 2) {
    fail(`${boxes.length} load box(es) on the bulk bar — kVA and gas kW are `
      + `the same decision asked twice`);
  }
  if (!/onChange\(calc \? "" : CALCULATED\)/.test(code)) {
    fail("the calculated button does not toggle back to a typed figure");
  }
  /* Disabled and emptied when it is pressed: a figure left visible under
     a pressed button asks which of the two will happen. */
  if (!/disabled=\{calc\}/.test(code)) {
    fail("the figure can still be typed while the calculated button is pressed");
  }
  if (!/aria-pressed=\{calc\}/.test(code)) fail("the toggle does not say it is a toggle");
}

// ─── 6. Every screen that totals loads reads the resolved one ───
{
  /* The consequence of clearing an override: a screen reading the
     override column raw shows 0 for a plot whose load comes from its
     house type. POCApplicationsTab says so beside its own total;
     PlotAssignment did not, and would have started reading zero for the
     whole of project 32 the moment the 1.7s were cleared. */
  for (const f of [
    "src/features/poc/PlotAssignment.jsx",
    "src/features/poc/POCApplicationsTab.jsx",
  ]) {
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    /* Immediately before, not merely nearby. A window of a few lines is
       satisfied by the neighbouring expression that DOES read the
       resolved figure — which is how the first version of this passed a
       mutation putting the raw column back one line below a correct
       one. */
    for (const m of src.matchAll(/KVA_Load\b/g)) {
      const before = src.slice(0, m.index);
      if (!/KVA_Resolved\s*\?\?\s*[\w?.]*$/.test(before)) {
        const line = src.slice(0, m.index).split("\n").length;
        fail(`${f}:${line} reads KVA_Load without the resolved figure in `
          + `front of it, so a plot taking its load from its house type `
          + `counts as nothing`);
      }
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bulk plot changes: blank leaves alone, calculated clears the override, the "
    + "heat pump model follows the source, and the totals read the resolved load.");
process.exit(bad ? 1 : 0);
