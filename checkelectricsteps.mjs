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

/* The seed and the meter carry the same plot, and the service trench
   is stamped to the seed, because that is what a serviced plot looks
   like on a real drawing: Auto Service writes all three. Without them
   nothing can tell the plot is served \u2014 which is also true of the run
   itself, so a fixture missing them describes a design that is not
   finished rather than one that is. */
// 6. A meter not on a circuit blocks the build — the case that fails
//    silently, because a network routed to nothing still draws cable.
{
  const r = electricSteps({
    plots: [{ plot_id: 1, config_code: "3BS", heat_source_id: 2 }],
    features: [
      poly(),
      { ...pt("plot", {}, 1), Plot_ID: 1 },
      line("trench_main", 2),
      { ...line("trench_service", 3),
        Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 1 } },
      pt("spannode", { Span_Seq: 1 }, 4),
      { ...pt("meter", {}, 5), Plot_ID: 1 },
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
      { ...pt("plot", {}, 1), Plot_ID: 1 },
      line("trench_main", 2),
      { ...line("trench_service", 3),
        Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 1 } },
      pt("spannode", { Span_Seq: 1 }, 4),
      { ...pt("meter", { Circuit_ID: 1 }, 5), Plot_ID: 1 },
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

// A site part-way through: started is not the same as not started.
//
//    69 seeds for 72 plots is a site being worked through, not a site
//    with no seeds on it. Auto Service on the 69 is the work somebody
//    is doing, and refusing it left them seeding three plots that were
//    not ready or not laying sixty-nine that were.
{
  const plots = Array.from({ length: 72 }, (_, i) => (
    { plot_id: i + 1, config_code: "3BS", heat_source_id: 2 }));
  const seeds = Array.from({ length: 69 }, (_, i) => pt("plot", {}, 200 + i));

  const r = electricSteps({
    plots,
    features: [poly(), ...seeds, line("trench_main")],
    lineTypes: LT,
  });

  const svc = r.allows("service");
  if (!svc.ok) fail(`Auto Service was refused on a part-seeded site: ${svc.why}`);
  if (!svc.warn) fail("Auto Service ran on a part-seeded site with no warning");
  if (svc.warn && !/69/.test(svc.warn)) {
    fail(`the warning did not say how many were ready: ${svc.warn}`);
  }
  /* The step itself is still not done, so the panel keeps saying so. */
  if (r.steps.find((x) => x.key === "seeds")?.done) {
    fail("69 of 72 seeds counted as finished");
  }
}

// Nothing at all still blocks.
//
//    No seed anywhere means Auto Service has nothing to lay to. That is
//    a real answer rather than caution, and the caller should not have
//    a way through it.
{
  const plots = Array.from({ length: 10 }, (_, i) => (
    { plot_id: i + 1, config_code: "3BS", heat_source_id: 2 }));

  const r = electricSteps({
    plots, features: [poly(), line("trench_main")], lineTypes: LT,
  });
  const svc = r.allows("service");
  if (svc.ok) fail("Auto Service ran on a site with no seeds at all");
  if (svc.ok || !/seed/i.test(svc.why || "")) {
    fail(`the refusal did not name the seeds: ${svc.why}`);
  }
}

// Every shortfall at once, not the first one over and over.
{
  const plots = Array.from({ length: 4 }, (_, i) => (
    { plot_id: i + 1, config_code: i < 3 ? "3BS" : null, heat_source_id: i < 3 ? 2 : null }));
  const r = electricSteps({
    plots,
    features: [poly(), pt("plot", {}, 301), line("trench_main")],
    lineTypes: LT,
  });
  const svc = r.allows("service");
  if (!svc.ok) fail(`a part-done site was refused: ${svc.why}`);
  const lines = (svc.warn || "").split("\n");
  if (lines.length < 2) {
    fail(`only ${lines.length} shortfall reported, wanted the plots and the seeds`);
  }
}

/* ── A flat on a board has no seed, and must not ──

   Reported from a drawing of 65 flats on four MSDBs and two
   non-residential supplies: **"Place the plot seeds first — 0 seed(s)
   for 65 plot(s)"**. The step counted every plot in the schedule and
   wanted a seed for each, so the build was refused for not doing
   something it must not do — a flat's meter is a row on the board's
   table, and there is nothing on the ground to seed. */
{
  const board = (plotIds, id = 400) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "msdb",
    Layer_Key: "electric", Geometry: [[5, 5]],
    Attributes: { Circuit_ID: 1, MSDB_Plot_IDs: plotIds },
  });
  const flats = Array.from({ length: 65 }, (_, i) => (
    { plot_id: i + 1, Property_Config_ID: 1, Heat_Source_ID: 2 }));
  const world = [
    poly(),
    board(flats.map((p) => p.plot_id)),
    line("trench_main"),
    pt("spannode", {}, 500),
    pt("meter", { Circuit_ID: 1 }, 501),
  ];

  const r = electricSteps({ plots: flats, features: world, lineTypes: LT });
  const seeds = r.steps.find((x) => x.key === "seeds");
  if (!seeds.done) {
    fail(`a drawing whose every plot is a flat on a board is told to seed `
      + `them: "${seeds.detail}"`);
  }
  if (!/MSDB|board/i.test(seeds.detail)) {
    fail("the step does not say WHY no seeds are wanted, so \"0 of 0\" with "
      + "65 plots on the project reads as a fault");
  }
  /* And the build is not refused for it. */
  const build = r.allows("build");
  if (!build.ok) fail(`the LV build is still refused: ${build.why}`);

  /* Nothing on the ground to service either \u2014 the same fault one step
     along, which would have been the next thing hit. */
  const svc = r.steps.find((x) => x.key === "service");
  if (!svc.done) {
    fail(`a drawing with nothing to run a service to is told to Auto Service: `
      + `"${svc.detail}"`);
  }

  /* ── And a plot NOT on a board still wants its seed ──

     The exemption is the flats a board has claimed, not the schedule.
     One ordinary house among them and the step is a step again. */
  const mixed = [...flats, { plot_id: 900, Property_Config_ID: 1, Heat_Source_ID: 2 }];
  const r2 = electricSteps({ plots: mixed, features: world, lineTypes: LT });
  const seeds2 = r2.steps.find((x) => x.key === "seeds");
  if (seeds2.done) {
    fail("a house that is not on any board is not asked for a seed");
  }
  if (!/1 plot/.test(seeds2.detail)) {
    fail(`the shortfall counts the flats as well: "${seeds2.detail}"`);
  }
  /* Started but unfinished warns rather than blocks, as ever \u2014 but
     with no seed at all and a plot wanting one, it blocks. */
  if (r2.allows("build").ok) {
    fail("a plot with no seed does not hold the build back at all");
  }

  /* A supply on the ground is something to service, so that step is a
     step again too. */
  const withNrs = electricSteps({
    plots: flats,
    features: [...world, pt("nrs", { NRS_ID: 9 }, 600)],
    lineTypes: LT,
  });
  if (withNrs.steps.find((x) => x.key === "service").done) {
    fail("a non-residential supply on the ground is not counted as something "
      + "to run a service to");
  }
}

/* ── A self-lay plot is on nobody's circuit, by design ──

   Reported from a 231-plot site: **"Link the meters to circuits: 214
   of 231 meter(s) on a circuit"**, and the build asking to be run
   anyway every time. The seventeen short were exactly the seventeen
   self-lay plots — fed from the incumbent's network, dug to their tee
   and nothing laid past it. There is no circuit to put them on, so
   the step could never be completed and the warning could never be
   cleared. */
{
  const meter = (id, plotId, circuit) => ({ Feature_ID: id,
    Feature_Role: "meter", Layer_Key: "electric", Plot_ID: plotId,
    Geometry: [[id, 0]], Attributes: circuit == null ? {} : { Circuit_ID: circuit } });
  const world = [
    poly(), line("trench_main"), pt("spannode", {}, 700),
    meter(801, 1, 1), meter(802, 2, 1),
    /* Two self-lay plots: no circuit, and never will have one. */
    meter(803, 3, null), meter(804, 4, null),
  ];
  const plots = [1, 2, 3, 4].map((id) => (
    { plot_id: id, Property_Config_ID: 1, Heat_Source_ID: 2 }));
  const selfLay = (m) => Number(m.Plot_ID) === 3 || Number(m.Plot_ID) === 4;

  const told = electricSteps({ plots, features: world, lineTypes: LT,
    isSelfLay: selfLay });
  const c = told.steps.find((x) => x.key === "circuits");
  if (!c.done) {
    fail(`self-lay plots are still counted as waiting for a circuit: "${c.detail}"`);
  }
  if (!/2 of 2/.test(c.detail)) {
    fail(`the count still includes the self-lay plots: "${c.detail}"`);
  }
  if (told.allows("build").warn) {
    fail(`the build still warns about them: "${told.allows("build").warn}"`);
  }

  /* Told nothing, it reads as it always did \u2014 so no caller that has
     not been updated changes behaviour. */
  const untold = electricSteps({ plots, features: world, lineTypes: LT });
  if (untold.steps.find((x) => x.key === "circuits").done) {
    fail("a caller that passes no self-lay rule now skips meters it should count");
  }

  /* And an ordinary plot genuinely off a circuit is still caught \u2014
     the exemption is self-lay, not "has no circuit". */
  const oneMissing = [...world, meter(805, 5, null)];
  const still = electricSteps({
    plots: [...plots, { plot_id: 5, Property_Config_ID: 1, Heat_Source_ID: 2 }],
    features: oneMissing, lineTypes: LT, isSelfLay: selfLay });
  if (still.steps.find((x) => x.key === "circuits").done) {
    fail("an ordinary plot with no circuit is let through as if it were self-lay");
  }
}

/* ── Auto Service offered on a site that has none left to do ──

   Reported: the command ran on a drawing where every eligible plot
   already had its dig.

   `done` meant "a service trench exists somewhere", which is what
   "has this step been started" means \u2014 not "is there anything left to
   run". And `allows` only ever looked at the steps BEFORE this one, so
   a step with nothing outstanding was indistinguishable from one
   nobody had begun.

   Counted through `isServed`, the same rule the run uses to skip a
   seed, so the menu and the run cannot disagree about what is waiting. */
{
  const seed = (id, x) => ({ Feature_ID: id, Feature_Role: "plot",
    Layer_Key: "plot", Plot_ID: id, Geometry: [[x, 50]], Attributes: {} });
  const meter = (id, x) => ({ Feature_ID: id + 100, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: id, Geometry: [[x, 50]], Attributes: {} });
  const main = { Feature_ID: 900, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [500, 0]], Attributes: { Line_Type: "trench_main" } };
  const svc = (id, sid, x) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "trench", Geometry: [[x, 0], [x, 50]],
    Attributes: { Line_Type: "trench_service", Seed_Feature_ID: sid } });
  const lineTypes = [
    { Type_Key: "trench_main", Layer_Key: "trench" },
    { Type_Key: "trench_service", Layer_Key: "trench" },
  ];
  const plots = [1, 2, 3].map((id) => ({ plot_id: id, plot_number: String(id),
    Property_Config_ID: 1, Heat_Source_ID: 1 }));
  const base = [main, seed(1, 100), meter(1, 100), seed(2, 200), meter(2, 200),
    seed(3, 300), meter(3, 300)];

  const stepFor = (features) => electricSteps({ features, plots, lineTypes })
    .steps.find((x) => x.key === "service");

  const all = stepFor([...base, svc(11, 1, 100), svc(12, 2, 200), svc(13, 3, 300)]);
  if (all.outstanding !== 0) {
    fail(`every plot served, but ${all.outstanding} counted as waiting`);
  }
  if (!all.done) fail("a site with every plot served does not read as done");
  if (!/every plot served/.test(all.detail)) {
    fail(`a fully serviced site reads "${all.detail}", which does not say so`);
  }

  const one = stepFor([...base, svc(11, 1, 100), svc(12, 2, 200)]);
  if (one.outstanding !== 1) {
    fail(`one plot waiting, but ${one.outstanding} counted`);
  }
  /* And it is NOT done: a trench existing somewhere is not the same as
     the work being finished, which is what the old rule said. */
  if (one.done) {
    fail("a site with a plot still to service reads as done, which is how "
      + "Auto Service came to be offered as though there were nothing to do");
  }
  if (!/1 plot\(s\) still to service/.test(one.detail)) {
    fail(`the step does not say how many are waiting: "${one.detail}"`);
  }

  if (stepFor(base).outstanding !== 3) fail("an unserviced site counts none waiting");

  /* ── Said, not refused ──

     The run still has work on a settled site: a service whose ground
     has moved is re-laid, and a duplicate left by an earlier run is
     swept. Refusing outright would take away the only way to ask for
     either, so the menu asks a different question instead. */
  const src = readFileSync("./src/features/gis/electricSteps.js", "utf8");
  if (!/settled: true/.test(src)) {
    fail("nothing tells the menu that a step has nothing waiting");
  }
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/r\.settled/.test(canvas)) {
    fail("the menu asks the same question whether the site is settled or "
      + "half-ready, so a settled site is offered a run that reads as though "
      + "it will do the work again");
  }
  if (!/re-lay any service whose ground \`\s*\n?\s*\+ "has moved and remove any duplicates/.test(canvas)
    && !/has moved and remove any duplicates/.test(canvas)) {
    fail("the question on a settled site does not say what running it would "
      + "still do");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Electric build order behaves (read from the drawing, refused with a reason).");
process.exit(bad ? 1 : 0);
