/* A service call-off: which plots, and what is being connected.

   ── It is not a run ──

   Gas and water go in on one visit and the electric follows a fortnight
   later. Neither is described by a length of trench, so the answer is
   always a set of plots — however it was arrived at.

   A run of trench is a good way of *choosing* plots when somebody knows
   which ones it serves. So there are three ways in, and all three add
   to one list; nothing downstream can tell which was used, because
   nothing downstream should care. */
import { readFileSync } from "node:fs";
import {
  plotOfSeed, sortPlots, plotsFromText, togglePlot, plotsFromRun,
  alreadyCalledOff, serviceSummary, priorServicesFrom, servicedByPlot,
  firstElectricCallOff, electricUtilityId, utilitiesToTest,
  serviceGroupsFor, isWholeGroup, chooseUtilityFirst, bookedFor,
  utilitiesOutOfStep,
} from "./src/features/gis/serviceCallOff.js";
import { serviceCallOffCustomer } from "./src/features/gis/callOffCustomer.js";
import { plotSupplyState, anchorsFor } from "./src/features/gis/plotSupply.js";
import {
  mainsGraph, pathToSource, deadUpstream, sourceFor, liveCascade, trenchesUnder,
} from "./src/features/gis/upstream.js";
import { lineFollows } from "./src/features/gis/gasPressure.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const PLOTS = [
  { plot_id: 1, plot_number: "12" },
  { plot_id: 2, plot_number: "13" },
  { plot_id: 3, plot_number: "12A" },
  { plot_id: 4, plot_number: "25" },
];

// 1. Typed, in the syntax that already exists.
//
//    parsePlotRange is what placing plots uses, so what somebody learns
//    in one place works in the other. Writing a second parser would be
//    a second syntax nobody was told about.
{
  const r = plotsFromText("12-14, 25", PLOTS);
  if (r.plots.join() !== "12,13,14,25") fail(`a range came out as ${r.plots.join()}`);

  /* Text, not numbers: 12A is an ordinary plot. */
  const alpha = plotsFromText("12A, 13", PLOTS);
  if (!alpha.plots.includes("12A")) fail("a plot with a letter in it is dropped");

  /* What could not be read is said rather than silently skipped. */
  const junk = plotsFromText("12--15, ??", PLOTS);
  if (!junk.unreadable.length) fail("nonsense is accepted without a word");
  if (junk.plots.length) fail("nonsense produced plots");

  /* And what was read but is not on the drawing. Said, not refused: a
     plot may be on site and not yet drawn, and refusing would make the
     drawing the authority on what exists. */
  const off = plotsFromText("12, 99", PLOTS);
  if (!off.unknown.includes("99")) fail("a plot not on the drawing is not flagged");
  if (!off.plots.includes("99")) fail("a plot not on the drawing is refused");
}

// 2. Tapped, and tapped again to remove.
//
//    A list that only grows plus a separate remove action is two
//    gestures for one decision.
{
  let p = [];
  p = togglePlot(p, "13");
  p = togglePlot(p, "12");
  if (p.join() !== "12,13") fail(`tapping two plots gave ${p.join()}`);
  p = togglePlot(p, "13");
  if (p.join() !== "12") fail("tapping a plot again does not remove it");
  /* Nothing is not a plot. */
  if (togglePlot(["12"], null).join() !== "12") fail("an empty tap changes the list");
  if (togglePlot(["12"], "  ").join() !== "12") fail("a blank plot is added");
}

// 3. A seed names the plot the site names.
//
//    The drawing holds the id; a call-off names plots the way the site
//    does, so a submission survives a plot being renumbered.
{
  const seed = { Feature_Role: "plot", Plot_ID: 3, Label: "wrong" };
  if (plotOfSeed(seed, PLOTS) !== "12A") {
    fail(`a seed named its plot ${plotOfSeed(seed, PLOTS)}`);
  }
  /* Anything that is not a seed is not a plot. */
  if (plotOfSeed({ Feature_Role: "meter", Plot_ID: 3 }, PLOTS)) {
    fail("a meter was read as a plot seed");
  }
}

// 4. From a run — the plots, not the run.
//
//    A service call-off that recorded which trench it came from would
//    be claiming something about the work that is not true: the gang is
//    connecting plots, not digging that run.
{
  const got = plotsFromRun([{ plots: ["13", "12"] }, { plots: ["13", "14"] }]);
  if (got.join() !== "12,13,14") fail(`a run gave ${got.join()}`);
  if (plotsFromRun([]).length) fail("no run produced plots");
}

// 5. Sorted the way a call-off reads.
//
//    As text, 10 sits between 1 and 2, which looks like a mistake on a
//    piece of paper somebody is working from.
{
  if (sortPlots(["2", "10", "1"]).join() !== "1,2,10") {
    fail(`plots sorted ${sortPlots(["2", "10", "1"]).join()}`);
  }
  /* Mixed, which is where a plain text sort gives itself away: 9 before
     10 before 10A. */
  if (sortPlots(["10A", "9", "10"]).join() !== "9,10,10A") {
    fail(`mixed plots sorted ${sortPlots(["10A", "9", "10"]).join()}`);
  }
  if (sortPlots(["12", "12", "12"]).length !== 1) fail("a plot can be listed twice");
}

// 6. Asked for twice, on the same utility.
//
//    Flagged, not removed: twice is sometimes right — a service aborted
//    and rescheduled — and dropping them would answer a question nobody
//    asked. What is not right is nobody noticing.
{
  const prior = [{ utility_ids: [2], plots: ["13"] }];
  if (alreadyCalledOff(["12", "13"], [2], prior).join() !== "13") {
    fail("a plot already called off for this utility is not flagged");
  }
  /* A different utility is a different job. Gas already in does not
     make the electric a duplicate. */
  if (alreadyCalledOff(["12", "13"], [1], prior).length) {
    fail("a plot called off for gas is flagged when asking for electric");
  }
  /* And nothing is claimed before a utility is chosen. */
  if (alreadyCalledOff(["13"], [], prior).length) {
    fail("plots are flagged before any utility is picked");
  }
}

// 7. The prior list is read one way.
//
//    Three places re-read the call-offs — when a project opens, after a
//    mains one is raised, and after a service one. Three copies of the
//    mapping is three chances for the duplicate check to be reading
//    something different from what the panel shows.
{
  const rows = [
    { Submission_ID: 1, Selection_Mode: "PlotList", utility_ids: [2],
      items: [{ Plot: " 13 " }] },
    { Submission_ID: 2, Selection_Mode: "Span", items: [{ Plot: "99" }] },
  ];
  const out = priorServicesFrom(rows);
  if (out.length !== 1) fail("a mains call-off is read as a service one");
  if (out[0].plots[0] !== "13") fail("plot numbers are not trimmed");

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if ((canvas.match(/priorServicesFrom\(/g) || []).length < 3) {
    fail("the canvas maps prior call-offs itself somewhere");
  }
}

// 8. The panel asks for utilities and refuses to raise without them.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Ticked, not derived. The drawing knows what is routed along a
     trench; it does not know what is being connected today. */
  if (!/setServiceUtils/.test(canvas)) fail("the utilities cannot be chosen");
  if (!/utility_ids: serviceUtils/.test(canvas)) {
    fail("the chosen utilities are not sent");
  }
  /* On the button as well as in the handler. The handler alone means
     the button looks live and does nothing, which reads as the app
     being broken rather than the form being incomplete — and a search
     of the whole file passed on the handler while the button had lost
     it. */
  /* Back to the button's own opening tag rather than a fixed 400
     characters — the disabled condition has grown a clause and a
     comment since, which pushed the earlier part of it out of the
     window and failed on correct code. */
  const btnAt = canvas.indexOf("onClick={submitServiceCallOff}");
  const btn = btnAt < 0 ? ""
    : canvas.slice(canvas.lastIndexOf("<button", btnAt), btnAt);
  /* Each clause separately: the condition has grown and now wraps
     across lines, so matching the two together failed on correct
     code. */
  for (const [clause, what] of [
    [/!servicePlots\.length/, "no plots"],
    [/!serviceUtils\.length/, "no utilities"],
  ]) {
    if (!clause.test(btn)) fail(`the raise button is live with ${what}`);
  }
  if (!/if \(!projectId \|\| !servicePlots\.length \|\| !serviceUtils\.length\) return;/
    .test(canvas)) {
    fail("the handler will raise a call-off with nothing on it");
  }

  /* Raised as a plot list, into the same table as everything else — so
     the office sees no difference between one raised here and one typed
     in on the project's tab. */
  if (!/Selection_Mode: "PlotList"/.test(canvas)) {
    fail("a service call-off is not raised as a plot list");
  }
  if (!/items: servicePlots\.map/.test(canvas)) {
    fail("the plots are not sent as the call-off's rows");
  }

  /* And the two pickers cannot both be waiting for the next tap. */
  const open = canvas.slice(canvas.indexOf('label="New Service Call-off"'));
  if (!/setCallOffOpen\(false\)/.test(open.slice(0, 900))) {
    fail("opening the service panel leaves the mains picker listening");
  }
}

// 9. Summary says what will be raised.
{
  if (!/2 plots/.test(serviceSummary(["12", "13"], ["Gas"]))) {
    fail("the summary does not count the plots");
  }
  if (!/1 plot\b/.test(serviceSummary(["12"], ["Gas"]))) {
    fail("one plot is called plots");
  }
  if (!/no utilities/.test(serviceSummary(["12"], []))) {
    fail("a call-off with no utilities chosen does not say so");
  }
}

// 10. Only the utilities a plot is connected to.
//
//     Street lighting is called off by column: a column sits on the
//     lighting layer, is fed from the LV network, and has no plot at
//     all. A lighting pill on a form collecting plot numbers offers a
//     call-off that cannot be worked, and the mistake surfaces on site.
{
  for (const u of [{ Utility: "Electric" }, { Utility: "Gas" }, { Utility: "Water" }]) {
    if (!servicedByPlot(u)) fail(`${u.Utility} is not offered on a service call-off`);
  }
  for (const u of [{ Utility: "Street Lighting" }, { layer_key: "lighting" },
    { Utility: "Telecoms" }, {}]) {
    if (servicedByPlot(u)) {
      fail(`${u.Utility ?? u.layer_key ?? "an unnamed utility"} is offered by plot`);
    }
  }

  /* The pills are per group now, and the groups are built from the
     project's own utilities — which are the ones connected by plot, so
     street lighting never reaches them. serviceGroupsFor is where that
     is enforced, tested above; this used to check a filter the panel no
     longer has. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/serviceGroupsFor\(utilities\)/.test(canvas)) {
    fail("the pills are not narrowed to what the project has");
  }
  if (serviceGroupsFor([{ layer_key: "lighting" }]).length) {
    fail("street lighting is offered as a service call-off");
  }
}

// 11. What the submission insists on.
//
//     Contact_Name and Preferred_Date are NOT NULL. Leaving them out
//     failed at the moment of raising, with a constraint error nobody
//     could act on — the mains path has always set them and this one
//     was written without looking at what the table requires.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function submitServiceCallOff");
  const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("\n  async function", at + 10));

  for (const f of ["Contact_Name", "Preferred_Date"]) {
    if (!body.includes(f)) fail(`a service call-off is raised with no ${f}`);
  }
  /* The same defaults the mains path uses, so the two do not disagree
     about who raised a call-off with nobody named on it. */
  if (!/raisedByName \|\| "Site"/.test(body)) {
    fail("the contact is not defaulted the way the mains call-off defaults it");
  }

  /* Read from the schema rather than listed here, so a column made NOT
     NULL later is caught rather than waiting to be discovered by
     somebody pressing the button. */
  const sql = readFileSync("./supabase/migrations/0111_call_offs.sql", "utf8");
  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS "Mains_Call_Off_Submission"'));
  const decl = table.slice(0, table.indexOf(");"));
  for (const line of decl.split("\n")) {
    const m = line.match(/^\s*"(\w+)"\s+[\w ]+NOT NULL(?! DEFAULT)/);
    if (!m) continue;
    const col = m[1];
    if (col === "Submission_ID" || col === "Status") continue;
    if (!body.includes(col)) {
      fail(`${col} is required on a submission and the service call-off omits it`);
    }
  }
}

// 12. The customer, from the plots.
//
//     A service call-off has no runs, so the mains rule — metres of
//     trench per developer — had nothing to measure and left the
//     customer blank on every one. The same question, counted rather
//     than measured: whoever owns most of the plots.
{
  const area = (id, poly) => ({
    Feature_Type: "polygon", Layer_Key: "boundary",
    Geometry: poly, Attributes: { Project_Developer_ID: id },
  });
  const seed = (plotId, x, y) => ({
    Feature_Role: "plot", Plot_ID: plotId, Geometry: [[x, y]],
  });
  const site = [
    area(7, [[0, 0], [100, 0], [100, 100], [0, 100]]),
    area(8, [[100, 0], [200, 0], [200, 100], [100, 100]]),
    seed(1, 10, 10), seed(2, 20, 20), seed(3, 150, 50), seed(4, 160, 60),
  ];
  const list = [
    { plot_id: 1, plot_number: "12" }, { plot_id: 2, plot_number: "13" },
    { plot_id: 3, plot_number: "40" }, { plot_id: 4, plot_number: "41" },
  ];
  const branches = [
    { Branch_ID: 1, Customer_ID: 10, Branch_Dropdown: "Barratt (Yorkshire East)" },
    { Branch_ID: 2, Customer_ID: 20, Branch_Dropdown: "Anwyl (Wales)" },
  ];
  const customers = [
    { Customer_ID: 10, Customer_Name: "Barratt Homes" },
    { Customer_ID: 20, Customer_Name: "Anwyl Homes" },
  ];
  const devs = [
    { Project_Developer_ID: 7, Branch_ID: 1 },
    { Project_Developer_ID: 8, Branch_ID: 2 },
  ];
  const who = (plots) =>
    serviceCallOffCustomer(plots, site, list, devs, branches, customers);

  if (who(["12", "13"]).Branch_Name !== "Barratt (Yorkshire East)") {
    fail("plots wholly in one developer's area got no customer");
  }
  if (who(["12", "13"]).Customer_Name !== "Barratt Homes") {
    fail("the customer does not follow the branch");
  }
  /* Most of them, so a call-off crossing a boundary still goes
     somewhere. */
  if (who(["12", "13", "40"]).Branch_Name !== "Barratt (Yorkshire East)") {
    fail("two plots against one did not go to the two");
  }
  /* Ordered by count, not by whichever developer was seen first.

     The plot order matters here: 12 is developer 7 and is listed first,
     while 40 and 41 are developer 8. A rule that took the first entry
     rather than the largest would name Barratt. The earlier version of
     this test listed them the other way round, so both rules gave the
     same answer and the check proved nothing. */
  if (who(["12", "40", "41"]).Branch_Name !== "Anwyl (Wales)") {
    fail("it does not count — it takes whichever developer came first");
  }
  /* An even split is a coin toss, and a name invented for it would be
     read as an answer. */
  if (who(["12", "40"]).Branch_Name) {
    fail("an even split picked a developer anyway");
  }
  /* A plot not on the drawing is counted for nobody rather than
     guessed at. */
  if (who(["99"]).Branch_Name) fail("a plot with no seed was attributed");

  /* Both routes name a developer's branch through one function, or the
     mains and service paths would eventually disagree about the same
     developer. */
  const mod = readFileSync("./src/features/gis/callOffCustomer.js", "utf8");
  if ((mod.match(/branchFor\(/g) || []).length < 3) {
    fail("the two routes resolve a branch separately");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/serviceCallOffCustomer\(servicePlots/.test(canvas)) {
    fail("the service call-off does not work out its customer from its plots");
  }
  if (/callOffCustomer\(\[\], features/.test(canvas)) {
    fail("the service call-off still asks the mains rule with nothing to measure");
  }
}

// 13. The team count says only what it knows.
//
//     It opened with "any craft in this region", which read as a
//     setting rather than as "nothing restricts it" — and the region
//     part repeated on every phase of every call-off.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const at = page.indexOf('className="asg-craft"');
  const label = at < 0 ? "" : page.slice(at, page.indexOf("</span>", at));
  if (/any craft/.test(label)) fail("the label still says 'any craft'");
  if (/in this region/.test(label)) fail("the label still repeats the region");
  /* A required craft is still worth saying: it explains a short list. */
  if (!/needs \$\{craftName/.test(label)) {
    fail("a phase that needs a particular craft no longer says so");
  }
  if (!/team\$\{can\.length === 1/.test(label)) {
    fail("the count of teams is gone");
  }
}

// 14. Opening it sets the drawing up for the job.
//
//     Plot seeds because they are what is being tapped; the mains trench
//     because a plot is recognised by which run it sits off. Seeds alone
//     are dots on a plan.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf('label="New Service Call-off"');
  /* The whole menu item, to its closing `}} />` — a fixed window
     stopped short of the restore branch and reported it missing on
     correct code. */
  const item = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}} />", at) + 5);

  if (!/applyShown\(\["role:plot", "lt:trench_main"\]\)/.test(item)) {
    fail("opening the panel does not show the plots and the mains trench");
  }
  /* Labels off: each seed carries its plot number and each trench its
     length, and at a zoom showing a street of seeds those overlap into
     a wall of text with the seeds behind it. */
  if (!/setShowLabels\(false\)/.test(item)) {
    fail("the labels are left on over the seeds being tapped");
  }

  /* And the drawing goes back when the panel closes. Somebody who came
     to raise a call-off did not ask for a permanently changed view. */
  if (!/applyShown\(\[\]\)/.test(item)) {
    fail("closing the panel leaves the drawing isolated");
  }
  if (!/setShowLabels\(true\)/.test(item)) {
    fail("closing the panel leaves the labels off");
  }

  /* The two keys, checked against how a feature declares them: a key
     that matches nothing hides the whole drawing, and a key that
     matches too much brings back the services and meters the isolate
     exists to get out of the way. */
  const classKeys = (f) => [
    f.Layer_Key,
    f.Attributes?.Line_Type ? `lt:${f.Attributes.Line_Type}` : null,
    f.Feature_Role && f.Feature_Role !== "shape" ? `role:${f.Feature_Role}` : null,
    f.Layer_Key && f.Feature_Role && f.Feature_Role !== "shape"
      ? `${f.Layer_Key}:role:${f.Feature_Role}` : null,
  ].filter(Boolean);
  const shown = (f) => classKeys(f).some((k) =>
    ["role:plot", "lt:trench_main"].includes(k));

  if (!shown({ Layer_Key: "plot", Feature_Role: "plot" })) {
    fail("a plot seed is hidden by the isolate meant to show it");
  }
  if (!shown({ Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } })) {
    fail("the mains trench is hidden by the isolate meant to show it");
  }
  for (const [what, f] of [
    ["a gas service", { Layer_Key: "gas", Attributes: { Line_Type: "gas_service" } }],
    ["a meter", { Layer_Key: "gas", Feature_Role: "meter" }],
    ["a service trench", { Layer_Key: "trench", Attributes: { Line_Type: "trench_service" } }],
  ]) {
    if (shown(f)) fail(`${what} is still on top of the seeds being tapped`);
  }
}

// 15. A plot off a dead main cannot be picked.
//
//     A service call-off sends a gang to connect these plots. If the
//     main feeding one has not been made live there is nothing to
//     connect to and the visit is wasted — which the drawing already
//     knew and used to keep to itself.
{
  const LT = [
    { Type_Key: "gas_main", Layer_Key: "gas" },
    { Type_Key: "gas_service", Layer_Key: "gas" },
  ];
  const main = (id, st, geom) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "gas",
    Geometry: geom ?? [[0, 0], [100, 0]],
    Attributes: { Line_Type: "gas_main", Build_Status: st },
  });
  const svc = (id, connects) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "gas",
    Geometry: [[50, 0], [50, 20]],
    Attributes: { Line_Type: "gas_service", ...(connects ? { Connects: connects } : {}) },
  });
  const at = (features) => plotSupplyState({
    anchor: [50, 20], utility: "gas", features, lineTypes: LT,
  });

  if (at([main(1, "live"), svc(2, [1])]).state !== "live") {
    fail("a plot off a live main cannot be picked");
  }
  /* As Laid is not live: the pipe is in the ground and still cannot be
     connected to. */
  if (at([main(1, "aslaid"), svc(2, [1])]).state !== "dead") {
    fail("a plot off an as-laid main reads as connectable");
  }
  if (at([main(1, "planned"), svc(2, [1])]).state !== "dead") {
    fail("a plot off a planned main reads as connectable");
  }
  /* The words the office agreed. */
  if (at([main(1, "planned"), svc(2, [1])]).why !== "The Feeder Main is not yet live.") {
    fail("the message is not the one that was asked for");
  }

  /* Followed by geometry where Connects was never recorded — and along
     the main, not to its vertices: a service tees into the middle of a
     main far more often than at an end. */
  if (at([main(1, "live"), svc(2, null)]).state !== "live") {
    fail("a service that tees mid-main cannot find it");
  }
  /* A main two metres from the service's end is no longer "not
     joined": the trace fails, and the fallback answers from the nearest
     main in range — which is the point of it, because a service drawn
     by hand routinely ends a little short.

     What still has to hold is that the verdict is honest about where it
     came from, so a wrong answer can be recognised as a guess. */
  const near = at([main(1, "live", [[0, -2], [100, -2]]), svc(2, null)]);
  if (near.state === "live" && !near.viaNearest) {
    fail("a main two metres away was treated as traced rather than guessed");
  }
  /* And beyond reach it is still unknown. */
  if (at([main(1, "live", [[0, 400], [100, 400]]), svc(2, null)]).state !== "unknown") {
    fail("a main hundreds of metres away was used");
  }

  /* Silence is not a yes. The point is to stop a gang being sent to a
     dead main, and an unanswerable question is not a reason to send
     them. */
  for (const [what, f] of [
    /* A plot with no service is no longer unknown: the nearest main
       answers instead, because at the moment plots are picked the
       services have not been laid. Its own case below. */
    ["a main with no status", [main(1, null), svc(2, [1])]],
    ["a service reaching no main", [svc(2, null)]],
  ]) {
    if (at(f).state === "live") fail(`${what} was treated as connectable`);
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* Read from the shared verdict now, rather than recomputed at the
     tap — checked in its own section below. */
  if (!/v\?\.state === "dead"/.test(canvas)) {
    fail("tapping a plot off a dead main still adds it");
  }
  /* Only on the way in — refusing to remove one would strand somebody
     who picked it before the status was corrected. */
  if (!/const already = servicePlots\.includes\(plot\);/.test(canvas)) {
    fail("a plot already picked cannot be taken off the list");
  }

  /* ── Whatever order somebody works in ──

     The check used to run only once a utility was ticked, and the panel
     invites tapping plots first — so for anybody working in that order
     it never ran at all and dead plots went straight onto the list. */
  if (/if \(!already && serviceUtils\.length\)/.test(canvas)) {
    fail("plots are only checked after a utility is ticked");
  }
  if (!/utilitiesToTest\(serviceUtils, lookups\?\.utilities \|\| \[\]\)/.test(canvas)) {
    fail("the plot check does not know which utilities to ask about");
  }

  /* Every utility until one is chosen: a plot fed from a dead main on
     all of them cannot be connected for any of them. */
  const U = [
    { Utility_ID: 1, Utility: "Electric" }, { Utility_ID: 2, Utility: "Gas" },
    { Utility_ID: 3, Utility: "Water" }, { Utility_ID: 4, Utility: "Street Lighting" },
  ];
  if (utilitiesToTest([], U).join() !== "electric,gas,water") {
    fail(`with nothing ticked it tests ${utilitiesToTest([], U).join("/") || "nothing"}`);
  }
  if (utilitiesToTest([1], U).join() !== "electric") {
    fail("ticking one utility does not narrow the check to it");
  }
  /* Street lighting is not connected by plot, so it is never asked. */
  if (utilitiesToTest([4], U).length) {
    fail("street lighting is checked against plots");
  }

  /* And ticking a utility after picking re-asks about what is already
     on the list — otherwise a call-off could still be raised against a
     dead feeder by working in that order. */
  if (!/const deadNow = servicePlots\.filter/.test(canvas)) {
    fail("plots already picked are never re-checked");
  }
  /* Flagged, and not raisable past. A warning somebody can raise past
     is a warning that gets raised past. */
  if (!/\|\| !!deadNow\.length/.test(canvas)) {
    fail("a call-off can still be raised with a dead plot on it");
  }

  /* The hatching is shown while picking, and not at every other time —
     a marking that is always on is one nobody reads. */
  if (!/for \(const f of \(serviceOpen \? features : \[\]\)\)/.test(canvas)) {
    fail("live and dead mains are hatched outside the call-off picker");
  }
  /* Each dependency by name, not the exact tail of the list — it has
     grown twice and both times these went red on correct code. */
  for (const dep of ["serviceOpen", "servicePlots", "priorServices"]) {
    if (!new RegExp(`\\b${dep}, `).test(canvas)) {
      fail(`the drawing does not depend on ${dep}, so it will not redraw`);
    }
  }
}

// 16. The substation is energised once.
//
//     The first electric service call-off on a site switches it on: the
//     transformer goes live and so does the network. A day's work,
//     happening as part of that visit rather than as a job of its own —
//     so it is a phase on that call-off and on no other.
{
  const U = [
    { Utility_ID: 1, Utility: "Electric" },
    { Utility_ID: 2, Utility: "Gas" },
  ];
  const e = electricUtilityId(U);
  if (e !== 1) fail("the electric utility cannot be identified");

  if (!firstElectricCallOff([], e)) fail("the first call-off is not the first");
  if (!firstElectricCallOff([{ status: "Complete", utility_ids: [2] }], e)) {
    fail("a gas call-off used up the energisation");
  }
  if (firstElectricCallOff([{ status: "Scheduled", utility_ids: [1] }], e)) {
    fail("the substation would be energised twice");
  }
  /* A withdrawn one energised nothing, so the next still carries it —
     otherwise the site has no energisation booked at all. */
  if (!firstElectricCallOff([{ status: "Withdrawn (Customer)", utility_ids: [1] }], e)) {
    fail("a withdrawn call-off still holds the energisation");
  }
  /* Aborted is not withdrawn: that visit is being rescheduled and the
     energisation is still coming with it. */
  if (firstElectricCallOff([{ status: "Aborted", utility_ids: [1] }], e)) {
    fail("an aborted call-off gave up its energisation");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* Anchored on the payload key, not merely the name — a field renamed
     to X_Needs_Energisation still contains it, and the endpoint would
     drop it silently while this passed. */
  if (!/^\s+Needs_Energisation: serviceUtils/m.test(canvas)) {
    fail("raising a call-off does not decide whether it energises");
  }
  /* Only where electric is being connected. */
  if (!/includes\(Number\(electricUtilityId/.test(canvas)) {
    fail("a gas-only call-off can carry the energisation");
  }

  /* The endpoints carry it, or the flag is set and never stored, and
     the assignment panel never sees it. */
  const write = readFileSync("./netlify/functions/calloffs.js", "utf8");
  if (!/"Needs_Energisation"/.test(write)) {
    fail("the flag is dropped on the way in");
  }
  /* Dig_Rate_ID was missing from the same list, so the machine picker
     was silently discarding its answer. */
  if (!/"Dig_Rate_ID"/.test(write)) {
    fail("the chosen machine is dropped on the way in");
  }
  const list = readFileSync("./netlify/functions/calloffs-all.js", "utf8");
  if (!/"Needs_Energisation"/.test(list)) {
    fail("the list does not carry the flag, so no phase is added");
  }

  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  if (!/r\.Needs_Energisation/.test(page)) {
    fail("the call-off carrying it gets no energisation phase");
  }
  /* Added once. A phase listed twice is a day booked twice. */
  if (!/!phases\.some\(\(p\) => Number\(p\.Task_Type_ID\)/.test(page)) {
    fail("the energisation phase can be added twice");
  }

  /* ── And in the order the work happens ──

     The cable goes in, the substation is switched on, the joints are
     made onto a live network, and the ground is reinstated last.
     Appended, it sat after reinstatement and read as work happening
     once the ground was closed. */
  if (!/phases\.sort\(\(a, b\) =>/.test(page)) {
    fail("the energisation phase is added on the end rather than in order");
  }

  const sql = readFileSync("./supabase/migrations/0180_energisation.sql", "utf8");
  if (!/SELECT 'Energisation', 15, true/.test(sql)) {
    fail("the energisation phase is not ordered between lay and jointing");
  }
  /* And moved if an earlier run of this file seeded it elsewhere. */
  if (!/SET "Display_Order" = 15/.test(sql)) {
    fail("a phase seeded at the wrong order is left there");
  }

  /* The order has to reach the page, or there is nothing to sort on —
     this phase is added by a flag rather than by the work type's
     mapping, so the mapping's own order does not cover it. */
  if (!/Task_Type_ID,Task_Type_Name,Display_Order/.test(list)) {
    fail("the phase order is not sent, so the sort does nothing");
  }

  /* The sequence itself. */
  const T = (o, n) => ({ Task_Type_Name: n, Display_Order: o });
  const mapping = [T(10, "Excavation and Lay"), T(20, "Jointing"), T(30, "Reinstatement")];
  const withEn = [...mapping, T(15, "Energisation")]
    .sort((a, b) => (Number(a.Display_Order) || 0) - (Number(b.Display_Order) || 0))
    .map((x) => x.Task_Type_Name);
  if (withEn.join(" ") !== "Excavation and Lay Energisation Jointing Reinstatement") {
    fail(`the phases came out as ${withEn.join(" then ")}`);
  }
}

// 17. What is being connected, chosen before the plots.
//
//     A plot cannot be checked against a dead main until the panel
//     knows which main to look at — and the answer decides what the
//     whole call-off is. Asked first rather than discovered at the end.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const P = (...k) => k.map((x, i) => ({ Utility_ID: i + 1, layer_key: x }));

  /* Electric on its own, or gas and water together. How the work goes
     out: gas and water share a trench and a visit, the electric follows
     once the network is energised. */
  const all = serviceGroupsFor(P("electric", "gas", "water"));
  if (all.map((g) => g.label).join(" | ") !== "Electric | Gas & Water") {
    fail(`the pills read ${all.map((g) => g.label).join(" | ")}`);
  }
  if (!isWholeGroup(["electric"], all)) fail("electric alone is refused");
  if (!isWholeGroup(["gas", "water"], all)) fail("gas and water together is refused");
  /* Half a group is the case this exists to stop: gas without water
     leaves the water gang a second trip to the same trench. */
  if (isWholeGroup(["gas"], all)) fail("gas alone is allowed on a site with water");
  if (isWholeGroup(["electric", "gas"], all)) {
    fail("electric and gas can be called off together");
  }
  if (isWholeGroup([], all)) fail("choosing nothing counts as a choice");

  /* Narrowed to what the site has. A gas-only project offers "Gas",
     which is a whole call-off rather than half of one — and offering
     water on a site with none is offering a call-off nobody can
     raise. */
  const gasOnly = serviceGroupsFor(P("gas"));
  if (gasOnly.map((g) => g.label).join() !== "Gas") {
    fail(`a gas-only site offers ${gasOnly.map((g) => g.label).join(" | ")}`);
  }
  if (!isWholeGroup(["gas"], gasOnly)) {
    fail("gas alone is refused on a site with no water");
  }
  if (serviceGroupsFor(P("gas", "water")).some((g) => g.key === "electric")) {
    fail("a site with no electric is offered an electric call-off");
  }

  /* And the panel asks before a plot can be picked. */
  if (!/setError\(chooseUtilityFirst\(serviceGroupsFor\(utilities\)\)\)/.test(canvas)) {
    fail("plots can be picked before choosing what is being connected");
  }
  if (!/serviceGroups\.map\(\(g\) => \{/.test(canvas)) {
    fail("the pills are one per utility rather than one per group");
  }

  /* ── Fewer plots than the contract expects ──

     Said as a choice rather than a refusal: there are good reasons to
     go short and the office is the one that knows. */
  if (!/servicePlots\.length < minPlots/.test(canvas)) {
    fail("nothing says when a call-off is under the minimum");
  }
  if (!/Minimum_Service_Call_Off/.test(canvas)) {
    fail("the minimum is not read from the project");
  }
  /* Null is not zero: a project with no minimum agreed says nothing at
     all rather than objecting to every call-off. */
  if (!/Number\(project\?\.Minimum_Service_Call_Off\) \|\| 0/.test(canvas)) {
    fail("a project with no minimum set would still warn");
  }
  if (!/!!minPlots && servicePlots\.length > 0/.test(canvas)) {
    fail("the warning shows before any plot is picked");
  }
  /* The penalty button visibly does not work, rather than quietly
     setting a flag whose meaning nobody has agreed. */
  if (!/Accepting a penalty is not built yet/.test(canvas)) {
    fail("the penalty button pretends to work");
  }
}

// 18. Judged before the services exist, and shown on every plot.
//
//     A service call-off is raised to get the services put in, so at
//     the moment somebody is picking plots there is usually no service
//     cable to follow. Answering "unknown" then meant the rule never
//     fired for the case it was written for — which is exactly what
//     happened: plots off a Planned feeder went straight onto a list.
{
  const LT = [
    { Type_Key: "elec_main", Layer_Key: "electric" },
    { Type_Key: "elec_service", Layer_Key: "electric" },
  ];
  const feeder = (st, geom) => ({
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: geom ?? [[0, 0], [100, 0]],
    Attributes: { Line_Type: "elec_main", Build_Status: st },
  });
  const ask = (f, anchor = [50, 12]) => plotSupplyState({
    anchor, utility: "electric", features: f, lineTypes: LT,
  });

  if (ask([feeder("planned")]).state !== "dead") {
    fail("a plot off a planned feeder is allowed when no service is drawn yet");
  }
  if (ask([feeder("aslaid")]).state !== "dead") {
    fail("a plot off an as-laid feeder is allowed before its service exists");
  }
  if (ask([feeder("live")]).state !== "live") {
    fail("a plot off a live feeder is refused before its service exists");
  }

  /* ── From where the supply arrives, not from the seed ──

     A seed sits inside the plot; the service runs to the meter on the
     boundary, often ten metres away. Measuring from the seed found no
     service at all, so every plot came back unanswerable and drew a
     question mark — the fault that survived three attempts at this,
     because each one fixed how the search worked and not where it
     started.

     mainsCallOff walks from meters for exactly this reason. */
  {
    const far = {
      Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [[0, 0], [200, 0]],
      Attributes: { Line_Type: "elec_main", Build_Status: "planned" },
    };
    const trench = {
      Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[50, 0], [50, 70]], Attributes: { Line_Type: "trench_service" },
    };
    const meter = {
      Feature_ID: 3, Feature_Role: "meter", Layer_Key: "electric",
      Plot_ID: 7, Geometry: [[50, 70]],
    };
    const seed = {
      Feature_ID: 4, Feature_Role: "plot", Plot_ID: 7, Geometry: [[50, 78]],
      Attributes: { Boundary_At: [50, 70] },
    };
    const world = [far, trench, meter, seed];

    /* Deliberately beyond the nearest-main reach, so only the service
       route can answer and the fallback cannot mask the difference. */
    const fromSeed = plotSupplyState({
      anchor: seed.Geometry[0], utility: "electric",
      features: world, lineTypes: LT,
    });
    if (fromSeed.state !== "unknown") {
      fail("the fixture no longer isolates the anchor question");
    }

    const anchors = anchorsFor(seed, world, "electric");
    if (!anchors.length) fail("a plot has nowhere its supply arrives");
    /* The meter first, then the boundary, then the seed. */
    if (anchors[0][1] !== 70) fail("the meter is not tried first");
    if (anchors[anchors.length - 1][1] !== 78) fail("the seed is not the last resort");

    /* Each source proved on its own, with the others taken away —
       otherwise the boundary point stands in for the meter, the seed
       stands in for the boundary, and removing any one of them changes
       nothing that can be seen. That is why three breaks of this passed
       against a fixture that had all three. */
    const meterOnly = anchorsFor(
      { ...seed, Attributes: {}, Geometry: [[999, 999]] }, world, "electric",
    );
    if (!meterOnly.some((a) => a[1] === 70)) {
      fail("a plot's meter is not used to find where its supply arrives");
    }
    const boundaryOnly = anchorsFor(seed, [seed], "electric");
    if (!boundaryOnly.some((a) => a[1] === 70)) {
      fail("a plot's boundary point is not used when it has no meter");
    }
    if (!boundaryOnly.some((a) => a[1] === 78)) {
      fail("a plot with neither is not even tried at its seed");
    }

    /* And every anchor is tried, not just the first. The meter here
       finds nothing; the answer has to come from one of the others. */
    const noMeterWorld = world.filter((f) => f.Feature_Role !== "meter");
    const tried = plotSupplyState({
      anchors: [[999, 999], [50, 70]], utility: "electric",
      features: noMeterWorld, lineTypes: LT,
    });
    if (tried.state !== "dead") {
      fail("only the first anchor is tried, so a plot answered by the second is missed");
    }

    const fromMeter = plotSupplyState({
      anchors, utility: "electric", features: world, lineTypes: LT,
    });
    if (fromMeter.state !== "dead") {
      fail(`anchored on the meter, the plot reads as ${fromMeter.state}`);
    }

    const canvasSrc = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    if (!/anchors: anchorsFor\(f, features, utility\)/.test(canvasSrc)) {
      fail("the drawing still judges plots from the seed");
    }
  }

  /* ── Followed by the service, not by proximity ──

     A plot is fed by a main because its service runs to that main. On a
     site with two roads alongside each other, nearest puts the plots
     from one road on the other road's feeder — the mistake
     mainsCallOff.js records having made and fixed, and this is the same
     relationship followed the same way.

     The service *trench* counts, which is the point: a service call-off
     is raised before any cable is laid, so the trench is what says
     where the plot connects. Asking only the utility's own layer found
     nothing and made every plot unanswerable, which is what put a
     question mark on all of them. */
  const svcTrench = {
    Feature_ID: 7, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[50, 0], [50, 11]], Attributes: { Line_Type: "trench_service" },
  };
  const viaTrench = ask([feeder("planned"), svcTrench]);
  if (viaTrench.state !== "dead") {
    fail(`a plot on a service trench to a planned main reads as ${viaTrench.state}`);
  }
  if (viaTrench.viaNearest) {
    fail("the trench was ignored and the nearest main guessed at instead");
  }
  if (ask([feeder("live"), svcTrench]).state !== "live") {
    fail("a plot on a service trench to a live main is refused");
  }

  /* And the main has to be the right utility: a gas main touching the
     same trench does not answer for electric. */
  const gasMain = {
    Feature_ID: 8, Feature_Type: "line", Layer_Key: "gas",
    Geometry: [[0, 0], [100, 0]],
    Attributes: { Line_Type: "gas_main", Build_Status: "live" },
  };
  if (ask([gasMain, svcTrench]).state === "live") {
    fail("a live gas main made an electric plot connectable");
  }

  /* ── A service that cannot be traced falls back too ──

     Connects is only written when a service is laid by the application,
     and one drawn or dragged by hand can end a metre off the main it
     feeds. Without this, having a service made the answer worse than
     having none: a plot with no service fell back to the nearest main
     and was judged, while its neighbour with one came back "cannot
     tell" and drew a question mark. */
  const strayService = {
    Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[50, 1.2], [50, 12]], Attributes: { Line_Type: "elec_service" },
  };
  const stray = ask([feeder("planned"), strayService]);
  if (stray.state !== "dead") {
    fail(`a plot whose service misses the main reads as ${stray.state}`);
  }
  if (ask([feeder("live"), strayService]).state !== "live") {
    fail("a plot off a live main is not connectable when its service strays");
  }
  /* And a service that reaches no main at all, with no main in range
     either, is still honestly unknown. */
  if (ask([strayService]).state !== "unknown") {
    fail("a plot with no main anywhere was given a verdict");
  }

  /* Within reach. Without a limit the answer is always some main
     somewhere, and a plot would be judged against a feeder on the next
     street. */
  if (ask([feeder("planned", [[0, 300], [100, 300]])]).state === "dead") {
    fail("a plot is judged against a main hundreds of metres away");
  }
  /* Measured to the line, not to its ends: a plot opposite the middle
     of a long feeder is inches from it. */
  if (ask([feeder("planned")], [50, 12]).state !== "dead") {
    fail("distance is measured to the feeder's ends rather than to the feeder");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Every plot marked, once a utility is chosen — somebody choosing
     where the work goes needs to see where it can go, rather than
     finding out by tapping each one. */
  if (!/const plotSupply = useMemo/.test(canvas)) {
    fail("plots are not judged until they are tapped");
  }
  if (!/if \(!serviceOpen \|\| !serviceUtils\.length\) return out;/.test(canvas)) {
    fail("the marks show outside the picker, or before a utility is chosen");
  }
  /* Every utility being connected has to be live, not just one: a
     gas-and-water visit that finds the water main dead is half a
     visit. */
  if (!/states\.every\(\(r\) => r\.state === "live"\)/.test(canvas)) {
    fail("a plot is ticked when only one of its utilities is live");
  }
  if (!/states\.find\(\(r\) => r\.state === "dead"\)/.test(canvas)) {
    fail("a plot with one dead utility is not crossed");
  }

  /* And the tap reads the same verdict the drawing is showing — two
     answers to one question is a cross beside a plot the panel
     accepts. */
  if (!/const v = plotSupply\.get\(Number\(hit\.Feature_ID\)\);/.test(canvas)) {
    fail("the tap guard works the answer out a second time");
  }
  /* Drawn as a tick and a cross rather than only a colour, which a
     colour-blind reader cannot tell apart on a busy plan. */
  if (!/live \? "#16a34a" : "#dc2626"/.test(canvas)) {
    fail("the marks are not green and red");
  }
  if (!/\bplotSupply, /.test(canvas) && !/\bplotSupply\]\);/.test(canvas)) {
    fail("choosing a utility does not redraw the marks");
  }
}

// 19. A plot already going out says so, and when.
//
//     Adding it to a second call-off sends two gangs to one plot. A
//     clock rather than a cross, because there is nothing wrong with
//     the plot — the work is booked.
{
  const prior = [
    { submission: 41, status: "Scheduled", utility_ids: [1],
      plots: ["12", "13"], plannedFor: "2026-09-14", reference: "AP-900" },
    { submission: 42, status: "Complete", utility_ids: [1],
      plots: ["14"], plannedFor: "2026-07-01" },
    { submission: 43, status: "Pending Review", utility_ids: [2],
      plots: ["15"], plannedFor: "2026-08-30" },
  ];

  if (bookedFor("12", [1], prior)?.submission !== 41) {
    fail("a plot already called off is not recognised");
  }
  /* Finished work is a different question: that plot is connected, and
     whether to call it off again is not what this asks. */
  if (bookedFor("14", [1], prior)) {
    fail("a completed call-off still blocks its plots");
  }
  /* Per utility. A plot booked for gas is free for electric. */
  if (bookedFor("15", [1], prior)) fail("a gas booking blocks an electric one");
  if (!bookedFor("15", [2], prior)) fail("a gas booking is not seen for gas");
  if (bookedFor("99", [1], prior)) fail("an unbooked plot reads as booked");

  /* Withdrawn and aborted are finished too — neither is work still
     coming. */
  for (const st of ["Withdrawn (Customer)", "Aborted"]) {
    if (bookedFor("12", [1], [{ ...prior[0], status: st }])) {
      fail(`a ${st} call-off still blocks its plots`);
    }
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Asked before the main's status: whether the feeder is live is the
     previous call-off's problem, and this plot has a date either
     way. */
  const supplyAt = canvas.indexOf("const plotSupply = useMemo");
  const body = supplyAt < 0 ? "" : canvas.slice(supplyAt, supplyAt + 2600);
  if (!/const booked = bookedFor\(plot, serviceUtils, priorServices\);/.test(body)) {
    fail("the booked state is not worked out from the prior call-offs");
  }
  if (body.indexOf("bookedFor(") > body.indexOf("plotSupplyState({")) {
    fail("a booked plot is judged on its main before its booking");
  }
  if (!/state: "booked"/.test(body)) fail("there is no booked state");

  /* ── The mark is drawn where the seed is ──

     It sat in the `else` branch of `if (isSeed)`, guarded by
     `isSeed && …`, so it could never run — and it read q.x and
     ps.symbolPx, which are the other branch's names and were undefined
     anyway. The tooltip worked, because the hover test used the seed's
     own position, and nothing was drawn. */
  const markAt = canvas.indexOf("Can this plot be connected");
  const seedAt = canvas.lastIndexOf("if (isSeed) {", markAt);
  if (markAt < 0 || seedAt < 0) fail("the plot marks are gone");
  else {
    let depth = 0;
    let inElse = false;
    for (const line of canvas.slice(seedAt, markAt).split("\n")) {
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth === 0) inElse = false;
      if (depth === 1 && /\} else \{/.test(line)) inElse = true;
    }
    if (inElse) fail("the marks are drawn in the branch seeds never take");
  }

  /* From the seed's own style and point, which are the ones in scope
     there — and the ones the hover test uses, so the mark and the note
     cannot end up in different places. */
  /* To the end of the block rather than a fixed window — it has grown
     a branch since and the window stopped reaching the lines below,
     failing on correct code. */
  const mark = markAt < 0 ? ""
    : canvas.slice(markAt, canvas.indexOf("A joint lies along its cable", markAt));
  if (!/const size = ss\.symbolPx \?\? 8;/.test(mark)) {
    fail("the mark is sized from a style a seed does not have");
  }
  if (!/const mx = p\.x \+ size \+ r;/.test(mark)) {
    fail("the mark is placed from a point a seed does not have");
  }
  if (!/const size = seedStyle\(f, false\)\.symbolPx \?\? 8;/.test(canvas)) {
    fail("the hover test sizes the mark differently from the drawing");
  }

  /* ── Every plot gets a mark, including the ones it cannot answer ──

     Unknown used to draw nothing, so a plot whose main could not be
     found looked exactly like a plot nobody had asked about — and if
     every plot came back unknown the whole feature looked as though it
     had not been built. A question mark says the question was asked and
     could not be answered, which points at what to fix. */
  if (/v && v\.state !== "unknown"/.test(canvas)) {
    fail("a plot whose main cannot be found is drawn as nothing");
  }
  if (!/const unknown = v\.state === "unknown";/.test(canvas)) {
    fail("there is no mark for a plot that cannot be judged");
  }

  /* And hovering explains any of them. A cross that will not say what
     is wrong is a mark somebody has to come and ask about. */
  if (/if \(v\?\.state !== "booked"\) continue;/.test(canvas)) {
    fail("only the clock explains itself");
  }
  for (const words of ["Ready to connect", "Cannot be connected", "Cannot tell"]) {
    if (!canvas.includes(words)) fail(`the note never says "${words}"`);
  }

  /* ── And the note actually appears ──

     It was set only when the submission changed, and only a booked plot
     has one — so for a cross or a question mark both sides were null,
     setPlotTip was never called, and nothing showed. The clock worked
     perfectly, which is what made it look like the marks were fine and
     only the hover text was missing. */
  if (/found\?\.submission \?\? null\) !== \(plotTip\?\.submission/.test(canvas)) {
    fail("only a booked plot can raise its note");
  }
  if (!/found\?\.featureId \?\? null\) === \(plotTip\?\.featureId/.test(canvas)) {
    fail("the note is not compared on which plot it belongs to");
  }
  if (!/featureId: Number\(f\.Feature_ID\)/.test(canvas)) {
    fail("the hovered mark does not record which plot it is");
  }

  /* The rule itself, over the three kinds of mark. */
  const same = (f, t) => (f?.featureId ?? null) === (t?.featureId ?? null);
  const cross = { featureId: 31, state: "dead" };
  const question = { featureId: 44, state: "unknown" };
  if (same(cross, null)) fail("moving onto a cross does not raise its note");
  if (same(question, cross)) fail("moving between two marks keeps the first note");
  if (same(null, question)) fail("moving off a mark leaves its note up");

  /* The clock, and the date behind it. */
  if (!/v\.state === "booked"/.test(canvas)) fail("a booked plot has no mark");
  /* The note has to render, not merely be styled — the class survives
     in the stylesheet after the element using it has gone. */
  if (!/\{plotTip && \(/.test(canvas)) {
    fail("hovering the clock says nothing about when");
  }
  if (!/className="gis-plottip"/.test(canvas)) {
    fail("the note has no markup");
  }
  /* And something has to find the clock under the pointer.

     The hit test itself, not setPlotTip — that is called twice for
     other reasons and matched with the test removed. */
  /* The hit test, without pinning the exact shape of what it records —
     that object has since gained a field and the old pattern failed on
     correct code. */
  /* The hit test and what it records, without pinning the exact shape
     of the object — that has gained a field since and the old pattern
     failed on correct code, while a looser one passed with the test
     itself removed. */
  if (!/if \(d <= rr \* 1\.6\) \{/.test(canvas)) {
    fail("nothing measures whether the pointer is over a mark");
  }
  if (!/found = \{ \.\.\.v,/.test(canvas)) {
    fail("nothing records the mark under the pointer");
  }
  if (!/Planned for /.test(canvas)) fail("the note does not give the date");
  /* Read the way a date is read here, not as the database stores it. */
  if (!/split\("-"\)\.reverse\(\)\.join\("\/"\)/.test(canvas)) {
    fail("the date is shown back to front");
  }
  /* A call-off with no date says so rather than showing nothing. */
  if (!/No date set on that call-off/.test(canvas)) {
    fail("a booking with no date shows an empty note");
  }
}

// 20. A main nobody has spoken about is not live.
//
//     This answered "unknown", which drew a question mark and let the
//     plot be picked. Liveness is a thing somebody asserts: a main
//     nobody has said anything about has certainly not been energised.
//
//     And the editor made it invisible. Its dropdown defaulted to
//     "Planned" when the attribute was empty, so a main with no stage
//     read as Planned on screen while the drawing saw nothing at all —
//     somebody checking why their plots would not connect looked at the
//     field, saw Planned, and had no way to know it disagreed.
{
  const LT2 = [
    { Type_Key: "elec_main", Layer_Key: "electric" },
    { Type_Key: "trench_service", Layer_Key: "trench" },
  ];
  const main = (st) => ({
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]],
    Attributes: { Line_Type: "elec_main", ...(st ? { Build_Status: st } : {}) },
  });
  const trench = {
    Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[50, 0], [50, 10]], Attributes: { Line_Type: "trench_service" },
  };
  const at = (f) => plotSupplyState({
    anchor: [50, 10], utility: "electric", features: f, lineTypes: LT2,
  });

  const unset = at([main(null), trench]);
  if (unset.state !== "dead") {
    fail(`a main with no status left its plots ${unset.state}`);
  }
  /* Said differently from Planned, because the fix is different: one
     wants the main energising, the other wants somebody to say what
     stage it is at. */
  if (!/no status has been set/.test(unset.why ?? "")) {
    fail("a main with no status is reported as though it had one");
  }
  if (at([main("planned"), trench]).why !== "The Feeder Main is not yet live.") {
    fail("a planned main no longer uses the agreed wording");
  }
  if (at([main("live"), trench]).state !== "live") {
    fail("a live main stopped being live");
  }
  /* No main at all is still honestly unknown — inventing a verdict
     there would be worse than admitting it. */
  if (at([trench]).state !== "unknown") {
    fail("a plot with no main anywhere was given a verdict");
  }

  /* One place decides. The tail of the function used to reach its own
     conclusion, so a main with no status got Planned's wording. */
  /* One function decides, though it now has two ways of saying dead —
     the main itself not being live, and a length upstream of it not
     being. Counting the words was a proxy for "one decider" and stopped
     being one; what matters is that the callers all go through
     verdict. */
  const mod = readFileSync("./src/features/gis/plotSupply.js", "utf8");
  const body = mod.slice(mod.indexOf("export function plotSupplyState"));
  if (/state: "dead"/.test(body)) {
    fail("plotSupplyState reaches its own conclusion instead of asking verdict");
  }
  if ((mod.match(/verdict\(/g) || []).length < 4) {
    fail("not every route through the answer goes via verdict");
  }

  /* And the editor no longer shows a stage that is not there. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  /* The main's own field, found by the id it carries — the trench has
     a Build_Status select too, and it legitimately defaults to planned,
     so a pattern that could match either passed while this one was
     still pretending. */
  const fieldAt = editor.indexOf('id="fe-main-status"');
  const field = fieldAt < 0 ? "" : editor.slice(fieldAt, fieldAt + 900);
  if (!field) fail("the main has no status field");
  if (/Build_Status \?\? "planned"/.test(field)) {
    fail("the main's status field still shows Planned when nothing is set");
  }
  if (!/Build_Status \?\? ""/.test(field)) {
    fail("the main's status field does not show an empty value when unset");
  }
  if (!/&mdash; Not set &mdash;/.test(editor)) {
    fail("there is no way to see that a main has no status");
  }
}

// 21. The hatching follows the utility, and mismatches are named.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Electric picked, and the gas main beside it is not the question —
     hatching it says something true about a main nobody is working on,
     in a colour that means "you cannot connect here". */
  if (!/const hatchLayers = useMemo/.test(canvas)) {
    fail("the hatching does not know which utilities are being connected");
  }
  if (!/if \(!hatchLayers\.includes\(f\.Layer_Key\)\) continue;/.test(canvas)) {
    fail("every main is hatched whatever is being connected");
  }
  /* Nothing picked, nothing hatched: the colour answers a question
     nobody has asked yet. */
  if (!/if \(!hatchLayers\.length\) continue;/.test(canvas)) {
    fail("mains are hatched before a utility is chosen");
  }
  /* A main with no status is hatched red rather than skipped — skipping
     read as "no main here" rather than "nobody has said". */
  if (/const stage = statusOf\(f\);\s*\n\s*if \(!stage\) continue;/.test(canvas)) {
    fail("a main with no status is left unhatched");
  }
  if (!/\bhatchLayers[,\]]/.test(canvas)) {
    fail("changing the utility does not redraw the hatching");
  }

  /* ── One live and the other not ──

     Gas and water go in on one visit. If one main is live and the other
     is not, that visit connects half of what it was sent to do. */
  const live = (...ks) => (u) => ks.includes(u);
  if (!utilitiesOutOfStep(["gas", "water"], live("gas"))) {
    fail("gas live and water not is not reported");
  }
  if (!utilitiesOutOfStep(["gas", "water"], live("water"))) {
    fail("water live and gas not is not reported");
  }
  /* All one way is not a mismatch: both dead is an ordinary "not yet",
     which the plot marks already say. */
  if (utilitiesOutOfStep(["gas", "water"], live("gas", "water"))) {
    fail("two live mains are reported as out of step");
  }
  if (utilitiesOutOfStep(["gas", "water"], live())) {
    fail("two mains that are both not live are reported as out of step");
  }
  if (utilitiesOutOfStep(["electric"], live())) {
    fail("one utility can be out of step with itself");
  }
  /* Named, so somebody knows which one to go and set. */
  const msg = utilitiesOutOfStep(["gas", "water"], live("gas")).why;
  if (!/Gas is live but Water is not/.test(msg)) {
    fail(`the message reads "${msg}"`);
  }
  /* Said, not refused: the mains are almost certainly both fine and one
     has not been marked. */
  if (/utilitiesOutOfStep[\s\S]{0,400}disabled=/.test(canvas)) {
    fail("a status mismatch blocks the call-off rather than warning");
  }
}

// 22. Live means live all the way back to the source.
//
//     A main marked Live with a dead length between it and the
//     substation is marked wrong: nothing can flow to it. So setting a
//     length live sets everything upstream live, and a plot is
//     connectable only if the whole chain is.
{
  const LT3 = [
    { Type_Key: "elec_main", Layer_Key: "electric" },
    { Type_Key: "trench_service", Layer_Key: "trench" },
  ];
  const seg = (id, geom, st) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
    Geometry: geom,
    Attributes: { Line_Type: "elec_main", ...(st ? { Build_Status: st } : {}) },
  });
  const site = (mid) => [
    { Feature_ID: 100, Feature_Role: "substation", Geometry: [[0, 0]] },
    seg(1, [[0, 0], [50, 0]], "live"),
    seg(2, [[50, 0], [100, 0]], mid),
    seg(3, [[100, 0], [150, 0]], "live"),
    {
      Feature_ID: 9, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[120, 0], [120, 10]], Attributes: { Line_Type: "trench_service" },
    },
  ];

  const whole = site("live");
  const gapped = site("planned");
  const gWhole = mainsGraph("electric", whole, LT3);
  const gGapped = mainsGraph("electric", gapped, LT3);

  if (!gWhole.roots.length) fail("the walk cannot find where the network starts");

  /* The path back, and what is not live along it. */
  if (!pathToSource(3, gWhole)) fail("a length cannot be walked back to the source");
  if ((deadUpstream(3, gWhole) || []).length) {
    fail("a wholly live chain reports something not live");
  }
  const blocking = deadUpstream(3, gGapped) || [];
  if (blocking.length !== 1 || Number(blocking[0].Feature_ID) !== 2) {
    fail(`the gap in the chain came out as ${blocking.map((m) => m.Feature_ID)}`);
  }
  /* A length the source cannot reach is not "nothing upstream" — the
     difference matters, and null says so. */
  const island = mainsGraph("electric", [
    ...whole, seg(9, [[500, 500], [600, 500]], "live"),
  ], LT3);
  if (deadUpstream(9, island) !== null) {
    fail("a length that reaches nothing reports an empty chain");
  }

  /* The plot follows: the nearest main is live and the plot is still
     refused, because a length behind it is not. */
  const at3 = (f, g) => plotSupplyState({
    anchor: [120, 10], utility: "electric", features: f, lineTypes: LT3, graph: g,
  });
  if (at3(whole, gWhole).state !== "live") {
    fail("a plot on a wholly live chain is refused");
  }
  const short = at3(gapped, gGapped);
  if (short.state !== "dead") {
    fail(`a plot fed through a dead length reads as ${short.state}`);
  }
  if (!/between it and the source/.test(short.why ?? "")) {
    fail("the reason does not say the break is upstream");
  }
  /* Without the graph it cannot know, and must not pretend: the old
     answer stands. */
  if (at3(gapped, null).state !== "live") {
    fail("the chain test fires without the graph it needs");
  }

  /* ── The same walk on all three utilities ──

     Electric runs back to a substation, gas and water to a point of
     connection. One walk, told apart only by which role it stops at —
     so nothing had to be written three times and none of the three can
     quietly behave differently from the others. */
  for (const [layer, role] of [
    ["electric", "substation"], ["gas", "poc"], ["water", "poc"],
  ]) {
    const type = layer === "electric" ? "elec_main" : `${layer}_main`;
    const types = [{ Type_Key: type, Layer_Key: layer }];
    const part = (id, geom, st) => ({
      Feature_ID: id, Feature_Type: "line", Layer_Key: layer, Geometry: geom,
      Attributes: { Line_Type: type, ...(st ? { Build_Status: st } : {}) },
    });
    const world = [
      { Feature_ID: 99, Feature_Role: role, Geometry: [[0, 0]] },
      part(1, [[0, 0], [50, 0]], "planned"),
      /* No status at all, which must be picked up as well — it is not
         live either. */
      part(2, [[50, 0], [100, 0]], null),
      part(3, [[100, 0], [150, 0]], "live"),
    ];
    const g = mainsGraph(layer, world, types);
    if (!sourceFor(layer, world)) fail(`${layer} has no source to walk back to`);
    if (!g.roots.length) fail(`${layer} mains do not reach their source`);

    const also = (deadUpstream(3, g) || []).map((m) => Number(m.Feature_ID));
    if (also.join() !== "1,2") {
      fail(`setting a ${layer} main live would also set ${also.join(", ") || "nothing"}`);
    }
  }

  /* ── Every source, not the first ──

     A site can be fed from more than one side: two gas mains in from
     different roads, or water from each end of an estate. Taking only
     the first meant a main fed from the second reached no source at
     all, so the cascade did nothing — and did it silently. Electric has
     one substation, which is why this only ever went wrong on gas and
     water. */
  {
    const gt = [{ Type_Key: "gas_main", Layer_Key: "gas" }];
    const gm = (id, geom, st) => ({
      Feature_ID: id, Feature_Type: "line", Layer_Key: "gas", Geometry: geom,
      Attributes: { Line_Type: "gas_main", ...(st ? { Build_Status: st } : {}) },
    });
    const twoWays = [
      { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] },
      { Feature_ID: 91, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[200, 0]] },
      gm(1, [[0, 0], [50, 0]], "planned"),
      gm(2, [[150, 0], [200, 0]], "planned"),
      gm(3, [[150, 0], [100, 0]], "live"),
    ];
    const g2 = mainsGraph("gas", twoWays, gt);
    if (g2.roots.length !== 2) {
      fail(`a site with two points of connection found ${g2.roots.length} root(s)`);
    }
    const from2 = (deadUpstream(3, g2) || []).map((m) => Number(m.Feature_ID));
    if (!from2.includes(2)) {
      fail("a main fed from the second point of connection reaches no source");
    }

    /* Null and empty mean different things: no way to tell, and nothing
       to change. Flattening both to empty is how a cascade came to do
       nothing without saying so. */
    const nowhere = mainsGraph("gas", [gm(1, [[0, 0], [50, 0]])], gt);
    if (liveCascade(1, nowhere) !== null) {
      fail("a main with no point of connection reports nothing to do");
    }
    const fine = mainsGraph("gas", [
      { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] },
      gm(1, [[0, 0], [50, 0]], "live"),
    ], gt);
    if (liveCascade(1, fine)?.length !== 0) {
      fail("a wholly live chain does not report an empty list");
    }

    /* A point of connection is found whatever layer it sits on.

       An electric POC is created on the electric layer, but a gas or
       water one takes whichever layer the menu was on. Insisting the
       layer matched made every source invisible on those drawings —
       which is very likely what stopped the gas and water cascade
       working at all. */
    for (const [what, poc] of [
      ["its own layer", { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] }],
      ["the electric layer", { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] }],
      ["no layer at all", { Feature_ID: 90, Feature_Role: "poc", Geometry: [[0, 0]] }],
    ]) {
      const g3 = mainsGraph("gas", [
        poc, gm(1, [[0, 0], [50, 0]], "planned"), gm(2, [[50, 0], [100, 0]], "live"),
      ], gt);
      if (!g3.roots.length) {
        fail(`a gas POC on ${what} is not found, so nothing cascades`);
      }
    }

    /* ── A source is placed near the main, not on it ──

       A substation or point of connection is a symbol somebody drops
       beside the road; the main begins a metre or two away. At the
       three-quarter-metre tolerance used between two lengths, the walk
       found no root at all on ordinary drawings — so the cascade did
       nothing, which is almost certainly why setting a main live
       changed nothing upstream. */
    for (const off of [0, 0.5, 2, 4]) {
      const g4 = mainsGraph("gas", [
        { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, off]] },
        gm(1, [[0, 0], [50, 0]], "planned"),
        gm(2, [[50, 0], [100, 0]], "live"),
      ], gt);
      if (!g4.roots.length) {
        fail(`a point of connection ${off}m off the main is not found`);
      }
      const up = (deadUpstream(2, g4) || []).map((m) => Number(m.Feature_ID));
      if (!up.includes(1)) {
        fail(`with the source ${off}m off, the length upstream is not picked up`);
      }
    }
    /* And not so wide that a source roots a main on the next street. */
    const far = mainsGraph("gas", [
      { Feature_ID: 90, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 40]] },
      gm(1, [[0, 0], [50, 0]], "planned"),
    ], gt);
    if (far.roots.length) {
      fail("a point of connection forty metres away roots a main");
    }

    /* And the canvas says so rather than swallowing it. */
    const cv = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    if (!/if \(chain == null\) \{/.test(cv)) {
      fail("a cascade that cannot walk back says nothing");
    }
    if (!/no \$\{before\.Layer_Key\} point of connection/.test(cv)) {
      fail("the message does not distinguish a missing point of connection");
    }
  }

  /* ── A live main means its trench is closed ──

     A main cannot be live unless it is in the ground, and it cannot be
     in the ground unless the trench was dug, laid and closed. Asking
     somebody to record that separately is asking them to state the same
     fact twice.

     Existing ground and trenches marked for removal are left alone —
     one was never built by this job, and the other is being taken
     out. */
  {
    const trench = (id, st) => ({
      Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[0, 0], [100, 0]],
      Attributes: { Line_Type: "trench_main", ...(st ? { Build_Status: st } : {}) },
    });
    const laid = { Feature_ID: 1, Geometry: [[10, 0], [90, 0]] };

    for (const st of ["planned", null]) {
      if (!trenchesUnder([laid], [trench(5, st)], lineFollows).length) {
        fail(`a ${st ?? "unset"} trench under a live main is not marked as-built`);
      }
    }
    for (const st of ["existing", "remove", "asbuilt"]) {
      if (trenchesUnder([laid], [trench(5, st)], lineFollows).length) {
        fail(`a trench marked ${st} was overwritten as as-built`);
      }
    }
    /* And only the trench the main is actually in. */
    const elsewhere = { Feature_ID: 2, Geometry: [[0, 50], [100, 50]] };
    if (trenchesUnder([elsewhere], [trench(5, "planned")], lineFollows).length) {
      fail("a trench in another road was marked as-built");
    }

    const cv2 = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
    /* Assigned from the call, not merely mentioning it — `[] ||
       trenchesUnder(...)` still contains the words and passed. */
    if (!/const digs = trenchesUnder\(/.test(cv2)) {
      fail("setting a main live leaves its trench as it was");
    }
    if (!/Build_Status: "asbuilt"/.test(cv2)) {
      fail("the trenches are found and not marked");
    }
    /* Every main the cascade touched, not only the one edited. */
    if (!/\[\{ \.\.\.before, \.\.\.changes \}, \.\.\.also\]/.test(cv2)) {
      fail("only the edited main's trench is marked, not the ones upstream");
    }
    if (!/Mark \$\{digs\.length\} trench\(es\) as-built/.test(cv2)) {
      fail("the trench change is not recorded, so it cannot be undone");
    }
  }

  /* And setting a length live carries upstream. */
  const canvas2 = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/liveCascade\(id, graph\)/.test(canvas2)) {
    fail("setting a main live leaves the lengths feeding it alone");
  }
  if (!/Energise \$\{also\.length\} length\(s\) upstream/.test(canvas2)) {
    fail("the cascade is not recorded, so it cannot be undone");
  }

  /* The mains for the chosen utility are shown, and gas and water are
     drawn apart so the pair reads as two lines. */
  if (!/\.\.\.g\.members\]\)/.test(canvas2)) {
    fail("choosing a utility does not show its mains");
  }
  if (!/const servicePairOffset = useCallback/.test(canvas2)) {
    fail("gas and water are drawn on top of each other");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Service call-offs behave (three ways in, one list of plots out).");
process.exit(bad ? 1 : 0);
