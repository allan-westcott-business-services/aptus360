/* Auto Service lays a cable in the dig, not across it.

   Where a service trench is already drawn, the cable follows it. It
   used to run straight from the tee to the boundary whatever was on the
   drawing, so on any trench that is not a straight line the cable came
   out shorter than the dig it sits in — and every quantity taken off it
   was wrong in the cheap direction. */
import { readFileSync } from "node:fs";
import { planSeed, layServices } from "./src/features/gis/autoService.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const len = (g) => g.slice(1)
  .reduce((t, p, i) => t + Math.hypot(p[0] - g[i][0], p[1] - g[i][1]), 0);

const MAINS = [{ Geometry: [[0, 0], [200, 0]] }];
const SEED = {
  Feature_ID: 1, Geometry: [[100, 40]],
  Attributes: { Boundary_At: [100, 25] },
};
/* A service trench that doglegs round something, as they do. */
const SERVICE = [{ Geometry: [[100, 0], [100, 12], [112, 12], [112, 25], [100, 25]] }];
const utils = () => ["electric"];

// 1. With no trench drawn, the straight line is still the answer.
{
  const p = planSeed(SEED, MAINS, utils, {});
  if (p.trench.length !== 2) fail("a plot with no service trench got a bent route");
}

// 2. With one drawn, the route follows it.
{
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: SERVICE });
  if (p.trench.length < 4) fail("the route did not follow the service trench");
  /* It starts where the main is joined and stops at the boundary,
     whatever the drawn trench's own ends are. */
  const a = p.trench[0];
  const z = p.trench[p.trench.length - 1];
  if (Math.hypot(a[0] - 100, a[1] - 0) > 0.01) fail("the route does not start at the tee");
  if (Math.hypot(z[0] - 100, z[1] - 25) > 0.01) fail("the route does not stop at the boundary");

  /* And the cable follows the trench, then leaves it for the meter, so
     it is never shorter than the dig. */
  const cable = p.cables[0].geometry;
  if (len(cable) < len(p.trench)) {
    fail(`the cable is ${len(cable).toFixed(1)}m in a ${len(p.trench).toFixed(1)}m trench`);
  }
}

// 3. Following the dig is longer than cutting across it — which is the
//    whole point, and the number somebody prices from.
{
  const straight = planSeed(SEED, MAINS, utils, {});
  const along = planSeed(SEED, MAINS, utils, { serviceTrenches: SERVICE });
  if (!(len(along.trench) > len(straight.trench))) {
    fail("following the service trench did not lengthen the route");
  }
}

// 4. Somebody else's trench is not followed. Matching on one end alone
//    would route this plot's service through a neighbour's garden.
{
  const elsewhere = [{ Geometry: [[10, 0], [10, 25]] }];
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: elsewhere });
  if (p.trench.length !== 2) fail("a service trench belonging to another plot was followed");
}

// 5. Drawn the other way round is the same trench.
{
  const reversed = [{ Geometry: [...SERVICE[0].Geometry].reverse() }];
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: reversed });
  if (p.trench.length < 4) fail("a trench drawn boundary-first was not followed");
  if (Math.hypot(p.trench[0][0] - 100, p.trench[0][1] - 0) > 0.01) {
    fail("a reversed trench produced a route starting at the wrong end");
  }
}

/* What a trench offers to lay, from the configured line types.

   Mains types in a mains trench and service types in a service trench.
   A service cable in a mains trench is not a mistake the drawing should
   help somebody make, and reading the split off the type keys means a
   line type added in Admin appears without editing this. */
{
  const lineTypes = [
    { Type_Key: "trench_main", Layer_Key: "trench", Label: "Mains Trench" },
    { Type_Key: "trench_service", Layer_Key: "trench", Label: "Service Trench" },
    { Type_Key: "hv_main", Layer_Key: "electric", Label: "HV Cable" },
    { Type_Key: "elec_service", Layer_Key: "electric", Label: "Service Cable" },
    { Type_Key: "gas_main", Layer_Key: "gas", Label: "Gas Main" },
    { Type_Key: "gas_service", Layer_Key: "gas", Label: "Gas Service" },
    { Type_Key: "water_main", Layer_Key: "water", Label: "Water Main" },
    { Type_Key: "water_service", Layer_Key: "water", Label: "Water Service" },
  ];
  const offered = (trenchKey) => {
    const isService = /service/i.test(trenchKey);
    return lineTypes
      .filter((t) => t.Layer_Key !== "trench"
        && /service/i.test(t.Type_Key) === isService)
      .map((t) => t.Label);
  };

  const mains = offered("trench_main");
  const svc = offered("trench_service");

  for (const want of ["HV Cable", "Gas Main", "Water Main"]) {
    if (!mains.includes(want)) fail(`a mains trench does not offer ${want}`);
  }
  for (const want of ["Service Cable", "Gas Service", "Water Service"]) {
    if (!svc.includes(want)) fail(`a service trench does not offer ${want}`);
  }
  /* And neither offers the other's. */
  if (mains.some((x) => /service/i.test(x))) {
    fail("a mains trench offered a service to be laid in it");
  }
  if (svc.some((x) => /main/i.test(x))) {
    fail("a service trench offered a main to be laid in it");
  }
}

/* Every cable turns at the boundary point.

   The dig runs from the main to the boundary, and the cable is laid in
   it — so the boundary is a vertex on every cable, not a place the line
   happens to pass near. Without it the cable is a straight run from the
   main to a meter, which is not where the trench goes. */
{
  const seed = {
    Feature_ID: 1, Geometry: [[100, 40]],
    Attributes: { Boundary_At: [100, 25] },
  };
  const p = planSeed(seed, MAINS, () => ["electric", "gas"], {});
  if (p.skipped) fail(`a plot with a boundary point was skipped: ${p.skipped}`);
  else {
    for (const c of p.cables) {
      const hasBoundary = c.geometry.some((q) =>
        Math.hypot(q[0] - 100, q[1] - 25) < 0.01);
      if (!hasBoundary) {
        fail(`a cable runs ${JSON.stringify(c.geometry)} without turning at the boundary`);
      }
      /* And it starts on the main, not at the plot. */
      if (Math.abs(c.geometry[0][1]) > 0.01) {
        fail("a cable does not start where the trench meets the main");
      }
    }
  }

  /* A plot with no boundary point is reported, not guessed at. Falling
     back to the furthest meter made the dig run to somebody's meter
     rather than to their boundary, and every cable followed it. */
  const none = planSeed(
    { Feature_ID: 2, Geometry: [[100, 40]], Attributes: {} },
    MAINS, () => ["electric"], {},
  );
  if (!none.skipped) fail("a plot with no boundary point was serviced anyway");
  if (none.trench) fail("a plot with no boundary point still got a dig");
}

/* Every utility's service runs along its trench.

   Auto Service draws the dig from the main to the boundary and lays the
   pipe or cable in it. The plan is the same for electric, gas and
   water: start where the service trench meets the main, follow it to
   the boundary, then leave it for the meter. */
{
  const p = planSeed(
    { Feature_ID: 1, Geometry: [[100, 40]], Attributes: { Boundary_At: [100, 25] } },
    MAINS, () => ["electric", "gas", "water"], {},
  );
  if (p.skipped) fail(`a plot with a boundary was skipped: ${p.skipped}`);
  else {
    for (const c of p.cables) {
      /* Three points: the tee, the boundary, the meter. Two would mean
         it had gone straight from the main to the meter, which is the
         fault \u2014 the cable is laid in the dig, and the dig turns at the
         boundary. */
      if (c.geometry.length < 3) {
        fail(`the ${c.utility} service runs straight to its meter`);
      }
      /* And it starts on the main, not at the plot. */
      if (Math.abs(c.geometry[0][1]) > 0.01) {
        fail(`the ${c.utility} service does not start at the main`);
      }
      /* Turning at the boundary, wherever the meter ended up. */
      if (!c.geometry.some((q) => Math.hypot(q[0] - 100, q[1] - 25) < 0.01)) {
        fail(`the ${c.utility} service does not turn at the boundary`);
      }
    }
    /* All three follow the same dig. */
    const firsts = new Set(p.cables.map((c) => JSON.stringify(c.geometry[0])));
    if (firsts.size !== 1) fail("the three utilities start in different places");
  }
}

/* Laying one utility's services into trenches already drawn.

   Auto Service draws the dig and lays everything in it. This does the
   second half only, for one utility — because the three are rarely
   designed together, and a water run should not quietly add gas pipe to
   plots nobody has thought about yet. */
{
  const isTrench = (f) => /trench/.test(f.Attributes?.Line_Type ?? "");
  const L = (id, pts, t) => ({
    Feature_ID: id, Feature_Type: "line",
    Attributes: { Line_Type: t }, Geometry: pts,
  });
  const meter = (id, at, layer) => ({
    Feature_ID: id, Feature_Role: "meter", Layer_Key: layer, Geometry: [at],
  });

  /* A service trench that doglegs, with a water meter at its end. */
  const base = [
    L(1, [[0, 0], [200, 0]], "trench_main"),
    L(2, [[60, 0], [60, 8], [70, 8]], "trench_service"),
    meter(3, [70, 9], "water"),
  ];

  const r = layServices(base, "water", { isTrench });
  if (r.error) fail(`laying refused: ${r.error}`);
  else {
    if (r.cables.length !== 1) fail(`${r.cables.length} cables laid, wanted 1`);
    /* Guarded. This indexed straight in after asserting the count, so a
       run that laid nothing threw here instead of failing \u2014 and a
       check that crashes reads as broken tooling rather than as the
       fault it found. */
    const g = r.cables[0]?.geometry ?? [];
    /* It starts at the main, follows the dogleg, and ends at the
       meter. Four points: anything fewer means it cut a corner. */
    if (g.length !== 4) fail(`the run has ${g.length} points, wanted 4`);
    /* Only where there is a run to describe. Reporting "it has 0
       points" and then reading point zero of it is two failures for one
       fault, and the second is a crash. */
    else {
      if (g[0][0] !== 60 || g[0][1] !== 0) fail("the run does not start at the main");
      if (Math.abs(g[g.length - 1][1] - 9) > 0.01) {
        fail("the run does not reach the meter");
      }
    }
  }

  /* Only the utility asked for. A gas meter on the same trench is not
     this run's business. */
  const withGas = [...base, meter(4, [70, 9.2], "gas")];
  const water = layServices(withGas, "water", { isTrench });
  if (water.cables.length !== 1) fail("laying water touched another utility's plot");
  const gas = layServices(withGas, "gas", { isTrench });
  if (gas.cables.length !== 1) fail("gas could not be laid in the same trench");

  /* A trench with no meter of that utility is reported, not guessed
     at. */
  const noMeter = layServices([base[0], base[1]], "water", { isTrench });
  if (noMeter.cables.length) fail("a service was laid to no meter");
  if (!noMeter.skipped.length) fail("a trench with no meter was passed over silently");

  /* And a trench that reaches no main is not laid into: a service has
     to come from somewhere. */
  const adrift = layServices([
    L(1, [[0, 0], [200, 0]], "trench_main"),
    L(2, [[600, 0], [600, 8]], "trench_service"),
    meter(3, [600, 9], "water"),
  ], "water", { isTrench });
  if (adrift.cables.length) fail("a service was laid into a trench meeting no main");

  /* Running it twice lays nothing the second time, because somebody
     will. */
  const laidAlready = [...base, {
    Feature_ID: 9, Feature_Type: "line", Layer_Key: "water",
    Attributes: { Line_Type: "water_service" },
    Geometry: [[60, 0], [60, 8], [70, 8], [70, 9]],
  }];
  const again = layServices(laidAlready, "water", { isTrench });
  if (again.cables.length) fail("running it twice laid the service twice");
}

/* ── Laying a service is not finished until the fitting is on ──

   A service touching its main with nothing marking the connection is a
   take-off schedule short one fitting per plot.

   Which fitting depends on the utility: gas gets a top tee, electric
   gets a service joint. Gas has done this since top tees arrived;
   electric never did, so Auto Lay Services left the joints off and the
   only way to get them was to know that Place Feeder Joints, several
   items down the same menu, would put them in. Nothing said so.

   Read from the source: the canvas is nineteen thousand lines and does
   not mount without a project, a basemap and a drawing. What is
   checkable is that the tail exists, runs for both utilities, and works
   from the drawing as it is after laying. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* Bounded by the next declaration, not by the first `\n  }`.

     Non-greedy to a closing brace stopped inside the `if (utility ===
     "gas")` block, so the body this read was truncated before the
     electric branch \u2014 and the check failed on the fixed code, which
     reads as the fix not working. */
  const at = canvas.indexOf("async function layServicesThenTee");
  const next = canvas.indexOf("\n  async function", at + 1);
  const fn = at < 0 ? null : [canvas.slice(at, next < 0 ? undefined : next)];

  if (!fn) fail("layServicesThenTee is not where this check can read it");
  else {
    const body = fn[0];

    /* Electric is no longer shown the door on the first line. */
    if (/if \(utility !== "gas"\) return;/.test(body)) {
      fail("Auto Lay Services still finishes gas only \u2014 an electric service"
        + " is left with no joint marking where it meets the main");
    }
    /* The word at all, rather than a particular spelling of it: the
       guard admits electric and the branch is an `else`, so
       `utility === "electric"` appears nowhere. Asserting that spelling
       failed on the fixed code, which reads as the fix not working. */
    if (!/electric/.test(body)) {
      fail("nothing happens after an electric service is laid");
    }

    /* Each utility gets its own fitting. A top tee on an electric
       service would be worse than none. */
    if (!/placeFeederJoints\(/.test(body)) fail("no service joint is placed");
    if (!/placeTopTees\(/.test(body)) fail("the gas top tee was lost");

    /* Both work from the drawing as it is after laying. The tee
       vertices the lay adds are what each routine looks for, and a
       model built from what the canvas held before would find the same
       nodes missing that the lay has just fixed. */
    if (!/const after = \(await listGis\(projectId\)\)\.features/.test(body)) {
      fail("the fitting is planned from the drawing as it was before laying");
    }
    /* Each call named, not "srcFeatures appears somewhere". The loose
       form matched the gas call and passed while the electric one
       planned from the stale drawing \u2014 which is the exact fault this
       whole section is about, one utility along. */
    for (const [what, re] of [
      ["the service joint", /placeFeederJoints\(\{[^}]*srcFeatures: after/],
      ["the gas top tee", /placeTopTees\(\{[^}]*srcFeatures: after/],
    ]) {
      if (!re.test(body)) {
        fail(`${what} is planned from the drawing as it was before laying,`
          + " so the tee vertices the lay just added are not there");
      }
    }

    /* Silent about success: this is the tail of somebody's Auto Lay
       Services, not a run of its own, and a second count they did not
       ask for reads as something having gone wrong. */
    if (!/silent: true/.test(body)) {
      fail("the tail reports a count nobody asked for");
    }

    /* ── But not silent about a refusal ──

       A service joint is planned from the feeder model, which is built
       from the circuits and the routed feeders. Lay services before
       Link to Circuit and Build LV Network and there is nothing to hang
       one on, so placeFeederJoints refuses \u2014 and `silent` suppressed
       the reason along with the chatter, leaving Auto Lay Services
       finishing with no joints and nothing said. Which is
       indistinguishable from the fault this tail was added to fix.

       Silence is right for "nothing needed". It is wrong for
       "cannot yet". */
    if (!/const placed = await placeFeederJoints\(/.test(body)) {
      fail("the tail throws away whether any joint was placed");
    }
    if (!/if \(!placed\)/.test(body)) {
      fail("a refusal to place joints is swallowed \u2014 the run ends with no"
        + " joints and nothing said, which is the fault it was added to fix");
    }
    /* And the reason names the step that is missing, rather than
       reporting that something did not happen. */
    if (!/Build LV Network/.test(body)) {
      fail("the message does not name what has to be run first");
    }

    /* And the canvas is told. Both routines write features, so without
       a reload the joints are in the database and not on screen \u2014
       which reads exactly like them not having been placed, which is
       the report this fixes. */
    if (!/setFeatures\(/.test(body)) {
      fail("the joints are written but the drawing is not re-read, so they"
        + " do not appear until something else reloads");
    }
  }

  /* placeFeederJoints has to be declared before the tail calls it. A
     const read before its declaration blanks the page, and this file
     has done it three times \u2014 fault 2. A function declaration hoists,
     so what matters is that it stays one. */
  if (!/async function placeFeederJoints\(/.test(canvas)) {
    fail("placeFeederJoints is no longer a hoisted function declaration");
  }
}

/* ── A service is laid to its own plot's meter ──

   The number is on both already: a plot seed is placed by its number,
   the boundary point goes down with it, the meter inherits it, and
   layServices stamps it on the trench. So which meter belongs to which
   service is recorded, not measured.

   Nearest alone was wrong on any estate where plots sit close \u2014 the
   meter nearest the end of plot 34's trench is often plot 35's, and the
   service was laid to the neighbour's box. It looks right on the
   drawing.

   This is the second place the same fault lived: buildGraph attached
   meters to the nearest line, and this laid cable to the nearest meter.
   Fixing one left the other. */
{
  const isTrench = (f) => f.Layer_Key === "trench";
  const main = {
    Feature_ID: 99, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [100, 0]], Attributes: { Line_Type: "trench" },
  };
  const svc = (id, geom, plot) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Geometry: geom, Plot_ID: plot, Attributes: { Line_Type: "service_trench" },
  });
  const meter = (id, at, plot) => ({
    Feature_ID: id, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [at], Plot_ID: plot, Attributes: {},
  });

  /* Plot 35's meter is nearer the end of plot 34's trench than plot
     34's own is. */
  const crowded = layServices(
    [main, svc(1, [[10, 0], [10, 14]], 34), meter(2, [10.5, 14], 35),
      meter(3, [13, 14], 34)],
    "electric", { isTrench });
  if (crowded.cables.length !== 1) {
    fail(`${crowded.cables.length} cables laid where one plot needs one`);
  }
  if (crowded.cables[0]?.meter?.Feature_ID !== 3) {
    fail(`plot 34's service was laid to meter `
      + `${crowded.cables[0]?.meter?.Feature_ID} \u2014 the neighbour's box is`
      + " nearer, and nearness is not what decides");
  }

  /* ── And the reach is 30 m ──

     Twelve was doing two jobs: judging whether a meter is plausibly at
     the end of this trench, and stopping the search grabbing the
     neighbour's. The plot number does the second properly, so this is
     left to do only the first \u2014 and a long garden stops being a reason
     a service cannot be laid. Four trenches on one drawing were refused
     at 13.7, 14.1, 14.2 and 14.3 m. */
  const far = layServices(
    [main, svc(1, [[20, 0], [20, 13.7]], 34), meter(3, [20, 27.4], 34)],
    "electric", { isTrench });
  if (far.cables.length !== 1) {
    fail(`a meter 13.7 m past the end of its trench was refused: `
      + `${far.skipped[0]?.why}`);
  }

  /* Not unlimited. A meter on the far side of the site is still a
     missing meter, however the numbers match. */
  const absurd = layServices(
    [main, svc(1, [[40, 0], [40, 5]], 34), meter(3, [40, 90], 34)],
    "electric", { isTrench });
  if (absurd.cables.length) {
    fail("a meter 85 m past the end of its trench was served");
  }
  /* And the refusal names that plot's own meter, not whichever is
     nearest \u2014 the nearest belongs to somebody else and reads as an
     answer when it is not. */
  if (absurd.skipped[0] && !/plot 34/.test(absurd.skipped[0].why)) {
    fail(`the refusal does not say whose meter it looked for:`
      + ` "${absurd.skipped[0].why}"`);
  }

  /* A trench with no number still works on nearest, or every drawing
     made before this would stop laying. */
  const unnumbered = layServices(
    [main, svc(1, [[60, 0], [60, 8]], null), meter(3, [60, 10], 34)],
    "electric", { isTrench });
  if (unnumbered.cables.length !== 1) {
    fail("a trench carrying no plot number no longer lays to the nearest meter");
  }
}

/* ── Laying a service places the joint that connects it ──

   A service teed into a main is jointed to it. The tee vertex attaches
   the two on the drawing; the joint is the fitting that does it on the
   ground, and it is a line on the take-off and a task for a gang.

   It was left to Place Feeder Joints, which plans from the feeder model
   — so it needed circuits linked and the LV network built first, and a
   service laid before either had a cable running to a main with nothing
   marking where they met. Laying the cable is the moment the joint
   exists; nothing else has to have happened first. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("── And the joint that makes the connection ──");
  const body = at < 0 ? "" : canvas.slice(at, at + 2600);

  if (!body) fail("laying a service places no joint where it meets the main");
  else {
    if (!/Joint_Type: "service"/.test(body)) {
      fail("the fitting placed with a service is not a service joint");
    }
    /* At the cable's start, which is where it leaves the main \u2014 not at
       the meter end. */
    if (!/const start = \(f\.Geometry \|\| \[\]\)\[0\]/.test(body)) {
      fail("the joint is not placed where the service leaves the main");
    }

    /* Not where one is already there. A drawing where the joint was
       placed by hand, or by an earlier run, keeps the one it has \u2014
       re-laying must not leave two fittings at one point. */
    if (!/if \(near\) continue;/.test(body)) {
      fail("a second run places another joint beside the one already there");
    }
    /* And each one placed counts towards that test, or a run laying two
       services to one point would place two joints in the same instant
       the check said none was there. */
    if (!/already\.push\(/.test(body)) {
      fail("a joint placed by this run is not seen by the rest of it");
    }

    /* Electric only. A gas service gets a top tee and a water one a
       ferrule, both placed by their own routines. */
    if (!/utility === "electric"/.test(body)) {
      fail("a joint is placed for every utility \u2014 gas takes a top tee");
    }

    /* Said out loud. Zero where they were all already there is a
       different answer from none having been placed, and the two are
       indistinguishable on the drawing. */
    if (!/service joint\(s\) placed/.test(canvas)) {
      fail("the run does not say how many joints it placed");
    }
  }
}

/* ── Dragging a service joint stretches the feeder it joins ──

   A service joint sits on the tee the service was let into, which is a
   vertex in the MIDDLE of the main, not an end. The rubber band caught
   line ends only \u2014 so nudging the joint moved the service cable and
   left the feeder where it was, and the fitting no longer sat on the
   cable it joins.

   Read from the source: the rule runs inside a pointer handler in a
   nineteen-thousand-line component and cannot be called from here. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("── Which vertices follow the point ──");
  const body = at < 0 ? "" : canvas.slice(at, at + 1600);

  if (!body) fail("nothing decides which vertices follow a dragged point");
  else {
    /* Interior vertices, for a joint on a feeder. */
    if (!/const isJoint = pt\.Feature_Role === "joint"/.test(body)) {
      fail("a dragged joint is treated like any other point, so the feeder"
        + " it sits on does not follow it");
    }
    if (!/g\.map\(\(_, i\) => i\)/.test(body)) {
      fail("only the ends of a line follow a joint \u2014 a service joint sits"
        + " on a vertex in the middle of the main");
    }
    /* And only for a feeder. Every line through the point would mean
       dragging a joint pulled the trench under it out of shape, which
       is the fault span nodes were excluded from this for. */
    if (!/const isFeeder = line\.Layer_Key === "electric"/.test(body)) {
      fail("any line under a joint follows it, including the trench");
    }
    /* Everything else keeps the old rule. */
    if (!/: \[0, g\.length - 1\]/.test(body)) {
      fail("a point that is not a joint no longer catches line ends");
    }
  }

  /* The stretch itself: the caught vertices move and the rest stay, so
     the run bends rather than sliding along. */
  if (!/ends\.includes\(i\) \? \[pnt\[0\] \+ dm\[0\], pnt\[1\] \+ dm\[1\]\] : pnt/
    .test(canvas)) {
    fail("a line caught by a moved point slides whole instead of stretching");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Auto Service behaves (the cable follows the dig it is laid in).");
process.exit(bad ? 1 : 0);
