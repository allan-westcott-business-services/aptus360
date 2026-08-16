/* How much of a call-off is booked, phase by phase.

   A call-off with a team against it looks dealt with, and may be a
   morning booked against a day's dig, or one span of four. Nothing on
   the list said so, so it had to be opened to find out — and a thing you
   open to check is a thing that gets missed.

   Two ways to fall short. A span with no assignment is obvious once
   looked for; time is the one that hides, because a day's excavation
   booked as a morning reads as assigned everywhere until the gang runs
   out of day. */
import { readFileSync } from "node:fs";
import {
  phaseCover, halvesBooked, isListedPhase, COVER_LABEL,
} from "./src/features/calloffs/assignmentCover.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const span = (id, halves) => ({ Span_ID: id, Estimated_Half_Days: halves });
const asg = (id, spanId) => ({ Assignment_ID: id, Span_ID: spanId });
const day = (id, part) => ({ Assignment_ID: id, Part: part });

// 1. Nothing booked is unassigned.
{
  if (phaseCover([span(1, 2)], [], []) !== "unassigned") {
    fail("a phase with no assignments is not unassigned");
  }
  /* Even with days lying around from another phase. */
  if (phaseCover([span(1, 2)], [], [day(9, "Full")]) !== "unassigned") {
    fail("days belonging to another phase count as an assignment");
  }
}

// 2. Time is the failure that hides.
//
//    The case that raised this: one span, one team, a day's work booked
//    as a morning. It read as assigned on every screen.
{
  if (phaseCover([span(1, 2)], [asg(9, 1)], [day(9, "AM")]) !== "part") {
    fail("half a day booked against a day's work reads as assigned");
  }
  if (phaseCover([span(1, 2)], [asg(9, 1)], [day(9, "Full")]) !== "assigned") {
    fail("a full day booked against a day's work is not assigned");
  }
  /* More than the estimate is still assigned — the estimate is a
     planning figure, not a quota. */
  if (phaseCover([span(1, 2)], [asg(9, 1)],
    [day(9, "Full"), day(9, "Full")]) !== "assigned") {
    fail("booking more than the estimate is not counted as assigned");
  }
}

// 3. A span with nothing against it is part assigned.
{
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, 1)], [day(9, "Full")]) !== "part") {
    fail("one span of two booked reads as assigned");
  }
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, 1), asg(8, 2)],
    [day(9, "Full"), day(8, "Full")]) !== "assigned") {
    fail("both spans booked with enough time is not assigned");
  }
}

// 4. An assignment with no span covers them all.
//
//    That is what "all spans" means on the assignment editor, and it is
//    the ordinary case on a call-off with one section.
{
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, null)],
    [day(9, "Full"), day(9, "Full")]) !== "assigned") {
    fail("an all-spans booking with enough time is not assigned");
  }
  /* And is still judged on its time. */
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, null)],
    [day(9, "Full")]) !== "part") {
    fail("an all-spans booking short of the estimate reads as assigned");
  }
}

// 5. Two teams on one span have booked it between them.
//
//    Asking each to meet the whole estimate would call a fully booked
//    job short — which is the split the assignment panel exists to
//    allow.
{
  if (phaseCover([span(1, 4)], [asg(9, 1), asg(8, 1)],
    [day(9, "Full"), day(8, "Full")]) !== "assigned") {
    fail("two teams splitting a span between them reads as short");
  }
}

// 6. No estimate means coverage is the whole test.
//
//    Only excavation and lay is estimated. Reinstatement has no figure,
//    and a call-off raised before 0159 has none at all — marking those
//    "part assigned" would be a warning nobody could act on.
{
  if (phaseCover([span(1, null)], [asg(9, 1)], [day(9, "AM")]) !== "assigned") {
    fail("a phase with no estimate is judged against one anyway");
  }
  if (phaseCover([span(1, 0)], [asg(9, 1)], []) !== "assigned") {
    fail("a zero estimate is treated as work outstanding");
  }
  /* A phase estimated at nothing and booked at nothing is assigned by
     arithmetic alone — 0 >= 0 — so the early return above it is for the
     reader rather than the result. Worth having, and worth knowing it
     is not what makes this pass. */
  /* But coverage still applies. */
  if (phaseCover([span(1, null), span(2, null)], [asg(9, 1)], []) !== "part") {
    fail("an unestimated phase ignores a span nobody is booked for");
  }
}

// 7. Half-days are counted the way the rest of the app counts them.
{
  if (halvesBooked([day(1, "Full")]) !== 2) fail("a full day is not two halves");
  if (halvesBooked([day(1, "AM")]) !== 1) fail("a morning is not one half");
  if (halvesBooked([day(1, "AM"), day(1, "PM")]) !== 2) {
    fail("two halves of a day do not come to a full day");
  }
  /* A row with no part is a full day, which is what the editor writes
     when nobody splits it. */
  if (halvesBooked([{ Assignment_ID: 1 }]) !== 2) {
    fail("a day with no part recorded is not counted as a full one");
  }
}

// 8. Only the phases worth a pill.
//
//    A work type may have half a dozen, and a row carrying six says less
//    than one carrying two.
{
  for (const n of ["Excavation and Lay", "Lay", "Reinstatement", "reinstate"]) {
    if (!isListedPhase(n)) fail(`${n} is not shown on the list`);
  }
  for (const n of ["Jointing", "Survey", "Energise", ""]) {
    if (isListedPhase(n)) fail(`${n} is shown on the list`);
  }
}

// 9. The state is named, not only coloured.
//
//    Three shades of pill is a legend somebody has to learn, and part
//    assigned is exactly the state a colour alone would not tell from
//    done.
{
  for (const k of ["unassigned", "part", "assigned"]) {
    if (!COVER_LABEL[k]) fail(`${k} has no label`);
  }
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  /* The visible label, not the tooltip. Removing the words from the
     pill left COVER_LABEL in the title attribute, and a search of the
     whole file passed while the pill showed nothing but a colour. */
  if (!/<b>\{COVER_LABEL\[state\]\}<\/b>/.test(page)) {
    fail("the pill shows a colour without the words");
  }
  /* And on hover as well, which is where the full phase name is: the
     pill says "Dig" because "Excavation and Lay" is the width of the
     column. */
  if (!/title=\{`\$\{t\.Task_Type_Name\}: \$\{COVER_LABEL\[state\]\}`\}/.test(page)) {
    fail("the pill does not name its phase in full anywhere");
  }
  if (!/c-\$\{state\}/.test(page)) fail("the pill is not coloured by its state");
  /* And the rule comes from the module rather than being worked out
     again on the page — the same question is asked on the call-off
     itself, and two answers would eventually differ. */
  if (!/phaseCover\(/.test(page)) fail("the page works the coverage out itself");
}

// 10. The list is given what it needs to work it out.
{
  const api = readFileSync("./netlify/functions/calloffs-all.js", "utf8");
  for (const t of ["Call_Off_Assignment", "Call_Off_Work_Day", "Task_Type"]) {
    if (!api.includes(t)) fail(`the list endpoint does not fetch ${t}`);
  }
  if (!/json\(\{ rows, workDays, taskTypes \}\)/.test(api)) {
    fail("the days and phases are fetched but not sent");
  }
  /* Tolerated missing, like the utilities before them: an older
     database has no such tables, and a list that failed to load over a
     status pill would be worse than one that cannot show it. */
  const asgFetch = api.slice(api.indexOf('from("Call_Off_Assignment")'));
  if (!/\(\) => \(\{ data: \[\] \}\)/.test(asgFetch.slice(0, 400))) {
    fail("a database without the assignment tables cannot load the list");
  }
}

// 11. The pills are named as the trade names them.
//
//     "Dig" and "Reinstate" were shorter and were not what anybody calls
//     them. A pill on a list is read in passing, and a word somebody has
//     to translate is worse than one taking a little more room.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const fn = page.slice(page.indexOf("function shortPhase"));
  const body = fn.slice(0, fn.indexOf("\n}"));

  if (!/"Excavate & Lay"/.test(body)) fail("the excavation pill is not named Excavate & Lay");
  if (!/"Reinstatement"/.test(body)) fail("the reinstatement pill is not named Reinstatement");
  if (/"Dig"|"Reinstate"(?!ment)/.test(body)) {
    fail("a pill still uses the old short name");
  }
  /* A phase nobody has named appears as itself rather than as its first
     word — which turned "Traffic Management" into "Traffic". */
  if (/split\(\/\\s\+\/\)\[0\]/.test(body)) {
    fail("an unnamed phase is cut to its first word");
  }
}

// 12. A call-off raised from the drawing knows whose work it is.
//
//     The customer column was empty on every one, because nothing set
//     it — and a list with a blank on every row is a column nobody
//     reads.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const call = canvas.slice(canvas.indexOf("const created = await createCallOff("));
  const payload = call.slice(0, call.indexOf("items:"));

  /* The fields being written, not merely mentioned. The resolver reads
     b.Customer_ID on the way to the answer, so a search for the name
     passed while nothing was being set with it. */
  for (const f of ["Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name"]) {
    if (!new RegExp(`\\b${f}:`).test(payload)) {
      fail(`a call-off raised from the drawing does not set ${f}`);
    }
  }
  /* Resolved through the branch, which is what links a developer to a
     customer. */
  if (!/branchOf\(/.test(payload)) {
    fail("the customer is not resolved through the developer's branch");
  }
  /* Only where the answer is one customer. A call-off crossing two
     developers has two, and picking the first would put a name on it
     that is wrong for half the work — worse than the blank, because a
     blank invites the question and a wrong name does not. */
  if (!/ids\.length !== 1/.test(payload)) {
    fail("a call-off crossing two customers is given one of them");
  }

  /* And the endpoint accepts them: a payload writing columns the
     endpoint drops is a change that looks made and is not. */
  const api = readFileSync("./netlify/functions/calloffs.js", "utf8");
  const cols = api.slice(api.indexOf("const SUB_COLS"), api.indexOf("].join"));
  for (const f of ["Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name"]) {
    if (!cols.includes(`"${f}"`)) fail(`${f} is not writable on a call-off`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Assignment coverage behaves (spans and time, per phase).");
process.exit(bad ? 1 : 0);
