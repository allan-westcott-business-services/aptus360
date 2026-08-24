/* Booking the breech joints.

   A service call-off traces back to the mains through breech joints,
   and the yellow panel at the top of the call-off lists them. The gang
   works at each one as well as at the meter, so the joints have to go
   on a team the same way the plots do.

   ── What was wrong ──

   The assignment carried a Node_Range column (0186) and the save wrote
   it, but from `Object.values(draft.dayNodes).flat()` — and dayNodes is
   only ever filled by the per-day picker, which appears only when the
   booking IS split by day, in which case Node_Range is written null. So
   on every booking that reached it, the expression evaluated to empty.
   The column was written by nothing and read by nothing.

   Two quieter faults sat underneath that:

   - **Nothing read it back.** `startEdit` built dayNodes from the work
     day rows and never looked at the assignment's own Node_Range, so
     reopening a booking and pressing Save changes wrote the joints away
     — the form had no record of them, so it saved none.

   - **Abandoned per-day picks leaked.** Tick the split on, choose
     joints, tick it off: the flatten wrote those picks as the booking's
     range, with nothing on the form showing them.

   All three are the same shape as fault 13 — one fact with more than
   one home — and they are why this reads the real functions rather than
   trusting the column exists. */
import { readFileSync } from "node:fs";
import {
  takenNodes, takenPlots, parseNodes, serialiseNodes,
} from "./src/features/calloffs/assignments.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

// 1. A joint is claimed per phase, and released to the booking editing it.
{
  const asg = [
    { Assignment_ID: 1, Task_Type_ID: 7, Team_ID: 3, Node_Range: "A1, A2" },
    { Assignment_ID: 2, Task_Type_ID: 7, Team_ID: 4, Node_Range: "A4" },
    { Assignment_ID: 3, Task_Type_ID: 9, Team_ID: 5, Node_Range: "A9" },
  ];
  const held = takenNodes(asg, 7);
  for (const n of ["A1", "A2", "A4"]) {
    if (!held.has(n)) fail(`${n} is booked on this phase and reads as free`);
  }
  if (held.has("A9")) fail("a joint on another phase is treated as taken");

  /* The booking being edited does not hold joints against itself, or
     reopening one would show its own joints greyed out. */
  const editing = takenNodes(asg, 7, 1);
  if (editing.has("A1")) fail("a booking's own joints are held against it while editing");
  if (!editing.has("A4")) fail("another booking's joints were released by the exception");

  const named = takenNodes(asg, 7, null, (id) => `Team ${id}`);
  if (named.get("A1") !== "Team 3") fail("the holding team is not named");
}

// 2. Laying the gas does not take a joint for the water.
//
//    The same utility rule as the plots, because it is the same rule: a
//    booking only takes a joint from another it shares a utility with.
//    A booking with no utilities recorded covers whatever the call-off
//    does and clashes with everything, which is the safe reading.
{
  const asg = [{ Assignment_ID: 1, Task_Type_ID: 7, Team_ID: 3, Node_Range: "A1" }];
  const utils = new Map([[1, [2]]]);          // that booking is gas
  const opts = (mine) => ({ utilitiesOf: (a) => utils.get(a.Assignment_ID) || [], mine });

  if (takenNodes(asg, 7, null, () => null, opts([3])).has("A1")) {
    fail("a gas booking takes the joint for the water");
  }
  if (!takenNodes(asg, 7, null, () => null, opts([2])).has("A1")) {
    fail("a gas booking does not take the joint for another gas booking");
  }
  if (!takenNodes(asg, 7, null, () => null, opts([])).has("A1")) {
    fail("a booking covering the whole call-off does not clash");
  }
}

// 3. The plots are unaffected.
//
//    Both now run through one body with the field passed in. If that
//    refactor moved anything, it moved it for the plots too, and the
//    plot rule is the one every existing booking depends on.
{
  const asg = [
    { Assignment_ID: 1, Task_Type_ID: 7, Team_ID: 3, Plot_Range: "18-20", Node_Range: "A1" },
    { Assignment_ID: 2, Task_Type_ID: 7, Team_ID: 4, Plot_Range: "22" },
  ];
  const held = takenPlots(asg, 7);
  for (const p of ["18", "19", "20", "22"]) {
    if (!held.has(p)) fail(`plot ${p} is booked and reads as free`);
  }
  if (held.has("21")) fail("an unbooked plot reads as taken");
  /* And the two do not read each other's column. */
  if (held.has("A1")) fail("takenPlots is picking up node labels");
  if (takenNodes(asg, 7).has("18")) fail("takenNodes is picking up plot numbers");

  /* ── Each reads its column with its own parser ──

     On the labels a drawing actually produces — A1, A2, Seal after 22 —
     parsePlots and parseNodes agree, because neither expands anything
     that is not two numbers around a hyphen. So swapping one for the
     other is invisible until the day a node is numbered, and then one
     joint called "1-3" silently becomes three joints called 1, 2 and 3,
     each held against a different booking.

     Asserted here at the one input where they diverge, because that is
     the only place the choice can be caught. */
  const numeric = [{ Assignment_ID: 9, Task_Type_ID: 7, Team_ID: 3, Node_Range: "1-3" }];
  const asNodes = takenNodes(numeric, 7);
  if (asNodes.size !== 1 || !asNodes.has("1-3")) {
    fail("takenNodes expanded a numeric node label as a range — it is a name, not a run");
  }
}

// 4. A node label survives the round trip.
//
//    parseNodes, not parsePlots: "A1-A4" is a name, and expanding it as
//    a range turns one joint into gibberish or several.
{
  const round = (s) => serialiseNodes(parseNodes(s));
  if (round("A1, A2") !== "A1, A2") fail(`"A1, A2" did not survive: ${round("A1, A2")}`);
  if (parseNodes("A1-A4").length !== 1) fail("a hyphenated node label was expanded as a range");
  if (serialiseNodes([]) !== null) fail("no joints stored as empty text rather than null");
  if (parseNodes(null).length) fail("a null Node_Range parsed as a joint");
  /* Seals ride in the same field and carry spaces. */
  if (round("Seal after 22") !== "Seal after 22") fail("a seal label did not survive");
}

// 5. The booking's joints are saved from the booking's own selection.
//
//    Not from the per-day map. That is what wrote null on every booking
//    that reached it, and what leaked abandoned per-day picks on the
//    ones that did not.
{
  if (/Node_Range:\s*splitByDay\s*\?\s*null\s*:\s*serialiseNodes\(\s*\n?\s*Object\.values/
    .test(page)) {
    fail("the booking's Node_Range is still flattened from dayNodes");
  }
  if (!/Node_Range:\s*splitByDay\s*\?\s*null\s*:\s*serialiseNodes\(draft\.nodes/.test(page)) {
    fail("the booking's Node_Range is not saved from draft.nodes");
  }
  /* And the per-day rows still carry theirs, which is the other half of
     the same rule: one fact, one home, chosen by the split. */
  if (!/Node_Range:\s*splitByDay\s*\n?\s*\?\s*serialiseNodes\(draft\.dayNodes/.test(page)) {
    fail("the day rows no longer carry their own joints");
  }
}

// 6. And read back when the booking is reopened.
//
//    The fault this catches is silent and destructive: the form loads
//    without the joints, and the next Save changes writes that absence
//    over what was stored.
{
  if (!/nodes:\s*parseNodes\(a\.Node_Range\)/.test(page)) {
    fail("reopening a booking does not read its joints back — saving it will clear them");
  }
  if (!/\bnodes:\s*\[\]/.test(page)) {
    fail("a new booking has no joints field, so the picker has nothing to write to");
  }
}

// 7. The picker is on the form, under the plots, and not while split.
//
//    Under the plots because that is the order the work reads in, and
//    hidden while the days carry their own because the per-day grid
//    asks the same question — two answers and no rule for which wins.
{
  const at = page.indexOf("!splitByDay && nodeChoices.length > 0");
  if (at < 0) fail("the joints picker is not rendered on the booking form");

  const plotsAt = page.indexOf("row.Selection_Mode !== \"Span\" && plotUniverse.length > 0\n"
    + "                  && !splitByDay");
  if (at >= 0 && plotsAt >= 0 && at < plotsAt) {
    fail("the joints picker is above the plots rather than under them");
  }

  /* Written to by the pill, so the control is not decorative. */
  const block = at >= 0 ? page.slice(at, at + 4000) : "";
  if (!/nodes:\s*on\s*\n?\s*\?\s*\(d\.nodes \|\| \[\]\)\.filter/.test(block)) {
    fail("the joint pills do not toggle the booking's selection");
  }
  if (!/takenNodesFor\(/.test(block)) {
    fail("the joint pills do not check what another team already holds");
  }
  if (!/Breech Joints/.test(block)) fail("the row is not labelled");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Breech joints book like plots do (claimed once, saved, and read back).");
process.exit(bad ? 1 : 0);
