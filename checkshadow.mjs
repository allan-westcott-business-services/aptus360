/* A name introduced across a long routine must not already live in it.

   The print work gave `draw` an overridable transform, and named it
   `at`. Five places inside that routine already declare an `at` of
   their own — a label's anchor, a boundary's anchor, two corner
   helpers — so inside those scopes every call meant for the transform
   found a coordinate ARRAY instead.

   It built, it passed every check, and it threw "at is not a function"
   the moment a layer drew one of them. Reported as "when I select the
   Water menu, J is not a function": the name had been minified, so
   nothing in the message pointed at it.

   The routine is 140,000 characters. A name added across all of it has
   to be one that appears nowhere else in it, and that is checkable. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

const at = canvas.indexOf("const draw = useCallback((over = null)");
const end = canvas.indexOf("\n  }, [visible, selected, view, toPx, printFrame,");
const body = at < 0 || end < 0 ? "" : canvas.slice(at, end);

if (!body) fail("the draw routine has moved; this check cannot find it");
else {
  /* The names the print pass introduces across the whole routine. Each
     must be declared exactly once in it. */
  for (const name of ["pxOf", "vs", "panX", "panY"]) {
    const decls = (body.match(new RegExp(`(?:const|let)\\s+${name}\\b`, "g")) || []).length;
    if (decls === 0) fail(`\`${name}\` is used across the routine and declared nowhere`);
    if (decls > 1) {
      fail(`\`${name}\` is declared ${decls} times in one routine \u2014 the inner `
        + "one shadows the outer, and every use below it means something else");
    }
  }

  /* And the transform is not GIVEN a name the routine already owns.
     Read from the declaration itself, not from the lines after it: the
     first attempt looked forward 120 characters and matched the body of
     the arrow function, so it failed on names that were fine. */
  const decl = (body.match(/(?:const|let)\s+(\w+)\s*=\s*over\?\.view/) || [])[1];
  if (!decl) fail("the print transform is not declared from `over?.view`");
  else {
    const others = (body.match(new RegExp(`(?:const|let)\\s+${decl}\\b`, "g")) || []).length;
    if (others > 1) {
      fail(`the print transform is named \`${decl}\`, and this routine declares `
        + `that name ${others} times \u2014 inside those scopes a call meant for the `
        + "transform finds something else");
    }
  }

  /* A non-function `at` must never be called as one. This is the fault
     itself, stated: `const at = f.Attributes?.Label_At;` followed by
     `at(...)` is what threw. */
  for (const m of body.matchAll(/(?:const|let) at\b[^\n]*/g)) {
    const decl = m[0];
    const isFn = /=>/.test(decl);
    if (isFn) continue;
    const win = body.slice(m.index, m.index + 700);
    if (/\bat\(/.test(win)) {
      fail(`\`${decl.trim().slice(0, 50)}\` is followed by a call to at(), which `
        + "is a coordinate rather than a function");
    }
  }
}

/* ── A canvas colour must be a colour the canvas understands ──

   Assigning a CSS variable to `fillStyle` or `strokeStyle` is silently
   IGNORED: no error, no warning, and the context keeps whatever colour
   it had from the last thing drawn. The MSDB's selected state used
   `var(--accent)`, which left a white square drawn in white with white
   letters \u2014 the board vanished when it was clicked and came back when
   it was not.

   The stylesheet in this file is full of `var(--...)` and it belongs
   there. Inside the draw routine it is a colour that will not appear. */
{
  const at = canvas.indexOf("const draw = useCallback((over = null)");
  const end = canvas.indexOf("\n  }, [visible, selected, view, toPx, printFrame,");
  const body = at < 0 || end < 0 ? "" : canvas.slice(at, end);
  if (!body) fail("the draw routine has moved; this check cannot find it");
  else {
    const bad = body.match(/ctx\.(?:fill|stroke)Style = [^;\n]*var\(--/g) || [];
    for (const line of bad) {
      fail(`a canvas colour is set to a CSS variable \u2014 ${line.trim().slice(0, 60)}`
        + " \u2014 which is ignored, leaving whatever was drawn before");
    }
    /* Gradients and patterns take colour stops too. */
    const stops = body.match(/addColorStop\([^)]*var\(--/g) || [];
    for (const line of stops) {
      fail(`a gradient stop is a CSS variable: ${line.trim().slice(0, 50)}`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "No name added across the draw routine is one it already used.");
process.exit(bad ? 1 : 0);
