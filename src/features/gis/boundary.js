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

   Unclassified counts as on site here. With no boundary drawn there is
   no off site to be in — you are drawing on the site plan — so Unmade is
   the right default for the surface. Site itself stays null, because
   that is a claim about consent and cost that shouldn't be guessed;
   surface is a starting point that takes two clicks to correct. The two
   deserve different treatment.

   An empty list means the surface types haven't loaded, not that Unmade
   was deleted. Only a list that has loaded and doesn't contain it counts
   as deliberate removal — otherwise a stale endpoint that returns no
   surface types turns this off with no sign that it has. */
export const ON_SITE_SURFACE = "unmade";

export function surfaceFor(site, chosen, available = []) {
  const onSite = site === ON_SITE || site == null;
  const haveUnmade = !available.length
    || available.some((s) => s.Surface_Key === ON_SITE_SURFACE);
  if (onSite && haveUnmade) return ON_SITE_SURFACE;
  return chosen || null;
}

/* The polygons that make up the site boundary. More than one is allowed
   — a site split by an existing road is still one project. */
export function boundaryPolygons(features = []) {
  return features
    .filter((f) => f.Layer_Key === "boundary"
      && f.Feature_Type === "polygon"
      && (f.Geometry || []).length >= 3
      /* A developer area is drawn on this layer too, and is not the red
         line. Counting one as a site boundary would classify everything
         inside one developer's patch as on-site by virtue of the wrong
         polygon — and everything outside it, on a site with one area
         drawn, as off-site. */
      && f.Attributes?.Project_Developer_ID == null)
    .map((f) => f.Geometry);
}


/* ── Classifying what is already drawn ──
   Everything drawn before a boundary existed carries no Site, so it has
   no reinstatement basis and sits under "Unclassified" on the bill.

   Working out what to do is separate from doing it, because the answer
   includes splitting features — a trench crossing the boundary is partly
   on site and partly off, and one row cannot be both. Splitting changes
   what is on the drawing, so it is worth seeing the shape of the change
   before agreeing to it. */
export function planClassification(features = [], opts = {}) {
  const { polygons = [], surfaceTypes = [], includeClassified = false,
          isTrench = () => false } = opts;

  if (!polygons.length) {
    return { error: "No site boundary drawn yet \u2014 there is nothing to classify against." };
  }

  const label = [];   // one Site value, no geometry change
  const split = [];   // crosses the boundary, becomes several runs
  let skipped = 0;

  for (const f of features) {
    /* The boundary itself is not on or off site; it is the line between.
       Notes are annotation and carry no quantity. */
    if (f.Layer_Key === "boundary" || f.Layer_Key === "note") continue;
    if (!includeClassified && f.Attributes?.Site) { skipped += 1; continue; }

    const g = f.Geometry || [];
    if (!g.length) continue;

    if (f.Feature_Type === "point") {
      const site = pointInAny(g[0], polygons) ? ON_SITE : OFF_SITE;
      if (site !== f.Attributes?.Site) label.push({ feature: f, site });
      continue;
    }

    if (f.Feature_Type !== "line") continue;

    const runs = splitByBoundary(g, polygons);
    if (runs.length <= 1) {
      const site = runs[0]?.site ?? (pointInAny(g[0], polygons) ? ON_SITE : OFF_SITE);
      if (site !== f.Attributes?.Site) {
        label.push({
          feature: f, site,
          /* An on-site trench is Unmade by rule; off-site keeps whatever
             surface it already had, because that was a choice someone
             made and this routine has no better information. */
          surface: isTrench(f)
            ? surfaceFor(site, f.Attributes?.Surface_Type, surfaceTypes)
            : undefined,
        });
      }
      continue;
    }

    split.push({
      feature: f,
      runs: runs.map((r) => ({
        ...r,
        surface: isTrench(f)
          ? surfaceFor(r.site, f.Attributes?.Surface_Type, surfaceTypes)
          : undefined,
      })),
    });
  }

  return {
    label, split, skipped,
    total: label.length + split.length,
    newFeatures: split.reduce((t, s2) => t + s2.runs.length - 1, 0),
  };
}
