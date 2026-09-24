/* The canvas remembers where somebody was looking.

   `view` is component state, so anything that unmounts the page — the
   browser discarding a background tab, a deploy swapping the chunk
   underneath, an error boundary — put somebody back at the default
   corner of a site they had been working in at 1:200. The cause of a
   remount is various and mostly outside this page; remembering the
   answer holds whatever the cause.

   Static, because the fault is a React lifecycle and a browser tab and
   the check for it would be a re-implementation of both. What it holds
   is the shape: stored per project, restored on mount, written on a
   delay, and clamped on the way back in. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

// 1. Kept per PROJECT. A position means nothing on another drawing.
{
  if (!/gisView:\$\{projectId\}/.test(canvas)) {
    fail("the view is not remembered per project, so opening another "
      + "drawing puts somebody where they were on the last one");
  }
}

// 2. Restored when the project changes — which includes a remount,
//    the case this exists for.
{
  if (!/recall\(viewKey, null\)/.test(canvas)) {
    fail("nothing reads the remembered view back, so it is written and "
      + "never used");
  }
  const at = canvas.indexOf("recall(viewKey, null)");
  const effect = at >= 0 ? canvas.slice(at - 200, at + 700) : "";
  if (!/\[viewKey\]/.test(effect)) {
    fail("the restore does not run when the project changes");
  }
  /* Clamped, by the SAME limits the rest of the page uses. A stored
     scale edited by hand, or written by an older version, must not
     leave the canvas at a zoom nothing can be seen at.

     This named the numbers (0.05 and 40) and went red when the ceiling
     was raised — on a clamp that was still perfectly correct. It names
     the constants now, which is the actual rule: one limit, read
     everywhere. */
  if (!/Math\.max\(MIN_SCALE, Math\.min\(MAX_SCALE, scale\)\)/.test(effect)) {
    fail("a stored scale is trusted unclamped, so one bad value leaves "
      + "the canvas at a zoom nothing is visible at");
  }
  /* And a stored value that is not numbers at all is refused rather
     than setting the view to NaN, which draws nothing and looks like a
     broken canvas. */
  if (!/Number\.isFinite/.test(effect)) {
    fail("a stored view is not checked for being numbers, so a bad value "
      + "sets the view to NaN and the canvas draws nothing");
  }
}

// 3. Written on a delay. A pan is a hundred view updates, and a
//    hundred writes is a hundred serialisations for one gesture.
{
  const at = canvas.indexOf("remember(viewKey, view)");
  if (at < 0) {
    fail("the view is never remembered");
  } else {
    const effect = canvas.slice(at - 400, at + 200);
    if (!/setTimeout/.test(effect)) {
      fail("the view is written on every change, which is a storage write "
        + "per frame of a pan");
    }
    if (!/clearTimeout/.test(effect)) {
      fail("the delayed write is not cancelled, so every pan leaves a "
        + "timer behind");
    }
  }
}

// 4. It is the session store, not the database. Where somebody was
//    looking is not a fact about the scheme, and should not follow
//    them to another machine or be inherited by a colleague.
{
  if (/updateProject\([^)]*view/i.test(canvas)) {
    fail("the view is written to the project, so a colleague opening the "
      + "drawing inherits somebody else's zoom");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The canvas comes back where it was left.");
process.exit(bad ? 1 : 0);
