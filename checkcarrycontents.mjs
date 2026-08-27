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
import { carryLine, carryPoint, claimedByAnother, alongAt, pointAlong }
  from "./src/features/gis/carryContents.js";
import { contentsOf } from "./src/features/gis/trenchContents.js";

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
  /* The carry lives in `carriedBy`, not in writeGeometry.

     It was in writeGeometry, and that was the bug: writeGeometry
     handles inserting and removing vertices, while DRAGGING one writes
     its own move. So removing a vertex carried the contents and
     dragging one did not — and dragging is the thing somebody does
     twenty times an hour. */
  const fn = canvas.slice(canvas.indexOf("function carriedBy("),
    canvas.indexOf("async function writeGeometry"));

  if (!/carryLine\(/.test(fn)) {
    fail("reshaping a trench does not carry what is in it");
  }

  /* ── Both paths that reshape a line ──

     They are not the same code. writeGeometry inserts and removes
     vertices; the vertex drag writes its own move. A carry in one of
     them is a carry somebody will report as not working, because they
     used the other. */
  const callers = (canvas.match(/carriedBy\(/g) || []).length;
  /* The declaration, plus a call from each path. */
  if (callers < 3) {
    fail(`carriedBy is called from ${callers - 1} place(s) \u2014 both reshaping paths need it`);
  }
  if (!/carriedBy\(f, d\.startGeom, f\.Geometry, features\)/.test(canvas)) {
    fail("dragging a vertex does not carry the trench's contents");
  }
  /* Measured from the shape the drag began with. The feature in state
     has already been rewritten by the time the drag ends, so measuring
     against it would compare the new shape with itself and carry
     nothing. */
  if (!/Geometry: d\.startGeom/.test(canvas)) {
    fail("the drag does not record the shape it started from");
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
  if (!/\.\.\.carried\.map\(\(c\) => Number\(c\.Feature_ID\)\)/.test(canvas)) {
    fail("the carried cables are not in writeGeometry's undo entry");
  }
  /* And the drag's own undo entry, which is a different one. */
  if (!/\[\{ \.\.\.f, Geometry: d\.startGeom \}, \.\.\.carriedBefore\]/.test(canvas)) {
    fail("undoing a drag puts the trench back and leaves the cables where they were carried");
  }
}

/* ── The join between the two halves ──

   Every test above exercises carryLine, and every one of them passed
   while the feature did nothing at all: the canvas looked its contents
   up by `item.id`, and contentsOf returns `item.feature` and no id.
   The lookup found nothing, every time, silently.

   The arithmetic was checked to the last decimal and the thing feeding
   it was never run. So this runs the real contentsOf and carries what
   it actually returns. */
{
  const trench = {
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [0, 12]], Attributes: { Line_Type: "trench_service" },
  };
  const cable = {
    Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [0, 12], [1, 13]], Attributes: { Line_Type: "elec_service" },
  };

  const res = contentsOf(trench, [trench, cable], {
    serviceLineTypes: new Set(["elec_service"]),
    serviceTrenchTypes: new Set(["trench_service"]),
    isTrench: (x) => String(x.Attributes?.Line_Type ?? "").startsWith("trench"),
  });

  if (res.error) fail(`contentsOf refused a service cable in its trench: ${res.error}`);
  else if (!res.contents.length) {
    fail("contentsOf finds nothing in a service trench holding its own cable");
  } else {
    const item = res.contents[0];
    /* The field the canvas reads. Named here so a rename of it fails
       this rather than silently stopping the carry again. */
    if (!item.feature || item.feature.Feature_ID !== 2) {
      fail("a content item does not carry the feature the canvas looks up");
    }

    /* And end to end: drag the trench end, carry what contentsOf found. */
    const dragged = [[0, 0], [0, 18]];
    const g = carryLine(trench.Geometry, dragged, item.feature.Geometry);
    if (!g) fail("dragging a service trench's end does not move the cable in it");
    else if (!near(g[1], [0, 18])) {
      fail(`the cable did not follow the dragged end: ${JSON.stringify(g)}`);
    }
  }

  /* The canvas reads the right field. Asserted on the source too,
     because the shape above can be right while the caller still asks
     for something else \u2014 which is exactly what happened. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (/Number\(item\.id\)/.test(canvas)) {
    fail("the canvas still looks contents up by an id that contentsOf does not return");
  }
  if (!/item\.feature\.Feature_ID/.test(canvas)) {
    fail("the canvas does not read the feature off the content item");
  }
}

/* ── The fittings on the trench ──

   A joint, a span node or a link box is placed on the dig. They stayed
   put, so a bottle end that was on the end of a cable ended up beside
   it.

   The same fraction rule as the cables, because it has to be the same
   rule: a joint at the end of a cable and that cable's own last vertex
   must land on the same point. */
{
  const t = [[0, 0], [100, 0]];

  // 13. A joint mid-run follows a new bend.
  {
    const q = carryPoint(t, [[0, 0], [50, 10], [100, 0]], [50, 0]);
    if (!q) fail("a joint on the trench did not follow a new dog leg");
    else if (!near(q, [50, 10])) fail(`the joint landed at ${JSON.stringify(q)}`);
  }

  /* 14. A bottle end at the far end goes with the end.

     And lands exactly where the cable's own last vertex lands, or the
     two are a few centimetres apart and nothing looks wrong until
     something measures it. */
  {
    const longer = [[0, 0], [120, 0]];
    const q = carryPoint(t, longer, [100, 0]);
    const g = carryLine(t, longer, [[0, 0], [100, 0]]);
    if (!q) fail("a bottle end did not follow the extended trench");
    else if (!near(q, [120, 0])) fail("the bottle end landed short of the new end");
    if (q && g && !near(q, g[g.length - 1], 1e-6)) {
      fail("the bottle end and the cable's end no longer meet");
    }
  }

  /* 15. A meter beside the dig is left alone.

     It is placed against a plot, not against the ground. Dragging one
     because the trench beside it moved would move a thing nobody had
     asked about. */
  {
    if (carryPoint(t, [[0, 0], [120, 0]], [100, 9]) !== null) {
      fail("a point standing off the trench was dragged with it");
    }
  }

  // 16. And nothing moves where nothing moved.
  {
    if (carryPoint(t, t, [50, 0]) !== null) {
      fail("an unchanged trench still rewrites the fittings on it");
    }
  }

  /* 17. Which roles are carried, named rather than guessed.

     "Every point near the trench" would take the meters and the plot
     seeds with it. */
  {
    const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    if (!/CARRY_ROLES = useMemo\(\(\) => new Set\(\["joint", "spannode", "linkbox"\]\)/.test(canvas)) {
      fail("the roles carried with a trench are not named");
    }
    if (!/carryPoint\(/.test(canvas)) {
      fail("the canvas does not carry the fittings on a reshaped trench");
    }
  }
}

/* ── Only what is in THIS trench ──

   Two faults found by moving a trench past a parallel one.

   The tail rule moves a point that is not on the route by however far
   the nearest end moved, so a service cable's run to its meter is
   preserved rather than recomputed. Applied to a line that is not in
   the trench at all, every vertex gets the end vector and the
   neighbouring dig's cable translates wholesale alongside.

   And proximity alone cannot answer "is this cable in this trench". A
   cable 1.2 m from the trench being moved may be 0.2 m from the one
   beside it. Tighten the tolerance and a hand-drawn cable in the right
   dig is dropped; loosen it and the neighbour's is dragged. Only
   comparing the two answers it. */
{
  const mine = [[0, 0], [100, 0]];
  const moved = [[0, 20], [100, 20]];

  /* 18. A line with no vertex on the trench is not carried at all.

     This is the one that translated a whole cable sideways. */
  {
    if (carryLine(mine, moved, [[0, 3], [100, 3]]) !== null) {
      fail("a cable lying beside the trench was carried with it");
    }
    /* And a mostly-off line: a tail is a tail, not most of the run. */
    if (carryLine(mine, moved, [[0, 3], [50, 3], [100, 0]]) !== null) {
      fail("a line barely touching the trench was carried");
    }
  }

  /* 19. A service cable's genuine tail still is.

     Two of its three vertices are on the dig, so the run to the meter
     is preserved. The rule has to keep this while refusing the above. */
  {
    const g = carryLine(mine, [[0, 0], [120, 0]], [[0, 0], [100, 0], [105, 8]]);
    if (!g) fail("a service cable with a tail to its meter is no longer carried");
    else if (!near(g[g.length - 1], [125, 8])) fail("the tail stopped being preserved");
  }

  /* 20. And the neighbouring trench has the better claim.

     Comparative, not absolute: which trench is each vertex nearest to. */
  {
    const next = [[0, 3], [100, 3]];
    if (claimedByAnother([[0, 2.5], [100, 2.5]], mine, [next]) !== true) {
      fail("a cable nearer the neighbouring trench is claimed by the one being moved");
    }
    if (claimedByAnother([[0, 0], [100, 0]], mine, [next]) !== false) {
      fail("a cable lying in this trench is given away to the neighbour");
    }
    /* Ties go to the trench being moved: a cable laid exactly between
       two parallel digs is a drawing fault either way, and carrying it
       with the one somebody just moved is the answer they can see and
       undo. */
    if (claimedByAnother([[0, 1.5], [100, 1.5]], mine, [next]) !== false) {
      fail("a cable exactly between two trenches is not carried by either");
    }
    if (claimedByAnother([[0, 0], [100, 0]], mine, []) !== false) {
      fail("a drawing with one trench still gives its cable away");
    }
  }

  /* 21. The canvas asks, for lines and for fittings.

     A joint on the neighbouring dig belongs to that one just as much as
     a cable does. */
  {
    const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    const uses = (canvas.match(/claimedByAnother\(/g) || []).length;
    if (uses < 2) {
      fail(`the nearest-trench test is used ${uses} time(s) \u2014 lines and fittings both need it`);
    }
    if (!/const otherTrenches = world/.test(canvas)) {
      fail("the carry does not gather the other trenches to compare against");
    }
    /* Layer or type: a trench drawn with a type that is not in the
       configured list is still a trench, and treating it as content
       would carry it along. */
    if (!/x\.Layer_Key === "trench" \|\| isTrenchType/.test(canvas)) {
      fail("a trench with an unconfigured type is treated as content");
    }
  }
}

console.log(bad === 0
  ? "  ok  Trench contents behave (cables follow the dig they lie in)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
