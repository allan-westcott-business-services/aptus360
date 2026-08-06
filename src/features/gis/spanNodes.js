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

export function plantLabel(feature) {
  for (const p of Object.values(PLANT)) {
    if (feature?.Feature_Role === p.role) return p.label;
  }
  return null;
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
    /* Only the ends. A vertex in the middle of a trench is a bend, and a
       bend is not a junction — it is one run turning a corner. */
    intern(g[0]).ends += 1;
    intern(g[g.length - 1]).ends += 1;
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
export function servicesAmong(trenches = [], meters = [], opts = {}) {
  const { attachM = 2.0 } = opts;
  const ids = new Set();

  for (const m of meters) {
    const p = (m.Geometry || [])[0];
    if (!p) continue;
    for (const t of trenches) {
      const g = t.Geometry || [];
      if (g.length < 2) continue;
      if (Math.min(dist(p, g[0]), dist(p, g[g.length - 1])) <= attachM) {
        ids.add(t.Feature_ID);
        break;
      }
    }
  }
  return ids;
}

export function planSpanNodes(trenches = [], plant, opts = {}) {
  const { eps = 0.25, meters = [] } = opts;

  /* Mains only.

     Four rules, and all of them are about mains:

       a junction of mains          gets a node
       where a service joins        does not — a span runs through it
       the end of a main            gets one, if no other main is there
       where the main meets plant   does not — that is E0, G0 or W0

     Services are dropped before anything is counted, so a point where
     three trenches meet but one of them is a service is a junction of
     two mains, which is a bend. */
  const serviceIds = opts.serviceIds
    ?? servicesAmong(trenches, meters, opts);
  const mains = trenches.filter((t) => !serviceIds.has(t.Feature_ID));

  const plantAt = (plant?.Geometry || [])[0];
  const points = junctionsOf(mains, opts);
  if (!points.length) return { error: "No trenches to place span nodes on." };

  /* What each point is. A point where one trench end arrives is the end
     of a run; three or more is a junction; exactly two is two trenches
     meeting end to end, which is a bend and gets nothing. */
  /* And not where the main meets the plant.

     The substation is the origin — E0 — and a span node on top of it
     would be a second name for the same place, with A1 and E0 both
     meaning the transformer. */
  const wanted = points.filter((p) => {
    if (p.ends !== 1 && p.ends < 3) return false;
    if (plantAt && dist(p.at, plantAt) <= (opts.plantM ?? 2.0)) return false;
    return true;
  });

  /* Ordered by how far along the network they are, not as the crow
     flies — a node round a corner is further than one straight ahead
     even when it looks nearer. Distance along the trenches is what the
     numbering should follow.

     Walked as a graph over the interned points. */
  const idOf = new Map(points.map((p, i) => [p, i]));
  const adj = new Map(points.map((_, i) => [i, []]));
  for (const t of mains) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;
    let len = 0;
    for (let i = 0; i + 1 < g.length; i++) len += dist(g[i], g[i + 1]);
    const a = points.find((p) => dist(p.at, g[0]) <= eps);
    const b = points.find((p) => dist(p.at, g[g.length - 1]) <= eps);
    if (!a || !b || a === b) continue;
    adj.get(idOf.get(a)).push({ to: idOf.get(b), len });
    adj.get(idOf.get(b)).push({ to: idOf.get(a), len });
  }

  /* From the plant, or from whichever point is furthest from everything
     if there is no plant yet — a drawing without a substation should
     still number sensibly rather than refuse. */
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
      label: `A${i + 1}`,
      seq: i + 1,
      /* How far along the trenches it is, which is what the numbering
         follows and worth keeping for anybody checking it. */
      alongM: o.m === Infinity ? null : Math.round(o.m * 10) / 10,
      kind: o.point.ends === 1 ? "end" : "junction",
      reachable: o.m !== Infinity,
    })),
    /* Bends, counted but not marked, so it is clear they were seen and
       deliberately left alone. */
    bends: points.filter((p) => p.ends === 2).length,
  };
}
