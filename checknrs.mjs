/* Does a non-residential supply behave as a meter, and carry its own
   load rather than a plot's?

   Run: node checknrs.mjs */
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { subjectOf, resolveStyle } from "./src/lib/gisStyle.js";
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
const supply = (id, nrsId, x) => ({
  Feature_ID: id, Feature_Role: "meter", Layer_Key: "electric",
  Attributes: { NRS_ID: nrsId, Supply_Type: "nrs", Circuit_ID: 1 }, Geometry: at(x, 0),
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

// 6. Drawn as a black triangle, and an ordinary meter still is not.
{
  const styles = [
    { GIS_Style_ID: 1, Feature_Role: "meter", Symbol: "square", Symbol_Size_Px: 8 },
    { GIS_Style_ID: 2, Feature_Role: "meter", Supply_Type: "nrs",
      Symbol: "triangle", Symbol_Size_Px: 10, Colour: "#000000" },
  ];
  const a = resolveStyle(subjectOf(dwelling(10, 1, 50), []), styles);
  const b = resolveStyle(subjectOf(supply(11, 7, 50), []), styles);
  if (a.Symbol !== "square") fail(`an ordinary meter drew as ${a.Symbol}`);
  if (b.Symbol !== "triangle") fail(`a supply drew as ${b.Symbol}`);
  if (b.Colour !== "#000000") fail(`a supply drew in ${b.Colour}`);
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
  if (!/Supply_Type:\s*"nrs"/.test(src)) fail("placement writes no Supply_Type, so it draws as a house");
  if (!/setNrsFor\(null\)/.test(src)) fail("a chosen supply is never disarmed on cancel");
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Non-residential supplies behave (placed, a meter to the network, its own load, a black triangle).");
process.exit(fails.length ? 1 : 0);
