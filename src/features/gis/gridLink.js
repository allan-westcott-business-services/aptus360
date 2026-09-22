/* The link between a drawing and the Ordnance Survey National Grid.

   A drawing is in its own metres: x east, y SOUTH (a canvas's y runs
   down the screen), with an origin wherever the first PDF was
   calibrated. The National Grid is easting and northing, north UP.
   The link says how one sits on the other, so that an OS tile — which
   knows exactly where it is — can be drawn in the right place over a
   PDF that knows nothing about the grid.

   ── How it is found ──

   From matched points: somebody clicks a feature on the PDF and the
   same feature on the OS linework. Two pairs are enough; more give a
   best fit and, more usefully, a measure of how good the fit is.

   The fit is a SIMILARITY — rotation, uniform scale and position —
   solved by least squares. Not a general affine: a site plan is not
   sheared or stretched differently along its two axes unless it was
   scanned badly, and letting the fit absorb that would hide it. The
   scale is solved rather than fixed at 1 so that it can be REPORTED:
   a PDF calibrated a few percent out is common, and the link says so
   instead of silently bending the OS to agree.

   ── The drawing never moves ──

   The link is applied to the OS linework, not to the PDF or to
   anything drawn over it. A design already drawn on a calibrated PDF
   stays exactly where it is; the OS tile is placed to meet it.

   Pure. Everything the canvas, the print and the checks need, and
   nothing that touches a screen. */

/* The canvas's y runs south. Flipping it first turns the canvas into
   a right-handed frame like the grid's, so the fit is a plain
   similarity and never has to discover the mirror for itself. */
const flip = ([x, y]) => [x, -y];

/* A link is { a, b, tx, ty } with
     E = a·u \u2212 b·v + tx
     N = b·u + a·v + ty
   where (u, v) is the canvas point with y flipped. Scale is |(a, b)|,
   rotation is its angle. */
export function toGrid(link, pt) {
  if (!link || !Array.isArray(pt)) return null;
  const [u, v] = flip(pt);
  return [link.a * u - link.b * v + link.tx, link.b * u + link.a * v + link.ty];
}

export function toCanvas(link, en) {
  if (!link || !Array.isArray(en)) return null;
  const det = link.a * link.a + link.b * link.b;
  if (!det) return null;
  const de = en[0] - link.tx;
  const dn = en[1] - link.ty;
  const u = (link.a * de + link.b * dn) / det;
  const v = (-link.b * de + link.a * dn) / det;
  return flip([u, v]);
}

/* The best similarity through the pairs, and how well it fits.

   pairs: [{ canvas: [x, y], grid: [E, N] }, ...]

   Returns null for fewer than two pairs or pairs that cannot fix a
   rotation (every canvas point in the same place). */
export function solveLink(pairs = []) {
  const ok = (pairs || []).filter((p) => Array.isArray(p?.canvas) && Array.isArray(p?.grid));
  if (ok.length < 2) return null;

  const uv = ok.map((p) => flip(p.canvas));
  const en = ok.map((p) => p.grid);
  const n = ok.length;
  const mean = (arr, i) => arr.reduce((t, q) => t + q[i], 0) / n;
  const cu = mean(uv, 0); const cv = mean(uv, 1);
  const ce = mean(en, 0); const cn = mean(en, 1);

  let sxx = 0; let sxy = 0; let suu = 0;
  for (let i = 0; i < n; i++) {
    const du = uv[i][0] - cu; const dv = uv[i][1] - cv;
    const de = en[i][0] - ce; const dn = en[i][1] - cn;
    sxx += du * de + dv * dn;
    sxy += du * dn - dv * de;
    suu += du * du + dv * dv;
  }
  if (!(suu > 1e-9)) return null;

  const a = sxx / suu;
  const b = sxy / suu;
  const link = {
    a, b,
    tx: ce - (a * cu - b * cv),
    ty: cn - (b * cu + a * cv),
  };

  const residuals = ok.map((p) => {
    const g = toGrid(link, p.canvas);
    return Math.hypot(g[0] - p.grid[0], g[1] - p.grid[1]);
  });
  const rms = Math.sqrt(residuals.reduce((t, r) => t + r * r, 0) / n);

  return {
    ...link,
    scale: Math.hypot(a, b),
    /* Degrees, anticlockwise from the drawing's east to grid east —
       what a person would type into a rotation box. */
    rotationDeg: (Math.atan2(b, a) * 180) / Math.PI,
    residuals,
    rms,
    pairs: n,
  };
}

/* ── Is the fit fit to use? ──

   Plain words for the panel, from the numbers. Thresholds in METRES
   of ground, because that is what somebody laying a cable cares
   about:

     under 0.25 m — as good as the OS mapping itself;
     under 1 m    — fine for design, worth a look before issue;
     over 1 m     — a point is probably matched to the wrong feature.

   And the scale, separately: a PDF calibrated more than 1% away from
   the OS is flagged, because every length measured on it is out by
   the same amount. */
export const FIT_GOOD_M = 0.25;
export const FIT_FAIR_M = 1;
export const SCALE_WARN = 0.01;

export function fitVerdict(fit) {
  if (!fit) return { level: "none", words: "Match at least two points." };
  const worst = Math.max(...fit.residuals);
  const scaleOff = Math.abs(fit.scale - 1);
  const notes = [];
  if (fit.pairs < 3) {
    notes.push("Two points always fit exactly — add a third to see how good the fit really is.");
  }
  if (scaleOff > SCALE_WARN) {
    notes.push(`The PDF is ${(scaleOff * 100).toFixed(1)}% ${fit.scale > 1 ? "small" : "large"} against the OS, `
      + "so lengths measured on it are out by that much.");
  }
  const level = fit.pairs < 3 ? "unproven"
    : worst <= FIT_GOOD_M ? "good" : worst <= FIT_FAIR_M ? "fair" : "poor";
  const head = {
    unproven: "Placed from two points.",
    good: `Good fit — every point within ${(worst * 100).toFixed(0)} cm.`,
    fair: `Fair fit — worst point ${worst.toFixed(2)} m out.`,
    poor: `Poor fit — worst point ${worst.toFixed(2)} m out. One pair is probably matched to the wrong feature.`,
  }[level];
  return { level, words: [head, ...notes].join(" ") };
}
