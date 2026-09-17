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

// 8c. External or internal, and geometry type.
//
//     A new fact about some apparatus: outside the building or inside
//     it. Wanted on mains feeder cables and meters, because the two are
//     drawn on different CAD layers and are different jobs on site.
{
  const meterRules = [
    { DXF_Layer_Map_ID: 30, Layer_Key: "electric", CAD_Layer: "ELECTRIC" },
    { DXF_Layer_Map_ID: 31, Feature_Role: "meter", CAD_Layer: "METERS" },
    { DXF_Layer_Map_ID: 32, Feature_Role: "meter", Siting: "Internal",
      CAD_Layer: "METERS-INTERNAL" },
    { DXF_Layer_Map_ID: 33, Geometry_Type: "Line", Layer_Key: "electric",
      CAD_Layer: "ELECTRIC-LINES" },
  ];
  const meter = (siting) => ({ Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "electric", Attributes: siting ? { Siting: siting } : {} });
  const where = (f) => layerFor(f, { rules: meterRules, lineTypes }).layer;

  if (where(meter("Internal")) !== "METERS-INTERNAL") {
    fail("an internal meter does not take its own layer");
  }
  /* An external meter has no rule of its own here, so it falls to the
     general meter rule rather than borrowing the internal one. */
  if (where(meter("External")) !== "METERS") {
    fail("an external meter takes the INTERNAL layer \u2014 a rule asking for "
      + "one siting must not match the other");
  }
  /* And a meter with nothing said about it matches no siting rule. */
  if (where(meter(null)) === "METERS-INTERNAL") {
    fail("a meter with no siting matches a rule that asks for one");
  }

  /* Geometry type: a schedule separating lines from points needs a rule
     that can say which. */
  const cable = { Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_lv" } };
  if (where(cable) !== "ELECTRIC-LINES") {
    fail("a cable does not take the rule scoped to lines");
  }
  if (where(meter(null)) === "ELECTRIC-LINES") {
    fail("a point takes a rule scoped to lines");
  }
}

// 8d. The CAD team's own layer names are a table, and the form asks in
//     the order somebody thinks in.
{
  const sql = readFileSync("./supabase/migrations/0220_cad_layer_catalogue.sql", "utf8");
  if (!/CREATE TABLE IF NOT EXISTS "CAD_Layer"/.test(sql)) {
    fail("there is no table for the CAD team's layer names, so every rule "
      + "retypes one");
  }
  if (!/"Layer_Key"\s+text/.test(sql) || !/"Geometry_Type"\s+text/.test(sql)) {
    fail("a CAD layer does not record which class and geometry it is for, "
      + "so the entry form cannot narrow the list");
  }
  if (!/ADD COLUMN IF NOT EXISTS "Siting"/.test(sql)) {
    fail("a rule cannot match external against internal");
  }

  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (!/key: "CAD_Layer"/.test(tables)) {
    fail("there is no screen for entering the CAD team's layer names");
  }
  /* Three questions and no more. Colour and linetype would only matter
     if our DXF defined how a layer looks, and it does not: the file is
     imported into a drawing that already has these layers, and the
     receiving template's own properties win. Asking for them is asking
     somebody to type a hundred values nothing reads. */
  {
    const at = tables.indexOf('key: "CAD_Layer"');
    /* A fixed window rather than up to the first "] },": an options
       array closes with exactly that, so cutting there stopped the
       slice half way through the fields and reported a field missing
       that was there. */
    const block = at >= 0 ? tables.slice(at, at + 900) : "";
    for (const col of ["ACI_Colour", "Linetype", "Sort_Order", "Notes"]) {
      if (block.includes(`col: "${col}"`)) {
        fail(`the layer-names form asks for ${col}, which nothing reads`);
      }
    }
    /* Their stage vocabulary, spelled their way. */
    if (!/options: \["Planned", "Existing", "As-Laid"\]/.test(block)) {
      fail("the layer-names form does not offer Planned / Existing / "
        + "As-Laid, so a schedule cannot say which stage a layer is for");
    }
    for (const col of ["Layer_Name", "Layer_Key", "Geometry_Type", "Status"]) {
      if (!block.includes(`col: "${col}"`)) {
        fail(`the layer-names form no longer asks for ${col}, which the `
          + "mapping form needs to narrow its list");
      }
    }
  }

  const screen = readFileSync("./src/features/admin/DxfLayersAdmin.jsx", "utf8");
  /* Asked in order: class, geometry, the sizes THAT class has, then
     their layer. */
  for (const [n, label] of [["1", "Class"], ["2", "Geometry"],
    ["4", "AutoCAD layer"]]) {
    if (!screen.includes(`${n}. ${label}`)) {
      fail(`the entry form does not ask "${n}. ${label}" in order`);
    }
  }
  /* ── Three questions, then their layer ──

     Class, geometry, the OBJECT, the CAD layer. Line type, size band
     and build status were parts of an object rather than the question:
     picking "Gas main 180mm" sets a line type and a size between them,
     and asking for all three separately made somebody assemble an
     object out of parts. */
  for (const gone of ["dxe-lt", "dxe-status", "dxe-from", "dxe-to",
    "dxe-sizelabel", "dxe-cabletype2", "dxe-gas", "dxe-water"]) {
    if (screen.includes(`id="${gone}"`)) {
      fail(`the mapping form still asks for ${gone}, which is a part of an `
        + "object rather than an object");
    }
  }
  if (!screen.includes('id="dxe-object"')) {
    fail("the mapping form does not ask for the object itself");
  }

  /* Electric and Line offers the CABLES, by their full description. */
  if (!/cls === "electric"/.test(screen) || !/cableSizes\.map/.test(screen)) {
    fail("choosing Electric and Line does not offer the cables from the "
      + "specs table");
  }
  if (!/\[typeName\(t\), c\.Size_Label\]/.test(screen)) {
    fail("a cable is not offered by its full description, so somebody has "
      + "to assemble \"3c WAVE 95\" from two boxes");
  }
  /* Gas and water offer their own pipe, main and service. */
  if (!/cls === "gas" \|\| cls === "water"/.test(screen)) {
    fail("choosing Gas or Water and Line does not offer that pipe");
  }
  /* A point offers the fittings that class has, not every role. */
  if (!/POINTS_BY_CLASS/.test(screen)) {
    fail("a point offers every role in the business rather than the ones "
      + "that class has");
  }
  /* Changing class or geometry clears the object chosen under the old
     one: a cable is not a gas pipe, and 125mm gas is not 125mm water. */
  if (!/Line_Type: "", Feature_Role: "", Size_Label: "",/.test(screen)) {
    fail("changing the class or geometry keeps an object chosen under the "
      + "previous one");
  }
  /* The layer's NAME is copied onto the rule, not just its id: the
     export reads a name, and a rule pointing only at a row would
     export nothing if that row were deleted. */
  if (!/CAD_Layer: row\?\.Layer_Name/.test(screen)) {
    fail("picking a layer stores only a reference, so deleting it would "
      + "leave rules that export nothing");
  }

  const fn = readFileSync("./netlify/functions/admin.js", "utf8");
  if (!/CAD_Layer:\s+\{ pk: "CAD_Layer_ID"/.test(fn)) {
    fail("the admin endpoint refuses the CAD layer table");
  }
  /* And does not order by a column 0221 drops. Ordering by one that is
     gone is an empty list and an error nobody connects to a
     migration. */
  if (/CAD_Layer:\s+\{ pk: "CAD_Layer_ID",\s+order: "Sort_Order"/.test(fn)) {
    fail("the endpoint orders CAD layers by a dropped column");
  }

  const status = readFileSync("./supabase/migrations/0222_cad_layer_status.sql", "utf8");
  if (!/ADD COLUMN IF NOT EXISTS "Status"/.test(status)) {
    fail("CAD_Layer has no Status column");
  }
  /* Constrained, so a typo cannot create a fourth stage nobody
     notices. */
  if (!/IN \('Planned','Existing','As-Laid'\)/.test(status)) {
    fail("the Status column accepts anything, so 'as laid' and 'As-Laid' "
      + "become two stages");
  }

  const trim = readFileSync("./supabase/migrations/0221_cad_layer_trim.sql", "utf8");
  for (const col of ["ACI_Colour", "Linetype", "Sort_Order", "Notes"]) {
    if (!trim.includes(`DROP COLUMN IF EXISTS "${col}"`)) {
      fail(`${col} is still on CAD_Layer \u2014 a column that exists invites `
        + "data somebody reasonably expects to do something");
    }
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/setAttr\("Siting"\)/.test(editor)) {
    fail("there is no way to say whether a meter or a feeder is external");
  }

  /* ── And it is rendered where those two features actually are ──

     The editor has THREE status dropdowns \u2014 trench, service, main \u2014
     and the first attempt put the siting field beside the trench one,
     where a cable and a meter never go. It rendered for nothing and
     looked to the user like it had disappeared.

     Built once and rendered under the branches that can show it, which
     is also what stops a second copy drifting from the first. */
  if ((editor.match(/const sitingField/g) || []).length !== 1) {
    fail("the siting field is built more than once, so two copies can "
      + "drift apart");
  }
  if (!/\{isMeter && sitingField\}/.test(editor)) {
    fail("the siting field is never rendered for a meter, so on that "
      + "feature it simply does not appear");
  }
  /* On a main it is rendered INSIDE the status row, not after it: the
     two are answered in the same breath — what stage this length is
     at, and where it sits — and stacked they read as two unrelated
     questions. */
  {
    const at = editor.indexOf("{isMain && (");
    const block = at >= 0 ? editor.slice(at, at + 2400) : "";
    if (!block) {
      fail("the main's status block cannot be found where it was");
    } else {
      if (!/className="fe-row"/.test(block)) {
        fail("the main's status and siting are not on one row");
      }
      if (block.indexOf("{sitingField}") < block.indexOf('id="fe-main-status"')) {
        fail("the siting field is drawn to the LEFT of the status dropdown");
      }
      if (!/\{sitingField\}/.test(block)) {
        fail("the siting field is not inside the main's status row");
      }
    }
  }

  /* And the unset option says what every other unset option in this
     panel says. A phrase used once is one somebody stops to read. */
  if (/Not said/.test(editor.slice(editor.indexOf("const sitingField"),
    editor.indexOf("const sitingField") + 600))) {
    fail("the siting field says \"Not said\" where the rest of the panel "
      + "says \"Not set\"");
  }
  /* Not in the trench branch, where it means nothing. */
  if (/isTrench && sitingField/.test(editor)) {
    fail("a trench is offered a siting, which it is neither");
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
