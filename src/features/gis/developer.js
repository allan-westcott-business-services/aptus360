/* Developer areas.

   A project can have several developers on it, each taking a part of the
   site. An area is a polygon drawn inside the site boundary saying which
   part is whose, and everything in it belongs to that developer.

   Stored on the feature rather than worked out from position each time.
   The bill groups by developer and the bill is SQL, where point-in-
   polygon over jsonb geometry is a great deal of plpgsql to get wrong;
   and a stored value can be overridden by hand where an area gets one
   feature wrong. The cost is that it goes stale when an area moves,
   which is why planning the change is separate from applying it and why
   the canvas says when an area has moved since.

   Areas live on the boundary layer and are told apart from the site
   boundary by carrying a developer. That distinction matters in both
   directions: an area must not be read as the red line, or a trench
   inside one developer's patch would be classified as on-site by virtue
   of the wrong polygon. */

import { splitByBoundary, pointInPolygon, midpointOf } from "./boundary.js";

/* Shared infrastructure belongs to the project, not to whoever's patch
   it happens to stand in.

   A substation sits somewhere, and that somewhere is inside one
   developer's area — but it feeds the whole site, and putting its cost
   on one party's bill because of where it was sited would be wrong. The
   same is true of the point of connection and of the incomer running
   between them.

   Everything else follows position, including mains trenches: a mains
   trench genuinely does run through a developer's area and genuinely is
   part of that area's cost, and where it crosses into another it is cut
   at the line, exactly as the site boundary already cuts it. */
export const isSharedInfrastructure = (f) => {
  if (f.Feature_Role === "substation" || f.Feature_Role === "poc") return true;
  /* The incomer from the POC to the substation joins two things that
     belong to everyone, so it belongs to everyone too. */
  if (f.Attributes?.Poc_Route === true) return true;
  return false;
};

export const isDeveloperArea = (f) =>
  f?.Layer_Key === "boundary"
  && f?.Feature_Type === "polygon"
  && f?.Attributes?.Project_Developer_ID != null;

/* The areas on a drawing, each with the developer it speaks for. */
export function developerAreas(features = []) {
  return features
    .filter((f) => isDeveloperArea(f) && (f.Geometry || []).length >= 3)
    .map((f) => ({
      feature: f,
      id: Number(f.Attributes.Project_Developer_ID),
      geometry: f.Geometry,
    }));
}

/* Which developer's area a point falls in, if any.

   First match wins. Overlapping areas are a drawing mistake rather than
   a case to resolve — two developers cannot both own the same ground —
   and reporting the overlap is more use than silently picking one, which
   the caller does with `overlaps` below. */
export function developerAt(point, areas = []) {
  for (const a of areas) if (pointInPolygon(point, a.geometry)) return a.id;
  return null;
}

/* Areas that overlap each other, by sampling one another's vertices.
   Approximate on purpose: it exists to warn, not to compute geometry. */
export function overlappingAreas(areas = []) {
  const hits = [];
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i];
      const b = areas[j];
      const touch = a.geometry.some((p) => pointInPolygon(p, b.geometry))
        || b.geometry.some((p) => pointInPolygon(p, a.geometry));
      if (touch) hits.push([a, b]);
    }
  }
  return hits;
}

/* What assigning by area would do, without doing any of it.

   Three outcomes per feature:

     label  — all of it is in one area, so it takes that developer
     split  — it crosses an area's edge, so it becomes several runs, each
              with the developer whose ground it is on
     clear  — it was assigned and is now in nobody's area

   Splitting is the same treatment the site boundary already gives a
   trench that crosses it, and for the same reason: one row cannot be two
   developers' cost. It is also a permanent change to the drawing, which
   is why this returns a plan for someone to agree to rather than writing
   anything. */
export function planDeveloperAssignment(features = [], opts = {}) {
  const { minRunM = 0.05, includeAssigned = true } = opts;

  const areas = developerAreas(features);
  if (!areas.length) {
    return { error: "No developer areas drawn yet — there is nothing to assign against." };
  }

  const polys = areas.map((a) => a.geometry);
  const label = [];
  const split = [];
  const clear = [];
  let shared = 0;
  let untouched = 0;

  for (const f of features) {
    /* An area is not inside itself, and the site boundary is the line
       between things rather than a thing. Notes are annotation. */
    if (f.Layer_Key === "boundary" || f.Layer_Key === "note") continue;
    if (isSharedInfrastructure(f)) { shared += 1; continue; }

    const g = f.Geometry || [];
    if (!g.length) continue;

    const was = f.Attributes?.Project_Developer_ID ?? null;

    if (f.Feature_Type === "point") {
      const now = developerAt(g[0], areas);
      if (now == null && was != null) clear.push({ feature: f, was });
      else if (now != null && String(now) !== String(was)) label.push({ feature: f, was, developerId: now });
      else untouched += 1;
      continue;
    }

    if (f.Feature_Type === "polygon") {
      /* Judged from a vertex rather than cut: an area is a statement
         about ground, and cutting a shape in half would change what it
         is a statement about. */
      const now = developerAt(midpointOf(g), areas) ?? developerAt(g[0], areas);
      if (now == null && was != null) clear.push({ feature: f, was });
      else if (now != null && String(now) !== String(was)) label.push({ feature: f, was, developerId: now });
      else untouched += 1;
      continue;
    }

    /* Lines. splitByBoundary puts a cut at every crossing of any area,
       treating them as one region; which developer each run belongs to
       is then decided from the run itself. Its own `site` answer is
       ignored — that is the on-site question, not this one. */
    const runs = splitByBoundary(g, polys, minRunM)
      .map((r) => ({ geometry: r.geometry, developerId: developerAt(midpointOf(r.geometry), areas) }));

    const ids = [...new Set(runs.map((r) => String(r.developerId)))];

    if (runs.length === 1 || ids.length === 1) {
      const now = runs[0].developerId;
      if (now == null && was != null) clear.push({ feature: f, was });
      else if (now != null && String(now) !== String(was)) label.push({ feature: f, was, developerId: now });
      else untouched += 1;
      continue;
    }

    if (!includeAssigned && was != null) { untouched += 1; continue; }
    split.push({ feature: f, was, runs });
  }

  return {
    areas,
    overlaps: overlappingAreas(areas),
    label,
    split,
    clear,
    shared,
    untouched,
  };
}

/* Whether the areas have moved since the features were assigned.

   A stored assignment is only as good as the last time it was worked
   out, and an area dragged afterwards leaves every feature in it
   claiming a developer it may no longer be under. Cheap enough to run on
   every render: it compares what each feature says against what its
   position says, and stops at the first disagreement. */
export function assignmentStale(features = []) {
  const areas = developerAreas(features);
  if (!areas.length) return false;

  for (const f of features) {
    if (f.Layer_Key === "boundary" || f.Layer_Key === "note") continue;
    if (isSharedInfrastructure(f)) continue;
    const g = f.Geometry || [];
    if (!g.length) continue;

    const was = f.Attributes?.Project_Developer_ID ?? null;
    if (was == null) continue;

    const point = f.Feature_Type === "point" ? g[0] : midpointOf(g);
    const now = developerAt(point, areas);
    if (now == null || String(now) !== String(was)) return true;
  }
  return false;
}
