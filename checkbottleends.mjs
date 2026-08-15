import { readFileSync } from "node:fs";
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
import {
  planJoints, JOINT_KINDS, isBottleEnd, bottleEndAngle,
} from "./src/features/gis/joints.js";
import { symbolPath, STROKE_ONLY, SYMBOLS } from "./src/lib/gisStyle.js";

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

/* 7. The symbol lies along the cable, not up the page.

      Every joint is drawn inside a rotation that aligns the x axis with
      the bearing of the cable beneath it. A symbol drawn about the y
      axis therefore comes out square across its own feeder \u2014 which is
      how this one was first written, and it read as a separate object
      sitting near the run rather than as its end.

      Checked by recording the path rather than by eye: the stem must be
      the horizontal part and the three bars the vertical ones, and the
      bars must sit on the far side from where the cable arrives. */
{
  const seg = [];
  let at = null;
  const ctx = {
    beginPath() {}, rect() {}, arc() {}, closePath() {},
    moveTo(x, y) { at = [x, y]; },
    lineTo(x, y) { if (at) seg.push([at, [x, y]]); at = [x, y]; },
  };
  const R = 10;
  symbolPath(ctx, "bottleend", 0, 0, R);

  if (seg.length !== 4) fail(`the bottle end draws ${seg.length} strokes, expected 4`);

  const horiz = seg.filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.01);
  const vert = seg.filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.01);
  if (horiz.length !== 1) fail(`${horiz.length} horizontal strokes, expected 1 (the stem)`);
  if (vert.length !== 3) fail(`${vert.length} vertical strokes, expected 3 (the bars)`);

  /* The stem starts where the cable arrives, at -r, so the fitting sits
     beyond the end of the run rather than back along it. */
  const stem = horiz[0];
  if (stem && Math.min(stem[0][0], stem[1][0]) > -R * 0.9) {
    fail("the stem does not reach back to where the cable arrives");
  }

  /* Bars in decreasing length, going outward. Reversed, the symbol
     reads as a funnel rather than a seal. */
  const bars = vert
    .map(([a, b]) => ({ x: a[0], len: Math.abs(a[1] - b[1]) }))
    .sort((m, n) => m.x - n.x);
  for (let i = 1; i < bars.length; i++) {
    if (!(bars[i].len < bars[i - 1].len)) {
      fail("the bars do not shorten as they go outward");
      break;
    }
  }
  if (bars.length && bars[0].x < 0) fail("the bars sit on the cable side of the joint");

  /* And it is outline-only \u2014 filling it would put a solid block over
     the end of the run. */
  if (!STROKE_ONLY.has("bottleend")) fail("the bottle end is not stroke-only");
  if (!SYMBOLS.includes("bottleend")) fail("the bottle end is not in the symbol list");
}

/* 8. The symbol ends up along the cable on screen.

      Orientation is two separable things and testing the symbol alone
      only covers one of them: the shape can be built about the right
      axis and still be turned by the wrong angle. This closes the loop
      by doing what the canvas does \u2014 take the angle, rotate the symbol's
      own axis by it the way ctx.rotate would, and check the result
      points along the cable in screen pixels.

      The sign is the whole point. toPx is

          x = m[0] * scale + view.x
          y = m[1] * scale + view.y

      with no y flip, so drawing and screen share an axis convention and
      atan2(vy, vx) is already the angle ctx.rotate wants. Negating it \u2014
      which jointAngle did, and which this function copied \u2014 reflects the
      symbol about the horizontal rather than turning it: right on a
      horizontal run, right at 45 degrees, and wrong everywhere else. */
{
  /* Same convention as toPx: scale and translate, no flip. */
  const toPx = ([mx, my], scale = 4, vx = 100, vy = 60) =>
    [mx * scale + vx, my * scale + vy];

  const runs = [
    { name: "north-east", from: [0, 0], to: [40, -40] },
    { name: "south-east", from: [0, 0], to: [40, 40] },
    { name: "due west", from: [40, 0], to: [0, 0] },
    { name: "due south", from: [0, 0], to: [0, 40] },
    { name: "shallow north-east", from: [0, 0], to: [60, -12] },
  ];

  for (const run of runs) {
    const feeder = {
      Feature_ID: 900, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [run.from, run.to],
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1 },
    };
    const joint = {
      Feature_Role: "joint", Layer_Key: "electric", Geometry: [run.to],
      Attributes: { Joint_Type: "bottleend" },
    };

    const spin = bottleEndAngle(joint, [feeder], { reach: 10 });
    if (spin == null) { fail(`no angle found for a run heading ${run.name}`); continue; }

    /* The symbol's own axis is +x, pointing outward from the cable.
       ctx.rotate(a) sends (1,0) to (cos a, sin a) in canvas pixels. */
    const facing = [Math.cos(spin), Math.sin(spin)];

    /* Which way the cable is heading, in the same pixels. */
    const a = toPx(run.from);
    const b = toPx(run.to);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cable = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];

    /* Same direction: the dot product is 1, not -1 (pointing back down
       the cable) and not 0 (square across it). */
    const dot = facing[0] * cable[0] + facing[1] * cable[1];
    if (dot < 0.999) {
      const deg = (x) => (Math.atan2(x[1], x[0]) * 180 / Math.PI).toFixed(1);
      fail(`on a run heading ${run.name} the bottle end faces ${deg(facing)}\u00b0`
        + ` and the cable runs at ${deg(cable)}\u00b0`);
    }
  }

  /* Drawn the other way round, the seal is still at the outer end. A
     feeder joined from two pieces can hold its points either way. */
  {
    const feeder = {
      Feature_ID: 901, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [[40, -40], [0, 0]],
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1 },
    };
    const joint = {
      Feature_Role: "joint", Layer_Key: "electric", Geometry: [[40, -40]],
      Attributes: { Joint_Type: "bottleend" },
    };
    const spin = bottleEndAngle(joint, [feeder], { reach: 10 });
    const facing = [Math.cos(spin), Math.sin(spin)];
    /* Outward here is towards [40,-40] from [0,0]: right and up. */
    if (!(facing[0] > 0 && facing[1] < 0)) {
      fail("on a run drawn back towards the substation the seal points inward");
    }
  }

  /* Nothing near enough is null, not zero. Zero is due east, which is a
     real answer and would be wrong on every run but one. */
  {
    const far = {
      Feature_ID: 902, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [[500, 500], [560, 500]],
      Attributes: { Line_Type: "elec_main" },
    };
    const joint = {
      Feature_Role: "joint", Layer_Key: "electric", Geometry: [[0, 0]],
      Attributes: { Joint_Type: "bottleend" },
    };
    if (bottleEndAngle(joint, [far], { reach: 10 }) !== null) {
      fail("a bottle end far from any feeder was given an angle anyway");
    }
  }
}


/* ── The bill calls a bottle end a Bottle End ──

   The names live twice: JOINT_KINDS here, and a CASE in the bill's own
   function, because SQL cannot read a JavaScript object. Two copies
   drift, and the way this one drifted was a bill that read "Bottleend"
   — initcap turning a key into a word, which works for 'straight' and
   fails for anything written as one.

   So the copies are checked against each other rather than trusted. */
{
  const sql = readFileSync(
    new URL("./supabase/migrations/0163_bom_bottle_end_name.sql", import.meta.url),
    "utf8",
  );

  for (const [key, spec] of Object.entries(JOINT_KINDS)) {
    /* Named in the bill exactly as joints.js names it. */
    const named = new RegExp(`WHEN '${key}'\\s+THEN '${spec.label}'`);
    if (!named.test(sql)) {
      fail(`the bill does not name ${key} as "${spec.label}"`);
    }
    /* And never assembled by capitalising the key, which is what
       produced "Bottleend". */
    const squashed = key.charAt(0).toUpperCase() + key.slice(1);
    if (spec.label !== squashed && sql.includes(`'${squashed}'`)) {
      fail(`the bill still has "${squashed}" written into it`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bottle ends behave (at the end of the run, not on every dead end).");
process.exit(bad ? 1 : 0);
