/* Electric network: POC, substation, circuits.

   Ported from the original's gisSetPocOutput, gisSetSubAttr,
   gisLinkCircuitFinish and gisAutoAssignCircuitWay.

   The shape of it, as the original has it:

     A POC is where the network connects to the DNO's. One per utility,
     carrying an agreed output — kVA for electric, kW for gas, litres a
     second for water.

     A substation sits on the site and is always electric. Circuits feed
     back to it, and it connects on to the POC. It has a number of LV
     ways, each protected by a fuse, and each way takes one circuit.

     A circuit is a group of plots. It is defined by drawing round their
     seeds; membership is recorded on each plot's electric meter rather
     than in a table of its own, which is what lets a plot be moved
     between circuits without anything else being rebuilt.

   Everything here is pure so it can be tested. Placing the features and
   writing them is the canvas's job. */

export const POC_UNITS = { electric: "kVA", gas: "kW", water: "l/s" };
export const pocUnit = (layerKey) => POC_UNITS[layerKey] || "kVA";

/* Substation defaults, matching the original's fallbacks. */
export const SUB_DEFAULTS = { Ways: 4, Way_Fuse_A: 400, Output_V: 400 };

/* A, B … Z, then AA. Circuits are referred to by letter on the drawing
   and by number in the schedule, and the two have to agree. */
export function circuitLetter(circuitId) {
  if (circuitId == null) return "";
  let n = Number(circuitId);
  if (!Number.isFinite(n) || n < 1) return "";
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* The lowest number not already in use, so deleting circuit 2 of 3 frees
   the number rather than leaving a gap that grows for ever. */
export function nextCircuitId(features = []) {
  const used = new Set();
  for (const f of features) {
    const id = f.Attributes?.Circuit_ID;
    if (id != null) used.add(Number(id));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/* Plots the circuit will serve: seeds inside the drawn ring that have an
   electric meter. A seed without one isn't on the electric network yet,
   and silently including it would give the circuit a plot it can't
   actually feed. */
export function metredSeedsInside(features, ring, inside) {
  const seeds = features.filter((f) =>
    f.Feature_Role === "plot" && (f.Geometry || []).length
    && inside(f.Geometry[0], ring));
  return seeds.filter((s) => features.some((m) =>
    m.Feature_Role === "meter"
    && m.Layer_Key === "electric"
    && meterBelongsTo(m, s)));
}

/* A meter belongs to a seed by plot first, and by the seed link Auto
   Service writes as a fallback for a seed with no plot behind it. */
export function meterBelongsTo(meter, seed) {
  if (seed.Plot_ID != null && meter.Plot_ID != null) {
    return Number(meter.Plot_ID) === Number(seed.Plot_ID);
  }
  return Number(meter.Attributes?.Seed_Feature_ID) === Number(seed.Feature_ID);
}

export function metersOfSeeds(features, seeds) {
  return features.filter((m) =>
    m.Feature_Role === "meter"
    && m.Layer_Key === "electric"
    && seeds.some((s) => meterBelongsTo(m, s)));
}

/* Circuit load. Reads the plot's KVA_Load where there is one, and falls
   back to a per-plot assumption otherwise — a circuit with no load
   figure can't be checked against a fuse, and reporting zero would say
   every way is fine. */
export function circuitKva(meters, plotById, fallbackKva = 0) {
  let total = 0;
  for (const m of meters) {
    const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
    const kva = plot?.kva_load ?? plot?.KVA_Load;
    total += kva != null && kva !== "" ? Number(kva) : fallbackKva;
  }
  return Math.round(total * 100) / 100;
}

/* Amps drawn by a three-phase load at the substation's output voltage.
   The original's formula, kept because the fuse comparison depends on
   it: I = kVA·1000 / (√3 · V). */
export function ampsFor(kva, outputV = SUB_DEFAULTS.Output_V) {
  const v = Number(outputV) || 0;
  if (!v) return 0;
  return (Number(kva) || 0) * 1000 / (Math.sqrt(3) * v);
}

/* Put a circuit on a free LV way, or report that there isn't one.

   Already-assigned circuits keep their way, so re-running doesn't
   shuffle the schedule. Returns the way and whether the load exceeds the
   fuse — over is a warning, not a refusal: the drawing should show what
   was asked for so it can be argued about, rather than quietly refusing
   to record it. */
export function assignWay(substation, circuitId, kva) {
  const A = substation?.Attributes || {};
  const ways = A.Ways != null ? Number(A.Ways) : SUB_DEFAULTS.Ways;
  const fuse = A.Way_Fuse_A != null ? Number(A.Way_Fuse_A) : SUB_DEFAULTS.Way_Fuse_A;
  const outV = A.Output_V != null ? Number(A.Output_V) : SUB_DEFAULTS.Output_V;
  const map = { ...(A.Way_Circuits || {}) };

  let way = null;
  for (const k of Object.keys(map)) {
    if (Number(map[k]) === Number(circuitId)) { way = Number(k); break; }
  }
  let changed = false;
  if (way == null) {
    for (let w = 1; w <= ways; w++) {
      if (map[w] == null) { way = w; map[w] = Number(circuitId); changed = true; break; }
    }
  }
  if (way == null) return { way: null, full: true, ways, fuse, amps: 0, over: false, map, changed: false };

  const amps = Math.round(ampsFor(kva, outV));
  return { way, full: false, ways, fuse, amps, over: fuse > 0 && amps > fuse, map, changed };
}

/* Free the ways a deleted circuit held, so its number and its way both
   come back into use. */
/* Moving a circuit from one way to another.

   Swapping rather than overwriting where the target is taken: a board
   has a fixed number of ways, so putting one circuit on an occupied way
   has to do something with the one already there, and dropping it would
   leave a circuit fed by nothing. A swap is the only answer that loses
   nothing and needs no further decision.

   Keys are normalised to strings on the way out, because a map read back
   from jsonb has string keys and one built here would otherwise have
   numbers — and a way keyed both ways at once appears twice on the
   board. */
export function moveCircuitToWay(wayCircuits = {}, circuitId, toWay) {
  const map = {};
  for (const [k, v] of Object.entries(wayCircuits || {})) map[String(k)] = v;

  const to = String(toWay);
  const from = Object.keys(map).find((k) => Number(map[k]) === Number(circuitId));
  if (from == null) return { map, changed: false };
  if (from === to) return { map, changed: false };

  const displaced = map[to];
  map[to] = Number(circuitId);
  if (displaced != null) map[from] = Number(displaced);
  else delete map[from];

  return { map, changed: true };
}

/* Closing the gaps: circuits onto the lowest ways, spares at the end.

   A board with a spare way in the middle is not wrong, but it reads as
   though something is missing, and it makes the next allocation a
   decision rather than a habit. Compacting puts the circuits on ways
   one, two, three and leaves the spares together at the bottom.

   Order is preserved — the circuit on the lowest way stays lowest — so
   the board someone knows is the board they get back, with the holes
   taken out rather than rearranged. */
export function compactWays(wayCircuits = {}) {
  const taken = Object.entries(wayCircuits || {})
    .filter(([, cid]) => cid != null)
    .sort((a2, b2) => Number(a2[0]) - Number(b2[0]))
    .map(([, cid]) => Number(cid));

  const map = {};
  taken.forEach((cid, i) => { map[String(i + 1)] = cid; });

  const before = Object.entries(wayCircuits || {})
    .filter(([, cid]) => cid != null)
    .map(([w, cid]) => `${w}:${cid}`).sort().join();
  const after = Object.entries(map).map(([w, cid]) => `${w}:${cid}`).sort().join();

  return { map, changed: before !== after };
}

export function releaseWays(substation, circuitId) {
  const map = { ...(substation?.Attributes?.Way_Circuits || {}) };
  let changed = false;
  for (const k of Object.keys(map)) {
    if (Number(map[k]) === Number(circuitId)) { delete map[k]; changed = true; }
  }
  return { map, changed };
}

/* Every circuit currently defined, gathered from meter membership —
   the same way the original rebuilds them, so there is no separate list
   to fall out of step. */
export function circuitsFrom(features = []) {
  const out = new Map();
  for (const m of features) {
    if (m.Feature_Role !== "meter" || m.Layer_Key !== "electric") continue;
    const id = m.Attributes?.Circuit_ID;
    if (id == null) continue;
    const key = Number(id);
    if (!out.has(key)) {
      out.set(key, {
        id: key,
        name: m.Attributes.Circuit_Name || `Circuit ${key}`,
        letter: m.Attributes.Circuit_Letter || circuitLetter(key),
        meters: [],
      });
    }
    out.get(key).meters.push(m);
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}


/* ── Span nodes ──
   Numbered points along a circuit. Seq 0 sits on the substation and is
   the origin every other point on that circuit is measured from — A0,
   B0, and so on. The original creates it as part of defining a circuit,
   in gisEnsureCircuitOriginNode. */

export const spanLabel = (letter, seq) => `${letter}${seq}`;

export function originNodeFor(features, circuitId) {
  const nodes = features.filter((f) => f.Feature_Role === "spannode"
    && Number(f.Attributes?.Span_Seq) === 0);

  /* One node on the substation, shared by every circuit.

     Requiring a matching Circuit_ID meant a site needed one origin per
     circuit, all stacked on the same spot. They are the same point on
     the ground \u2014 the substation the whole network is measured from \u2014
     and four copies of it is four things to keep in step for no gain.

     A node naming this circuit still wins where one exists, so a
     drawing that already has them keeps working. Otherwise the one
     that names no circuit is the origin for all of them. */
  return nodes.find((f) =>
    Number(f.Attributes?.Circuit_ID) === Number(circuitId))
    ?? nodes.find((f) => f.Attributes?.Circuit_ID == null)
    ?? null;
}

/* ── Full trace from here ──
   A port of gisFullCircuitTrace, adapted to the graph this app already
   has. The original walks a geometric node graph built by gisFeederModel;
   here the graph is the Connects attribute that network tracing already
   maintains, so a trace can't disagree with what tracing shows.

   Direction comes from the substation: everything is measured outwards
   from it, so "downstream" means further from the substation, which is
   the only definition that makes a leg length mean anything.

   A leg runs from the starting node to the next span node, or to a dead
   end. That is the unit an LV design is checked in — each span of cable
   between two points, with the meters hanging off it. */

const idsOf = (f) => (Array.isArray(f.Attributes?.Connects) ? f.Attributes.Connects.map(Number) : []);

/* Two points this close are the same place. The same tolerance the
   drawing uses to decide what touches what, so the trace and the canvas
   agree. */
const CONNECT_M = 0.25;

export function buildGraph(features = []) {
  const byId = new Map(features.map((f) => [Number(f.Feature_ID), f]));
  const adj = new Map();
  const link = (a, b) => {
    if (!byId.has(a) || !byId.has(b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  for (const f of features) {
    const a = Number(f.Feature_ID);
    for (const b of idsOf(f)) { link(a, b); link(b, a); }
  }

  /* And by geometry, where nothing says Connects.

     Connects is written when somebody draws a feature onto another. A
     built network is not drawn that way \u2014 the routing lays cables from
     a graph of its own and never fills it in \u2014 so on a generated
     drawing this graph had no edges at all, and every distance from the
     substation came back null. Which is what the report showed: a
     column of dashes.

     Ends touching within the same tolerance the canvas uses, so the two
     agree about what is joined. Added rather than replacing Connects:
     a hand-drawn link is a statement, and geometry is what to fall back
     on where none was made. */
  const endsOf = (f) => {
    const g = f.Geometry || [];
    if (!g.length) return [];
    return g.length === 1 ? [g[0]] : [g[0], g[g.length - 1]];
  };
  /* Two tolerances, because two different things are being asked.

     Cable to cable is a joint: they either meet or they do not, and
     CONNECT_M is the tolerance the canvas uses to decide that.

     A meter to the cable serving it is not a joint. The meter is a box
     on a wall and the cable ends at the plot boundary, so they are
     metres apart on every drawing ever made \u2014 and at a quarter of a
     metre the meter was joined to nothing, which is why every distance
     came back as a dash.

     METER_REACH_M is the same figure the rest of the electric model
     uses for a meter and its service. */
  const METER_REACH_M = 12;
  const isPoint = (f) => (f.Geometry || []).length === 1;
  const reachFor = (a, b) => (isPoint(a) || isPoint(b) ? METER_REACH_M : CONNECT_M);
  const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r;

  const gapBetween = (fa, fb) => {
    const ea = endsOf(fa);
    const eb = endsOf(fb);
    let best = Infinity;
    for (const p of ea) {
      for (const q of eb) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best) best = d;
      }
    }
    return best;
  };

  /* Lines join whatever they touch. */
  for (let i = 0; i < features.length; i++) {
    const fa = features[i];
    if (isPoint(fa) || !endsOf(fa).length) continue;
    for (let j = i + 1; j < features.length; j++) {
      const fb = features[j];
      if (isPoint(fb) || !endsOf(fb).length) continue;
      if (gapBetween(fa, fb) > CONNECT_M) continue;
      const a = Number(fa.Feature_ID);
      const b = Number(fb.Feature_ID);
      link(a, b);
      link(b, a);
    }
  }

  /* A point joins the one line nearest it, and no other.

     A meter within reach of several was linked to all of them, so the
     walk took whichever gave the shortest route \u2014 usually straight to
     the main, skipping the service cable that actually feeds it. Two
     plots off the same length of main then reported the same distance
     however far apart their services were, which is exactly what a
     drawing showing 6.3 m between them did not say.

     Nearest only. A meter is served by one cable, and which one is not
     a matter of opinion: it is the one it sits on the end of. */
  for (const f of features) {
    if (!isPoint(f) || !endsOf(f).length) continue;
    /* Meters only.

       A substation is a point too, and it feeds every cable leaving it
       \u2014 limiting it to one made the whole network hang off a single
       run, and the walk then reached everything the long way round.
       A meter is served by one cable; plant is not. */
    if (f.Feature_Role !== "meter") {
      for (const g of features) {
        if (g === f || isPoint(g) || !endsOf(g).length) continue;
        /* Exactly on it, as a cable leaving a substation should be.

           A meter is allowed to sit metres from its service because a
           meter is a box on a wall. A feeder is not: it starts at the
           substation, and a gap there is a drawing that has not been
           joined up rather than a tolerance to be widened. Absorbing it
           would hide the fault and put a few metres of nothing into
           every distance on the site. */
        if (gapBetween(f, g) > CONNECT_M) continue;
        const a = Number(f.Feature_ID);
        const b = Number(g.Feature_ID);
        link(a, b);
        link(b, a);
      }
      continue;
    }
    let best = null;
    for (const g of features) {
      if (g === f || isPoint(g) || !endsOf(g).length) continue;
      const d = gapBetween(f, g);
      if (d > METER_REACH_M) continue;
      if (!best || d < best.d) best = { g, d };
    }
    if (!best) continue;
    const a = Number(f.Feature_ID);
    const b = Number(best.g.Feature_ID);
    link(a, b);
    link(b, a);
  }

  return { byId, adj };
}

/* Breadth first from the substation, so each feature learns which
   feature it hangs off. Breadth first rather than depth first because
   the shortest route back is the one the cable actually takes. */
export function rootAt(graph, rootId) {
  const parent = new Map([[Number(rootId), null]]);
  const queue = [Number(rootId)];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of graph.adj.get(cur) || []) {
      if (parent.has(next)) continue;
      parent.set(next, cur);
      queue.push(next);
    }
  }
  const children = new Map();
  for (const [node, par] of parent) {
    if (par == null) continue;
    if (!children.has(par)) children.set(par, []);
    children.get(par).push(node);
  }
  return { parent, children };
}

/* How long a feature is.

   The stored figure where there is one, and otherwise measured off the
   geometry. Length_m is written when somebody draws a line and edits
   it; a cable the build laid has none, so every distance from the
   substation came out as zero even once the graph connected \u2014 the walk
   added nothing at each step.

   A point has no length, which is right: a meter adds nothing to the
   run that reaches it. */
const lengthOf = (f) => {
  const stored = Number(f?.Attributes?.Length_m ?? 0) || 0;
  if (stored) return stored;
  const g = f?.Geometry || [];
  if (g.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < g.length; i++) {
    total += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
  }
  return total;
};

/* Walk outwards from a starting feature, closing a leg whenever another
   span node is reached. Returns one entry per leg. */
export function traceFrom(startId, features, rootId) {
  const graph = buildGraph(features);
  const start = Number(startId);
  if (!graph.byId.has(start)) return { error: "That node isn't on the network." };
  if (rootId == null || !graph.byId.has(Number(rootId))) {
    return { error: "No substation on the network to measure from." };
  }
  const { children, parent } = rootAt(graph, rootId);

  /* Where a trace actually starts.

     A span node placed on a run is a leaf of the tree, not a link in it:
     the runs either side of it meet each other as well as meeting the
     node, so the walk from the substation reaches the far run through
     the near one and never through the node. Asking for its children
     then gives nothing, and the honest-looking answer "nothing runs
     downstream" is true of the tree while being wrong about the network.

     So for a span node, downstream means the runs passing through its
     position that sit deeper in the tree than the shallowest one. The
     shallowest is how the network arrives; the rest are where it goes. */
  const depthOf = (id) => {
    let d = 0, cur = Number(id);
    while (parent.get(cur) != null && d < 10000) { cur = parent.get(cur); d += 1; }
    return d;
  };

  const startFeature = graph.byId.get(start);
  let roots = children.get(start) || [];

  if (startFeature?.Feature_Role === "spannode" && !roots.length) {
    const at = (startFeature.Geometry || [])[0];
    const touching = at
      ? features.filter((f) => Number(f.Feature_ID) !== start
          && (f.Geometry || []).some((q) =>
            Math.hypot(q[0] - at[0], q[1] - at[1]) <= CONNECT_M))
      : [];
    if (touching.length) {
      const depths = touching.map((f) => ({ f, d: depthOf(f.Feature_ID) }));
      const nearest = Math.min(...depths.map((x) => x.d));
      roots = depths.filter((x) => x.d > nearest).map((x) => Number(x.f.Feature_ID));
    }
  }

  const isSpan = (f) => f.Feature_Role === "spannode";
  const isMeter = (f) => f.Feature_Role === "meter" && f.Layer_Key === "electric";
  const legs = [];

  const walk = (from, cur, metres, meters, fromLabel) => {
    const f = graph.byId.get(cur);
    const runningM = metres + lengthOf(f);
    const runningMeters = isMeter(f) ? [...meters, f] : meters;

    if (cur !== start && isSpan(f)) {
      legs.push({
        from: fromLabel, to: f.Attributes?.Span_Label ?? f.Label ?? `#${cur}`,
        toId: cur, metres: Math.round(runningM * 10) / 10, meters: runningMeters,
      });
      for (const k of children.get(cur) || []) {
        walk(cur, k, 0, [], f.Attributes?.Span_Label ?? f.Label ?? `#${cur}`);
      }
      return;
    }

    const kids = children.get(cur) || [];
    if (!kids.length) {
      legs.push({
        from: fromLabel, to: null, toId: cur,
        metres: Math.round(runningM * 10) / 10, meters: runningMeters,
      });
      return;
    }
    for (const k of kids) walk(cur, k, runningM, runningMeters, fromLabel);
  };

  const startLabel = startFeature?.Attributes?.Span_Label ?? startFeature?.Label ?? `#${start}`;
  if (!roots.length) {
    return { error: `Nothing runs downstream of ${startLabel}.`, legs: [] };
  }
  for (const k of roots) walk(start, k, 0, [], startLabel);
  return { legs, startLabel };
}


/* ── Circuit report ──
   A port of the original's gisCircuitData. Electric meters grouped by
   the feeder that serves them, with each meter's distance from the
   substation measured along the network rather than as the crow flies —
   a meter 50 m away across a garden may be 400 m of cable, and it is the
   cable that has to be sized.

   The original walks a geometric node tree from gisFeederModel. This
   walks the Connects graph, the same one Full Trace uses, so the two
   cannot disagree about what is connected to what.

   Three groups, as the original has them, because they need different
   things doing about them:

     circuits    — meters with a circuit, from Link to Circuit
     unlinked    — reachable from the substation but not yet in a circuit
     unreachable — not connected back to the substation at all, which is
                   a drawing fault rather than a planning one
*/

/* Distance from the root to every feature, along the graph. Accumulates
   the length of each line passed through; points add nothing of their
   own, since a meter has no length. */
export function distancesFrom(features, rootId) {
  const graph = buildGraph(features);
  const root = Number(rootId);
  if (!graph.byId.has(root)) return new Map();

  /* Shortest by metres, not by hops.

     This walked breadth first and took the first arrival as final,
     which finds the route with the fewest features in it \u2014 not the
     shortest one. A run of three long cables beat a run of ten short
     ones, so a meter fifty metres away reported a hundred and thirty:
     the length of whichever way round the walk happened to reach it
     first.

     Smallest-known-distance first instead, and a node is revisited when
     a shorter way to it turns up. That is what "distance from the
     substation" means \u2014 the way the cable actually runs, which is the
     shortest route through the network. */
  const dist = new Map([[root, 0]]);
  const seen = new Set();

  for (;;) {
    /* The nearest node not yet settled. A linear scan rather than a
       heap: a drawing has hundreds of features, not millions, and the
       obvious version is the one that can be checked by reading it. */
    let cur = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (seen.has(id) || d >= best) continue;
      cur = id;
      best = d;
    }
    if (cur == null) break;
    seen.add(cur);

    for (const next of graph.adj.get(cur) || []) {
      const f = graph.byId.get(next);
      const through = best + lengthOf(f);
      const known = dist.get(next);
      if (known == null || through < known) dist.set(next, through);
    }
  }
  return dist;
}

export function circuitReport(features = [], plotById = () => null, opts = {}) {
  const { fallbackKva = 0 } = opts;

  const subs = features.filter((f) => f.Feature_Role === "substation");
  const meters = features.filter(
    (f) => f.Feature_Role === "meter" && f.Layer_Key === "electric");

  if (!subs.length) {
    return { error: "Place a substation first \u2014 circuits are traced from it." };
  }
  if (!meters.length) {
    return { error: "No electric meters placed yet \u2014 nothing to report." };
  }

  const station = subs[0];
  const dist = distancesFrom(features, station.Feature_ID);

  const rec = (m) => {
    const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
    const kva = plot?.kva_load ?? plot?.KVA_Load;
    const d = dist.get(Number(m.Feature_ID));
    return {
      id: m.Feature_ID,
      meter: m.Label || `Meter ${m.Feature_ID}`,
      plot: plot?.plot_number ?? plot?.Plot_Number ?? "",
      houseType: plot?.config_code ?? plot?.Code ?? "\u2014",
      kva: kva != null && kva !== "" ? Number(kva) : fallbackKva,
      /* Whether that figure was read off the plot or fallen back to.
         A plot with no load recorded and a plot genuinely drawing
         nothing are different problems and look identical as "0.0 kVA" —
         which is how a hundred plots reported nothing for as long as
         they did. The report shows the second differently. */
      kvaMissing: !(kva != null && kva !== ""),
      /* Rounded here rather than at display: the figure is quoted in
         reports and a different rounding in the CSV than on screen is
         the kind of discrepancy that costs an afternoon. */
      distM: d == null ? null : Math.round(d * 10) / 10,
      circuitId: m.Attributes?.Circuit_ID ?? null,
      circuitName: m.Attributes?.Circuit_Name ?? null,
      circuitLetter: m.Attributes?.Circuit_Letter ?? null,
    };
  };

  const byCircuit = new Map();
  const unlinked = [];
  const unreachable = [];

  for (const m of meters) {
    const r = rec(m);
    if (r.circuitId != null) {
      const key = Number(r.circuitId);
      if (!byCircuit.has(key)) {
        byCircuit.set(key, {
          id: key,
          name: r.circuitName || `Circuit ${key}`,
          letter: r.circuitLetter || circuitLetter(key),
          meters: [],
        });
      }
      byCircuit.get(key).meters.push(r);
    } else if (r.distM != null) {
      unlinked.push(r);
    } else {
      /* Not reachable and not in a circuit. Worth separating: the fix is
         to the trenches, not to the circuit plan. */
      unreachable.push(r);
    }
  }

  const summarise = (name, letter, rows, id) => ({
    id, name, letter,
    meters: rows.sort((a, b) =>
      String(a.plot).localeCompare(String(b.plot), undefined, { numeric: true })),
    count: rows.length,
    totalKva: Math.round(rows.reduce((t, r) => t + r.kva, 0) * 10) / 10,
    /* How much of that total is guesswork. A circuit summing 154 kVA
       from seventy plots, every one of them a fallback, is not a
       154 kVA circuit — and the header is where that has to be said,
       because the total is the figure people quote. */
    kvaMissing: rows.filter((r) => r.kvaMissing).length,
    maxDist: rows.reduce((t, r) => (r.distM != null && r.distM > t ? r.distM : t), 0),
    /* Meters the walk could not reach from the substation.

       A blank distance column is the symptom of a network that is not
       joined up \u2014 most often a feeder that does not start exactly on
       the substation \u2014 and a column of dashes says nothing about which.
       Counted here so the report can say it plainly rather than leaving
       somebody to wonder whether the figure is missing or the run is. */
    unreached: rows.filter((r) => r.distM == null).length,
  });

  const circuits = [...byCircuit.values()]
    .sort((a, b) => a.id - b.id)
    .map((c) => summarise(c.name, c.letter, c.meters, c.id));

  if (unlinked.length) {
    circuits.push(summarise("Electric meters (not linked to a circuit)", "", unlinked, "unlinked"));
  }

  return {
    station: station.Label || "Substation",
    circuits,
    unreachable,
    totalMeters: meters.length,
    totalKva: Math.round(
      [...circuits, { totalKva: 0 }].reduce((t, c) => t + (c.totalKva || 0), 0) * 10) / 10,
  };
}
