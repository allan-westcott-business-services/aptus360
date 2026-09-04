/* Telling one LV feeder main from another on the drawing.

   Two separate ideas, deliberately kept apart:

     colour — every feeder main gets its own, always, whether or not
              anything runs beside it. Colour identifies the run.

     offset — only where two runs share an alignment. There is nothing
              to separate otherwise, and nudging a lone cable off its
              trench would be a lie about where it is.

   Both are drawing aids. Neither touches stored geometry, and that is
   not a stylistic preference: two lines are joined when their ends are
   within CONNECT_M, which is 0.25 m. Offsetting a cable's real geometry
   by even 0.3 m severs every junction it has — the fault that took plots
   23, 24 and 66 off the Circuit Report. So the offset is applied to
   projected screen points, after the geometry has done its real work.

   Screen pixels rather than metres for the same reason it is a drawing
   aid: the separation should stay readable at any zoom, not converge to
   nothing as you zoom out. At site scale two cables 400 mm apart are one
   line whatever we do, and drawing them as one hides a cable. */

/* Chosen to stay apart from each other and from what is already on the
   canvas — trenches are greys and browns, water blue, plot seeds carry
   the bedroom palette. Ten because that is about as many as anyone can
   tell apart on a busy drawing; past that the sequence repeats, which is
   honest, and the label still says which run it is. */
export const FEEDER_COLOURS = [
  "#1d4ed8", // blue
  "#ea580c", // orange
  "#15803d", // green
  "#9333ea", // purple
  "#0891b2", // teal
  "#be123c", // crimson
  "#a16207", // ochre
  "#4338ca", // indigo
  "#c2410c", // rust
  "#166534", // forest
];

export const feederColourAt = (i) =>
  FEEDER_COLOURS[((i % FEEDER_COLOURS.length) + FEEDER_COLOURS.length) % FEEDER_COLOURS.length];

export const isFeederMain = (f) =>
  f?.Feature_Type === "line"
  && f?.Layer_Key === "electric"
  && f?.Attributes?.Line_Type === "elec_main";

/* Everything that shares a trench and needs separating on the drawing.

   Wider than isFeederMain on purpose. Colour identifies a circuit and HV
   belongs to none, so the HV incomer keeps its own style — but it runs
   down the same mains trench as the LV feeders for much of its length,
   and left out of the offset it is drawn exactly on top of them. Two
   cables in one trench are two cables whether or not one of them is on a
   circuit. */
export const isFeederRun = (f) =>
  f?.Feature_Type === "line"
  && f?.Layer_Key === "electric"
  && (f?.Attributes?.Line_Type === "elec_main"
      || f?.Attributes?.Line_Type === "elec_hv");

/* Which circuit a feeder run belongs to.

   Build LV Network stamps Circuit_ID on every section it draws, which is
   what makes a circuit's colour hold along its whole length. Colouring
   by feature instead gave each section its own, so a feeder changed
   colour at every span node — the sections are separate features and the
   nodes are where one ends and the next begins. */
export const circuitIdOf = (f) => {
  const id = f?.Attributes?.Circuit_ID;
  return id == null ? null : Number(id);
};

/* The colour for a circuit.

   An explicit choice wins. Otherwise the circuit's position among the
   circuits on the drawing, ordered by id, so the assignment is stable:
   redrawing a feeder does not repaint the site, because the circuit it
   belongs to has not moved.

   A main with no circuit gets nothing back and keeps whatever the style
   cascade gives it. Colour identifies a circuit here, so a length of
   mains that is not on one has no colour to carry. */
export function circuitColours(features = [], chosen = {}) {
  const ids = [...new Set(features.filter(isFeederMain).map(circuitIdOf)
    .filter((id) => id != null))].sort((a, b) => a - b);

  const out = new Map();
  ids.forEach((id, i) => {
    const pick = chosen?.[id] ?? chosen?.[String(id)];
    out.set(id, pick || feederColourAt(i));
  });
  return out;
}

/* ── Geometry helpers ── */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const polylineLength = (g = []) => {
  let t = 0;
  for (let i = 1; i < g.length; i++) t += dist(g[i - 1], g[i]);
  return t;
};

/* Distance from a point to a segment, clamped to its ends. */
function pointToSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  if (!l2) return dist(p, a);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

export function pointToPolyline(p, g = []) {
  if (g.length === 0) return Infinity;
  if (g.length === 1) return dist(p, g[0]);
  let best = Infinity;
  for (let i = 1; i < g.length; i++) {
    const d = pointToSegment(p, g[i - 1], g[i]);
    if (d < best) best = d;
  }
  return best;
}

/* Points along a polyline at a fixed spacing, each with how far along it
   is, so overlap can be measured as a length rather than as a count of
   samples — a count would weight a dense stretch of vertices more than a
   sparse one. */
function walk(g, step) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1];
    const b = g[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ s: acc + t * d, p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] });
    }
    acc += d;
  }
  out.push({ s: acc, p: g[g.length - 1] });
  return { pts: out, total: acc };
}

/* How much of a runs alongside b.

   Measured as overlapping length with the ends discounted, because a
   branching tree is full of runs that share a junction and immediately
   diverge — on this site A6 and A7 leave the same node, and A5 and A8
   meet end to end. Judging by "how much of this run is near that one"
   calls all of those parallel. Ignoring the first and last endIgnoreM
   removes the junction itself from the measurement, after which a shared
   node counts for nothing and a shared route counts for its whole
   length. */
export function overlapLength(a = [], b = [], opts = {}) {
  const { tolM = 2.0, endIgnoreM = 1.0, stepM = 0.5 } = opts;
  if (a.length < 2 || b.length < 2) return 0;
  const { pts, total } = walk(a, stepM);
  let run = 0;
  let prev = null;
  for (const { s, p } of pts) {
    if (s < endIgnoreM || s > total - endIgnoreM) { prev = s; continue; }
    if (prev != null && pointToPolyline(p, b) <= tolM) run += s - prev;
    prev = s;
  }
  return run;
}

export function isParallel(a, b, opts = {}) {
  const { minOverlapM = 5.0, minFraction = 0.5 } = opts;
  const shorter = Math.min(polylineLength(a), polylineLength(b));
  if (shorter <= 0) return false;
  /* Measured both ways round and the better taken: a short run beside a
     long one covers little of the long one but all of itself, and it is
     still sharing the trench. */
  const run = Math.max(overlapLength(a, b, opts), overlapLength(b, a, opts));
  return run >= minOverlapM && run >= minFraction * shorter;
}

/* Runs sharing an alignment, grouped.

   Transitive on purpose: three cables in one trench should be one group
   of three that spreads evenly, not a pair plus a straggler. Union-find
   rather than a pairwise sweep, so A beside B and B beside C puts all
   three together even where A and C are far enough apart to fail the
   test on their own. */
export function parallelGroups(runs = [], opts = {}) {
  const n = runs.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[a] = b; };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isParallel(runs[i].geometry, runs[j].geometry, opts)) union(i, j);
    }
  }

  const by = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!by.has(r)) by.set(r, []);
    by.get(r).push(runs[i]);
  }
  /* Only groups worth separating. A group of one is a cable on its own,
     which is drawn where it is. */
  return [...by.values()].filter((g) => g.length > 1);
}

/* Which side of a reference line a run sits on, and how far.

   Signed, using the reference's own left normal, and measured at the
   run's midpoint where the two are genuinely alongside rather than at an
   end where they may be converging on a shared junction. */
export function crossTrack(reference = [], g = []) {
  if (reference.length < 2 || g.length < 1) return 0;
  const p = g[Math.floor(g.length / 2)];

  let best = null;
  for (let i = 1; i < reference.length; i++) {
    const a = reference[i - 1];
    const b = reference[i];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    if (!l2) continue;
    let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = a[0] + t * vx;
    const qy = a[1] + t * vy;
    const d = Math.hypot(p[0] - qx, p[1] - qy);
    if (best === null || d < best.d) {
      const len = Math.hypot(vx, vy);
      /* Positive to the left of the reference's direction of travel. */
      best = { d, side: ((p[0] - qx) * (vy / len) - (p[1] - qy) * (vx / len)) };
    }
  }
  return best ? -best.side : 0;
}

/* Where each member of a group sits, in pixels across the run.

   Spread about the true line rather than stacked to one side, so the
   pair straddles the trench it is in and neither is drawn as though it
   left. Ordered by colour index, so a cable keeps its side of the
   trench between sessions. */
export function offsetsFor(count, spacingPx = 5) {
  if (count < 2) return [0];
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => (i - mid) * spacingPx);
}

/* A polyline shifted sideways by a fixed number of pixels.

   The normal at each point is averaged from the segments either side,
   which keeps the shifted line parallel through a corner instead of
   pulling the vertex out to a spike.

   Screen points in, screen points out — nothing here goes near stored
   geometry. */
export function offsetPolyline(pts = [], offsetPx = 0) {
  if (!offsetPx || pts.length < 2) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!len) { out.push({ ...pts[i] }); continue; }
    dx /= len; dy /= len;
    /* Left normal. Which side is "left" depends on the direction the run
       was drawn, which is why alignSign exists. */
    out.push({ ...pts[i], x: pts[i].x - dy * offsetPx, y: pts[i].y + dx * offsetPx });
  }
  return out;
}

/* Whether a run was drawn the same way round as the group's reference.

   Two cables in one trench can be drawn in opposite directions, and
   their left normals then point at each other. Offsetting both by the
   same amount would lay one on top of the other — the very thing the
   offset exists to prevent. Comparing overall direction gives each run a
   sign, so the spread holds however they were drawn. */
export function alignSign(reference = [], other = [], opts = {}) {
  if (reference.length < 2 || other.length < 2) return 1;

  /* ── Compared where the runs are together ──

     This took the whole-polyline vector of each run and compared those.
     Two cables sharing a trench and then parting company \u2014 one carrying
     on south-east, the other turning south-west \u2014 have end-to-end
     vectors pointing away from each other, so a run drawn the SAME way
     along the shared stretch was called reversed. Its slot was then
     flipped onto its neighbour's and the two were drawn on precisely the
     same line: from project 2202.043, two mains 0.00 px apart with their
     dashes interleaving, which no amount of zoom separated.

     What matters is the direction each run has WHERE THEY ARE
     ALONGSIDE. So the reference is sampled along its length, each
     sample is matched to the nearest point of the other run, and only
     samples where the two are genuinely close \u2014 within the same
     tolerance the overlap test uses \u2014 are counted. The verdict is the
     sign of the summed agreement, so a long shared stretch outweighs a
     brief crossing, and one sample landing where the runs diverge
     cannot decide it alone. With no shared stretch at all there is
     nothing to align to, and the run keeps the direction it was drawn.
  */
  const { tolM = 2.0 } = opts;
  const tangentAt = (pts, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    return [b[0] - a[0], b[1] - a[1]];
  };
  let sum = 0;
  for (let i = 0; i < reference.length; i++) {
    const p = reference[i];
    let near = -1;
    let bestD = Infinity;
    for (let k = 0; k < other.length; k++) {
      const d = Math.hypot(other[k][0] - p[0], other[k][1] - p[1]);
      if (d < bestD) { bestD = d; near = k; }
    }
    if (near < 0 || bestD > tolM) continue;
    const rv = tangentAt(reference, i);
    const ov = tangentAt(other, near);
    const rl = Math.hypot(rv[0], rv[1]);
    const ol = Math.hypot(ov[0], ov[1]);
    if (!rl || !ol) continue;
    /* Unit vectors, so a long segment does not shout down a short one
       \u2014 what is being counted is agreement, not distance. */
    sum += (rv[0] * ov[0] + rv[1] * ov[1]) / (rl * ol);
  }
  if (!sum) return 1;
  return sum < 0 ? -1 : 1;
}

/* Everything the canvas needs, worked out once per frame.

   Returns a map from Feature_ID to { colour, offsetPx }. Features not in
   it are drawn exactly as before, so nothing that is not an LV feeder
   main is affected by any of this. */
/* Point to segment, for matching a meter to the run feeding it. */
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

export function feederRenderPlan(features = [], opts = {}) {
  const { spacingPx = 5, chosenColours = {}, ...groupOpts } = opts;

  /* Offsets are worked out over every electric run in a trench; colour
     only over the ones on a circuit. A run with no circuit gets a null
     colour and keeps whatever the style cascade gives it. */
  const runs = features.filter(isFeederRun).map((f) => ({
    id: Number(f.Feature_ID),
    geometry: f.Geometry || [],
    circuitId: circuitIdOf(f),
    feature: f,
  }));

  const byCircuit = circuitColours(features, chosenColours);

  /* ── An output's colour beats the circuit's ──

     A link box splits a circuit across fused outputs, and telling the
     outputs' runs apart is the point of colouring them. A cable
     belongs to an output two ways: the build stamps Link_Box_ID and
     Link_Way on the runs it lays from one, and a hand-drawn cable
     claims a way through Link_Connections in its own editor. Either
     way, the box's Way_Colours map answers \u2014 set per output in the
     box's editor \u2014 and a way with no colour set falls back to the
     circuit's, so an unpainted split looks exactly as it did. */
  /* ── Which output a run belongs to, live ──

     The build stamps Link_Box_ID and Link_Way on what it lays, but a
     colour must not wait for a rebuild: a circuit colour resolves at
     once because every run already carries its Circuit_ID, and an
     output's colour should behave the same. So membership is worked
     out from the drawing itself \u2014 walk the mains outward from the
     box, and every run on the path to an assigned meter belongs to
     that meter's output. A run on the way to two different outputs is
     shared and keeps the circuit's colour, which is the honest answer
     for a length of cable feeding both. */
  const liveWays = (() => {
    const boxes = features.filter((f) => f.Feature_Role === "linkbox"
      && f.Attributes?.Way_Colours
      && Object.keys(f.Attributes.Way_Colours).length);
    const empty = { ways: new Map(), boxOf: new Map() };
    if (!boxes.length) return empty;
    const mains = runs.filter((r) => r.geometry.length > 1);
    if (!mains.length) return empty;

    const key = (p) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
    const at = new Map();
    const touch = (k, r) => {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(r);
    };
    for (const r of mains) {
      touch(key(r.geometry[0]), r);
      touch(key(r.geometry[r.geometry.length - 1]), r);
    }

    const out = new Map();
    const boxOf = new Map();
    for (const box of boxes) {
      const bAt = box.Attributes?.Span_Anchor || box.Geometry?.[0];
      if (!bAt) continue;
      /* Breadth first from the box, remembering how each run was
         reached, so a meter's run gives back the whole path. */
      const start = key(bAt);
      const cameBy = new Map();          // runId -> previous runId | null
      const seen = new Set([start]);
      let edge = (at.get(start) || []).map((r) => ({ r, from: start }));
      for (const e of edge) cameBy.set(e.r.id, null);
      while (edge.length) {
        const next = [];
        for (const { r, from } of edge) {
          const a = key(r.geometry[0]);
          const b = key(r.geometry[r.geometry.length - 1]);
          const far = a === from ? b : a;
          if (seen.has(far)) continue;
          seen.add(far);
          for (const nr of at.get(far) || []) {
            if (cameBy.has(nr.id)) continue;
            cameBy.set(nr.id, r.id);
            next.push({ r: nr, from: far });
          }
        }
        edge = next;
      }

      const byId = new Map(mains.map((r) => [r.id, r]));
      const meters = features.filter((m) => m.Feature_Role === "meter"
        && Number(m.Attributes?.Link_Box_ID) === Number(box.Feature_ID)
        && m.Attributes?.Link_Way != null && (m.Geometry || []).length);
      for (const m of meters) {
        const way = Number(m.Attributes.Link_Way);
        /* The run nearest the meter is the one feeding it; the path
           back to the box is everything that carries its load.

           ── Except where the outputs share a trench ──

           Which is the ordinary case: a box's outputs leave through one
           dig, storing routes a few centimetres apart, and the
           separation on screen is display offset rather than geometry.
           So "nearest the meter" is a coin toss between them, and the
           meter then stamped ITS way onto whichever run won — output
           2's cable came back wearing output 3's colour, and the
           service tee'd into it read as being on the wrong feeder.

           Where the drawing already says which run belongs to this
           output, that answers: the build stamps Link_Box_ID and
           Link_Way on what it lays. Nearest is kept as the fallback,
           because it is the answer that exists on a drawing made before
           the stamps did, and it is right whenever the outputs are not
           on top of one another.

           Third instance of this fault \u2014 see cableSizes.pickMain and
           the joint-feeder pick in the move handler. Same shape every
           time: several features sharing a route, resolved by geometry
           alone. */
        const reachable = mains.filter((r) => cameBy.has(r.id));
        const stamped = reachable.filter((r) =>
          Number(r.feature?.Attributes?.Link_Way) === way
          && Number(r.feature?.Attributes?.Link_Box_ID) === Number(box.Feature_ID));
        const pool = stamped.length ? stamped : reachable;

        let best = null;
        for (const r of pool) {
          for (let i = 1; i < r.geometry.length; i++) {
            const d = segDist(m.Geometry[0], r.geometry[i - 1], r.geometry[i]);
            /* Ties on the lower id, so one drawing gives one answer
               however the rows came back from the database. */
            if (!best || d < best.d
              || (d === best.d && Number(r.id) < Number(best.id))) {
              best = { d, id: r.id };
            }
          }
        }
        if (!best) continue;
        for (let id = best.id; id != null; id = cameBy.get(id) ?? null) {
          const held = out.get(id);
          if (held === undefined) {
            out.set(id, way);
            boxOf.set(id, box);
          } else if (held !== way) {
            out.set(id, null);          // shared: keeps the circuit colour
          }
          if (!byId.has(id)) break;
        }
      }
    }
    return { ways: out, boxOf };
  })();

  const wayColourOf = (f) => {
    let boxId = f.Attributes?.Link_Box_ID ?? null;
    let way = f.Attributes?.Link_Way ?? null;
    if (boxId == null || way == null) {
      const lc = f.Attributes?.Link_Connections || {};
      for (const k of ["start", "end"]) {
        const c = lc[k];
        if (c && c.way !== "in" && c.box != null) { boxId = c.box; way = c.way; break; }
      }
    }
    if (boxId == null || way == null) return null;
    const box = features.find((x) => Number(x.Feature_ID) === Number(boxId)
      && x.Feature_Role === "linkbox");
    return box?.Attributes?.Way_Colours?.[way] ?? null;
  };

  const plan = new Map();
  /* Colour follows the circuit, so every section of one feeder carries
     the same colour from the substation to the far end \u2014 unless the
     run is an output's, which wears the output's own. A section with
     no circuit gets none and is left to the style cascade. */
  const liveColour = (r) => {
    const way = liveWays.ways?.get(r.id);
    if (way == null) return null;
    return liveWays.boxOf.get(r.id)?.Attributes?.Way_Colours?.[way] ?? null;
  };
  runs.forEach((r) => {
    plan.set(r.id, {
      colour: liveColour(r)
        ?? wayColourOf(r.feature)
        ?? (r.circuitId == null ? null : byCircuit.get(r.circuitId) ?? null),
      circuitId: r.circuitId,
      offsetPx: 0,
    });
  });

  for (const group of parallelGroups(runs, groupOpts)) {
    /* The longest run is the reference, being the one most likely to be
       the through route and the least likely to be a short spur drawn
       backwards. */
    const ref = group.reduce((a, b) =>
      (polylineLength(b.geometry) > polylineLength(a.geometry) ? b : a));

    /* Ordered by where each cable actually lies across the trench, not
       by colour or by id.

       Two cables already sitting 400 mm apart are spread further apart
       by this; ordering them any other way moves the left one right and
       draws them closer together than they started, which is what an
       earlier version of this did. Cross-track position is measured
       physically, so it also settles direction: a run drawn back to
       front has the same position as one drawn forwards. */
    const ordered = group
      .map((r) => ({ r, side: crossTrack(ref.geometry, r.geometry) }))
      .sort((a, b) => (a.side - b.side) || (a.r.id - b.r.id))
      .map((x) => x.r);

    const offsets = offsetsFor(ordered.length, spacingPx);
    ordered.forEach((r, i) => {
      /* Into the run's own frame. offsetPolyline works along the points
         as drawn, so a reversed run needs the sign flipped to end up on
         the side just chosen for it. */
      const sign = alignSign(ref.geometry, r.geometry);
      const cur = plan.get(r.id);
      plan.set(r.id, { ...cur, offsetPx: offsets[i] * sign });
    });
  }

  return plan;
}
