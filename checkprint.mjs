/* A plan that is not to scale is a picture.

   A jointer holding a rule against a sheet marked 1:500 expects two
   millimetres to be a metre. If it is not, the sheet is worse than no
   sheet: it is a wrong answer that looks like a right one.

   The arithmetic is the whole feature — 1:N means a metre on the ground
   is 1000/N millimetres on paper — so it is checked as arithmetic,
   against numbers anybody can verify with a calculator. */
import { readFileSync } from "node:fs";
import {
  PAPER, SCALES, mmPerMetre, sheetMm, groundCovered, printView, drawnBounds,
  scaleToFit, tooBig, MAX_SIDE, sheetGrid,
} from "./src/features/gis/printSheet.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// 1. The scale, as a draughtsman would state it.
for (const [n, mm] of [[100, 10], [200, 5], [500, 2], [1000, 1], [1250, 0.8]]) {
  if (!near(mmPerMetre(n), mm)) {
    fail(`1:${n} makes a metre ${mmPerMetre(n)} mm on paper, not ${mm}`);
  }
}

// 2. ISO paper, and the right way round.
{
  if (PAPER.A0[0] !== 841 || PAPER.A0[1] !== 1189) fail("A0 is not 841 x 1189 mm");
  if (PAPER.A4[0] !== 210 || PAPER.A4[1] !== 297) fail("A4 is not 210 x 297 mm");
  /* Each size is the one above, halved. If that stops being true one of
     them has been typed wrong. */
  const order = ["A0", "A1", "A2", "A3", "A4"];
  for (let i = 1; i < order.length; i++) {
    const big = PAPER[order[i - 1]];
    const small = PAPER[order[i]];
    if (!near(small[1], big[0], 1) || !near(small[0], big[1] / 2, 1)) {
      fail(`${order[i]} is not ${order[i - 1]} folded in half`);
    }
  }
  const l = sheetMm("A1", true);
  if (l.w <= l.h) fail("landscape is not wider than it is tall");
}

// 3. A measured distance on the sheet.
//
//    The test a person would do: how many millimetres is a hundred
//    metres, at this scale, on this paper, at this resolution. It must
//    not depend on the resolution — dpi decides sharpness and nothing
//    else, and if it leaks into the scale the sheet is wrong in a way
//    nobody would think to check.
for (const dpi of [96, 150, 300]) {
  for (const [den, want] of [[200, 500], [500, 200], [1250, 80]]) {
    const v = printView({ paper: "A1", landscape: true, scaleDenom: den, dpi });
    const mm = (100 * v.view.scale) / v.pxPerMm;
    if (!near(mm, want, 0.05)) {
      fail(`at ${dpi} dpi, 100 m at 1:${den} prints as ${mm.toFixed(2)} mm, `
        + `not ${want}`);
    }
  }
}

// 4. What a sheet covers, and the fit.
{
  /* A1 landscape at 1:500, less two 10 mm margins: 821 mm across,
     which is 410.5 m. */
  const g = groundCovered("A1", true, 500, 10);
  if (!near(g.w, 410.5, 0.5)) {
    fail(`A1 landscape at 1:500 covers ${g.w.toFixed(1)} m, not 410.5`);
  }

  /* Fit rounds UP to a standard scale: rounding down gives a sheet the
     drawing spills off, and a plan with the corner missing is not a
     plan. */
  const b = { w: 300, h: 200, minX: 0, minY: 0, maxX: 300, maxY: 200, centre: [150, 100] };
  const s = scaleToFit(b, "A1", true);
  if (!SCALES.includes(s)) fail(`fit chose 1:${s}, which is not a standard scale`);
  const cov = groundCovered("A1", true, s);
  if (cov.w < b.w || cov.h < b.h) {
    fail(`fit chose 1:${s}, which covers ${cov.w.toFixed(0)} x ${cov.h.toFixed(0)} m `
      + `for a drawing ${b.w} x ${b.h} m \u2014 the edges would be cut off`);
  }
}

// 5. A sheet too big to draw is refused before it is drawn.
//
//    A canvas over the limit comes back BLANK rather than throwing, and
//    a blank A0 at the printers is an expensive way to find out.
{
  if (!tooBig("A0", true, 300)) {
    fail("A0 at 300 dpi is allowed \u2014 139 megapixels, which a browser will "
      + "usually hand back blank");
  }
  if (tooBig("A0", true, 150)) fail("A0 at 150 dpi is refused, and it should not be");
  if (tooBig("A3", true, 300)) fail("A3 at 300 dpi is refused, and it should not be");
  for (const p of Object.keys(PAPER)) {
    const v = printView({ paper: p, landscape: true, dpi: 150 });
    if (!tooBig(p, true, 150) && (v.widthPx > MAX_SIDE || v.heightPx > MAX_SIDE)) {
      fail(`${p} at 150 dpi passes the check and is over the canvas limit`);
    }
  }
}

// 6. Centred on the work, not on the origin.
{
  const b = drawnBounds([
    { Geometry: [[100, 100], [200, 200]] },
    { Geometry: [[150, 50]] },
  ]);
  if (!b || b.centre[0] !== 150 || b.centre[1] !== 125) {
    fail(`the drawn bounds centre came out ${JSON.stringify(b?.centre)}`);
  }
  if (drawnBounds([]) !== null) fail("an empty drawing reports bounds anyway");

  const v = printView({ paper: "A3", landscape: true, scaleDenom: 500, dpi: 150,
    centre: b.centre });
  /* The centre of the ground lands in the middle of the sheet. */
  const px = { x: b.centre[0] * v.view.scale + v.view.x,
    y: b.centre[1] * v.view.scale + v.view.y };
  if (!near(px.x, v.widthPx / 2, 1) || !near(px.y, v.heightPx / 2, 1)) {
    fail("the drawing is not centred on the sheet");
  }
}

// 7. One renderer, not two.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* The sheet is drawn by the same routine the screen uses. A second
     renderer is a second set of rules about what a joint looks like,
     and the two drift apart on the first change to either. */
  if (!/draw\(\{ canvas: cv, view: pv \}\)/.test(canvas)) {
    fail("the sheet is not drawn by the canvas's own draw routine");
  }
  if (!/const draw = useCallback\(\(over = null\)/.test(canvas)) {
    fail("draw cannot be given somewhere else to draw");
  }
  /* The page is sized in MILLIMETRES. Sized in pixels it would print at
     whatever the browser felt like and the scale would be a lie. */
  if (!/@page\{size:\$\{sheetW\}mm \$\{sheetH\}mm/.test(canvas)) {
    fail("the printed page is not sized in millimetres, so the scale does "
      + "not survive printing");
  }
  if (!/width:\$\{sheetW\}mm;height:\$\{sheetH\}mm/.test(canvas)) {
    fail("the image is not placed at the sheet's own size");
  }
  /* A bar, because "print at 100%" cannot be enforced from here and a
     rule settles it in two seconds. */
  if (!/\$\{barM\} m`/.test(canvas)) {
    fail("the sheet carries no scale bar, so a sheet printed to fit the "
      + "page cannot be told from one printed at 100%");
  }
}

// 8. The sheet is outlined on the drawing before it is printed.
//
//    "What size and what scale" are two questions whose real answer is
//    a rectangle on the ground, and until it was drawn the only way to
//    see whether it covered the work was to print it.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const modal = readFileSync("./src/features/gis/PrintModal.jsx", "utf8");

  if (!/if \(!over && printFrame\) \{/.test(canvas)) {
    fail("the sheet's footprint is never drawn on the canvas");
  }
  /* NOT on the sheet itself. `over` is the print pass, and a printed
     plan with a dashed line round the edge showing where the paper is
     would be a joke at the reader's expense. */
  if (!/!over && printFrame/.test(canvas)) {
    fail("the paper outline is drawn onto the printed sheet as well");
  }
  /* Two edges: the paper, and what lands on it. Drawing only the paper
     promises a margin's worth of coverage the sheet does not have. */
  if (!/printFrame\.paperW/.test(canvas)) {
    fail("only one rectangle is drawn, so the margin is invisible and the "
      + "outline promises coverage the sheet does not have");
  }
  if (!/ctx\.setLineDash\(\[9, 6\]\)/.test(canvas)) {
    fail("the outline is not dashed, so it reads as something drawn");
  }
  /* Reported as the settings change, and cleared when the dialogue
     goes \u2014 an outline left behind is a line somebody would try to
     select. */
  if (!/onFrame\?\.\(\{/.test(modal)) {
    fail("the dialogue does not report its footprint, so the outline cannot "
      + "follow the paper and scale being chosen");
  }
  if (!/useEffect\(\(\) => \(\) => onFrame\?\.\(null\)/.test(modal)) {
    fail("the outline is not cleared when the dialogue closes");
  }
}

// 9. The sheet opens the browser's print dialogue, and says so.
//
//    Which printer, which tray, how many copies belong to the browser
//    and an app cannot reach into that \u2014 so the page has to OPEN the
//    dialogue. Without it the sheet just appeared in a tab: correct, to
//    scale, and with no visible way to get it onto paper.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const modal = readFileSync("./src/features/gis/PrintModal.jsx", "utf8");

  if (!/onclick="window\.print\(\)"/.test(canvas)) {
    fail("the sheet gives no way to reach the print dialogue, which is where "
      + "the printer is chosen");
  }
  /* Screen only. A control bar printed across the top of a drawing
     would be its own kind of wrong. */
  if (!/@media print\{\.bar\{display:none\}/.test(canvas)) {
    fail("the toolbar is printed onto the drawing");
  }
  /* The one thing that cannot be enforced from here, said where it is
     acted on: in the print dialogue itself. */
  if (!/not Fit to page/.test(canvas)) {
    fail("the sheet does not warn that fit-to-page destroys the scale");
  }
  /* And the button says what it does. A button called Print that opens
     a tab is not what the word promises. */
  if (/\{busy \? "Drawing\\u2026" : "Print"\}/.test(modal)) {
    fail("the dialogue's button says Print and does not print");
  }
  if (!/browser&rsquo;s print dialogue/.test(modal)) {
    fail("the dialogue does not say where the printer is chosen, so somebody "
      + "goes looking for a control it cannot have");
  }
}

// 10. More ground than one sheet holds.
//
//     A site at 1:200 does not fit on anything, and the honest answer
//     is several sheets rather than a scale nobody can read.
{
  const b = { w: 368, h: 258, minX: 0, minY: 0, maxX: 368, maxY: 258, centre: [184, 129] };

  /* The grid covers the work, whatever the sheet. */
  for (const [paper, sc] of [["A1", 500], ["A1", 200], ["A3", 200], ["A0", 200]]) {
    const g = sheetGrid({ bounds: b, paper, landscape: true, scaleDenom: sc });
    if (!g) { fail(`no grid for ${paper} 1:${sc}`); continue; }
    if (g.cols * g.cover.w < b.w - 0.01 || g.rows * g.cover.h < b.h - 0.01) {
      fail(`${paper} 1:${sc} gives ${g.cols}x${g.rows} sheets covering `
        + `${(g.cols * g.cover.w).toFixed(0)}x${(g.rows * g.cover.h).toFixed(0)} m `
        + `for a ${b.w}x${b.h} m drawing \u2014 part of it would be missing`);
    }
    /* And not wastefully more than it needs. */
    if ((g.cols - 1) * g.cover.w >= b.w || (g.rows - 1) * g.cover.h >= b.h) {
      fail(`${paper} 1:${sc} uses ${g.count} sheets where fewer would cover it`);
    }
  }

  /* One sheet where one is enough. */
  const one = sheetGrid({ bounds: b, paper: "A1", landscape: true, scaleDenom: 500 });
  if (one.count !== 1) fail(`a drawing that fits one sheet was given ${one.count}`);

  /* Centred on the work, so two sheets sit either side of the middle
     rather than one on it and one mostly empty. */
  const two = sheetGrid({ bounds: b, paper: "A0", landscape: true, scaleDenom: 200 });
  const midX = two.tiles.reduce((n, t) => n + t.centre[0], 0) / two.tiles.length;
  if (Math.abs(midX - b.centre[0]) > 0.5) {
    fail(`the sheets are centred on ${midX.toFixed(1)} rather than on the `
      + `drawing's ${b.centre[0]}`);
  }

  /* Overlap costs sheets, which is the trade being made. */
  const tight = sheetGrid({ bounds: b, paper: "A3", landscape: true, scaleDenom: 200 });
  const lapped = sheetGrid({ bounds: b, paper: "A3", landscape: true,
    scaleDenom: 200, overlapM: 5 });
  if (!(lapped.count >= tight.count)) {
    fail("an overlap took fewer sheets than butting them exactly, which cannot be");
  }

  /* Numbered across then down, the way somebody lays them on a table. */
  if (two.tiles[0].n !== 1 || two.tiles[1].col !== 1 || two.tiles[1].row !== 0) {
    fail("the sheets are not numbered across then down");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* Every sheet drawn on screen before any is printed. */
  if (!/printFrame\.tiles\?\.length > 1/.test(canvas)) {
    fail("only one outline is drawn, so how many sheets and what is on each "
      + "can only be found by printing");
  }
  /* Every sheet rendered, on one canvas: twenty-five A3s at 150 dpi is
     more than a gigabyte if each keeps its own. */
  if (!/for \(const tile of tiles\)/.test(canvas)) {
    fail("only one sheet is rendered");
  }
  if (!/probe\.setTransform\(1, 0, 0, 1, 0, 0\)/.test(canvas)) {
    fail("the canvas is not reset between sheets, so each is drawn over the "
      + "one before it");
  }
  /* One sheet per page, or the browser flows the second onto what is
     left of the first and cuts it in half. */
  if (!/break-after:page/.test(canvas)) {
    fail("the sheets are not forced onto separate pages");
  }
  /* And each says which it is. A pile of A3s with no numbers is a
     puzzle. */
  if (!/sheet \$\{tile\.n\} of \$\{tiles\.length\}/.test(canvas)) {
    fail("the sheets are not numbered on the drawings themselves");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Printing behaves (A4 to A0, and a metre lands where a metre belongs).");
process.exit(bad ? 1 : 0);
