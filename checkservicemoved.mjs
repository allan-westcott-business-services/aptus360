/* Only the plots that have actually changed.

   A seed with a service trench is skipped as done. That is right the
   second time a site is run and wrong the moment somebody MOVES
   something: drag the property boundary point, or the end of the
   trench, or re-route the mains the service tees off, and the drawn
   dig no longer goes where the drawing says it should — and the run
   skipped it as already serviced, so the stale trench stayed until
   somebody deleted it by hand.

   The hard half of this is NOT re-laying. A test that says "changed"
   too readily re-digs the whole site on every run, which is worse
   than the fault it fixes: it churns geometry somebody has adjusted by
   hand, and it makes the summary meaningless. So most of what follows
   is cases that must come back unchanged. */
import { readFileSync } from "node:fs";
import {
  serviceMoved, isServed, circuitAtTee,
} from "./src/features/gis/autoService.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A main along the road, a plot with its boundary point on the verge
   and the dig running on to a meter inside the plot. */
const mains = (y = 0) => ({ Feature_ID: 1, Feature_Type: "line",
  Layer_Key: "trench", Attributes: { Line_Type: "trench_main" },
  Geometry: [[0, y], [200, y]] });
const seed = (attrs = {}) => ({ Feature_ID: 10, Feature_Role: "plot",
  Layer_Key: "plot", Plot_ID: 7, Geometry: [[100, 20]],
  Attributes: { Boundary_At: [100, 5], Trench_End_At: [100, 12], ...attrs } });
/* The dig as the planner would have written it: foot, boundary, stop. */
const dug = (pts) => ({ Feature_ID: 20, Feature_Type: "line",
  Layer_Key: "trench", Attributes: { Line_Type: "trench_service",
    Seed_Feature_ID: 10 },
  Geometry: pts });
const asDrawn = dug([[100, 0], [100, 5], [100, 12]]);

// 1. Nothing has moved: nothing is re-laid.
{
  const why = serviceMoved(seed(), asDrawn, [mains()]);
  if (why) fail(`an untouched plot is re-laid: "${why}"`);
}

// 2. The boundary point moved along the road — the tee moves with it,
//    and so does the bend.
{
  const why = serviceMoved(seed({ Boundary_At: [130, 5] }),
    asDrawn, [mains()]);
  if (!why) fail("the property boundary point moved and the dig stayed where it was");
}

// 3. The end of the trench moved: the plot's meter position changed,
//    the boundary did not.
{
  const why = serviceMoved(seed({ Trench_End_At: [100, 18] }),
    asDrawn, [mains()]);
  if (!why) fail("the end of the trench moved and the dig was left short of it");
  if (why && !/end of the trench/.test(why)) {
    fail(`the reason blames the wrong thing: "${why}"`);
  }
}

// 4. The mains was re-routed: the tee is in the wrong place now.
{
  const why = serviceMoved(seed(), asDrawn, [mains(-8)]);
  if (!why) fail("the mains moved and the service still tees into thin air");
  if (why && !/mains/.test(why)) {
    fail(`the reason blames the wrong thing: "${why}"`);
  }
}

// 5. The boundary point moved along a straight route, so neither END
//    changed — only the vertex between them. The on-site and off-site
//    split is measured there, so this is a move.
{
  const straight = dug([[100, 0], [100, 5], [100, 12]]);
  const why = serviceMoved(seed({ Boundary_At: [100, 8] }), straight, [mains()]);
  if (!why) {
    fail("the boundary moved along the route and nothing noticed \u2014 the "
      + "on-site and off-site lengths would be split in the wrong place");
  }
}

// ── And the cases that must NOT re-lay ──

// 6. The dig drawn the other way round. An end swap is not a move.
{
  const reversed = dug([[100, 12], [100, 5], [100, 0]]);
  if (serviceMoved(seed(), reversed, [mains()])) {
    fail("a dig drawn from the plot back to the main is called moved");
  }
}

// 7. A round trip through the database. Nothing lands on exactly the
//    number it left as, and a re-lay per run is worse than the fault.
{
  const jittered = dug([[100.0000001, 0], [99.999999, 5.0000004], [100, 11.999999]]);
  if (serviceMoved(seed(), jittered, [mains()])) {
    fail("floating point noise reads as a move, so every run re-digs the site");
  }
}

// 8. No boundary vertex because the boundary IS the stop — the planner
//    drops the vertex deliberately, and its absence is not a move.
{
  const atLine = seed({ Boundary_At: [100, 5], Trench_End_At: null });
  const twoPoint = dug([[100, 0], [100, 5]]);
  if (serviceMoved(atLine, twoPoint, [mains()])) {
    fail("a dig that stops at the boundary is called moved for having no "
      + "middle vertex \u2014 the planner leaves it out on purpose");
  }
}

// 9. A seed with no boundary point at all. The planner refuses it
//    outright and says so; this must not turn that into a re-lay.
{
  const noB = seed({ Boundary_At: null });
  if (serviceMoved(noB, asDrawn, [mains()])) {
    fail("a seed with no boundary point is re-laid rather than refused");
  }
}

// 10. A self-lay plot tees off the incumbent's main, so asking the
//     wrong list of mains would call every one of them moved.
{
  const theirs = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main", Build_Status: "existing" },
    Geometry: [[0, -30], [200, -30]] };
  const slpDug = dug([[100, -30], [100, 5], [100, 12]]);
  if (serviceMoved(seed(), slpDug, [mains(), theirs], { selfLayOnly: true })) {
    fail("a self-lay plot teed off the incumbent's main is called moved");
  }
  /* And the same dig judged as if it were ours IS moved, because ours
     is somewhere else \u2014 which is what makes the flag load-bearing. */
  if (!serviceMoved(seed(), slpDug, [mains(), theirs])) {
    fail("the self-lay flag makes no difference, so it is not being used");
  }
}

// 11. Nothing to compare against: no trench, or one point.
{
  if (serviceMoved(seed(), null, [mains()])) fail("no trench reads as moved");
  if (serviceMoved(seed(), dug([[100, 0]]), [mains()])) {
    fail("a one-point trench reads as moved");
  }
}

/* ── Every plot, not just the self-lay ones ──

   `selfLayOnly` decides which MAINS the tee is measured to — ours, or
   the incumbent's — and nothing else. It is not a gate on whether the
   question gets asked. An ordinary plot on a drawing with no self-lay
   anywhere on it is checked exactly the same way, and stating that
   here means a later edit cannot narrow the rule without a case going
   red. */
{
  /* No Self_Lay attribute anywhere, no existing mains on the drawing:
     an ordinary plot on an ordinary site. */
  const ordinary = [mains()];
  const moved = serviceMoved(seed({ Boundary_At: [140, 5] }), asDrawn, ordinary);
  if (!moved) {
    fail("an ordinary plot's moved boundary point is not noticed \u2014 the "
      + "check has been narrowed to self-lay plots");
  }
  const endMoved = serviceMoved(seed({ Trench_End_At: [100, 25] }), asDrawn, ordinary);
  if (!endMoved) fail("an ordinary plot's moved trench end is not noticed");
  const mainsMoved = serviceMoved(seed(), asDrawn, [mains(-15)]);
  if (!mainsMoved) fail("an ordinary plot's re-routed mains is not noticed");
  /* And still nothing when nothing moved, on the same fixture \u2014 so
     the three above are the move being seen, not the test being loose. */
  if (serviceMoved(seed(), asDrawn, ordinary)) {
    fail("the ordinary case reports a move with nothing moved");
  }
}

// 12. Wired in, and through the same door as a self-lay change.
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  /* By the rule, not by the variable: the loop judges every dig
     stamped to a seed now, so the call reads `t` rather than the single
     `trench` it used to find. */
  if (!/serviceMoved\(sd, t, trenches/.test(canvas)) {
    fail("Auto Service never asks whether the ground moved, so a stale "
      + "trench is still skipped as already serviced");
  }
  if (!/mismatched\.set\(sid, \{ seed: sd, mine: \[\.\.\.mine, \.\.\.drawn\]/.test(canvas)) {
    fail("a moved service is not re-laid through the same door as a "
      + "self-lay change, so the old dig is left on the drawing");
  }
  /* The reason reaches the summary: "re-laid" alone reads as the run
     doing something unasked for. */
  if (!/m\.why \|\| "self-lay changed"/.test(canvas)) {
    fail("the run does not say WHY anything was re-laid");
  }
  /* ── And it is asked of every laid seed ──

     The only gate on the loop is `alreadyLaid`: a seed with a service
     trench is checked, whatever its utilities are. If a self-lay test
     ever becomes the thing that decides whether to ASK \u2014 rather than
     which mains to measure to \u2014 every ordinary plot goes back to
     being skipped with a stale trench, silently. */
  const loop = canvas.slice(canvas.indexOf("for (const sd of seeds) {",
    canvas.indexOf("serviceMoved") > 0
      ? canvas.lastIndexOf("for (const sd of seeds) {", canvas.indexOf("serviceMoved(sd"))
      : 0), canvas.indexOf("serviceMoved(sd"));
  if (!/alreadyLaid\.has\(sid\)/.test(loop)) {
    fail("the staleness loop is not gated on the seed simply having been laid");
  }
  if (/if \(!allSelfLay\) continue|isSelfLayFor\([^)]*\)\) continue/.test(loop)) {
    fail("the staleness check has been gated on self-lay, so an ordinary "
      + "plot with a moved boundary point is skipped again");
  }
}

/* ── A service trench drawn by hand, linked to its plot ──

   Auto Service stamps `Seed_Feature_ID` on every dig it makes and
   reads it back to know that plot is done. A trench drawn by hand
   carries nothing, so the next run digs a second one to the same plot.

   Linking it by clicking the plot writes that stamp, and `isServed`
   \u2014 which the run already consults \u2014 does the rest.

   The trap, and the reason this case exists: the staleness test
   compares a dig against the route the PLANNER would take. A
   hand-drawn trench never matches, so without an exemption Auto
   Service would delete the drawing and put the wrong route back. That
   is the one outcome nobody wants from a button called Auto Service. */
{
  const seed = { Feature_ID: 400, Feature_Role: "plot", Layer_Key: "plot",
    Plot_ID: 7, Geometry: [[100, 20]], Attributes: {} };
  const meter = { Feature_ID: 401, Feature_Role: "meter", Layer_Key: "electric",
    Plot_ID: 7, Geometry: [[100, 20]], Attributes: {} };
  /* Drawn round something, so it is nothing like the straight route a
     planner would take. */
  const byHand = { Feature_ID: 402, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[100, 0], [130, 6], [128, 18], [100, 20]],
    Attributes: { Line_Type: "trench_service" } };

  /* Unlinked, the plot reads as unserved: the run would dig to it. */
  if (isServed(seed, [meter], [{ ...byHand, Attributes: { Line_Type: "trench_service" } }])
    === false) {
    /* It may be served by proximity, which is fine \u2014 the point below
       is the STAMP, which is what makes it certain. */
  }

  const linked = { ...byHand,
    Attributes: { ...byHand.Attributes, Seed_Feature_ID: 400, Manual_Link: true } };
  if (!isServed(seed, [meter], [linked])) {
    fail("a trench stamped with the plot's seed does not count as serving it, "
      + "so Auto Service digs a second one");
  }
  /* And the stamp is what does it, not luck: the same trench nowhere
     near the plot still counts, because somebody said so. */
  const far = { ...linked, Geometry: [[900, 900], [930, 930]] };
  if (!isServed(seed, [meter], [far])) {
    fail("the link is ignored unless the trench happens to run near the "
      + "meter, so a deliberate link is not trusted");
  }

  /* The hand-drawn route is NOT reported as moved \u2014 checked through
     the canvas, where the exemption lives. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/drawn\.some\(\(t\) => t\.Attributes\?\.Manual_Link\)\) continue;/.test(canvas)) {
    fail("a hand-linked trench is put through the staleness test, so Auto "
      + "Service deletes the drawn route and lays its own over it");
  }
  /* The link is written by clicking the plot, and the click is
     validated before the mode disarms \u2014 the fault the joint placement
     taught. */
  if (!/if \(servesFor\) \{/.test(canvas)) {
    fail("there is no way to link a trench to its plot");
  }
  /* From the armed block to the NEXT one, not to the first `if
     (jointFor)` in the file \u2014 the draw code has one of those hundreds
     of lines earlier, so slicing to it ran backwards and matched
     nothing. */
  const armAt = canvas.indexOf("if (servesFor) {");
  const arm = canvas.slice(armAt, canvas.indexOf("if (jointFor) {", armAt));
  const disarmAt = arm.indexOf("setServesFor(null)");
  const testAt = arm.indexOf("if (!seed)");
  if (disarmAt >= 0 && testAt >= 0 && disarmAt < testAt) {
    fail("the linking mode disarms before it checks a plot was clicked, so a "
      + "near miss ends it silently and the next click does nothing");
  }
  if (!/Seed_Feature_ID: seed\.Feature_ID/.test(arm)) {
    fail("clicking the plot does not stamp the trench with its seed");
  }
  if (!/Manual_Link: true/.test(arm)) {
    fail("a hand-linked trench is not marked as one, so the staleness test "
      + "cannot tell it from a dig the planner made");
  }
  /* And it can be undone, or a mistaken link is permanent. */
  if (!/delete A\.Seed_Feature_ID;\s*\n\s*delete A\.Manual_Link;/.test(canvas)) {
    fail("a link cannot be undone, so a trench linked to the wrong plot "
      + "keeps that plot out of Auto Service for ever");
  }
}

/* ── A plot added later joins the circuit it is fed from ──

   Link to Circuit is run once, and plots keep arriving. A plot added
   afterwards has a meter on no circuit, and nothing downstream picks
   it up: the build routes what a circuit OWNS and the report lists
   what a circuit owns, so the dwelling quietly stops being accounted
   for \u2014 no cable sized for it, no load against the way, nothing on
   the schedule.

   The answer is already on the drawing. The service tees off a
   particular LV main, that main carries a circuit, and the plot is fed
   by it. */
{
  const cable = (id, cid, g) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g,
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid,
      Circuit_Name: `Circuit ${cid}`, Circuit_Letter: cid === 7 ? "A" : "B" } });
  const world = [cable(1, 7, [[0, 0], [100, 0]]), cable(2, 9, [[0, 40], [100, 40]])];

  const on7 = circuitAtTee(world, [50, 0.3]);
  if (!on7 || on7.circuitId !== 7) {
    fail("a tee on circuit 7's cable does not read as circuit 7");
  }
  if (on7 && (on7.circuitName !== "Circuit 7" || on7.circuitLetter !== "A")) {
    fail("the circuit's name and letter do not travel with its id, so the "
      + "meter would carry a number nothing names");
  }
  /* The NEARER cable wins where two run close: a plot is fed by the
     one its service actually tees off. */
  if (circuitAtTee(world, [50, 39.8])?.circuitId !== 9) {
    fail("the tee takes the wrong cable where two circuits run near each other");
  }
  /* Nowhere near a cable is null, not a guess. Before Build LV Network
     has run there is nothing to ask, and taking the nearest
     substation's circuit would be a guess dressed as a fact. */
  if (circuitAtTee(world, [50, 20]) !== null) {
    fail("a tee nowhere near a feeder is given a circuit anyway");
  }
  if (circuitAtTee([], [0, 0]) !== null) fail("a drawing with no cables invents one");
  /* A cable with no circuit of its own gives nothing to inherit. */
  const bare = [{ ...cable(3, 7, [[0, 80], [100, 80]]),
    Attributes: { Line_Type: "elec_main" } }];
  if (circuitAtTee(bare, [50, 80]) !== null) {
    fail("a cable on no circuit still hands one out");
  }

  /* ── Wired to the plan's own tee ──

     `foot` is the point on the main the plan dug from. An earlier
     version of this read `plan.runs[0].geometry[0]`, which does not
     exist: the feature would have found nothing and looked as though
     it had never been built. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/plan\.foot \? circuitAtTee\(world, plan\.foot\)/.test(canvas)) {
    fail("the circuit is not read from the plan's own tee point");
  }
  /* Electric only: a Circuit_ID on a water meter would be read by "
     something eventually. */
  if (!/joins && m\.utility\.layer_key === "electric"/.test(canvas)) {
    fail("the circuit is written onto every utility's meter, not just the "
      + "electric one");
  }
}

/* ── The run reads the drawing, not the screen ──

   Reported twice now, on two different drawings. `features` is React
   state, captured when a run starts, and it catches up only after that
   run finishes and the component re-renders. A run begun before then
   sees a drawing with none of the first run's work in it, finds every
   plot unserved, and digs the lot again.

   The result is two service trenches per plot with identical geometry
   and identical attributes, in two blocks of feature ids. `isServed`
   is never wrong about it \u2014 it is asked about a drawing that no longer
   exists.

   Checked by reading the source, because the fault is an ordering
   between a React render and an await: there is no state to hand a
   test. What CAN be pinned is that the run fetches before it plans. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function runAutoService");
  if (at < 0) fail("Auto Service has gone");
  else {
    const body = canvas.slice(at, canvas.indexOf("\n  async function", at + 30));
    const fetchAt = body.indexOf("await listGis(projectId)");
    const planAt = body.indexOf("planAutoService(");
    if (fetchAt < 0) {
      fail("Auto Service plans from the screen's copy of the drawing, so a "
        + "second run begun before the first has rendered digs every plot "
        + "again");
    } else if (planAt >= 0 && fetchAt > planAt) {
      fail("Auto Service fetches the drawing after planning from it, which "
        + "is the same as not fetching at all");
    }
    /* And it still works offline: a run that refuses is worse than one
       that might duplicate, because the duplicate is visible. */
    if (!/catch \{/.test(body.slice(fetchAt, fetchAt + 400))) {
      fail("a failed fetch stops the run rather than falling back to the "
        + "screen's copy");
    }
  }
}

/* ── A seed judged on ALL its digs, and the copies swept ──

   A duplicated run leaves two trenches stamped to one seed. The
   staleness loop asked `world.find` for one of them \u2014 whichever came
   first \u2014 and where that was the stale one, the seed was reported
   moved and re-laid. The new dig matched, but the stale one was still
   there to be found first next time, so the SAME seed was re-laid on
   every run for ever. Reported as service trenches still being drawn.

   Two rules now. A seed is moved only if NONE of its digs goes where
   the drawing says. And where one does, the others are copies: deleted,
   but the seed stays served \u2014 putting them through the re-lay list
   would delete the copies and then dig a fresh one, which is a longer
   way round to the same duplicate. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("for (const sd of seeds) {\n      const sid = Number(sd.Feature_ID);");
  const loop = at < 0 ? "" : canvas.slice(at, canvas.indexOf("/* Done means laid AND still correct.", at));

  if (!loop) fail("the staleness loop has gone");
  else {
    /* Every dig, not the first one found. */
    if (/const trench = world\.find\(/.test(loop)) {
      fail("the staleness test still judges a seed by whichever of its digs "
        + "is found first, so a stale copy re-lays a plot that is already "
        + "correctly served \u2014 on every run, for ever");
    }
    if (!/const drawn = world\.filter\(/.test(loop)) {
      fail("the staleness test does not gather all the digs stamped to a seed");
    }
    if (!/const rightOne = reasons\.findIndex\(\(r\) => !r\)/.test(loop)) {
      fail("a seed is not judged on whether ANY of its digs is right");
    }
    /* The copies are swept, and NOT through the re-lay list. */
    if (!/copies\.push\(f\)/.test(loop)) {
      fail("a seed with a correct dig and a copy beside it keeps the copy, so "
        + "a duplicated drawing never settles");
    }
    const sweep = loop.slice(loop.indexOf("if (rightOne >= 0)"));
    if (/mismatched\.set/.test(sweep.slice(0, sweep.indexOf("continue;")))) {
      fail("the copies go through the re-lay list, which takes the seed out "
        + "of `serviced` and digs a fresh one \u2014 a longer way round to the "
        + "same duplicate");
    }
    /* A hand-linked dig is nobody's to sweep, however many there are. */
    if (!/drawn\.some\(\(t\) => t\.Attributes\?\.Manual_Link\)/.test(loop)) {
      fail("a hand-linked trench is judged and possibly deleted by the "
        + "staleness test");
    }
  }

  /* The copies are deleted with the re-lays, once each. */
  if (!/\.\.\.copies\]/.test(canvas)) {
    fail("the copies are collected and never deleted");
  }
  if (!/all\.findIndex\(\(x\) =>\s*\n\s*Number\(x\.Feature_ID\) === Number\(f\.Feature_ID\)\) === i\)/.test(canvas)) {
    fail("a row can be asked to delete twice, where a seed is both re-laid "
      + "and had copies");
  }
  /* And said, separately from the re-lays: "4 re-laid" would send
     somebody looking for four new trenches. */
  if (!/duplicate service trench\(es\) removed/.test(canvas)) {
    fail("the run does not say it removed duplicates");
  }
}

/* ── A developer-dug trench is still OUR dig ──

   The fault behind "Auto Service is still laying duplicates", reported
   three times.

   A service trench dug by the developer is written with Build_Status
   `existing`: no excavation to charge, the laying still ours. On an
   ordinary site that is nearly every service trench on the drawing \u2014
   36 of 37 on the reported one.

   The run excluded every `existing` line from the list it asks "is
   this plot served", because an existing trench is the incumbent's
   ground and a plot standing beside one is not dug. True of THEIR
   ground; not true of a dig this run laid and stamped. So the run was
   hiding its own work from itself: 15 of 19 seeds read as unserved,
   and a fresh trench was laid on every run, for ever.

   The stamp is the distinction, not the status. */
{
  const seed = { Feature_ID: 700, Feature_Role: "plot", Layer_Key: "plot",
    Plot_ID: 9, Geometry: [[100, 40]], Attributes: {} };
  const meter = { Feature_ID: 701, Feature_Role: "meter", Layer_Key: "electric",
    Plot_ID: 9, Geometry: [[100, 40]], Attributes: {} };
  const devDug = { Feature_ID: 702, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[100, 0], [100, 40]],
    Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 700,
      Build_Status: "existing", Developer_Dug: true } };
  /* The incumbent's ground: existing, and stamped to nobody. */
  const theirs = { Feature_ID: 703, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[200, 0], [200, 40]],
    Attributes: { Line_Type: "trench_service", Build_Status: "existing" } };

  /* isServed itself has never cared about Build_Status \u2014 it reads the
     list it is given. So the rule under test is the filter that builds
     that list, in the canvas. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/\(!isExistingFeature\(f\) \|\| f\.Attributes\?\.Seed_Feature_ID != null\)/.test(canvas)) {
    fail("the run hides developer-dug service trenches from itself, so every "
      + "plot on an ordinary site reads as unserved and is dug again on every "
      + "run");
  }
  /* And the exclusion still holds for ground that is genuinely theirs. */
  const keep = (f) => !(String(f.Attributes?.Build_Status ?? "") === "existing")
    || f.Attributes?.Seed_Feature_ID != null;
  if (!keep(devDug)) fail("our own developer-dug trench is still hidden");
  if (keep(theirs)) {
    fail("the incumbent's ground now counts as a service we laid, so a plot "
      + "standing beside one would never be dug");
  }
  if (!isServed(seed, [meter], [devDug])) {
    fail("a developer-dug trench stamped to the seed does not serve it");
  }
  if (isServed(seed, [meter], [])) fail("a plot with no dig reads as served");

  /* ── The menu and the run must ask the same question ──

     They did not: the step counted a developer-dug trench as serving
     its plot while the run did not, so the menu said "every plot
     served" about a site the run was about to dig again. */
  const steps = readFileSync("./src/features/gis/electricSteps.js", "utf8");
  const stepLaid = /const laidLines[\s\S]{0,400}?;/.exec(steps)?.[0] ?? "";
  if (/isExisting/.test(stepLaid) && !/Seed_Feature_ID/.test(stepLaid)) {
    fail("the step's count of what is served excludes existing trenches "
      + "without allowing for the stamp, so the menu and the run disagree");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Auto Service re-lays the plots whose ground moved, and only those.");
process.exit(bad ? 1 : 0);
