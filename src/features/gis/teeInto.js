/* ── Making a service meet the main ──

   A service cable drawn to a main crosses it. The two lines touch on
   screen and, to anything that walks the network, do not meet at all:
   what joins them is a vertex on the main at the point the service
   starts.

   Auto Service has always added one. Auto Lay Services never did — it
   wrote the cable and its Connects list and stopped — so every service
   laid that way was a cable running to a feeder it was not attached to.

   The visible consequence was the joints: Place Feeder Joints marks a
   service joint at any node where a service leaves the run, and finds
   them by asking the feeder model for a node's service children. No
   vertex, no node, no child, no joint. Which is why some services had
   one and others did not — the ones that did were teed by a full Auto
   Service run, or happened to start where the feeder already had a
   vertex: a bend, a size change, a span node cut.

   The joints are the half somebody notices. The other half is that the
   circuit trace, the load accumulation and the "can this plot be
   connected" check were all walking a network with those services
   detached from it.

   ── Pure ──

   Geometry in, geometry out. Nothing here writes: the caller decides
   what to do with a main whose points have changed, and that is the
   only part that differs between the two routines. */

import { CONNECT_M } from "./snapping.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* The nearest point on a polyline, and how far away it is. */
function nearestOn(point, geom) {
  let best = null;
  for (let i = 1; i < geom.length; i++) {
    const a = geom[i - 1];
    const b = geom[i];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;

    let q;
    if (!len2) q = [a[0], a[1]];
    else {
      let t = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      q = [a[0] + t * vx, a[1] + t * vy];
    }

    const d = dist(point, q);
    if (!best || d < best.d) best = { d, q, index: i };
  }
  return best;
}

/* The same line with a vertex at `point`, or null where it needs none.

   Null rather than the unchanged geometry, so a caller can tell "this
   is already joined" from "this now needs writing" without comparing
   coordinates. Re-running a repair that changes nothing should write
   nothing.

   A point already on a vertex needs no new one. `CONNECT_M` is the
   tolerance the drawing treats as joined everywhere else, so a service
   landing within it on an existing vertex is already attached. */
export function teeVertexInto(geom = [], point, tol = CONNECT_M) {
  if (!Array.isArray(geom) || geom.length < 2 || !point) return null;

  const near = nearestOn(point, geom);
  if (!near || near.d > tol) return null;          // not on this line at all

  if (geom.some((q) => dist(q, point) <= tol)) return null;   // already a vertex

  const out = geom.slice();
  out.splice(near.index, 0, [near.q[0], near.q[1]]);
  return out;
}

/* Which line a point should tee into, out of the candidates.

   The nearest within reach, so a service between two mains joins the
   one it actually touches. Nothing where it reaches none: a service
   that stops short of every main is not attached to anything, and
   inventing a vertex on the closest one would join it to a main it was
   never drawn to.

   Returns the feature and its new geometry together, because a caller
   that has one without the other cannot write the change. */
export function teeInto(candidates = [], point, opts = {}) {
  const { tol = CONNECT_M, geomOf = (f) => f.Geometry } = opts;
  if (!point) return null;

  let best = null;
  for (const f of candidates) {
    const g = geomOf(f);
    if ((g || []).length < 2) continue;
    const near = nearestOn(point, g);
    if (!near || near.d > tol) continue;
    if (!best || near.d < best.near.d) best = { f, g, near };
  }
  if (!best) return null;

  const geometry = teeVertexInto(best.g, best.near.q, tol);
  if (!geometry) return null;                      // already joined there

  return { feature: best.f, geometry };
}

/* The mains of one utility, which is what a service tees into.

   Teeing the dig into the mains trench joins the trenches to each
   other; the cable still has to meet the cable, or a trace stops at the
   junction even though the trenches are continuous. */
export function mainsOnLayer(features = [], layerKey) {
  return features.filter((f) => f.Feature_Type === "line"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length >= 2
    && String(f.Attributes?.Line_Type || "").endsWith("_main"));
}
