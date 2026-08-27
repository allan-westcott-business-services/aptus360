/* What size cable arrives at a joint, and what size leaves it.

   The jointing form asks for a cable size in and a cable size out at
   every joint. Both are already on the drawing — a plot knows the LV
   feeder that supplies it and the service that runs to its meter — so
   asking a gang to type them is asking them to read a drawing they are
   not holding and copy two numbers nobody can check afterwards.

   ── In and out, from the joint's point of view ──

   In is what feeds it: the LV main. Out is what leaves towards the
   load: the service. That is the same sentence at a service joint and
   at a breech joint, which is why one function answers for both.

   At a breech joint the main runs through and a service is taken off
   it, so in is the main's size and out is the service's. At a service
   joint the service is the thing being terminated, so out is that
   service and in is the main it comes off.

   ── Read, never guessed ──

   Where the drawing does not say, this returns null rather than a
   plausible default. A wrong size on a jointing sheet is worse than a
   blank one: blank gets asked about, and 185mm printed against a 95mm
   main gets jointed. */

const SIZE_KEYS = ["Size", "Cable_Size", "Size_Label"];

/* The size written on a run, whatever the drawing called the field. */
export function sizeOf(feature) {
  const a = feature?.Attributes || {};
  for (const k of SIZE_KEYS) {
    const v = a[k] ?? feature?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

const isElectricLine = (f) =>
  f?.Feature_Type === "line" && String(f?.Layer_Key || "") === "electric";

/* A service run, by what the drawing calls it.

   The same test electric.js uses — a substring match on Line_Type
   rather than a list of exact names, so a run drawn as elec_service,
   service_lv or "Service (3ph)" all read as services. Anything
   electric that is not a service is treated as main. */
export const isServiceLine = (f) =>
  isElectricLine(f) && /service/i.test(String(f?.Attributes?.Line_Type ?? ""));

export const isMainLine = (f) => isElectricLine(f) && !isServiceLine(f);

const near = (a, b, tol) =>
  a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/* Whether a run touches a point, at either end or anywhere along it.

   Ends first and cheaply. A service leaves a main part way along a run
   rather than at its end, so a test that only looked at endpoints would
   find the main at a breech joint about half the time. */
function touches(feature, at, tol) {
  const g = feature?.Geometry;
  if (!Array.isArray(g) || g.length < 2 || !at) return false;
  if (near(g[0], at, tol) || near(g[g.length - 1], at, tol)) return true;

  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1];
    const [bx, by] = g[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (!len2) continue;
    /* Clamped, so a point beyond the segment measures to its end rather
       than to the infinite line through it. */
    let t = ((at[0] - ax) * dx + (at[1] - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    if (near([ax + t * dx, ay + t * dy], at, tol)) return true;
  }
  return false;
}

/* The sizes at a point on the drawing.

   `tol` is generous by drawing standards — a quarter of a metre is the
   snap the canvas already uses, and a joint symbol placed by hand sits
   within that of the runs it joins. */
export function sizesAt(features = [], at = null, tol = 0.35) {
  if (!at) return { in: null, out: null };

  let main = null;
  let service = null;
  for (const f of features) {
    if (!isElectricLine(f) || !touches(f, at, tol)) continue;
    if (isServiceLine(f)) { service = service ?? sizeOf(f); }
    else { main = main ?? sizeOf(f); }
  }
  return { in: main, out: service };
}

/* The sizes for a plot's service joint.

   Out is the plot's own service, found by the Plot_ID stamped on it
   where Auto Lay Service Cable put one there. In is the main that service
   comes off, found at the service's far end — the end away from the
   meter, which is where it meets the main.

   Falls back to geometry only where the drawing carries no Plot_ID,
   which is the same concession electric.js makes for drawings made
   before services were numbered. */
export function sizesForPlot(features = [], plotId = null) {
  if (plotId == null) return { in: null, out: null };
  const want = Number(plotId);

  const service = features.find((f) => isServiceLine(f)
    && Number(f.Plot_ID ?? f.Attributes?.Plot_ID) === want);
  if (!service) return { in: null, out: null };

  const out = sizeOf(service);
  const g = service.Geometry || [];

  /* Both ends tried. Which end of a service is drawn first is not a
     convention anybody has kept, so picking one and trusting it would
     be right about half the time. The end that meets a main is the end
     that answers. */
  for (const end of [g[0], g[g.length - 1]]) {
    const main = features.find((f) => isMainLine(f) && touches(f, end, 0.35));
    if (main) return { in: sizeOf(main), out };
  }
  return { in: null, out };
}

/* Every joint's sizes, keyed the way the field form keys them.

   Built when the call-off is raised, where the features are, and
   carried on GIS_Data — the tablet has the drawing as a picture and
   cannot compute this for itself. */
export function cableSizes(features = [], breech = null, plotIds = []) {
  const out = {};

  for (const id of plotIds) {
    if (id == null) continue;
    out[`plot:${id}`] = sizesForPlot(features, id);
  }

  for (const j of breech?.joints || []) {
    const key = `breech:${j?.featureId ?? j?.node ?? "unknown"}`;
    out[key] = sizesAt(features, j?.at);
  }
  return out;
}
