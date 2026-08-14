import { spanLabel, circuitLetter } from "./electric.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* The spans between two span nodes, for a mains call-off.

   A call-off names a run of mains — A1 to A5 — and the gang needs three
   things per span: which two nodes it runs between, how much cable and
   trench there is between them, and which plots are connected along it.

   ── Why the plots matter ──

   A span with eight plots on it is a different day's work from a span
   with none, and the plots are what the site knows the run by. "A3 to
   A4" means nothing to anybody standing on the road; "A3 to A4, plots 12
   to 19" means something.

   ── The path between two nodes ──

   Both nodes are on the same circuit, so there is exactly one route
   between them through the network — a circuit is a tree from the
   substation. The route is found by walking each node's ancestry back to
   the substation and meeting in the middle. */

/* spanNodesOf was here: every span node on a circuit, filtered by
   Circuit_ID.

   Removed rather than left. Nothing called it, and span nodes placed
   from the trench network carry no Circuit_ID — so anybody reaching for
   it would have got an empty list and spent a while working out why. */

/* A node's label, as it reads on the drawing. */
/* Two node labels, smallest first.

   A run picked from A20 back to A19 is the same run as A19 to A20, and
   naming it by the order somebody happened to click reads as though the
   two were different. The number decides, not the clicking.

   Labels that are not A-then-a-number fall back to comparing as text,
   which at least puts them in a stable order. */
export function orderPair(a, b) {
  const num = (l) => {
    const m = String(l ?? "").match(/^([A-Za-z]*)(\d+)$/);
    return m ? { prefix: m[1], n: Number(m[2]) } : null;
  };
  const na = num(a);
  const nb = num(b);
  if (na && nb && na.prefix === nb.prefix) {
    return na.n <= nb.n ? [a, b] : [b, a];
  }
  return String(a ?? "").localeCompare(String(b ?? "")) <= 0 ? [a, b] : [b, a];
}

export function labelOf(node) {
  /* The label as stored, first.

     Span nodes are placed from the trench network now and carry a
     Span_Label and nothing else — no circuit, because no circuit exists
     when the trenches are drawn. Computing the label from Circuit_ID
     and Span_Seq therefore returned null for every one of them, and a
     call-off came out reading "Span Node null to null".

     The computed form stays for nodes made by an older build, which
     carry the circuit and may not carry a label. */
  const stored = node?.Attributes?.Span_Label;
  if (stored) return String(stored);

  const c = Number(node?.Attributes?.Circuit_ID);
  const s = Number(node?.Attributes?.Span_Seq);
  if (!Number.isFinite(c) || !Number.isFinite(s)) return null;
  return spanLabel(circuitLetter(c), s);
}

/* The part of a polyline between two points on it.

   Both points are projected onto the line, the vertices between them are
   kept, and the two ends are the projections themselves — so the piece
   starts and stops exactly at the nodes rather than at the nearest
   vertex. */
export function clipBetween(g = [], from, to) {
  if (g.length < 2 || !from || !to) return [];

  const at = (p) => {
    let run = 0;
    let best = { m: 0, d: Infinity, point: g[0] };
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const segLen = dist(a, b);
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      if (len2) {
        let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const q = [a[0] + vx * u, a[1] + vy * u];
        const d = dist(p, q);
        if (d < best.d) best = { m: run + segLen * u, d, point: q };
      }
      run += segLen;
    }
    return best;
  };

  const A = at(from);
  const B = at(to);
  const lo = Math.min(A.m, B.m);
  const hi = Math.max(A.m, B.m);
  const first = A.m <= B.m ? A.point : B.point;
  const last = A.m <= B.m ? B.point : A.point;

  const out = [first];
  let run = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const segLen = dist(g[i], g[i + 1]);
    const endAt = run + segLen;
    /* A vertex strictly inside the clipped stretch. */
    if (endAt > lo && endAt < hi) out.push(g[i + 1]);
    run = endAt;
  }
  out.push(last);
  return out;
}

/* The trench network, as span nodes joined by lengths of trench.

   Not the electric Connects graph, which is what this used at first —
   that is maintained by cable tracing and is empty until an LV network
   has been built, so on a drawing with trenches and no cable every pair
   of nodes came back "not on the same circuit". A mains call-off is
   about trench and has to work before any cable exists.

   Each trench is split at every span node that sits on it, and
   consecutive nodes along it become neighbours at the distance between
   them. That is the shape the dig has. */
export function trenchGraph(trenches = [], nodes = [], opts = {}) {
  const { eps = 0.5 } = opts;

  /* Every point that matters: span nodes, and the ends of every trench.

     Trench ends are in the graph even where no span node sits on them.
     Without them a run crossing from one trench to another — two
     sections meeting because the surface changes, which is an ordinary
     thing to draw — had no connection at the join, and A10 to A12 came
     back as no route at all.

     They are interned together, so two trenches drawn to the same corner
     become one point rather than two a millimetre apart. */
  const points = [];
  const intern = (p, node = null) => {
    for (const q of points) {
      if (dist(q.at, p) <= eps) {
        if (node && !q.node) q.node = node;
        return q;
      }
    }
    const q = { at: [p[0], p[1]], node };
    points.push(q);
    return q;
  };

  for (const n of nodes) {
    /* Where the node belongs on the dig, which is not always where it
       is drawn.

       A span node is a marker on the trench, and it gets moved a metre
       or two clear so the label can be read. Its Anchor is the point on
       the trench it was placed at; the graph uses that, so nudging the
       marker cannot take it off the network.

       Falling back to its own position for a node placed before anchors
       existed, which is what it has always used. */
    const a = n.Attributes?.Span_Anchor;
    const p = (Array.isArray(a) && a.length === 2 ? a : (n.Geometry || [])[0]);
    if (p) intern(p, n);
  }
  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;
    intern(g[0]);
    intern(g[g.length - 1]);
  }

  const idOf = new Map(points.map((p, i) => [p, i]));
  const adj = new Map(points.map((_, i) => [i, []]));

  /* Each trench split at every point that sits on it. */
  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;

    const on = [];
    let run = 0;
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const segLen = dist(a, b);
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      if (len2) {
        for (const p of points) {
          let u = ((p.at[0] - a[0]) * vx + (p.at[1] - a[1]) * vy) / len2;
          u = Math.max(0, Math.min(1, u));
          const q = [a[0] + vx * u, a[1] + vy * u];
          if (dist(p.at, q) > eps) continue;
          on.push({ p, m: run + segLen * u });
        }
      }
      run += segLen;
    }

    on.sort((x, y) => x.m - y.m);
    for (let i = 0; i + 1 < on.length; i++) {
      const A = on[i];
      const B = on[i + 1];
      if (A.p === B.p) continue;
      const len = B.m - A.m;
      if (len <= eps) continue;
      adj.get(idOf.get(A.p)).push({ to: idOf.get(B.p), len, trench: t });
      adj.get(idOf.get(B.p)).push({ to: idOf.get(A.p), len, trench: t });
    }
  }

  return { points, idOf, adj, indexOfNode: (id) =>
    points.findIndex((p) => p.node?.Feature_ID === id) };
}

/* The steps between two graph points, as edges.

   `routeBetween` below answers the same question for two span node
   Feature_IDs. This one takes point indices, because an end of a
   call-off section is often a plot seed or a bare trench end with no
   node on it — which is why CallOffsTab resolves its ends to the
   nearest point rather than to a node.

   Each edge carries the trench it runs on and its length along that
   trench. That is the whole reason this returns edges rather than a
   total: a section crossing from a footway trench into a carriageway
   one is two different digs, and a single number cannot say so.

   Dijkstra rather than the breadth-first relaxation CallOffsTab uses
   for lengths alone: that one revisits nodes until the distances settle,
   which is fine for a total but does not leave a path behind it. */
export function pathBetween(graph, fromIdx, toIdx) {
  const { adj } = graph;
  if (fromIdx == null || toIdx == null || fromIdx === toIdx) return null;

  const best = new Map([[fromIdx, 0]]);
  const cameBy = new Map();
  const seen = new Set();

  for (;;) {
    /* The nearest unsettled point. A linear scan rather than a heap:
       the graph is one site's trenches, and a heap here would be more
       code than the site has junctions. */
    let at = null;
    let atD = Infinity;
    for (const [i, d] of best) {
      if (!seen.has(i) && d < atD) { at = i; atD = d; }
    }
    if (at == null) return null;
    if (at === toIdx) break;
    seen.add(at);

    for (const e of adj.get(at) || []) {
      const next = atD + e.len;
      if (best.has(e.to) && best.get(e.to) <= next) continue;
      best.set(e.to, next);
      cameBy.set(e.to, { from: at, edge: e });
    }
  }

  const out = [];
  let cur = toIdx;
  while (cur !== fromIdx) {
    const step = cameBy.get(cur);
    if (!step) return null;
    out.unshift(step.edge);
    cur = step.from;
  }
  return out;
}

/* The shortest run of trench between two span nodes.

   Returned as the steps taken, each with its length and the trench it
   is on — which is what a span is. */
export function routeBetween(graph, fromId, toId) {
  const { points, adj, indexOfNode } = graph;
  const start = indexOfNode(fromId);
  const end = indexOfNode(toId);
  if (start < 0 || end < 0) return null;
  if (start === end) return [];

  const from = new Map();
  const cost = new Map([[start, 0]]);
  const pending = new Set([start]);

  /* A plain scan rather than a heap: a drawing has tens of points, and
     the difference is not measurable against the clarity. */
  while (pending.size) {
    let at = null;
    for (const id of pending) {
      if (at == null || (cost.get(id) ?? Infinity) < (cost.get(at) ?? Infinity)) at = id;
    }
    pending.delete(at);
    if (at === end) break;

    for (const step of adj.get(at) || []) {
      const c = (cost.get(at) ?? Infinity) + step.len;
      if (c < (cost.get(step.to) ?? Infinity)) {
        cost.set(step.to, c);
        from.set(step.to, { at, len: step.len, trench: step.trench });
        pending.add(step.to);
      }
    }
  }

  if (!cost.has(end)) return null;

  /* Walk back, then forward again — the steps are wanted in the order
     somebody would walk them. */
  const steps = [];
  let at = end;
  let guard = 0;
  while (at !== start && guard++ < 2000) {
    const back = from.get(at);
    if (!back) return null;
    steps.push({ from: back.at, to: at, len: back.len, trench: back.trench });
    at = back.at;
  }
  steps.reverse();

  /* Grouped into spans: a span runs from one span node to the next, and
     whatever the route passes through between them — the corner where
     two trenches meet, a bend, a point that is only there to join two
     sections — is part of that span rather than the end of one.

     This is what a route crossing two trench features needs. Splitting
     at every point instead would have made "A10 to A12" two spans with
     nothing at the join to name. */
  const spans = [];
  let current = null;
  for (const st of steps) {
    if (!current) {
      current = { fromIdx: st.from, parts: [], len: 0 };
    }
    current.parts.push(st);
    current.len += st.len;

    const p = points[st.to];
    if (p?.node) {
      spans.push({ ...current, toIdx: st.to });
      current = null;
    }
  }
  /* A trailing piece means the route ended somewhere that is not a span
     node, which cannot happen when both ends are nodes. */
  return spans;
}


export function spansBetween(features = [], opts = {}) {
  const {
    fromId, toId, plotOf = () => null,
    isTrench = (f) => f.Feature_Type === "line" && f.Layer_Key === "trench",
    serviceTypes = null,
  } = opts;

  const nodes = features.filter((f) => f.Feature_Role === "spannode");
  /* Mains only. A service is not part of a run between two nodes, and a
     span that measured through one would count somebody's driveway. */
  const trenches = features.filter((f) => isTrench(f)
    && !(serviceTypes && serviceTypes.has(f.Attributes?.Line_Type)));

  const adj = trenchGraph(trenches, nodes, opts);
  const steps = routeBetween(adj, fromId, toId);

  if (!steps) {
    return {
      error: "No trench route between those two nodes \u2014 "
        + "check the trench joins between them.",
    };
  }
  if (!steps.length) return { ok: true, spans: [] };

  /* Each span, with the pieces of trench it runs over.

     A span can cross more than one trench feature — two sections meeting
     because the surface changes is an ordinary thing to draw — so it
     carries a list of parts rather than one trench. */
  const spans = steps.map((sp) => ({
    fromNode: adj.points[sp.fromIdx]?.node,
    toNode: adj.points[sp.toIdx]?.node,
    lengthM: sp.len,
    parts: sp.parts,
    meters: [],
  }));

  /* The plots on each span.

     A plot is on a span because its service tees into that span. Not
     because it is near it — the first version took any meter within
     forty metres of the trench, which on a site with two roads running
     alongside each other put the plots from one road onto the span of
     the other. Proximity is not the relationship; the service is.

     So: find each meter's service, find where that service meets a
     main, and see whether that point falls on this span between its two
     nodes. A meter with no service drawn belongs to no span, which is
     honest — nothing has yet been drawn to say where it connects. */
  /* Whatever a meter sits on the end of: a service trench, a service
     cable, either.

     This looked only at service trenches, and on a drawing where the
     services are cables it found one plot out of eleven. What matters is
     the line running from the meter to the main — its far end is where
     the plot connects, and whether that line is trench or cable is a
     question about which layer somebody drew it on, not about where the
     plot joins.

     The mains being routed along are excluded, so a main whose end
     happens to fall near a meter is not mistaken for that meter's
     service. */
  const mainIds = new Set(trenches.map((t) => t.Feature_ID));
  const services = features.filter((f) =>
    f.Feature_Type === "line"
    && (f.Geometry || []).length >= 2
    && !mainIds.has(f.Feature_ID));

  /* How far along a trench a point is, and how far off it. */
  const along = (p, g) => {
    let run = 0;
    let best = { m: null, d: Infinity };
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const segLen = dist(a, b);
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      if (len2) {
        let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const q = [a[0] + vx * u, a[1] + vy * u];
        const d = dist(p, q);
        if (d < best.d) best = { m: run + segLen * u, d };
      }
      run += segLen;
    }
    return best;
  };

  const attachM = opts.attachM ?? 2.0;

  /* Each meter, and the point on a main where its service tees in. */
  const tees = [];
  for (const m of features) {
    if (m.Feature_Role !== "meter") continue;
    const p = (m.Geometry || [])[0];
    if (!p) continue;

    let svc = null;
    for (const t of services) {
      const g = t.Geometry || [];
      if (g.length < 2) continue;
      const dStart = dist(p, g[0]);
      const dEnd = dist(p, g[g.length - 1]);
      const near = Math.min(dStart, dEnd);
      if (near > attachM) continue;
      if (!svc || near < svc.near) {
        svc = { near, far: dStart <= dEnd ? g[g.length - 1] : g[0] };
      }
    }
    if (!svc) continue;
    tees.push({ meter: m, at: svc.far });
  }

  /* Each piece of the span, taken in turn — a plot tees into one of
     them, and which piece it is does not matter. */
  for (const sp of spans) {
    for (const part of sp.parts) {
      if (!part.trench) continue;
      const g = part.trench.Geometry || [];
      const a = along(adj.points[part.from].at, g);
      const b = along(adj.points[part.to].at, g);
      if (a.m == null || b.m == null) continue;
      const lo = Math.min(a.m, b.m);
      const hi = Math.max(a.m, b.m);

      for (const t of tees) {
        const hit = along(t.at, g);
        /* On this trench, not merely near it — a service teeing into
           the road behind lands within a metre or two of nothing on
           this one. */
        if (hit.m == null || hit.d > attachM) continue;
        if (hit.m < lo - 0.5 || hit.m > hi + 0.5) continue;
        if (!sp.meters.includes(t.meter)) sp.meters.push(t.meter);
      }
    }
  }

  return {
    ok: true,
    spans: spans.map((sp) => {
      const plots = [...new Set(sp.meters
        .map((m) => plotOf(m))
        .filter((p) => p != null))];

      /* Numerically where they are numbers, so 2 comes before 10 — plot
         numbers sorted as text put 10 between 1 and 2, which reads as a
         mistake on a call-off. */
      plots.sort((x, y) => {
        const nx = Number(x);
        const ny = Number(y);
        if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
        return String(x).localeCompare(String(y));
      });

      return {
        from: labelOf(sp.fromNode),
        to: labelOf(sp.toNode),
        fromId: sp.fromNode?.Feature_ID,
        toId: sp.toNode?.Feature_ID,
        lengthM: Math.round(sp.lengthM * 10) / 10,
        /* The trench between the two nodes, as it is drawn.

           A straight line from one node to the other is not the span —
           it crosses whatever is between them and gives no idea which
           trench is being called off. This is the part of the trench
           itself, clipped at each node. */
        /* The trench under this span, piece by piece — one clip per
           trench it crosses, joined end to end. */
        geometry: sp.parts.flatMap((part, i) => {
          const g = clipBetween(part.trench?.Geometry || [],
            adj.points[part.from].at, adj.points[part.to].at);
          /* The join between two pieces would otherwise be drawn twice,
             which shows as a blob at every corner. */
          return i === 0 ? g : g.slice(1);
        }),
        /* Whether any part of this span is off site.

           Worked out here, where the trench features are to hand, rather
           than by the scheduling side going back to the drawing — which
           it has no reason to load. */
        offSite: sp.parts.some((part) => part.trench?.Attributes?.Off_Site === true),
        plots,
        plotCount: plots.length,
      };
    }),
  };
}


export function describe(spans = []) {
  if (!spans.length) return "";
  const total = spans.reduce((t, s) => t + s.lengthM, 0);
  const plots = new Set();
  for (const s of spans) for (const p of s.plots) plots.add(p);
  return `${spans[0].from} to ${spans[spans.length - 1].to} \u00b7 `
    + `${Math.round(total * 10) / 10} m \u00b7 `
    + `${plots.size} plot${plots.size === 1 ? "" : "s"}`;
}


/* Several ranges in one call-off.

   A call-off is often two or three runs that are not joined to each
   other — A1 to A5 and A7 to A12 — because that is what a gang is being
   asked to lay this week, not because the network has a gap there.

   Each range is worked out on its own and they are reported together,
   so a range that cannot be resolved says so without stopping the
   others. */
export function rangesToSpans(features = [], ranges = [], opts = {}) {
  const out = [];
  const errors = [];

  for (const r of ranges) {
    const res = spansBetween(features, { ...opts, fromId: r.fromId, toId: r.toId });
    if (res.error) {
      errors.push({ range: r, error: res.error });
      continue;
    }
    out.push({ ...r, spans: res.spans });
  }

  const all = out.flatMap((r) => r.spans);
  const plots = new Set();
  for (const sp of all) for (const p of sp.plots) plots.add(p);

  return {
    ranges: out,
    errors,
    spans: all,
    /* One figure for the whole call-off. A span appearing in two ranges
       is counted twice deliberately: it would be dug twice as asked, and
       quietly halving it would be a decision this is not entitled to
       make. Overlapping ranges are flagged instead. */
    totalM: Math.round(all.reduce((t, s) => t + s.lengthM, 0) * 10) / 10,
    plotCount: plots.size,
    /* Spans named by more than one range. */
    overlaps: (() => {
      const seen = new Map();
      for (const sp of all) {
        const key = `${sp.fromId}:${sp.toId}`;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      return [...seen].filter(([, n]) => n > 1).map(([key]) => {
        const sp = all.find((x) => `${x.fromId}:${x.toId}` === key);
        return `${sp.from}\u2013${sp.to}`;
      });
    })(),
  };
}

/* The rows a mains call-off is saved with.

   One per span, matching Mains_Call_Off_Span: the plots as written, the
   estimated length, and the order they were named in. */
export function toCallOffRows(ranges = []) {
  /* One row per range, named by the two nodes it runs between.

     A row per span was written first — A1–A2, A2–A3, A3–A4 — which is
     how the work divides but not how it was asked for. Somebody raising
     a call-off says "A1 to A5" and the row should say that back; the
     spans between are how it is measured, not what it is called.

     Given a list of spans rather than ranges, each span is its own
     range, so this stays correct however it is called. */
  const asRanges = ranges.map((r) => (r.spans ? r : { spans: [r] }));

  return asRanges.map((r, i) => {
    const spans = r.spans || [];
    if (!spans.length) return null;

    const plots = [...new Set(spans.flatMap((sp) => sp.plots || []))];
    plots.sort((x, y) => {
      const nx = Number(x);
      const ny = Number(y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
      return String(x).localeCompare(String(y));
    });

    /* Smallest first, whichever end was clicked. */
    const [from, to] = orderPair(spans[0].from, spans[spans.length - 1].to);
    const total = spans.reduce((t, sp) => t + sp.lengthM, 0);

    /* Any part of the run being off site travels with the row, so the
       assignment can be ticked without going back to the drawing. */
    const offSite = spans.some((sp) => sp.offSite);

    return {
      Off_Site: offSite || null,
      Plots: plots.length
        ? `Span Node ${from} to ${to} (plots ${plots.join(", ")})`
        : `Span Node ${from} to ${to}`,
      /* The nodes as well as their labels.

         The text is what somebody reads; these are what the drawing
         matches on to show a run as already called off. Without them a
         label cannot be turned back into a piece of trench. */
      From_Node_ID: spans[0].fromId ?? null,
      To_Node_ID: spans[spans.length - 1].toId ?? null,
      D_or_P: null,
      Energisation_Date: null,
      Estimated_Length_m: Math.round(total * 10) / 10,
      Sort_Order: i,
    };
  }).filter(Boolean);
}
