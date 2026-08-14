/* Bottle ends go where the feeder stops, and nowhere else.

   The failure this is really guarding against: the feeder model is built
   from the whole trench network, not from the cables of one circuit. Most
   of that network's dead ends are trenches this circuit never feeds —
   stubs to plots on another circuit, digs drawn ahead of a later phase,
   a spur that was rerouted away. Testing geometry for "an end of a line"
   would put a bottle end on every one of them.

   The rule is a loaded one: a node this circuit carries load through,
   with no loaded way onward. This proves the difference.

   Run: node checkbottleends.mjs */
import { planJoints, JOINT_KINDS, isBottleEnd } from "./src/features/gis/joints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Layer_Key is what makes a line a trench to the feeder model, and a
   service is recognised by "service" appearing in its type key. Both
   matter here: get either wrong and the model reports no trenches at
   all, which reads exactly like "no bottle ends were needed". */
const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];

let nextId = 1;
const trench = (pts, key = "trench") => ({
  Feature_ID: nextId++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts, Attributes: { Line_Type: key },
});
const plot = (id, at) => ({
  Feature_ID: nextId++, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: id, Geometry: [at], Attributes: {},
});
const meter = (plotId, seedId, at, circuitId = 1) => ({
  Feature_ID: nextId++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: plotId, Geometry: [at],
  Attributes: { Seed_Feature_ID: seedId, Circuit_ID: circuitId },
});

/* A main east from the substation with two plots hanging off it, and a
   third trench going nowhere this circuit feeds. */
const sub = {
  Feature_ID: nextId++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};

const p1 = plot(101, [50, 10]);
const p2 = plot(102, [120, 10]);

const features = [
  sub,
  trench([[0, 0], [50, 0], [120, 0]]),          // the main run
  trench([[50, 0], [50, 10]], "service_trench"),     // service to plot 101
  trench([[120, 0], [120, 10]], "service_trench"),   // service to plot 102
  /* An unused spur: dug, drawn, and feeding nothing on this circuit. Its
     far end is a dead end in every geometric sense. */
  trench([[50, 0], [50, -40]]),
  /* And a second one further along, so a geometry-based rule would have
     two obvious wrong answers rather than one. */
  trench([[120, 0], [180, 0]]),
  p1, p2,
  meter(101, p1.Feature_ID, [50, 10]),
  meter(102, p2.Feature_ID, [120, 10]),
];

const circuits = [{ id: 1, name: "Circuit 1" }];
const planned = planJoints(features, circuits, { lineTypes });
const bottles = planned.filter((j) => j.kind === "bottleend");

// 1. The catalogue entry exists and is named as the fitting.
{
  if (JOINT_KINDS.bottleend?.code !== "BTL") fail("the bottle end has no catalogue code");
  if (JOINT_KINDS.bottleend?.label !== "Bottle End") fail("the bottle end is misnamed");
}

// 2. Exactly one, at the far end of the run — not on either unused spur.
{
  if (bottles.length !== 1) {
    fail(`${bottles.length} bottle end(s) planned, expected 1`
      + ` \u2014 at ${bottles.map((b) => `${b.point[0]},${b.point[1]}`).join(" ")}`);
  }
  const at = bottles[0]?.point;
  if (at && Math.hypot(at[0] - 120, at[1] - 0) > 0.5) {
    fail(`the bottle end is at ${at[0]},${at[1]} rather than the end of the run`);
  }
}

// 3. None of them landed on a trench the circuit does not feed. Stated
//    separately because this is the whole reason the rule reads load and
//    not geometry.
{
  const onSpur = bottles.some((b) =>
    Math.hypot(b.point[0] - 50, b.point[1] + 40) < 0.5
    || Math.hypot(b.point[0] - 180, b.point[1]) < 0.5);
  if (onSpur) fail("a bottle end was placed on a trench this circuit never feeds");
}

/* 3b. Not at the plot end of a service.

      This is the fault the rule was written wrong for first time. A
      service spur satisfies every other condition \u2014 the circuit reaches
      it, it carries load, nothing is fed beyond it \u2014 so "an end of the
      loaded network" put a bottle end at every plot connection on the
      drawing. There were more of them than there were feeders. */
{
  const atPlot = bottles.filter((b) =>
    Math.hypot(b.point[0] - 50, b.point[1] - 10) < 0.5
    || Math.hypot(b.point[0] - 120, b.point[1] - 10) < 0.5);
  if (atPlot.length) {
    fail(`${atPlot.length} bottle end(s) at the plot end of a service cable`);
  }
}

// 4. The service is not lost. A terminal always has one — that is where
//    the load arrives — so the kind is the bottle end and the service is
//    kept as a reason rather than thrown away.
{
  const b = bottles[0];
  if (b && !b.reasons.includes("service")) {
    fail("the bottle end forgot that a service leaves the same point");
  }
  if (b && !b.reasons.includes("bottleend")) fail("the bottle end records no reason of its own");
}

// 5. The joint where the feeder divides is still a breech. Ranking the
//    bottle end first must not have disturbed anything upstream.
{
  const withBranch = [
    ...features,
    trench([[50, 0], [50, 60]]),
    (() => { const p = plot(103, [50, 70]); p3 = p; return p; })(),
    trench([[50, 60], [50, 70]], "service_trench"),
  ];
  var p3;
  const j = planJoints(withBranch, circuits, { lineTypes });
  const atFork = j.find((x) => Math.hypot(x.point[0] - 50, x.point[1]) < 0.5);
  if (atFork && atFork.kind === "bottleend") {
    fail("a fork in the middle of the run was called a bottle end");
  }
}

// 6. isBottleEnd reads the stored feature, not the label.
{
  if (!isBottleEnd({ Feature_Role: "joint", Attributes: { Joint_Type: "bottleend" } })) {
    fail("isBottleEnd does not recognise a bottle end");
  }
  if (isBottleEnd({ Feature_Role: "joint", Attributes: { Joint_Type: "service" } })) {
    fail("isBottleEnd claimed a service joint");
  }
  if (isBottleEnd({ Feature_Role: "point", Attributes: { Joint_Type: "bottleend" } })) {
    fail("isBottleEnd ignored the feature role");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bottle ends behave (at the end of the run, not on every dead end).");
process.exit(bad ? 1 : 0);
