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
  serviceGroupsFor, isWholeGroup, chooseUtilityFirst,
} from "./src/features/gis/serviceCallOff.js";
import { serviceCallOffCustomer } from "./src/features/gis/callOffCustomer.js";
import { plotSupplyState } from "./src/features/gis/plotSupply.js";

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
  /* A main genuinely too far away is not joined to. */
  if (at([main(1, "live", [[0, -2], [100, -2]]), svc(2, null)]).state === "live") {
    fail("a main two metres away counts as connected");
  }

  /* Silence is not a yes. The point is to stop a gang being sent to a
     dead main, and an unanswerable question is not a reason to send
     them. */
  for (const [what, f] of [
    ["a plot with no service", [main(1, "live")]],
    ["a main with no status", [main(1, null), svc(2, [1])]],
    ["a service reaching no main", [svc(2, null)]],
  ]) {
    if (at(f).state === "live") fail(`${what} was treated as connectable`);
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(dead\) \{ setError\(dead\.why\); return; \}/.test(canvas)) {
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
  if (!/serviceOpen, servicePlots, priorServices\]\);/.test(canvas)) {
    fail("opening the picker does not redraw the hatching");
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

console.log(bad ? `\n${bad} problem(s)`
  : "Service call-offs behave (three ways in, one list of plots out).");
process.exit(bad ? 1 : 0);
