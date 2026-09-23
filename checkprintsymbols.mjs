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
import { BOTTLE_END_COLOUR } from "./src/features/gis/joints.js";

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
    fail(`a board's name is printed ${named} times — the board branch writes `
      + "it and so does the label pass, a millimetre apart");
  }

  const filled = out.filter((i) => i.kind === "paths" && i.fill);
  if (!filled.some((i) => String(i.colour).toLowerCase() === "#ffffff")) {
    fail("a board is not filled white — it printed as a solid dark block "
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
    fail("a heavy duty cut-out draws as one shape — the screen draws a "
      + "white body with two fuse ways in it, and no entry in the symbol "
      + "cascade can produce that");
  }
  if (!paths.some((i) => i.fill && String(i.colour).toLowerCase() === "#ffffff")) {
    fail("a cut-out is not filled white, so the cable shows through the body "
      + "it runs into — and when the fill rule was corrected it printed as "
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
      fail(`a ${role} prints hollow — the screen fills it, and a sheet that `
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
  if (bare !== "2D") {
    fail(`with no catalogue and no size a cable reads "${bare}", wanted the `
      + "tag — a blank label reads as a cable nobody has looked at rather "
      + "than one whose size is not set");
  }

  const named = lineLabelText(cable, { lineTypes, cableName: () => "3c Wave 185" });
  /* ── And without the circuit letter ──

     The label led with the tag — "2D" above the cable and its
     length — and it was asked for and taken off. The label says what
     is in the ground; which circuit a run belongs to is told by its
     colour, by the letters along the run, and by the picker.

     Asserted both ways round, because the tag is still the last
     resort where a run has nothing else to say. */
  if (/^2D/.test(named)) {
    fail(`a cable label still leads with its circuit letter: `
      + `"${named.replace(/\n/g, " / ")}"`);
  }
  if (!named.includes("3c Wave 185")) {
    fail(`a cable reads "${named.replace(/\n/g, " / ")}" — one letter is not a `
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

// 5. And the canvas does not lead with it either.
{
  /* The label is composed twice — once here for the sheet, once in
     the canvas's own draw. Taking the circuit letter off one and not
     the other is the fault this whole stretch of work has been
     about, so the canvas's composition is held to the same rule.

     By source, because the canvas's version is inside a two thousand
     line draw routine with a dozen locals in scope and cannot be
     called from here. The rule: whatever it builds, the tag is not
     part of it except as the fallback. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const txt = own");
  const block = at < 0 ? "" : canvas.slice(at, canvas.indexOf(";", at));
  if (!block) fail("the canvas no longer composes a line label where this "
    + "case looks for it");
  else {
    if (/\[on \? null : tag, own\]/.test(block)) {
      fail("the canvas label still leads with the circuit letter, so the "
        + "screen and the sheet disagree about what a cable is called");
    }
    if (!/: tag \|\| ""/.test(block)) {
      fail("the canvas drops the tag entirely, so a run with no size set has "
        + "a blank label — which reads as a cable nobody has looked at");
    }
  }
}

// 6. A moved label is moved on paper too, and a hidden one is absent.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* ── Movable on screen ──

     A point's name sat where the rule put it, which on a busy corner
     is over a cable or another name. Lines have been movable for
     years; the substation and the board are the two most often in
     the way and both were fixed. The board had no name on screen at
     all, though the SHEET has always written one — so it was called
     MSDB 3 on paper and nothing on the drawing. */
  if (!/labelHits\.current\.push\(\{\s*\n\s*id: f\.Feature_ID, idx: null, anchor: f\.Geometry\[0\]/
    .test(canvas)) {
    fail("a point's name is not registered as grabbable, so the substation "
      + "label cannot be moved");
  }
  const boardAt = canvas.indexOf('if (f.Feature_Role === "msdb")');
  const board = boardAt < 0 ? "" : canvas.slice(boardAt, boardAt + 4000);
  if (!board) fail("the canvas no longer draws a board");
  else {
    if (!/ctx\.fillText\(f\.Label/.test(board)) {
      fail("a board draws no name on the canvas, so there is nothing to move "
        + "— and the sheet writes one, which is the two disagreeing");
    }
    if (!/labelHits\.current\.push/.test(board)) {
      fail("a board's name cannot be grabbed");
    }
  }

  /* ── And moved on paper ──

     The offset is metres of ground, so it scales with the sheet
     exactly as it does with the zoom. Drawn at the rule's position
     regardless, a name moved clear of a cable on screen went back
     over it on paper. */
  const moved = {
    Feature_ID: 11, Feature_Type: "point", Feature_Role: "substation",
    Layer_Key: "electric", Label: "Substation", Geometry: [[30, 30]],
    Attributes: { Label_Offset: [10, 0] },
  };
  const put = items([moved]).find((i) => i.kind === "text");
  const still = items([{ ...moved, Attributes: {} }]).find((i) => i.kind === "text");
  if (!put || !still) fail("a substation prints without its name");
  else if (Math.abs(put.at[0] - still.at[0]) < 1) {
    fail("a label moved on the canvas prints where the rule would have put "
      + "it, not where somebody put it");
  }

  /* ── And not printed at all when the screen would not ──

     The board writes its own name rather than going through the
     label pass, so the pass's rules have to be repeated there. Miss
     them and a board is named on a sheet with every label switch
     off, which is the one thing "print what is shown" prevents. */
  const quiet = items([point("msdb", [20, 20], { Label: "MSDB 1" })],
    { showLabels: false });
  if (quiet.some((i) => i.kind === "text" && i.text === "MSDB 1")) {
    fail("a board is named on the sheet with the Labels layer switched off");
  }
  /* DB stays: it is the symbol, not a label. */
  if (!quiet.some((i) => i.kind === "text" && i.text === "DB")) {
    fail("the letters inside a board vanish with the Labels layer — they are "
      + "the symbol, not a label");
  }
}

// 7. A bottle end is green, and only a bottle end.
{
  /* Its symbol — a stem with three diminishing bars — is the earth
     symbol lying on its side, which is what it gets called on a
     drawing. Asked for in green, and in the layer's amber it was one
     more amber thing among the joints.

     One constant, read by the canvas and the sheet, because a
     fitting that is green on screen and amber on paper is the fault
     this whole run of work has been about. */
  const be = point("joint", [20, 20], { Attributes: { Joint_Type: "bottleend" } });
  const other = point("joint", [40, 40], { Attributes: { Joint_Type: "service" } });
  const out = items([be, other]);
  const of = (f) => out.find((i) => i.kind === "paths" && i.id === f.Feature_ID);

  if (of(be)?.colour !== BOTTLE_END_COLOUR) {
    fail(`a bottle end prints ${of(be)?.colour}, wanted ${BOTTLE_END_COLOUR}`);
  }
  /* And nothing else moved with it. A style row could not have done
     this: the cascade resolves on role, and a bottle end's role is
     `joint` — so a row for it would turn every joint on the drawing
     green too. */
  if (of(other)?.colour === BOTTLE_END_COLOUR) {
    fail("every joint went green with the bottle end — the colour belongs to "
      + "the fitting, not to the role it shares with the others");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/sym === "bottleend" \? BOTTLE_END_COLOUR/.test(canvas)) {
    fail("the canvas does not draw a bottle end in the same green, so the "
      + "screen and the sheet disagree about the colour of one fitting");
  }
}

// 8. An invented meter is not part of the drawing.
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
    fail("an assumed meter is drawn on the sheet — they are invented per flat "
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

// 9. Feeder cables print in their circuit's colour, in their lanes.
{
  /* On screen every LV feeder cable is its circuit's colour and
     cables sharing a trench sit side by side. The sheet drew neither:
     one amber line where three circuits share a dig. Reported off an
     issued PDF.

     Lanes on paper are a PAPER distance, a couple of millimetres —
     the ground figure the screen starts from would be 0.6 mm at
     1:500 and two cables would print as one smudge. */
  const main = (id, pts, circuit) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
    Geometry: pts, Attributes: { Line_Type: "elec_main", Circuit_ID: circuit },
  });
  const a = main(101, [[10, 50], [110, 50]], 1);
  const b = main(102, [[10, 50], [110, 50]], 2);
  const plan = new Map([
    [101, { colour: "#e90cd6", lane: -0.5 }],
    [102, { colour: "#0ae5f5", lane: 0.5 }],
  ]);
  const out = items([a, b], { feederPlan: plan });
  const pa = out.find((i) => i.id === 101);
  const pb = out.find((i) => i.id === 102);
  if (!pa || !pb) fail("a feeder cable does not print");
  else {
    if (pa.colour !== "#e90cd6" || pb.colour !== "#0ae5f5") {
      fail(`feeders print ${pa.colour} and ${pb.colour} — their circuits are `
        + "magenta and cyan, and the sheet must say which is which");
    }
    const gap = Math.abs(pa.pts[0][1] - pb.pts[0][1]);
    if (gap < 1 || gap > 3) {
      fail(`two cables in one trench print ${gap.toFixed(2)} mm apart — wanted a `
        + "couple of millimetres, readable and not splayed");
    }
  }
  /* The screen's plan, not one rebuilt from the visible features. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/\n\s*feederPlan,\n/.test(canvas.slice(canvas.indexOf("const pdfOptions"), canvas.indexOf("const pdfOptions") + 4000))) {
    fail("the print builds its own feeder plan from what is visible, so its "
      + "lanes and output colours can differ from the screen's");
  }
}

// 10. A cable label sits on a pale plate of its cable's colour.
{
  /* Black labels a few millimetres apart, over three circuits in one
     trench, gave no way to tell which belonged to which. Each now sits
     on a tint of its cable's printed colour. */
  const { tint, PLATE_TINT } = await import("./src/features/gis/printVector.js");
  if (tint("#e90cd6", PLATE_TINT) !== "#facaf6") fail("the plate tint is not a pale version of the colour");
  if (tint("nope") !== null) fail("a colour that is not hex gives a guessed plate");

  const cable = {
    Feature_ID: 201, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[10, 10], [110, 10]],
    Attributes: { Line_Type: "elec_main", VD_Cable_Size_ID: 4, Length_m: 100 },
  };
  const out = items([cable], {
    cableName: () => "3c Wave 300",
    feederPlan: new Map([[201, { colour: "#0ae5f5" }]]),
  });
  const words = out.filter((i) => i.kind === "text" && i.id === 201);
  if (!words.length) fail("the cable prints no label");
  else if (!words.every((i) => i.plate === tint("#0ae5f5", PLATE_TINT))) {
    fail("a cable label is not on a plate of its CIRCUIT's colour — the "
      + "feeder plan's colour is the one the cable prints in");
  }

  /* A trench's label is its own name and has no colour to borrow. */
  const trench = {
    Feature_ID: 202, Feature_Type: "line", Layer_Key: "trench", Label: "T1",
    Geometry: [[10, 60], [110, 60]], Attributes: { Line_Type: "trench" },
  };
  const t = items([trench]).filter((i) => i.kind === "text" && i.id === 202);
  if (t.some((i) => i.plate)) fail("a trench's label is put on a coloured plate");

  const writer = readFileSync("./src/features/gis/printPdf.js", "utf8");
  if (!/if \(it\.plate\) \{[\s\S]{0,400}drawRectangle/.test(writer)) {
    fail("the PDF writer ignores the plate, so it never reaches the page");
  }
}

// 11. The canvas tints the same way, from the same place.
{
  /* The canvas already put a tint behind cable labels, but from the
     STYLE colour — the layer's amber for every electric cable — so a
     magenta circuit's label and a cyan one's sat on the same pale
     amber. It reads the feeder plan's colour now, at the strength the
     sheet uses, so a label reads alike on screen and on paper. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const pill = readFileSync("./src/lib/pillColour.js", "utf8");
  const pv = readFileSync("./src/features/gis/printVector.js", "utf8");
  if (!/export const LABEL_PLATE_TINT = /.test(pill)) {
    fail("there is no one strength for a label plate, so screen and sheet drift");
  }
  if (!/export const PLATE_TINT = LABEL_PLATE_TINT;/.test(pv)) {
    fail("the sheet's plate strength is its own number rather than the shared one");
  }
  /* The plate follows the line: selection first, then the circuit
     colour, then whatever else the line takes. Matched on that ORDER
     rather than on one exact line — a POC route colour was later added
     to the same fallback and broke the literal match. */
  if (!/const plateColour = on \? "#1d4ed8"\s*\n?\s*: \(fp\?\.colour \?\?/.test(canvas)) {
    fail("the canvas plate is not tinted from the circuit colour the line is "
      + "drawn in — every electric label sits on the same pale amber");
  }
  if (!/tint\(plateColour, LABEL_PLATE_TINT\)/.test(canvas)) {
    fail("the canvas plate uses a different strength from the sheet's");
  }
  /* Selected: SOLID selection blue with white text, not a pale tint
     — asked for, so the picked cable's labels stand out from the
     pale plates around them. */
  if (!/ctx\.fillStyle = on\s*\n\s*\? "#1d4ed8"/.test(canvas)) {
    fail("a selected cable's labels are not solid blue");
  }
  if (!/ctx\.fillStyle = on \? "#ffffff" : st\.labelColour;/.test(canvas)) {
    fail("a selected cable's label text is not white on the blue");
  }
  if (/tint\(st\.colour, 0\.86\)/.test(canvas)) {
    fail("the canvas still tints labels from the layer colour at its old strength");
  }
}

// 12. Right-clicking a label opens the editor of the feature it names.
{
  /* A label is often dragged clear of its cable, onto empty ground or
     another feature, so a right-click that asked only "which feature
     is here?" found nothing or the wrong thing. The label knows its
     owner; it is asked first. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("onContextMenu={(e) => {\n                e.preventDefault();");
  const block = at < 0 ? "" : canvas.slice(at, at + 3200);
  if (!block) fail("the canvas right-click handler has moved");
  else {
    const labelAt = block.indexOf("labelUnder(px, py)");
    const featAt = block.indexOf("featureAt(px, py)");
    if (labelAt < 0) {
      fail("a right-click never asks whether it landed on a label");
    } else if (featAt >= 0 && featAt < labelAt) {
      fail("a right-click asks for the feature under the label before the "
        + "label itself, so a label sitting over another feature opens that one");
    }
    if (!/setEditing\(owner\)/.test(block)) {
      fail("a right-click on a label does not open its feature's editor");
    }
    if (!/setSelected\(\[owner\.Feature_ID\]\)/.test(block)) {
      fail("the cable is not selected as its editor opens, so nothing on the "
        + "drawing shows which cable the editor is on");
    }
  }
  /* One hit test for a label, used by the drag and the right-click, so
     a label cannot drag but refuse a right-click or the reverse. */
  const copies = (canvas.match(/const PAD = 6;/g) || []).length;
  if (copies !== 1) {
    fail(`the label hit test exists ${copies} times — the drag and the `
      + "right-click would drift apart");
  }
  if (!/const lab = labelUnder\(px, py\);/.test(canvas)) {
    fail("dragging a label does not use the shared hit test");
  }
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
