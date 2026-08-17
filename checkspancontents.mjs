import { readFileSync } from "node:fs";
/* What a span of a mains call-off carries, and which plots are on it.

   Two things checked here, found together on one drawing.

   The utilities are read off the trench rather than ticked by hand: the
   mains on a run are the pipes and cables routed along the sections it
   crosses, and the application already holds that. A tick box can say
   gas on a run with no gas in it; the drawing cannot.

   And a plot belongs to one span. A service teeing in exactly at a node
   satisfied the spans on both sides of it, so plot 16 appeared on
   A8-A14 and again on A14-A16 — on a call-off whose own total counted
   it once. */
import {
  spanContents, callOffUtilities, utilityIdsFor,
  spanDigEstimate, rangeDigEstimate, contentsText, contentsOptions,
} from "./src/features/gis/spanContents.js";
import { toCallOffRows, spansBetween } from "./src/features/gis/mainsCallOff.js";
import { UTILITIES } from "./src/lib/utilities.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LINE_TYPES = [
  { Type_Key: "trench_main", Label: "Mains Trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service Trench", Layer_Key: "trench" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "elec_main", Label: "Electric main", Layer_Key: "electric" },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water" },
];

const line = (id, g, a) => ({
  Feature_ID: id, Feature_Type: "line", Geometry: g,
  Layer_Key: a.lk, Attributes: { Line_Type: a.lt, Size: a.size },
});

const opts = { lineTypes: LINE_TYPES, lookups: null };

/* Two trench sections end to end, as span nodes leave them. Gas runs
   the whole way; electric only along the first. */
const SITE = [
  line(1, [[0, 0], [100, 0]], { lk: "trench", lt: "trench_main" }),
  line(2, [[100, 0], [200, 0]], { lk: "trench", lt: "trench_main" }),
  line(10, [[0, 0], [200, 0]], { lk: "gas", lt: "gas_main", size: "180mm PE" }),
  line(11, [[0, 0], [100, 0]], { lk: "electric", lt: "elec_main", size: "95" }),
];

// 1. A span says what is laid along it.
{
  const both = spanContents([1, 2], SITE, opts);
  const keys = both.map((c) => c.utility).sort();
  if (keys.join(",") !== "electric,gas") {
    fail(`a span across both sections carried ${keys.join(", ")}`);
  }
  const gas = both.find((c) => c.utility === "gas");
  if (gas.label !== "180mm PE") fail(`the gas came back as ${gas.label}`);
  if (gas.count !== 1) fail(`one gas main counted as ${gas.count}`);
}

// 2. A span carrying only some of it says only that.
//
//    The point of showing this per span: somebody splitting the work
//    between teams needs to see which run is the gas and which the
//    electric.
{
  const second = spanContents([2], SITE, opts);
  const keys = second.map((c) => c.utility);
  if (keys.length !== 1 || keys[0] !== "gas") {
    fail(`the second section carried ${keys.join(", ") || "nothing"}, wanted gas only`);
  }
}

// 3. A section with nothing routed in it yet says nothing, rather than
//    failing the span it is part of.
{
  const bare = [line(1, [[0, 0], [100, 0]], { lk: "trench", lt: "trench_main" })];
  if (spanContents([1], bare, opts).length) {
    fail("an empty trench reported something laid in it");
  }
  /* And a span crossing one empty section and one full one still
     reports the full one. */
  const mixed = [...SITE, line(3, [[200, 0], [300, 0]], { lk: "trench", lt: "trench_main" })];
  if (!spanContents([1, 3], mixed, opts).length) {
    fail("one empty section silenced a whole span");
  }
}

// 4. Consecutive runs of one main are one main.
//
//    The same rule the trench width uses: a build cuts a run wherever
//    the calculated size steps, so one pipe comes back as two features.
{
  const stepped = [
    line(1, [[0, 0], [200, 0]], { lk: "trench", lt: "trench_main" }),
    line(10, [[0, 0], [140, 0]], { lk: "gas", lt: "gas_main", size: "180mm PE" }),
    line(11, [[140, 0], [200, 0]], { lk: "gas", lt: "gas_main", size: "90mm PE" }),
  ];
  const r = spanContents([1], stepped, opts);
  if (r.length !== 1) fail(`a stepped main came back as ${r.length} utilities`);
  if (r[0].count !== 1) fail(`a stepped main counted as ${r[0].count} pipes`);
  /* Named by whichever covers most of it, with the other kept for the
     tooltip rather than dropped. */
  if (r[0].label !== "180mm PE") fail(`the stepped main was named ${r[0].label}`);
  if (!r[0].alsoSizes.includes("90mm PE")) fail("the other size was lost entirely");
}

// 5. A call-off's utilities are the union across its spans.
//
//    One visit, one set of paperwork: a gang laying gas on one run and
//    water on another needs both on it.
{
  const spans = [{ trenchIds: [2] }, { trenchIds: [1] }];
  const found = callOffUtilities(spans, SITE, opts);
  if (found.length !== 2) fail(`the call-off found ${found.length} utilities, wanted 2`);
  if (!found.includes("gas") || !found.includes("electric")) {
    fail(`the call-off found ${found.join(", ")}`);
  }
  /* In the order first met, so the list reads the way the runs were
     named — the second span here is the one with the electric. */
  if (found[0] !== "gas") fail("the utilities were not in the order the runs were named");

  if (callOffUtilities([], SITE, opts).length) fail("a call-off with no spans found utilities");
}

// 6. A layer key becomes the Utility_ID the call-off is saved with.
{
  const utilities = [
    { Utility_ID: 1, Utility: "Electric" },
    { Utility_ID: 2, Utility: "Gas" },
    { Utility_ID: 3, Utility: "Water" },
    { Utility_ID: 4, Utility: "Street Lighting", Is_Lighting: true },
  ];
  const ids = utilityIdsFor(["gas", "electric"], utilities);
  if (ids.join(",") !== "2,1") fail(`gas and electric came back as ${ids.join(", ")}`);

  /* Loose on case and spacing, and on nothing else — a layer called
     "electric" and a utility called "Electric" are the same thing. */
  if (utilityIdsFor(["ELECTRIC"], utilities).join(",") !== "1") {
    fail("a differently cased key did not match");
  }
  if (utilityIdsFor(["telecoms"], utilities).length) {
    fail("a utility that is not in the list matched something");
  }
  /* Never twice, however many spans carried it. */
  if (utilityIdsFor(["gas", "gas"], utilities).length !== 1) {
    fail("a utility on two runs was listed twice");
  }
}

// 7. A span is estimated from the sections it crosses.
//
//    The canvas raises call-offs by its own path, and that path saved no
//    estimate at all — so Planning had nothing to default an end date
//    from and the To box came up empty on every call-off raised from the
//    drawing.
{
  const span = { trenchIds: [1, 2], lengthM: 200 };
  const e = spanDigEstimate(span, SITE, opts);
  if (!e.ok) fail("a span across two drawn sections was not estimated");
  if (!(e.halfDays >= 1)) fail(`a 200m span came to ${e.halfDays} half-days`);
  if (e.sections !== 2) fail(`the span was estimated over ${e.sections} sections`);

  /* Longer takes longer. */
  const half = spanDigEstimate({ trenchIds: [1], lengthM: 100 }, SITE, opts);
  if (!(half.hours < e.hours)) fail("half the span took as long as all of it");

  /* A span with no drawn section gets no estimate rather than a zero. */
  if (spanDigEstimate({ trenchIds: [], lengthM: 50 }, SITE, opts).ok) {
    fail("a span crossing nothing was given a duration");
  }
}

// 8. A run is the sum of its spans, and the rows carry both.
//
//    Summed rather than pooled: each span is its own length of dig with
//    its own setup, and the half-days on a run should be what a planner
//    would get booking its spans one at a time.
{
  const range = {
    spans: [
      { from: "A1", to: "A5", trenchIds: [1], lengthM: 100, plots: ["23"] },
      { from: "A5", to: "A7", trenchIds: [2], lengthM: 100, plots: ["24"] },
    ],
  };
  const r = rangeDigEstimate(range, SITE, opts);
  if (!r.ok) fail("a run of two spans was not estimated");
  if (r.spans !== 2) fail(`the run was estimated over ${r.spans} spans`);

  const rows = toCallOffRows([range], {
    estimateFor: (x) => rangeDigEstimate(x, SITE, opts),
    contentsFor: (x) => contentsText(
      [...new Set(x.spans.flatMap((sp) => sp.trenchIds))], SITE, opts,
    ),
  });
  if (rows[0].Estimated_Half_Days !== r.halfDays) {
    fail("the saved row did not carry the run's estimate");
  }
  if (!/180mm PE/.test(rows[0].Contents || "")) {
    fail(`the saved row's contents read "${rows[0].Contents}"`);
  }

  /* And without the callbacks, the rows say nothing rather than
     something invented — anything not holding the drawing cannot work
     these out. */
  const bare = toCallOffRows([range]);
  if (bare[0].Estimated_Half_Days !== null) fail("a row invented an estimate");
  if (bare[0].Contents !== null) fail("a row invented its contents");
}

// 9. Contents as one line, or nothing at all.
{
  const text = contentsText([1], SITE, opts);
  if (!/95/.test(text) || !/180mm PE/.test(text)) {
    fail(`the contents line read "${text}"`);
  }

  /* Each size behind its own utility's mark. A size on its own says
     nothing about what it is — "95" and "63mm" read as two numbers
     until the bolt and the droplet are in front of them, and the
     scheduling side holds none of the drawing to work it out from. */
  const gas = UTILITIES.find((u) => u.name === "Gas").icon;
  const elec = UTILITIES.find((u) => u.name === "Electric").icon;
  if (!text.includes(`${elec} 95`)) fail(`the electric had no mark: "${text}"`);
  if (!text.includes(`${gas} 180mm PE`)) fail(`the gas had no mark: "${text}"`);

  /* And the marks come from the one list of utilities, not from a
     second copy here — a utility renamed in one place and not the other
     is a size with no mark rather than a crash, which is the kind of
     thing nobody notices. */
  for (const c of spanContents([1], SITE, opts)) {
    if (!c.icon) fail(`${c.utility} came back with no mark`);
  }
  /* Null, not an empty string: "nothing is laid here" and "nobody
     recorded it" are different, and the table says them differently. */
  const bare = [line(1, [[0, 0], [100, 0]], { lk: "trench", lt: "trench_main" })];
  if (contentsText([1], bare, opts) !== null) {
    fail("an empty trench produced a contents line");
  }
}

// 10. A span is drawn all the way to its far node, whichever way the
//     trench sections were drawn.
//
//     clipBetween returns points in the order they lie along the trench,
//     which is the order somebody drew it — not the order the route
//     crosses it. A section drawn back towards the previous node came
//     out reversed, and joining it dropped the point at the far node
//     instead of the duplicated corner: the last few metres of the span
//     were never drawn.
//
//     It showed on some runs and not others because it depends on which
//     way that section happened to be drawn, and it got likelier as
//     splitting at span nodes turned long trenches into more sections.
{
  const node = (id, at, label) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "spannode",
    Geometry: [at], Attributes: { Span_Label: label, Span_Anchor: at },
  });
  const trench = (id, g) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Geometry: g, Attributes: { Line_Type: "trench_main" },
  });

  /* Two sections meeting at a corner 77m along an 84m run. The second
     is drawn each way round; the span must reach A7 either way. */
  for (const [how, second] of [
    ["drawn forwards", [[77, 0], [84, 0]]],
    ["drawn backwards", [[84, 0], [77, 0]]],
  ]) {
    const feats = [
      trench(1, [[0, 0], [77, 0]]), trench(2, second),
      node(10, [0, 0], "A5"), node(11, [84, 0], "A7"),
    ];
    const sp = spansBetween(feats, { fromId: 10, toId: 11 }).spans[0];
    if (!sp) { fail(`no span found with the second section ${how}`); continue; }

    const end = sp.geometry[sp.geometry.length - 1];
    if (Math.abs(end[0] - 84) > 0.01) {
      fail(`with the second section ${how}, the span stops `
        + `${(84 - end[0]).toFixed(1)}m short of A7`);
    }
    if (Math.abs(sp.geometry[0][0]) > 0.01) {
      fail(`with the second section ${how}, the span does not start at A5`);
    }

    /* And it runs one way throughout — a piece joined backwards doubles
       back on itself, which draws as a spike rather than a run. */
    for (let i = 1; i < sp.geometry.length; i++) {
      if (sp.geometry[i][0] < sp.geometry[i - 1][0] - 0.01) {
        fail(`with the second section ${how}, the drawn span doubles back`);
        break;
      }
    }

    /* The length was always right — only the drawing was short, which
       is why nothing else complained. */
    if (Math.abs(sp.lengthM - 84) > 0.1) {
      fail(`with the second section ${how}, the span measured ${sp.lengthM}m`);
    }
  }
}

// 11. A plot belongs to the main it tees into, not one passing nearby.
//
//     Two mains meeting at a junction run within a metre or two of each
//     other either side of it, so a service joining one sits close to
//     both. Taking any main within reach collected plots off the branch
//     nobody had selected — plot 16, fed from past A14, turned up on a
//     run that only came within a metre and a half of its joint.
{
  const node = (id, at, l) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "spannode",
    Geometry: [at], Attributes: { Span_Label: l, Span_Anchor: at },
  });
  const tr = (id, g, lt, conn) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Geometry: g, Attributes: { Line_Type: lt || "trench_main", Connects: conn },
  });
  const meter = (id, at, label) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "meter",
    Geometry: [at], Plot_ID: id, Label: label,
  });

  /* A run along y=0, with a branch main heading north from a junction
     halfway along it. Plot 16 tees into the branch, one and a half
     metres from the run. */
  const serviceTypes = new Set(["trench_service"]);
  const site = (svcConnects) => [
    tr(1, [[0, 0], [100, 0]]),
    tr(2, [[50, 0], [50, 60]]),
    tr(3, [[50, 1.5], [52, 6]], "trench_service", svcConnects),
    meter(16, [52, 6], "16"),
    node(10, [0, 0], "A5"), node(11, [100, 0], "A7"), node(12, [50, 60], "A14"),
  ];
  const plotsOn = (feats, fromId, toId) => spansBetween(feats,
    { fromId, toId, serviceTypes, plotOf: (f) => f.Label })
    .spans.flatMap((sp) => sp.plots);

  /* The service records that it runs into the branch, so the run past
     its joint does not get the plot. */
  const joined = site([2]);
  if (plotsOn(joined, 10, 11).includes("16")) {
    fail("a plot fed from a branch was collected by the run passing its joint");
  }
  /* And it is still collected by the run that does feed it — the fix is
     not "drop anything near a junction". */
  if (!plotsOn(joined, 10, 12).includes("16")) {
    fail("the plot was lost from the run that feeds it");
  }

  /* What is recorded wins over what is near. Same drawing, the service
     joined to the run instead: now the run gets it, though nothing
     about the distances changed. */
  const other = site([1]);
  if (!plotsOn(other, 10, 11).includes("16")) {
    fail("a plot joined to the run was not collected by it");
  }

  /* And where nothing is recorded — a service drawn before links were
     kept, or one whose links have not been recomputed since it moved —
     the nearest main is the fallback. A guess, but the right one here,
     and better than dropping the plot entirely. */
  const unlinked = site(undefined);
  if (plotsOn(unlinked, 10, 11).includes("16")) {
    fail("with no recorded link, the nearest main did not decide");
  }
  if (!plotsOn(unlinked, 10, 12).includes("16")) {
    fail("with no recorded link, the plot was lost altogether");
  }
}

// The size in force, not the calculated one.
//
//    A length overridden to 185 was called off as the 95 the build had
//    worked out: this read VD_Cable_Size_ID and stopped. The call-off
//    said one thing, the trench editor beside it said another, and the
//    bill said a third.
{
  const lookups = {
    cableSizes: [
      { Cable_Size_ID: 5, Size_Label: "3c WAVE 95" },
      { Cable_Size_ID: 9, Size_Label: "3c WAVE 185" },
    ],
    gasPipeSizes: [
      { Gas_Pipe_Size_ID: 2, Size_Label: "125mm PE" },
      { Gas_Pipe_Size_ID: 3, Size_Label: "180mm PE" },
    ],
    waterPipeSizes: [{ Water_Pipe_Size_ID: 1, Size_Label: "63mm" }],
  };
  const types = [
    { Type_Key: "elec_main", Layer_Key: "electric", Label: "Electric Main" },
    { Type_Key: "gas_main", Layer_Key: "gas", Label: "Gas Main" },
  ];
  const { labelOf } = contentsOptions(types, lookups);
  const feat = (layer, attrs) => ({ Layer_Key: layer, Attributes: attrs });

  const overridden = feat("electric", {
    Line_Type: "elec_main", VD_Cable_Size_ID: 5, Manual_VD_Cable_Size_ID: 9,
  });
  if (labelOf(overridden) !== "3c WAVE 185") {
    fail(`an overridden cable is called off as ${labelOf(overridden)}`);
  }

  /* And the calculated one where nothing has been overridden — the
     override does not become a requirement. */
  const plain = feat("electric", { Line_Type: "elec_main", VD_Cable_Size_ID: 5 });
  if (labelOf(plain) !== "3c WAVE 95") {
    fail(`an un-overridden cable is called off as ${labelOf(plain)}`);
  }

  /* Gas and water had the same fault, and are fixed by the same rule
     rather than by two more lookups. */
  const gas = feat("gas", {
    Line_Type: "gas_main", Gas_Pipe_Size_ID: 2, Manual_Gas_Pipe_Size_ID: 3,
  });
  if (labelOf(gas) !== "180mm PE") {
    fail(`an overridden gas main is called off as ${labelOf(gas)}`);
  }

  /* A size typed before the catalogue existed is still a real size. */
  const typed = feat("gas", { Line_Type: "gas_main", Size: "90mm PE" });
  if (labelOf(typed) !== "90mm PE") fail("a typed size is lost");

  /* ── The older ways a size was held ──

     Reading only the two keys the build writes today lost every size on
     an older drawing, and the panel fell back to naming the line type.
     Which is the worse fault: the wrong size is one length ordered
     wrongly, no sizes at all is a call-off nobody can act on. */
  const legacy = feat("electric", { Line_Type: "elec_main", Cable_Size_ID: 5 });
  if (labelOf(legacy) !== "3c WAVE 95") {
    fail(`a cable holding a plain Cable_Size_ID reads as ${labelOf(legacy)}`);
  }
  /* A layer the size rule does not know, with its size typed on it. */
  const other = { Layer_Key: "lighting", Attributes: { Line_Type: "elec_main", Size: "95" } };
  if (labelOf(other) !== "95") {
    fail(`a typed size on another layer reads as ${labelOf(other)}`);
  }
  const noLayer = { Attributes: { Line_Type: "elec_main", Size: "25mm" } };
  if (labelOf(noLayer) !== "25mm") {
    fail(`a line with no layer loses its typed size: ${labelOf(noLayer)}`);
  }

  /* Nothing sized falls back to the line type's name rather than
     going blank. */
  const bare = feat("gas", { Line_Type: "gas_main" });
  if (labelOf(bare) !== "Gas Main") fail("an unsized main has no label at all");

  /* Through the shared rule, not a second lookup: this is the third
     reader of "what size is this", and the first two disagreed. */
  const src = readFileSync("./src/features/gis/spanContents.js", "utf8");
  if (!/sizeLabelOf\(/.test(src)) {
    fail("the span contents keep their own idea of a feature's size");
  }
  if (/Attributes\?\.Cable_Size_ID \?\? /.test(src)) {
    fail("the old calculated-only lookup is still there");
  }
}

// The mains call-off panel, as it reads.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* The "Add another span?" prompt is gone: both its answers were
     already on screen — click another node, or press Raise call-off. */
  /* Comments stripped: the panel explains why the prompt was removed,
     and matching that explanation failed on correct code. */
  const code = canvas
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  if (/Add another span\?/.test(code)) fail("the prompt is still there");
  if (/className="gco-ask"/.test(code)) fail("the prompt still renders");

  /* Cancel sits beside Raise call-off: the two ends of one decision
     were at opposite ends of the panel.

     The mains panel's footer, not the first one in the file — three
     panels have a gco-foot, and slicing the first checked the wrong
     one. */
  /* The mains panel's footer specifically.

     Three panels have a gco-foot and the service one has its own Cancel
     and its own disabled guard, so anything checked against the whole
     file passed while the mains footer had lost it. Found by the button
     that only this panel has. */
  const raiseAt = code.indexOf("submitCallOff}");
  const footAt = raiseAt < 0 ? -1 : code.lastIndexOf('className="gco-foot"', raiseAt);
  /* Far enough past the handler to include the button's own label,
     which sits on the line after it. */
  const block = footAt < 0 ? "" : code.slice(footAt, raiseAt + 260);
  if (!block) fail("there is no mains raise button at all");
  if (!/Cancel/.test(block)) fail("Cancel is not beside Raise call-off");
  if (!/Raise call-off/.test(block)) fail("the raise button left the footer");

  /* And it cannot be pressed with nothing picked. */
  if (!/!callOff\?\.spans\?\.length/.test(block)) {
    fail("a call-off can be raised with no runs on it");
  }

  /* What a run carries, on its head line beside the length: the three
     facts somebody checks before raising read as one line or as three
     things to look for. */
  if (!/gco-in gco-in-head/.test(code)) {
    fail("a run does not say what it carries beside its length");
  }
  /* The name and the length do not wrap. "A19 to A23" broken across
     two lines is harder to read than a row that pushes the panel
     wider — and .gco-f having flex:1 was what squeezed them, by taking
     all the spare width for a six-character length. */
  const css = canvas.slice(canvas.indexOf("const CSS = "));
  const headRule = css.slice(css.indexOf(".gco-range-head > strong"),
    css.indexOf(".gco-range-head > strong") + 120);
  if (!/white-space: nowrap/.test(headRule)) {
    fail("a run's name can wrap mid-name");
  }
  const lenAt = css.indexOf(".gco-f {");
  if (!/white-space: nowrap/.test(css.slice(lenAt, lenAt + 160))) {
    fail("a run's length can wrap after the number");
  }
  if (/\.gco-f \{ flex: 1;/.test(css)) {
    fail("the length still takes all the spare width");
  }
  /* One width on the panel, not two — the second silently overrode the
     first. */
  const panelAt = css.indexOf(".gis-co {");
  const panel = css.slice(panelAt, css.indexOf("}", panelAt));
  if ((panel.match(/width:/g) || []).length !== 1) {
    fail("the panel declares its width more than once");
  }

  /* The Utilities summary line is gone: each span says what it carries
     on its own head line, and the union across three runs said what
     somebody could already see while hiding what they could not. */
  if (/className="gco-utils"/.test(code)) {
    fail("the utilities summary line is still shown");
  }
  if (/\.gco-utils \{|\.gco-utils-found/.test(css)) {
    fail("the removed line's styles are still there");
  }
  /* But the submission still records which utilities it covers — a
     different question from what a panel shows. */
  if (!/utility_ids: utilityIdsFor\(callOffFound/.test(code)) {
    fail("removing the line stopped the call-off recording its utilities");
  }

  /* Read off the drawing through the shared rule, so the panel and the
     bill cannot disagree about a size. */
  const head = code.slice(code.indexOf("gco-in-head"));
  if (!/spanContents\(/.test(head.slice(0, 600))) {
    fail("the panel works out its own contents");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Span contents behave (read off the trench, one entry per utility).");
process.exit(bad ? 1 : 0);
