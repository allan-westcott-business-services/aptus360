/* Which breech joints a service passes through on its way back.

   ── Why the call-off needs to know ──

   A jointing gang connecting a plot works at the meter, and at every
   breech joint between that plot and the origin where the feeder
   divides to reach it. Those are connections to be made, fittings to
   carry on the van, and lines on the work instruction. A call-off that
   names the plots and not the joints sends a gang out short.

   Nobody can read them off the drawing reliably either: the route from
   a plot back to the substation or POC is whatever the network tracing
   says it is, and on an estate it is not the route anybody would guess.

   ── Read from the same graph everything else reads ──

   buildGraph and rootAt, from electric.js. The Connects attribute is
   what network tracing maintains, so a route found here cannot disagree
   with what the canvas shows when somebody traces the same plot by
   hand. Working it out geometrically would be a second tracer, right
   until the day somebody moved a joint.

   ── Taken when the call-off is raised ──

   Same argument spanImage makes about the span pictures. If the design
   is redrawn afterwards the gang still gets what was called off, which
   is the point of a record. A call-off that recomputed itself on
   opening would change under a booking somebody had already been
   given.
*/

import { buildGraph, rootAt } from "./electric.js";
import { isBreechJoint } from "./joints.js";

/* The joints on the path from one feature back to the root.

   Walks the parent chain the rooting produced. `parent` is a Map keyed
   by number, and the root's own entry is null, which is what ends the
   walk.

   Guarded against a cycle it should not be able to have: rootAt builds
   a tree by breadth-first search and cannot produce one, but a walk
   with no ceiling is a hang rather than an error if it ever did. */
function pathToRoot(parent, fromId) {
  const out = [];
  let cur = Number(fromId);
  let guard = 0;
  while (cur != null && parent.has(cur) && guard++ < 100000) {
    out.push(cur);
    cur = parent.get(cur);
  }
  return out;
}

/* Every breech joint between each of these plots and the origin.

   `meters` are the electric meters of the plots being called off —
   metersOfSeeds gives them, which is what the call-off already uses to
   decide who is on a circuit.

   Returns one entry per plot that has any, because that is how the work
   instruction reads: a gang works plot by plot, and "these four joints
   are on the way somewhere" is not something anybody can act on.

   ── Order matters ──

   Listed from the origin outward, not from the plot back. A gang works
   along the cable from where the supply comes in, and a list read in
   the other direction has to be reversed in somebody's head at the
   point they are standing in a hole.

   ── A plot the trace cannot reach ──

   Reported as reachable: false rather than left out. A plot with no
   route back to the origin is a fault in the drawing and the one thing
   worth knowing before a gang is booked \u2014 dropping it silently would
   make an unreachable plot look like a plot with no joints, which is
   the ordinary case. */
export function breechesOnRoutes(features = [], meters = [], originId = null) {
  if (originId == null || !meters.length) return [];

  const graph = buildGraph(features);
  const root = Number(originId);
  if (!graph.byId.has(root)) return [];

  const { parent } = rootAt(graph, root);

  const byId = new Map(features.map((f) => [Number(f.Feature_ID), f]));

  return meters.map((m) => {
    const id = Number(m.Feature_ID);
    const plot = m.Attributes?.Plot_ID ?? null;

    if (!parent.has(id)) {
      return { meterId: id, plotId: plot, reachable: false, joints: [] };
    }

    /* From the plot back, then reversed: the walk goes towards the
       root and the list is read away from it. */
    const path = pathToRoot(parent, id).reverse();

    const joints = path
      .map((nid) => byId.get(nid))
      .filter((f) => f && isBreechJoint(f))
      .map((f) => ({
        featureId: Number(f.Feature_ID),
        label: f.Label || null,
        /* Both spellings, because the two ways a joint gets placed have
           never agreed on which it writes \u2014 see isJointOfKind. Kept as
           found rather than normalised, so what the work instruction
           shows is what the drawing says. */
        jointType: f.Attributes?.Joint_Type ?? null,
        jointCode: f.Attributes?.Joint_Code ?? null,
        at: (f.Geometry || [])[0] ?? null,
      }));

    return { meterId: id, plotId: plot, reachable: true, joints };
  });
}

/* The same thing, as the call-off stores it.

   Only the plots that have something to say: a plot with a clear run
   back needs no line on a work instruction, and listing every plot with
   an empty array would make the record mostly noise.

   Plot numbers rather than plot ids, because that is what a gang reads
   and what the work instruction already prints. `plotNumberOf` is
   passed in rather than looked up here, since the plot list belongs to
   the canvas and this module has no business holding one. */
export function breechSummary(features = [], meters = [], originId = null,
  plotNumberOf = () => null) {
  const routes = breechesOnRoutes(features, meters, originId);

  const plots = [];
  for (const r of routes) {
    if (r.reachable && !r.joints.length) continue;
    plots.push({
      plot: plotNumberOf(r.plotId) ?? r.plotId ?? null,
      plotId: r.plotId ?? null,
      reachable: r.reachable,
      joints: r.joints,
    });
  }

  return {
    plots,
    /* Counted over distinct joints, not summed across plots: one breech
       feeding six plots is one connection to make, and six would put a
       number on the call-off that no gang recognises. */
    totalJoints: new Set(routes.flatMap((r) => r.joints.map((j) => j.featureId))).size,
    unreachable: routes.filter((r) => !r.reachable).length,
  };
}
