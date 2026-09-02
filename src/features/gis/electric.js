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

/* Non-residential supplies inside the outline, that have a meter.

   The same question as metredSeedsInside and the same shape of answer,
   asked separately because a supply is not a plot: it has no Plot_ID,
   no dwelling behind it and its own feature role. Lassoed round without
   this, it would be left off the circuit while everything beside it
   joined — placed, drawn, and silently on no circuit at all, so the
   levels check pruned it out and the design read lighter than it is by
   the whole of its load.

   It used to look for METERS carrying an NRS_ID, because 0194 made a
   supply be its own meter. 0196 made it a seed with meters of its own,
   which is what it always was: something on the ground that takes gas,
   water and electric like anything else. */
export function metredSuppliesInside(features, ring, inside) {
  const seeds = features.filter((f) =>
    f.Feature_Role === "nrs" && (f.Geometry || []).length
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
  /* A supply has no plot to be matched by, so its meters carry the same
     NRS_ID as the seed they were placed against.

     The record rather than the feature id, because the id is not known
     while the seed is still an optimistic row on the canvas — the plot
     flow gets round that by having Plot_ID to hand, and this is the
     equivalent. It also means a supply's meters survive the seed being
     deleted and re-placed, which the feature id would not. */
  const nrs = seed.Attributes?.NRS_ID;
  if (nrs != null && meter.Attributes?.NRS_ID != null) {
    return Number(meter.Attributes.NRS_ID) === Number(nrs);
  }
  /* Both, or neither. Asking only whether the SEED has an NRS_ID meant a
     meter carrying just the seed link — which is what Auto Service used
     to write — could never belong to a supply, so a supply serviced
     automatically dropped off its own circuit while looking entirely
     correct on the drawing. Auto Service writes both now; this is what
     makes the older ones keep working. */
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
export function circuitKva(meters, plotById, fallbackKva = 0, nrsById = () => null) {
  let total = 0;
  for (const m of meters) {
    /* A non-residential supply has no plot, so plotById cannot answer
       for it and every one would have fallen to fallbackKva — usually
       zero, and this feeds the way-fuse comparison at the substation.
       A commercial unit missing from the load on a way is the sort of
       thing that reads as headroom. */
    const kva = m.Attributes?.NRS_ID != null
      ? nrsById(m.Attributes.NRS_ID)?.Requested_kVA
      : (() => {
          const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
          return plot?.kva_load ?? plot?.KVA_Load;
        })();
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
  /* Electric only.

     A gas or water drawing has a Span_Seq 0 node too — G0 and W0 sit on
     their own POCs — and nothing here filtered by layer, so the
     "names no circuit" fallback below could hand back the gas origin as
     an electric circuit's starting point. Every caller of this is a
     circuit, and a circuit is electric. */
  const nodes = features
    .filter((f) => f.Feature_Role === "spannode"
      && Number(f.Attributes?.Span_Seq) === 0
      && f.Layer_Key === "electric")
    /* Ordered, so the last resort below is the same node every time.
       Scan order is not insertion order, and a check that picked a
       different origin on each run would be worse than one that picked
       none. */
    .sort((a, b) => Number(a.Feature_ID) - Number(b.Feature_ID));

  /* One node on the origin, shared by every circuit.

     Requiring a matching Circuit_ID meant a site needed one origin per
     circuit, all stacked on the same spot. They are the same point on
     the ground \u2014 the substation or POC the whole network is measured
     from \u2014 and four copies of it is four things to keep in step for
     no gain.

     A node naming this circuit still wins where one exists, so a
     drawing that already has them keeps working. Otherwise the one that
     names no circuit is the origin for all of them.

     ── And failing that, any of them ──

     Two writers make these nodes and they disagree about naming:
     defining a circuit writes one carrying that Circuit_ID, while the
     Build LV run writes one carrying none, deliberately, so it can
     serve every circuit. A drawing that got the first kind and not the
     second ended up with origins that all named *some* circuit and none
     that named this one — and the levels check then said "Circuit 1: no
     origin node" with E0 sitting plainly on the POC.

     Which is the same fact the paragraph above already states: they are
     one point on the ground. If there is an electric origin node, it is
     the origin, whatever Circuit_ID it happens to carry. Preferring the
     two named cases first keeps a drawing with a real per-circuit
     origin working exactly as it did. */
  return nodes.find((f) =>
    Number(f.Attributes?.Circuit_ID) === Number(circuitId))
    ?? nodes.find((f) => f.Attributes?.Circuit_ID == null)
    ?? nodes[0]
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

/* How far a meter may sit from the cable serving it.

   A meter is a box on a wall and the service ends at the plot
   boundary, so they are metres apart on every drawing. Plant is not
   allowed this: a feeder leaving a substation starts on it. */
const METER_REACH_M = 30;

/* How far a POC may sit from the cable running back to it.

   Not CONNECT_M, which is the plant rule: a feeder leaving a substation
   starts on it. A POC marks somebody else's cable — across a footway,
   at an existing joint bay — and the site cable starts near it rather
   than on it. Fifteen is about the width of a road and its verges,
   which is the gap this is for.

   Wide enough to cross the thing that is actually in the way, and short
   enough that it cannot reach past it to a cable on another street. */
const POC_REACH_M = 15;

/* ── What the origin is joining to decides its reach ──

   A feeder leaving a substation starts ON it. Three metres of nothing
   between the two is a drawing that has not been joined up, and
   absorbing it would hide the fault and put those metres into every
   distance on the site. That rule stands, and two checks hold it there.

   A TRENCH is a different thing to be near. A substation sits beside
   its trench rather than on it, and before any cable is drawn the
   trench is the only route there is. The distance is wanted at every
   stage of a design — origin placed, trench dug, services run, meters
   placed — not only at the end.

   Two metres off its trench, with no LV cable yet, and joinAt returned
   null, distancesFrom returned an empty Map, and every distance on the
   drawing was blank. Not one row: the column. The same shape as the POC
   fault above — a rule written for the finished drawing, applied to the
   drawing being made.

   So the reach is strict against cables and generous against trenches,
   which is the distinction that was missing rather than a number that
   was too small. A cable three metres out still reads as unjoined; a
   trench three metres away is the road.

   The gap is not swallowed either way. It is added to every distance
   below and the report warns when it is over a quarter of a metre, so a
   substation genuinely adrift says so as a number beside the answer
   rather than as a page of dashes. */
const ORIGIN_REACH = (f) => (f?.Layer_Key === "trench" ? POC_REACH_M : CONNECT_M);

/* How far a meter may sit from a cable that does NOT carry its plot
   number. Twelve, as the single reach was before the number started
   deciding: it is roughly how far a meter is from the service feeding
   it, and short enough that it cannot reach a main on another branch. */
const METER_FALLBACK_M = 12;

/* ── The plot a feature belongs to ──

   Carried as a column on the feature, not an attribute, and written all
   the way down the chain: the seed knows its plot number, the boundary
   point is placed with the seed, the meter inherits it, and Auto Lay
   Services stamps it on the service trench and the cable it lays.

   So a meter and the cable feeding it agree on a number, and the answer
   to "which cable serves this meter" is recorded rather than inferred.
   The attribute is read as a fallback, since nothing stops a feature
   carrying it there. */
const plotOf = (f) => {
  const v = f?.Plot_ID ?? f?.Attributes?.Plot_ID;
  return v == null ? null : Number(v);
};

export function buildGraph(features = []) {
  const byId = new Map(features.map((f) => [Number(f.Feature_ID), f]));

  /* Does this drawing carry plot numbers on its services?

     Asked once, of the drawing, rather than assumed. Where it does, a
     meter's own service is a recorded fact and proximity has no part in
     it. Where it does not — a drawing made before Auto Lay Service Cable
     stamped them — proximity is all there is, and refusing to trace
     would strand every meter on it. */
  const numbered = features.some((f) => f.Feature_Type === "line"
    && f.Layer_Key === "electric"
    && /service/i.test(String(f.Attributes?.Line_Type ?? ""))
    && (f.Plot_ID ?? f.Attributes?.Plot_ID) != null);
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
    /* ── Its own plot's cable, before the nearest one ──

       Nearest was the only rule, and on a tight estate the nearest
       cable to a meter is often the neighbour's: two plots either side
       of a shared boundary have their meters metres apart and their
       services running to different points on the main. The meter then
       hung off a cable that does not feed it, and every distance,
       volt drop and circuit membership downstream was measured along
       the wrong route \u2014 silently, because the drawing looks right.

       The number is already on both. A cable laid to plot 34 carries
       Plot_ID 34 and so does plot 34's meter, so the match is recorded
       rather than guessed, and the nearest rule is only needed where a
       cable was drawn by hand and never given one.

       This is also what lets the reach be 30 m rather than 12. Twelve
       was a guard against grabbing the wrong cable, and a guess about
       how far a meter sits from its service \u2014 which is a property of
       the plot, not of the drawing. With the plot number deciding, a
       long garden is no longer a reason to be unreachable. */
    /* ── Two reaches, because they answer different questions ──

       Thirty metres is safe when the plot number decides which cable is
       which: a long garden stops being a reason to be unreachable, and
       the number rules out the neighbour's.

       It is not safe as a fallback. Where a plot has no service cable
       of its own — a drawing where Auto Lay Service Cable has not been run,
       and there are drawings with 139 service trenches and no cable in
       any of them — the meter takes the nearest line of any kind, and
       at thirty metres that reaches a MAIN on another branch entirely.
       Plot 34 hung off the main by A4, which is not on its route back,
       so A4 came out as a breech joint on its call-off.

       So the number buys the extra reach and nothing else does. Without
       one, twelve metres, which is what it was and is about how far a
       meter sits from the service that feeds it. */
    const mine = plotOf(f);
    let best = null;
    let byPlot = null;
    /* ── Where the numbers are there, they decide, and nothing else does ──

       Meter to line is the one fuzzy hop in the whole trace. Line to
       line is exact — two cables meeting within 0.25 m of each other is
       how the network connects — so the route is exact everywhere
       except its first step, and that first step is where it goes
       wrong.

       It should not be a guess. A seed knows its plot, the boundary
       point is placed with it, the meter inherits it, and Auto Lay
       Services stamps it on the trench and the cable. Meter to its own
       service is a recorded fact.

       So where the drawing has services carrying numbers, a meter with
       a number joins its own service or nothing. A meter that finds no
       cable of its own is not "nearly connected to the neighbour's" —
       it has no service on the drawing, and saying so is the useful
       answer. Guessing produced a confident and wrong list of breech
       joints for plot 34.

       ── And where they are not ──

       A drawing made before services were stamped has no numbers to go
       on, and refusing to trace it would strand every meter on it. So
       the numbers are only authoritative where they exist: `numbered`
       asks whether this drawing uses them at all, once, rather than
       assuming. */
    const decisive = numbered && mine != null;
    for (const g of features) {
      if (g === f || isPoint(g) || !endsOf(g).length) continue;
      const d = gapBetween(f, g);
      if (d > METER_REACH_M) continue;
      const ownPlot = mine != null && plotOf(g) === mine;
      /* Its own service, or nothing at all. */
      if (decisive && !ownPlot) continue;
      if (d > METER_FALLBACK_M && !ownPlot) continue;
      if (!best || d < best.d) best = { g, d };
      /* Same plot, and a service rather than a main: a main running
         past the plot may carry the number of the plot it was laid for
         and is not what feeds this meter. */
      if (mine != null && plotOf(g) === mine
        && /service/i.test(String(g.Attributes?.Line_Type ?? ""))
        && (!byPlot || d < byPlot.d)) {
        byPlot = { g, d };
      }
    }
    best = byPlot || best;
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

/* The network as the walk sees it: the lines electricity can run
   along, cut where they meet, with the shortest route from the origin
   to every point. distancesFrom reads distances off it; whyUnreached
   reads the reasons a distance is missing off the same graph. */
function networkFrom(features, rootId) {
  /* Measured along the cable, not cable by cable.

     The graph used to be one node per feature, so arriving at a cable
     cost its whole length however far along it you joined. Two meters
     six metres apart on the same run therefore reported seventy and a
     hundred and thirty: one had joined a short service, the other a
     long main, and the main's full length went onto its total.

     So the nodes are the points the lines are drawn through, and an
     edge is one segment with its own length. A meter joins at the
     nearest point on the nearest cable — the actual place it tees in —
     and the walk adds only the metres between there and the
     substation.

     Dijkstra rather than breadth first, because the shortest route is
     the one the cable takes, not the one with fewest corners in it. */
  const root = Number(rootId);
  const start = features.find((f) => Number(f.Feature_ID) === root);
  const at = (start?.Geometry || [])[0];
  if (!at) return null;

  /* ── Points, interned so a shared corner is one node ── */
  const pts = [];
  const idOf = new Map();
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const intern = (p) => {
    const k = key(p);
    if (idOf.has(k)) return idOf.get(k);
    const i = pts.length;
    pts.push([p[0], p[1]]);
    idOf.set(k, i);
    return i;
  };

  const adj = new Map();
  const edge = (a, b, w) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, w]);
    adj.get(b).push([a, w]);
  };

  /* ── Only the lines electricity can run along ──

     This took every line on the drawing. A meter joined the nearest
     one within thirty metres, whatever it was \u2014 and a meter is a box on
     a plot's front wall, which is where the boundary is drawn. A meter
     a metre from its boundary and four from its service joined the
     boundary, and a boundary runs back to nothing, so the meter
     reported no distance while the service that feeds it sat there
     reaching the main. The same with a gas or water service ending
     short of its own main: the meter took the nearer pipe and inherited
     its fault.

     Cables and trenches, then. A cable is the network; a trench is
     where the cable will go, which is what the report is measured along
     before Build LV Network has run. A line with no layer is kept, for
     the fixtures and for drawings older than layers. Nothing else can
     carry the site's electricity, so nothing else can be the way a
     meter reaches the substation. */
  const carries = (f) => f.Layer_Key == null
    || f.Layer_Key === "electric" || f.Layer_Key === "trench";
  const lines = features.filter((f) => (f.Geometry || []).length >= 2 && carries(f));

  /* How much a line's drawn metres are worth, where somebody has
     measured it. One place, so the edge loop and the join below cannot
     disagree about the length of the same run. */
  const scaleOf = (f) => {
    const g = f.Geometry;
    let drawn = 0;
    for (let i = 1; i < g.length; i++) {
      drawn += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    }
    const stated = Number(f.Attributes?.Length_m ?? 0) || 0;
    return stated && drawn ? stated / drawn : 1;
  };

  /* Every line, cut wherever another line's end lands on it.

     A service tees into the middle of a main, not at one of its
     corners, so without this the two shared no point and the service
     was joined to nothing \u2014 every meter beyond it unreachable. Same
     fault the gas graph had, and the same cut fixes it. */
  const ends = [];
  for (const f of lines) {
    const g = f.Geometry;
    ends.push(g[0], g[g.length - 1]);
  }

  for (const f of lines) {
    const g = f.Geometry;
    /* A measured length overrides the drawing.

       Somebody who has walked a run and entered it knows something the
       geometry does not \u2014 a trench dug round an obstruction, say. The
       segments are scaled so they still sum to that figure, which keeps
       a join half way along the line half way along the measurement. */
    const scale = scaleOf(f);

    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1];
      const b = g[i];
      const cuts = [];
      for (const e of ends) {
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const len2 = vx * vx + vy * vy;
        if (!len2) continue;
        const t = Math.max(0, Math.min(1,
          ((e[0] - a[0]) * vx + (e[1] - a[1]) * vy) / len2));
        const q = [a[0] + vx * t, a[1] + vy * t];
        if (Math.hypot(e[0] - q[0], e[1] - q[1]) > CONNECT_M) continue;
        if (t <= 0.0001 || t >= 0.9999) continue;   // already an end
        cuts.push({ t, q });
      }
      cuts.sort((x, y) => x.t - y.t);

      let prev = a;
      for (const c of cuts) {
        edge(intern(prev), intern(c.q),
          Math.hypot(c.q[0] - prev[0], c.q[1] - prev[1]) * scale);
        prev = c.q;
      }
      edge(intern(prev), intern(b),
        Math.hypot(b[0] - prev[0], b[1] - prev[1]) * scale);
    }
  }

  /* ── Where a point joins a line ──
     The nearest place on it, which is where a service tees in rather
     than the nearest corner somebody happened to draw. */
  const onSegment = (p, a, b) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2))
      : 0;
    const q = [a[0] + vx * t, a[1] + vy * t];
    return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
  };

  /* Returns the spliced node AND how far the point sat from the line.

     joinAt below is this with the gap thrown away, which is what every
     meter wants — a meter's distance from its service is not network
     and must not be added. The origin wants the gap, so the two are one
     function with the caller deciding, rather than two that splice
     lines slightly differently. */
  const joinAtWithGap = (p, reach) => {
    /* `reach` may be a number or a function of the line.

       The origin needs a different answer depending on what it is
       joining to, and only the loop knows which line each candidate is
       — see the note on ORIGIN_REACH. */
    const reachOf = typeof reach === "function" ? reach : () => reach;
    let best = null;
    for (const f of lines) {
      const g = f.Geometry;
      for (let i = 1; i < g.length; i++) {
        const hit = onSegment(p, g[i - 1], g[i]);
        if (hit.d > reachOf(f)) continue;
        /* The line's own scale travels with the hit: splicing a join
           into a measured run has to cost measured metres, or the join
           quietly reverts that length to what was drawn. */
        if (!best || hit.d < best.d) {
          best = { ...hit, a: g[i - 1], b: g[i], scale: scaleOf(f) };
        }
      }
    }
    if (!best) return null;
    /* Spliced into the segment, so joining half way along costs half
       the segment rather than all of it. */
    const id = intern(best.q);
    const ia = intern(best.a);
    const ib = intern(best.b);
    edge(ia, id,
      Math.hypot(best.q[0] - best.a[0], best.q[1] - best.a[1]) * best.scale);
    edge(id, ib,
      Math.hypot(best.b[0] - best.q[0], best.b[1] - best.q[1]) * best.scale);
    return { id, d: best.d };
  };

  const joinAt = (p, reach) => joinAtWithGap(p, reach)?.id ?? null;

  /* ── How close the origin has to be to the network ──

     Plant joins exactly: a feeder leaving a substation starts on it,
     and a gap there is a drawing not joined up rather than a tolerance
     to widen. A meter is a box on a wall and sits back from its
     service, so it is allowed its own reach.

     A POC is neither, and applying the substation rule to it is what
     broke this.

     lvOrigin was widened to accept an electric POC — a connection to an
     existing network has no new transformer, so the site's electricity
     comes from the point of connection to the DNO's cable. The reach
     here was never revisited, so the POC inherited the rule written for
     plant: join within a quarter of a metre or not at all.

     But a POC marker is not something the designer draws the cable out
     of. It marks where somebody else's cable already is — across a
     footway, at an existing joint bay, the far side of a boundary. The
     site cable starts *near* it, metres away, and that gap is real
     geography rather than a mistake.

     Over 0.25 m and joinAt returned null, distancesFrom returned an
     empty Map, and every meter on the drawing reported no distance at
     all. Not a wrong number — a column of dashes, on every POC-fed
     design, every time. */
  /* A POC is near its network by nature — it marks somebody else's
     cable, across a footway or at a joint bay — so it keeps its reach
     against anything. A substation is strict against cables and
     generous against trenches; see ORIGIN_REACH. */
  const rootIsPoc = start.Feature_Role === "poc";
  const rootJoin = joinAtWithGap(at,
    rootIsPoc ? POC_REACH_M : ORIGIN_REACH);
  if (rootJoin == null) return null;
  const rootNode = rootJoin.id;

  /* ── The gap counts ──

     A meter's gap does not: the service ends at the plot boundary and
     the tails to the box are not network. The origin's is different —
     between the POC and where the site cable starts there is cable, and
     it is cable this job lays.

     Dropping it understated every distance on the site by the width of
     the road, and moving the POC marker changed nothing on the report,
     which is the part that would have made this hard to believe.

     For a substation the gap is under a quarter of a metre by the rule
     above, so this adds nothing there. One rule, not two. */
  const rootGap = rootJoin.d;

  /* ── Shortest route to every point ── */
  const dist = new Map([[rootNode, rootGap]]);
  const done = new Set();
  for (;;) {
    let cur = null;
    let best = Infinity;
    for (const [i, d] of dist) {
      if (done.has(i) || d >= best) continue;
      cur = i;
      best = d;
    }
    if (cur == null) break;
    done.add(cur);
    for (const [next, w] of adj.get(cur) || []) {
      const through = best + w;
      if (dist.get(next) == null || through < dist.get(next)) dist.set(next, through);
    }
  }

  return {
    root, rootGap, dist, lines, key, idOf, pts, adj,
    joinAt, joinAtWithGap, onSegment, scaleOf,
  };
}

/* Distance from the root to every feature, along the graph. Accumulates
   the length of each line passed through; points add nothing of their
   own, since a meter has no length.

   The graph itself is built by networkFrom above, which whyUnreached
   shares \u2014 one set of joining rules, so the diagnosis of a blank
   distance is made against the same graph that left it blank. */
export function distancesFrom(features, rootId) {
  const net = networkFrom(features, rootId);
  if (!net) return new Map();
  const { root, rootGap, dist, key, idOf, joinAt, adj } = net;

  /* ── Back to features ── */
  const out = new Map();
  for (const f of features) {
    const g = f.Geometry || [];
    if (!g.length) continue;
    if (g.length === 1) {
      const id = joinAt(g[0], f.Feature_Role === "meter" ? METER_REACH_M : CONNECT_M);
      if (id == null) continue;
      /* Re-running the walk is not needed: splicing a join adds a point
         between two that are already settled, so its distance is the
         nearer settled end plus the bit along the segment.

         ── Which somebody has to actually work out ──

         That sentence stood above `dist.get(id)` and nothing else. The
         walk had finished before the splice, so the new point had no
         entry, and a meter whose nearest point on the network was part
         way along a segment \u2014 beside its service rather than at the end
         of it \u2014 reported no distance at all. A meter at a line's end
         joined an existing vertex and was fine, which is most of them
         and why this read as "some meters" rather than "every meter":
         Auto Service ends the cable at the cut-out, and only a meter
         that has been moved along the wall, or whose service runs past
         it, projects onto the body of the line.

         The spliced point has two neighbours and both are settled, so
         its distance is the shorter way in. */
      let d = dist.get(id);
      if (d == null) {
        for (const [n, w] of adj.get(id) || []) {
          const dn = dist.get(n);
          if (dn != null && (d == null || dn + w < d)) d = dn + w;
        }
      }
      if (d != null) out.set(Number(f.Feature_ID), d);
      continue;
    }
    /* A line is as far away as its nearest end, which is what "how far
       is this cable from the substation" means. */
    let near = null;
    for (const q of [g[0], g[g.length - 1]]) {
      const d = dist.get(idOf.get(key(q)));
      if (d != null && (near == null || d < near)) near = d;
    }
    if (near != null) out.set(Number(f.Feature_ID), near);
  }
  /* The origin is zero from itself, whatever the walk made of the node
     it joined at. */
  out.set(root, 0);

  /* How far the origin sat from the network, carried out as a property
     rather than an entry — the entries are keyed by Feature_ID and this
     is not a feature.

     Here so the report can say "the POC is 8.4 m from the nearest
     cable" instead of quietly snapping to whatever was in range. A
     reach wide enough to cross a road is wide enough to cross to the
     wrong road, and the fix for a blank report should not be a
     confidently wrong one. */
  out.rootGapM = Math.round(rootGap * 10) / 10;
  return out;
}

/* ── Why a meter has no distance ──

   A blank in the distance column says the walk could not get there
   from the origin. It does not say why, and there are four reasons that
   look identical as a dash:

     no line near it     nothing within METER_REACH_M for it to join
     joined an island    the nearest line runs back to nothing — its
                         service, or the run it should tee into, stops
                         short of the network by more than CONNECT_M
     the origin adrift   nothing reached anything, because the feeder
                         does not start on the substation
     not a meter         asked about something the report never walks

   Each wants a different thing done. The first two are the drawing
   near the plot; the third is one fix at the substation for every dash
   on the page. Said in a sentence with the metres in it, so the person
   goes to the right place on the drawing with the gap already known.

   Measured against the same graph distancesFrom used, not a second
   reading of the drawing: a diagnosis made on different joining rules
   could explain a gap the report does not have and miss the one it
   does.

   Returns null where the feature does reach, so a caller can ask for
   every meter and keep only the answers. */
export function whyUnreached(features = [], rootId, featureId) {
  const f = features.find((x) => Number(x.Feature_ID) === Number(featureId));
  const p = (f?.Geometry || [])[0];
  if (!f || !p || (f.Geometry || []).length !== 1) return null;

  const net = networkFrom(features, rootId);
  if (!net) {
    return "the origin is not on the network \u2014 no cable starts on the "
      + "substation, so nothing on the drawing is reached from it";
  }
  const { dist, lines, key, idOf, onSegment } = net;

  const nameOf = (l) => {
    const t = l.Attributes?.Line_Type ? String(l.Attributes.Line_Type) : null;
    const layer = l.Layer_Key ? String(l.Layer_Key) : null;
    const what = t || (layer ? `${layer} line` : "line");
    return `${what} #${l.Feature_ID}`;
  };
  const m = (v) => `${Math.round(v * 10) / 10} m`;

  /* The line it joined, or would have: nearest point on the nearest
     line, the same way joinAt chooses. */
  const reach = f.Feature_Role === "meter" ? METER_REACH_M : CONNECT_M;
  let nearest = null;
  for (const l of lines) {
    const g = l.Geometry;
    for (let i = 1; i < g.length; i++) {
      const hit = onSegment(p, g[i - 1], g[i]);
      if (!nearest || hit.d < nearest.d) nearest = { line: l, d: hit.d, q: hit.q };
    }
  }
  if (!nearest || nearest.d > reach) {
    return nearest
      ? `no cable or trench within ${reach} m of it \u2014 the nearest is `
        + `${nameOf(nearest.line)}, ${m(nearest.d)} away`
      : "no cable or trench on the drawing at all";
  }

  /* Reached, in fact. Either the join settled (the caller asked about
     something that has a distance) or the segment it joins is reached
     at both ends. */
  const reached = (q) => dist.get(idOf.get(key(q))) != null;
  const g = nearest.line.Geometry;
  if (reached(g[0]) || reached(g[g.length - 1])) return null;

  /* ── The island ──

     The line it joined and everything that touches it, gathered by the
     same rule the graph joined them with: an end within CONNECT_M of
     another line. Then the nearest an end of the island comes to a
     line that is reached, which is the gap somebody has to close. */
  const touching = (a, b) => {
    for (const e of [a.Geometry[0], a.Geometry[a.Geometry.length - 1]]) {
      for (let i = 1; i < b.Geometry.length; i++) {
        if (onSegment(e, b.Geometry[i - 1], b.Geometry[i]).d <= CONNECT_M) return true;
      }
    }
    return false;
  };
  const isReached = (l) => reached(l.Geometry[0]) || reached(l.Geometry[l.Geometry.length - 1]);
  const island = new Set([nearest.line]);
  const queue = [nearest.line];
  while (queue.length) {
    const a = queue.shift();
    for (const b of lines) {
      if (island.has(b) || isReached(b)) continue;
      if (touching(a, b) || touching(b, a)) { island.add(b); queue.push(b); }
    }
  }

  const live = lines.filter(isReached);
  if (!live.length) {
    return "nothing on the drawing is reached from the origin \u2014 check the "
      + "feeder starts on the substation";
  }
  let gap = null;
  for (const a of island) {
    for (const e of [a.Geometry[0], a.Geometry[a.Geometry.length - 1]]) {
      for (const b of live) {
        for (let i = 1; i < b.Geometry.length; i++) {
          const hit = onSegment(e, b.Geometry[i - 1], b.Geometry[i]);
          if (!gap || hit.d < gap.d) gap = { d: hit.d, from: a, to: b };
        }
      }
    }
  }

  const joined = nearest.d > CONNECT_M
    ? `${nameOf(nearest.line)}, ${m(nearest.d)} from the meter,`
    : `${nameOf(nearest.line)}`;
  const size = island.size > 1 ? ` (${island.size} lines joined together)` : "";
  return `${joined} runs back to nothing${size}: its nearest end stops `
    + `${m(gap.d)} short of ${nameOf(gap.to)}, and a gap over ${CONNECT_M} m `
    + "is not joined";
}

/* ── Where the network starts ──

   A substation, or an electric POC.

   The build required a substation, because on a scheme we build the
   feeders run back to one. They do not always: on a connection to an
   existing network there is no new transformer, and the point of
   connection to the DNO's cable is where the site's electricity comes
   from. The drawing had the POC on it and the build refused to use it,
   so the only way through was to place a substation nobody would build.

   The substation wins where both are drawn, for the reason originsOf
   gives about plant and POCs: a site with a transformer starts at the
   transformer, and the POC beside it is where the incomer arrives
   rather than where the feeders begin.

   Only an electric one. A gas POC is on the drawing of nearly every
   scheme and has nothing to say about where a cable routes back to. */
export function lvOrigin(features = []) {
  return lvOrigins(features)[0] || null;
}

/* All of them, substations first.

   A site can be fed from more than one side: two points of connection
   in different roads, each serving its own self-contained network, the
   networks never meeting. The gas side has worked this way since the
   second gas POC was allowed; electric held to one origin because
   every electric walk assumed it. The walks now choose between these
   by which network the thing being walked stands on \u2014 see
   buildFeederModel \u2014 so the list is the truth and lvOrigin is the
   convenience for the common site that has one.

   Substations before POCs, in drawing order within each: that keeps
   lvOrigin answering exactly what it always answered, and it is the
   right precedence where one network has both \u2014 the feeders begin at
   the transformer and the POC beside it is where the incomer
   arrives. */
export function lvOrigins(features = []) {
  const has = (f) => (f.Geometry || []).length > 0;
  return [
    ...features.filter((f) => f.Feature_Role === "substation" && has(f)),
    ...features.filter((f) => f.Feature_Role === "poc"
      && f.Layer_Key === "electric" && has(f)),
  ];
}

export function circuitReport(features = [], opts = {}) {
  /* Both lookups in the options, travelling together.

     plotById used to be a positional argument and nrsById arrived later
     in the options, which meant a call site could pass one and forget
     the other — and forgetting nrsById does not fail. It reports every
     supply as carrying no load, on a drawing that shows the supply
     plainly, while the levels check counts it. The two answered
     differently about the same circuit for exactly as long as that
     shape lasted.

     A supply is a load like a dwelling is. The two ways of looking one
     up belong in the same place, and checknrs counts the call sites to
     make sure neither goes without the other. */
  const {
    plotById = () => null, fallbackKva = 0, nrsById = () => null,
    /* Whether this meter is a self-lay supply.

       Passed in rather than read here, for the reason the two lookups
       above travel together: the answer lives in Plot_Utility rows the
       canvas loads once, and a second reader of the same fact is how a
       meter came to be crossed out on the drawing and still offered a
       circuit.

       Defaults to "no", so a caller that has not been told still gets a
       report — one that says nothing about self-lay rather than
       guessing at it. */
    isSelfLay = () => false,
  } = opts;

  /* ── Traced from the substation, or from the POC ──

     This asked for a substation and traced from `subs[0]`. Every other
     part of the electric work asks lvOrigin, which takes a substation
     OR an electric POC — because a connection to an existing network
     has no new transformer and the site's electricity comes from the
     point of connection to the DNO's cable.

     Where a scheme has both, the substation wins: the incomer arrives
     at the POC and the feeders begin at the transformer. That is
     lvOrigin's rule and it is not restated here.

     Left as it was, this refused the whole report on a POC-fed design —
     and the report is the only place a meter is moved from one circuit
     to another, so the one drawing that most needed it was the one that
     could not open it. */
  const stations = lvOrigins(features);
  const station = stations[0] || null;
  const meters = features.filter(
    (f) => f.Feature_Role === "meter" && f.Layer_Key === "electric");

  if (!station) {
    return {
      error: "Place a substation or an electric point of connection first "
        + "\u2014 circuits are traced from one of them.",
    };
  }
  if (!meters.length) {
    return { error: "No electric meters placed yet \u2014 nothing to report." };
  }

  /* ── Measured from the origin that feeds it ──

     One walk per origin, merged. A site fed from two points of
     connection is two self-contained networks, and a meter has a
     distance on exactly one of them \u2014 measured from its own origin.
     Walking only the first origin called everything on the second
     network unreachable, which is how the drawing looked before the
     second POC was allowed at all.

     First origin wins a tie, which can only happen where two origins
     share a network \u2014 the substation-with-incomer case, where the
     substation is first by lvOrigins' ordering and is the right
     answer for the same reason it always was. */
  const dist = new Map();
  const originOf = new Map();
  for (const o of stations) {
    const d = distancesFrom(features, o.Feature_ID);
    for (const [id, v] of d) {
      if (!dist.has(id)) { dist.set(id, v); originOf.set(id, o); }
    }
    /* The primary origin's own gap to the network, kept: it is the one
       the header reports, exactly as it did with one origin. */
    if (o === station) dist.rootGapM = d.rootGapM;
  }

  /* The origin to explain an unreached meter against: the nearest one,
     because on a drawing of self-contained networks the nearest is the
     one the meter was meant to be on, and the gap named should be the
     gap to that network rather than to one across the site. */
  const originToBlame = (m) => {
    const p = (m.Geometry || [])[0];
    if (!p || stations.length === 1) return station;
    return stations.reduce((best, o) => {
      const d = Math.hypot(o.Geometry[0][0] - p[0], o.Geometry[0][1] - p[1]);
      return !best || d < best.d ? { o, d } : best;
    }, null).o;
  };

  const rec = (m) => {
    const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
    /* A non-residential supply has no plot, so plotById cannot answer
       for it: every one reported "no load recorded" and its kVA was
       missing from the circuit total and from the POC capacity
       comparison underneath it.

       Read the same way circuitKva reads it — off the NRS_ID on the
       meter — so the report and the way-fuse sum cannot disagree about
       what a circuit is carrying. They did: buildFeederModel had this
       branch from the start and this function never got it, so the
       levels check counted a supply that the report showed as blank. */
    const nrsId = m.Attributes?.NRS_ID;
    const supply = nrsId != null ? nrsById(nrsId) : null;
    const kva = supply
      ? supply.Requested_kVA
      : (plot?.kva_load ?? plot?.KVA_Load);
    const d = dist.get(Number(m.Feature_ID));
    return {
      id: m.Feature_ID,
      meter: m.Label || `Meter ${m.Feature_ID}`,
      plot: plot?.plot_number ?? plot?.Plot_Number ?? "",
      /* What it is, where there is no house type to give. A row reading
         "—" in every column but its name says nothing about why it has
         no plot; the supply type says it is not a dwelling. */
      houseType: supply
        ? (supply.Description || supply.Supply_Ref || "Non-residential")
        : (plot?.config_code ?? plot?.Code ?? "\u2014"),
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
      /* And why not, where not. A dash sends somebody to "check the
         trenches join up" across the whole site; a sentence with the
         gap in metres sends them to one place on the drawing. */
      why: d == null
        ? whyUnreached(features, originToBlame(m).Feature_ID, m.Feature_ID)
        : null,
      /* Which origin it is measured from, for a site with more than
         one. Null where it is unreached; one origin on the ordinary
         site, so the report only says it when there is something to
         say. */
      originLabel: d != null && stations.length > 1
        ? (originOf.get(Number(m.Feature_ID))?.Label
          || (originOf.get(Number(m.Feature_ID))?.Feature_Role === "substation"
            ? "Substation" : `POC #${originOf.get(Number(m.Feature_ID))?.Feature_ID}`))
        : null,
      circuitId: m.Attributes?.Circuit_ID ?? null,
      circuitName: m.Attributes?.Circuit_Name ?? null,
      circuitLetter: m.Attributes?.Circuit_Letter ?? null,
      /* ── Somebody else connects this one ──

         It draws nothing from our transformer and takes no way, so it
         is on no circuit — which means it lands in "not traced to a
         substation" every single time, beside the note telling somebody
         to check the trenches connect it back. That note is wrong
         advice for a self-lay plot, and following it means going to
         look at a drawing that is already correct.

         Marked rather than hidden. A self-lay plot is a real plot on
         this site and taking it off the report entirely would make it
         impossible to see that it had been dealt with at all. */
      selfLay: !!isSelfLay(m),
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
    /* Named for what it is where it has no label of its own. Falling
       back to "Substation" on a POC-fed design put the word substation
       across a report of a scheme that has none — on screen, in the
       CSV, and beside every distance. */
    station: station.Label
      || (station.Feature_Role === "poc" ? "Point of connection" : "Substation"),
    /* Which kind it is, so anything reading this can word itself
       correctly rather than guessing from the label. */
    stationRole: station.Feature_Role === "poc" ? "poc" : "substation",

    /* How far the origin sat from the nearest cable.

       Shown where it is more than the drawing tolerance, because a POC
       is allowed to reach across a road and reaching across a road is
       also how it could reach the wrong one. The number is on the
       report so the gap is a thing the designer sees and agrees with,
       rather than something absorbed quietly into every distance. */
    stationGapM: dist.rootGapM ?? 0,
    circuits,
    unreachable,
    totalMeters: meters.length,
    totalKva: Math.round(
      [...circuits, { totalKva: 0 }].reduce((t, c) => t + (c.totalKva || 0), 0) * 10) / 10,
  };
}

/* ── The source the network is fed from ──

   Volt drop starts at an impedance, not at zero. On a scheme we build
   that is the transformer's, looked up from the size chosen on the
   substation. On a connection to an existing network there is no
   transformer: the DNO declares an impedance at the point of
   connection, and that is the same number playing the same part.

   So the source is whichever the drawing has, reduced to the one field
   the volt drop reads. A substation supplies it through its transformer
   size; a POC supplies it directly, because there is no catalogue of
   somebody else's network to look it up in.

   Null where neither is on the drawing. The calculation already knows
   what to do with that — it starts from zero and says it did — and
   inventing a figure here would replace a stated unknown with a wrong
   answer nobody can see. */
export function sourceImpedance(origin, transformerSizes = []) {
  if (!origin) return null;

  if (origin.Feature_Role === "substation") {
    const id = origin.Attributes?.VD_Transformer_Size_ID;
    if (id == null) return null;
    return transformerSizes.find((t) =>
      String(t.Transformer_Size_ID) === String(id)) || null;
  }

  /* A POC, carrying what the DNO declared. Returned in the shape the
     volt drop expects rather than a shape of its own, so the two paths
     are one path from there on. */
  const z = origin.Attributes?.Source_Loop_Impedance_Ohm;
  if (z == null || z === "" || !(Number(z) > 0)) return null;
  return { Loop_Impedance_Ohm: Number(z), From_POC: true };
}

/* ── What the feeding network has already used ──

   Percent, declared on the POC by whoever read the DNO’s letter.

   A substation is the start of the network and has nothing upstream to
   account for, so it returns zero: the transformer’s own contribution
   is impedance and is already handled by sourceImpedance above.

   Guarded rather than trusted. This is typed into a box, and a negative
   or unparseable figure would make every downstream reading better than
   the truth — which is the one direction a wrong number here must not
   go. */
export function upstreamVoltDropPct(origin) {
  if (!origin || origin.Feature_Role !== "poc") return 0;
  const v = Number(origin.Attributes?.Source_Volt_Drop_Pct);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/* What to say when a check has run without one.

   Said, not hidden. Every figure downstream is lower than the truth by
   the same missing amount, so a marginal run reads as passing — and an
   unqualified pass is worse than no check at all, because somebody
   acts on it. */
export const NO_SOURCE_NOTE = "No source impedance \u2014 volt drop and loop "
  + "figures are cable only, so they read better than they will be. Set the "
  + "transformer size on the substation, or the DNO\u2019s declared loop "
  + "impedance on the POC.";

/* ── The voltage the network works at ──

   Every amp and every percentage in a levels check is computed against
   it: amps are kVA over root-three times V, and a volt drop is a
   proportion of it.

   It was a literal. Five copies of `Number(station?.Attributes?.Output_V)
   || 400` across two files, each reading a field that only a substation
   has — so on a POC-fed network all five found nothing and all five
   fell back to 400. Right for an ordinary LV connection, and stated
   nowhere: the drawing did not carry it, the export did not show it,
   and a POC at anything else would have been calculated at 400 with no
   sign of it.

   So it comes from whichever origin the network has, and the fallback
   is in one place. A POC carries its own because it is the DNO's
   figure at the point we connect; a substation carries its output
   voltage as it always did.

   400 remains the answer when neither says otherwise, because that is
   what an LV network runs at and refusing to calculate would help
   nobody. What changes is that it is one assumption rather than five,
   and the caller can ask whether it was assumed. */
export function workingVoltage(origin) {
  const said = origin?.Attributes?.Output_V;
  const v = Number(said);
  return Number.isFinite(v) && v > 0
    ? { volts: v, assumed: false }
    : { volts: SUB_DEFAULTS.Output_V, assumed: true };
}

/* Just the number, for the many callers that only want it. */
export const voltageOf = (origin) => workingVoltage(origin).volts;
