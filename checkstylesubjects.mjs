/* Features, their default style, and the variations derived from it.

   Asked for: "The Add Rule button should not be in the left hand pane as
   these are the Features that I want to apply the styles to. The left
   hand pane should not contain rules. In the styles pane, I need to be
   able to set a DEFAULT style and every other style variation should be
   derived from the default style."

   With the worked example given, which is section 1 here almost word for
   word: an on-site electric cable that is n pixels wide, yellow and
   dashed; going continuous when the build status is Live; going purple
   off site. Each variation changing ONE thing and taking the rest from
   the default.

   ── What must not happen ──

   A rule that no longer reaches the screen. The left-hand list is built
   from the catalogue now rather than from the rules, so a rule about
   something the catalogue does not carry — a retired line type, a role
   renamed in Admin — has no feature to sit under. It is still styling
   the drawing. `countRules` is the guard and it is tested against rows
   deliberately chosen to have nowhere obvious to go.

   Run: node checkstylesubjects.mjs */

import { readFileSync } from "node:fs";
import {
  buildSubjects, sectionsOf, countRules, inheritedStyle, overriddenFields,
  subjectKeyOf, isVariation, FIELDS,
} from "./src/features/admin/styleSubjects.js";
import { resolveStyle } from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "elec_main", Label: "Electric Main", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Electric Service", Layer_Key: "electric" },
  { Type_Key: "trench_main", Label: "Mains Trench", Layer_Key: "trench" },
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
];
const layers = [
  { Layer_Key: "electric", Label: "Electric" },
  { Layer_Key: "plot", Label: "Plots" },
];
const roles = [
  { key: "meter", label: "Meter" },
  { key: "plot", label: "Plot seed" },
  { key: "joint", label: "Joint" },
];

// ─── 1. The example, exactly as it was given ───
{
  /* "the default style of an on site Electric Cable may be n pixels
     wide, yellow, dashed line" */
  const dflt = {
    GIS_Style_ID: 1, Style_Name: "Electric main", Line_Type: "elec_main",
    Colour: "#facc15", Width_Px: 3, Dashed: true, Is_Active: true,
  };
  /* "if the build status changes from 'Planned' to 'Live' then the line
     type may change to Continuous" */
  const live = {
    GIS_Style_ID: 2, Style_Name: "Live", Line_Type: "elec_main",
    Conditions: [{ field: "Build_Status", value: "asbuilt" }],
    Dashed: false, Is_Active: true,
  };
  /* "If the On Site/Off Site changes to Off Site, the colour may change
     to purple" */
  const off = {
    GIS_Style_ID: 3, Style_Name: "Off site", Line_Type: "elec_main",
    Site: "Off-site", Colour: "#7c3aed", Is_Active: true,
  };
  const rows = [dflt, live, off];
  const subs = buildSubjects({ lineTypes, layers, rows, roles });
  const cable = subs.find((s) => s.key === "lt:elec_main");

  if (!cable) { fail("the electric main is not a feature"); }
  else {
    if (cable.dflt?.GIS_Style_ID !== 1) {
      fail(`the cable's default is ${cable.dflt?.Style_Name ?? "missing"}`);
    }
    if (cable.variations.length !== 2) {
      fail(`${cable.variations.length} variations on the cable, expected 2`);
    }

    /* Each variation changes ONE thing. */
    if (overriddenFields(live).join(",") !== "Dashed") {
      fail(`the Live variation sets ${overriddenFields(live).join(",")}`);
    }
    if (overriddenFields(off).join(",") !== "Colour") {
      fail(`the off-site variation sets ${overriddenFields(off).join(",")}`);
    }

    /* And takes the rest from the default. This is the whole request. */
    const liveGets = inheritedStyle(cable, {
      rows, excludeId: 2, criteria: [{ field: "Build_Status", value: "asbuilt" }],
    });
    if (liveGets.Colour !== "#facc15") {
      fail(`a Live cable inherits the colour ${liveGets.Colour}, not the default's`);
    }
    if (liveGets.Width_Px !== 3) {
      fail(`a Live cable inherits the width ${liveGets.Width_Px}, not the default's`);
    }
    if (liveGets.Dashed !== true) {
      fail("the Live variation is not shown as changing anything — it inherits "
        + "the same dash it overrides");
    }

    const offGets = inheritedStyle(cable, {
      rows, excludeId: 3, criteria: [{ field: "Site", value: "Off-site" }],
    });
    if (offGets.Dashed !== true || offGets.Width_Px !== 3) {
      fail("an off-site cable does not inherit the default's dash and width");
    }
    if (offGets.Colour !== "#facc15") {
      fail("an off-site cable does not inherit the colour it is about to change");
    }

    /* What the canvas actually draws, from the same rules: the two
       variations compose, because that is what a cascade does. An
       off-site Live cable is purple AND continuous. */
    const drawn = resolveStyle({
      Layer_Key: "electric", Line_Type: "elec_main", Site: "Off-site",
      Attributes: { Line_Type: "elec_main", Build_Status: "asbuilt", Site: "Off-site" },
    }, rows, {});
    if (drawn.Colour !== "#7c3aed") fail(`an off-site Live cable draws ${drawn.Colour}`);
    if (drawn.Dashed !== false) fail("an off-site Live cable is still dashed");
    if (drawn.Width_Px !== 3) fail("an off-site Live cable lost the default's width");
  }
}

// ─── 2. A feature nobody has styled is still a feature ───
{
  /* The reason the catalogue is read at all. Built from the rules, the
     list could only name things somebody had already written a rule
     about — so a line type nobody had styled was missing from the one
     screen that exists to style it, with no way to reach it. */
  const subs = buildSubjects({ lineTypes, layers, rows: [], roles });
  for (const t of lineTypes) {
    const s = subs.find((x) => x.key === `lt:${t.Type_Key}`);
    if (!s) fail(`${t.Type_Key} is not listed as a feature`);
    else {
      if (s.dflt) fail(`${t.Type_Key} has a default style and no rules exist`);
      if (s.label !== t.Label) fail(`${t.Type_Key} is called ${s.label}`);
    }
  }
  for (const r of roles) {
    if (!subs.find((x) => x.key === `role:${r.key}`)) {
      fail(`the ${r.key} role is not listed as a feature`);
    }
  }
  /* And a layer is NOT offered until a rule names one: it is a fallback,
     not a thing you draw, and the list was asked to stay short. */
  if (subs.some((s) => s.kind === "layer")) {
    fail("a layer is offered as a feature with no rule asking for it");
  }
  if (subs.some((s) => s.kind === "any")) {
    fail("the whole drawing is offered as a feature");
  }
}

// ─── 3. Every rule reaches a feature ───
{
  /* A rule this screen cannot show is a rule nobody can edit, and it
     goes on styling the drawing regardless. */
  const rows = [
    { GIS_Style_ID: 1, Style_Name: "Cable", Line_Type: "elec_main", Is_Active: true },
    { GIS_Style_ID: 2, Style_Name: "Meter", Feature_Role: "meter", Is_Active: true },
    { GIS_Style_ID: 3, Style_Name: "Plots", Layer_Key: "plot", Is_Active: true },
    { GIS_Style_ID: 4, Style_Name: "Off site", Site: "Off-site", Is_Active: true },
    /* A line type the catalogue does not carry — retired, or renamed. */
    { GIS_Style_ID: 5, Style_Name: "Old trench", Line_Type: "trench_sep", Is_Active: true },
    /* A role that is not in the register. */
    { GIS_Style_ID: 6, Style_Name: "Mystery", Feature_Role: "wat_is_dit", Is_Active: true },
    /* A layer nobody listed. */
    { GIS_Style_ID: 7, Style_Name: "Annotations", Layer_Key: "annotation", Is_Active: true },
  ];
  const subs = buildSubjects({ lineTypes, layers, rows, roles });
  if (countRules(subs) !== rows.length) {
    fail(`${countRules(subs)} of ${rows.length} rules reach a feature — the rest `
      + `cannot be edited and go on styling the drawing`);
  }
  /* The ones with no catalogue entry are named from the rule and marked,
     rather than silently filed under something else. */
  const orphan = subs.find((s) => s.key === "lt:trench_sep");
  if (!orphan?.unlisted) fail("a rule about a retired line type is not marked as such");
  if (orphan?.label !== "Old trench") {
    fail(`a rule with no catalogue entry is called ${orphan?.label}`);
  }
  /* Each rule appears exactly once: twice would be two editors for one
     row, and whichever was saved second would win silently. */
  const seen = new Map();
  for (const s of subs) for (const r of s.rules) {
    seen.set(r.GIS_Style_ID, (seen.get(r.GIS_Style_ID) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n !== 1) fail(`rule ${id} appears ${n} times`);
}

// ─── 4. Which feature a rule is about ───
{
  /* Most specific naming wins, the same order the old tree filed them
     in: a rule naming a role AND a layer is about the role. */
  const cases = [
    [{ Feature_Role: "meter", Layer_Key: "electric", Line_Type: "elec_main" }, "role:meter"],
    [{ Line_Type: "elec_main", Layer_Key: "electric" }, "lt:elec_main"],
    [{ Layer_Key: "electric" }, "layer:electric"],
    [{ Site: "Off-site" }, "any"],
    [{}, "any"],
  ];
  for (const [row, want] of cases) {
    const got = subjectKeyOf(row);
    if (got !== want) fail(`${JSON.stringify(row)} is filed under ${got}, expected ${want}`);
  }
}

// ─── 5. Default or variation ───
{
  const base = { Line_Type: "elec_main" };
  if (isVariation(base)) fail("a rule naming only its feature is not the default");
  for (const extra of [
    { Site: "Off-site" }, { Supply_Type: "nrs" }, { Organisation_ID: 7 },
    { Conditions: [{ field: "Build_Status", value: "planned" }] },
  ]) {
    if (!isVariation({ ...base, ...extra })) {
      fail(`${JSON.stringify(extra)} does not make a rule a variation`);
    }
  }
  /* An empty or junk condition list narrows nothing, so it is still the
     default — the same reading the cascade takes, and the reason a
     variation is made to name at least one criterion before it saves. */
  for (const c of [null, [], [{}], [{ field: "" }]]) {
    if (isVariation({ ...base, Conditions: c })) {
      fail(`Conditions of ${JSON.stringify(c)} make a rule a variation while `
        + `narrowing nothing`);
    }
  }
}

// ─── 6. Several rules narrowing nothing ───
{
  /* The cascade applies them in id order and the last wins field by
     field, so the last IS the default. The others must be named rather
     than hidden. */
  const rows = [
    { GIS_Style_ID: 10, Style_Name: "First", Line_Type: "elec_main", Colour: "#111", Is_Active: true },
    { GIS_Style_ID: 11, Style_Name: "Second", Line_Type: "elec_main", Colour: "#222", Is_Active: true },
  ];
  const cable = buildSubjects({ lineTypes, layers, rows, roles })
    .find((s) => s.key === "lt:elec_main");
  if (cable.dflt?.GIS_Style_ID !== 11) {
    fail(`the default is ${cable.dflt?.Style_Name}, but the cascade draws Second`);
  }
  if (cable.alsoDefault.length !== 1 || cable.alsoDefault[0].GIS_Style_ID !== 10) {
    fail("the other rule that narrows nothing is not named, so nobody can edit it");
  }
  /* Asserted against the cascade rather than against the id: which one
     wins is gisStyle's answer, and this screen must not have a second. */
  const drawn = resolveStyle({
    Layer_Key: "electric", Line_Type: "elec_main",
    Attributes: { Line_Type: "elec_main" },
  }, rows, {});
  if (drawn.Colour !== cable.dflt.Colour) {
    fail(`the screen calls ${cable.dflt.Style_Name} the default and the canvas `
      + `draws ${drawn.Colour}`);
  }
}

// ─── 7. What a variation inherits is the whole cascade under it ───
{
  /* Not just the feature's own default. A cable also sits under the
     electric layer's rule and under anything site-wide, and a screen
     that showed only the default would say a variation inherits one
     thing while the drawing shows another. */
  const rows = [
    { GIS_Style_ID: 1, Style_Name: "Everything", Width_Px: 1, Is_Active: true },
    { GIS_Style_ID: 2, Style_Name: "Electric layer", Layer_Key: "electric", Colour: "#0ea5e9", Is_Active: true },
    { GIS_Style_ID: 3, Style_Name: "Electric main", Line_Type: "elec_main", Dashed: true, Is_Active: true },
    { GIS_Style_ID: 4, Style_Name: "Planned", Line_Type: "elec_main", Colour: "#7c3aed", Is_Active: true, Conditions: [{ field: "Build_Status", value: "planned" }] },
  ];
  const cable = buildSubjects({ lineTypes, layers, rows, roles })
    .find((s) => s.key === "lt:elec_main");
  const got = inheritedStyle(cable, {
    rows, excludeId: 4, criteria: [{ field: "Build_Status", value: "planned" }],
  });
  if (got.Colour !== "#0ea5e9") {
    fail(`the variation is shown inheriting ${got.Colour} — the layer's `
      + `colour is what it would take`);
  }
  if (got.Width_Px !== 1) fail("the site-wide width is not inherited");
  if (got.Dashed !== true) fail("the feature's own default is not inherited");

  /* And the rule being edited is excluded, or it inherits itself and
     every field looks already set. */
  const withItself = inheritedStyle(cable, {
    rows, excludeId: null, criteria: [{ field: "Build_Status", value: "planned" }],
  });
  if (withItself.Colour !== "#7c3aed") {
    fail("excluding nothing does not include the rule itself, so the test is "
      + "not testing exclusion");
  }
  if (got.Colour === withItself.Colour) {
    fail("a variation inherits its own value, so every field reads as already set");
  }

  /* A switched-off rule is not inherited from. Held by the cascade's own
     `styleMatches` rather than by a filter here — asserted all the same,
     because it is the behaviour that matters and where it is decided may
     change. */
  const offRows = rows.map((r) => (r.GIS_Style_ID === 2 ? { ...r, Is_Active: false } : r));
  const noLayer = inheritedStyle(cable, { rows: offRows, excludeId: 4, criteria: [] });
  if (noLayer.Colour != null) {
    fail("a switched-off rule is still shown as being inherited from");
  }
}

// ─── 8. The criteria decide what is inherited ───
{
  /* An off-site variation inherits from the off-site rules beneath it,
     not from the on-site ones. Getting this wrong shows the wrong
     starting point on exactly the screen that exists to explain it. */
  const rows = [
    { GIS_Style_ID: 1, Line_Type: "elec_main", Colour: "#facc15", Is_Active: true },
    { GIS_Style_ID: 2, Line_Type: "elec_main", Site: "Off-site", Colour: "#7c3aed", Is_Active: true },
    { GIS_Style_ID: 3, Line_Type: "elec_main", Site: "Off-site", Width_Px: 9, Is_Active: true, Conditions: [{ field: "Build_Status", value: "planned" }] },
  ];
  const cable = buildSubjects({ lineTypes, layers, rows, roles })
    .find((s) => s.key === "lt:elec_main");
  const offPlanned = inheritedStyle(cable, {
    rows,
    excludeId: 3,
    criteria: [{ field: "Site", value: "Off-site" },
      { field: "Build_Status", value: "planned" }],
  });
  if (offPlanned.Colour !== "#7c3aed") {
    fail(`an off-site variation is shown inheriting ${offPlanned.Colour}, which is `
      + `the on-site answer`);
  }
  /* With no criteria it inherits the plain one. */
  const plain = inheritedStyle(cable, { rows, excludeId: 3, criteria: [] });
  if (plain.Colour !== "#facc15") {
    fail(`with no criteria the inherited colour is ${plain.Colour}`);
  }
  /* And an operator's standard is a criterion like any other. */
  const opRows = [...rows,
    { GIS_Style_ID: 4, Line_Type: "elec_main", Organisation_ID: 7, Colour: "#dc2626", Is_Active: true }];
  const forOp = inheritedStyle(cable, {
    rows: opRows, excludeId: 9,
    criteria: [{ field: "Organisation_ID", value: "7" }],
  });
  if (forOp.Colour !== "#dc2626") {
    fail(`a variation under an operator's standard inherits ${forOp.Colour}`);
  }
}

// ─── 9. Sections, with the site-wide group first ───
{
  const rows = [
    { GIS_Style_ID: 1, Style_Name: "Everything", Is_Active: true },
    { GIS_Style_ID: 2, Style_Name: "Plots", Layer_Key: "plot", Is_Active: true },
  ];
  const secs = sectionsOf(buildSubjects({ lineTypes, layers, rows, roles }));
  if (secs[0]?.key !== "sitewide") {
    fail(`the first section is ${secs[0]?.key}, and the rules that apply to `
      + `everything are what the rest are exceptions to`);
  }
  if (secs[0]?.label !== "Site-wide") fail(`the first section is called ${secs[0]?.label}`);
  /* Every subject lands in exactly one section. */
  const subs = buildSubjects({ lineTypes, layers, rows, roles });
  const placed = secs.reduce((n, s) => n + s.subjects.length, 0);
  if (placed !== subs.length) {
    fail(`${placed} of ${subs.length} features are in a section`);
  }
  /* A layer's fallback sorts below the features it is a fallback to. */
  const site = secs.find((x) => x.key === "site");
  if (site) {
    const layerAt = site.subjects.findIndex((x) => x.kind === "layer");
    if (layerAt >= 0 && layerAt !== site.subjects.length - 1) {
      fail("a layer fallback sorts above the features it is an exception to");
    }
  }
}

// ─── 10. The fields it reports on are the cascade's own ───
{
  const src = readFileSync("src/features/admin/styleSubjects.js", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  if (!/from "\.\.\/\.\.\/lib\/gisStyle\.js"/.test(code)) {
    fail("the subject model does not read the cascade, so what it says a "
      + "variation inherits is its own opinion");
  }
  if (!/resolveStyle\(/.test(code)) {
    fail("inheritance is worked out by something other than the resolver the "
      + "canvas uses");
  }
  /* The appearance fields come from gisStyle, or the screen reports a
     variation overriding something the canvas does not read. */
  if (!FIELDS.includes("Colour") || !FIELDS.includes("Dashed") || FIELDS.length < 20) {
    fail(`the field list is ${FIELDS.length} long — it is meant to be the `
      + `cascade's own`);
  }
  /* Null and "" both mean "not set": the cascade tests for null, the
     admin's empty controls read as "". A variation whose blank boxes
     counted as overrides would override everything with nothing. */
  if (overriddenFields({ Colour: "", Width_Px: null, Dashed: false }).join(",") !== "Dashed") {
    fail("a blank field is counted as an override");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Features carry a default style and variations derived from it, every rule "
    + "reaches one, and what a variation inherits is what the canvas would draw.");
process.exit(bad ? 1 : 0);
