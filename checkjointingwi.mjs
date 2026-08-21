/* The jointing work instruction.

   A jointing visit is a different job from a dig and a different
   record: a checklist marked task by task, and a row per plot carrying
   its termination, its outcome and its test results. The generic
   instruction asks "length dug", which against a jointing visit is not
   a smaller question but the wrong one.

   Mounted and driven rather than read, because every way this can break
   — a form that renders the wrong sections, a plot row that writes over
   its neighbour, a send button that lights with nothing filled in — is
   invisible in the source. */
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import {
  CHECKLIST, MARKS, OUTCOMES, TESTS,
  isJointingJob, plotsOf, emptyPlot, missingFrom,
  breechesFor, routeUnknownFor, jointLabel,
} from "./src/features/field/jointingInstruction.js";
import { breechSummary, breechesOnRoutes } from "./src/features/gis/serviceBreech.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. The definition itself.
{
  if (CHECKLIST.length !== 6) {
    fail(`the checklist has ${CHECKLIST.length} tasks, not the six on the form`);
  }
  /* Word for word from the original. Paraphrasing would be two wordings
     of one instruction, and the business checks against these. */
  if (!CHECKLIST.some((t) => /100A fuses/.test(t))) {
    fail("the fuse task has been reworded or lost");
  }
  if (MARKS.join("") !== "CINR") fail(`marks are ${MARKS.join("/")}, not C/I/NR`);

  if (OUTCOMES.join("|") !== "Completed|Aborted|Dead Jointed") {
    fail(`outcomes are ${OUTCOMES.join(", ")}`);
  }
  /* Dead Jointed is its own answer, not a note on Completed: the joint
     is made and the service is not live, and the difference is what the
     next visit is for. */
  if (!OUTCOMES.includes("Dead Jointed")) fail("Dead Jointed is not an outcome");

  const keys = TESTS.map((t) => t.key);
  for (const k of ["ir", "eli", "polarity", "voltage"]) {
    if (!keys.includes(k)) fail(`the ${k} test is missing`);
  }
  /* Phase is a field on every plot rather than a second document. The
     original had two templates differing only in whether it appeared,
     which meant the office had to know the phasing before the gang
     arrived. Blank means single phase, as it always has on paper. */
  if (!keys.includes("phase")) {
    fail("Phase is missing — three-phase services have nowhere to record it");
  }
  const phase = TESTS.find((t) => t.key === "phase");
  /* Guarded. Without the check above having stopped, a missing Phase
     threw here and the run died — which reads as a broken check rather
     than as the fault it is. */
  if (phase && !phase.options.includes("L3")) fail("Phase does not offer L1/L2/L3");

  /* Units live in the label. A number recorded without its unit is the
     fault this form exists to stop, and a unit drawn beside the input
     is one an export can lose. */
  for (const k of ["ir", "eli"]) {
    const t = TESTS.find((x) => x.key === k);
    if (!/[(\u03a9]/.test(t.label)) fail(`the ${k} test label carries no unit`);
  }

  const blank = emptyPlot();
  for (const t of TESTS) {
    if (blank[t.key] !== "") fail(`a new plot row does not start blank at ${t.key}`);
  }
}

// 2. Which visits take this form.
{
  if (!isJointingJob({ task: "Jointing" })) fail("a jointing visit did not match");
  if (!isJointingJob({ task: "JOINTING" })) fail("an upper-case name did not match");
  /* Not the call-off's work type. A service call-off carries an
     energisation visit too, and that is not a jointing visit. */
  if (isJointingJob({ task: "Energisation" })) fail("energisation took the jointing form");
  if (isJointingJob({ task: "Excavation and Lay" })) fail("a dig took the jointing form");
  if (isJointingJob({})) fail("a job with no phase took the jointing form");
  if (isJointingJob(null)) fail("a missing job took the jointing form");
}

// 3. The plots on the booking.
//
//    "18-22, 35" is the stored form and what the screenshot shows.
{
  const got = plotsOf("18-22, 35").join(",");
  if (got !== "18,19,20,21,22,35") fail(`"18-22, 35" parsed to ${got}`);

  /* Written backwards is still a range — refusing it would lose four
     plots over a typo nobody can correct from site. */
  if (plotsOf("22-18").length !== 5) fail("a reversed range lost its plots");

  if (plotsOf("5, 5, 5").length !== 1) fail("a repeated plot appeared twice");

  /* Tolerant, because the alternative is a gang on a road with a blank
     screen. */
  for (const junk of ["", null, undefined, "   ", ","]) {
    if (plotsOf(junk).length) fail(`${JSON.stringify(junk)} produced plots`);
  }
  /* And a guard nobody will meet: a mistyped range must not make a
     hundred thousand rows. */
  if (plotsOf("1-99999").length) fail("an absurd range was expanded");
}

// 4. What has to be answered.
{
  const plots = ["18", "19"];
  const empty = missingFrom({}, plots);
  if (empty.length !== 3) fail(`an empty form reports ${empty.length} outstanding, not 3`);

  /* Every plot needs an outcome — a gang can complete four and abort
     the fifth, and one outcome for the visit would lose which. */
  const part = missingFrom({ declaration: "signed", plots: { 18: { outcome: "Completed" } } }, plots);
  if (part.length !== 1 || !/19/.test(part[0])) {
    fail(`a half-filled form reports ${JSON.stringify(part)}`);
  }

  const done = missingFrom({
    declaration: "signed",
    plots: { 18: { outcome: "Completed" }, 19: { outcome: "Aborted" } },
  }, plots);
  if (done.length) fail(`a filled form still reports ${JSON.stringify(done)}`);

  /* The checklist is deliberately not required. A task left blank is a
     task nobody got to, which is a real answer and one the office would
     rather see than six C's entered to light up a button. */
  if (missingFrom({
    declaration: "signed", plots: { 18: { outcome: "Completed" } },
  }, ["18"]).length) {
    fail("the checklist is required — blank means 'not reached', not 'unfinished'");
  }
}

// 5. The queue hands over what the form needs.
{
  const q = readFileSync("./netlify/functions/field-queue.js", "utf8");
  if (!/As_Laid_Path/.test(q)) fail("the field queue does not read the as-laid drawing");
  /* A URL built on read, not stored. Renaming the bucket must not
     strand every row. */
  if (!/getPublicUrl/.test(q)) fail("the as-laid path is not turned into a URL");
  if (!/asLaid:\s*released\s*&&/.test(q)) {
    fail("the as-laid drawing is served on jobs that are not released");
  }
}

/* ── An explicit column list names only what its endpoint touches ──

   Listing As_Laid_Captured_At on the call-offs endpoint broke raising a
   call-off outright — `column ... does not exist` — on an instance
   where the migration had not reached the running database. That
   endpoint neither reads nor writes the drawing: it is written by
   call-off-as-laid.js and read by field-queue.js.

   Fault 4 is about columns an endpoint saves and returns. A list that
   names everything is not safer, it is wider, and every extra name is
   one more thing a stale schema can fail on. */
{
  const co = readFileSync("./netlify/functions/calloffs.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const col of ["As_Laid_Path", "As_Laid_Captured_At"]) {
    if (co.includes(col)) {
      fail(`the call-offs endpoint lists ${col}, which it never reads or writes`
        + " \u2014 that broke raising a call-off once already");
    }
  }

  /* And the two that DO touch it still do. Removing the column from the
     wrong list must not take it out of the right ones. */
  const asLaid = readFileSync("./netlify/functions/call-off-as-laid.js", "utf8");
  for (const col of ["As_Laid_Path", "As_Laid_Captured_At"]) {
    if (!asLaid.includes(col)) fail(`call-off-as-laid.js no longer writes ${col}`);
  }
}

/* ── The breech joints on the way back ──

   A gang connecting a plot works at the meter and at every breech joint
   between it and the origin, where the feeder divides to reach that
   plot. Those are connections to make and fittings to carry, and a
   call-off naming the plots and not the joints sends somebody out
   short.

   Traced from the same graph everything else reads, so a route found
   here cannot disagree with what the canvas shows when the same plot is
   traced by hand. */
{
  /* ── Drawn the way a drawing is drawn ──

     Cables as lines, joints and meters as points on them. The first
     version of this fixture chained joints to each other through
     Connects, which no real drawing does \u2014 and that is why it passed
     while production found nothing at all.

     The graph attaches a point to the one line nearest it, so a joint
     hangs off a cable as a leaf and is never *between* the meter and
     the origin. The parent chain from a meter is meter \u2192 service \u2192
     main \u2192 origin, all lines. A rule that looked for joints on that
     chain found none on every drawing, and reported it as "no breech
     joints on the route", which is indistinguishable from the truth.

     A fixture that cannot reproduce that is a fixture that proves
     nothing. This one is cables. */
  const L = (id, g) => ({
    Feature_ID: id, Layer_Key: "electric", Feature_Type: "line",
    Geometry: g, Attributes: { Line_Type: "elec_main" },
  });
  const P = (id, role, at, extra = {}) => ({
    Feature_ID: id, Layer_Key: "electric", Feature_Role: role,
    Geometry: [at], Attributes: extra,
  });

  /* POC ── cable ── A4 (breech) ── cable ── A9 (breech) ── cable ── meter 105
                       │
                       └── cable to a breech on another branch, which must
                           not appear on this plot's route.
     Meter 106 hangs off the first cable, so it passes A4 and not A9. */
  const feats = [
    P(1, "poc", [0, 0]),
    L(10, [[0, 0], [10, 0]]),
    L(11, [[10, 0], [20, 0]]),
    L(12, [[20, 0], [30, 0]]),
    /* ── Span nodes as Place Span Nodes actually writes them ──

       On the **trench** layer, not the utility's: the node belongs to
       the trench and carries its own class so it can be hidden without
       hiding the trenches. Only the origin goes on the utility layer.
       A fixture that put them on `electric` matched a filter that was
       wrong, and every joint on a real drawing came back
       "not on a node".

       And A4's marker is nudged clear of the trench so its label can be
       read, with Span_Anchor holding where it really is. The joint
       stands at the anchor. */
    { Feature_ID: 28269, Layer_Key: "trench", Feature_Role: "spannode",
      Geometry: [[11.5, 1.5]],
      Attributes: { Span_Seq: 4, Span_Label: "A4", Span_Anchor: [10, 0] } },
    /* Labelled as the drawing labels them, which is what produced
       "Breech Joint Breech Joint \u2014 not on a node". */
    { ...P(100, "joint", [10, 0], { Joint_Type: "breech" }), Label: "Breech Joint" },
    { Feature_ID: 28270, Layer_Key: "trench", Feature_Role: "spannode",
      Geometry: [[20, 0]], Attributes: { Span_Seq: 9, Span_Label: "A9" } },
    /* The other spelling. The two ways a joint gets placed have never
       agreed on which they write. */
    P(101, "joint", [20, 0], { Joint_Code: "BRE" }),
    /* A straight joint on the route, which is not a connection this
       gang makes. */
    P(103, "joint", [15, 0], { Joint_Type: "straight" }),
    /* Plot_ID is a column on the feature, beside Layer_Key and
       Feature_Role \u2014 not an attribute. Putting it in Attributes here
       was what let a reader of `m.Attributes.Plot_ID` pass while every
       real meter came back with no plot against it. */
    { ...P(5, "meter", [31, 0]), Plot_ID: 105 },
    { ...P(6, "meter", [9, 3]), Plot_ID: 106 },
    L(13, [[10, 0], [10, 60]]),
    P(102, "joint", [10, 60], { Joint_Type: "breech" }),
    /* Connected to nothing at all. */
    { ...P(7, "meter", [900, 900]), Plot_ID: 107 },
  ];
  const meters = feats.filter((f) => f.Feature_Role === "meter");
  const routes = breechesOnRoutes(feats, meters, 1);

  const forPlot = (pid) => routes.find((r) => r.plotId === pid);

  /* Both breeches on the far plot's route, and the straight joint on it
     left out — a straight joint is not a connection this gang makes. */
  const far = forPlot(105);
  if (far?.joints.map((j) => j.featureId).join(",") !== "100,101") {
    fail(`plot 105's route found joints ${far?.joints.map((j) => j.featureId)}`
      + " \u2014 a joint hangs off a cable, it is not on the chain between"
      + " the meter and the origin");
  }
  /* The straight joint on the same route is left out. */
  if (far?.joints.some((j) => j.featureId === 103)) {
    fail("a straight joint was reported as a connection to make");
  }
  /* And the breech on the other branch is not on this route. */
  if (far?.joints.some((j) => j.featureId === 102)) {
    fail("a breech on a different branch was put on this plot's route");
  }
  /* Origin outward, not plot backward: a gang works along the cable
     from where the supply comes in, and a list read the other way has
     to be reversed in somebody's head while they stand in a hole. */
  if (far?.joints[0]?.featureId !== 100) {
    fail("the joints are listed from the plot back, not from the origin out");
  }
  /* The nearer plot passes through one of them and not the other. */
  if (forPlot(106)?.joints.map((j) => j.featureId).join(",") !== "100") {
    fail("a plot was given a joint that is not on its route");
  }
  /* A plot with no route back is reported, not dropped. Left out it
     would look like a plot with a clear run, which is the ordinary
     case — and it is a fault in the drawing worth knowing before a gang
     is booked. */
  if (forPlot(107)?.reachable !== false) {
    fail("a plot with no route back was not flagged as unreachable");
  }

  /* The node comes off the drawing, matched on position: a joint and a
     node at one point are not linked to each other, they are both
     linked to the cable, so position is the only thing they share. */
  if (far?.joints[0]?.node !== "A4" || far?.joints[1]?.node !== "A9") {
    fail(`the breeches came back as nodes ${far?.joints.map((j) => j.node)}`
      + " \u2014 they stand on A4 and A9");
  }
  /* The node comes off the drawing, matched on position: a joint and a
     node at one point are not linked to each other, they are both
     linked to the cable, so position is the only thing they share. */
  if (breechesOnRoutes(feats.filter((f) => f.Feature_Role !== "spannode"),
    meters, 1)[0]?.joints[0]?.node != null) {
    fail("a joint with no span node on it was given one anyway");
  }

  const sum = breechSummary(feats, meters, 1,
    (id) => ({ 105: "12", 106: "13", 107: "14" })[id]);
  /* One breech feeding two plots is one connection to make. Summing
     across plots would put a number on the call-off no gang
     recognises. */
  if (sum.totalJoints !== 2) fail(`${sum.totalJoints} joints counted, not 2`);
  if (sum.unreachable !== 1) fail("the unreachable plot was not counted");
  /* Plots with a clear run and nothing to say are left out entirely: a
     record that always exists and is usually empty is one nobody
     reads. */
  if (sum.plots.some((p) => p.reachable && !p.joints.length)) {
    fail("a plot with a clear run was listed with no joints");
  }

  /* No origin, or no meters, is not an error — it is a call-off with
     nothing to trace. */
  if (breechesOnRoutes(feats, meters, null).length) fail("a null origin produced routes");
  if (breechesOnRoutes(feats, [], 1).length) fail("no meters produced routes");
  if (breechesOnRoutes(feats, meters, 999).length) {
    fail("an origin not on the drawing produced routes");
  }

  /* And the form reads it back per plot, on the plot number as
     printed. */
  const job = { breech: sum };
  if (breechesFor(job, "12").length !== 2) fail("the form lost plot 12's joints");
  if (breechesFor(job, 12).length !== 2) {
    fail("the form matches the plot number by type — \"12\" and 12 are one plot");
  }
  if (breechesFor(job, "13").length !== 1) fail("the form lost plot 13's joint");
  if (breechesFor(job, "99").length) fail("a plot not on the list was given joints");
  if (breechesFor({}, "12").length) fail("a call-off with no trace produced joints");
  if (!routeUnknownFor(job, "14")) fail("the form does not say the route was untraceable");
  if (routeUnknownFor(job, "12")) fail("a traced plot was reported as untraceable");

  /* Every plot came back with a number against it. Reading Plot_ID out
     of Attributes returned undefined for every meter ever drawn, and
     the office could not tell which plot a joint belonged to. */
  if (routes.some((r) => r.plotId == null)) {
    fail("a meter came back with no plot against it \u2014 Plot_ID is a column"
      + " on the feature, not an attribute");
  }

  /* ── Named by the node it stands on ──

     A breech joint is placed exactly where a span node is, and the node
     is what the drawing, the levels check and the call-off all call
     that place. "Breech joint 4812" is a database id and means nothing
     to anybody standing in a hole. */
  if (jointLabel({ node: "A5" }) !== "Breech Joint at Node A5") {
    fail(`a joint on node A5 is called "${jointLabel({ node: "A5" })}"`);
  }
  /* Including the origin. A breech on E0 itself is unusual and not
     impossible, and calling it E0 is right. */
  if (!/E0/.test(jointLabel({ node: "E0" }))) fail("a joint on the origin node is misnamed");

  /* And the drawing's own label does not double up. Most joints are
     labelled "Breech Joint", which read out as "Breech Joint Breech
     Joint \u2014 not on a node" five times over. A label that repeats the
     kind adds nothing. */
  if (/Breech Joint Breech/i.test(jointLabel({ label: "Breech Joint" }))) {
    fail("the drawing's label doubles the words already in the name");
  }
  if (!/BJ-7/.test(jointLabel({ label: "BJ-7" }))) {
    fail("a label that identifies the joint was thrown away with the rest");
  }

  /* No node is admitted, not papered over: it means Place Span Nodes
     has not been run since the joint went in, so the levels check is
     not measuring to it either. */
  for (const j of [{}, { featureId: 9, jointCode: "BRE" }, { label: "BJ-7" }]) {
    if (!/not on a node/.test(jointLabel(j))) {
      fail(`a joint with no node reads "${jointLabel(j)}" \u2014 the omission`
        + " is worth more than the name");
    }
  }
  /* And a database id never reaches the form. */
  if (/\b9\b/.test(jointLabel({ featureId: 9 }))) {
    fail("a joint is named by its Feature_ID");
  }

  /* ── And before anything is raised ──

     Shown live in the service call-off dialog as plots go on and off,
     not only once the call-off exists. Somebody choosing which plots to
     put on a visit is deciding how much work it is, and they cannot do
     that if the answer appears afterwards.

     It is also the only place the trace can be checked before anything
     is written: an expected joint that does not appear here is a
     drawing to look at, rather than a work instruction that comes out
     short a week later. */
  {
    const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    if (!/servicePlotBreech/.test(canvas)) {
      fail("the service call-off dialog does not trace the plots being picked");
    }
    /* Recomputed as the plots change. Memoised on the raise handler's
       inputs instead would leave it stale the moment a plot came off. */
    if (!/\}, \[serviceOpen, servicePlots, features, plotList\]\)/.test(canvas)) {
      fail("the live trace does not follow the plots being picked");
    }
    if (!/gco-breech/.test(canvas)) {
      fail("the dialog has nowhere to show what is on the route");
    }
    /* Named by the one naming function, not spelled again. The dialog
       lists each joint once with the plots it serves, rather than
       repeating it per plot, so it calls jointLabel on the joint
       itself. */
    if (!/jointLabel\(j\)/.test(canvas)) {
      fail("the dialog names the joints its own way");
    }
    /* One row per joint. A joint feeding six plots was listed against
       all six, under a total saying "counted once each" \u2014 which read
       as a contradiction. */
    if (!/servicePlotBreech\.joints \|\| \[\]/.test(canvas)) {
      fail("the dialog lists a joint once per plot it serves");
    }
    /* And a plot the trace could not reach still appears: it has no
       joints, so a list keyed on joints would drop it silently. */
    if (!/p\.reachable === false/.test(canvas)) {
      fail("a plot with no traceable route vanished from the dialog");
    }
  }

  /* ── One name, in one place ──

     Three screens show these joints now. Three spellings of one name is
     the fault this repo keeps finding \u2014 the layer colours, the span
     node cable sizes, the utility colour table. */
  {
    const { jointLabel: fromGis } = await import(
      process.cwd() + "/src/features/gis/serviceBreech.js");
    if (fromGis !== jointLabel) {
      fail("the work instruction has its own copy of the joint naming");
    }
  }

  /* ── The LV network starts at the origin ──

     rootAt walks breadth first, so it finds the fewest-hops route
     rather than the electrical one. Where a scheme has a substation AND
     a point of connection, the incomer joins the two — so the graph has
     a way round, and a plot on a long leg came back routed through the
     POC. Plot 34 listed five breech joints nobody would meet walking
     its own feeder while every other plot shared two.

     The POC and the incomer are upstream of a substation. Taking the
     POC point out alone was not enough: the cable still joined the two
     ends. */
  {
    const line = (id, geom, type = "elec_main", attrs = {}) => ({
      Feature_ID: id, Layer_Key: "electric", Feature_Type: "line",
      Geometry: geom, Attributes: { Line_Type: type, ...attrs },
    });
    const sub = { Feature_ID: 1, Layer_Key: "electric", Feature_Role: "substation",
      Geometry: [[0, 0]], Attributes: {} };
    const poc = { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "poc",
      Geometry: [[100, 0]], Attributes: {} };
    const node = (id, at, label) => ({
      Feature_ID: id, Layer_Key: "trench", Feature_Role: "spannode",
      Geometry: [at], Attributes: { Span_Label: label } });
    const far = { Feature_ID: 6, Layer_Key: "electric", Feature_Role: "meter",
      Geometry: [[100, 11]], Plot_ID: 34, Attributes: {} };

    const both = [
      sub, poc,
      line(10, [[0, 0], [100, 0]], "elec_hv", { Poc_Route: true }),
      line(14, [[100, 0], [100, 10]]),
      node(902, [100, 10], "A9"),
      { Feature_ID: 102, Layer_Key: "electric", Feature_Role: "joint",
        Geometry: [[100, 10]], Attributes: { Joint_Type: "breech" } },
      far,
    ];

    /* Only reachable through the POC, so from the substation it is not
       reachable at all — and saying so is right. Routing it round the
       incomer and listing the joints it met on the way is not. */
    const fromSub = breechesOnRoutes(both, [far], 1)[0];
    if (fromSub?.reachable) {
      fail("a plot reachable only through the POC was traced from the"
        + " substation, round the incomer \u2014 its joints are not on its feeder");
    }

    /* And on a scheme with no transformer the POC IS the origin, so
       nothing is excluded and the plot traces normally. */
    const pocFed = both.filter((f) => f.Feature_ID !== 1 && f.Feature_ID !== 10);
    const fromPoc = breechesOnRoutes(pocFed, [far], 2)[0];
    if (!fromPoc?.reachable) {
      fail("a POC-fed scheme cannot trace back to its own POC");
    }
    if (fromPoc?.joints[0]?.node !== "A9") {
      fail("a POC-fed trace lost the joint on its route");
    }
  }

  /* ── A plot number is never a database id ──

     `plotNumberOf` failed for two plots and the code fell back to
     `r.plotId`, so plots 34 and 35 were listed as "Plot 74" and
     "Plot 75" \u2014 their row ids \u2014 on a call-off that has no such plots.
     Nothing about it looked like a failed lookup; it looked like two
     extra plots.

     The lookup failed because plot lists come in two shapes: the canvas
     holds lowercase keys, the plots endpoint returns Plot_ID and
     Plot_Number, and the canvas already reads both in places. A lookup
     that knew one found nothing for a list of the other. */
  {
    const { plotNumberFrom } = await import(
      process.cwd() + "/src/features/gis/serviceBreech.js");

    for (const [what, list] of [
      ["lowercase", [{ plot_id: 74, plot_number: "34" }]],
      ["capitalised", [{ Plot_ID: 74, Plot_Number: "34" }]],
      ["a numeric plot number", [{ plot_id: "74", plot_number: 34 }]],
    ]) {
      if (plotNumberFrom(list, 74) !== "34") {
        fail(`a ${what} plot list did not resolve id 74 to plot 34`);
      }
    }

    /* And a miss is null, not the id. This is the whole of the fault:
       a raw id shown where a number belongs reads as a plot. */
    if (plotNumberFrom([{ plot_id: 74, plot_number: "34" }], 999) != null) {
      fail("a plot id with no match came back as something \u2014 it must be"
        + " null, or it is shown as a plot that does not exist");
    }
    if (plotNumberFrom([], 74) != null) fail("an empty plot list produced a number");
    if (plotNumberFrom(undefined, 74) != null) fail("no plot list produced a number");

    /* Nothing falls back to the id at the display either. */
    for (const [name, file] of [
      ["the call-off page", "./src/features/calloffs/CallOffsPage.jsx"],
      ["the service call-off dialog", "./src/features/gis/GISCanvasPage.jsx"],
    ]) {
      if (/Plot \{p\.plot \?\? p\.plotId\}/.test(readFileSync(file, "utf8"))) {
        fail(`${name} shows the raw Plot_ID where the number is missing`);
      }
    }
  }

  /* ── The office sees it too ──

     The trace was stored and shown on the field work instruction and
     nowhere else, so a planner booking the visit \u2014 who is the person
     deciding how long it takes \u2014 saw nothing at all. The instruction
     is read on a road; the booking is made on the call-offs page.

     And a call-off raised before any of this existed carries no trace,
     which is every call-off already on the system. Offered as a
     deliberate act rather than done on opening: it reads the whole
     drawing and writes to the call-off, and a screen that rewrites a
     record because somebody looked at it is the whole-drawing
     reconciliation fault again. */
  {
    const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
    if (!/GIS_Data\?\.breech/.test(page)) {
      fail("the call-off page does not read the traced joints");
    }
    if (!/co-breech/.test(page)) {
      fail("the call-off page has nowhere to show the traced joints");
    }
    /* Named by node there as well, so the office and the gang are
       reading one thing. */
    if (!/Node \$\{j\.node\}/.test(page)) {
      fail("the office view does not name the joints by their node");
    }
    /* The route it could not trace is not drawn like a clear run. */
    if (!/p\.reachable === false/.test(page)) {
      fail("the office view shows an untraceable route as a plot with no joints");
    }
    /* Offered only where nothing is stored \u2014 a button that overwrites
       the record of the day would change a booking under somebody. */
    if (!/breech == null && isElectricJointing/.test(page)) {
      fail("the trace button is offered over a trace that already exists");
    }
    if (!/onClick=\{traceBreech\}/.test(page)) {
      fail("nothing can trace a call-off raised before this existed");
    }
  }

  /* The queue carries it, and only on the released job. */
  const q = readFileSync("./netlify/functions/field-queue.js", "utf8");
  if (!/GIS_Data/.test(q)) fail("the field queue does not read the traced joints");
  /* Ternary, as the fields around it are — matching `released &&`
     was matching a spelling this file does not use, and the check
     failed on correct code. */
  if (!/breech: released \?/.test(q)) {
    fail("the joints are served on jobs that are not released");
  }
}

// 6. Mounted, and driven the way a gang would.
{
  const bundle = await build({
    entryPoints: ["src/features/field/WorkInstruction.jsx"],
    bundle: true, write: false, format: "cjs", jsx: "automatic",
    platform: "browser", logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test" }),
    },
  });

  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
    { url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only" });
  const { window } = dom;
  for (const k of ["window", "document", "navigator", "HTMLElement", "Element",
    "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame",
    "cancelAnimationFrame", "sessionStorage", "localStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  /* The draft round-trip, in memory. What matters here is what the form
     draws and what it writes, not that a request went out. */
  const saved = [];
  globalThis.fetch = async (url, opts) => {
    saved.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
    return {
      ok: true, status: 200,
      json: async () => ({ Payload: {} }),
      text: async () => "{}",
    };
  };

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = {
    react: React,
    "react-dom": await import("react-dom"),
    "react-dom/client": await import("react-dom/client"),
    "react/jsx-runtime": await import("react/jsx-runtime"),
  };
  const shim = (id) => {
    const m = shared[id];
    if (!m) throw new Error("unexpected external: " + id);
    return m.default && m.default.createElement ? m.default : m;
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "globalThis",
    bundle.outputFiles[0].text)(shim, mod, mod.exports, globalThis);
  const WorkInstruction = mod.exports.default;

  const root = createRoot(document.getElementById("root"));
  const txt = () => document.body.textContent;
  const click = async (el) => {
    await act(async () => {
      el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
  };

  /* The job from the screenshot: jointing, plots 18-22 and 35. */
  const job = {
    assignmentId: 1, task: "Jointing", plots: "18-22, 35",
    apNumber: "AP-1234", siteName: "Sample Site", startDate: "2026-08-20",
  };

  await act(async () => {
    root.render(React.createElement(WorkInstruction, { job, onDone() {}, onCancel() {} }));
  });

  // The jointing sections, and not the generic ones.
  for (const want of ["Task checklist", "Plots", "Sign-off", "Plot 18", "Plot 35"]) {
    if (!txt().includes(want)) fail(`the jointing form is missing "${want}"`);
  }
  for (const wrong of ["Length dug", "Surface dug", "On arrival"]) {
    if (txt().includes(wrong)) fail(`the jointing form asks "${wrong}", which is a dig question`);
  }
  /* Every plot on the booking gets a row, not just the first. */
  if (document.querySelectorAll(".wi-plot").length !== 6) {
    fail(`${document.querySelectorAll(".wi-plot").length} plot rows for 18-22, 35`);
  }

  /* A mark is a mark, and pressing it again clears it — blank means
     "not reached" and there has to be a way back from a mis-tap. */
  const marks = [...document.querySelectorAll(".wi-chk .wi-opt")];
  if (marks.length !== CHECKLIST.length * MARKS.length) {
    fail(`${marks.length} checklist buttons for ${CHECKLIST.length} tasks`);
  }
  await click(marks[0]);
  if (marks[0].getAttribute("aria-pressed") !== "true") fail("a checklist mark did not take");
  await click(marks[0]);
  if (marks[0].getAttribute("aria-pressed") === "true") {
    fail("a checklist mark cannot be cleared — a mis-tap is permanent");
  }

  /* One plot's answers must not land on another. This is the fault the
     shape exists to prevent: a hundred flat keys and an off-by-one. */
  const outcomeBtn = (plot, label) => {
    const box = [...document.querySelectorAll(".wi-plot")]
      .find((d) => d.querySelector("h3")?.textContent === `Plot ${plot}`);
    return [...box.querySelectorAll(".wi-opt")].find((b) => b.textContent === label);
  };
  await click(outcomeBtn("18", "Completed"));
  await click(outcomeBtn("35", "Aborted"));
  if (outcomeBtn("19", "Completed").className.includes("on")) {
    fail("answering plot 18 marked plot 19 as well");
  }
  if (!outcomeBtn("35", "Aborted").className.includes("on")) {
    fail("plot 35's outcome did not take");
  }
  if (!outcomeBtn("18", "Completed").className.includes("on")) {
    fail("plot 18's outcome was overwritten by plot 35's");
  }

  /* And a generic job still gets the generic form. */
  await act(async () => {
    root.render(React.createElement(WorkInstruction, {
      job: { assignmentId: 2, task: "Excavation and Lay", plots: "1-3" },
      onDone() {}, onCancel() {},
    }));
  });
  if (txt().includes("Task checklist")) {
    fail("a dig was given the jointing form");
  }
  if (!txt().includes("Length dug")) fail("the generic form was lost");

  await act(async () => { root.unmount(); });
}

console.log(bad ? `\n${bad} problem(s)`
  : "Jointing work instruction behaves (checklist, a row per plot, tests recorded).");
process.exit(bad ? 1 : 0);
