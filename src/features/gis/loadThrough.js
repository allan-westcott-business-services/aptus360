/* What a point on the network carries.

   The total load fed THROUGH a feeder end point: every plot, board
   and supply at it or beyond it, in kVA.

   ── Derived, never stored ──

   The whole point of it. A figure written onto the point when the
   build ran would be right until the next thing anybody did: change
   a plot's load, disconnect a service, unplug a teed feeder, and the
   number would sit there looking authoritative and be wrong. That is
   the fault the Aptus Calc Sheet had with its stored `Meters` count,
   found the hard way \u2014 the canvas recounted and the sheet did not,
   so one drawing gave two answers.

   So this reads the drawing every time it is asked. Change anything
   and the next read reflects it, because there is no copy to update.

   ── It is the model's own number ──

   `buildFeederModel` already accumulates load up the tree into
   `cumKva`: each node's own meters plus everything below it. This
   finds the node a feeder point stands on and reads that entry. No
   second walk, so the editor cannot disagree with the levels check
   about what a cable carries.

   Pure, and slow enough to be worth memoising by its caller: it
   builds the routing graph. */

import { buildFeederModel, SPAN_REACH_M } from "./feeder.js";

/* Which node of the model a point stands on.

   From `Span_Anchor` where it has one, because a marker dragged
   clear of the cable still measures the place on the dig it was put
   at \u2014 the same rule the trace's stops follow. */
function nodeFor(model, point) {
  const a = point?.Attributes?.Span_Anchor;
  const at = (Array.isArray(a) && a.length === 2 ? a : (point?.Geometry || [])[0]);
  if (!Array.isArray(at) || !model?.nodes?.length) return -1;

  let best = -1;
  let bestD = Infinity;
  model.nodes.forEach((n, i) => {
    const d = Math.hypot(n[0] - at[0], n[1] - at[1]);
    if (d < bestD) { bestD = d; best = i; }
  });
  /* Out of reach is no answer rather than the nearest answer. A point
     ten metres off the dig is a point the cable does not pass
     through, and naming the nearest node would report somebody else's
     load against it. */
  return bestD <= SPAN_REACH_M ? best : -1;
}

/* The load through `point`, in kVA, or null where it cannot be said.

   Null rather than zero, and the difference matters: zero means the
   cable carries nothing, null means the drawing cannot answer —
   nothing built yet, the point off the dig, no meters to route. A
   panel showing 0.0 kVA for the second is telling somebody their
   design is empty. */
export function loadThrough(point, features = [], opts = {}) {
  if (!point) return null;
  const model = opts.model ?? buildFeederModel(features, opts);
  if (!model || model.error) return null;

  const i = nodeFor(model, point);
  if (i < 0) return null;

  const kva = Number(model.cumKva?.[i]);
  if (!Number.isFinite(kva)) return null;
  return Math.round(kva * 10) / 10;
}

/* And how many supplies make it up, for the line under the figure.

   A kVA on its own does not say whether it is four houses or a block
   of flats, and that is the first thing anybody asks of it. */
export function suppliesThrough(point, features = [], opts = {}) {
  if (!point) return null;
  const model = opts.model ?? buildFeederModel(features, opts);
  if (!model || model.error) return null;

  const i = nodeFor(model, point);
  if (i < 0) return null;

  const n = Number(model.cum?.[i]);
  return Number.isFinite(n) ? n : null;
}
