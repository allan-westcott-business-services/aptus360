/* A click is not a drag.

   Only the PAN had a movement threshold. Every other mode acted on the
   first pointermove, so a click that wavered by a pixel or two — which
   most clicks do, and every click on a trackpad does — moved whatever
   was under it and saved the move on release.

   Worst on a VERTEX, which snaps: its first move resolves the cursor
   against everything nearby, so a click on a cable end could jump it
   metres onto another feature. That is the drawing appearing to leap
   when all somebody did was select something.

   The threshold sits ABOVE every mode branch, because the vertex and
   anchor branches return before the delta is ever computed — a check
   below them would guard only the modes that were already least likely
   to surprise. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* One number, in SCREEN pixels: the same hand movement at any zoom. A
   metre of slack is a hair at 1:500 and a shove at 1:20. */
if (!/const DRAG_PX = \d+;/.test(canvas)) {
  fail("there is no drag threshold");
}

{
  const at = canvas.indexOf('if (d.mode !== "pan" && !d.moved) {');
  if (at < 0) {
    fail("nothing stops a press acting before it becomes a drag");
  } else {
    /* Above the branches that return early, or it guards nothing that
       needed guarding. */
    for (const branch of ['if (d.mode === "label")', 'if (d.mode === "anchor")',
      'if (d.mode === "vertex")']) {
      const bAt = canvas.indexOf(branch);
      if (bAt >= 0 && bAt < at) {
        fail(`the threshold is below the ${branch.match(/"(\w+)"/)[1]} branch, `
          + "which returns before it and so is never guarded");
      }
    }
    const body = canvas.slice(at, at + 500);
    if (!/Math\.hypot\(px - d\.startPx\[0\], py - d\.startPx\[1\]\) <= DRAG_PX/.test(body)) {
      fail("the threshold is not measured from where the pointer went down");
    }
    /* Once a drag, always a drag for that gesture: coming back inside
       the threshold must not put the thing down again. */
    if (!/d\.moved = true;/.test(body)) {
      fail("the gesture is re-tested every frame, so it stops being a drag "
        + "when the pointer comes back");
    }
    /* A mode with no startPx must not throw \u2014 the vertex drag carries
       none, which is why it sat below the delta in the first place. */
    if (!/if \(!d\.startPx\) \{/.test(body)) {
      fail("a mode that carries no start point throws on the first move");
    }
  }
}

/* And nothing is written for a gesture that never became one. */
{
  const at = canvas.indexOf('if (!d || d.mode !== "move") return;');
  const body = at < 0 ? "" : canvas.slice(at, at + 700);
  if (!/if \(!d\.moved\) return;/.test(body)) {
    fail("a click that never became a drag still writes a move \u2014 an undo "
      + "entry and a version bump for a gesture that did nothing");
  }
}

/* The pan keeps its own test, from the same constant. It moves the view
   from the first pixel and only records whether it counted, which is
   the opposite way round from every other mode. */
if (!/py - d\.startPx\[1\]\) > DRAG_PX\) \{/.test(canvas)) {
  fail("the pan's threshold is a separate number, so the two can drift");
}

console.log(bad ? `\n${bad} problem(s)`
  : "A click is not a drag (nothing moves until the pointer says so).");
process.exit(bad ? 1 : 0);
