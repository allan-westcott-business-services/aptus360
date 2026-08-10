/* Which plots a booking may take, once a phase is split by utility.

   Laying the gas on all six plots does not take those plots for the
   water or the electric: different trench, different gang, often a
   different week. That is the whole point of splitting a phase. But two
   bookings covering the same utility cannot both have plot four, or
   whoever turns up second finds the work done \u2014 or worse, both dig.

   The rule is easy to lose: it lives in takenPlots, which five places
   in the panel call and validate calls again on save, and a caller that
   forgets to pass the utilities silently disables plots that are free. */
import { takenPlots, validate } from "./src/features/calloffs/assignments.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const ELECTRIC = [1];
const GAS = [2];
const WATER = [3];

/* Six plots, all laid for gas by one team. */
const existing = [{
  Assignment_ID: 1, Task_Type_ID: 1, Team_ID: 5, Plot_Range: "1-6",
  Start_Date: "2026-08-10", End_Date: "2026-08-11",
}];
const utilitiesOf = (a) => (Number(a.Assignment_ID) === 1 ? GAS : []);
const taken = (mine) => [...takenPlots(existing, 1, null, () => null,
  { utilitiesOf, mine })].map(([p]) => p);

// 1. Every other utility is free to take all six. Gas going in does not
//    take a plot for the water or the electric: different trench,
//    different gang, often a different week.
for (const [what, ids] of [["electric", ELECTRIC], ["water", WATER]]) {
  if (taken(ids).length) fail(`${what} was refused plots ${taken(ids).join(", ")}`);
}

// 2. More gas is not.
if (taken(GAS).length !== 6) {
  fail(`a second gas booking was offered ${6 - taken(GAS).length} of the six`);
}

// 3. A booking that has not been split covers everything, so it clashes.
//    Every booking made before splitting existed is one of these, and
//    reading them as "covers nothing" would let two teams onto one plot.
if (taken([]).length !== 6) fail("an unsplit booking did not clash");

// 4. And against an unsplit booking, a split one still clashes: the
//    older one covers whatever the call-off does, electric included.
const againstUnsplit = [...takenPlots(
  [{ ...existing[0], Assignment_ID: 2 }], 1, null, () => null,
  { utilitiesOf: () => [], mine: ELECTRIC },
)].map(([p]) => p);
if (againstUnsplit.length !== 6) {
  fail("a split booking did not clash with an unsplit one");
}

// 5. The same through validate, which is what runs on save. The panel
//    disabling a pill is a hint; this is the thing that refuses.
const draft = {
  Team_ID: 9, Task_Type_ID: 1, Plot_Range: "1-6",
  Start_Date: "2026-08-17", End_Date: "2026-08-18",
};
const clashes = (utilities) => validate(draft, {
  phases: [{ Task_Type_ID: 1, Task_Type_Name: "Excavation and Lay" }],
  assignments: existing, today: "2026-08-01", utilitiesOf, utilities,
}).filter((x) => /already assigned/.test(x));

if (clashes(ELECTRIC).length) fail(`save refused the electric: ${clashes(ELECTRIC)[0]}`);
if (clashes(WATER).length) fail(`save refused the water: ${clashes(WATER)[0]}`);
if (!clashes(GAS).length) fail("save allowed a second gas booking on the same plots");
if (!clashes([]).length) fail("save allowed an unsplit booking on taken plots");

// 6. Without the utilities, behaviour is what it always was: by phase
//    alone. A caller that has not been updated must not silently open
//    everything up.
if ([...takenPlots(existing, 1)].length !== 6) {
  fail("takenPlots with no utility information stopped clashing");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Utility split behaves (each utility takes plots only from its own).");
process.exit(bad ? 1 : 0);
