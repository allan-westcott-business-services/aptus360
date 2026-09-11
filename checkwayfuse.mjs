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
import { fuseForWay, assignWay, SUB_DEFAULTS, WAY_FUSES } from "./src/features/gis/electric.js";

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

/* ── The header says what it is ──

   "Point" over a panel of ways, fuses and circuits names the least
   interesting true thing about it. */
{
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/Feature_Role === "substation" \? "Substation"/.test(editor)) {
    fail("the substation editor is still headed Point");
  }
  /* And the board is wide enough for its five columns. */
  if (!/Feature_Role === "substation" \? "fe fe-station"/.test(editor)) {
    fail("the substation panel is not widened for the board's columns");
  }
  if (!/\.fe\.fe-station \{ width: min\(504px/.test(editor)) {
    fail("the wider panel has no width rule, so the class does nothing");
  }
}

// 6. The standard ratings, and nothing invented.
{
  if (String(WAY_FUSES) !== String([160, 200, 315, 400, 500])) {
    fail(`the offered ratings are ${WAY_FUSES.join(", ")}`);
  }
}

// 7. Wired into the editor: a box per row, the loading judged against
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
  /* Chosen from the standard ratings, not typed: a free box invited
     3150 for 315 and nothing could notice. */
  if (!/<select className="fe-fuse"/.test(editor)) {
    fail("the fuse is still a free text field, so a mistyped rating "
      + "cannot be caught");
  }
  /* Read off the DRAFT, and through the same fallback rule the rest of
     the app uses, so a row following the board shows the rating it
     actually has rather than a blank. */
  if (!/value=\{String\(fuseForWay\(f, way\)\)\}/.test(editor)) {
    fail("the fuse box does not show the way's effective rating from the "
      + "draft, so the number and the bar beside it can disagree");
  }
  /* A board already carrying something off the list keeps it. Rounding
     somebody's 250 to the nearest option the day this ships is a
     change to their design made by opening a panel. */
  if (!/new Set\(\[\.\.\.WAY_FUSES, fuseForWay\(f, way\)\]\)/.test(editor)) {
    fail("a rating that is not one of the standard five is dropped from "
      + "the list, so opening the panel silently changes it");
  }
  /* And the board-wide control is gone: one box rating the whole board
     beside five rating each way is two answers to one question. */
  if (/id="fe-fuse"/.test(editor)) {
    fail("the board-wide fuse control is still there alongside the per-way "
      + "ratings");
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
