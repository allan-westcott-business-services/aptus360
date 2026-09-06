/* As far out as the drawing, and no further.

   The zoom floor was a fixed 0.4 px per metre, which is a number and
   not an answer. On a site 368 m across that is 147 pixels — the whole
   scheme as a smudge in the middle of an empty window, and finding the
   way back is a hunt.

   The drawing's own extents are the answer: zoomed out until the work
   fills the window there is nothing further to see. */
import { readFileSync } from "node:fs";
import { drawnBounds } from "./src/features/gis/printSheet.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The floor is worked out, not typed. */
{
  if (/Math\.max\(0\.4, v\.scale \* factor\)/.test(canvas)) {
    fail("the zoom floor is still a fixed number, so a large drawing can be "
      + "zoomed away to nothing");
  }
  if (!/Math\.max\(fitScale\(\), v\.scale \* factor\)/.test(canvas)) {
    fail("the wheel does not stop at the drawing's extents");
  }
  const at = canvas.indexOf("const fitScale = useCallback");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [features]);", at));
  if (!fn) fail("nothing works out how far out the drawing goes");
  else {
    /* Slack, so the outermost feature is not against the frame. */
    if (!/b\.w \* 1\.08/.test(fn)) {
      fail("the fit has no margin, so the outermost feature sits on the frame");
    }
    /* ── Never a trap ──
       On a drawing with one point in it, or none, the extents say
       nothing useful. A floor derived from nothing would lock somebody
       at whatever zoom they happened to be at. */
    if (!/if \(!wrap \|\| !b \|\| b\.w <= 0 \|\| b\.h <= 0\) return 0\.05;/.test(fn)) {
      fail("an empty or single-point drawing derives a floor from nothing, "
        + "which locks the zoom where it stands");
    }
    if (!/!r\.width \|\| !r\.height/.test(fn)) {
      fail("a window with no size yet gives a floor of infinity");
    }
  }
}

/* And a way to get there in one action, which is the same place. */
{
  if (!/const zoomToExtent = useCallback/.test(canvas)) {
    fail("there is no way to zoom to the extents in one action");
  }
  if (/setView\(\{ x: 60, y: 60, scale: 4 \}\)/.test(canvas)) {
    fail("Reset View still jumps to a fixed corner at a fixed scale, which "
      + "on a large site is an empty field beside the work");
  }
  if (!/label="Zoom to Extents"/.test(canvas)) {
    fail("the menu does not offer it");
  }
}

/* The arithmetic, against a real site. */
{
  const raw = JSON.parse(readFileSync("./fixtures/drawing-2202-043-straight-joint.json", "utf8"));
  const b = drawnBounds(raw.features);
  if (!b) fail("the fixture has no bounds");
  else {
    const fit = Math.min(1600 / (b.w * 1.08), 900 / (b.h * 1.08));
    if (!(fit > 0.4)) {
      fail(`the fitted floor (${fit.toFixed(2)}) is below the old fixed one, `
        + "so this change would make no difference on a real site");
    }
    /* At the floor, the work fills the window rather than sitting in it. */
    if (b.w * fit < 700) {
      fail(`at the floor the drawing is only ${(b.w * fit).toFixed(0)} px across `
        + "in a 1600 px window");
    }
  }
}

/* The drag no longer announces what the drawing already showed. */
{
  if (/connected line end\(s\) moved with it/.test(canvas)) {
    fail("dragging a fitting still announces the cables that followed it, "
      + "which pushes the drawing down a line mid-gesture");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The zoom stops at the drawing (and a drag says nothing).");
process.exit(bad ? 1 : 0);
