/* Wash outs on a water main.

   A wash out sits at a dead end of the main so the leg can be flushed
   and drained: water that stops moving at a blind end is water that
   goes stale, and a main commissioned without one cannot be cleaned
   before it is handed over.

   ── What counts as an end ──

   A node with exactly one pipe leaving it. Not a junction, which has
   three or more, and not a bend or a place where two runs meet
   end-to-end, which have two. The builder cuts a run wherever the size
   changes, so a single length of ground may be three runs in a row;
   they intern to the same nodes and read as degree two, which is why
   this counts pipe ends at a node rather than counting runs.

   ── Except where the water comes in ──

   The point of supply is an end by the same test, and it is the one end
   that is not a dead end: it is where the main is fed from. A wash out
   drawn there would be a wash out on the connection to the incumbent's
   network, which is not ours to put one on. So the node nearest the
   water POC is left alone.

   Where there is no POC on the drawing, every end takes one. That is
   the honest answer: without a POC nothing on the network knows which
   way the water comes in, and refusing to draw any wash out would hide
   the ends rather than reporting them.

   ── Pure ──

   Features in, positions out. The canvas creates the features and
   replaces them on every rebuild, as it does with service valves. */

import { CONNECT_EPS, SNAP_TOL, isServiceLine } from "./feeder.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Water mains, judged on the layer the type belongs to rather than on
   the spelling of the key — the same test the valves and the builder
   use, so the three cannot disagree about what a main is. */
function waterMains(features, lineTypes) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    if (isServiceLine(f)) return false;
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === "water" : f.Layer_Key === "water";
  });
}

export function washOuts(features = [], opts = {}) {
  const {
    lineTypes = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    layerKey = "water",
  } = opts;

  const mains = waterMains(features, lineTypes);
  if (!mains.length) return { washouts: [] };

  /* ── The graph ──

     Vertices within `eps` of each other are one node, so two runs drawn
     to the same corner are joined there rather than each ending at its
     own end. Degree counts pipe ENDS at the node, which is what makes a
     size change mid-street read as one continuous main. */
  const nodes = [];
  const degree = [];
  const dirs = [];
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    degree.push(0);
    dirs.push([]);
    return nodes.length - 1;
  };

  for (const f of mains) {
    const g = f.Geometry.filter(Array.isArray);
    if (g.length < 2) continue;
    const a = intern(g[0]);
    const z = intern(g[g.length - 1]);
    degree[a] += 1;
    degree[z] += 1;
    /* The direction the pipe leaves the end in, for a symbol that ever
       wants to be turned to it. Taken from the neighbouring vertex, so
       a run that bends in its first metre still points along the pipe
       as dug. */
    dirs[a].push([g[1][0] - g[0][0], g[1][1] - g[0][1]]);
    dirs[z].push([g[g.length - 2][0] - g[g.length - 1][0],
      g[g.length - 2][1] - g[g.length - 1][1]]);
  }

  /* The node the supply arrives at, which is an end and is not a dead
     end. Only when it is actually on the network: a POC dropped on the
     drawing but never connected should not silently suppress a real
     wash out somewhere else. */
  const poc = features.find((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length);
  let source = -1;
  if (poc) {
    let gap = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist(nodes[i], poc.Geometry[0]);
      if (d < gap) { gap = d; source = i; }
    }
    if (gap > tol) source = -1;
  }

  const washouts = [];
  for (let i = 0; i < nodes.length; i++) {
    if (degree[i] !== 1) continue;
    if (i === source) continue;
    const v = dirs[i][0] || [1, 0];
    washouts.push({
      at: [nodes[i][0], nodes[i][1]],
      /* The bearing of the pipe at the end, in degrees. Stored rather
         than recomputed at draw time so the symbol keeps its bearing if
         the run it came off is edited later — the same reason the tees
         carry theirs. */
      angleDeg: (Math.atan2(v[1], v[0]) * 180) / Math.PI,
    });
  }

  return { washouts };
}
