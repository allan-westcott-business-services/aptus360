/* A straight joint is a feeder end point.

   It takes one cable in and one out, and exists so a designer can
   change size either side of it. The cable genuinely STOPS there and
   another begins — which is the definition of a feeder end point, so
   the levels are quoted at it and the two lengths either side are two
   legs carrying two cable sizes.

   A service joint is not one: a cable passes through it and nothing
   about the run changes. A breech is where a run divides, and the walk
   already marks that as a junction. */
import { readFileSync } from "node:fs";
import { straightJointWarning, straightJointCables } from "./src/features/gis/joints.js";
import { planFeederPoints } from "./src/features/gis/feederPoints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const joint = (attrs = {}) => ({ Feature_ID: 7, Feature_Role: "joint",
  Feature_Type: "point", Layer_Key: "electric", Label: "Straight Joint",
  Geometry: [[50, 0]],
  Attributes: { Joint_Type: "straight", Span_Anchor: [50, 0], ...attrs } });
const run = (id, a, b) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "electric", Geometry: [a, b],
  Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } });

// 1. One in, one out — said, not refused. A drawing is mid-edit for most
//    of its life, and a joint with one cable is what you have between
//    placing the fitting and drawing the second run.
{
  const two = [run(1, [0, 0], [50, 0]), run(2, [50, 0], [100, 0])];
  if (straightJointWarning(joint(), two)) {
    fail("one in and one out is reported as a fault");
  }
  if (!straightJointWarning(joint(), [run(1, [0, 0], [50, 0])])) {
    fail("a straight joint with one cable says nothing \u2014 that is a bottle "
      + "end, and somebody meant to draw the second run");
  }
  const three = [...two, run(3, [50, 0], [50, 80])];
  const w = straightJointWarning(joint(), three);
  if (!w || !/breech/.test(w)) {
    fail("three cables at a straight joint does not name the fitting it "
      + "actually is");
  }
  /* Counted by cable ENDS. A main running past is not connected to it,
     and one touching at an interior vertex is passing through — which
     is a service joint's arrangement, not this one. */
  if (straightJointCables(joint(), [run(9, [0, 0], [100, 0])]).length) {
    fail("a cable passing through counts as connected");
  }
  /* And nothing is said about the other kinds. */
  for (const kind of ["service", "breech", "bottleend"]) {
    if (straightJointWarning(joint({ Joint_Type: kind }), [])) {
      fail(`a ${kind} joint is judged by the straight-joint rule`);
    }
  }
}

// 2. The walk adopts it, as it adopts a link box: it is a fitting placed
//    by hand that the cable stops at.
{
  const nodes = [
    { point: [0, 0], kind: "origin" },
    { point: [50, 0], kind: "end" },
  ];
  const plan = planFeederPoints({
    nodes, existing: [joint({ Circuit_ID: 1 })],
    circuit: { id: 1, name: "Circuit 1", letter: "A" },
  });
  const w = (plan.adopt || []).find((x) => x.Feature_ID === 7);
  if (!w) {
    fail("a straight joint is not adopted onto the stop it stands at, so "
      + "no levels are quoted there");
  } else {
    if (w.Attributes.Span_Label !== "A1") {
      fail(`the joint was numbered ${w.Attributes.Span_Label}, wanted A1`);
    }
    /* Its own name is its own: "Straight Joint" is what it is called,
       and the span code is what it is called ON the run. */
    if (w.Label !== "Straight Joint") {
      fail(`the joint was renamed to ${w.Label}`);
    }
  }
  /* And nothing is created on top of it. */
  if ((plan.create || []).some((p) =>
    Math.hypot(p.Geometry[0][0] - 50, p.Geometry[0][1]) < 1)) {
    fail("a feeder point was created where the joint already stands");
  }
}

/* The trace stops there, and the drawing shows the figures. */
{
  const fdr = readFileSync("./src/features/gis/feeder.js", "utf8");
  if (!/Joint_Type \?\? ""\)\.toLowerCase\(\) === "straight"/.test(fdr)) {
    fail("spanTrace does not treat a straight joint as a stop, so the leg "
      + "runs straight through it and reports one cable size for two");
  }
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/&& !\(f\.Feature_Role === "joint"/.test(canvas)) {
    fail("the levels are not drawn at a straight joint");
  }
  if (!/\|\| f\.Feature_Role === "joint"\);/.test(canvas)) {
    fail("moving a joint or changing a cable at one does not re-run the "
      + "levels, so the figures beside it go stale");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Straight joints behave (a stop on the run, one cable in and one out).");
process.exit(bad ? 1 : 0);
