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
import { metredSuppliesInside, circuitKva, meterBelongsTo }
  from "./src/features/gis/electric.js";
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
  /* And then its meters, one per utility it takes. */
  if (!/setMeterFor\(\{ nrs: rec/.test(src)) {
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
  const plots = at('<MenuItem label="Plots"');
  if (plots > 0 && nrs > 0 && nrs < plots) fail("the supplies sit above Plots, not below it");
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Non-residential supplies behave (a seed with its own meters, its own load, a black triangle).");
process.exit(fails.length ? 1 : 0);
