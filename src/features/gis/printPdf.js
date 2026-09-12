/* Writing the drawing to a PDF: vectors all the way down.

   ── Why pdf-lib ──

   The basemap is a PDF. Rasterising it to place it under the drawing
   throws away the one thing it has \u2014 it is already vector \u2014 and hands
   back a sheet that goes soft the moment anybody zooms in on a plot
   boundary. `embedPdf` places the basemap's own page as a form, so the
   printed plan is as sharp as the plan it was traced over, and a
   nine-sheet set stays a few hundred kilobytes.

   ── Two coordinate systems, converted in one place ──

   Everything upstream \u2014 tiles, draw lists, the canvas \u2014 works in
   millimetres with y growing DOWN, because that is how the drawing's
   ground coordinates run, and a flip anywhere in the chain prints a
   mirror image.

   A PDF's own space is points with y growing UP from the bottom left.
   The conversion happens here and nowhere else:

     pt = mm x 72 / 25.4,   y_pdf = (sheetH - y_mm) x 72 / 25.4

   ── Where the basemap lands ──

   Georeferenced by the three numbers the canvas already uses:
   `Metres_Per_Pixel` (metres per unit of the basemap's own page) and
   `Origin_X`/`Origin_Y`, the ground position of the page's top-left
   corner.

   Working a point of the basemap page through to a point on the sheet
   comes out as a plain scale and translate \u2014 no rotation, no shear \u2014
   with

     s = (72/25.4) x (1000/scale) x metresPerPixel

   points of sheet per unit of basemap page. That one number is the
   whole georeferencing, and it is why the underlay cannot drift out of
   register with the features over it: both are placed from the same
   tile and the same scale. */

import {
  PDFDocument, StandardFonts, rgb,
  pushGraphicsState, popGraphicsState,
  moveTo, lineTo, closePath, stroke, fill, fillAndStroke,
  setLineWidth, setStrokingColor, setFillingColor, setDashPattern,
  clip, endPath,
} from "pdf-lib";
import { planDrawLists } from "./printVector.js";

const PT = 72 / 25.4;

/* #rrggbb to a pdf-lib colour. Unreadable comes back mid grey: a wrong
   colour that looks deliberate is worse than one that looks like a
   default. */
function colour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return rgb(0.39, 0.45, 0.55);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* ── The basemap, embedded ──

   Clipped to the printable area first, so the underlay stops where the
   paper's unprintable border begins rather than bleeding into it.

   False where there is nothing to place, so the caller can say so
   rather than issuing a sheet quietly missing its plan. */
function drawBasemap(page, embedded, { plan, tile, basemap }) {
  if (!embedded || !basemap) return false;
  const mpp = Number(basemap.Metres_Per_Pixel);
  if (!(mpp > 0)) return false;
  const ox = Number(basemap.Origin_X) || 0;
  const oy = Number(basemap.Origin_Y) || 0;

  const k = 1000 / Number(plan.scaleDenom);   /* mm of paper per metre */
  const s = PT * k * mpp;                     /* pt of sheet per page unit */

  const pageW = embedded.width;
  const pageH = embedded.height;

  /* The sheet position of the basemap page's BOTTOM-left corner. The
     y term carries the page height because the georeferenced origin is
     the page's top-left in ground terms and its bottom-left in PDF
     terms. */
  const x = PT * ((ox - tile.minX) * k + plan.marginMm);
  const y = PT * (plan.sheetH - plan.marginMm
    - (oy + pageH * mpp - tile.minY) * k);

  const m = plan.marginMm * PT;
  const w = plan.printW * PT;
  const h = plan.printH * PT;

  page.pushOperators(
    pushGraphicsState(),
    moveTo(m, m), lineTo(m + w, m), lineTo(m + w, m + h), lineTo(m, m + h),
    closePath(), clip(), endPath(),
  );
  page.drawPage(embedded, {
    x, y, width: pageW * s, height: pageH * s,
    opacity: Number(basemap.Opacity ?? 1),
  });
  page.pushOperators(popGraphicsState());
  return true;
}

/* One page's primitives as PDF operators. A translation and nothing
   else: no geometry is decided here. */
function drawItems(page, items, plan, font) {
  const toPt = (p) => [p[0] * PT, (plan.sheetH - p[1]) * PT];

  for (const it of items) {
    if (it.kind === "polyline" || it.kind === "polygon") {
      if (!it.pts || it.pts.length < 2) continue;
      const ops = [
        pushGraphicsState(),
        setStrokingColor(colour(it.colour)),
        setLineWidth(Math.max(0.05, it.widthMm * PT)),
        setDashPattern(it.dashMm ? it.dashMm.map((n) => n * PT) : [], 0),
      ];
      const [x0, y0] = toPt(it.pts[0]);
      ops.push(moveTo(x0, y0));
      for (let i = 1; i < it.pts.length; i++) {
        const [x, y] = toPt(it.pts[i]);
        ops.push(lineTo(x, y));
      }
      if (it.kind === "polygon") ops.push(closePath());
      ops.push(stroke(), popGraphicsState());
      page.pushOperators(...ops);
      continue;
    }

    if (it.kind === "text") {
      const [x, y] = toPt(it.at);
      page.drawText(String(it.text), {
        x, y, size: it.sizePt ?? 6, font, color: colour(it.colour),
      });
      continue;
    }

    const [x, y] = toPt(it.at);
    const r = it.rMm * PT;
    const ops = [
      pushGraphicsState(),
      setStrokingColor(colour(it.colour)),
      setFillingColor(colour(it.colour)),
      setLineWidth(Math.max(0.05, (it.widthMm ?? 0.25) * PT)),
      setDashPattern([], 0),
    ];
    if (it.kind === "square") {
      ops.push(moveTo(x - r, y - r), lineTo(x + r, y - r),
        lineTo(x + r, y + r), lineTo(x - r, y + r), closePath());
    } else if (it.kind === "diamond") {
      ops.push(moveTo(x, y - r), lineTo(x + r, y),
        lineTo(x, y + r), lineTo(x - r, y), closePath());
    } else {
      /* A disc as an eight-sided path. Béziers would be rounder, but
         they are raw operators pdf-lib does not model, and a 1.4 mm
         symbol on paper is three quarters of a millimetre across \u2014 no
         eye and no plotter can tell the difference. Stated rather than
         left as a curiosity in the output. */
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        ops.push(i === 0 ? moveTo(px, py) : lineTo(px, py));
      }
      ops.push(closePath());
    }
    ops.push(it.fill ? fillAndStroke() : stroke(), popGraphicsState());
    page.pushOperators(...ops);
  }
}

/* Where sheets lap, the shared strip is marked so whoever is trimming
   knows where to cut \u2014 and only on edges that HAVE a neighbour. */
function drawLapMarks(page, plan, tile) {
  if (plan.sheets < 2 || !(plan.overlapMm > 0)) return;
  const m = plan.marginMm * PT;
  const w = plan.printW * PT;
  const h = plan.printH * PT;
  const o = plan.overlapMm * PT;
  const line = (x1, y1, x2, y2) => page.pushOperators(
    pushGraphicsState(),
    setStrokingColor(rgb(0.58, 0.64, 0.72)),
    setLineWidth(0.4), setDashPattern([4, 4], 0),
    moveTo(x1, y1), lineTo(x2, y2), stroke(),
    popGraphicsState(),
  );
  if (tile.col > 0) line(m + o, m, m + o, m + h);
  if (tile.col < plan.cols - 1) line(m + w - o, m, m + w - o, m + h);
  /* The page's y is up, so the row ABOVE this one is at the larger y. */
  if (tile.row > 0) line(m, m + h - o, m + w, m + h - o);
  if (tile.row < plan.rows - 1) line(m, m + o, m + w, m + o);
}

/* A plan with no scale bar is a picture; one with no sheet number is a
   pile of paper nobody can collate. Both go in the margin, the one
   part of the page the drawing never reaches. */
function drawFurniture(page, { plan, tile, title, when }, font) {
  const y = (plan.marginMm / 2 + 1) * PT;
  const ink = rgb(0.28, 0.33, 0.41);
  const size = 7;

  if (title) {
    page.drawText(String(title), { x: plan.marginMm * PT, y, size, font, color: ink });
  }

  const label = `Sheet ${tile.sheet} of ${plan.sheets}`
    + (plan.sheets > 1 ? `  (row ${tile.row + 1}, column ${tile.col + 1})` : "");
  page.drawText(label, {
    x: plan.sheetW * PT / 2 - font.widthOfTextAtSize(label, size) / 2,
    y, size, font, color: ink,
  });

  const right = `1:${plan.scaleDenom}${when ? `  ${when}` : ""}`;
  page.drawText(right, {
    x: (plan.sheetW - plan.marginMm) * PT - font.widthOfTextAtSize(right, size),
    y, size, font, color: ink,
  });

  /* Ten millimetres of paper is a round number of metres at every
     scale this app offers, so the bar is two 10 mm halves labelled
     with what that is on the ground. */
  const barY = (plan.marginMm / 2 + 6) * PT;
  const metres = 10 / (1000 / Number(plan.scaleDenom));
  const x0 = plan.marginMm * PT;
  const seg = 10 * PT;
  page.pushOperators(
    pushGraphicsState(),
    setStrokingColor(ink), setFillingColor(ink), setLineWidth(0.5),
    moveTo(x0, barY), lineTo(x0 + seg, barY), lineTo(x0 + seg, barY + 4),
    lineTo(x0, barY + 4), closePath(), fill(),
    moveTo(x0 + seg, barY), lineTo(x0 + seg * 2, barY),
    lineTo(x0 + seg * 2, barY + 4), lineTo(x0 + seg, barY + 4),
    closePath(), stroke(),
    popGraphicsState(),
  );
  page.drawText("0", { x: x0 - 1, y: barY - 7, size: 5.5, font, color: ink });
  page.drawText(`${metres * 2} m`,
    { x: x0 + seg * 2 - 6, y: barY - 7, size: 5.5, font, color: ink });
}

/* ── The document ──

   Async because the basemap has to be embedded. Returns the bytes, so
   a caller can save them, open them for printing, or hand them to a
   test: saving is a browser act and does not belong in something this
   is expected to be able to check.

   `basemapBytes` is the basemap PDF's own bytes. Fetching is the
   caller's job \u2014 this module has no opinion about URLs, and a test
   should not need a network. */
export async function buildPdf(features, plan, opts = {}) {
  if (!plan || !plan.tiles?.length) return null;
  const pages = planDrawLists(features, plan, opts);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  /* Embedded ONCE and drawn on every sheet. Per page, a nine-sheet set
     would carry nine copies of the basemap. */
  let embedded = null;
  if (opts.basemapBytes && opts.basemap) {
    const [first] = await doc.embedPdf(opts.basemapBytes,
      [Math.max(0, Number(opts.basemap.Pdf_Page || 1) - 1)]);
    embedded = first;
  }

  let missingBasemap = false;
  for (const { tile, items } of pages) {
    const page = doc.addPage([plan.sheetW * PT, plan.sheetH * PT]);
    if (opts.basemap
      && !drawBasemap(page, embedded, { plan, tile, basemap: opts.basemap })) {
      missingBasemap = true;
    }
    drawItems(page, items, plan, font);
    drawLapMarks(page, plan, tile);
    drawFurniture(page, { plan, tile, title: opts.title, when: opts.when }, font);
  }

  const bytes = await doc.save();
  return { bytes, pages: pages.length, missingBasemap };
}

export async function savePdf(features, plan, opts = {}) {
  const out = await buildPdf(features, plan, opts);
  if (!out) return null;
  const url = URL.createObjectURL(new Blob([out.bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename || "drawing.pdf";
  a.click();
  /* Revoked later: doing it immediately cancels the download in some
     browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return out;
}

/* Opened in the viewer's own print dialog rather than printed blindly:
   the tray and the copies are the printer's business, and a PDF
   already laid out to the right sheet size is what makes that dialog
   trustworthy. */
export async function printPdf(features, plan, opts = {}) {
  const out = await buildPdf(features, plan, opts);
  if (!out) return null;
  const url = URL.createObjectURL(new Blob([out.bytes], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return out;
}
