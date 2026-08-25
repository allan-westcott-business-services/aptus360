/* The as-laid drawing as geometry, not as a picture of geometry.

   ── Why ──

   The jointing sketch is drawn over the design, and a gang zooms in to
   mark where a joint actually sits. Until now the backdrop was a PNG:
   rendered once at 1400×900 when the call-off was raised, then scaled
   up on the tablet. Two zoom steps in, the cable is a staircase and the
   site plan — a vector line drawing in the original PDF — is a smear.

   Nothing is gained by flattening it. The design IS vectors: lines with
   a size, squares for plots, markers for joints. Sent as coordinates it
   draws crisp at any zoom, and it is smaller than the PNG it replaces.

   The site plan is a page of a PDF, and pdf.js is already in the
   application. Given the file and the calibration, the tablet can
   render the page itself at whatever zoom the gang is at — which is
   what the GIS canvas has always done on screen. So neither half has to
   be rasterised in advance, and the PNG stops being the thing anybody
   looks at.

   ── What this is not ──

   Not a replacement for asLaidImage. That still runs and still stores
   its PNG: it is what the office prints, what an older tablet falls
   back to, and what every call-off raised before this has. This is the
   payload beside it. */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/* Every point of a geometry, whatever shape it is. */
const pointsOf = (f) => (Array.isArray(f?.Geometry) ? f.Geometry : [])
  .filter((p) => Array.isArray(p) && p.length >= 2)
  .map((p) => [Number(p[0]), Number(p[1])]);

/* The extent of everything, padded.

   The same padding the picture used, so a design that filled the PNG
   fills this and a gang sees the same framing they are used to. */
export function vectorBounds(items = [], padM = 6) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const it of items) {
    for (const [x, y] of it.pts || []) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;

  return {
    minX: minX - padM, minY: minY - padM,
    maxX: maxX + padM, maxY: maxY + padM,
  };
}

/* The design, as things that can be drawn.

   Three kinds, because three are what the picture drew: the cable runs,
   the plot seeds with their numbers, and the joints. A kind this does
   not know about is left out rather than guessed at — a square drawn
   where a governor belongs is worse than nothing there. */
export function asLaidVector(features = [], { colour = null, plotNumberOf = null } = {}) {
  const items = [];

  for (const f of features) {
    const layer = String(f?.Layer_Key || "");
    if (layer !== "electric" && f?.Feature_Role !== "plot") continue;

    const pts = pointsOf(f);
    if (!pts.length) continue;

    if (f.Feature_Role === "plot") {
      const n = plotNumberOf ? plotNumberOf(f.Feature_ID ?? f.Plot_ID) : null;
      items.push({ kind: "plot", pts: [pts[0]], label: n == null ? null : String(n) });
      continue;
    }
    if (f.Feature_Role === "joint") {
      items.push({ kind: "joint", pts: [pts[0]] });
      continue;
    }
    if (f.Feature_Type === "line") {
      /* The size travels with the run. A 185 main and a 25 service are
         drawn at different weights on the canvas, and a backdrop that
         drew them alike would lose which is which at the one moment a
         gang is deciding what they are jointing into. */
      items.push({
        kind: "cable",
        pts,
        size: f.Attributes?.Size ?? null,
        service: /service/i.test(String(f.Attributes?.Line_Type ?? "")),
        colour: f.Colour ?? colour ?? null,
      });
    }
  }

  const bounds = vectorBounds(items);
  if (!bounds || !items.length) return null;
  return { v: 1, bounds, items };
}

/* What the tablet needs to render the site plan for itself.

   The file, and where it sits in the drawing. Not the pixels — the
   whole point is that the tablet renders the page at the zoom it is
   showing, so a line drawing stays a line drawing however far in
   somebody goes.

   Returns null where there is nothing to render, which the form shows
   as a design on plain white rather than as an error. That is a real
   state: a project can be drawn before its plan is set up. */
export function planRef(basemap = null) {
  if (!basemap) return null;
  const mpp = num(basemap.Metres_Per_Pixel);
  const url = basemap.Image_Url || null;
  if (!mpp || !url) return null;

  return {
    url,
    kind: basemap.Source_Kind === "pdf" ? "pdf" : "image",
    page: num(basemap.Page_Number) ?? 1,
    mpp,
    originX: num(basemap.Origin_X) ?? 0,
    originY: num(basemap.Origin_Y) ?? 0,
    rotation: num(basemap.Rotation_Deg) ?? 0,
    opacity: num(basemap.Opacity) ?? 0.6,
  };
}
