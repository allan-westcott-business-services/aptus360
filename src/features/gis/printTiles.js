/* How many sheets, of which paper, to print a drawing on.

   ── The question this answers ──

   A site rarely fits one sheet at a scale anybody can measure. So the
   drawing is tiled: a grid of pages, each covering part of the ground,
   trimmed and butted together. The designer's question is always the
   same — which paper size gets this onto the fewest sheets — and it
   cannot be answered by eye.

   ── Two margins, and they are different things ──

   `marginMm` is the border a printer CANNOT print into. It is a fact
   about the machine: most desktop printers lose 5 mm on every edge,
   plotters less. Nothing is drawn there, so it does not count towards
   the ground a sheet covers.

   `overlapMm` is how much of the ground two neighbouring sheets SHARE.
   It is a decision about how the sheets will be joined: butted edge to
   edge needs none, trimmed and lapped needs enough to cut into, and
   taping the backs wants a few millimetres so no white line shows at
   the seam. It also protects against the printer's own drift, which is
   why zero is offered but not the default.

   So a sheet covers `sheet - 2 × margin` of printable paper, and each
   sheet after the first advances by `printable - overlap`. Both are in
   millimetres of paper; the ground follows from the scale.

   ── Why this is pure ──

   It decides sheet counts and the rectangle of ground on each page,
   and touches nothing else. The overlay draws these rectangles; the
   PDF writes one page per rectangle. Both read the same plan, so what
   is previewed is what is printed. */

import { PAPER, mmPerMetre, sheetMm } from "./printSheet.js";

/* A printer loses about this much on every edge. Five is the common
   desktop figure and errs the safe way: a plotter that can do better
   only gains. */
export const DEFAULT_MARGIN_MM = 5;

/* And sheets are lapped by this much unless somebody says otherwise.
   Ten millimetres is enough to trim to a line by hand and enough to
   hide the printer's own registration drift. */
export const DEFAULT_OVERLAP_MM = 10;

/* How many tiles cover a length.

   One where it fits. Otherwise the first tile covers `printable` and
   every tile after it adds `step`, so n tiles cover
   `printable + (n-1) × step` — solve for n and round up.

   Refuses rather than loops where the step is not positive: an overlap
   as wide as the paper advances nothing, and asking for that is a
   typo, not an instruction to hang. */
export function tilesAcross(lengthMm, printableMm, overlapMm) {
  const printable = Number(printableMm);
  const overlap = Number(overlapMm) || 0;
  const length = Number(lengthMm);
  if (!(printable > 0) || !Number.isFinite(length)) return null;
  if (length <= printable) return 1;
  const step = printable - overlap;
  if (!(step > 0)) return null;
  return Math.ceil((length - printable) / step) + 1;
}

/* ── The plan for one paper size ──

   Returns the grid, the sheet count, and every tile as a rectangle of
   GROUND in metres — which is what the overlay draws and what each PDF
   page is rendered from.

   The grid is centred on the work, so the spare paper is shared out
   evenly rather than all falling off one edge. A drawing 1.1 sheets
   wide prints on two sheets either way; centred, both have something
   on them, which is easier to check than one full sheet and one with a
   sliver up its left edge. */
export function tilePlan({
  bounds,
  paper = "A3",
  landscape = true,
  scaleDenom = 500,
  marginMm = DEFAULT_MARGIN_MM,
  overlapMm = DEFAULT_OVERLAP_MM,
} = {}) {
  if (!bounds || !(bounds.w >= 0) || !(bounds.h >= 0)) return null;
  if (!PAPER[paper]) return null;

  const { w: sheetW, h: sheetH } = sheetMm(paper, landscape);
  const printW = sheetW - marginMm * 2;
  const printH = sheetH - marginMm * 2;
  const k = mmPerMetre(scaleDenom);       /* mm of paper per metre */
  if (!(k > 0)) return null;

  /* The work, in millimetres of paper at this scale. */
  const workW = bounds.w * k;
  const workH = bounds.h * k;

  const cols = tilesAcross(workW, printW, overlapMm);
  const rows = tilesAcross(workH, printH, overlapMm);
  if (cols == null || rows == null) return null;

  const stepW = printW - overlapMm;
  const stepH = printH - overlapMm;

  /* Total ground the grid covers, and the offset that centres it. */
  const spanW = (printW + (cols - 1) * stepW) / k;
  const spanH = (printH + (rows - 1) * stepH) / k;
  const cx = bounds.minX + bounds.w / 2;
  const cy = bounds.minY + bounds.h / 2;
  const x0 = cx - spanW / 2;
  const y0 = cy - spanH / 2;

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const minX = x0 + (c * stepW) / k;
      const minY = y0 + (r * stepH) / k;
      tiles.push({
        col: c,
        row: r,
        /* One-based, reading order, because that is how somebody
           collates a pile of paper: "sheet 3 of 6". */
        sheet: r * cols + c + 1,
        minX,
        minY,
        maxX: minX + printW / k,
        maxY: minY + printH / k,
        /* The centre is what the renderer needs: printView centres a
           sheet on a point. */
        centre: [minX + printW / k / 2, minY + printH / k / 2],
      });
    }
  }

  return {
    paper,
    landscape,
    scaleDenom,
    marginMm,
    overlapMm,
    cols,
    rows,
    sheets: cols * rows,
    sheetW,
    sheetH,
    printW,
    printH,
    /* How much of the paper carries drawing rather than overlap or
       margin. A designer comparing two options that both come to four
       sheets picks the one that wastes less. */
    coverage: (bounds.w * bounds.h) / (spanW * spanH || 1),
    tiles,
  };
}

/* ── Every paper size, ranked ──

   The answer to "what do I print this on". Fewest sheets first; where
   two match, the one that wastes less paper; where those match too,
   the smaller sheet, because a plotter is not always to hand.

   Both orientations of each size are offered: a long thin site on
   landscape A1 can beat portrait A0, and nothing but trying it says
   so. */
export function paperOptions({
  bounds,
  scaleDenom = 500,
  papers = Object.keys(PAPER),
  marginMm = DEFAULT_MARGIN_MM,
  overlapMm = DEFAULT_OVERLAP_MM,
} = {}) {
  const out = [];
  for (const paper of papers) {
    for (const landscape of [false, true]) {
      const plan = tilePlan({ bounds, paper, landscape, scaleDenom,
        marginMm, overlapMm });
      if (plan) out.push(plan);
    }
  }
  const area = (p) => p.sheetW * p.sheetH;
  return out.sort((a, b) => a.sheets - b.sheets
    || b.coverage - a.coverage
    || area(a) - area(b));
}

/* The plan a designer would be offered first. Null where there is
   nothing drawn, which the caller reads as "nothing to print". */
export function bestPaper(opts = {}) {
  return paperOptions(opts)[0] ?? null;
}
