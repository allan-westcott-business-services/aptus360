/* Plots that are not on the drawing yet, sized for.

   A phase two of fifty gets fed from an end span node on phase one.
   Nothing sizes for it, so the main laid today is sized for today — and
   when phase two arrives the answer is to dig the road up again.

   The allowance reaches back to the point of connection, because every
   length between carries it. That is the point, and it is also why one
   node's allowance can widen pipe across a site — so it has to be
   visible, and it must not appear in the bill, where only what is being
   built belongs. */
import { readFileSync } from "node:fs";
import { isTrenchFeature } from "./src/features/gis/snapping.js";
import {
  allowanceOf, allowanceSupplies, allowanceLoad, allowanceText,
} from "./src/features/gis/futureLoad.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* House_Type_Consumption as the schema has it — the same two columns
   gis_unplaced_plots reads to work out what a drawn plot draws. */
const CONS = [
  { Bedrooms: 3, Heat_Source_ID: 1, Consumption_kVA: 2.5, Gas_PID_kW: 11 },
  { Bedrooms: 4, Heat_Source_ID: 1, Consumption_kVA: 3.0, Gas_PID_kW: 13 },
  /* Air source: draws more electric and no gas at all. */
  { Bedrooms: 4, Heat_Source_ID: 2, Consumption_kVA: 7.5, Gas_PID_kW: null },
];
const node = (a) => ({ Attributes: { Future_Allowance: a } });

// 1. A breakdown reads the same figures a drawn plot reads.
{
  const a = allowanceOf(node({
    rows: [
      { bedrooms: 3, heatSourceId: 1, count: 20 },
      { bedrooms: 4, heatSourceId: 1, count: 10 },
    ],
  }));
  if (!a) fail("a breakdown does not register as an allowance");
  if (allowanceSupplies(a) !== 30) {
    fail(`30 plots counted as ${allowanceSupplies(a)}`);
  }
  const gas = allowanceLoad(a, "gas", CONS);
  if (gas.value !== 350) fail(`20x11 + 10x13 came to ${gas.value}, wanted 350`);
  const elec = allowanceLoad(a, "electric", CONS);
  if (elec.value !== 80) fail(`20x2.5 + 10x3 came to ${elec.value}, wanted 80`);
}

// 2. Air source draws electric and no gas.
//
//    Not a rule invented here: it is what the consumption table says,
//    and reading anything else would be a second answer to what a plot
//    of that description draws.
{
  const a = allowanceOf(node({
    rows: [{ bedrooms: 4, heatSourceId: 2, count: 12 }],
  }));
  const gas = allowanceLoad(a, "gas", CONS);
  if (gas.value !== 0) fail("air source plots were sized for gas");
  /* And said, rather than counted as nothing in silence — a missing
     figure is a table to fill in, not a zero. */
  if (!gas.unmatched.length) {
    fail("a described plot with no gas figure is silently sized as nothing");
  }
  const elec = allowanceLoad(a, "electric", CONS);
  if (elec.value !== 90) fail(`12x7.5 came to ${elec.value}, wanted 90`);
}

// 3. Water takes a count, not a load.
//
//    Water mains size on how many plots lie beyond a point rather than
//    on a load, so a kW box against water would be a number nothing
//    reads.
{
  const a = allowanceOf(node({
    rows: [{ bedrooms: 3, heatSourceId: 1, count: 20 }],
  }));
  if (allowanceLoad(a, "water", CONS).value !== 0) {
    fail("water was given a load figure");
  }
  if (allowanceSupplies(a) !== 20) fail("water gets no count either");

  /* A figure typed against water is ignored rather than stored and
     unread.

     With rows beside it, because an allowance of a typed water figure
     alone is not an allowance at all — allowanceOf returns null — so a
     fixture without them could not reach the guard and passed whatever
     the code did. */
  const typed = allowanceOf(node({
    rows: [{ bedrooms: 3, heatSourceId: 1, count: 20 }],
    manual: { water: 99 },
  }));
  if (allowanceLoad(typed, "water", CONS).value) {
    fail("a water figure was accepted and used");
  }
}

// 4. A typed figure wins for its own utility, and only its own.
{
  const a = allowanceOf(node({
    rows: [{ bedrooms: 3, heatSourceId: 1, count: 20 }],
    manual: { gas: 400 },
  }));
  const gas = allowanceLoad(a, "gas", CONS);
  if (gas.value !== 400) fail("a typed gas figure was overruled by the breakdown");
  if (!gas.fromManual) fail("the panel cannot tell that the figure was typed");
  /* Electric still comes from the breakdown: one override is not an
     override of everything. */
  if (allowanceLoad(a, "electric", CONS).value !== 50) {
    fail("typing a gas figure changed the electric one");
  }
}

// 5. A count is not optional where a load is given.
//
//    Gas reads its diversity factor against how many supplies lie
//    beyond a point. A load with no count is diversified as though one
//    enormous house drew it.
{
  const typed = allowanceOf(node({ manual: { gas: 250 } }));
  if (allowanceSupplies(typed) !== 0) {
    fail("a typed figure invented a plot count");
  }
  const editor = readFileSync("./src/features/gis/FutureAllowance.jsx", "utf8");
  if (!/sizes on how many\s*\n?\s*plots lie beyond/.test(editor)) {
    fail("the editor does not say what a typed figure cannot do");
  }
}

// 6. Nothing is an allowance until something is said.
//
//    Somebody who opens the field, changes nothing and closes it has
//    not made a claim about the future.
{
  if (allowanceOf(node({ rows: [], manual: {} }))) {
    fail("an empty allowance counts as one");
  }
  if (allowanceOf(node({ rows: [{ bedrooms: 3, count: 0 }] }))) {
    fail("a row of nought plots counts as an allowance");
  }
  if (allowanceOf({ Attributes: {} })) fail("a node with no allowance has one");
  if (allowanceText(null) !== "") fail("nothing says something");
}

// 7. It reaches the point of connection.
//
//    Added to the node's own demand, which is the only place it needs
//    to go — everything upstream sums what lies beyond it, so the
//    figure travels to the POC by the same walk that carries the real
//    plots.
{
  const gas = readFileSync("./src/features/gis/gasNetwork.js", "utf8");

  if (!/demand\[hit\] \+= Number\(f\.supplies\)/.test(gas)) {
    fail("an allowance adds no supplies to the network");
  }
  if (!/demandKw\[hit\] \+= Number\(f\.kw\)/.test(gas)) {
    fail("an allowance adds no load to the network");
  }
  /* Into demand, before the accumulation — not into served, which is
     after it and would reach nothing upstream. */
  const addAt = gas.indexOf("demandKw[hit] += Number(f.kw)");
  const sumAt = gas.indexOf("servedKw[parent[u]] += servedKw[u]");
  if (addAt < 0 || sumAt < 0 || addAt > sumAt) {
    fail("the allowance is added after the walk that carries it upstream");
  }

  /* An allowance on a node the main cannot reach is a claim about a leg
     that does not exist, and sizing nothing for it silently would be
     worse than saying so. */
  if (!/stranded: true/.test(gas)) {
    fail("an allowance that lands on nothing is silently ignored");
  }

  /* The behaviour, walked: a node's allowance reaches the source. */
  const nodes = [[0, 0], [100, 50], [200, 0]];
  const demand = [0, 0, 0];
  const demandKw = [0, 0, 0];
  demand[1] += 30;
  demandKw[1] += 350;
  const parent = [-1, 0, 1];
  const served = demand.slice();
  const servedKw = demandKw.slice();
  for (let i = 2; i >= 0; i--) {
    if (parent[i] >= 0) {
      served[parent[i]] += served[i];
      servedKw[parent[i]] += servedKw[i];
    }
  }
  if (served[0] !== 30 || servedKw[0] !== 350) {
    fail(`the allowance reached the POC as ${served[0]} plots, ${servedKw[0]} kW`);
  }
  if (nodes.length !== 3) fail("the fixture is wrong");
}

// 8. Both the report and the build see it.
//
//    They are the same question asked twice, and two readings would
//    size a main one way on screen and another in the ground.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const passes = (canvas.match(/^\s+futureAllowances,$/gm) || []).length;
  if (passes < 2) {
    fail(`only ${passes} of the two gas planners is given the allowances`);
  }
  if (!/const futureAllowances = useMemo/.test(canvas)) {
    fail("the allowances are gathered more than once");
  }
  /* Read from the consumption table the endpoint returns, not from a
     figure invented on the page. */
  const api = readFileSync("./netlify/functions/lookups.js", "utf8");
  if (!/houseTypeConsumption/.test(api)) {
    fail("the consumption table is not sent to the drawing");
  }
  if (!/Consumption_kVA,Gas_PID_kW/.test(api)) {
    fail("the two figures a described plot needs are not fetched");
  }
}

// 9. It is sized for, not billed.
//
//    Nothing extra is built. A bigger pipe shows up as a larger
//    diameter against the same metres, not as fifty plots nobody is
//    connecting.
{
  const bom = readFileSync("./src/features/gis/bomLabour.js", "utf8");
  if (/Future_Allowance|futureAllowance/.test(bom)) {
    fail("the bill counts plots that are not being built");
  }
}

// 10. An allowance is visible, on the drawing and before the build.
//
//     Fifty plots nobody has drawn widen the main from that node back
//     to the point of connection. Invisible, that is a drawing where
//     one length is 180mm and its neighbour 90mm for a reason living
//     entirely in a field somebody has to open a panel to see.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* A ring on the node itself. */
  const nodeAt = canvas.indexOf("A node that is carrying future load");
  if (nodeAt < 0) fail("a node carrying an allowance looks like any other");
  /* The ring block itself, comments stripped — the explanation beside
     it names everything the check looks for, and matching that passed
     while the code did nothing. */
  const ring = (nodeAt < 0 ? "" : canvas.slice(nodeAt, nodeAt + 1400))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/if \(allowanceOf\(f\)\) \{/.test(ring)) {
    fail("the ring is not drawn from whether the node has an allowance");
  }
  /* Sized from the node's own radius rather than a guess at what the
     style calls it — the first version read ps.symbolSizePx, which does
     not exist, and would have drawn every ring the same size. */
  if (!/const rr = Math\.max\(3, ps\.symbolPx\)/.test(ring)) {
    fail("the ring is not sized from the node's own style");
  }

  /* And said before the build runs, which is when somebody decides
     whether the figure is right. */
  const code = canvas.replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/`\\n\\nIncludes future expansion allowed for/.test(code)) {
    fail("the build does not say what it is sizing for");
  }
  /* With the plots named as not billed, or the schedule looks like it
     has more pipe than the drawing accounts for. */
  /* The literal as written — it opens with two newlines, so anchoring
     on the quote missed it and the check failed on correct code. */
  if (!/Those plots are not built and are not on the bill/.test(code)) {
    fail("nothing says the allowed-for plots are not being built");
  }
  /* An allowance the main cannot reach is sized for nothing, and
     nothing else would say so. */
  if (!/"future allowance\(s\) sit on a node this main does not reach, "/.test(code)) {
    fail("a stranded allowance is silently sized as nothing");
  }

  /* The message, over a realistic mix — a breakdown, a typed figure
     with no count, and a stranded one. */
  const fa = [
    { label: "A14", supplies: 30, kw: 350 },
    { label: "A22", supplies: 0, kw: 120 },
    { label: "A31", stranded: true },
  ];
  const live = fa.filter((a) => !a.stranded);
  const lines = live.map((a) => `  ${a.label}: `
    + `${a.supplies ? `${a.supplies} plot(s), ` : ""}${a.kw} kW`);
  if (!/30 plot\(s\), 350 kW/.test(lines[0])) {
    fail(`a described allowance reads as ${lines[0]}`);
  }
  /* A typed figure has no count, and must not claim one. */
  if (/plot\(s\)/.test(lines[1])) {
    fail(`a typed allowance invented a plot count: ${lines[1]}`);
  }
  if (fa.filter((a) => a.stranded).length !== 1) fail("the fixture is wrong");
}

// 11. The editor says what it is looking at, and which one.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const code = editor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /* "Point" told somebody nothing they did not already know. */
  if (!/Feature_Role === "spannode" \? "Span node"/.test(code)) {
    fail("a span node's editor is still headed Point");
  }

  /* The feature's id. Nothing on screen said which feature this was, so
     naming one in a query meant describing where it sat and hoping —
     which cost an afternoon on a junction that turned out to be
     correct. */
  if (!/feature\.Feature_ID != null && \(/.test(code)) {
    fail("the editor does not show which feature it is");
  }
  if (!/user-select: all/.test(editor)) {
    fail("the id cannot be selected, which is the one thing it is for");
  }

  /* No layer picker on a span node: its layer is decided when it is
     placed, and changing it hides the node from the utility that owns
     it rather than moving anything. */
  if (!/feature\.Feature_Role !== "spannode" && \(/.test(code)) {
    fail("a span node is still offered a layer to change");
  }

  /* And it is not given the trench form.

     A span node sits on the trench layer, and isTrenchFeature answered
     yes to anything on that layer whether or not it was a line — so the
     editor handed a point a line type dropdown, an easement tickbox and
     an on-site question, none of which mean anything for a point.

     A trench is a length of ground. A point is not one, whatever layer
     it is on. */
  const node = {
    Feature_Type: "point", Feature_Role: "spannode", Layer_Key: "trench",
  };
  if (isTrenchFeature(node, [])) fail("a span node still reads as a trench");
  if (isTrenchFeature({ Feature_Type: "point", Layer_Key: "trench" }, [])) {
    fail("a point on the trench layer reads as a trench");
  }
  /* Real trenches are untouched, by layer and by line type. */
  const types = [{ Type_Key: "trench_main", Layer_Key: "trench" }];
  if (!isTrenchFeature({ Feature_Type: "line", Layer_Key: "trench" }, types)) {
    fail("a mains trench stopped being a trench");
  }
  if (!isTrenchFeature({
    Feature_Type: "line", Layer_Key: "other",
    Attributes: { Line_Type: "trench_main" },
  }, types)) {
    fail("a trench known only by its line type stopped being a trench");
  }
  /* A row with no Feature_Type answers as it always did, rather than
     being dropped by a rule added later. */
  if (!isTrenchFeature({ Layer_Key: "trench" }, types)) {
    fail("a legacy row with no feature type is no longer a trench");
  }
}

// 12. The boundary point is water's symbol.
//
//     It marks where the water enters the plot — the boundary box
//     position. Not a gas or electric idea, and on those drawings it
//     was a lettered ring on every plot meaning nothing to the person
//     reading them.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/isolatedAwayFromWater/.test(canvas)) {
    fail("the boundary point shows on every design");
  }

  /* The rule as the page computes it, evaluated rather than copied.

     A copy here tested the check against itself: breaking the page left
     the copy intact and every case passed. Reading the body out and
     running it is the only version that can fail. */
  const m = canvas.match(
    /const isolatedAwayFromWater = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[shownOnly\]\);/);
  if (!m) fail("the rule is not where the check can read it");
  // eslint-disable-next-line no-new-func
  const away = m ? new Function("shownOnly", m[1]) : () => false;

  /* And it is actually applied, not merely computed. */
  if (!/&& !isolatedAwayFromWater,/.test(canvas)) {
    fail("the rule is worked out and never used");
  }

  /* Hidden where the drawing has been narrowed to something that is not
     water. */
  for (const v of [["gas"], ["electric"], ["gas", "electric"]]) {
    if (!away(v)) fail(`the boundary point still shows on a ${v.join("+")} design`);
  }
  /* Shown wherever water is in view, and on the general drawing —
     taking it off everything would lose the marker every service trench
     routes to. */
  for (const v of [[], ["water"], ["gas", "water"], ["trench"], ["plot"]]) {
    if (away(v)) {
      fail(`the boundary point is hidden on ${v.length ? v.join("+") : "the general view"}`);
    }
  }

  /* The symbol only. Every utility still routes its service trench from
     the main to the point, which is what it is for structurally. */
  const auto = readFileSync("./src/features/gis/autoService.js", "utf8");
  if (/boundaryShown|isolatedAwayFromWater/.test(auto)) {
    fail("routing depends on whether the symbol is drawn");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Future allowances behave (described or typed, reaching the POC, not billed).");
process.exit(bad ? 1 : 0);
