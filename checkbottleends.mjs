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
  planJoints, reconcileJoints, JOINT_KINDS, isBottleEnd, bottleEndAngle,
} from "./src/features/gis/joints.js";
import { symbolPath, STROKE_ONLY, SYMBOLS } from "./src/lib/gisStyle.js";
import { feederSections } from "./src/features/gis/feeder.js";

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

// 4. The service is not lost — but it is no longer a reason ON the
//    bottle end.
//
//    This used to assert the opposite: that the terminal's kind was
//    bottleend with `service` kept among its reasons. That was the
//    behaviour that lost the fitting. A bottle end seals a cable and
//    nothing comes off it, so where a service leaves the same point the
//    site needs both, and the take-off counted one.
//
//    The service is now its own joint at that point, asserted above.
//    What matters here is that it went somewhere.
{
  const b = bottles[0];
  if (b && b.reasons.includes("service")) {
    fail("the bottle end still carries the service reason \u2014 the take-off"
      + " reads one fitting where two are fitted");
  }
  if (!planned.some((j) => j.kind === "service"
    && Math.hypot(j.point[0] - 120, j.point[1] - 0) < 0.5)) {
    fail("the service at the end of the run went nowhere");
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
  /* ── The migration this reads is not in the folder ──

     0163_bom_bottle_end_name.sql is referenced here and absent from
     supabase/migrations, so this whole file crashed on load and every
     assertion in it \u2014 including the ones about where bottle ends
     belong \u2014 stopped running. A check that cannot start is worse than
     one that fails, because the suite reports it the same way a missing
     dependency is reported and nobody reads further.

     It is the same gap as 0138 and 0182: migrations are pasted in by
     hand and the folder is the only record, so a file that never got
     committed is invisible until something reads it.

     Skipped with a named failure rather than deleted. Deleting would
     lose the check that "Bottleend" cannot come back; skipping keeps
     the rest of this file running and says what is missing. */
  const url = new URL(
    "./supabase/migrations/0163_bom_bottle_end_name.sql", import.meta.url);
  let sql = null;
  try {
    sql = readFileSync(url, "utf8");
  } catch {
    fail("supabase/migrations/0163_bom_bottle_end_name.sql is missing \u2014 the"
      + " bill's joint names cannot be checked against joints.js");
  }
  if (sql) {

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
}

/* ── A bottle end cannot take a service off it ──

   Where a service leaves the point a run ends, the site needs both
   fittings. planJoints kept the strongest reason and filed the rest
   under `reasons`, on the argument that the larger fitting does the
   smaller one's job — which is true of a breech, and not of a bottle
   end. A bottle end seals a cable; nothing comes off it.

   So the service joint was missing from the drawing and from the
   take-off, one per plot at the end of every run. The bottle end and
   the breech were both being placed correctly, which is what made it
   hard to see: the fault was only ever in the pairing. */
{
  const at120 = planned.filter((j) =>
    Math.hypot(j.point[0] - 120, j.point[1] - 0) < 0.5);
  const kinds = at120.map((j) => j.kind).sort();

  if (kinds.join(",") !== "bottleend,service") {
    fail(`the end of the run has ${kinds.join(" + ") || "nothing"} on it,`
      + " not a bottle end AND the service joint the last plot needs");
  }

  /* Neither reads as doing the other's job. A bottle end listing
     `service` among its reasons is what the take-off counted as one
     fitting. */
  const bottle = at120.find((j) => j.kind === "bottleend");
  if (bottle?.reasons.includes("service")) {
    fail("the bottle end still carries the service reason — the take-off"
      + " reads one fitting where two are fitted");
  }
  const svc = at120.find((j) => j.kind === "service");
  if (svc && svc.reasons.join() !== "service") {
    fail(`the service joint carries ${svc.reasons.join(", ")}`);
  }

  /* A breech that also serves a plot is still ONE breech. The split is
     for bottle ends alone, and widening it would double-count every
     fork on the site. */
  const mid = planned.filter((j) =>
    Math.hypot(j.point[0] - 50, j.point[1] - 0) < 0.5);
  if (mid.length !== 1) {
    fail(`${mid.length} joints planned where one service leaves the run`);
  }

  /* ── And a re-run settles ──

     Two fittings at one point, matched on position alone, let the
     bottle end plan claim the service feature and the service plan
     claim the bottle end. The pair swapped types on every run and
     neither was ever settled. */
  /* Reversed, so a match cannot succeed by the features happening to be
     listed in plan order. The first form of this fixture was in plan
     order and passed with the kind test removed \u2014 it was testing the
     array, not the rule. */
  const asPlaced = planned.map((j, i) => ({
    Feature_ID: 900 + i,
    Geometry: [j.point],
    Attributes: { Circuit_ID: j.circuitId ?? 1, Joint_Type: j.kind },
  })).reverse();
  const again = reconcileJoints(planned, asPlaced, 0.25);
  if (again.add.length || again.update.length || again.stale.length) {
    fail(`running it twice adds ${again.add.length}, rewrites`
      + ` ${again.update.length} and orphans ${again.stale.length}`
      + " \u2014 the pair at one point is swapping types on every run");
  }
}

/* ── The spare length past the last plot ──

   A run stops at the service joint serving the last plot on the leg.
   The gang digs a little further, lays a short tail and buries the
   bottle end in it, because a bottle end has to sit in trench like
   everything else. Drawn by the app rather than relied on from the
   designer: a length nobody can forget beats a rule everybody knows.

   Length from Electric_VD_Setting.Bottle_End_Tail_M (0185), not
   compiled in \u2014 1.5 m is a working practice, not a law. */
{
  const run = (geom, tail) => feederSections(
    [sub, trench(geom), trench([[geom[geom.length - 1][0],
      geom[geom.length - 1][1]], [geom[geom.length - 1][0] + 10,
      geom[geom.length - 1][1]]], "service_trench"),
    p1, meter(101, p1.Feature_ID,
      [geom[geom.length - 1][0] + 10, geom[geom.length - 1][1]])],
    { lineTypes, bottleEndTailM: tail },
  ).sections[0];

  /* Straight run: the tail carries on in the same direction. */
  const straight = run([[0, 0], [100, 0]], 1.5);
  const end = straight?.pts[straight.pts.length - 1];
  if (!end || Math.abs(end[0] - 101.5) > 1e-9 || Math.abs(end[1]) > 1e-9) {
    fail(`the tail ends at ${JSON.stringify(end)}, not 1.5 m on from [100, 0]`);
  }
  if (Math.abs((straight?.tailM ?? 0) - 1.5) > 1e-9) {
    fail("the section does not record how long its tail is, so the trench"
      + " laid under it cannot know it runs past the last plot");
  }

  /* ── At a bend ──

     The bearing of its OWN final segment, continued. Taking the bearing
     from the start of the section would point the tail back across the
     road the run came off. */
  const bent = run([[0, 0], [100, 0], [100, 40]], 1.5);
  const bendEnd = bent?.pts[bent.pts.length - 1];
  if (!bendEnd || Math.abs(bendEnd[0] - 100) > 1e-9
    || Math.abs(bendEnd[1] - 41.5) > 1e-9) {
    fail(`after a 90° turn the tail ends at ${JSON.stringify(bendEnd)},`
      + " not 1.5 m on from [100, 40] in the direction the run was going");
  }

  /* ── The trench carries on past the last plot ──

     Which is the ordinary drawing, not an edge case: 49 mains trenches
     to 44 mains on the site this was reported from. The run stops at
     the last plot because that is where the load stops; the dig
     carries on because somebody drew it that way.

     The first version of this tested `mainsChildren` \u2014 any non-service
     child, loaded or not \u2014 so the onward trench counted as "something
     runs on from here" and no tail was drawn. A tail then appeared only
     where the trench stopped dead at the last plot, which is the one
     case where the designer had already extended it by hand.

     `loadChildren` is what the walk itself asks. */
  const carriesOn = feederSections(
    [sub, trench([[0, 0], [100, 0], [160, 0]]),
      trench([[100, 0], [100, 10]], "service_trench"),
      p1, meter(101, p1.Feature_ID, [100, 10])],
    { lineTypes, bottleEndTailM: 1.5 },
  ).sections[0];

  if (!carriesOn?.tailM) {
    fail("no tail where the mains trench carries on past the last plot"
      + " \u2014 which is most of them");
  }
  const on = carriesOn?.pts[carriesOn.pts.length - 1];
  if (!on || Math.abs(on[0] - 101.5) > 1e-9 || Math.abs(on[1]) > 1e-9) {
    fail(`the tail ends at ${JSON.stringify(on)}, not 1.5 m past the last`
      + " plot at [100, 0]");
  }
  /* And it stops at the take-off plus the tail, not at the far end of
     the trench somebody drew. */
  if (on && on[0] > 110) {
    fail("the run followed the trench past the last plot instead of"
      + " stopping and laying a tail");
  }

  /* ── Zero means no tail ──

     A legitimate setting, and what the drawing did before this existed.
     Kept working so there is a way back without a release. */
  const none = run([[0, 0], [100, 0]], 0);
  const noneEnd = none?.pts[none.pts.length - 1];
  if (!noneEnd || Math.abs(noneEnd[0] - 100) > 1e-9) {
    fail(`a tail of 0 m still extended the run to ${JSON.stringify(noneEnd)}`);
  }
  if (none?.tailM != null) fail("a run with no tail still records one");

  /* And a setting that is not a number is not a licence to guess. */
  for (const junk of [undefined, null, "", "abc", -1, NaN]) {
    const r = run([[0, 0], [100, 0]], junk);
    if (r?.pts[r.pts.length - 1][0] !== 100) {
      fail(`a tail setting of ${JSON.stringify(junk)} extended the run`);
    }
  }
}

/* ── The bottle end goes at the end of the tail ──

   A run stops at the service joint serving the last plot. The gang digs
   1.5 m further, lays a short tail and buries the bottle end in it.

   ── Why this is a move and not a suppression ──

   The obvious build was: place the bottle end at the tail end from the
   canvas, and stop planJoints planning one at the take-off. That needs
   a condition — "only where a tail was drawn" — and getting it wrong
   puts two bottle ends on every leg, or none.

   There is no condition here. planJoints plans the bottle end where it
   always did, at the node ending the run, and then MOVES it to the end
   of the tail where the cable arriving carries one. One bottle end
   before, one after, in the same place in the code. A drawing with no
   tail is untouched because there is nothing to move it to.

   The service joint does not move: it belongs at the take-off, which is
   where the service leaves. */
{
  const cable = (geom, tailM) => ({
    Feature_ID: 700, Feature_Type: "line", Layer_Key: "electric",
    Geometry: geom,
    Attributes: {
      Line_Type: "elec_main", Circuit_ID: 1,
      ...(tailM == null ? {} : { Tail_M: tailM }),
    },
  });

  /* The run ends at [120, 0] where the last service leaves, and carries
     on 1.5 m to [121.5, 0]. */
  const withTail = planJoints(
    [...features, cable([[0, 0], [50, 0], [120, 0], [121.5, 0]], 1.5)],
    circuits, { lineTypes });

  const btl = withTail.filter((j) => j.kind === "bottleend");
  if (btl.length !== 1) {
    fail(`${btl.length} bottle ends on one leg \u2014 exactly one seals a run`);
  }
  const at = btl[0]?.point;
  if (at && Math.hypot(at[0] - 121.5, at[1]) > 0.01) {
    fail(`the bottle end is at ${JSON.stringify(at)}, not at the end of the`
      + " tail where it is buried");
  }

  /* And the service joint stayed put. Moving both would put the
     service connection 1.5 m past the plot it serves. */
  const svc = withTail.filter((j) => j.kind === "service"
    && Math.hypot(j.point[0] - 120, j.point[1]) < 0.01);
  if (svc.length !== 1) {
    fail(`${svc.length} service joints at the take-off, expected 1`);
  }

  /* ── A drawing with no tail is untouched ──

     Which is what a setting of 0 produces, and what every drawing made
     before this existed looks like. */
  const noTail = planJoints(
    [...features, cable([[0, 0], [50, 0], [120, 0]], null)],
    circuits, { lineTypes });
  const btl2 = noTail.filter((j) => j.kind === "bottleend");
  if (btl2.length !== 1) fail(`${btl2.length} bottle ends with no tail drawn`);
  if (btl2[0] && Math.hypot(btl2[0].point[0] - 120, btl2[0].point[1]) > 0.01) {
    fail("the bottle end moved on a drawing that has no tail");
  }

  /* A cable claiming a tail it does not have does not move anything: a
     Tail_M on a run whose last vertex IS the take-off would otherwise
     move the bottle end nowhere and look like it worked. */
  const liar = planJoints(
    [...features, cable([[0, 0], [50, 0], [120, 0]], 1.5)],
    circuits, { lineTypes });
  if (liar.filter((j) => j.kind === "bottleend").length !== 1) {
    fail("a cable claiming a tail it has not got changed the count");
  }
}

/* ── And the canvas asks for all of it ──

   The geometry being right is no use where nothing asks. The tail was
   shipped once as a function nothing called, and the drawing was
   unchanged \u2014 which reads exactly like the change not working. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* The length comes from the settings row, not from a constant. */
  if (!/bottleEndTailM: Number\(lookups\?\.vdSettings\?\.\[0\]\?\.Bottle_End_Tail_M\)/
    .test(canvas)) {
    fail("the build does not read Bottle_End_Tail_M \u2014 the tail is drawn"
      + " to a length nobody set, or not at all");
  }

  /* The cable records it, which is what lets planJoints find the far
     end. Without this the bottle end stays at the take-off however long
     the tail is drawn. */
  /* The cable's own spread, not `Tail_M: sec.tailM` anywhere \u2014 the
     loose form matched the trench block below and passed while the
     cable carried nothing, which is the half that actually moves the
     bottle end. */
  if (!/\.\.\.\(sec\.tailM \? \{ Tail_M: sec\.tailM \} : \{\}\)/.test(canvas)) {
    fail("the cable does not record its tail, so the bottle end cannot"
      + " be moved to the end of it");
  }

  /* And the trench. Cable without trench takes the fitting off the
     drawing correctly and leaves the dig short by a tail a leg \u2014 the
     tail is real work and has to be measured. */
  const dug = /if \(sec\.tailM && sec\.tailAt\)[\s\S]{0,700}?Layer_Key: "trench"/
    .test(canvas);
  if (!dug) fail("the tail is laid as cable but never dug");

  /* ── A joint this app placed, that the network has moved off ──

     Stale joints were all left alone. Right for one somebody drew:
     deleting a hand-placed joint because the model did not ask for it
     throws away a decision.

     Wrong for one this app placed. When the bottle end moved to the end
     of the tail, the plan put a new one 3 m along and the old one at
     the take-off matched nothing \u2014 so it stayed, sitting under the
     service joint, and every leg had two bottle ends with the wrong one
     where anybody was looking. Which is exactly what kept being
     reported, through four rounds of looking somewhere else. */
  if (!/staleMine = stale\.filter\(\(f\) => f\.Attributes\?\.Generated === true\)/
    .test(canvas)) {
    fail("stale joints are not split by who placed them");
  }
  /* And actually removed, not merely counted \u2014 a message saying
     "removed" while the row stays is worse than saying nothing. */
  if (!/staleMine\.map\(\(f\) => f\.Feature_ID\)[\s\S]{0,300}?deleteFeatures\(/
    .test(canvas)) {
    fail("the app's own superseded joints are counted but never deleted");
  }
  /* Hand-placed ones survive. */
  if (!/staleTheirs[\s\S]{0,200}?left alone/.test(canvas)) {
    fail("a joint somebody placed by hand is no longer left alone");
  }
  if (/deleteFeatures\(projectId, stale\b/.test(canvas)) {
    fail("every stale joint is deleted, including hand-placed ones");
  }

  /* ── And it says what it did ──

     A tail that is not drawn leaves the bottle end at the service joint
     and reads as a placement fault. That was chased three times from
     the drawing and once from the database before anybody could tell
     whether the length had been read at all.

     The count AND the length: reading 0 and drawing none is a different
     fault from reading 3 and drawing none, and the canvas cannot tell
     them apart. */
  if (!/\$\{tails\} bottle end tail\(s\) at \$\{tailSet\}m/.test(canvas)) {
    fail("the build does not say how many tails it drew and at what length,"
      + " so a zero is a silence rather than a fact");
  }
  if (!/Bottle_End_Tail_M is 0 or unset/.test(canvas)) {
    fail("a tail length of zero is not distinguished from one that was"
      + " never read");
  }

  /* Generated, so a rebuild clears its own tails rather than stacking a
     new one beside the last on every run. */
  const block = /if \(sec\.tailM && sec\.tailAt\)[\s\S]{0,900}?\n          \}/
    .exec(canvas);
  if (block && !/Generated: true/.test(block[0])) {
    fail("the tail trench is not marked Generated \u2014 a rebuild will leave"
      + " the old one and lay another beside it");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bottle ends behave (at the end of the run, not on every dead end).");
process.exit(bad ? 1 : 0);
