/* Auto Service.

   A port of gisAutoServiceTrench from the original. For each plot seed
   it drops a perpendicular from the plot's boundary point onto the
   nearest mains trench, lays a service trench along it, and runs a
   service cable or pipe down that trench to the boundary and on to each
   meter.

   The boundary point is placed with the seed. Where a plot has none —
   seeded before it was asked for — the meters are stacked beyond the
   seed as they always were and the dig runs to the furthest of them.

   Everything here is pure and in metres. The canvas does the writing;
   this only decides what should exist. That split is what makes the
   geometry testable — the original's version could only be checked by
   drawing something and looking at it.

   Two deliberate departures from the original, both noted where they
   happen: meter spacing is in metres rather than screen pixels, and
   on-site versus off-site is decided by the boundary rather than
   inherited from the mains trench. */

/* Closest point on a segment, and how far away it is. Clamping t to
   [0,1] is what makes it the segment rather than the infinite line — the
   foot of a perpendicular that misses the segment lands on its nearer
   end, which is where the trench should actually tee off. */
export function distPointToSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return { d: Math.hypot(p[0] - a[0], p[1] - a[1]), q: [a[0], a[1]], t: 0 };
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * vx, a[1] + t * vy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q, t };
}

export function nearestOnPolyline(p, pts = []) {
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const r = distPointToSegment(p, pts[i - 1], pts[i]);
    if (!best || r.d < best.d) best = { ...r, index: i };
  }
  return best;
}

/* Where the service trench should tee off the mains. Nearest wins across
   every mains trench, not just the first one found. */
export function nearestMains(seedPt, trenches = []) {
  let best = null;
  for (const tr of trenches) {
    const g = tr.Geometry || [];
    if (g.length < 2) continue;
    const r = nearestOnPolyline(seedPt, g);
    if (r && (!best || r.d < best.d)) best = { trench: tr, foot: r.q, d: r.d, index: r.index };
  }
  return best;
}

/* Meter positions: a tight column just beyond the seed, in line with the
   service trench rather than fanned sideways.

   The original spaced these in screen pixels divided by zoom, then
   capped the result so a zoomed-out run couldn't fling them across the
   site. That is a symptom of storing a screen measurement in the data.
   Here it is metres — a real distance on the ground, the same wherever
   the view happens to be. */
export const METER_CLEARANCE_M = 1.5;   // seed to the first meter
export const METER_SPACING_M = 0.8;     // centre to centre after that

export function meterPositions(footPt, seedPt, count,
  { clearance = METER_CLEARANCE_M, spacing = METER_SPACING_M } = {}) {
  const dx = seedPt[0] - footPt[0], dy = seedPt[1] - footPt[1];
  const len = Math.hypot(dx, dy);
  /* Seed sitting on the trench gives no direction to work from. North is
     arbitrary but stable, which beats NaN. */
  const nx = len ? dx / len : 0;
  const ny = len ? dy / len : 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const along = clearance + i * spacing;
    out.push([seedPt[0] + nx * along, seedPt[1] + ny * along]);
  }
  return out;
}

/* Should the mains trench gain a vertex where the service tees in?

   Without one the two lines cross without meeting and the network can't
   be traced through the junction. Returns the geometry to write, or null
   when a vertex is already there — so re-running Auto Service doesn't
   keep thickening the mains with near-duplicate points. */
export function teeIntoMains(mainsGeometry, foot, tol) {
  const g = mainsGeometry || [];
  if (g.length < 2) return null;
  if (g.some((q) => Math.hypot(q[0] - foot[0], q[1] - foot[1]) <= tol)) return null;
  const r = nearestOnPolyline(foot, g);
  if (!r || r.d > tol) return null;
  return [...g.slice(0, r.index), [foot[0], foot[1]], ...g.slice(r.index)];
}

/* One seed's worth of work, or a reason there isn't any.

   utilitiesFor is injected rather than read from a plot record so the
   gas rule — an electric-only plot gets no gas meter — can be tested
   without a database. */
export function planSeed(seed, trenches, utilitiesFor, opts = {}) {
  const seedPt = (seed.Geometry || [])[0];
  if (!seedPt) return { seed, skipped: "no position" };

  const best = nearestMains(seedPt, trenches);
  if (!best) return { seed, skipped: "no mains trench" };

  const utils = utilitiesFor(seed) || [];
  const slots = meterPositions(best.foot, seedPt, utils.length, opts);

  /* A seed may already have been placed with its meters. Those are left
     exactly where they are — someone put them there, and moving or
     duplicating a meter that has already been designed around is worse
     than anything Auto Service gains by being tidy.

     The slot is still worked out from the utility's position in the full
     list rather than from a running count of the new ones, so gas sits
     in the gas slot whether or not electric was already there. */
  const existing = opts.existingMeter || (() => null);
  const all = utils.map((utility, i) => {
    const found = existing(seed, utility);
    return found
      ? { utility, point: found, exists: true }
      : { utility, point: slots[i], exists: false };
  });

  /* Meters that already have a trench running to them are left alone.

     Judged per meter, not per plot. A plot whose gas was dug by hand and
     whose electric was not needs the electric doing and the gas leaving
     — skipping the whole plot leaves it half served, and doing the whole
     plot lays a second gas trench over the first.

     Only a meter that is actually there can already be served: a slot is
     a position nothing has been placed at yet, so nothing can be running
     to it. */
  const meters = all.filter((m) =>
    !(m.exists && opts.meterServed?.(m.point)));

  const already = all.length - meters.length;
  /* Only where something was actually skipped. A plot with no utilities
     on it has nothing to serve, which is not the same as having been
     served already — reporting it as such sent a seed with no meters
     down the skipped list instead of getting its dig. */
  if (already > 0 && !meters.length) {
    return { seed, skipped: `every meter already has a service (${already})` };
  }

  /* The cable runs down the trench, and only leaves it at the end.

     Not straight from the tee to its own meter. Every service pipe and
     cable is laid in the dig, so it follows the trench for the whole of
     its length and breaks out at the far end to reach the meter it
     feeds — which is what a jointer does on site and what the quantities
     have to say. Cutting the corner made a cable shorter than the one
     that will actually be pulled, on every plot with more than one
     utility.

     Only the furthest meter's cable is a straight run, because for that
     one the end of the trench and the meter are the same place.

     Not by way of the seed, though — [foot, seed, meter] was the older
     shape and the bend it put in was at a point that is not a physical
     thing. A plot seed marks which plot this is; it is not a position
     anything passes through. The end of the trench is: it is where the
     dig stops.

     The meter is the one that is actually there, not the slot it would
     have taken. Routing to an empty slot beside a real meter would leave
     every service ending just short of the thing it feeds.

     The end meeting the main is the junction and never grows a lead:
     that was the subtle bit in the original, and getting it wrong puts a
     spur of cable through the tee and out the other side. */
  /* Where the dig stops: the property boundary point.

     Placed with the seed, and the one point on a plot that a service
     trench actually runs to — the dig comes off the main, crosses the
     verge and stops at the boundary, and everything past it is inside
     the property. Meters sit wherever the plot puts them, several
     metres apart and often nowhere near each other; running the trench
     to one of them made its position decide the dig for all of them.

     Falls back to the furthest meter for plots seeded before the
     boundary point was asked for. Not to the seed: the seed is at the
     dwelling, so a trench to it would run through the garden. The
     furthest meter is what this did before and is still the better of
     the two wrong answers.

     Where the service leaves the main is then the nearest point on it
     to the boundary — which is the perpendicular foot, square to the
     main, because the closest point on a segment always is. The only
     exception is a boundary point past the end of a segment, where the
     nearest point is that end and the line is not square; there is no
     perpendicular to draw in that case, and the shortest route is the
     right answer anyway. */
  const ends = meters.map((m) => m.point).filter(Boolean);
  const furthest = ends.length
    ? ends.reduce((far, q) => (
      Math.hypot(q[0] - best.foot[0], q[1] - best.foot[1])
      > Math.hypot(far[0] - best.foot[0], far[1] - best.foot[1]) ? q : far), ends[0])
    : seedPt;

  const at = seed.Attributes?.Boundary_At;
  const boundary = Array.isArray(at) && at.length === 2
    && Number.isFinite(Number(at[0])) && Number.isFinite(Number(at[1]))
    ? [Number(at[0]), Number(at[1])]
    : null;

  /* The dig stops at the boundary point, and nowhere else.

     It used to fall back to the furthest meter when a plot had none.
     That is what produced a service running straight from the main to a
     meter: with stop set to the meter itself, the route had no boundary
     vertex to turn at, and the "trench" was a line to somebody's meter
     rather than to their boundary. Every cable then followed that,
     because the cable follows the dig.

     Skipped and reported instead. A plot with no boundary point cannot
     have its dig placed \u2014 the drawing has not said where the dig
     stops \u2014 and guessing at it produced a wrong answer that looked
     like a right one. */
  if (!boundary) {
    return { seed, skipped: "no property boundary point \u2014 place one on the plot" };
  }
  const stop = boundary;
  const fromStop = nearestMains(stop, trenches);
  const tee = fromStop || best;

  /* One foot for the whole plot. Every cable shares the dig, so a
     cable measured to its own foot would leave the trench and come back
     — the furthest meter decides where the service tees in and the rest
     follow it. */
  /* The route from the main to the boundary.

     A straight line is what this drew, and it is only right when
     nothing has been dug yet. Where a service trench is already on the
     drawing the cable is laid *in* it, so the route has to follow it —
     otherwise the cable cuts the corner, comes out shorter than the dig
     it sits in, and every quantity taken off it is wrong.

     Matched by both ends: a service trench belonging to this plot runs
     from near the tee to near the boundary. Anything else on the
     drawing is somebody else's dig, and following it would route this
     plot's service through a neighbour's garden.

     Nothing found leaves the straight line, which is the right answer
     when there is no trench to follow. */
  const onService = (opts.serviceTrenches || [])
    .map((t) => {
      const g = t.Geometry || t;
      if (!Array.isArray(g) || g.length < 2) return null;
      const a = g[0];
      const b = g[g.length - 1];
      const near = (p1, p2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      /* Either way round: which end was drawn first is not something
         to depend on. */
      const forward = Math.max(near(a, tee.foot), near(b, stop));
      const back = Math.max(near(b, tee.foot), near(a, stop));
      const tol = opts.serviceTol ?? 3;
      if (forward <= tol) return g;
      if (back <= tol) return [...g].reverse();
      return null;
    })
    .filter(Boolean)[0];

  /* Ends pinned to the tee and the boundary, so the route starts where
     the main is actually joined and finishes where the dig stops \u2014 the
     drawn trench may be a few centimetres off either. */
  const trench = onService
    ? [tee.foot, ...onService.slice(1, -1), stop]
    : [tee.foot, stop];

  /* Within a millimetre is the same place. A meter sitting on the
     boundary point would otherwise get a zero-length segment on the end
     of its cable — invisible on the drawing, and a duplicate vertex for
     everything downstream to trip over. */
  const samePlace = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3;

  /* The cable follows the dig, then leaves it for the meter. Where the
     trench bends, so does the cable: it is laid in the ground that was
     opened, not across it. */
  const cables = meters.map((m) => ({
    utility: m.utility,
    geometry: samePlace(m.point, stop)
      ? [...trench]
      : [...trench, m.point],
  }));

  return {
    seed, mains: tee.trench, foot: tee.foot, distance: tee.d, trench, meters, cables,
    /* Whether the dig was measured to a boundary point or guessed from
       a meter, so the run can say how many plots are still on the old
       shape rather than quietly mixing the two. */
    boundary: !!boundary,
    /* Named so the summary can say what was left alone rather than
       quietly doing less than the count suggests. */
    skippedMeters: already,
  };
}

/* Whether a plot is already served, however that came about.

   Auto Service knows a seed is done by finding a service trench stamped
   with its Seed_Feature_ID — which is right for the ones it drew itself,
   and useless for one drawn by hand. A trench dug to a meter by someone
   who then ran Auto Service got a second trench and a second cable laid
   over the first, both feeding the same meter.

   So a plot counts as served if anything reaches it: a trench stamped
   with its seed, or a trench that simply ends at one of its meters. The
   second test is the one that catches hand-drawn work, and it is the
   position that matters rather than any record of intent — a trench
   ending on a meter is serving that meter whatever it is labelled.

   `near` is generous on purpose. A hand-drawn trench is snapped by eye,
   and the cost of the two errors is not the same: treating a served plot
   as unserved lays a duplicate cable through a garden, while treating an
   unserved plot as served leaves a gap that the levels check reports
   loudly on the next run. */
/* Whether a service trench already runs to this exact point.

   Asked of a meter's position rather than of a plot, because that is the
   thing being served. A trench ending on a meter is serving that meter
   whoever drew it, whatever it is labelled, and whether or not anything
   records which plot it belongs to — the plot 59 case had a meter linked
   to no circuit at all, and a rule that went through the plot record
   would have missed it.

   Either end, since a service may have been drawn from the plot outwards
   as easily as towards it. Only the ends: a main passing a house does
   not connect it. */
/* How close a trench end must be to count as running to this meter.

   Under half the spacing between adjacent meters, or a trench dug to the
   electric meter marks the gas one beside it as served too — they sit
   0.8 m apart, and a 1.5 m tolerance claimed both from one dig.

   0.35 m is tight enough to tell two neighbours apart and loose enough
   for work snapped by eye. The two errors do not cost the same: claiming
   a meter is served when it is not leaves it with no supply, which the
   levels check will not catch because a meter with no cable is simply
   absent from the trace. Erring tight means at worst a duplicate that
   can be seen and deleted. */
export const SERVED_NEAR_M = 0.35;

export function meterHasService(point, trenches = [], near = SERVED_NEAR_M) {
  if (!point) return false;
  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;
    for (const end of [g[0], g[g.length - 1]]) {
      if (Math.hypot(end[0] - point[0], end[1] - point[1]) <= near) return true;
    }
  }
  return false;
}

export function isServed(seed, meters = [], trenches = [], near = 1.5) {
  /* Deliberately looser than meterHasService above. This asks whether a
     plot has been dealt with at all, where landing on the neighbouring
     meter still means yes; that one asks which of two meters 0.8 m apart
     is served, where it does not. */
  const sid = Number(seed?.Feature_ID);
  if (!Number.isFinite(sid)) return false;

  for (const t of trenches) {
    if (Number(t.Attributes?.Seed_Feature_ID) === sid) return true;
  }

  /* This plot's meters, by either route they are linked. */
  const mine = meters.filter((m) =>
    Number(m.Attributes?.Seed_Feature_ID) === sid
    || (seed.Plot_ID != null && Number(m.Plot_ID) === Number(seed.Plot_ID)));
  if (!mine.length) return false;

  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;
    /* Either end — a trench may have been drawn from the plot outwards
       as easily as towards it. */
    for (const end of [g[0], g[g.length - 1]]) {
      for (const m of mine) {
        const p = (m.Geometry || [])[0];
        if (!p) continue;
        if (Math.hypot(end[0] - p[0], end[1] - p[1]) <= near) return true;
      }
    }
  }
  return false;
}

export function planAutoService(seeds = [], trenches = [], utilitiesFor = () => [], opts = {}) {
  const plans = [];
  const skipped = [];
  for (const seed of seeds) {
    if (opts.alreadyServiced?.(seed)) { skipped.push({ seed, why: "already has a service trench" }); continue; }
    const p = planSeed(seed, trenches, utilitiesFor, opts);
    if (p.skipped) skipped.push({ seed, why: p.skipped });
    else plans.push(p);
  }
  return { plans, skipped };
}

/* Mains first, anything else only if there are no mains — the original's
   fallback, kept because a plan part-way through being drawn often has
   trenches that haven't been typed yet. */
export function mainsTrenches(features = [], isTrench) {
  const trenches = features.filter((f) =>
    f.Feature_Type === "line" && (f.Geometry || []).length >= 2 && isTrench(f));
  const mains = trenches.filter((f) => String(f.Attributes?.Line_Type || "").includes("main"));
  return mains.length ? mains : trenches;
}
