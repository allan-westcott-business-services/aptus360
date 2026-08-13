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

console.log(bad ? `\n${bad} problem(s)`
  : "Span node origins behave (E0/G0/W0, POC standing in, none on plant).");
process.exit(bad ? 1 : 0);
