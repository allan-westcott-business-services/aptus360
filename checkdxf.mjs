/* The DXF export.

   A DXF is read by machines with no tolerance for a missing ENDSEC, so
   this reads the file back the way a parser does — group code, value,
   in pairs — rather than matching text. If these pass, AutoCAD opens
   it; if they fail, it says "invalid or incomplete DXF" and gives
   nobody a clue which line was wrong. */
import { readFileSync } from "node:fs";
import { buildDxf, layerFor, layerName, aciFor } from "./src/features/gis/dxf.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* The file as [code, value] pairs, which is all a DXF is. */
function pairs(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    out.push([Number(lines[i]), lines[i + 1]]);
  }
  return out;
}

const lineTypes = [
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
  { Type_Key: "water_service", Label: "Water Service", Layer_Key: "water" },
  { Type_Key: "water_trench", Label: "Water trench", Layer_Key: "trench" },
];
const styles = [
  { GIS_Style_ID: 1, Style_Name: "Water", Layer_Key: "water",
    Colour: "#00cc00" },
  { GIS_Style_ID: 2, Style_Name: "Hidden thing", Feature_Role: "ghost",
    Visible: false },
];

const main = { Feature_ID: 1, Feature_Type: "line", Layer_Key: "water",
  Label: "W1", Geometry: [[10, 20], [110, 20], [110, 80]],
  Attributes: { Line_Type: "water_main" } };
const wo = { Feature_ID: 2, Feature_Type: "point", Feature_Role: "washout",
  Layer_Key: "water", Label: "WO 1", Geometry: [[110, 80]] };
const world = [main, wo];

const dxf = buildDxf(world, { lineTypes, styles });
const P = pairs(dxf);

// 1. The sections open and close, and the file ends where it should.
{
  let depth = 0;
  let sawEof = false;
  for (const [code, value] of P) {
    if (code !== 0) continue;
    if (value === "SECTION") depth += 1;
    if (value === "ENDSEC") depth -= 1;
    if (depth < 0) fail("an ENDSEC arrives with no SECTION open");
    if (value === "EOF") sawEof = true;
  }
  if (depth !== 0) fail(`${depth} section(s) left unclosed \u2014 AutoCAD will `
    + "refuse the file outright");
  if (!sawEof) fail("the file has no EOF");
  if (P[P.length - 1][1] !== "EOF") fail("something follows EOF");
}

// 2. A polyline is written the long way, with SEQEND, and its vertices
//    are the drawing's own metres.
{
  const ents = [];
  let cur = null;
  for (const [code, value] of P) {
    if (code === 0) {
      if (cur) ents.push(cur);
      cur = { type: value, pairs: [] };
    } else if (cur) cur.pairs.push([code, value]);
  }
  if (cur) ents.push(cur);

  const poly = ents.find((e) => e.type === "POLYLINE");
  const verts = ents.filter((e) => e.type === "VERTEX");
  const seq = ents.find((e) => e.type === "SEQEND");
  if (!poly) fail("the main is not written as a polyline");
  if (!seq) fail("the polyline has no SEQEND, which ends the file's "
    + "vertex list \u2014 without it a reader runs on into the next entity");
  if (verts.length !== 3) {
    fail(`the three-point main writes ${verts.length} vertices`);
  } else {
    const xy = (v) => [
      Number(v.pairs.find((p) => p[0] === 10)[1]),
      Number(v.pairs.find((p) => p[0] === 20)[1]),
    ];
    const got = verts.map(xy);
    const want = [[10, 20], [110, 20], [110, 80]];
    for (let i = 0; i < want.length; i++) {
      if (Math.abs(got[i][0] - want[i][0]) > 0.001
        || Math.abs(got[i][1] - want[i][1]) > 0.001) {
        fail(`vertex ${i} exports at ${got[i]} where the drawing has `
          + `${want[i]} \u2014 one metre must be one drawing unit, and y must `
          + "not be flipped");
      }
    }
  }

  /* A point is a POINT, not a zero-length polyline. */
  const pt = ents.find((e) => e.type === "POINT");
  if (!pt) fail("the wash out is not exported as a POINT");

  /* And the labels are there, on their own layer. */
  const texts = ents.filter((e) => e.type === "TEXT");
  if (texts.length !== 2) {
    fail(`${texts.length} labels exported where two features carry one`);
  } else if (!texts.every((t) =>
    String(t.pairs.find((p) => p[0] === 8)[1]).endsWith("-TEXT"))) {
    fail("labels are not on a -TEXT layer, so a CAD user cannot freeze "
      + "the annotation and keep the geometry");
  }
}

// 3. Every layer an entity names is declared in the table. Legal in
//    AutoCAD, refused by several other readers — and this file is meant
//    to open everywhere.
{
  const declared = new Set(["0"]);
  const usedBy = new Set();
  let inTable = false;
  let ent = null;
  for (let i = 0; i < P.length; i++) {
    const [code, value] = P[i];
    if (code === 2 && value === "LAYER") inTable = true;
    if (code === 0 && value === "ENDTAB") inTable = false;
    if (code === 0) ent = value;
    if (inTable && code === 2 && P[i - 1]?.[1] === "LAYER") declared.add(value);
    if (!inTable && code === 8 && ent) usedBy.add(value);
  }
  for (const name of usedBy) {
    if (!declared.has(name)) {
      fail(`layer ${name} is used by an entity but never declared`);
    }
  }
  if (usedBy.size < 2) fail("everything landed on one layer");
}

// 4. Layer names are what CAD accepts, and read as the drawing reads.
{
  if (layerFor(main, lineTypes) !== "WATER-MAIN") {
    fail(`a water main exports to layer ${layerFor(main, lineTypes)}`);
  }
  if (layerFor(wo, lineTypes) !== "WATER-WASHOUT") {
    fail(`a wash out exports to layer ${layerFor(wo, lineTypes)}`);
  }
  if (/[^A-Z0-9_-]/.test(layerName(["Water Main (63mm)"]))) {
    fail("a layer name keeps characters CAD reserves");
  }
  if (layerName([]) !== "0") fail("an empty layer name is not defaulted");
}

// 5. Colour survives as an index, because a DXF layer has no hex.
{
  if (aciFor("#00cc00") !== 3) fail("green does not map to ACI 3");
  if (aciFor("#ff0000") !== 1) fail("red does not map to ACI 1");
  if (aciFor("not a colour") !== 7) fail("an unreadable colour is not "
    + "defaulted to white");
}

// 6. An origin puts the drawing on the national grid, and zero leaves
//    it where it was drawn.
{
  const moved = pairs(buildDxf([main], { lineTypes, styles,
    origin: [400000, 300000] }));
  const firstX = moved.find((p) => p[0] === 10 && Number(p[1]) > 1000);
  if (!firstX || Math.abs(Number(firstX[1]) - 400010) > 0.001) {
    fail("an origin offset is not applied, so a project with a known "
      + "easting and northing cannot be exported onto the grid");
  }
}

// 7. A style's zoom rules do NOT drop geometry from the file.
//    Min_Scale and Max_Scale hide a thing at some zoom levels on
//    screen; a CAD drawing has no zoom, and honouring them here would
//    silently export a file that opens, looks complete, and is missing
//    fittings. What the drawing is SHOWING is the caller's business,
//    and case 8 holds that it passes the visible set.
{
  const zoomy = [{ GIS_Style_ID: 3, Style_Name: "Only when close",
    Feature_Role: "washout", Min_Scale: 5, Colour: "#00cc00" }];
  const out = buildDxf([wo], { lineTypes, styles: zoomy });
  if (!/WATER-WASHOUT/.test(out)) {
    fail("a fitting styled to appear only when zoomed in is missing from "
      + "the CAD file \u2014 dropped by a screen rule that means nothing in "
      + "AutoCAD");
  }
}

// 8. Wired: the menu exports the VISIBLE set, not the raw features.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/buildDxf\(visible, \{/.test(canvas)) {
    fail("the export does not read the canvas's visible set, so hidden "
      + "layers and isolates would go out in the file");
  }
  if (!/Export to AutoCAD \(DXF\)/.test(canvas)) {
    fail("there is no way to run the export");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The DXF opens: sections closed, metres kept, layers declared.");
process.exit(bad ? 1 : 0);
