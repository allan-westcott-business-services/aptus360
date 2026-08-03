/* Auto Service.

   A port of gisAutoServiceTrench from the original. For each plot seed
   it drops a perpendicular onto the nearest mains trench, lays a service
   trench along it, stacks that plot's meters just beyond the seed, and
   runs a service cable or pipe down the trench to each meter.

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

/* A service leaves the main at a right angle.

   It is how services are dug and how they are drawn: square off the
   main, then run parallel to it if the meter is not directly opposite.
   A diagonal across the verge is neither, and on a drawing it reads as a
   mistake even where the length is right.

   Given the segment of the main the service tees into, this returns the
   route as [foot, corner, end] — out at ninety degrees, then along. The
   corner is dropped when the meter is already square to the main, so a
   service that needs no turn does not gain a vertex that sits on top of
   another one.

   The length changes: an L is longer than the diagonal it replaces. That
   is the point — the diagonal was never the length that would be dug. */
export function rightAngleRoute(foot, end, segA, segB) {
  if (!foot || !end) return [foot, end].filter(Boolean);

  const dx = (segB?.[0] ?? 0) - (segA?.[0] ?? 0);
  const dy = (segB?.[1] ?? 0) - (segA?.[1] ?? 0);
  const len = Math.hypot(dx, dy);
  /* No direction to work from — a main of zero length, or none given.
     Straight there beats a corner computed from nothing. */
  if (!len) return [foot, end];

  const ux = dx / len;
  const uy = dy / len;          // along the main
  const nx = -uy;
  const ny = ux;                // square to it

  const vx = end[0] - foot[0];
  const vy = end[1] - foot[1];
  const along = vx * ux + vy * uy;
  const perp = vx * nx + vy * ny;

  /* Already square: the meter is straight out from the foot. */
  if (Math.abs(along) < 0.01) return [foot, end];
  /* Straight along the main with no offset — no corner to turn. */
  if (Math.abs(perp) < 0.01) return [foot, end];

  const corner = [foot[0] + nx * perp, foot[1] + ny * perp];
  return [foot, corner, end];
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
  const meters = utils.map((utility, i) => {
    const found = existing(seed, utility);
    return found
      ? { utility, point: found, exists: true }
      : { utility, point: slots[i], exists: false };
  });

  /* The cable runs from the main to its own meter, and nowhere else.

     It used to go by way of the seed — [foot, seed, meter] — which put a
     bend in every service at a point that is not a physical thing. A
     plot seed marks which plot this is; it is not a position the cable
     passes through, and routing through it made every service longer
     than it is and put a vertex in the middle of it that nothing
     corresponds to.

     The meter is the one that is actually there, not the slot it would
     have taken. Routing to an empty slot beside a real meter would leave
     every service ending just short of the thing it feeds.

     The end meeting the main is the junction and never grows a lead:
     that was the subtle bit in the original, and getting it wrong puts a
     spur of cable through the tee and out the other side. */
  /* The segment of the main the service tees into, so the right angle is
     measured against the run it actually leaves rather than against the
     polyline as a whole. */
  const mg = best.trench.Geometry || [];
  const segA = mg[best.index - 1];
  const segB = mg[best.index];

  const cables = meters.map((m) => ({
    utility: m.utility,
    geometry: rightAngleRoute(best.foot, m.point, segA, segB),
  }));

  /* The dig runs to the meters, not to the seed.

     It used to stop at the seed, which put the last stretch of every
     cable outside the trench carrying it — and on a plot whose meters
     had been moved, well outside it.

     To the furthest meter, because one trench serves every utility on
     the plot. The slots are spaced along the line out from the foot, so
     a dig reaching the last one passes through all of them; stopping at
     the nearest would leave the others' cable in open ground.

     Falls back to the seed where there are no meters at all — a service
     drawn ahead of its meters still needs somewhere to go, and the seed
     is the only position there is. */
  const ends = meters.map((m) => m.point).filter(Boolean);
  const furthest = ends.length
    ? ends.reduce((far, q) => (
      Math.hypot(q[0] - best.foot[0], q[1] - best.foot[1])
      > Math.hypot(far[0] - best.foot[0], far[1] - best.foot[1]) ? q : far), ends[0])
    : seedPt;
  /* The same route the cables take, so cable and dig never diverge. */
  const trench = rightAngleRoute(best.foot, furthest, segA, segB);

  return { seed, mains: best.trench, foot: best.foot, distance: best.d, trench, meters, cables };
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
