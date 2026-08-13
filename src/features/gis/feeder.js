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
import { carries } from "./trenchCarries.js";

export const CONNECT_EPS = 0.5;

/* The cable in force on a feature.

   Two are recorded: what Build LV Network worked out, and what a
   designer overrode it with. `sizeMode` says which the drawing is
   showing, and the trace has to agree \u2014 a volt drop computed on the
   calculated cables while the drawing shows the overrides is a figure
   for a design nobody is looking at.

   Defaults to the system size, which is what this always read. */
export function cableIdOf(feature, mode = "manual") {
  /* The cable that will be pulled, unless somebody asks for the
     build's own answer.

     This defaulted to the calculated size, so a cable set by hand
     appeared on the drawing and in the bill but not in the levels
     report \u2014 the one place the size actually changes the answer. The
     volt drop was worked out on a conductor nobody is laying.

     The override where there is one and the calculated size elsewhere,
     which is the same rule the drawing and the bill follow. Passing
     "system" still gives the build's answer, for comparing the two. */
  const a = feature?.Attributes ?? {};
  if (mode === "system") return a.VD_Cable_Size_ID ?? null;
  return a.Manual_VD_Cable_Size_ID ?? a.VD_Cable_Size_ID ?? null;
}

/* Meters per cable. Above this the run needs another cable beside it,
   which is what makes a run break mid-trench. */
export const METERS_PER_CABLE = 70;

/* How far a seed may sit from the network and still be counted as on it.
   A seed is placed by eye against a plan, so it will not land exactly on
   a trench vertex.

   ── Raised from 8 to 12 ──

   8 m was tight enough that a meter 9.08 m from its service trench —
   the trench stopping about a metre short of the meter it feeds, which
   is a drawing nobody would look at twice — dropped out of the gas
   build and took its plot's load with it. The symptom was a site total
   one meter light, with every other check reporting clear.

   12 m is the figure to argue with if this ever bites the other way.
   The risk of raising it is a meter being claimed by a neighbour's
   spur rather than its own: the builders take the *nearest* service,
   so a wrong assignment needs another trench to be closer still, and
   on a residential layout plots are not four metres apart. On a flatted
   scheme with meters banked together they can be, which is the case to
   watch — a bank of meters all reading as served by one spur is what
   too generous a tolerance looks like.

   Shared by the electric feeder, gas, water, routing and service
   valves, so this moves all five together. That is deliberate: they are
   all answering "is this meter on this network", and five different
   answers to one question is worse than one answer somebody disagrees
   with. */
export const SNAP_TOL = 12;

/* How far past the end of a cable a span node may sit and still be
   reported.

   A cable often stops a few metres short of the trench end, and the
   node marking that end is still the node the design is measured to.
   Ten metres covers that and refuses to adopt a node from elsewhere on
   the site. */
export const SPAN_REACH_M = 10;

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
    /* Only the lengths that will take a cable.

       A dig is not always for everything: water may run as a closed
       loop where electric never would, and routing a feeder round it
       would lay cable in a trench nobody dug for it. Silence still
       means everything, so a drawing made before the flags existed
       routes exactly as it always did.

       LV, because this is the LV feeder model. A length open to HV and
       shut to LV is correctly refused here. */
    if (!carries(f, "electric", "lv")) continue;
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

  /* The branches this circuit actually draws load through.

     The graph is the whole trench network, shared by every circuit, so a
     node where one circuit forks has two mains children in every
     circuit's model — including the circuits that only use one of them.
     Counting those broke a run at a junction it passes straight through:
     circuit A was cut at B1 because circuit B forks there, and came back
     as two cables where the ground holds one.

     Load is what makes a branch part of this circuit. Filtering on it is
     also what junctionNodes already does when placing span nodes, so the
     two now agree about where a run divides — they must, because a
     section end and a span node are meant to be the same place. */
  const loadChildren = (u) => mainsChildren(u).filter((c) => cum[c] > 0);
  const isBreak = (u) => u === S || loadChildren(u).length !== 1;

  const sections = [];
  const kvaAt = (i) => Math.round((cumKva[i] || 0) * 10) / 10;

  for (let u = 0; u < nodes.length; u++) {
    if (!isBreak(u)) continue;
    for (const first of loadChildren(u)) {

      let cur = first;
      let pts = [nodes[u].slice(), nodes[first].slice()];
      let upNode = u;
      let meters = cum[first];
      let kva = kvaAt(first);
      let cables = cablesFor(cum[first], perCable);

      while (!isBreak(cur)) {
        const mc = loadChildren(cur);
        if (mc.length !== 1) break;
        const next = mc[0];

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


/* ── Trench connectivity ──
   Which parts of the trench network are joined to which.

   Cables can only route along trenches that connect back to the
   substation, so a trench drawn a metre short of the one it was meant to
   meet is invisible to the feeder builder — and looks perfectly
   connected on screen at any sensible zoom. This finds those gaps by
   asking a question with an unambiguous answer: how many separate pieces
   is the network in?

   Same node rule as the routing, deliberately. A check that used a
   looser tolerance than the builder would call a network connected that
   the builder then refused to route, which is worse than no check. */
/* ── Connectivity ──
   Which trenches are actually joined to the rest.

   A trench that looks connected on screen but isn't is the single most
   expensive fault on a GIS plan: cables won't route down it, meters
   beyond it drop off the feeder build, and nothing says why. Two ends a
   few centimetres apart read as joined at any sensible zoom.

   So: group the trenches into connected components, name the one holding
   the substation as the network, and report everything else — with the
   size of the gap and where to close it, because "orphaned" without a
   distance is a search rather than a fix. */

export function trenchComponents(features = [], opts = {}) {
  const { lineTypes = [], eps = CONNECT_EPS, mainsOnly = true } = opts;

  const runs = features.filter((f) =>
    f.Feature_Type === "line"
    && isTrench(f, lineTypes)
    && (f.Geometry || []).length >= 2
    /* Service spurs hang off the mains by design, so counting them would
       report every plot as an orphan. */
    && (!mainsOnly || !isService(f)));

  if (!runs.length) return { error: "No trenches drawn yet." };

  /* Vertices, deduplicated by proximity — the same node model the feeder
     build uses, so the two agree about what is connected. */
  const nodes = [];
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };

  const adj = new Map();
  const runNodes = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  /* ── Split where one run meets another part way along ──

     The graph was built from each run's own vertices, so a service
     touching a main between two of them was connected on paper and
     invisible to routing. The comment above serviceTrenchCheck names
     this exactly: "connected on paper and invisible to routing".

     The consequence is a cable that cannot follow its trench, because
     as far as the router is concerned the trench does not reach the
     main \u2014 so it falls back to running straight to the meter. Which is
     what a service cable has been doing.

     The same fault, and the same fix, as the gas build had. */
  const ends = [];
  for (const f of runs) {
    const g = f.Geometry || [];
    if (g.length >= 2) ends.push(g[0], g[g.length - 1]);
  }

  for (const f of runs) {
    const g = f.Geometry || [];
    const cuts = [];
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      if (!len2) continue;
      for (const e of ends) {
        let u = ((e[0] - a[0]) * vx + (e[1] - a[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const q = [a[0] + vx * u, a[1] + vy * u];
        if (dist(e, q) > eps) continue;
        /* A landing already at a vertex needs no cut: it would add a
           node in the same place and an edge of no length. */
        if (dist(q, a) <= eps || dist(q, b) <= eps) continue;
        cuts.push({ seg: i, u, at: q });
      }
    }
    cuts.sort((x, y) => (x.seg - y.seg) || (x.u - y.u));

    const points = [];
    for (let i = 0; i < g.length; i++) {
      points.push(g[i]);
      for (const c of cuts) if (c.seg === i) points.push(c.at);
    }

    const ids = points.map(intern);
    runNodes.set(f.Feature_ID, ids);
    for (let i = 0; i + 1 < ids.length; i++) link(ids[i], ids[i + 1]);
  }

  /* Flood fill from each unvisited node. */
  const comp = new Array(nodes.length).fill(-1);
  let nComp = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const queue = [i];
    comp[i] = nComp;
    while (queue.length) {
      const u = queue.shift();
      for (const v of adj.get(u) || []) {
        if (comp[v] < 0) { comp[v] = nComp; queue.push(v); }
      }
    }
    nComp += 1;
  }

  const groups = Array.from({ length: nComp }, (_, id) => ({
    id, featureIds: [], features: [], nodeIndexes: [], metres: 0,
  }));
  for (const [fid, ids] of runNodes) {
    const g = groups[comp[ids[0]]];
    const f = runs.find((x) => x.Feature_ID === fid);
    const metres = Number(f.Attributes?.Length_m ?? 0) || polylineLength(f.Geometry);
    g.featureIds.push(fid);
    /* The runs themselves, not just their ids. A panel listing an orphan
       has to name its trenches for anyone to go and find them, and a
       list of numbers is not a name. */
    g.features.push({
      id: fid,
      label: f.Label || `Trench ${fid}`,
      lineType: f.Attributes?.Line_Type ?? null,
      metres,
      at: f.Geometry?.[0] ?? null,
    });
    g.metres += metres;
  }
  for (let i = 0; i < nodes.length; i++) groups[comp[i]].nodeIndexes.push(i);

  /* The component holding the substation is the network. Without one, the
     largest by length is the best guess — and saying which assumption was
     made matters, because the answer changes if it is wrong. */
  const sub = features.find((f) => f.Feature_Role === "substation" && (f.Geometry || []).length);
  let rootId = -1;
  let rootBy = "none";
  if (sub) {
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], sub.Geometry[0]);
      if (d < bd) { bd = d; rootId = comp[i]; }
    }
    rootBy = "substation";
  }
  if (rootId < 0 && groups.length) {
    rootId = groups.reduce((best, g) => (g.metres > groups[best].metres ? g.id : best), 0);
    rootBy = "largest";
  }

  /* For each orphan, the closest it comes to the network and where. That
     pair of points is the gap to close. */
  const rootNodes = rootId >= 0 ? groups[rootId].nodeIndexes : [];
  for (const g of groups) {
    if (g.id === rootId || !rootNodes.length) { g.gap = null; continue;
    }
    let best = null;
    for (const a of g.nodeIndexes) {
      for (const b of rootNodes) {
        const d = dist(nodes[a], nodes[b]);
        if (!best || d < best.d) best = { d, from: nodes[a], to: nodes[b] };
      }
    }
    g.gap = best ? { metres: Math.round(best.d * 100) / 100, from: best.from, to: best.to } : null;
  }

  const orphans = groups
    .filter((g) => g.id !== rootId)
    .sort((a, b) => (a.gap?.metres ?? Infinity) - (b.gap?.metres ?? Infinity));

  /* Which piece holds the substation, per group, so a panel doesn't have
     to compare ids to find out. */
  for (const g of groups) g.hasSubstation = g.id === rootId;

  /* The connected piece first: it is the one nobody has to go and find,
     and everything else is measured against it. */
  groups.sort((a, b) => Number(b.hasSubstation) - Number(a.hasSubstation));

  return {
    groups, rootId, rootBy, orphans, nodes,
    connected: rootId >= 0 ? groups.find((g) => g.hasSubstation) ?? null : null,
    totalRuns: runs.length,
    /* Named for what a reader asks: how many pieces, is there a
       substation, and is it actually on the network. The last two are
       different questions — a substation placed beside the trenches
       rather than on them is a common and confusing case. */
    total: groups.length,
    hasSubstation: !!sub,
    substationOnNetwork: rootBy === "substation",
  };
}

function polylineLength(pts = []) {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += dist(pts[i], pts[i + 1]);
  return Math.round(t * 100) / 100;
}


/* ── Service trenches must reach the mains ──
   Every service trench exists to bring one plot onto the network, so one
   that touches no mains trench serves nothing. It is a common fault and
   an invisible one: a spur drawn a metre short reads as connected at any
   sensible zoom, and the feeder router simply finds fewer plots than
   expected without saying which.

   Measured against mains segments, not mains vertices. A service meeting
   a main part way along is physically connected, and a main drawn as two
   points has no vertex in the middle to match — checking vertices alone
   reports every correct tee as a fault.

   But the router builds its graph from vertices, so a service touching a
   main with no node at the meeting point is connected on paper and
   invisible to routing. That is a second, quieter fault, and it gets its
   own list rather than being lumped in with the first. */

const distToSegment = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return dist(p, a);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, [a[0] + t * vx, a[1] + t * vy]);
};

export function serviceTrenchCheck(features = [], opts = {}) {
  const { lineTypes = [], eps = CONNECT_EPS } = opts;

  const trenches = features.filter((f) =>
    f.Feature_Type === "line" && isTrench(f, lineTypes) && (f.Geometry || []).length >= 2);

  const services = trenches.filter(isService);
  const mains = trenches.filter((f) => !isService(f));

  if (!services.length) return { error: "No service trenches drawn yet." };
  if (!mains.length) {
    return { error: "No mains trenches drawn \u2014 every service is unattached by definition." };
  }

  const nearestMain = (pt) => {
    let best = Infinity;
    for (const m of mains) {
      const g = m.Geometry;
      for (let i = 0; i + 1 < g.length; i++) {
        const d = distToSegment(pt, g[i], g[i + 1]);
        if (d < best) best = d;
      }
    }
    return best;
  };

  const nearestMainVertex = (pt) => {
    let best = Infinity;
    for (const m of mains) for (const q of m.Geometry) {
      const d = dist(pt, q);
      if (d < best) best = d;
    }
    return best;
  };

  const orphans = [];
  const noNode = [];

  for (const sv of services) {
    const g = sv.Geometry;
    const ends = [g[0], g[g.length - 1]];
    /* Either end will do: a spur runs from the plot to the main and
       which end is which depends on the direction it was drawn. */
    const gap = Math.min(...ends.map(nearestMain));
    const row = {
      id: sv.Feature_ID,
      label: sv.Label || `Service trench ${sv.Feature_ID}`,
      metres: Number(sv.Attributes?.Length_m ?? 0) || polylineLength(g),
      gap: Math.round(gap * 100) / 100,
      at: g[0],
    };

    if (gap > eps) { orphans.push(row); continue; }
    if (Math.min(...ends.map(nearestMainVertex)) > eps) noNode.push(row);
  }

  orphans.sort((a, b) => a.gap - b.gap);
  return {
    services: services.length,
    mains: mains.length,
    orphans,
    noNode,
    connected: services.length - orphans.length,
  };
}


/* Where a feeder run stops.

   The far end of a branch is the point every volt-drop and loop-impedance
   figure is quoted at, so it wants a span node as much as a junction
   does. The original marks junctions during the build; ends are the other
   half of the same markup.

   A node is an end when nothing carrying load continues past it — which
   is not the same as having no children at all, since a service spur
   hanging off it is not the feeder carrying on. */
export function endOfLineNodes(model) {
  const { nodes, parent, parSvc, cum, S } = model;

  const mainsKids = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0 || parSvc[i] || cum[i] <= 0) continue;
    if (!mainsKids.has(parent[i])) mainsKids.set(parent[i], []);
    mainsKids.get(parent[i]).push(i);
  }

  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    if (i === S) continue;
    if (cum[i] <= 0) continue;
    if (parent[i] < 0) continue;
    /* Reached along a service spur, so it is a plot connection rather
       than the end of the feeder. */
    if (parSvc[i]) continue;
    if ((mainsKids.get(i) || []).length === 0) {
      out.push({ index: i, point: nodes[i], meters: cum[i] });
    }
  }
  return out;
}


/* ── Full trace from a span node ──
   A port of the original's gisTraceSpanNode.

   Built on the feeder model rather than the Connects graph, which
   matters for three reasons the graph cannot give:

     The model is scoped to one circuit's seeds, so a shared trench
     leading to another circuit's plots is pruned out rather than
     reported as part of this one.

     cum[] already holds how many meters lie beyond every node, which is
     the "terminal" figure — everything past the end of a leg. Counting
     that from a graph walk would mean re-walking each subtree.

     And A0 is the substation. The original starts the walk at the
     model's root S when span_seq is 0, not at the node's own position —
     the origin node marks the substation rather than sitting somewhere
     along the network, so tracing "from" it means tracing the circuit.

   A leg runs from the start to the first other span node it meets, or to
   a dead end. Anything beyond that span node belongs to the next leg,
   not this one — which is what makes the result a schedule of spans
   rather than one long list. */

export function spanTrace(features = [], nodeId, opts = {}) {
  /* stopAt decides where a leg ends.

     "spannodes" is the ordinary trace: the design is read between the
     points the cable schedule is written against.

     "junctions" adds every place the network does something — where the
     feeder divides, and where a service leaves it. Same walk, same legs,
     more of them: the figures at a service joint are exactly what the
     leg arriving there already computes, and were simply never reported
     because no leg stopped there. */
  const {
    lineTypes = [], plotById = () => null, stopAt = "spannodes",
    /* Which circuit is being traced, where the caller knows.

       A trace used to take it off the node it starts from. That works
       for an ordinary span node and not for an origin: one origin node
       serves every circuit on the substation, so it carries no
       Circuit_ID at all \u2014 and a levels check starting there was told
       "that span node doesn't belong to a circuit", about the node it
       had just been given and with no way to know which. */
    circuitId: wantedCircuit = null,
  } = opts;

  const node = features.find((f) => Number(f.Feature_ID) === Number(nodeId));
  if (!node || node.Feature_Role !== "spannode") {
    return { error: "Select a span node." };
  }
  const circuitId = wantedCircuit ?? node.Attributes?.Circuit_ID;
  if (circuitId == null) {
    /* Named, so it can be found. A message about "that span node" on a
       drawing with twenty of them is a search, not a fault report. */
    const called = node.Attributes?.Span_Label || node.Label
      || `feature ${node.Feature_ID}`;
    return {
      error: `${called} does not belong to a circuit, and no circuit was `
        + "given to trace. Link it to a circuit, or start from a node that "
        + "is on one.",
    };
  }
  const circuitName = node.Attributes?.Circuit_Name || `Circuit ${circuitId}`;

  /* Only this circuit's plots, so the model prunes branches serving
     someone else's. */
  const seedIds = new Set();
  for (const m of features) {
    if (m.Feature_Role !== "meter" || m.Layer_Key !== "electric") continue;
    if (Number(m.Attributes?.Circuit_ID) !== Number(circuitId)) continue;
    const sid = m.Attributes?.Seed_Feature_ID;
    if (sid != null) { seedIds.add(Number(sid)); continue; }
    const seed = features.find((f) => f.Feature_Role === "plot"
      && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));
    if (seed) seedIds.add(Number(seed.Feature_ID));
  }
  if (!seedIds.size) {
    return { error: `${circuitName} has no metered plots — nothing to trace.` };
  }

  const M = buildFeederModel(features, { lineTypes, plotById, seedIds });
  if (M.error) return { error: M.error };
  const { nodes, parent, parSvc, cum, S } = M;

  const nearest = (p) => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], p);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  /* Sequence zero is the substation itself. */
  const startIdx = Number(node.Attributes?.Span_Seq) === 0
    ? S
    : nearest((node.Geometry || [])[0] || [0, 0]);
  if (startIdx < 0) return { error: "Couldn't locate this node on the circuit." };

  /* Which graph nodes carry a span node on this circuit.

     Worked out before the pruning below, because a span node is a
     reason to keep a branch even where nothing beyond it draws load. */
  const hasSpanNode = new Set();
  /* This circuit's node, or one that names no circuit at all.

     A node is given its circuit when the build routes through it \u2014 and
     a node the build pruned never gets one. So the node at the end of
     the trench was excluded here for having no circuit, having been
     excluded from the routing for having no load: two rules, each
     making the other true, and the node absent from the levels
     entirely.

     A node naming another circuit is still skipped. One naming none is
     wherever it physically sits, and the distance check below is what
     decides whether that is here. */
  for (const sn of features) {
    if (sn.Feature_Role !== "spannode") continue;
    const own = sn.Attributes?.Circuit_ID;
    if (own != null && Number(own) !== Number(circuitId)) continue;
    /* Where it belongs on the dig, not where its marker was dragged. */
    const a = sn.Attributes?.Span_Anchor;
    const at0 = (Array.isArray(a) && a.length === 2 ? a : (sn.Geometry || [])[0])
      || [0, 0];
    const at = nearest(at0);
    if (at < 0) continue;
    /* Bounded, because nearest has no limit of its own: without this a
       node on the far side of the site would keep alive whatever graph
       node happened to be closest to it. A few metres is the gap being
       allowed for \u2014 a cable stopping short of the trench end \u2014 not a
       licence to adopt anything. */
    if (dist(nodes[at], at0) > SPAN_REACH_M) continue;
    hasSpanNode.add(at);
  }

  /* Mains children carrying load. parSvc drops service spurs; cum > 0
     drops branches that lead nowhere for this circuit.

     ── Except a branch ending at a span node ──

     A node at the end of a trench with no meter beyond it carries no
     load, so the pruning dropped it and no leg ever stopped there. The
     report then ran the previous node straight to the meter and the
     span node was missing from the levels entirely \u2014 which is what
     "A16 → Electric Meter 62" was, with A23 nowhere in it.

     A span node is a measuring point, not a customer. It is worth
     reporting precisely because somebody placed it, and the cable
     stopping a few metres short of it does not make it disappear. The
     level shown is the level at the end of the cable, since that is
     where the cable ends: no drop is invented for pipe that was never
     laid. */
  const kids = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0 || parSvc[i]) continue;
    if (cum[i] <= 0 && !hasSpanNode.has(i)) continue;
    if (!kids.has(parent[i])) kids.set(parent[i], []);
    kids.get(parent[i]).push(i);
  }

  /* Every other span node on this circuit, by the graph node it sits on —
     these are where legs stop. */
  const stops = new Map();
  for (const sn of features) {
    if (sn.Feature_Role !== "spannode") continue;
    if (Number(sn.Feature_ID) === Number(nodeId)) continue;
    /* This utility's nodes only.

       A gas POC placed near the substation gets its own origin node,
       G0, at very nearly the same point. Every node with sequence zero
       was taken as the origin regardless of which layer it belonged
       to, so an electric trace reported its first leg as leaving G0 \u2014
       the gas network's origin, on an electric circuit.

       The node's own layer settles it. Nodes drawn before layers were
       recorded have none, and those are still accepted: excluding them
       would empty the report on an older drawing. */
    if (sn.Layer_Key && sn.Layer_Key !== "electric"
      && sn.Layer_Key !== "trench") continue;
    /* Same rule as above: this circuit's, or one that names none. */
    const own = sn.Attributes?.Circuit_ID;
    if (own != null && Number(own) !== Number(circuitId)) continue;
    /* From the anchor, so a marker dragged clear still resolves to the
       point on the dig it was placed at. */
    const a = sn.Attributes?.Span_Anchor;
    const at = (Array.isArray(a) && a.length === 2 ? a : (sn.Geometry || [])[0])
      || [0, 0];
    const idx = Number(sn.Attributes?.Span_Seq) === 0 ? S : nearest(at);
    if (idx < 0) continue;
    /* A node naming no circuit has to be near this one to belong to it
       \u2014 otherwise every unassigned node on the site would appear in
       every circuit's report. */
    if (own == null && dist(nodes[idx], at) > SPAN_REACH_M) continue;
    stops.set(idx, sn);
  }

  /* And every junction, when asked for.

     A fork is a node with more than one loaded mains child; a service
     tee is one with a service spur carrying load. Both are already known
     to the model — the same tests the joint placement uses, so a stop
     appears exactly where a joint was drawn and the two cannot disagree
     about where the network divides.

     Named from the joint standing there where there is one, so the row
     reads as the thing on the drawing rather than as a coordinate. */
  /* Where a plot's service leaves the main — the point a meter is
     attributed to. Declared here because metersAt below needs it, and
     metersAt has to come before the junction stops that name themselves
     after the plots they feed. */
  const serviceFootFor = (seedId) => {
    const svc = features.find((t) =>
      t.Feature_Type === "line"
      && isService(t)
      && Number(t.Attributes?.Seed_Feature_ID) === Number(seedId)
      && (t.Geometry || []).length);
    return svc ? svc.Geometry[0] : null;
  };

  /* Which meters each node serves.

     Built before the junction stops rather than after, because a service
     joint is named for the plots it feeds and cannot be named without
     this. */
  const metersAt = new Map();
  for (const m of features) {
    if (m.Feature_Role !== "meter" || m.Layer_Key !== "electric") continue;
    if (Number(m.Attributes?.Circuit_ID) !== Number(circuitId)) continue;
    const sid = m.Attributes?.Seed_Feature_ID;
    const seed = sid != null
      ? features.find((f) => f.Feature_Role === "plot" && Number(f.Feature_ID) === Number(sid))
      : features.find((f) => f.Feature_Role === "plot"
          && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));

    const anchor = (seed ? serviceFootFor(seed.Feature_ID) : null)
      || (seed?.Geometry || [])[0]
      || (m.Geometry || [])[0];
    if (!anchor) continue;
    const idx = nearest(anchor);
    if (idx < 0) continue;
    if (!metersAt.has(idx)) metersAt.set(idx, []);
    metersAt.get(idx).push(m);
  }

  if (stopAt === "junctions") {
    /* Which span node sits on which graph node, and what cable it
       carries — so a junction can inherit from the run it is part of. */
    const spanCable = new Map();
    for (const [idx, sn] of stops) {
      const c = sn.Attributes?.VD_Cable_Size_ID;
      if (c != null) spanCable.set(idx, c);
    }

    const svcKids = new Map();
    const mainsKids = new Map();
    for (let i = 0; i < nodes.length; i++) {
      if (parent[i] < 0 || cum[i] <= 0) continue;
      const m = parSvc[i] ? svcKids : mainsKids;
      m.set(parent[i], (m.get(parent[i]) || 0) + 1);
    }

    const jointAt = (p) => features.find((f) =>
      f.Feature_Role === "joint"
      && (f.Geometry || []).length
      && dist(f.Geometry[0], p) <= CONNECT_EPS);

    for (let u = 0; u < nodes.length; u++) {
      if (u === startIdx || stops.has(u)) continue;
      if (cum[u] <= 0) continue;
      const forks = (mainsKids.get(u) || 0) > 1;
      const tees = (svcKids.get(u) || 0) > 0;
      if (!forks && !tees) continue;

      const j = jointAt(nodes[u]);
      const kind = j?.Attributes?.Joint_Type
        ?? (forks && tees ? "breech" : forks ? "breech" : "service");

      /* The plots this joint feeds.

         "Service joint" says what it is and nothing about which one, and
         a table of eleven identical rows cannot be read against a
         drawing. The plot numbers are what someone checking a schedule
         is looking for.

         Gathered from the spur below the tee rather than from the tee
         itself: a meter sits at the far end of its service, so the node
         with the joint on it holds none. Only down service spurs — the
         mains beyond a fork leads to every plot on that branch, and
         listing them all would name the whole estate at the first
         junction. */
      const fed = [];
      for (let k = 0; k < nodes.length; k++) {
        if (parent[k] !== u || !parSvc[k]) continue;
        const walk = [k];
        const been = new Set([k]);
        while (walk.length) {
          const v = walk.shift();
          for (const m of metersAt.get(v) || []) fed.push(m);
          for (let w = 0; w < nodes.length; w++) {
            if (parent[w] !== v || been.has(w)) continue;
            been.add(w);
            walk.push(w);
          }
        }
      }
      /* Also any sitting on the joint itself, for a service drawn with
         its meter at the tee. */
      for (const m of metersAt.get(u) || []) fed.push(m);

      /* The plot number, not the meter's label.

         A meter is called "Electric Meter 15" on this drawing, so
         reading the number off its label happens to work here and would
         stop working the moment anyone renamed one. The plot record
         carries the number as a fact; the label is only a description of
         it.

         The label is still the fallback, for a meter whose plot has not
         loaded — a number taken from a name beats no number at all. */
      const numberOf = (m) => {
        const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
        const n = plot?.plot_number ?? plot?.Plot_Number;
        if (n != null && String(n) !== "") return String(n);
        const fromLabel = String(m.Label || "").match(/(\d+)\s*$/);
        return fromLabel ? fromLabel[1] : null;
      };

      const plots = [...new Set(fed.map(numberOf).filter(Boolean))]
        .sort((x, y) => {
          const nx = Number(String(x).replace(/\D/g, ""));
          const ny = Number(String(y).replace(/\D/g, ""));
          return Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny
            ? nx - ny : String(x).localeCompare(String(y));
        });

      /* The cable this junction sits on.

         A junction is a point along a run, not the end of one, so it
         carries no cable of its own — the run's cable is recorded at the
         span node the run feeds. Inherited from the nearest span node
         below it, so the sum charges this stretch at the right size
         instead of leaving it uncharged and the column reading "not
         set".

         Without it the figures at a junction were the figures at the
         span node before it: the length between them was accumulated and
         never applied, because the sum only settles where it finds a
         cable. */
      let heir = null;
      const seek = [u];
      const seen = new Set([u]);
      while (seek.length && !heir) {
        const v = seek.shift();
        for (const k of kids.get(v) || []) {
          if (seen.has(k)) continue;
          seen.add(k);
          const sn = spanCable.get(k);
          if (sn != null) { heir = sn; break; }
          seek.push(k);
        }
      }

      stops.set(u, {
        Feature_ID: j?.Feature_ID ?? `j${u}`,
        Feature_Role: "joint",
        Attributes: {
          /* "Plot 7" for one, "Plots 7, 8" for several — the word once
             and pluralised, then the numbers. */
          Span_Label: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} joint`
            + (plots.length
              ? ` \u2014 Plot${plots.length === 1 ? "" : "s"} ${plots.join(", ")}`
              : ""),
          Serves_Plots: plots,
          Circuit_ID: circuitId,
          VD_Cable_Size_ID: heir,
        },
        Geometry: [nodes[u]],
      });
    }
  }

  /* This circuit's meters, at the node where their load joins the mains.

     Which is the foot of the service trench, not the plot seed. A seed
     sits at the dwelling, so the nearest graph node to it is the far end
     of its own service spur — and the walk deliberately skips service
     spurs, so a meter anchored there is never passed and counts as
     distribution on no leg at all.

     The service trench runs foot to seed, so its first point is where it
     meets the mains. That node is on the walked route, which is what
     makes the meter countable. The seed is the fallback for a plot with
     no service trench drawn, and the meter itself the last resort. */
  const legs = [];

  /* A leg runs from one span node to the next, and the walk carries on
     past that node rather than stopping there.

     The original stops: each leg is span to span and anything further
     belongs to "the next leg", which means a trace from the origin
     reports one row and you walk the network a node at a time. Since
     this is called Full Trace, it reports the whole schedule — every
     span-to-span leg downstream, in every direction, in one table.

     Each leg carries its own from and to, so the reading is a route
     rather than a list of things measured from the same place. */
  const labelOf = (i) => {
    const f = stops.get(i);
    return f?.Attributes?.Span_Label ?? f?.Label ?? `#${f?.Feature_ID ?? i}`;
  };

  const walk = (prev, cur, metres, along, path, fromLabel) => {
    const len = metres + dist(nodes[prev], nodes[cur]);
    const here = metersAt.get(cur) || [];
    const trail = [...path, cur];

    if (stops.has(cur)) {
      legs.push({
        from: fromLabel,
        to: labelOf(cur),
        stopId: stops.get(cur).Feature_ID,
        metres: Math.round(len * 10) / 10,
        /* The graph node this leg ends at, so volt drop can be totalled
           to exactly this point. */
        endIdx: cur,
        /* And where it began, so the voltage arriving at this length of
           cable can be shown as well as the voltage leaving it. */
        fromIdx: trail[0],
        /* The cable this leg is made of, carried on the leg rather than
           looked up from spanNodes — a junction is not in that list, on
           purpose, so a lookup would find nothing and the column would
           read "not set" on every junction row. */
        cableSizeId: cableIdOf(stops.get(cur)),
        /* Meters picked up along the way — the load this length of cable
           carries directly. */
        distribution: along.length,
        /* Everything beyond the far end, which is what decides the cable
           into it. */
        terminal: cum[cur] || 0,
        meters: along,
        path: trail.map((i) => nodes[i]),
      });
      /* Carry on from here, as a new leg: the length and the meters
         picked up start again from this node. */
      for (const k of kids.get(cur) || []) {
        walk(cur, k, 0, [], [cur], labelOf(cur));
      }
      return;
    }

    const next = kids.get(cur) || [];
    if (!next.length) {
      legs.push({
        from: fromLabel,
        to: here.length
          ? here.map((m) => m.Label || `Meter ${m.Feature_ID}`).join(", ")
          : null,
        stopId: null,
        metres: Math.round(len * 10) / 10,
        endIdx: cur,
        fromIdx: trail[0],
        distribution: along.length,
        terminal: here.length,
        meters: [...along, ...here],
        path: trail.map((i) => nodes[i]),
      });
      return;
    }
    for (const k of next) walk(cur, k, len, [...along, ...here], trail, fromLabel);
  };

  const branches = kids.get(startIdx) || [];
  if (!branches.length) {
    return {
      error: `No circuit cable runs downstream of `
        + `${node.Attributes?.Span_Label ?? "this node"} on ${circuitName}.`,
    };
  }
  const startLabel = node.Attributes?.Span_Label ?? node.Label ?? `#${nodeId}`;
  for (const b of branches) walk(startIdx, b, 0, [], [startIdx], startLabel);

  return {
    from: node.Attributes?.Span_Label ?? node.Label ?? `#${nodeId}`,
    circuitName,
    legs,
    /* Handed back so volt drop can be worked out per leg without
       rebuilding the model or re-matching span nodes to graph nodes. */
    model: M,
    /* Where the volt drop sum settles a length of cable.

       Real span nodes only, even when legs stop at junctions too.

       This is the difference between reporting a figure at a point and
       recomputing the design around it. legVoltDrop weights load by
       where a segment ends — tapped load counts at half, load at the end
       at full — and the unbalanced correction is 1 + k/√customers, which
       grows sharply as a segment carries fewer of them. Settling at
       every service tee therefore turns distributed load into terminal
       load and drops the customer count per segment to a handful,
       inflating the answer at both ends.

       An earlier version added the junctions here and the advanced check
       duly reported failures the ordinary one did not — not because it
       looked more closely, but because it was computing a different
       sum. The junctions are stops for the table and nothing more; the
       arithmetic is identical to the ordinary check. */
    spanNodes: [...stops]
      .filter(([, f]) => f.Feature_Role === "spannode")
      .map(([index, f]) => ({
        index,
        feature: f,
        cableSizeId: cableIdOf(f),
      })).concat([{
      index: startIdx, feature: node,
      cableSizeId: cableIdOf(node),
    }]),
    totalMetres: Math.round(legs.reduce((t, l) => t + l.metres, 0) * 10) / 10,
    totalMeters: cum[startIdx] || 0,
  };
}


/* Numbering span nodes in the order someone would walk them.

   They were numbered as the graph happened to produce them, which is
   index order and means nothing on a drawing: A2 next to the substation,
   A5 beyond it, A15 on a short spur and A14 at the far end.

   The order that reads is a walk outward from the substation, taking the
   nearest branch first and following it to its end before coming back
   for the next. So the node closest to the substation is 1, everything
   fed from it is numbered before anything on another branch, and a
   schedule reads down the network rather than jumping about it.

   Depth first rather than by distance alone: distance ordering would
   interleave two branches, so a node and the things it feeds could end
   up numbered either side of a node somewhere else entirely. */
export function orderNodesFromRoot(model, indexes = []) {
  const { nodes, parent, parSvc, cum, S } = model;
  const want = new Set(indexes.map(Number));

  const kids = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0 || parSvc[i] || cum[i] <= 0) continue;
    if (!kids.has(parent[i])) kids.set(parent[i], []);
    kids.get(parent[i]).push(i);
  }

  /* How far along each branch the next marked node actually is.

     Ordering by the first segment's length was wrong, and wrong in a way
     that looked almost right: a branch beginning with a short segment
     but running 130 m before its first node beat one whose first segment
     was long but reached a node after 7 m. What matters is the distance
     to the next node, not to the next corner.

     Measured down the tree once, so a junction can sort its branches by
     what is actually beyond them. */
  const reach = new Array(nodes.length).fill(Infinity);
  const order = [];
  const seenR = new Set();
  const stack = [S];
  while (stack.length) {
    const u = stack.pop();
    if (seenR.has(u)) continue;
    seenR.add(u);
    order.push(u);
    for (const k of kids.get(u) || []) stack.push(k);
  }
  /* Backwards down the visit order, so a node is answered only after
     everything beyond it has been. */
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (want.has(u) && u !== S) { reach[u] = 0; continue; }
    let best = Infinity;
    for (const k of kids.get(u) || []) {
      const d = reach[k] + dist(nodes[u], nodes[k]);
      if (d < best) best = d;
    }
    reach[u] = best;
  }

  const nearestFirst = (from) => (kids.get(from) || [])
    .slice()
    .sort((a, b) => {
      const da = reach[a] + dist(nodes[from], nodes[a]);
      const db = reach[b] + dist(nodes[from], nodes[b]);
      if (da !== db) return da - db;
      /* Neither branch has a node on it, or they are equidistant: fall
         back to the nearer corner so the order is at least stable. */
      return dist(nodes[from], nodes[a]) - dist(nodes[from], nodes[b]);
    });

  const out = [];
  const seen = new Set();
  const walk = (u) => {
    if (seen.has(u)) return;
    seen.add(u);
    if (want.has(u) && u !== S) out.push(u);
    for (const k of nearestFirst(u)) walk(k);
  };
  walk(S);

  /* Anything the walk could not reach — a node on a branch carrying no
     load, or off the network entirely. Numbered last rather than
     dropped: it exists on the drawing and needs a label. */
  for (const i of indexes) {
    const n = Number(i);
    /* The substation is never numbered — it is where the numbering
       starts from, and A0 already marks it. */
    if (n !== S && !out.includes(n)) out.push(n);
  }
  return out;
}

/* Shared with the gas builder, under names that say which is which.

   Exported rather than copied: what counts as a trench, and what counts
   as a service, has to be one answer. Two modules that decided it
   separately would agree until somebody added a line type, and then
   disagree about a drawing without either of them saying so. */
export { isTrench as isTrenchLine, isService as isServiceLine };
