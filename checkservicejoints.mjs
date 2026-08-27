/* Service joints, and the supplies that were missing theirs.

   Place Feeder Joints planned nothing at a non-residential supply's
   take-off. Not a rule about service joints that was wrong — the
   supply was not in the model at all, so there was no take-off to plan
   at, and everything downstream of that read as a correct answer about
   a smaller circuit.

   Why nothing caught it: jointsForCircuit kept its own copy of the walk
   that decides who is on a circuit, gathering plot seeds only. Since
   0196 a supply is a seed with role 'nrs' and the model prunes against
   plots, so a supply can only be claimed by Feature_ID — which the copy
   never collected. The canvas passed nrsById in, correctly, and
   jointsForCircuit dropped it on the floor.

   Two things are asserted here and they are different in kind. The
   first is the behaviour: a supply's take-off gets a service joint.
   The second is the shape that let it break: one walk, imported by
   both readers. A check on the behaviour alone would pass again the
   next time somebody copies the walk for a third reader. */

import { readFileSync } from "node:fs";
import { planJoints } from "./src/features/gis/joints.js";
import { circuitMembership } from "./src/features/gis/feeder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

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
/* A supply as 0196 leaves it: a seed of its own with role 'nrs', and an
   ordinary meter against it carrying the shared NRS_ID. */
const supplySeed = (nrsId, at) => ({
  Feature_ID: nextId++, Feature_Role: "nrs", Feature_Type: "point",
  Geometry: [at], Attributes: { NRS_ID: nrsId },
});
const supplyMeter = (nrsId, seedId, at, circuitId = 1) => ({
  Feature_ID: nextId++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [at],
  Attributes: { Seed_Feature_ID: seedId, NRS_ID: nrsId, Circuit_ID: circuitId },
});

const nrsById = (id) => (Number(id) === 7
  ? { NRS_ID: 7, Requested_kVA: 20, Site_Name: "Pump 1" } : null);
const circuits = [{ id: 1, name: "Circuit 1" }];

/* A main east from the substation, a dwelling at 50 and a pumping
   station at 120 — the far end of the run. */
const sub = {
  Feature_ID: nextId++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};
const p1 = plot(101, [50, 10]);
const supply = supplySeed(7, [120, 10]);

const features = [
  sub,
  trench([[0, 0], [50, 0], [120, 0]]),
  trench([[50, 0], [50, 10]], "service_trench"),
  trench([[120, 0], [120, 10]], "service_trench"),
  p1, supply,
  meter(101, p1.Feature_ID, [50, 10]),
  supplyMeter(7, supply.Feature_ID, [120, 10]),
];

const planned = planJoints(features, circuits, { lineTypes, nrsById });
const at = (x) => planned.filter((j) => Math.hypot(j.point[0] - x, j.point[1]) < 0.5);

// 1. The supply's take-off is jointed.
{
  const here = at(120);
  if (!here.length) {
    fail("nothing is planned where the supply's service leaves the main");
  } else if (!here.some((j) => j.kind === "service")) {
    fail("the supply's take-off has no service joint — planned: "
      + here.map((j) => j.kind).join(", "));
  }
}

// 2. And the dwelling's, which is the same rule and must not have moved.
{
  const here = at(50);
  if (!here.some((j) => j.kind === "service")) {
    fail("the dwelling's take-off has no service joint");
  }
}

/* 3. The run ends where the supply is, not where the last dwelling is.

   The clearest tell that the supply was missing from the model: with no
   load beyond plot 101, the feeder appeared to stop there and the
   bottle end sealed a cable that carries on for another seventy metres.
   A joint in the wrong place is worse than a joint missing, because
   nobody goes looking for it. */
{
  const early = at(50).some((j) => j.kind === "bottleend");
  const proper = at(120).some((j) => j.kind === "bottleend");
  if (early) fail("the run is sealed at the last dwelling, with the supply beyond it");
  if (!proper) fail("nothing seals the run at its far end");
}

/* 4. A circuit serving one commercial unit and no dwellings.

   Refusing this for having no metered plots is refusing it for the
   wrong reason — the same sentence spanTrace has carried since
   supplies arrived. It planned nothing at all before. */
{
  const only = features.filter((f) => f !== p1 && f.Plot_ID !== 101);
  const j = planJoints(only, circuits, { lineTypes, nrsById });
  if (!j.some((x) => x.kind === "service")) {
    fail("a circuit of supplies alone gets no service joint");
  }
  if (!j.some((x) => x.kind === "bottleend")) {
    fail("a circuit of supplies alone is never sealed");
  }
}

/* 5. A supply on another circuit is not this circuit's joint.

   The membership walk is what prunes it, and the failure it replaced
   was a filter finding nothing — so the check has to prove the filter
   still filters, not only that it now finds. */
{
  const seed2 = supplySeed(9, [190, 10]);
  const other = [
    ...features.filter((f) => f !== p1 && f.Plot_ID !== 101),
    trench([[120, 0], [190, 0]]),
    trench([[190, 0], [190, 10]], "service_trench"),
    seed2,
    supplyMeter(9, seed2.Feature_ID, [190, 10], 2),
  ];
  const j = planJoints(other, circuits, { lineTypes, nrsById });
  if (j.some((x) => Math.hypot(x.point[0] - 190, x.point[1]) < 0.5)) {
    fail("a supply on circuit 2 is jointed as part of circuit 1");
  }
}

// 6. Membership itself: both kinds, each by the route it can answer on.
{
  const { seedIds, meterIds } = circuitMembership(features, 1);
  if (!seedIds.has(Number(p1.Feature_ID))) {
    fail("circuitMembership does not claim a dwelling's seed");
  }
  if (meterIds.size !== 1) {
    fail(`circuitMembership claims ${meterIds.size} supply meter(s), expected 1`);
  }
  const empty = circuitMembership(features, 99);
  if (empty.seedIds.size || empty.meterIds.size) {
    fail("circuitMembership claims features for a circuit nobody is on");
  }
}

/* 7. One walk, not two.

   The fault was a second copy that had not kept up. Both readers import
   it now, and a third reader writing its own would be the same fault
   again — so this counts implementations rather than call sites. */
{
  const joints = readFileSync("src/features/gis/joints.js", "utf8");
  const feeder = readFileSync("src/features/gis/feeder.js", "utf8");

  if (!/import\s*{[^}]*circuitMembership/s.test(joints)) {
    fail("joints.js does not import circuitMembership — it has its own copy again");
  }
  const defs = (feeder.match(/export function circuitMembership\(/g) || []).length;
  if (defs !== 1) fail(`circuitMembership is defined ${defs} time(s), expected 1`);

  /* The walk's own signature: claiming a supply by its Feature_ID. If
     that line appears anywhere but the one function, somebody has
     copied it out again. */
  const copies = [["joints.js", joints], ["feeder.js", feeder]]
    .flatMap(([name, src]) => (src.match(/NRS_ID != null\s*\)\s*{\s*meterIds/g) || [])
      .map(() => name));
  if (copies.length !== 1) {
    fail(`the membership walk appears ${copies.length} time(s) (${copies.join(", ")}), expected 1`);
  }
}

/* 8. nrsById reaches the model.

   Asserted on the source rather than on the plan, and the reason is
   worth writing down: it cannot be proved from the output. Joint kinds
   are decided by the customer COUNT beyond a node — cum, not cumKva —
   so a supply with no kVA against it still ends a run and still takes a
   service off the main. The plan is identical with nrsById and without.

   It is forwarded anyway, because buildFeederModel computes cumKva from
   it and a model built here with every supply reading zero is a model
   that is wrong about something it was asked. The next reader to want a
   figure rather than a count would find it quietly short, which is the
   whole shape of fault 27. Cheap to pass, and the alternative is a
   model carrying a known lie. */
{
  const src = readFileSync("src/features/gis/joints.js", "utf8");
  const block = src.slice(src.indexOf("function jointsForCircuit"));
  const opts = block.slice(0, block.indexOf("}"));
  if (!/nrsById/.test(opts)) {
    fail("jointsForCircuit does not take nrsById — the canvas passes it and it goes nowhere");
  }
  if (!/nrsById/.test(block.slice(0, block.indexOf("buildFeederModel(") + 200))) {
    fail("jointsForCircuit does not pass nrsById to buildFeederModel");
  }
}

/* ── A plot the network cannot find gets no joint, and says so ──

   A meter attaches where its plot meets the trench. One landing more
   than the snap tolerance from any node attaches nowhere, so nothing is
   beyond its service spur — and a spur with no load beyond it is not
   part of the feeder. No take-off, no service joint.

   Nothing about the joint rules is wrong in that case, which is exactly
   why it was hard to see: the gaps depend on how close each seed
   happens to sit to the dig, so they look random and follow no pattern
   in the rules.

   The model has named these since it was written. Nothing read the
   list. */
{
  const sub2 = {
    Feature_ID: 900, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
  };
  const near = plot(201, [50, 10]);
  const far = plot(202, [90, 40]);

  const drawing = [
    sub2,
    trench([[0, 0], [50, 0], [90, 0]]),
    trench([[50, 0], [50, 10]], "service_trench"),
    near, far,
    meter(201, near.Feature_ID, [50, 10]),
    /* Thirty metres off the dig \u2014 no trench reaches it. */
    meter(202, far.Feature_ID, [90, 40]),
  ];

  const missed = [];
  const planned = planJoints(drawing, circuits, { lineTypes, nrsById, missed });

  // 9. The plot that is on the network still gets its joint.
  if (!planned.some((j) => j.kind === "service"
    && Math.hypot(j.point[0] - 50, j.point[1]) < 0.5)) {
    fail("the plot that IS on the network lost its service joint");
  }

  /* 10. And the one that is not is named.

     Named rather than counted: "1 meter missed" is a number somebody
     has to go and find, and the plot number is what they are looking
     for. */
  if (!missed.length) {
    fail("a meter that attaches to no node is not reported \u2014 its missing "
      + "service joint looks random");
  } else if (!missed.some((m) => Number(m.plotId) === 202)) {
    fail(`the reported plot is ${missed.map((m) => m.plotId).join(", ")}, expected 202`);
  }

  /* 11. Nothing is reported when every meter is found.

     A warning that fires on a correct drawing is one people learn to
     ignore, and then it is not a warning. */
  const clean = [];
  planJoints(drawing.filter((f) => f !== far && f.Plot_ID !== 202),
    circuits, { lineTypes, nrsById, missed: clean });
  if (clean.length) {
    fail(`a drawing with every meter on the network reported ${clean.length} missed`);
  }

  /* 12. And the command says it.

     Collected in the plan and shown on screen are two different things,
     and the first without the second is the fault this exists to end. */
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/missed,/.test(canvas)) fail("the joints command does not ask for the missed list");
  if (!/function reportMissed/.test(canvas)) {
    fail("the joints command collects the missed meters and never shows them");
  }
  if (!/reportMissed\(missed\)/.test(canvas)) {
    fail("reportMissed is written but never called");
  }
}

/* ── Where a plot's load hangs, and why joints looked random ──

   At the far end of its own service, which is the cut-out. Not at
   whatever node happens to be nearest.

   Nearest is right only while the plot sits further up its spur than it
   does from the tee. A short garden is nearer the tee on the MAIN than
   its own cut-out, so the load attached to the main — and a spur with
   no load beyond it is not part of the feeder. No take-off, so no
   service joint, and a bottle end at the tee instead.

   Two identical plots differing only by garden length: eleven metres up
   a twelve metre spur kept its joint, four metres up lost it. Nothing
   in the joint rules varies, which is exactly why the gaps read as
   random and no pattern could be found in them.

   A meter does not connect to a trench. The service joint is where the
   service meets the main, and this is the model catching up with that. */
{
  const svc = (pts, seedId) => ({
    Feature_ID: nextId++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: "service_trench", Seed_Feature_ID: seedId },
  });

  const sub3 = {
    Feature_ID: nextId++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
  };
  const longGarden = plot(301, [50, 11]);
  const shortGarden = plot(302, [100, 4]);

  const drawing = [
    sub3,
    trench([[0, 0], [50, 0], [100, 0]]),
    svc([[50, 0], [50, 12]], longGarden.Feature_ID),
    svc([[100, 0], [100, 12]], shortGarden.Feature_ID),
    longGarden, shortGarden,
    meter(301, longGarden.Feature_ID, [50, 11]),
    meter(302, shortGarden.Feature_ID, [100, 4]),
  ];

  const planned = planJoints(drawing, circuits, { lineTypes, nrsById });
  const serviceAt = (x) => planned.some((j) => j.kind === "service"
    && Math.hypot(j.point[0] - x, j.point[1]) < 0.5);

  // 13. The long garden keeps its joint, as it always had.
  if (!serviceAt(50)) fail("the long garden's plot lost its service joint");

  /* 14. And the short garden gets one.

     This is the fault. Its seed is four metres from the tee and eight
     from its own cut-out, so the load landed on the main. */
  if (!serviceAt(100)) {
    fail("a plot with a short garden gets no service joint \u2014 its load is "
      + "attaching to the main instead of to its own cut-out");
  }

  /* 15. The run still ends where it ends.

     The far plot is both the end of the run and a take-off, so it needs
     both fittings. Moving the load must not have cost it the bottle
     end, which is the merge fault the file above it guards. */
  if (!planned.some((j) => j.kind === "bottleend"
    && Math.hypot(j.point[0] - 100, j.point[1]) < 0.5)) {
    fail("the end of the run lost its bottle end");
  }

  /* 16. A hand-drawn service still works.

     It carries no Seed_Feature_ID \u2014 Auto Service stamps that \u2014 so it
     falls back to the nearest node, which is what it always had. The
     fix must not require a stamp that a drawn service will never have. */
  {
    const bare = {
      Feature_ID: nextId++, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[50, 0], [50, 12]], Attributes: { Line_Type: "service_trench" },
    };
    const hand = plot(303, [50, 11]);
    const j = planJoints([
      sub3, trench([[0, 0], [50, 0]]), bare, hand,
      meter(303, hand.Feature_ID, [50, 11]),
    ], circuits, { lineTypes, nrsById });
    if (!j.some((x) => x.kind === "service")) {
      fail("a hand-drawn service trench gets no service joint");
    }
  }
}

/* ── The seal goes where the dig ends ──

   A run stops carrying at the last plot, so the bottle end landed on
   the same point as the service joint serving it — one fitting on top
   of another.

   That used to be answered by drawing a metre and a half of trench
   nobody had dug, continued off the bearing of the last segment. It
   could point through a boundary or across a carriageway, and it put a
   length on a bill for ground nobody could open.

   The designer lays the main two or three metres past the last plot
   instead, and the cable follows that dig to its end. Nothing is
   invented: where the main stops dead the seal stays at the take-off,
   which is the drawing telling the truth about a main that was not laid
   past the last plot. */
{
  const sub4 = {
    Feature_ID: nextId++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
  };
  const last = plot(401, [50, 11]);

  const site = (mainPts) => [
    sub4,
    trench(mainPts),
    { Feature_ID: nextId++, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[50, 0], [50, 12]],
      Attributes: { Line_Type: "service_trench", Seed_Feature_ID: last.Feature_ID } },
    last,
    meter(401, last.Feature_ID, [50, 11]),
  ];
  const jointsOn = (mainPts) => planJoints(site(mainPts), circuits, { lineTypes, nrsById });
  const at = (js, kind, x) => js.some((j) => j.kind === kind
    && Math.hypot(j.point[0] - x, j.point[1]) < 0.5);

  // 17. The main laid three metres past: the seal is at its end.
  {
    const js = jointsOn([[0, 0], [50, 0], [53, 0]]);
    if (!at(js, "bottleend", 53)) fail("the seal is not at the end of the dig");
    if (at(js, "bottleend", 50)) fail("the seal is still back at the take-off");
    /* And the service joint has NOT moved. It serves the plot here, and
       separating the pair is the point of the whole change. */
    if (!at(js, "service", 50)) fail("the service joint moved with the seal");
  }

  /* 18. The main stopping dead: the seal stays where the load stops.

     Nothing is invented \u2014 which is the difference from the tail this
     replaced, and the drawing then says plainly that the main was not
     laid past the last plot. */
  {
    const js = jointsOn([[0, 0], [50, 0]]);
    if (!at(js, "bottleend", 50)) fail("a main stopping at the last plot lost its seal");
    if (!at(js, "service", 50)) fail("a main stopping at the last plot lost its service joint");
  }

  /* 19. A main going somewhere else is not an overrun.

     Seventy metres past the last plot is main serving something else.
     Following it would run this cable the length of a shared road.

     Both spellings of the same road, because the cap is on the whole
     overrun and not on each step: applied per segment it would stop ten
     metres along and seal at whatever point somebody happened to put a
     vertex \u2014 a different answer on two drawings of one road. */
  for (const [how, pts] of [
    ["one vertex", [[0, 0], [50, 0], [120, 0]]],
    ["many vertices", [[0, 0], [50, 0], [55, 0], [60, 0], [70, 0], [90, 0], [120, 0]]],
  ]) {
    const js = jointsOn(pts);
    if (!at(js, "bottleend", 50)) {
      fail(`a main running 70m past the last plot (${how}) did not seal at the take-off`);
    }
    if (js.some((j) => j.kind === "bottleend" && j.point[0] > 51)) {
      fail(`a main running 70m past the last plot (${how}) was sealed out along it`);
    }
  }

  /* 20. And the tail is gone.

     A synthetic length of trench, continued off a bearing. Named here
     so somebody searching for why their 1.5 m stopped appearing finds
     the reason rather than the absence. */
  {
    const fd = readFileSync("src/features/gis/feeder.js", "utf8");
    if (/const tailM = Number\(opts\.bottleEndTailM\)/.test(fd)) {
      fail("the synthetic bottle-end tail is still drawn");
    }
    const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
    if (/bottleEndTailM:/.test(canvas)) {
      fail("the canvas still passes bottleEndTailM, which nothing reads");
    }

    /* ── And no tail trench is dug ──

       Removing the synthetic geometry was only half of it. The build
       also DUG the tail: a short generated mains trench past the last
       plot, so the bottle end had ground to sit in.

       The designer lays the main beyond the plot now, so that ground is
       already open and already on the drawing. Digging another length
       over the top of it bills the same metre twice and leaves a second
       trench for somebody to set a status on.

       Asserted as an absence, in the block that lays the runs, because
       that is the only place it could come back. */
    const lay = canvas.slice(canvas.indexOf("Line_Type: \"elec_main\""),
      canvas.indexOf("Every node on this circuit is renumbered"));
    if (/Label: `\$\{c\.letter\}\$\{i \+ 1\} tail`/.test(lay)) {
      fail("the build still digs a tail trench past the last plot");
    }
    if (/tails \+= 1/.test(lay)) {
      fail("the build still counts tail trenches it dug");
    }
    /* The REMOVAL of tails dug by earlier runs has to stay. Every
       drawing built before this has them, and a rebuild is the only
       thing that takes them out. */
    if (!/doomedTails/.test(canvas)) {
      fail("a rebuild no longer clears the tail trenches earlier runs dug");
    }
    /* One walk for the cable and the seal, or they land in different
       places. */
    if ((fd.match(/export function digEndBeyond/g) || []).length !== 1) {
      fail("digEndBeyond is not defined exactly once");
    }
    const jt = readFileSync("src/features/gis/joints.js", "utf8");
    if (!/digEndBeyond\(M, u\)/.test(jt)) {
      fail("the seal does not use the same walk the cable does");
    }
  }
}

/* ── One service joint per service cable ──

   A take-off is where a service leaves the MAIN. Not any node with a
   service running on from it.

   A spur is often several features: splitByBoundary cuts one where it
   crosses the site boundary, and a service teed off a main in the road
   is always cut that way. Every cut leaves a vertex, so a node, and
   that node has a service child carrying load exactly as the take-off
   does — so a second service joint was planned a few metres down the
   garden, on a length of cable with no joint in it. */
{
  const svcT = (pts, seedId) => ({
    Feature_ID: nextId++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: "service_trench", Seed_Feature_ID: seedId },
  });
  const sub5 = {
    Feature_ID: nextId++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
  };
  const p = plot(501, [50, 11]);
  const main = () => trench([[0, 0], [50, 0], [53, 0]]);

  const whole = [sub5, main(), svcT([[50, 0], [50, 12]], p.Feature_ID),
    p, meter(501, p.Feature_ID, [50, 11])];
  /* The same spur, cut at the boundary, which is how it is written. */
  const split = [sub5, main(),
    svcT([[50, 0], [50, 4]], p.Feature_ID),
    svcT([[50, 4], [50, 12]], p.Feature_ID),
    p, meter(501, p.Feature_ID, [50, 11])];

  for (const [how, drawing] of [["in one piece", whole], ["split at the boundary", split]]) {
    const js = planJoints(drawing, circuits, { lineTypes, nrsById });
    const services = js.filter((j) => j.kind === "service");

    if (services.length !== 1) {
      fail(`a spur ${how} planned ${services.length} service joint(s), expected 1`
        + ` \u2014 at ${services.map((j) => j.point.join(",")).join(" and ")}`);
    }
    /* And on the main, not down the garden. */
    if (services[0] && Math.abs(services[0].point[1]) > 0.5) {
      fail(`a spur ${how} has its service joint ${services[0].point[1]}m off the main`);
    }
    /* The two drawings are the same site and must give the same joints. */
    if (js.length !== 2) {
      fail(`a spur ${how} planned ${js.length} joints, expected 2`);
    }
  }
}

console.log(bad === 0
  ? "  ok  Service joints behave (a supply's take-off is jointed, and the run ends at it)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
