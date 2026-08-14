/* What is routed inside a length of trench.

   A trench is dug once and carries whatever is laid in it. The LV feeder
   network is the first of those — the cable follows the trench from the
   substation out — and gas and water mains will follow the same way.

   ── Why this is not simply "what connects to it" ──

   A cable does not record which trench it is in. It is drawn along the
   same ground, and that is the whole relationship: a line whose length
   runs within a metre or so of the trench is in it, and one that merely
   crosses it is not.

   So this measures. For each candidate line, how much of it lies along
   this trench — and a line that shares most of its length is content, a
   line that touches at a point is a crossing. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function nearestOn(p, g = []) {
  let best = Infinity;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (!len2) { best = Math.min(best, dist(p, a)); continue; }
    let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    u = Math.max(0, Math.min(1, u));
    const d = dist(p, [a[0] + vx * u, a[1] + vy * u]);
    if (d < best) best = d;
  }
  return best;
}

export function lengthOf(g = []) {
  let t = 0;
  for (let i = 0; i + 1 < g.length; i++) t += dist(g[i], g[i + 1]);
  return t;
}

/* How much of a line runs along a trench.

   Walked in short steps rather than by its vertices: a cable drawn as
   two points across a trench that bends would look distant at both ends
   and close in the middle, or the reverse, depending on where the
   vertices happened to fall. Stepping along it measures the line rather
   than its corners. */
export function lengthWithin(line = [], trench = [], opts = {}) {
  const { withinM = 1.5, stepM = 1.0 } = opts;
  const total = lengthOf(line);
  if (!total || trench.length < 2) return 0;

  let inside = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = dist(a, b);
    if (!segLen) continue;
    const steps = Math.max(1, Math.ceil(segLen / stepM));

    for (let k = 0; k < steps; k++) {
      /* The middle of each step, so a step is counted by where most of
         it is rather than by where it starts. */
      const u = (k + 0.5) / steps;
      const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      if (nearestOn(p, trench) <= withinM) inside += segLen / steps;
    }
  }
  return inside;
}

/* Where a point sits along a trench, in metres from its start. */
function alongOn(p, g = []) {
  let run = 0;
  let best = { m: 0, d: Infinity };
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const segLen = Math.hypot(vx, vy);
    const len2 = vx * vx + vy * vy;
    if (len2) {
      let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
      u = Math.max(0, Math.min(1, u));
      const d = dist(p, [a[0] + vx * u, a[1] + vy * u]);
      if (d < best.d) best = { m: run + segLen * u, d };
    }
    run += segLen;
  }
  return best.m;
}

/* Which part of the trench a line covers, in metres from the trench's
   start.

   ── Why the extent and not just the total ──

   In one section of trench, everything laid in it runs its whole
   length: pipes and cables do not join a trench part way along. So a
   line covering half a section is not something laid beside the rest —
   it is a consecutive run of the same pipe, and the next run picks up
   where it stopped.

   The total metres cannot tell those apart. Two 50m runs end to end and
   two 50m cables side by side down the same 50m both come to 100m. The
   extent can: the first pair occupies 0–50 and 50–100, the second pair
   occupies 0–50 twice.

   Measured by the same walk lengthWithin uses, keeping the first and
   last step that fell inside the band rather than counting them.

   Reported, but not what the sizing counts by. Two runs meeting at a
   bend each sit inside the other's tolerance band for a few metres, so
   their extents overlap when they are end to end — which read as two
   pipes laid together. The cross-section counts coverage instead; see
   concurrentCount in trenchSize.js. This stays because "where along the
   trench" is a fair question and a panel may want to answer it. */
export function spanWithin(line = [], trench = [], opts = {}) {
  const { withinM = 1.5, stepM = 1.0 } = opts;
  if (trench.length < 2 || line.length < 2) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = dist(a, b);
    if (!segLen) continue;
    const steps = Math.max(1, Math.ceil(segLen / stepM));
    for (let k = 0; k < steps; k++) {
      const u = (k + 0.5) / steps;
      const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      if (nearestOn(p, trench) > withinM) continue;
      const m = alongOn(p, trench);
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
  }
  return hi >= lo ? { fromM: lo, toM: hi } : null;
}

/* The stretch of trench between the span nodes either side of a point.

   A trench feature runs from wherever it was drawn to wherever it
   stopped, and that is usually past several junctions. Asking what is in
   it returned everything in the whole feature — including the cable
   beyond the junction, which turns off at A1 and is not in the length
   somebody is pointing at.

   What they mean by "this trench" is the stretch between the nodes
   either side of where they clicked: substation to A1, or A1 to A2. That
   is the piece that gets dug as one thing and the piece a cable either
   runs down or does not.

   The ends of the trench act as nodes where there is nothing nearer, so
   a run with no span nodes on it is still one stretch rather than
   nothing. */
export function stretchAt(trench, point, nodes = [], opts = {}) {
  const { eps = 0.5 } = opts;
  const g = trench?.Geometry || [];
  if (g.length < 2 || !point) return null;

  const total = lengthOf(g);

  /* Where each node sits along this trench, and where the click does. */
  const along = (p) => {
    let run = 0;
    let best = { m: null, d: Infinity };
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i];
      const b = g[i + 1];
      const segLen = dist(a, b);
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len2 = vx * vx + vy * vy;
      if (len2) {
        let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
        u = Math.max(0, Math.min(1, u));
        const q = [a[0] + vx * u, a[1] + vy * u];
        const d = dist(p, q);
        if (d < best.d) best = { m: run + segLen * u, d };
      }
      run += segLen;
    }
    return best;
  };

  const cuts = [{ m: 0, node: null }, { m: total, node: null }];
  for (const n of nodes) {
    const p = (n.Geometry || [])[0];
    if (!p) continue;
    const hit = along(p);
    /* Only nodes actually on this trench. One on the road behind lands
       within a metre or two of nothing here. */
    if (hit.m == null || hit.d > eps * 4) continue;
    if (hit.m <= eps || hit.m >= total - eps) continue;
    cuts.push({ m: hit.m, node: n });
  }
  cuts.sort((a, b) => a.m - b.m);

  const at = along(point);
  if (at.m == null) return null;

  /* The pair the click falls between. */
  let lo = cuts[0];
  let hi = cuts[cuts.length - 1];
  for (let i = 0; i + 1 < cuts.length; i++) {
    if (at.m >= cuts[i].m - eps && at.m <= cuts[i + 1].m + eps) {
      lo = cuts[i];
      hi = cuts[i + 1];
      break;
    }
  }

  /* The geometry of just that stretch. */
  const out = [];
  let run = 0;
  let started = false;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const segLen = dist(a, b);
    const endAt = run + segLen;

    if (!started && endAt > lo.m) {
      const u = segLen ? (lo.m - run) / segLen : 0;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      started = true;
    }
    if (started) {
      if (endAt >= hi.m) {
        const u = segLen ? (hi.m - run) / segLen : 1;
        out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
        break;
      }
      out.push(b);
    }
    run = endAt;
  }

  return {
    geometry: out,
    fromNode: lo.node,
    toNode: hi.node,
    lengthM: Math.round((hi.m - lo.m) * 10) / 10,
    /* Whether the trench had any nodes on it at all, so the panel can
       say "the whole run" rather than naming ends that do not exist. */
    wholeRun: cuts.length === 2,
  };
}

/* Everything routed inside this trench.

   Ordered by how much of the trench each takes up, so the main run comes
   before a cable that clips the end of it. */
export function contentsOf(trench, features = [], opts = {}) {
  const {
    /* Which line types are services, and which trench types are.

       A mains trench carries mains — the LV cable, the gas pipe, the
       water pipe — and a service trench carries services. Measuring
       proximity alone put every service pipe running along a road into
       the mains trench beside it, which is not what is in it: they are
       two trenches, and the service is in its own.

       Passed in rather than decided here, for the same reason the span
       nodes are: the types are configured, and a module guessing at
       their names is wrong the day somebody renames one. */
    serviceLineTypes = null,
    serviceTrenchTypes = null,
    withinM = 1.5,
    /* How much of the shorter of the line and the stretch has to be
       shared before the line counts as being in it — see the note at
       the test itself for why it is the shorter of the two and not the
       line. A quarter is deliberately generous: a service cable that
       leaves the trench after a few metres is still partly in it, and
       saying so is more use than a rule that only counts a perfect
       match. */
    minShare = 0.25,
    /* And a decent share of the trench. Without it a two-metre clip of
       a hundred-metre cable passed the line test — two metres is a
       quarter of nothing much — and appeared as content. */
    minTrenchShare = 0.2,
    isTrench = (f) => f.Layer_Key === "trench",
    labelOf = (f) => f.Label ?? null,
  } = opts;

  const g = trench?.Geometry || [];
  if (g.length < 2) return { error: "That is not a line." };

  const trenchM = lengthOf(g);
  const out = [];
  /* Lines near this stretch that are not in it. */
  const passing = [];

  for (const f of features) {
    if (f.Feature_ID === trench.Feature_ID) continue;
    if (f.Feature_Type !== "line") continue;
    /* Other trenches are not content. A trench crossing another is a
       junction, and one running beside it is a second trench — neither
       is something laid inside this one. */
    if (isTrench(f)) continue;

    /* Mains in a mains trench, services in a service trench.

       Where nothing says which is which, everything is reported — a
       drawing whose types are not configured is better served by too
       much than by an empty panel it cannot explain. */
    if (serviceLineTypes && serviceTrenchTypes) {
      const trenchIsService = serviceTrenchTypes.has(
        trench.Attributes?.Line_Type);
      const lineIsService = serviceLineTypes.has(f.Attributes?.Line_Type);
      if (trenchIsService !== lineIsService) continue;
    }

    const lg = f.Geometry || [];
    if (lg.length < 2) continue;

    const total = lengthOf(lg);
    if (!total) continue;

    /* Capped at the length of the stretch.

       The tolerance is a band a metre and a half either side, so a cable
       swinging round the corner at the end is inside it for a moment
       after the trench has stopped. Uncapped that reported sixteen
       metres of cable in a fourteen-metre trench, which reads as an
       arithmetic fault whatever else the panel says. Nothing is laid in
       a stretch for longer than the stretch. */
    const within = Math.min(
      lengthWithin(lg, g, { withinM, ...opts }),
      trenchM || Infinity);
    /* Passing the corner is not being in it.

       A cable that turns at a junction runs within a metre of the end of
       the neighbouring stretch for a couple of metres as it swings
       round. That was counted as content, so a stretch showed the same
       cable size twice — once for the run laid in it and once for the
       run leaving it.

       Two bars, both of which have to be cleared: a decent share of the
       line, and a decent share of the trench. A cable genuinely laid in
       a stretch runs along it; one clipping the corner does neither. */
    /* Measured against the shorter of the two, not against the line.

       A share of the line only means anything where the line is the
       shorter thing. The trench here is one stretch between span nodes,
       while a cable is the whole feature — so asking what is in the
       fourteen metres from the substation to the breech joint, the
       feeder that carries on round the estate for another hundred and
       fifty shares nine per cent of itself with that stretch and failed,
       while the one terminating at the joint shared all of itself and
       passed. Two cables in the ground, one on the panel, and the longer
       the cable the more certainly it was dropped — which is backwards,
       since a feeder running the full length of a stretch is the
       clearest case of being in it there is.

       Against the shorter of the two both read 100%, because the whole
       of that stretch is the whole of what either has in it. */
    const shorter = Math.min(total, trenchM || total) || total;
    const shareOfLine = within / shorter;
    const shareOfTrench = trenchM ? within / trenchM : 0;

    if (shareOfLine < minShare || shareOfTrench < minTrenchShare) {
      /* Kept, so nothing disappears without saying so. A cable at the
         junction is worth knowing about; it is just not in this
         length. */
      passing.push({
        feature: f,
        utility: f.Layer_Key ?? null,
        label: labelOf(f),
        withinM: Math.round(within * 10) / 10,
      });
      continue;
    }

    /* Where along the trench this one runs, so what is laid beside it
       can be told from what follows it. Null where it cannot be
       measured, which the sizing reads as "the whole length" — the
       cautious answer, since that is the case that widens the trench. */
    const span = spanWithin(lg, g, { withinM, ...opts });

    out.push({
      feature: f,
      utility: f.Layer_Key ?? null,
      lineType: f.Attributes?.Line_Type ?? null,
      label: labelOf(f),
      fromM: span ? Math.round(span.fromM * 10) / 10 : null,
      toM: span ? Math.round(span.toM * 10) / 10 : null,
      /* How much of this line is in the trench, and how much of the
         trench it takes up. The second is what says whether it runs the
         whole way or stops part way along. */
      withinM: Math.round(within * 10) / 10,
      lineM: Math.round(total * 10) / 10,
      shareOfTrench: trenchM ? Math.round((within / trenchM) * 100) : 0,
    });
  }

  out.sort((a, b) => b.withinM - a.withinM);

  passing.sort((a, b) => b.withinM - a.withinM);

  return {
    ok: true,
    trench,
    trenchM: Math.round(trenchM * 10) / 10,
    contents: out,
    /* Near the stretch but not laid in it — typically a cable turning at
       a junction at one end. */
    passing,
    /* Grouped by utility, which is how somebody asks the question — what
       electric is in here, what gas. */
    byUtility: [...out.reduce((m, x) => {
      const k = x.utility ?? "other";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
      return m;
    }, new Map())].map(([utility, items]) => ({
      utility,
      items,
      totalM: Math.round(items.reduce((t, x) => t + x.withinM, 0) * 10) / 10,
    })),
  };
}
