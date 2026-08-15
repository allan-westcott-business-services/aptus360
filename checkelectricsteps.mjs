/* Building the electric network in order.

   Each step needs what the one before produced. Done out of order each
   still runs and quietly produces a worse answer — a network built
   before the meters are on circuits routes to nothing and looks like it
   worked.

   The state is read from the drawing, never recorded when somebody
   presses a button: stored state says a step is done for ever,
   including after the trench it drew has been deleted. */
import { readFileSync } from "node:fs";
import { electricSteps, ELECTRIC_STEP_KEYS } from "./src/features/gis/electricSteps.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "trench_main", Layer_Key: "trench" },
  { Type_Key: "trench_service", Layer_Key: "trench" },
];
/* A boundary is a polygon on the boundary layer, and a developer area
   is the same thing carrying a developer. There is no Feature_Role
   "boundary" — looking for one meant a site with its red line plainly
   drawn read as having none. */
const poly = (attrs = {}, id = 90) => ({
  Feature_ID: id, Feature_Type: "polygon", Layer_Key: "boundary",
  Attributes: attrs, Geometry: [[0, 0], [10, 0], [10, 10]],
});

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
      poly(),
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
    features: [poly()],
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
      poly(),
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
      poly(),
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

// 8. The boundary is found the way the rest of the application finds
//    it: a polygon on the boundary layer, without a developer on it.
{
  const plots = [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }];

  const one = electricSteps({
    plots, features: [poly()], developers: [{ id: 1 }], lineTypes: LT,
  });
  if (!one.steps[1].done) fail("a drawn site boundary was not detected");

  /* A developer area is on the same layer and is not the red line \u2014
     counting one would say the site was bounded when only one
     developer's patch was. */
  const areaOnly = electricSteps({
    plots,
    features: [poly({ Project_Developer_ID: 1 }, 91)],
    developers: [{ id: 1 }],
    lineTypes: LT,
  });
  if (areaOnly.steps[1].done) {
    fail("a developer area was counted as the site boundary");
  }

  /* Two developers need an area each. */
  const two = electricSteps({
    plots, features: [poly()], developers: [{ id: 1 }, { id: 2 }], lineTypes: LT,
  });
  if (two.steps[1].done) fail("two developers with no areas counted as done");

  const withAreas = electricSteps({
    plots,
    features: [poly(), poly({ Project_Developer_ID: 1 }, 91),
      poly({ Project_Developer_ID: 2 }, 92)],
    developers: [{ id: 1 }, { id: 2 }],
    lineTypes: LT,
  });
  if (!withAreas.steps[1].done) fail("two developers with an area each was not done");
}

/* ── A plot is set when the plots endpoint says it is ──

   The checks above use `config_code`, which is what a joined view calls
   the house type. The plots endpoint returns `Property_Config_ID`, and
   that name was not in the list — so a site with every plot set read as
   "0 of 129 have a house type and heat source" and every build refused
   to start.

   Nothing caught it because the fixtures were written in the shape the
   check happened to accept. So the real shape is tested here, taken
   from PLOT_COLUMNS in netlify/functions/plots.js rather than from
   memory. */
{
  const real = Array.from({ length: 129 }, (_, i) => ({
    Plot_ID: i + 1, Project_ID: 1, Plot_Number: String(i + 1),
    Property_Config_ID: 7, Heat_Source_ID: 2, KVA_Load: null,
  }));
  const r = electricSteps({ features: [], plots: real, developers: [], lineTypes: [] });
  const step = r.steps.find((x) => x.key === "plots");
  if (!step.done) fail(`plots set through the endpoint read as: ${step.detail}`);
  if (!/129 of 129/.test(step.detail)) fail(`the count read "${step.detail}"`);

  /* Both halves still required. A plot with a house type and no heat
     source is not sized — the load would be a guess. */
  const half = electricSteps({
    features: [],
    plots: [{ Plot_ID: 1, Property_Config_ID: 7 }],
    developers: [], lineTypes: [],
  }).steps.find((x) => x.key === "plots");
  if (half.done) fail("a plot with no heat source counted as set");

  const other = electricSteps({
    features: [],
    plots: [{ Plot_ID: 1, Heat_Source_ID: 2 }],
    developers: [], lineTypes: [],
  }).steps.find((x) => x.key === "plots");
  if (other.done) fail("a plot with no house type counted as set");

  /* And the field names really do come from the endpoint, rather than
     from what this file remembers of it. */
  const cols = readFileSync("./netlify/functions/plots.js", "utf8");
  for (const c of ["Property_Config_ID", "Heat_Source_ID"]) {
    if (!cols.includes(`"${c}"`)) {
      fail(`${c} is not returned by the plots endpoint any more`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Electric build order behaves (read from the drawing, refused with a reason).");
process.exit(bad ? 1 : 0);
