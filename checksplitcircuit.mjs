/* Splitting a circuit that has grown too big.

   Past 80 meters, or with its end-of-line levels out of tolerance, a
   circuit is divided into circuits carrying as near as possible an
   equal number of meters. Users were doing this by hand: add plots,
   build, check levels, move plots, build again.

   ── The whole of it is that a split is a question about the tree ──

   The feeder model already builds a tree rooted at the origin with a
   meter count under every node. A circuit's cable is routed to its
   members along the dig, and two circuits can share a trench, so a
   subtree can go to either circuit whole. The planner opens branches
   bigger than a share at their first junction and deals the parts
   out largest-first to the lightest circuit. That is all it does; the
   build and the levels check say what the result costs.

   Run against the two real drawings this was written on. */
import { readFileSync } from "node:fs";
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { splitPlan, circuitsNeeded, SPLIT_DEFAULTS } from "./src/features/gis/splitPlan.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const load = (file) => {
  /* Cut to what the model reads: trenches, meters, plots, supplies,
     the origin and its points. Loads are stubbed flat because the
     planner counts meters, not kVA. */
  const d = JSON.parse(readFileSync(file, "utf8"));
  const model = buildFeederModel(d.features, {
    lineTypes: d.lineTypes,
    plotById: () => ({ kva_load: 2.84 }),
    nrsById: () => ({ Requested_kVA: 13.3 }),
  });
  return { d, model };
};

// 1. How many circuits the count calls for.
{
  if (circuitsNeeded(51) !== 1) fail("51 meters wants more than one circuit");
  if (circuitsNeeded(80) !== 1) fail("80 meters is over the limit \u2014 the limit is inclusive");
  if (circuitsNeeded(81) !== 2) fail("81 meters is not split");
  if (circuitsNeeded(161) !== 3) fail("161 meters wants three circuits, got " + circuitsNeeded(161));
  /* The levels are the measurement and the count is the rule of
     thumb. A circuit under the count but out of tolerance is split. */
  if (circuitsNeeded(51, { over: true }) !== 2) {
    fail("a circuit under the count but out of tolerance is left as one");
  }
  if (circuitsNeeded(81, { over: true }) !== 2) {
    fail("out of tolerance AND over the count asks for more than the count "
      + "does \u2014 the two reasons are not additive");
  }
}

// 2. Under the count and within tolerance, nothing happens.
{
  const { model } = load("./fixtures/drawing-16-calc-sheet.json");
  /* That fixture is mains only and has no meters, so it is the shape
     of a drawing the model can build but nothing lives on. */
  const plan = model.error ? null : splitPlan(model, {});
  if (plan && plan.groups) fail("a drawing with no meters is split");
}

// 3. Project 16: 51 meters, forced by the levels \u2014 26 / 25.
{
  const { model } = load("./fixtures/drawing-16-split.json");
  if (model.error) { fail(`project 16 will not model: ${model.error}`); }
  else {
    const byCount = splitPlan(model, {});
    if (byCount.groups) fail("51 meters is split on the count alone");

    const plan = splitPlan(model, { over: true });
    if (!plan.groups) fail("a circuit out of tolerance is not split");
    else {
      if (plan.circuits !== 2) fail(`wanted 2 circuits, got ${plan.circuits}`);
      const counts = plan.groups.map((g) => g.count);
      if (counts.reduce((a, b) => a + b, 0) !== 51) {
        fail(`the groups total ${counts.reduce((a, b) => a + b, 0)}, not 51 \u2014 a `
          + "meter has been lost or counted twice");
      }
      if (plan.spread > 1) {
        fail(`26 / 25 is possible and the plan gave ${counts.join(" / ")}`);
      }
      /* Every meter lands in exactly one group. */
      const seen = new Map();
      for (const g of plan.groups) {
        for (const m of g.meters) seen.set(m.Feature_ID, (seen.get(m.Feature_ID) || 0) + 1);
      }
      if ([...seen.values()].some((n) => n > 1)) {
        fail("a meter is put on two circuits at once");
      }
      if (seen.size !== 51) {
        fail(`${seen.size} distinct meters in the groups, not 51`);
      }
    }
  }
}

// 4. Project 20: 85 meters \u2014 split on the count, as close as possible.
{
  const { model } = load("./fixtures/drawing-20-split.json");
  if (model.error) { fail(`project 20 will not model: ${model.error}`); }
  else {
    const plan = splitPlan(model, {});
    if (!plan.groups) fail("85 meters is not split");
    else {
      if (plan.circuits !== 2) fail(`85 meters wants 2 circuits, got ${plan.circuits}`);
      if (plan.spread > 1) {
        fail(`43 / 42 is possible and the plan gave ${plan.groups.map((g) => g.count).join(" / ")}`);
      }
    }

    /* ── Slack is a choice, and it is written down ──

       With none the plan is as even as the tree allows. With a tenth
       it stops opening parts within a tenth of a share, and on this
       drawing that is 46 / 39 in fewer parts \u2014 fewer places the second
       cable runs beside the first. "As close as possible" was asked
       for, so none is the default; a caller who wants the shorter dig
       passes some. */
    if (SPLIT_DEFAULTS.slack !== 0) {
      fail(`the default slack is ${SPLIT_DEFAULTS.slack} \u2014 "as close as possible" `
        + "means none");
    }
    const loose = splitPlan(model, { slack: 0.10 });
    const tight = splitPlan(model, { slack: 0 });
    const partsOf = (p) => p.groups.reduce((t, g) => t + g.parts.length, 0);
    if (!(partsOf(loose) < partsOf(tight))) {
      fail("slack does not reduce the number of parts, so it buys nothing and "
        + "the trade-off it is meant to offer is not there");
    }
    if (!(loose.spread >= tight.spread)) {
      fail("slack made the plan more even, which is backwards");
    }

    /* Three circuits, asked for outright. */
    const three = splitPlan(model, { circuits: 3 });
    if (!three.groups || three.circuits !== 3) fail("asking for three circuits is ignored");
    else if (three.spread > 1) {
      fail(`29 / 28 / 28 is possible and the plan gave ${three.groups.map((g) => g.count).join(" / ")}`);
    }
  }
}

// 5. The plan is the same twice.
{
  /* Ties go to the lower-numbered circuit and parts are sorted by
     node on equal counts, so the same drawing gives the same plan
     \u2014 which is what lets somebody compare today's to yesterday's. */
  const { model } = load("./fixtures/drawing-20-split.json");
  if (!model.error) {
    const a = splitPlan(model, {});
    const b = splitPlan(model, {});
    const sig = (p) => p.groups.map((g) => g.meters.map((m) => m.Feature_ID).sort().join(",")).join("|");
    if (sig(a) !== sig(b)) fail("the same drawing gives two different plans");
  }
}

// 6. On the menu, and through the same write as Link to Circuit.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/label=\{busy === "split" \? "Splitting\\u2026" : "Split Circuit\\u2026"\}/.test(canvas)) {
    fail("there is no Split Circuit item");
  }
  const at = canvas.indexOf("async function proposeSplit");
  const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("async function createCircuitFrom", at));
  if (!body) fail("proposeSplit is missing");
  else {
    if (!/createCircuitFrom\(g\.meters/.test(body)) {
      fail("the split writes membership its own way rather than through "
        + "createCircuitFrom \u2014 a circuit made here would have no way, no "
        + "name and no origin node");
    }
    if (!/plan\.groups\.slice\(1\)/.test(body)) {
      fail("the first group is not left where it is, so the original circuit "
        + "is re-made rather than kept");
    }
    if (!/window\.confirm/.test(body)) {
      fail("the split happens without showing the plan first");
    }
    /* Judged on the last levels check, so a circuit within tolerance
       and under the count is left alone with a message rather than
       split for the sake of it. */
    if (!/overPct \|\| v\?\.overOhms/.test(body)) {
      fail("out-of-tolerance is not read off the levels check");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A circuit past its size splits into equal circuits, subtree by subtree.");
process.exit(bad ? 1 : 0);
