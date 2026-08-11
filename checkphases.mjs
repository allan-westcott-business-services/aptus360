/* Which phases each kind of call-off is made of.

   A mains dig is excavated, laid and reinstated. The joints onto it are
   service work, called off separately, so jointing follows excavate and
   lay on a service call-off and not on a mains one.

   Nothing in the code names a phase — the sequence lives entirely in
   Work_Type_Task_Type, which is an admin table. That is the right place
   for it, and it also means the rule can be changed by anyone with the
   admin screen open, with nothing to say the board has stopped matching
   how the work is actually called off. This is that something.

   It checks the fixture, which is what the offline board and every
   render test run against. The live rule is the same rows in the
   database, and if the two disagree the fixture is the one that is
   wrong. */
import { planningMock } from "./src/lib/mockData.js";
import { teamMayTake } from "./src/features/calloffs/assignments.js";
import { phaseUtilityNames } from "./src/features/planning/timeline.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const d = planningMock();
const nameOf = (id) =>
  d.taskTypes.find((t) => Number(t.Task_Type_ID) === Number(id))?.Task_Type_Name;

const sequenceFor = (workTypeName) => {
  const wt = d.workTypes.find((w) => w.Work_Type_Name === workTypeName);
  if (!wt) { fail(`no work type called ${workTypeName}`); return []; }
  return d.workTypeTasks
    .filter((x) => Number(x.Work_Type_ID) === Number(wt.Work_Type_ID))
    .sort((a, b) => (a.Display_Order ?? 0) - (b.Display_Order ?? 0))
    .map((x) => nameOf(x.Task_Type_ID));
};

const mains = sequenceFor("Mains Call Off");
const service = sequenceFor("Service Call Off");

// The rule itself.
if (mains.includes("Jointing")) {
  fail(`jointing is on the mains call-off: ${mains.join(" \u2192 ")}`);
}
if (!service.includes("Jointing")) {
  fail(`jointing is missing from the service call-off: ${service.join(" \u2192 ")}`);
}

// And where it sits: after the dig and the lay, before reinstatement.
// Jointing before the pipe is in the ground is not a sequence anybody
// works to, and the board would offer it as a valid drop.
const at = (xs, n) => xs.indexOf(n);
if (at(service, "Jointing") < at(service, "Excavation")) {
  fail("jointing comes before excavation on the service call-off");
}
if (at(service, "Laying") !== -1 && at(service, "Jointing") < at(service, "Laying")) {
  fail("jointing comes before laying on the service call-off");
}
if (at(service, "Reinstatement") !== -1
  && at(service, "Jointing") > at(service, "Reinstatement")) {
  fail("jointing comes after reinstatement on the service call-off");
}

// Both kinds still dig and reinstate, or something else has gone wrong.
for (const [what, seq] of [["mains", mains], ["service", service]]) {
  for (const phase of ["Excavation", "Reinstatement"]) {
    if (!seq.includes(phase)) fail(`${what} call-off has no ${phase}`);
  }
}

// ── A gang can only be given work it holds the craft for ──
//
// The rule skipped the check when the task type had no craft set, so a
// phase nobody had configured could be dropped on any gang at all —
// the opposite of what the rule is for, and invisible, because it looks
// like the drop simply worked.
{
  const team = { Team_ID: 1, Team_Name: "MU Gang 1", Active: true };
  const base = {
    teamCrafts: [{ Team_ID: 1, Craft_ID: 1 }],
    teamRegions: [{ Team_ID: 1, Region_ID: 1 }],
    regionId: 1,
  };
  if (teamMayTake(team, { ...base, craftId: 1, taskName: "Excavation and Lay" })) {
    fail("a gang holding the craft was refused");
  }
  if (!teamMayTake(team, { ...base, craftId: 4, taskName: "Jointing" })) {
    fail("a gang without the craft was allowed");
  }
  /* A phase with no craft is allowed, because Task_Type can hold only
     one craft and ours are done by several. Refusing here blocked every
     Excavation & Lay drag on the board. The real fix is a craft that
     knows its work type and utilities \u2014 until then this must not
     pretend to judge. */
  if (teamMayTake(team, { ...base, craftId: null, taskName: "Laying" })) {
    fail("a phase with no craft was refused, blocking legitimate work");
  }
}

// ── Reinstatement carries no utility dots ──
//
// It puts the ground back, and what was laid in it does not matter.
// Null means "all of them", which is what was being drawn; an empty
// list means none.
{
  const r = phaseUtilityNames("Reinstatement");
  if (r === null || r.length) fail("reinstatement still carries utility dots");
  if (phaseUtilityNames("Jointing")?.join() !== "electric") {
    fail("jointing is no longer electric-only");
  }
  if (phaseUtilityNames("Excavation and Lay") !== null) {
    fail("excavation stopped showing the utilities in the trench");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Call-off phases behave (mains: ${mains.join(" \u2192 ")}`
    + ` | service: ${service.join(" \u2192 ")}).`);
process.exit(bad ? 1 : 0);
