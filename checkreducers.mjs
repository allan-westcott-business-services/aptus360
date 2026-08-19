/* Reducers on a gas main.

   Where the main steps down a size, the joint between the two bores is
   a reducer, drawn as a triangle in line with the pipe pointing the way
   the gas goes.

   The part worth checking is the counting. A reducer joins one bore to
   the next one down — there is no such thing as a 125/63 — so a main
   that goes from 125 straight to 63 needs two fittings, not one, and a
   drawing showing one is a drawing that would be dug wrong. */
import {
  sizeLadder, stepsBetween, boreOf, reducersFor, missingReducers, angleOf,
  REDUCER_FIRST_M, REDUCER_LEN_M, REDUCER_MIN_PX,
} from "./src/features/gis/reducers.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water" },
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
];

/* The size table as it really is: a rule per capacity band, so a bore
   appears several times over. */
const SZ = [
  { Gas_Pipe_Size_ID: 1, Diameter_mm: 180, Pressure_Tier: "LP" },
  { Gas_Pipe_Size_ID: 2, Diameter_mm: 125, Pressure_Tier: "LP" },
  { Gas_Pipe_Size_ID: 3, Diameter_mm: 90, Pressure_Tier: "LP" },
  { Gas_Pipe_Size_ID: 4, Diameter_mm: 63, Pressure_Tier: "LP" },
  { Gas_Pipe_Size_ID: 5, Diameter_mm: 63, Pressure_Tier: "LP" },
  { Gas_Pipe_Size_ID: 6, Diameter_mm: 250, Pressure_Tier: "MP" },
];

const POC = { Feature_ID: 99, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] };
const pipe = (id, geom, sizeId, extra = {}) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "gas", Geometry: geom,
  Attributes: { Line_Type: "gas_main", Gas_Pipe_Size_ID: sizeId, ...extra },
});
const run = (world) => reducersFor(world, { lineTypes: LT, gasPipeSizes: SZ });

// 1. The ladder is one rung per bore, largest first, low pressure only.
//
//    Built from the rows, 63 would appear twice and the ladder would
//    step 63 to 63.
{
  const l = sizeLadder(SZ);
  if (l.join(",") !== "180,125,90,63") fail(`the ladder is ${l.join(",")}`);
}

// 2. One step, one fitting. Two steps, two.
//
//    This is the whole rule: there is no 125/63 reducer, so that drop
//    is a 125/90 and a 90/63 laid nose to tail.
{
  const l = sizeLadder(SZ);
  if (JSON.stringify(stepsBetween(125, 90, l)) !== "[[125,90]]") {
    fail(`125 to 90 came out as ${JSON.stringify(stepsBetween(125, 90, l))}`);
  }
  if (JSON.stringify(stepsBetween(125, 63, l)) !== "[[125,90],[90,63]]") {
    fail(`125 to 63 came out as ${JSON.stringify(stepsBetween(125, 63, l))}`);
  }
  if (stepsBetween(180, 63, l).length !== 3) {
    fail(`180 to 63 needs ${stepsBetween(180, 63, l).length} fittings, wanted 3`);
  }
  /* Every step is to the next rung and never skips one. */
  for (const [a, b] of stepsBetween(180, 63, l)) {
    if (l.indexOf(b) !== l.indexOf(a) + 1) fail(`${a} to ${b} skips a size`);
  }
}

// 3. Nothing going up, and nothing where the size does not change.
//
//    A main narrows as it goes. Raising a size downstream is already
//    handled by rewriting everything upstream to match, so by the time
//    this reads the drawing there is nothing to find.
{
  const l = sizeLadder(SZ);
  if (stepsBetween(90, 125, l).length) fail("a size going up produced a reducer");
  if (stepsBetween(90, 90, l).length) fail("an unchanged size produced a reducer");
  if (stepsBetween(null, 90, l).length) fail("a pipe with no size produced a reducer");
  if (stepsBetween(125, null, l).length) fail("a drop to no size produced a reducer");
}

// 4. Placed 1.5 m from the junction, then nose to tail.
//
//    The first clear of the tee rather than under it; each one after
//    with its back against the point of the one before.
{
  const world = [POC, pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[20, 0], [50, 0]], 4)];
  const { reducers } = run(world);

  if (reducers.length !== 2) fail(`${reducers.length} reducers for 125 to 63, wanted 2`);
  const [a, b] = reducers;
  if (Math.abs(a.at[0] - (20 + REDUCER_FIRST_M)) > 1e-6) {
    fail(`the first sits at ${a.at[0]}, wanted ${20 + REDUCER_FIRST_M}`);
  }
  if (Math.abs(b.at[0] - (20 + REDUCER_FIRST_M + REDUCER_LEN_M)) > 1e-6) {
    fail(`the second sits at ${b.at[0]}, not nose to tail`);
  }
  if (a.from !== 125 || a.to !== 90) fail(`the first is ${a.from}/${a.to}`);
  if (b.from !== 90 || b.to !== 63) fail(`the second is ${b.from}/${b.to}`);
  /* Both on the downstream pipe, not the one feeding it. */
  for (const r of reducers) if (r.pipe !== 2) fail("a reducer was put on the upstream pipe");
}

// 5. Pointing the way the gas goes.
//
//    Downstream is worked out from the POC, so a pipe drawn towards the
//    POC still gets a triangle pointing away from it. Drawing direction
//    is not flow direction and half a drawing is done each way.
{
  const away = [POC, pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[20, 0], [50, 0]], 3)];
  if (Math.abs(angleOf(run(away).reducers[0].dir)) > 0.05) {
    fail(`a pipe drawn away from the POC points at ${angleOf(run(away).reducers[0].dir)}`);
  }

  /* The same pipe, drawn from its far end back towards the junction. */
  const towards = [POC, pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[50, 0], [20, 0]], 3)];
  const got = angleOf(run(towards).reducers[0].dir);
  if (Math.abs(got) > 0.05) fail(`a pipe drawn towards the POC points at ${got}`);
}

// 6. Which pipe is downstream comes from the POC, not from the numbers.
//
//    With the POC at the far end the same two pipes reduce the other
//    way, and the fitting belongs to the other one.
{
  const world = [
    { Feature_ID: 99, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[50, 0]] },
    pipe(1, [[0, 0], [20, 0]], 3), pipe(2, [[20, 0], [50, 0]], 2),
  ];
  const { reducers } = run(world);
  if (reducers.length !== 1) fail(`${reducers.length} reducers when fed from the far end`);
  if (reducers[0]?.pipe !== 1) fail("the reducer was put on the wrong pipe");
  if (reducers[0]?.at[0] > 20) fail("the reducer was placed on the upstream side");
}

// 7. No POC, nothing drawn.
//
//    Without one there is no downstream, and triangles at every
//    junction pointing both ways would be worse than none.
{
  const world = [pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[20, 0], [50, 0]], 4)];
  if (run(world).reducers.length) fail("reducers appeared with no POC to flow from");
}

// 8. Gas mains only.
{
  const world = [
    POC,
    pipe(1, [[0, 0], [20, 0]], 2),
    { Feature_ID: 3, Feature_Type: "line", Layer_Key: "gas", Geometry: [[20, 0], [20, 9]],
      Attributes: { Line_Type: "gas_service", Gas_Pipe_Size_ID: 4 } },
    { Feature_ID: 4, Feature_Type: "line", Layer_Key: "trench", Geometry: [[20, 0], [40, 0]],
      Attributes: { Line_Type: "trench_main" } },
  ];
  if (run(world).reducers.length) fail("a service or a trench was given a reducer");
}

// 9. A pipe nothing reaches is reported rather than guessed at.
{
  const world = [
    POC, pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[20, 0], [50, 0]], 3),
    pipe(9, [[200, 200], [230, 200]], 4),
  ];
  const { reducers, unreached } = run(world);
  if (!unreached.includes(9)) fail("an island pipe was not reported");
  if (reducers.some((r) => r.pipe === 9)) fail("an island pipe was given a reducer");
}

// 10. A size typed by hand still steps.
//
//    Drawings made before the size became a choice from a table carry
//    the text alone, and a reducer is as real on those.
{
  const typed = (id, geom, label) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "gas", Geometry: geom,
    Attributes: { Line_Type: "gas_main", Size: label },
  });
  if (boreOf(typed(1, [], "125mm"), SZ) !== 125) fail("a typed size was not read");
  const world = [POC, typed(1, [[0, 0], [20, 0]], "125mm"), typed(2, [[20, 0], [50, 0]], "90mm")];
  if (run(world).reducers.length !== 1) fail("a typed size produced no reducer");

  /* And an override beats the built size, as it does everywhere else. */
  const over = pipe(3, [[0, 0], [9, 0]], 2, { Manual_Gas_Pipe_Size_ID: 3 });
  if (boreOf(over, SZ) !== 90) fail(`the override was ignored: ${boreOf(over, SZ)}`);
}

// 11. Backfill places only what is missing, and tells the steps apart.
//
//    A 125/90 and a 90/63 sit about a metre apart on the same pipe, so
//    position alone would have either satisfying the other and half the
//    fittings never drawn.
{
  const world = [POC, pipe(1, [[0, 0], [20, 0]], 2), pipe(2, [[20, 0], [50, 0]], 4)];
  const { reducers } = run(world);
  if (missingReducers(world, reducers).missing.length !== 2) {
    fail("a drawing with none did not report both as missing");
  }

  const placed = {
    Feature_ID: 40, Feature_Role: "reducer", Geometry: [reducers[0].at],
    Attributes: { From_mm: 125, To_mm: 90 },
  };
  const left = missingReducers([...world, placed], reducers).missing;
  if (left.length !== 1) fail(`${left.length} left after placing the first`);
  if (left[0]?.from !== 90 || left[0]?.to !== 63) {
    fail("the 125/90 was taken for the 90/63");
  }

  /* Left over from a size since changed: reported, never removed. */
  const stale = {
    Feature_ID: 41, Feature_Role: "reducer", Geometry: [[35, 0]],
    Attributes: { From_mm: 180, To_mm: 125 },
  };
  const r = missingReducers([...world, placed, stale], reducers);
  if (r.orphans.length !== 1 || r.orphans[0].Feature_ID !== 41) {
    fail("a reducer for a size no longer there was not reported");
  }
}

// 12. The symbol has a size in metres and a floor in pixels.
{
  if (!(REDUCER_LEN_M > 0 && REDUCER_LEN_M < 3)) {
    fail(`a length of ${REDUCER_LEN_M} m is not a fitting`);
  }
  if (!(REDUCER_MIN_PX >= 10 && REDUCER_MIN_PX <= 40)) {
    fail(`a floor of ${REDUCER_MIN_PX} px is not a legible symbol`);
  }
  if (REDUCER_FIRST_M !== 1.5) fail(`the first sits at ${REDUCER_FIRST_M} m, wanted 1.5`);
}

// 13. Widening a main upstream re-reckons every branch off it.
//
//    Raising a length to a bigger bore walks back to the POC raising
//    each one in turn, and those lengths feed branches that were never
//    touched. A branch off a 90 dropping to 63 was one reducer; once
//    that 90 is a 125 the same branch is two, because there is no
//    125/63 fitting.
//
//    Nothing recomputed them, so those branches kept the single reducer
//    they had and the drawing showed one fitting where the ground needs
//    two. The edited length itself was right, which is what made it
//    look as though the rule had worked.
{
  const spine90 = [POC, pipe(1, [[0, 0], [30, 0]], 3), pipe(2, [[30, 0], [30, 20]], 4)];
  const before = run(spine90).reducers;
  if (before.length !== 1 || before[0].from !== 90 || before[0].to !== 63) {
    fail(`a 90 feeding a 63 gave ${before.map((r) => `${r.from}/${r.to}`).join(",")}`);
  }

  /* Placed, as they would be on the drawing. */
  const placed = before.map((r, i) => ({
    Feature_ID: 300 + i, Feature_Role: "reducer", Geometry: [r.at],
    Attributes: { From_mm: r.from, To_mm: r.to },
  }));

  /* Now the spine is widened to 125 by the upstream rule. The branch
     was not edited and is still 63. */
  const spine125 = [POC, pipe(1, [[0, 0], [30, 0]], 2),
    pipe(2, [[30, 0], [30, 20]], 4), ...placed];
  const after = run(spine125).reducers;

  if (after.length !== 2) {
    fail(`after widening the branch needs ${after.length} reducers, wanted 2`);
  }
  if (after.map((r) => `${r.from}/${r.to}`).join(",") !== "125/90,90/63") {
    fail(`the steps came out as ${after.map((r) => `${r.from}/${r.to}`).join(",")}`);
  }

  /* Both are outstanding: the 125/90 because nothing like it exists,
     and the 90/63 because it has moved a fitting's length along to make
     room for the one before it. */
  const d = missingReducers(spine125, after);
  if (d.missing.length !== 2) {
    fail(`${d.missing.length} reported as missing after widening, wanted 2`);
  }
  /* And the one that was there is now in the wrong place, so it goes
     rather than being left as a third fitting nobody ordered. */
  if (d.orphans.length !== 1 || d.orphans[0].Feature_ID !== 300) {
    fail("the reducer left over from the narrower spine was not cleared");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Reducers behave (one per rung of the ladder, downstream from the POC, nose to tail).");
process.exit(bad ? 1 : 0);
