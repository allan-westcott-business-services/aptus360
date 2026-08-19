/* High Volume Top Tees on a gas main.

   Where a service pipe leaves the main, the connection is made with a
   top tee: a fitting clamped around the main with an outlet taking the
   service off it. Every gas service has one, so a drawing that shows
   the services and not the tees is short one fitting per plot on the
   take-off schedule.

   ── Where ──

   At the point the service meets the main. Not near it, not at the
   plot end: the tee is the join, and the join is one end of the service
   pipe sitting on the main's geometry.

   Which end is found rather than assumed. A service may have been drawn
   from the plot outwards as easily as towards it, and half a drawing
   done each way is ordinary — so both ends are tested against every gas
   main and the one that lands on a main is the connection.

   ── Which way round ──

   The body is clamped around the main, so it lies along the main; the
   outlet takes the service off, so the stem points down the service. On
   the drawing that means the bar follows the main's bearing at the
   point of connection, and the stem leaves at right angles on whichever
   side the service runs.

   Both are read from the geometry rather than fixed. A tee drawn along
   the service instead of the main reads as a fitting nobody could
   install, and one whose stem points into the road rather than at the
   plot is worse: it looks deliberate.

   ── Pure ──

   Features in, positions out. Nothing is created here; the canvas turns
   these into features and the backfill decides which are missing. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* How big, in metres of real ground.

   Metres rather than pixels because it is a thing in a hole with a
   size, and it should grow and shrink with everything else drawn to
   scale — the same reason the service valve's bar is a metre of ground
   rather than a fixed number of pixels.

   The proportions are taken from the drawing rather than from a
   catalogue. Change them here and every tee on every drawing follows,
   because nothing stores its own size. */
export const HVTT_ALONG_M = 1.1;    // the body, along the main
export const HVTT_BODY_M = 0.45;    // how thick that body is
export const HVTT_STEM_M = 0.55;    // the outlet, out from the main
export const HVTT_STEM_W_M = 0.4;   // how wide the outlet is

/* How close an end has to be to a main to count as joined to it.

   The same 0.25 m the drawing treats as connected everywhere else. A
   service that stops a metre short of the main has not been drawn onto
   it, and inventing a tee there would put a fitting where there is no
   join. */
export const HVTT_JOIN_M = 0.25;

function nearestOnSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return { q: [a[0], a[1]], d: dist(p, a), dir: [1, 0] };

  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * vx, a[1] + t * vy];
  const len = Math.sqrt(len2);
  return { q, d: dist(p, q), dir: [vx / len, vy / len] };
}

/* The closest point on a polyline, and which way it runs there. */
function nearestOnLine(p, geom) {
  let best = null;
  for (let i = 1; i < geom.length; i++) {
    const r = nearestOnSegment(p, geom[i - 1], geom[i]);
    if (!best || r.d < best.d) best = r;
  }
  return best;
}

const typeKey = (f) => String(f?.Attributes?.Line_Type ?? "");

/* Gas mains, by the layer the type belongs to rather than the spelling
   of the key — the same test the gas builder uses, so the two cannot
   disagree about what a main is. Trenches are not pipe. */
export function gasMains(features = [], lineTypes = []) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    const key = typeKey(f);
    if (/service/i.test(key)) return false;
    const t = lineTypes.find((x) => x.Type_Key === key);
    const layer = t?.Layer_Key ?? f.Layer_Key;
    if (layer !== "gas") return false;
    return !/^trench/.test(key);
  });
}

export function gasServices(features = [], lineTypes = []) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    const key = typeKey(f);
    if (!/service/i.test(key)) return false;
    if (/^trench/.test(key)) return false;
    const t = lineTypes.find((x) => x.Type_Key === key);
    return (t?.Layer_Key ?? f.Layer_Key) === "gas";
  });
}

/* Where every top tee belongs.

   One per service that reaches a main. A service drawn to nothing gets
   none rather than one guessed at the nearest pipe — an unconnected
   service is a fault worth seeing, and a tee invented on it would hide
   it. */
export function topTees(features = [], opts = {}) {
  const { lineTypes = [], joinM = HVTT_JOIN_M } = opts;

  const mains = gasMains(features, lineTypes);
  const services = gasServices(features, lineTypes);
  if (!mains.length || !services.length) return { tees: [], unjoined: [] };

  const tees = [];
  const unjoined = [];

  for (const svc of services) {
    const g = svc.Geometry;
    const ends = [
      { at: g[0], away: g[1] },
      { at: g[g.length - 1], away: g[g.length - 2] },
    ];

    let best = null;
    for (const end of ends) {
      for (const main of mains) {
        const r = nearestOnLine(end.at, main.Geometry);
        if (!r || r.d > joinM) continue;
        if (!best || r.d < best.d) best = { ...r, end, main };
      }
    }

    if (!best) { unjoined.push(svc.Feature_ID); continue; }

    /* Square to the main, on the side the service runs.

       Taken from the service's own next vertex rather than from its far
       end: a service that turns after a metre still leaves the main in
       one direction, and that direction is the one the outlet faces. */
    const ax = best.end.away[0] - best.q[0];
    const ay = best.end.away[1] - best.q[1];
    const nx = -best.dir[1];
    const ny = best.dir[0];
    const side = (ax * nx + ay * ny) >= 0 ? 1 : -1;

    tees.push({
      at: best.q,
      dir: best.dir,
      stem: [nx * side, ny * side],
      service: svc.Feature_ID,
      main: best.main.Feature_ID,
      plot: svc.Plot_ID ?? null,
      seed: svc.Attributes?.Seed_Feature_ID ?? null,
    });
  }

  return { tees, unjoined };
}

/* Which of those are not on the drawing yet.

   Matched on position, because that is what a tee is: the join it sits
   on. A fitting somebody dragged half a metre is still that join's
   fitting, and replacing it would undo their nudge — while one left on
   a service since deleted is not matched by anything and is reported
   rather than removed. */
export function missingTees(features = [], tees = [], nearM = HVTT_JOIN_M * 4) {
  const placed = features.filter((f) => f.Feature_Role === "hvtt"
    && (f.Geometry || []).length);

  const missing = tees.filter((t) =>
    !placed.some((f) => dist(f.Geometry[0], t.at) <= nearM));

  const orphans = placed.filter((f) =>
    !tees.some((t) => dist(f.Geometry[0], t.at) <= nearM));

  return { missing, orphans };
}

/* The angle the body lies at, for the drawing to rotate to.

   Degrees, rounded to a tenth. Stored on the feature so the symbol does
   not have to find its main again every frame — and so a tee stays
   pointing the right way if the main it came off is later deleted. */
export function angleOf(dir) {
  return Math.round((Math.atan2(dir[1], dir[0]) * 180) / Math.PI * 10) / 10;
}
