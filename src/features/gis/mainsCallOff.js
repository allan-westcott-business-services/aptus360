import { buildGraph, rootAt, spanLabel, circuitLetter } from "./electric.js";
import { lineLength } from "./snapping.js";

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

/* Every span node on a circuit, in sequence order. */
export function spanNodesOf(features = [], circuitId) {
  return features
    .filter((f) => f.Feature_Role === "spannode"
      && Number(f.Attributes?.Circuit_ID) === Number(circuitId))
    .sort((a, b) => Number(a.Attributes?.Span_Seq ?? 0)
      - Number(b.Attributes?.Span_Seq ?? 0));
}

/* A node's label, as it reads on the drawing. */
export function labelOf(node) {
  const c = Number(node?.Attributes?.Circuit_ID);
  const s = Number(node?.Attributes?.Span_Seq);
  if (!Number.isFinite(c) || !Number.isFinite(s)) return null;
  return spanLabel(circuitLetter(c), s);
}

/* The chain of nodes from the substation down to this one.

   Walked through the parent links the network tracing maintains, so a
   call-off cannot disagree with what the trace shows. */
function ancestryOf(graph, rooted, nodeId) {
  const out = [];
  let at = nodeId;
  let guard = 0;
  while (at != null && guard++ < 500) {
    out.push(at);
    at = rooted.parent.get(at);
  }
  return out.reverse();
}

/* The route between two nodes, as a list of feature ids.

   Both walk back to the substation; the last id they have in common is
   where the route turns round. On a circuit that is a tree, this is the
   only route there is. */
export function routeBetween(features, fromId, toId, substationId) {
  const graph = buildGraph(features);
  const rooted = rootAt(graph, substationId);

  const a = ancestryOf(graph, rooted, fromId);
  const b = ancestryOf(graph, rooted, toId);
  if (!a.length || !b.length) return null;

  let common = -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) common = i; else break;
  }
  if (common < 0) return null;

  /* Down one side to the meeting point, then up the other. The meeting
     point itself appears once. */
  const down = a.slice(common).reverse();
  const up = b.slice(common + 1);
  return [...down, ...up];
}

/* The spans a call-off covers, between two named nodes.

   Each span runs from one span node to the next along the route, and
   carries the cable between them and the plots served off it. */
export function spansBetween(features = [], opts = {}) {
  const { fromId, toId, substationId, plotOf = () => null } = opts;

  const route = routeBetween(features, fromId, toId, substationId);
  if (!route) {
    return { error: "Those two nodes are not on the same circuit." };
  }

  const byId = new Map(features.map((f) => [f.Feature_ID, f]));
  const isNode = (id) => byId.get(id)?.Feature_Role === "spannode";

  /* Split the route at every span node it passes through. A call-off
     from A1 to A5 is four spans, not one long one — each is a separate
     length to lay and a separate set of plots. */
  const spans = [];
  let current = null;

  for (const id of route) {
    const f = byId.get(id);
    if (!f) continue;

    if (isNode(id)) {
      if (current) {
        current.toNode = f;
        spans.push(current);
      }
      current = { fromNode: f, toNode: null, parts: [], meters: [] };
      continue;
    }
    if (!current) continue;

    /* Cable and trench between the nodes. */
    if (f.Feature_Type === "line") current.parts.push(f);
  }
  /* A trailing part with no closing node is not a span — the route ended
     on something that is not a span node, which means the two ids given
     were not both nodes. */

  /* The meters served off each span.

     A meter hangs off the cable rather than sitting on the route between
     two nodes, so walking the route never passes through one — the first
     version collected meters from the route and found none, every time.

     They are found from the other end instead: whatever a span's cable
     connects to that is a meter is served by that span. */
  for (const sp of spans) {
    const ids = new Set(sp.parts.map((f) => f.Feature_ID));
    for (const f of features) {
      if (f.Feature_Role !== "meter") continue;
      const connects = f.Attributes?.Connects || [];
      if (connects.some((id) => ids.has(id))) sp.meters.push(f);
    }
  }

  return {
    ok: true,
    spans: spans.map((sp) => {
      const lengthM = sp.parts.reduce((t, f) => t + lineLength(f.Geometry || []), 0);
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
        fromId: sp.fromNode.Feature_ID,
        toId: sp.toNode.Feature_ID,
        lengthM: Math.round(lengthM * 10) / 10,
        plots,
        plotCount: plots.length,
      };
    }),
  };
}

/* The whole call-off as one line of text, for the description a call-off
   is raised with. */
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
export function toCallOffRows(spans = []) {
  return spans.map((sp, i) => ({
    Plots: sp.plots.length
      ? `${sp.from}\u2013${sp.to} (${sp.plots.join(", ")})`
      : `${sp.from}\u2013${sp.to}`,
    D_or_P: null,
    Energisation_Date: null,
    Estimated_Length_m: sp.lengthM,
    Sort_Order: i,
  }));
}
