/* Building the electric network in order.

   Each step needs what the one before produced. Done out of order each
   still runs and quietly produces a worse answer — a network built
   before the meters are on circuits routes to nothing and looks like it
   worked.

   The state is read from the drawing, never recorded when somebody
   presses a button: stored state says a step is done for ever,
   including after the trench it drew has been deleted. */
import { electricSteps, ELECTRIC_STEP_KEYS } from "./src/features/gis/electricSteps.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "trench_main", Layer_Key: "trench" },
  { Type_Key: "trench_service", Layer_Key: "trench" },
];
const line = (type, id = 1) => ({
  Feature_ID: id, Feature_Type: "line",
  Attributes: { Line_Type: type }, Geometry: [[0, 0], [10, 0]],
});
const pt = (role, attrs = {}, id = 1) => ({
  Feature_ID: id, Feature_Type: "point", Feature_Role: role,
  Layer_Key: "electric", Attributes: attrs, Geometry: [[0, 0]],
});

// 1. An empty project starts at the first step, and the last is refused
//    with the reason rather than silently doing nothing.
{
  const r = electricSteps({ lineTypes: LT });
  if (r.next?.key !== "plots") fail("an empty project does not start at the plots");
  const build = r.allows("build");
  if (build.ok) fail("the LV build was allowed on an empty project");
  if (!/plots/i.test(build.why ?? "")) {
    fail(`the refusal says "${build.why}", which does not name what to do`);
  }
}

// 2. The order is the order asked for.
{
  const r = electricSteps({ lineTypes: LT });
  const keys = r.steps.map((s) => s.key);
  if (keys.join() !== ELECTRIC_STEP_KEYS.join()) {
    fail(`the steps run ${keys.join(", ")}`);
  }
}

// 3. A step is open only when everything before it is done.
{
  const plots = [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }];
  const r = electricSteps({
    plots,
    features: [
      { Feature_Role: "boundary", Feature_Type: "line", Geometry: [[0, 0], [1, 1]] },
      pt("plot"),
    ],
    lineTypes: LT,
  });
  if (r.next?.key !== "mains") fail(`after seeds the next step is ${r.next?.key}`);
  if (r.allows("service").ok) fail("Auto Service ran before a mains trench existed");
  if (!r.allows("mains").ok) fail("the mains trench was blocked by itself");
}

// 4. A plot with no house type or no heat source is not sized. Either
//    missing and the load is a guess, which is what the whole design
//    rests on.
{
  const half = [
    { plot_id: 1, config_code: "3BS", heat_source_id: 2 },
    { plot_id: 2, config_code: "3BS" },
  ];
  const r = electricSteps({ plots: half, lineTypes: LT });
  if (r.steps[0].done) fail("a plot with no heat source counted as set");
  if (!/1 of 2/.test(r.steps[0].detail)) {
    fail(`the detail reads "${r.steps[0].detail}"`);
  }
}

// 5. One developer needs no developer areas: the whole site is theirs.
{
  const base = {
    plots: [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }],
    features: [{ Feature_Role: "boundary", Feature_Type: "line", Geometry: [[0, 0], [1, 1]] }],
    lineTypes: LT,
  };
  const one = electricSteps({ ...base, developers: [{ id: 1 }] });
  if (!one.steps[1].done) fail("a single-developer site was asked for developer areas");

  const two = electricSteps({ ...base, developers: [{ id: 1 }, { id: 2 }] });
  if (two.steps[1].done) fail("two developers with no areas drawn counted as done");
}

// 6. A meter not on a circuit blocks the build — the case that fails
//    silently, because a network routed to nothing still draws cable.
{
  const r = electricSteps({
    plots: [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }],
    features: [
      { Feature_Role: "boundary", Feature_Type: "line", Geometry: [[0, 0], [1, 1]] },
      pt("plot", {}, 1),
      line("trench_main", 2),
      line("trench_service", 3),
      pt("spannode", { Span_Seq: 1 }, 4),
      pt("meter", {}, 5),
    ],
    lineTypes: LT,
  });
  if (r.allows("build").ok) fail("the LV build ran with a meter on no circuit");
  if (r.next?.key !== "circuits") fail(`the next step is ${r.next?.key}, wanted circuits`);
}

// 7. A design built before this existed reads as done, because the work
//    is in the drawing — nothing was recorded at the time and nothing
//    needs to be.
{
  const r = electricSteps({
    plots: [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }],
    developers: [{ id: 1 }],
    features: [
      { Feature_Role: "boundary", Feature_Type: "line", Geometry: [[0, 0], [1, 1]] },
      pt("plot", {}, 1),
      line("trench_main", 2),
      line("trench_service", 3),
      pt("spannode", { Span_Seq: 1 }, 4),
      pt("meter", { Circuit_ID: 1 }, 5),
      {
        Feature_ID: 6, Feature_Type: "line", Layer_Key: "electric",
        Attributes: { Generated: true }, Geometry: [[0, 0], [5, 0]],
      },
    ],
    lineTypes: LT,
  });
  if (r.doneCount !== 8) fail(`a finished design reads ${r.doneCount} of 8 done`);
  if (r.next) fail(`a finished design still wants ${r.next.key}`);
}

console.log(bad ? `\n${bad} problem(s)`
  : "Electric build order behaves (read from the drawing, refused with a reason).");
process.exit(bad ? 1 : 0);
