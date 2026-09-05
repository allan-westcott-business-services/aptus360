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
import { planFeederPoints, jointMarks } from "./src/features/gis/feederPoints.js";
import { feederSections, circuitMembership } from "./src/features/gis/feeder.js";

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

// 3. The BUILD breaks its run there, and offers a stop for the joint.
//
//    This is what makes a straight joint survive a rebuild. Build LV
//    Network deletes every generated main and lays them again from the
//    trench routing — and a joint is not in that routing. It is a
//    fitting somebody clicked onto a cable, usually mid-span between
//    two trench vertices, so nothing in the model knows it is there.
//    Left alone, a rebuild lays ONE run straight through the fitting
//    and the two sizes either side become one: the designer's work
//    undone by the next build, silently.
{
  const lineTypes = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  let id = 500;
  const tr = (pts, k = "trench", seed = null) => ({ Feature_ID: id++,
    Feature_Type: "line", Layer_Key: "trench", Geometry: pts,
    Attributes: { Line_Type: k, ...(seed ? { Seed_Feature_ID: seed } : {}) } });
  const poc = { Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
  const p1 = { Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 1, Geometry: [[120, 8]], Attributes: {} };
  const mtr = { Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: 1, Geometry: [[120, 8]],
    Attributes: { Seed_Feature_ID: p1.Feature_ID, Circuit_ID: 1 } };
  /* Clicked onto the cable 60 m along a 120 m run \u2014 mid-span, where
     the trench has no vertex. */
  const j = { Feature_ID: id++, Feature_Role: "joint", Feature_Type: "point",
    Layer_Key: "electric", Label: "Straight Joint", Geometry: [[60, 0]],
    Attributes: { Joint_Type: "straight", Circuit_ID: 1 } };
  const world = [poc, p1, mtr, j,
    tr([[0, 0], [120, 0]]),
    tr([[120, 0], [120, 8]], "service_trench", p1.Feature_ID)];
  const opts = { lineTypes, circuitId: 1, plotById: () => ({ kva_load: 3 }),
    nrsById: () => null, ...circuitMembership(world, 1) };

  const r = feederSections(world, opts);
  const ends = (r.sections || []).map((sec) =>
    sec.pts[sec.pts.length - 1][0].toFixed(0));
  if (!ends.includes("60")) {
    fail("the build lays one run straight through the joint \u2014 a rebuild "
      + "would undo the break and the two cable sizes with it");
  }
  if ((r.sections || []).length !== 2) {
    fail(`${(r.sections || []).length} section(s), expected the run broken in two`);
  }
  /* The load does not change at a straight joint: nothing leaves there.
     Both halves carry what the whole length carried. */
  for (const sec of r.sections || []) {
    if (sec.meters !== 1) fail(`a half carries ${sec.meters} meter(s), expected 1`);
  }

  /* And a stop is offered there, or the joint is never adopted. */
  const marks = jointMarks(world, r.model, r.sections);
  if (marks.length !== 1) {
    fail(`${marks.length} joint mark(s), expected one at the fitting`);
  } else if (Math.abs(marks[0].point[0] - 60) > 0.5) {
    fail(`the stop is at ${marks[0].point[0]}, not where the fitting stands`);
  }

  /* A joint NOT on this part's cable is not this part's stop. */
  const elsewhere = [...world, { ...j, Feature_ID: 9999, Geometry: [[60, 400]],
    Attributes: { ...j.Attributes, Span_Anchor: [60, 400] } }];
  if (jointMarks(elsewhere, r.model, r.sections).length !== 1) {
    fail("a joint four hundred metres off the cable was marked as a stop on it");
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
  if (!/for \(const jm of jointMarks\(src, pt\.model, pt\.sections\)\)/.test(canvas)) {
    fail("the build does not offer a stop at a straight joint, so it is "
      + "never adopted and never carries levels");
  }
  if (!/&& !\(f\.Feature_Role === "joint"/.test(canvas)) {
    fail("the levels are not drawn at a straight joint");
  }
  if (!/\|\| f\.Feature_Role === "joint"\);/.test(canvas)) {
    fail("moving a joint or changing a cable at one does not re-run the "
      + "levels, so the figures beside it go stale");
  }
}

/* ── And it wears its code ──

   A feeder end point belongs in the sequence, so a designer reading the
   drawing can find it in the schedule and quote a level at it. C2, C3,
   like every other stop.

   Beside the symbol, not over it: a node's code is white inside its own
   circle, and a joint's symbol is a small diamond drawn with the
   features \u2014 writing over it would bury the fitting. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Drawn as a feeder end point, because that is what it is: circle,
     code inside it, figures beside it, at the size every other stop
     uses. A code as loose text beside a diamond reads as a different
     kind of thing. */
  if (!/const isBox = f\.Feature_Role === "linkbox";/.test(canvas)) {
    fail("a straight joint is treated as carrying its own symbol, so it "
      + "gets no circle and its code sits loose beside the diamond");
  }
  /* And sized as a node. The box formula made the joint's circle and
     figures larger than every other stop's, for no reason a reader
     could see. */
  if (!/const r = isBox\s*\n\s*\? Math\.max\(5, \(on \? 1\.3 : 1\) \* ps\.symbolPx\)/.test(canvas)) {
    fail("a joint is sized by the link box's formula, so its text comes out "
      + "bigger than every other stop's");
  }

  /* ── The link box is still in the pass ──

     Adding the joint, the `linkbox` clause was deleted with the line it
     shared: the box dropped out of the filter entirely and its levels
     vanished from the drawing. A filter is a list of what is wanted,
     and editing one by rewriting the line before it is how an entry
     goes missing. */
  if (!/&& f\.Feature_Role !== "linkbox"\n\s*&& !\(f\.Feature_Role === "joint"/.test(canvas)) {
    fail("the link box is no longer in the levels pass, so a box shows no "
      + "figures at all");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/feature\.Feature_Role === "joint"\n\s*&& String\(f\.Attributes\.Joint_Type/.test(editor)) {
    fail("the editor does not show a straight joint its place on the run");
  }
  /* Only once adopted. A blank code would read as a number missing
     rather than one not yet assigned. */
  if (!/&& f\.Attributes\.Span_Seq != null\)\) && \(/.test(editor)) {
    fail("the panel offers a blank code before the walk has numbered it");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Straight joints behave (a stop on the run, one cable in and one out).");
process.exit(bad ? 1 : 0);
