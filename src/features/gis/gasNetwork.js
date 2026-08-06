/* Laying the gas main.

   The gas equivalent of Build LV Network, and deliberately a much
   smaller thing than that one.

   ── Why it is smaller ──

   An LV feeder has to be designed: load accumulates from the meters
   back to the substation, the number of cables follows from the meter
   count, and a run breaks mid-trench where that count changes. None of
   that applies here. A gas main is one pipe, and where it goes is
   already decided by where the trench was dug — so this is a covering
   problem rather than a sizing one: put pipe along every length of
   mains trench the POC can reach, and stop.

   ── Up to each service trench ──

   The main runs in mains trench only. Where a service trench tees off,
   the main carries straight past it and the spur is left for the
   service pipe — a service feeds one plot and is not something the main
   runs along. Service trenches are therefore left out of the graph
   entirely, which is also what makes the tee read as an ordinary vertex
   the run passes through.

   `breakAtServices` ends a run at every tee instead, so each length
   between service connections is its own pipe. Off by default: on a
   estate of two hundred plots that is two hundred short pipes where the
   ground holds one continuous main, and a schedule of them says less
   than a schedule of the runs between junctions does. It is an option
   rather than a decision because which one is wanted depends on how the
   gas is being costed, and that is not a thing to hard-code.

   ── The same node rule as the feeder ──

   Vertices closer than CONNECT_EPS are one node, and a POC within
   SNAP_TOL of the network is on it. Both are imported rather than
   restated, because a module that agreed with the feeder builder on
   Tuesday and drifted from it on Friday is worse than one that never
   agreed: the two would disagree about whether the same drawing is
   connected, and only one of them would say so. */

import { CONNECT_EPS, SNAP_TOL, isTrenchLine, isServiceLine } from "./feeder.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const lengthOf = (pts = []) => {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += dist(pts[i], pts[i + 1]);
  return t;
};

/* The runs of gas main a drawing calls for.

   Pure: it reads features and returns geometry. Creating anything is
   the canvas's job, which is what lets this be tested against a made-up
   drawing rather than against a project. */
export function gasMainRuns(features = [], opts = {}) {
  const {
    lineTypes = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    breakAtServices = false,
    /* Which POC to build from. The gas one, because a site has an
       electric POC too and they are nowhere near each other. */
    layerKey = "gas",
  } = opts;

  const trenches = features.filter((f) =>
    f.Feature_Type === "line"
    && isTrenchLine(f, lineTypes)
    && (f.Geometry || []).length >= 2);

  const mains = trenches.filter((f) => !isServiceLine(f));
  const services = trenches.filter(isServiceLine);

  if (!mains.length) {
    return { error: "No mains trenches drawn \u2014 there is nothing to lay the main along." };
  }

  const poc = features.find((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length);
  if (!poc) {
    return { error: "Place the gas POC first \u2014 the main is built out from it." };
  }

  /* ── The graph ── */
  const nodes = [];
  const adj = new Map();
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  const addEdge = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };

  const trenchNodes = new Map();
  for (const f of mains) {
    const ids = f.Geometry.map(intern);
    trenchNodes.set(f.Feature_ID, ids);
    for (let i = 0; i + 1 < ids.length; i++) addEdge(ids[i], ids[i + 1]);
  }

  /* ── Where the main starts ── */
  let root = -1;
  let rootGap = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = dist(nodes[i], poc.Geometry[0]);
    if (d < rootGap) { rootGap = d; root = i; }
  }
  if (root < 0 || rootGap > tol) {
    /* With the distance, because "not on the network" is a search and
       "forty-two metres away" is a fix. The POC is placed at the centre
       of the view and snaps to a main, so before any main exists it
       lands wherever the screen happened to be — this is the ordinary
       first-run case, not a fault. */
    return {
      error: `The gas POC is ${Math.round(rootGap)} m from the nearest mains trench.`
        + " Move it onto the trench \u2014 the main is built out from where it sits.",
      pocGap: Math.round(rootGap * 10) / 10,
    };
  }

  /* ── Outward from the POC ──
     Breadth first, so every node hangs off the shortest way back to the
     POC, which is the way the pipe runs. */
  const parent = new Array(nodes.length).fill(-1);
  const seen = new Array(nodes.length).fill(false);
  seen[root] = true;
  const queue = [root];
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u) || []) {
      if (seen[v]) continue;
      seen[v] = true;
      parent[v] = u;
      queue.push(v);
    }
  }

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  const kids = (u) => children.get(u) || [];

  /* ── Where the service trenches meet it ──
     Either end of the spur: which end joins the main depends on which
     way it was drawn. */
  const tees = new Set();
  let servicesOffNetwork = 0;
  for (const sv of services) {
    const g = sv.Geometry;
    let hit = -1;
    let bd = Infinity;
    for (const end of [g[0], g[g.length - 1]]) {
      for (let i = 0; i < nodes.length; i++) {
        const d = dist(nodes[i], end);
        if (d < bd) { bd = d; hit = i; }
      }
    }
    if (hit >= 0 && bd <= eps && seen[hit]) tees.add(hit);
    else servicesOffNetwork += 1;
  }

  /* ── The runs ──
     A run ends where the main divides, where it stops, and — if asked —
     where a service tees off it. A corner is none of those, so the run
     carries on through it. */
  const isBreak = (u) => u === root
    || kids(u).length !== 1
    || (breakAtServices && tees.has(u));

  const runs = [];
  const walk = [root];
  while (walk.length) {
    const u = walk.shift();
    for (const first of kids(u)) {
      let cur = first;
      const pts = [nodes[u].slice(), nodes[first].slice()];
      const passes = tees.has(first) ? 1 : 0;
      let teed = passes;

      while (!isBreak(cur)) {
        const next = kids(cur)[0];
        pts.push(nodes[next].slice());
        if (tees.has(next)) teed += 1;
        cur = next;
      }

      runs.push({
        pts,
        metres: Math.round(lengthOf(pts) * 10) / 10,
        fromNode: u,
        endNode: cur,
        /* How many services come off this length. Not used to size
           anything — there is nothing to size — but it is the number
           somebody counts by hand off the drawing when checking a
           quantity, so it may as well be counted here. */
        services: teed,
      });
      /* Carry on from the far end, so the runs come out in the order
         they leave the POC and G1 is the first length of main. */
      walk.push(cur);
    }
  }

  /* ── What the POC cannot reach ──
     A mains trench in a piece of network joined to nothing gets no pipe,
     and nothing else would say so. Reported by name, since the fix is to
     go and close the gap. */
  const unreachable = [];
  for (const f of mains) {
    const ids = trenchNodes.get(f.Feature_ID) || [];
    if (ids.some((i) => seen[i])) continue;
    unreachable.push({
      id: f.Feature_ID,
      label: f.Label || `Trench ${f.Feature_ID}`,
      metres: Math.round((Number(f.Attributes?.Length_m ?? 0)
        || lengthOf(f.Geometry)) * 10) / 10,
      at: f.Geometry?.[0] ?? null,
    });
  }

  return {
    runs,
    totalM: Math.round(runs.reduce((t, r) => t + r.metres, 0) * 10) / 10,
    poc,
    pocGap: Math.round(rootGap * 10) / 10,
    /* Service trenches the main now runs past, and the ones it does not
       reach — the second is a count rather than a list because
       Trench → Check Service Trenches already names them, and two
       screens naming the same faults differently is how they come to
       disagree. */
    services: tees.size,
    servicesOffNetwork,
    unreachable,
  };
}
