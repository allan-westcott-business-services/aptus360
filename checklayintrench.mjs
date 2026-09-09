/* Lay a pipe or a cable along a trench somebody right-clicked.

   The trench is already the route: it was dug where the run has to go,
   it bends where the ground made it bend, and it is the length the run
   will be. Drawing that shape again by hand is copying a line already
   on the drawing, and the copy is never quite the same shape. */
import { readFileSync } from "node:fs";
import { carries } from "./src/features/gis/trenchCarries.js";
import { lineLength } from "./src/features/gis/snapping.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const at = canvas.indexOf("async function layInTrench");
const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("\n  async function", at + 30));

// 1. The whole trench, end to end, and its own shape.
{
  if (!body) fail("nothing lays a run along a trench");
  else {
    if (!/Geometry: g\.map\(\(p\) => \[p\[0\], p\[1\]\]\)/.test(body)) {
      fail("the run does not take the trench's own points, so it is a second "
        + "shape that has to stay in step with the first");
    }
    /* Copied, not referenced: the run is its own feature from here, and
       moving the trench later is a decision about the trench. */
    if (/Geometry: trench\.Geometry\b/.test(body)) {
      fail("the run shares the trench's array, so editing one edits both");
    }
    if (!/if \(g\.length < 2\)/.test(body)) {
      fail("a trench with no length is laid in anyway");
    }
  }

  /* And the copy really is the same run. */
  const g = [[0, 0], [10, 0], [10, 12], [24, 12]];
  const copy = g.map((p) => [p[0], p[1]]);
  if (lineLength(copy) !== lineLength(g)) {
    fail("a copied geometry is not the same length as the trench");
  }
}

// 2. What the dig is allowed to carry is honoured.
//
//    A trench with LV switched off is two circuits kept apart, drawn on
//    purpose. Laying an LV cable down it would undo by hand what
//    somebody set deliberately.
{
  if (!/if \(!carries\(trench, utility, voltage\)\)/.test(body)) {
    fail("a run is laid without asking what the trench carries, so a dig "
      + "marked as isolating can be cabled straight through");
  }
  /* HV and LV are asked for separately: both are electric, and a dig
     may take one and not the other. */
  if (!/typeKey === "elec_hv" \? "hv"/.test(body)) {
    fail("HV and LV are asked for as one thing, so a trench carrying only "
      + "one of them takes both");
  }

  const off = { Attributes: { Line_Type: "trench_main", Carries_LV: false, Carries_HV: true } };
  if (carries(off, "electric", "lv")) fail("the flag reader is not refusing LV");
  if (!carries(off, "electric", "hv")) fail("the flag reader is refusing HV wrongly");
  /* Silence still means everything: a drawing made before the flags
     existed lays as it always did. */
  const plain = { Attributes: { Line_Type: "trench_main" } };
  if (!carries(plain, "electric", "lv")) {
    fail("a trench with no flags refuses everything, so older drawings cannot "
      + "be laid in at all");
  }
}

// 3. It decides nothing else.
//
//    No circuit of its own, no cable size chosen here, no meters
//    served: those are questions about a network, and this is one
//    length of pipe in one dig. The editor asks them afterwards, the
//    way it does for a run drawn by hand.
{
  if (!/\.\.\.defaultsFor\(typeKey\)/.test(body)) {
    fail("the run does not take the same defaults a hand-drawn one would");
  }
  if (!/\.\.\.inheritedCircuit\(g, typeKey\)/.test(body)) {
    fail("the run does not inherit its circuit the way a hand-drawn one does");
  }
  /* Which dig it was laid in, STATED. Everything else works this out by
     proximity, and proximity cannot tell two parallel trenches apart. */
  if (!/In_Trench_ID: trench\.Feature_ID/.test(body)) {
    fail("the run does not record which trench it was laid in");
  }
}

// 4. Offered on a trench, from the types this project has.
{
  const menu = canvas.indexOf("Lay ${label} in this trench");
  if (menu < 0) fail("the context menu offers nothing to lay");
  else {
    const near = canvas.slice(menu - 1400, menu + 200);
    for (const key of ["elec_hv", "elec_main", "elec_service", "gas_main", "water_main"]) {
      if (!near.includes(`"${key}"`)) fail(`${key} is not offered`);
    }
    /* From the project's own types: a scheme with no gas layer has no
       gas pipe to lay, and a button for one is a button that fails. */
    if (!/const t = lineTypes\.find\(\(x\) => x\.Type_Key === key\);\s*\n\s*if \(!t\) return null;/
      .test(near)) {
      fail("the menu offers a fixed list rather than what the project has");
    }
  }
  /* And only on a trench. */
  if (!/isTrenchType\(ctx\.feature\.Attributes\?\.Line_Type, lineTypes\)/.test(canvas)) {
    fail("the branch is not limited to trenches, so it is offered on cables too");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Laying in a trench behaves (whole run, own shape, what the dig allows).");
process.exit(bad ? 1 : 0);
