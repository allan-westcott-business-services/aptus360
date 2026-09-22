/* The paper scale a calibration implies.

   Reported off a screenshot: a plan calibrated at 1 unit = 0.0881 m
   was reported as "roughly 1:88" and flagged as not matching the
   drawing's stated 1:250. The calibration was right. The sum took one
   unit of the plan as a millimetre of paper, and a PDF's unit is a
   point — 1/72 inch, 0.3528 mm. Worked properly, 0.0881 m per point is
   1:250 exactly. */
import { readFileSync } from "node:fs";
import { impliedScaleOf, statedScaleOf, scaleDisagrees } from "./src/features/gis/planScale.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. The reported plan: 0.0881 m per point is 1:250.
{
  const s = impliedScaleOf(0.0881, "pdf");
  if (s !== 250) {
    fail(`0.0881 m per PDF point reads as 1:${s} — a point is 1/72 inch, so it is 1:250`);
  }
  if (scaleDisagrees(s, statedScaleOf("1: 250"))) {
    fail("a correct 1:250 calibration is flagged as not matching the stated 1:250");
  }
}

// 2. A real mismatch is still caught.
{
  /* Calibrated against the wrong sheet size, say: 1:250 stated, 1:500
     implied. That is what the warning exists for. */
  if (!scaleDisagrees(impliedScaleOf(0.1764, "pdf"), statedScaleOf("1:250"))) {
    fail("a calibration at 1:500 against a stated 1:250 is not flagged");
  }
  /* Plotting slop within 5% is not a fault. */
  if (scaleDisagrees(impliedScaleOf(0.0881 * 1.03, "pdf"), 250)) {
    fail("a 3% difference is flagged — that is ordinary plotting slop");
  }
}

// 3. An image claims no scale at all.
{
  /* A pixel has no size on paper until the scan resolution is known,
     and the file does not reliably say. A number with no basis would
     only be the same false alarm. */
  if (impliedScaleOf(0.0881, "image") !== null) {
    fail("an image is given a paper scale it has no basis for");
  }
  if (scaleDisagrees(impliedScaleOf(0.0881, "image"), 250)) {
    fail("an image's calibration is compared with a stated scale");
  }
}

// 4. What people type in the stated box.
{
  for (const [t, n] of [["1:250", 250], ["1: 250", 250], ["1/1,250", 1250], ["500", 500], ["", null]]) {
    if (statedScaleOf(t) !== n) fail(`"${t}" reads as ${statedScaleOf(t)}, wanted ${n}`);
  }
}

// 5. The setup uses it, and says which unit it measured in.
{
  const ui = readFileSync("./src/features/gis/BasemapSetup.jsx", "utf8");
  if (/derivedMpp \* 1000/.test(ui)) {
    fail("the setup still works the scale out in millimetres");
  }
  if (!/impliedScaleOf\(derivedMpp, basemap\?\.Source_Kind\)/.test(ui)) {
    fail("the setup does not use the shared scale sum");
  }
  if (!/scaleDisagrees\(impliedScale, statedScaleOf\(statedScale\)\)/.test(ui)) {
    fail("the mismatch warning is worked out separately from the sum");
  }
  if (!/1 \{isPdfPlan \? "pt" : "px"\}/.test(ui)) {
    fail("a PDF's calibration is labelled per pixel, when it is per point");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A PDF's scale is worked in points; an image claims none.");
process.exit(bad ? 1 : 0);
