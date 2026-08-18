/* Everything between a main and the thing that feeds the site.

   ── Why it matters ──

   A main is only live in the sense that matters — gas or current
   reaching a plot — if everything between it and the source is live
   too. A length marked Live with a dead length upstream of it is
   marked wrong: nothing can flow to it.

   So two things follow, and both are here because both are the same
   walk:

   Setting a length live sets everything upstream of it live, because
   that is what being live means. Somebody who energises a leg has
   energised the network back to the substation, and asking them to
   tick each length in turn is asking them to record the same fact
   several times and get it wrong once.

   And a plot can only be connected if the whole chain is live, which
   is the same statement read the other way.

   ── Where the source is ──

   A substation on the electric layer, a point of connection on gas and
   water. Both are points, and both are where the walk stops.

   ── How lengths connect ──

   End to end, or one ending part-way along another — a tee. Measured
   rather than read off Connects, because Connects records what a line
   was drawn against and a length added later may join two that never
   knew about it. */

import { isMainFeature, statusOf } from "./buildStatus.js";

const JOIN_M = 0.75;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Whether a point lies on a line, anywhere along it. */
function onLine(point, geometry = []) {
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let u = l2 ? ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    if (dist([a[0] + vx * u, a[1] + vy * u], point) <= JOIN_M) return true;
  }
  return false;
}

/* Whether two lines meet.

   Either one's end on the other's length. Two lines that merely cross
   without a vertex are not joined — on a drawing that is one main
   passing over another, and treating it as a junction would walk from
   the gas network into the water one. */
function meet(a, b) {
  const ga = a.Geometry || [];
  const gb = b.Geometry || [];
  if (ga.length < 2 || gb.length < 2) return false;
  return onLine(ga[0], gb) || onLine(ga[ga.length - 1], gb)
    || onLine(gb[0], ga) || onLine(gb[gb.length - 1], ga);
}

/* The source feeding a utility: a substation for electric, a point of
   connection for gas and water. */
export function sourceFor(utility, features = []) {
  const role = utility === "electric" ? "substation" : "poc";
  return features.find((f) => f.Feature_Role === role
    && (f.Geometry || []).length) ?? null;
}

/* Every main of a utility, and which of them touch each other.

   Built once and handed to the walks, because a site of two hundred
   lengths is forty thousand comparisons and doing it per plot is what
   makes a drawing feel slow. */
export function mainsGraph(utility, features = [], lineTypes = []) {
  const mains = features.filter((f) =>
    f.Layer_Key === utility && isMainFeature(f, lineTypes)
    && (f.Geometry || []).length >= 2);

  const near = new Map(mains.map((m) => [Number(m.Feature_ID), []]));
  for (let i = 0; i < mains.length; i++) {
    for (let j = i + 1; j < mains.length; j++) {
      if (!meet(mains[i], mains[j])) continue;
      near.get(Number(mains[i].Feature_ID)).push(Number(mains[j].Feature_ID));
      near.get(Number(mains[j].Feature_ID)).push(Number(mains[i].Feature_ID));
    }
  }

  const source = sourceFor(utility, features);
  const at = (source?.Geometry || [])[0] ?? null;
  /* The lengths the source itself sits on. More than one where several
     leave a substation, which is the ordinary case. */
  const roots = at
    ? mains.filter((m) => onLine(at, m.Geometry)).map((m) => Number(m.Feature_ID))
    : [];

  return { mains, near, roots, source };
}

/* The path from a main back to the source, as feature ids.

   Breadth first, so the answer is the shortest way back rather than
   whichever way the search wandered. A length the source cannot reach
   returns null — which is not the same as an empty path, and the
   difference matters: one is "nothing upstream", the other is "not
   connected to anything".

   Includes the length asked about, because every caller wants it: the
   cascade sets it live, and the connectable test asks whether it is. */
export function pathToSource(featureId, graph) {
  const start = Number(featureId);
  if (!graph?.near?.has(start)) return null;
  if (!graph.roots.length) return null;

  const roots = new Set(graph.roots);
  if (roots.has(start)) return [start];

  const from = new Map([[start, null]]);
  const queue = [start];

  while (queue.length) {
    const at = queue.shift();
    for (const next of graph.near.get(at) || []) {
      if (from.has(next)) continue;
      from.set(next, at);
      if (roots.has(next)) {
        const path = [next];
        let step = at;
        while (step != null) { path.push(step); step = from.get(step); }
        return path.reverse().reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/* Which lengths upstream of this one are not live.

   Empty means the whole chain is live and a plot off this length can be
   connected. Null means the length does not reach the source at all,
   which is a drawing problem rather than an answer. */
export function deadUpstream(featureId, graph) {
  const path = pathToSource(featureId, graph);
  if (!path) return null;

  const byId = new Map(graph.mains.map((m) => [Number(m.Feature_ID), m]));
  return path
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((m) => statusOf(m) !== "live");
}

/* Everything to set live when one length is.

   The length itself and everything between it and the source. Only
   those not already live, so the change says what actually changed
   rather than rewriting half the drawing with the value it already
   had. */
export function liveCascade(featureId, graph) {
  const dead = deadUpstream(featureId, graph);
  if (!dead) return [];
  return dead;
}
