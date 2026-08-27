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
import { planSeed, isExistingType, splitExisting, isServed, meterHasService, isExistingFeature,
  skipSummary, layServices }
  from "./src/features/gis/autoService.js";
import { defaultStatusOf, statusesFor, withDefaultStatus, isExistingLineType }
  from "./src/features/gis/buildStatus.js";

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

/* ── The Plots tab, and the two tables it must not confuse ──

   Plot.Self_Lay_Provider is one boolean for the whole plot;
   Plot_Utility.Self_Lay_Provider is one per utility. A plot self-lay
   for water only cannot be said by the first, and reading it on this
   page would mark all three of its utilities.

   Asserted on the source because the page is a table of a project's
   plots and mounting it needs a project, a lookup set and an endpoint.
   What can be checked without any of that is that it reads the right
   column and writes the right table. */
{
  const tab = readFileSync("src/features/plots/PlotsTab.jsx", "utf8");
  const fn = readFileSync("netlify/functions/plots.js", "utf8");
  const api = readFileSync("src/api/plots.js", "utf8");

  // 16. The column shows utilities, not a tick.
  if (/raw:\s*\(p\)\s*=>\s*!!p\.Self_Lay_Provider/.test(tab)) {
    fail("the SLP column still reads the plot-level flag");
  }
  if (!/SLP_Utility_IDs/.test(tab)) {
    fail("the SLP column does not read the per-utility flags");
  }

  /* 17. Bulk asks which utility.

     "SLP: Yes" says nothing on its own once the flag is per utility. A
     control that wrote every utility from one yes would be the
     plot-level flag again, wearing a different hat. */
  if (!/SLP_Utility_ID/.test(tab)) fail("the bulk bar does not ask which utility");
  if (!/bulk\.SLP_Utility_ID && bulk\.SLP_Value/.test(tab)) {
    fail("bulk self-lay writes without both halves chosen");
  }

  /* 18. It writes Plot_Utility, not Plot.

     Folding it into the bulk `changes` object would send it to Plot —
     where the column also exists, so it would succeed, and mark the
     whole plot. Two tables with a column of the same name is exactly
     the shape that needs a check rather than care. */
  if (/changes\.Self_Lay_Provider/.test(tab)) {
    fail("bulk self-lay is written to Plot rather than Plot_Utility");
  }
  if (!/setPlotSelfLay/.test(tab)) fail("the Plots tab does not call setPlotSelfLay");
  if (!/self_lay/.test(api)) fail("the API layer has no self-lay route");

  /* 19. The endpoint updates and never inserts.

     Every plot has a row per utility its project is scoped for — 1,714
     were back-filled on 26 Aug. A missing row therefore means the
     project is not scoped for that utility, and creating one would give
     a plot a connection nobody is doing. */
  const branch = fn.slice(fn.indexOf('self_lay") !== null'), fn.indexOf('Bulk edit: one statement'));
  if (!/from\("Plot_Utility"\)\s*\n?\s*\.update\(/.test(branch)) {
    fail("the self-lay branch does not update Plot_Utility");
  }
  if (/\.insert\(|upsert\(/.test(branch)) {
    fail("the self-lay branch inserts rows \u2014 it must only update");
  }
  if (!/missing/.test(branch)) {
    fail("plots with no row for that utility are not reported");
  }

  /* 20. And the conditional branch sits above the unconditional one.

     A conditional `if (method === X && ...)` below an unconditional
     `if (method === X)` never runs, and fails silently with the wrong
     shape rather than an error. Recurring fault 1, hit four times. */
  const conditional = fn.indexOf('self_lay") !== null');
  const unconditional = fn.indexOf('if (req.method === "PATCH") {');
  if (conditional < 0 || unconditional < 0) {
    fail("could not find both PATCH branches");
  } else if (conditional > unconditional) {
    fail("the self-lay PATCH sits below the unconditional PATCH \u2014 it will never run");
  }
}

/* ── Scheduling, after every row already exists ──

   generateConnections did one job and was asked for two: the row for a
   plot-utility pair has to exist, AND it has to carry a
   Programmed_Date. It only ever inserted, which worked while rows came
   into being nowhere else.

   The 26 Aug back-fill ended that. Every pair exists, so the insert
   found nothing to do and every booking reported "those connections
   already exist" without writing a date. Nothing errored; the form just
   stopped working. */
{
  const fn = readFileSync("netlify/functions/connections.js", "utf8");
  const post = fn.slice(fn.indexOf('req.method === "POST"'), fn.indexOf('req.method === "PATCH"'));

  // 21. It updates as well as inserting.
  if (!/\.update\(/.test(post)) {
    fail("scheduling only inserts \u2014 a pair that already exists never gets its date");
  }
  if (!/updated:/.test(post)) fail("the response does not say how many rows were updated");

  /* 22. And it does not overwrite a booking.

     Moving a visit that is already in the diary has a gang and a
     customer behind it. It belongs on the page showing the existing
     date, not as a side effect of ticking a plot in a bulk form. */
  if (!/Programmed_Date \|\| row\.Connection_Date/.test(post)) {
    fail("scheduling overwrites a date that is already set");
  }

  /* 23. Never an upsert.

     Supabase's upsert is ON CONFLICT DO UPDATE with exactly the fields
     supplied — everything else on the row becomes null: the meter
     number, the as-laid date, the adopter. Recurring fault 5. */
  if (/upsert\(/.test(post)) fail("scheduling upserts, which nulls every field it does not name");

  /* 24. Self-lay is refused on the server.

     Three screens call this and each filtered its own way, per PLOT,
     which cannot express a plot self-lay for water and ours for
     electric. The rule belongs on the row that holds the fact. */
  if (!/row\.Self_Lay_Provider/.test(post)) {
    fail("scheduling does not refuse a self-lay pair");
  }
  if (!/self_lay:/.test(post)) fail("the response does not say how many were self-lay");

  const tab = readFileSync("src/features/plots/PlotsTab.jsx", "utf8");
  if (/filter\(\(p\) => !p\.Self_Lay_Provider\)/.test(tab)) {
    fail("Generate connections still filters on the plot-level flag");
  }

  /* 25. The schedule form judges per utility.

     A plot self-lay for water alone is still ours to connect for
     electric. Reading the plot-level flag greyed it out entirely. */
  const modal = readFileSync("src/features/connections/NewScheduleModal.jsx", "utf8");
  if (/const eligible = \(p\) => !p\.Self_Lay_Provider/.test(modal)) {
    fail("the schedule form still judges self-lay per plot");
  }
  if (!/utils\.some\(/.test(modal)) {
    fail("the schedule form does not judge against the utilities being scheduled");
  }

  /* 26. And the connections list shows the row's flag, not the plot's.

     Every row there IS a plot-utility pair. Showing the plot-level
     boolean ticked all three of a plot's rows because its water was
     somebody else's. */
  const all = readFileSync("netlify/functions/connections-all.js", "utf8");
  if (/_slp:\s*!!Plot\?\.Self_Lay_Provider/.test(all)) {
    fail("the connections list shows the plot-level flag on a per-utility row");
  }
  if (!/_slp:\s*!!conn\.Self_Lay_Provider/.test(all)) {
    fail("the connections list does not show the row's own self-lay flag");
  }
}

/* ── A new plot gets its utilities ──

   1,714 rows were back-filled on 26 Aug so self-lay could be recorded
   per utility. A plot added afterwards would have had none — and a plot
   with no rows cannot be marked self-lay, cannot be scheduled and
   appears on no connections list. It looks exactly like a plot nobody
   has got to yet, which is the shape of fault 22. */
{
  const fn = readFileSync("netlify/functions/plots.js", "utf8");
  const post = fn.slice(fn.indexOf('req.method === "POST"'),
    fn.indexOf("Self-lay, per plot per utility"));

  // 27. Rows are created, from the project's scope.
  if (!/from\("Plot_Utility"\)\s*\n?\s*\.insert\(/.test(post)) {
    fail("adding plots does not create their Plot_Utility rows");
  }
  if (!/from\("Project_Scope"\)/.test(post)) {
    fail("the utilities a new plot gets are not read from the project's scope");
  }
  /* Distinct, because Project_Scope holds a row per utility and there
     is no unique index on (Plot_ID, Utility_ID) to catch a duplicate. */
  if (!/new Set\(/.test(post)) {
    fail("duplicate scope rows would insert the same plot-utility pair twice");
  }

  /* 28. And a failure is reported, not thrown or swallowed.

     The plots are already inserted and there is no transaction across
     the two. Throwing would report failure on work that succeeded;
     swallowing leaves a plot that looks complete and takes part in
     nothing. */
  if (!/utility_error/.test(post)) {
    fail("a failure creating the utility rows is swallowed");
  }
  if (/throw puErr|throw sErr/.test(post)) {
    fail("a failure creating the utility rows throws away plots that were created");
  }

  /* 29. The add form no longer asks for self-lay per plot.

     One boolean for the whole plot marked every utility from one tick,
     which is the thing this whole change is undoing. */
  const form = readFileSync("src/features/plots/AddPlotsForm.jsx", "utf8");
  if (/Self_Lay_Provider/.test(form)) {
    fail("the add-plots form still writes the plot-level self-lay flag");
  }
}

/* ── The plot-level flag has no readers left ──

   Plot.Self_Lay_Provider said one thing about a whole plot. Self-lay is
   per utility, and every screen that filtered on it filtered wrongly in
   the same direction: a plot self-lay for water alone was kept off
   electric schedules, electric POC applications and electric
   connections.

   Asserted as an absence, which is the only way to assert this. A
   column nobody selects cannot come back by accident — but it can come
   back by somebody adding it to a list, which is what this catches. */
{
  const files = {
    "netlify/functions/plots.js": readFileSync("netlify/functions/plots.js", "utf8"),
    "netlify/functions/connections.js": readFileSync("netlify/functions/connections.js", "utf8"),
    "netlify/functions/connections-all.js": readFileSync("netlify/functions/connections-all.js", "utf8"),
  };

  // 30. No endpoint selects it off Plot any more.
  for (const [name, src] of Object.entries(files)) {
    /* Every remaining mention has to be a Plot_Utility one. The test is
       on the select strings rather than the word, because the comments
       explaining why it is gone contain the word too — and a check that
       forbids naming a thing in a comment is a check that stops the
       reason being written down. */
    const selects = src.match(/\.select\(`?"?[^)]*"?`?\)/g) || [];
    for (const sel of selects) {
      if (!/Self_Lay_Provider/.test(sel)) continue;
      if (/Plot_Utility_ID|Utility_ID/.test(sel)) continue;
      fail(`${name} still selects the plot-level Self_Lay_Provider: ${sel.slice(0, 60)}`);
    }
    if (/Plot!inner\([^)]*Self_Lay_Provider/.test(src)) {
      fail(`${name} still joins Plot for its self-lay flag`);
    }

    /* And the column-list constants, which are arrays joined with a
       comma rather than select strings — the first version of this
       checked only `.select(...)` and missed PLOT_COLUMNS entirely,
       which is where the column actually was. A check that cannot see
       the place the fault lives is worse than no check, because it
       reports all clear. */
    for (const m of src.matchAll(/const ([A-Z_]+) = \[([^\]]*)\]/gs)) {
      const [, listName, body] = m;
      if (!/"Self_Lay_Provider"/.test(body)) continue;
      /* Plot_Utility's own list may name it. Told apart by the table
         the list is for: a plot list has no Utility_ID in it. */
      if (/"Utility_ID"|"Plot_Utility_ID"/.test(body)) continue;
      fail(`${name}: ${listName} still names the plot-level Self_Lay_Provider`);
    }
  }

  /* 31. And the POC picker judges per utility.

     A quotation is for one utility. A plot self-lay for water belongs
     on an electric application, and the plot-level flag could only say
     "keep it off all of them". */
  const poc = readFileSync("src/features/poc/PlotAssignment.jsx", "utf8");
  if (/!p\.Self_Lay_Provider/.test(poc)) {
    fail("the POC plot picker still filters on the plot-level flag");
  }
  if (!/SLP_Utility_IDs/.test(poc)) {
    fail("the POC plot picker does not read the per-utility flags");
  }
  if (!/utilityId/.test(poc)) {
    fail("the POC plot picker is not told which utility its application is for");
  }
  /* Threaded from the application row, not fetched again: a second read
     is a second answer to one question. */
  const panel = readFileSync("src/features/poc/OptionsPanel.jsx", "utf8");
  if (!/utilityId/.test(panel)) fail("OptionsPanel does not pass the utility down");
  const tab = readFileSync("src/features/poc/POCApplicationsTab.jsx", "utf8");
  if (!/utilityId={r\.Utility_ID}/.test(tab)) {
    fail("the applications tab does not give OptionsPanel its utility");
  }
}

/* ── Running Auto Service twice ──

   A self-lay plot gets cables and no trench: the ground is already
   open. isServed asks whether a TRENCH carries the seed's stamp, so it
   never said yes about one — and every run laid another cable on top of
   the last. The drawing gained a cable per run and the bill counted
   every one.

   Nothing errored and nothing looked wrong on screen: the second cable
   is drawn exactly along the first. */
{
  const seedF = { Feature_ID: 9, Feature_Role: "plot", Plot_ID: 101, Geometry: [[50, 25]],
    Attributes: { Boundary_At: [50, 20], Trench_End_At: [50, 24] } };
  const meterF = { Feature_ID: 20, Feature_Role: "meter", Plot_ID: 101, Layer_Key: "water",
    Geometry: [[50, 27.3]], Attributes: { Seed_Feature_ID: 9 } };

  /* What the canvas writes for a self-lay plot: a cable stamped with
     the seed, marked Self_Lay, and no trench at all. */
  const cable = { Feature_ID: 21, Feature_Type: "line", Layer_Key: "water",
    Geometry: [[50, 40], [50, 20], [50, 24], [50, 27.3]],
    Attributes: { Seed_Feature_ID: 9, Self_Lay: true, Line_Type: "water_service" } };

  // 32. The seed counts as served once its cable is laid.
  if (isServed(seedF, [meterF], [])) {
    fail("a seed with nothing laid reads as served");
  }
  if (!isServed(seedF, [meterF], [cable])) {
    fail("a self-lay plot is never served \u2014 every run lays another cable on the last");
  }

  // 33. And the meter itself.
  if (!meterHasService([50, 27.3], [cable])) {
    fail("a self-lay meter is not seen as reached by its own cable");
  }

  /* 34. The incumbent's trench is not our dig.

     It sits on the trench layer like any other, so a plot standing
     beside one would read as already serviced. It is their ground and
     nothing of ours is in it. */
  const theirTrench = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 40], [100, 40]], Attributes: { Line_Type: "trench_main_existing" } };
  if (!isExistingFeature(theirTrench)) {
    fail("an existing trench is not recognised as the incumbent's");
  }

  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/!isExistingFeature\(f\)/.test(canvas)) {
    fail("the canvas counts the incumbent's trench among our service trenches");
  }
  if (!/Self_Lay === true/.test(canvas)) {
    fail("the canvas does not gather the self-lay cables");
  }
  /* Gathered AND used. The first version of this checked only that the
     list was built, and removing it from what isServed is given left
     the check green — the cables were collected into a variable nobody
     read. An unused list is the same fault as no list, and harder to
     see. */
  if (!/const laid = \[\.\.\.svcTrenches, \.\.\.slpCables\]/.test(canvas)) {
    fail("the self-lay cables are gathered but not added to what counts as laid");
  }
  if (!/isServed\(sd, allMeters, laid\)/.test(canvas)) {
    fail("isServed is not given the self-lay cables");
  }
  if (!/meterHasService\(point, laid\)/.test(canvas)) {
    fail("meterServed is not given the self-lay cables");
  }
}

/* ── The developer's dig is drawn, and it is not ours ──

   A self-lay plot's service trench exists: the developer lays it. It
   belongs on the drawing — a cable running through undisturbed ground
   is a service nobody can set out or check the cover depth of.

   What differs is Build_Status. `existing` is the drawing's own word
   for a length not dug by this job, and digEstimate reads it: no
   excavation charged, the laying still counted. */
{
  const trench = (id, pts, key) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench",
    Geometry: pts, Attributes: { Line_Type: key },
  });
  const ours = trench(1, [[0, 0], [100, 0]], "trench_main");
  const theirs = trench(2, [[0, 40], [100, 40]], "trench_main_existing");
  const seed = { Feature_ID: 9, Feature_Role: "plot", Plot_ID: 101, Geometry: [[50, 25]],
    Attributes: { Boundary_At: [50, 20], Trench_End_At: [50, 24] } };
  const utils = [{ layer_key: "electric", utility: "Electric" },
    { layer_key: "water", utility: "Water" }];

  // 35. A self-lay plot gets a dig, on its own route.
  {
    const p = planSeed(seed, [ours, theirs], () => utils, { isSelfLay: () => true });
    if (!p.slpTrench?.length) {
      fail("a self-lay plot gets no service trench \u2014 its cable runs through undug ground");
    } else if (Math.abs(p.slpTrench[0][1] - 40) > 0.5) {
      fail("the developer's dig does not start at the incumbent's main");
    }
    if (p.trench.length) fail("a self-lay plot was given a dig of ours as well");
  }

  // 36. A mixed plot gets both, to different mains.
  {
    const p = planSeed(seed, [ours, theirs], () => utils,
      { isSelfLay: (s, u) => u.layer_key === "water" });
    if (!p.trench.length) fail("a mixed plot got no dig of ours");
    if (!p.slpTrench.length) fail("a mixed plot got no dig for its self-lay utility");
    if (p.trench.length && p.slpTrench.length
      && Math.abs(p.trench[0][1] - p.slpTrench[0][1]) < 1) {
      fail("both digs start at the same main");
    }
  }

  // 37. And an ordinary plot gets no second dig at all.
  {
    const p = planSeed(seed, [ours], () => utils, {});
    if (p.slpTrench?.length) fail("an ordinary plot was given a developer's dig");
  }

  /* 38. The canvas writes it as existing.

     Left to withDefaultStatus it would read "planned", and a planned
     dig is one somebody has to send a gang to. */
  {
    const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
    if (!/slpTrench/.test(canvas)) fail("the canvas never writes the developer's dig");
    if (!/status: "existing"/.test(canvas)) {
      fail("the developer's dig is not written as Build_Status existing");
    }
  }

  /* 39. And a line drawn with an `_existing` type starts there too.

     The incumbent's own trench is drawn by hand. Defaulted to
     "planned", digEstimate would charge its whole length as ground to
     open — a price with no visible reason, for a dig done years ago.

     Every default has to be a value the feature's own list offers: a
     stage from the wrong list is unselectable in its own dropdown. */
  {
    const lineTypes = [
      { Type_Key: "trench_main_existing", Layer_Key: "trench" },
      { Type_Key: "elec_main_existing", Layer_Key: "electric" },
      { Type_Key: "trench_main", Layer_Key: "trench" },
      { Type_Key: "elec_main", Layer_Key: "electric" },
    ];
    const feat = (key, layer) => ({ Feature_Type: "line", Layer_Key: layer,
      Attributes: { Line_Type: key } });

    for (const [key, layer, want] of [
      ["trench_main_existing", "trench", "existing"],
      ["elec_main_existing", "electric", "existing"],
      ["trench_main", "trench", "planned"],
      ["elec_main", "electric", "planned"],
    ]) {
      const f = feat(key, layer);
      const got = defaultStatusOf(f, lineTypes);
      if (got !== want) fail(`${key} defaults to ${got}, expected ${want}`);
      if (!statusesFor(f, lineTypes).some((s) => s.key === got)) {
        fail(`${key} defaults to '${got}', which is not in the list it carries`);
      }
    }
  }
}

/* ── Saying why a run did nothing ──

   Both commands that skip seeds printed `skipped[0].why` against the
   count of all of them, so one seed's reason was reported as though it
   were every seed's. Forty-nine plots already serviced and two refused
   for want of an existing main read as "51 seeds skipped (already has a
   service trench)" — and the two somebody had just marked self-lay were
   invisible.

   True of one seed, wrong about the drawing, and the hard kind to
   notice because the sentence reads correctly. */
{
  const many = [
    ...Array(49).fill({ why: "already has a service trench" }),
    { why: "no existing main drawn to connect a self-lay plot to" },
    { why: "no existing main drawn to connect a self-lay plot to" },
  ];
  const out = skipSummary(many);

  // 40. Every reason appears, with its own count.
  if (!/49 already has a service trench/.test(out)) {
    fail(`the commonest reason is missing or miscounted: ${out}`);
  }
  if (!/2 no existing main/.test(out)) {
    fail(`the rare reason is not reported \u2014 it is the one somebody can act on: ${out}`);
  }
  /* Commonest first, so a count carries the weight. */
  if (out.indexOf("49 ") > out.indexOf("2 no existing")) {
    fail("reasons are not ordered by how many seeds each covers");
  }
  if (skipSummary([]) !== "") fail("an empty skip list produces a sentence");

  /* 41. And neither command reports only the first.

     Asserted on the source, because the fault is not in the summary —
     it is in what the caller hands to the screen. */
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  for (const m of canvas.matchAll(/skipped\[0\]/g)) {
    const at = canvas.slice(Math.max(0, m.index - 200), m.index);
    /* The comment recording the fault names it, which is not a use. */
    if (/\/\*|^\s*\*/m.test(at.split("\n").pop() ?? "")) continue;
    fail("a command still reports only the first skipped seed's reason");
  }
}

/* ── Nothing may be read before it is declared ──

   The self-lay mismatch test needs utilitiesFor, and was written fifty
   lines above where utilitiesFor is declared. A `const` read before its
   declaration throws — so Auto Lay Service Trench threw before doing
   anything, and the button looked dead. No error, no message, nothing
   drawn.

   Recurring fault 2. checkorder.py catches most of these; it did not
   catch this one, because the read is inside an arrow function that
   only runs later, which is legal right up until it is called.

   So the order is asserted directly. */
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  const runner = canvas.slice(canvas.indexOf("const isSeed = (f) => f.Feature_Role === \"plot\""));

  const declared = runner.indexOf("const utilitiesFor = (seed) =>");
  const used = runner.indexOf("utilitiesFor(sd)");
  if (declared < 0) fail("utilitiesFor is not declared in the auto-service runner");
  else if (used >= 0 && used < declared) {
    fail("the self-lay mismatch test reads utilitiesFor before it is declared "
      + "\u2014 Auto Service throws and the button does nothing");
  }

  /* And the two questions stay apart: what is laid, and whether it is
     still right. Joining them puts the mismatch test back above
     utilitiesFor, which is where it was when it broke. */
  const laidAt = runner.indexOf("const alreadyLaid = new Set(");
  const servicedAt = runner.indexOf("const serviced = new Set(");
  if (laidAt < 0 || servicedAt < 0) {
    fail("the laid and serviced sets are no longer separate");
  } else if (servicedAt < declared) {
    fail("the serviced set is built before utilitiesFor exists to test against");
  }
}

/* ── The incumbent's network is never on site ──

   Their trench and their mains are in the road. There is no case where
   a line drawn to show what somebody else already owns is our work
   inside our boundary.

   ── Two attributes, both called off site ──

     Site       "On-site"/"Off-site", worked out from the boundary when
                a line is drawn. Splits the run, picks the surface,
                feeds the bill.
     Off_Site   a boolean set by hand. A commercial arrangement: a
                different rate, a different permit, and what the
                call-off carries.

   A line outside the boundary gets the first automatically and not the
   second, so the drawing showed a trench off site while the editor's
   dropdown read "On site" — both true about their own attribute, and a
   contradiction to anybody looking at the two together. */
{
  const lineTypes = [
    { Type_Key: "trench_main_existing", Layer_Key: "trench" },
    { Type_Key: "trench_main", Layer_Key: "trench" },
  ];
  const mk = (key, extra = {}) => ({ Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: key, ...extra } });

  // 42. Both are set on an incumbent line, and neither on ours.
  {
    const a = withDefaultStatus(mk("trench_main_existing"), lineTypes).Attributes;
    if (a.Off_Site !== true) fail("an incumbent trench is not marked off site");
    if (a.Site !== "Off-site") fail("an incumbent trench's Site is not Off-site");
    if (a.Build_Status !== "existing") fail("an incumbent trench does not start as existing");

    const b = withDefaultStatus(mk("trench_main"), lineTypes).Attributes;
    if (b.Off_Site != null) fail("one of our own trenches was marked off site");
    if (b.Site != null) fail("one of our own trenches had its Site decided here");
  }

  /* 43. And a choice already made is left alone.

     This fills blanks. Overruling a set value would undo somebody's
     correction every time the feature was saved. */
  {
    const a = withDefaultStatus(
      mk("trench_main_existing", { Off_Site: false, Build_Status: "planned" }), lineTypes,
    ).Attributes;
    if (a.Off_Site !== false || a.Build_Status !== "planned") {
      fail("a value already set was overwritten");
    }
  }

  /* 44. The editor states it rather than offering the wrong answer.

     A default is a thing somebody can change by accident, and this one
     feeds a rate and a permit. */
  {
    const ed = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
    if (!/disabled={incumbent}/.test(ed)) {
      fail("the on-site/off-site field can still be set to On site for the incumbent's network");
    }
    if (!/const incumbent = isExistingLineType/.test(ed)) {
      fail("the editor does not recognise the incumbent's line types");
    }
    /* Declared above every use: a const read before its declaration
       throws, and in this file that takes the whole editor out. */
    const declared = ed.indexOf("const incumbent =");
    const used = ed.indexOf("disabled={incumbent}");
    if (declared < 0 || (used >= 0 && used < declared)) {
      fail("incumbent is used before it is declared");
    }
  }

  // 45. The suffix rule is the one thing deciding all of it.
  {
    if (!isExistingLineType("water_main_existing")) fail("water_main_existing is not recognised");
    if (isExistingLineType("trench_service")) fail("an ordinary type is read as the incumbent's");
  }
}

/* ── A run of service trench is not always one feature ──

   splitByBoundary breaks a service where it crosses the site boundary,
   so a service teed off a main in the ROAD arrives as two: an off-site
   piece touching the main and an on-site piece touching only the first.

   layServices judged each on its own, so the inner piece had no main at
   either end and was refused — "closest is 5.39m away", which was
   exactly the length of the outer piece it is joined to. The dig was
   right and the drawing was right; the answer was about a feature
   rather than about the run it belongs to.

   Our own services rarely showed it. They tee off a main inside the
   site and never cross the boundary; the incumbent's main is in the
   road, so every self-lay service crosses it and every one splits. */
{
  const L = (id, pts, plot, key = "trench_service") => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "trench", Plot_ID: plot,
    Geometry: pts, Attributes: { Line_Type: key, Plot_ID: plot },
  });
  const meterAt = (id, plot, at) => ({
    Feature_ID: id, Feature_Role: "meter", Layer_Key: "electric",
    Plot_ID: plot, Geometry: [at], Attributes: {},
  });
  const isTrench = (f) => String(f.Attributes?.Line_Type ?? "").startsWith("trench");
  const lay = (fs) => layServices(fs, "electric", { isTrench });

  /* The incumbent's trench in the road, and plot 41's service split at
     the boundary — the geometry off the drawing this was found on. */
  const road = L(1, [[183.52, 125.18], [184.92, 146.45]], null, "trench_main_existing");
  const outer = L(2, [[183.81, 129.50], [178.43, 129.85]], 41);
  const inner = L(3, [[178.43, 129.85], [158.36, 132.70]], 41);
  const m41 = meterAt(9, 41, [157.5, 132.9]);

  /* 46. One cable, along the whole dig.

     Each piece was laying a cable of its own that ran the length of
     that piece and then struck out for the meter — so a service split
     at the boundary came out as two cables, the off-site one cutting
     diagonally across the garden to the same meter. */
  {
    const r = lay([road, outer, inner, m41]);
    if (r.cables.length !== 1) {
      fail(`a service split at the boundary laid ${r.cables.length} cable(s), expected 1`
        + (r.skipped[0] ? ` \u2014 ${r.skipped[0].why}` : ""));
    }
    const g = r.cables[0]?.geometry ?? [];
    /* It starts at the joint on the incumbent's trench. */
    if (Math.hypot(g[0]?.[0] - 183.81, g[0]?.[1] - 129.50) > 0.01) {
      fail("the cable does not start at the joint");
    }
    /* And passes through the boundary join rather than cutting across
       it, which is the whole difference between following the dig and
       drawing a straight line to the meter. */
    if (!g.some((p) => Math.hypot(p[0] - 178.43, p[1] - 129.85) < 0.01)) {
      fail("the cable does not follow the dig through the boundary");
    }
    const end = g[g.length - 1] ?? [];
    if (Math.hypot(end[0] - 157.5, end[1] - 132.9) > 0.01) {
      fail("the cable does not end at the meter");
    }
    /* No stutter where two pieces meet: the join is a point on both. */
    for (let i = 1; i < g.length; i++) {
      if (Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]) < 1e-6) {
        fail("the cable has a zero-length segment at a join");
      }
    }
  }

  /* 46b. And a run of one piece is unchanged.

     Nearly every service on a normal site is one feature. This must not
     have moved. */
  {
    const main = L(20, [[0, 0], [100, 0]], null, "trench_main");
    const only = L(21, [[20, 0], [20, 12]], 10);
    const r = lay([main, only, meterAt(30, 10, [20, 13])]);
    if (r.cables.length !== 1) fail(`an ordinary service laid ${r.cables.length} cable(s)`);
    const g = r.cables[0]?.geometry ?? [];
    if (g.length !== 3) fail(`an ordinary cable has ${g.length} points, expected 3`);
  }

  // 47. And a longer chain, where only the first piece touches the main.
  {
    const a = L(4, [[183.81, 129.50], [178.43, 129.85]], 41);
    const b = L(5, [[178.43, 129.85], [168, 130]], 41);
    const c = L(6, [[168, 130], [158, 131]], 41);
    const r = lay([road, a, b, c, meterAt(10, 41, [157, 131])]);
    if (r.cables.length !== 1) {
      fail(`a chain of three laid ${r.cables.length} cable(s), expected one along all of it`);
    }
    /* Every piece's far end appears, in order out from the main. */
    const g = r.cables[0]?.geometry ?? [];
    for (const [x, y] of [[178.43, 129.85], [168, 130], [158, 131]]) {
      if (!g.some((p) => Math.hypot(p[0] - x, p[1] - y) < 0.01)) {
        fail(`the cable misses the join at ${x},${y}`);
      }
    }
    if (r.skipped.length) {
      fail(`pieces covered by the run were reported as failures: ${r.skipped[0].why}`);
    }
  }

  /* 48. Reaching another service is not reaching a main.

     The point of following the chain is that it ends AT a main. Two
     service trenches joined to each other and to nothing else must
     still be refused, or the rule would lay a cable off any dig that
     happens to touch another. */
  {
    const d = L(7, [[100, 100], [110, 100]], 98);
    const e = L(8, [[110, 100], [120, 100]], 98);
    const r = lay([road, d, e, meterAt(11, 98, [121, 100])]);
    if (r.cables.length) fail("a chain reaching no main at all still laid cable");
    if (r.skipped.length !== 2) fail("both unreachable pieces should be reported");
  }

  /* 48b. A run already served is not served twice.

     The guard asked whether a cable starts on THIS feature. Auto
     Service lays one cable along the whole run, starting at the joint —
     which is on the outermost piece, five metres back — so for the
     inner piece nothing appeared to start on it and a second cable went
     down over the first. Two cables on one service, both looking
     correct, and the bill counting both. */
  {
    const laidAlready = {
      Feature_ID: 99, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [[183.81, 129.50], [178.43, 129.85], [158.36, 132.70], [157.5, 132.9]],
      Attributes: { Line_Type: "elec_service" },
    };
    const r = lay([road, outer, inner, m41, laidAlready]);
    if (r.cables.length) {
      fail(`a run already carrying a cable was laid again (${r.cables.length})`);
    }
    if (r.skipped.length) {
      fail(`a run already served was reported as a failure: ${r.skipped[0].why}`);
    }
  }

  // 49. And a lone service far from anything is refused as before.
  {
    const r = lay([road, L(9, [[100, 100], [110, 100]], 99), meterAt(12, 99, [111, 100])]);
    if (r.cables.length) fail("an unconnected service laid cable");
  }
}

console.log(bad === 0
  ? "  ok  Self-lay behaves (crossed per utility; cabled to the incumbent\u2019s main, not dug)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
