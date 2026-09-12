/* The drawing, printed to a PDF that can be measured.

   A plan that is not to scale is a picture. A jointer holding a rule
   against a sheet marked 1:500 expects two millimetres to be a metre,
   and if it is not, the sheet is worse than no sheet.

   So the first and longest case here measures the paper: two features
   a known distance apart on the ground, and what that distance comes
   to in millimetres on the page. Everything else \u2014 page sizes, sheet
   numbers, the scale bar \u2014 follows from getting that right. */
import { readFileSync } from "node:fs";
import { drawnBounds, mmPerMetre } from "./src/features/gis/printSheet.js";
import { tilePlan } from "./src/features/gis/printTiles.js";
import { pageDrawList } from "./src/features/gis/printVector.js";
import { buildPdf } from "./src/features/gis/printPdf.js";
import { PDFDocument, rgb } from "pdf-lib";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Two points 100 m apart, east-west, and a line between them. */
const A = [1000, 500];
const B = [1100, 500];
const world = [
  { Feature_ID: 1, Feature_Type: "line", Feature_Role: "shape",
    Layer_Key: "trench", Geometry: [A, B],
    Attributes: { Line_Type: "trench_main" } },
  { Feature_ID: 2, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "electric", Label: "Electric Meter 1", Geometry: [A],
    Attributes: {} },
  { Feature_ID: 3, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "electric", Label: "Electric Meter 2", Geometry: [B],
    Attributes: {} },
];
const bounds = drawnBounds(world);

// 1. A metre on the ground is the right number of millimetres on paper.
{
  for (const scaleDenom of [100, 200, 500, 1250]) {
    const plan = tilePlan({ bounds, paper: "A3", landscape: true, scaleDenom });
    const items = pageDrawList(world, plan.tiles[0], {
      scaleDenom, marginMm: plan.marginMm, labels: false,
    });
    const line = items.find((i) => i.kind === "polyline");
    if (!line) { fail(`nothing drawn at 1:${scaleDenom}`); continue; }
    const acrossMm = Math.abs(line.pts[1][0] - line.pts[0][0]);
    const wantMm = 100 * mmPerMetre(scaleDenom);
    if (Math.abs(acrossMm - wantMm) > 0.01) {
      fail(`at 1:${scaleDenom}, 100 m came out ${acrossMm.toFixed(2)} mm on `
        + `paper where ${wantMm.toFixed(2)} was owed \u2014 a rule held against `
        + "this sheet would read the wrong distance");
    }
  }
}

// 2. North stays up. A drawing printed as its own mirror image is the
//    kind of fault only noticed on site.
{
  const north = [{ Feature_ID: 9, Feature_Type: "line", Feature_Role: "shape",
    Layer_Key: "trench", Geometry: [[1000, 400], [1000, 500]],
    Attributes: { Line_Type: "trench_main" } }];
  const b2 = drawnBounds(north);
  const plan = tilePlan({ bounds: b2, paper: "A4", landscape: false, scaleDenom: 500 });
  const items = pageDrawList(north, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, labels: false });
  const line = items.find((i) => i.kind === "polyline");
  /* y grows south on the drawing and down the page, so the point with
     the LARGER ground y must have the larger page y. */
  if (line.pts[1][1] <= line.pts[0][1]) {
    fail("the page is flipped north to south");
  }
}

// 3. Nothing is drawn in the unprintable border.
{
  const plan = tilePlan({ bounds, paper: "A3", landscape: true, scaleDenom: 500 });
  const items = pageDrawList(world, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, labels: false });
  const pts = items.flatMap((i) => (i.pts ? i.pts : [i.at]));
  const m = plan.marginMm;
  for (const [x, y] of pts) {
    if (x < m - 0.01 || y < m - 0.01
      || x > plan.sheetW - m + 0.01 || y > plan.sheetH - m + 0.01) {
      fail(`something is drawn at ${x.toFixed(1)},${y.toFixed(1)} mm, inside `
        + "the border the printer cannot print");
      break;
    }
  }
}

// 4. Only what is on this page is drawn on it.
{
  const far = [...world, { Feature_ID: 20, Feature_Type: "point",
    Feature_Role: "meter", Layer_Key: "electric", Geometry: [[9000, 9000]],
    Attributes: {} }];
  const plan = tilePlan({ bounds, paper: "A4", landscape: true, scaleDenom: 200 });
  const items = pageDrawList(far, plan.tiles[0], {
    scaleDenom: 200, marginMm: plan.marginMm, labels: false });
  if (items.some((i) => Number(i.id) === 20)) {
    fail("a feature nowhere near the page is drawn on it, so every page "
      + "carries the whole site");
  }
}

// 5. Trenches under cables, as on screen.
{
  const mixed = [
    { Feature_ID: 31, Feature_Type: "line", Layer_Key: "electric",
      Feature_Role: "shape", Geometry: [A, B],
      Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 30, Feature_Type: "line", Layer_Key: "trench",
      Feature_Role: "shape", Geometry: [A, B],
      Attributes: { Line_Type: "trench_main" } },
  ];
  const plan = tilePlan({ bounds, paper: "A3", landscape: true, scaleDenom: 500 });
  const items = pageDrawList(mixed, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, labels: false });
  const trenchAt = items.findIndex((i) => Number(i.id) === 30);
  const cableAt = items.findIndex((i) => Number(i.id) === 31);
  if (trenchAt < 0 || cableAt < 0 || trenchAt > cableAt) {
    fail("the cable is drawn under its trench, so the run is hidden");
  }
  /* And points above both, or a symbol is buried under a cable. */
  const pointAt = items.findIndex((i) => i.kind === "disc");
  if (pointAt >= 0 && pointAt < cableAt) {
    fail("symbols are drawn under the cables");
  }
}

// 6. The PDF itself: one page per tile, at the sheet's own size.
{
  const plan = tilePlan({ bounds, paper: "A4", landscape: true, scaleDenom: 100 });
  const out = await buildPdf(world, plan, { title: "Test" });
  if (!out) fail("no document was produced");
  else {
    if (out.pages !== plan.sheets) {
      fail(`${out.pages} pages for a ${plan.sheets}-sheet plan`);
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const read = await pdfjs.getDocument({
      data: new Uint8Array(out.bytes), useSystemFonts: true }).promise;
    if (read.numPages !== plan.sheets) fail("the file has the wrong page count");
    const vp = (await read.getPage(1)).getViewport({ scale: 1 });
    const mm = (pt) => pt * 25.4 / 72;
    if (Math.abs(mm(vp.width) - plan.sheetW) > 0.1
      || Math.abs(mm(vp.height) - plan.sheetH) > 0.1) {
      fail(`the page is ${mm(vp.width).toFixed(1)}x${mm(vp.height).toFixed(1)} mm, `
        + `not the ${plan.sheetW}x${plan.sheetH} the plan was made for`);
    }
    /* Vector, not a picture of the drawing: an image would show up as
       an image XObject and no path construction at all. */
    const ops = await (await read.getPage(1)).getOperatorList();
    const O = pdfjs.OPS;
    const paths = ops.fnArray.filter((f) => f === O.constructPath).length;
    const images = ops.fnArray.filter((f) => f === O.paintImageXObject
      || f === O.paintJpegXObject).length;
    if (!paths) fail("the page carries no paths, so it is not vector");
    if (images) fail("the page carries a raster image, which is what vector "
      + "was chosen instead of");
  }
  if (await buildPdf(world, null) !== null) fail("a document is built with no plan");
}

// 7. A sheet somebody can collate and check.
//
//    Read back through a PDF reader rather than grepped out of the
//    file: the streams are compressed, so the raw bytes contain none
//    of this text. An earlier version of this case searched the output
//    directly and reported the furniture missing when it was there.
{
  const plan = tilePlan({ bounds, paper: "A4", landscape: true, scaleDenom: 100 });
  const out = await buildPdf(world, plan, { title: "Cedar Trees" });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const read = await pdfjs.getDocument({
    data: new Uint8Array(out.bytes), useSystemFonts: true,
  }).promise;

  const textOf = async (n) => {
    const page = await read.getPage(n);
    const c = await page.getTextContent();
    return c.items.map((i) => i.str).join(" ");
  };
  const first = await textOf(1);
  if (!/Sheet 1 of \d+/.test(first)) fail("the sheets are not numbered");
  if (!first.includes("1:100")) fail("the sheet does not say what scale it is at");
  if (!first.includes("Cedar Trees")) fail("the sheet does not carry its title");
  /* The scale bar is labelled with ground distance, because a bar with
     no number on it cannot be used. */
  if (!/\d+ m\b/.test(first)) fail("the scale bar carries no distance");

  /* And the last sheet says which one it is, so a pile of paper can be
     collated. */
  if (read.numPages > 1) {
    const last = await textOf(read.numPages);
    if (!last.includes(`Sheet ${read.numPages} of ${read.numPages}`)) {
      fail("the last sheet does not say which sheet it is");
    }
    if (!/row \d+, column \d+/.test(last)) {
      fail("a tiled sheet does not say where in the grid it belongs");
    }
  }
}

/* ── The basemap lands in register with the drawing ──

   The basemap is a PDF, embedded as a form rather than rasterised, so
   the printed plan is as sharp as the plan it was traced over. That is
   only worth anything if it lands in the right place: a basemap half a
   metre out is worse than no basemap, because the design looks wrong
   rather than the underlay.

   So: a basemap with a mark at a known point on its page,
   georeferenced so that mark IS a ground position, and a feature at
   that same ground position. Both must land on the same millimetre of
   paper.

   Measured by pushing the mark through the transformation matrix the
   finished PDF actually carries \u2014 not by trusting the arithmetic that
   wrote it. */
{
  const W = 1000;
  const H = 700;
  const mark = [200, 150];        /* on the basemap page, from its top-left */

  const bmDoc = await PDFDocument.create();
  const bmPage = bmDoc.addPage([W, H]);
  bmPage.drawLine({ start: { x: mark[0] - 10, y: H - mark[1] },
    end: { x: mark[0] + 10, y: H - mark[1] }, thickness: 2, color: rgb(0.8, 0.2, 0.2) });
  const basemapBytes = await bmDoc.save();

  /* 0.5 m per page unit, page top-left at ground (900, 425). The mark
     is then ground (900 + 200x0.5, 425 + 150x0.5) = (1000, 500). */
  const basemap = { Metres_Per_Pixel: 0.5, Origin_X: 900, Origin_Y: 425,
    Pdf_Page: 1, Opacity: 1 };
  const groundOfMark = [1000, 500];

  const plan = tilePlan({ bounds, paper: "A3", landscape: true, scaleDenom: 500 });
  const out = await buildPdf(world, plan, { basemap, basemapBytes, labels: false });
  if (!out) { fail("nothing was built with a basemap"); }
  else if (out.missingBasemap) {
    fail("the basemap was not placed, so the sheet goes out without its plan");
  } else {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const read = await pdfjs.getDocument({ data: new Uint8Array(out.bytes) }).promise;
    const page = await read.getPage(1);
    const ops = await page.getOperatorList();
    const O = pdfjs.OPS;

    /* The matrix in force when the basemap form is painted. */
    const mul = (a, b) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let formCtm = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === O.save) stack.push(ctm.slice());
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, ops.argsArray[i]);
      else if (fn === O.paintFormXObjectBegin) {
        formCtm = mul(ctm, ops.argsArray[i][0]);
        break;
      }
    }
    if (!formCtm) {
      fail("the basemap is not painted as an embedded form \u2014 it has been "
        + "rasterised, or left out");
    } else {
      const PTmm = 72 / 25.4;
      const u = mark[0];
      const v = H - mark[1];
      const x = formCtm[0] * u + formCtm[2] * v + formCtm[4];
      const y = formCtm[1] * u + formCtm[3] * v + formCtm[5];
      const gotX = x / PTmm;
      const gotY = plan.sheetH - y / PTmm;

      /* Where the drawing puts that ground point. */
      const k = 1000 / plan.scaleDenom;
      const t = plan.tiles[0];
      const wantX = (groundOfMark[0] - t.minX) * k + plan.marginMm;
      const wantY = (groundOfMark[1] - t.minY) * k + plan.marginMm;

      if (Math.abs(gotX - wantX) > 0.05 || Math.abs(gotY - wantY) > 0.05) {
        fail(`the basemap is out of register: its mark lands at `
          + `${gotX.toFixed(2)},${gotY.toFixed(2)} mm where the feature at the `
          + `same ground point is at ${wantX.toFixed(2)},${wantY.toFixed(2)}`);
      }
    }
  }

  /* A basemap with no scale cannot be placed, and the caller is told
     rather than shipping a sheet that quietly has no plan on it. */
  const noScale = await buildPdf(world, plan, {
    basemap: { Metres_Per_Pixel: 0, Origin_X: 0, Origin_Y: 0 }, basemapBytes });
  if (!noScale.missingBasemap) {
    fail("a basemap with no metres-per-unit is reported as placed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The PDF is to scale, one page per sheet, and drawn as vectors.");
process.exit(bad ? 1 : 0);
