/* The jointing work instruction, as the field operative sees it.

   This is the paper Work Instruction rebuilt for the tablet, and the
   thing that matters about it is that it stays the same document. So
   this mounts the real component and reads what a gang would see —
   the six tasks word for word, the yellow C/I/NR boxes, the green test
   boxes, a block per plot, a block per breech joint, and a sketch for
   every one of them.

   ── Why it mounts rather than greps ──

   Nearly every fault this form has had was a rendering one: a section
   that did not appear because a flag was false, a joint listed under
   three plots because the loop was over the wrong thing, a box that
   stayed editable after the outcome should have locked it. None of
   those are visible in the source — they are visible on the screen the
   gang is holding. */
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { rmSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// ── Bundled the way Vite would ──────────────────────────────────────
await build({
  entryPoints: ["src/features/field/JointingForm.jsx"],
  bundle: true,
  format: "esm",
  outfile: "./.jfbundle.mjs",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
  define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false }) },
  logLevel: "error",
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { pretendToBeVisual: true, url: "https://aptus360.test/field" });

const put = (k, v) =>
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
for (const k of ["window", "document", "HTMLElement", "Node", "Element", "SVGElement",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Image",
  "FileReader", "DataTransfer", "Event", "MouseEvent", "PointerEvent"]) {
  if (dom.window[k] !== undefined) put(k, dom.window[k]);
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* jsdom has no canvas backend. The sketch pads only need a context to
   exist — what is drawn on them is not what this checks. */
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  clearRect() {}, drawImage() {},
});
dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AA";

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
const { default: JointingForm } = await import("./.jfbundle.mjs");
const {
  CHECKLIST, OUTCOMES, TESTS, sketchTargets, breechJointsOf, missingFrom, plotsOf,
} = await import("./src/features/field/jointingInstruction.js");

const root = createRoot(dom.window.document.getElementById("root"));

/* A call-off with two plots and two breech joints — one the drawing
   knows about, one booked by name only. */
const JOB = {
  task: "Jointing",
  plots: "18-19",
  nodeRange: "A1, A2",
  siteName: "Foo Meadows",
  breech: {
    joints: [{ featureId: 20, node: "A1", jointType: "breech", plots: [18, 19] }],
    plots: [{
      plot: "18", plotId: 18, reachable: true,
      joints: [{ featureId: 20, node: "A1", jointType: "breech" }],
    }],
  },
};

let payload = {};
let mount = 0;
/* Remounted each time. `page` is component state, so without a fresh
   key a case that switched to the sketch tab left the next one there —
   which read as the work instruction failing to render. */
const render = async (job = JOB, { fresh = true } = {}) => {
  if (fresh) mount += 1;
  const set = (k, v) => { payload = { ...payload, [k]: v }; };
  const setPlot = (p, k, v) => {
    payload = {
      ...payload,
      plots: { ...(payload.plots || {}), [p]: { ...(payload.plots?.[p] || {}), [k]: v } },
    };
  };
  await act(async () => {
    root.render(React.createElement(JointingForm,
      { key: mount, job, payload, set, setPlot }));
  });
};

const text = () => dom.window.document.body.textContent;
const $ = (sel) => [...dom.window.document.querySelectorAll(sel)];
const click = async (el) => { await act(async () => { el.click(); }); };

await render();

// 1. It is the same document.
//
//    Word for word. The tasks are what the business checks against, and
//    a paraphrase here would mean two wordings of one instruction.
{
  /* ── The tasks, written out again on purpose ──

     This was `for (const t of CHECKLIST)`, which compared the module to
     itself: reword a task and both sides move together and the check
     still passes. The wording is not the application's to choose — it
     is the paper form the business checks against, and a paraphrase
     means two wordings of one instruction.

     So the canonical six live here as well. This is the one place in
     the repo where a second copy is the point rather than the fault:
     the check is the record, and the module has to agree with it. */
  const PAPER = [
    "Check Outside Viewing Cabinets fitted securely",
    "Fix Pre Assembled meter board(s) \u2014 [ includes cut out ]",
    "Complete IR Test and Continuity Test on Service Cables and document",
    "Insert 100A fuses (80A fuses if apartments)",
    "Check Loop Impedance and Polarity and document \u2014 apply seals",
    "Complete dimensions for joints terminations",
  ];
  if (CHECKLIST.length !== PAPER.length) {
    fail(`the checklist has ${CHECKLIST.length} tasks, the paper form has ${PAPER.length}`);
  }
  for (const t of PAPER) {
    if (!CHECKLIST.includes(t)) fail(`the checklist no longer says: "${t.slice(0, 44)}…"`);
    if (!text().includes(t)) fail(`the form does not show: "${t.slice(0, 44)}…"`);
  }
  for (const h of ["Job Details", "Task Checklist", "Sign-off",
    "Service Breech Joints", "Cut Out Termination"]) {
    if (!text().includes(h)) fail(`the form has no "${h}" section`);
  }
  if (!/C\s*=\s*Complete/.test(text())) fail("the C / I / NR key is not on the form");

  /* And the three outcomes, which are equally not ours to rename. */
  for (const o of ["Completed", "Aborted", "Dead Jointed"]) {
    if (!OUTCOMES.includes(o)) fail(`the outcome "${o}" has gone from the form`);
  }
}

// 2. Yellow for a judgement, green for a measurement.
//
//    The paper form colours the boxes the operative fills in, and the
//    colouring is the instruction: a gang looks for the coloured boxes
//    and fills those in.
{
  if ($(".jf-cinr").length !== CHECKLIST.length + breechJointsOf(JOB).length) {
    fail(`expected ${CHECKLIST.length + breechJointsOf(JOB).length} C/I/NR boxes,`
      + ` found ${$(".jf-cinr").length}`);
  }
  const green = $(".jf-num, .jf-numsel").length;
  const want = plotsOf(JOB.plots).length * TESTS.length;
  if (green !== want) fail(`expected ${want} test boxes, found ${green}`);
}

// 3. A block per plot, and the office's fields locked.
{
  for (const p of ["18", "19"]) {
    if (!text().includes(`Plot ${p}`) && !$(`#jf-cot-${p}`).length) {
      fail(`plot ${p} has no block`);
    }
  }
  if ($(".jf-outcome").length !== 2) {
    fail(`expected an outcome per plot, found ${$(".jf-outcome").length}`);
  }
  const locked = $("#jf-jobNo")[0];
  if (!locked) fail("the job number is not on the form");
  else if (!locked.readOnly) fail("the office's job number is editable on site");
}

// 4. Breech joints stand on their own, one block each.
//
//    The point of this round. Nested under a plot, one joint feeding
//    three plots appeared three times and read as three jobs.
{
  const joints = breechJointsOf(JOB);
  if (joints.length !== 2) fail(`expected 2 breech joints, got ${joints.length}`);
  if ($(".jf-breech").length !== joints.length) {
    fail(`expected ${joints.length} breech blocks, found ${$(".jf-breech").length}`);
  }
  for (const n of ["A1", "A2"]) {
    if (!text().includes(`Node ${n}`)) fail(`breech joint ${n} is not on the form`);
  }
  /* One block each. A1 serves both plots and used to be drawn under
     both of them, which read as two jobs at one hole.

     Counted as blocks rather than as mentions of the name: the plot
     block carries a reference line listing what is on its route, which
     is deliberate and is not a second place to answer for the joint. */
  const named = $(".jf-block-name").map((el) => el.textContent);
  const a1 = named.filter((t) => /Node A1/.test(t)).length;
  if (a1 !== 1) fail(`Node A1 has ${a1} blocks — it should have one`);
  /* And each carries its own from/to/completion. */
  if (!$(".jf-breech .jf-cinr").length) fail("a breech joint has no completion box");
}

// 5. Dead Jointed clears and locks the readings.
//
//    The joint is made and the service is not live, so there is nothing
//    to measure — and a number left over from before the outcome changed
//    would read as a reading taken on a dead service.
{
  await render();
  const sel = $(".jf-outcome")[0];
  sel.value = "Dead Jointed";
  await act(async () => {
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await render(JOB, { fresh: false });
  for (const k of ["eli", "polarity", "voltage"]) {
    const el = $(`#jf-${k}-18`)[0];
    if (!el) { fail(`plot 18 has no ${k} box`); continue; }
    if (!el.disabled) fail(`${k} is still editable on a dead joint`);
    if (el.value) fail(`${k} kept "${el.value}" after Dead Jointed`);
  }
  /* IR is still asked: it is taken on the cable, not on a live supply. */
  if ($("#jf-ir-18")[0]?.disabled) fail("the IR test was locked by Dead Jointed");
}

// 6. A sketch for every joint — plots and breech joints alike.
{
  payload = {};
  await render();
  const tabs = $(".jf-tab");
  await click(tabs[1]);

  const targets = sketchTargets(JOB);
  if (targets.length !== 4) fail(`expected 4 sketch targets, got ${targets.length}`);
  if ($(".jf-sketch").length !== targets.length) {
    fail(`expected ${targets.length} sketch pads, found ${$(".jf-sketch").length}`);
  }
  for (const t of targets) {
    if (!text().includes(t.title)) fail(`no sketch for ${t.title}`);
  }
  /* Photos by purpose, on each. */
  if ($(".jf-photo-add").length !== targets.length * 3) {
    fail(`expected 3 photo buttons per joint, found ${$(".jf-photo-add").length}`);
  }
  /* And somewhere to write where the joint is. */
  if ($("textarea").length !== targets.length) {
    fail(`expected a description per joint, found ${$("textarea").length}`);
  }
}

// 7. Nothing is submitted with a joint unanswered.
//
//    An unanswered breech joint is a hole nobody has said anything
//    about, and it is the one the office is asked about later.
{
  const outstanding = missingFrom({}, plotsOf(JOB.plots), JOB);
  for (const want of ["Outcome for plot 18", "The declaration"]) {
    if (!outstanding.includes(want)) fail(`"${want}" is not required before sending`);
  }
  if (!outstanding.some((m) => /Completion for .*A1/.test(m))) {
    fail("a breech joint can be left blank and the form still sent");
  }
  const done = missingFrom({
    plots: { 18: { outcome: "Completed" }, 19: { outcome: "Completed" } },
    breech: { "breech:20": { done: "C" }, "breech:node:A2": { done: "C" } },
    declaration: true,
  }, plotsOf(JOB.plots), JOB);
  if (done.length) fail(`a complete form still reports outstanding: ${done.join(", ")}`);
}

// 8. A booking with no breech joints says so rather than showing an
//    empty card, and still renders its plots.
{
  payload = {};
  await render({ ...JOB, nodeRange: null, breech: null });
  if ($(".jf-breech").length) fail("a booking with no joints drew joint blocks");
  if (!/No breech joints booked/.test(text())) {
    fail("a booking with no joints does not say so");
  }
  if ($(".jf-outcome").length !== 2) fail("the plots stopped rendering without joints");
}

rmSync("./.jfbundle.mjs", { force: true });
console.log(bad ? `\n${bad} problem(s)`
  : "The jointing form is the paper form (plots and breech joints, a sketch each).");
process.exit(bad ? 1 : 0);
