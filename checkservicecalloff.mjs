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
  alreadyCalledOff, serviceSummary, priorServicesFrom,
} from "./src/features/gis/serviceCallOff.js";

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
  const btn = canvas.slice(canvas.indexOf("onClick={submitServiceCallOff}") - 400,
    canvas.indexOf("onClick={submitServiceCallOff}"));
  if (!/!servicePlots\.length \|\| !serviceUtils\.length/.test(btn)) {
    fail("the raise button is live with no plots or no utilities");
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

console.log(bad ? `\n${bad} problem(s)`
  : "Service call-offs behave (three ways in, one list of plots out).");
process.exit(bad ? 1 : 0);
