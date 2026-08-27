/* What is in a trench comes with it.

   A trench is dug once and the cables and pipes lie in it. Reshape the
   trench — pull a vertex into a dog leg, drag an end, add a bend — and
   everything in it stayed where it was, hanging in the ground beside
   the new route.

   The only way back was to delete the cables and run Auto Lay Services
   again, which loses every size and status set on them by hand. So the
   cost of a small correction to the dig was a rebuild of what was in
   it, and the fault it produced — a cable that no longer follows its
   trench — is invisible on screen at anything but close zoom. */

import { readFileSync } from "node:fs";
import { carryLine, alongAt, pointAlong } from "./src/features/gis/carryContents.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const near = (a, b, tol = 0.01) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const has = (g, p) => (g || []).some((q) => near(q, p));

const straight = [[0, 0], [100, 0]];

/* 1. A dog leg.

   The case that made everything else necessary. A cable drawn straight
   along a straight trench has vertices at 0% and 100% — pull the middle
   of the trench out and both are still at 0% and 100%, so mapping them
   moves nothing and the cable cuts the corner the dig now goes round.

   The trench's own new corners have to be inserted. */
{
  const g = carryLine(straight, [[0, 0], [50, 10], [100, 0]], [[0, 0], [100, 0]]);
  if (!g) {
    fail("a cable did not follow its trench round a new dog leg");
  } else {
    if (!has(g, [50, 10])) fail("the cable cuts the corner the trench now goes round");
    if (!near(g[0], [0, 0]) || !near(g[g.length - 1], [100, 0])) {
      fail("the cable no longer starts and ends where the trench does");
    }
  }
}

/* 2. Extended, and 3. shortened.

   Carried by FRACTION of length, not absolute distance. Absolute
   distance gets extension wrong: add three metres to a trench and every
   cable in it stops three metres short of where the dig now ends. */
{
  const longer = carryLine(straight, [[0, 0], [120, 0]], [[0, 0], [100, 0]]);
  if (!longer || !near(longer[longer.length - 1], [120, 0])) {
    fail("a cable did not follow its trench when the trench was extended");
  }
  const shorter = carryLine(straight, [[0, 0], [80, 0]], [[0, 0], [100, 0]]);
  if (!shorter || !near(shorter[shorter.length - 1], [80, 0])) {
    fail("a cable did not follow its trench when the trench was shortened");
  }
}

// 4. A start point moved.
{
  const g = carryLine(straight, [[-10, 0], [100, 0]], [[0, 0], [100, 0]]);
  if (!g || !near(g[0], [-10, 0])) {
    fail("a cable did not follow its trench when the start was moved");
  }
}

/* 5. The tail that leaves the dig.

   A service cable runs the trench and then crosses to the meter. Those
   vertices are past the end of the trench, not along it — carrying them
   by fraction would swing them onto the route and detach the cable from
   its meter.

   They move with the end they hang off, by the same vector, so the run
   from the dig to the meter is preserved rather than recomputed. */
{
  const g = carryLine(straight, [[0, 0], [120, 0]], [[0, 0], [100, 0], [105, 8]]);
  if (!g) fail("a cable with a tail was not carried at all");
  else {
    if (!near(g[g.length - 1], [125, 8])) {
      fail(`the cable's run to its meter was not preserved: ${JSON.stringify(g[g.length - 1])}`);
    }
    /* And its shape is kept: the offset from the trench end is the
       same eight metres across and five along it was before. */
    const end = g[g.length - 2];
    const tail = g[g.length - 1];
    if (Math.abs((tail[0] - end[0]) - 5) > 0.01 || Math.abs((tail[1] - end[1]) - 8) > 0.01) {
      fail("the run from the dig to the meter changed shape");
    }
  }
}

/* 6. Nothing written where nothing moved.

   A null return, not the same geometry back. Writing an unchanged
   geometry costs a database round trip per content per edit, and puts
   a step on the undo stack that undoes nothing. */
{
  if (carryLine(straight, straight, [[0, 0], [100, 0]]) !== null) {
    fail("an unchanged trench still rewrites everything in it");
  }
}

/* 7. A cable drawn against the run of the trench.

   Which end somebody drew first says nothing about which way the
   trench goes. Corners have to be inserted in the cable's own
   direction or it doubles back on itself. */
{
  const g = carryLine(straight, [[0, 0], [50, 10], [100, 0]], [[100, 0], [0, 0]]);
  if (!g) fail("a cable drawn backwards was not carried");
  else {
    if (!near(g[0], [100, 0])) fail("a cable drawn backwards was reversed");
    if (!has(g, [50, 10])) fail("a cable drawn backwards missed the new corner");
    /* In order: start, corner, end. Out of order it crosses itself. */
    const at = g.findIndex((p) => near(p, [50, 10]));
    if (at <= 0 || at >= g.length - 1) {
      fail("the corner was inserted at the wrong end of a cable drawn backwards");
    }
  }
}

/* 8. Part of a trench only.

   A service that runs the first twenty metres does not gain the bends
   in the other eighty. */
{
  const g = carryLine(straight, [[0, 0], [50, 10], [100, 0]], [[0, 0], [20, 0]]);
  if (!g) fail("a cable along part of a trench was not carried");
  else if (g.length !== 2) {
    fail(`a cable along the first fifth gained ${g.length - 2} corner(s) from the rest`);
  }
}

/* 9. Degenerate shapes are refused, not guessed at.

   There is no "40% of the way along" a trench of no length, and
   inventing one would collapse every cable in it onto a point. */
{
  for (const [lab, o, n] of [
    ["a trench with one point", [[0, 0]], straight],
    ["a new shape with one point", straight, [[0, 0]]],
    ["a trench of no length", [[5, 5], [5, 5]], straight],
  ]) {
    if (carryLine(o, n, [[0, 0], [100, 0]]) !== null) {
      fail(`${lab} was carried rather than refused`);
    }
  }
}

/* 10. The measuring helpers, which everything above rests on. */
{
  if (Math.abs(alongAt(straight, [40, 3]).along - 40) > 0.01) {
    fail("a point beside the trench does not measure along it");
  }
  if (Math.abs(alongAt(straight, [40, 3]).gap - 3) > 0.01) {
    fail("the distance from the trench is measured wrongly");
  }
  if (!near(pointAlong(straight, 25), [25, 0])) fail("pointAlong lands in the wrong place");
  /* Clamped past either end: a fraction cannot land outside the line,
     and floating point that says otherwise gets the end. */
  if (!near(pointAlong(straight, -5), [0, 0])) fail("pointAlong runs off the start");
  if (!near(pointAlong(straight, 500), [100, 0])) fail("pointAlong runs off the end");
}

/* 11. The canvas carries them, on the one path every shape edit takes.

   writeGeometry is the funnel: dragging a vertex, inserting one,
   removing one and moving an end all end there. Guarding the
   interactions one at a time would leave the next one added to bypass
   it, which is the reason the lock check sits there too. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fn = canvas.slice(canvas.indexOf("async function writeGeometry"),
    canvas.indexOf("function removeVertex"));

  if (!/carryLine\(/.test(fn)) {
    fail("reshaping a trench does not carry what is in it");
  }
  /* Trenches only. Moving a cable must not drag the trench under it:
     the dig is the thing that was decided. */
  if (!/isTrenchType\(before\.Attributes\?\.Line_Type, lineTypes\)/.test(fn)) {
    fail("the carry is not limited to trenches, so moving a cable would move others");
  }
  /* A locked feature is left alone. A cable on a called-off span is a
     record of what was laid, and the drawing moving underneath it does
     not change that. */
  if (!/locked\(f\)/.test(fn)) {
    fail("a locked cable is dragged along with the trench");
  }

  /* 12. And the undo puts them back.

     Undoing the trench and leaving the cables where they were carried
     would be worse than not carrying them: the drawing would be wrong
     in a way nobody had asked for and nothing had recorded. */
  if (!/\.\.\.carried\.map\(\(c\) => Number\(c\.Feature_ID\)\)/.test(fn)) {
    fail("the carried cables are not in the undo entry");
  }
  if (!/moved2 \? moved2\.Geometry : f\.Geometry/.test(fn)) {
    fail("the undo entry records the cables' old shape as their new one");
  }
}

console.log(bad === 0
  ? "  ok  Trench contents behave (cables follow the dig they lie in)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
