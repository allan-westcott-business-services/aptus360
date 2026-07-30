/* Snapping.

   Two tolerances doing two different jobs, as the original had:

   SNAP_PX      a drawing aid. Measured in pixels so it feels the same at
                every zoom — at 40% a 12px reach covers a lot of ground,
                which is what you want when placing roughly.
   CONNECT_M    a fact about the network. Measured in metres because two
                ends either meet or they don't, and that can't depend on
                how far you happened to be zoomed in when you drew it. */
export const SNAP_PX = 12;
export const CONNECT_M = 0.25;

/* Candidate points to snap to: every vertex of every visible feature,
   plus the midpoints of line segments, which is where people put tees. */
export function snapTargets(features, { includeMidpoints = true } = {}) {
  const out = [];
  features.forEach((f) => {
    const g = f.Geometry || [];
    g.forEach((p, i) => {
      out.push({
        point: p,
        featureId: f.Feature_ID,
        vertex: i,
        kind: f.Feature_Type === "point" ? "point" : (i === 0 || i === g.length - 1 ? "end" : "vertex"),
        label: f.Label,
        lineType: f.Attributes?.Line_Type ?? null,
      });
    });
    if (includeMidpoints && f.Feature_Type !== "point") {
      for (let i = 0; i < g.length - 1; i++) {
        out.push({
          point: [(g[i][0] + g[i + 1][0]) / 2, (g[i][1] + g[i + 1][1]) / 2],
          featureId: f.Feature_ID,
          segment: i,
          kind: "mid",
          label: f.Label,
          lineType: f.Attributes?.Line_Type ?? null,
        });
      }
    }
  });
  return out;
}

/* Nearest target within reach, or null. Distance is compared in pixels
   so the tolerance behaves the same however far you're zoomed in. */
export function findSnap(targets, cursorM, scale, tolerancePx = SNAP_PX) {
  let best = null;
  let bestPx = tolerancePx;
  for (const t of targets) {
    const dPx = Math.hypot(t.point[0] - cursorM[0], t.point[1] - cursorM[1]) * scale;
    if (dPx <= bestPx) { bestPx = dPx; best = t; }
  }
  return best;
}

/* Perpendicular foot on a segment — snapping onto a line rather than to
   one of its ends, which is how a service tees off a main. */
export function projectOntoSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return { point: [...a], t: 0 };
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { point: [a[0] + t * vx, a[1] + t * vy], t };
}

export function nearestOnLines(features, cursorM, scale, tolerancePx = SNAP_PX) {
  let best = null;
  let bestPx = tolerancePx;
  features.forEach((f) => {
    if (f.Feature_Type === "point") return;
    const g = f.Geometry || [];
    for (let i = 0; i < g.length - 1; i++) {
      const { point } = projectOntoSegment(cursorM, g[i], g[i + 1]);
      const dPx = Math.hypot(point[0] - cursorM[0], point[1] - cursorM[1]) * scale;
      if (dPx <= bestPx) {
        bestPx = dPx;
        best = { point, featureId: f.Feature_ID, segment: i, kind: "edge", label: f.Label };
      }
    }
  });
  return best;
}

/* Which features this geometry actually touches. Uses CONNECT_M, not the
   snap tolerance — a line drawn near another isn't joined to it. */
export function connectedTo(geometry, features, selfId) {
  const hits = new Set();
  const ends = [geometry[0], geometry[geometry.length - 1]].filter(Boolean);
  features.forEach((f) => {
    if (f.Feature_ID === selfId) return;
    (f.Geometry || []).forEach((p) => {
      ends.forEach((e) => {
        if (Math.hypot(p[0] - e[0], p[1] - e[1]) <= CONNECT_M) hits.add(f.Feature_ID);
      });
    });
  });
  return [...hits];
}

export function lineLength(geometry) {
  let t = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    t += Math.hypot(geometry[i + 1][0] - geometry[i][0], geometry[i + 1][1] - geometry[i][1]);
  }
  return t;
}


/* What counts as "the same class". Lines are classed by their type — a
   mains trench and a service trench are different things even though
   they share a layer. Points are classed by the role they play. */
export function classOf(f) {
  if (!f) return "";
  if (f.Feature_Type === "point") return `point:${f.Feature_Role || f.Layer_Key}`;
  return `${f.Feature_Type}:${f.Attributes?.Line_Type || f.Layer_Key}`;
}

/* A trench is a hole; a cable is what goes in it. They take different
   fields — a trench has a surface to reinstate and no size, a cable has
   a size and no surface, because nobody reinstates a cable.

   Decided from the line type's layer rather than a list of keys, so a
   trench type added later needs no code change. */
export function isTrenchType(typeKey, lineTypes = []) {
  if (!typeKey) return false;
  return lineTypes.find((t) => t.Type_Key === typeKey)?.Layer_Key === "trench";
}

export function classLabel(f, lineTypes = []) {
  if (!f) return "";
  if (f.Feature_Type === "point") return f.Feature_Role || f.Layer_Key;
  const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
  return t?.Label || f.Layer_Key;
}

const meets = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/* Chain lines end to end into one polyline.

   Works outwards from the first line, attaching whichever remaining line
   touches either free end and reversing it if it arrives backwards. The
   shared point is dropped rather than repeated, so the joined length is
   the sum of the parts and not one vertex longer.

   Tolerance is CONNECT_M — metres, not pixels. Two ends either meet or
   they don't, and that can't depend on the zoom at the time. */
export function joinLines(lines, tol = CONNECT_M) {
  const usable = lines.filter((f) => (f.Geometry || []).length >= 2);
  if (usable.length < 2) return { error: "Select two or more lines to join." };

  let chain = [...usable[0].Geometry];
  const used = [usable[0]];
  const rest = usable.slice(1);

  let attached = true;
  while (rest.length && attached) {
    attached = false;
    for (let i = 0; i < rest.length; i++) {
      const g = rest[i].Geometry;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      const gs = g[0];
      const ge = g[g.length - 1];

      if (meets(tail, gs, tol))      chain = [...chain, ...g.slice(1)];
      else if (meets(tail, ge, tol)) chain = [...chain, ...[...g].reverse().slice(1)];
      else if (meets(head, ge, tol)) chain = [...g.slice(0, -1), ...chain];
      else if (meets(head, gs, tol)) chain = [...[...g].reverse().slice(0, -1), ...chain];
      else continue;

      used.push(rest[i]);
      rest.splice(i, 1);
      attached = true;
      break;
    }
  }

  if (rest.length) {
    return {
      error: rest.length === 1
        ? "One of these doesn't share an end point with the others. Lines join end to end — drag the loose end onto the one it should meet, then try again."
        : `${rest.length} of these don't share an end point with the others. Lines join end to end, within ${CONNECT_M} m.`,
    };
  }
  return { geometry: chain, used };
}


/* Splitting a line at a point.

   Break here has to divide one run into two that still meet: the point
   ends the first and begins the second, so nothing is lost at the join
   and the two remain connected by geometry.

   Returns null when the point is at an end — there is nothing on one
   side of it, and a zero-length run is not a break. */
export function splitPolylineAt(geometry = [], point, tol = CONNECT_M) {
  const g = geometry;
  if (g.length < 2 || !point) return null;

  /* An existing vertex splits cleanly; anywhere else the point is
     inserted into both halves so neither loses the corner. */
  let atVertex = -1;
  for (let i = 0; i < g.length; i++) {
    if (Math.hypot(g[i][0] - point[0], g[i][1] - point[1]) <= tol) { atVertex = i; break; }
  }

  if (atVertex >= 0) {
    if (atVertex === 0 || atVertex === g.length - 1) return null;
    return [g.slice(0, atVertex + 1), g.slice(atVertex)];
  }

  /* Otherwise find the segment it falls on. */
  let seg = -1, best = Infinity, at = null;
  for (let i = 0; i + 1 < g.length; i++) {
    /* projectOntoSegment returns { point, t }, not a bare pair. */
    const { point: q } = projectOntoSegment(point, g[i], g[i + 1]);
    const d = Math.hypot(q[0] - point[0], q[1] - point[1]);
    if (d < best) { best = d; seg = i; at = q; }
  }
  if (seg < 0 || best > tol) return null;

  const a = [...g.slice(0, seg + 1), at];
  const b = [at, ...g.slice(seg + 1)];
  if (a.length < 2 || b.length < 2) return null;
  return [a, b];
}
