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

  for (const f of runs) {
    const ids = (f.Geometry || []).map(intern);
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
