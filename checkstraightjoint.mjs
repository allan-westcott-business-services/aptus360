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

// 2. The fitting and the stop are TWO objects.
//
//    A straight joint is a fitting, and there is a stop on the run
//    where it sits — the diamond says what is in the ground, the circle
//    says where this is on the cable, and a designer wants to move each
//    without the other. Adopting the joint AS the stop fused them into
//    one thing that could only be dragged together, and drew a circle
//    that looked glued to the diamond.
//
//    A breech has had it right all along: the fitting is a joint and
//    the build makes a separate feeder point beside it. `jointMarks`
//    offers the stop; nothing adopts it; the build creates a point
//    there like any other.
{
  const nodes = [
    { point: [0, 0], kind: "origin" },
    { point: [50, 0], kind: "end" },
  ];
  const plan = planFeederPoints({
    nodes, existing: [joint({ Circuit_ID: 1 })],
    circuit: { id: 1, name: "Circuit 1", letter: "A" },
  });
  if ((plan.adopt || []).some((x) => x.Feature_ID === 7)) {
    fail("the joint is adopted as the feeder end point, which fuses the "
      + "fitting and the stop into one object");
  }
  const made = (plan.create || []).filter((p) =>
    Math.hypot(p.Geometry[0][0] - 50, p.Geometry[0][1]) < 1);
  if (made.length !== 1) {
    fail(`${made.length} feeder point(s) made at the joint, expected one `
      + "separate point beside the fitting");
  } else if (made[0].Attributes.Span_Label !== "A1") {
    fail(`the point was numbered ${made[0].Attributes.Span_Label}, wanted A1`);
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

/* ── The drawing keeps them apart ──

   The joint is not in the levels pass and is not a stop in the trace.
   The separate feeder point the build makes at it carries the code, the
   circle and the figures, exactly as at a breech — and is dragged on
   its own, which is the whole point of them being two objects.

   Three wrong shapes were tried before this one: the code as loose text
   beside the diamond; the circle drawn OVER the diamond, which made the
   fitting vanish; and the circle offset on a leader, which still moved
   with the joint because it was still the joint. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fdr = readFileSync("./src/features/gis/feeder.js", "utf8");

  /* The levels pass takes span nodes, feeder points and the box \u2014 and
     not joints. The box's clause was once deleted along with the line
     it shared, and its levels vanished from every drawing: a filter is
     a list of what is wanted. */
  /* The region, not the exact layout: a long comment sits between the
     clauses, and a regex demanding adjacent lines reported the filter
     missing when only the formatting had changed. */
  const passAt = canvas.indexOf('if (f.Feature_Role !== "spannode"\n        && f.Feature_Role !== "feederpoint"');
  const filter = passAt < 0 ? "" : canvas.slice(passAt, canvas.indexOf("continue;", passAt));
  if (!filter) fail("the levels pass filter has gone");
  else {
    for (const role of ["spannode", "feederpoint", "linkbox"]) {
      if (!filter.includes(`!== "${role}"`)) {
        fail(`the levels pass no longer takes ${role}s \u2014 that kind of stop `
          + "shows no figures at all");
      }
    }
    if (/Joint_Type/.test(filter)) {
      fail("a joint is back in the levels pass, so the fitting and the stop "
        + "are drawn as one object again");
    }
  }
  if (/const isJointFep/.test(canvas)) {
    fail("the joint is still drawn as a feeder end point, so the fitting and "
      + "the stop cannot be moved apart");
  }

  /* Nor is it a stop in the trace: the separate point is. */
  if (/Joint_Type \?\? ""\)\.toLowerCase\(\) === "straight"[\s\S]{0,200}?isStopFeature/.test(fdr)) {
    fail("spanTrace still treats the joint itself as a stop");
  }

  /* The editor does not offer the joint a span code either \u2014 the code
     belongs to the point beside it. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (/feature\.Feature_Role === "joint"\s*\n\s*&& String\(f\.Attributes\.Joint_Type/.test(editor)) {
    fail("the editor still shows the joint a span code that belongs to the "
      + "feeder point beside it");
  }
}

/* ── Dragging it moves the two cables it holds, and no third ──

   A straight joint holds exactly two cable ends: one in, one out. That
   is a fact the drawing cannot contradict, so the rule says it rather
   than trusting a record that may not have been written.

   Where `Connects` exists it answers. Where it does not, the fallback
   is bounded by what the fitting IS — the two NEAREST cable ends, and
   no third. The halves have a vertex on the joint, so they are nearer
   than anything merely ending close to it. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* ── Bounded whatever the record says ──

     `Connects` is computed from GEOMETRY: connectedTo takes anything
     with a vertex within a quarter of a metre. So the relink pass
     writes a passing cable into the joint's list as readily as the two
     it holds, and treating the list as the answer put the bug back on
     the next build with the record now agreeing with it.

     A record derived from the same geometry that was wrong cannot
     correct it. The fitting's definition can. */
  if (/joinsEnds && !held\.size && isFeeder/.test(canvas)) {
    fail("the two-cable bound applies only where no Connects was written \u2014 "
      + "the relink pass writes one from geometry, so the next build puts "
      + "the passing cable back");
  }
  if (!/if \(joinsEnds && isFeeder\n\s*&& String\(pt\.Attributes\?\.Joint_Type \?\? ""\)\.toLowerCase\(\) === "straight"\)/.test(canvas)) {
    fail("a straight joint is not bounded to the two cables it holds");
  }
  if (!/\.slice\(0, 2\)/.test(canvas)) {
    fail("the fallback is not bounded to two cable ends, which is what a "
      + "straight joint holds");
  }
  /* A breech is NOT bounded this way: it takes an incoming main and
     sends several out, and how many is the designer's business. */
  if (/joinsEnds && !held\.size && isFeeder\s*\n\s*&& String\(pt\.Attributes\?\.Joint_Type \?\? ""\)\.toLowerCase\(\) === "breech"/.test(canvas)) {
    fail("a breech is bounded to two cables, and it is not a two-cable "
      + "fitting");
  }
}

/* ── The stop wears its output's colour ──

   The link box output's colour where the point is on an output, the
   circuit's where it is not. A stop on a coloured output drawn in the
   circuit's colour reads as belonging to something else, which is the
   whole reason the outputs are coloured.

   Taken from the box's own `Way_Colours` \u2014 where the runs get theirs \u2014
   so the cable and the stop standing on it cannot disagree. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* Through the shared rule now: the drawing and the "objects here"
     picker both ask, and working it out in each place is how the
     swatch came to show amber for a point drawn pink. */
  if (!/wayColourOf\(f, features\)/.test(canvas)) {
    fail("a feeder point on a link box output is drawn in the circuit's "
      + "colour, so it reads as belonging to something else");
  }
  if (!/\|\| ringColours\?\.get\?\.\(Number\(f\.Attributes\?\.Circuit_ID\)\)/.test(canvas)) {
    fail("a feeder point NOT on an output has no colour to fall back to");
  }
  /* And the point is stamped when it is made, or there is nothing to
     read the output's colour from. */
  const fn = canvas.slice(canvas.indexOf("async function placeJointOnCable"),
    canvas.indexOf("async function placeAt(point)"));
  if (!/Link_Box_ID: line\.Attributes\.Link_Box_ID/.test(fn)
    || !/Link_Way: line\.Attributes\.Link_Way/.test(fn)) {
    fail("the point does not take the cable's output, so its circle cannot "
      + "wear the output's colour");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Straight joints behave (a stop on the run, one cable in and one out).");
process.exit(bad ? 1 : 0);
