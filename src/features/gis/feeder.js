/* Building the LV feeder network.

   A port of the original's gisFeederModel, gisFeederSections and the
   routing half of gisBuildLvFeederNetwork.

   The shape of it:

     Cables run along trenches, so the model is built from trench
     geometry rather than from the feature graph the rest of this app
     traces. Every trench vertex is a node; vertices closer than EPS are
     the same node. That vertex-level view is what lets a run break in
     the middle of a drawn trench, which is where cable counts change.

     Each meter's load attaches at its plot seed's position on the
     network, not at the meter glyph — the glyph sits beside the seed,
     off the trench. The original does the same, falling back to the
     meter itself where a seed is missing.

     Loads accumulate upward from the leaves to the substation, so every
     node knows how many meters and how much load sit beyond it. The
     number of cables a run needs follows from the meter count.

     Runs break at the substation, at junctions, at leaf ends, and where
     the cable count changes. Anywhere else a run carries straight on
     through corners, because a corner is not an electrical event.

   Service trenches are excluded from the mains path: a service spur
   feeds one plot and is not something the feeder runs along. */

/* Two vertices this close are the same point. The original's value, in
   the same units — drawing coordinates, so metres here. */
export const CONNECT_EPS = 0.5;

/* Meters per cable. Above this the run needs another cable beside it,
   which is what makes a run break mid-trench. */
export const METERS_PER_CABLE = 70;

/* How far a seed may sit from the network and still be counted as on it.
   A seed is placed by eye against a plan, so it will not land exactly on
   a trench vertex. */
export const SNAP_TOL = 8;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const isTrench = (f, lineTypes = []) => {
  const key = f.Attributes?.Line_Type;
  if (!key) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  return t ? t.Layer_Key === "trench" : String(key).includes("trench");
};

const isService = (f) => String(f.Attributes?.Line_Type || "").includes("service");

/* ── The model ──
   Nodes, a tree rooted at the substation, and the load beyond each node. */
export function buildFeederModel(features = [], opts = {}) {
  const {
    lineTypes = [], plotById = () => null, seedIds = null,
    eps = CONNECT_EPS, tol = SNAP_TOL, fallbackKva = 0,
  } = opts;

  const nodes = [];
  const adj = new Map();

  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  const addEdge = (a, b, svc) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, svc });
    adj.get(b).push({ to: a, svc });
  };

  for (const f of features) {
    if (f.Feature_Type !== "line" || !isTrench(f, lineTypes)) continue;
    const pts = f.Geometry || [];
    if (pts.length < 2) continue;
    const svc = isService(f);
    for (let i = 0; i + 1 < pts.length; i++) addEdge(intern(pts[i]), intern(pts[i + 1]), svc);
  }
  if (!nodes.length) return { error: "No trenches to route cables along." };

  const sub = features.find((f) => f.Feature_Role === "substation" && (f.Geometry || []).length);
  if (!sub) return { error: "Place a substation first \u2014 feeders route back to it." };

  const nearest = (p) => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], p);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd };
  };

  const S = nearest(sub.Geometry[0]).i;
  if (S < 0) return { error: "The substation isn\u2019t on the trench network." };

  /* Load attaches where the plot meets the network. The meter glyph sits
     beside its seed rather than on the trench, so the seed is the better
     anchor; the meter is the fallback for a meter with no seed. */
  const meterCount = new Array(nodes.length).fill(0);
  const meterKva = new Array(nodes.length).fill(0);
  const attached = [];
  const skipped = [];

  for (const m of features) {
    if (m.Feature_Role !== "meter" || m.Layer_Key !== "electric") continue;
    if (!(m.Geometry || []).length) continue;

    const seedId = m.Attributes?.Seed_Feature_ID;
    const seed = seedId != null
      ? features.find((s) => s.Feature_Role === "plot" && Number(s.Feature_ID) === Number(seedId))
      : features.find((s) => s.Feature_Role === "plot"
          && m.Plot_ID != null && Number(s.Plot_ID) === Number(m.Plot_ID));

    if (seedIds && !(seed && seedIds.has(Number(seed.Feature_ID)))) continue;

    const anchor = (seed?.Geometry || []).length ? seed.Geometry[0] : m.Geometry[0];
    let nn = nearest(anchor);
    if (nn.i < 0 || nn.d > tol) nn = nearest(m.Geometry[0]);

    if (nn.i >= 0 && nn.d <= tol) {
      meterCount[nn.i] += 1;
      const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
      const kva = plot?.kva_load ?? plot?.KVA_Load;
      meterKva[nn.i] += kva != null && kva !== "" ? Number(kva) : fallbackKva;
      attached.push(m.Feature_ID);
    } else {
      /* Named rather than counted: a meter that missed the network is a
         drawing fault someone has to go and find. */
      skipped.push({ id: m.Feature_ID, label: m.Label, plotId: m.Plot_ID });
    }
  }

  if (!attached.length) {
    return { error: "No electric meters sit on the trench network \u2014 nothing to route." };
  }

  /* Breadth first, so each node hangs off the shortest route back to the
     substation — which is the route the cable takes. */
  const parent = new Array(nodes.length).fill(-1);
  const parSvc = new Array(nodes.length).fill(false);
  const seen = new Array(nodes.length).fill(false);
  const order = [];
  seen[S] = true;
  const queue = [S];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const e of adj.get(u) || []) {
      if (seen[e.to]) continue;
      seen[e.to] = true;
      parent[e.to] = u;
      parSvc[e.to] = e.svc;
      queue.push(e.to);
    }
  }

  /* Backwards down the visit order, so a node is summed only after
     everything beyond it has been. */
  const cum = meterCount.slice();
  const cumKva = meterKva.slice();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (parent[u] >= 0) {
      cum[parent[u]] += cum[u];
      cumKva[parent[u]] += cumKva[u];
    }
  }

  return { nodes, parent, parSvc, cum, cumKva, meterCount, meterKva, S, order, attached, skipped };
}

export const cablesFor = (meters, perCable = METERS_PER_CABLE) =>
  Math.ceil(Math.max(0, meters) / perCable);

/* ── The runs ──
   The tree turned into cable runs. One entry per run, each a polyline
   with the load it carries and how many cables that needs. */
export function feederSections(features = [], opts = {}) {
  const M = buildFeederModel(features, opts);
  if (M.error) return { error: M.error };

  const perCable = opts.perCable || METERS_PER_CABLE;
  const { nodes, parent, parSvc, cum, cumKva, S } = M;

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  /* A service spur feeds one plot; the feeder does not run along it. */
  const mainsChildren = (u) => (children.get(u) || []).filter((c) => !parSvc[c]);
  const isBreak = (u) => u === S || mainsChildren(u).length !== 1;

  const sections = [];
  const kvaAt = (i) => Math.round((cumKva[i] || 0) * 10) / 10;

  for (let u = 0; u < nodes.length; u++) {
    if (!isBreak(u)) continue;
    for (const first of mainsChildren(u)) {
      if (cum[first] <= 0) continue;

      let cur = first;
      let pts = [nodes[u].slice(), nodes[first].slice()];
      let upNode = u;
      let meters = cum[first];
      let kva = kvaAt(first);
      let cables = cablesFor(cum[first], perCable);

      while (!isBreak(cur)) {
        const mc = mainsChildren(cur);
        if (mc.length !== 1) break;
        const next = mc[0];
        if (cum[next] <= 0) break;

        const nextCables = cablesFor(cum[next], perCable);
        if (nextCables !== cables) {
          /* The count changed, so the run ends here and another starts.
             This is the reason a run can break in the middle of a drawn
             trench with no junction in sight. */
          sections.push({ pts, meters, kva, cables, upNode, endNode: cur });
          pts = [nodes[cur].slice(), nodes[next].slice()];
          upNode = cur;
          meters = cum[next];
          kva = kvaAt(next);
          cables = nextCables;
        } else {
          /* A corner is not an electrical event, so the run carries on
             through it. */
          pts.push(nodes[next].slice());
        }
        cur = next;
      }

      if (pts.length >= 2 && cables > 0) {
        sections.push({ pts, meters, kva, cables, upNode, endNode: cur });
      }
    }
  }

  return {
    sections,
    S,
    totalMeters: cum[S],
    totalKva: Math.round((cumKva[S] || 0) * 10) / 10,
    skipped: M.skipped,
    model: M,
  };
}

/* Where a run branches. These are the points the original marks with a
   junction span node, and they are worth having whether or not anyone
   runs a trace. */
export function junctionNodes(model) {
  const { nodes, parent, parSvc, cum, S } = model;
  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0 || parSvc[i] || cum[i] <= 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  const out = [];
  for (const [node, kids] of children) {
    if (node !== S && kids.length > 1) out.push({ index: node, point: nodes[node], ways: kids.length });
  }
  return out;
}
