/* The link box: one input, fused outputs, drawable at last.

   The role existed since 0072 — carried with trenches, bulk deletable,
   findable — but nothing could place one, no editor knew its shape and
   the symbol was a seeded red square. What must hold now:

   - two menu entries arm a click, 2 way and 4 way;
   - placement lands it on an electric main within reach, takes the
     cable's bearing, and seeds Link_Ways with an empty fuse map;
   - the symbol is the style's square with an input node on the back
     face and numbered outputs on the front;
   - the editor offers ways and the fuse ladder — 200, 315, 400, 630 A
     — and switching 4 to 2 hides ways 2 and 3 without deleting them;
   - the link passes record Connects for link boxes, so the cables
     that connect to one are connected to it on the drawing too;
   - the style migration turns the seeded red to joint yellow.

   Structural throughout: the object is stitched into the canvas and
   the editor, and what drifts is the stitching. */
import { readFileSync, existsSync } from "node:fs";
import { spanTrace, circuitBuildParts } from "./src/features/gis/feeder.js";
import { feederRenderPlan } from "./src/features/gis/feederColour.js";
import { planJoints } from "./src/features/gis/joints.js";
import { planFeederPoints } from "./src/features/gis/feederPoints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

if (!/\+ Link Box \(2 way\)/.test(canvas) || !/\+ Link Box \(4 way\)/.test(canvas)) {
  fail("the Electric menu no longer offers both link boxes");
}
if (!/placeNode\("linkbox", "electric", \{ ways: 2 \}\)/.test(canvas)
  || !/placeNode\("linkbox", "electric", \{ ways: 4 \}\)/.test(canvas)) {
  fail("the menu entries do not arm a click with the ways");
}
if (!/Link_Ways: ways,\s*\n\s*Way_Fuse_A: \{\},/.test(canvas)) {
  fail("placement no longer seeds ways and an empty fuse map");
}
if (!/f\.Feature_Role === "linkbox"\) \{\n\s*\/\* ── One input, fused outputs/.test(canvas)) {
  fail("the link box has no draw branch of its own");
}
if (!/const outs = ways === 4 \? \[-0\.6, 0, 0\.6\] : \[0\];/.test(canvas)) {
  fail("the outputs are not one for a 2 way and three for a 4 way");
}
if (!/ctx\.fillText\(String\(i \+ 1\),/.test(canvas)) {
  fail("the 4 way's outputs are not numbered");
}
/* And the box wears its place on the run, like every other stop.

   The pass that draws the span codes takes span nodes and feeder
   points, and a link box is neither \u2014 so the one stop a designer can
   point at on site was the one the drawing would not name. Drawn in
   the box's own branch: widening that pass would put its circle over
   the square. */
if (!/const boxCode = f\.Attributes\?\.Span_Label/.test(canvas)) {
  fail("the link box does not draw its span code \u2014 the box on the run "
    + "is the one stop the drawing will not name");
}
/* ── And the levels beside it ──

   The volt drop and loop impedance at a stop are what a designer works
   to, and the trace already stops at a box: the levels map is keyed on
   the leg's stopId and the box's id is in it. The figures existed, were
   correct, and were drawn on every stop except this one, because the
   pass that draws them took span nodes and feeder points only. A box
   showing nothing reads as being outside the design.

   Three things have to hold, and the third is the one that bites: the
   pass takes the box, it does NOT paint its round symbol over the
   square, and a box moved along the run re-runs the check. */
if (!/&& f\.Feature_Role !== "linkbox"\) continue;/.test(canvas)) {
  fail("the levels pass still skips link boxes \u2014 no figures beside the box");
}
if (!/if \(!isBox\) \{\n\s*ctx\.beginPath\(\);/.test(canvas)) {
  fail("the node circle is drawn for a link box, covering its square");
}
if (!/\|\| f\.Feature_Role === "linkbox"\);/.test(canvas)) {
  fail("a box moved along the run does not re-run the levels check, so it "
    + "keeps the figures it had at the old place");
}

if (!/const FUSES = \[200, 315, 400, 630\];/.test(editor)) {
  fail("the fuse ladder is missing or moved — 200, 315, 400, 630");
}
if (!/Link box \(\$\{Number\(feature\.Attributes\?\.Link_Ways\) === 4 \? "4" : "2"\} way\)/.test(editor)) {
  fail("the editor's header no longer says how many ways");
}
if (!/length: ways === 4 \? 3 : 1/.test(editor)) {
  fail("the editor does not show one fuse for a 2 way and three for a 4 way");
}
/* A box on a run is that circuit's feeder end point, and its place in
   the sequence is a fact about it \u2014 corrected on every build and,
   until now, with nowhere on screen to be read. A box in open ground
   has no circuit yet and is deliberately not offered a code. */
if (!/Feature_Role === "linkbox"\s*\n\s*&& f\.Attributes\.Circuit_ID != null/.test(editor)) {
  fail("the editor does not show a box its place on the run");
}

/* Cables connect: the five link passes carry the role. Counted rather
   than matched against feederpoint, because feederpoint also appears
   in passes that are not about linking (the levels cache key, circuit
   membership) and a blunt comparison flagged those. */
const boxes = (canvas.match(/\|\| f\.Feature_Role === "linkbox"/g) || []).length;
if (boxes < 5) {
  fail(`the link passes carry linkbox ${boxes} time(s), expected the five passes`);
}

if (!existsSync("./supabase/migrations/0202_link_box.sql")) {
  fail("migration 0202_link_box.sql is missing");
} else {
  const sql = readFileSync("./supabase/migrations/0202_link_box.sql", "utf8");
  if (!/SET "Colour" = '#f59e0b'/.test(sql) || !/'linkbox'/.test(sql)) {
    fail("0202 does not turn the link box joint yellow");
  }
}

/* ── The way is a fact of the connection ──

   The output dots are drawn in screen space; the box is one point in
   the world and every cable ends at it. So the cable states its way
   (input, or output 1–3) in its own editor — offered only for an end
   standing on a box, stored against the box's id so a moved cable
   cannot carry a stale claim — and the box's editor reads the claims
   back as a schedule, saying plainly when a way is claimed twice. */
if (!/Link_Connections/.test(editor)) {
  fail("the cable no longer states which way of a link box it is on");
}
if (!/stored against the box's\n\s*id/.test(editor)
  && !/Number\(cur\.box\) !== Number\(e\.box\.Feature_ID\)/.test(editor)) {
  fail("a cable moved to another box keeps a stale way claim");
}
if (!/claimed twice/.test(editor)) {
  fail("a way claimed by two cables is no longer said plainly");
}

/* ── On a run, the box is a feeder end point ──

   Placed on circuit 1's cable it takes the circuit, a sequence and the
   arriving cable, and the trace stops at it — driven through the real
   trace on a feeder-point drawing. */
{
  let id = 1;
  const lineTypes = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  const trench = (pts, key = "trench") => ({
    Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  const poc = { Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
  const plot = { Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 1, Geometry: [[200, 10]], Attributes: {} };
  const meter = { Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: 1, Geometry: [[200, 10]],
    Attributes: { Seed_Feature_ID: plot.Feature_ID, Circuit_ID: 1 } };
  const fep = (at, seq) => ({ Feature_ID: id++, Feature_Role: "feederpoint",
    Feature_Type: "point", Layer_Key: "electric", Geometry: [at],
    Attributes: { Circuit_ID: 1, Span_Seq: seq, Span_Label: `A${seq}`,
      Span_Anchor: at, ...(seq ? { VD_Cable_Size_ID: 1 } : {}) } });
  const f0 = fep([0, 0], 0);
  const f1 = fep([200, 0], 1);
  const box = { Feature_ID: id++, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[100, 0]],
    Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Circuit_ID: 1,
      Span_Seq: 2, Span_Label: "A2", Span_Anchor: [100, 0], VD_Cable_Size_ID: 1 } };
  const world = [poc, plot, meter, f0, f1, box,
    trench([[0, 0], [100, 0], [200, 0]]),
    trench([[200, 0], [200, 10]], "service_trench")];
  const r = spanTrace(world, f0.Feature_ID, {
    lineTypes, plotById: () => ({ kva_load: 2.5 }), stopAt: "spannodes",
  });
  if (r.error) fail(`the trace refused the boxed run: ${r.error}`);
  else {
    const stopIds = new Set((r.legs || []).map((l) => Number(l.stopId)));
    if (!stopIds.has(Number(box.Feature_ID))) {
      fail("the trace does not stop at a link box on the circuit's run");
    }
    const settleIds = new Set((r.spanNodes || []).map((x) => Number(x.feature?.Feature_ID)));
    if (!settleIds.has(Number(box.Feature_ID))) {
      fail("the volt drop does not settle cable at the link box");
    }
  }
}

/* ── The figures are computed TO the box ──

   The drawing half above is only worth anything if the trace actually
   produces a figure keyed on the box. Driven through the real trace:
   the leg that stops at the box carries its id, which is the key the
   canvas looks the levels up by. */
{
  let id = 6000;
  const lineTypes = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  const trench = (pts, key = "trench") => ({
    Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  const poc = { Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
  const plot = { Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 1, Geometry: [[200, 10]], Attributes: {} };
  const mtr = { Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: 1, Geometry: [[200, 10]],
    Attributes: { Seed_Feature_ID: plot.Feature_ID, Circuit_ID: 1 } };
  const f0 = { Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]],
    Attributes: { Circuit_ID: 1, Span_Seq: 0, Span_Label: "A0",
      Span_Anchor: [0, 0] } };
  const bx = { Feature_ID: id++, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[100, 0]],
    Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Circuit_ID: 1, Span_Seq: 1,
      Span_Label: "A1", Span_Anchor: [100, 0], VD_Cable_Size_ID: 1 } };
  const r = spanTrace([poc, plot, mtr, f0, bx,
    trench([[0, 0], [100, 0], [200, 0]]),
    trench([[200, 0], [200, 10]], "service_trench")], f0.Feature_ID, {
    lineTypes, plotById: () => ({ kva_load: 2.5 }), stopAt: "spannodes",
  });
  if (r.error) fail(`the trace refused the drawing: ${r.error}`);
  else {
    const leg = (r.legs || []).find((l) => Number(l.stopId) === Number(bx.Feature_ID));
    if (!leg) {
      fail("no leg stops at the link box, so there is no figure to key on "
        + "its id and nothing for the canvas to draw beside it");
    } else if (leg.endIdx == null) {
      fail("the leg at the box has no node index, so the cascade cannot "
        + "compute a level to it");
    }
  }
}

/* ── The build splits at an assigned box ──

   The remedial case the 4 way exists for: plots lassoed onto outputs,
   and Build LV Network re-routing from the box. Driven through
   circuitBuildParts with the build's own inputs: the unassigned plot
   routes from the origin, the trunk reaches the box carrying the
   outputs' total, and each output routes from the box to its own
   plots — nothing crosses over. */
{
  let id = 7000;
  const lineTypes = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  const trench = (pts, key = "trench") => ({
    Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  const poc = { Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
    Layer_Key: "electric", Label: "POC", Geometry: [[0, 0]], Attributes: {} };
  const mkPlot = (n, at) => ({ Feature_ID: id++, Feature_Role: "plot",
    Feature_Type: "point", Plot_ID: n, Geometry: [at], Attributes: {} });
  const q1 = mkPlot(1, [60, 10]);
  const q2 = mkPlot(2, [160, 10]);
  const q3 = mkPlot(3, [160, -10]);
  const box = { Feature_ID: id++, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Label: "Link Box 1", Geometry: [[100, 0]],
    Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Circuit_ID: 1,
      Span_Seq: 2, Span_Label: "A2", Span_Anchor: [100, 0] } };
  const meter = (pl, at, extra) => ({ Feature_ID: id++, Feature_Role: "meter",
    Feature_Type: "point", Layer_Key: "electric", Plot_ID: pl.Plot_ID,
    Geometry: [at],
    Attributes: { Seed_Feature_ID: pl.Feature_ID, Circuit_ID: 1, ...extra } });
  const world = [poc, q1, q2, q3, box,
    meter(q1, [60, 10], {}),
    meter(q2, [160, 10], { Link_Box_ID: box.Feature_ID, Link_Way: 1 }),
    meter(q3, [160, -10], { Link_Box_ID: box.Feature_ID, Link_Way: 2 }),
    trench([[0, 0], [60, 0], [100, 0]]),
    trench([[100, 0], [160, 0], [200, 0]]),
    trench([[60, 0], [60, 10]], "service_trench"),
    trench([[160, 0], [160, 10]], "service_trench"),
    trench([[160, 0], [160, -10]], "service_trench")];
  const parts = circuitBuildParts(world, {
    lineTypes, circuitId: 1,
    plotById: () => ({ kva_load: 3 }), nrsById: () => null,
    seedIds: new Set([q1.Feature_ID, q2.Feature_ID, q3.Feature_ID]),
    meterIds: new Set(),
  });
  const at = (sec, x, y) => sec.pts.some((q) => Math.hypot(q[0] - x, q[1] - y) < 0.5);
  const of = (via) => parts.filter((x) => x.via === via && !x.error);
  if (parts.some((x) => x.error)) {
    fail(`a part refused: ${parts.find((x) => x.error).error}`);
  }
  const trunk = of("trunk")[0];
  if (!trunk) fail("no trunk part — the input cable to the box is not built");
  else {
    if (!trunk.sections.some((sec) => at(sec, 0, 0) && at(sec, 100, 0))) {
      fail("the trunk does not run origin → box");
    }
    const tk = trunk.sections.reduce((m, sec) => m + (sec.kva || 0), 0);
    if (Math.abs(tk - 6) > 0.01) {
      fail(`the trunk carries ${tk} kVA, expected the outputs' total of 6`);
    }
  }
  for (const [via, px, py] of [["way 1", 160, 10], ["way 2", 160, -10]]) {
    const pt = of(via)[0];
    if (!pt) { fail(`no ${via} part`); continue; }
    if (!pt.sections.every((sec) => at(sec, 100, 0) || sec.pts[0])) { /* shape */ }
    if (!pt.sections.some((sec) => at(sec, 100, 0))) {
      fail(`${via} does not start at the box`);
    }
    const kva = pt.sections.reduce((m, sec) => m + (sec.kva || 0), 0);
    if (Math.abs(kva - 3) > 0.01) {
      fail(`${via} carries ${kva} kVA, expected its own plot's 3`);
    }
  }
  const org = of("origin")[0];
  if (!org) fail("the unassigned plot lost its origin routing");
  else if (!org.sections.some((sec) => at(sec, 60, 0))) {
    fail("the origin part does not reach the unassigned plot's tee");
  }
  /* And the build consumes the parts — the one walk, split. */
  const canvasSrc2 = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const parts = circuitBuildParts\(src, \{/.test(canvasSrc2)) {
    fail("Build LV Network no longer routes through circuitBuildParts");
  }
  if (!/await finishLinkWayAssign\(g\)/.test(canvasSrc2)) {
    fail("the lasso no longer routes to the output assignment when armed");
  }
}

/* ── Each output can wear its own colour ──

   Telling a split's runs apart is the point of colouring them. A
   cable belongs to an output two ways — the build stamps Link_Box_ID
   and Link_Way on what it lays, a hand-drawn cable claims a way in
   its own editor — and both resolve to the box's Way_Colours. An
   output with no colour set falls back to the circuit's, so an
   unpainted split looks exactly as it did. */
{
  const box = { Feature_ID: 1, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[100, 0]],
    Attributes: { Link_Ways: 4, Circuit_ID: 1, Span_Seq: 2,
      Way_Colours: { 1: "#e11d48", 2: "#16a34a" } } };
  const run = (fid, attrs) => ({ Feature_ID: fid, Feature_Type: "line",
    Layer_Key: "electric", Geometry: [[100, 0], [160, 0]],
    Attributes: { Line_Type: "elec_main", Circuit_ID: 1, ...attrs } });
  const world = [box,
    run(2, {}),
    run(3, { Link_Box_ID: 1, Link_Way: 1 }),
    run(4, { Link_Box_ID: 1, Link_Way: 2 }),
    run(5, { Link_Box_ID: 1, Link_Way: 3 }),
    run(6, { Link_Connections: { start: { box: 1, way: 2 } } })];
  const plan = feederRenderPlan(world, { chosenColours: { 1: "#2563eb" } });
  /* ── And live, with no stamp at all ──

     A circuit colour resolves at once because every run carries its
     Circuit_ID; an output's colour must behave the same rather than
     waiting for a rebuild to stamp the runs. So membership is also
     worked out from the drawing \u2014 walk the mains out from the box,
     and every run on the path to an assigned meter is that output's.
     A run on the way to two outputs is shared and keeps the circuit's
     colour, which is the honest answer for cable feeding both. */
  {
    const bx = { Feature_ID: 90, Feature_Role: "linkbox", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[100, 0]],
      Attributes: { Link_Ways: 4, Circuit_ID: 1, Span_Seq: 2,
        Span_Anchor: [100, 0], Way_Colours: { 1: "#e11d48", 2: "#16a34a" } } };
    const bare = (fid, pts) => ({ Feature_ID: fid, Feature_Type: "line",
      Layer_Key: "electric", Geometry: pts,
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } });
    const mtr = (fid, at, way) => ({ Feature_ID: fid, Feature_Role: "meter",
      Feature_Type: "point", Layer_Key: "electric", Geometry: [at],
      Attributes: { Circuit_ID: 1, Link_Box_ID: 90, Link_Way: way } });
    const live = feederRenderPlan([bx,
      bare(91, [[0, 0], [100, 0]]), bare(92, [[100, 0], [200, 0]]),
      bare(93, [[100, 0], [100, 60]]),
      mtr(94, [195, 2], 1), mtr(95, [102, 55], 2)],
    { chosenColours: { 1: "#2563eb" } });
    if (live.get(92)?.colour !== "#e11d48" || live.get(93)?.colour !== "#16a34a") {
      fail("an output's colour no longer resolves without a rebuild");
    }
    if (live.get(91)?.colour !== "#2563eb") {
      fail("the shared trunk no longer keeps the circuit's colour");
    }
  }
  const ink = (fid) => plan.get(fid)?.colour ?? null;
  if (ink(2) !== "#2563eb") fail("the trunk no longer wears the circuit's colour");
  if (ink(3) !== "#e11d48") fail("a built output run does not wear its output's colour");
  if (ink(4) !== "#16a34a") fail("output 2's runs do not wear output 2's colour");
  if (ink(5) !== "#2563eb") {
    fail("an uncoloured output does not fall back to the circuit's colour");
  }
  if (ink(6) !== "#16a34a") {
    fail("a hand-drawn cable claiming a way does not wear that way's colour");
  }
  /* And the build stamps what it lays, or nothing above can find it. */
  const canvasSrc3 = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/sec\.linkWay = pt\.way;/.test(canvasSrc3)) {
    fail("the build no longer records which output laid a section");
  }
  if (!/Link_Box_ID: sec\.linkBoxId, Link_Way: sec\.linkWay/.test(canvasSrc3)) {
    fail("the output's stamp does not reach the run's attributes");
  }
}

/* ── A link box replaces the joint at its own point ──

   The box IS the connection: cable in one face, out through fused
   ways. Whatever the walk found there — a fork wanting a breech, a
   size change wanting a straight — planning a joint too would put a
   second fitting on the drawing and on the bill that nobody installs.
   Service take-offs and bottle ends are deliberately untouched: a plot
   beside a box still needs its own take-off, and a run stopping dead
   is still sealed. */
{
  const lt = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  let jid = 8000;
  const tr = (pts, k = "trench") => ({ Feature_ID: jid++, Feature_Type: "line",
    Layer_Key: "trench", Geometry: pts, Attributes: { Line_Type: k } });
  const jpoc = { Feature_ID: jid++, Feature_Role: "poc", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
  const jplot = (n, at) => ({ Feature_ID: jid++, Feature_Role: "plot",
    Feature_Type: "point", Plot_ID: n, Geometry: [at], Attributes: {} });
  const jp1 = jplot(1, [150, 10]);
  const jp2 = jplot(2, [100, -40]);
  const jm = (pl, at) => ({ Feature_ID: jid++, Feature_Role: "meter",
    Feature_Type: "point", Layer_Key: "electric", Plot_ID: pl.Plot_ID,
    Geometry: [at], Attributes: { Seed_Feature_ID: pl.Feature_ID, Circuit_ID: 1 } });
  const jm1 = jm(jp1, [150, 10]);
  const jm2 = jm(jp2, [100, -40]);
  const world = [jpoc, jp1, jp2, jm1, jm2,
    tr([[0, 0], [100, 0]]), tr([[100, 0], [150, 0]]), tr([[100, 0], [100, -40]]),
    tr([[150, 0], [150, 10]], "service_trench")];
  const circuits = [{ id: 1, name: "Circuit 1", meters: [jm1, jm2] }];
  const kindsAt = (list, x, y) => list
    .filter((j) => Math.hypot(j.point[0] - x, j.point[1] - y) < 0.5)
    .map((j) => j.kind);
  const before = planJoints(world, circuits, { lineTypes: lt });
  if (!kindsAt(before, 100, 0).includes("breech")) {
    fail("the fixture no longer plans a breech at the fork — the case proves nothing");
  }
  const bx = { Feature_ID: jid++, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[100, 0]],
    Attributes: { Link_Ways: 4, Circuit_ID: 1, Span_Seq: 2, Span_Anchor: [100, 0] } };
  const after = planJoints([...world, bx], circuits, { lineTypes: lt });
  /* Placed by eye, a box lands a foot or so off the junction. The
     first cut matched at the drawing's 0.25 joining tolerance and
     missed, so the drawing carried both a box and the breech it
     replaces, with the cables terminating at the breech. */
  const offBy = { ...bx, Feature_ID: bx.Feature_ID + 1,
    Geometry: [[101.2, 0]], Attributes: { ...bx.Attributes, Span_Anchor: [101.2, 0] } };
  if (planJoints([...world, offBy], circuits, { lineTypes: lt })
    .some((j) => Math.hypot(j.point[0] - 100, j.point[1]) < 0.5)) {
    fail("a box a metre off the junction leaves the joint it replaces");
  }
  /* But a box genuinely elsewhere does not swallow a real joint. */
  const far = { ...bx, Feature_ID: bx.Feature_ID + 2,
    Geometry: [[108, 0]], Attributes: { ...bx.Attributes, Span_Anchor: [108, 0] } };
  if (!planJoints([...world, far], circuits, { lineTypes: lt })
    .some((j) => Math.hypot(j.point[0] - 100, j.point[1]) < 0.5)) {
    fail("a box eight metres away suppressed a joint that is nothing to do with it");
  }
  if (kindsAt(after, 100, 0).length) {
    fail(`a joint is still planned where a link box stands: ${kindsAt(after, 100, 0)}`);
  }
  if (!kindsAt(after, 150, 0).includes("service")) {
    fail("a plot's service take-off was lost — only the box's own joint goes");
  }
  if (!kindsAt(after, 100, -40).includes("bottleend")) {
    fail("a run stopping dead is no longer sealed");
  }
}

/* ── A box near the walk's node IS that node ──

   Adoption reached one metre. A box is placed by eye and lands a foot
   or so off the node the walk stops at, so the build made a generated
   point BESIDE it: a meaningless two-metre leg into a new A10, with
   the box standing next to it holding nothing, and a run split at a
   place with no physical meaning. The joint rule already reaches two
   metres for the same reason; the two now agree. */
/* Driven rather than matched: the reaches moved into feederPoints.js
   with the rest of the sequencing, and a regex over the canvas would
   now report the rule missing while it holds. */
{
  const box = (at) => ({ Feature_ID: 301, Feature_Role: "linkbox",
    Feature_Type: "point", Layer_Key: "electric", Label: "Link Box 1",
    Geometry: [at], Attributes: { Link_Ways: 4, Span_Anchor: at } });
  const pt = (at) => ({ Feature_ID: 302, Feature_Role: "feederpoint",
    Feature_Type: "point", Layer_Key: "electric", Label: "Point A4",
    Geometry: [at], Attributes: { Circuit_ID: 1, Span_Seq: 4,
      Span_Label: "A4", Span_Anchor: at } });
  const run = (f) => planFeederPoints({
    nodes: [{ point: [0, 0], kind: "origin" }, { point: [100, 0], kind: "junction" }],
    existing: [f], circuit: { id: 1, name: "Circuit 1", letter: "A" },
  });
  const madeAtNode = (r) => (r.create || []).some((p) =>
    Math.hypot(p.Geometry[0][0] - 100, p.Geometry[0][1]) < 0.5);

  if (madeAtNode(run(box([101.2, 0])))) {
    fail("a link box is adopted at the same one-metre reach as everything "
      + "else \u2014 the build makes a feeder point beside it again");
  }
  if (!madeAtNode(run(pt([101.2, 0])))) {
    fail("the adoption no longer judges each kind against its own reach");
  }
  /* And a box genuinely elsewhere is not dragged onto the node. */
  if (!madeAtNode(run(box([108, 0])))) {
    fail("a box eight metres away was adopted as the stop");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Link boxes behave (2 or 4 way, fused, numbered, on the cable run).");
process.exit(bad ? 1 : 0);
