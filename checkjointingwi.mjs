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
} from "./src/features/field/jointingInstruction.js";

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
