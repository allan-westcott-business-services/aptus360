/* Which phases a call-off asks for.

   An electric service call-off came out with Excavation & Lay and
   Reinstatement on it and neither is booked there: the service goes in
   the trench the mains call-off already dug, and the ground is
   reinstated once for the street rather than plot by plot. Two sections
   nobody fills in, on every one of them, above the section they came to
   use. */
import {
  isElectricService, phasesToShow, phasesHidden,
} from "./src/features/calloffs/callOffPhases.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const PHASES = [
  { Task_Type_ID: 1, Task_Type_Name: "Excavation and Lay" },
  { Task_Type_ID: 2, Task_Type_Name: "Jointing" },
  { Task_Type_ID: 3, Task_Type_Name: "Reinstatement" },
  { Task_Type_ID: 4, Task_Type_Name: "Energisation" },
];
const names = (list) => list.map((p) => p.Task_Type_Name).join(", ");

// 1. An electric service drops the dig and the reinstatement.
{
  const got = names(phasesToShow(PHASES, "Electric Service"));
  if (got !== "Jointing, Energisation") fail(`an electric service shows ${got}`);

  /* And says which two are missing, so the sections do not simply
     vanish for somebody who knew they were there. */
  const gone = names(phasesHidden(PHASES, "Electric Service"));
  if (gone !== "Excavation and Lay, Reinstatement") {
    fail(`the ones left out came back as ${gone}`);
  }
}

// 2. Every other work type keeps all of them.
//
//    A gas service has its own trench to the plot, and an electric
//    mains call-off is where the digging is booked. This is a fact
//    about the pair of words, not about either one.
for (const wt of ["Electric Mains", "Gas Service", "Water Service",
  "Gas Mains", "Lighting Service"]) {
  if (names(phasesToShow(PHASES, wt)) !== names(PHASES)) {
    fail(`${wt} lost a phase it books`);
  }
  if (phasesHidden(PHASES, wt).length) fail(`${wt} reported hidden phases`);
}

// 3. A call-off covering more than one utility keeps them.
//
//    Electric and gas services together have a gas trench in them, so
//    the dig is somebody's and belongs on the call-off.
for (const wt of ["Electric and Gas Service", "Electric / Water Service"]) {
  if (!phasesToShow(PHASES, wt).some((p) => /^excav/i.test(p.Task_Type_Name))) {
    fail(`${wt} lost the dig, which is the gas or water gang's`);
  }
}

// 4. Both words are needed.
{
  if (isElectricService("Electric Mains")) fail("a mains call-off matched");
  if (isElectricService("Gas Service")) fail("a gas service matched");
  if (isElectricService("")) fail("a call-off with no work type matched");
  if (isElectricService(null)) fail("a missing work type matched");
  if (!isElectricService("Electric Service")) fail("the plain name did not match");
  /* Cased and worded as the register happens to have it. */
  if (!isElectricService("ELECTRIC SERVICE")) fail("an upper-case name did not match");
  if (!isElectricService("Electric service connections")) {
    fail("a longer name did not match");
  }
}

// 5. Order is the work type's own.
//
//    The same phase sits at a different point in different work types,
//    so filtering must not reorder what is left.
{
  const shown = phasesToShow(PHASES, "Electric Service");
  const order = PHASES.filter((p) => shown.includes(p));
  if (names(shown) !== names(order)) fail("the remaining phases were reordered");
}

// 6. Nothing to filter is not an error.
{
  if (phasesToShow([], "Electric Service").length) fail("phases appeared from nothing");
  if (phasesToShow(undefined, "Electric Service").length) fail("an absent list produced phases");
  if (phasesHidden([], "Electric Service").length) fail("hidden phases appeared from nothing");
  /* A work type whose phases are all filtered out still returns a list
     rather than throwing \\u2014 the page has a message for an empty one. */
  const only = [{ Task_Type_ID: 1, Task_Type_Name: "Excavation and Lay" }];
  if (phasesToShow(only, "Electric Service").length !== 0) {
    fail("a work type of nothing but digging kept a section");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Call-off phases behave (an electric service books no dig and no reinstatement).");
process.exit(bad ? 1 : 0);
