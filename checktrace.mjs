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

// A trace stays on the network it started on.
//
//    Two circuits share a trench, so their cables have vertices at the
//    same places, and a graph keyed on position welds them into one
//    network. A DOWNSTREAM trace then walked from one circuit onto
//    another at a shared point and carried on — which on a real drawing
//    meant hopping across and coming back the way it came, reported as
//    the trace running both ways. Measured on a live site: a trace
//    begun on circuit 3 returned 88 cables across both circuits.
{
  const on = (id, g, cid) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g,
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid } });
  /* Two circuits down one trench: the same geometry, as the drawing
     really stores it. */
  const a = on(1, [[0, 0], [50, 0], [100, 0]], 3);
  const b = on(2, [[0, 0], [50, 0], [100, 0]], 2);
  /* And a service, which names no circuit and must still be followed. */
  const svc = { ...on(3, [[50, 0], [50, 8]], null),
    Attributes: { Line_Type: "elec_service" } };

  const r = traceTree([a, b, svc], [25, 0], { direction: "both",
    sourcePoints: [], reach: 3, startLineId: 1 });
  if (r.error) fail(`a trace told which cable it is on was refused: ${r.error}`);
  else {
    if (r.lineIds.includes(2)) {
      fail("the trace crossed onto another circuit's cable sharing the same "
        + "trench \u2014 which is how a one-way trace appears to run both ways");
    }
    if (!r.lineIds.includes(3)) {
      fail("the trace refused a service, which names no circuit and is fed "
        + "by the cable it is on");
    }
  }

  /* Told the other one, it follows the other one. */
  const r2 = traceTree([a, b, svc], [25, 0], { direction: "both",
    sourcePoints: [], reach: 3, startLineId: 2 });
  if (r2.lineIds.includes(1)) fail("told cable 2, it walked cable 1");
}

/* Started from whatever is on the network, and asked which cable
   whenever more than one lies there.

   The click looked for a LINE, so tracing from the thing somebody is
   actually looking at \u2014 the meter whose supply they are chasing, the
   joint they suspect \u2014 worked only by accident, when a cable happened
   to lie within reach of where they clicked. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("if (traceFrom) {");
  const fn = at < 0 ? "" : canvas.slice(at, at + 3000);
  if (!fn) fail("the trace start handler has gone");
  else {
    for (const role of ["meter", "joint", "feederpoint", "linkbox", "spannode"]) {
      if (!new RegExp(`"${role}"`).test(fn)) {
        fail(`a trace cannot be started from a ${role}`);
      }
    }
    /* From the FEATURE's position, not the click: a marker nudged clear
       for legibility is still the node it stands for. */
    if (!/f\.Attributes\?\.Span_Anchor \?\? f\.Geometry\?\.\[0\]/.test(fn)) {
      fail("a nudged marker traces from where it was drawn rather than from "
        + "the point on the network it stands for");
    }
    if (!/const from = spot\?\.at \?\? point;/.test(fn)) {
      fail("the trace starts at the raw click rather than at what was clicked");
    }
    /* ── Asked once, in one dialog ──

       What is being followed, which way, and which cable where several
       share the point are ONE decision. They were a floating panel and
       a separate modal, so starting a trace meant answering in two
       places with the drawing in between. */
    if (!/setTracePick\(\{/.test(fn)) {
      fail("the click does not open the trace dialog");
    }
    const dlg = canvas.slice(canvas.indexOf("{tracePick && (() => {"),
      canvas.indexOf("{jointPick && ("));
    if (!dlg) fail("the trace dialog has gone");
    else {
      /* All three questions in it. */
      for (const [what, probe] of [
        ["what is followed", '["trench", "Trench"]'],
        ["which way", '["both", "Both ways"]'],
        ["which cable", "cables run through that point"],
      ]) {
        if (!dlg.includes(probe)) fail(`the dialog does not ask ${what}`);
      }
      /* The cable list is re-read when the kind changes, or switching
         to Trench and back shows the list from the other one. */
      if (!/const opts = tracePick\.kind === "trench" \? \[\] : traceFollow\(/.test(dlg)) {
        fail("the cable list is stored rather than re-read, so it goes stale "
          + "when the kind is changed");
      }
      /* And it shows what it will follow even when there is only one,
         rather than leaving it to be guessed. */
      if (!/opts\.length === 1 \? "Following this cable:"/.test(dlg)) {
        fail("with one cable the dialog does not say which it will follow");
      }
    }

    /* ── The panel reports; it does not ask again ──

       The same two rows of buttons were in the result panel as well, so
       finishing a trace put the questions back on screen \u2014 which reads
       as the dialog reopening rather than as a result. */
    const panelAt = canvas.indexOf('<div className="gis-trace-panel"');
    const panel = panelAt < 0 ? "" : canvas.slice(panelAt,
      canvas.indexOf("{tracePick && (() => {", panelAt));
    if (!panel) fail("the trace panel has gone");
    else {
      if (/\["cable", \(traceRun\?\.layerKey/.test(panel)
        || /\["both", "Both ways"\]/.test(panel)) {
        fail("the result panel asks what to follow and which way again, "
          + "which reads as the dialog reopening");
      }
      /* One way back to the question, at the same point. */
      if (!/setTracePick\(\{\n\s*at: traceRun\.start,/.test(panel)) {
        fail("there is no way back to the dialog from a finished trace, so "
          + "changing direction means starting again");
      }
    }
    /* And says so plainly when the click was on nothing. */
    if (!/Nothing to trace there/.test(fn)) {
      fail("a click on nothing starts a trace from somewhere arbitrary");
    }
  }
}

// Depth is measured on the SAME network the walk uses.
//
//    "Downstream" means the distance from the source increases, and
//    that distance was measured across every edge regardless of
//    circuit — so it took shortcuts the supply cannot. On a live
//    drawing the distance to a link box was measured along a
//    NEIGHBOURING circuit's cable sharing the trench, the box came out
//    nearer the source than the cable feeding it, and every output
//    measured as leading BACK towards the source: "nothing downstream
//    of there", with half the estate beyond it.
//
//    The walk had been taught not to cross circuits and this had not,
//    so the two disagreed about the same drawing — which is worse than
//    either rule alone, because the answer looks considered.
{
  const on = (id, g, cid) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g,
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid } });

  /* Circuit 3 runs the long way round to a box; circuit 2 shares the
     trench on the short leg. Measured across both, the box is nearer
     the source than the cable feeding it. */
  const trunk = on(1, [[0, 0], [0, 100], [100, 100]], 3);   // 200 m round
  const shortcut = on(2, [[0, 0], [100, 100]], 2);          // 141 m direct
  const output = on(3, [[100, 100], [200, 100]], 3);        // beyond the box
  const world = [trunk, shortcut, output];

  const r = traceTree(world, [150, 100], { direction: "down",
    sourcePoints: [[0, 0]], reach: 3, startLineId: 3 });
  if (r.error) {
    fail(`downstream of a link box output was refused: ${r.error} \u2014 the `
      + "distance to the box was measured along another circuit's cable");
  }

  /* And the source is still reachable for the circuit being traced,
     even where a shared node was first met along the other one. */
  const u = traceTree(world, [150, 100], { direction: "up",
    sourcePoints: [[0, 0]], reach: 3, startLineId: 3 });
  if (u.error) fail(`upstream was refused: ${u.error}`);
}

// The walk begins ON the cable that was chosen.
//
//    The start was the nearest NODE to the click, whichever line it
//    belonged to. Where cables share a route their vertices are metres
//    apart along it, so the nearest node could belong to a DIFFERENT
//    cable — and with the walk bounded to the chosen cable's circuit it
//    then began somewhere that circuit has no edge at all, and reported
//    nothing found.
//
//    Answering "which cable?" and then starting on another one makes
//    the question pointless.
{
  const on = (id, g, cid) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g,
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid } });

  /* Two cables down one route. The chosen one's vertices are coarse;
     the other's are fine, so the nearest NODE to a click belongs to it. */
  const chosen = on(1, [[0, 0], [100, 0]], 3);
  const other = on(2, [[0, 0], [48, 0], [52, 0], [100, 0]], 2);
  const world = [chosen, other];

  const r = traceTree(world, [50, 0], { direction: "both", sourcePoints: [],
    reach: 5, startLineId: 1 });
  if (r.error) {
    fail(`the trace began on a node belonging to another cable: ${r.error}`);
  } else if (r.lineIds.includes(2)) {
    fail("the trace walked the cable that was not chosen");
  }

  /* And with no choice made it still starts from the nearest node,
     which is the behaviour every other click has. */
  const any = traceTree(world, [50, 0], { direction: "both", sourcePoints: [], reach: 5 });
  if (any.error) fail(`a trace with no cable chosen was refused: ${any.error}`);
}

// A cable teeing into another is joined to it.
//
//    The graph joins lines where they share a VERTEX. A service does
//    not share one: it runs from a main to a plot and its end lands
//    part way along a segment of that main, between two corners. So the
//    service was an island — tracing from it found one cable, itself,
//    and a trace from anywhere else never reached the plot. Twelve of
//    eighty-four services on a live drawing were unreachable that way,
//    and nothing said so: they are drawn touching, and they look joined.
//
//    And an end a hand's breadth from a vertex is that vertex. The
//    graph keys positions to the centimetre, so 0.16 m apart is two
//    nodes and two networks — three more services were islands for that
//    reason alone.
{
  const main = { Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]], Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } };
  /* Tees into the MIDDLE of the main's only segment. */
  const tee = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[50, 0], [50, 8]], Attributes: { Line_Type: "elec_service" } };
  /* Ends a sixth of a metre from the main's far vertex. */
  const nearly = { Feature_ID: 3, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[100.16, 0], [100.16, 8]], Attributes: { Line_Type: "elec_service" } };

  const r = traceTree([main, tee, nearly], [25, 0], { direction: "both",
    sourcePoints: [], reach: 2, startLineId: 1 });
  if (r.error) fail(`the main would not trace: ${r.error}`);
  else {
    if (!r.lineIds.includes(2)) {
      fail("a service teeing into the middle of a main is not reached from "
        + "it \u2014 it is an island, and it looks connected on the drawing");
    }
    if (!r.lineIds.includes(3)) {
      fail("a service ending a sixth of a metre from a vertex is not "
        + "reached \u2014 the graph keys to the centimetre, so that is two nodes");
    }
  }

  /* And a line CROSSING another without stopping is still not joined to
     it: inserting a vertex there would invent a connection nobody drew. */
  const crossing = { Feature_ID: 4, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[25, -8], [25, 8]], Attributes: { Line_Type: "elec_main", Circuit_ID: 9 } };
  const c = traceTree([main, crossing], [75, 0], { direction: "both",
    sourcePoints: [], reach: 2, startLineId: 1 });
  if (!c.error && c.lineIds.includes(4)) {
    fail("a cable crossing the main without stopping was treated as joined "
      + "to it");
  }
}

// A trace of one output reaches that output, and nothing else.
//
//    Two outputs of a link box share a trench and are the same circuit,
//    so the circuit rule let the walk step between them. And a SERVICE
//    carries no circuit at all, so an unstamped cable was followed from
//    anywhere: a trace of one output reported twenty-nine of a
//    NEIGHBOURING circuit's plots.
//
//    The joint is what knows. `Joint_Cables` names the main and the
//    service together, so the service takes the main's circuit and its
//    output — a record somebody made, rather than another measurement
//    of cables lying on top of each other.
{
  const main = (id, cid, way) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: [[0, 0], [100, 0]],
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid,
      ...(way != null ? { Link_Box_ID: 9, Link_Way: way } : {}) } });
  const svc = (id, at) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: [[at, 0], [at, 8]],
    Attributes: { Line_Type: "elec_service" } });

  /* One trench, three cables: two outputs of a box and another
     circuit's main, all drawn on the same line. */
  const way1 = main(1, 3, 1);
  const way2 = main(2, 3, 2);
  const other = main(3, 2, null);
  const s1 = svc(11, 30);   // jointed to way 1
  const s2 = svc(12, 60);   // jointed to way 2
  const s3 = svc(13, 90);   // jointed to the other circuit
  const joints = [
    { Feature_Role: "joint", Attributes: { Joint_Cables: [1, 11] } },
    { Feature_Role: "joint", Attributes: { Joint_Cables: [2, 12] } },
    { Feature_Role: "joint", Attributes: { Joint_Cables: [3, 13] } },
  ];
  const world = [way1, way2, other, s1, s2, s3];

  const r = traceTree(world, [10, 0], { direction: "both", sourcePoints: [],
    reach: 2, startLineId: 1, joints });
  if (r.error) fail(`output 1 would not trace: ${r.error}`);
  else {
    if (!r.lineIds.includes(11)) {
      fail("output 1 does not reach its own service");
    }
    if (r.lineIds.includes(2) || r.lineIds.includes(12)) {
      fail("a trace of output 1 reached output 2 \u2014 two cables of one "
        + "circuit sharing a trench are not one network");
    }
    if (r.lineIds.includes(3) || r.lineIds.includes(13)) {
      fail("a trace of output 1 reached another circuit \u2014 an unstamped "
        + "service was followed from anywhere");
    }
  }
}

// Two ends nine centimetres apart are one point, and ONE of them moves.
//
//    The welding snapped every end onto its nearest neighbour, measured
//    against the ORIGINAL positions — so two ends near each other each
//    moved to where the other had been, swapped, and still did not
//    meet. On the live drawing that was the two halves of a cable a
//    straight joint had just broken: 0.093 m apart, no shared vertex,
//    and the trace reached the fitting and stopped with the rest of the
//    output beyond it.
//
//    The lower id is the anchor and the higher one moves. Arbitrary,
//    and that is the point: any rule that picks the same one every time
//    converges, and picking by distance cannot, because the distance is
//    the same in both directions.
{
  const a = { Feature_ID: 10, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [50, 0]], Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } };
  /* Starts where a broke, less a hand's breadth. */
  const b = { Feature_ID: 20, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[50.093, 0], [100, 0]], Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } };

  const r = traceTree([a, b], [25, 0], { direction: "both", sourcePoints: [],
    reach: 2, startLineId: 10 });
  if (r.error) fail(`the trace stopped at the break: ${r.error}`);
  else if (!r.lineIds.includes(20)) {
    fail("the trace stops at a break of nine centimetres \u2014 both ends moved "
      + "to where the other had been and they still do not meet");
  }

  /* Far apart is still far apart: welding must not join two cables that
     genuinely stop short of each other. */
  const far = { ...b, Feature_ID: 30, Geometry: [[52, 0], [100, 0]] };
  const r2 = traceTree([a, far], [25, 0], { direction: "both", sourcePoints: [],
    reach: 2, startLineId: 10 });
  if (!r2.error && r2.lineIds.includes(30)) {
    fail("a cable two metres short of another was welded to it");
  }
}

// Direction is measured along the cable being traced.
//
//    An output and the trunk feeding it share a trench for hundreds of
//    metres, drawn on the same line, so a graph keyed on position lets
//    the DISTANCE take the trunk as a shortcut. The ordering along the
//    output then stops increasing, and downstream halts at the first
//    step that measures as going back — while "both ways", which asks
//    no such question, walks the whole output correctly. That is
//    exactly what somebody reported.
//
//    Asserted on the real drawing it happened on. A synthetic one was
//    tried first and was worse than useless: to show the shortcut the
//    output has to run back along its own trunk, and a small fixture
//    that does so ends up touching the source, which changes the right
//    answer. The site has the shape; use the site.
{
  const raw = JSON.parse(
    readFileSync("./fixtures/drawing-2202-043-straight-joint.json", "utf8"));
  const f = raw.features;
  const isTrench = (t) => /trench/i.test(String(t ?? ""));
  const cables = f.filter((x) => x.Feature_Type === "line"
    && x.Layer_Key === "electric" && !isTrench(x.Attributes?.Line_Type));
  const sources = f.filter((x) => ["poc", "substation"].includes(x.Feature_Role))
    .map((x) => x.Geometry?.[0]).filter(Boolean);
  const joints = f.filter((x) => x.Feature_Role === "joint");
  const meters = f.filter((x) => x.Feature_Role === "meter");

  /* The cable a straight joint was placed on: output 1 of the link box,
     broken in two, the halves 0.093 m apart. */
  const head = cables.find((c) => Number(c.Feature_ID) === 45886);
  if (!head) fail("the straight-joint fixture no longer holds cable 45886");
  else {
    const g = head.Geometry;
    const at = [(g[1][0] + g[2][0]) / 2, (g[1][1] + g[2][1]) / 2];
    const reached = (r) => meters.filter((m) => r.paths.some((p) => {
      const e = p.pts[p.pts.length - 1];
      return Math.hypot(e[0] - m.Geometry[0][0], e[1] - m.Geometry[0][1]) <= 2;
    }));

    const down = traceTree(cables, at, { direction: "down", sourcePoints: sources,
      reach: 2, startLineId: head.Feature_ID, joints });
    if (down.error) fail(`downstream along output 1: ${down.error}`);
    else {
      /* It crosses the joint, and reaches the plots lassoed onto this
         output \u2014 fourteen of them \u2014 and no others. */
      if (!down.lineIds.includes(46002)) {
        fail("downstream stops at the straight joint: the two halves are "
          + "0.093 m apart and were never joined in the graph");
      }
      const got = reached(down);
      const mine = got.filter((m) => Number(m.Attributes?.Link_Way) === 1).length;
      if (mine < 14) {
        fail(`downstream reaches ${mine} of the 14 plots on this output \u2014 `
          + "the distance is taking the trunk beside it as a shortcut");
      }
      const theirs = got.length - mine;
      if (theirs > 2) {
        fail(`downstream also reaches ${theirs} plots on other outputs`);
      }
    }

    /* And upstream is a route back, not a fan through the cable lying
       beside it. */
    const up = traceTree(cables, at, { direction: "up", sourcePoints: sources,
      reach: 2, startLineId: head.Feature_ID, joints });
    if (up.error) fail(`upstream along output 1: ${up.error}`);
    else if (up.paths.length > 3) {
      fail(`upstream returned ${up.paths.length} routes towards one source`);
    }
  }
}

/* The dialog names cables in a way that tells them apart.

   Two services to neighbouring plots came out as "Feeder · no circuit ·
   18.1 m", twice: neither carries a Label, neither carries a
   Circuit_ID, and they are the same length. The dialog was asking which
   one and giving no way to answer.

   A service is named by the PLOT it feeds, which is the only thing a
   designer thinks of it by \u2014 and is not on the cable. It is read from
   the meter its far end reaches, and shown as the plot NUMBER rather
   than the row id: "Plot 1562" is a database key, and the designer
   knows it as Plot 12. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const cableTitle = useCallback");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("const runTrace", at));
  if (!fn) fail("cables in the trace dialog have no name of their own");
  else {
    if (/line\.Label \?\? "Feeder"/.test(canvas)) {
      fail('every unlabelled cable is still called "Feeder"');
    }
    if (!/classLabel\(line, lineTypes\)/.test(fn)) {
      fail("a cable with no label is not named by what kind it is");
    }
    if (!/Feature_Role === "meter"/.test(fn)) {
      fail("a service is not named by the plot it feeds, so two services to "
        + "neighbouring plots read identically");
    }
    if (!/plot_number \?\? p\?\.Plot_Number \?\? plot/.test(fn)) {
      fail("the plot is named by its row id rather than its number");
    }
  }
}

/* And the utility menus say nothing when a press isolates rather than
   opening. The drawing visibly changes, which is the answer to "did
   that do anything"; the banner sat over the drawing somebody had just
   asked to see, on every switch, for the whole session. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (/press \$\{label\} again for its menu/.test(canvas)) {
    fail("switching utility still announces itself every time");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The trace behaves (one token to the fork, two after it).");
process.exit(bad ? 1 : 0);
