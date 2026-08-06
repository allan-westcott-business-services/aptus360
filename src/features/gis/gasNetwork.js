/* Laying the gas main.

   The gas equivalent of Build LV Network, and deliberately a much
   smaller thing than that one.

   ── Why it is smaller ──

   An LV feeder has to be designed: load accumulates from the meters
   back to the substation, the number of cables follows from the meter
   count, and a run breaks mid-trench where that count changes. None of
   that applies here. A gas main is one pipe, and where it goes is
   already decided by where the trench was dug — so this is a covering
   problem rather than a sizing one.

   ── But not every trench ──

   Not all of it, though: main goes where gas is going. A length of
   trench is worth piping only if something beyond it takes gas, and
   what says so is a service trench running from the main to a gas
   meter. So the demand is counted at each tee and accumulated back
   towards the POC, exactly as the feeder accumulates load, and a branch
   with nothing beyond it gets no pipe.

   That is what stops the main being drawn down the electric-only spur,
   and what makes it stop after the last gas service rather than
   carrying on to the end of the trench somebody drew.

   ── Up to each service trench ──

   The main runs in mains trench only. Where a service trench tees off,
   the main carries straight past it and the spur is left for the
   service pipe — a service feeds one plot and is not something the main
   runs along. Service trenches are therefore left out of the graph
   entirely, which is also what makes the tee read as an ordinary vertex
   the run passes through.

   `breakAtServices` ends a run at every tee instead, so each length
   between service connections is its own pipe. Off by default: on an
   estate of two hundred plots that is two hundred short pipes where the
   ground holds one continuous main, and a schedule of them says less
   than a schedule of the runs between junctions does. It is an option
   rather than a decision because which one is wanted depends on how the
   gas is being costed, and that is not a thing to hard-code.

   ── The same node rule as the feeder ──

   Vertices closer than CONNECT_EPS are one node, and a meter within
   SNAP_TOL of the network is on it. Both are imported rather than
   restated, because a module that agreed with the feeder builder on
   Tuesday and drifted from it on Friday is worse than one that never
   agreed: the two would disagree about whether the same drawing is
   connected, and only one of them would say so.

   ── What is not here ──

   Whether the project should have a gas main at all — a gas design, a
   gas asset value agreement — is a fact about the project rather than
   about the drawing, and is checked by the caller. This module is given
   features and returns geometry, which is what lets it be tested
   against a drawing that no database has ever seen. */

import { CONNECT_EPS, SNAP_TOL, isTrenchLine, isServiceLine } from "./feeder.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const lengthOf = (pts = []) => {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += dist(pts[i], pts[i + 1]);
  return t;
};

/* Point to polyline, so a meter is measured against the whole spur and
   not only against the end somebody happened to draw last. */
function distToLine(p, g = []) {
  let best = Infinity;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (!len2) { best = Math.min(best, dist(p, a)); continue; }
    let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    u = Math.max(0, Math.min(1, u));
    const d = dist(p, [a[0] + vx * u, a[1] + vy * u]);
    if (d < best) best = d;
  }
  return best;
}

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
    /* Which utility this is. The gas POC and gas meters, because a site
       has electric ones too and they are nowhere near each other. */
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
  const order = [];
  seen[root] = true;
  const queue = [root];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const v of adj.get(u) || []) {
      if (seen[v]) continue;
      seen[v] = true;
      parent[v] = u;
      queue.push(v);
    }
  }

  /* ── Which services carry gas to a meter ──

     Meter first, not service first. A service trench is a hole in the
     ground with no utility of its own — the same spur carries the
     electric and the gas — so asking "is this a gas service trench" has
     no answer. Asking which spur a gas meter sits on does.

     Anchored at the plot seed where there is one, as the feeder does:
     the meter glyph is drawn beside its seed rather than on the spur,
     and measuring from the glyph puts every meter a couple of metres
     further out than it is. */
  const seedOf = (m) => {
    const sid = m.Attributes?.Seed_Feature_ID;
    if (sid != null) {
      return features.find((s) => s.Feature_Role === "plot"
        && Number(s.Feature_ID) === Number(sid));
    }
    if (m.Plot_ID == null) return null;
    return features.find((s) => s.Feature_Role === "plot"
      && Number(s.Plot_ID) === Number(m.Plot_ID));
  };

  const meters = features.filter((m) => m.Feature_Role === "meter"
    && m.Layer_Key === layerKey
    && (m.Geometry || []).length);

  /* How many gas meters each service trench carries. */
  const servedBy = new Map();
  const strandedMeters = [];
  for (const m of meters) {
    const seed = seedOf(m);
    const anchor = (seed?.Geometry || []).length ? seed.Geometry[0] : m.Geometry[0];

    let best = null;
    for (const sv of services) {
      /* Measured from both the seed and the glyph, and the better of
         the two taken: a meter whose seed is missing is still a meter,
         and one drawn a little inside the plot boundary should not be
         thrown away for it. */
      const d = Math.min(distToLine(anchor, sv.Geometry), distToLine(m.Geometry[0], sv.Geometry));
      if (!best || d < best.d) best = { d, sv };
    }
    if (best && best.d <= tol) {
      servedBy.set(best.sv.Feature_ID, (servedBy.get(best.sv.Feature_ID) || 0) + 1);
    } else {
      /* Named rather than counted: a gas meter on no service trench is
         a plot that will not get gas, and somebody has to go and look
         at it. */
      strandedMeters.push({
        id: m.Feature_ID,
        label: m.Label || `Meter ${m.Feature_ID}`,
        plotId: m.Plot_ID ?? null,
        at: m.Geometry[0],
      });
    }
  }

  /* ── Where those services meet the main ── */
  const demand = new Array(nodes.length).fill(0);
  const tees = new Set();
  const unattachedServices = [];

  for (const sv of services) {
    const carried = servedBy.get(sv.Feature_ID) || 0;
    if (!carried) continue;                 // carries no gas meter

    const g = sv.Geometry;
    let hit = -1;
    let bd = Infinity;
    for (const end of [g[0], g[g.length - 1]]) {
      for (let i = 0; i < nodes.length; i++) {
        const d = dist(nodes[i], end);
        if (d < bd) { bd = d; hit = i; }
      }
    }

    if (hit >= 0 && bd <= eps && seen[hit]) {
      demand[hit] += carried;
      tees.add(hit);
    } else {
      /* Reaches a meter but not the main. The gas has nowhere to come
         from, and the pipe should not be drawn to a tee that isn't
         there. */
      unattachedServices.push({
        id: sv.Feature_ID,
        label: sv.Label || `Service trench ${sv.Feature_ID}`,
        meters: carried,
        gap: Math.round(bd * 100) / 100,
        at: g[0],
      });
    }
  }

  if (!tees.size) {
    return {
      error: "No gas service trench reaches a gas meter from the mains trench, so"
        + " there is nothing for the main to feed.",
      strandedMeters,
      unattachedServices,
    };
  }

  /* ── What each branch feeds ──
     Backwards down the visit order, so a node is summed only once
     everything beyond it has been. */
  const served = demand.slice();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (parent[u] >= 0) served[parent[u]] += served[u];
  }

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  /* Only the branches with gas beyond them. This is the whole of the
     "where gas services connect" rule: everything else follows from it,
     including the main stopping after the last tee. */
  const kids = (u) => (children.get(u) || []).filter((c) => served[c] > 0);

  /* ── The runs ──
     A run ends where the main divides, where it stops, and — if asked —
     where a service tees off it. A corner is none of those, so the run
     carries on through it. */
  const isBreak = (u) => u === root
    || kids(u).length !== 1
    || (breakAtServices && tees.has(u));

  const runs = [];
  const covered = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = [root];
  while (walk.length) {
    const u = walk.shift();
    for (const first of kids(u)) {
      let cur = first;
      const pts = [nodes[u].slice(), nodes[first].slice()];
      covered.add(edgeKey(u, first));
      let teed = tees.has(first) ? 1 : 0;
      let fed = demand[first];

      while (!isBreak(cur)) {
        const next = kids(cur)[0];
        pts.push(nodes[next].slice());
        covered.add(edgeKey(cur, next));
        if (tees.has(next)) teed += 1;
        fed += demand[next];
        cur = next;
      }

      runs.push({
        pts,
        metres: Math.round(lengthOf(pts) * 10) / 10,
        fromNode: u,
        endNode: cur,
        /* How many services come off this length, and how many meters
           they carry. Not used to size anything — there is nothing to
           size — but it is what somebody counts off the drawing by hand
           when checking a quantity. */
        services: teed,
        meters: fed,
        /* Everything beyond the far end of this run, which is what says
           whether it is the spine or a leg off it. */
        metersBeyond: served[cur],
      });
      /* Carry on from the far end, so the runs come out in the order
         they leave the POC and G1 is the first length of main. */
      walk.push(cur);
    }
  }

  /* ── The trench that gets no pipe, and why ──

     Two different answers, and telling them apart is the point: a
     trench the POC cannot reach is a gap to close, and a trench with no
     gas beyond it is working as intended. Reported by name either way,
     because a build that quietly covers three quarters of a site reads
     as a build that worked. */
  const unreachable = [];
  const unserved = [];
  for (const f of mains) {
    const ids = trenchNodes.get(f.Feature_ID) || [];
    const geom = f.Geometry;

    if (!ids.some((i) => seen[i])) {
      unreachable.push({
        id: f.Feature_ID,
        label: f.Label || `Trench ${f.Feature_ID}`,
        metres: Math.round((Number(f.Attributes?.Length_m ?? 0) || lengthOf(geom)) * 10) / 10,
        at: geom[0] ?? null,
      });
      continue;
    }

    /* Reachable, so measure the part of it no run covers. Per edge
       rather than per feature: one drawn trench often runs past the
       last service and on to the end of the site, and only the tail of
       it is left out. */
    let bare = 0;
    for (let i = 0; i + 1 < ids.length; i++) {
      if (covered.has(edgeKey(ids[i], ids[i + 1]))) continue;
      bare += dist(geom[i], geom[i + 1]);
    }
    if (bare > eps) {
      unserved.push({
        id: f.Feature_ID,
        label: f.Label || `Trench ${f.Feature_ID}`,
        metres: Math.round(bare * 10) / 10,
        at: geom[0] ?? null,
      });
    }
  }

  return {
    runs,
    totalM: Math.round(runs.reduce((t, r) => t + r.metres, 0) * 10) / 10,
    poc,
    pocGap: Math.round(rootGap * 10) / 10,
    /* Tees the main now runs past, and the meters they carry. */
    services: tees.size,
    meters: served[root],
    /* Gas meters on no service trench at all. */
    strandedMeters,
    /* Service trenches that reach a meter but not the main. */
    unattachedServices,
    /* Mains trench with no pipe: not joined to the POC, or nothing
       taking gas beyond it. */
    unreachable,
    unserved,
    unservedM: Math.round(unserved.reduce((t, u) => t + u.metres, 0) * 10) / 10,
  };
}
