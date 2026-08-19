/* High volume top tees on the gas services.

   Where a service pipe leaves the main, the connection is a top tee:
   clamped around the main with an outlet taking the service off it.
   Every gas service has one, so a drawing showing the services and not
   the tees is short one fitting per plot on the take-off. */
import {
  topTees, missingTees, gasMains, gasServices, angleOf,
  HVTT_JOIN_M, HVTT_ALONG_M, HVTT_STEM_M,
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

console.log(bad ? `\n${bad} problem(s)`
  : "Top tees behave (one per joined gas service, along the main, outlet at the plot).");
process.exit(bad ? 1 : 0);
