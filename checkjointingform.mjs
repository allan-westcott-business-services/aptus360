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
  CHECKLIST, OUTCOMES, TESTS, jointPages, breechJointsOf, missingFrom, plotsOf,
} = await import("./src/features/field/jointingInstruction.js");

const root = createRoot(dom.window.document.getElementById("root"));

/* A call-off with two plots and two breech joints — one the drawing
   knows about, one booked by name only. */
const JOB = {
  task: "Jointing",
  plots: "18-19",
  nodeRange: "A1, A2",
  siteName: "Foo Meadows",
  asLaid: "https://example.test/as-laid.png",
  sizes: {
    "plot:18": { in: "185mm AL WF", out: "35mm CNE" },
    "plot:19": { in: null, out: null },
    "breech:20": { in: "185mm AL WF", out: "35mm CNE" },
  },
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
const tabs = () => $(".jf-tab");
/* Open a page by the label on its tab. */
const open = async (label) => {
  const t = tabs().find((b) => b.textContent.includes(label));
  if (!t) { fail(`no page tab for "${label}"`); return false; }
  await click(t);
  return true;
};

/* Type into a controlled input the way a person does.

   React tracks the value it last wrote to the node, so assigning
   `el.value` directly is reverted before onChange ever sees it — the
   box looks typed-in and the state never moves. Going through the
   prototype's own setter is what makes React notice.

   Worth the ceremony: without it a check can "type" a reading, read it
   straight back off the same node, and pass while the payload stayed
   empty the whole time. */
const type = async (el, value) => {
  const set = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype, "value").set;
  set.call(el, value);
  await act(async () => {
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};

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
  /* The site page carries these and only these. Sign-off and the joint
     detail have their own pages now — asserting them here would have
     passed a form that put everything back on one sheet. */
  for (const h of ["Job Details", "Task Checklist"]) {
    if (!text().includes(h)) fail(`the site page has no "${h}" section`);
  }
  for (const h of ["Sign-off", "Cut Out Termination", "Cable size in"]) {
    if (text().includes(h)) fail(`"${h}" is on the site page — it belongs on its own`);
  }
  if (!/C\s*=\s*Complete/.test(text())) fail("the C / I / NR key is not on the form");

  /* And the three outcomes, which are equally not ours to rename. */
  for (const o of ["Completed", "Aborted", "Dead Jointed"]) {
    if (!OUTCOMES.includes(o)) fail(`the outcome "${o}" has gone from the form`);
  }
}

// 2. Site page first: the details and the six questions, and nothing else.
//
//    The joints are not on it. A gang standing at a hole should not be
//    scrolling past the developer's address to reach the readings.
{
  if ($(".jf-cinr").length !== CHECKLIST.length) {
    fail(`the site page has ${$(".jf-cinr").length} C/I/NR boxes, not the six tasks`);
  }
  if ($(".jf-num, .jf-numsel").length) fail("test boxes are on the site page");
  if ($(".jf-sketchink").length) fail("a sketch is on the site page");
  const locked = $("#jf-jobNo")[0];
  if (!locked) fail("the job number is not on the site page");
  else if (!locked.readOnly) fail("the office's job number is editable on site");
}

// 3. A page per joint, then the declaration, in that order.
{
  const pages = jointPages(JOB);
  /* Two plots and two booked breech joints. */
  if (pages.length !== 4) fail(`expected 4 joint pages, got ${pages.length}`);

  const labels = tabs().map((b) => b.textContent);
  if (labels.length !== pages.length + 2) {
    fail(`expected ${pages.length + 2} pages, found ${labels.length}`);
  }
  if (!/Site/.test(labels[0])) fail(`the first page is "${labels[0]}", not Site`);
  /* No leading numbers. The tab says where you are, and "3 · Plot 19"
     invites somebody to call it plot 3. */
  for (const l of labels) {
    if (/^\s*\d+\s*[·.]/.test(l)) fail(`page tab "${l}" still carries a number`);
  }
  if (!/Declaration/.test(labels[labels.length - 1])) {
    fail(`the last page is "${labels[labels.length - 1]}", not the Declaration`);
  }
  for (const want of ["Plot 18", "Plot 19", "Node A1", "Node A2"]) {
    if (!labels.some((l) => l.includes(want))) fail(`no page for ${want}`);
  }
  /* Service joints before breech joints — the order the paperwork
     reads, plots then the way back to the main. */
  const p18 = labels.findIndex((l) => l.includes("Plot 18"));
  const a1 = labels.findIndex((l) => l.includes("Node A1"));
  if (a1 < p18) fail("breech joints come before the service joints");
}

// 4. A service joint page carries the readings.
{
  if (!await open("Plot 18")) { /* reported */ }
  if ($(".jf-outcome").length !== 1) {
    fail(`expected one outcome on a joint page, found ${$(".jf-outcome").length}`);
  }
  if ($(".jf-num, .jf-numsel").length !== TESTS.length) {
    fail(`expected ${TESTS.length} test boxes, found ${$(".jf-num, .jf-numsel").length}`);
  }
  if (!$("#jf-cot-18").length) fail("no cut out termination on the plot page");
  if ($("#jf-cot-19").length) fail("another plot is on the same page");
  if ($(".jf-sketchink").length !== 1) {
    fail(`expected one sketch on a joint page, found ${$(".jf-sketchink").length}`);
  }
  if ($(".jf-photo-add").length !== 3) fail("the three photo buttons are not on the joint page");
  /* The keys carry a colon (plot:18), which is legal in an id and not
     in a selector, so these are found by prefix rather than by #id. */
  if (!$("select").some((el) => el.id.startsWith("jf-type-"))) {
    fail("no joint type on the joint page");
  }
}

// 5. A breech joint page asks the same, minus the readings.
//
//    It is on the main and terminates nothing, so there is nothing to
//    test at it — but it is still a hole with a joint in it, and it
//    gets a completion, a cable size, photos and a sketch.
{
  if (!await open("Node A1")) { /* reported */ }
  if ($(".jf-num, .jf-numsel").length) {
    fail("a breech joint page is asking for test readings");
  }
  if ($(".jf-cinr").length !== 1) {
    fail(`expected one completion box, found ${$(".jf-cinr").length}`);
  }
  if ($(".jf-sketchink").length !== 1) fail("a breech joint has no sketch");
  if ($(".jf-photo-add").length !== 3) fail("a breech joint has no photo buttons");
  if (!text().includes("Node A1")) fail("the breech joint page is not named");
}

// 6. Cable sizes come off the design, and are not typed.
//
//    The plot knows the LV feeder supplying it and the service running
//    to its meter. Asking a gang to type them is asking them to copy
//    two numbers off a drawing they are not holding.
{
  if (!await open("Plot 18")) { /* reported */ }
  const inp = $("input").find((el) => el.id.startsWith("jf-in-"));
  const out = $("input").find((el) => el.id.startsWith("jf-outsz-"));
  if (!inp || !out) fail("cable size in/out are not on the joint page");
  else {
    if (inp.value !== "185mm AL WF") fail(`cable size in reads "${inp.value}"`);
    if (out.value !== "35mm CNE") fail(`cable size out reads "${out.value}"`);
    if (!inp.readOnly) fail("a size the design knows is editable on site");
  }

  /* Where the design does not say, the box is open rather than
     pre-filled with a guess. */
  if (!await open("Plot 19")) { /* reported */ }
  const blank = $("input").find((el) => el.id.startsWith("jf-in-"));
  if (blank?.value) fail(`an unknown cable size was filled in with "${blank.value}"`);
  if (blank?.readOnly) fail("an unknown cable size is locked, so it cannot be recorded");
}

// 7. The sketch sits over the as-laid electric drawing.
{
  if (!await open("Plot 18")) { /* reported */ }
  const bg = $(".jf-sketchbg")[0];
  if (!bg) fail("the sketch has no drawing behind it");
  else if (bg.getAttribute("src") !== JOB.asLaid) fail("the sketch backdrop is not the as-laid drawing");
  if (!$(".jf-sketchbar").length) fail("the sketch has no zoom controls");

  /* Zoom moves the plan. */
  const zoomIn = $(".jf-chip").find((b) => b.textContent === "+");
  await click(zoomIn);
  const after = $(".jf-sketchbg")[0];
  if (after && !/scale\(1\.25\)/.test(after.style.transform)) {
    fail(`zooming did not scale the plan (${after.style.transform})`);
  }

  /* And it can be turned off — a gang marking a joint on open ground
     does not always want a plan under it. */
  const none = $(".jf-chip").find((b) => b.textContent === "None");
  await click(none);
  if ($(".jf-sketchbg").length) fail("the backdrop cannot be turned off");
}

// 8. Dead Jointed clears and locks the readings.
{
  payload = {};
  await render();
  await open("Plot 18");
  const sel = $(".jf-outcome")[0];
  sel.value = "Dead Jointed";
  await act(async () => {
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await render(JOB, { fresh: false });
  await open("Plot 18");
  for (const k of ["eli", "polarity", "voltage"]) {
    const el = $(`#jf-${k}-18`)[0];
    if (!el) { fail(`plot 18 has no ${k} box`); continue; }
    if (!el.disabled) fail(`${k} is still editable on a dead joint`);
    if (el.value) fail(`${k} kept "${el.value}" after Dead Jointed`);
  }
  if ($("#jf-ir-18")[0]?.disabled) fail("the IR test was locked by Dead Jointed");
}

// 9. One joint's answers do not appear under another's heading.
//
//    The whole point of a page each.
{
  payload = {};
  await render();
  await open("Plot 18");
  await type($("#jf-ir-18")[0], "99");
  if (payload.plots?.[18]?.ir !== "99") {
    fail(`typing an IR reading did not reach the payload (${JSON.stringify(payload.plots)})`);
  }
  await render(JOB, { fresh: false });

  await open("Plot 19");
  if ($("#jf-ir-19")[0]?.value === "99") fail("plot 18's reading appeared under plot 19");
  await open("Plot 18");
  if ($("#jf-ir-18")[0]?.value !== "99") fail("plot 18's reading was lost when its page was left");
}

// 10. The tabs say what is outstanding.
{
  payload = { plots: { 18: { outcome: "Completed" } } };
  await render();
  const t18 = tabs().find((b) => b.textContent.includes("Plot 18"));
  const t19 = tabs().find((b) => b.textContent.includes("Plot 19"));
  if (!t18?.querySelector(".jf-tick")) fail("an answered plot is not ticked");
  if (!t19?.querySelector(".jf-dot")) fail("an unanswered plot carries no dot");
}

// 11. Nothing is submitted with a joint unanswered.
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
    joints: { "breech:20": { done: "C" }, "breech:node:A2": { done: "C" } },
    declaration: true,
  }, plotsOf(JOB.plots), JOB);
  if (done.length) fail(`a complete form still reports outstanding: ${done.join(", ")}`);
}

// 12. A booking with no breech joints still has its plots and its
//     declaration.
{
  payload = {};
  await render({ ...JOB, nodeRange: null, breech: null });
  const labels = tabs().map((b) => b.textContent);
  if (labels.length !== 4) fail(`expected Site + 2 plots + Declaration, got ${labels.length}`);
  if (labels.some((l) => /Node/.test(l))) fail("a joint page appeared with no joints booked");
  if (!labels.some((l) => /Declaration/.test(l))) fail("the declaration page was lost");
}

// 13. The declaration is its own page, and last.
{
  payload = {};
  await render();
  await open("Declaration");
  if (!/Sign-off/.test(text())) fail("the declaration page has no sign-off");
  if (!$("#jf-completedby").length) fail("no Completed By on the declaration");
  if ($(".jf-outcome").length) fail("a joint is on the declaration page");
  /* The signature is still a canvas — it is a signature, not a
     drawing, and nothing about it wants selecting or undoing. */
  if ($(".jf-sketch").length !== 1) fail("the signature pad is not on the declaration");
  if ($(".jf-sketchink").length) fail("a joint sketch is on the declaration page");
}

// 14. The sketch pane is square, and the toolbar is under it.
{
  payload = {};
  await render();
  await open("Plot 18");

  const stage = $(".jf-sketchstage")[0];
  if (!stage) fail("no sketch stage");
  else {
    /* Square by aspect-ratio rather than a fixed height, so it stays
       square at every width. A letterbox ran the dimensions back to the
       property off the top and bottom. */
    const style = stage.getAttribute("class");
    const css = [...dom.window.document.querySelectorAll("style")]
      .map((n) => n.textContent).join("\n");
    if (!/\.jf-sketchstage\{[^}]*aspect-ratio\s*:\s*1\s*\/\s*1/.test(css.replace(/\s+/g, (m) => m.includes("\n") ? "" : m))) {
      if (!/aspect-ratio:1 \/ 1/.test(css)) fail("the sketch pane is not square");
    }
    if (!style) fail("the stage lost its class");
  }

  const bar = $(".jf-tools")[0];
  if (!bar) fail("the drawing toolbar is missing");
  else if (!(stage.compareDocumentPosition(bar) & 4)) {
    fail("the toolbar is above the sketch pane, not under it");
  }
}

// 15. Only the tools that were asked for.
//
//    A line, a colour, a weight, a label, a dimension, and the four
//    view controls. The office tool also offers building, cable, joint
//    and bottle end — those are the design, and the design is already
//    underneath as the as-laid drawing.
{
  const labels = [...$(".jf-tools button")].map((b) => b.textContent.trim());
  for (const want of ["+ Add Text", "Undo", "Delete", "Clear All"]) {
    if (!labels.some((l) => l === want)) fail(`the toolbar has no "${want}"`);
  }
  if (!labels.some((l) => /Dimension/.test(l))) fail("the toolbar has no Dimension");
  if (!labels.some((l) => /Lock view|View locked/.test(l))) fail("the toolbar has no Lock view");
  for (const gone of ["Building", "Cable / Duct", "Joint", "Bottle End"]) {
    if (labels.some((l) => l === gone)) fail(`"${gone}" is still on the toolbar`);
  }
  if ($(".jf-swatch").length !== 4) fail(`expected 4 colours, found ${$(".jf-swatch").length}`);
  if (!$(".jf-sizer").length) fail("the toolbar has no size control");
}

// 16. The toolbar does something.
//
//    Undo removes the last mark and Clear All removes them all — which
//    is only possible because a mark is data rather than pixels. A pad
//    that only keeps an image can do neither, and the buttons would be
//    decoration.
{
  payload = {};
  await render();
  await open("Plot 18");

  const dim = [...$(".jf-tools button")].find((b) => /Dimension/.test(b.textContent));
  await click(dim);
  await render(JOB, { fresh: false });
  await open("Plot 18");

  const key = "plot:18";
  const parse = () => {
    try { return JSON.parse(payload.joints?.[key]?.sketch || "{}").shapes || []; }
    catch { return []; }
  };
  if (parse().length !== 1) fail(`dropping a dimension left ${parse().length} marks`);
  if (parse()[0]?.kind !== "dim") fail("the dropped mark is not a dimension");
  if (!$(".jf-sketchink line").length) fail("the dimension was not drawn");

  const undo = [...$(".jf-tools button")].find((b) => b.textContent.trim() === "Undo");
  await click(undo);
  if (parse().length !== 0) fail("Undo did not remove the mark");
}

// 17. A breech joint does not list the plots it serves.
//
//    A gang is at one hole. Which houses are on the far side of it is
//    the office's question, and on the page it read as a list of plots
//    to do something about.
{
  payload = {};
  await render();
  await open("Node A1");
  if (/serves plot/i.test(text())) fail("the breech joint page lists the plots it serves");
}

// 18. One declaration, not two.
//
//    The jointing form ends on its own Declaration page. The generic
//    "Tap to sign" block underneath was a second one — and two
//    declarations on a sheet is one somebody signs and one somebody
//    does not, with no way afterwards to say which was meant.
{
  const wi = (await import("node:fs"))
    .readFileSync("./src/features/field/WorkInstruction.jsx", "utf8");
  if (!/\{!jointing && \(\s*\n?\s*<section className="wi-sec wi-dec">/.test(wi)) {
    fail("the generic declaration still renders on a jointing visit");
  }
  /* And the submit gate follows the signature, or a finished form
     could never be sent. */
  if (!/declaration: payload\?\.signature/.test(wi)) {
    fail("the submit gate still waits for a tick that is no longer shown");
  }
}

rmSync("./.jfbundle.mjs", { force: true });
console.log(bad ? `\n${bad} problem(s)`
  : "The jointing form paginates (site, a page per joint, declaration).");
process.exit(bad ? 1 : 0);
