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
    fail("a straight joint with one cable says nothing — that is a bottle "
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
  /* Clicked onto the cable 60 m along a 120 m run — mid-span, where
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
    fail("the build lays one run straight through the joint — a rebuild "
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

  /* The levels pass takes span nodes, feeder points and the box — and
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
        fail(`the levels pass no longer takes ${role}s — that kind of stop `
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

  /* The editor does not offer the joint a span code either — the code
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
    fail("the two-cable bound applies only where no Connects was written — "
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
  /* ── And it picks from the right pool ──

     Bounded to two, it scanned every feeder main on the drawing — so a
     cable from ANOTHER circuit ending at the same point took one of the
     two slots. Ties break by id, and the newer half of a freshly broken
     cable always loses, so one half followed the joint and the other
     stayed: which reads as the break having failed rather than as a
     third cable being counted.

     The loop applies a circuit guard a few lines above. Two filters for
     one rule is the fault; this is the same rule. */
  if (!/&& !\(pt\.Attributes\?\.Circuit_ID != null\n\s*&& l\.Attributes\?\.Circuit_ID != null/.test(canvas)) {
    fail("the two-nearest fallback picks from every circuit's cables, so "
      + "another circuit's can take a slot and half the broken cable is "
      + "left behind");
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

   Taken from the box's own `Way_Colours` — where the runs get theirs —
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

/* ── An electric meter takes its circuit's colour ──

   Asked for. Every LV feeder cable is drawn in its circuit's colour and
   the report ring is the same colour; the meters hanging off them were
   all the layer's one colour, so on a drawing with four circuits there
   was no way to see which board a house is fed from without tracing its
   service back. On project 20 that is 41 meters orange and 44 magenta,
   matching their cables.

   The same map the cables and rings use, so the three cannot disagree. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf('if (isMeter && f.Layer_Key === "electric")');
  /* To the end of the branch, not a fixed number of characters. The
     first version of this sliced 400 and went red the moment the branch
     grew — the same fault as the character windows in 160, written
     again a fortnight later. `if (cc) fill = cc;` closes it. */
  const end = canvas.indexOf("if (cc) fill = cc;", at);
  const body = at < 0 ? "" : canvas.slice(at, end > at ? end + 20 : at + 400);
  if (!body) fail("an electric meter is not coloured by its circuit");
  else {
    if (!/ringColours\.get\(Number\(cid\)\)/.test(body)) {
      fail("the meter is coloured from its own map rather than the one the cables "
        + "and rings use, so the three can disagree");
    }
    /* Only where the circuit HAS a colour: a meter on an uncoloured
       circuit, or one not yet on a circuit, keeps the style's colour
       rather than turning grey. */
    if (!/if \(cc\) fill = cc;/.test(body)) {
      fail("a meter whose circuit has no colour is painted with nothing");
    }
    /* Electric only: a gas or water meter has no circuit and must not
       be recoloured by a stray Circuit_ID. */
    if (!/f\.Layer_Key === "electric"/.test(body)) {
      fail("meters on other utilities are recoloured too");
    }
  }
  /* ── Fed from a link box output, it wears that output ──

     A box's outputs can each carry their own colour and the runs
     leaving them are drawn in it. A meter on one of those outputs was
     still painted its CIRCUIT's colour, so on a drawing where the point
     of the colours is telling three outputs apart, the houses all
     looked the same. Project 20's box sets three; its 41 meters split
     27 and 14 across two of them.

     Same order as the cable — the output's colour where the box sets
     one, the circuit's otherwise — so a meter and the cable feeding it
     can never disagree, and a box with no way colours changes nothing. */
  /* Through `wayColourOf`, the one rule the runs and the picker use —
     not worked out again here, which is what checklinkwayisolate
     forbids and what the first version of this did. */
  if (!/const wayInk = wayColourOf\(f, features\);/.test(body)) {
    fail("a meter fed from a link box output ignores that output's colour, or "
      + "works it out for itself instead of asking the shared rule");
  }
  if (!/const cc = wayInk \?\? \(cid != null \? ringColours\.get\(Number\(cid\)\) : null\)/.test(body)) {
    fail("the output's colour does not take precedence over the circuit's, or the "
      + "circuit's is no longer the fallback");
  }
  /* The box is looked up in the canvas's own list. `allFeatures` is the
     editor's prop name and does not exist here — it would throw on
     every meter, which a build does not catch. */


  /* The colour map must be in the draw's dependencies, or recolouring a
     circuit leaves its meters as they were. */
  const deps = (canvas.match(/^\s*\}, \[visible, selected, view[^\]]*\]\);/m) || [""])[0];
  if (!deps.includes("ringColours")) {
    fail("changing a circuit's colour does not repaint its meters");
  }
}

/* ── A service and its joints wear what feeds them ──

   Asked for: the circuit's colour from the origin where no link box is
   involved, the OUTPUT's colour where one feeds the plot — the same
   rule the mains, the meters and the rings follow.

   A service cable carries none of it: on project 20, 84 services and
   not one with a Circuit_ID, a box or a way. What it has is a meter at
   its far end, and the meter knows. So the colour is read off that
   meter, and a joint takes it from the service it sits on. All 84
   resolve: 43 on the circuit, 14 and 27 on the box's two outputs. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const serviceInk = useMemo");
  const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [features, ringColours]);", at));
  if (!body) fail("services and their joints are not coloured by what feeds them");
  else {
    /* ── Its own stamp first, the meter as fallback ──

       A service now CARRIES what feeds it: its circuit, and the link
       box output where a box does. Reading that is a lookup; searching
       for the meter at its end is a guess dressed as one, and it fails
       on a cable drawn a metre short. The search stays for every cable
       laid before this, which is all of them on a drawing nobody has
       re-laid. */
    if (!/const own = wayColourOf\(svc, features\)/.test(body)) {
      fail("a service's own link box output is ignored, so the colour is still "
        + "inferred from the meter every time");
    }
    if (!/svc\.Attributes\?\.Circuit_ID != null/.test(body)) {
      fail("a service's own circuit is ignored");
    }
    if (!/wayColourOf\(m, features\)/.test(body)) {
      fail("the meter's link box output is not consulted, so a service on an "
        + "output wears the circuit's colour");
    }
    if (!/ringColours\.get\(Number\(m\.Attributes\.Circuit_ID\)\)/.test(body)) {
      fail("a service with no box does not fall back to its circuit's colour");
    }
    /* Two metres, the slack serviceFor allows between a meter and the
       cable that feeds it. */
    if (!/const AT_METER_M = 2;/.test(body)) {
      fail("the meter at a service's end is matched with no slack, so a cable "
        + "stopping at the wall finds nothing");
    }
    /* A joint takes its service's colour, and falls back to its own
       circuit where it sits on nothing coloured. */
    if (!/j\.Feature_Role !== "joint"/.test(body)) {
      fail("joints are not coloured at all");
    }
  }
  /* Read where the line is stroked, where its label's plate is tinted,
     and where a joint's symbol is filled. */
  for (const [what, re] of [
    ["the service cable", /\?\? serviceInk\.get\(Number\(f\.Feature_ID\)\) \?\? st\.colour\);/],
    ["a joint's symbol", /const ji = serviceInk\.get\(Number\(f\.Feature_ID\)\);/],
  ]) {
    if (!re.test(canvas)) fail(`${what} does not read the service colours`);
  }
  if ((canvas.match(/serviceInk\.get\(Number\(f\.Feature_ID\)\)/g) || []).length < 3) {
    fail("the cable, its label's plate and the joint do not all read it, so they "
      + "can disagree");
  }
  /* Worked out once per change, not per frame: 84 services against 85
     meters is nothing once and something sixty times a second. */
  if (!/const serviceInk = useMemo/.test(canvas)) {
    fail("the service colours are worked out on every frame");
  }
}

/* ── A service is laid carrying what feeds it ──

   Asked for: "service cables should know what circuit they are
   connected to". They carried nothing — 84 on project 20, not one with
   a circuit, a box or a way — so everything that needed to know had to
   find the meter at the far end and ask that.

   The planner already knows which meter each cable is for. It is copied
   onto the cable when it is laid, and moved with the meter when the
   meter moves to another output: a plot on one output with its cable
   saying another is two answers to one question, and the drawing would
   show them in different colours. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const supplyOf = \(meter\) =>/.test(canvas)) {
    fail("there is no one place that says what feeds a meter");
  }
  for (const attr of ["Circuit_ID", "Link_Box_ID", "Link_Way"]) {
    if (!new RegExp(`a\\.${attr} != null \\? \\{ ${attr}: a\\.${attr} \\}`).test(canvas)) {
      fail(`a laid service does not carry ${attr}`);
    }
  }
  if (!/\.\.\.supplyOf\(c\.meter\),/.test(canvas)) {
    fail("Auto Lay Service Cable lays a cable that does not say what feeds it");
  }
  /* And moving a meter between outputs moves its cable's stamp. */
  const at = canvas.indexOf("async function moveToLinkWay");
  const move = at < 0 ? "" : canvas.slice(at, canvas.indexOf("function lassoLinkWay", at));
  if (!/const cables = features\.filter/.test(move)) {
    fail("moving a meter to another output leaves its service saying the old "
      + "one, so the plot and its cable are drawn in different colours");
  }
  /* Both writes say the same thing: the meter's and the cable's. Two
     occurrences, because one of them is the meter itself. */
  const writes = (move.match(/Link_Way: target \? Number\(target\.way\) : null/g) || []).length;
  if (writes < 2) {
    fail(`the output is written ${writes} time(s); the meter and its cable both `
      + "need it, or they disagree");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Straight joints behave (a stop on the run, one cable in and one out).");
process.exit(bad ? 1 : 0);
