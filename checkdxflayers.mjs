/* What our geometry is called in somebody else's CAD.

   One row is one rule. Blank matches anything, the most specific rule
   wins, and a customer's rule beats the house style. The things worth
   holding hardest are the ones that would put a drawing on the wrong
   layers without anybody noticing: a customer's rule leaking onto
   another customer's export, a size band matching a run whose size is
   in the other unit, and an unmatched feature quietly landing
   somewhere plausible. */
import { readFileSync } from "node:fs";
import {
  layerFor, explainLayer, ruleScore, ruleMatches, sizeUnitFor, subjectOf,
} from "./src/features/gis/dxfLayerMap.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "water_main", Layer_Key: "water" },
  { Type_Key: "water_service", Layer_Key: "water" },
  { Type_Key: "elec_lv", Layer_Key: "electric" },
];

const rules = [
  { DXF_Layer_Map_ID: 1, Layer_Key: "water", CAD_Layer: "WATER", ACI_Colour: 3 },
  { DXF_Layer_Map_ID: 2, Line_Type: "water_main", CAD_Layer: "WATER-MAIN",
    ACI_Colour: 3, Text_Layer: "WATER-MAIN-TEXT" },
  { DXF_Layer_Map_ID: 3, Line_Type: "water_main", Size_From: 125,
    CAD_Layer: "WATER-MAIN-LARGE", ACI_Colour: 4, Linetype: "HIDDEN" },
  { DXF_Layer_Map_ID: 4, Line_Type: "water_main", Organisation_ID: 7,
    CAD_Layer: "CLIENT7-WATER", ACI_Colour: 5 },
  { DXF_Layer_Map_ID: 5, Layer_Key: "water", Build_Status: "existing",
    CAD_Layer: "WATER-EXISTING", ACI_Colour: 8 },
  { DXF_Layer_Map_ID: 6, Line_Type: "elec_lv", Size_From: 95, Size_To: 300,
    CAD_Layer: "LV-95-300", ACI_Colour: 1 },
  { DXF_Layer_Map_ID: 7, Layer_Key: "water", CAD_Layer: "WATER-OFF",
    Is_Active: false },
  /* A band with only an UPPER bound. This is the one that needs the
     "no size, no band" guard: a missing size coerces to zero, so it
     slips under any maximum while failing every minimum. A check that
     only tried Size_From would pass with the guard deleted. */
  { DXF_Layer_Map_ID: 8, Line_Type: "water_service", Size_To: 32,
    CAD_Layer: "WATER-SERVICE-SMALL", ACI_Colour: 3 },
];

const main = (size, extra = {}) => ({
  Feature_ID: 1, Feature_Type: "line", Layer_Key: "water",
  Attributes: { Line_Type: "water_main", ...(size ? { Size: size } : {}), ...extra },
});

const at = (f, org = null) => layerFor(f, { rules, lineTypes, organisationId: org });

// 1. House style: the most specific rule wins, and a size band beats a
//    line type.
{
  if (at(main(null)).layer !== "WATER-MAIN") {
    fail(`a plain water main lands on ${at(main(null)).layer}, not WATER-MAIN`);
  }
  if (at(main("180mm")).layer !== "WATER-MAIN-LARGE") {
    fail("a 180mm main does not take the size-banded rule");
  }
  if (at(main("63mm")).layer !== "WATER-MAIN") {
    fail("a 63mm main takes a band that starts at 125");
  }
  /* And the winner's colour and linetype travel with it. */
  const big = at(main("180mm"));
  if (big.aci !== 4 || big.linetype !== "HIDDEN") {
    fail("the winning rule's colour or linetype is not used");
  }
}

// 2. A customer's rule beats the house style — and ONLY for them.
//    A rule leaking onto another customer's export is a drawing issued
//    on somebody else's standard.
{
  if (at(main("180mm"), 7).layer !== "CLIENT7-WATER") {
    fail("a customer's rule does not beat the house style under their own "
      + "standard");
  }
  if (at(main("180mm"), 9).layer !== "WATER-MAIN-LARGE") {
    fail("one customer's rule applies under another customer's standard");
  }
  if (at(main("180mm"), null).layer !== "WATER-MAIN-LARGE") {
    fail("a customer's rule applies with no customer chosen");
  }
}

// 3. A rule with a band does not match a run with no size.
//
//    Falling through would put an unsized cable in a band it may not
//    belong to, and the export would look complete while being wrong.
{
  const cable = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_lv" } };
  if (at(cable).layer === "LV-95-300") {
    fail("a cable with no size falls into a size band");
  }
  const sized = { ...cable, Attributes: { ...cable.Attributes, Size: "185mm" } };
  if (at(sized).layer !== "LV-95-300") {
    fail("a 185mm\u00b2 cable does not match the 95\u2013300 band");
  }

  /* And a band with only a maximum. A run with no size coerces to zero
     and slides under any maximum, so this is where the guard earns its
     place \u2014 an unsized service would otherwise be filed as a small
     one, which is a plausible layer and the wrong one. */
  const svc = { Feature_ID: 4, Feature_Type: "line", Layer_Key: "water",
    Attributes: { Line_Type: "water_service" } };
  if (at(svc).layer === "WATER-SERVICE-SMALL") {
    fail("a service with no size falls into a band that only has a maximum "
      + "\u2014 no size means no band, not a size of zero");
  }
}

// 4. Sizes carry the unit of the thing they measure. A pipe is a
//    diameter in mm; a cable is an area in mm². The editor shows this,
//    and it comes from one function so the editor and the matcher
//    cannot disagree.
{
  if (sizeUnitFor("water") !== "mm") fail("a pipe's size is not read as mm");
  if (sizeUnitFor("electric") !== "mm2") {
    fail("a cable's size is not read as mm\u00b2, so a band of 95-300 would "
      + "be matched against diameters");
  }
}

// 5. Inactive rules never apply.
{
  const found = explainLayer(main(null), { rules, lineTypes })
    .rows.some((r) => r.rule.DXF_Layer_Map_ID === 7);
  if (found) fail("an inactive rule is applied");
}

// 6. Nothing matching goes somewhere OBVIOUS, not somewhere plausible.
{
  const odd = { Feature_ID: 3, Feature_Type: "point", Feature_Role: "poc",
    Layer_Key: "heat", Attributes: {} };
  const got = at(odd);
  if (got.matched) fail("a feature nothing covers reports a match");
  if (got.layer !== "APTUS-UNMAPPED") {
    fail(`an unmatched feature lands on ${got.layer} \u2014 it should be `
      + "obvious in AutoCAD, not merged into a real layer");
  }
  /* Unless the caller offers the old derived names, which is what
     keeps an export working before any schedule is entered. */
  const back = layerFor(odd, { rules: [], lineTypes,
    fallback: () => "HEAT-POC" });
  if (back.layer !== "HEAT-POC") {
    fail("the export cannot fall back to the drawing's own layer names");
  }
}

// 7. Scoring: a customer outranks any amount of house detail.
{
  const houseDetail = { Layer_Key: "water", Line_Type: "water_main",
    Feature_Role: "joint", Build_Status: "live", Size_From: 1 };
  const customerPlain = { Organisation_ID: 7 };
  if (ruleScore(customerPlain) <= ruleScore(houseDetail)) {
    fail("a detailed house rule outranks a customer's rule \u2014 \"this "
      + "client's standard\" is the stronger claim");
  }
}

// 8. The subject is read the way the drawing means it: a line type's
//    own layer wins over the feature's, because that is what decides
//    which utility a run belongs to.
{
  const odd = { Layer_Key: "trench",
    Attributes: { Line_Type: "water_main", Build_Status: "live" } };
  const sub = subjectOf(odd, lineTypes);
  if (sub.layerKey !== "water") {
    fail("a run's utility is read off the feature rather than its line type");
  }
  if (!ruleMatches({ Layer_Key: "water" }, sub, {})) {
    fail("a rule on the water layer does not match a water main");
  }
}

// 8b. A layer for a particular CABLE, not just a size.
//
//     "3c WAVE 95" is a type and a size together. A schedule that
//     separates 3c WAVE 95 from 4c WAVE 95 cannot say so with a band:
//     they are the same 95mm\u00b2. The cable's identity lives in the
//     catalogue — the feature holds an id — so the matcher resolves it.
{
  /* The live spelling of the catalogue's keys, which is not the one
     0082 creates. Both are accepted; this fixture uses the one the
     admin endpoint actually serves, because that is what the export
     will be handed. */
  const cableTypes = [
    { Cable_Type_ID: 1, Cable_Type: "3c WAVE" },
    { Cable_Type_ID: 2, Cable_Type: "4c WAVE" },
  ];
  const cableSizes = [
    { Cable_Size_ID: 10, Cable_Type_ID: 1, Size_Label: "95" },
    { Cable_Size_ID: 11, Cable_Type_ID: 2, Size_Label: "95" },
    { Cable_Size_ID: 12, Cable_Type_ID: 1, Size_Label: "185" },
  ];
  const cableRules = [
    { DXF_Layer_Map_ID: 20, Layer_Key: "electric", CAD_Layer: "ELECTRIC" },
    { DXF_Layer_Map_ID: 21, Line_Type: "elec_lv", Size_From: 95, Size_To: 300,
      CAD_Layer: "LV-95-300" },
    { DXF_Layer_Map_ID: 22, Cable_Type: "3c WAVE", Size_Label: "95",
      CAD_Layer: "LV-3C-WAVE-95" },
    { DXF_Layer_Map_ID: 23, Cable_Type: "4c WAVE", CAD_Layer: "LV-4C-WAVE" },
  ];
  const run = (sizeId, extra = {}) => ({
    Feature_ID: 5, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_lv", VD_Cable_Size_ID: sizeId, ...extra },
  });
  const where = (f) => layerFor(f, { rules: cableRules, lineTypes,
    cableSizes, cableTypes }).layer;

  if (where(run(10)) !== "LV-3C-WAVE-95") {
    fail(`a 3c WAVE 95 lands on ${where(run(10))}, not its own layer`);
  }
  /* The distinction the whole feature exists for. */
  if (where(run(11)) === where(run(10))) {
    fail("3c WAVE 95 and 4c WAVE 95 land on the same layer — they are the "
      + "same 95mm² and a band cannot tell them apart");
  }
  if (where(run(11)) !== "LV-4C-WAVE") {
    fail("a 4c WAVE does not take its type's rule");
  }
  /* A named cable beats a band that contains it. */
  if (where(run(12)) !== "LV-95-300") {
    fail("a 3c WAVE 185 does not fall back to the band, having no rule of "
      + "its own");
  }

  /* A cable somebody set BY HAND is the cable that will be laid, so the
     manual override is read first. */
  const overridden = run(10, { Manual_VD_Cable_Size_ID: 11 });
  if (where(overridden) !== "LV-4C-WAVE") {
    fail("a hand-set cable is ignored in favour of the calculated one");
  }

  /* Typed by people: "3C wave" is the same cable as "3c WAVE". */
  const shouty = [{ DXF_Layer_Map_ID: 24, Cable_Type: "3C WAVE",
    Size_Label: "95", CAD_Layer: "SHOUTY" }];
  if (layerFor(run(10), { rules: shouty, lineTypes, cableSizes, cableTypes })
    .layer !== "SHOUTY") {
    fail("a cable type typed in a different case does not match");
  }

  /* And a run with no cable on it matches no cable rule. */
  const bare = { Feature_ID: 6, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_lv" } };
  if (where(bare) === "LV-3C-WAVE-95" || where(bare) === "LV-4C-WAVE") {
    fail("a run with no cable set matches a cable rule");
  }
}

// 9. Wired: the migration seeds the house style, the export reads the
//    schedule, and there is a screen to edit it.
{
  const sql = readFileSync("./supabase/migrations/0216_dxf_layer_map.sql", "utf8");
  if (!/CREATE TABLE IF NOT EXISTS "DXF_Layer_Map"/.test(sql)) {
    fail("the migration does not create the table");
  }
  if (!/'WATER-MAIN'/.test(sql)) {
    fail("the house style is not seeded, so an export after this migration "
      + "would change what every layer is called");
  }
  if (!/"Organisation_ID"\s+bigint REFERENCES "Organisation"/.test(sql)) {
    fail("rules cannot be scoped to a customer");
  }

  const sql2 = readFileSync("./supabase/migrations/0217_dxf_layer_cable.sql", "utf8");
  if (!/ADD COLUMN IF NOT EXISTS "Cable_Type"/.test(sql2)
    || !/ADD COLUMN IF NOT EXISTS "Size_Label"/.test(sql2)) {
    fail("the migration does not let a rule name a particular cable");
  }

  const dxf = readFileSync("./src/features/gis/dxf.js", "utf8");
  if (!/cableSizes, cableTypes,/.test(dxf)) {
    fail("the export does not hand the matcher the cable catalogue, so "
      + "every cable rule silently never matches");
  }
  if (!/layerMap = \[\]/.test(dxf) || !/mappedLayerFor/.test(dxf)) {
    fail("the export does not read the schedule");
  }
  if (!/fallback: \(x\) => layerFor\(x, lineTypes\)/.test(dxf)) {
    fail("the export has no fallback to the drawing's own names, so a "
      + "system with no schedule yet exports everything as unmapped");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/adminList\("DXF_Layer_Map"\)/.test(canvas)) {
    fail("the canvas never loads the schedule");
  }
  if (!/layerMap: map/.test(canvas)) {
    fail("the loaded schedule is not passed to the export");
  }

  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (!/special: "dxflayers"/.test(tables)) {
    fail("there is no CAD Layers screen in the admin menu");
  }
  const fn = readFileSync("./netlify/functions/admin.js", "utf8");
  if (!/DXF_Layer_Map:/.test(fn)) {
    fail("the admin endpoint refuses the table, so the screen cannot save");
  }
  const screen = readFileSync("./src/features/admin/DxfLayersAdmin.jsx", "utf8");
  if (!/explainLayer/.test(screen)) {
    fail("the screen cannot say which layer something would land on, which "
      + "is the only question anybody brings to it");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "CAD layers map by rule: house style, customers over it, sizes in their own unit.");
process.exit(bad ? 1 : 0);
