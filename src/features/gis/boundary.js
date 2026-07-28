/* On site or off it.

   A run that leaves the boundary is two different things commercially —
   what happens inside the red line is the developer's, what happens
   outside needs a street works notice, a reinstatement and somebody
   else's permission. So a line that crosses is stored as two features,
   not one with a note on it: they have different lengths, different
   costs and different consents, and a single row can only carry one of
   each.

   All of this is metres in site space, the same coordinates the geometry
   is stored in, so nothing here depends on zoom. */

export const ON_SITE = "On-site";
export const OFF_SITE = "Off-site";

/* Ray casting. Counts crossings of a ray heading east from the point;
   odd means inside. The `(yi > y) !== (yj > y)` test counts a vertex
   lying exactly on the ray once rather than twice, which is what stops
   a point level with a corner being called inside and outside at once. */
export function pointInPolygon(pt, poly) {
  if (!poly || poly.length < 3) return false;
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export const pointInAny = (pt, polys = []) => polys.some((p) => pointInPolygon(pt, p));

/* Where two segments cross, as a fraction along the first.

   Parallel and collinear segments return nothing: there is no single
   crossing point to split at, and treating a line that runs along the
   boundary as a crossing would cut it into slivers. */
function crossAt(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Split a line wherever it crosses any boundary polygon.

   Returns one run per side of every crossing, in order, each tagged with
   the side it falls on. A line that never crosses comes back as a single
   run — still classified, because "all of it is off site" is an answer
   worth recording.

   With no boundary drawn yet, site is null rather than a guess. Calling
   everything on-site because nobody has drawn the red line would put the
   wrong number in a quote. */
export function splitByBoundary(geometry, polygons = [], minRunM = 0.05) {
  const line = (geometry || []).filter(Boolean);
  if (line.length < 2) return [{ geometry: line, site: null }];
  if (!polygons.length) return [{ geometry: line, site: null }];

  // Walk the line, inserting every crossing point in order
  const pts = [line[0]];
  const cuts = [];                       // indices in pts that are crossings
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ts = [];
    for (const poly of polygons) {
      for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
        const t = crossAt(a, b, poly[k], poly[j]);
        if (t !== null) ts.push(t);
      }
    }
    /* Two polygon edges meeting at a corner both report the same
       crossing. Collapsing near-equal parameters keeps that one cut
       rather than a zero-length run between two copies of it. */
    ts.sort((p, q) => p - q);
    let last = -1;
    for (const t of ts) {
      if (t - last < 1e-9) continue;
      last = t;
      const p = lerp(a, b, t);
      if (dist(p, pts[pts.length - 1]) > 1e-9) {
        pts.push(p);
        cuts.push(pts.length - 1);
      }
    }
    if (dist(b, pts[pts.length - 1]) > 1e-9) pts.push(b);
    else if (cuts[cuts.length - 1] === pts.length - 1) {
      // b coincides with a crossing: keep the cut, don't duplicate b
    }
  }

  // Cut into runs; the crossing point ends one run and starts the next
  const bounds = [0, ...cuts.filter((c) => c > 0 && c < pts.length - 1), pts.length - 1];
  const runs = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const run = pts.slice(bounds[i], bounds[i + 1] + 1);
    if (run.length < 2) continue;
    if (run.reduce((t, p, k) => (k ? t + dist(run[k - 1], p) : 0), 0) < minRunM) continue;
    runs.push(run);
  }
  if (!runs.length) return [{ geometry: line, site: null }];

  /* Which side a run is on is decided from a point along it rather than
     an endpoint, because every endpoint of a split run sits exactly on
     the boundary, where inside and outside are both defensible. */
  return runs.map((run) => ({ geometry: run, site: sideOf(run, polygons) }));
}

function sideOf(run, polygons) {
  const mid = midpointOf(run);
  return pointInAny(mid, polygons) ? ON_SITE : OFF_SITE;
}

/* Halfway along by distance, not the middle vertex — a run whose points
   bunch at one end would otherwise be judged from near its start. */
export function midpointOf(run) {
  let total = 0;
  for (let i = 1; i < run.length; i++) total += dist(run[i - 1], run[i]);
  if (!total) return run[0];
  let want = total / 2;
  for (let i = 1; i < run.length; i++) {
    const d = dist(run[i - 1], run[i]);
    if (want <= d) return lerp(run[i - 1], run[i], d ? want / d : 0);
    want -= d;
  }
  return run[run.length - 1];
}

/* What a trench is dug through, given which side of the boundary it
   fell on.

   On site is unmade ground: a building site has no formal surface yet,
   and there is nothing to reinstate. Off site is whatever was chosen
   when drawing, because that is a decision about the highway that only
   the person drawing it can make.

   This matters because one drawn trench becomes two features when it
   crosses. Applying a single chosen surface to both halves would put a
   footway reinstatement on the length inside the red line, where no
   footway exists.

   Guarded on the surface types actually loaded, so removing Unmade in
   Admin stops this writing a key that no longer resolves. */
export const ON_SITE_SURFACE = "unmade";

export function surfaceFor(site, chosen, available = []) {
  if (site === ON_SITE && available.some((s) => s.Surface_Key === ON_SITE_SURFACE)) {
    return ON_SITE_SURFACE;
  }
  return chosen || null;
}

/* The polygons that make up the site boundary. More than one is allowed
   — a site split by an existing road is still one project. */
export function boundaryPolygons(features = []) {
  return features
    .filter((f) => f.Layer_Key === "boundary"
      && f.Feature_Type === "polygon"
      && (f.Geometry || []).length >= 3)
    .map((f) => f.Geometry);
}
