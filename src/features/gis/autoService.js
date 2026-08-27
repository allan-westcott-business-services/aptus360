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
/* ── The incumbent's network, and ours ──

   A line drawn to show what is already in the ground carries a type key
   ending `_existing` (0197). Four of them: the incumbent's trench and
   their electric, gas and water mains in it.

   The suffix is the whole rule. A flag on the feature would have done
   the same job and been invisible to `mainsTrenches`, which decides what
   a service can tee into by reading the type key and nothing else — so
   an existing trench would have been picked as the nearest main for
   ordinary plots and quietly served half a site off somebody else's
   cable.

   Anchored at the end of the key rather than searched for anywhere in
   it, so a type someone later calls `existing_route` or
   `trench_pre_existing_survey` does not silently become one of these. */
export const EXISTING_SUFFIX = "_existing";

export const isExistingType = (key) =>
  String(key || "").endsWith(EXISTING_SUFFIX);

export const isExistingFeature = (f) =>
  isExistingType(f?.Attributes?.Line_Type);

/* Trenches split into the ones we are digging and the ones already
   there.

   Both lists are returned rather than one filtered list, because the
   caller needs both and filtering twice is two chances to write the
   test differently. */
export function splitExisting(trenches = []) {
  const ours = [];
  const existing = [];
  for (const t of trenches) (isExistingFeature(t) ? existing : ours).push(t);
  return { ours, existing };
}

/* Why a run did nothing, in one sentence.

   Both commands that skip seeds reported `skipped[0].why` against the
   count of all of them — one seed's reason printed as though it were
   every seed's. A run where forty-nine plots were already serviced and
   two were refused for want of an existing main said "51 seeds skipped
   (already has a service trench)", and the two that somebody had just
   marked self-lay were invisible.

   Not wrong about any single seed. Wrong about the drawing, which is
   the thing being asked about — and the harder kind to notice, because
   the sentence is true.

   Commonest first, so a count carries the weight and the rarer reason
   is still shown. It is usually the rarer one that somebody can act
   on. */
export function skipSummary(skipped = []) {
  const byReason = new Map();
  for (const s of skipped) {
    const why = s?.why ?? "unknown";
    byReason.set(why, (byReason.get(why) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${n} ${why}`)
    .join("; ");
}

export function planSeed(seed, trenches, utilitiesFor, opts = {}) {
  const seedPt = (seed.Geometry || [])[0];
  if (!seedPt) return { seed, skipped: "no position" };

  /* ── Which main each utility connects to ──

     A plot let to a self-lay provider connects to the incumbent's
     existing main. It is per utility, not per plot: a dwelling whose
     water is laid by an SLP and whose electric is ours is ordinary, and
     `Plot_Utility.Self_Lay_Provider` is one row per plot per utility
     precisely so that can be said.

     So the utilities split in two and each half is dug to its own main.
     Not "the nearest main of either kind", which is what one list would
     have given: a plot beside the incumbent's trench would tee our
     cable into their cable, and the drawing would look right. */
  const { ours: ourMains, existing: existingMains } = splitExisting(trenches);
  const selfLay = opts.isSelfLay || (() => false);

  const utils = utilitiesFor(seed) || [];
  const slpUtils = utils.filter((u) => selfLay(seed, u));
  const ourUtils = utils.filter((u) => !selfLay(seed, u));

  /* A main is only needed for a group that has something in it.

     A plot that is entirely self-lay needs no mains trench of ours and
     must not be turned away for lacking one — that message would send
     every self-lay plot down the skipped list on a drawing where
     everything about them is right. */
  const best = ourUtils.length || !slpUtils.length
    ? nearestMains(seedPt, ourMains)
    : nearestMains(seedPt, existingMains);
  if (!best) {
    return { seed, skipped: slpUtils.length && !ourUtils.length
      ? "no existing main drawn to connect a self-lay plot to"
      : "no mains trench" };
  }

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

  /* Where the dig actually ends, if the drawing says.

     The boundary point and the end of the trench were one point until
     now, which made the dig stop at the property line. On the ground it
     does not: it crosses the boundary and runs on to wherever the
     service is being brought up, and the boundary is a place along it
     rather than its far end. The two being one meant a service ended
     short of where it is dug, and every length taken off it was short
     by the same amount.

     So a seed carries both, and the boundary becomes a vertex on the
     route rather than its end. A seed placed before the third click was
     asked for has only the boundary, and behaves exactly as it did —
     which is why this falls back rather than refusing. */
  const endAt = seed.Attributes?.Trench_End_At;
  const trenchEnd = Array.isArray(endAt) && endAt.length === 2
    && Number.isFinite(Number(endAt[0])) && Number.isFinite(Number(endAt[1]))
    ? [Number(endAt[0]), Number(endAt[1])]
    : null;

  const stop = trenchEnd || boundary;
  /* The tee is still worked out from the BOUNDARY, not from the end.

     It is where the service crosses the property line, so it is the
     point that decides where the dig should leave the main — square to
     it and across the verge. Measuring from the end instead would let a
     meter position several metres inside the plot pull the tee sideways
     along the main, which is a longer dig to the same place. */
  const fromStop = nearestMains(boundary, ourMains.length ? ourMains : existingMains);
  const tee = fromStop || best;

  /* And the same question asked of the incumbent's network, for the
     utilities that connect to it. Null where nothing existing is drawn,
     which is every drawing that has no self-lay plot on it. */
  const slpTee = slpUtils.length
    ? (nearestMains(boundary, existingMains) || nearestMains(seedPt, existingMains))
    : null;

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
  /* Within a millimetre is the same place — declared before the route
     so the boundary vertex can be dropped where it coincides with an
     end. A duplicate vertex is invisible on the drawing and something
     for every reader downstream to trip over. */
  const samePlace = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3;

  /* The boundary as a point ALONG the route, where it is one.

     Kept as a vertex rather than smoothed away, because it is what the
     on-site and off-site lengths are split at: the dig across the verge
     is the authority's and the dig inside the plot is the developer's,
     and they are billed apart. Dropped where it coincides with the tee
     or with the end, which is a plot whose boundary is at the road or
     whose service stops at the line. */
  const via = (!trenchEnd || samePlace(boundary, tee.foot) || samePlace(boundary, stop))
    ? [] : [boundary];

  const trench = onService
    ? [tee.foot, ...onService.slice(1, -1), stop]
    : [tee.foot, ...via, stop];

  /* The route the self-lay service takes, off the incumbent's main.

     The same shape as our own dig — tee, boundary, stop — because it is
     the same journey: their main is in the road, the service crosses
     the verge and comes up in the same place ours would.

     ── The dig is drawn, and it is not ours ──

     A trench IS written for it. The developer lays it, so it exists on
     the ground and belongs on the drawing: a service that appears from
     nowhere is a service nobody can measure, set out or check the cover
     depth of.

     It carries Build_Status `existing`, which is the drawing's own word
     for a length that was not dug by this job. That is not a label —
     digEstimate reads it and charges no excavation, so the bill shows
     the cable and the laying and no dig. The alternative considered was
     writing no trench at all, which gave the same bill and a drawing
     with a cable running through undisturbed ground.

     A boundary vertex is kept for the same reason it is on our own
     route: it is where the on-site and off-site lengths are split. */
  const slpVia = slpTee && !(samePlace(boundary, slpTee.foot) || samePlace(boundary, stop))
    ? [boundary] : [];
  const slpRoute = slpTee ? [slpTee.foot, ...slpVia, stop] : null;

  /* The cable follows the dig, then leaves it for the meter. Where the
     trench bends, so does the cable: it is laid in the ground that was
     opened, not across it. */
  const cableAlong = (route) => (m) => ({
    utility: m.utility,
    geometry: samePlace(m.point, stop) ? [...route] : [...route, m.point],
  });

  const ourMeters = meters.filter((m) => !selfLay(seed, m.utility));
  const slpMeters = meters.filter((m) => selfLay(seed, m.utility));

  const cables = ourMeters.map(cableAlong(trench));
  /* Dropped rather than routed to nothing where the drawing has no
     existing main: a cable from an imagined tee is a length somebody
     would price. Reported by planAutoService instead. */
  const slpCables = slpRoute ? slpMeters.map(cableAlong(slpRoute)) : [];

  return {
    seed, mains: tee.trench, foot: tee.foot, distance: tee.d,
    /* Our dig, where anything of ours is being laid. A plot that is
       self-lay throughout has none — its trench is the developer's and
       is returned as slpTrench below. */
    trench: ourMeters.length ? trench : [],
    meters, cables,
    /* The developer's dig, to be written as Build_Status `existing`.
       Kept apart from `trench` rather than flagged inside it, because
       the two are written with different statuses and a caller that
       forgot to look would otherwise bill for excavating it. */
    slpTrench: slpCables.length && slpRoute ? slpRoute : [],
    /* The self-lay half, kept apart from `cables` rather than mixed in.
       The canvas writes these without a trench and the bill counts them
       on their own, and one list would have made both of those a test
       applied per cable at the point of writing. */
    slpCables,
    slpMains: slpTee?.trench ?? null,
    slpFoot: slpTee?.foot ?? null,
    /* Named, so a run can say a self-lay plot got no cable rather than
       reporting it as serviced. */
    slpUnconnected: slpRoute ? [] : slpMeters.map((m) => m.utility),
    /* Whether the dig was measured to a boundary point or guessed from
       a meter, so the run can say how many plots are still on the old
       shape rather than quietly mixing the two. */
    boundary: !!boundary,
    /* Whether the dig ran to a point somebody set or stopped at the
       boundary for want of one. */
    trenchEnd: !!trenchEnd,
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


/* ── Laying a service into a trench that is already there ──

   Auto Service draws the dig and lays everything in it. This does the
   second half only, for one utility: the trenches are on the drawing
   already, and what is wanted is the gas pipe — or the water, or the
   cable — run along them.

   ── Why one utility at a time ──

   The three are rarely designed together. Water goes in when the water
   design is being done, and a run of it should not quietly add gas
   pipe to plots whose gas has not been thought about yet. So the
   utility is chosen and nothing else is touched.

   ── The same route as Auto Service ──

   From where the service trench meets the main, along the trench, to
   the boundary point, then out to the meter. Not straight to the meter:
   the pipe is laid in the dig, and a run measured across it is short
   by however far the dig went round.

   ── What it will not do ──

   It lays nothing where a service of that utility already runs along
   the trench. Running it twice should be the same as running it once,
   because somebody will. */

const endsOfLine = (f) => {
  const g = f.Geometry || [];
  return g.length >= 2 ? [g[0], g[g.length - 1]] : [];
};

const gapTo = (p, pts = []) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2))
      : 0;
    const d = Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
    if (d < best) best = d;
  }
  return best;
};

export function layServices(features = [], utility, opts = {}) {
  const {
    isTrench = () => false,
    isService = (f) => /service/i.test(String(f.Attributes?.Line_Type ?? "")),
    /* How near a meter has to be to the trench's far end to be the one
       it serves. A meter is a box on a wall set back from the boundary,
       so this is metres rather than centimetres.

       Thirty, not twelve. Twelve was doing two jobs: judging whether a
       meter is plausibly at the end of this trench, and stopping the
       search grabbing the neighbour's meter. The plot number does the
       second job properly \u2014 see below \u2014 so this is left to do only the
       first, and a long garden is no longer a reason a service cannot
       be laid. */
    meterM = 30,
    /* And how near the other end has to be to a main to count as teed
       in. That is a joint, so it is tight. */
    teeM = 0.5,
  } = opts;

  const lines = features.filter((f) => f.Feature_Type === "line"
    && (f.Geometry || []).length >= 2);
  const trenches = lines.filter((f) => isTrench(f));
  const mains = trenches.filter((f) => !isService(f));
  const services = trenches.filter(isService);

  if (!services.length) {
    return { error: "No service trenches drawn \u2014 draw them, or run Auto Service." };
  }

  const meters = features.filter((f) => f.Feature_Role === "meter"
    && f.Layer_Key === utility && (f.Geometry || []).length);

  /* Anything of this utility already laid along a trench. Matched on
     the trench rather than on the plot: a plot can have two services
     in different phases, and it is this length of dig that is being
     filled. */
  const laid = lines.filter((f) => f.Layer_Key === utility
    && !isTrench(f));

  const cables = [];
  const skipped = [];

  /* ── A service that reaches a main through another service ──

     A run of service trench is one dig, but it is not always one
     feature. splitByBoundary breaks it where it crosses the site
     boundary, so a service teed off a main in the ROAD arrives as two:
     an off-site piece touching the main, and an on-site piece touching
     only the first.

     Judged one at a time, the inner piece has no main at either end and
     was refused — "closest is 5.39m away", which was exactly the length
     of the outer piece it is joined to. The dig was right, the drawing
     was right, and the answer was about a feature rather than about the
     run it belongs to.

     Our own services rarely showed it: they tee off a main inside the
     site and never cross the boundary. The incumbent's main is in the
     road, so every self-lay service crosses it and every one splits.

     So reachability is followed rather than tested. A service reaches a
     main if an end of it is at one, or if an end of it meets another
     service that does. Breadth-first from the ones that touch a main
     directly, which also settles the tee end of each piece: the end
     that faces the main is the end its cable starts from. */
  const reach = new Map();
  const queue = [];

  for (const sv of services) {
    const ends = endsOfLine(sv);
    if (ends.length !== 2) continue;
    const at = ends.find((e) => mains.some((m) => gapTo(e, m.Geometry) <= teeM));
    if (at) { reach.set(sv, at); queue.push(sv); }
  }

  while (queue.length) {
    const sv = queue.shift();
    const ends = endsOfLine(sv);
    /* The far end is what a neighbour joins onto — the near end is
       already at the main. */
    const teeEnd = reach.get(sv);
    const far = ends.find((e) => e !== teeEnd) ?? ends[1];

    for (const other of services) {
      if (reach.has(other)) continue;
      const oEnds = endsOfLine(other);
      if (oEnds.length !== 2) continue;
      const joined = oEnds.find((e) => Math.hypot(e[0] - far[0], e[1] - far[1]) <= teeM);
      if (!joined) continue;
      /* Its tee end is where it meets the piece nearer the main, so the
         cable runs the same way along the whole chain. */
      reach.set(other, joined);
      queue.push(other);
    }
  }

  for (const sv of services) {
    const ends = endsOfLine(sv);
    if (ends.length !== 2) continue;

    /* Which end faces the main — directly, or through the pieces
       between. Both ends were tried because which end somebody drew
       first says nothing about where the gas comes from. */
    const teeEnd = reach.get(sv);
    if (!teeEnd) {
      /* How far off it was, because "does not meet a mains trench" is
         true of a trench half a metre short and one on the other side
         of the site, and only one of those is worth going to look at.

         The tolerance is half a metre: a service drawn to within a
         metre of the main looks connected at any sensible zoom and is
         not. Saying the gap turns "why did this one not lay" into
         "move that end 0.3m". */
      const near = mains
        .map((m) => gapTo(ends[0], m.Geometry))
        .concat(mains.map((m) => gapTo(ends[1], m.Geometry)))
        .filter((d) => Number.isFinite(d))
        .sort((a, b) => a - b)[0];
      skipped.push({
        trench: sv,
        why: near != null && near < 25
          ? `neither end reaches a mains trench \u2014 closest is `
            + `${near.toFixed(2)}m away, and it has to be within ${teeM}m`
          : "does not meet a mains trench",
      });
      continue;
    }
    const farEnd = ends.find((e) => e !== teeEnd) ?? ends[1];

    /* ── The meter belonging to this trench's plot ──

       The number is on both already. A plot seed is placed by its
       number, the boundary point goes down with it, the meter inherits
       it, and this routine stamps it on the trench it lays \u2014 so the
       trench and the meter it serves agree, and which meter belongs to
       which service is recorded rather than measured.

       Nearest alone was wrong on any estate where plots sit close: the
       meter nearest the end of plot 34's trench is often plot 35's, and
       the service was then laid to the neighbour's box. It looks right
       on the drawing.

       Nearest is kept as the fallback, for a trench drawn by hand that
       carries no number \u2014 and among several meters of one plot, which
       is the case it was always right for. */
    const plotOf = (f) => {
      const v = f?.Plot_ID ?? f?.Attributes?.Plot_ID;
      return v == null ? null : Number(v);
    };
    const mine = plotOf(sv);

    const withinReach = meters
      .map((m) => ({ m, d: Math.hypot(m.Geometry[0][0] - farEnd[0],
        m.Geometry[0][1] - farEnd[1]) }))
      .filter((x) => x.d <= meterM)
      .sort((a, b) => a.d - b.d);

    const ownPlot = mine == null
      ? [] : withinReach.filter((x) => plotOf(x.m) === mine);

    const meter = (ownPlot[0] || withinReach[0])?.m;

    if (!meter) {
      /* The same again: a meter thirteen metres away is a tolerance
         problem, and no meter at all is a missing feature. They are
         fixed differently and the message used to be the same. */
      const ranked = meters
        .map((m) => ({ m, d: Math.hypot(m.Geometry[0][0] - farEnd[0],
          m.Geometry[0][1] - farEnd[1]) }))
        .sort((a, b) => a.d - b.d);
      /* Its own plot's meter where the trench has a number, because
         that is the one that should have been found and its distance is
         the number worth reporting. The nearest of any plot's is a
         different fact and reads as an answer when it is not. */
      const own = mine == null
        ? null : ranked.find((x) => plotOf(x.m) === mine);
      const nearest = (own || ranked[0])?.d;
      const whose = own ? `plot ${mine}'s` : `the nearest`;
      skipped.push({
        trench: sv,
        why: nearest != null && nearest < 120
          ? `${whose} ${utility} meter is ${nearest.toFixed(1)}m from the `
            + `end of this trench, and it has to be within ${meterM}m`
          : mine != null && !own
            ? `no ${utility} meter carries plot ${mine}, and none is near `
              + `the end of this trench`
            : `no ${utility} meter at the end of it`,
      });
      continue;
    }

    /* Already served: something of this utility runs the length of
       this trench. */
    const already = laid.some((f) => {
      const g = f.Geometry || [];
      return g.length >= 2
        && gapTo(g[0], sv.Geometry) <= teeM
        && g.some((q) => Math.hypot(q[0] - meter.Geometry[0][0],
          q[1] - meter.Geometry[0][1]) <= 0.5);
    });
    if (already) continue;

    /* Along the dig, in the direction that starts at the main. */
    const along = Math.hypot(sv.Geometry[0][0] - teeEnd[0],
      sv.Geometry[0][1] - teeEnd[1]) <= teeM
      ? sv.Geometry
      : [...sv.Geometry].reverse();

    const at = meter.Geometry[0];
    const same = Math.hypot(along[along.length - 1][0] - at[0],
      along[along.length - 1][1] - at[1]) < 1e-3;

    cables.push({
      trench: sv,
      meter,
      geometry: same ? [...along] : [...along, at],
    });
  }

  return { cables, skipped };
}
