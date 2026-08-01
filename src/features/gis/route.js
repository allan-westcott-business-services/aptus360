/* Routing the incoming supply from the point of connection to the
   substation.

   Shortest path along the trenches, not a straight line: the cable has
   to lie in a dig like everything else, and the distance that matters
   for volt drop and for the bill is the one it actually travels.

   Its own module rather than part of feeder.js. The feeder model exists
   to work out load — it needs meters, it sums kVA back to the source,
   and it refuses to build without either. None of that applies to a
   single run between two fixed points, and asking it to would mean a
   POC could not be routed until the plots were metered. */

import { CONNECT_EPS, SNAP_TOL } from "./feeder.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* What counts as a trench.

   The same test the feeder router uses: the line type's own layer, not a
   flag on the type row. An earlier version of this looked for an
   Is_Trench column that does not exist — the type was found, the flag
   read as undefined, every trench tested false, and the router reported
   "No trenches to route the supply along" on a drawing full of them.

   The fallback on the key is for a type not in the catalogue at all;
   a type that is there is judged by its layer, never by a missing
   field. */
const isTrench = (f, lineTypes = []) => {
  const key = f.Attributes?.Line_Type;
  if (!key) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  return t ? t.Layer_Key === "trench" : String(key).includes("trench");
};

/* The trench network as a graph.

   Points closer than eps are treated as one node, which is what makes
   two trenches drawn to meet actually meet. Same tolerance the feeder
   router uses, so a network it can route is a network this can route —
   a stricter rule here would refuse paths the rest of the app treats as
   perfectly connected. */
export function trenchGraph(features = [], opts = {}) {
  const { lineTypes = [], eps = CONNECT_EPS } = opts;
  const nodes = [];
  const adj = new Map();

  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  const addEdge = (a, b) => {
    if (a === b) return;
    const w = dist(nodes[a], nodes[b]);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, w });
    adj.get(b).push({ to: a, w });
  };

  for (const f of features) {
    if (f.Feature_Type !== "line" || !isTrench(f, lineTypes)) continue;
    const pts = f.Geometry || [];
    for (let i = 0; i + 1 < pts.length; i++) addEdge(intern(pts[i]), intern(pts[i + 1]));
  }
  return { nodes, adj };
}

/* Shortest path by length.

   Dijkstra rather than the breadth-first walk the feeder model uses:
   that treats every edge as one step, which is right when the question
   is "how many hops back to the source" and wrong when it is "which way
   is shorter". A route two long trenches round beats one that crosses
   the site if you count hops, and costs twice as much cable. */
export function shortestPath(graph, from, to) {
  const { nodes, adj } = graph;
  if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length) return null;
  if (from === to) return { path: [from], metres: 0 };

  const best = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  best[from] = 0;

  /* Linear scan for the next nearest rather than a heap. A site's trench
     network is hundreds of nodes, not millions, and a heap here would be
     more code to get wrong than it saves in time. */
  for (;;) {
    let u = -1;
    let bu = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && best[i] < bu) { bu = best[i]; u = i; }
    }
    if (u < 0) break;
    if (u === to) break;
    done[u] = true;
    for (const e of adj.get(u) || []) {
      const alt = best[u] + e.w;
      if (alt < best[e.to]) { best[e.to] = alt; prev[e.to] = u; }
    }
  }

  if (!Number.isFinite(best[to])) return null;

  const path = [];
  for (let u = to; u >= 0; u = prev[u]) {
    path.push(u);
    if (u === from) break;
  }
  path.reverse();
  if (path[0] !== from) return null;
  return { path, metres: Math.round(best[to] * 10) / 10 };
}

/* The run from a POC to the substation, ready to be drawn.

   Both ends are pulled onto the network before routing and put back
   afterwards, so the drawn cable starts exactly at the POC and finishes
   exactly at the substation rather than at the nearest trench vertex to
   each — which would leave a visible gap and, worse, a cable joined to
   neither. */
export function routePocToSubstation(features = [], opts = {}) {
  const { lineTypes = [], tol = SNAP_TOL, layerKey = "electric" } = opts;

  const poc = features.find((f) => f.Feature_Role === "poc" && f.Layer_Key === layerKey
    && (f.Geometry || []).length);
  if (!poc) return { error: "No point of connection placed on this layer yet." };

  const sub = features.find((f) => f.Feature_Role === "substation" && (f.Geometry || []).length);
  if (!sub) return { error: "Place a substation first — the supply routes to it." };

  const graph = trenchGraph(features, { lineTypes });
  if (!graph.nodes.length) return { error: "No trenches to route the supply along." };

  const nearest = (p) => {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      const d = dist(graph.nodes[i], p);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd };
  };

  const a = nearest(poc.Geometry[0]);
  const b = nearest(sub.Geometry[0]);
  if (a.d > tol) return { error: `The POC is ${a.d.toFixed(1)} m from the nearest trench — too far to route from.` };
  if (b.d > tol) return { error: `The substation is ${b.d.toFixed(1)} m from the nearest trench — too far to route to.` };

  const r = shortestPath(graph, a.i, b.i);
  if (!r) {
    return {
      error: "No trench route from the POC to the substation. "
        + "Check the trenches connect — Trench Connectivity will show where the gap is.",
    };
  }

  /* The trench vertices, with the real ends substituted. A route of one
     node means both sit on the same vertex; the run is then just the two
     real points. */
  const mid = r.path.map((i) => [...graph.nodes[i]]);
  const geometry = [poc.Geometry[0], ...mid.slice(1, -1), sub.Geometry[0]];

  /* The tails from each real point to where it joined the network are
     part of the cable, so they are part of the length. */
  const total = geometry.reduce((t, p, i) => (i ? t + dist(geometry[i - 1], p) : 0), 0);

  return {
    poc,
    substation: sub,
    geometry,
    metres: Math.round(total * 10) / 10,
    alongTrench: r.metres,
    nodes: r.path.length,
  };
}
