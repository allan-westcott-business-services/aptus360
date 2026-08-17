/* Sealing a cable where the programme stops before the design does.

   An electric service call-off connects some of the plots on a feeder.
   The ones past them are not being built yet, but the feeder is drawn
   all the way to them — so the cable just laid ends in mid-air and has
   to be sealed until somebody comes back.

   ── Two kinds of bottle end ──

   The design one is where the feeder genuinely ends: nothing is fed
   beyond it and nothing ever will be. planJoints works those out and
   owns them.

   This one is where the programme stops. The design says the feeder
   carries on, and one day the next call-off reaches the plot beyond it
   and the seal becomes a straight joint.

   Folding this into planJoints would put joints in the design that are
   not part of it, and the next run would either recreate them from the
   wrong rule or wipe them. */
import { readFileSync } from "node:fs";
import { sealPoint, sealsNowJoined, distanceAlong } from "./src/features/gis/bottleEnd.js";
import {
  isBottleEnd, isTemporaryBottleEnd, bottleEndAngle, bottleEndSubmission,
} from "./src/features/gis/joints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A feeder running east, with plots teeing off it every twenty metres. */
const feeder = { Feature_ID: 9, Geometry: [[0, 0], [100, 0]] };
const served = [
  { plot: "12", at: [20, 0] }, { plot: "13", at: [40, 0] },
  { plot: "14", at: [60, 0] }, { plot: "15", at: [80, 0] },
];
const seal = (connected) => sealPoint({ feeder, served, connected });

// 1. Five metres past the last plot connected.
//
//    Not at the tee: the next gang has to joint onto it, and a seal made
//    at the plot leaves nothing to work with. Five metres of tail is
//    what gets dug up and cut back.
{
  const r = seal(["12", "13"]);
  if (!r) fail("no seal where the programme stops short");
  else {
    if (Math.abs(r.at[0] - 45) > 0.01) {
      fail(`the seal landed at ${r.at[0]}, wanted 45`);
    }
    if (r.afterPlot !== "13") fail(`the seal says it follows plot ${r.afterPlot}`);
    /* What it is holding the cable for, which is what lets a later
       call-off find it. */
    if (r.waitingFor.join() !== "14,15") {
      fail(`the seal is waiting for ${r.waitingFor.join("/")}`);
    }
  }

  /* And it follows the last one connected, not the first. */
  const one = seal(["12"]);
  if (!one || Math.abs(one.at[0] - 25) > 0.01) {
    fail(`connecting one plot sealed at ${one?.at?.[0]}, wanted 25`);
  }
}

// 2. Nothing to seal, in three different ways.
{
  /* Every plot connected: the cable runs to its designed end, and what
     goes there is a design bottle end rather than this. */
  if (seal(["12", "13", "14", "15"])) {
    fail("a fully connected feeder was sealed");
  }
  /* Asked of the only guard that can answer it. With plots left out
     further along, the "nothing beyond the last one" test catches the
     same case — so removing this one passed until the fixture had
     nothing beyond at all. */
  if (sealPoint({
    feeder,
    served: [{ plot: "12", at: [20, 0] }],
    connected: ["12"],
  })) {
    fail("a feeder whose only plot is connected was sealed");
  }
  /* Nothing on this feeder connected: nothing has been laid to seal. */
  if (seal(["99"])) fail("a feeder with no work on it was sealed");
  /* A plot skipped in the middle is a gap, not a section not yet built.
     Sealing the far end would say nothing about it. */
  if (seal(["12", "14", "15"])) {
    fail("a gap in the middle was treated as the end of the programme");
  }
}

// 3. The seal is measured along the cable, not as the crow flies.
//
//    A feeder that bends would otherwise be sealed short — five metres
//    of straight line is more than five metres of trench.
{
  const bent = {
    Feature_ID: 9,
    Geometry: [[0, 0], [20, 0], [20, 20], [40, 20]],
  };
  const r = sealPoint({
    feeder: bent,
    served: [{ plot: "1", at: [20, 0] }, { plot: "2", at: [40, 20] }],
    connected: ["1"],
  });
  if (!r) fail("a bent feeder was not sealed");
  /* Twenty along, then five more — which turns the corner and lands
     five metres up the second leg.

     Both coordinates checked. Only checking x passed when the walk
     stopped consuming distance, because the seal then landed at the
     corner, whose x is also 20. */
  else if (Math.abs(r.at[0] - 20) > 0.01 || Math.abs(r.at[1] - 5) > 0.01) {
    fail(`the seal on a bent feeder landed at ${r.at.join(", ")}, wanted 20, 5`);
  }
  /* And a walk that never advances lands on the first vertex rather
     than measuring at all. */
  if (r && r.at[0] === 0 && r.at[1] === 0) {
    fail("the seal did not move along the cable");
  }

  /* And the ordering that decides which plot is last measures the same
     way. */
  if (distanceAlong(bent.Geometry, [40, 20]) <= distanceAlong(bent.Geometry, [20, 0])) {
    fail("plots are not ordered along the cable");
  }
}

// 4. A later call-off turns the seal into a straight joint.
//
//    The cable either side is being joined: the section that was
//    energised and the one just laid. So the electricity flows through.
{
  const s = { waitingFor: ["14", "15"] };
  if (sealsNowJoined([s], ["14"]).length !== 1) {
    fail("reaching the next plot does not replace the seal");
  }
  /* Any of the plots it was waiting for, not only the first. */
  if (sealsNowJoined([s], ["15"]).length !== 1) {
    fail("the seal only answers to the very next plot");
  }
  /* And a call-off elsewhere leaves it alone. */
  if (sealsNowJoined([s], ["99"]).length) {
    fail("an unrelated call-off replaced the seal");
  }
  /* Matched on what it was waiting for rather than on distance: the
     seal recorded that when it was placed, and a rule reading the
     drawing again would answer from a network that has since changed. */
  if (sealsNowJoined([{}], ["14"]).length) {
    fail("a seal with no record of what it waits for was replaced anyway");
  }
}

// 5. Told apart from a design bottle end by a quarter turn.
//
//    Not by a symbol of its own: somebody who knows the symbol should
//    see which is which without a key, and the seal lying across the
//    cable rather than along it says the cable carries on past it.
{
  const cable = {
    Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_main" }, Geometry: [[0, 0], [10, 0]],
  };
  const joint = (temp) => ({
    Feature_Role: "joint", Layer_Key: "electric", Geometry: [[10, 0]],
    Attributes: {
      Joint_Type: "bottleend",
      ...(temp ? { Temporary: true, Submission_ID: 41 } : {}),
    },
  });

  const design = bottleEndAngle(joint(false), [cable]);
  const temp = bottleEndAngle(joint(true), [cable]);
  if (design == null || temp == null) fail("a bottle end has no angle");
  else if (Math.abs(Math.abs(temp - design) - Math.PI / 2) > 1e-9) {
    fail("the temporary bottle end is not a quarter turn from the design one");
  }

  /* Both are bottle ends — same symbol, same kind — and only one is
     temporary. */
  if (!isBottleEnd(joint(false)) || !isBottleEnd(joint(true))) {
    fail("a temporary seal is not recognised as a bottle end");
  }
  if (isTemporaryBottleEnd(joint(false))) {
    fail("a design bottle end reads as temporary");
  }

  /* It knows which call-off put it there, which is what lets it be
     taken away if that call-off is cancelled. */
  if (bottleEndSubmission(joint(true)) !== 41) {
    fail("a temporary seal does not record the call-off that caused it");
  }
  if (bottleEndSubmission(joint(false)) != null) {
    fail("a design bottle end claims a call-off");
  }
}

// 6. The design planner does not own these.
//
//    Folding them in would put joints in the design that are not part of
//    it, and the next run would recreate them from the wrong rule or
//    wipe them.
{
  const joints = readFileSync("./src/features/gis/joints.js", "utf8");
  const at = joints.indexOf("export function planJoints");
  const fn = at < 0 ? "" : joints.slice(at, at + 2500);
  if (/Temporary/.test(fn)) {
    fail("the design planner works out temporary seals as well");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Temporary bottle ends behave (five metres past, a quarter turn, replaceable).");
process.exit(bad ? 1 : 0);
