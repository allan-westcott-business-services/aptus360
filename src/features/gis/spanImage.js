/* A picture of one span, for the work instruction.

   ── What an operative needs from it ──

   Not the design. A gang arriving on a road needs to recognise which
   length of it they are digging, and that is three things: the trench,
   highlighted; the nodes at each end of it, so the labels on the paper
   match something on the ground; and the plot seeds around it, which
   are how anybody on a housing site says where they are.

   And the background plan under all of it. Without it the three are a
   diagram: correct, and not a place. The kerb lines and the house
   footprints are what somebody standing on the road matches against.

   The plan is the awkward part. A raster one is an image and can be
   drawn straight. A PDF one arrives as tiles rendered for whatever is
   on screen, so a span's extent has to be asked for specifically —
   usePdfPage.renderRegion does that, and the caller awaits one per
   span. Either way it arrives here already rendered: this module draws
   what it is handed and does not know which kind it was.

   ── Twenty metres of room ──

   The span's own extent tells somebody nothing: a thirteen-metre run
   fills the frame and could be anywhere. Twenty metres past each end
   brings in the plots either side and the junction it comes off, which
   is what makes it a place rather than a line.

   ── A picture of that day ──

   Taken when the call-off is raised, not when the instruction is
   opened. If the drawing moves afterwards, the operative still sees
   what was called off — which is the point of a record. */

/* Metres of padding around the span's extent. */
export const PAD_M = 20;

/* The box a span occupies, with room around it.

   From the trench geometry rather than the two end nodes: a run that
   bends round a corner is not contained by the box its ends make, and
   the bend is exactly the bit somebody needs to see. */
export function spanBounds(geometries = [], padM = PAD_M) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const g of geometries) {
    for (const p of g || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  }
  if (!Number.isFinite(minX)) return null;

  return {
    minX: minX - padM,
    minY: minY - padM,
    maxX: maxX + padM,
    maxY: maxY + padM,
  };
}

/* Fitting that box to an image, keeping the shape of the ground.

   Squaring it to the image would stretch a long thin span sideways, and
   a picture with a different scale each way is one somebody cannot
   measure by eye. So the tighter of the two scales wins and the slack
   becomes margin. */
export function fitView(bounds, width, height) {
  if (!bounds) return null;
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(width / w, height / h);
  return {
    scale,
    /* Centred: the slack from the axis that did not decide the scale is
       split either side rather than left at one end. */
    x: (width - w * scale) / 2 - bounds.minX * scale,
    y: (height - h * scale) / 2 - bounds.minY * scale,
  };
}

const at = (view, p) => ({ x: p[0] * view.scale + view.x, y: p[1] * view.scale + view.y });

/* Everything inside the box, so the plots either side are drawn and the
   ones two streets away are not. */
const within = (bounds, p) => p
  && p[0] >= bounds.minX && p[0] <= bounds.maxX
  && p[1] >= bounds.minY && p[1] <= bounds.maxY;

/* Draw one span onto a 2d context.

   Takes a context rather than making its own canvas, so the same code
   draws to an offscreen canvas in the browser and to whatever a test
   hands it. */
export function drawSpan(ctx, {
  trenches = [],
  nodes = [],
  seeds = [],
  plan = null,
  width = 640,
  height = 420,
  padM = PAD_M,
} = {}) {
  const bounds = spanBounds(trenches.map((t) => t.Geometry), padM);
  const view = fitView(bounds, width, height);
  if (!view) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  /* ── The background plan ──

     Under everything, at its calibrated size, and faded the way the
     canvas fades it: the survey is context and the work is the subject,
     and a plan at full strength competes with the trench drawn over it.

     `plan.draw` is given the metre-to-pixel transform and paints
     itself. A raster plan and a PDF region need different arithmetic to
     place, and neither belongs here — this module knows where the
     picture is looking, not what a basemap is. */
  if (plan?.draw) {
    ctx.save();
    ctx.globalAlpha = plan.opacity ?? 0.6;
    try {
      plan.draw(ctx, (p) => at(view, p), view.scale);
    } catch { /* a plan that will not draw must not lose the span */ }
    ctx.restore();
  }

  /* ── The plot seeds ──

     First, so they sit under the trench: they are context, and a seed
     drawn over the highlighted length would hide the thing the picture
     is of. */
  ctx.fillStyle = "#1d4ed8";
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const s of seeds) {
    const p = (s.Geometry || [])[0];
    if (!within(bounds, p)) continue;
    const c = at(view, p);

    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#dbeafe";
    ctx.fill();
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (s.Label) {
      ctx.fillStyle = "#1e3a8a";
      ctx.fillText(String(s.Label), c.x, c.y - 7);
    }
  }

  /* ── The trench, highlighted ──

     Yellow under a dark line rather than yellow alone: a highlight on
     its own is hard to follow where it crosses other work, and the dark
     core is what says this is a trench rather than a marker pen. */
  for (const t of trenches) {
    const g = t.Geometry || [];
    if (g.length < 2) continue;

    ctx.beginPath();
    g.forEach((p, i) => {
      const c = at(view, p);
      if (i) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y);
    });
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ── The span nodes ──

     Last and on top, because the labels on them are what the paperwork
     names the run by — A10 to A11 means nothing unless both are legible
     in the picture. */
  ctx.font = "700 11px system-ui, sans-serif";
  for (const n of nodes) {
    const p = (n.Geometry || [])[0];
    /* In frame, like the seeds.

       Every span node on the drawing was being drawn, so a picture of a
       thirteen-metre run had three of them floating in its corners with
       no trench near any of them — which reads as though the span runs
       to them. */
    if (!within(bounds, p)) continue;
    const c = at(view, p);

    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    /* The label the paperwork names the run by.

       A span node's Label is not it — that is whatever the feature was
       called when it was placed, and every node here drew "nt". The
       name a call-off uses is Span_Label, which is what labelOf in
       mainsCallOff.js reads first for exactly this reason.

       Passed in as `label` where the caller has already worked it out,
       so this does not have to reproduce the computed form for nodes
       made by an older build. */
    const text = String(n.label ?? n.Attributes?.Span_Label ?? n.Label ?? "");
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.x, c.y + 0.5);
    ctx.textBaseline = "alphabetic";
  }

  /* A scale bar, so the picture can be measured rather than guessed at.
     Ten metres, or the whole width if ten metres does not fit. */
  const tenPx = 10 * view.scale;
  if (tenPx > 20 && tenPx < width - 40) {
    const y = height - 16;
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(16 + tenPx, y);
    ctx.stroke();
    ctx.fillStyle = "#334155";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("10 m", 16, y - 5);
  }

  return { bounds, view };
}

/* The span as a PNG data URL, or null where there is nothing to draw.

   Browser only — it makes a canvas. The drawing itself is drawSpan
   above, which takes a context and can be checked without one. */
export function spanImage(opts = {}) {
  if (typeof document === "undefined") return null;
  const width = opts.width ?? 640;
  const height = opts.height ?? 420;

  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;

  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  if (!drawSpan(ctx, { ...opts, width, height })) return null;

  /* PNG rather than JPEG: this is line work on white, where JPEG puts
     a halo round every stroke and the labels are the first thing to
     go. */
  return cv.toDataURL("image/png");
}
