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
  /* Every point the page draws, whatever primitive carries it. A
     symbol arrives as recorded subpaths rather than a centre and a
     radius, so this checks the ink itself rather than a point it is
     drawn around \u2014 a 3 mm square whose corner crosses the border is
     caught where a centre test would have passed it. */
  const pts = items.flatMap((i) => {
    if (i.pts) return i.pts;
    if (i.subs) return i.subs.flatMap((sub) => sub.pts || []);
    return i.at ? [i.at] : [];
  });
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

/* ── A rotated or cropped basemap page still lands in register ──

   A PDF page can differ from its own content stream in two ways a
   viewer silently corrects: a /Rotate attribute \u2014 routine on landscape
   scans and OS extracts \u2014 and a CropBox offset from the MediaBox. The
   screen honours both, so the drawing was traced over the CORRECTED
   page; a print that embeds the raw content stream comes out a quarter
   turn from the features over it, which is the fault this case was
   written against.

   The mark's on-screen position is asked of pdf.js itself
   (convertToViewportPoint), the same engine that renders the canvas \u2014
   not computed from the arithmetic the print uses, or the check would
   inherit the print's mistake. */
{
  const { degrees: deg } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];

  const cases = [
    { name: "/Rotate 0", rotate: 0 },
    { name: "/Rotate 90", rotate: 90 },
    { name: "/Rotate 180", rotate: 180 },
    { name: "/Rotate 270", rotate: 270 },
    { name: "an offset CropBox", rotate: 0, crop: [40, 30, 700, 500] },
    { name: "/Rotate 90 with an offset CropBox",
      rotate: 90, crop: [40, 30, 700, 500] },
  ];

  for (const c of cases) {
    const W = 1000;
    const H = 700;
    const markNative = [260, 210];      /* absolute page user space, y up */

    const bmDoc = await PDFDocument.create();
    const bmPage = bmDoc.addPage([W, H]);
    bmPage.drawLine({ start: { x: markNative[0] - 10, y: markNative[1] },
      end: { x: markNative[0] + 10, y: markNative[1] },
      thickness: 2, color: rgb(0.8, 0.2, 0.2) });
    if (c.crop) bmPage.setCropBox(...c.crop);
    bmPage.setRotation(deg(c.rotate));
    const bytes = await bmDoc.save();

    /* Where the screen shows the mark: pdf.js's answer, in displayed
       page units from the displayed top-left. */
    const shown = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const vp = (await shown.getPage(1)).getViewport({ scale: 1 });
    const [dx, dy] = vp.convertToViewportPoint(markNative[0], markNative[1]);

    /* Georeference the displayed page and stand a feature on the
       mark's ground position. */
    const mpp = 0.5;
    const origin = [900, 425];
    const ground = [origin[0] + dx * mpp, origin[1] + dy * mpp];
    const basemap = { Metres_Per_Pixel: mpp, Origin_X: origin[0],
      Origin_Y: origin[1], Pdf_Page: 1, Opacity: 1 };
    const world2 = [
      { Feature_ID: 1, Feature_Type: "line", Feature_Role: "shape",
        Layer_Key: "trench", Geometry: [ground, [ground[0] + 40, ground[1]]],
        Attributes: { Line_Type: "trench_main" } },
    ];
    const b2 = drawnBounds(world2);
    const plan2 = tilePlan({ bounds: b2, paper: "A3", landscape: true,
      scaleDenom: 500 });

    const out = await buildPdf(world2, plan2,
      { basemap, basemapBytes: bytes, labels: false });
    if (!out || out.missingBasemap) {
      fail(`with ${c.name}, the basemap was not placed at all`);
      continue;
    }

    const read = await pdfjs.getDocument({ data: new Uint8Array(out.bytes) }).promise;
    const ops = await (await read.getPage(1)).getOperatorList();
    const O = pdfjs.OPS;
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
      fail(`with ${c.name}, the basemap is not painted as an embedded form`);
      continue;
    }

    /* The mark, pushed through the matrix the finished sheet carries.
       The form's own /Matrix is folded into formCtm, so the point goes
       in as absolute page user space \u2014 the same coordinates pdf.js was
       asked about. */
    const PTmm = 72 / 25.4;
    const sx = formCtm[0] * markNative[0] + formCtm[2] * markNative[1] + formCtm[4];
    const sy = formCtm[1] * markNative[0] + formCtm[3] * markNative[1] + formCtm[5];
    const gotX = sx / PTmm;
    const gotY = plan2.sheetH - sy / PTmm;

    const k = 1000 / plan2.scaleDenom;
    const t = plan2.tiles[0];
    const wantX = (ground[0] - t.minX) * k + plan2.marginMm;
    const wantY = (ground[1] - t.minY) * k + plan2.marginMm;

    if (Math.abs(gotX - wantX) > 0.05 || Math.abs(gotY - wantY) > 0.05) {
      fail(`with ${c.name}, the basemap is out of register: its mark lands `
        + `at ${gotX.toFixed(2)},${gotY.toFixed(2)} mm where the feature on `
        + `the same ground point is at ${wantX.toFixed(2)},${wantY.toFixed(2)} `
        + "\u2014 the underlay prints turned or shifted from the drawing "
        + "traced over it");
    }
  }
}

/* ── The sheet writes the labels the screen writes, and only those ──

   The canvas never writes a generic label against a meter, a span node
   or a feeder point, and everything else answers to the master Labels
   layer and the per-kind switches. The print's label pass ignored all
   of it and wrote every feature's Label \u2014 so a sheet came out with
   "Water Meter 19" down every street on a drawing that had never shown
   that text to anyone. These cases hold the paper to the screen's own
   rule, through the one module that states it. */
{
  const mk = (id, role, label, layer = "water", extra = {}) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: role,
    Layer_Key: layer, Label: label, Geometry: [[1000 + id, 500]],
    Attributes: {}, ...extra });
  const pts = [
    mk(1, "meter", "Water Meter 19"),
    mk(2, "spannode", "S3", "trench"),
    mk(3, "feederpoint", "A4", "electric"),
    mk(4, "joint", "Service Joint", "electric"),
    mk(5, "valve", "SV 10"),
  ];
  const b = drawnBounds(pts);
  const plan = tilePlan({ bounds: b, paper: "A4", landscape: true,
    scaleDenom: 500 });
  const texts = (opts) => pageDrawList(pts, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, ...opts,
  }).filter((i) => i.kind === "text").map((i) => i.text);

  /* Defaults: the roles the screen never labels stay unlabelled, a
     joint obeys its switch's default (off), and an ordinary point
     follows the master alone. */
  const got = texts({});
  for (const [what, t] of [["a meter", "Water Meter 19"],
    ["a span node", "S3"], ["a feeder point", "A4"]]) {
    if (got.includes(t)) {
      fail(`${what}'s label is written on the sheet \u2014 text the screen `
        + "never shows anyone");
    }
  }
  if (got.includes("Service Joint")) {
    fail("a joint's label prints with the Joint labels switch off \u2014 the "
      + "sheet ignores the switch the screen obeys");
  }
  if (!got.includes("SV 10")) {
    fail("an ordinary point's label is missing with the master switch on");
  }

  /* The joints switch turned on writes the joint's name, as on screen. */
  if (!texts({ labelKinds: { joints: true } }).includes("Service Joint")) {
    fail("turning the Joint labels switch on does not put the name on paper");
  }

  /* The master off silences the lot. */
  if (texts({ showLabels: false }).length) {
    fail("the master Labels switch off still leaves labels on the sheet");
  }
}

/* ── The sheet is drawn to the operator's standard the screen is ──

   An operator-scoped style rule is the strongest claim in the cascade
   (weight 32): drawing to that operator's standard is the whole point
   of choosing one. The print resolved styles with no operator at all,
   so every org-scoped rule silently fell away and the sheet showed the
   base styles under a drawing that looked quite different on screen \u2014
   the wrong drawing to hand to that operator's inspector. */
{
  const main = [{ Feature_ID: 1, Feature_Type: "line", Feature_Role: "shape",
    Layer_Key: "water", Geometry: [[1000, 500], [1100, 500]],
    Attributes: { Line_Type: "water_main" } }];
  const styles = [
    { GIS_Style_ID: 1, Style_Name: "Water Main", Line_Type: "water_main",
      Layer_Key: "water", Colour: "#2ccc00", Dashed: true, Width_Px: 3.5 },
    { GIS_Style_ID: 2, Style_Name: "Operator water", Line_Type: "water_main",
      Organisation_ID: 7, Colour: "#9333ea", Dashed: false, Width_Px: 1.5 },
  ];
  const b = drawnBounds(main);
  const plan = tilePlan({ bounds: b, paper: "A4", landscape: true,
    scaleDenom: 500 });
  const lineOf = (opts) => pageDrawList(main, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, labels: false, styles, ...opts,
  }).find((i) => i.kind === "polyline");

  /* No standard chosen: the base rule stands and the operator's does
     not apply \u2014 exactly as the canvas resolves with none chosen. */
  const base = lineOf({});
  if (!base || base.colour !== "#2ccc00" || !base.dashMm) {
    fail("with no operator standard, the sheet does not draw the base "
      + "style the screen draws");
  }
  /* The operator's standard chosen: their rule outranks the base one
     on paper as it does on screen. */
  const org = lineOf({ organisationId: 7 });
  if (!org || org.colour !== "#9333ea" || org.dashMm) {
    fail("with an operator standard chosen, the sheet ignores the "
      + "operator's rule and prints the base style \u2014 the drawing on "
      + "paper is not the drawing on screen");
  }
  /* A different operator's standard: rule scoped to another does not
     bleed across. */
  const other = lineOf({ organisationId: 9 });
  if (!other || other.colour !== "#2ccc00") {
    fail("an operator's rule applies under a different operator's "
      + "standard");
  }
}

/* ── The symbol on the sheet is the symbol on the screen ──

   The point pass drew a shape looked up from a table of roles kept in
   printVector, so the style cascade decided what a point looked like
   on screen and a hard-coded map decided it on paper. A service valve
   had no row in that map and printed as a filled disc where the screen
   showed a bar across the main \u2014 which is what was reported. */
{
  const pipe = { Feature_ID: 1, Feature_Type: "line", Layer_Key: "water",
    Geometry: [[1000, 500], [1100, 500]],
    Attributes: { Line_Type: "water_main", Size: "63mm" } };
  const meter = { Feature_ID: 2, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "water", Label: "M1", Geometry: [[1020, 500]] };
  const valve = { Feature_ID: 3, Feature_Type: "point",
    Feature_Role: "servicevalve", Layer_Key: "water", Label: "SV 10",
    Geometry: [[1050, 500]], Attributes: { Angle_Deg: 0 } };
  const styles = [
    { GIS_Style_ID: 1, Style_Name: "Meter", Feature_Role: "meter",
      Symbol: "square", Symbol_Size_Px: 8, Colour: "#2ccc00" },
  ];
  const world = [pipe, meter, valve];
  const plan = tilePlan({ bounds: drawnBounds(world), paper: "A3",
    landscape: true, scaleDenom: 500 });
  const items = pageDrawList(world, plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, styles, labels: false });

  const shapeOf = (id) => items.find((i) => i.kind === "paths" && i.id === id);

  /* A meter whose style says square prints a square: four corners,
     closed, not a twelve-sided ring. */
  const m = shapeOf(2);
  if (!m) {
    fail("a meter draws no symbol on the sheet at all");
  } else {
    const pts = m.subs[0]?.pts ?? [];
    if (pts.length !== 4 || !m.subs[0].closed) {
      fail(`a meter styled as a square prints a ${pts.length}-point shape \u2014 `
        + "the sheet is not drawing the style's symbol");
    }
    if (m.colour !== "#2ccc00") fail("the symbol ignores the style's colour");
  }

  /* A service valve prints as a bar across its pipe, a metre of ground
     wide, not as a disc. */
  const v = shapeOf(3);
  if (!v) {
    fail("a service valve draws nothing on the sheet");
  } else {
    const pts = v.subs[0]?.pts ?? [];
    if (pts.length !== 2 || v.fill) {
      fail("a service valve prints as a filled blob rather than a bar "
        + "across the main \u2014 the reported fault");
    } else {
      const k = mmPerMetre(500);
      const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      if (Math.abs(len - k) > 0.05) {
        fail(`the valve bar is ${len.toFixed(2)} mm where a metre of ground `
          + `is ${k.toFixed(2)} mm`);
      }
      /* Square to a pipe running east: the bar runs north-south. */
      if (Math.abs(pts[1][0] - pts[0][0]) > 0.01) {
        fail("the valve bar is not square to the pipe it sits in");
      }
    }
  }

  /* And the old role table is gone, not merely bypassed. */
  const src = readFileSync("./src/features/gis/printVector.js", "utf8");
  if (/const SHAPE = \{/.test(src)) {
    fail("the role-to-shape table survives \u2014 a second opinion about what "
      + "a point looks like, which is the drift this file warns about");
  }
}

/* A stroke-only symbol is not filled, and a bottle end keeps its
   bars: filling an open path paints a wedge between its ends. */
{
  const cross = { Feature_ID: 7, Feature_Type: "point", Feature_Role: "poc",
    Layer_Key: "electric", Geometry: [[1000, 500]] };
  const styles = [{ GIS_Style_ID: 1, Style_Name: "POC", Feature_Role: "poc",
    Symbol: "cross", Symbol_Size_Px: 9 }];
  const plan = tilePlan({ bounds: drawnBounds([cross]), paper: "A4",
    landscape: true, scaleDenom: 500 });
  const [item] = pageDrawList([cross], plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, styles, labels: false });
  if (!item || item.kind !== "paths") {
    fail("a cross-styled point draws nothing");
  } else if (item.fill) {
    fail("a cross is filled \u2014 it has no inside, and filling one paints a "
      + "triangle across the symbol");
  } else if (item.subs.length !== 2) {
    fail("a cross prints as one stroke rather than two");
  }
}

/* ── Mains and services are named on the sheet ──

   The sheet labelled points and skipped every line, so a drawing went
   out with its pipes and cables anonymous. The switches that decide
   this are the screen's own, already honoured; this holds that a line
   whose labels are switched ON is actually written. */
{
  const main = { Feature_ID: 11, Feature_Type: "line", Layer_Key: "water",
    Label: "W1", Geometry: [[1000, 500], [1100, 500]],
    Attributes: { Line_Type: "water_main", Size: "63mm" } };
  const lineTypes = [{ Type_Key: "water_main", Label: "Water Main",
    Layer_Key: "water" }];
  const plan = tilePlan({ bounds: drawnBounds([main]), paper: "A3",
    landscape: true, scaleDenom: 500 });
  const at = (opts) => pageDrawList([main], plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, lineTypes, ...opts,
  }).filter((i) => i.kind === "text");

  /* With the Mains labels switch ON, as the screen has it when
     somebody turns that layer on. */
  const kinds = { mains: true, services: true, joints: false, levels: true };
  const on = at({ labelKinds: kinds });
  if (!on.length) {
    fail("a water main prints with no label at all \u2014 the sheet names its "
      + "points and leaves every pipe anonymous");
  } else {
    if (!on.some((t) => /63mm/.test(t.text))) {
      fail("the main's label does not say what size it is, which is the "
        + "figure somebody orders from");
    }
    /* Half way ALONG the run: a 100 m pipe at 1:500 is 200 mm of paper,
       so its midpoint is 100 mm in from the first vertex. */
    const mid = plan.marginMm + 100 * mmPerMetre(500);
    if (on.some((t) => Math.abs(t.at[0] - mid) > 6)) {
      fail("the label is not set half way along the run");
    }
  }

  /* And it answers to the screen's switch, like everything else. */
  const off = at({ labelKinds: kinds, showLabels: false });
  /* And to its own kind switch, not just the master one. */
  const kindOff = at({ labelKinds: { ...kinds, mains: false } });
  if (kindOff.length) {
    fail("a main is labelled on paper with Mains labels switched off");
  }
  if (off.length) {
    fail("a line is labelled on paper with the screen's labels switched "
      + "off \u2014 the sheet is deciding for itself again");
  }
}

/* ── A symbol's size clamps are pixels, and the sheet is millimetres ──

   `appearance` holds a scaled symbol between Min_Symbol_Px and
   Max_Symbol_Px \u2014 screen pixels, by their names. The print hands it
   millimetres-per-metre as its scale, so the figure that came back was
   millimetres held between PIXEL bounds: a floor meant to keep a meter
   visible at site zoom became a floor of 8 mm on paper, and every meter
   printed as a centimetre-wide blob over the plot it belonged to. */
{
  const meter = { Feature_ID: 21, Feature_Type: "point",
    Feature_Role: "meter", Layer_Key: "water", Geometry: [[1000, 500]] };
  const styles = [{ GIS_Style_ID: 1, Style_Name: "Meter",
    Feature_Role: "meter", Symbol: "circle", Scale_Symbol: true,
    Symbol_Size_M: 0.6, Min_Symbol_Px: 8, Max_Symbol_Px: 24 }];
  const plan = tilePlan({ bounds: drawnBounds([meter]), paper: "A3",
    landscape: true, scaleDenom: 500 });
  const [item] = pageDrawList([meter], plan.tiles[0], {
    scaleDenom: 500, marginMm: plan.marginMm, styles, labels: false });
  const k = mmPerMetre(500);
  const c = [(1000 - plan.tiles[0].minX) * k + plan.marginMm,
    (500 - plan.tiles[0].minY) * k + plan.marginMm];
  const r = Math.max(...item.subs[0].pts.map(([x, y]) =>
    Math.hypot(x - c[0], y - c[1])));

  /* A plan symbol is a couple of millimetres across. Anything past
     four is the pixel floor leaking into paper units. */
  if (r * 2 > 4) {
    fail(`a meter prints ${(r * 2).toFixed(1)} mm across \u2014 the symbol's `
      + "pixel clamps are being applied to millimetres");
  }
  /* And still drawn: a clamp converted the wrong way in the other
     direction would vanish it. */
  if (r < 0.2) fail("a meter prints too small to see");
}

/* ── A label moved by hand stays moved on paper ──

   Placements live in Attributes.Labels as points and offsets in
   METRES, which is what lets them mean the same thing at every zoom
   and every sheet scale. A print that ignored them would snap every
   arranged tag back to the middle of its run — undoing, on the sheet,
   the arranging somebody did precisely so the sheet could be read. */
{
  const main = { Feature_ID: 31, Feature_Type: "line", Layer_Key: "water",
    Label: "W1", Geometry: [[1000, 500], [1100, 500]],
    Attributes: { Line_Type: "water_main", Size: "63mm" } };
  const lineTypes = [{ Type_Key: "water_main", Layer_Key: "water" }];
  const kinds = { mains: true, services: true, joints: false, levels: true };
  const k = mmPerMetre(500);
  const plan = tilePlan({ bounds: drawnBounds([main]), paper: "A3",
    landscape: true, scaleDenom: 500 });
  const textAt = (attrs) => pageDrawList(
    [{ ...main, Attributes: { ...main.Attributes, ...attrs } }],
    plan.tiles[0],
    { scaleDenom: 500, marginMm: plan.marginMm, lineTypes, labelKinds: kinds },
  ).filter((i) => i.kind === "text");

  const auto = textAt({});
  const moved = textAt({ Labels: [{ at: [1020, 480] }] });
  if (!moved.length) {
    fail("a line with a hand-placed label prints no label at all");
  } else {
    const wantX = (1020 - plan.tiles[0].minX) * k + plan.marginMm;
    const wantY = (480 - plan.tiles[0].minY) * k + plan.marginMm;
    if (Math.abs(moved[0].at[0] - wantX) > 2 || Math.abs(moved[0].at[1] - wantY) > 4) {
      fail("a label moved by hand prints back at the middle of its run \u2014 "
        + "the sheet undoes the arranging it was made for");
    }
    if (Math.abs(moved[0].at[0] - auto[0].at[0]) < 1) {
      fail("moving a label changes nothing on the sheet");
    }
  }

  /* An offset is metres of ground too, so it scales with the sheet. */
  const off = textAt({ Labels: [{ at: [1020, 480], off: [4, 0] }] });
  if (off.length && Math.abs(off[0].at[0] - moved[0].at[0] - 4 * k) > 0.5) {
    fail("a label's offset is not read as metres of ground");
  }

  /* Several placements are several labels, not one drawn twice. A tag
     is more than one row — the size over the length — so the count is
     of rows carrying the size, not of text items. */
  const two = textAt({ Labels: [{ at: [1020, 500] }, { at: [1080, 500] }] });
  const sizeRows = two.filter((t) => /63mm/.test(t.text));
  if (sizeRows.length !== 2) {
    fail(`two hand-placed labels print as ${sizeRows.length} \u2014 a run can `
      + "carry more than one tag");
  }
}

/* ── Wired up, and the old path gone ──

   The browser's own print of a canvas was a picture of the drawing at
   whatever resolution the screen happened to be. Leaving it beside the
   new one would be two ways to print that disagree about what comes
   out, so it is removed rather than kept as a fallback. */
{
  const modal = readFileSync("./src/features/gis/PrintModal.jsx", "utf8");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* The dialogue costs every paper size rather than asking for one. */
  if (!/paperOptions\(/.test(modal)) {
    fail("the print dialogue does not cost the paper sizes, so the question "
      + "it exists to answer is still asked by eye");
  }
  /* And opens on the cheapest, or it is a list nobody reads. */
  if (!/paperOptions\(\{ bounds: b, scaleDenom: 500 \}\)\[0\]/.test(modal)) {
    fail("the dialogue opens on a guessed paper size rather than the "
      + "cheapest one");
  }
  /* The overlay is fed the real tiles, so what is previewed is what is
     printed. */
  if (!/tiles: plan\.tiles\.map/.test(modal)) {
    fail("the sheets drawn on the canvas do not come from the plan that is "
      + "printed, so the preview and the PDF can disagree");
  }
  /* Both margins are asked for, and named for what they are. */
  if (!/Printer border/.test(modal) || !/Sheet overlap/.test(modal)) {
    fail("the printer's border and the sheet overlap are not asked "
      + "separately, which is how a seam comes out wrong");
  }

  /* The canvas builds a PDF, and fetches the basemap for it. */
  if (!/savePdf\(src, plan, await pdfOptions\(\)\)/.test(canvas)) {
    fail("Save PDF does not go through the PDF writer");
  }
  if (!/basemapBytes: await basemapBytes\(\)/.test(canvas)) {
    fail("the basemap is never fetched, so every sheet goes out without it");
  }
  /* The flats on a board are on the sheet too: the same assumed meters
     the build and the report work from. */
  /* The flats on a board are on the sheet too: the same assumed meters
     the build and the report work from.

     Sliced to the two print handlers rather than searched for across
     the file, because `withAssumedMeters` has other callers \u2014 the
     levels and the circuit report among them \u2014 that rightly read the
     raw drawing, and a match on one of those would pass this check
     while the print read the wrong set. */
  const from = canvas.indexOf("const savePdfSheets");
  const upto = canvas.indexOf("Putting a suggested change on the drawing");
  const handlers = from >= 0 && upto > from ? canvas.slice(from, upto) : "";
  if (!handlers) {
    fail("the print handlers cannot be found where they were \u2014 this check "
      + "needs re-anchoring, not deleting");
  }
  if (!/withAssumedMeters\(visible, \{[\s\S]{0,400}nrsSubTypes/.test(handlers)) {
    fail("the sheets are drawn without a board's flats and landlord "
      + "supplies, or from a set other than the visible one");
  }
  /* ── The print is of the drawing as shown ──

     Hidden layers, an isolated circuit or way, the lighting view and
     the live-trench filter are all answered by the canvas's `visible`
     set, and the print must read THAT set: a print of the raw drawing
     puts every hidden layer back on paper, and isolating one circuit
     to issue its plan prints the whole estate. */
  if (/withAssumedMeters\(features/.test(handlers)) {
    fail("a print handler reads the raw drawing, so hidden layers and "
      + "isolates print anyway");
  }
  /* And the dialogue costs its paper over the same set, or sheets are
     framed and priced for lines that will not be on them. */
  if (!/<PrintModal features=\{visible\}/.test(canvas)) {
    fail("the print dialogue is fed the raw drawing, so hidden geometry "
      + "stretches the sheet count and the frames drawn on the canvas");
  }
  /* The screen's label switches travel with the print, or the sheet
     re-decides what is labelled and writes text the screen never
     shows. */
  if (!/showLabels,\s*\n\s*labelKinds,/.test(canvas)) {
    fail("the print options do not carry the screen's label switches, so "
      + "the sheet labels by rules of its own");
  }
  /* And the operator standard, or every org-scoped rule falls off the
     sheet. */
  if (!/organisationId: standard \|\| null/.test(canvas)) {
    fail("the print options do not carry the operator standard, so a "
      + "drawing worked to an operator's rules prints the base styles");
  }
  /* And the raster path is gone. */
  if (/printView\(/.test(canvas)) {
    fail("the old canvas-to-image print is still wired up, so there are two "
      + "ways to print that disagree about what comes out");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The PDF is to scale, one page per sheet, and drawn as vectors.");
process.exit(bad ? 1 : 0);
