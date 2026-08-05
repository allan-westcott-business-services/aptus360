/* Working out which of the drawn trenches actually need digging.

   Draw a candidate trench in front of every plot, on both sides of every
   road, all joined back to the substation. This decides which of those
   sections have to be live to reach every meter, and what it costs.

   ── The problem ──

   The candidates are a graph: lengths between junctions. The substation
   is the root, every meter must be reached, and junctions are optional —
   used where they help and left out where they do not. Finding the
   cheapest sub-network that connects them all is the Steiner tree
   problem, which is NP-hard to solve exactly.

   That matters less than it sounds. The shortest-path heuristic used
   here is provably within twice optimal and on road-shaped graphs lands
   within a few percent, in milliseconds. Nobody would notice the
   difference from optimal on a site plan; everybody would notice it
   taking an hour.

   ── Why the meters are not the terminals ──

   A service leaves the main at a right angle, so what the mains network
   must reach is not the meter but the foot of that perpendicular — and a
   meter between two roads has a foot on each. Which foot to use is part
   of the answer, not an input to it: choosing the nearest one per plot
   is exactly how a scheme ends up trenching both sides of a street to
   save a few metres of service.

   So each meter offers several feet, and the cheapest is chosen against
   the network as it grows. Once a branch exists, every foot on it is
   nearly free, which is what makes plots share a run.

   ── The cost ──

   Mains and service are charged at different rates, and both are in the
   objective. Leaving the service out makes the far side of the road look
   free and produces confidently wrong answers. */

export const DEFAULT_RATES = {
  mains: 10,      // £ per metre of mains trench
  service: 7,     // £ per metre of service trench
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Where a point lands on a segment, and how far off it is.

   Clamped to the ends: a meter beyond the end of a trench has its foot
   at the end, not out in the field on the line's extension. */
export function footOnSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return { point: [a[0], a[1]], t: 0, d: dist(p, a) };

  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = [a[0] + vx * t, a[1] + vy * t];
  return { point, t, d: dist(p, point) };
}

/* The candidate network as a graph, split wherever a service will tee
   in.

   Splitting matters: a trench is live from the substation as far as the
   last foot on it and no further, and that can only be said if the foot
   is a node. Without it the whole section is either in or out. */
export function buildGraph(trenches = [], meters = [], opts = {}) {
  /* The longest service anybody would actually run.

     Not a search bound — a constraint on the answer. At £7 a metre
     against £10 for mains, a fifty-metre service is cheaper than digging
     thirty metres of main to reach the same house, so without a limit
     the cheapest plan runs long services back to whatever is already
     dug. It is cheaper on paper and no jointer would build it: volt drop
     on a service that length is unacceptable and most operators cap it
     by rule.

     Ten metres, which is what Aptus works to. It is the strongest lever
     on the shape of the answer: raise it and the plan digs less main and
     runs longer services, lower it and the reverse. */
  const { eps = 0.25, maxServiceM = 10 } = opts;

  const nodes = [];
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };

  /* Every segment of every candidate, with the feet that land on it. */
  const segments = [];
  for (const t of trenches) {
    const g = t.Geometry || [];
    for (let i = 0; i + 1 < g.length; i++) {
      segments.push({ a: g[i], b: g[i + 1], trench: t, feet: [] });
    }
  }

  /* For each meter, every foot within reach — one per segment it could
     realistically be served from. A limit keeps a meter from claiming a
     foot on the far side of the site, which is not a service anybody
     would dig. */
  const options = meters.map((m) => {
    const p = (m.Geometry || [])[0];
    const out = { meter: m, feet: [] };
    if (!p) return out;

    for (const seg of segments) {
      const f = footOnSegment(p, seg.a, seg.b);
      if (f.d > maxServiceM) continue;
      const foot = { seg, point: f.point, t: f.t, serviceM: f.d };
      out.feet.push(foot);
      /* And onto the segment, which is what the splitting reads.

         Recorded only on the meter at first, so the split loop found no
         feet and left every candidate as one long edge — the feet became
         isolated nodes with no way to reach them, and nothing could be
         served. */
      seg.feet.push(foot);
    }
    /* Nearest first, so a tie between two equal feet resolves the same
       way every run. */
    out.feet.sort((x, y) => x.serviceM - y.serviceM);
    return out;
  });

  /* Links the router may dig between one run and another.

     A drawing of loops and parallel runs says where trench may go, not
     where it must join. Getting from the near side of a road to the far
     side often costs less as a short perpendicular link than as a long
     way round the loop — and that link is a trench nobody drew, because
     nobody knew where it would be wanted until the routing was done.

     ── Where a link may start ──

     From points that already matter: a service foot, a junction, the end
     of a run. A link from an arbitrary point is no cheaper between
     parallel runs — the perpendicular distance is the same wherever it
     is taken — and anchoring at real points keeps the graph small and
     the answer explicable. On runs that are not parallel it is an
     approximation, and a close one.

     ── Why it is capped ──

     Without a limit every run is linked to every other and the graph
     grows with the square of the drawing. The cap is also physical: a
     link across sixty metres of somebody's garden is not a link. */
  const crossings = [];
  if (opts.crossings !== false) {
    /* The longest link the router may dig between one run and another.

       Six metres, which is a road crossing or a step between a run and
       the one behind it — the jump a gang would actually make. Thirty,
       the first figure here, let the router link runs on opposite sides
       of a green and produced answers that were cheap on paper and not
       what anybody would build. */
    const maxCrossM = opts.maxCrossM ?? 6;

    /* The points worth starting a link from.

       The ends of the run, and the point on it nearest each meter —
       whether or not that meter can be served from there.

       Anchoring on the feet alone was wrong: a foot only exists where a
       service is short enough to be allowed, so tightening the service
       cap removed the anchors that would have let the router cross to
       reach the house instead. The cap and the crossings then worked
       against each other, and a house just out of service range had
       neither a service nor a link.

       The nearest point to a meter is where a link wants to be whatever
       the cap says, because that is where the house is. */
    const anchorsOf = (seg) => {
      const out = [{ point: seg.a }, { point: seg.b }];
      for (const m of meters) {
        const p = (m.Geometry || [])[0];
        if (!p) continue;
        const f = footOnSegment(p, seg.a, seg.b);
        out.push({ point: f.point });
      }
      return out;
    };

    for (const from of segments) {
      for (const to of segments) {
        if (from === to) continue;
        /* One direction only — a link is the same trench whichever end
           it is measured from, and both directions would dig it twice. */
        if (segments.indexOf(from) > segments.indexOf(to)) continue;
        if (from.trench === to.trench) continue;

        for (const anc of anchorsOf(from)) {
          const f = footOnSegment(anc.point, to.a, to.b);
          if (f.d < eps || f.d > maxCrossM) continue;
          /* Landing on the very end of the far run means the two already
             meet there; a link would be zero-length or duplicate a
             junction. */
          if (f.t <= 0 || f.t >= 1) continue;
          crossings.push({
            from: anc.point, to: f.point, len: f.d,
            /* Both segments, because both have to be split.

               Only the target was recorded at first, so a link's far end
               joined the run it landed on and its near end sat as an
               isolated node — attached to nothing, and the whole
               crossing therefore useless. Nothing was served and the
               reason was invisible. */
            seg: to, fromSeg: from,
          });
        }
      }
    }

    /* A crossing lands part way along its target, so that segment has to
       be split there too — the same reason feet are split. */
    for (const c of crossings) {
      c.seg.feet.push({
        point: c.to, serviceM: 0, generated: true,
        t: footOnSegment(c.to, c.seg.a, c.seg.b).t,
      });
      c.fromSeg.feet.push({
        point: c.from, serviceM: 0, generated: true,
        t: footOnSegment(c.from, c.fromSeg.a, c.fromSeg.b).t,
      });
    }
  }

  /* Split each segment at its feet and build the edges. */
  const edges = [];
  for (const seg of segments) {
    const cuts = [
      { t: 0, point: seg.a },
      { t: 1, point: seg.b },
      ...seg.feet.map((f) => ({ t: f.t, point: f.point })),
    ].sort((x, y) => x.t - y.t);

    for (let i = 0; i + 1 < cuts.length; i++) {
      const u = intern(cuts[i].point);
      const v = intern(cuts[i + 1].point);
      if (u === v) continue;
      const len = dist(nodes[u], nodes[v]);
      if (len <= eps) continue;
      edges.push({ u, v, len, trench: seg.trench });
    }
  }

  /* The generated links, as edges. Marked so the canvas can draw them
     differently — a trench the router is proposing is not the same thing
     as one somebody drew. */
  for (const c of crossings) {
    const u = intern(c.from);
    const v = intern(c.to);
    if (u === v) continue;
    edges.push({ u, v, len: c.len, trench: null, generated: true });
  }

  /* Feet resolved to node indices now that every point is interned. */
  for (const o of options) {
    for (const f of o.feet) f.node = intern(f.point);
  }

  const adj = new Map();
  edges.forEach((e, i) => {
    if (!adj.has(e.u)) adj.set(e.u, []);
    if (!adj.has(e.v)) adj.set(e.v, []);
    adj.get(e.u).push({ to: e.v, edge: i });
    adj.get(e.v).push({ to: e.u, edge: i });
  });

  return { nodes, edges, adj, options, intern };
}

/* Cheapest paths from a set of nodes, by cost rather than by length.

   Length is carried alongside cost because the two answer different
   questions: cost decides which route is worth digging, length decides
   whether the cable can survive it. */
function spreadFrom(graph, sources, rate) {
  const { nodes, edges, adj } = graph;
  const cost = new Array(nodes.length).fill(Infinity);
  const via = new Array(nodes.length).fill(-1);
  const from = new Array(nodes.length).fill(-1);
  const along = new Array(nodes.length).fill(Infinity);

  /* A plain queue rather than a heap: a site plan is hundreds of nodes,
     and the difference is not measurable against the clarity. */
  const seen = new Set();
  for (const s of sources) { cost[s] = 0; along[s] = 0; }

  for (;;) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (seen.has(i) || cost[i] === Infinity) continue;
      if (best < 0 || cost[i] < cost[best]) best = i;
    }
    if (best < 0) break;
    seen.add(best);

    for (const { to, edge } of adj.get(best) || []) {
      const c = cost[best] + edges[edge].len * rate;
      if (c < cost[to]) {
        cost[to] = c; via[to] = edge; from[to] = best;
        along[to] = along[best] + edges[edge].len;
      }
    }
  }
  return { cost, via, from, along };
}

/* The sections that have to be live, and what they cost.

   Grown one meter at a time: the meter whose cheapest connection is
   cheapest joins first, its path is added to the tree, and every other
   meter is reconsidered against the larger tree. That is what makes
   plots share a branch — once a run exists, the feet on it cost almost
   nothing to reach. */
export function planRoute(trenches = [], meters = [], substation, opts = {}) {
  const rates = { ...DEFAULT_RATES, ...(opts.rates || {}) };
  const graph = buildGraph(trenches, meters, opts);
  const { nodes, edges, options } = graph;

  const subPt = (substation?.Geometry || [])[0];
  if (!subPt) return { error: "No substation on the drawing." };
  if (!edges.length) return { error: "No candidate trenches to route along." };

  /* The substation joins the network at the nearest node — it sits on a
     trench end in practice, and this tolerates it being a little off. */
  let root = 0;
  let rootD = Infinity;
  nodes.forEach((n, i) => {
    const d = dist(n, subPt);
    if (d < rootD) { rootD = d; root = i; }
  });

  /* The furthest any meter may sit from the substation along the cable.

     This is the constraint a plain Steiner tree does not have, and
     without it the answer is quietly unbuildable. Minimising total
     trench is not the same as minimising the run to each house: a
     network can be shortest overall and still put the last plot six
     hundred metres from the substation, which no LV feeder will hold up
     under. The volt drop check would then fail on a route the router had
     just proposed as optimal.

     Enforced as a length rather than as volt drop because the cable size
     is not known while the trench is being planned — and length is what
     someone can reason about standing on the site. The levels check
     remains the arbiter afterwards; this only keeps the proposal within
     reach of passing it.

     Six hundred metres, which is what Aptus works to. Raise it and the
     plan gets shorter and deeper; lower it and it digs more direct runs
     from the substation, which costs trench and saves cable.

     It is a bound on the proposal, not a guarantee about volt drop —
     six hundred metres of undersized cable will still fail the levels
     check, and should. This only keeps the router from proposing a
     network that has no chance of passing it. */
  const maxRunM = opts.maxRunM ?? 600;

  /* How far each node in the tree already is from the substation, along
     the tree rather than as the crow flies. A meter attached to a node
     inherits its depth plus the path taken to get there. */
  const depth = new Map([[root, 0]]);

  const inTree = new Set([root]);
  const liveEdges = new Set();
  const served = [];
  const unreachable = [];

  const pending = options.filter((o) => o.feet.length);
  for (const o of options) if (!o.feet.length) unreachable.push(o.meter);

  let guard = 0;
  while (pending.length && guard++ < options.length + 2) {
    const { cost, via, from } = spreadFrom(graph, [...inTree], rates.mains);

    /* The cheapest way to bring any one meter in: the mains needed to
       reach a foot, plus the service from that foot. */
    let pick = null;
    let overLong = 0;
    for (const o of pending) {
      for (const f of o.feet) {
        const c = cost[f.node];
        if (c === Infinity) continue;

        /* How far this meter would end up from the substation: the tree
           depth of wherever the new path leaves it, plus the path
           itself, plus the service.

           `from` walks back to a node already in the tree, and that
           node's depth is known — so the run is that depth plus the
           length added on the way out. */
        let at = f.node;
        let added = 0;
        let guard2 = 0;
        while (at !== -1 && !inTree.has(at) && guard2++ < nodes.length) {
          const e = via[at];
          if (e < 0) break;
          added += edges[e].len;
          at = from[at];
        }
        const run = (depth.get(at) ?? 0) + added + f.serviceM;
        if (run > maxRunM) { overLong += 1; continue; }

        const total = c + f.serviceM * rates.service;
        if (!pick || total < pick.total) {
          pick = { o, f, total, mains: c, run, attach: at, added };
        }
      }
    }
    if (!pick) break;

    /* Walk the chosen path back, marking its edges live and recording
       how far each new node sits from the substation. */
    {
      const chain = [];
      let at = pick.f.node;
      while (at !== -1 && !inTree.has(at)) {
        const e = via[at];
        if (e < 0) break;
        chain.push({ node: at, edge: e });
        at = from[at];
      }
      /* Outwards from the tree, so each node's depth is set after its
         parent's — walking the other way would read a depth that is not
         there yet. */
      let d = depth.get(at) ?? 0;
      for (let i = chain.length - 1; i >= 0; i--) {
        liveEdges.add(chain[i].edge);
        inTree.add(chain[i].node);
        d += edges[chain[i].edge].len;
        depth.set(chain[i].node, d);
      }
      inTree.add(pick.f.node);
      if (!depth.has(pick.f.node)) depth.set(pick.f.node, d);
    }

    served.push({
      meter: pick.o.meter,
      foot: nodes[pick.f.node],
      footNode: pick.f.node,
      serviceM: Math.round(pick.f.serviceM * 100) / 100,
      /* The distance the cable actually runs — what the levels check
         will be working with. */
      runM: Math.round(pick.run * 10) / 10,
    });
    pending.splice(pending.indexOf(pick.o), 1);
  }

  for (const o of pending) unreachable.push(o.meter);

  const live = [...liveEdges].map((i) => edges[i]);
  const mainsM = live.reduce((t, e) => t + e.len, 0);
  const serviceM = served.reduce((t, s) => t + s.serviceM, 0);

  /* Everything drawn, for comparison — the saving is the point, and a
     figure with nothing to compare it against says little. */
  const drawnM = edges.reduce((t, e) => t + e.len, 0);

  /* How much of each drawn candidate is actually needed.

     A trench can be live for part of its length and dead beyond the last
     plot it serves, and marking the whole feature would overstate the
     dig — on a two-hundred-metre run serving houses over the first fifty,
     by four times.

     Recorded as a length as well as a flag, so a schedule can quote what
     is needed rather than what was drawn. Splitting the feature would be
     the tidier answer and is deliberately not done: keeping the drawing
     as it was is worth more than a neat trench list. */
  const perTrench = new Map();
  for (const e of live) {
    if (!e.trench) continue;
    const id = e.trench.Feature_ID;
    perTrench.set(id, (perTrench.get(id) || 0) + e.len);
  }

  /* Links the router invented, in the order they would be drawn. These
     do not exist yet and have to be created if the plan is accepted —
     without them the marked network has gaps. */
  const newLinks = live
    .filter((e) => e.generated)
    .map((e) => ({
      from: nodes[e.u], to: nodes[e.v], len: Math.round(e.len * 100) / 100,
    }));

  return {
    ok: true,
    graph,
    /* Trench_ID -> metres needed. */
    liveByTrench: [...perTrench].map(([id, m]) => ({
      Feature_ID: id, liveM: Math.round(m * 10) / 10,
    })),
    newLinks,
    root,
    liveEdges: [...liveEdges],
    live,
    served,
    unreachable,
    /* End points: live nodes with nothing live beyond them. Where a
       trench stops. */
    ends: endPointsOf(graph, liveEdges, root),
    /* The longest run any meter ends up with, which is what decides
       whether the levels check will pass. Reported whether or not it
       binds, because a plan sitting just inside the limit is worth
       knowing about before the cable sizes are chosen. */
    longestRunM: served.length
      ? Math.round(Math.max(...served.map((x) => x.runM)) * 10) / 10
      : 0,
    maxRunM,
    mainsM: Math.round(mainsM * 10) / 10,
    serviceM: Math.round(serviceM * 10) / 10,
    drawnM: Math.round(drawnM * 10) / 10,
    mainsCost: Math.round(mainsM * rates.mains),
    serviceCost: Math.round(serviceM * rates.service),
    drawnCost: Math.round(drawnM * rates.mains),
    rates,
  };
}

/* Tracing every meter back to the substation by its own shortest route.

   A different question from the one planRoute answers, and a better one
   for an LV network.

   ── Why this rather than the cheapest network ──

   Minimising total trench gives the smallest dig, but it does so by
   making meters share long routes — and a shared route is a longer route
   for whoever is at the end of it. The volt drop is then decided by the
   trench plan, which is backwards: the cable has to survive the route,
   so the route should be as short as it can be for every meter.

   Here each meter takes the shortest path it can, independently. The
   union of those paths is the trench that must be dug, and no meter is
   further from the substation than the site allows.

   ── What the counts are for ──

   A section used by forty meters is carrying forty properties, and one
   used by two is a spur. That is the trunk of the network, and it is
   also, near enough, the load: what a section carries is what decides
   the cable size, so the same figure that says "this is the main run"
   says "this is the run that needs the big cable".

   A section used by nobody is trench nobody needs. */
export function traceAll(trenches = [], meters = [], substation, opts = {}) {
  const rates = { ...DEFAULT_RATES, ...(opts.rates || {}) };
  const graph = buildGraph(trenches, meters, opts);
  const { nodes, edges, options } = graph;

  const subPt = (substation?.Geometry || [])[0];
  if (!subPt) return { error: "No substation on the drawing." };
  if (!edges.length) return { error: "No trenches to trace along." };

  let root = 0;
  let rootD = Infinity;
  nodes.forEach((n, i) => {
    const d = dist(n, subPt);
    if (d < rootD) { rootD = d; root = i; }
  });

  /* One spread from the substation serves every meter: the shortest path
     tree. Distance rather than cost, because what matters here is how
     far the cable runs, not what the ground costs to open. */
  const { cost, via, from } = spreadFrom(graph, [root], 1);

  const uses = new Map();          // edge index -> how many meters use it
  const served = [];
  const unreachable = [];
  const maxRunM = opts.maxRunM ?? 600;

  for (const o of options) {
    /* The foot giving the shortest total run — mains from the
       substation plus the service to the meter. */
    let best = null;
    for (const f of o.feet) {
      const d = cost[f.node];
      if (d === Infinity) continue;
      const run = d + f.serviceM;
      if (!best || run < best.run) best = { f, run, node: f.node };
    }
    if (!best || best.run > maxRunM) { unreachable.push(o.meter); continue; }

    /* Walk back, counting each section as used once by this meter. */
    let at = best.node;
    let guard = 0;
    while (at !== root && at !== -1 && guard++ < nodes.length) {
      const e = via[at];
      if (e < 0) break;
      uses.set(e, (uses.get(e) || 0) + 1);
      at = from[at];
    }

    served.push({
      meter: o.meter,
      foot: nodes[best.node],
      footNode: best.node,
      serviceM: Math.round(best.f.serviceM * 100) / 100,
      runM: Math.round(best.run * 10) / 10,
    });
  }

  const used = [...uses].map(([i, n]) => ({ ...edges[i], index: i, uses: n }));
  const mainsM = used.reduce((t, e) => t + e.len, 0);
  const serviceM = served.reduce((t, s) => t + s.serviceM, 0);
  const drawnM = edges.reduce((t, e) => t + e.len, 0);

  /* Per drawn trench, so the drawing can be marked: how much of it is
     used, and the heaviest count anywhere on it. */
  const perTrench = new Map();
  for (const e of used) {
    if (!e.trench) continue;
    const id = e.trench.Feature_ID;
    const prev = perTrench.get(id) || { liveM: 0, peak: 0 };
    perTrench.set(id, {
      liveM: prev.liveM + e.len,
      peak: Math.max(prev.peak, e.uses),
    });
  }

  return {
    ok: true,
    graph,
    root,
    used,
    uses,
    served,
    unreachable,
    /* The busiest section on the drawing, which the shading scales
       against. */
    peak: used.reduce((m, e) => Math.max(m, e.uses), 0),
    liveByTrench: [...perTrench].map(([id, v]) => ({
      Feature_ID: id,
      liveM: Math.round(v.liveM * 10) / 10,
      peakUses: v.peak,
    })),
    newLinks: used.filter((e) => e.generated).map((e) => ({
      from: nodes[e.u], to: nodes[e.v], len: Math.round(e.len * 100) / 100,
    })),
    ends: endPointsOf(graph, new Set([...uses.keys()]), root),
    longestRunM: served.length
      ? Math.round(Math.max(...served.map((x) => x.runM)) * 10) / 10
      : 0,
    maxRunM,
    mainsM: Math.round(mainsM * 10) / 10,
    serviceM: Math.round(serviceM * 10) / 10,
    drawnM: Math.round(drawnM * 10) / 10,
    mainsCost: Math.round(mainsM * rates.mains),
    serviceCost: Math.round(serviceM * rates.service),
    drawnCost: Math.round(drawnM * rates.mains),
    rates,
  };
}

/* Where the live network stops.

   A node on a live edge with only one live edge touching it, and not the
   root. That is the end of a run and where the trench schedule stops. */
export function endPointsOf(graph, liveEdges, root) {
  const count = new Map();
  for (const i of liveEdges) {
    const e = graph.edges[i];
    count.set(e.u, (count.get(e.u) || 0) + 1);
    count.set(e.v, (count.get(e.v) || 0) + 1);
  }
  return [...count]
    .filter(([node, n]) => n === 1 && node !== root)
    .map(([node]) => ({ node, point: graph.nodes[node] }));
}
