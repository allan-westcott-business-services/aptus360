/* Cutting a trench at its span nodes.

   ── Why a trench has to be cut at all ──

   A span node marks a point the network is measured between: a
   junction, an end, or the plant. Placing one drew a marker and left
   the trench alone, so a length drawn as one continuous line past three
   junctions stayed one feature — and everything else in the application
   that asks a question about "a trench" got the wrong answer for it.

   The clearest symptom was in the sizing. Nothing joins a trench part
   way along its length, so what is laid in one is laid the whole way
   along it — and the width follows from that. But a line running past
   three junctions is not one length of dig; it is three, each carrying
   something different. Asking what was in it returned everything in all
   three, and a trench with one gas, one water and one LV came back
   listing five things because two of them belonged to the sections
   either side.

   stretchAt exists because of this: it works out, at read time, which
   piece of a long trench somebody is pointing at. That was the right
   thing to do while the trench was one feature. Once the sections are
   real, the question answers itself.

   ── What a cut costs ──

   A section is a row, so cutting one trench into three replaces one row
   with three. Anything holding the old id has to be told, which is why
   this returns the pieces rather than writing them: the caller creates
   them, deletes the original and recomputes what is joined to what,
   because Connects is derived from geometry and the pieces sit at new
   ends.

   ── Everything on it comes with it ──

   The attributes are copied whole rather than named one by one.

   A named list is the obvious way and it is the wrong way here. It is
   right until somebody adds an attribute and does not think of this
   file — and then a build status, an easement, or a note is dropped
   silently from every trench on every drawing the next time anybody
   places span nodes. Copying everything and naming only the exception
   fails safe: a new attribute carries across without this knowing what
   it is.

   Connects is the exception, and it is excluded rather than copied
   because it is a fact about where a feature's ends are. Each piece has
   different ends from the line it came from, so the old list is wrong
   for all of them. The caller recomputes it. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Where a point falls on a line: how far along, and how far off.

   Returned together because both are needed and the second decides
   whether the first means anything — a node fifty metres away has a
   nearest point on this trench like any other, and it is not on it. */
function projectOnto(p, g = []) {
  let run = 0;
  let best = { m: 0, d: Infinity };
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const segLen = Math.sqrt(len2);
    if (len2) {
      let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
      u = Math.max(0, Math.min(1, u));
      const d = dist(p, [a[0] + vx * u, a[1] + vy * u]);
      if (d < best.d) best = { m: run + segLen * u, d };
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

/* The polyline between two distances along a line.

   The vertices between the two cuts, with the cut points themselves at
   each end. Kept as vertices rather than resampled, so a section of a
   trench that bends is the same shape it was drawn as — a cut is a cut,
   not a redraw. */
function sliceBetween(g, fromM, toM) {
  const out = [];
  let run = 0;

  const at = (m) => {
    let r = 0;
    for (let i = 0; i + 1 < g.length; i++) {
      const segLen = dist(g[i], g[i + 1]);
      if (m <= r + segLen || i + 2 === g.length) {
        const u = segLen ? Math.max(0, Math.min(1, (m - r) / segLen)) : 0;
        return [
          g[i][0] + (g[i + 1][0] - g[i][0]) * u,
          g[i][1] + (g[i + 1][1] - g[i][1]) * u,
        ];
      }
      r += segLen;
    }
    return g[g.length - 1];
  };

  out.push(at(fromM));
  for (let i = 0; i + 1 < g.length; i++) {
    run += dist(g[i], g[i + 1]);
    if (run > fromM && run < toM) out.push(g[i + 1]);
  }
  out.push(at(toM));
  return out;
}

/* How this trench should be cut, if at all.

   `points` are where the span nodes belong — their anchors, not where
   the markers were dragged to be readable.

   A node at either end is not a cut. That is the ordinary case and the
   reason a second run does nothing: once a trench has been split, every
   node on it is at an end of a piece, so there is nothing interior left
   to cut and the drawing stops changing.

   `minPieceM` keeps a node that sits a few centimetres off an end from
   producing a stub nobody drew. Half a metre, which is well inside the
   quarter-metre tolerance junctions are found at and well below
   anything somebody would call a length of trench. */
export function planTrenchSplit(trench, points = [], opts = {}) {
  const { onM = 0.5, minPieceM = 0.5 } = opts;
  const g = trench?.Geometry || [];
  if (g.length < 2) return null;

  const total = lengthOf(g);
  if (!(total > 0)) return null;

  const cuts = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const { m, d } = projectOnto(p, g);
    /* On this trench, and not at either end of it. */
    if (d > onM) continue;
    if (m < minPieceM || m > total - minPieceM) continue;
    if (cuts.some((x) => Math.abs(x - m) < minPieceM)) continue;
    cuts.push(m);
  }
  if (!cuts.length) return null;

  cuts.sort((a, b) => a - b);
  const bounds = [0, ...cuts, total];

  /* Connects excluded: each piece has different ends from the line it
     came from, so the old list is wrong for every one of them. */
  const { Connects, ...carried } = trench.Attributes ?? {};

  const pieces = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    pieces.push({
      Layer_Key: trench.Layer_Key,
      Feature_Type: "line",
      Feature_Role: trench.Feature_Role ?? null,
      Plot_ID: trench.Plot_ID ?? null,
      Label: trench.Label ?? null,
      Geometry: sliceBetween(g, bounds[i], bounds[i + 1]),
      Attributes: { ...carried, Connects: [] },
      /* For the caller's reporting, not for the row. */
      lengthM: Math.round((bounds[i + 1] - bounds[i]) * 10) / 10,
    });
  }

  return { trench, cuts: cuts.length, pieces };
}

/* Every trench that needs cutting, and into what.

   Trenches with no node in their interior are absent rather than
   present with one piece: the caller writes what comes back, and a
   trench replaced by an identical copy of itself is a new row id for no
   reason — which would break every Connects pointing at it and churn
   the drawing on every run. */
export function planTrenchSplits(trenches = [], points = [], opts = {}) {
  const out = [];
  for (const t of trenches) {
    const plan = planTrenchSplit(t, points, opts);
    if (plan) out.push(plan);
  }
  return {
    splits: out,
    trenches: out.length,
    pieces: out.reduce((n, x) => n + x.pieces.length, 0),
  };
}
