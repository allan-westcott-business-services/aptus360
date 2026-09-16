/* The main is laid to the end of the TRENCH, not to the last service.

   The walk that sizes the network prunes every node with no water
   beyond it, so a run used to stop at the last service connection: the
   final few metres of dig were bare — no pipe in a trench somebody had
   drawn to be dug, no wash out at its end, and nothing in the bill for
   pipe that would in fact be laid.

   The rule that matters and is easy to get wrong: a run only carries on
   where it ended at a LEAF. A run that ended because the main divides,
   or because the size changed, has served pipe ahead of it and must not
   be extended over it. */
import { readFileSync } from "node:fs";
import { waterMainRuns } from "./src/features/gis/waterNetwork.js";
import { washOuts } from "./src/features/gis/washOuts.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "water_trench", Label: "Water trench", Layer_Key: "trench" },
  { Type_Key: "water_service_trench", Label: "Water service trench",
    Layer_Key: "trench" },
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
];
const pipeSizes = [
  { Water_Pipe_Size_ID: 1, Size_Label: "63mm", Max_Meters: 20,
    Is_Active: true, Pipe_Kind: "main" },
  { Water_Pipe_Size_ID: 2, Size_Label: "90mm", Max_Meters: 60,
    Is_Active: true, Pipe_Kind: "main" },
];

const trench = (id, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "trench", Geometry: pts,
  Attributes: { Line_Type: "water_trench" } });
const service = (id, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "trench", Geometry: pts,
  Attributes: { Line_Type: "water_service_trench" } });
const meter = (id, at) => ({ Feature_ID: id, Feature_Type: "point",
  Feature_Role: "meter", Layer_Key: "water", Geometry: [at] });
const poc = (at) => ({ Feature_ID: 900, Feature_Type: "point",
  Feature_Role: "poc", Layer_Key: "water", Geometry: [at] });

const runsOf = (world) => waterMainRuns(world, { lineTypes, pipeSizes });

const far = (run) => run.pts[run.pts.length - 1];
const near = (a, b, tol = 0.01) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/* A street dug to 100 m, with the last service leaving at 60 m. The
   main should reach 100, not stop at 60. */
const street = [
  trench(1, [[0, 0], [30, 0], [60, 0], [100, 0]]),
  service(2, [[60, 0], [60, 10]]),
  meter(3, [60, 10]),
  service(4, [[30, 0], [30, 10]]),
  meter(5, [30, 10]),
  poc([0, 0]),
];

// 1. The pipe reaches the end of the dig.
{
  const plan = runsOf(street);
  if (plan.error) {
    fail(`the plan failed outright: ${plan.error}`);
  } else {
    const ends = plan.runs.map(far);
    if (!ends.some((p) => near(p, [100, 0]))) {
      fail("no run reaches the end of the trench \u2014 the main still stops "
        + "at the last service, leaving bare dig behind it");
    }
    /* And the tail is counted, or the bill is short by its length. */
    const tailed = plan.runs.find((r) => r.tailM > 0);
    if (!tailed) {
      fail("no run records a tail, so the pipe past the last service is "
        + "in no schedule");
    } else if (Math.abs(tailed.tailM - 40) > 0.2) {
      fail(`the tail is ${tailed.tailM} m where the dig runs 40 m past the `
        + "last service");
    }
  }
}

// 2. The wash out lands at the new end, which is the point of the
//    extension: a wash out at 60 m would be in the middle of a pipe.
{
  const plan = runsOf(street);
  const pipes = (plan.runs || []).map((r, i) => ({
    Feature_ID: 500 + i, Feature_Type: "line", Layer_Key: "water",
    Geometry: r.pts, Attributes: { Line_Type: "water_main" },
  }));
  const { washouts } = washOuts([...pipes, poc([0, 0])], { lineTypes });
  if (!washouts.some((w) => near(w.at, [100, 0]))) {
    fail("no wash out at the end of the extended pipe");
  }
  if (washouts.some((w) => near(w.at, [60, 0]))) {
    fail("a wash out sits at the last service tee, which is now the "
      + "middle of a pipe rather than its end");
  }
}

// 3. A run that ends at a JUNCTION is not extended over the served
//    pipe beyond it — that would lay a second main down the same
//    length.
{
  const world = [
    trench(1, [[0, 0], [50, 0]]),
    trench(2, [[50, 0], [100, 0]]),
    trench(3, [[50, 0], [50, 50]]),
    service(4, [[100, 0], [100, 10]]),
    meter(5, [100, 10]),
    service(6, [[50, 50], [60, 50]]),
    meter(7, [60, 50]),
    poc([0, 0]),
  ];
  const plan = runsOf(world);
  if (plan.error) {
    fail(`the tee plan failed outright: ${plan.error}`);
  } else {
    const total = plan.runs.reduce((t, r) => t + r.metres, 0);
    /* 50 + 50 + 50 of trench, and not a metre more: an extension over
       a served leg would double-count one of them. */
    if (Math.abs(total - 150) > 0.5) {
      fail(`the tee network lays ${total} m of main over 150 m of trench \u2014 `
        + "a run has been extended over pipe that was already laid");
    }
  }
}

// 4. A fork beyond the last service stops the extension rather than
//    guessing which leg is the main.
{
  const world = [
    trench(1, [[0, 0], [20, 0], [50, 0]]),
    service(2, [[20, 0], [20, 10]]),
    meter(3, [20, 10]),
    trench(4, [[50, 0], [80, 20]]),
    trench(5, [[50, 0], [80, -20]]),
    poc([0, 0]),
  ];
  const plan = runsOf(world);
  if (!plan.error) {
    const ends = plan.runs.map(far);
    if (ends.some((p) => near(p, [80, 20])) || ends.some((p) => near(p, [80, -20]))) {
      fail("the main is carried down one leg of an unserved fork \u2014 which "
        + "leg is the main is a question for the designer, not a guess");
    }
    if (!ends.some((p) => near(p, [50, 0]))) {
      fail("the main does not reach the fork it stops at");
    }
  }
}

// 5. Wired: the extension is in the router, where the geometry is
//    decided, and not bolted onto the canvas afterwards.
{
  const src = readFileSync("./src/features/gis/waterNetwork.js", "utf8");
  if (!/tailNode/.test(src) || !/tailM/.test(src)) {
    fail("waterNetwork does not record where the pipe finishes, so "
      + "nothing downstream can tell the tail from the run");
  }
  if (!/if \(!kids\(tail\)\.length\)/.test(src)) {
    fail("the extension is not guarded to leaves, so a run that ended at "
      + "a division would be carried over the pipe beyond it");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The main runs to the end of the trench, and the wash out with it.");
process.exit(bad ? 1 : 0);
