/* Wash outs at the dead ends of a water main.

   Water standing at a blind end goes stale, so each one carries a wash
   out to flush and drain that leg. The rules that matter and are easy
   to get wrong: an END is one pipe at a node, a JUNCTION is three or
   more and takes none, a size change mid-street is not an end at all
   even though it is two runs meeting, and the POC is an end by geometry
   and the one place the water comes IN. */
import { readFileSync } from "node:fs";
import { washOuts } from "./src/features/gis/washOuts.js";
import { bulkDeleteCategories } from "./src/features/gis/bulkDelete.js";
import { SYMBOLS, SYMBOL_TEXT, symbolPath } from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
  { Type_Key: "water_service", Label: "Water Service", Layer_Key: "water" },
];
const main = (id, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "water", Geometry: pts, Attributes: { Line_Type: "water_main" } });
const poc = (at) => ({ Feature_ID: 99, Feature_Type: "point",
  Feature_Role: "poc", Layer_Key: "water", Geometry: [at] });

const has = (list, at, tol = 0.01) =>
  list.some((w) => Math.hypot(w.at[0] - at[0], w.at[1] - at[1]) <= tol);

// 1. A single main fed at one end: one wash out, at the far end.
{
  const { washouts } = washOuts([main(1, [[0, 0], [100, 0]]), poc([0, 0])],
    { lineTypes });
  if (washouts.length !== 1) {
    fail(`a straight main gets ${washouts.length} wash outs, not one`);
  } else if (!has(washouts, [100, 0])) {
    fail("the wash out is not at the dead end");
  }
  if (has(washouts, [0, 0])) {
    fail("a wash out is placed at the POC \u2014 that end is where the water "
      + "comes in, not a blind leg");
  }
}

// 2. A tee: the junction takes none, both legs beyond it take one.
{
  const world = [
    main(1, [[0, 0], [50, 0]]),
    main(2, [[50, 0], [100, 0]]),
    main(3, [[50, 0], [50, 40]]),
    poc([0, 0]),
  ];
  const { washouts } = washOuts(world, { lineTypes });
  if (has(washouts, [50, 0])) {
    fail("a wash out is placed at a junction \u2014 three pipes meeting is not "
      + "an end of pipe");
  }
  if (!has(washouts, [100, 0]) || !has(washouts, [50, 40])) {
    fail("a leg beyond the tee has no wash out at its end");
  }
  if (washouts.length !== 2) {
    fail(`a tee network gets ${washouts.length} wash outs, not two`);
  }
}

// 3. A size change mid-street is TWO runs meeting end to end, and is
//    not an end of pipe. This is the case that would quietly litter a
//    drawing: the builder cuts a run wherever the size changes.
{
  const world = [
    main(1, [[0, 0], [50, 0]]),
    main(2, [[50, 0], [100, 0]]),
    poc([0, 0]),
  ];
  const { washouts } = washOuts(world, { lineTypes });
  if (has(washouts, [50, 0])) {
    fail("a wash out is placed where two runs meet end to end \u2014 a size "
      + "change is not a dead end, and every taper would get one");
  }
  if (washouts.length !== 1) {
    fail(`two runs in a line get ${washouts.length} wash outs, not one`);
  }
}

// 4. Services are not mains and end nothing.
{
  const world = [
    main(1, [[0, 0], [100, 0]]),
    { Feature_ID: 5, Feature_Type: "line", Layer_Key: "water",
      Geometry: [[50, 0], [50, 10]],
      Attributes: { Line_Type: "water_service" } },
    poc([0, 0]),
  ];
  const { washouts } = washOuts(world, { lineTypes });
  if (has(washouts, [50, 10])) {
    fail("a wash out is placed at the end of a SERVICE \u2014 that is a plot "
      + "connection, and every house would get one");
  }
}

// 5. No POC: every end takes one, rather than the drawing silently
//    losing its wash outs because nothing knows which way water flows.
{
  const { washouts } = washOuts([main(1, [[0, 0], [100, 0]])], { lineTypes });
  if (washouts.length !== 2) {
    fail("with no POC on the drawing the ends are not reported");
  }
}

// 6. A POC dropped on the drawing but not connected suppresses nothing.
{
  const { washouts } = washOuts(
    [main(1, [[0, 0], [100, 0]]), poc([900, 900])], { lineTypes });
  if (washouts.length !== 2) {
    fail("a POC nowhere near the network suppresses a real wash out");
  }
}

// 7. The symbol exists, carries its letters, and draws a closed disc.
{
  if (!SYMBOLS.includes("washout")) {
    fail("washout is not in the symbol catalogue, so it cannot be chosen "
      + "in the style editor");
  }
  if (SYMBOL_TEXT.washout !== "WO") {
    fail("the wash out symbol does not carry its WO letters");
  }
  /* Drawn through the shared drawer, so it is a disc on screen and on
     paper alike \u2014 recorded here the way the print records it. */
  const subs = [];
  let cur = null;
  const rec = {
    beginPath() { subs.length = 0; cur = null; },
    moveTo(x, y) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); },
    lineTo(x, y) { cur?.pts.push([x, y]); },
    closePath() { if (cur) cur.closed = true; },
    rect() { fail("a wash out draws as a rectangle"); },
    arc(x, y, r, a0, a1) {
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        i ? this.lineTo(px, py) : this.moveTo(px, py);
      }
      this.closePath();
      cur = null;
    },
  };
  symbolPath(rec, "washout", 0, 0, 4);
  if (!subs.length || !subs[0].closed) {
    fail("the wash out symbol is not a closed shape, so it cannot be filled");
  } else {
    const rs = subs[0].pts.map(([x, y]) => Math.hypot(x, y));
    if (Math.max(...rs) - Math.min(...rs) > 0.3) {
      fail("the wash out symbol is not a disc");
    }
  }
}

// 8. Wired: the build places them, replaces its own, and the letters
//    reach the sheet. Its size and visibility are style fields, which
//    is what makes them editable in admin rather than fixed here.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/washOuts\(all, \{ lineTypes \}\)/.test(canvas)) {
    fail("Build Water Network does not place wash outs");
  }
  if (!/Feature_Role === "washout"[\s\S]{0,120}Generated/.test(canvas)) {
    fail("generated wash outs are not cleared before a rebuild, so every "
      + "run of the build leaves another one behind");
  }
  if (/Feature_Role: "washout"[\s\S]{0,400}Colour:/.test(canvas)) {
    fail("the build writes a colour onto a wash out \u2014 it should fall "
      + "through to the water layer so the disc matches its main");
  }

  const print = readFileSync("./src/features/gis/printVector.js", "utf8");
  if (!/SYMBOL_TEXT\[sym\]/.test(print)) {
    fail("the sheet does not write a symbol's letters, so a wash out "
      + "prints as a plain disc");
  }
  const writer = readFileSync("./src/features/gis/printPdf.js", "utf8");
  if (!/widthOfTextAtSize/.test(writer)) {
    fail("the writer cannot centre text, so the letters sit beside the "
      + "disc rather than inside it");
  }

  const admin = readFileSync("./src/features/admin/GisStylesAdmin.jsx", "utf8");
  if (!/\["washout", "Wash out"\]/.test(admin)) {
    fail("the wash out role is not offered in GIS Styles, so its size and "
      + "visibility cannot be set");
  }

  const mig = "./supabase/migrations/0213_washout_role.sql";
  let sql = "";
  try { sql = readFileSync(mig, "utf8"); } catch { /* reported below */ }
  if (!sql) {
    fail(`${mig} is missing \u2014 the role is refused by the Feature_Role `
      + "check constraint and the build cannot save a wash out at all");
  } else {
    if (!/'washout'/.test(sql)) fail("the migration does not allow the role");
    /* A CHECK is replaced wholesale, so a list copied from an older
       migration REVOKES every role added since — each primary, ring
       sub and open point on every drawing becomes a row its own table
       refuses. Cheap to do by accident, expensive to find. */
    const check = (sql.match(/CHECK \("Feature_Role" IN[\s\S]*?\)\);/) || [""])[0];
    for (const role of ["primary", "ringsub", "openpoint", "hdcutout", "msdb"]) {
      if (!check.includes(`'${role}'`)) {
        fail(`the role constraint drops '${role}' \u2014 replacing the CHECK `
          + "with an older list revokes roles that are on drawings now");
      }
    }
    /* The INSERT's own column list, not the file: the comments and the
       verification query below them mention Colour precisely BECAUSE it
       is deliberately unset, and a test that reads those is a test that
       fails on its own explanation. */
    const insert = (sql.match(/INSERT INTO "GIS_Style"[\s\S]*?;/) || [""])[0];
    const cols = (insert.match(/\(([^)]*)\)/) || ["", ""])[1];
    if (/"Colour"/.test(cols)) {
      fail("the seeded style sets a colour, freezing wash outs against "
        + "the main they terminate");
    }
    if (!/"Symbol_Size_Px"/.test(cols)) {
      fail("the seeded style sets no size, so a wash out starts at the "
        + "default and there is nothing in admin to adjust from");
    }
  }
}

// 9. Deletable in bulk, like every other generated fitting. A rebuild
//    replaces the generated ones, but a drawing somebody wants cleared
//    of wash outs — because the design changed, or they were placed
//    before the network was right — should not need them picked off
//    one at a time.
{
  const cats = bulkDeleteCategories([
    { Feature_ID: 1, Feature_Type: "point", Feature_Role: "washout",
      Layer_Key: "water", Geometry: [[0, 0]] },
    { Feature_ID: 2, Feature_Type: "point", Feature_Role: "servicevalve",
      Layer_Key: "water", Geometry: [[1, 0]] },
  ], { lineTypes: [], layers: [] });

  const wo = cats.find((c) => c.key === "washout");
  if (!wo) {
    fail("Bulk Delete offers no wash out category, so they can only be "
      + "deleted one at a time");
  } else {
    if (wo.count !== 1) {
      fail(`the wash out category counts ${wo.count} of one wash out`);
    }
    if (wo.ids.includes(2)) {
      fail("the wash out category takes service valves with it");
    }
  }
}

// 10. A wash out is a fitting on the PIPE. `connectedTo` is geometry
//     alone, and now the main reaches the end of the trench both lines
//     have a vertex at that point — so without a rule the wash out
//     reads as connected to the dig.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/washoutRefuses\(a, b\) \|\| washoutRefuses\(b, a\)\) return false;/
    .test(canvas)) {
    fail("nothing stops a wash out being linked to the trench it lies "
      + "in, which puts the dig into the network graph");
  }
  if (!/Connects: linksFor\(\{ Geometry: \[w\.at\], Feature_Role: "washout" \}, all\)/
    .test(canvas)) {
    fail("the build does not record what a wash out is joined to \u2014 the "
      + "links pass runs over the drawing as it was before they existed, "
      + "so nothing else will");
  }
}

// 11. The symbol says WO; nothing writes the number beside it. The
//     disc already carries the letters, so a black "WO 8" against it is
//     the same thing said twice on a plan with no room to spare.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/Feature_Role !== "washout"/.test(canvas)) {
    fail("the canvas writes a wash out's label beside its symbol, which "
      + "reads WO twice over");
  }
  const print = readFileSync("./src/features/gis/printVector.js", "utf8");
  if (!/if \(role === "washout"\) continue;/.test(print)) {
    fail("the sheet writes a wash out's label beside its symbol \u2014 the "
      + "print is labelling by rules of its own again");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Wash outs go at the dead ends, carry WO, and are styled from admin.");
process.exit(bad ? 1 : 0);
