/* How many sheets, of which paper, and where each one sits.

   The designer's question before printing is always the same: what do
   I print this on, and how few sheets can I get away with. It cannot
   be answered by eye, and getting it wrong is a pile of paper that has
   to be thrown away.

   Two margins, and they are different things. `marginMm` is what the
   printer cannot print into — a fact about the machine. `overlapMm` is
   how much ground two neighbouring sheets share — a decision about how
   they will be joined. Confusing them is how a plan comes out with a
   white line down every seam, or with 5 mm of drawing missing at each
   one. */
import { tilePlan, paperOptions, bestPaper, tilesAcross } from
  "./src/features/gis/printTiles.js";
import { mmPerMetre } from "./src/features/gis/printSheet.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const box = (w, h, x = 0, y = 0) =>
  ({ minX: x, minY: y, maxX: x + w, maxY: y + h, w, h });

// 1. One sheet where it fits, and the count where it does not.
{
  /* A3 landscape is 420 x 297; less 5 mm each side, 410 x 287 of
     printable paper. At 1:500 that is 205 m by 143.5 m of ground. */
  const fits = tilePlan({ bounds: box(200, 140), paper: "A3", landscape: true,
    scaleDenom: 500 });
  if (fits.sheets !== 1) fail(`200x140 m at 1:500 on A3 takes ${fits.sheets} sheets, not 1`);

  const over = tilePlan({ bounds: box(210, 140), paper: "A3", landscape: true,
    scaleDenom: 500 });
  if (over.cols !== 2 || over.rows !== 1) {
    fail(`210 m wide should spill onto a second column, got ${over.cols}x${over.rows}`);
  }
}

// 2. The overlap is real, and it is in millimetres of PAPER.
{
  const p = tilePlan({ bounds: box(100, 20), paper: "A4", landscape: true,
    scaleDenom: 100, overlapMm: 10 });
  const [a, b] = p.tiles;
  if (!b) fail("100 m at 1:100 on A4 does not tile at all");
  else {
    const sharedM = a.maxX - b.minX;
    const sharedMm = sharedM * mmPerMetre(100);
    if (Math.abs(sharedMm - 10) > 0.01) {
      fail(`neighbouring sheets share ${sharedMm.toFixed(2)} mm, not the 10 asked for`);
    }
  }
  /* And at a different scale the same 10 mm is a different distance on
     the ground, which is the point of it being a paper measurement. */
  const q = tilePlan({ bounds: box(1000, 200), paper: "A4", landscape: true,
    scaleDenom: 1000, overlapMm: 10 });
  const sharedM = q.tiles[0].maxX - q.tiles[1].minX;
  if (Math.abs(sharedM - 10) > 0.05) {
    fail(`at 1:1000, 10 mm of overlap should be 10 m of ground, got ${sharedM.toFixed(2)}`);
  }
}

// 3. More overlap never means fewer sheets.
{
  const counts = [0, 5, 10, 20, 40].map((ov) => tilePlan({
    bounds: box(300, 200), paper: "A3", landscape: true, scaleDenom: 200,
    overlapMm: ov }).sheets);
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[i - 1]) {
      fail(`more overlap gave fewer sheets: ${counts.join(", ")}`);
    }
  }
}

// 4. The printer's margin costs ground, and is not the overlap.
{
  /* 208 m at 1:500 is 416 mm: inside a full 420 mm sheet, outside the
     410 mm that is printable once 5 mm is lost at each edge. Chosen to
     sit between the two, because 205 m sits exactly ON the printable
     width and fits either way \u2014 which is what the first version of
     this tested, and it proved nothing. */
  const none = tilePlan({ bounds: box(208, 140), paper: "A3", landscape: true,
    scaleDenom: 500, marginMm: 0, overlapMm: 0 });
  const five = tilePlan({ bounds: box(208, 140), paper: "A3", landscape: true,
    scaleDenom: 500, marginMm: 5, overlapMm: 0 });
  if (none.sheets !== 1) fail("a sheet with no unprintable border does not fit 208 m at 1:500");
  if (five.sheets <= none.sheets) {
    fail("the printer's unprintable border costs no ground, so a sheet is "
      + "being treated as printable edge to edge");
  }
}

// 5. The tiles cover the work, with nothing missed between them.
{
  const b = box(300, 200, 50, 30);
  const p = tilePlan({ bounds: b, paper: "A4", landscape: false, scaleDenom: 250 });
  /* Every corner of the work falls on some sheet. A gap here is a
     strip of drawing that exists on no page. */
  const on = (x, y) => p.tiles.some((t) =>
    x >= t.minX - 1e-9 && x <= t.maxX + 1e-9
    && y >= t.minY - 1e-9 && y <= t.maxY + 1e-9);
  for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY],
    [b.minX, b.maxY], [b.maxX, b.maxY], [b.minX + b.w / 2, b.minY + b.h / 2]]) {
    if (!on(x, y)) fail(`the work at ${x},${y} falls on no sheet`);
  }
  /* And the grid is centred on the work, so the spare paper is shared
     rather than all falling off one edge. */
  const left = b.minX - Math.min(...p.tiles.map((t) => t.minX));
  const right = Math.max(...p.tiles.map((t) => t.maxX)) - b.maxX;
  if (Math.abs(left - right) > 0.01) {
    fail(`the grid is not centred: ${left.toFixed(2)} m spare on the left, `
      + `${right.toFixed(2)} on the right`);
  }
}

// 6. Sheets are numbered in reading order, which is how paper is
//    collated: "sheet 3 of 6".
{
  const p = tilePlan({ bounds: box(300, 200), paper: "A4", landscape: true,
    scaleDenom: 200 });
  const seen = p.tiles.map((t) => t.sheet);
  if (seen.join(",") !== seen.slice().sort((a, b) => a - b).join(",")) {
    fail("sheets are not numbered in reading order");
  }
  if (new Set(seen).size !== p.sheets) fail("two sheets share a number");
  const first = p.tiles[0];
  if (first.col !== 0 || first.row !== 0 || first.sheet !== 1) {
    fail("sheet 1 is not the top-left tile");
  }
}

// 7. The ranking answers the question it exists for.
{
  const b = box(154, 98);
  const ranked = paperOptions({ bounds: b, scaleDenom: 200 });
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].sheets < ranked[i - 1].sheets) {
      fail("the options are not ordered by sheet count");
      break;
    }
  }
  const best = bestPaper({ bounds: b, scaleDenom: 200 });
  if (!best || best.sheets !== ranked[0].sheets) fail("the best option is not the first");
  /* Where two come to the same count, the one that wastes less paper
     goes first \u2014 a designer choosing between two four-sheet options
     wants the fuller one. */
  const tied = ranked.filter((p) => p.sheets === ranked[0].sheets);
  for (let i = 1; i < tied.length; i++) {
    if (tied[i].coverage > tied[i - 1].coverage + 1e-9) {
      fail("tied options are not ordered by how much of the paper is used");
      break;
    }
  }
  /* Both orientations are offered: a long thin site on landscape can
     beat a larger portrait sheet, and nothing but trying says so. */
  if (!ranked.some((p) => p.landscape) || !ranked.some((p) => !p.landscape)) {
    fail("only one orientation is considered");
  }
}

// 8. Nonsense in, nothing out — rather than a hang or a guess.
{
  if (tilePlan({ bounds: null }) !== null) fail("no bounds still plans a print");
  if (tilePlan({ bounds: box(10, 10), paper: "A9" }) !== null) {
    fail("an unknown paper size is planned anyway");
  }
  /* An overlap as wide as the paper advances nothing. Refused, not
     looped for ever. */
  if (tilesAcross(1000, 100, 100) !== null) {
    fail("an overlap that advances nothing does not refuse");
  }
  if (tilePlan({ bounds: box(1000, 10), paper: "A4", overlapMm: 500 }) !== null) {
    fail("an overlap wider than the paper is planned anyway");
  }
  /* A drawing with no extent is one sheet, not zero and not a crash:
     a single point is still something somebody prints. */
  const dot = tilePlan({ bounds: box(0, 0) });
  if (!dot || dot.sheets !== 1) fail("a drawing with no extent does not come to one sheet");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Sheet tiling behaves (counts, overlap in paper mm, centred, ranked).");
process.exit(bad ? 1 : 0);
