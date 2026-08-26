/* Self-lay meters, and the two flags that could be confused.

   `Plot.Self_Lay_Provider` and `Plot_Utility.Self_Lay_Provider` both
   exist and both mean something. The plot-level one says the plot is
   somebody else's; the per-utility one says THIS connection on it is.
   0066 carries them side by side in one view and has to alias the
   second to stop them colliding, which is how close together they sit.

   Reading the plot-level one here would cross out all three meters on a
   plot that is self-lay for water alone. That is the assertion this
   file exists for; everything else is around it. */

import { readFileSync } from "node:fs";
import { selfLaySet, selfLayNrsSet, utilityIdForLayer, isSelfLayMeter, isSelfLayFor }
  from "./src/features/gis/selfLay.js";
import { planSeed, isExistingType, splitExisting } from "./src/features/gis/autoService.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Electric 1, Gas 2, Water 3 — the ids in lib/utilities.js. */
const layers = [
  { Layer_Key: "electric", Utility_ID: 1 },
  { Layer_Key: "gas", Utility_ID: 2 },
  { Layer_Key: "water", Utility_ID: 3 },
  /* A layer that is not a utility at all. */
  { Layer_Key: "trench", Utility_ID: null },
];

const meter = (plotId, layerKey, extra = {}) => ({
  Feature_ID: `${plotId}-${layerKey}`, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: layerKey, Plot_ID: plotId, Geometry: [[0, 0]], Attributes: {}, ...extra,
});

/* Plot 101 is self-lay on water only. Plot 102 is ours throughout. */
const connections = [
  { Plot_ID: 101, Utility_ID: 1, Self_Lay_Provider: false },
  { Plot_ID: 101, Utility_ID: 3, Self_Lay_Provider: true },
  { Plot_ID: 102, Utility_ID: 1, Self_Lay_Provider: false },
  { Plot_ID: 102, Utility_ID: 3, Self_Lay_Provider: false },
];
const slp = selfLaySet(connections);
const is = (f, opts = {}) => isSelfLayMeter(f, { slp, layers, ...opts });

// 1. The one that matters: per utility, not per plot.
{
  if (!is(meter(101, "water"))) fail("plot 101's water meter is not marked, and it is self-lay");
  if (is(meter(101, "electric"))) {
    fail("plot 101's ELECTRIC meter is marked \u2014 the plot-level flag is being read, "
      + "not Plot_Utility");
  }
  if (is(meter(102, "water"))) fail("plot 102's water meter is marked and nothing says it is self-lay");
}

/* 2. A plot-level flag on the feature must not reach it.

   Belt and braces against the obvious wrong fix: somebody adding
   Self_Lay_Provider to the seed's attributes and reading it here would
   pass assertion 1 and still be wrong. */
{
  const f = meter(102, "electric", { Attributes: { Self_Lay_Provider: true } });
  if (is(f)) fail("a Self_Lay_Provider on the feature itself marks the meter");
}

/* 3. Absence is not self-lay.

   Plot_Utility rows arrive when connections are generated. Before that
   a project has none, and marking on silence would cross out every
   meter on every drawing that has not reached that stage. */
{
  if (is(meter(999, "electric"))) fail("a plot with no connection row is marked");
  if (isSelfLayMeter(meter(101, "water"), { connections: [], layers })) {
    fail("an empty connection list still marks a meter");
  }
}

// 4. Only meters. A trench on a self-lay plot is still ours if we dug it.
{
  for (const role of ["plot", "joint", "spannode", "nrs"]) {
    const f = { ...meter(101, "water"), Feature_Role: role };
    if (is(f)) fail(`a feature with role '${role}' is marked as a self-lay meter`);
  }
}

/* 5. The layer is resolved through Utility_ID, not by name.

   A layer renamed in Admin must not stop the mark appearing — the
   canvas resolves isolation, pipe sizes and design scopes the same way
   and for the same reason. */
{
  const renamed = [{ Layer_Key: "water", Utility_ID: 3, Layer_Name: "Potable (SLP)" }];
  if (!isSelfLayMeter(meter(101, "water"), { slp, layers: renamed })) {
    fail("a renamed water layer stops the meter being marked");
  }
  if (utilityIdForLayer("trench", layers) !== null) {
    fail("a layer with no Utility_ID resolves to one");
  }
  if (utilityIdForLayer("nonesuch", layers) !== null) {
    fail("an unknown layer resolves to a utility");
  }
  /* A meter on a layer that is not a utility cannot be self-lay for
     one, and must not throw working that out. */
  if (is(meter(101, "trench"))) fail("a meter on the trench layer is marked");
}

/* 6. A supply's meter reads its own record.

   A non-residential supply has no plot, so Plot_Utility cannot answer
   for it. Its own Self_Lay_Provider covers the whole supply. */
{
  const rows = [{ NRS_ID: 7, Self_Lay_Provider: true },
    { NRS_ID: 8, Self_Lay_Provider: false }];
  const slpNrs = selfLayNrsSet(rows);
  const supply = meter(null, "electric", { Plot_ID: null, Attributes: { NRS_ID: 7 } });
  const ours = meter(null, "electric", { Plot_ID: null, Attributes: { NRS_ID: 8 } });
  if (!is(supply, { slpNrs })) fail("a self-lay supply's meter is not marked");
  if (is(ours, { slpNrs })) fail("a supply that is ours is marked");
  /* The rows directly, for a caller with nothing prepared. */
  if (!is(supply, { nrs: rows })) fail("a self-lay supply is missed when given the rows");
  /* And with nothing passed it must not throw or guess. */
  if (is(supply)) fail("a supply's meter is marked with no record to read");
  if (slpNrs.size !== 1) fail(`selfLayNrsSet holds ${slpNrs.size} supplies, expected 1`);

  /* A supply's meter must not be answered by the plot rule: it has no
     Plot_ID, and a set lookup on null would quietly match nothing
     rather than say why. */
  const noFlag = meter(null, "electric", { Plot_ID: null, Attributes: { NRS_ID: 9 } });
  if (is(noFlag, { slpNrs })) fail("a supply not in the set is marked");
}

/* 7. The set is built from the flag, not from the row existing.

   A Plot_Utility row is created for every connection; only some are
   self-lay. A set built from "has a row" would mark everything the
   moment connections were generated. */
{
  if (slp.size !== 1) fail(`selfLaySet holds ${slp.size} pair(s), expected 1`);
  const partial = selfLaySet([{ Plot_ID: 5, Self_Lay_Provider: true }]);
  if (partial.size !== 0) fail("a row with no Utility_ID is put in the set");
}

/* 8. The canvas draws it, and draws it over the symbol.

   Asserted on the source because the fill and stroke that finish every
   point would paint straight over a cross drawn before them — the mark
   would be computed, correct, and invisible. That is not something the
   pure function can be asked about. */
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/import\s*{[^}]*isSelfLayMeter/s.test(canvas)) {
    fail("the canvas does not import isSelfLayMeter");
  }
  if (!/listConnections\(/.test(canvas)) {
    fail("the canvas never loads the connection rows the flag is on");
  }
  const cross = canvas.indexOf("slpCross = {");
  const fillAfter = canvas.indexOf("if (slpCross) {");
  if (cross < 0 || fillAfter < 0) {
    fail("the self-lay cross is not drawn on the canvas");
  } else if (fillAfter < cross) {
    fail("the cross is drawn before the symbol is filled \u2014 the fill covers it");
  }
  /* Declared outside the branch that sets it. A const inside the meter
     branch is not in scope where the cross is drawn, which is fault 2
     and blanks the whole page rather than losing a mark. */
  if (!/let slpCross = null;/.test(canvas)) {
    fail("slpCross is not declared outside the branch that sets it");
  }
}

/* ── Auto Service: which main a cable goes to ──

   The rule the crosses are drawn from decides this too, so a meter
   marked self-lay and a cable running to our main cannot both happen.
   The drawing would then argue with itself, which is worse than either
   fault alone. */
{
  const trench = (id, pts, key) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  /* Ours in the road to the south, the incumbent's to the north. */
  const ours = trench(1, [[0, 0], [100, 0]], "trench_main");
  const theirs = trench(2, [[0, 40], [100, 40]], "trench_main_existing");
  const seed = {
    Feature_ID: 9, Feature_Role: "plot", Plot_ID: 101, Geometry: [[50, 25]],
    Attributes: { Boundary_At: [50, 20], Trench_End_At: [50, 24] },
  };
  const utilities = [{ layer_key: "electric", utility: "Electric" },
    { layer_key: "water", utility: "Water" }];
  const utilsOf = () => utilities;
  const ctx = { slp, layers };
  const mixed = (s, u) => isSelfLayFor(s, u.layer_key, ctx);

  const endsNear = (g, y) => Math.abs(g[0][1] - y) < 0.5;

  // 9. A mixed plot digs to ours and cables to theirs.
  {
    const p = planSeed(seed, [ours, theirs], utilsOf, { isSelfLay: mixed });
    if (p.skipped) fail(`a mixed plot was skipped: ${p.skipped}`);
    if (!p.trench.length) fail("a mixed plot got no dig for the utility that is ours");
    else if (!endsNear(p.trench, 0)) fail("the dig does not start at our main");

    const ourCables = (p.cables || []).map((c) => c.utility.layer_key);
    const slpCables = (p.slpCables || []).map((c) => c.utility.layer_key);
    if (ourCables.join() !== "electric") fail(`our cables are ${ourCables.join()}, expected electric`);
    if (slpCables.join() !== "water") fail(`self-lay cables are ${slpCables.join()}, expected water`);
    if (p.slpCables[0] && !endsNear(p.slpCables[0].geometry, 40)) {
      fail("the self-lay cable does not start at the incumbent's main");
    }
    /* Both still end at the same plot: the split is about which main
       they come from, not about where they go. */
    for (const c of [...p.cables, ...p.slpCables]) {
      const last = c.geometry[c.geometry.length - 1];
      if (Math.hypot(last[0] - 50, last[1] - 25) > 5) {
        fail(`a ${c.utility.layer_key} cable does not reach the plot`);
      }
    }
  }

  /* 10. A plot that is self-lay throughout gets no dig at all.

     The ground is already open. Writing a trench would put excavation
     on the bill for a dig somebody else has done, which is the wrong
     direction for a quantity — it inflates a price rather than a
     design, and nobody reading the drawing would see why. */
  {
    const p = planSeed(seed, [ours, theirs], utilsOf, { isSelfLay: () => true });
    if (p.skipped) fail(`an all-self-lay plot was skipped: ${p.skipped}`);
    if (p.trench.length) fail("an all-self-lay plot was given a dig of ours");
    if (p.cables.length) fail("an all-self-lay plot has cables against our main");
    if (p.slpCables.length !== 2) {
      fail(`an all-self-lay plot got ${p.slpCables.length} cable(s), expected 2`);
    }
  }

  /* 11. And it is not turned away for having no main of ours.

     A drawing with only the incumbent's network on it is exactly the
     case this is for; refusing it would send every self-lay plot down
     the skipped list with everything about it right. */
  {
    const p = planSeed(seed, [theirs], utilsOf, { isSelfLay: () => true });
    if (p.skipped) fail(`a self-lay plot with no main of ours was skipped: ${p.skipped}`);
    if (p.slpCables.length !== 2) fail("no cables were planned off the existing main");
  }

  /* 12. The one that matters most: an ORDINARY plot never tees into the
     incumbent's main, even when it is nearer.

     Their trench is 15 m from this seed and ours is 25 m, so nearest
     wins would pick theirs. That would connect a plot we are building
     to somebody else's cable and look entirely correct on the drawing.  */
  {
    const near = trench(3, [[0, 40], [100, 40]], "trench_main_existing");
    const far = trench(4, [[0, 0], [100, 0]], "trench_main");
    const s2 = { ...seed, Geometry: [[50, 25]] };
    const p = planSeed(s2, [near, far], utilsOf, { isSelfLay: () => false });
    if (p.skipped) fail(`an ordinary plot was skipped: ${p.skipped}`);
    else if (!endsNear(p.trench, 0)) {
      fail("an ordinary plot's dig tees into the incumbent's main because it is nearer");
    }
    if (p.slpCables.length) fail("an ordinary plot got self-lay cables");
  }

  /* 13. A self-lay utility with nothing existing drawn is reported, not
     routed to an imagined main. A cable from a tee nobody drew is a
     length somebody would price. */
  {
    const p = planSeed(seed, [ours], utilsOf, { isSelfLay: mixed });
    if (p.slpCables.length) fail("a cable was planned off a main that is not drawn");
    if (!(p.slpUnconnected || []).length) {
      fail("a self-lay utility with no existing main is not reported");
    }
  }

  /* 14. Nothing changes on a drawing with none of this on it.

     The whole feature has to be invisible to every project that has no
     existing network drawn and no self-lay plots — which is nearly all
     of them. */
  {
    const before = planSeed(seed, [ours], utilsOf, {});
    if (before.skipped) fail(`an ordinary plot was skipped: ${before.skipped}`);
    if (before.cables.length !== 2) fail("an ordinary plot lost a cable");
    if (before.slpCables.length) fail("an ordinary plot gained self-lay cables");
    if (!endsNear(before.trench, 0)) fail("an ordinary plot's dig moved");
  }
}

// 15. The suffix rule itself.
{
  if (!isExistingType("elec_main_existing")) fail("elec_main_existing is not read as existing");
  if (!isExistingType("trench_main_existing")) fail("trench_main_existing is not read as existing");
  if (isExistingType("trench_main")) fail("trench_main is read as existing");
  /* Anchored at the end, so a type that merely mentions the word is not
     swept up. */
  if (isExistingType("existing_survey_line")) fail("a type merely containing the word is read as existing");
  const { ours: o, existing: e } = splitExisting([
    { Attributes: { Line_Type: "trench_main" } },
    { Attributes: { Line_Type: "trench_main_existing" } },
    { Attributes: {} },
  ]);
  if (o.length !== 2) fail(`splitExisting put ${o.length} trench(es) in ours, expected 2`);
  if (e.length !== 1) fail(`splitExisting put ${e.length} in existing, expected 1`);
}

console.log(bad === 0
  ? "  ok  Self-lay behaves (crossed per utility; cabled to the incumbent\u2019s main, not dug)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
