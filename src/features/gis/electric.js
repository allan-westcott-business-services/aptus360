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
  return features.find((f) =>
    f.Feature_Role === "spannode"
    && Number(f.Attributes?.Circuit_ID) === Number(circuitId)
    && Number(f.Attributes?.Span_Seq) === 0) || null;
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

const lengthOf = (f) => Number(f?.Attributes?.Length_m ?? 0) || 0;

/* Walk outwards from a starting feature, closing a leg whenever another
   span node is reached. Returns one entry per leg. */
export function traceFrom(startId, features, rootId) {
  const graph = buildGraph(features);
  const start = Number(startId);
  if (!graph.byId.has(start)) return { error: "That node isn't on the network." };
  if (rootId == null || !graph.byId.has(Number(rootId))) {
    return { error: "No substation on the network to measure from." };
  }
  const { children } = rootAt(graph, rootId);

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

  const startFeature = graph.byId.get(start);
  const startLabel = startFeature.Attributes?.Span_Label ?? startFeature.Label ?? `#${start}`;
  const branches = children.get(start) || [];
  if (!branches.length) {
    return { error: `Nothing runs downstream of ${startLabel}.`, legs: [] };
  }
  for (const k of branches) walk(start, k, 0, [], startLabel);
  return { legs, startLabel };
}
