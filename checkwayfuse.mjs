/* A fuse rating per way, not per board.

   A substation's board carried ONE rating for all of its ways, which
   is only true where every circuit is the same size. A way feeding
   four flats and a way feeding a street of houses are not protected
   by the same fuse, so a loading percentage quoted against a
   board-wide rating was answering a question nobody had asked.

   `Way_Fuses` is the map, way to rating, read beside the
   `Way_Circuits` map it sits next to. `Way_Fuse_A` stays as the
   board's default — it is what every existing drawing has, and the
   order (way, then board, then built-in) is what makes this safe to
   add to a database full of them. */
import { readFileSync } from "node:fs";
import { fuseForWay, assignWay, SUB_DEFAULTS } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const sub = (attrs) => ({ Feature_ID: 1, Feature_Role: "substation",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: { Ways: 4, ...attrs } });

// 1. The way's own rating wins.
{
  const s = sub({ Way_Fuse_A: 400, Way_Fuses: { 2: 100 } });
  if (fuseForWay(s, 2) !== 100) fail("a way's own fuse is not used");
  if (fuseForWay(s, 1) !== 400) {
    fail("a way with no rating of its own does not fall back to the board");
  }
}

// 2. Every drawing that predates this reads exactly as it did.
//    Nothing has Way_Fuses yet, so this is the ONLY case that matters
//    on the day it ships.
{
  if (fuseForWay(sub({ Way_Fuse_A: 315 }), 3) !== 315) {
    fail("an existing board's rating stops applying to its ways");
  }
  if (fuseForWay(sub({}), 1) !== SUB_DEFAULTS.Way_Fuse_A) {
    fail("a board with nothing set does not fall back to the built-in default");
  }
}

// 3. jsonb hands the map back with string keys; the editor writes
//    whatever the row's `way` is. One shape assumed is a rating that
//    silently reverts to the board's.
{
  if (fuseForWay(sub({ Way_Fuses: { "2": 100 } }), 2) !== 100) {
    fail("a fuse stored under a string key is not found by number");
  }
  if (fuseForWay(sub({ Way_Fuses: { 2: 100 } }), "2") !== 100) {
    fail("a fuse stored under a number key is not found by string");
  }
}

// 4. Cleared means "follow the board", not "no fuse". An empty box
//    writes "" before it writes nothing at all, and a rating of zero
//    would read as unprotected.
{
  const s = sub({ Way_Fuse_A: 400, Way_Fuses: { 2: "", 3: 0, 4: null } });
  for (const w of [2, 3, 4]) {
    if (fuseForWay(s, w) !== 400) {
      fail(`way ${w} cleared to ${JSON.stringify(s.Attributes.Way_Fuses[w])} `
        + `reads as ${fuseForWay(s, w)} rather than following the board`);
    }
  }
}

// 5. Over is over THIS way's fuse — the point of the whole thing.
{
  /* 60 kVA at 400 V is about 87 A: within a 100 A way, over a 60 A one. */
  const roomy = assignWay(sub({ Way_Fuse_A: 400, Way_Fuses: { 1: 100 } }), 9, 60);
  if (roomy.over) {
    fail(`87 A on a 100 A way is reported over (fuse read as ${roomy.fuse})`);
  }
  const tight = assignWay(sub({ Way_Fuse_A: 400, Way_Fuses: { 1: 60 } }), 9, 60);
  if (!tight.over) {
    fail(`87 A on a 60 A way is not reported over (fuse read as ${tight.fuse})`);
  }
  if (tight.fuse !== 60) {
    fail(`the way's fuse is not carried back for the message to quote: ${tight.fuse}`);
  }
  /* And a board with no per-way ratings behaves as it always did. */
  const old = assignWay(sub({ Way_Fuse_A: 60 }), 9, 60);
  if (!old.over) fail("a board-wide rating no longer decides over on its ways");
}

// 6. Wired into the editor: a box per row, the loading judged against
//    it, and the board's rating shown as the placeholder rather than
//    written in as a value.
{
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/Fuse rating for way \$\{way\}/.test(editor)) {
    fail("no way has a fuse box, so a rating cannot be set per circuit");
  }
  if (!/setAttr\("Way_Fuses"\)\(per\)/.test(editor)) {
    fail("the rating is not written to the per-way map");
  }
  if (!/const fuse = way == null \? wayFuse : fuseForWay\(f, way\)/.test(editor)) {
    fail("the loading bar still measures every way against the board's "
      + "rating, so the percentage is not this way's");
  }
  if (!/placeholder=\{String\(wayFuse \|\| SUB_DEFAULTS\.Way_Fuse_A\)\}/.test(editor)) {
    fail("the board's default is not offered as a placeholder, so a row "
      + "following the board looks like a row with no fuse at all");
  }
  /* Read off the DRAFT: a rating typed in has to move the bar under it
     before anything is saved, or the number and the bar disagree on
     screen. */
  if (!/value=\{\(f\.Attributes\.Way_Fuses \|\| \{\}\)\[way\] \?\? ""\}/.test(editor)) {
    fail("the fuse box does not read the draft, so typing a rating does "
      + "not move the loading bar beside it");
  }
  /* The column exists in the header and in the grid, or the cells land
     under the wrong headings. */
  if (!/<span>Way<\/span><span>Circuit<\/span><span>Fuse<\/span>/.test(editor)) {
    fail("the board has no Fuse heading");
  }
  if (!/grid-template-columns: 34px 1fr 74px 150px 40px/.test(editor)) {
    fail("the grid was not widened for the new column, so every cell "
      + "after it sits under the wrong heading");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Each way carries its own fuse rating (and an untouched board reads as before).");
process.exit(bad ? 1 : 0);
