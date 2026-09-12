/* Writing the drawing to a PDF, as vectors.

   ── One page per tile ──

   `tilePlan` decides the grid and `pageDrawList` decides what is on
   each page. This turns those primitives into PDF operators and
   nothing else: no geometry is worked out here, no style is decided
   here. If a line is in the wrong place on paper it is wrong in the
   draw list, and the draw list can be tested without opening a PDF.

   ── Vector, and what that buys ──

   Lines are lines, not pictures of lines. The sheet stays sharp at any
   zoom, a 0.15 mm cable is 0.15 mm rather than three grey pixels, the
   file is a fraction of the size of a rasterised one, and text can be
   searched and selected. It also means the PDF does not carry the
   canvas's exact look: see the note in printVector.js.

   ── Millimetres throughout ──

   jsPDF is created in millimetres, which is the unit the whole of
   printing is reasoned in here: paper is millimetres, the margin is
   millimetres, and the scale is millimetres per metre. Nothing is
   converted twice. */

import { jsPDF } from "jspdf";
import { planDrawLists } from "./printVector.js";

/* #rrggbb to the three numbers jsPDF wants. Anything it cannot read
   comes back as a mid grey rather than black: a wrong colour that
   looks deliberate is worse than one that looks like a default. */
function rgb(hex) {
  const s = String(hex || "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return [100, 116, 139];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ── The sheet's own furniture ──

   A plan with no scale bar is a picture. A plan with no sheet number
   is a pile of paper nobody can collate. Both go in the margin, which
   is the one part of the page the drawing never reaches.

   Drawn last so nothing covers them, and in the unprintable border's
   inner edge so a printer that loses a little more than 5 mm still
   shows them. */
function drawFurniture(doc, { plan, tile, title, scaleDenom, when }) {
  const { sheetW, sheetH, marginMm } = plan;
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);

  const y = sheetH - marginMm / 2 - 1;
  if (title) doc.text(String(title), marginMm, y);

  const sheetOf = `Sheet ${tile.sheet} of ${plan.sheets}`
    + (plan.sheets > 1 ? `  (row ${tile.row + 1}, column ${tile.col + 1})` : "");
  doc.text(sheetOf, sheetW / 2, y, { align: "center" });

  doc.text(`1:${scaleDenom}${when ? `  ${when}` : ""}`, sheetW - marginMm, y,
    { align: "right" });

  /* ── The scale bar ──

     Ten millimetres of paper is a round number of metres at every
     scale this app offers, so the bar is drawn as two 10 mm halves and
     labelled with what that is on the ground. A bar somebody can hold
     a rule against is the point of printing to scale at all. */
  const barY = sheetH - marginMm / 2 - 6;
  const metres = 10 / (1000 / Number(scaleDenom));
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.2);
  doc.setFillColor(71, 85, 105);
  doc.rect(marginMm, barY - 1.4, 10, 1.4, "F");
  doc.rect(marginMm + 10, barY - 1.4, 10, 1.4, "S");
  doc.setFontSize(5.5);
  doc.text("0", marginMm, barY + 2.4, { align: "center" });
  doc.text(`${metres * 2} m`, marginMm + 20, barY + 2.4, { align: "center" });
}

/* ── The overlap, marked ──

   Where sheets lap, the shared strip is drawn as a faint dashed line
   so whoever is trimming knows where to cut. Only on the edges that
   HAVE a neighbour: a mark on the outside edge of the grid would send
   somebody trimming a margin that is not shared with anything. */
function drawLapMarks(doc, { plan, tile }) {
  if (plan.sheets < 2 || !(plan.overlapMm > 0)) return;
  const { marginMm, printW, printH, overlapMm } = plan;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.5, 1.5], 0);

  if (tile.col > 0) {
    const x = marginMm + overlapMm;
    doc.line(x, marginMm, x, marginMm + printH);
  }
  if (tile.col < plan.cols - 1) {
    const x = marginMm + printW - overlapMm;
    doc.line(x, marginMm, x, marginMm + printH);
  }
  if (tile.row > 0) {
    const y = marginMm + overlapMm;
    doc.line(marginMm, y, marginMm + printW, y);
  }
  if (tile.row < plan.rows - 1) {
    const y = marginMm + printH - overlapMm;
    doc.line(marginMm, y, marginMm + printW, y);
  }
  doc.setLineDashPattern([], 0);
}

/* Draw one page's primitives. Nothing here decides anything: it is a
   translation, one primitive at a time. */
function drawItems(doc, items) {
  for (const it of items) {
    if (it.kind === "polyline" || it.kind === "polygon") {
      if (!it.pts || it.pts.length < 2) continue;
      const [r, g, b] = rgb(it.colour);
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(it.widthMm);
      doc.setLineDashPattern(it.dashMm || [], 0);
      /* `lines` takes deltas from a start point, which is how jsPDF
         draws a path in one operator rather than one per segment. */
      const start = it.pts[0];
      const deltas = [];
      for (let i = 1; i < it.pts.length; i++) {
        deltas.push([it.pts[i][0] - it.pts[i - 1][0],
          it.pts[i][1] - it.pts[i - 1][1]]);
      }
      doc.lines(deltas, start[0], start[1], [1, 1],
        it.kind === "polygon" ? "S" : "S", it.kind === "polygon");
      doc.setLineDashPattern([], 0);
      continue;
    }
    if (it.kind === "text") {
      const [r, g, b] = rgb(it.colour);
      doc.setTextColor(r, g, b);
      doc.setFontSize(it.sizePt ?? 6);
      doc.text(it.text, it.at[0], it.at[1]);
      continue;
    }
    /* The symbols. */
    const [r, g, b] = rgb(it.colour);
    doc.setDrawColor(r, g, b);
    doc.setFillColor(r, g, b);
    doc.setLineWidth(it.widthMm ?? 0.25);
    const [x, y] = it.at;
    const rr = it.rMm;
    const style = it.fill ? "FD" : "S";
    if (it.kind === "square") {
      doc.rect(x - rr, y - rr, rr * 2, rr * 2, style);
    } else if (it.kind === "diamond") {
      doc.lines([[rr, rr], [-rr, rr], [-rr, -rr], [rr, -rr]],
        x, y - rr, [1, 1], style, true);
    } else {
      doc.circle(x, y, rr, style);
    }
  }
}

/* ── The document ──

   Returns the jsPDF instance rather than saving it, so a caller can
   save it, open it for printing, or hand it to a test. Saving is a
   browser act and does not belong in something this is expected to be
   able to check. */
export function buildPdf(features, plan, opts = {}) {
  if (!plan || !plan.tiles?.length) return null;
  const pages = planDrawLists(features, plan, opts);

  const doc = new jsPDF({
    unit: "mm",
    format: [plan.sheetW, plan.sheetH],
    orientation: plan.sheetW >= plan.sheetH ? "landscape" : "portrait",
    compress: true,
  });

  pages.forEach(({ tile, items }, i) => {
    if (i > 0) {
      doc.addPage([plan.sheetW, plan.sheetH],
        plan.sheetW >= plan.sheetH ? "landscape" : "portrait");
    }
    drawItems(doc, items);
    drawLapMarks(doc, { plan, tile });
    drawFurniture(doc, {
      plan,
      tile,
      title: opts.title,
      scaleDenom: plan.scaleDenom,
      when: opts.when,
    });
  });

  return doc;
}

/* What the two buttons do. Kept here so the modal has no PDF in it at
   all, and so "save" and "print" cannot drift into producing different
   documents \u2014 they are the same document, handled two ways. */
export function savePdf(features, plan, opts = {}) {
  const doc = buildPdf(features, plan, opts);
  if (!doc) return false;
  doc.save(opts.filename || "drawing.pdf");
  return true;
}

export function printPdf(features, plan, opts = {}) {
  const doc = buildPdf(features, plan, opts);
  if (!doc) return false;
  /* Opened in the viewer's own print dialog rather than printed
     blindly: the paper size, tray and copies are the printer's
     business, and a PDF that has already been laid out to the right
     sheet size is what makes that dialog trustworthy. */
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url, "_blank");
  return true;
}
