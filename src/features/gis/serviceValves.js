/* Service valves on a water main.

   Where a main spurs off the one feeding it, a valve goes in a little
   way down the spur so that branch can be shut without losing the run
   it came from. On a drawing it is a bar across the pipe with SV beside
   it.

   ── What decides where ──

   A spur is a branch: a point where the network divides, and the leg
   leaving it that is not the way you came. Which leg is which is a fact
   about direction, and direction on a water network comes from the POC —
   so this walks out from there, exactly as the builder does, and every
   node with more than one leg below it is a tee.

   Without a POC there is no downstream and nothing here can be
   answered, so nothing is drawn rather than valves appearing at every
   junction in both directions.

   ── Why 1.5 m along, and 1 m across ──

   Both are given. The distance is measured along the pipe rather than
   as the crow flies, so a spur that turns within the first metre and a
   half still gets its valve at a metre and a half of pipe — which is
   where it would be dug.

   The bar is a metre of real ground, not a fixed number of pixels: it
   is a thing in the trench with a size, and it should grow and shrink
   with everything else drawn to scale. The letters beside it are not,
   for the same reason a label is not.

   ── Pure ──

   Features in, positions out. The canvas draws them; nothing is
   created, so nothing has to be cleaned up when a main is redrawn. */

import { CONNECT_EPS, SNAP_TOL, isServiceLine } from "./feeder.js";

/* How far down the spur, and how wide across it. Metres. */
export const VALVE_ALONG_M = 1.5;
export const VALVE_WIDTH_M = 1;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Water mains, judged on the layer the type belongs to rather than on
   the spelling of the key — the same test the builder uses, so the two
   cannot disagree about what a main is. */
function waterMains(features, lineTypes) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    if (isServiceLine(f)) return false;
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === "water" : f.Layer_Key === "water";
  });
}

export function serviceValves(features = [], opts = {}) {
  const {
    lineTypes = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    alongM = VALVE_ALONG_M,
    layerKey = "water",
  } = opts;

  const mains = waterMains(features, lineTypes);
  if (!mains.length) return { valves: [] };

  const poc = features.find((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length);
  if (!poc) return { valves: [] };

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
  for (const f of mains) {
    const ids = f.Geometry.map(intern);
    for (let i = 0; i + 1 < ids.length; i++) addEdge(ids[i], ids[i + 1]);
  }

  /* ── Downstream, from the POC ── */
  let root = -1;
  let gap = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = dist(nodes[i], poc.Geometry[0]);
    if (d < gap) { gap = d; root = i; }
  }
  if (root < 0 || gap > tol) return { valves: [] };

  const parent = new Array(nodes.length).fill(-1);
  const seen = new Array(nodes.length).fill(false);
  seen[root] = true;
  const queue = [root];
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u) || []) {
      if (seen[v]) continue;
      seen[v] = true;
      parent[v] = u;
      queue.push(v);
    }
  }

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }

  /* A point a given distance along the pipe from one node towards
     another, following the bends rather than cutting across them.

     Returns the position and the direction of the pipe there, which is
     what the bar is drawn square to. Where the spur is shorter than the
     distance asked for, it stops at the far end: a valve at the end of
     a metre-long stub is where it would actually go, and refusing to
     place one would leave that branch with no way to be shut. */
  function along(from, to, want) {
    let prev = from;
    let cur = to;
    let left = want;

    for (;;) {
      const a = nodes[prev];
      const b = nodes[cur];
      const len = dist(a, b);

      if (len >= left || !children.has(cur) || (children.get(cur) || []).length !== 1) {
        const t = len ? Math.min(left, len) / len : 0;
        return {
          at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          dir: len ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0],
        };
      }

      left -= len;
      const next = children.get(cur)[0];
      prev = cur;
      cur = next;
    }
  }

  /* ── Which leg is the spur ──

     At a tee, one leg carries on and the others come off it. The valve
     belongs on the ones coming off: the main is not spurring from
     itself, and a bar across every leg of every junction is three
     valves where the drawing shows one.

     Told apart by the turn. The leg closest in line with the pipe
     arriving is the same main continuing; anything turning away from it
     is a spur.

     Two tests, not one. It has to turn less than sixty degrees — a main
     is drawn round a corner as one main and estate roads bend further
     than a right angle would allow for, while a spur leaves at
     something near ninety — and it has to be clearly straighter than
     the next leg. Without the second test a Y, where the pipe divides
     and neither half carries on, had one leg picked as the continuation
     purely by which was tested first, and came out with a valve on one
     branch and none on the other. Where two legs turn by much the same
     amount, neither is the main, and both get one.

     Fifteen degrees of daylight between them. Below that the drawing is
     not saying which is the main, and guessing is what produced the
     wrong answer. */
  const TURN_LIMIT_DEG = 60;
  const CLEAR_BY_DEG = 15;

  const dirBetween = (a, b) => {
    const len = dist(nodes[a], nodes[b]);
    if (!len) return null;
    return [(nodes[b][0] - nodes[a][0]) / len, (nodes[b][1] - nodes[a][1]) / len];
  };

  /* How far a leg turns from the pipe arriving, in degrees. */
  const turnOf = (incoming, d) => {
    const dot = Math.max(-1, Math.min(1, d[0] * incoming[0] + d[1] * incoming[1]));
    return (Math.acos(dot) * 180) / Math.PI;
  };

  const valves = [];
  for (let u = 0; u < nodes.length; u++) {
    const kids = children.get(u) || [];
    if (kids.length < 2) continue;

    /* The pipe arriving here. The root has none — nothing feeds the
       POC — so every leg off it is treated as carrying on rather than
       spurring, and it gets no valves. */
    const incoming = parent[u] >= 0 ? dirBetween(parent[u], u) : null;

    let straightest = -1;
    if (incoming) {
      const turns = kids
        .map((c) => ({ c, d: dirBetween(u, c) }))
        .filter((x) => x.d)
        .map((x) => ({ c: x.c, turn: turnOf(incoming, x.d) }))
        .sort((a, b) => a.turn - b.turn);

      const best = turns[0];
      const next = turns[1];
      if (best && best.turn <= TURN_LIMIT_DEG
        && (!next || next.turn - best.turn >= CLEAR_BY_DEG)) {
        straightest = best.c;
      }
    }

    for (const c of kids) {
      /* The main carrying on through the junction. */
      if (c === straightest) continue;
      if (!incoming) continue;
      const { at, dir } = along(u, c, alongM);
      valves.push({
        at,
        /* The pipe's direction where the valve sits. The bar is drawn
           across it, so the canvas turns this by a right angle rather
           than being told the answer — it is the same fact, and one of
           the two would eventually be computed from a stale copy of the
           other. */
        dir,
        teeAt: nodes[u].slice(),
      });
    }
  }

  return { valves };
}
