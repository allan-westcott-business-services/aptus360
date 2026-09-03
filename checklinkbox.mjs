/* The link box: one input, fused outputs, drawable at last.

   The role existed since 0072 — carried with trenches, bulk deletable,
   findable — but nothing could place one, no editor knew its shape and
   the symbol was a seeded red square. What must hold now:

   - two menu entries arm a click, 2 way and 4 way;
   - placement lands it on an electric main within reach, takes the
     cable's bearing, and seeds Link_Ways with an empty fuse map;
   - the symbol is the style's square with an input node on the back
     face and numbered outputs on the front;
   - the editor offers ways and the fuse ladder — 200, 315, 400, 630 A
     — and switching 4 to 2 hides ways 2 and 3 without deleting them;
   - the link passes record Connects for link boxes, so the cables
     that connect to one are connected to it on the drawing too;
   - the style migration turns the seeded red to joint yellow.

   Structural throughout: the object is stitched into the canvas and
   the editor, and what drifts is the stitching. */
import { readFileSync, existsSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

if (!/\+ Link Box \(2 way\)/.test(canvas) || !/\+ Link Box \(4 way\)/.test(canvas)) {
  fail("the Electric menu no longer offers both link boxes");
}
if (!/placeNode\("linkbox", "electric", \{ ways: 2 \}\)/.test(canvas)
  || !/placeNode\("linkbox", "electric", \{ ways: 4 \}\)/.test(canvas)) {
  fail("the menu entries do not arm a click with the ways");
}
if (!/Link_Ways: ways,\s*\n\s*Way_Fuse_A: \{\},/.test(canvas)) {
  fail("placement no longer seeds ways and an empty fuse map");
}
if (!/f\.Feature_Role === "linkbox"\) \{\n\s*\/\* ── One input, fused outputs/.test(canvas)) {
  fail("the link box has no draw branch of its own");
}
if (!/const outs = ways === 4 \? \[-0\.6, 0, 0\.6\] : \[0\];/.test(canvas)) {
  fail("the outputs are not one for a 2 way and three for a 4 way");
}
if (!/ctx\.fillText\(String\(i \+ 1\),/.test(canvas)) {
  fail("the 4 way's outputs are not numbered");
}

if (!/const FUSES = \[200, 315, 400, 630\];/.test(editor)) {
  fail("the fuse ladder is missing or moved — 200, 315, 400, 630");
}
if (!/Link box \(\$\{Number\(feature\.Attributes\?\.Link_Ways\) === 4 \? "4" : "2"\} way\)/.test(editor)) {
  fail("the editor's header no longer says how many ways");
}
if (!/length: ways === 4 \? 3 : 1/.test(editor)) {
  fail("the editor does not show one fuse for a 2 way and three for a 4 way");
}

/* Cables connect: the five link passes carry the role. Counted rather
   than matched against feederpoint, because feederpoint also appears
   in passes that are not about linking (the levels cache key, circuit
   membership) and a blunt comparison flagged those. */
const boxes = (canvas.match(/\|\| f\.Feature_Role === "linkbox"/g) || []).length;
if (boxes < 5) {
  fail(`the link passes carry linkbox ${boxes} time(s), expected the five passes`);
}

if (!existsSync("./supabase/migrations/0202_link_box.sql")) {
  fail("migration 0202_link_box.sql is missing");
} else {
  const sql = readFileSync("./supabase/migrations/0202_link_box.sql", "utf8");
  if (!/SET "Colour" = '#f59e0b'/.test(sql) || !/'linkbox'/.test(sql)) {
    fail("0202 does not turn the link box joint yellow");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Link boxes behave (2 or 4 way, fused, numbered, on the cable run).");
process.exit(bad ? 1 : 0);
