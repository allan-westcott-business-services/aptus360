/* Following a network from a point, with a token that forks where the
   line does.

   ── Root-to-leaf paths, not a graph ──

   An animation needs something to move ALONG, at a speed, from a start.
   So the walk returns one polyline per leaf, each running the whole way
   from the start point — and forking then costs nothing. Two paths
   sharing their first ninety metres carry their tokens over the same
   ground, so they read as ONE token until the branch and part there.
   Nothing in the drawing code knows what a fork is.

   ── Direction ──

   Upstream and downstream only mean something relative to a source, and
   by distance ALONG the network rather than as the crow flies: a run
   that loops back is further downstream at every step while getting
   closer to the POC in a straight line. Where there is no source — a
   trench, which is not fed from anywhere — the walk says so instead of
   picking a direction and looking confident. */
import { readFileSync } from "node:fs";
import { traceTree, pointAlong } from "./src/features/gis/traceWalk.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const L = (id, pts) => ({ Feature_ID: id, Geometry: pts });

/*  source ---- 50 ---- fork ---< 
                                 \                         */
const world = [
  L(1, [[0, 0], [50, 0]]),
  L(2, [[50, 0], [100, 0]]),
  L(3, [[100, 0], [150, 40]]),
  L(4, [[100, 0], [150, -40]]),
];

// 1. Both ways: everything reachable, which is the honest answer to
//    "what is connected to this".
{
  const r = traceTree(world, [50, 0], { direction: "both" });
  if (r.error) fail(`both ways failed: ${r.error}`);
  else if (r.paths.length !== 3) {
    fail(`${r.paths.length} branches both ways, expected 3 (back to the `
      + "source, and the two beyond the fork)");
  }
}

// 2. Downstream: away from the source, and only that.
{
  const r = traceTree(world, [50, 0], { direction: "down", sourcePoints: [[0, 0]] });
  if (r.error) fail(`downstream failed: ${r.error}`);
  else {
    if (r.paths.length !== 2) {
      fail(`${r.paths.length} branches downstream, expected the two past the fork`);
    }
    /* Nothing running back to the source. */
    if (r.paths.some((p) => p.pts.some((q) => q[0] < -0.001))) {
      fail("a downstream branch ran back past the start");
    }
  }
  const up = traceTree(world, [100, 0], { direction: "up", sourcePoints: [[0, 0]] });
  if (up.error) fail(`upstream failed: ${up.error}`);
  else if (up.paths.length !== 1 || Math.round(up.paths[0].metres) !== 100) {
    fail("upstream from the fork is not the single 100 m run to the source");
  }
}

// 3. The fork, as the token sees it. One token before, two after —
//    which is the whole feature, and it is geometry rather than code.
{
  const r = traceTree(world, [50, 0], { direction: "down", sourcePoints: [[0, 0]] });
  const at = (m) => r.paths.map((p) => pointAlong(p.pts, m)).filter(Boolean)
    .map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`);
  const before = at(45);
  if (before.length !== 2 || new Set(before).size !== 1) {
    fail("the tokens are not together before the fork, so a single cable "
      + "shows two tokens on it");
  }
  const after = at(70);
  if (after.length !== 2 || new Set(after).size !== 2) {
    fail("the tokens do not part at the fork");
  }
}

// 4. A token that has arrived stops being drawn, rather than sitting on
//    the last point looking like it is still going. The short branches
//    finishing early is the trace showing which way is further.
{
  if (pointAlong([[0, 0], [10, 0]], 25) !== null) {
    fail("a token past the end of its branch is clamped to the end instead "
      + "of arriving");
  }
  const half = pointAlong([[0, 0], [10, 0]], 5);
  if (!half || Math.abs(half[0] - 5) > 0.001) fail("the token is in the wrong place");
}

// 5. What the drawing cannot answer, it says.
{
  const noSource = traceTree(world, [50, 0], { direction: "down" });
  if (!/no meaning here/.test(noSource.error || "")) {
    fail("with no source, a direction is picked anyway rather than explained");
  }
  const nowhere = traceTree(world, [900, 900], { direction: "both" });
  if (!/click on a line/i.test(nowhere.error || "")) {
    fail("a click off the network does not say what to do about it");
  }
  if (!traceTree([], [0, 0], {}).error) {
    fail("tracing a utility with nothing drawn does not say so");
  }
}

// 6. A loop terminates. Edges are marked, not nodes: marking nodes
//    would stop the walk at the first junction.
{
  const ring = [
    L(1, [[0, 0], [50, 0]]), L(2, [[50, 0], [50, 50]]),
    L(3, [[50, 50], [0, 50]]), L(4, [[0, 50], [0, 0]]),
  ];
  const r = traceTree(ring, [0, 0], { direction: "both" });
  if (r.error) fail(`a ring main could not be traced: ${r.error}`);
  else if (!r.paths.length) fail("a ring main traced to nothing");
}

/* And the canvas drives it: armed from each utility's menu, one frame
   loop, and the panel offering the three questions. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const \[traceFrom, setTraceFrom\]/.test(canvas)) {
    fail("nothing arms a trace");
  }
  if (!/requestAnimationFrame\(tick\)/.test(canvas)) {
    fail("the token does not move");
  }
  /* Metres per second, so how far it went is part of what the
     animation says. A fraction would make a street and an estate take
     the same time. */
  if (!/TRACE_MPS \* dt/.test(canvas)) {
    fail("the token moves by a fraction of the way rather than at a speed");
  }
  /* Cancelled: a frame loop left running after the panel closes is a
     drawing that repaints for ever. */
  if (!/cancelAnimationFrame\(traceFrame\.current\)/.test(canvas)) {
    fail("the frame loop is never cancelled");
  }
  /* Every utility, from its own menu \u2014 which is how it knows whether
     "the pipe" means gas or water without being told. */
  const armed = (canvas.match(/setTraceFrom\(\{ layerKey/g) || []).length;
  if (armed < 2) {
    fail(`${armed} menu(s) can start a trace \u2014 electric, gas and water all `
      + "need it");
  }
  /* A trench has no source, so its directions are offered greyed with
     the reason rather than hidden: a control that disappears looks
     like a fault. */
  if (!/A trench is not fed from anywhere/.test(canvas)) {
    fail("upstream on a trench is silently unavailable");
  }
}

// A click in the MIDDLE of a cable starts the trace.
//
//    The graph's nodes are the lines' vertices, so a click along a run
//    is nowhere near one: a twelve metre service has both ends six
//    metres from where somebody clicked, and a reach of two metres
//    found nothing. It reported "click on a line" to somebody who had
//    clicked on a line.
{
  const line = { Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]], Attributes: { Line_Type: "elec_main" } };
  const spur = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[100, 0], [100, 40]], Attributes: { Line_Type: "elec_main" } };

  /* Fifty metres from either end of the first segment, with a reach far
     smaller than that. */
  const mid = traceTree([line, spur], [50, 0], { direction: "both", reach: 2 });
  if (mid.error) {
    fail(`a click on the middle of a cable was refused: ${mid.error}`);
  } else if (mid.paths.length < 1) {
    fail("a click on the middle of a cable traced nothing");
  }

  /* Still refused where it lands on nothing \u2014 the reach is what says
     "on a line", and widening it to make the middle work would make a
     click in a field trace the nearest cable in the county. */
  const off = traceTree([line, spur], [50, 400], { direction: "both", reach: 2 });
  if (!off.error) {
    fail("a click four hundred metres off the network started a trace");
  }

  /* And a click ON a vertex still starts there, which is the exact
     case: a joint, an end, a node. */
  const atEnd = traceTree([line, spur], [100, 0], { direction: "both", reach: 2 });
  if (atEnd.error) fail(`a click on a vertex was refused: ${atEnd.error}`);
}

console.log(bad ? `\n${bad} problem(s)`
  : "The trace behaves (one token to the fork, two after it).");
process.exit(bad ? 1 : 0);
