/* A line's length: what it is drawn as, and what somebody measured.

   Two facts that had been sharing a column. `Length_m` is maintained by
   `gis_length_trg`, a database trigger recomputing it from the geometry
   on every change; the Feature Editor offered that same attribute as a
   "Measured length" override. So every line arrived carrying a
   measurement equal to its drawn length — the label read "299.8 m
   entered" about its own geometry, the panel announced that
   calculations read 299.8 m instead of the drawn 299.8 m, and a real
   measurement would have been overwritten by the next drag.

   `Measured_Length_m` is a person's statement about the world and
   nothing writes it but them. The drawn length is computed from the
   geometry every time it is asked for, never stored — which is what
   makes a line rubber-banded by a joint being dragged show its new
   length as it moves. A stored figure is a snapshot of where the line
   used to be. */
import { readFileSync } from "node:fs";
import { drawnLength, runLength, hasMeasured } from "./src/features/gis/lengths.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const label = (f) => (hasMeasured(f)
  ? `${runLength(f).toFixed(1)} m entered`
  : `${drawnLength(f).toFixed(1)} m`);

// 1. A line as the trigger leaves it: Length_m mirrors the drawing, and
//    that is not a measurement anybody made.
{
  const f = { Geometry: [[0, 0], [100, 0]], Attributes: { Length_m: 100 } };
  if (hasMeasured(f)) {
    fail("a line the trigger touched claims somebody measured it");
  }
  if (label(f) !== "100.0 m") {
    fail(`the label reads "${label(f)}" on a line nobody measured`);
  }
  if (runLength(f) !== 100) fail("the run length is not the drawn length");
}

// 2. Stretched — the whole point. The label follows the geometry
//    because the geometry is what it is computed from.
{
  const f = { Geometry: [[0, 0], [100, 0]], Attributes: { Length_m: 100 } };
  f.Geometry = [[0, 0], [140, 0]];
  if (label(f) !== "140.0 m") {
    fail(`a stretched line still reads "${label(f)}" — the label is reading `
      + "a stored figure, which is where the line used to be");
  }
}

// 3. A measurement is a statement about the world, so it stands when
//    the drawing changes. That is the difference between the two, and
//    the reason for two fields.
{
  const f = { Geometry: [[0, 0], [140, 0]],
    Attributes: { Length_m: 140, Measured_Length_m: 152.5 } };
  if (label(f) !== "152.5 m entered") fail(`the measured label reads "${label(f)}"`);
  f.Geometry = [[0, 0], [160, 0]];
  if (runLength(f) !== 152.5) {
    fail("a measured length moved when the drawing did");
  }
  if (drawnLength(f) !== 160) fail("the drawn length did not follow the drawing");
}

// 4. Cleared, and the drawing answers again.
{
  const f = { Geometry: [[0, 0], [90, 0]],
    Attributes: { Measured_Length_m: null, Length_m: 90 } };
  if (hasMeasured(f) || runLength(f) !== 90) {
    fail("clearing the measurement does not go back to the drawing");
  }
}

// 5. Degenerate geometry is zero, not NaN — a point has no length, and
//    a run reaching it adds nothing.
{
  if (drawnLength({ Geometry: [[1, 1]] }) !== 0) fail("a single point has a length");
  if (drawnLength({}) !== 0) fail("a feature with no geometry is not zero");
  if (runLength(null) !== 0) fail("nothing at all is not zero");
}

/* And the canvas label goes through it rather than keeping its own
   copy — the fault this replaces was one rule written in eight
   places. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const lengthLabel = \(f\) => \(hasMeasured\(f\)/.test(canvas)) {
    fail("the line label does not use the shared rule");
  }
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/setAttr\("Measured_Length_m"\)/.test(editor)) {
    fail("the editor still writes the trigger's own column");
  }
  if (/Measured_At_Drawn_m/.test(editor + canvas)) {
    fail("a second way of noticing a redraw is still in the source \u2014 the "
      + "baseline is the ref in the canvas, and two would drift");
  }
}

/* ── Redrawing a line that carries a measurement ──

   A measurement is a deliberate statement about the world, so when the
   line is redrawn the app cannot know what was meant. The measurement
   might still be right — the drawing was tidied, the run did not
   change — or it might be the thing that just changed. Keeping it
   silently leaves a stale figure every calculation trusts; clearing it
   silently throws away something somebody went out and measured.

   Watched over `features` rather than hooked into the ten places that
   save geometry: an effect catches all of them, including undo, and
   cannot be forgotten by the eleventh. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/const measuredSeen = useRef\(new Map\(\)\);/.test(canvas)) {
    fail("nothing remembers what a measured line was drawn as, so a redraw "
      + "cannot be noticed");
  }
  /* Only lines that carry one. A drawing is mostly lines nobody has
     measured and they are none of this effect's business. */
  if (!/if \(f\.Feature_Type !== "line" \|\| !hasMeasured\(f\)\) continue;/.test(canvas)) {
    fail("the watcher looks at lines with no measurement on them");
  }
  /* Not mid-drag: `features` changes every frame, and a length still
     moving is not a number to ask about. */
  if (!/if \(drag\.current\) return;/.test(canvas)) {
    fail("it asks while the line is still being dragged");
  }
  /* Once per redraw: the new length becomes the baseline whether or not
     anybody answers, or the dialog returns on every render. */
  if (!/measuredSeen\.current = next;/.test(canvas)) {
    fail("the baseline is not moved on, so the question repeats");
  }
  if (!/Math\.abs\(before - now\) > 0\.01/.test(canvas)) {
    fail("float noise off a database round trip reads as a redraw");
  }

  /* Three answers, and no fourth way out — dismissing would silently
     pick one of three different designs. */
  const dialog = canvas.slice(canvas.indexOf("{measuredAsk && ("),
    canvas.indexOf("{circuitPick && ("));
  if (!dialog) fail("the dialog has gone");
  else {
    for (const how of ["keep", "remove", "update"]) {
      if (!new RegExp(`answerMeasured\\("${how}"`).test(dialog)) {
        fail(`no "${how}" answer`);
      }
    }
    if (/cpick-backdrop" onClick/.test(dialog)) {
      fail("clicking the backdrop dismisses it, which silently keeps the "
        + "measurement without anybody deciding to");
    }
    if (!/disabled=\{!\(Number\(measuredAsk\.entry\) > 0\)\}/.test(dialog)) {
      fail("Update accepts a blank or a zero, which is neither a "
        + "measurement nor a removal");
    }
  }

  /* And keeping writes nothing at all. */
  const fn = canvas.slice(canvas.indexOf("async function answerMeasured"),
    canvas.indexOf("async function answerMeasured") + 1600);
  if (!/if \(!ask \|\| how === "keep"\) return;/.test(fn)) {
    fail("keeping the measurement still writes to the database");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Lengths behave (drawn follows the drawing, measured is somebody's word).");
process.exit(bad ? 1 : 0);
