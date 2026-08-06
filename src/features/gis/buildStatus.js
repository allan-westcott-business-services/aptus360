/* Marking lengths of trench as existing, planned, to be removed or
   as-built.

   A trench is drawn as one continuous run because that is how it is
   drawn, not because the whole of it is at the same stage. Half a road
   may be in the ground and half still to dig, and the drawing has to be
   able to say so.

   ── Why this splits the trench ──

   A status belongs to a length, and the only way to give a length its
   own status is for it to be its own feature. Marking part of a run
   therefore breaks it at the two points chosen and leaves three
   features where there was one — which is a real change to the drawing
   and is why it asks before doing it.

   The alternative, keeping one feature and storing a list of ranges
   along it, was considered and rejected: every other thing that reads a
   trench — the router, the trace, the bill of materials, the call-offs —
   would have to learn about ranges, and each would be a place to get it
   wrong. */

export const BUILD_STATUSES = [
  { key: "existing", label: "Existing", colour: "#64748b" },
  { key: "planned", label: "Planned", colour: "#8b5e34" },
  { key: "remove", label: "To be Removed", colour: "#dc2626" },
  { key: "asbuilt", label: "As-Built", colour: "#16a34a" },
];

export const statusOf = (f) => f?.Attributes?.Build_Status ?? null;

export function statusColour(key) {
  return BUILD_STATUSES.find((s) => s.key === key)?.colour ?? null;
}

export function statusLabel(key) {
  return BUILD_STATUSES.find((s) => s.key === key)?.label ?? null;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* How far along a line a point is, and how far off it. */
export function alongLine(p, g = []) {
  let run = 0;
  let best = { m: null, d: Infinity, point: null };
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
      if (d < best.d) best = { m: run + segLen * u, d, point: q };
    }
    run += segLen;
  }
  return best;
}

export function lengthOf(g = []) {
  let t = 0;
  for (let i = 0; i + 1 < g.length; i++) t += dist(g[i], g[i + 1]);
  return t;
}

/* A line cut at a distance along it, as two lines.

   The cut point appears in both halves, so the two still meet — a split
   that left a gap would break the network at the very place somebody was
   trying to describe. */
export function cutAt(g = [], m) {
  if (g.length < 2) return null;
  const total = lengthOf(g);
  /* A cut at either end is not a cut. Returning one empty piece would
     give the drawing a feature with a single point on it. */
  if (m <= 0.01 || m >= total - 0.01) return null;

  const before = [];
  const after = [];
  let run = 0;
  let cutPoint = null;

  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const segLen = dist(a, b);

    if (cutPoint) {
      after.push(b);
      run += segLen;
      continue;
    }

    before.push(a);
    if (run + segLen >= m) {
      const u = segLen ? (m - run) / segLen : 0;
      cutPoint = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      before.push(cutPoint);
      after.push(cutPoint, b);
    }
    run += segLen;
  }

  if (!cutPoint) return null;
  return { before, after, at: cutPoint };
}

/* What marking a stretch does to a trench.

   Given the two points somebody clicked, this says which features to
   write: the piece being marked, and whatever is left either side of it.

   Nothing is written here. The caller applies it, and can show what will
   happen first — splitting a run is not something to do silently. */
export function planMark(trench, fromPoint, toPoint, status) {
  const g = trench?.Geometry || [];
  if (g.length < 2) return { error: "That is not a line." };

  const a = alongLine(fromPoint, g);
  const b = alongLine(toPoint, g);
  if (a.m == null || b.m == null) return { error: "Both points must be on the trench." };

  const lo = Math.min(a.m, b.m);
  const hi = Math.max(a.m, b.m);
  const total = lengthOf(g);

  if (hi - lo < 0.1) {
    return { error: "Those two points are the same place." };
  }

  /* The whole run: no split needed, just a status. */
  if (lo <= 0.01 && hi >= total - 0.01) {
    return {
      ok: true,
      wholeRun: true,
      update: { Feature_ID: trench.Feature_ID, status },
      creates: [],
      splits: 0,
    };
  }

  /* Cut at the far end first, so the near cut's distance still means
     what it did — cutting at the near end first would shorten the piece
     the far distance was measured along. */
  let head = null;
  let marked = null;
  let tail = null;

  if (hi < total - 0.01) {
    const cut = cutAt(g, hi);
    marked = cut.before;
    tail = cut.after;
  } else {
    marked = g;
  }

  if (lo > 0.01) {
    const cut = cutAt(marked, lo);
    head = cut.before;
    marked = cut.after;
  }

  /* The original feature keeps the marked piece, so whatever else is on
     it — its type, its locks, anything referring to it — stays with the
     length somebody was pointing at. */
  return {
    ok: true,
    wholeRun: false,
    update: { Feature_ID: trench.Feature_ID, geometry: marked, status },
    creates: [head, tail].filter(Boolean).map((geometry) => ({
      geometry,
      /* The offcuts keep whatever status the run had, which may be
         nothing — they have not been marked, only separated. */
      status: statusOf(trench),
    })),
    splits: [head, tail].filter(Boolean).length,
    markedM: Math.round(lengthOf(marked) * 10) / 10,
  };
}


/* Off-site trench.

   A length dug away from the site itself — through an adopted road, a
   third party's land, a verge outside the boundary. It carries a
   different rate, different notice and often a different permit, and
   whoever is scheduling the work needs to know before they book a gang
   rather than after.

   A flag on the trench rather than a fifth build status: a length can be
   off site and as-built at the same time, and the two answer different
   questions. Making it a status would have forced a choice between
   them. */
export const isOffSite = (f) => f?.Attributes?.Off_Site === true;

/* Whether any part of a run of trench is off site.

   Given the features a span crosses, so an assignment can be marked
   without anybody working it out from the drawing. */
export function anyOffSite(trenches = []) {
  return trenches.some((t) => isOffSite(t));
}
