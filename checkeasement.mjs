/* The easement band: a metre-wide hatched strip along a trench section.

   Two things are easy to get wrong and invisible until somebody looks
   at a drawing:

     The band's width. Offsetting each segment independently leaves the
     band pinched on the inside of a bend and gaping on the outside; the
     mitre has to lengthen through a corner to hold the width.

     The hatch tile. A canvas pattern clips to its tile, so a diagonal
     drawn past the edge is thrown away and the fill comes out as dots
     rather than lines. That happened, and only a rendered picture
     showed it \u2014 which is why the tile is checked here for the shape
     it should have, and why it was also looked at in a browser. */
import { readFileSync } from "node:fs";
import { isTrenchFeature } from "./src/features/gis/snapping.js";
import {
  easementBand, isEasement, hatchPattern,
  EASEMENT_WIDTH_M, EASEMENT_KEY, EASEMENT_COLOUR,
} from "./src/features/gis/easement.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const width = (band) => {
  const half = band.length / 2;
  return Math.hypot(band[0].x - band[band.length - 1].x,
    band[0].y - band[band.length - 1].y);
};

// 1. A straight run is exactly the width asked for.
const straight = easementBand([{ x: 0, y: 0 }, { x: 100, y: 0 }], 20);
if (Math.abs(width(straight) - 20) > 0.01) {
  fail(`a straight band is ${width(straight).toFixed(1)}px wide, wanted 20`);
}

// 2. A corner keeps it, near enough — the mitre must not pinch.
const bent = easementBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 }], 20);
const atCorner = Math.hypot(bent[1].x - bent[bent.length - 2].x,
  bent[1].y - bent[bent.length - 2].y);
if (atCorner < 18) fail(`the band pinches to ${atCorner.toFixed(1)}px at a corner`);

// 3. A near-doubling-back turn sends a naive mitre to infinity. Capped.
const spike = easementBand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 2, y: 1 }], 20);
if (!spike.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
  fail("a sharp turn produced a point that is not a number");
}
const furthest = Math.max(...spike.map((p) => Math.hypot(p.x - 50, p.y)));
if (furthest > 200) fail(`a sharp turn threw a spike ${furthest.toFixed(0)}px out`);

// 4. Too few points is no band, not a crash.
if (easementBand([{ x: 1, y: 1 }], 20).length) fail("one point produced a band");
if (easementBand([], 20).length) fail("no points produced a band");
if (easementBand(null, 20).length) fail("null produced a band");

// 5. The flag, and one spelling of it.
if (!isEasement({ Attributes: { [EASEMENT_KEY]: true } })) fail("a marked section reads as unmarked");
if (isEasement({ Attributes: {} })) fail("an unmarked section reads as marked");
if (isEasement({})) fail("a feature with no attributes reads as marked");
if (isEasement(null)) fail("null reads as marked");

// 6. A metre wide, and one colour whatever the layer.
if (EASEMENT_WIDTH_M !== 1) fail(`the band is ${EASEMENT_WIDTH_M}m wide, wanted 1`);
if (!/^#[0-9a-f]{6}$/i.test(EASEMENT_COLOUR)) fail("the easement colour is not a hex colour");

// 7. The tile is a cross-hatch, drawn in both directions, and open
//    enough to read as a mesh. At six pixels with a heavy line the two
//    directions nearly met and the band came out solid yellow.
{
  const strokes = [];
  const ctx = {
    createPattern: () => "pattern",
    canvas: null,
  };
  /* A canvas stub that records what the tile is drawn with, since
     nothing here has a real one. */
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        set strokeStyle(v) { this._s = v; },
        get strokeStyle() { return this._s; },
        set lineWidth(v) { strokes.push({ lineWidth: v }); },
        set lineCap(v) {},
        beginPath() {},
        moveTo(x, y) { strokes.push({ m: [x, y] }); },
        lineTo(x, y) { strokes.push({ l: [x, y] }); },
        stroke() {},
      }),
    }),
  };
  hatchPattern(ctx, "#000");
  const moves = strokes.filter((x) => x.m).length;
  if (moves < 6) fail(`the tile draws ${moves} strokes; a cross-hatch needs six`);
  const w = strokes.find((x) => x.lineWidth)?.lineWidth ?? 0;
  if (w > 1.2) fail(`the hatch line is ${w}px; the mesh closes up above about 1.2`);
  delete globalThis.document;
}

// 8. A trench is a trench whether or not somebody has picked a line
//    type for it.
//
//    The editor decides which controls to show from this. Asking the
//    line type alone says no for a trench drawn straight onto the
//    trench layer, so the easement tick was hidden on exactly the
//    sections most likely to need it.
{
  const types = [
    { Type_Key: "trench_main", Layer_Key: "trench" },
    { Type_Key: "elec_service", Layer_Key: "electric" },
  ];
  const t = (f) => isTrenchFeature(f, types);
  if (!t({ Layer_Key: "trench", Attributes: {} })) {
    fail("a trench with no line type does not count as a trench");
  }
  if (!t({ Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } })) {
    fail("a typed trench does not count as a trench");
  }
  if (t({ Layer_Key: "electric", Attributes: { Line_Type: "elec_service" } })) {
    fail("an electric service counts as a trench");
  }
  if (t(null)) fail("null counts as a trench");
}

// 9. The band is drawn on its own, not inside the trench's draw call.
//
//    The flag is on the trench, so painting the band where the trench
//    is painted means isolating gas hides the trench and takes the
//    easement with it \u2014 which is what happened. The easement is what
//    the gas is laid in; it does not stop being there because the layer
//    filter is on.
{
  const page = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = page.indexOf('!isEasement(f)) continue;');
  if (at < 0) fail("no easement pass in the canvas");
  else {
    const start = page.lastIndexOf("for (const f of features) {", at);
    const end = page.indexOf("drawOrder.forEach((f) => {", at);
    if (start < 0 || end < 0) fail("the easement pass is not where it should be");
    else {
      const code = page.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
      /* It must read every feature, and consult nothing that filters. */
      for (const forbidden of ["visible", "hidden", "styleFor"]) {
        if (code.includes(forbidden)) {
          fail(`the easement pass consults ${forbidden}; it would vanish `
            + "when a layer is isolated");
        }
      }
      if (end > page.indexOf("drawOrder.forEach((f) => {")) {
        fail("the easement is drawn after the features, not under them");
      }
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Easement behaves (${EASEMENT_WIDTH_M}m band, mitred corners, one colour).`);
process.exit(bad ? 1 : 0);
