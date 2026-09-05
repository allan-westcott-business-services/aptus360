/* The figure at the cut-out, drawn at the cut-out.

   A stop's levels are the drop to that POINT on the main. What a
   customer actually gets is that plus their own service, and the levels
   already work it out — `atCutout`, for the worst-served meter on the
   stop, whose id is recorded with it.

   It was in the report and nowhere on the drawing, so the one figure a
   design is judged on could only be read by finding a row in a table
   and then finding the plot.

   ── One per stop, not one per plot ──

   The worst of the meters a stop serves is the one that has to pass.
   Drawing the same figure against every plot on the leg would be twenty
   labels saying one thing, on a drawing already carrying the plan. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* Keyed on the meter the levels name, not on the stop. */
{
  const at = canvas.indexOf("const cutoutAtMeter = useMemo");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [elecLevelsAt]);", at));
  if (!fn) fail("nothing maps a cut-out figure to the meter it belongs to");
  else {
    if (!/vd\?\.service\?\.meterId/.test(fn)) {
      fail("the figure is not tied to the worst-served meter the levels name");
    }
    /* A service with no cable spec has no figure, and drawing one would
       be inventing it. */
    if (!/vd\.service\?\.missingSpec/.test(fn)) {
      fail("a service with no cable specified still gets a figure");
    }
    /* Where two stops serve one meter, the worse is the one that has to
       pass. */
    if (!/vd\.atCutout\.pct > was\.pct/.test(fn)) {
      fail("a meter served by two stops keeps whichever was found first "
        + "rather than the worse figure");
    }
  }
}

/* Drawn at the meter, behind the same switch as the other levels. */
{
  const at = canvas.indexOf("if (isMeter && cutoutAtMeter.size");
  const draw = at < 0 ? "" : canvas.slice(at, at + 1600);
  if (!draw) fail("the cut-out figure is never drawn");
  else {
    /* ── The gate that actually controls it ──

       `labelShown` takes a FEATURE and asks whether that feature's
       label shows. Passing it the string "levels" asked about a feature
       that does not exist, and it answered no every time \u2014 so the
       figures were never drawn at all, on a build where everything else
       was right.

       The switch these belong to is `labelKinds.levels`, which is what
       the node levels beside them use. */
    if (/labelShown\("levels"\)/.test(draw)) {
      fail("the gate asks labelShown for a kind, which answers no every "
        + "time \u2014 nothing is drawn");
    }
    if (!/labelKinds\.levels !== false/.test(draw)) {
      fail("it cannot be turned off with the other level labels");
    }
    /* And nothing is drawn before the levels check has run. */
    if (!/elecLevelsAt && labelKinds\.levels/.test(draw)) {
      fail("it draws without levels to draw");
    }
    if (!/view\.scale > 1\.2/.test(draw)) {
      fail("it draws at every zoom, so a whole estate is covered in "
        + "percentages when zoomed out");
    }
    /* Red past the limit, and only then: every figure in red is a
       drawing nobody reads. */
    if (!/co\.pct > lim \? "#b91c1c" : "#334155"/.test(draw)) {
      fail("the figure is not marked when it is over the limit, or is "
        + "marked when it is not");
    }
    /* The limit is the main's allowance plus the service's, which is
       what atCutout includes \u2014 judging it against the main's alone
       would fail every plot. */
    if (!/Max_Volt_Drop_Pct/.test(draw) || !/Max_Service_Volt_Drop_Pct/.test(draw)) {
      fail("the limit does not include the service allowance, so a figure "
        + "that includes the service is judged against the main's alone");
    }
    if (!/ctx\.strokeText\(text, tx, p\.y\)/.test(draw)) {
      fail("no halo, so the figure is unreadable over the plan beneath it");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Cut-out figures behave (at the worst-served meter, one per stop).");
process.exit(bad ? 1 : 0);
