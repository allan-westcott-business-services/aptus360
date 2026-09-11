/* Build LV Network refuses a drawing it cannot build from.

   Two things it cannot invent, and neither of which it used to mention:

   A meter with no `Circuit_ID` belongs to no circuit, so no walk reaches
   it and no cable is run toward it. A meter with no service trench has
   nothing for its tail to run along.

   The build said nothing about either — the plot was simply not there
   as far as it was concerned. That is how "why is there no cable
   between node 2 and node 5" came to be a question: three plots past
   node 5 had no circuit, and the trench joining them was fine. */
import { readFileSync } from "node:fs";
import { buildBlockers, plotsOnBoards, plotsAsSeeds } from "./src/features/gis/msdb.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-build-blockers.json", "utf8"));
const f = raw.features;

// 1. The rule, on features built here.
//
//    Written out rather than read off a drawing: a fixture is refreshed
//    from whatever somebody was working on, and its plot numbers change
//    with it. Asserting "49, 50, 51 and 57" pins the check to one
//    afternoon \u2014 the next refresh fails it for no fault, and whoever
//    edits the numbers to make it pass has quietly stopped testing
//    anything.
{
  const meter = (id, plot, attrs) => ({ Feature_ID: id, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: plot, Geometry: [[plot * 10, 0]],
    Attributes: attrs });
  const service = (atX, attrs = {}) => ({ Feature_ID: 900 + atX,
    Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_service", ...attrs },
    Geometry: [[atX, 0], [atX, 6]] });

  /* One of each: on a circuit and served, on no circuit, and served by
     a trench that names no seed. */
  const world = [
    meter(1, 1, { Circuit_ID: 2, Seed_Feature_ID: 71 }),
    meter(2, 2, { Seed_Feature_ID: 72 }),
    meter(3, 3, { Circuit_ID: 2 }),
    { ...service(10), Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 71 } },
    { ...service(20), Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 72 } },
    service(30),
  ];
  const r = buildBlockers(world);

  if (r.noCircuit.map((x) => Number(x.plot)).join() !== "2") {
    fail(`a meter with no Circuit_ID is not reported: got `
      + `${r.noCircuit.map((x) => x.plot)}`);
  }
  if (r.noService.length) {
    fail(`${r.noService.length} plot(s) reported unserved where each has a `
      + "service trench, one by stamp and one by position");
  }

  /* ── A stamp that pairs with nothing is not evidence of absence ──

     A meter stamped by one pass and a trench drawn by hand, or by an
     older pass, or re-dug after the meter moved, leaves a stamp that
     matches nothing while a service trench runs to the plot in plain
     sight. Reading that as "no trench" flagged four plots whose
     trenches were on the drawing. */
  const mismatched = buildBlockers([
    meter(9, 9, { Circuit_ID: 2, Seed_Feature_ID: 999 }),
    { ...service(90), Attributes: { Line_Type: "trench_service" } },
  ]);
  if (mismatched.noService.length) {
    fail("a meter whose seed stamp matches no trench is reported unserved "
      + "even with a service trench beside it");
  }

  /* ── And near enough to be the plot's own ──

     A service trench commonly stops at the plot boundary with the meter
     several metres inside. A tight radius condemns plots whose trench
     is plainly there; the two ways of being wrong are not equal. */
  const away = (d) => buildBlockers([
    { Feature_ID: 40, Feature_Role: "meter", Layer_Key: "electric", Plot_ID: 40,
      Geometry: [[0, d]], Attributes: { Circuit_ID: 2 } },
    { Feature_ID: 41, Feature_Type: "line", Layer_Key: "trench",
      Attributes: { Line_Type: "trench_service" }, Geometry: [[-5, 0], [5, 0]] },
  ]);
  if (away(5).noService.length) {
    fail("a meter five metres from its service trench is reported unserved, "
      + "which is how a plot inside its own boundary looks");
  }
  /* But not so generous that another plot's trench counts. */
  if (!away(25).noService.length) {
    fail("a meter twenty-five metres from the nearest service trench is "
      + "counted as served, so the check would pass a plot with none");
  }

  /* Take the trench away and the plot is reported. */
  const bare = buildBlockers(world.filter((x) => x.Feature_ID !== 930));
  if (!bare.noService.some((x) => Number(x.plot) === 3)) {
    fail("a plot whose service trench is gone is not reported");
  }
  if (bare.ok) fail("a drawing with something to fix reports ok");
}

// 2. A flat on a board is not asked for a service trench.
//
//    A flat is fed from its board's tails, recorded in the board's own
//    table and never drawn as a trench. Asking for one would be asking
//    somebody to draw a thing that does not exist.
{
  const flat = { Feature_ID: 11, Feature_Role: "meter", Layer_Key: "electric",
    Plot_ID: 56, Geometry: [[500, 0]], Attributes: { Circuit_ID: 2 } };
  const board = { Feature_ID: 12, Feature_Role: "msdb", Layer_Key: "electric",
    Geometry: [[500, 0]], Attributes: { Circuit_ID: 2, MSDB_Plot_IDs: [56] } };
  const r = buildBlockers([flat, board]);
  if (r.noService.length) {
    fail("a flat on a board was asked for a service trench of its own");
  }
  /* And without the board it IS asked, so the exemption is the board
     and not something else. */
  const alone = buildBlockers([flat]);
  if (!alone.noService.length) {
    fail("the exemption is not the board: a plot with no board and no service "
      + "trench goes unreported");
  }
}

// 2b. And it holds on a real drawing, without naming its plots.
//
//     The fixture proves the rule survives contact with a real network;
//     what it must NOT do is pin the check to that network's numbering.
{
  const r = buildBlockers(f);
  const onBoards = new Set();
  for (const b of f) {
    if (b.Feature_Role !== "msdb") continue;
    for (const id of b.Attributes?.MSDB_Plot_IDs || []) onBoards.add(Number(id));
  }
  if (!onBoards.size) fail("the fixture has no board, so this case is untested");
  if (r.noService.some((x) => onBoards.has(Number(x.plot)))) {
    fail("a flat on a board was asked for a service trench on the fixture");
  }
  /* Every meter it reports as circuitless really has no circuit. */
  for (const x of r.noCircuit) {
    const m = f.find((y) => Number(y.Feature_ID) === Number(x.id));
    if (m?.Attributes?.Circuit_ID != null) {
      fail(`plot ${x.plot} was reported as having no circuit and has one`);
    }
  }
  /* And every meter that has none is reported. */
  const missed = f.filter((m) => m.Feature_Role === "meter"
    && m.Layer_Key === "electric" && m.Attributes?.Circuit_ID == null
    && (m.Plot_ID ?? null) != null
    && !r.noCircuit.some((x) => Number(x.id) === Number(m.Feature_ID)));
  if (missed.length) {
    fail(`${missed.length} meter(s) with no circuit were not reported`);
  }
  if (r.ok) fail("the fixture has plots to fix and reports none");
}

// 3. The stamp where there is one, the ground where there is not.
//
//    A trench dug by Auto Lay Service names the seed it was dug for,
//    which is exact. A trench somebody DREW carries no stamp, and
//    neither does a meter placed some other way — on this drawing not
//    one meter had a `Seed_Feature_ID`. A rule built on the stamp alone
//    flagged every plot on the site, including ten with a service
//    trench plainly running to them.
{
  const src = readFileSync("./src/features/gis/msdb.js", "utf8");
  /* The stamp proves a plot served and cannot prove it unserved: a
     mismatch says nothing, so anything the stamp does not settle falls
     to the ground. Written as an OR for that reason \u2014 the earlier
     ternary consulted the ground only where there was no stamp at all,
     and condemned every meter whose stamp paired with nothing. */
  if (!/const served = \(seed != null && servedSeeds\.has\(Number\(seed\)\)\)\s*\n?\s*\|\| nearAService/
    .test(src)) {
    fail("a seed stamp that matches no trench is treated as proof there is "
      + "none, so plots with a trench beside them are flagged");
  }
  /* A blocker that cries wolf is the one everybody learns to click
     past: on this drawing the stamp-only rule would have flagged ten. */
  const stamped = f.filter((m) => m.Feature_Role === "meter"
    && m.Attributes?.Seed_Feature_ID != null).length;
  if (stamped) {
    fail("the fixture now has seed stamps, so it no longer exercises the "
      + "fallback this was written for");
  }
}

// 4. The build refuses rather than warns.
//
//    A build that runs on a drawing that is not ready produces a
//    network somebody then has to un-believe, and the drawing looks
//    finished either way.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const blockers = buildBlockers\(features, \{/.test(canvas)) {
    fail("the build does not check before it runs");
  }
  if (!/if \(!blockers\.ok && !opts\.anyway\) \{/.test(canvas)) {
    fail("the build carries on regardless of what the check found");
  }
  /* Named, not counted: "4 plots not on a circuit" sends somebody
     hunting; "57, 49, 50, 51" sends them to the plots.

     By what it does rather than by its exact text: pinning the line
     verbatim failed the day a `.filter(Boolean)` was added to it, which
     is the assertion testing the spelling instead of the rule. */
  if (!/const say = \(list\) => list\.map\(\(x\) => x\.label\)/.test(canvas)) {
    fail("the message counts the plots without naming them");
  }
}

// 5. A plot number belongs to a seed or to a flat, never both.
//
//    A seed is a plot on the ground with its own service; a flat is fed
//    from a board's tails. Allocated twice, the load is counted twice —
//    once at the seed and once on the board — and the two are metres
//    apart on the drawing.
//
//    One function answers it, so the MSDB editor and Place Plots cannot
//    disagree about who owns what.
{
  const board = (id, plots) => ({ Feature_ID: id, Feature_Role: "msdb",
    Layer_Key: "electric", Geometry: [[0, 0]],
    Attributes: { MSDB_Plot_IDs: plots } });
  const seed = (id, plot) => ({ Feature_ID: id, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: plot, Geometry: [[plot, 0]],
    Attributes: { Circuit_ID: 1 } });

  const world = [board(1, [10, 11]), board(2, [12]), seed(20, 30)];

  const onBoards = plotsOnBoards(world);
  if (![10, 11, 12].every((p) => onBoards.has(p))) {
    fail("a plot on a board is not reported as spoken for");
  }
  if (onBoards.has(30)) fail("a seed's plot was reported as being on a board");

  /* The board being EDITED is excluded, or opening its editor would
     empty its own table. */
  const others = plotsOnBoards(world, { except: 1 });
  if (others.has(10) || others.has(11)) {
    fail("the board being edited hides its own flats from itself");
  }
  if (!others.has(12)) fail("another board's flats are not excluded");

  const seeds = plotsAsSeeds(world);
  if (!seeds.has(30)) fail("a plot placed as a seed is not reported");

  /* And both screens ask the one function. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/const taken = plotsAsSeeds\(allFeatures\);/.test(editor)) {
    fail("the MSDB editor still offers plots already placed as a seed");
  }
  if (!/mine\.has\(Number\(p\.plot_id\)\)/.test(editor)) {
    fail("the board's own flats are filtered out of its own table");
  }
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/plotsOnBoards\(features\)\.has\(Number\(p\.plot_id\)\)/.test(canvas)) {
    fail("Place Plots still offers plots already on an MSDB");
  }
}

/* ── A non-residential supply is not a plot ──

   Reported from a real drawing: two EV charge points drawn ON the
   mains route, both attached by the model with nothing skipped, and
   the build refused with

     "2 plots with no service trench: , ."

   Two faults in one line. A supply has no Plot_ID, so `plotLabel(null)`
   named nothing and the list came out as two commas; and it was
   calling supplies plots while doing it. */
{
  const supply = (id, nrs, at) => ({ Feature_ID: id, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: null, Label: `Electric Meter ${nrs}`,
    Geometry: [at], Attributes: { NRS_ID: id, Circuit_ID: 2 } });
  const seed = (id, nrs, at) => ({ Feature_ID: 500 + id, Feature_Role: "nrs",
    Layer_Key: "plot", Label: nrs, Geometry: [at], Attributes: { NRS_ID: id } });
  const mains = { Feature_ID: 800, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main" }, Geometry: [[0, 0], [200, 0]] };

  /* Standing in the mains dig: the cable tees where it already runs,
     so there is no service trench to want and nothing to refuse. */
  const on = buildBlockers([supply(12, "EVC 1", [140, 0.1]),
    seed(12, "EVC 1", [140, 0]), mains]);
  if (on.noService.length) {
    fail("a supply standing in the mains trench is refused a build the "
      + "model attaches it from \u2014 the blocker crying wolf");
  }

  /* Off in a field with no trench at all: still refused, and now it
     says which supply and calls it a supply. */
  const off = buildBlockers([supply(26, "EVC 2", [140, 400]),
    seed(26, "EVC 2", [140, 400.2]), mains]);
  if (off.noService.length !== 1) {
    fail("a supply nowhere near any trench is not reported");
  } else {
    const x = off.noService[0];
    if (x.label !== "EVC 2") {
      fail(`the supply is reported as ${JSON.stringify(x.label)} rather than `
        + "its own name \u2014 which is how the message came out as \", .\"");
    }
    if (!x.isSupply) {
      fail("the supply is not marked as one, so the message calls it a plot");
    }
  }

  /* Named from the meter where the drawing carries no seed, and the
     "Electric Meter " it is built from is not repeated in a list of
     meters. */
  const noSeed = buildBlockers([supply(26, "EVC 2", [140, 400]), mains]);
  if (noSeed.noService[0]?.label !== "EVC 2") {
    fail(`without a seed the supply is named ${JSON.stringify(noSeed.noService[0]?.label)}`);
  }

  /* An ordinary plot beside the mains trench still wants its own
     service: two metres is standing IN the dig, not near it. */
  const plotBeside = buildBlockers([
    { Feature_ID: 7, Feature_Role: "meter", Layer_Key: "electric", Plot_ID: 7,
      Geometry: [[100, 6]], Attributes: { Circuit_ID: 2 } },
    mains,
  ]);
  if (!plotBeside.noService.length) {
    fail("a plot six metres off the mains trench is let through, so the "
      + "blocker no longer catches the omission it exists for");
  }
}

/* ── A self-lay plot blocks nothing ──

   It is fed from the incumbent's network: not on one of our circuits,
   and not dug to by us past their tee. Counted as missing either, it
   refuses a build that is ready \u2014 and no amount of work can make it
   pass, because there is nothing to link it to. */
{
  const slpMeter = { Feature_ID: 900, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: 44, Geometry: [[10, 400]],
    Attributes: {} };
  const ours = { Feature_ID: 901, Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: 45, Geometry: [[12, 0]],
    Attributes: { Circuit_ID: 1 } };
  const dig = { Feature_ID: 902, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 903 },
    Geometry: [[12, 0], [12, 4]] };
  const world = [slpMeter, ours, dig];
  const isSelfLay = (m) => Number(m.Plot_ID) === 44;

  const told = buildBlockers(world, { isSelfLay });
  if (told.noCircuit.length) {
    fail("a self-lay plot is reported as missing a circuit it can never have");
  }
  if (told.noService.length) {
    fail("a self-lay plot is reported as missing a service trench of ours");
  }

  /* Untold, it behaves exactly as before \u2014 the default must not
     change what any existing caller sees. */
  const untold = buildBlockers(world);
  if (!untold.noCircuit.length) {
    fail("the default now skips meters that should still be counted");
  }

  /* And an ordinary plot off a circuit is still caught. */
  const both = buildBlockers([...world,
    { Feature_ID: 904, Feature_Role: "meter", Layer_Key: "electric",
      Plot_ID: 46, Geometry: [[14, 0]], Attributes: {} }], { isSelfLay });
  if (both.noCircuit.length !== 1) {
    fail(`the self-lay exemption is catching ordinary plots too: `
      + `${both.noCircuit.length} reported where 1 was expected`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The build refuses a drawing it cannot build from (and names the plots and supplies).");
process.exit(bad ? 1 : 0);
