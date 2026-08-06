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

/* Everything routed inside this trench.

   Ordered by how much of the trench each takes up, so the main run comes
   before a cable that clips the end of it. */
export function contentsOf(trench, features = [], opts = {}) {
  const {
    withinM = 1.5,
    /* A line sharing less than this much of itself with the trench is
       crossing it, not in it. A quarter is deliberately generous: a
       service cable that leaves the trench after a few metres is still
       partly in it, and saying so is more use than a rule that only
       counts a perfect match. */
    minShare = 0.25,
    isTrench = (f) => f.Layer_Key === "trench",
    labelOf = (f) => f.Label ?? null,
  } = opts;

  const g = trench?.Geometry || [];
  if (g.length < 2) return { error: "That is not a line." };

  const trenchM = lengthOf(g);
  const out = [];

  for (const f of features) {
    if (f.Feature_ID === trench.Feature_ID) continue;
    if (f.Feature_Type !== "line") continue;
    /* Other trenches are not content. A trench crossing another is a
       junction, and one running beside it is a second trench — neither
       is something laid inside this one. */
    if (isTrench(f)) continue;

    const lg = f.Geometry || [];
    if (lg.length < 2) continue;

    const within = lengthWithin(lg, g, { withinM, ...opts });
    const total = lengthOf(lg);
    if (!total) continue;
    if (within / total < minShare) continue;

    out.push({
      feature: f,
      utility: f.Layer_Key ?? null,
      lineType: f.Attributes?.Line_Type ?? null,
      label: labelOf(f),
      /* How much of this line is in the trench, and how much of the
         trench it takes up. The second is what says whether it runs the
         whole way or stops part way along. */
      withinM: Math.round(within * 10) / 10,
      lineM: Math.round(total * 10) / 10,
      shareOfTrench: trenchM ? Math.round((within / trenchM) * 100) : 0,
    });
  }

  out.sort((a, b) => b.withinM - a.withinM);

  return {
    ok: true,
    trench,
    trenchM: Math.round(trenchM * 10) / 10,
    contents: out,
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
