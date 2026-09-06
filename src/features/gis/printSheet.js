/* Printing the drawing at a scale somebody can measure.

   A plan that is not to scale is a picture. A jointer holding a rule
   against a sheet marked 1:500 expects two millimetres to be a metre,
   and if it is not, the sheet is worse than no sheet — it is a wrong
   answer that looks like a right one.

   ── The arithmetic ──

   A scale of 1:N means one unit on paper is N units on the ground. So a
   metre on the ground is 1000/N millimetres on paper: at 1:500, two
   millimetres; at 1:200, five.

   Everything else follows from that and the paper size. The sheet
   decides how much ground fits; the ground does not decide the sheet.

   ── Why pixels come into it ──

   The drawing is a canvas, so the sheet is an image placed at an exact
   size in millimetres. The image's resolution decides how sharp it is
   and nothing else: a 300 dpi A0 is the same drawing as a 150 dpi A0,
   at four times the memory. The scale is carried by the millimetres,
   which is why it survives being printed. */

/* ISO A sizes, in millimetres, portrait. */
export const PAPER = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

/* The scales a distribution drawing is usually issued at. 1:1250 and
   1:2500 are the Ordnance Survey ones a site plan is drawn on; the rest
   are what a design is worked at. */
export const SCALES = [100, 200, 250, 500, 1000, 1250, 2500];

/* Millimetres on paper for one metre on the ground. */
export const mmPerMetre = (scaleDenom) => 1000 / Number(scaleDenom);

/* The sheet's size in millimetres, the way round it is asked for. */
export function sheetMm(paper, landscape) {
  const [w, h] = PAPER[paper] || PAPER.A3;
  return landscape ? { w: h, h: w } : { w, h };
}

/* How much ground a sheet covers at a scale, in metres, less the
   margin. Two numbers a designer checks before printing: a sheet that
   does not cover the site is a sheet that gets thrown away. */
export function groundCovered(paper, landscape, scaleDenom, marginMm = 10) {
  const { w, h } = sheetMm(paper, landscape);
  const k = mmPerMetre(scaleDenom);
  return {
    w: (w - marginMm * 2) / k,
    h: (h - marginMm * 2) / k,
  };
}

/* ── The view that puts the drawing on the sheet ──

   The same shape as the screen's `view`: a scale in pixels per metre
   and an offset in pixels. Centred on what is asked for, so a print
   is of somewhere rather than of wherever the drawing happens to
   start.

   `dpi` decides the pixel size of the image and nothing about the
   scale. */
export function printView({
  paper = "A3",
  landscape = true,
  scaleDenom = 500,
  dpi = 150,
  centre = [0, 0],
  marginMm = 10,
}) {
  const { w: sheetW, h: sheetH } = sheetMm(paper, landscape);
  const pxPerMm = dpi / 25.4;
  const widthPx = Math.round(sheetW * pxPerMm);
  const heightPx = Math.round(sheetH * pxPerMm);

  /* Pixels per metre on the ground: millimetres per metre, times pixels
     per millimetre. This one line is the whole of "the scale is
     correct". */
  const scale = mmPerMetre(scaleDenom) * pxPerMm;

  return {
    widthPx,
    heightPx,
    sheetW,
    sheetH,
    marginMm,
    pxPerMm,
    view: {
      scale,
      x: widthPx / 2 - centre[0] * scale,
      /* The drawing's y grows downward on screen and the print
         reproduces the screen, so no flip here. A print that mirrored
         the drawing would be a different fault to explain. */
      y: heightPx / 2 - centre[1] * scale,
    },
  };
}

/* The bounds of everything drawn, so a print can be centred on the work
   rather than on the origin. Null where there is nothing, which the
   caller reads as "there is nothing to print". */
export function drawnBounds(features = []) {
  let minX = Infinity; let minY = Infinity;
  let maxX = -Infinity; let maxY = -Infinity;
  for (const f of features) {
    for (const p of f?.Geometry || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY,
    centre: [(minX + maxX) / 2, (minY + maxY) / 2],
    w: maxX - minX, h: maxY - minY };
}

/* The scale that fits the work on the sheet, rounded UP to one of the
   standard ones.

   Up, not to the nearest: rounding down gives a sheet the drawing spills
   off, and a plan with the corner missing is not a plan. */
export function scaleToFit(bounds, paper, landscape, marginMm = 10) {
  if (!bounds) return SCALES[0];
  const { w, h } = sheetMm(paper, landscape);
  const availW = Math.max(1, w - marginMm * 2);
  const availH = Math.max(1, h - marginMm * 2);
  /* The scale that would exactly fit, then the first standard one no
     smaller. A little air, so the outermost feature is not on the
     trim. */
  const need = Math.max(
    (bounds.w * 1.04) * 1000 / availW,
    (bounds.h * 1.04) * 1000 / availH,
  );
  return SCALES.find((n) => n >= need) ?? SCALES[SCALES.length - 1];
}

/* How many pixels an image of this sheet will be, and whether that is
   more than a browser will give us.

   A canvas has a limit — commonly 16384 on a side, and an area limit
   besides — and asking for more returns a blank one rather than an
   error. A blank A0 at the printers is an expensive way to find out. */
export const MAX_SIDE = 16384;
/* Well under what a canvas is nominally allowed. A0 at 300 dpi is 139
   megapixels, which the limits permit and a browser will usually refuse
   to allocate: at four bytes a pixel it is half a gigabyte, and what
   comes back is a blank canvas rather than an error. A blank A0 at the
   printers is an expensive way to find that out.

   96 megapixels is A0 at about 250 dpi, which is more than a plotter
   resolves anyway. */
export const MAX_AREA = 96000000;

export function tooBig(paper, landscape, dpi) {
  const { widthPx, heightPx } = printView({ paper, landscape, dpi });
  if (widthPx > MAX_SIDE || heightPx > MAX_SIDE) {
    return `${paper} at ${dpi} dpi is ${widthPx}\u00d7${heightPx} pixels, wider `
      + `than a browser canvas allows (${MAX_SIDE}). Use a lower resolution.`;
  }
  if (widthPx * heightPx > MAX_AREA) {
    return `${paper} at ${dpi} dpi is ${Math.round(widthPx * heightPx / 1e6)} `
      + "megapixels. A browser will usually hand back a blank canvas rather "
      + "than refuse, so this is stopped here. Use a lower resolution.";
  }
  return null;
}

/* ── More ground than one sheet holds ──

   A site at 1:200 does not fit on anything, and the honest answer is
   several sheets rather than a smaller scale nobody can read. So the
   ground is divided into a grid of sheets, each covering what one sheet
   covers, and every one of them is drawn on screen before any of them
   is printed.

   Numbered across then down, the way somebody lays them out on a table.

   ── Overlap ──

   Sheets butt exactly by default: each covers its own patch and
   together they cover the lot. An overlap can be asked for, because
   trimming to a line and taping is easier when there is a common strip
   on both sides \u2014 and because a plotter that under-scales slightly
   leaves a white seam otherwise. */
export function sheetGrid({
  bounds,
  paper = "A3",
  landscape = true,
  scaleDenom = 500,
  marginMm = 10,
  overlapM = 0,
}) {
  if (!bounds) return null;
  const cover = groundCovered(paper, landscape, scaleDenom, marginMm);
  /* What each sheet ADDS once the overlap is taken off both joins. */
  const stepW = Math.max(0.001, cover.w - overlapM);
  const stepH = Math.max(0.001, cover.h - overlapM);

  const cols = Math.max(1, Math.ceil((bounds.w - overlapM) / stepW));
  const rows = Math.max(1, Math.ceil((bounds.h - overlapM) / stepH));

  /* Centred on the work as a whole, so a drawing that needs two sheets
     gets one either side of the middle rather than one on it and one
     mostly empty. */
  const totalW = cols * stepW + overlapM;
  const totalH = rows * stepH + overlapM;
  const left = bounds.centre[0] - totalW / 2;
  const top = bounds.centre[1] - totalH / 2;

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        row: r,
        col: c,
        n: r * cols + c + 1,
        centre: [
          left + c * stepW + cover.w / 2,
          top + r * stepH + cover.h / 2,
        ],
        w: cover.w,
        h: cover.h,
      });
    }
  }
  return { cols, rows, tiles, cover, count: tiles.length };
}
