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

     Twenty-five metres is a working figure rather than a standard —
     worth setting per operator once someone says what theirs is. */
  const { eps = 0.25, maxServiceM = 25 } = opts;

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
    const maxCrossM = opts.maxCrossM ?? 30;

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

/* Cheapest paths from a set of nodes, by cost rather than by length. */
function spreadFrom(graph, sources, rate) {
  const { nodes, edges, adj } = graph;
  const cost = new Array(nodes.length).fill(Infinity);
  const via = new Array(nodes.length).fill(-1);
  const from = new Array(nodes.length).fill(-1);

  /* A plain queue rather than a heap: a site plan is hundreds of nodes,
     and the difference is not measurable against the clarity. */
  const seen = new Set();
  for (const s of sources) cost[s] = 0;

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
      if (c < cost[to]) { cost[to] = c; via[to] = edge; from[to] = best; }
    }
  }
  return { cost, via, from };
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
    for (const o of pending) {
      for (const f of o.feet) {
        const c = cost[f.node];
        if (c === Infinity) continue;
        const total = c + f.serviceM * rates.service;
        if (!pick || total < pick.total) pick = { o, f, total, mains: c };
      }
    }
    if (!pick) break;

    /* Walk the chosen path back, marking its edges live. */
    let at = pick.f.node;
    while (at !== -1 && !inTree.has(at)) {
      const e = via[at];
      if (e < 0) break;
      liveEdges.add(e);
      inTree.add(at);
      at = from[at];
    }
    inTree.add(pick.f.node);

    served.push({
      meter: pick.o.meter,
      foot: nodes[pick.f.node],
      footNode: pick.f.node,
      serviceM: Math.round(pick.f.serviceM * 100) / 100,
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

  return {
    ok: true,
    graph,
    root,
    liveEdges: [...liveEdges],
    live,
    served,
    unreachable,
    /* End points: live nodes with nothing live beyond them. Where a
       trench stops. */
    ends: endPointsOf(graph, liveEdges, root),
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
