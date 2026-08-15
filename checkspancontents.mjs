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
  spanDigEstimate, rangeDigEstimate, contentsText,
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

console.log(bad ? `\n${bad} problem(s)`
  : "Span contents behave (read off the trench, one entry per utility).");
process.exit(bad ? 1 : 0);
