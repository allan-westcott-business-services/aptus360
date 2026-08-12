/* Building two unconnected gas networks on one drawing.

   A site can be fed from more than one side, and the build runs once
   per POC. This is the reproduction I could not construct for a long
   time, which is why several fixes for it were guesses. Two things had
   to be right in the fixture before the build would do anything at all:

     A service tees into the *middle* of a main, and the graph is built
     from trench endpoints — so the main has to be drawn as two lengths
     meeting at the tee, or the service is measured to the far end and
     reported as 40 m short.

     A meter needs a plot with a gas load behind it, through plotById.
     Without one it attaches to its service and then contributes
     nothing, and the network sizes to nothing.

   Both are properties of a real drawing, not of the test. */
import { gasMainRuns } from "./src/features/gis/gasNetwork.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const T = (id, pts) => ({
  Feature_ID: id, Feature_Type: "line",
  Attributes: { Line_Type: "trench_main" }, Geometry: pts,
});
const S = (id, pts) => ({
  Feature_ID: id, Feature_Type: "line",
  Attributes: { Line_Type: "trench_service" }, Geometry: pts,
});
const M = (id, x, y, plot) => ({
  Feature_ID: id, Feature_Type: "point", Feature_Role: "meter",
  Layer_Key: "gas", Plot_ID: plot, Geometry: [[x, y]],
});
const POC = (id, x) => ({
  Feature_ID: id, Feature_Type: "point", Feature_Role: "poc",
  Layer_Key: "gas", Geometry: [[x, 0]],
});

/* Two networks a kilometre apart, each fed from its own POC. */
const drawing = [
  POC(90, 0), T(1, [[0, 0], [40, 0]]), T(2, [[40, 0], [100, 0]]),
  S(3, [[40, 0], [40, 8]]), M(10, 40, 8, 1),
  POC(91, 900), T(4, [[900, 0], [940, 0]]), T(5, [[940, 0], [1000, 0]]),
  S(6, [[940, 0], [940, 8]]), M(11, 940, 8, 2),
];

const opts = {
  lineTypes: [
    { Type_Key: "trench_main", Layer_Key: "trench" },
    { Type_Key: "trench_service", Layer_Key: "trench" },
  ],
  pipeSizes: [{ Gas_Pipe_Size_ID: 1, Diameter_mm: 63, Max_kW: 120, Pressure_Tier: "LP" }],
  diversity: [{ Gas_Diversity_ID: 1, Max_Supplies: 9, Factor: 0.7 }],
  tier: "LP",
  plotById: (id) => ({ plot_id: id, gas_load_kw: 24 }),
};

// 1. One walk sees one network; both walks see both.
{
  const one = gasMainRuns(drawing, { ...opts, singlePoc: true });
  if (one.error) fail(`a single walk failed: ${one.error}`);
  else if (one.runs.length !== 1) fail(`one walk built ${one.runs.length} runs, wanted 1`);

  const both = gasMainRuns(drawing, opts);
  if (both.error) fail(`the two-POC build failed: ${both.error}`);
  else {
    if (both.runs.length !== 2) {
      fail(`both POCs built ${both.runs.length} runs, wanted 2`);
    }
    if ((both.networks || []).length !== 2) {
      fail(`${(both.networks || []).length} networks attempted, wanted 2`);
    }
    /* Both lengths are counted, not one twice. */
    if (!(both.totalM > one.totalM)) {
      fail("two networks came to no more pipe than one");
    }
    /* And no two lengths share a name. */
    const ids = both.runs.map((r) => r.id);
    if (new Set(ids).size !== ids.length) fail(`duplicate run labels: ${ids.join(", ")}`);
  }
}

// 2. One network failing does not stop the other, and is named.
{
  const lame = drawing.filter((f) => f.Feature_ID !== 11);   // no meter on network two
  const r = gasMainRuns(lame, opts);
  if (r.error) fail(`a good network was lost with the bad one: ${r.error}`);
  else {
    if (r.runs.length !== 1) fail(`${r.runs.length} runs built, wanted 1`);
    const failed = (r.networks || []).filter((n) => n.error);
    if (failed.length !== 1) fail(`${failed.length} networks reported as failed, wanted 1`);
    if (Number(failed[0]?.poc?.Feature_ID) !== 91) {
      fail("the failure was reported against the wrong POC");
    }
  }
}

// 3. A service teeing into the middle of a continuous main.
//
//    The graph used a main's own vertices and nothing else, so a
//    service landing between two of them had no node to attach to. It
//    was measured to the nearest vertex — the far end of the main — and
//    reported as tens of metres short, and the network built nothing.
//
//    Check Trench Joins measures to the *line*, so it called the same
//    drawing perfectly joined: "every trench end is either joined or
//    clear of the others" while the build refused to lay a pipe. Two
//    definitions of joined, and no way to see which one you had failed.
{
  const continuous = [
    POC(90, 0),
    /* One length, not split at the tee. */
    T(1, [[0, 0], [100, 0]]),
    S(2, [[40, 0], [40, 8]]), M(10, 40, 8, 1),
  ];
  const r = gasMainRuns(continuous, { ...opts, singlePoc: true });
  if (r.error) fail(`a mid-span tee failed to build: ${r.error}`);
  else if (r.runs.length !== 1) fail(`${r.runs.length} runs from a mid-span tee`);

  /* And two such networks both build. */
  const both = gasMainRuns([
    ...continuous,
    POC(91, 900), T(3, [[900, 0], [1000, 0]]),
    S(4, [[940, 0], [940, 8]]), M(11, 940, 8, 2),
  ], opts);
  if (both.error) fail(`two mid-span networks failed: ${both.error}`);
  else if (both.runs.length !== 2) {
    fail(`${both.runs.length} runs from two mid-span networks, wanted 2`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Two-network gas build behaves (both laid, failures named).");
process.exit(bad ? 1 : 0);
