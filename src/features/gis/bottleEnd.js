/* Where the cable is sealed when the programme stops before the design
   does.

   ── The situation ──

   An electric service call-off connects some of the plots on a feeder.
   The plots past them are not being built yet, but the feeder is drawn
   all the way to them — so the cable that has just been laid ends in
   mid-air, and it has to be sealed until somebody comes back.

   Five metres past the last plot the call-off connects, along the
   feeder that serves the ones it does not.

   ── Why five metres past, rather than at the plot ──

   Because the next gang has to joint onto it. A seal made at the tee
   leaves nothing to work with; five metres of tail is what gets dug up
   and cut back when the next phase arrives.

   ── Why it is temporary ──

   The design says the feeder carries on. One day the next call-off
   reaches the plot beyond this point and the seal is replaced with a
   straight joint, so the electricity flows from the section that was energised
   into the one that has just been laid.

   Which means it belongs to the call-off that caused it: cancel that
   call-off and the seal was never needed. */

const TAIL_M = 5;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* A point a given distance along a polyline from one end. */
function alongFrom(geometry, from, metres) {
  const g = geometry || [];
  if (g.length < 2) return null;

  /* Walked from whichever end is nearer the starting point, so the
     measurement runs the way the cable does rather than the way it
     happened to be drawn. */
  const fromStart = dist(g[0], from) <= dist(g[g.length - 1], from);
  const pts = fromStart ? g : [...g].reverse();

  let left = metres;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = dist(a, b);
    if (d <= 0) continue;
    if (left <= d) {
      const u = left / d;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    left -= d;
  }

  /* Shorter than the tail. The far end is the honest answer — a seal
     beyond the end of the cable is not a place. */
  return pts[pts.length - 1];
}

/* How far along a feeder a point sits, so plots can be put in order.

   Measured from the feeder's start rather than from the substation: the
   caller passes the feeder already oriented, and asking this to know
   about the network as well would be two answers to one question. */
export function distanceAlong(geometry, point) {
  const g = geometry || [];
  let best = { d: Infinity, along: 0 };
  let run = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    const seg = Math.sqrt(l2);
    if (l2 > 0) {
      let u = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2;
      u = Math.max(0, Math.min(1, u));
      const on = [a[0] + vx * u, a[1] + vy * u];
      const d = dist(on, point);
      if (d < best.d) best = { d, along: run + seg * u };
    }
    run += seg;
  }
  return best.along;
}

/* Where to seal a feeder, given what is being connected now and what is
   not.

   `served` is every plot the feeder feeds, each with the point its
   service tees into the feeder. `connected` is the plot numbers on this
   call-off.

   Returns null where there is nothing to seal: every plot on the feeder
   being connected means the cable ends where the design says it ends,
   and that is a design bottle end rather than this. */
export function sealPoint({ feeder, served = [], connected = [], tailM = TAIL_M }) {
  const g = feeder?.Geometry || [];
  if (g.length < 2) return null;

  const picked = new Set(connected.map((p) => String(p).trim()));
  const rows = served
    .map((s) => ({ ...s, along: distanceAlong(g, s.at) }))
    .sort((a, b) => a.along - b.along);

  const on = rows.filter((r) => picked.has(String(r.plot).trim()));
  const off = rows.filter((r) => !picked.has(String(r.plot).trim()));

  /* Nothing connected on this feeder, so nothing has been laid to seal
     the end of. */
  if (!on.length) return null;

  const last = on[on.length - 1];

  /* Only where plots left out lie further along than the ones taken.

     Which covers both cases worth refusing: a feeder where everything
     is connected has nothing beyond the last plot, so the cable runs to
     its designed end and what goes there is a design bottle end; and a
     plot skipped in the middle is a gap rather than a section not yet
     built, where sealing the far end would say nothing about it.

     There was a separate `!off.length` test above this. It could never
     fire — an empty list has nothing further along either — so it read
     as two rules where there is one. */
  if (!off.some((r) => r.along > last.along)) return null;

  /* ── Five metres, but never off the end of this cable ──

     A leg is several cable features joined end to end, so five metres
     measured along it can cross a join and land on cable that has not
     been laid. The seal has to sit on cable that exists and is
     energised, so it is held back to the end of the one carrying the
     last connected plot.

     Which makes five a maximum rather than a fixed distance: a plot two
     metres from its cable's end is sealed two metres past, at the
     join. A plot with more than five metres of its own cable beyond it
     gets the full five, unchanged.

     `legLength` is the whole of this feature, because the leg beyond it
     is a different feature and not this one's to reach into. */
  const legLength = distanceAlong(g, g[g.length - 1]);
  const want = last.along + tailM;
  const put = Math.min(want, legLength);

  return {
    at: alongFrom(g, g[0], put),
    feederId: feeder.Feature_ID,
    afterPlot: last.plot,
    /* How far past the plot it actually landed, and whether it was cut
       short. A planner reading "5 m past 22" when it is two is being
       told something untrue, and the gang measures from the plot. */
    tailM: Math.round((put - last.along) * 10) / 10,
    heldBack: put < want,
    /* The plots this is holding the cable for, which is what makes it
       removable later: when a call-off connects the first of them, the
       seal becomes a straight joint. */
    waitingFor: off.filter((r) => r.along > last.along).map((r) => r.plot),
  };
}

/* A seal that a new call-off has reached past.

   When a later call-off connects the next plot along, the cable either
   side of the seal is being joined: the section that was energised and
   the one just laid. So the bottle end becomes a straight joint and the
   electricity flows through.

   Matched on what the seal was waiting for rather than on distance: the
   seal recorded which plots it was holding the cable for, and a call-off
   that connects any of them is the one it was waiting for. */
export function sealsNowJoined(seals = [], connected = []) {
  const picked = new Set(connected.map((p) => String(p).trim()));
  return seals.filter((s) =>
    (s.waitingFor || []).some((p) => picked.has(String(p).trim())));
}

/* ── One seal per leg ──

   A leg is a branch of the circuit from the origin out to where the run
   ends, and it is several cable features joined end to end. The seal
   belongs where the programme stops on that leg — once — not on every
   cable the leg is made of.

   Called per cable, sealPoint answers about that cable alone: a cable
   whose plots are all connected has nothing beyond it and returns
   null, and so does one with nothing connected on it. On a leg where
   the transition falls at a join, both halves say null and the leg gets
   no seal at all. Handing every cable the whole site's plots instead
   put a seal on nearly every one. Both were wrong, in opposite
   directions, for the same reason: the question is about the leg.

   So the plots are gathered across the leg, the last connected one is
   found, and the seal is placed on the cable carrying THAT plot —
   which is what keeps it on cable that has been laid.

   `cables` is the leg in walk order, origin first. `servedOn` gives the
   plots on one cable. Both come from the caller, because assembling a
   leg is the canvas's job and this module has no view of the drawing.*/
export function sealLeg({ cables = [], servedOn = () => [], connected = [],
  tailM = TAIL_M }) {
  const picked = new Set(connected.map((p) => String(p).trim()));

  /* The last cable carrying a connected plot. Walking from the origin
     out, so "last" is furthest along the leg. */
  let lastIdx = -1;
  for (let i = 0; i < cables.length; i++) {
    if (servedOn(cables[i]).some((r) => picked.has(String(r.plot).trim()))) {
      lastIdx = i;
    }
  }
  if (lastIdx < 0) return null;

  /* Anything left for later, anywhere further out on the leg. A plot
     skipped behind is a gap, not the programme stopping \u2014 the same
     rule sealPoint applies within one cable, applied across the leg. */
  const beyond = [];
  for (let i = lastIdx; i < cables.length; i++) {
    for (const r of servedOn(cables[i])) {
      if (!picked.has(String(r.plot).trim())) beyond.push(r);
    }
  }
  if (!beyond.length) return null;

  /* Placed on the cable carrying the last connected plot, where
     sealPoint clamps it to that cable's end. The plots handed over are
     that cable's own, plus the ones further out on the leg so it knows
     something is left \u2014 named by plot, so a plot on a later cable is
     still "beyond" without needing its position on this one. */
  const cable = cables[lastIdx];
  const own = servedOn(cable);
  const seal = sealPoint({
    feeder: cable,
    served: [...own, ...beyond.filter((b) => !own.includes(b))],
    connected,
    tailM,
  });
  if (seal) return seal;

  /* sealPoint refused, which happens where every plot on this cable is
     connected and everything left for later is on the next one. The
     seal then belongs at the end of this cable: that is as far as laid
     cable goes. */
  const g = cable.Geometry || [];
  if (g.length < 2) return null;
  const rows = own
    .map((r) => ({ ...r, along: distanceAlong(g, r.at) }))
    .filter((r) => picked.has(String(r.plot).trim()))
    .sort((a, b) => a.along - b.along);
  const last = rows[rows.length - 1];
  if (!last) return null;

  const end = distanceAlong(g, g[g.length - 1]);
  const put = Math.min(last.along + tailM, end);
  return {
    at: alongFrom(g, g[0], put),
    feederId: cable.Feature_ID,
    afterPlot: last.plot,
    tailM: Math.round((put - last.along) * 10) / 10,
    heldBack: put < last.along + tailM,
    waitingFor: beyond.map((r) => r.plot),
  };
}
