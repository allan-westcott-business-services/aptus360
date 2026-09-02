/* Where span nodes go, and what the origins are called.

   The rule, as the designers state it:

     a junction of mains          gets a node
     the end of a mains trench    gets one
     where a service joins        does not — a span runs through it
     at the plant                 does not — that is E0, G0 or W0

   And the origin per utility:

     electric   the substation                            E0
     gas        the governor, or the POC without one      G0
     water      the pumping station, or the POC           W0

   Gas and water fell through: PLANT only matched governor and pumping
   station, so a site fed at low pressure from an existing main — no
   governor — left its gas POC unmatched, and it took a generic
   A-number. The origin of the gas network ended up numbered as an
   ordinary span, and the levels check had nothing to count from. */
import { readFileSync } from "node:fs";
import {
  originsOf, planSpanNodes, plantLabel, nodeFedBy, nodesFedBy, runThrough,
  runsThrough,
} from "./src/features/gis/spanNodes.js";
import { feederSections, junctionNodes, endOfLineNodes } from "./src/features/gis/feeder.js";
import { labelOf } from "./src/features/gis/mainsCallOff.js";
import { buildGraph } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const T = (id, pts, type = "trench_main") => ({
  Feature_ID: id, Feature_Type: "line", Attributes: { Line_Type: type }, Geometry: pts,
});
const SERVICES = { serviceTypes: new Set(["trench_service"]) };

// 1. A POC stands in where the plant is not drawn.
{
  const o = originsOf([{ Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] }]);
  if (o.get("gas")?.label !== "G0") fail("a gas POC with no governor is not G0");
  if (!o.get("gas")?.standingIn) fail("a gas POC was not marked as standing in");

  const w = originsOf([{ Feature_Role: "poc", Layer_Key: "water", Geometry: [[0, 0]] }]);
  if (w.get("water")?.label !== "W0") fail("a water POC with no pumping station is not W0");
}

// 2. The plant wins where both are drawn — they are two different points.
{
  const o = originsOf([
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] },
    { Feature_Role: "governor", Layer_Key: "gas", Geometry: [[9, 9]] },
  ]);
  if (o.get("gas")?.standingIn) fail("the POC stood in although a governor is drawn");
  if (o.get("gas")?.feature.Feature_Role !== "governor") {
    fail("gas is measured from the POC rather than the governor");
  }
}

// 3. An electric POC IS an origin, where there is no substation.
//
//    This asserted the opposite, on the argument that the incomer runs
//    POC to substation and the network starts at the substation. That
//    is true of a scheme with a transformer and false of a connection
//    to an existing network, which has none — the same assumption
//    lvOrigin was written to overturn, still standing here on the one
//    utility excused from the fix.
//
//    Left as it was, Place Span Nodes numbered an electric POC as an
//    ordinary junction — A5 on the drawing where E0 belongs — so the
//    origin of the LV network sat in the middle of the span numbering
//    and originNodeFor had no Span_Seq 0 node to start from.
{
  const o = originsOf([{ Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] }]);
  if (!o.has("electric")) {
    fail("an electric POC with no substation is not an origin \u2014 it is"
      + " numbered as a span and the LV network starts nowhere");
  }
  if (o.get("electric")?.label !== "E0") {
    fail(`an electric POC standing in is labelled ${o.get("electric")?.label}, not E0`);
  }
  if (!o.get("electric")?.standingIn) {
    fail("an electric POC is not marked as standing in");
  }

  /* And the substation still wins where both are drawn: the incomer
     arrives at the POC and the feeders begin at the transformer. That
     half of the original argument is right and is what stays. */
  const both = originsOf([
    { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] },
    { Feature_ID: 2, Feature_Role: "substation", Layer_Key: "electric", Geometry: [[9, 9]] },
  ]);
  if (both.get("electric")?.feature.Feature_Role !== "substation") {
    fail("electric is measured from the POC although a substation is drawn");
  }
  if (both.get("electric")?.standingIn) {
    fail("the electric POC stood in although a substation is drawn");
  }

  /* Two incomers, as gas already allows: E0 then E0b. A site fed from
     two sides has two networks that never meet, and one origin left the
     second unable to be traced. */
  const two = originsOf([
    { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] },
    { Feature_ID: 2, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[80, 0]] },
  ]);
  if (two.get("electric")?.label !== "E0") fail("the first electric POC is not E0");
  if (two.get("electric:2")?.label !== "E0b") {
    fail(`the second electric POC is ${two.get("electric:2")?.label}, not E0b`);
  }
}

/* ── And the planner leaves that point alone ──

   The two halves of the same fault. Being an origin is what keeps a
   point out of the A-numbering: the canvas builds `plant` from
   originsOf and hands it to planSpanNodes, which skips where a main
   meets plant. An electric POC that was not an origin was therefore
   also not plant, so it got a generic A-number — A5 on the drawing
   where E0 belongs.

   Driven end to end rather than asserted on the map, because the map
   being right is only half of it. */
{
  const poc = {
    Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]],
  };
  const main = (id, g) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main" }, Geometry: g,
  });
  /* A main from the POC to a junction, then two branches off it. */
  const trenches = [
    main(10, [[0, 0], [50, 0]]),
    main(11, [[50, 0], [50, 40]]),
    main(12, [[50, 0], [90, 0]]),
  ];

  const plant = [...originsOf([poc]).values()].map((o) => o.feature);
  if (!plant.length) fail("the electric POC is not passed to the planner as plant");

  const plan = planSpanNodes(trenches, plant,
    { serviceTypes: new Set(["trench_service"]) });
  if (plan.error) fail(`the planner refused a POC-fed drawing: ${plan.error}`);
  else {
    const onPoc = (plan.nodes || []).some((n) =>
      Math.hypot(n.at[0] - 0, n.at[1] - 0) < 0.5);
    if (onPoc) {
      fail("a generic span node was placed on the electric POC \u2014 that point"
        + " is E0, and two names for one place is what this prevents");
    }
    /* The junction and the two dead ends still get theirs, so skipping
       the origin has not skipped everything. */
    if ((plan.nodes || []).length !== 3) {
      fail(`${(plan.nodes || []).length} span nodes planned, not the junction`
        + " and two ends");
    }
  }
}

// 4. Every utility gets its own origin. Taking the first plant found
//    gave one utility an origin and left the rest as spans.
{
  const o = originsOf([
    { Feature_Role: "substation", Layer_Key: "electric", Geometry: [[0, 0]] },
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[50, 0]] },
    { Feature_Role: "poc", Layer_Key: "water", Geometry: [[80, 0]] },
  ]);
  for (const [layer, label] of [["electric", "E0"], ["gas", "G0"], ["water", "W0"]]) {
    if (o.get(layer)?.label !== label) fail(`${layer} did not get ${label}`);
  }
}

// 5. And no A-number lands on an origin.
{
  const trenches = [
    T(1, [[50, 0], [100, 0]]),
    T(2, [[100, 0], [160, 0]]),
    T(3, [[100, 0], [100, 60]]),
    T(4, [[130, 0], [130, 10]], "trench_service"),
  ];
  const origins = [...originsOf([
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[50, 0]] },
  ]).values()].map((x) => x.feature);
  const plan = planSpanNodes(trenches, origins, SERVICES);

  const at = (x, y) => plan.nodes.some((n) => Math.hypot(n.at[0] - x, n.at[1] - y) < 1);
  if (at(50, 0)) fail("a generic span node was placed on the gas POC");
  if (at(130, 0)) fail("a span node was placed where a service joins the main");
  if (!at(100, 0)) fail("the junction of two mains got no node");
  if (!at(160, 0) || !at(100, 60)) fail("a mains end got no node");
  if (plan.nodes.some((n) => !/^A\d+$/.test(n.label))) {
    fail("a span node is not labelled A followed by a number");
  }
}

// 6. plantLabel still answers for real plant, which the drawing uses.
for (const [role, label] of [["substation", "E0"], ["governor", "G0"], ["pumping", "W0"]]) {
  if (plantLabel({ Feature_Role: role }) !== label) fail(`${role} is not ${label}`);
}
if (plantLabel({ Feature_Role: "poc" })) fail("a bare POC returned a plant label");

/* A span node is measured from its anchor, not from where it is drawn.

   The marker gets moved a metre or two clear so its label can be read.
   The network walk counts a node as on a trench within half a metre, so
   moving the marker used to take the node off the network — "no trench
   route between those two nodes" for a pair sitting visibly on the same
   run.

   The anchor is where on the trench it belongs, recorded when it is
   placed and left alone when the marker moves. */
{
  /* What the graph reads, as trenchGraph does it. */
  const graphPoint = (n) => {
    const a = n.Attributes?.Span_Anchor;
    return (Array.isArray(a) && a.length === 2 ? a : (n.Geometry || [])[0]);
  };

  const moved = { Geometry: [[102, 3]], Attributes: { Span_Anchor: [100, 0] } };
  const at = graphPoint(moved);
  if (at[0] !== 100 || at[1] !== 0) {
    fail(`a moved node is measured from ${JSON.stringify(at)}, wanted its anchor`);
  }
  /* Within the walk's own tolerance of the trench, which is the whole
     point: the marker can be anywhere, the anchor cannot. */
  if (Math.hypot(at[0] - 100, at[1] - 0) > 0.5) {
    fail("the anchor is not on the trench");
  }

  /* A node placed before anchors existed falls back to its position,
     which is what it has always used. */
  const old = { Geometry: [[102, 3]], Attributes: {} };
  const oldAt = graphPoint(old);
  if (oldAt[0] !== 102 || oldAt[1] !== 3) {
    fail("a node with no anchor stopped falling back to its own position");
  }

  /* Re-placing reclaims a drifted node rather than duplicating it, and
     repairs its anchor while leaving the marker where somebody put it. */
  const RECLAIM_M = 5;
  const reclaims = (d) => d < RECLAIM_M;
  if (!reclaims(2.7)) fail("a node dragged 2.7m off was not reclaimed on re-placing");
  if (reclaims(6)) fail("re-placing reclaimed a node six metres away");
}

/* An origin is a span node, and one serves every circuit.

   Labelling the substation put "E0" on the drawing and satisfied a
   reader, but every trace looks for a feature with the span node role
   and Span_Seq 0 — so the levels check reported "Circuit 1: no origin
   node" while E0 sat plainly on screen.

   One node, not one per circuit. They are the same point on the ground
   — the substation the whole network is measured from — so four copies
   stacked on one spot is four things to keep in step for no gain. */
{
  const originFor = (features, circuitId) => {
    const nodes = features.filter((f) => f.Feature_Role === "spannode"
      && Number(f.Attributes?.Span_Seq) === 0);
    return nodes.find((f) =>
      Number(f.Attributes?.Circuit_ID) === Number(circuitId))
      ?? nodes.find((f) => f.Attributes?.Circuit_ID == null)
      ?? null;
  };

  /* A labelled substation is not an origin, however it reads. */
  const labelled = [{
    Feature_Role: "substation", Layer_Key: "electric",
    Attributes: { Span_Label: "E0", Span_Seq: 0, Circuit_ID: 1 },
  }];
  if (originFor(labelled, 1)) fail("a labelled substation counted as an origin node");

  /* One node with no circuit on it is the origin for all of them. */
  const shared = [{
    Feature_Role: "spannode", Layer_Key: "electric",
    Attributes: { Span_Label: "E0", Span_Seq: 0 },
  }];
  for (const id of [1, 2, 3]) {
    if (!originFor(shared, id)) fail(`circuit ${id} could not find the shared origin`);
  }

  /* A drawing that already has per-circuit origins keeps working, and
     the one naming this circuit wins. */
  const named = [
    { Feature_Role: "spannode", Layer_Key: "electric",
      Attributes: { Span_Seq: 0 } },
    { Feature_Role: "spannode", Layer_Key: "electric",
      Attributes: { Span_Seq: 0, Circuit_ID: 2, Span_Label: "mine" } },
  ];
  if (originFor(named, 2)?.Attributes?.Span_Label !== "mine") {
    fail("a circuit's own origin did not win over the shared one");
  }
  if (originFor(named, 1)?.Attributes?.Circuit_ID != null) {
    fail("a circuit took another circuit's origin");
  }

  if (originFor([], 1)) fail("an origin was found on an empty drawing");
}

/* A site fed from more than one side.

   Two gas mains in different roads, each serving its own part of the
   estate, with the networks never meeting. One origin meant the second
   network had no point to be measured from — drawable but not
   traceable. */
{
  const feats = [
    { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] },
    { Feature_ID: 2, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[500, 0]] },
    { Feature_ID: 3, Feature_Role: "poc", Layer_Key: "water", Geometry: [[0, 50]] },
  ];
  const origins = originsOf(feats);

  const gas = [...origins].filter(([, o]) => (o.layer ?? "") === "gas"
    || o.feature.Layer_Key === "gas");
  if (gas.length !== 2) fail(`${gas.length} gas origins for two POCs`);

  /* The first keeps the plain key, so everything that asks for "the gas
     origin" and means the only one carries on working. */
  if (origins.get("gas")?.label !== "G0") fail("the first gas POC is not G0");

  /* And the second is lettered, not numbered: G1 is a length of main,
     and two things on a drawing must not share a name. */
  const second = [...origins].find(([k]) => String(k).startsWith("gas:"));
  if (!second) fail("a second gas POC got no origin of its own");
  else if (second[1].label !== "G0b") {
    fail(`the second gas POC is "${second[1].label}", wanted G0b`);
  }
  if ([...origins].some(([, o]) => /^G[1-9]/.test(o.label))) {
    fail("an origin took a mains number");
  }

  /* Every entry says which layer it belongs to, since the key no longer
     always does. */
  for (const [, o] of origins) {
    if (!o.layer && !o.feature?.Layer_Key) fail("an origin does not name its layer");
  }
}

/* A moved span node still names the run that ends on it.

   The marker is dragged a metre or two clear so its label can be read;
   the anchor is the point on the dig it was placed at. Matching a run
   end against the marker meant a tidied drawing lost its labels — the
   levels report showed a dash where a node plainly exists, and more of
   them the more the drawing had been tidied. */
{
  const nodes = [{
    Attributes: { Span_Label: "A12", Span_Anchor: [100, 0] },
    Geometry: [[103, 4]],
  }];
  const labelAt = (pt) => {
    for (const f of nodes) {
      const a = f.Attributes?.Span_Anchor;
      const q = (Array.isArray(a) && a.length === 2 ? a : (f.Geometry || [])[0]);
      if (Math.hypot(q[0] - pt[0], q[1] - pt[1]) <= 1.5) return f.Attributes.Span_Label;
    }
    return null;
  };

  if (labelAt([100, 0]) !== "A12") fail("a moved span node no longer names its run end");
  /* And it does not name a run end that is genuinely elsewhere. */
  if (labelAt([140, 0])) fail("a span node claimed a run end forty metres away");

  /* A node with no anchor still matches on its position, as it always
     did \u2014 nothing placed before anchors existed loses its label. */
  const old = [{ Attributes: { Span_Label: "A9" }, Geometry: [[50, 0]] }];
  const oldAt = (pt) => old.find((f) => {
    const q = f.Geometry[0];
    return Math.hypot(q[0] - pt[0], q[1] - pt[1]) <= 1.5;
  })?.Attributes?.Span_Label ?? null;
  if (oldAt([50, 0]) !== "A9") fail("a node placed before anchors lost its label");
}

/* Two networks cannot both call a length G13.

   Each is built from its own POC and labels its mains from one, so the
   report listed two G13s and two G16s with no way to tell them apart. */
{
  const seen = new Map();
  const uniq = (l) => {
    const before = seen.get(l) ?? 0;
    seen.set(l, before + 1);
    return before ? `${l}${String.fromCharCode(97 + before)}` : l;
  };
  const got = ["G13", "G16", "G13", "G16", "G17"].map(uniq);
  if (new Set(got).size !== got.length) fail(`duplicate labels: ${got.join(", ")}`);
  if (got[0] !== "G13" || got[2] !== "G13b") {
    fail(`the first keeps its name and the second is lettered: got ${got.join(", ")}`);
  }
}

/* Tracing from the origin.

   One origin node serves every circuit on the substation, so it carries
   no Circuit_ID. A trace took the circuit off the node it starts from,
   and the levels check therefore failed on the very node it had just
   been handed: "That span node doesn't belong to a circuit" — about a
   node it would not name, on a drawing with twenty of them. */
{
  const origin = { Attributes: { Span_Seq: 0, Span_Label: "E0" } };
  const ordinary = { Attributes: { Circuit_ID: 2, Span_Label: "A7" } };

  /* What the trace resolves: what it was told, then what the node says,
     then the only circuit there is. */
  const pick = (node, circuits, given) => given
    ?? node.Attributes?.Circuit_ID
    ?? (circuits.length === 1 ? circuits[0].id : null);

  if (pick(origin, [{ id: 1 }, { id: 2 }], 1) !== 1) {
    fail("the levels check could not trace its own circuit from the origin");
  }
  if (pick(ordinary, [{ id: 1 }, { id: 2 }]) !== 2) {
    fail("an ordinary node stopped naming its own circuit");
  }
  /* Tracing by hand from the origin on a one-circuit site needs no
     choice, so it should not ask for one. */
  if (pick(origin, [{ id: 4 }]) !== 4) {
    fail("a single-circuit site could not be traced from its origin");
  }
  /* With several and nothing given, there is genuinely no answer \u2014 and
     the message names the node rather than saying "that span node". */
  if (pick(origin, [{ id: 1 }, { id: 2 }]) !== null) {
    fail("a circuit was guessed at from an origin serving several");
  }
}

/* A span node past the end of the cable is still reported.

   A cable often stops a few metres short of the trench end, and the
   node marking that end carries no load beyond it — so the walk pruned
   the branch and no leg ever stopped there. The report ran the previous
   node straight to the meter and the span node was missing from the
   levels entirely.

   A span node is a measuring point, not a customer. It is worth
   reporting because somebody placed it, and the cable stopping short
   does not make it disappear. */
{
  const REACH = 10;
  const keep = (cum, hasNode) => cum > 0 || hasNode;

  /* The case from the drawing: a node at a dead end, nothing beyond. */
  if (!keep(0, true)) fail("a span node with no load beyond it was dropped");
  /* An ordinary loaded branch is unaffected. */
  if (!keep(12, false)) fail("a branch carrying load was dropped");
  /* And a dead end with neither load nor a node is still pruned —
     otherwise every stub of trench would appear in the levels. */
  if (keep(0, false)) fail("an empty dead end was kept");

  /* The reach is bounded. Without a limit the nearest graph node to a
     span node is always *some* node, so one on the far side of the site
     would keep alive whatever happened to be closest to it. */
  const within = (d) => d <= REACH;
  if (!within(3)) fail("a node three metres past the cable was refused");
  if (within(40)) fail("a node forty metres away was adopted");
}

/* The node a cable feeds, and the node the trace measures to, are the
   same node.

   A cable often stops a few metres short of the trench end where its
   span node sits. The trace was taught to reach that far; the routine
   that puts the cable size onto the node was not, so the node showed
   "not set" while a cable plainly ran up to it \u2014 and the trace then had
   no size to read.

   One figure for both, or the two have separate opinions about which
   node a cable feeds. */
{
  const REACH = 10;
  const CONNECT = 0.5;

  const fedAt = (d) => d <= REACH;
  const joinedAt = (d) => d <= CONNECT;

  /* The case from the drawing. */
  if (joinedAt(2.5)) fail("a 2.5 m gap counts as joined, so this proves nothing");
  if (!fedAt(2.5)) fail("a node 2.5 m past the cable end is still unfed");

  /* Touching, as most are. */
  if (!fedAt(0.3)) fail("a node on the cable end is unfed");

  /* And not so far that a cable adopts a node from elsewhere. */
  if (fedAt(14)) fail("a node fourteen metres away was fed");
}

/* A node with no circuit on it still appears in the report.

   A node is given its circuit when the build routes through it — and a
   node the build pruned never gets one. So the node at the end of the
   trench was excluded from the levels for having no circuit, having
   been excluded from the routing for having no load: two rules, each
   making the other true, and the node missing from the report while
   sitting plainly on the drawing.

   That is the shape of fault worth naming: neither rule is wrong on its
   own. */
{
  const REACH = 10;
  /* The rule as the trace applies it: this circuit's node, or one that
     names none and is near enough to belong here. */
  const belongs = (own, circuitId, gap) => {
    if (own != null) return Number(own) === Number(circuitId);
    return gap <= REACH;
  };

  if (!belongs(1, 1, 0)) fail("a node on this circuit was excluded");
  if (belongs(2, 1, 0)) fail("a node on another circuit was included");

  /* The case from the drawing: no circuit, 2.5 m from the cable end. */
  if (!belongs(null, 1, 2.5)) fail("an unassigned node at the trench end was excluded");

  /* And an unassigned node elsewhere on the site is not adopted \u2014
     otherwise every one of them would appear in every circuit. */
  if (belongs(null, 1, 60)) fail("an unassigned node across the site was adopted");
}

/* The cable that feeds a node with no circuit on it.

   Third place the same fault appeared: the levels report, the pruning,
   and now the routine that puts a cable size onto a node — each
   filtered on Circuit_ID, and a node the build pruned never has one.
   Fixing two of the three left the node in the report with "not set"
   beside it while a cable plainly ran up to it.

   Worth naming as a pattern: a rule that reads a field the build fills
   in will always miss whatever the build skipped. */
{
  const REACH = 10;
  const eligible = (node, cid) =>
    (node.circuit == null || String(node.circuit) === String(cid))
    && node.seq !== 0
    && node.gap <= REACH;

  /* The case from the drawing. */
  if (!eligible({ circuit: null, seq: null, gap: 2.5 }, 1)) {
    fail("an unassigned node 2.5 m from the cable end was fed by nothing");
  }
  /* An ordinary assigned node is unaffected. */
  if (!eligible({ circuit: 1, seq: 9, gap: 0.2 }, 1)) {
    fail("a node on this circuit stopped being fed");
  }
  /* Another circuit's node is still not this cable's business. */
  if (eligible({ circuit: 2, seq: 4, gap: 1 }, 1)) {
    fail("a cable fed a node belonging to another circuit");
  }
  /* And nothing feeds the origin. */
  if (eligible({ circuit: 1, seq: 0, gap: 0 }, 1)) fail("the origin was fed");

  /* Where neither node has a sequence, the nearer wins \u2014 sequence
     alone left it to whichever the array happened to hold first. */
  const pick = (a, b) => {
    const sa = a.seq ?? -1;
    const sb = b.seq ?? -1;
    if (sa >= 0 && sb >= 0 && sa !== sb) return sb > sa ? b : a;
    return b.gap < a.gap ? b : a;
  };
  if (pick({ seq: null, gap: 6 }, { seq: null, gap: 2.5 }).gap !== 2.5) {
    fail("the further of two unassigned nodes was chosen");
  }
  /* Two assigned nodes still order by sequence, which is what it is
     for: the one further along the run is the one being fed. */
  if (pick({ seq: 3, gap: 0.1 }, { seq: 9, gap: 4 }).seq !== 9) {
    fail("sequence stopped deciding between two assigned nodes");
  }
}

/* A cable with no circuit still feeds the node it ends at.

   Fourth place the same fault appeared. Circuit_ID is written by the
   build, so every rule that reads it misses whatever the build did not
   route: the levels report, the pruning, nodeFedBy, and the list of
   cables the sync considers at all.

   Each fix looked right and changed nothing, because the next rule down
   filtered the same way. Worth stating as a rule of its own: a field
   the build fills in cannot be used to decide what the build missed. */
{
  const REACH = 10;
  const considered = (l) => l.type === "line" && l.layer === "electric"
    && l.size != null;
  const feeds = (l, n) =>
    (l.circuit == null || n.circuit == null
      || String(l.circuit) === String(n.circuit))
    && n.seq !== 0 && n.gap <= REACH;

  const routed = { type: "line", layer: "electric", circuit: 1, size: 7 };
  const unrouted = { type: "line", layer: "electric", circuit: null, size: 7 };
  const unsized = { type: "line", layer: "electric", circuit: 1, size: null };

  if (!considered(routed)) fail("a routed cable stopped being considered");
  if (!considered(unrouted)) fail("a cable with no circuit was ignored");
  /* A cable with no size has nothing to give a node, so it is rightly
     out \u2014 the node would be set to nothing. */
  if (considered(unsized)) fail("a cable with no size was used to set a node");

  const node = { circuit: null, seq: 4, gap: 2.5 };
  if (!feeds(unrouted, node)) fail("an unrouted cable fed nothing");
  if (!feeds(routed, node)) fail("a routed cable stopped feeding an unassigned node");

  /* Two named circuits that differ are still kept apart. */
  if (feeds({ circuit: 2 }, { circuit: 1, seq: 4, gap: 1 })) {
    fail("a cable fed a node on another circuit");
  }
}

/* What may be recorded as the cable feeding a span node.

   A node is a point on the mains run: the cable feeding it is the main
   arriving there, and the service is what leaves it for a plot.
   Recording a service meant the volt drop along the mains was computed
   on a smaller conductor over a shorter run — wrong, and wrong in the
   direction that looks acceptable. */
{
  const eligible = (lineType) => !/service/i.test(String(lineType ?? ""))
    && !/trench/i.test(String(lineType ?? ""));

  if (!eligible("lv_main")) fail("an LV main was refused as a feeding cable");
  if (eligible("elec_service")) fail("a service cable was accepted as a feeding cable");
  if (eligible("trench_main")) fail("a trench was accepted as a feeding cable");

  /* And the node a cable feeds is the far one — the cable runs between
     two, and the one it arrives at is downstream. Span_Seq counts
     outward from the origin, so the higher is the fed node. */
  const fedNode = (a, b) => (Number(b.seq) > Number(a.seq) ? b : a);
  if (fedNode({ seq: 4 }, { seq: 9 }).seq !== 9) {
    fail("the upstream node was recorded as the one being fed");
  }
}

/* A node already holding a service cable is corrected.

   Refusing to set a service was only half of it. The sync writes what
   it finds and never takes anything away, so every node recorded before
   that rule went in kept its service cable — and the volt drop along
   the mains went on being computed from it.

   The clearing pass runs first, then the mains pass fills what it can.
   A node left with nothing is the honest state: no main feeds it. */
{
  const names = { 7: "3c WAVE 95", 21: "Single Phase Service CNE 4" };
  const isService = (id) => /service/i.test(names[id] ?? "");

  if (!isService(21)) fail("a service cable was not recognised as one");
  if (isService(7)) fail("an LV main was mistaken for a service");

  const nodes = [{ id: "A1", held: 21 }, { id: "A9", held: 7 }, { id: "A21", held: null }];
  const cleared = nodes.filter((n) => n.held != null && isService(n.held));

  if (cleared.length !== 1 || cleared[0].id !== "A1") {
    fail("the wrong nodes were cleared of their service cable");
  }
  /* A node correctly holding a main is not disturbed \u2014 clearing
     everything and rebuilding would lose a size somebody had chosen by
     hand wherever no main happened to reach. */
  if (cleared.some((n) => n.id === "A9")) fail("a node holding a main was cleared");
}

/* A cable feeds the downstream node of the two it touches.

   Both ends are searched and the far one only decides between them.
   Narrowing the search to a single end was wrong: a node sitting at the
   near end was then not found at all, so cables that had been matching
   stopped matching and nothing was updated. The far end is a tie-break,
   not a filter.

   Three steps, each answering what the one before could not:
   sequence where both nodes have one, distance from the substation
   where they do not, and nearness as the last thing left to say. */
{
  const sub = [0, 0];
  const fromSub = (p) => Math.hypot(p[0] - sub[0], p[1] - sub[1]);
  const pick = (a, b) => {
    const sa = a.seq ?? -1;
    const sb = b.seq ?? -1;
    if (sa >= 0 && sb >= 0 && sa !== sb) return sb > sa ? b : a;
    const da = fromSub(a.at);
    const db = fromSub(b.at);
    if (Math.abs(da - db) > 0.5) return db > da ? b : a;
    return b.gap < a.gap ? b : a;
  };

  /* Sequenced: the higher number is downstream. */
  if (pick({ seq: 1, at: [100, 0], gap: 0 }, { seq: 2, at: [200, 0], gap: 0 }).seq !== 2) {
    fail("a cable fed the upstream node of two sequenced ones");
  }
  /* Unsequenced: the one further from the substation. */
  const un = pick({ seq: null, at: [100, 0], gap: 0 }, { seq: null, at: [200, 0], gap: 0 });
  if (fromSub(un.at) !== 200) fail("a cable fed the node nearer the substation");
  /* Equally far: the nearer to the cable's end, which is all that is
     left to distinguish them. */
  if (pick({ seq: null, at: [100, 0], gap: 4 }, { seq: null, at: [100, 0], gap: 1 }).gap !== 1) {
    fail("two nodes the same distance out were not separated by nearness");
  }
}

/* An electric trace starts at E0, not at whatever origin is nearest.

   A gas POC placed near the substation gets its own origin node, G0, at
   very nearly the same point. Every node with sequence zero was taken
   as the origin regardless of layer, so an electric circuit reported
   its first leg as leaving G0 — the gas network's origin.

   The origins are per utility; the A-numbered nodes are not, because
   they mark the dig itself and every utility shares it. */
{
  const usable = (layer) => !(layer && layer !== "electric" && layer !== "trench");

  if (!usable("electric")) fail("an electric origin was skipped");
  /* Span nodes live on the trench layer \u2014 they mark the dig, which
     every utility shares. */
  if (!usable("trench")) fail("a span node on the trench layer was skipped");
  if (usable("gas")) fail("a gas origin was taken as an electric one");
  if (usable("water")) fail("a water origin was taken as an electric one");
  /* A node drawn before layers were recorded is still used: excluding
     it would empty the report on an older drawing. */
  if (!usable(null)) fail("a node with no layer was skipped");
}

/* The levels report reads the cable that will be pulled.

   cableIdOf defaulted to the calculated size, so a cable set by hand
   showed on the drawing and in the bill but not in the levels report —
   the one place the size changes the answer. The volt drop was worked
   out on a conductor nobody is laying.

   Same rule as the drawing and the bill: the override where there is
   one, the calculated size elsewhere. Asking for "system" still gives
   the build's answer, for comparing the two. */
{
  const pick = (attrs, mode) => (mode === "system"
    ? (attrs.VD_Cable_Size_ID ?? null)
    : (attrs.Manual_VD_Cable_Size_ID ?? attrs.VD_Cable_Size_ID ?? null));

  const built = { VD_Cable_Size_ID: 7 };
  const over = { VD_Cable_Size_ID: 7, Manual_VD_Cable_Size_ID: 9 };

  if (pick(over) !== 9) fail("the levels report reads the calculated cable");
  if (pick(built) !== 7) fail("a cable with no override stopped being read");
  if (pick(over, "system") !== 7) fail("the system view stopped showing the build's answer");
}

/* And the two passes of the node sync compose.

   The clearing pass empties a node holding a service cable; the mains
   pass fills it. Reading the original feature in the second compared
   against the cable about to be removed \u2014 so where the main was the
   same size the node was skipped and kept nothing at all. */
{
  const names = { 7: "3c WAVE 95", 21: "Single Phase Service CNE 4" };
  const run = (held, mainSize) => {
    const updates = new Map();
    if (held != null && /service/i.test(names[held] ?? "")) updates.set(1, { vd: null });
    const pending = updates.get(1);
    const now = pending ? pending.vd : held;
    if (String(now ?? "") !== String(mainSize)) updates.set(1, { vd: mainSize });
    return updates.get(1)?.vd ?? "unchanged";
  };

  if (run(21, 7) !== 7) fail("a node holding a service was not given the main");
  if (run(null, 7) !== 7) fail("an empty node was not filled");
  if (run(7, 7) !== "unchanged") fail("a node already correct was rewritten");
}

/* A cable feeds the node it reaches, not the one beyond it.

   Every node within reach of either end was a candidate, and on short
   spans that takes in the next node along: with A1 and A2 eight metres
   apart and a ten metre reach, the cable from the substation to A1 had
   both in range — and the downstream rule then preferred A2. Editing
   the first cable changed the second node.

   One node per end. A cable runs between two points and feeds the far
   one; anything past that is the next cable's business. */
{
  const REACH = 10;
  /* The drawing from the report: E0 at 0, A1 at 24, A2 at 31.8. */
  const nodes = [{ n: "A1", seq: 1, at: 24 }, { n: "A2", seq: 2, at: 31.8 }];

  const nearestTo = (end) => nodes
    .filter((x) => Math.abs(x.at - end) <= REACH)
    .sort((a, b) => Math.abs(a.at - end) - Math.abs(b.at - end))[0];
  const downstream = (list) => list.reduce((a, b) => (b.seq > a.seq ? b : a));

  const feeds = (ends) => downstream([...new Set(ends.map(nearestTo).filter(Boolean))]).n;

  if (feeds([0, 24]) !== "A1") fail("the substation cable fed the wrong node");
  if (feeds([24, 31.8]) !== "A2") fail("the second cable stopped feeding A2");

  /* The old rule, kept as the thing being guarded against. */
  const anyInReach = (ends) => downstream(
    nodes.filter((x) => ends.some((e) => Math.abs(x.at - e) <= REACH)));
  if (anyInReach([0, 24]).n !== "A2") {
    fail("the old rule stopped picking A2, so this test proves nothing");
  }
}

/* ── Against the real nodeFedBy, not a copy of it ──

   Everything above this line tests a local re-implementation of the
   rule. That is why none of it caught the faults reported from the
   drawing at Winston Road: the mirrors were right and the functions
   they stood for had moved. These import the thing itself.

   The drawing, as measured off the canvas: E0 at the substation, A1
   24 m out, A2 7.8 m beyond A1, A3 14.3 m beyond A2. A1 and A2 are
   closer together than SPAN_REACH_M, which is the arrangement that
   made the substation's cable reach past the node it feeds. */
{
  const REACH = 10;
  const opts = { isTrench: () => false, reach: REACH };

  const sub = { Feature_ID: 100, Feature_Role: "substation", Geometry: [[0, 0]] };
  const spanNode = (id, label, seq, at) => ({
    Feature_ID: id, Feature_Role: "spannode", Geometry: [at],
    Attributes: { Span_Label: label, Span_Seq: seq, Circuit_ID: 1 },
  });
  const drawing = [
    sub,
    spanNode(1, "A1", 1, [24, 0]),
    spanNode(2, "A2", 2, [31.8, 0]),
    spanNode(3, "A3", 3, [46.1, 0]),
  ];
  const cable = (pts, attrs = {}) => ({
    Feature_ID: 10, Feature_Type: "line", Layer_Key: "electric", Geometry: pts,
    Attributes: { Line_Type: "lv_main", Circuit_ID: 1, ...attrs },
  });
  const fed = (line) => nodeFedBy(line, drawing, opts)?.Attributes?.Span_Label ?? null;

  if (fed(cable([[0, 0], [24, 0]])) !== "A1") {
    fail("the substation's cable does not feed A1");
  }
  if (fed(cable([[24, 0], [31.8, 0]])) !== "A2") fail("the cable to A2 does not feed A2");
  if (fed(cable([[31.8, 0], [46.1, 0]])) !== "A3") fail("the cable to A3 does not feed A3");

  /* Drawn the other way round. A run redrawn or joined can hold its
     points in either order and still feed the node it arrives at. */
  if (fed(cable([[24, 0], [0, 0]])) !== "A1") {
    fail("a cable drawn back towards the substation fed the wrong node");
  }

  /* A service never feeds a node, whatever it reaches. */
  if (fed(cable([[24, 0], [31.8, 0]], { Line_Type: "elec_service" })) !== null) {
    fail("a service cable was recorded as feeding a span node");
  }
  if (nodeFedBy(cable([[24, 0], [31.8, 0]]), drawing,
    { isTrench: () => true, reach: REACH }) !== null) {
    fail("a trench was recorded as feeding a span node");
  }

  /* Out of reach of everything feeds nothing, rather than the nearest
     thing that happens to exist. */
  if (fed(cable([[200, 0], [300, 0]])) !== null) {
    fail("a cable nowhere near a node still fed one");
  }
}

/* An override reaches the node, and only the node its own run feeds.

   Two faults met here. Saving an override changed Manual_VD_Cable_Size_ID
   and the carry compared VD_Cable_Size_ID on both sides, so it saw no
   change and did nothing; the fallback was the whole-drawing sync, which
   swept in every node that disagreed for any reason. Both are settled by
   carrying the effective size to exactly one node. */
{
  const REACH = 10;
  const opts = { isTrench: () => false, reach: REACH };
  const SYS = 7;      // 3c WAVE 95
  const OVER = 9;     // 3c WAVE 300

  const sub = { Feature_ID: 100, Feature_Role: "substation", Geometry: [[0, 0]] };
  const node = (id, label, seq, at, attrs = {}) => ({
    Feature_ID: id, Feature_Role: "spannode", Geometry: [at],
    Attributes: { Span_Label: label, Span_Seq: seq, Circuit_ID: 1, ...attrs },
  });

  /* A2 still carries 300 from when the old rule handed it the
     substation's cable \u2014 the residue left in the drawing. */
  const drawing = [
    sub,
    node(1, "A1", 1, [24, 0], { VD_Cable_Size_ID: SYS }),
    node(2, "A2", 2, [31.8, 0], { VD_Cable_Size_ID: OVER }),
  ];
  const edited = {
    Feature_ID: 10, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [24, 0]],
    Attributes: {
      Line_Type: "lv_main", Circuit_ID: 1,
      VD_Cable_Size_ID: SYS, Manual_VD_Cable_Size_ID: OVER,
    },
  };

  const target = nodeFedBy(edited, drawing, opts);
  if (target?.Attributes?.Span_Label !== "A1") {
    fail("an overridden run did not carry to the node it feeds");
  }

  /* Both fields, so no reader can disagree with another about what this
     node holds. Writing only the overridden one left A1 reading 300
     through the override and 95 through the system field. */
  const attrs = {
    ...target.Attributes,
    VD_Cable_Size_ID: edited.Attributes.VD_Cable_Size_ID ?? null,
    Manual_VD_Cable_Size_ID: edited.Attributes.Manual_VD_Cable_Size_ID ?? null,
  };
  const effective = (a) => a.Manual_VD_Cable_Size_ID ?? a.VD_Cable_Size_ID ?? null;

  if (effective(attrs) !== OVER) fail("the node did not end up reading the override");
  if (attrs.VD_Cable_Size_ID !== SYS) fail("the build's own answer was lost from the node");

  /* And the dialog names what is written, not the field it used to
     read. Printing VD_Cable_Size_ID here said 95 while writing 300. */
  if (effective(attrs) === attrs.VD_Cable_Size_ID) {
    fail("this case no longer distinguishes the two fields, so it proves nothing");
  }

  /* A2 is untouched: nothing about editing the substation's cable is a
     statement about the run into A2. */
  if (drawing[2].Attributes.VD_Cable_Size_ID !== OVER) {
    fail("carrying to A1 disturbed A2");
  }

  /* Taking the override off puts the node back on the build's answer
     rather than leaving 300 stranded on it. */
  const cleared = {
    ...attrs,
    VD_Cable_Size_ID: SYS,
    Manual_VD_Cable_Size_ID: null,
  };
  if (effective(cleared) !== SYS) fail("clearing the override left it on the node");
}

/* ── A node's name is its own ──

   Build LV Network used to rename every node it adopted into its
   circuit's letter and sequence. That was right when the build placed
   nodes; it stopped placing them and the renaming stayed. So a node
   placed on the trench as A28 became B7 when the build ran, and circuit
   A's own sequence restarted at A1 on top of the site-wide A1..An that
   Place Span Nodes had already issued.

   Not hypothetical: project 15 has two nodes called A4 today, one from
   each writer.

   A name is the node's own. Its position on a circuit is a different
   fact, recorded as Span_Seq beside it. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* ── Rewritten for feeder points ──

     The build no longer adopts span nodes at all: span nodes are the
     dig's, and the build's creatures are feeder points \u2014 which it
     makes, and may therefore name in the circuit's lettering. What
     must now hold is the split itself. */
  if (/adoptable = src\.filter\(\(f\) => f\.Feature_Role === "spannode"/.test(canvas)) {
    fail("the build still adopts span nodes into circuits");
  }
  if (!/Feature_Role: "feederpoint"/.test(canvas)) {
    fail("the build creates no feeder points");
  }
  /* A hand-placed feeder point adopted onto a planned position keeps
     its own name and cable \u2014 the build writes its sequence and kind,
     nothing else of identity. */
  if (!/Span_Seq: num, Span_Kind: nd\.kind/.test(canvas)) {
    fail("the build no longer records which position on the circuit a point is");
  }

  /* And the leftover pass, which renamed anything the walk did not ask
     for. Sequence only now. */
  if (/Attributes: \{ \.\.\.f\.Attributes, Span_Seq: seq, Span_Label: label \}/.test(canvas)) {
    fail("the build still renames nodes the walk did not ask for");
  }
  if (!/Attributes: \{ \.\.\.f\.Attributes, Span_Seq: seq \}/.test(canvas)) {
    fail("the leftover pass no longer records a position on the circuit");
  }

  /* The origin is the one node the build may name, because it has no
     prior name \u2014 Link to Circuit creates it. */
  if (!/Span_Seq: 0, Span_Label: spanLabel\(letter, 0\)/.test(canvas)) {
    fail("the origin node is no longer named when a circuit is created");
  }

  /* ── Adopted by distance, not by list order ──

     Two nodes 0.05 m apart on the live data were both inside the
     one-metre tolerance, so which one a circuit measured from was
     decided by array order. Reorder the features and the schedule
     changes. */
  /* Any binding, not just `const` — the first form of this missed a
     `let match = adoptable.find(...)` put back beside the loop. */
  if (/match = adoptable\.find\(/.test(canvas)) {
    fail("the build adopts whichever node comes first in the feature list");
  }
  /* The behaviour, not only the spelling. Adding `.find` back beside
     the loop left the loop's answer winning and the source-grep above
     passing, so the rule is exercised here instead: two candidates in
     range, the nearer one wins whichever order they arrive in. */
  {
    const pick = (list, target) => {
      const gap = (f) => Math.hypot(
        (f.Attributes?.Span_Anchor ?? f.Geometry[0])[0] - target[0],
        (f.Attributes?.Span_Anchor ?? f.Geometry[0])[1] - target[1]);
      let best = null;
      let bestD = 1;
      for (const f of list) {
        const d = gap(f);
        if (d >= bestD) continue;
        if (best && d === bestD && Number(f.Feature_ID) >= Number(best.Feature_ID)) continue;
        best = f;
        bestD = d;
      }
      return best;
    };
    /* The live pair: 23697 and 23699, 0.05 m apart, both inside the
       metre. */
    const a = { Feature_ID: 23697, Geometry: [[10.9, 0]], Attributes: {} };
    const b = { Feature_ID: 23699, Geometry: [[10.05, 0]], Attributes: {} };
    for (const order of [[a, b], [b, a]]) {
      const got = pick(order, [10, 0]);
      if (got?.Feature_ID !== 23699) {
        fail(`two nodes in range resolved to ${got?.Feature_ID} in one order`
          + " \u2014 the nearer one has to win whichever way the list arrives");
      }
    }
    /* And the marker is not what is measured to: a node dragged clear
       of the trench has not moved. */
    const dragged = {
      Feature_ID: 1, Geometry: [[40, 40]],
      Attributes: { Span_Anchor: [10, 0] },
    };
    if (pick([dragged], [10, 0])?.Feature_ID !== 1) {
      fail("a node dragged clear for legibility was treated as having moved");
    }
  }
  /* Measured from the anchor, not the marker: a point dragged clear so
     its label can be read has not moved. The feeder-point adoption
     reads the anchor the same way the span-node adoption did. */
  if (!/f\.Attributes\?\.Span_Anchor \?\? f\.Geometry\?\.\[0\]/
    .test(canvas)) {
    fail("adoption measures to the marker rather than the point's anchor");
  }

  /* ── Two nodes with one name is said out loud ──

     A spare keeps what it was called last time, and a re-run issues
     those numbers again to different points. Reported rather than
     resolved: renaming the spare is what this change just stopped, and
     deleting it would throw away a node somebody placed. */
  if (!/const clashing = /.test(canvas)) {
    fail("a spare node sharing a name with a new one is not detected");
  }
  if (!/the name of two nodes/.test(canvas)) {
    fail("a duplicate node name is not reported");
  }
}

/* ── The readers take the stored name ──

   Every document that names a run \u2014 the call-off, the levels check,
   the circuit report \u2014 has to read the node's own label rather than
   rebuild one from the circuit, or the name on the drawing and the name
   on the paperwork are different names. */
{
  const stored = labelOf({
    Attributes: { Span_Label: "A28", Circuit_ID: 2, Span_Seq: 7 },
  });
  if (stored !== "A28") {
    fail(`a node called A28 is named "${stored}" on a call-off`);
  }

  /* The computed form survives for a node from an older build, which
     carries a circuit and may carry no label. */
  const older = labelOf({ Attributes: { Circuit_ID: 2, Span_Seq: 7 } });
  if (older !== "B7") fail(`a node with no name of its own came out as "${older}"`);

  if (labelOf({ Attributes: {} }) !== null) {
    fail("a node with nothing to go on was given a name anyway");
  }
}

/* ── A meter is served by its own plot's cable ──

   Nearest was the only rule, and on a tight estate the nearest cable to
   a meter is often the neighbour's: two plots either side of a shared
   boundary have their meters metres apart and their services running to
   different points on the main. The meter hung off a cable that does
   not feed it, and every distance, volt drop and circuit membership
   downstream was measured along the wrong route \u2014 silently, because
   the drawing looks right.

   The number is already on both. A seed knows its plot, the boundary
   point is placed with it, the meter inherits it, and Auto Lay Services
   stamps it on the trench and the cable. So the match is recorded
   rather than guessed. */
{
  const line = (id, geom, plot, type = "elec_service") => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
    Geometry: geom, Plot_ID: plot, Attributes: { Line_Type: type },
  });
  const meter = (id, at, plot) => ({
    Feature_ID: id, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [at], Plot_ID: plot, Attributes: {},
  });
  const linked = (feats, id) => [...(buildGraph(feats).adj.get(id) || [])];

  /* Plot 34's meter sits closer to plot 35's cable than to its own. */
  const crowded = [
    line(1, [[0, 0], [0, 5]], 34),
    line(2, [[10, 0], [10, 5]], 35),
    meter(3, [9.5, 5], 34),
  ];
  const got = linked(crowded, 3);
  if (got.join() !== "1") {
    fail(`plot 34's meter is served by feature ${got.join()}, not its own`
      + " plot's cable \u2014 the nearest cable is the neighbour's");
  }

  /* A cable drawn by hand carries no number, so nearest still decides.
     Removing that fallback would strand every meter on an older
     drawing. */
  const unnumbered = [
    line(1, [[0, 0], [0, 5]], null),
    line(2, [[10, 0], [10, 5]], null),
    meter(3, [9.5, 5], 34),
  ];
  if (linked(unnumbered, 3).join() !== "2") {
    fail("with no plot numbers on the cables the nearest one is not used");
  }

  /* A main carrying a plot number is not what feeds the meter \u2014 it may
     have been laid for that plot and run straight past it.

     ── Not proven to bite ──

     Removing the mains test from buildGraph leaves this passing, so it
     is not this case that the test is earning its place on. gapBetween
     measures to a line's ENDS rather than to the nearest point along
     it, so a long main is far from a meter standing beside its middle
     and loses to the service on distance alone.

     Which may mean the mains exclusion is redundant. Left in as the
     cheaper of two mistakes \u2014 it cannot select a wrong cable, and a
     main that happens to end near a meter is exactly the case
     end-distance would get wrong. Worth settling with a fixture where
     the main ENDS beside the meter, which is the shape this one should
     have been. */
  /* The main is the NEARER of the two here \u2014 0.5 m against 4.5 \u2014 so
     only excluding mains gives the right answer. The first form of this
     put the service nearer anyway, which meant it passed whether or not
     mains were excluded. */
  const past = [
    line(1, [[0, 0], [0, 40]], 34, "elec_main"),
    line(2, [[5, 20], [5, 21]], 34),
    meter(3, [0.5, 20], 34),
  ];
  if (linked(past, 3).join() !== "2") {
    fail("a meter was served by a main rather than by its service");
  }

  /* ── And the reach is 30 m ──

     Twelve was a guard against grabbing the wrong cable, and a guess
     about how far a meter sits from its service \u2014 which is a property
     of the plot, not of the drawing. With the plot number deciding,
     a long garden is no longer a reason to be unreachable. */
  const far = [line(1, [[0, 0], [0, 25]], 34), meter(3, [0, 50], 34)];
  if (!linked(far, 3).length) {
    fail("a meter 25 m from its own service is not connected \u2014 the reach"
      + " is meant to be 30 m");
  }
  /* ── Where the numbers are there, they decide, and nothing else does ──

     Meter to line is the one fuzzy hop in the trace. Line to line is
     exact — two cables meeting within a quarter of a metre is how the
     network connects — so the route is exact everywhere except its
     first step, and that is where it went wrong.

     A seed knows its plot, the boundary point is placed with it, the
     meter inherits it, and Auto Lay Services stamps it on the trench
     and the cable. Meter to its own service is a recorded fact, not a
     distance. Guessing produced a confident and wrong list of breech
     joints for plot 34, taken off a main on another branch. */
  {
    const svc = (id, geom, plot) => line(id, geom, plot, "elec_service");
    const mainLine = (id, geom) => line(id, geom, null, "elec_main");

    /* Its own service wins over a nearer main. */
    const own = [svc(1, [[0, 0], [0, 5]], 34), mainLine(2, [[9, 0], [9, 9]]),
      meter(3, [9, 5], 34)];
    if (linked(own, 3).join() !== "1") {
      fail("a meter took the nearer main over the service carrying its"
        + " own plot number");
    }

    /* No service of its own is not "nearly the neighbour's" — it is a
       plot with no service on the drawing, and saying so is the useful
       answer. */
    const orphan = [svc(1, [[0, 0], [0, 5]], 35), mainLine(2, [[9, 0], [9, 9]]),
      meter(3, [9, 5], 34)];
    if (linked(orphan, 3).length) {
      fail("a meter with no service of its own was attached to something"
        + " else \u2014 its route back is a guess and its joints are wrong");
    }

    /* And a drawing made before services were stamped still traces, or
       every meter on it would be stranded. */
    const older = [mainLine(2, [[9, 0], [9, 9]]), meter(3, [9, 5], 34)];
    if (!linked(older, 3).length) {
      fail("a drawing with no plot numbers on its services lost every meter");
    }
  }

  /* ── The extra reach is bought by the plot number, not given away ──

     Thirty metres is safe when the number decides which cable is which.
     It is not safe as a fallback: on a drawing where Auto Lay Services
     has not been run there are no service cables at all, so the meter
     takes the nearest line of ANY kind — and at thirty metres that
     reaches a main on another branch. A plot then hung off a main that
     is not on its route back, and the breech joints on that main came
     out on its call-off.

     So an unnumbered match gets twelve metres, which is what the single
     reach was and is about how far a meter sits from its own service. */
  const noService = [line(1, [[0, 0], [0, 25]], null, "elec_main"),
    meter(3, [0, 50], 34)];
  if (linked(noService, 3).length) {
    fail("a meter reached 25 m to a main carrying no plot number \u2014 that is"
      + " a main on another branch, and its joints are not on this route");
  }
  /* But a main genuinely beside it still serves it, or a drawing with
     no service cables would lose every meter. */
  const closeMain = [line(1, [[0, 0], [0, 42]], null, "elec_main"),
    meter(3, [0, 50], 34)];
  if (!linked(closeMain, 3).length) {
    fail("a meter 8 m from the only line near it was left unconnected");
  }

  /* Not unlimited: a meter on the far side of the site does not belong
     to a cable just because the numbers match. */
  const absurd = [line(1, [[0, 0], [0, 5]], 34), meter(3, [0, 200], 34)];
  if (linked(absurd, 3).length) {
    fail("a meter 195 m from its service was connected to it");
  }
}

/* ── A run that passes straight through a node feeds it ──

   Reported from the drawing: Build LV Network, then Apply Cable Sizes
   to Span Nodes, and many nodes still had no cable although a sized
   run visibly entered and left them. Junctions a circuit carries
   straight over are one section to the router, so nothing ends there
   and the end rule never reached them.

   Feeder points have since taken over as the electrical stops on
   drawings that have them; this case stands because span nodes remain
   the stops on every drawing built before that, and the rule must hold
   there. Driven through the real router so the shape of the sections
   is the router's and not this file's. */
{
  const lineTypes = [
    { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
    { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
  ];
  let id = 1000;
  const trench = (pts, key = "trench") => ({
    Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  const plot = (n, at) => ({
    Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: n, Geometry: [at], Attributes: {},
  });
  const meter = (plotId, seedId, at, circuitId) => ({
    Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: plotId, Geometry: [at],
    Attributes: { Seed_Feature_ID: seedId, Circuit_ID: circuitId },
  });
  const sub = {
    Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
  };
  const p1 = plot(101, [50, 10]), p2 = plot(102, [150, 10]);
  const p3 = plot(201, [110, 30]), p4 = plot(202, [110, 60]);
  const drawing = [
    sub,
    trench([[0, 0], [50, 0], [100, 0]]),
    trench([[100, 0], [150, 0], [200, 0]]),
    trench([[100, 0], [100, 30], [100, 60]]),
    trench([[50, 0], [50, 10]], "service_trench"),
    trench([[150, 0], [150, 10]], "service_trench"),
    trench([[100, 30], [110, 30]], "service_trench"),
    trench([[100, 60], [110, 60]], "service_trench"),
    p1, p2, p3, p4,
    meter(101, p1.Feature_ID, [50, 10], 1),
    meter(102, p2.Feature_ID, [150, 10], 1),
    meter(201, p3.Feature_ID, [110, 30], 2),
    meter(202, p4.Feature_ID, [110, 60], 2),
  ];
  const placed = planSpanNodes(drawing.filter((f) => f.Layer_Key === "trench"), sub,
    { serviceTypes: new Set(["service_trench"]) });
  const nodes = placed.nodes.map((n) => ({
    Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
    Layer_Key: "trench", Geometry: [n.at],
    Attributes: { Span_Label: n.label, Span_Seq: n.seq, Span_Kind: n.kind, Span_Anchor: n.at },
  }));
  const junction = nodes.find((n) => n.Geometry[0][0] === 100 && n.Geometry[0][1] === 0);
  if (!junction) fail("Place Span Nodes put no node at the junction of mains");

  const circuits = [
    { id: 1, seeds: new Set([p1.Feature_ID, p2.Feature_ID]) },
    { id: 2, seeds: new Set([p3.Feature_ID, p4.Feature_ID]) },
  ];
  const lines = [];
  const world = [...drawing, ...nodes];
  for (const c of circuits) {
    const r = feederSections(world, { lineTypes, seedIds: c.seeds });
    if (r.error) { fail(`the router refused circuit ${c.id}: ${r.error}`); continue; }
    r.sections.forEach((sec, i) => lines.push({
      Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric", Geometry: sec.pts,
      Attributes: { Line_Type: "elec_main", Circuit_ID: c.id, VD_Cable_Size_ID: c.id * 100 + i },
    }));
    let seq = 0;
    for (const m of [...junctionNodes(r.model), ...endOfLineNodes(r.model)]) {
      const hit = nodes.find((n) => n.Attributes.Circuit_ID == null
        && Math.hypot(n.Geometry[0][0] - m.point[0], n.Geometry[0][1] - m.point[1]) < 1);
      if (hit) { hit.Attributes.Circuit_ID = c.id; hit.Attributes.Span_Seq = ++seq; }
    }
  }
  const all = [...world, ...lines];
  const opts = { isTrench: () => false, reach: 10 };

  if (junction && junction.Attributes.Circuit_ID != null) {
    fail("the shared junction was adopted by a circuit, so this case no longer"
      + " reproduces the drawing it came from");
  }
  if (junction && lines.some((l) => nodeFedBy(l, all, opts) === junction)) {
    fail("a run ends at the shared junction, so the end rule already covers it");
  }
  if (lines.length < 2) fail(`the router drew ${lines.length} section(s), not one per circuit`);

  const through = junction ? runThrough(junction, lines, opts) : null;
  if (!through) {
    fail("the junction both circuits run straight through has no cable feeding it");
  } else if (Number(through.Attributes.Circuit_ID) !== 1) {
    fail("the through rule did not settle a tie on the lower Feature_ID");
  }
  if (through && !nodesFedBy(through, all, opts).includes(junction)) {
    fail("nodesFedBy does not list the junction the section runs through");
  }

  const branchEnd = nodes.find((n) => n.Geometry[0][1] === 60);
  if (!branchEnd) fail("no node at the end of the branch");
  else {
    const feeder = lines.find((l) => nodeFedBy(l, all, opts) === branchEnd);
    if (Number(feeder?.Attributes?.Circuit_ID) !== 2) {
      fail("the end of the branch is not fed by circuit 2's run");
    }
  }

  const beyond = {
    Feature_ID: id++, Feature_Role: "spannode", Geometry: [[31.8, 0]],
    Attributes: { Span_Label: "A2", Span_Seq: 2, Circuit_ID: 1 },
  };
  const toA1 = { Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [24, 0]], Attributes: { Line_Type: "lv_main", Circuit_ID: 1 } };
  if (runsThrough(toA1, beyond, opts) != null) {
    fail("a node 7.8 m past the end of a cable was read as run through by it");
  }
  const beside = { ...beyond, Geometry: [[12, 1.5]] };
  if (runsThrough(toA1, beside, opts) == null) {
    fail("a node 1.5 m off the middle of a cable was not read as run through");
  }
  const svc = { ...toA1, Geometry: [[0, 0], [30, 0]],
    Attributes: { Line_Type: "elec_service", Circuit_ID: 1 } };
  if (runsThrough(svc, beside, opts) != null) fail("a service cable ran through a node");
  const other = { ...toA1, Geometry: [[0, 0], [30, 0]],
    Attributes: { Line_Type: "lv_main", Circuit_ID: 2 } };
  if (runThrough(beside, [other], opts)) {
    fail("another circuit's cable was read as feeding this circuit's node");
  }
  const origin = { ...beside, Attributes: { Span_Seq: 0, Circuit_ID: 1 } };
  if (runThrough(origin, [toA1], opts)) fail("the origin was fed by a cable running past it");

  /* ── And where the circuit has feeder points, they take over ──

     One feeder point on circuit 1 flips the whole rule for that
     circuit: its cables feed its points and leave the span nodes to
     the dig. Circuit 2, with none, still feeds span nodes. */
  const fep = { Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[150, 0]],
    Attributes: { Circuit_ID: 1, Span_Seq: 2, Span_Label: "A2", Span_Anchor: [150, 0] } };
  const withFep = [...all, fep];
  const c1run = lines.find((l) => Number(l.Attributes.Circuit_ID) === 1);
  const fedNow = nodeFedBy(c1run, withFep, opts);
  if (fedNow && fedNow.Feature_Role !== "feederpoint") {
    fail("a circuit with feeder points still feeds span nodes");
  }
  const c2run = lines.find((l) => Number(l.Attributes.Circuit_ID) === 2);
  const fed2 = nodeFedBy(c2run, withFep, opts);
  if (fed2 && fed2.Feature_Role !== "spannode") {
    fail("circuit 2, which has no feeder points, stopped feeding its span nodes");
  }
}

/* ── Two numberings are not one ──

   A node the build adopted counts A1, A2, A3 along its circuit; a node
   it never adopted keeps the site-wide number Place Span Nodes gave it.
   The downstream rule compared the two as if they were the same scale. */
{
  const opts = { isTrench: () => false, reach: 10 };
  const sub = { Feature_ID: 1, Feature_Role: "substation", Geometry: [[0, 0]] };
  const adopted = { Feature_ID: 2, Feature_Role: "spannode", Geometry: [[40, 0]],
    Attributes: { Span_Label: "A3", Span_Seq: 3, Circuit_ID: 1 } };
  const unadopted = { Feature_ID: 3, Feature_Role: "spannode", Geometry: [[48, 0]],
    Attributes: { Span_Label: "A2", Span_Seq: 2 } };
  const run = { Feature_ID: 4, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[40, 0], [48, 0]], Attributes: { Line_Type: "lv_main", Circuit_ID: 1 } };
  if (nodeFedBy(run, [sub, adopted, unadopted], opts) !== unadopted) {
    fail("a site-numbered node was ranked against a circuit-numbered one by"
      + " sequence, and the cable fed the node it leaves from");
  }
  const both = { ...unadopted, Attributes: { ...unadopted.Attributes, Span_Seq: 4, Circuit_ID: 1 } };
  if (nodeFedBy(run, [sub, adopted, both], opts) !== both) {
    fail("on one circuit the higher sequence is no longer downstream");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Span node origins behave (E0/G0/W0, POC standing in, none on plant).");
process.exit(bad ? 1 : 0);
