/* Where a trace goes, as paths a token can be animated along.

   ── Root-to-leaf paths, not a graph ──

   The obvious shape for a network walk is a tree of nodes, and it is
   the wrong one here: an animation needs something to move ALONG, at a
   speed, from a start. So the walk returns one polyline per leaf, each
   running the whole way from the start point.

   Forking then costs nothing. Two paths that share the first ninety
   metres carry their tokens over the same ground, so they read as ONE
   token until the branch, where they part — which is what a fork looks
   like, drawn without any code that knows what a fork is. A tree of
   nodes would have needed an explicit "now split" step and a rule for
   what happens to the token that was there.

   ── Direction ──

   Downstream and upstream only mean something relative to a source: the
   POC a circuit is fed from, the governor a gas main leaves. Distance
   along the network from that source is what says which way is which,
   NOT distance as the crow flies — a run that loops back on itself is
   further downstream at every step while getting closer to the POC in a
   straight line.

   Where the network has no source in it, upstream and downstream are
   not questions the drawing can answer, and the walk says so rather
   than picking a direction and looking confident.

   ── Both ways ──

   Everything reachable, which is the honest answer to "what is
   connected to this". It is also the only direction available on a
   trench, which has no source: a dig is not fed from anywhere. */

const KEY = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* One node per distinct vertex, one edge per segment.

   Segments rather than whole lines, because a trace joins things where
   they MEET, and two cables crossing at a drawn vertex meet there
   whether or not either of them ends. Whole-line edges would carry the
   token past a junction it should have branched at. */
function buildGraph(lines) {
  const at = new Map();          // key -> point
  const next = new Map();        // key -> [{ to, pts, lineId }]
  const add = (a, b, lineId) => {
    const ka = KEY(a); const kb = KEY(b);
    if (ka === kb) return;
    at.set(ka, a); at.set(kb, b);
    if (!next.has(ka)) next.set(ka, []);
    if (!next.has(kb)) next.set(kb, []);
    next.get(ka).push({ to: kb, pts: [a, b], lineId });
    next.get(kb).push({ to: ka, pts: [b, a], lineId });
  };
  for (const f of lines) {
    const g = f.Geometry || [];
    for (let i = 1; i < g.length; i++) add(g[i - 1], g[i], Number(f.Feature_ID));
  }
  return { at, next };
}

/* The node a click lands on: the nearest vertex within reach.

   A click never lands exactly on a vertex, and starting from "wherever
   the pointer was" would begin the walk in the middle of a segment with
   no way to say which end it belongs to. */
function nearestNode(graph, point, reach) {
  let best = null;
  for (const [k, p] of graph.at) {
    const d = dist(p, point);
    if (d <= reach && (!best || d < best.d)) best = { d, key: k };
  }
  return best?.key ?? null;
}

/* ── Where a click ON a line starts from ──

   The graph's nodes are the lines' VERTICES, so a click in the middle
   of a run is nowhere near one: a service cable ten metres long has its
   two ends five metres from the point somebody clicked, and a reach of
   two metres finds nothing. Which reported "click on a line" to
   somebody who had clicked on a line.

   So the segments are asked instead. The nearest one within reach wins,
   and the walk starts from whichever of ITS ends the click was nearer —
   the token appears at a real node and travels from there, which is
   what it does from a vertex too.

   Not the projected point itself: starting mid-segment would mean
   splitting an edge and rebuilding the graph around it, for a marker
   that would sit a couple of metres from where the walk begins anyway. */
function nearestOnSegments(lines, point, reach) {
  let best = null;
  for (const f of lines) {
    const g = f.Geometry || [];
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1];
      const b = g[i];
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const l2 = vx * vx + vy * vy;
      let t = l2 ? ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = [a[0] + vx * t, a[1] + vy * t];
      const d = dist(q, point);
      if (d <= reach && (!best || d < best.d)) {
        /* The nearer end of the segment the click landed on. */
        best = { d, node: dist(a, point) <= dist(b, point) ? a : b };
      }
    }
  }
  return best?.node ?? null;
}

/* Distance from the nearest source, along the network. */
function fromSource(graph, sourceKeys) {
  const seen = new Map();
  const queue = [];
  for (const k of sourceKeys) {
    if (!graph.next.has(k)) continue;
    seen.set(k, 0);
    queue.push(k);
  }
  /* Dijkstra by hand: the queue is small and the alternative is a
     dependency for something a network of a few thousand segments does
     in a blink. */
  while (queue.length) {
    queue.sort((a, b) => seen.get(a) - seen.get(b));
    const k = queue.shift();
    for (const e of graph.next.get(k) || []) {
      const d = seen.get(k) + dist(e.pts[0], e.pts[1]);
      if (!seen.has(e.to) || d < seen.get(e.to) - 1e-9) {
        seen.set(e.to, d);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

export function traceTree(lines = [], startPoint, opts = {}) {
  const {
    direction = "both",
    sourcePoints = [],
    reach = 3,
    /* A guard, not a limit anybody should meet: a network that walks
       past this is a network with a loop the edge marking missed, and
       running out of memory is a worse way to find out. */
    maxPaths = 400,
  } = opts;

  const usable = (lines || []).filter((f) => (f.Geometry || []).length >= 2);
  if (!usable.length) return { error: "Nothing of that kind is drawn here." };

  const graph = buildGraph(usable);
  /* A vertex first, then anywhere along a line. The vertex is the
     common case \u2014 clicking a joint, an end, a node \u2014 and it is exact;
     the segment search is what makes clicking the MIDDLE of a cable
     work, which is what most people do. */
  let startKey = nearestNode(graph, startPoint, reach);
  if (!startKey) {
    const onLine = nearestOnSegments(usable, startPoint, reach);
    if (onLine) startKey = nearestNode(graph, onLine, reach + 1e6);
  }
  if (!startKey) {
    return { error: "Nothing to trace at that point \u2014 click on a line." };
  }

  let depth = null;
  if (direction === "up" || direction === "down") {
    const keys = sourcePoints
      .map((p) => nearestNode(graph, p, reach))
      .filter(Boolean);
    if (!keys.length) {
      return {
        error: "No source on this network, so upstream and downstream have "
          + "no meaning here. Trace both ways instead.",
      };
    }
    depth = fromSource(graph, keys);
    if (!depth.has(startKey)) {
      return { error: "That point is not connected to a source." };
    }
  }

  /* Edges are marked, not nodes. A node is visited every time a branch
     passes through it and marking those would stop the walk at the
     first junction; an edge walked twice is a loop. */
  const walked = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const paths = [];
  const lineIds = new Set();

  const step = (key, trail, ids) => {
    if (paths.length >= maxPaths) return;
    const outs = (graph.next.get(key) || []).filter((e) => {
      if (walked.has(edgeKey(key, e.to))) return false;
      if (depth) {
        const here = depth.get(key);
        const there = depth.get(e.to);
        if (here == null || there == null) return false;
        /* Away from the source, or back towards it. The half-millimetre
           is float noise on two routes of the same length, not a
           tolerance for anything real. */
        return direction === "down" ? there > here + 0.0005 : there < here - 0.0005;
      }
      return true;
    });

    if (!outs.length) {
      if (trail.length >= 2) paths.push({ pts: trail, lineIds: [...ids] });
      return;
    }
    for (const e of outs) {
      walked.add(edgeKey(key, e.to));
      lineIds.add(e.lineId);
      step(e.to, [...trail, e.pts[1]], new Set([...ids, e.lineId]));
    }
  };

  step(startKey, [graph.at.get(startKey)], new Set());

  if (!paths.length) {
    return {
      error: direction === "up"
        ? "Nothing upstream of there \u2014 that is the end nearest the source."
        : direction === "down"
          ? "Nothing downstream of there."
          : "Nothing joined to that point.",
    };
  }

  const lengthOf = (pts) => {
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += dist(pts[i - 1], pts[i]);
    return m;
  };
  const withLen = paths.map((p) => ({ ...p, metres: lengthOf(p.pts) }));

  return {
    paths: withLen,
    lineIds: [...lineIds],
    /* The longest path is how far the token has to travel, so the
       animation can run at one speed and finish when the last one
       arrives rather than each finishing on its own clock. */
    furthest: withLen.reduce((n, p) => Math.max(n, p.metres), 0),
    start: graph.at.get(startKey),
  };
}

/* Where a token is, this far along a path.

   Returns null past the end rather than clamping to it: a token that
   has arrived should STOP being drawn, not sit on the last point
   looking like it is still going. The short branches finishing early
   while the long one runs on is the trace showing you which way is
   further. */
export function pointAlong(pts = [], metres) {
  if (pts.length < 2 || metres < 0) return null;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (run + seg >= metres) {
      const t = seg === 0 ? 0 : (metres - run) / seg;
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
      ];
    }
    run += seg;
  }
  return null;
}
