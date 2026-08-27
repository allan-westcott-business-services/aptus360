/* Is a non-residential supply a seed with meters of its own, and does
   each meter carry the supply's load rather than a plot's?

   0194 made the supply BE a meter, which could only ever describe an
   electric one — the placement hard-coded the electric layer and the
   record took a single utility. 0196 made it a seed, which is what it
   always was: something on the ground that takes gas, water and
   electric like anything else.

   Run: node checknrs.mjs */
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { subjectOf, resolveStyle } from "./src/lib/gisStyle.js";
import { metredSuppliesInside, circuitKva, meterBelongsTo, circuitReport }
  from "./src/features/gis/electric.js";
import { utilitiesTakenBy, RESIDENTIAL_UTILITIES } from "./src/lib/utilities.js";
import { planAutoService, isServed } from "./src/features/gis/autoService.js";
import { readFileSync } from "node:fs";

const fails = [];
const fail = (m) => fails.push(m);

const at = (x, y) => [[x, y]];
const trench = {
  Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
  Attributes: { Line_Type: "trench_main" }, Geometry: [[0, 0], [50, 0], [100, 0]],
};
const poc = { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: at(0, 0) };

const dwelling = (id, plotId, x) => ({
  Feature_ID: id, Feature_Role: "meter", Layer_Key: "electric",
  Plot_ID: plotId, Attributes: { Circuit_ID: 1 }, Geometry: at(x, 0),
});
/* A supply is a seed since 0196, and its meters are separate features
   carrying the same NRS_ID. `supply` is the METER — it is what every
   load sum reads, and what the fixtures below are about — and `seed` is
   the triangle on the drawing. */
const supply = (id, nrsId, x) => ({
  Feature_ID: id, Feature_Role: "meter", Layer_Key: "electric",
  Attributes: { NRS_ID: nrsId, Meter_Utility: "Electric", Circuit_ID: 1 },
  Geometry: at(x, 0),
});
const seed = (id, nrsId, x) => ({
  Feature_ID: id, Feature_Role: "nrs", Layer_Key: "plot",
  Attributes: { NRS_ID: nrsId }, Geometry: at(x, 0),
});

const NRS = [{ NRS_ID: 7, Supply_Ref: "Unit A", Requested_kVA: 85 },
             { NRS_ID: 8, Supply_Ref: "Unit B", Requested_kVA: null }];
const nrsById = (id) => NRS.find((n) => Number(n.NRS_ID) === Number(id)) || null;
const plotById = () => ({ kva_load: 5 });

// 1. It attaches to the network, and brings its own kVA.
{
  const m = buildFeederModel([poc, trench, dwelling(10, 1, 50), supply(11, 7, 50)],
    { plotById, nrsById });
  if (m.error) fail(`model did not build: ${m.error}`);
  else {
    const meters = m.meterCount.reduce((a, b) => a + b, 0);
    const kva = m.meterKva.reduce((a, b) => a + b, 0);
    if (meters !== 2) fail(`attached ${meters} supplies, expected 2`);
    if (kva !== 90) fail(`total load ${kva} kVA, expected 90 (5 dwelling + 85 supply)`);
  }
}

// 2. Its load is its OWN record's, not the plot fallback. A supply
//    reading 5 kVA would mean it had quietly been treated as a house.
{
  const m = buildFeederModel([poc, trench, supply(11, 7, 50)], { plotById, nrsById });
  const kva = m.meterKva.reduce((a, b) => a + b, 0);
  if (kva !== 85) fail(`supply alone carried ${kva} kVA, expected 85`);
}

// 3. A record with no kVA yet contributes nothing rather than a guess —
//    but still counts as a supply, so the drawing shows it is there.
{
  const m = buildFeederModel([poc, trench, supply(12, 8, 50)], { plotById, nrsById });
  const kva = m.meterKva.reduce((a, b) => a + b, 0);
  const n = m.meterCount.reduce((a, b) => a + b, 0);
  if (kva !== 0) fail(`a supply with no requested kVA invented ${kva}`);
  if (n !== 1) fail(`a supply with no requested kVA vanished (count ${n})`);
}

// 4. Circuit filtering. A supply has no plot seed, so seedIds cannot
//    speak for it — it is judged on its own Feature_ID instead. Without
//    this it is dropped from every circuit trace while still drawn.
{
  const feats = [poc, trench, supply(11, 7, 50)];
  const seedIds = new Set([999]);                 // some other circuit's plots
  const out = buildFeederModel(feats, { plotById, nrsById, seedIds,
    meterIds: new Set([11]) });
  if (out.error) fail(`in-circuit supply refused: ${out.error}`);
  else if (out.meterKva.reduce((a, b) => a + b, 0) !== 85) {
    fail("a supply in the circuit was pruned out of it");
  }
  const other = buildFeederModel(feats, { plotById, nrsById, seedIds,
    meterIds: new Set() });
  if (!other.error && other.meterKva.reduce((a, b) => a + b, 0) !== 0) {
    fail("a supply on another circuit was counted in this one");
  }
}

// 5. metersAt names it, so the levels check can find its service.
{
  const m = buildFeederModel([poc, trench, supply(11, 7, 50)], { plotById, nrsById });
  const entry = (m.metersAt || []).flat()[0];
  if (!entry) fail("metersAt held no supply");
  else {
    if (Number(entry.nrsId) !== 7) fail(`metersAt lost the NRS_ID (${entry.nrsId})`);
    if (entry.kva !== 85) fail(`metersAt carried ${entry.kva} kVA, expected 85`);
  }
}

// 6. The SEED is the black triangle. Its meters are ordinary meters.
//
//    0195 scoped the triangle to Feature_Role 'meter' with Supply_Type
//    'nrs', because under 0194 the supply was its own meter. With a
//    role of its own the role is the scope — and it matters that the
//    supply's electric meter draws like every other meter, because it
//    IS one: a triangle sitting where a meter goes is what the drawing
//    showed before and what was wrong with it.
{
  const styles = [
    { GIS_Style_ID: 1, Feature_Role: "meter", Symbol: "square", Symbol_Size_Px: 8 },
    { GIS_Style_ID: 2, Feature_Role: "nrs",
      Symbol: "triangle", Symbol_Size_Px: 10, Colour: "#000000" },
  ];
  const a = resolveStyle(subjectOf(dwelling(10, 1, 50), []), styles);
  const b = resolveStyle(subjectOf(seed(21, 7, 50), []), styles);
  const c = resolveStyle(subjectOf(supply(11, 7, 50), []), styles);
  if (a.Symbol !== "square") fail(`an ordinary meter drew as ${a.Symbol}`);
  if (b.Symbol !== "triangle") fail(`a supply seed drew as ${b.Symbol}`);
  if (b.Colour !== "#000000") fail(`a supply seed drew in ${b.Colour}`);
  if (c.Symbol !== "square") fail(`a supply's own meter drew as ${c.Symbol}, not as a meter`);
}

// 7. Every place that builds a feeder model is handed nrsById.
//
//    buildFeederModel defaults it to a function returning null, so a
//    call site that forgets it does not fail — it reports a supply
//    carrying no load, on a drawing that shows the supply plainly. That
//    is the shape of bug that cost a day: a lookup passed to some call
//    sites and not others. Counted rather than trusted.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const plots = [...src.matchAll(/plotById:\s*\(id\)/g)].length;
  const nrs = [...src.matchAll(/nrsById:\s*\(id\)/g)].length;
  if (plots === 0) fail("found no plotById call sites - the check is looking in the wrong place");
  if (nrs !== plots) fail(`nrsById passed at ${nrs} call sites, plotById at ${plots}`);

  // And the records have to reach the canvas at all.
  if (!/listNrs/.test(src)) fail("GISCanvasPage never loads the supplies");
  /* The supply is a SEED. It was a meter under 0194, which is why it
     could only ever be electric — and why placement hard-coded the
     electric layer. */
  if (!/Feature_Role: "nrs"/.test(src)) fail("placement does not write a supply seed");
  if (/Layer_Key: "electric",\s*\n\s*Feature_Type: "point",\s*\n\s*Feature_Role: "meter",\s*\n\s*Geometry: \[point\],\s*\n\s*Label: nrsName/.test(src)) {
    fail("placement still writes the supply itself as an electric meter");
  }
  /* Then where its dig stops, then its meters — the same two-step a
     plot seed takes, and the reason Auto Service can reach it. */
  if (!/setBoundaryFor\(\{ nrs: rec/.test(src)) {
    fail("placing a supply never asks where its dig stops");
  }
  /* The boundary point, written on the click that asks for it. It was
     carried through a third step and written later; that step is gone. */
  if (!/Boundary_At: point/.test(src)) fail("a supply seed has no boundary point");

  /* ── The trench end is the meter, not a click of its own ──

     There was a step between the boundary and the meters asking where
     the service trench ends. It is gone: the dig stops at the meter, so
     asking separately meant clicking the same place twice and letting
     the two answers differ — which left the trench end a point nobody
     had checked against the meter it was meant to reach.

     `Trench_End_At` still exists and still means the same thing. It is
     filled in from the first meter placed, which is why the seed is
     written before the meters rather than after them. */
  if (/setTrenchEndFor/.test(src)) {
    fail("the separate trench-end click is back \u2014 the dig stops at the meter");
  }
  if (!/Trench_End_At: point/.test(src)) {
    fail("nothing records where the dig stops");
  }
  if (!/if \(!placed\.length\)/.test(src)) {
    fail("the trench end is not taken from the FIRST meter, so a later one moves it");
  }
  if (!/plot, nrs, seedPoint, seedTempId: tempId,/.test(src)) {
    fail("placing a supply does not go on to place its meters");
  }
  if (!/NRS_ID: nrs\.NRS_ID/.test(src)) {
    fail("a supply's meter carries no NRS_ID, so nothing links it to its supply");
  }
  if (!/setNrsFor\(null\)/.test(src)) fail("a chosen supply is never disarmed on cancel");
}

// 8. Link to Circuit finds a supply inside the outline.
//
//    metredSeedsInside looks for PLOT points and keeps the ones with a
//    meter on them. A supply seed is not a plot point, so it falls
//    through — lassoed round and left off the circuit, which the trace
//    then prunes out entirely, and the design reads lighter than it is
//    by the whole of its load.
//
//    Asked of the seed and answered with the seed, so the caller can
//    hand both kinds to metersOfSeeds in one call.
{
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const inside = (p, r) => p[0] > r[0][0] && p[0] < r[1][0]
                        && p[1] > r[0][1] && p[1] < r[2][1];
  const within = seed(21, 7, 0); within.Geometry = at(50, 50);
  const itsMeter = supply(11, 7, 0); itsMeter.Geometry = at(52, 52);
  const beyond = seed(22, 8, 0); beyond.Geometry = at(500, 500);
  const world = [within, itsMeter, beyond, dwelling(10, 1, 50)];

  const found = metredSuppliesInside(world, ring, inside);
  if (found.length !== 1) fail(`metredSuppliesInside found ${found.length}, expected 1`);
  if (found[0]?.Feature_ID !== 21) fail("metredSuppliesInside found the wrong supply");

  /* A seed with no meter yet is not on a circuit. TBS1 is exactly this
     — placed, nothing run to it — and putting it on one would add its
     load to a way that is not feeding it. */
  const bare = metredSuppliesInside([within, beyond], ring, inside);
  if (bare.length) fail("a supply with no meter was put on a circuit");
}

// 8b. A meter belongs to its supply by the record, not the feature id.
//
//     The seed's Feature_ID is not known while it is still an
//     optimistic row on the canvas, which is why the plot flow can use
//     Plot_ID and this cannot. Matching on NRS_ID also means a supply's
//     meters survive its seed being deleted and re-placed.
{
  const s7 = seed(21, 7, 0);
  if (!meterBelongsTo(supply(11, 7, 0), s7)) fail("a meter did not belong to its own supply");
  if (meterBelongsTo(supply(12, 8, 0), s7)) fail("a meter belonged to another supply");
  /* And a dwelling's meter is still matched by plot, not swept up. */
  if (meterBelongsTo(dwelling(10, 1, 50), s7)) fail("a plot meter was claimed by a supply");
}

// 9. The way-fuse load at the substation counts a supply too. Missing,
//    a commercial unit reads as headroom on the way.
{
  const total = circuitKva([dwelling(10, 1, 50), supply(11, 7, 50)],
    () => ({ kva_load: 5 }), 0, nrsById);
  if (total !== 90) fail(`circuitKva returned ${total}, expected 90`);
}

// 10. The lasso must reach BOTH kinds, and dedupe them.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/metredSuppliesInside\(features, ring/.test(src)) {
    fail("Link to Circuit never looks for supplies");
  }
  if (!/circuitKva\([\s\S]{0,200}nrsList\.find/.test(src)) {
    fail("the way-fuse load is worked out without the supplies");
  }
}

// 11. The placement items live in Setup, beside Plots — not in Trench.
//
//     Checked by position rather than by eye: the menus are one long
//     block of JSX and a supply that drifts back into Trench still
//     compiles, still works, and is simply somewhere nobody looks.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = (needle) => src.indexOf(needle);
  const setup = at('<Menu id="setup"');
  const layers = at('<Menu id="layers"');
  const nrs = at("{/* Non-residential supplies. Created on the project");
  if (setup < 0 || layers < 0) fail("could not find the Setup menu to check against");
  else if (nrs < 0) fail("the placement items are not in the menus at all");
  else if (!(nrs > setup && nrs < layers)) {
    fail("the placement items are outside the Setup menu");
  }
  /* Below the plot seeds, under the Seeds heading they share.

     This looked for `label="Plots"` and guarded itself with
     `plots > 0`, so when that item was renamed to "Plot Seeds" the
     index went to -1 and the assertion passed without checking
     anything. A check that stops checking is worse than one that
     fails: it reports all clear on a menu nobody has looked at.

     So a missing item is a failure now, not a shrug. */
  const plots = at('<MenuItem label="Plot Seeds"');
  if (plots < 0) {
    fail("the plot seeds item is gone from the Setup menu, or has been renamed again");
  } else if (nrs < plots) {
    fail("the supplies sit above the plot seeds, not below them");
  }

  /* And both under Seeds, which is what makes them read as one job
     done twice rather than two unrelated ones. */
  const seeds = at('<MenuGroup label="Seeds" />');
  if (seeds < 0) fail("the Seeds heading is gone from the Setup menu");
  else if (!(seeds < plots && seeds < nrs)) {
    fail("the Seeds heading is not above the items it covers");
  }
}

// 12. A supply resolves to the utilities it takes.
//
//     This is where placing one quietly stopped after the seed. The
//     project's utilities come from gis_project_utilities — a function
//     in one of the migrations that were run and never committed, so
//     what it returns cannot be read anywhere in this repo. The first
//     version filtered on a Utility_ID it does not return, so every
//     supply resolved to nothing and a placement put a seed down and
//     ended.
//
//     Fault 22 exactly: a filter finding nothing looks the same as a
//     supply that takes nothing.
{
  /* The shape the RPC actually returns, as far as anything here can
     tell: a layer key and a name, and no id. */
  const project = [
    { layer_key: "electric", utility: "Electric" },
    { layer_key: "gas", utility: "Gas" },
    { layer_key: "water", utility: "Water" },
  ];
  const takes = utilitiesTakenBy({ Utility_IDs: [1, 3] }, project);
  if (takes.length !== 2) {
    fail(`a supply taking electric and water resolved to ${takes.length} utilities`);
  }
  if (!takes.some((u) => u.layer_key === "electric")
    || !takes.some((u) => u.layer_key === "water")) {
    fail("the utilities resolved were not the ones the supply takes");
  }

  /* And by id where a row carries one, so recovering the RPC with an
     id column takes the better branch rather than breaking this. */
  const withIds = [{ layer_key: "electric", utility: "Leccy", Utility_ID: 1 }];
  if (utilitiesTakenBy({ Utility_IDs: [1] }, withIds).length !== 1) {
    fail("an id-carrying utility row was not matched by its id");
  }

  /* A supply scoped to something the project is not building gets
     nothing for it, which is right and quiet. */
  if (utilitiesTakenBy({ Utility_IDs: [2] }, [project[0]]).length) {
    fail("a supply was given a utility the project is not building");
  }
  if (utilitiesTakenBy({}, project).length) fail("a supply naming nothing resolved to something");

  /* The tab offers only the metered utilities. Section 38, Section 278
     and Private Street Lighting are design scopes for the site with no
     meter, no MPAN and nothing to place — a supply ticked for one would
     take a seed and no meters at all. */
  if (RESIDENTIAL_UTILITIES.length !== 3) {
    fail(`RESIDENTIAL_UTILITIES holds ${RESIDENTIAL_UTILITIES.length}, expected 3`);
  }
  const tab = readFileSync("./src/features/nrs/NonResidentialTab.jsx", "utf8");
  if (/\{UTILITIES\.map/.test(tab)) {
    fail("the supplies tab offers every utility, including the ones with no meter");
  }
}

// 13. A supply's label sits under its triangle.
//
//     A triangle is widest at its foot and points into the space above
//     it, so a name set over one falls into the gap the symbol makes
//     and reads as belonging to whatever is further up. A plot number
//     over a house has no such gap.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/Feature_Role === "nrs"[\s\S]{0,200}fillText\(f\.Label[\s\S]{0,120}p\.y \+/.test(src)) {
    fail("a supply's label is not drawn below its symbol");
  }
}

// 14. Auto Service serves a supply like anything else.
//
//     It did not, because under 0194 a supply was a meter and there was
//     no seed here to serve. Serving one by hand while every dwelling
//     beside it is done automatically is a distinction with nothing
//     behind it.
{
  const main = {
    Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main" }, Geometry: [[0, 0], [100, 0]],
  };
  const supplySeed = {
    Feature_ID: 30, Feature_Role: "nrs", Layer_Key: "plot",
    Geometry: [[50, 20]],
    Attributes: { NRS_ID: 7, Boundary_At: [50, 6] },
  };
  const elec = [{ layer_key: "electric", utility: "Electric" }];

  const { plans, skipped } = planAutoService([supplySeed], [main], () => elec, {});
  if (!plans.length) {
    fail(`a supply was not planned for: ${skipped[0]?.why ?? "no reason given"}`);
  }

  /* A seed with no boundary point is refused, and says so. The dig has
     to stop somewhere: without a boundary vertex to turn at, the
     "trench" is a line from the main to somebody's meter, and every
     cable then follows it. This is why placing a supply asks for the
     point. */
  const noEdge = { ...supplySeed, Attributes: { NRS_ID: 7 } };
  const bare = planAutoService([noEdge], [main], () => elec, {});
  if (bare.plans.length) fail("a supply with no boundary point was still dug to");
  if (!/boundary/i.test(bare.skipped[0]?.why || "")) {
    fail(`a supply with no boundary point was refused for "${bare.skipped[0]?.why}"`);
  }

  /* Once served, not served again. A second run laying a second trench
     over the first is the fault the already-serviced guard exists for,
     and a supply has to answer to it like a plot. */
  const laid = {
    Feature_ID: 31, Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 30 },
    Geometry: [[50, 0], [50, 6]],
  };
  if (!isServed(supplySeed, [], [laid])) fail("a serviced supply did not count as served");

  /* And the meter it lays carries the supply's record, not just the
     seed link — meterBelongsTo asks for the NRS_ID on both sides, so
     without it the supply drops off its own circuit while looking
     entirely right on the drawing. */
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/NRS_ID: plan\.seed\.Attributes\.NRS_ID/.test(src)) {
    fail("a meter laid by Auto Service carries no NRS_ID");
  }
  if (!/Feature_Role === "plot" \|\| f\.Feature_Role === "nrs"/.test(src)) {
    fail("Auto Service still gathers plot seeds only");
  }
  /* A meter carrying only the seed link still belongs to its supply —
     which is what Auto Service wrote before this, and what is on any
     drawing serviced in between. */
  const older = { Feature_Role: "meter", Layer_Key: "electric",
    Attributes: { Seed_Feature_ID: 30 } };
  if (!meterBelongsTo(older, supplySeed)) {
    fail("a meter linked only by the seed no longer belongs to its supply");
  }
}

// 15. A meter the model cannot reach is NAMED, not dropped.
//
//     buildFeederModel has always gathered these — a meter more than
//     SNAP_TOL from any node on the network — and the levels check has
//     always thrown them away. So a supply placed on a circuit with no
//     service dug to it yet contributed nothing to the volt drop and
//     said nothing about it.
//
//     Which is fault 22 in the one direction that is dangerous: a load
//     left out reads as headroom on the way, and a marginal run reads
//     as passing. An unqualified pass is worse than no check at all.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const stranded = parts\.flatMap\(\(p\) => p\.skipped \|\| \[\]\)/.test(src)) {
    fail("the levels check throws away the meters it could not attach");
  }
  if (!/stranded,/.test(src)) fail("the stranded meters never reach the panel");
  if (!/not on the network/.test(src)) fail("the panel does not say any meter was left out");
  /* Named, so somebody can go to it. A count is a number to search
     for. */
  if (!/trace\.stranded\.map\(\(m\) => m\.label/.test(src)) {
    fail("the stranded meters are counted but not named");
  }
  /* And the model still returns them, which is what all of the above
     reads. */
  if (!/skipped: M\.skipped/.test(readFileSync("./src/features/gis/feeder.js", "utf8"))) {
    fail("the feeder model no longer reports what it could not attach");
  }
}

// 16. The circuit report reads a supply's load from its record.
//
//     It read plotById and nothing else, so every supply showed "no
//     load recorded" and its kVA was missing from the circuit total and
//     from the POC capacity comparison underneath it — while the levels
//     check, on the buildFeederModel path, counted the same supply
//     correctly. Two answers to one question about one circuit.
{
  const feats = [
    { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: at(0, 0) },
    { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
      Attributes: { Line_Type: "elec_main" }, Geometry: [[0, 0], [50, 0]] },
    dwelling(10, 1, 50),
    supply(11, 7, 50),
  ];
  const r = circuitReport(feats, { plotById, nrsById });
  const rows = [...(r.circuits || []).flatMap((c) => c.meters), ...(r.unreachable || [])];
  const row = rows.find((x) => x.id === 11);
  if (!row) fail("the circuit report left the supply out entirely");
  else {
    if (row.kvaMissing) fail("the report says a supply with 85 kVA has no load recorded");
    if (Number(row.kva) !== 85) fail(`the report gave the supply ${row.kva} kVA, expected 85`);
    /* And it says what it is, rather than leaving every column but the
       name blank. */
    if (row.houseType === "\u2014") fail("a supply's row says nothing about what it is");
  }

  /* A record with no kVA is still reported as missing rather than as
     zero: a supply drawing nothing and a supply nobody has filled in
     are different problems and look identical as "0.0 kVA". */
  const blank = circuitReport([...feats, supply(12, 8, 50)], { plotById, nrsById });
  const b = [...(blank.circuits || []).flatMap((c) => c.meters), ...(blank.unreachable || [])]
    .find((x) => x.id === 12);
  if (b && !b.kvaMissing) fail("a supply with no requested kVA was reported as a real zero");

  /* Both lookups travel together. plotById was positional and nrsById
     arrived in the options, so a call site could pass one and forget
     the other — and forgetting nrsById does not fail, it just reports
     no load. */
  const el = readFileSync("./src/features/gis/electric.js", "utf8");
  if (!/export function circuitReport\(features = \[\], opts = \{\}\)/.test(el)) {
    fail("circuitReport still takes plotById apart from nrsById");
  }
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Non-residential supplies behave (a seed with its own meters, its own load, a black triangle).");
process.exit(fails.length ? 1 : 0);
