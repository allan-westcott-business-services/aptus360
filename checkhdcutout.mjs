/* A heavy duty cut-out, spliced into an LV feeder.

   The cable runs THROUGH it: no loss, no break in the run, and no
   feeder end point at its position.

   None of that is written anywhere, and that is the point. Every rule
   that makes a fitting matter to the network names the roles it acts
   on — `jointMarks` for a stop, `isBreak` for a section end — so a role
   none of them mentions is passive by construction rather than by a
   flag somebody has to remember to set. This check holds that silence
   in place: it fails if any of those rules learns the role. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");
const points = readFileSync("./src/features/gis/feederPoints.js", "utf8");
const migration = readFileSync("./supabase/migrations/0209_hdcutout_role.sql", "utf8");

// 1. Passive: nothing in the network reasoning knows the role.
{
  /* A stop would give it a feeder end point. */
  if (/hdcutout/.test(points)) {
    fail("feederPoints knows the role, so a cut-out would get a feeder end "
      + "point of its own");
  }
  /* A break would end a section there and cut the cable in two. */
  const breakBlock = feeder.slice(feeder.indexOf("const breakAt = new Set();"),
    feeder.indexOf("const isBreak"));
  if (/hdcutout/.test(breakBlock)) {
    fail("a cut-out breaks the run, so the cable it is spliced into is laid "
      + "as two cables");
  }
  /* And nothing in the volt drop: it introduces no loss. */
  const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");
  if (/hdcutout/.test(vd)) fail("the volt drop knows the role, so it costs something");
}

// 2. On an LV feeder, and only that.
//
//    Not HV, which is a different conductor at a different voltage, and
//    not a service, which has a cut-out of its own at the plot.
{
  if (!/function lvFeederAt\(pointWorld\)/.test(canvas)) {
    fail("there is no LV-only test, so a cut-out can be dropped on HV");
  }
  /* Named types rather than a substring: `/main/` matching
     `trench_main` cost a rebuild, and a rule that matches on part of a
     word eventually matches a word nobody meant. */
  if (!/if \(t !== "elec_main"\) return null;/.test(canvas)) {
    fail("the LV test matches on part of a word rather than the type itself");
  }
  const at = canvas.indexOf('if (role === "hdcutout") {');
  if (at < 0) fail("nothing places a cut-out");
  else {
    const body = canvas.slice(at, at + 3000);
    if (!/const hit = lvFeederAt\(point\);/.test(body)) {
      fail("the placement does not use the LV-only test");
    }
    if (!/A heavy duty cut-out goes on an LV feeder cable/.test(body)) {
      fail("clicking off a feeder fails silently instead of saying why");
    }
  }
}

// 3. Turned to lie along the cable.
//
//    A fitting in the ground leans with the trench, unlike a board,
//    which is a thing in a building and stays upright.
{
  const at = canvas.indexOf('if (role === "hdcutout") {');
  const body = at < 0 ? "" : canvas.slice(at, at + 3000);
  if (!/Math\.atan2\(b\[1\] - a\[1\], b\[0\] - a\[0\]\)/.test(body)) {
    fail("the cut-out is not turned to the cable it sits on");
  }
  /* The segment it landed on, not the whole run: a feeder bends, and
     the angle that matters is the one under the symbol. */
  if (!/const a = g\[hit\.index - 1\];/.test(body)) {
    fail("the angle comes from the whole run rather than the segment under it");
  }
  /* And the drawing turns it. */
  const draw = canvas.indexOf('if (f.Feature_Role === "hdcutout") {');
  if (draw < 0) fail("nothing draws a cut-out");
  else {
    const sym = canvas.slice(draw, draw + 2200);
    if (!/ctx\.rotate\(\(deg \* Math\.PI\) \/ 180\)/.test(sym)) {
      fail("the symbol is drawn without rotating to its angle");
    }
    /* Assigning a CSS variable to strokeStyle is silently ignored and
       the symbol keeps whatever colour was last set. */
    if (/strokeStyle = ["'`]?var\(--/.test(sym)) {
      fail("the symbol is stroked with a CSS variable, which the canvas ignores");
    }
    if (!/return;/.test(sym)) {
      fail("the symbol falls through to the default circle drawn on top of it");
    }
  }
}

// 4. The role exists in the database, and the style with it.
{
  if (!/'hdcutout'\)\);/.test(migration.replace(/\s+/g, " ").replace(/ \)/g, ")"))
    && !/msdb','hdcutout'/.test(migration.replace(/\s+/g, ""))) {
    fail("the role is not added to the Feature_Role constraint");
  }
  if (!/INSERT INTO "GIS_Style"/.test(migration)) {
    fail("no style row, so the drawing has nothing to size or colour it by");
  }
  /* Every role already allowed must survive: the constraint is
     rewritten whole, and one left out is every feature of that kind
     refused on its next save. */
  for (const role of ["msdb", "linkbox", "feederpoint", "joint", "meter",
    "spannode", "reducer", "nrs"]) {
    if (!migration.includes(`'${role}'`)) {
      fail(`the constraint no longer allows '${role}', which was allowed before`);
    }
  }
}

// 5. It snaps to a midpoint, a vertex or an end, and says so.
//
//    Those are the three places a fitting belongs on a run. The green
//    circle under the pointer is what tells somebody which one is about
//    to be taken, and it never appeared: the mousemove handler showed
//    the snap while drawing, or aiming a joint, or tracing — and
//    `placing` is the PLOT QUEUE, not a plant placement. Arming a
//    cut-out sets `plantPlace`, which it did not mention.
{
  if (!/if \(drawing \|\| placing \|\| jointFor \|\| traceFrom \|\| plantPlace\) \{/.test(canvas)) {
    fail("the snap indicator is not shown while a fitting is armed, so "
      + "nothing says where the symbol will land");
  }

  const at = canvas.indexOf('if (role === "hdcutout") {');
  const body = at < 0 ? "" : canvas.slice(at, at + 3600);
  if (!/snapTargets\(\[hit\.line\], \{ includeMidpoints: true \}\)/.test(body)) {
    fail("the cut-out lands wherever the click did rather than on a midpoint, "
      + "vertex or end");
  }
  /* Its own cable only: snapping to the whole drawing would take the
     vertex of a trench that happens to cross here, and the symbol would
     sit on a line it is not spliced into. */
  if (/snapTargets\(visible/.test(body) || /snapTargets\(features/.test(body)) {
    fail("it snaps to the whole drawing, so it can land on a line it is not "
      + "spliced into");
  }
  /* A target carries `point`. Read as x and y it came back undefined,
     every distance was NaN, and the first candidate won by default —
     the cable's start, wherever somebody had clicked. */
  if (/t\.x - point\[0\]/.test(body)) {
    fail("the candidate's coordinates are read as x and y, which are "
      + "undefined \u2014 every distance is NaN and the first candidate wins");
  }
  if (!/const q = t\.point;/.test(body)) {
    fail("the candidate's point is not read from `point`");
  }
  /* And a long straight span with no vertex near the pointer still
     takes the fitting where it was aimed. */
  if (!/: hit\.q;/.test(body)) {
    fail("with no candidate in reach the placement has no fallback, so a "
      + "click mid-span lands nowhere");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The heavy duty cut-out behaves (LV only, turned to the cable, passive).");
process.exit(bad ? 1 : 0);
