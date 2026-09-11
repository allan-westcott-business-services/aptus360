/* Only the plots that have actually changed.

   A seed with a service trench is skipped as done. That is right the
   second time a site is run and wrong the moment somebody MOVES
   something: drag the property boundary point, or the end of the
   trench, or re-route the mains the service tees off, and the drawn
   dig no longer goes where the drawing says it should — and the run
   skipped it as already serviced, so the stale trench stayed until
   somebody deleted it by hand.

   The hard half of this is NOT re-laying. A test that says "changed"
   too readily re-digs the whole site on every run, which is worse
   than the fault it fixes: it churns geometry somebody has adjusted by
   hand, and it makes the summary meaningless. So most of what follows
   is cases that must come back unchanged. */
import { readFileSync } from "node:fs";
import { serviceMoved } from "./src/features/gis/autoService.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A main along the road, a plot with its boundary point on the verge
   and the dig running on to a meter inside the plot. */
const mains = (y = 0) => ({ Feature_ID: 1, Feature_Type: "line",
  Layer_Key: "trench", Attributes: { Line_Type: "trench_main" },
  Geometry: [[0, y], [200, y]] });
const seed = (attrs = {}) => ({ Feature_ID: 10, Feature_Role: "plot",
  Layer_Key: "plot", Plot_ID: 7, Geometry: [[100, 20]],
  Attributes: { Boundary_At: [100, 5], Trench_End_At: [100, 12], ...attrs } });
/* The dig as the planner would have written it: foot, boundary, stop. */
const dug = (pts) => ({ Feature_ID: 20, Feature_Type: "line",
  Layer_Key: "trench", Attributes: { Line_Type: "trench_service",
    Seed_Feature_ID: 10 },
  Geometry: pts });
const asDrawn = dug([[100, 0], [100, 5], [100, 12]]);

// 1. Nothing has moved: nothing is re-laid.
{
  const why = serviceMoved(seed(), asDrawn, [mains()]);
  if (why) fail(`an untouched plot is re-laid: "${why}"`);
}

// 2. The boundary point moved along the road — the tee moves with it,
//    and so does the bend.
{
  const why = serviceMoved(seed({ Boundary_At: [130, 5] }),
    asDrawn, [mains()]);
  if (!why) fail("the property boundary point moved and the dig stayed where it was");
}

// 3. The end of the trench moved: the plot's meter position changed,
//    the boundary did not.
{
  const why = serviceMoved(seed({ Trench_End_At: [100, 18] }),
    asDrawn, [mains()]);
  if (!why) fail("the end of the trench moved and the dig was left short of it");
  if (why && !/end of the trench/.test(why)) {
    fail(`the reason blames the wrong thing: "${why}"`);
  }
}

// 4. The mains was re-routed: the tee is in the wrong place now.
{
  const why = serviceMoved(seed(), asDrawn, [mains(-8)]);
  if (!why) fail("the mains moved and the service still tees into thin air");
  if (why && !/mains/.test(why)) {
    fail(`the reason blames the wrong thing: "${why}"`);
  }
}

// 5. The boundary point moved along a straight route, so neither END
//    changed — only the vertex between them. The on-site and off-site
//    split is measured there, so this is a move.
{
  const straight = dug([[100, 0], [100, 5], [100, 12]]);
  const why = serviceMoved(seed({ Boundary_At: [100, 8] }), straight, [mains()]);
  if (!why) {
    fail("the boundary moved along the route and nothing noticed \u2014 the "
      + "on-site and off-site lengths would be split in the wrong place");
  }
}

// ── And the cases that must NOT re-lay ──

// 6. The dig drawn the other way round. An end swap is not a move.
{
  const reversed = dug([[100, 12], [100, 5], [100, 0]]);
  if (serviceMoved(seed(), reversed, [mains()])) {
    fail("a dig drawn from the plot back to the main is called moved");
  }
}

// 7. A round trip through the database. Nothing lands on exactly the
//    number it left as, and a re-lay per run is worse than the fault.
{
  const jittered = dug([[100.0000001, 0], [99.999999, 5.0000004], [100, 11.999999]]);
  if (serviceMoved(seed(), jittered, [mains()])) {
    fail("floating point noise reads as a move, so every run re-digs the site");
  }
}

// 8. No boundary vertex because the boundary IS the stop — the planner
//    drops the vertex deliberately, and its absence is not a move.
{
  const atLine = seed({ Boundary_At: [100, 5], Trench_End_At: null });
  const twoPoint = dug([[100, 0], [100, 5]]);
  if (serviceMoved(atLine, twoPoint, [mains()])) {
    fail("a dig that stops at the boundary is called moved for having no "
      + "middle vertex \u2014 the planner leaves it out on purpose");
  }
}

// 9. A seed with no boundary point at all. The planner refuses it
//    outright and says so; this must not turn that into a re-lay.
{
  const noB = seed({ Boundary_At: null });
  if (serviceMoved(noB, asDrawn, [mains()])) {
    fail("a seed with no boundary point is re-laid rather than refused");
  }
}

// 10. A self-lay plot tees off the incumbent's main, so asking the
//     wrong list of mains would call every one of them moved.
{
  const theirs = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main", Build_Status: "existing" },
    Geometry: [[0, -30], [200, -30]] };
  const slpDug = dug([[100, -30], [100, 5], [100, 12]]);
  if (serviceMoved(seed(), slpDug, [mains(), theirs], { selfLayOnly: true })) {
    fail("a self-lay plot teed off the incumbent's main is called moved");
  }
  /* And the same dig judged as if it were ours IS moved, because ours
     is somewhere else \u2014 which is what makes the flag load-bearing. */
  if (!serviceMoved(seed(), slpDug, [mains(), theirs])) {
    fail("the self-lay flag makes no difference, so it is not being used");
  }
}

// 11. Nothing to compare against: no trench, or one point.
{
  if (serviceMoved(seed(), null, [mains()])) fail("no trench reads as moved");
  if (serviceMoved(seed(), dug([[100, 0]]), [mains()])) {
    fail("a one-point trench reads as moved");
  }
}

/* ── Every plot, not just the self-lay ones ──

   `selfLayOnly` decides which MAINS the tee is measured to — ours, or
   the incumbent's — and nothing else. It is not a gate on whether the
   question gets asked. An ordinary plot on a drawing with no self-lay
   anywhere on it is checked exactly the same way, and stating that
   here means a later edit cannot narrow the rule without a case going
   red. */
{
  /* No Self_Lay attribute anywhere, no existing mains on the drawing:
     an ordinary plot on an ordinary site. */
  const ordinary = [mains()];
  const moved = serviceMoved(seed({ Boundary_At: [140, 5] }), asDrawn, ordinary);
  if (!moved) {
    fail("an ordinary plot's moved boundary point is not noticed \u2014 the "
      + "check has been narrowed to self-lay plots");
  }
  const endMoved = serviceMoved(seed({ Trench_End_At: [100, 25] }), asDrawn, ordinary);
  if (!endMoved) fail("an ordinary plot's moved trench end is not noticed");
  const mainsMoved = serviceMoved(seed(), asDrawn, [mains(-15)]);
  if (!mainsMoved) fail("an ordinary plot's re-routed mains is not noticed");
  /* And still nothing when nothing moved, on the same fixture \u2014 so
     the three above are the move being seen, not the test being loose. */
  if (serviceMoved(seed(), asDrawn, ordinary)) {
    fail("the ordinary case reports a move with nothing moved");
  }
}

// 12. Wired in, and through the same door as a self-lay change.
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/serviceMoved\(sd, trench, trenches/.test(canvas)) {
    fail("Auto Service never asks whether the ground moved, so a stale "
      + "trench is still skipped as already serviced");
  }
  if (!/mismatched\.set\(sid, \{ seed: sd, mine: \[\.\.\.mine, trench\]/.test(canvas)) {
    fail("a moved service is not re-laid through the same door as a "
      + "self-lay change, so the old dig is left on the drawing");
  }
  /* The reason reaches the summary: "re-laid" alone reads as the run
     doing something unasked for. */
  if (!/m\.why \|\| "self-lay changed"/.test(canvas)) {
    fail("the run does not say WHY anything was re-laid");
  }
  /* ── And it is asked of every laid seed ──

     The only gate on the loop is `alreadyLaid`: a seed with a service
     trench is checked, whatever its utilities are. If a self-lay test
     ever becomes the thing that decides whether to ASK \u2014 rather than
     which mains to measure to \u2014 every ordinary plot goes back to
     being skipped with a stale trench, silently. */
  const loop = canvas.slice(canvas.indexOf("for (const sd of seeds) {",
    canvas.indexOf("serviceMoved") > 0
      ? canvas.lastIndexOf("for (const sd of seeds) {", canvas.indexOf("serviceMoved(sd"))
      : 0), canvas.indexOf("serviceMoved(sd"));
  if (!/alreadyLaid\.has\(sid\)/.test(loop)) {
    fail("the staleness loop is not gated on the seed simply having been laid");
  }
  if (/if \(!allSelfLay\) continue|isSelfLayFor\([^)]*\)\) continue/.test(loop)) {
    fail("the staleness check has been gated on self-lay, so an ordinary "
      + "plot with a moved boundary point is skipped again");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Auto Service re-lays the plots whose ground moved, and only those.");
process.exit(bad ? 1 : 0);
