/* A style rule built out of conditions.

   Asked for: "I need to be able to build a rule within the pane where
   all the fields are. e.g. Build Status = Planned AND DNO Operator =
   Electricity North West THEN set style of line/point."

   The seven scope columns were already ANDed together, so the shape was
   right and the CONTENTS were the problem: Build Status was not one of
   them, and neither was cable size or voltage rating, and each new one
   would have been a migration. A rule now carries `Conditions` — a list
   of {field, value} read off whatever the feature actually holds — and
   all of them must match.

   ── The promise this was built under ──

   Nothing on any drawing moves the day it ships. A rule with no
   conditions must score exactly what it scored before and match exactly
   what it matched before, or every drawing in the system is a
   candidate for changing. That is the first thing tested here and the
   one worth breaking the build over. */

import { readFileSync } from "node:fs";
import {
  styleMatches, styleScore, subjectOf, resolveStyle, cascadeOf,
  CONDITION_WEIGHT, CONDITION_FIELDS,
} from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const layers = [{ Layer_Key: "electric", Utility_ID: 1 }];

const cable = (attrs = {}) => subjectOf({
  Layer_Key: "electric",
  Feature_Type: "line",
  Attributes: { Line_Type: "elec_main", ...attrs },
}, layers);

// ─── 1. A rule with no conditions is untouched ───
{
  const old = [
    { GIS_Style_ID: 1, Layer_Key: "electric", Colour: "#111", Is_Active: true },
    { GIS_Style_ID: 2, Line_Type: "elec_main", Colour: "#222", Is_Active: true },
    { GIS_Style_ID: 3, Line_Type: "elec_main", Site: "Off-site", Colour: "#333", Is_Active: true },
    { GIS_Style_ID: 4, Organisation_ID: 7, Colour: "#444", Is_Active: true },
  ];
  /* The weights as they were: layer 1, line type 8, +site 16, operator 32. */
  for (const [i, want] of [[0, 1], [1, 8], [2, 24], [3, 32]]) {
    const got = styleScore(old[i]);
    if (got !== want) fail(`an existing rule now scores ${got}, not ${want}`);
  }
  /* And still matches what it matched. */
  if (!styleMatches(old[1], cable(), {})) fail("an existing rule stopped matching");
  const drawn = resolveStyle(cable(), old, {});
  if (drawn.Colour !== "#222") {
    fail(`an existing cascade now draws ${drawn.Colour}, not #222`);
  }

  /* Conditions that are absent, empty, null or junk are all "no
     conditions". A rule saved before this existed has no column at all;
     one saved by a form that sent [] has an empty list; neither can be
     allowed to change a score. */
  for (const c of [undefined, null, [], "", {}, [{}], [{ field: "" }]]) {
    const got = styleScore({ Line_Type: "elec_main", Conditions: c });
    if (got !== 8) fail(`Conditions of ${JSON.stringify(c)} scored ${got}, not 8`);
    if (!styleMatches({ Line_Type: "elec_main", Conditions: c }, cable(), {})) {
      fail(`Conditions of ${JSON.stringify(c)} stopped a rule matching`);
    }
  }
}

// ─── 2. The rule from the request, exactly ───
{
  /* WHEN Build Status = Planned AND Operator = Electricity North West */
  const rule = {
    GIS_Style_ID: 10,
    Organisation_ID: 7,
    Conditions: [{ field: "Build_Status", value: "planned" }],
    Colour: "#7c3aed", Is_Active: true,
  };
  const enw = { organisationId: 7 };

  if (!styleMatches(rule, cable({ Build_Status: "planned" }), enw)) {
    fail("the rule does not match a planned cable drawn to that operator's standard");
  }
  /* Each half alone is not enough. AND means AND. */
  if (styleMatches(rule, cable({ Build_Status: "aslaid" }), enw)) {
    fail("the rule matched an as-laid cable");
  }
  if (styleMatches(rule, cable({ Build_Status: "planned" }), { organisationId: 9 })) {
    fail("the rule matched another operator's standard");
  }
  if (styleMatches(rule, cable({ Build_Status: "planned" }), {})) {
    fail("the rule matched with no operator standard chosen");
  }
  /* A feature that does not carry the field at all is not a match:
     naming a field narrows to the things that have it. */
  if (styleMatches(rule, cable(), enw)) {
    fail("the rule matched a feature with no build status");
  }
}

// ─── 3. Conditions narrow, and narrowing wins ───
{
  const base = { GIS_Style_ID: 1, Line_Type: "elec_main", Colour: "#2563eb", Is_Active: true };
  const planned = {
    GIS_Style_ID: 2, Line_Type: "elec_main",
    Conditions: [{ field: "Build_Status", value: "planned" }],
    Colour: "#7c3aed", Is_Active: true,
  };
  const styles = [base, planned];

  if (resolveStyle(cable({ Build_Status: "planned" }), styles, {}).Colour !== "#7c3aed") {
    fail("a condition did not beat the rule it narrows");
  }
  if (resolveStyle(cable({ Build_Status: "aslaid" }), styles, {}).Colour !== "#2563eb") {
    fail("a condition applied to something it does not name");
  }
  /* Two conditions beat one: more facts named is more specific, and
     there is no reading of the word where that is not true. */
  const both = {
    GIS_Style_ID: 3, Line_Type: "elec_main",
    Conditions: [
      { field: "Build_Status", value: "planned" },
      { field: "Size", value: "185" },
    ],
    Colour: "#dc2626", Is_Active: true,
  };
  const drawn = resolveStyle(
    cable({ Build_Status: "planned", Size: "185" }), [...styles, both], {},
  );
  if (drawn.Colour !== "#dc2626") fail("two conditions did not beat one");
  if (styleScore(both) - styleScore(planned) !== CONDITION_WEIGHT) {
    fail("a second condition is not worth a condition");
  }

  /* ── Where a condition sits among the columns ──

     Not the number, which is a choice and may be revisited — the
     PLACE, which is the rule. One condition is worth one more fact
     about the thing: more than the layer or the utility it belongs to,
     no more than the line type, and less than the Site, which is about
     consent and cost and is meant to read at a glance.

     Asserted by score rather than by reading the constant, so a
     renamed weight or a reshuffled table still has to answer for
     itself. */
  const plus = (extra) => styleScore({ Line_Type: "x", ...extra })
    - styleScore({ Line_Type: "x" });
  const one = plus({ Conditions: [{ field: "a", value: "1" }] });
  if (!(one > plus({ Layer_Key: "electric" }))) {
    fail("a condition is worth no more than naming a layer");
  }
  if (!(one > plus({ Utility_ID: 1 }))) {
    fail("a condition is worth no more than naming a utility");
  }
  if (one > plus({ Line_Type: null, Site: "Off-site" })) {
    fail("one condition outweighs Site, which is meant to read at a glance");
  }
  if (one > 8) {
    fail(`one condition is worth ${one} — more than a line type, which it narrows`);
  }
}

// ─── 4. Compared as text, because an admin box holds text ───
{
  const rule = {
    GIS_Style_ID: 1, Conditions: [{ field: "Circuit_ID", value: "11" }],
    Colour: "#000", Is_Active: true,
  };
  if (!styleMatches(rule, cable({ Circuit_ID: 11 }), {})) {
    fail("a number on the drawing did not match the same number typed in");
  }
  if (styleMatches(rule, cable({ Circuit_ID: 110 }), {})) {
    fail("a condition matched a value that merely starts the same");
  }
  /* false is a value, not an absence. A condition naming Off_Site =
     false must match a feature that says so. */
  const offSite = {
    GIS_Style_ID: 2, Conditions: [{ field: "Off_Site", value: "false" }],
    Colour: "#111", Is_Active: true,
  };
  if (!styleMatches(offSite, cable({ Off_Site: false }), {})) {
    fail("a condition on false did not match false");
  }
  if (styleMatches(offSite, cable({ Off_Site: true }), {})) {
    fail("a condition on false matched true");
  }
}

// ─── 5. The subject carries what conditions ask of ───
{
  const s = cable({ Build_Status: "planned" });
  if (s.Attributes?.Build_Status !== "planned") {
    fail("the subject does not carry the feature's attributes");
  }
  /* And the named fields still read as they did — the columns match on
     these and must not start disagreeing with the conditions. */
  if (s.Line_Type !== "elec_main") fail("the subject lost its line type");
  if (s.Layer_Key !== "electric") fail("the subject lost its layer");
  if (s.Utility_ID !== 1) fail("the subject lost the layer's utility");
  /* A feature with no attributes at all does not throw. */
  const bare = subjectOf({ Layer_Key: "electric" }, layers);
  if (bare.Attributes == null) fail("a feature with no attributes has no attributes object");
  if (styleMatches({ Conditions: [{ field: "Build_Status", value: "planned" }] }, bare, {})) {
    fail("a condition matched a feature carrying nothing");
  }
}

// ─── 6. An inactive rule is still inactive ───
{
  const off = {
    GIS_Style_ID: 1, Is_Active: false,
    Conditions: [{ field: "Build_Status", value: "planned" }],
  };
  if (styleMatches(off, cable({ Build_Status: "planned" }), {})) {
    fail("a switched-off rule matched because its conditions did");
  }
}

// ─── 7. The cascade narrates conditions like everything else ───
{
  const styles = [
    { GIS_Style_ID: 1, Line_Type: "elec_main", Colour: "#2563eb", Is_Active: true },
    {
      GIS_Style_ID: 2, Line_Type: "elec_main",
      Conditions: [{ field: "Build_Status", value: "planned" }],
      Colour: "#7c3aed", Is_Active: true,
    },
  ];
  const order = cascadeOf(cable({ Build_Status: "planned" }), styles, {})
    .map((x) => x.s.GIS_Style_ID);
  if (order.join(",") !== "1,2") {
    fail(`the cascade applies rules in the order ${order.join(",")}, expected 1,2`);
  }
}

// ─── 8. The fields offered are a starting point, not a fence ───
{
  if (!Array.isArray(CONDITION_FIELDS) || !CONDITION_FIELDS.length) {
    fail("no condition fields are offered");
  }
  if (!CONDITION_FIELDS.some((f) => f.field === "Build_Status")) {
    fail("Build status is not offered, which is the field this was asked for");
  }
  for (const f of CONDITION_FIELDS) {
    if (!f.label) fail(`the ${f.field} condition has no label`);
  }
  /* A field NOT on the list still works. The list is a convenience and
     the same fault the ROLES register has had twice is a list that
     decides what exists. */
  const odd = {
    GIS_Style_ID: 1, Conditions: [{ field: "Anything_At_All", value: "yes" }],
    Colour: "#000", Is_Active: true,
  };
  if (!styleMatches(odd, cable({ Anything_At_All: "yes" }), {})) {
    fail("a condition on a field not in the offered list does not work");
  }
}

// ─── 9. The source says what it charges, once ───
{
  const src = readFileSync("src/lib/gisStyle.js", "utf8");
  if (!/export const CONDITION_WEIGHT = \d+/.test(src)) {
    fail("what a condition is worth is not stated in one place");
  }
  /* Scored through the same helper that filters them, or a rule with a
     junk condition could score for it and never match on it. */
  if (!/conditionsOf\(style\)\.length \* CONDITION_WEIGHT/.test(src)) {
    fail("conditions are counted for scoring by something other than the filter that matches them");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Style rules take conditions: all must match, each narrows, and a rule without any is unchanged.");
process.exit(bad ? 1 : 0);
