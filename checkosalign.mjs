/* Importing an OS tile and aligning a calibrated PDF to it.

   The workflow this serves: a developer sends a PDF, it is imported
   and calibrated by hand, and a design is drawn on it. A bought OS
   tile \u2014 CAD, on the National Grid \u2014 is then brought in, and a few
   points matched between the two tie the drawing to the grid.

   Proved end to end on a real OS tile before this was written: a plan
   turned 17.3\u00b0 and 1.2% out of scale was recovered to 17.318\u00b0 and
   1.0118 from three clicks carrying a few centimetres of error each,
   and every corner of the tile landed within 2.8 cm of its true place.
   That tile is licensed OS data and is NOT in this repository; the
   cases below build small synthetic tiles of the same shape.

   Held hardest:

     1. Units come from the NUMBERS. Two real developer files both
        declared millimetres; one was metres.
     2. The drawing NEVER MOVES. The link places the tile over the
        design; nothing drawn is rewritten by aligning.
     3. An OS point is a real corner of the linework, never a click in
        open ground \u2014 a guessed OS point would sit in every coordinate
        the drawing ever reports. */
import { readFileSync } from "node:fs";
import { readOsTile, readDxf, unitsOf, OS_FURNITURE_LAYERS } from "./src/features/gis/osTile.js";
import { solveLink, toGrid, toCanvas, fitVerdict } from "./src/features/gis/gridLink.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A minimal DXF, written the way LibreDWG and the resellers write it:
   a 999 comment first, CRLF line ends, group codes padded. */
const dxf = ({ scale = 1, layerFurniture = true, e0 = 340451, n0 = 551520 } = {}) => {
  const L = [];
  const put = (c, v) => L.push(String(c).padStart(3, " "), String(v));
  put(999, "LibreDWG 0.13.3");
  put(0, "SECTION"); put(2, "HEADER"); put(9, "$INSUNITS"); put(70, 4); put(0, "ENDSEC");
  put(0, "SECTION"); put(2, "ENTITIES");
  const poly = (layer, pts, closed = false) => {
    put(0, "LWPOLYLINE"); put(8, layer); put(90, pts.length); put(70, closed ? 1 : 0);
    for (const [x, y] of pts) { put(10, x * scale); put(20, y * scale); }
  };
  poly("Line - Road Or Track Public", [[e0, n0], [e0 + 40, n0 + 5], [e0 + 80, n0 + 30]]);
  poly("Line - General Feature", [[e0 + 10, n0 + 50], [e0 + 30, n0 + 50], [e0 + 30, n0 + 70], [e0 + 10, n0 + 70]], true);
  put(0, "POLYLINE"); put(8, "Line - General Feature"); put(70, 0);
  for (const [x, y] of [[e0 + 60, n0 + 60], [e0 + 90, n0 + 90]]) {
    put(0, "VERTEX"); put(8, "Line - General Feature"); put(10, x * scale); put(20, y * scale);
  }
  put(0, "SEQEND");
  put(0, "ARC"); put(8, "Line - General Feature"); put(10, (e0 + 50) * scale); put(20, (n0 + 20) * scale);
  put(40, 5 * scale); put(50, 0); put(51, 90);
  if (layerFurniture) {
    poly("_scale bar", [[e0 - 200, n0 - 200], [e0 - 190, n0 - 200]]);
    put(0, "TEXT"); put(8, "_copyright"); put(10, (e0 + 1) * scale); put(20, (n0 + 1) * scale);
    put(40, 2 * scale); put(1, "\u00a9 Crown copyright and database rights");
  }
  put(0, "ENDSEC"); put(0, "EOF");
  return L.join("\r\n");
};

// 1. A tile reads, in metres, with its furniture set aside.
{
  const t = readOsTile(dxf(), "tile.dxf");
  if (t.error) fail(`a reseller's DXF is refused: ${t.error}`);
  else {
    if (t.unit !== "metres") fail(`a tile in metres read as ${t.unit}`);
    const roads = t.polylines.filter((p) => p.layer === "Line - Road Or Track Public");
    if (!roads.length) fail("LWPOLYLINE linework is lost");
    if (!t.polylines.some((p) => p.pts.length === 2 && p.pts[0][0] === 340511)) {
      fail("the old POLYLINE/VERTEX form is not read");
    }
    if (!t.polylines.some((p) => p.pts.length > 10)) fail("an ARC is not broken into pieces");
    if (!t.hidden.includes("_scale bar")) fail("the reseller's scale bar is shown on the drawing");
    /* The copyright line is not furniture: OS licensing expects it on
       anything printed from the map. */
    if (OS_FURNITURE_LAYERS.includes("_copyright") || t.hidden.includes("_copyright")) {
      fail("the OS copyright line is hidden with the reseller's furniture");
    }
    /* The extent is the map, not the scale bar 200 m away. */
    if (t.extent.minE < 340400) fail("the extent includes the reseller's furniture");
  }
}

// 2. Units come from the numbers, not the header.
{
  /* Both files declare millimetres (INSUNITS 4). One is metres. */
  const m = readOsTile(dxf({ scale: 1 }), "a.dxf");
  const mm = readOsTile(dxf({ scale: 1000 }), "b.dxf");
  if (m.unit !== "metres") fail("a tile in metres that declares millimetres is believed");
  if (mm.unit !== "millimetres") fail("a tile really in millimetres is not recognised");
  const same = mm.polylines[0]?.pts[0];
  if (!same || Math.abs(same[0] - 340451) > 1e-6) {
    fail("a millimetre tile is not scaled to grid metres");
  }
  /* Not on the grid at all: refused with the reason. */
  const local = readOsTile(dxf({ e0: 12, n0: 40 }), "c.dxf");
  if (!local.error || !/not drawn on the National Grid/.test(local.error)) {
    fail("a drawing in local coordinates is accepted as an OS tile");
  }
  /* A stray entity at the origin moves an extent, not a median. */
  const raw = readDxf(dxf());
  raw.polylines.push({ layer: "0", pts: [[0, 0], [1, 1]], closed: false });
  if (unitsOf(raw).factor !== 1) fail("one stray entity decides the units");
}

// 3. DWG is refused with a way forward.
{
  const r = readOsTile("", "tile.DWG");
  if (!r.error || !/DXF/.test(r.error) || !/ODA File Converter/.test(r.error)) {
    fail("a DWG is refused without saying how to get a DXF");
  }
  if (!readOsTile("hello", "x.dxf").error) fail("a file that is not DXF is read");
}

// 4. The fit: rotation, scale and position from matched points.
{
  const th = (23.5 * Math.PI) / 180;
  const truth = { a: 1.018 * Math.cos(th), b: 1.018 * Math.sin(th), tx: 340512.3, ty: 551598.7 };
  const pts = [[12, -40], [160, -15], [95, -120], [30, -200]];
  const pairs = pts.map((c) => ({ canvas: c, grid: toGrid(truth, c) }));
  const fit = solveLink(pairs);
  if (Math.abs(fit.rotationDeg - 23.5) > 1e-6) fail(`rotation found as ${fit.rotationDeg}`);
  if (Math.abs(fit.scale - 1.018) > 1e-9) fail(`scale found as ${fit.scale}`);
  const back = toCanvas(fit, toGrid(fit, [77, -88]));
  if (Math.hypot(back[0] - 77, back[1] + 88) > 1e-6) fail("grid and drawing do not round-trip");

  /* The drawing's y runs south; north is up on the grid. A fit that
     missed the flip would mirror the tile. */
  const north = toGrid(fit, [0, -10]);
  const south = toGrid(fit, [0, 10]);
  const noRot = solveLink([{ canvas: [0, 0], grid: [0, 0] }, { canvas: [0, -10], grid: [0, 10] }]);
  if (!noRot || Math.abs(noRot.rotationDeg) > 1e-9) {
    fail("a point 10 m up the screen is not 10 m north \u2014 the drawing's south-running y is not flipped");
  }
  if (!(north && south)) fail("points do not convert");

  if (solveLink(pairs.slice(0, 1)) !== null) fail("one pair produces a fit");
  if (solveLink([{ canvas: [1, 1], grid: [5, 5] }, { canvas: [1, 1], grid: [9, 9] }]) !== null) {
    fail("two pairs at one place produce a fit");
  }

  /* The verdict in plain words. Two points always fit exactly, so two
     are "unproven" \u2014 never "good". */
  if (fitVerdict(solveLink(pairs.slice(0, 2))).level !== "unproven") {
    fail("a fit from two points is called good");
  }
  if (fitVerdict(fit).level !== "good") fail("an exact four-point fit is not called good");
  if (!/1\.8% small/.test(fitVerdict(fit).words)) {
    fail("a plan 1.8% out of scale is not flagged \u2014 every length measured on it is out by that");
  }
  const wrong = pairs.map((p, i) => (i === 1 ? { ...p, grid: [p.grid[0] + 6, p.grid[1]] } : p));
  if (fitVerdict(solveLink(wrong)).level !== "poor") {
    fail("a pair matched six metres wrong is not called poor");
  }
}

// 5. The canvas: never moves the drawing, snaps every OS point.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(align && e\.button === 0\) \{ alignClick\(px, py\); return; \}/.test(canvas)) {
    fail("a left click while matching does something other than match");
  }
  const at = canvas.indexOf("function alignClick");
  const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("async function saveAlign", at));
  if (!body) fail("there is no matching click");
  else {
    if (!/if \(!best\) \{/.test(body) || !/snaps to the nearest one/.test(body)) {
      fail("an OS click in open ground is accepted \u2014 a guessed OS point sits in every "
        + "coordinate the drawing reports");
    }
    if (!/grid: best\.g/.test(body)) {
      fail("the OS point is taken from where the tile happened to be drawn, not from "
        + "the corner's true easting and northing");
    }
  }
  /* Nothing drawn is touched by aligning. */
  const alignCode = canvas.slice(canvas.indexOf("async function importOsTile"),
    canvas.indexOf("async function createCircuitFrom"));
  if (/setFeatures\(|bulkUpdate|updateFeature\(/.test(alignCode)) {
    fail("aligning rewrites the drawing \u2014 the tile must be placed to meet the design, "
      + "not the design moved under the tile");
  }
  if (!/pts: pl\.pts\.map\(\(en\) => \(\{ c: toCanvas\(activeLink, en\), g: en \}\)\)/.test(canvas)) {
    fail("the tile is not drawn through the link");
  }
  if (!/overlayDrawn, align, activeLink\]\);/.test(canvas)) {
    fail("the draw does not repaint when the tile or the match changes");
  }
  if (!/gridLink \? \(\s*\n\s*<span className="hud-grid"/.test(canvas)) {
    fail("the easting and northing under the cursor ignore the fitted link, and drift "
      + "with distance on a turned plan");
  }
}

// 6. The sheet shows the tile where the screen does.
{
  const pv = readFileSync("./src/features/gis/printVector.js", "utf8");
  const cv = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const pts = pl\.pts\.map\(\(en\) => toCanvas\(gridLink, en\)\);/.test(pv)) {
    fail("the printed sheet does not draw the OS tile through the link");
  }
  const opts = cv.slice(cv.indexOf("const pdfOptions"), cv.indexOf("const pdfOptions") + 5000);
  if (!/\n\s*overlays,\n\s*gridLink,/.test(opts)) fail("the print is not handed the tiles");
}

// 7. The server refuses what cannot be right.
{
  const api = readFileSync("./netlify/functions/gis-overlay.js", "utf8");
  if (!/const MAX_BYTES = 5 \* 1024 \* 1024;/.test(api)) {
    fail("the size limit is above Netlify's 6 MB body limit, so it can never answer");
  }
  if (!/scale > 0\.5 && scale < 2/.test(api)) {
    fail("a link that makes the drawing twice the size of the map is saved");
  }
  if (!/if \(!onGrid\(Number\(mid\[0\]\), Number\(mid\[1\]\)\)\)/.test(api)) {
    fail("a tile not on the National Grid is stored");
  }
  let sql = "";
  try { sql = readFileSync("./supabase/migrations/0235_gis_overlay.sql", "utf8"); } catch { /* below */ }
  if (!sql) fail("0235 is missing");
  else {
    const b = sql.replace(/--[^\n]*/g, "");
    if (!/CREATE TABLE IF NOT EXISTS "GIS_Overlay"/.test(b)) fail("no overlay table");
    if (!/"Project_ID"\s+bigint PRIMARY KEY REFERENCES "Project"/.test(b)) {
      fail("a project can hold more than one grid link");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "OS tiles read from the numbers, and a plan is tied to the grid without moving.");
process.exit(bad ? 1 : 0);
