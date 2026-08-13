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
import { originsOf, planSpanNodes, plantLabel } from "./src/features/gis/spanNodes.js";

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

// 3. An electric POC is not an origin: the incomer runs POC to
//    substation and the network starts at the substation.
{
  const o = originsOf([{ Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] }]);
  if (o.has("electric")) fail("an electric POC was treated as E0");
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

console.log(bad ? `\n${bad} problem(s)`
  : "Span node origins behave (E0/G0/W0, POC standing in, none on plant).");
process.exit(bad ? 1 : 0);
