/* Where the span nodes go, from the trench network alone.

   A span node marks a point the network is measured between: a junction,
   an end, or the plant itself. Until now they were placed by Build LV
   Network, which meant they existed only once a circuit had been
   designed — and a mains call-off, which names a run as "A1 to A5",
   could not be raised before that.

   They belong to the trench. The trench is what gets dug, the spans are
   what gets laid along it, and neither waits for a circuit design.

   ── Where a node belongs ──

   Three kinds of point, and nothing else:

     a junction   where three or more trenches meet, because that is
                  where a run divides and a length stops meaning one
                  thing
     an end       where a run stops, because that is where laying stops
     the plant    the substation, governor or pumping station, which is
                  where everything is measured from

   A bend is not a junction. Two trenches meeting end to end is one run
   that happens to turn a corner, and putting a node there would split a
   span for no reason anybody on site would recognise. */

import { TRENCH_CARRIES } from "./trenchCarries.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* The plant a utility is measured from, and what it is called.

   E0, G0, W0 — the letter says which utility and the zero says it is the
   origin. A span node is A1 upwards, so the plant can never be confused
   with a span. */
export const PLANT = {
  substation: { role: "substation", layer: "electric", label: "E0" },
  governor: { role: "governor", layer: "gas", label: "G0" },
  pumping: { role: "pumping", layer: "water", label: "W0" },
};

/* Where a utility is measured from when its plant is not there.

   Gas is measured from the governor, but a site fed at low pressure
   from an existing main has no governor \u2014 the POC is the origin. The
   same for water without a pumping station.

   ── And electric ──

   This said electric was different: "measured from the substation,
   which is always drawn, so its POC is not a fallback". It is not
   always drawn. On a connection to an existing network there is no new
   transformer, the incomer arrives at the POC and the LV network starts
   there \u2014 which is the whole of what lvOrigin says, and it says it
   because the same assumption had already been found wrong in the
   feeder build, the levels check, the circuit report and the way
   allocation.

   Left out here, an electric POC matched nothing and was numbered as an
   ordinary junction: Place Span Nodes put A5 on it instead of E0, so
   the origin of the LV network sat in the middle of the span numbering
   and originNodeFor found no Span_Seq 0 node to start from. Exactly the
   fault the paragraph below describes for gas, on the one utility that
   was excused from the fix.

   Plant still wins where both are drawn \u2014 originsOf checks PLANT
   first \u2014 so a scheme with a substation is numbered from the
   substation and the POC beside it is where the incomer arrives.

   Without this a POC matched nothing and took a generic A-number, which
   put the origin of the network in the middle of the span numbering and
   left the levels check with nothing to start from. */
const STANDS_IN = { electric: "substation", gas: "governor", water: "pumping" };

export function plantLabel(feature) {
  for (const p of Object.values(PLANT)) {
    if (feature?.Feature_Role === p.role) return p.label;
  }
  return null;
}

/* The origin for each utility, and what it is called.

   One per utility rather than one per site: a site has a substation and
   a gas POC and a water POC, and picking whichever came first in the
   feature list gave one utility an origin and left the others to be
   numbered as spans.

   Plant wins over a POC where both are drawn \u2014 a governor and a gas
   POC on one site are two different points, and the network starts at
   the governor. */
export function originsOf(features = []) {
  const out = new Map();
  for (const p of Object.values(PLANT)) {
    const plant = features.find((f) => f.Feature_Role === p.role);
    if (plant) out.set(p.layer, { feature: plant, label: p.label });
  }

  /* Every POC, not the first.

     A site can be fed from more than one side \u2014 two gas mains in
     different roads, each serving its own part of the estate, with the
     networks never meeting. One origin meant the second network had no
     point to be measured from, so it could be drawn but not traced.

     Numbered after the first: G0, then G0b, G0c. Not G1, which is a
     length of main \u2014 the numbers belong to the mains and the letters
     to the origins, and borrowing one for the other would make two
     things on a drawing share a name.

     Keyed per POC so each is its own entry, while the plain layer key
     still finds the first \u2014 everything that asks for "the gas origin"
     and means the only one keeps working. */
  for (const [layer, role] of Object.entries(STANDS_IN)) {
    if (out.has(layer)) continue;
    const pocs = features.filter((f) => f.Feature_Role === "poc"
      && f.Layer_Key === layer);
    const p = Object.values(PLANT).find((x) => x.role === role);
    pocs.forEach((poc, i) => {
      const label = i === 0
        ? p.label
        : `${p.label}${String.fromCharCode(97 + i)}`;
      out.set(i === 0 ? layer : `${layer}:${poc.Feature_ID}`,
        { feature: poc, label, standingIn: true, layer });
    });
  }
  return out;
}

/* Every point where trenches meet or stop.

   Points are interned within a tolerance, because two trenches drawn to
   the same corner are never at exactly the same coordinate and a
   junction found twice is two nodes on top of each other. */
export function junctionsOf(trenches = [], opts = {}) {
  const { eps = 0.25 } = opts;

  const points = [];
  const intern = (p) => {
    for (const q of points) {
      if (dist(q.at, p) <= eps) return q;
    }
    const q = { at: [p[0], p[1]], ends: 0, through: 0 };
    points.push(q);
    return q;
  };

  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;
    /* The ends. A vertex in the middle of a trench is a bend, and a bend
       is not a junction — it is one run turning a corner. */
    intern(g[0]).ends += 1;
    intern(g[g.length - 1]).ends += 1;
  }

  /* And ends that land part way along another trench.

     A run drawn from one side of a road to the other, meeting a trench
     that carries straight on past it, is a junction — three arms leave
     that point. Counting only ends missed it entirely: the through
     trench has its ends somewhere else, so the point where the other
     one arrives had a single end against it and read as the end of a
     run rather than a tee.

     What arrives contributes one arm; what passes through contributes
     two, because the run continues on both sides. */
  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;

    for (const p of points) {
      /* Its own ends are already counted. */
      if (dist(p.at, g[0]) <= eps) continue;
      if (dist(p.at, g[g.length - 1]) <= eps) continue;

      for (let i = 0; i + 1 < g.length; i++) {
        const a2 = g[i];
        const b2 = g[i + 1];
        const vx = b2[0] - a2[0];
        const vy = b2[1] - a2[1];
        const len2 = vx * vx + vy * vy;
        if (!len2) continue;
        let u = ((p.at[0] - a2[0]) * vx + (p.at[1] - a2[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const on = [a2[0] + vx * u, a2[1] + vy * u];
        if (dist(p.at, on) > eps) continue;

        /* Landing on a vertex between two segments would otherwise be
           counted twice, once for each. */
        if (dist(p.at, b2) <= eps && i + 2 < g.length) continue;

        p.through += 2;
        break;
      }
    }
  }

  return points;
}

/* The nodes a drawing wants, in order along the network.

   Numbered outwards from the plant, so A1 is the first thing off it and
   the numbers grow the way the network does. A node numbered by drawing
   order would put A7 next to A2 on the ground, which is no use to
   anybody reading it on site. */
/* Which trenches are services.

   A trench with a meter on one end. Not a name — that was tried and a
   mains leg typed "trench_service_road" was classified out of the
   network, which is the same mistake in a different place.

   Services are ignored entirely when placing nodes: where one joins a
   main is not a junction of mains, and a span does not stop there. */
export function servicesAmong(trenches = [], opts = {}) {
  const { serviceTypes } = opts;

  /* The trench type, and nothing else.

     A trench is a service because it was drawn as one. Meters have
     nothing to do with it: a service exists before its meter is placed
     and would still be a service if the plot were never built, and
     making the classification wait for a meter meant nodes appeared
     wherever a service teed in until somebody had worked far enough
     through the job.

     No fallback. A guess that is right most of the time puts nodes in
     the wrong places the rest of the time and gives no sign which is
     which — where nothing is classified, the count says none were
     ignored and that is the thing to act on. */
  if (!serviceTypes || !serviceTypes.size) return new Set();

  const ids = new Set();
  for (const t of trenches) {
    if (serviceTypes.has(t?.Attributes?.Line_Type)) ids.add(t.Feature_ID);
  }
  return ids;
}

export function planSpanNodes(trenches = [], plant, opts = {}) {
  const { eps = 0.25 } = opts;

  /* Mains only.

     Four rules, and all of them are about mains:

       a junction of mains          gets a node
       where a service joins        does not — a span runs through it
       the end of a main            gets one, if no other main is there
       where the main meets plant   does not — that is E0, G0 or W0

     Services are dropped before anything is counted, so a point where
     three trenches meet but one of them is a service is a junction of
     two mains, which is a bend. */
  const serviceIds = opts.serviceIds ?? servicesAmong(trenches, opts);
  const mains = trenches.filter((t) => !serviceIds.has(t.Feature_ID));

  /* Every origin, not one. `plant` may be a single feature (as it was)
     or a list of them, so a site with a substation and a gas POC gets a
     node at neither rather than at whichever was found first. */
  const plantList = Array.isArray(plant) ? plant : [plant].filter(Boolean);
  const plantPoints = plantList
    .map((f) => (f?.Geometry || [])[0])
    .filter(Boolean);
  const plantAt = plantPoints[0];
  const points = junctionsOf(mains, opts);
  if (!points.length) return { error: "No trenches to place span nodes on." };

  /* What each point is. A point where one trench end arrives is the end
     of a run; three or more is a junction; exactly two is two trenches
     meeting end to end, which is a bend and gets nothing. */
  /* And not where the main meets the plant.

     The substation is the origin — E0 — and a span node on top of it
     would be a second name for the same place, with A1 and E0 both
     meaning the transformer. */
  /* Where what a trench carries changes.

     A length restricted to one utility is a boundary in the network:
     a cable can run up to it and no further, so the design has to be
     measurable to exactly that point. Without a node there the last
     thing before the boundary is measured to whatever lies past it, or
     to nothing at all.

     A bend between two lengths that carry different things is
     therefore not a bend. It is the end of one network and the start of
     another, and it gets a node like any other end.

     Judged on the trenches meeting at the point, not on one of them:
     the boundary is between them, and either may be the restricted
     one. */
  const restrictedAt = (p) => {
    const here = mains.filter((t) => {
      const g = t.Geometry || [];
      return g.length >= 2
        && [g[0], g[g.length - 1]].some((e) => dist(e, p.at) <= (opts.eps ?? 0.25));
    });
    if (here.length < 2) return false;
    /* Any of them narrowed, and they do not all say the same thing. */
    const said = here.map((t) => TRENCH_CARRIES
      .map(({ key }) => (t.Attributes?.[key] === false ? "0" : "1")).join(""));
    return said.some((x) => x.includes("0")) && new Set(said).size > 1;
  };

  const wanted = points.filter((p) => {
    /* Arms leaving this point: what ends here, plus twice anything
       passing through it. Three or more is a junction; exactly one is
       the end of a run; two is a bend. */
    const arms = p.ends + p.through;
    /* A bend where the carrying changes is not a bend. */
    if (arms !== 1 && arms < 3 && !restrictedAt(p)) return false;
    /* Any origin, not just the first. A point on the gas POC is G0 and
       must not also take an A-number, which is what happened when only
       the substation was checked. */
    if (plantPoints.some((q) => dist(p.at, q) <= (opts.plantM ?? 2.0))) return false;
    return true;
  });

  /* Ordered by how far along the network they are, not as the crow
     flies — a node round a corner is further than one straight ahead
     even when it looks nearer. Distance along the trenches is what the
     numbering should follow.

     Walked as a graph over the interned points. */
  const idOf = new Map(points.map((p, i) => [p, i]));
  const adj = new Map(points.map((_, i) => [i, []]));
  /* Each trench split at every point that sits on it, not just at its
     own two ends.

     Linking only the ends left a trench that another one tees into
     joined to nothing at the tee — so the junction was unreachable, had
     no distance along the network, and sorted to the back as though it
     were on an island. The numbering then ran A1 to the far end and gave
     the junction a later letter than things beyond it.

     Splitting at every point on the trench gives the graph the same
     shape the dig has. */
  for (const t of mains) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;

    /* Every interned point that lies on this trench, in order along it,
       with how far along it each one is. */
    const on = [];
    let run = 0;
    for (let i = 0; i + 1 < g.length; i++) {
      const a2 = g[i];
      const b2 = g[i + 1];
      const segLen = dist(a2, b2);
      const vx = b2[0] - a2[0];
      const vy = b2[1] - a2[1];
      const len2 = vx * vx + vy * vy;

      for (const p of points) {
        if (!len2) continue;
        let u = ((p.at[0] - a2[0]) * vx + (p.at[1] - a2[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const at = [a2[0] + vx * u, a2[1] + vy * u];
        if (dist(p.at, at) > eps) continue;
        on.push({ p, m: run + segLen * u });
      }
      run += segLen;
    }

    on.sort((x, y) => x.m - y.m);
    /* Consecutive points on the trench are neighbours, at the distance
       between them along it. Duplicates — the same point found on two
       adjoining segments — collapse to a zero-length step and are
       dropped. */
    for (let i = 0; i + 1 < on.length; i++) {
      const A = on[i];
      const B = on[i + 1];
      if (A.p === B.p) continue;
      const len = B.m - A.m;
      if (len <= eps) continue;
      adj.get(idOf.get(A.p)).push({ to: idOf.get(B.p), len });
      adj.get(idOf.get(B.p)).push({ to: idOf.get(A.p), len });
    }
  }

  /* From the first origin given, or from whichever point is furthest
     from everything if there is no plant yet — a drawing without a
     substation should still number sensibly rather than refuse.

     One root even where there are several origins: A-numbers run
     outward across the whole dig, and numbering each utility's network
     separately would give two A3s on one drawing. Which origin they
     count from decides only the order, and the caller puts the
     substation first. */
  let root = 0;
  if (plantAt) {
    let best = Infinity;
    points.forEach((p, i) => {
      const d = dist(p.at, plantAt);
      if (d < best) { best = d; root = i; }
    });
  }

  const far = new Array(points.length).fill(Infinity);
  far[root] = 0;
  const seen = new Set();
  for (;;) {
    let at = -1;
    for (let i = 0; i < points.length; i++) {
      if (seen.has(i) || far[i] === Infinity) continue;
      if (at < 0 || far[i] < far[at]) at = i;
    }
    if (at < 0) break;
    seen.add(at);
    for (const { to, len } of adj.get(at) || []) {
      if (far[at] + len < far[to]) far[to] = far[at] + len;
    }
  }

  const ordered = wanted
    .map((p) => ({ point: p, m: far[idOf.get(p)] }))
    /* Unreachable points last rather than dropped: a trench not joined
       to the rest is exactly what somebody needs to see, and a node it
       never got is one fewer clue. */
    .sort((a, b) => (a.m === Infinity ? 1e9 : a.m) - (b.m === Infinity ? 1e9 : b.m));

  return {
    ok: true,
    plant: plant ? { feature: plant, label: plantLabel(plant) } : null,
    nodes: ordered.map((o, i) => ({
      at: o.point.at,
      /* A bare number. The letters belong to the circuits now: feeder
         end points are A0, A1\u2026 in circuit A's colour, B0, B1\u2026 in
         B's, and a span node called A1 standing beside a feeder point
         called A1 was two different facts wearing one name. The dig's
         points are 1, 2, 3\u2026 outward from the origin \u2014 no letter,
         because the dig has no circuit. Place Span Nodes re-labels
         nodes it adopts, so an existing drawing takes the new names
         on its next re-place. */
      label: `${i + 1}`,
      seq: i + 1,
      /* How far along the trenches it is, which is what the numbering
         follows and worth keeping for anybody checking it. */
      alongM: o.m === Infinity ? null : Math.round(o.m * 10) / 10,
      kind: (o.point.ends + o.point.through) === 1 ? "end" : "junction",
      reachable: o.m !== Infinity,
    })),
    /* Bends, counted but not marked, so it is clear they were seen and
       deliberately left alone. */
    bends: points.filter((p) => (p.ends + p.through) === 2).length,
    /* What was treated as a service and therefore ignored.

       Reported because getting this wrong is invisible otherwise: a
       service not recognised puts a node where a service tees in, and
       the only symptom is a node somewhere it should not be. A number
       here says whether the classification found anything at all. */
    servicesIgnored: serviceIds.size,
    mainsUsed: mains.length,
  };
}

/* ── Which span node a cable run feeds ──

   Volt drop is totalled span by span and each stretch uses the cable of
   the node it arrives at, so the figure the trace reads lives on the
   node rather than on the drawn section. Changing the cable on a
   section therefore changed nothing anyone could see: both pickers look
   the same and are filled from the same catalogue, and only one of them
   is read.

   Which node a section feeds is decided by Span_Seq rather than by which
   end of the geometry it is, because a line redrawn or joined can run
   either way round while the numbering always counts outward from the
   substation. The node with the higher sequence is the one downstream,
   and downstream is what the run feeds.

   Lifted out of GISCanvasPage so it can be tested against directly.
   checkspannodes.mjs previously re-implemented this rule inline as a
   local double, which meant the suite went on passing while the real
   function drifted away underneath it \u2014 the mirrors were right and the
   thing they stood for was not. A test that imports the function it
   names is the only kind that can fail for the right reason. */
/* ── Shared by the two rules below ──

   Whether a line can feed a node at all, and which nodes it may feed.
   One place, so the end rule and the through rule cannot disagree about
   what a service is or whose nodes a circuit's cable may claim. */
const feedsNothing = (line, isTrench) => {
  const g = line?.Geometry || [];
  if (g.length < 2) return true;
  /* A service cable never feeds a span node.

     A node is a point on the mains run, and the cable feeding it is the
     main arriving there \u2014 the service is what leaves it for a plot.
     Recording a service against a node meant the volt drop along the
     mains was computed on a service cable, which is a smaller conductor
     and a shorter run: wrong, and wrong in the direction that looks
     acceptable. */
  if (isTrench(line.Attributes?.Line_Type)) return true;
  if (/service/i.test(String(line.Attributes?.Line_Type ?? ""))) return true;
  return false;
};

/* The nodes a cable on circuit `cid` is allowed to feed: its own
   circuit's, or one that names none. A node is given its circuit when
   the build routes through it, and one the build pruned never gets one.
   Never the origin \u2014 nothing feeds it. */
const feedable = (features, cid) => {
  /* Feeder points first: where the circuit has its own electrical
     points, they are what a cable feeds, and the span nodes beside
     them go back to documenting the dig. A cable naming no circuit,
     or a drawing from before feeder points existed, feeds span nodes
     exactly as it always did. */
  if (cid != null) {
    const feps = features.filter((f) => (f.Feature_Role === "feederpoint"
      || (f.Feature_Role === "linkbox" && f.Attributes?.Span_Seq != null))
      && String(f.Attributes?.Circuit_ID) === String(cid)
      && Number(f.Attributes?.Span_Seq) !== 0
      && (f.Geometry || []).length);
    if (feps.length) return feps;
  }
  return features.filter((f) =>
    f.Feature_Role === "spannode"
    && (cid == null || f.Attributes?.Circuit_ID == null
      || String(f.Attributes.Circuit_ID) === String(cid))
    && Number(f.Attributes?.Span_Seq) !== 0
    && (f.Geometry || []).length);
};

/* Where a node belongs on the dig, not where its marker was dragged. */
const posOf = (f) => {
  const a = f.Attributes?.Span_Anchor;
  return (Array.isArray(a) && a.length === 2 ? a : f.Geometry[0]);
};

export function nodeFedBy(line, features = [], opts = {}) {
  const { isTrench = () => false, reach = 10 } = opts;
  const look = features;
  const g = line?.Geometry || [];
  if (feedsNothing(line, isTrench)) return null;
  /* A cable with no circuit feeds whichever node it ends at. Refusing
     it here is what left a hand-drawn run's node unset. */
  const cid = line.Attributes?.Circuit_ID ?? null;

  const sub = look.find((f) => f.Feature_Role === "substation"
    && (f.Geometry || []).length);
  const at = sub?.Geometry?.[0] ?? null;
  const ends = [g[0], g[g.length - 1]];
  const fromSub = (p) => (at ? Math.hypot(p[0] - at[0], p[1] - at[1]) : 0);

  const eligible = feedable(look, cid);

  /* The nearest node to each end, and only that one.

     Every node within reach of either end used to be a candidate, and on
     short spans that takes in the node beyond the one this cable
     reaches: with A1 and A2 eight metres apart, the cable from the
     substation to A1 had both in range, and the downstream rule then
     preferred A2. Editing the first cable changed the second node.

     One node per end removes the question. A cable runs between two
     points and feeds the far one; a node past that is the next cable's
     business. */
  const nearestTo = (end) => {
    let best = null;
    for (const f of eligible) {
      const p = posOf(f);
      const d = Math.hypot(p[0] - end[0], p[1] - end[1]);
      if (d > reach) continue;
      if (!best || d < best.d) best = { f, d };
    }
    return best?.f ?? null;
  };

  const near = [...new Set(ends.map(nearestTo).filter(Boolean))];
  if (!near.length) return null;

  const gapOf = (f) => {
    const p = posOf(f);
    return Math.min(...ends.map((e) => Math.hypot(p[0] - e[0], p[1] - e[1])));
  };

  /* The downstream node of the two. Span_Seq counts outward from the
     origin, so where both are numbered the higher is downstream. Where
     they are not \u2014 a node the build never sequenced \u2014 distance from the
     substation says the same thing about the drawing rather than about
     the numbering. Only then the nearest, which is all that is left.

     ── Only on the same circuit ──

     Two numberings are in use. The build numbers a circuit's own nodes
     A1, A2, A3 outward from the origin; Trench › Place Span Nodes
     numbers the whole site the same way, and a node the build never
     adopted keeps that site-wide number. The two count different
     things, so a circuit node at seq 3 beside an unadopted node at seq
     2 said nothing about which was downstream \u2014 and the rule read it as
     if it did, fed the upstream node twice and the downstream one not
     at all. Where the circuits differ the numbers are not compared;
     the drawing decides instead. */
  return near.reduce((a, b) => {
    const sa = Number(a.Attributes?.Span_Seq ?? -1);
    const sb = Number(b.Attributes?.Span_Seq ?? -1);
    const sameCircuit = String(a.Attributes?.Circuit_ID ?? "")
      === String(b.Attributes?.Circuit_ID ?? "");
    if (sameCircuit && sa >= 0 && sb >= 0 && sa !== sb) return sb > sa ? b : a;
    const da = fromSub(posOf(a));
    const db = fromSub(posOf(b));
    if (at && Math.abs(da - db) > 0.5) return db > da ? b : a;
    return gapOf(b) < gapOf(a) ? b : a;
  });
}

/* ── A cable that runs through a node feeds it too ──

   nodeFedBy answers for the node a cable ends at. It said nothing about
   a node the cable passes straight through, and there are many of those:
   Trench › Place Span Nodes puts a node at every junction of mains, but
   a circuit's run only breaks at a junction where the circuit itself
   divides. Where circuit A goes straight on and only circuit B turns
   off, A's cable is one section through the junction and B's cable is
   one section through it the other way \u2014 the node is a bend to both
   models, adopted by neither, and no cable ends within reach of it. It
   read "not set" against two cables running over it.

   The cable entering such a node is the cable leaving it, so there is
   nothing to choose: the node holds the section that runs through it.

   ── Through, not near ──

   The node has to project onto the body of the line, away from both
   ends. A node just beyond a cable's end is within `reach` of that end
   and is the end rule's business \u2014 it decided that node belongs to the
   next cable, and this rule must not hand it back. So the nearest point
   on the line to the node is found, and only counts where it sits on
   the line's body rather than at either end. A cable that stops short
   of a node never runs through it, whatever the reach.

   `reach` is SPAN_REACH_M, the one figure the model uses for how far a
   node may sit from its cable and still be its cable's node. A node is
   placed by eye against a plan and can sit a metre or two off the
   trench; a parallel trench in the other footway is further than that,
   and the nearest cable wins where two are in range, so the one running
   over the node beats the one running beside it.

   Returns the distance where the line runs through the node, else null,
   so a caller choosing between cables can take the nearest. */
export function runsThrough(line, node, opts = {}) {
  const { isTrench = () => false, reach = 10 } = opts;
  if (feedsNothing(line, isTrench)) return null;
  const g = line.Geometry;
  const p = posOf(node);

  /* Cumulative length to each vertex, so the nearest point can be
     placed along the line as well as beside it. */
  const along = [0];
  for (let i = 1; i < g.length; i++) {
    along.push(along[i - 1] + Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]));
  }
  const total = along[g.length - 1];

  let best = null;
  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1];
    const [bx, by] = g[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (!len2) continue;
    let t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
    if (d > reach) continue;
    const s = along[i - 1] + t * Math.sqrt(len2);
    if (!best || d < best.d) best = { d, s };
  }
  if (!best) return null;

  /* On the body of the line, not at its ends. Half a metre is the
     model's own CONNECT_EPS \u2014 two points that close are one point \u2014 so
     a node that projects within that of an end is at the end, and the
     end rule owns it. */
  if (best.s <= 0.5 || total - best.s <= 0.5) return null;
  return best.d;
}

/* The cable running through a node, where one does.

   Node-centric, because that is the question the sync asks once every
   cable has fed the node it ends at: this node is still empty, is
   anything running over it? The nearest such cable, on the node's own
   circuit or naming none; ties on the lower Feature_ID so the answer
   is the same on every run. */
export function runThrough(node, features = [], opts = {}) {
  if (node?.Feature_Role !== "spannode"
    && node?.Feature_Role !== "feederpoint"
    && node?.Feature_Role !== "linkbox") return null;
  if (Number(node.Attributes?.Span_Seq) === 0) return null;
  if (!(node.Geometry || []).length) return null;
  const own = node.Attributes?.Circuit_ID ?? null;

  let best = null;
  for (const f of features) {
    if (f.Feature_Type !== "line" || f.Layer_Key !== "electric") continue;
    const cid = f.Attributes?.Circuit_ID ?? null;
    if (own != null && cid != null && String(own) !== String(cid)) continue;
    const d = runsThrough(f, node, opts);
    if (d == null) continue;
    if (!best || d < best.d
      || (d === best.d && Number(f.Feature_ID) < Number(best.f.Feature_ID))) {
      best = { f, d };
    }
  }
  return best?.f ?? null;
}

/* Every node a cable feeds: the one it ends at, then the ones it runs
   through. The end node first, because where the two rules could name
   the same node the end rule has already spoken for it. */
export function nodesFedBy(line, features = [], opts = {}) {
  const end = nodeFedBy(line, features, opts);
  if (feedsNothing(line, opts.isTrench || (() => false))) return [];
  const cid = line.Attributes?.Circuit_ID ?? null;
  const through = feedable(features, cid)
    .filter((n) => n !== end && runsThrough(line, n, opts) != null);
  return [...(end ? [end] : []), ...through];
}
