/* High volume top tees on the gas services.

   Where a service pipe leaves the main, the connection is a top tee:
   clamped around the main with an outlet taking the service off it.
   Every gas service has one, so a drawing showing the services and not
   the tees is short one fitting per plot on the take-off. */
import { readFileSync } from "node:fs";
import {
  topTees, mainTees, allTees, missingTees, gasMains, gasServices, angleOf,
  nodeCodeAt, sizeOfMain, HVTT_JOIN_M, HVTT_ALONG_M, HVTT_STEM_M, HVTT_MIN_PX,
} from "./src/features/gis/topTees.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water" },
  { Type_Key: "water_service", Label: "Water service", Layer_Key: "water" },
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench" },
];

const ln = (id, type, layer, geom, extra = {}) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: layer, Geometry: geom,
  Attributes: { Line_Type: type }, ...extra,
});

/* A main running west to east, with services off both sides. */
const MAIN = ln(1, "gas_main", "gas", [[0, 0], [30, 0]]);

// 1. One tee per service, at the join and not at the plot.
{
  const svc = ln(2, "gas_service", "gas", [[10, 0], [10, 6]], { Plot_ID: 12 });
  const { tees } = topTees([MAIN, svc], { lineTypes: LT });
  if (tees.length !== 1) fail(`${tees.length} tees for one service`);
  if (tees[0]?.at.join(",") !== "10,0") fail(`the tee landed at ${tees[0]?.at}`);
  if (tees[0]?.plot !== 12) fail("the tee did not carry the plot");
  if (tees[0]?.main !== 1 || tees[0]?.service !== 2) {
    fail("the tee did not record what it joins");
  }
}

// 2. Which end is the join is found, not assumed.
//
//    A service may be drawn from the plot outwards as easily as towards
//    it, and half a drawing done each way is ordinary. Reading the
//    first vertex as the join would put the fitting on the plot.
{
  const towards = ln(3, "gas_service", "gas", [[15, 5], [15, 0]]);
  const { tees } = topTees([MAIN, towards], { lineTypes: LT });
  if (tees[0]?.at.join(",") !== "15,0") {
    fail(`a service drawn towards the main teed at ${tees[0]?.at}`);
  }
}

// 3. The body lies along the main and the outlet points at the plot.
//
//    A tee drawn along the service is a fitting nobody could install,
//    and one whose stem points into the road rather than at the plot is
//    worse, because it looks deliberate.
{
  const north = ln(4, "gas_service", "gas", [[10, 0], [10, 6]]);
  const south = ln(5, "gas_service", "gas", [[20, 0], [20, -6]]);
  const { tees } = topTees([MAIN, north, south], { lineTypes: LT });

  const up = tees.find((t) => t.at[0] === 10);
  const down = tees.find((t) => t.at[0] === 20);

  /* Along the main: due east, whichever side the service is. */
  for (const t of [up, down]) {
    if (Math.abs(angleOf(t.dir)) > 0.05) fail(`the body lay at ${angleOf(t.dir)} degrees`);
  }
  /* And square to it, on the side the service runs. */
  if (up.stem[1] <= 0) fail("the outlet on a service running north pointed south");
  if (down.stem[1] >= 0) fail("the outlet on a service running south pointed north");
  /* Square, not merely different: the dot product with the main is nil. */
  for (const t of [up, down]) {
    const dot = t.dir[0] * t.stem[0] + t.dir[1] * t.stem[1];
    if (Math.abs(dot) > 1e-9) fail(`the outlet was not square to the main (${dot})`);
  }
}

// 4. On a diagonal main too.
//
//    The axis-aligned cases pass with a sign error in the normal, which
//    is exactly how the service valve's bar came to be drawn at a
//    mirror of the right angle.
{
  const diag = ln(6, "gas_main", "gas", [[0, 0], [10, 10]]);
  const svc = ln(7, "gas_service", "gas", [[5, 5], [7, 3]]);
  const { tees } = topTees([diag, svc], { lineTypes: LT });
  const t = tees[0];
  if (!t) { fail("no tee on a diagonal main"); }
  else {
    if (Math.abs(angleOf(t.dir) - 45) > 0.05) fail(`the body lay at ${angleOf(t.dir)}`);
    /* The service runs south-east of the main, so the outlet must too. */
    if (t.stem[0] <= 0 || t.stem[1] >= 0) fail(`the outlet faced [${t.stem}]`);
  }
}

// 5. A service that reaches nothing gets no tee, and is reported.
//
//    An unconnected service is a fault worth seeing. Inventing a tee at
//    the nearest pipe would hide it.
{
  const loose = ln(8, "gas_service", "gas", [[5, 3], [5, 9]]);
  const { tees, unjoined } = topTees([MAIN, loose], { lineTypes: LT });
  if (tees.length) fail("a service joined to nothing was given a tee");
  if (!unjoined.includes(8)) fail("an unjoined service was not reported");

  /* Just outside the join distance is still not joined. */
  const nearly = ln(9, "gas_service", "gas", [[12, HVTT_JOIN_M * 2], [12, 6]]);
  if (topTees([MAIN, nearly], { lineTypes: LT }).tees.length) {
    fail("a service stopping short of the main was teed onto it");
  }
}

// 6. Gas only, and pipe only.
//
//    A water service meeting a water main is not a gas fitting, and a
//    service trench is not pipe.
{
  const other = [
    ln(10, "water_main", "water", [[0, 20], [30, 20]]),
    ln(11, "water_service", "water", [[10, 20], [10, 26]]),
    ln(12, "trench_main", "trench", [[0, 0], [30, 0]]),
    ln(13, "trench_service", "trench", [[25, 0], [25, 6]]),
  ];
  const { tees } = topTees([MAIN, ...other], { lineTypes: LT });
  if (tees.length) fail(`${tees.length} tees on water pipe or on trenches`);

  if (gasMains([MAIN, ...other], LT).length !== 1) fail("the gas mains were miscounted");
  if (gasServices([MAIN, ...other], LT).length !== 0) fail("a trench counted as a gas service");
}

// 7. Backfill puts in only what is missing.
//
//    Matched by position, because a tee is the join it sits on. One
//    somebody nudged half a metre is still that join's tee and must not
//    be doubled up.
{
  const a = ln(20, "gas_service", "gas", [[10, 0], [10, 6]]);
  const b = ln(21, "gas_service", "gas", [[20, 0], [20, 6]]);
  const world = [MAIN, a, b];
  const { tees } = topTees(world, { lineTypes: LT });

  if (missingTees(world, tees).missing.length !== 2) {
    fail("a drawing with no tees did not report both as missing");
  }

  const placed = { Feature_ID: 30, Feature_Role: "hvtt", Geometry: [[10, 0]], Attributes: {} };
  const one = missingTees([...world, placed], tees);
  if (one.missing.length !== 1) fail(`${one.missing.length} missing after placing one`);
  if (one.missing[0].at[0] !== 20) fail("the wrong join was reported as missing");

  /* Nudged, and still that join's. */
  const nudged = { ...placed, Geometry: [[10.4, 0.3]] };
  if (missingTees([...world, nudged], tees).missing.length !== 1) {
    fail("a tee moved slightly was treated as absent and would be doubled");
  }

  /* Left over from a service since deleted: reported, never removed. */
  const stale = { Feature_ID: 31, Feature_Role: "hvtt", Geometry: [[28, 0]], Attributes: {} };
  const r = missingTees([...world, placed, stale], tees);
  if (r.orphans.length !== 1) fail(`${r.orphans.length} orphans reported, wanted 1`);
  if (r.orphans[0].Feature_ID !== 31) fail("the wrong tee was called an orphan");
}

// 8. Nothing to work from produces nothing rather than throwing.
{
  for (const world of [[], [MAIN], [ln(40, "gas_service", "gas", [[1, 1], [2, 2]])]]) {
    const r = topTees(world, { lineTypes: LT });
    if (r.tees.length) fail("a tee was invented from nothing");
  }
  if (topTees(undefined, {}).tees.length) fail("an absent drawing produced tees");
}

// 9. The symbol has a size in metres of ground.
//
//    It is a thing in a hole, so it grows and shrinks with everything
//    else drawn to scale — the same reason the service valve's bar is a
//    metre of ground rather than a fixed number of pixels.
{
  for (const [name, v] of [["along", HVTT_ALONG_M], ["stem", HVTT_STEM_M]]) {
    if (!(v > 0 && v < 5)) fail(`the ${name} measurement is ${v} m, which is not a fitting`);
  }
}

// 10. A main branching off another main takes the same tee.
//
//    The other place the fitting goes: a gas pipe routed from a point
//    along the length of another gas pipe. Not a service leaving the
//    main but the main itself dividing.
{
  const run = ln(50, "gas_main", "gas", [[0, 0], [30, 0]]);
  const branch = ln(51, "gas_main", "gas", [[10, 0], [10, -8]]);
  const { tees } = mainTees([run, branch], { lineTypes: LT });

  if (tees.length !== 1) fail(`${tees.length} tees where one main divides`);
  const t = tees[0];
  if (t?.at.join(",") !== "10,0") fail(`the junction tee landed at ${t?.at}`);
  if (t?.kind !== "junction") fail(`it was recorded as ${t?.kind}`);
  /* Body along the run that carries straight on, stem down the branch. */
  if (Math.abs(angleOf(t.dir)) > 0.05) fail(`the body lay at ${angleOf(t.dir)}`);
  if (t.stem[1] >= 0) fail("the outlet faced away from the branch");
}

// 11. An end gets nothing, and neither does a bend.
//
//    "These will be at the location of a span node but NOT an END span
//    node." Arms are counted as junctionsOf counts them: one is where a
//    run stops, two is one pipe turning a corner, three or more is a
//    division.
{
  const single = ln(60, "gas_main", "gas", [[0, 0], [20, 0]]);
  if (mainTees([single], { lineTypes: LT }).tees.length) {
    fail("the free ends of a main were teed");
  }

  const bendA = ln(61, "gas_main", "gas", [[0, 0], [10, 0]]);
  const bendB = ln(62, "gas_main", "gas", [[10, 0], [10, 10]]);
  if (mainTees([bendA, bendB], { lineTypes: LT }).tees.length) {
    fail("a bend was given a tee");
  }

  /* And two mains meeting end to end in a straight line is still a
     bend, not a division. */
  const runA = ln(63, "gas_main", "gas", [[0, 0], [10, 0]]);
  const runB = ln(64, "gas_main", "gas", [[10, 0], [20, 0]]);
  if (mainTees([runA, runB], { lineTypes: LT }).tees.length) {
    fail("two mains joined end to end were teed");
  }
}

// 12. A branch that ends against the middle of another main.
//
//    This is the "along the length of" case: the branch stops on the
//    run rather than at one of its vertices, so counting only the ends
//    of pipes would find nothing there at all.
{
  const run = ln(70, "gas_main", "gas", [[0, 0], [40, 0]]);
  const off = ln(71, "gas_main", "gas", [[25, 0], [25, 9]]);
  const { tees } = mainTees([run, off], { lineTypes: LT });
  if (tees.length !== 1) fail(`${tees.length} tees where a branch meets mid-run`);
  if (tees[0]?.at[0] !== 25) fail(`the mid-run tee landed at ${tees[0]?.at}`);
}

// 13. Water mains dividing are not gas fittings.
{
  const wRun = ln(80, "water_main", "water", [[0, 50], [30, 50]]);
  const wBranch = ln(81, "water_main", "water", [[10, 50], [10, 58]]);
  if (mainTees([wRun, wBranch], { lineTypes: LT }).tees.length) {
    fail("a water main division was given a gas tee");
  }
}

// 14. Both kinds together, and one hole where they coincide.
//
//    A service leaving at the same point the main divides is one
//    fitting. The service tee wins: it knows which plot it belongs to,
//    which is worth more on a take-off than knowing it was a junction.
{
  const run = ln(90, "gas_main", "gas", [[0, 0], [30, 0]]);
  const branch = ln(91, "gas_main", "gas", [[20, 0], [20, -8]]);
  const svc = ln(92, "gas_service", "gas", [[10, 0], [10, 6]], { Plot_ID: 7 });
  const both = allTees([run, branch, svc], { lineTypes: LT });

  if (both.tees.length !== 2) fail(`${both.tees.length} tees for a service and a division`);
  if (!both.tees.some((t) => t.kind === "service" && t.plot === 7)) {
    fail("the service tee was lost");
  }
  if (!both.tees.some((t) => t.kind === "junction")) fail("the junction tee was lost");

  /* Coincident: a service leaving exactly where the main divides. */
  const onTop = ln(93, "gas_service", "gas", [[20, 0], [20, 7]], { Plot_ID: 8 });
  const merged = allTees([run, branch, onTop], { lineTypes: LT });
  if (merged.tees.length !== 1) {
    fail(`${merged.tees.length} tees in one hole where a service leaves at a division`);
  }
  if (merged.tees[0]?.kind !== "service") fail("the junction tee won over the service one");
}

// 15. The span node's letter is borrowed for the label, where there is one.
{
  const node = {
    Feature_ID: 100, Feature_Type: "point", Feature_Role: "spannode",
    Geometry: [[10, 0]], Label: "A7", Attributes: {},
  };
  if (nodeCodeAt([node], [10, 0]) !== "A7") fail("the span node letter was not found");
  /* Only if it is actually there \u2014 a node across the site is not this
     junction's name. */
  if (nodeCodeAt([node], [80, 0]) !== null) fail("a distant span node was borrowed");
  if (nodeCodeAt([], [10, 0]) !== null) fail("a letter appeared with no nodes placed");
}

// 16. A tee is sized by the main it is clamped to.
//
//    A fitting is ordered by the pipe it goes on, so it carries the
//    main's size rather than one of its own \u2014 and the *through* main
//    at a junction, not the branch. A 63 off a 180 is ordinary, and
//    sizing the fitting from the branch would order the wrong part.
{
  const sized = (id, geom, size, sizeId) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "gas", Geometry: geom,
    Attributes: { Line_Type: "gas_main", Size: size, Gas_Pipe_Size_ID: sizeId },
  });
  const run = sized(200, [[0, 0], [40, 0]], "180mm", 4);
  const branch = sized(201, [[20, 0], [20, -9]], "63mm", 2);
  const svc = ln(202, "gas_service", "gas", [[10, 0], [10, 6]], { Plot_ID: 3 });

  const { tees } = allTees([run, branch, svc], { lineTypes: LT });
  for (const t of tees) {
    if (t.size?.Size !== "180mm") {
      fail(`a ${t.kind} tee took size ${t.size?.Size}, wanted the main's 180mm`);
    }
    if (t.size?.Gas_Pipe_Size_ID !== 4) fail(`the ${t.kind} tee took size id ${t.size?.Gas_Pipe_Size_ID}`);
  }

  /* A hand-typed size on the main wins, as it does on the pipe. */
  const manual = {
    ...run,
    Attributes: { ...run.Attributes, Manual_Gas_Pipe_Size_ID: 9, Manual_Size: "250mm" },
  };
  if (sizeOfMain(manual).Size !== "250mm") fail("an override did not win");
  if (sizeOfMain(manual).Gas_Pipe_Size_ID !== 9) fail("the override id did not win");

  /* And a main nobody has sized gives nothing rather than a guess: an
     unsized fitting is visible, an invented size is not. */
  const bare = ln(203, "gas_main", "gas", [[0, 60], [10, 60]]);
  if (Object.keys(sizeOfMain(bare)).length) fail("a size was invented for an unsized main");
}

// 17. Backfilling one kind leaves the other alone.
//
//    The two are backfilled at different times \u2014 the mains go in long
//    before the plots are served \u2014 so each button has to be able to
//    run without waiting for the other.
{
  const run = ln(210, "gas_main", "gas", [[0, 0], [40, 0]]);
  const branch = ln(211, "gas_main", "gas", [[20, 0], [20, -9]]);
  const svc = ln(212, "gas_service", "gas", [[10, 0], [10, 6]], { Plot_ID: 3 });
  const world = [run, branch, svc];
  const { tees } = allTees(world, { lineTypes: LT });

  const junctions = tees.filter((t) => t.kind === "junction");
  const services = tees.filter((t) => t.kind === "service");
  if (junctions.length !== 1 || services.length !== 1) {
    fail(`${junctions.length} junction and ${services.length} service tees, wanted one each`);
  }

  /* With the junction placed, the service one is still outstanding. */
  const placedJunction = {
    Feature_ID: 213, Feature_Role: "hvtt", Geometry: [junctions[0].at],
    Attributes: { Tee_Kind: "junction" },
  };
  const left = missingTees([...world, placedJunction], tees).missing;
  if (left.length !== 1 || left[0].kind !== "service") {
    fail("backfilling the main tees did not leave the service one outstanding");
  }
}

// 18. A junction close to a top tee still gets its own fitting.
//
//    A plot served within a metre of where the main divides is
//    ordinary, and they are two holes with two fittings in them. Both
//    the deduping and the already-placed test used a metre, so the
//    junction was dropped as a duplicate of the top tee and the drawing
//    showed one fitting where the ground needs two.
{
  const run = ln(300, "gas_main", "gas", [[0, 0], [40, 0]]);
  const branch = ln(301, "gas_main", "gas", [[20, 0], [20, -9]]);
  /* Served 0.6 m along from the branch. */
  const svc = ln(302, "gas_service", "gas", [[20.6, 0], [20.6, 6]], { Plot_ID: 5 });
  const world = [run, branch, svc];

  const { tees } = allTees(world, { lineTypes: LT });
  if (tees.length !== 2) {
    fail(`${tees.length} tees where a plot is served beside a branch, wanted 2`);
  }
  if (!tees.some((t) => t.kind === "junction")) {
    fail("the junction tee was dropped as a duplicate of the nearby top tee");
  }

  /* And with the top tee already on the drawing, the junction is still
     outstanding rather than counted as done. */
  const hvtt = {
    Feature_ID: 303, Feature_Role: "hvtt", Geometry: [[20.6, 0]],
    Attributes: { Tee_Kind: "service" },
  };
  const left = missingTees([...world, hvtt], tees).missing;
  if (left.length !== 1 || left[0].kind !== "junction") {
    fail(`a nearby top tee satisfied the junction: ${left.map((t) => t.kind).join(",")}`);
  }
  /* Nor is the top tee reported as an orphan for sitting near one. */
  if (missingTees([...world, hvtt], tees).orphans.length) {
    fail("a correctly placed top tee was called an orphan");
  }
}

// 19. Exactly coincident is still one hole.
//
//    Tightening the radius must not lose the case it was there for: a
//    service leaving the main at the very point it divides is one
//    fitting, and the service one wins because it knows its plot.
{
  const run = ln(310, "gas_main", "gas", [[0, 0], [40, 0]]);
  const branch = ln(311, "gas_main", "gas", [[20, 0], [20, -9]]);
  const onTop = ln(312, "gas_service", "gas", [[20, 0], [20, 7]], { Plot_ID: 6 });
  const { tees } = allTees([run, branch, onTop], { lineTypes: LT });
  if (tees.length !== 1) fail(`${tees.length} tees in one hole`);
  if (tees[0]?.kind !== "service") fail("the junction tee won over the service one");
}

// 20. A tee placed before the kinds existed counts as a top tee.
//
//    Everything placed by the first version was a service tee, so that
//    is what it was. Guessing the other way would double them up on the
//    first drawing to be backfilled.
{
  const run = ln(320, "gas_main", "gas", [[0, 0], [40, 0]]);
  const svc = ln(321, "gas_service", "gas", [[10, 0], [10, 6]], { Plot_ID: 4 });
  const { tees } = allTees([run, svc], { lineTypes: LT });
  const old = {
    Feature_ID: 322, Feature_Role: "hvtt", Geometry: [[10, 0]], Attributes: {},
  };
  if (missingTees([run, svc, old], tees).missing.length) {
    fail("a tee with no kind recorded was ignored and would be doubled");
  }
}

// 21. Placing tees always reads the drawing back.
//
//    `silent` means "do not talk to me": no confirm, no status line, no
//    error where there is nothing to do. It once skipped the reload as
//    well, which is not a message — it is how what was just written
//    reaches the screen.
//
//    The gas build reloads and then places its tees, so with the reload
//    inside the silent branch the fittings were written to the database
//    and absent from the drawing. The bar said "Placing tees" and the
//    plan had none.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (/if \(!silent\) \{\s*\n\s*await load\(projectId\);/.test(canvas)) {
    fail("the reload after placing is inside the silent branch again");
  }

  /* And it is actually there. A guard against the old shape is worth
     nothing if the reload has simply gone. */
  const fn = canvas.slice(canvas.indexOf("async function placeTopTees"));
  const body = fn.slice(0, fn.indexOf("\n  async function ", 10));
  if (!/await load\(projectId\);/.test(body)) {
    fail("placing tees no longer reads the drawing back at all");
  }
}

// 22. The symbol stays findable when zoomed out.
//
//    A fitting is about a metre across, which at a site-wide three
//    pixels to the metre is a body three pixels long and one and a half
//    thick — thinner than the main it sits on, in the same red, and
//    swallowed by it. It was drawn, it was on top, and it could not be
//    seen until the main was deleted out from under it.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/HVTT_MIN_PX/.test(canvas)) fail("the symbol has no minimum size on screen");

  /* One factor across all four measurements, so the shape is the same
     shape at every zoom. Clamped separately they would give a stubby
     tee at site level and a long thin one up close. */
  const k = (scale) => Math.max(1, HVTT_MIN_PX / (HVTT_ALONG_M * scale));
  for (const scale of [0.5, 1, 3, 5, 10]) {
    const along = HVTT_ALONG_M * scale * k(scale);
    if (Math.abs(along - HVTT_MIN_PX) > 0.01) {
      fail(`at ${scale} px/m the body is ${along.toFixed(1)} px, wanted the floor`);
    }
    /* And in proportion: the stem keeps its ratio to the body. */
    const stem = HVTT_STEM_M * scale * k(scale);
    if (Math.abs(stem / along - HVTT_STEM_M / HVTT_ALONG_M) > 1e-9) {
      fail(`at ${scale} px/m the shape is distorted`);
    }
  }

  /* Zoomed in past the floor, the real size takes over so the tee sits
     truly on its main. */
  const big = HVTT_ALONG_M * 30 * k(30);
  if (Math.abs(big - HVTT_ALONG_M * 30) > 1e-9) {
    fail("the floor was still stretching the symbol when zoomed in");
  }
  if (!(HVTT_MIN_PX >= 10 && HVTT_MIN_PX <= 40)) {
    fail(`a floor of ${HVTT_MIN_PX} px is not a legible symbol size`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Top tees behave (on the services and where a main divides, never at an end or a bend).");
process.exit(bad ? 1 : 0);
