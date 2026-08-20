/* The electric design over a call-off's plots, as one picture.

   Drawn when an Electric Service call-off is raised and shown under the
   sketch tab of every jointing work instruction raised from it, so a
   gang marking joint positions marks them against the run as laid.

   ── Why this is not spanImage ──

   spanImage draws one span: a highlighted length of trench, the nodes
   at each end, and the seeds around it. This draws a design: every
   electric run over the plots being connected, the joints on it, and
   the plots themselves. Different subject, different framing, and the
   only thing the two genuinely share is arithmetic.

   So the arithmetic is imported and the drawing is not. `spanBounds`
   and `fitView` are exactly right and reimplementing them here would be
   the fault checkspannodes spent a year demonstrating.

   ── What an operative needs from it ──

   Where the cable runs, where the joints are, and which plot is which.
   The background plan under all of it, because without the kerb lines
   and the house footprints it is a correct diagram of nowhere.

   ── Room around the extent ──

   The design's own extent tells somebody nothing: a tight cluster of
   plots fills the frame and could be any estate. The same twenty metres
   spanImage uses brings in the road it comes off. */

import { spanBounds, fitView, PAD_M } from "./spanImage.js";

/* Bigger than a span picture. A span is one length; this is a whole
   call-off's worth of plots, and the labels have to stay legible when
   the sketch tab draws over it on a tablet. */
export const WIDTH = 1400;
export const HEIGHT = 900;

/* Metres to pixels, for a fitted view. Local because `at` is not
   exported from spanImage — and it is two multiplications, which is
   below the threshold where sharing costs less than it saves. */
const at = (view, p) => [
  p[0] * view.scale + view.x,
  p[1] * view.scale + view.y,
];

/* Every point of a feature's geometry, whatever shape it is.

   A line is a list of points and a point feature is a list of one, so
   both answer the same way. Guarded because a feature with no geometry
   is a row somebody half-saved, and one of those must not take the
   whole drawing with it. */
function pointsOf(f) {
  const g = f?.Geometry;
  if (!Array.isArray(g)) return [];
  return g.filter((p) => Array.isArray(p) && p.length >= 2
    && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));
}

/* The features this drawing is of.

   Electric only. A service call-off may cover gas and water as well,
   and their pipes are not what a jointing gang is looking at — the
   sketch is of the cable they are jointing. Trenches are left out for
   the same reason: by the time anybody opens this the ground is closed.

   Taken by layer key rather than by line type, so a run drawn on a type
   this module has never heard of is still on the picture. */
export function asLaidFeatures(features = []) {
  return features.filter((f) => String(f?.Layer_Key || "") === "electric");
}

/* Draw it. Takes a context so it can be checked without a canvas.

   Returns false where there is nothing to draw, which is a real answer:
   a call-off raised over plots with no electric design should not
   produce a blank rectangle that looks like a drawing. */
export function drawAsLaid(ctx, {
  electric = [],
  seeds = [],
  joints = [],
  plan = null,
  width = WIDTH,
  height = HEIGHT,
  padM = PAD_M,
} = {}) {
  /* Framed on the design and the plots together. On the design alone a
     plot sitting off the end of the last run falls outside the picture,
     and that plot is one somebody has to find. */
  const extent = [...electric, ...seeds]
    .map((f) => f.Geometry)
    .filter(Array.isArray);
  if (!extent.length) return false;

  const bounds = spanBounds(extent, padM);
  const view = fitView(bounds, width, height);
  if (!view) return false;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  /* ── The background plan ──

     Under everything and faded, the way the canvas fades it: the survey
     is context and the design is the subject. `plan.draw` is handed the
     transform and paints itself, because a raster plan and a rendered
     PDF region need different arithmetic to place and neither belongs
     here. */
  if (plan?.draw) {
    ctx.save();
    ctx.globalAlpha = plan.opacity ?? 0.6;
    try {
      plan.draw(ctx, (p) => at(view, p), view.scale);
    } catch { /* a plan that will not draw must not lose the design */ }
    ctx.restore();
  }

  /* ── The plots ──

     First, so they sit under the cable. They are how anybody on a
     housing site says where they are, and a seed drawn over a run would
     hide the thing the picture is of. */
  ctx.fillStyle = "#1d4ed8";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of seeds) {
    const p = pointsOf(s)[0];
    if (!p) continue;
    const [x, y] = at(view, p);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (s.Label) {
      ctx.fillStyle = "#1e3a8a";
      ctx.fillText(String(s.Label), x, y);
      ctx.fillStyle = "#1d4ed8";
    }
  }

  /* ── The cable ──

     In the utility's colour, which is handed in rather than written
     here: 0183 made Utility.Colour the only record of it, and a hex in
     this file would be the copy that migration removed.

     Services thinner than mains. The distinction is what tells a fitter
     which run is the one feeding the plot they are standing at. */
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const f of electric) {
    const pts = pointsOf(f);
    if (pts.length < 2) continue;
    const isService = /service/i.test(String(f?.Attributes?.Line_Type || ""));
    /* Neutral where no colour was handed in, rather than amber. A
       missing colour means the layers had not loaded, not that electric
       is amber — writing the hex here would be the fourth copy 0183
       removed, and checkutilitymenus fails on it. */
    ctx.strokeStyle = f.Colour || "#334155";
    ctx.lineWidth = isService ? 2.5 : 4.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = at(view, p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /* ── The joints ──

     Last, over the cable, because they are what the gang is going to
     site to make. Drawn as a square rather than a circle so they are
     not read as plot seeds at a glance on a tablet in daylight.

     Not rotated to the run. jointAngle exists and is right, but a
     symbol turned to a cable is a refinement on a picture whose job is
     "there is a joint about here" — and fault 19 is what happens when
     a rotation is applied on an argument nobody rechecked. */
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.5;
  for (const j of joints) {
    const p = pointsOf(j)[0];
    if (!p) continue;
    const [x, y] = at(view, p);
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.rect(x - 6, y - 6, 12, 12);
    ctx.fill();
    ctx.stroke();
  }

  return true;
}

/* The drawing as a PNG data URL, or null where there is nothing to
   draw.

   Browser only — it makes a canvas. drawAsLaid above takes a context
   and can be checked without one. */
export function asLaidImage(opts = {}) {
  if (typeof document === "undefined") return null;
  const width = opts.width ?? WIDTH;
  const height = opts.height ?? HEIGHT;

  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;

  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  if (!drawAsLaid(ctx, { ...opts, width, height })) return null;

  /* PNG rather than JPEG: line work on white, where JPEG puts a halo
     round every stroke and the plot labels are the first thing to go. */
  return cv.toDataURL("image/png");
}
