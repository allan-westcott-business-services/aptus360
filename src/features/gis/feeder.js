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

/* ── Where the network starts ──

   Moved to electric.js and re-exported here, because circuitReport
   needs it and lives there — electric.js imports nothing, so the
   dependency only runs one way.

   Re-exported rather than moved outright: eleven call sites and two
   checks import it from this module, and a rename that touches them all
   to move one function is a large diff hiding a small change. */
/* Imported and re-exported, not `export { x } from`. That form makes
   the name available to importers of this module and NOT to this
   module — buildFeederModel below calls it, and the bare re-export left
   it undeclared here. checkscope caught it; the browser would have
   caught it as a blank canvas. */
import { lvOrigin, lvOrigins } from "./electric.js";

export { lvOrigin, lvOrigins };


/* ── Who is on a circuit ──

   The two things buildFeederModel needs to prune a drawing down to one
   circuit: the plot seeds it serves, and the supplies on it that have no
   seed to be found by.

   `seedIds` is how an ordinary meter says which circuit it is on — the
   meter names its seed, or shares a Plot_ID with it. A non-residential
   supply cannot answer that way: since 0196 it has a seed of its own,
   but that seed has role 'nrs' and the model prunes against plots, so
   membership is carried by the meter's own Feature_ID in `meterIds`.

   ── Why this is a function and not two copies ──

   It was two copies. spanTrace gathered both sets; seedsOfCircuit in
   joints.js gathered only the seeds, under a comment saying it used
   "the same rule spanTrace uses" — true when it was written and not
   after supplies stopped being plots. The reader that was not told
   simply saw a circuit with fewer things on it, which is recurring
   fault 27 and reads as a quiet, plausible answer rather than an error.

   So: one walk, both readers, and a check that counts the callers. */
export function circuitMembership(features = [], circuitId) {
  const seedIds = new Set();
  const meterIds = new Set();

  for (const m of features) {
    if (m.Feature_Role !== "meter" || m.Layer_Key !== "electric") continue;
    if (Number(m.Attributes?.Circuit_ID) !== Number(circuitId)) continue;
    if (m.Attributes?.NRS_ID != null) { meterIds.add(Number(m.Feature_ID)); continue; }
    const sid = m.Attributes?.Seed_Feature_ID;
    if (sid != null) { seedIds.add(Number(sid)); continue; }
    const seed = features.find((f) => f.Feature_Role === "plot"
      && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));
    if (seed) seedIds.add(Number(seed.Feature_ID));
  }

  return { seedIds, meterIds };
}

/* ── The model ──
   Nodes, a tree rooted at the substation or the POC, and the load
   beyond each node. */
export function buildFeederModel(features = [], opts = {}) {
  const {
    lineTypes = [], plotById = () => null, seedIds = null,
    /* A non-residential supply is a meter with no plot behind it. Its
       load is the kVA the operator was asked for, on its own record. */
    nrsById = () => null,
    /* Which meters belong to the circuit being traced, by Feature_ID.
       Only consulted for supplies that have no plot seed: an ordinary
       meter's circuit is decided by whether its seed is in seedIds, and
       a non-residential supply has no seed to be in it. */
    meterIds = null,
    eps = CONNECT_EPS, tol = SNAP_TOL, fallbackKva = 0,
  } = opts;

  const nodes = [];
  const adj = new Map();

  /* Interning a point against the ones already found.

     This scanned every node for every point, which is O(n²) on the
     number of vertices in the drawing — and the drawing is every trench
     on the site, not just this circuit's. On an estate of a few hundred
     plots the scan alone was two thirds of the time a levels check took,
     and it runs again for every circuit.

     A grid of buckets `eps` across. Two points within `eps` of each
     other cannot be more than one bucket apart, so only the nine
     surrounding buckets need looking at, and the work stops growing with
     the size of the drawing.

     ── Same answer, not just a faster one ──

     The scan returned the first node within eps, which is the
     lowest-indexed one, which is the earliest inserted. Bucket order is
     not insertion order, so taking the first match found here would
     silently pick a different node when two candidates are both in
     range. It takes the lowest index instead, which is what the scan
     did. That case needs two existing nodes within half a metre of each
     other and is rare, but "rare" and "never" are different things when
     the answer decides which lengths of trench are one run. */
  const cell = Math.max(eps, 1e-6);
  const buckets = new Map();

  const intern = (p) => {
    const gx = Math.floor(p[0] / cell);
    const gy = Math.floor(p[1] / cell);
    let best = -1;
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let ay = gy - 1; ay <= gy + 1; ay++) {
        const b = buckets.get(`${ax},${ay}`);
        if (!b) continue;
        for (const i of b) {
          if (i > best && best >= 0) continue;
          if (dist(nodes[i], p) <= eps && (best < 0 || i < best)) best = i;
        }
      }
    }
    if (best >= 0) return best;

    nodes.push([p[0], p[1]]);
    const idx = nodes.length - 1;
    const k = `${gx},${gy}`;
    const b = buckets.get(k);
    if (b) b.push(idx); else buckets.set(k, [idx]);
    return idx;
  };
  /* Measured metres per edge, where somebody has entered a length.

     Keyed on the node pair; where two lines lay claim to one pair the
     shorter figure wins, so the answer is the same whichever order the
     drawing lists them in. */
  const edgeM = new Map();
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const addEdge = (a, b, svc, m = null) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, svc });
    adj.get(b).push({ to: a, svc });
    if (m != null) {
      const k = edgeKey(a, b);
      if (!edgeM.has(k) || m < edgeM.get(k)) edgeM.set(k, m);
    }
  };

  /* ── A measured length overrides the drawing ──

     Length_m on the line's attributes, entered by somebody who knows
     something the geometry does not: a duct that rises and falls, a
     trench dug round an obstruction, slack the plan cannot show. The
     drawn plan is flat and the cable is not, and the calculation should
     run on the cable.

     The segments are scaled so they still sum to the entered figure,
     which keeps a tee half way along the line half way along the
     measurement. The same attribute, and the same proportional rule,
     that distancesFrom in electric.js and the gas network already
     honour \u2014 one name for one fact, so the circuit report, the gas
     bill and the levels check cannot read three different lengths off
     one line. Geometry itself is untouched: the drawing still shows
     what was drawn, and snapping, joining and nearness all stay
     geometric \u2014 a measured length changes how far the electricity
     travels, not where the trench is. */
  const measuredScale = (f) => {
    const stated = Number(f.Attributes?.Length_m ?? 0) || 0;
    if (!(stated > 0)) return 1;
    const g = f.Geometry || [];
    let drawn = 0;
    for (let i = 1; i < g.length; i++) {
      drawn += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    }
    return drawn > 0 ? stated / drawn : 1;
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
    const scale = measuredScale(f);
    for (let i = 0; i + 1 < pts.length; i++) {
      addEdge(intern(pts[i]), intern(pts[i + 1]), svc,
        scale === 1 ? null : dist(pts[i], pts[i + 1]) * scale);
    }
  }
  if (!nodes.length) return { error: "No trenches to route cables along." };

  const origins = lvOrigins(features);
  if (!origins.length) {
    return {
      error: "Place a substation, or an electric POC on the mains trench "
        + "\u2014 feeders route back to one of them.",
    };
  }

  const nearest = (p) => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], p);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd };
  };

  /* ── Which origin, where there is more than one ──

     Circuits fed from different POCs can share a trench: the dig is
     civil work and the circuits are electrical facts, and a duct bank
     down one road can carry POC East's cable beside POC West's. So the
     trench component cannot decide the origin — an earlier version
     refused two POCs on one network, and refused exactly the drawing
     this exists for.

     The circuit decides, three ways, strongest first:

     1. Named. Circuit_Origin_ID on the circuit's meters \u2014 somebody
        said which POC feeds this circuit, and a statement beats any
        rule. Set from the POC's editor.
     2. A substation on the circuit's component. The incomer doctrine,
        unchanged: where a transformer stands on the network, feeders
        begin at it and a POC beside it is where the incomer arrives.
     3. Nearest along the network. Measured through the trenches (with
        measured lengths honoured), from where the circuit's first seed
        stands to each origin \u2014 not as the crow flies, because nearness
        across a fence is not a route. The model records that it chose
        (`originBy: "nearest"`, with the rivals named) so the build can
        say so out loud and the person can name the right one if the
        nearest is not it.

     A circuit whose component holds no origin at all is still refused:
     nothing feeds it, and no rule should pretend otherwise. */
  const compOf = new Array(nodes.length).fill(-1);
  {
    let c = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (compOf[i] >= 0) continue;
      const q = [i];
      compOf[i] = c;
      while (q.length) {
        const u = q.pop();
        for (const e of adj.get(u) || []) {
          if (compOf[e.to] < 0) { compOf[e.to] = c; q.push(e.to); }
        }
      }
      c++;
    }
  }
  const originAt = origins.map((o) => ({ o, at: nearest(o.Geometry[0]) }));
  const nameOrigin = (o) => (o.Feature_Role === "substation"
    ? (o.Label || "the substation") : (o.Label || `POC #${o.Feature_ID}`));

  let sub = originAt[0].o;
  let originBy = origins.length === 1 ? "only" : "first";
  let originRivals = [];
  if (origins.length > 1) {
    /* The circuit's own ground: its first seed or member meter, taken
       to the nearest trench node the same way the origins are. */
    let seedNode = -1;
    let named = null;
    for (const f of features) {
      const isSeed = seedIds?.size && f.Feature_Role === "plot"
        && seedIds.has(Number(f.Feature_ID));
      const isMember = meterIds?.size && f.Feature_Role === "meter"
        && meterIds.has(Number(f.Feature_ID));
      if (isMember && named == null
        && f.Attributes?.Circuit_Origin_ID != null) {
        named = Number(f.Attributes.Circuit_Origin_ID);
      }
      if (!isSeed && !isMember) continue;
      const g = (f.Geometry || [])[0];
      if (!g) continue;
      if (seedNode < 0) seedNode = nearest(g).i;
    }
    /* A named origin can be read off the meters even when the scope
       came in as seeds: the meter that carries the name is a member of
       the circuit whichever way the circuit was described. */
    if (named == null && seedIds?.size) {
      for (const f of features) {
        if (f.Feature_Role !== "meter") continue;
        const sid = f.Attributes?.Seed_Feature_ID;
        if (sid == null || !seedIds.has(Number(sid))) continue;
        if (f.Attributes?.Circuit_Origin_ID != null) {
          named = Number(f.Attributes.Circuit_Origin_ID);
          break;
        }
      }
    }

    if (named != null) {
      const hit = originAt.find(({ o }) => Number(o.Feature_ID) === named);
      if (!hit) {
        return {
          error: "This circuit names an origin that is not on the drawing "
            + "\u2014 re-pick which POC feeds it, from the POC's editor.",
        };
      }
      sub = hit.o;
      originBy = "named";
    } else if (seedNode >= 0) {
      const want = compOf[seedNode];
      const here = originAt.filter(({ at }) => compOf[at.i] === want);
      if (!here.length) {
        return {
          error: "This circuit's network has no origin on it \u2014 place a "
            + "substation or an electric POC on the trenches that serve it, "
            + "or name one from a POC's editor.",
        };
      }
      const subs = here.filter(({ o }) => o.Feature_Role === "substation");
      const pool = subs.length ? subs : here;
      if (pool.length === 1) {
        sub = pool[0].o;
        originBy = here.length === 1 ? "only" : "nearest";
        originRivals = here.filter((x) => x.o !== sub).map((x) => nameOrigin(x.o));
      } else {
        /* Nearest along the network: one walk out from the circuit's
           ground, over the same edges the cable would use, measured
           lengths and all. */
        const far = new Array(nodes.length).fill(Infinity);
        far[seedNode] = 0;
        const heap = [[0, seedNode]];
        while (heap.length) {
          heap.sort((x, y) => x[0] - y[0]);
          const [d, u] = heap.shift();
          if (d > far[u]) continue;
          for (const e of adj.get(u) || []) {
            const w = edgeM.get(edgeKey(u, e.to)) ?? dist(nodes[u], nodes[e.to]);
            if (d + w < far[e.to]) { far[e.to] = d + w; heap.push([d + w, e.to]); }
          }
        }
        pool.sort((x, y) => (far[x.at.i] - far[y.at.i])
          || (Number(x.o.Feature_ID) - Number(y.o.Feature_ID)));
        sub = pool[0].o;
        originBy = "nearest";
        originRivals = here.filter((x) => x.o !== sub).map((x) => nameOrigin(x.o));
      }
    }
  }

  /* ── Where a plot's load hangs ──

     At the far end of the plot's own service, which is the cut-out. Not
     at whatever node happens to be closest.

     Closest is what it used to be, and it is right only while the plot
     sits further up its spur than it does from the tee. A short garden
     is nearer the tee on the MAIN than its own cut-out — so the load
     attached to the main, the spur had nothing beyond it, and a spur
     with no load beyond it is not part of the feeder. No take-off, so
     no service joint, and a bottle end at the tee instead.

     That is why the gaps looked random. Two identical plots differ only
     by garden length: eleven metres up a twelve metre spur keeps its
     joint, four metres up loses it. Nothing in the joint rules varies.

     ── Which end is the far end ──

     A service trench meets the main at one end and the plot at the
     other. The tee is the end nearest a mains trench, so the cut-out is
     the other one — measured rather than assumed, because a service is
     drawn in whichever direction somebody drew it.

     The seed's own service trenches, found by the Seed_Feature_ID Auto
     Service stamps on them. A service drawn by hand carries no stamp
     and falls through to the old rule, which is what it always had. */
  const mainsLines = [];
  const svcBySeed = new Map();
  for (const f of features) {
    if (f.Feature_Type !== "line" || !isTrench(f, lineTypes)) continue;
    if ((f.Geometry || []).length < 2) continue;
    if (!isService(f)) { mainsLines.push(f.Geometry); continue; }
    const sid = f.Attributes?.Seed_Feature_ID;
    if (sid == null) continue;
    const k = Number(sid);
    if (!svcBySeed.has(k)) svcBySeed.set(k, []);
    svcBySeed.get(k).push(f);
  }

  const gapToMains = (pt) => {
    let best = Infinity;
    for (const g of mainsLines) {
      for (let i = 0; i + 1 < g.length; i++) {
        const d = distToSegment(pt, g[i], g[i + 1]);
        if (d < best) best = d;
      }
    }
    return best;
  };

  /* The end of this seed's service that is furthest from any main.

     Across every piece of it, because a service crossing the site
     boundary is split into two features and the cut-out is at the end
     of the last one. */
  const cutOutOf = (seedId) => {
    const svc = svcBySeed.get(Number(seedId));
    if (!svc?.length) return null;
    let bestPt = null, bestGap = -Infinity;
    for (const f of svc) {
      const g = f.Geometry;
      for (const pt of [g[0], g[g.length - 1]]) {
        const gap = gapToMains(pt);
        if (gap > bestGap) { bestGap = gap; bestPt = pt; }
      }
    }
    return bestPt;
  };

  const S = nearest(sub.Geometry[0]).i;
  if (S < 0) {
    return {
      error: sub.Feature_Role === "substation"
        ? "The substation isn\u2019t on the trench network."
        : "The electric POC isn\u2019t on the trench network.",
    };
  }

  /* Load attaches where the plot meets the network. The meter glyph sits
     beside its seed rather than on the trench, so the seed is the better
     anchor; the meter is the fallback for a meter with no seed. */
  const meterCount = new Array(nodes.length).fill(0);
  const meterKva = new Array(nodes.length).fill(0);
  /* WHICH meters landed on each node, not just how many.

     The counts above answer "how much load is here"; this answers "whose
     load is it", which is what a service tail needs — each meter has its
     own run from the main and its own cable, and the figure at a cut-out
     is the node's figure plus that particular customer's tail. A count
     cannot be resolved back to the meters that made it. */
  const metersAt = Array.from({ length: nodes.length }, () => []);
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

    /* A non-residential supply stands on its own — no plot, so no seed
       to prune against. Judged on its own membership instead, or it
       would be dropped from every circuit trace while still showing on
       the drawing. */
    const isNrs = m.Attributes?.NRS_ID != null;
    if (seedIds) {
      const inCircuit = isNrs
        ? !!(meterIds && meterIds.has(Number(m.Feature_ID)))
        : !!(seed && seedIds.has(Number(seed.Feature_ID)));
      if (!inCircuit) continue;
    }

    /* The cut-out first, then the seed, then the meter.

       The seed is a better anchor than the meter glyph, which sits
       beside the plot rather than on the dig — but both are only a
       guess at which node the load belongs to, and the plot's own
       service says it outright. */
    const cut = seed ? cutOutOf(seed.Feature_ID) : null;
    let nn = cut ? nearest(cut) : { i: -1, d: Infinity };
    if (nn.i < 0 || nn.d > tol) {
      const anchor = (seed?.Geometry || []).length ? seed.Geometry[0] : m.Geometry[0];
      nn = nearest(anchor);
    }
    if (nn.i < 0 || nn.d > tol) nn = nearest(m.Geometry[0]);

    if (nn.i >= 0 && nn.d <= tol) {
      meterCount[nn.i] += 1;
      /* Where the load comes from. A dwelling's is worked out from its
         house type and sits on the plot; a non-residential supply's is
         the figure the operator was asked to provide, and there is no
         plot to hold it. Both fall back the same way, so an unfilled
         record contributes nothing rather than a guess. */
      let kva;
      if (isNrs) {
        kva = nrsById(m.Attributes.NRS_ID)?.Requested_kVA;
      } else {
        const plot = m.Plot_ID != null ? plotById(m.Plot_ID) : null;
        kva = plot?.kva_load ?? plot?.KVA_Load;
      }
      const thisKva = kva != null && kva !== "" ? Number(kva) : fallbackKva;
      meterKva[nn.i] += thisKva;
      /* The meter itself and the load it brought, so a service tail can
         be worked out for this customer specifically. */
      metersAt[nn.i].push({ meter: m, kva: thisKva, plotId: m.Plot_ID ?? null,
        nrsId: isNrs ? m.Attributes.NRS_ID : null });
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

  /* The metres between two adjacent nodes, as the cable runs them:
     the measured figure where one was entered, the drawn distance
     everywhere else. Every reader that means "length of run" asks
     this; readers that mean "how near is this thing" keep asking the
     geometry, because a measured length does not move the trench. */
  const mBetween = (a, b) => edgeM.get(edgeKey(a, b)) ?? dist(nodes[a], nodes[b]);

  return {
    nodes, parent, parSvc, cum, cumKva, meterCount, meterKva, metersAt,
    S, order, attached, skipped, mBetween,
    /* How the origin was decided \u2014 "named", "only", "nearest" or
       "first" \u2014 and who lost where a rule had to choose, so a build
       can say which POC fed which circuit instead of leaving a two-POC
       drawing to be checked by eye. */
    originBy, originRivals,
    /* The origin this model is rooted at \u2014 the feature, so a caller
       reading source impedance or the declared upstream volt drop reads
       the figures of the origin the walk actually started from, not
       whichever one lvOrigin(features) happens to put first. */
    origin: sub,
  };
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

  /* ── The run carries on to the end of the dig ──

     A run of cable stops where the load stops: past the last plot there
     is nothing to carry, so the walk above ends the section at that
     take-off. The bottle end then lands on the same point as the
     service joint, and one fitting sits on top of the other.

     This used to be answered by drawing a metre and a half of trench
     nobody had dug — a synthetic tail continued off the bearing of the
     last segment, which could point through a boundary or across a
     carriageway and be a length on a bill for ground nobody could open.

     The designer lays the main two or three metres past the last plot
     instead, which is what happens on site anyway. So the run follows
     that dig to its end and the bottle end goes where the trench
     actually stops.

     ── Following it ──

     Onward along mains children whether they carry load or not, which
     is exactly what the walk above will not do. It stops while exactly
     one carries on: a fork past the last plot is two ends and no way to
     say which the cable takes, so the run stops at the fork and the
     drawing shows the question rather than answering it wrongly.

     Nothing is invented. Where the main stops dead at the last plot
     there is no onward trench, the run ends at the take-off, and the
     bottle end shares the point with the service joint as it always
     did — the drawing is telling the truth about a main that was not
     laid past the last plot.

     `bottleEndTailM` is gone. Anything still passing it is passing a
     setting nothing reads, which is why it is named here: the next
     person to search for it finds this. */
  for (const sec of sections) {
    if (loadChildren(sec.endNode).length) continue;

    const on = digEndBeyond(M, sec.endNode);
    if (!on.points.length) continue;

    for (const pt of on.points) sec.pts.push(pt);
    /* Marked for the canvas, so the trench laid under this section
       knows it runs past the load it serves, and the bottle end knows
       where to sit without re-deriving it. */
    sec.runsOn = true;
    sec.overrunM = on.metres;
    sec.tailAt = sec.pts[sec.pts.length - 1].slice();
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

/* ── How far the dig runs on past the last plot ──

   A run of cable stops where the load stops. Past the last plot there
   is nothing to carry, so the cable would end at that take-off and the
   bottle end would land on the service joint already there.

   The designer lays the main two or three metres past the last plot,
   which is what happens on site. This follows that length to its end,
   so the cable runs to the end of the dig and the bottle end goes where
   the trench actually stops.

   Onward while exactly one way carries on and it carries no load. A
   fork past the last plot is two ends and no way to say which the cable
   takes, so it stops at the fork: the drawing then shows the question
   instead of answering it wrongly. Load beyond means another circuit's
   run rather than this one's overrun, and that section will carry it.

   Returns the node the dig ends at, which is `from` where the main was
   not laid past the last plot — nothing invented, and the bottle end
   shares the point with the service joint exactly as it used to.

   Shared by spanTrace, which draws the cable, and planJoints, which
   seals it. They must agree about where a run ends: two walks would
   put the cable's end and its bottle end in different places. */
/* How far past the last plot still counts as this run's overrun.

   The designer lays the main two or three metres past the last plot.
   Anything much beyond that is not an overrun — it is main going
   somewhere else, and following it would run this circuit's cable the
   length of a shared road and seal it at another circuit's take-off.

   Which is what it did: a check caught circuit 1 sealing seventy metres
   along, on the node where circuit 2's supply tees in. That node
   carries no load IN CIRCUIT 1'S MODEL, because the model prunes other
   circuits out, so nothing in the walk could see what it was running
   past.

   Ten rather than three, so a designer who leaves five is not quietly
   ignored, and short enough that a shared main is never mistaken for
   it. */
export const OVERRUN_MAX_M = 10;

export function digEndBeyond(model, from) {
  const { nodes, parent, parSvc, cum } = model;

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const p = parent[i];
    if (p < 0) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(i);
  }

  const path = [];
  /* Guarded against a loop in the trench graph: a ring walked without
     this never stops. */
  const seen = new Set();
  let cur = from;
  let run = 0;
  while (!seen.has(cur)) {
    seen.add(cur);

    const kids = children.get(cur) || [];

    /* ── Somebody else's take-off ends the overrun ──

       A service spur leaving this node is a plot connected here,
       whether or not this circuit carries it. Running past it would
       seal this cable beyond a cut-out that belongs to another circuit.

       Tested on parSvc rather than on load, because the model prunes
       other circuits out: their spurs are still in the graph and their
       load is not, so load cannot see them. That is exactly what let
       the walk run seventy metres to another circuit's supply. */
    if (cur !== from && kids.some((c) => parSvc[c])) break;

    const onward = kids.filter((c) => !parSvc[c]);
    if (onward.length !== 1) break;
    const next = onward[0];
    if (cum[next] > 0) break;

    run += (model.mBetween ? model.mBetween(cur, next) : dist(nodes[cur], nodes[next]));
    path.push(next);
    cur = next;
  }

  /* ── All of it, or none ──

     The cap is on the whole overrun, not on each step. Applied per
     segment it would stop ten metres along a seventy metre main and
     seal there — a point chosen by where somebody happened to put a
     vertex, which is no answer at all, and a different answer on two
     drawings of the same road.

     Too long to be an overrun means the main is going somewhere else,
     and the honest response is to seal where the load stops, exactly as
     the drawing did before any of this. */
  if (run > OVERRUN_MAX_M) return { end: from, path: [], points: [], metres: 0, tooLong: run };

  return {
    end: cur, path, points: path.map((i) => nodes[i].slice()),
    /* How far it runs on, measured from the drawing. The cable records
       it so a reader can see the overrun without walking the geometry
       again. */
    metres: Math.round(run * 10) / 10,
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
   the origin — the substation, or the POC where there is none — as the
   network, and report everything else — with the
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

  /* ── The component holding the origin is the network ──

     The origin is the substation, or the electric POC where there is no
     substation. This looked for a substation and nothing else, so a
     site connected to an existing network — no transformer, everything
     feeding back to the point of connection — fell through to "largest
     by length", which is a guess dressed as an answer. On a drawing
     with one long orphaned branch it is the wrong guess, and the panel
     then told somebody their real network was the orphan.

     `lvOrigin` is the same answer the feeder build uses. Two functions
     disagreeing about where the network starts is how a check comes to
     pass a drawing the builder then refuses to route.

     Without either, the largest by length is still the best guess —
     and saying which assumption was made matters, because the answer
     changes if it is wrong. */
  /* Every origin's piece is the network \u2014 there can be more than one.

     A site fed from two points of connection is two self-contained
     networks on purpose, and calling the second an orphan would send
     somebody to join trenches that must not be joined. Each piece
     holding an origin is connected; an orphan is a piece holding none,
     and its gap is measured to whichever connected piece it comes
     closest to, because that is the join somebody would dig. */
  const subs = lvOrigins(features);
  const sub = subs[0] || null;
  const rootIds = new Set();
  let rootId = -1;
  let rootBy = "none";
  for (const o of subs) {
    let bd = Infinity, ri = -1;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], o.Geometry[0]);
      if (d < bd) { bd = d; ri = comp[i]; }
    }
    if (ri >= 0) {
      rootIds.add(ri);
      if (rootId < 0) { rootId = ri; rootBy = "origin"; }
    }
  }
  if (rootId < 0 && groups.length) {
    rootId = groups.reduce((best, g) => (g.metres > groups[best].metres ? g.id : best), 0);
    rootIds.add(rootId);
    rootBy = "largest";
  }

  /* For each orphan, the closest it comes to any connected piece and
     where. That pair of points is the gap to close. */
  const rootNodes = [];
  for (const g of groups) if (rootIds.has(g.id)) rootNodes.push(...g.nodeIndexes);
  for (const g of groups) {
    if (rootIds.has(g.id) || !rootNodes.length) { g.gap = null; continue;
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
    .filter((g) => !rootIds.has(g.id))
    .sort((a, b) => (a.gap?.metres ?? Infinity) - (b.gap?.metres ?? Infinity));

  /* Which piece holds an origin, per group, so a panel doesn't have
     to compare ids to find out. */
  /* `hasOrigin`, not `hasSubstation`: the thing it holds is a
     substation on most sites and an electric POC on the rest. */
  for (const g of groups) g.hasOrigin = rootIds.has(g.id);

  /* The connected piece first: it is the one nobody has to go and find,
     and everything else is measured against it. */
  groups.sort((a, b) => Number(b.hasOrigin) - Number(a.hasOrigin));

  return {
    groups, rootId, rootBy, orphans, nodes,
    connected: rootId >= 0 ? groups.find((g) => g.hasOrigin) ?? null : null,
    totalRuns: runs.length,
    /* Named for what a reader asks: how many pieces, is there a
       substation, and is it actually on the network. The last two are
       different questions — a substation placed beside the trenches
       rather than on them is a common and confusing case. */
    total: groups.length,
    hasOrigin: !!sub,
    originOnNetwork: rootBy === "origin",
    /* Which it is, so the panel can name it rather than saying
       "origin" at somebody. */
    originRole: sub?.Feature_Role ?? null,
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

/* ── A run of service trench is not always one feature ──

   splitByBoundary breaks a service where it crosses the site boundary,
   so a service teed off a main in the ROAD arrives as two: an off-site
   piece touching the main, and an on-site piece touching only the
   first. Drawing one in stages does the same thing.

   Judged one at a time, the inner piece has a main at neither end. It
   gets reported as unattached, and the gap quoted is the length of the
   piece it is joined to — which is the arithmetic that gives the game
   away.

   Our own services rarely show it: they tee off a main inside the site
   and never cross the boundary. The incumbent's main is in the road, so
   every self-lay service crosses it and every one splits.

   ── Why it lives here ──

   Two readers ask this question: layServices, which lays a cable along
   the run, and serviceTrenchCheck, which reports the ones that reach
   nothing. They had the same fault and were fixed a day apart, which is
   how a second copy starts. One walk, both callers.

   Returns a Map of service to the end that faces the main, because
   which end that is falls out of the walk and the caller that lays
   cable needs it. */
export function servicesReachingMains(services = [], mains = [], tol = CONNECT_EPS) {
  const endsOf = (f) => {
    const g = f.Geometry || [];
    return g.length >= 2 ? [g[0], g[g.length - 1]] : [];
  };
  const gapToLine = (pt, g) => {
    let best = Infinity;
    for (let i = 0; i + 1 < g.length; i++) {
      const d = distToSegment(pt, g[i], g[i + 1]);
      if (d < best) best = d;
    }
    return best;
  };

  const reach = new Map();
  const queue = [];

  for (const sv of services) {
    const ends = endsOf(sv);
    if (ends.length !== 2) continue;
    const at = ends.find((e) => mains.some((m) => gapToLine(e, m.Geometry || []) <= tol));
    if (at) { reach.set(sv, { teeEnd: at, parent: null }); queue.push(sv); }
  }

  while (queue.length) {
    const sv = queue.shift();
    const ends = endsOf(sv);
    const { teeEnd } = reach.get(sv);
    /* The far end is what a neighbour joins onto — the near end is
       already at the main. */
    const far = ends.find((e) => e !== teeEnd) ?? ends[1];

    for (const other of services) {
      if (reach.has(other)) continue;
      const oEnds = endsOf(other);
      if (oEnds.length !== 2) continue;
      const joined = oEnds.find((e) => dist(e, far) <= tol);
      if (!joined) continue;
      reach.set(other, { teeEnd: joined, parent: sv });
      queue.push(other);
    }
  }

  return reach;
}

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

  /* Reached directly, or through the pieces between. See
     servicesReachingMains: a run split at the site boundary is two
     features and only one of them touches the main. */
  const reach = servicesReachingMains(services, mains, eps);

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

    /* Reaching a main through the rest of its own run counts as
       reaching it. The gap on the row is still this piece's own
       distance, which is what somebody would measure on the drawing. */
    if (!reach.has(sv)) { orphans.push(row); continue; }
    if (gap > eps) continue;
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
    /* Non-residential supplies, so their requested kVA reaches the
       model. Absent, one contributes no load and the circuit reads
       lighter than it is. */
    nrsById = () => null,
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
  if (!node || (node.Feature_Role !== "spannode"
    && node.Feature_Role !== "feederpoint")) {
    return { error: "Select a feeder point or span node." };
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

  /* Only this circuit's plots and supplies, so the model prunes branches
     serving someone else's. */
  const { seedIds, meterIds } = circuitMembership(features, circuitId);
  /* Either kind is something to trace. A circuit serving one commercial
     unit and no dwellings is a real circuit, and refusing it for having
     no metered plots would be refusing it for the wrong reason. */
  if (!seedIds.size && !meterIds.size) {
    return { error: `${circuitName} has no supplies on it — nothing to trace.` };
  }

  const M = buildFeederModel(features, { lineTypes, plotById, nrsById, seedIds, meterIds });
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
    /* ── The circuit's own points, where it has them ──

     A feeder point is the cable's junction: one circuit's, placed
     where THAT circuit's run ends or forks, carrying its own cable and
     sequence. Where the circuit has any, they are the stops, and span
     nodes go back to being facts about the dig \u2014 two circuits through
     one trench junction are two feeder points at one location, each
     with its own figures, which is what one span node could never
     honestly hold. A drawing from before feeder points existed has
     none, and its span nodes go on working exactly as they did. */
  const stopRole = features.some((f) => f.Feature_Role === "feederpoint"
    && Number(f.Attributes?.Circuit_ID) === Number(circuitId))
    ? "feederpoint" : "spannode";

  for (const sn of features) {
    if (sn.Feature_Role !== stopRole) continue;
    const own = sn.Attributes?.Circuit_ID;
    if (stopRole === "feederpoint") {
      if (Number(own) !== Number(circuitId)) continue;
    } else if (own != null && Number(own) !== Number(circuitId)) continue;
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
    if (sn.Feature_Role !== stopRole) continue;
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
    /* Same rule as above: this circuit's \u2014 strictly so for a feeder
       point, which always names one \u2014 or a span node naming none. */
    const own = sn.Attributes?.Circuit_ID;
    if (stopRole === "feederpoint") {
      if (Number(own) !== Number(circuitId)) continue;
    } else if (own != null && Number(own) !== Number(circuitId)) continue;
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
    const len = metres + (M.mBetween
      ? M.mBetween(prev, cur) : dist(nodes[prev], nodes[cur]));
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
    const between = model.mBetween || ((x, y) => dist(nodes[x], nodes[y]));
    for (const k of kids.get(u) || []) {
      const d = reach[k] + between(u, k);
      if (d < best) best = d;
    }
    reach[u] = best;
  }

  const nearestFirst = (from) => (kids.get(from) || [])
    .slice()
    .sort((a, b) => {
      const between = model.mBetween || ((x, y) => dist(nodes[x], nodes[y]));
      const da = reach[a] + between(from, a);
      const db = reach[b] + between(from, b);
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
