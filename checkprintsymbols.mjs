/* The sheet draws what the screen draws.

   A print is of the drawing AS SHOWN. Five ways it was not, all
   reported off one issued PDF:

     1. Every MSDB came out a solid black block. The screen draws a
        white square with DB in it; the sheet had no branch for a
        board and fell through to the symbol cascade.
     2. Joints printed hollow. The screen fills them.
     3. Heavy duty cut-outs printed hollow, the same way.
     4. Every cable was labelled with one letter. A cable's size is
        an id pointing at a catalogue the print was never given, so
        the tag was all it could say.
     5. A stack of filled meter symbols sat on every board. Those are
        the meters `withAssumedMeters` invents for a board's flats —
        no Feature_ID, never saved, and never drawn by the canvas.

   Four of the five are the same fault wearing different clothes: the
   sheet decided something for itself that the screen had already
   decided. The exception is the cable label, where the sheet was
   missing a fact rather than inventing one — and the fix is to pass
   it in, which is what the note in lineLabel.js asks for. */
import { readFileSync } from "node:fs";
import { pageDrawList } from "./src/features/gis/printVector.js";
import { lineLabelText } from "./src/features/gis/lineLabel.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "elec_main", Label: "Electric Main", Layer_Key: "electric" },
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
];
const layers = [{ Layer_Key: "electric", Label: "Electric", Colour: "#f5a200" }];
const styles = [];

/* One tile, big enough that nothing clips. A tile is a rectangle of
   GROUND in metres — minX/minY/maxX/maxY — and `touches` reads those
   four. A fixture with the wrong shape puts every feature outside the
   page and the whole check passes on an empty list. */
const tile = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
const opts = {
  layers, styles, lineTypes, utilities: [], scaleDenom: 500, marginMm: 10,
  showLabels: true,
  labelKinds: { mains: true, services: true, joints: true, levels: true },
};

const point = (role, at, extra = {}) => ({
  Feature_ID: Math.floor(Math.random() * 1e6),
  Feature_Type: "point", Feature_Role: role, Layer_Key: "electric",
  Geometry: [at], Attributes: {}, ...extra,
});

const items = (features, more = {}) =>
  pageDrawList(features, tile, { ...opts, ...more });

// 1. A board is a square you can read, not a block.
{
  const board = point("msdb", [20, 20], { Label: "MSDB 1" });
  const out = items([board]);
  const text = out.filter((i) => i.kind === "text").map((i) => i.text);
  if (!text.includes("DB")) {
    fail("a board prints with no letters in it, so four boards on a page are "
      + "four identical blocks");
  }
  /* Once, and only once. The board branch writes its own name
     because it alone knows how wide its box came out; the label pass
     wrote it again a millimetre or two away, and two greys
     overlapping reads as a smudge. Reported from use, on the fix for
     the block above. */
  const named = text.filter((t) => t === "MSDB 1").length;
  if (named === 0) fail("a board prints without its name");
  if (named > 1) {
    fail(`a board's name is printed ${named} times \u2014 the board branch writes `
      + "it and so does the label pass, a millimetre apart");
  }

  const filled = out.filter((i) => i.kind === "paths" && i.fill);
  if (!filled.some((i) => String(i.colour).toLowerCase() === "#ffffff")) {
    fail("a board is not filled white \u2014 it printed as a solid dark block "
      + "where the screen shows an outlined square");
  }
  if (filled.some((i) => String(i.colour).toLowerCase() === "#334155")) {
    fail("a board still takes the default symbol fill");
  }
}

// 2. A cut-out is a body the cable runs through.
{
  const out = items([point("hdcutout", [30, 30], {
    Attributes: { Angle_Deg: 30 },
  })]);
  const paths = out.filter((i) => i.kind === "paths");
  if (paths.length < 2) {
    fail("a heavy duty cut-out draws as one shape \u2014 the screen draws a "
      + "white body with two fuse ways in it, and no entry in the symbol "
      + "cascade can produce that");
  }
  if (!paths.some((i) => i.fill && String(i.colour).toLowerCase() === "#ffffff")) {
    fail("a cut-out is not filled white, so the cable shows through the body "
      + "it runs into \u2014 and when the fill rule was corrected it printed as "
      + "a solid slate square instead");
  }
  const ways = paths.find((i) => !i.fill);
  if (!ways || ways.subs.length < 3) {
    fail("a cut-out prints without its two fuse ways");
  }
}

// 3. A fitting is filled on paper because it is filled on screen.
{
  for (const role of ["joint", "openpoint"]) {
    const out = items([point(role, [30, 30])]);
    const paths = out.filter((i) => i.kind === "paths");
    if (!paths.length) { fail(`a ${role} draws nothing`); continue; }
    if (!paths.some((i) => i.fill)) {
      fail(`a ${role} prints hollow \u2014 the screen fills it, and a sheet that `
        + "draws a fitting differently from the drawing it came from is a "
        + "sheet somebody has to learn to read twice");
    }
  }

  /* And the ones that genuinely have no inside still have none. */
  const cross = items([point("meter", [40, 40],
    { Attributes: { } })]);
  if (!cross.length) fail("a meter draws nothing");
}

// 4. A cable says what it is and how long.
{
  const cable = {
    Feature_ID: 7, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[10, 10], [110, 10]],
    Attributes: { Line_Type: "elec_main", Way: 2, Circuit_Letter: "D",
      VD_Cable_Size_ID: 4, Length_m: 100 },
  };

  /* Without a catalogue it says what it always said. A sheet with no
     lookup must not invent a second source for the name. */
  const bare = lineLabelText(cable, { lineTypes });
  if (bare !== "2D") fail(`with no catalogue a cable reads "${bare}", wanted "2D"`);

  const named = lineLabelText(cable, { lineTypes, cableName: () => "3c Wave 185" });
  if (!named.includes("3c Wave 185")) {
    fail(`a cable reads "${named.replace(/\n/g, " / ")}" \u2014 one letter is not a `
      + "label on a drawing somebody digs from");
  }
  if (!/100\.0 m/.test(named)) fail("a cable does not say how long it is");

  /* An override is the size that would be built, so it wins. */
  const over = lineLabelText(
    { ...cable, Attributes: { ...cable.Attributes, Manual_VD_Cable_Size_ID: 9 } },
    { lineTypes, cableName: (id) => (id === 9 ? "3c Wave 300" : "3c Wave 185") });
  if (!over.includes("3c Wave 300")) {
    fail("a hand-set cable size is not the one printed");
  }

  /* And it reaches the page. */
  const out = items([cable], { cableName: () => "3c Wave 185" });
  if (!out.some((i) => i.kind === "text" && /3c Wave 185/.test(i.text))) {
    fail("the sheet is not given the catalogue, so the label never reaches it");
  }
}

// 5. An invented meter is not part of the drawing.
{
  const board = point("msdb", [20, 20], { Label: "MSDB 1" });
  const assumed = {
    assumedFor: 1, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[20, 20]],
    Attributes: { Assumed: true, Circuit_ID: 1 },
  };
  const without = items([board]).length;
  const with_ = items([board, assumed]).length;
  if (with_ !== without) {
    fail("an assumed meter is drawn on the sheet \u2014 they are invented per flat "
      + "behind a board, all at the board's own anchor, and the canvas draws "
      + "none of them");
  }

  /* A real meter still draws, or this case has turned into "meters
     do not print". */
  const real = {
    Feature_ID: 8, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[25, 25]], Attributes: {},
  };
  if (items([real]).length === 0) fail("a drawn meter no longer prints");
}

/* ── Not held here, and worth knowing ──

   The canvas draws ten roles with a bespoke symbol; the sheet draws
   three. Still taking the symbol cascade on paper, and so printing
   as a plain shape where the screen shows something particular:

     reducer, hvtt, sectionmark, primary, ringsub, openpoint, linkbox

   Not asserted, because a case demanding seven symbols nobody has
   drawn yet is a case that fails until somebody writes them, and
   this list changes as they are. To regenerate it:

     node -e "const fs=require('fs');
       const c=fs.readFileSync('src/features/gis/GISCanvasPage.jsx','utf8');
       const p=fs.readFileSync('src/features/gis/printVector.js','utf8');
       const a=[...new Set([...c.matchAll(/if \\(f\\.Feature_Role === .([a-z]+).\\) \\{/g)].map(m=>m[1]))];
       const b=[...new Set([...p.matchAll(/if \\(role === .([a-z]+).\\)/g)].map(m=>m[1]))];
       console.log(a.filter(r=>!b.includes(r)).join(', '))" */

console.log(bad ? `\n${bad} problem(s)`
  : "The sheet draws what the screen draws.");
process.exit(bad ? 1 : 0);
