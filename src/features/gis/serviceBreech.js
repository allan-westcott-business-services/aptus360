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

/* Two points this close are the same place.

   The drawing's own connect tolerance, which is what decides whether
   two cable ends meet — so a joint and a node the canvas treats as
   coincident are treated as coincident here too. A looser figure would
   name a joint after a node it merely sits near, and on a busy junction
   that is a different node. */
const SAME_PLACE_M = 0.25;

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

  /* ── The LV network starts at the origin, and does not run through
         anything upstream of it ──

     rootAt walks the graph breadth first, so it finds the fewest-hops
     route rather than the electrical one. Where a scheme has a
     substation AND a point of connection, the incomer joins the two —
     so the graph has a way round through the POC, and a plot whose own
     leg is long came back routed through it. Plot 34 listed five
     breech joints nobody would meet walking its actual feeder, while
     every other plot on the call-off shared two.

     The POC is upstream of a substation: the incomer arrives there and
     the LV network begins at the transformer. So where the origin is a
     substation, the POC is taken out of the graph and no route can pass
     through it.

     Where the POC IS the origin \u2014 a connection to an existing network,
     with no transformer \u2014 it stays, because that is where the network
     starts. Nothing is excluded then, because there is nothing upstream
     of it on the drawing. */
  const origin = features.find((f) =>
    Number(f.Feature_ID) === Number(originId));
  const upstream = origin?.Feature_Role === "substation"
    ? new Set(features
      .filter((f) => (f.Feature_Role === "poc" && f.Layer_Key === "electric")
        /* And the incomer itself. Taking the POC point out was not
           enough: the cable from the POC to the substation still joined
           the two ends, so a route could still go round through it.

           Marked two ways by the routine that lays it — `Poc_Route` on
           the feature and `elec_hv` as its type — and both are checked,
           because an incomer drawn by hand carries the type and not the
           flag. HV is not the LV network by definition. */
        || f.Attributes?.Poc_Route === true
        || String(f.Attributes?.Line_Type ?? "").toLowerCase() === "elec_hv")
      .map((f) => Number(f.Feature_ID)))
    : new Set();

  const graph = buildGraph(
    upstream.size
      ? features.filter((f) => !upstream.has(Number(f.Feature_ID)))
      : features,
  );
  const root = Number(originId);
  if (!graph.byId.has(root)) return [];

  const { parent } = rootAt(graph, root);

  const byId = new Map(features.map((f) => [Number(f.Feature_ID), f]));

  /* ── The node a joint stands on ──

     A breech joint is placed exactly where a span node is, because both
     mark the same event on the network: the point the feeder divides.
     The node is what the drawing, the levels check and the call-off all
     call that place \u2014 A5, B2 \u2014 so it is what the work instruction
     should name the joint by. "Breech joint 4812" is a database id and
     means nothing to anybody in a hole.

     Matched on position rather than on Connects: a joint and a node at
     one point are not linked to each other, they are both linked to the
     cable. Position is the only thing they share.

     Electric only, and Span_Seq is not filtered \u2014 a breech on the
     origin node itself is unusual and not impossible, and calling it E0
     is right. */
  /* Every span node, whatever layer it is on.

     Place Span Nodes writes them on the **trench** layer \u2014 the node
     belongs to the trench and carries its own class so it can be hidden
     without hiding the trenches. Only the origin is written on the
     utility's layer, by the circuit and origin writers. Filtering to
     electric here therefore matched the origin and nothing else, so
     every joint on a run came back "not on a node" while A4 and A9 sat
     on the drawing. */
  const nodes = features.filter((f) => f.Feature_Role === "spannode"
    && (f.Geometry || []).length);

  /* Where a node IS, as against where its marker is drawn.

     The marker gets moved a metre or two clear so its label can be
     read; Span_Anchor is where on the trench it belongs, and the
     network is measured from that. A joint stands at the anchor, so
     comparing against the marker put the two more than a tolerance
     apart on any node somebody had nudged. */
  const nodePoint = (n) => n.Attributes?.Span_Anchor ?? n.Geometry[0];

  const nodeAt = (at) => {
    if (!at) return null;
    let best = null;
    let bestD = SAME_PLACE_M;
    for (const n of nodes) {
      const p = nodePoint(n);
      if (!Array.isArray(p) || p.length < 2) continue;
      const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
      /* Strictly nearer, so two nodes at the same spot resolve to the
         lower id rather than to whichever the scan reached last. */
      if (d < bestD || (d === bestD && best && Number(n.Feature_ID) < Number(best.Feature_ID))) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  return meters.map((m) => {
    const id = Number(m.Feature_ID);
    /* A column on the feature, not an attribute.

       GIS_Feature carries Plot_ID beside Layer_Key and Feature_Role \u2014
       the endpoint selects it by name and circuitReport reads it as
       `m.Plot_ID`. Reading it out of Attributes returned undefined for
       every meter ever drawn, so every row came back with no plot
       number against it and the office could not tell which plot a
       joint belonged to. The attribute is still read as a fallback,
       because nothing stops a feature carrying it there. */
    const plot = m.Plot_ID ?? m.Attributes?.Plot_ID ?? null;

    if (!parent.has(id)) {
      return { meterId: id, plotId: plot, reachable: false, joints: [] };
    }

    /* From the plot back, then reversed: the walk goes towards the
       root and the list is read away from it. */
    const path = pathToRoot(parent, id).reverse();

    /* ── Why the joints are found by position and not on the path ──

       The path is a chain of cables. A joint is a point feature and the
       graph attaches a point to the one line nearest it, so a joint
       hangs off a cable as a leaf \u2014 it is in the tree and it is never
       *between* the meter and the origin. Filtering the path for joints
       therefore found none, on every drawing, and said so by returning
       an empty list rather than by failing: a call-off with breeches on
       it looked exactly like one without.

       So the route is the cables, and a joint is on it if it stands on
       one of their points. Which is the same statement the naming makes
       \u2014 a breech joint is placed exactly where a span node is \u2014 read
       from the other end.

       Every vertex, not only the ends: a breech divides the feeder and
       the cables meet at that division, but which vertex of which cable
       records it depends on how the run was drawn. */
    const routePoints = [];
    path.forEach((nid, order) => {
      const f = byId.get(nid);
      for (const v of (f?.Geometry || [])) {
        if (Array.isArray(v) && v.length >= 2) routePoints.push({ at: v, order });
      }
    });

    /* How far along the route a point is, or null if it is not on it.
       The order is the path position of the first cable carrying it, so
       joints come out from the origin outward rather than in whatever
       order the features happened to be stored. */
    const orderOf = (at) => {
      if (!at) return null;
      let best = null;
      for (const rp of routePoints) {
        if (Math.hypot(rp.at[0] - at[0], rp.at[1] - at[1]) > SAME_PLACE_M) continue;
        if (best == null || rp.order < best) best = rp.order;
      }
      return best;
    };

    const joints = features
      .filter((f) => isBreechJoint(f) && (f.Geometry || []).length)
      .map((f) => ({ f, order: orderOf((f.Geometry || [])[0]) }))
      .filter((x) => x.order != null)
      .sort((a, b) => a.order - b.order)
      .map(({ f }) => {
        const at = (f.Geometry || [])[0] ?? null;
        const node = nodeAt(at);
        return {
        featureId: Number(f.Feature_ID),
        label: f.Label || null,
        /* The node this joint stands on, which is what it is called by.
           Null where there is none within the tolerance \u2014 said rather
           than guessed at, because a breech with no node on it is a
           drawing that has not had Place Span Nodes run since the joint
           went in, and the levels check will not be measuring to it
           either. */
        node: node
          ? (node.Attributes?.Span_Label
            || (node.Label ? String(node.Label).replace(/^Point\s+/i, "") : null))
          : null,
        nodeId: node ? Number(node.Feature_ID) : null,
        /* Both spellings, because the two ways a joint gets placed have
           never agreed on which it writes \u2014 see isJointOfKind. Kept as
           found rather than normalised, so what the work instruction
           shows is what the drawing says. */
        jointType: f.Attributes?.Joint_Type ?? null,
        jointCode: f.Attributes?.Joint_Code ?? null,
        at,
        };
      });

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

  /* ── One line per joint, not one per plot ──

     A joint feeding six plots was listed against all six, so a call-off
     over a terrace read as the same two joints repeated down the
     screen. The count underneath already said "counted once each",
     which made the repetition look like a contradiction.

     Listed once, in the order they are met walking out from the origin,
     with the plots each one serves beside it. That is the shape of the
     work: a gang makes the joint once and it feeds those plots.

     `plots` above is kept as it is. The work instruction is read plot
     by plot on a road \u2014 somebody at number 22 needs the joints on
     number 22's route and nobody else's \u2014 so the two views want
     different shapes and each gets its own. */
  const byJoint = new Map();
  for (const p of plots) {
    if (!p.reachable) continue;
    for (const j of p.joints) {
      const key = j.featureId;
      if (!byJoint.has(key)) byJoint.set(key, { ...j, plots: [] });
      const seen = byJoint.get(key).plots;
      const name = p.plot ?? p.plotId;
      if (name != null && !seen.includes(name)) seen.push(name);
    }
  }

  return {
    plots,
    /* Each joint once. Ordered by where it was first met on a route,
       which is outward from the origin \u2014 the order a gang works. */
    joints: [...byJoint.values()],
    /* Counted over distinct joints, not summed across plots: one breech
       feeding six plots is one connection to make, and six would put a
       number on the call-off that no gang recognises. */
    totalJoints: new Set(routes.flatMap((r) => r.joints.map((j) => j.featureId))).size,
    unreachable: routes.filter((r) => !r.reachable).length,
  };
}

/* ── What a joint is called ──

   "Breech Joint at Node A5". The node is how the drawing, the levels
   check and the call-off all name that place, so it is how a gang finds
   it \u2014 a breech joint is placed exactly where a span node is, because
   both mark the point the feeder divides. A database id means nothing
   to anybody standing in a hole.

   Lives here rather than in the work instruction because three screens
   now show these: the call-off dialog before raising, the call-off page
   after, and the form on the road. Three spellings of one name is the
   fault this repo keeps finding; one function is the fix.

   Where there is no node, said so. A breech with no span node on it
   means Place Span Nodes has not been run since the joint went in \u2014
   so the levels check is not measuring to it either, and the omission
   is worth more than the name. */
export function jointLabel(j) {
  if (j?.node) return `Breech Joint at Node ${j.node}`;

  /* The drawing's own label, where it says anything the words "Breech
     Joint" do not already say.

     Most joints are labelled "Breech Joint" on the drawing, which read
     out as "Breech Joint Breech Joint \u2014 not on a node". A label that
     repeats the kind adds nothing, so it is only used where it
     identifies the particular joint \u2014 "BJ-7", a plot number, whatever
     somebody wrote on it. */
  const own = String(j?.label ?? "").trim();
  const adds = own && own.toLowerCase().replace(/[^a-z]/g, "") !== "breechjoint";
  return adds
    ? `Breech Joint ${own} \u2014 not on a node`
    : "Breech Joint \u2014 not on a node";
}
