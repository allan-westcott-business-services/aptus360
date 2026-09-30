/* A rule's scope as one list of criteria.

   Asked for, about the right-hand pane: "the Operator dropdown box
   should be a Rule Criteria… The Site dropdown box should be a
   criteria… I do not need the Utility dropdown box as I do not
   understand how this is having any bearing on the style", the same for
   Layer and for Point Role, and one bug: "when I add a Condition, when I
   pick one of the fields from the dropdown box, I cannot change my
   selection — I need to delete the condition."

   ── The promise ──

   The pane was rearranged; the cascade was not. Operator and Site are
   still columns with their own weights, still matched by the same
   styleMatches, and a rule opened and saved without being touched comes
   back byte for byte. That is the first thing tested here, on rules
   shaped like the ones in the live table, and the one worth breaking the
   build over — because the failure mode is silent: an Operator criterion
   left in `Conditions` is matched against the feature's Attributes,
   which carry no Organisation_ID, so the rule saves cleanly, reads
   correctly on screen, and matches nothing at all. */

import { readFileSync } from "node:fs";
import {
  toCriteria, fromCriteria, fieldOptions, valuesFor, isColumnField,
  preservedScope, labelFor, PRESERVED, OTHER, COLUMN_CRITERIA,
  CRITERIA_FIELDS, changeField,
} from "./src/features/admin/styleCriteria.js";
import { styleMatches, styleScore, subjectOf } from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Rules shaped like the ones in the table: the seeded layer default, the
   role rule, the off-site rule the user sent a CSV of, an operator's
   rule, and one carrying conditions already. */
const LIVE = [
  { GIS_Style_ID: 11, Style_Name: "Plots (layer default)", Layer_Key: "plot",
    Colour: "#2563eb", Is_Active: true },
  { GIS_Style_ID: 20, Style_Name: "Plot seed", Feature_Role: "plot", Is_Active: true },
  { GIS_Style_ID: 19, Style_Name: "Off site", Site: "Off-site", Is_Active: true },
  { GIS_Style_ID: 30, Style_Name: "ENW mains", Organisation_ID: 7,
    Line_Type: "elec_main", Colour: "#7c3aed", Is_Active: true },
  { GIS_Style_ID: 31, Style_Name: "ENW planned mains", Organisation_ID: 7,
    Line_Type: "elec_main", Site: "Off-site",
    Conditions: [{ field: "Build_Status", value: "planned" }], Is_Active: true },
  { GIS_Style_ID: 32, Style_Name: "Everything", Is_Active: true },
  { GIS_Style_ID: 33, Style_Name: "Water, by utility", Utility_ID: 3, Is_Active: true },
];

const SCOPE = ["Layer_Key", "Line_Type", "Feature_Role", "Supply_Type",
  "Utility_ID", "Organisation_ID", "Site"];

/* A rule as the database ends up holding it.

   The draft, and everything the pane hands to the API, says "" for an
   empty control; the endpoint turns "" into NULL before it writes
   (gis-styles.js: `v === "" ? null : v`, because a "" Layer_Key would
   match nothing and the rule would never apply).

   Scoring a draft directly would count every empty column as set — ""
   is not null — and say a rule scoped to nothing scores 48. Which the
   first run of this check duly reported. */
const stored = (row) => Object.fromEntries(
  Object.entries(row).map(([k, v]) => [k, v === "" ? null : v]));

// ─── 1. Open it, save it, and nothing about it has changed ───
{
  for (const row of LIVE) {
    /* Opened the way the pane opens it: nulls become "", which is what
       an empty control reads as and what the API turns back into null. */
    const opened = toCriteria(Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v == null ? "" : v])));
    const saved = fromCriteria(opened);

    for (const k of SCOPE) {
      const was = row[k] ?? "";
      const now = saved[k] ?? "";
      if (String(was) !== String(now)) {
        fail(`${row.Style_Name}: ${k} was ${JSON.stringify(was)} and came `
          + `back ${JSON.stringify(now)}`);
      }
    }
    const wasC = JSON.stringify(row.Conditions ?? null);
    const nowC = JSON.stringify(saved.Conditions ?? null);
    if (wasC !== nowC) {
      fail(`${row.Style_Name}: conditions were ${wasC} and came back ${nowC}`);
    }
    /* And it still scores the same, which is what decides who wins. */
    if (styleScore(row) !== styleScore(stored(saved))) {
      fail(`${row.Style_Name}: scored ${styleScore(row)} and now scores `
        + `${styleScore(stored(saved))}`);
    }
  }
}

// ─── 2. Operator and Site never end up as conditions ───
{
  /* The silent failure. A criterion on Organisation_ID saved into the
     jsonb list is asked of the feature's Attributes, which never carry
     one — so it matches nothing, and nothing says so. */
  const draft = {
    Style_Name: "x", Organisation_ID: "", Site: "",
    Conditions: [
      { field: "Organisation_ID", value: "7" },
      { field: "Site", value: "Off-site" },
      { field: "Build_Status", value: "planned" },
    ],
  };
  const saved = fromCriteria(draft);
  if (String(saved.Organisation_ID) !== "7") {
    fail("an Operator criterion did not reach the Organisation_ID column");
  }
  if (saved.Site !== "Off-site") fail("a Site criterion did not reach the Site column");
  const fields = (saved.Conditions ?? []).map((c) => c.field);
  if (fields.length !== 1 || fields[0] !== "Build_Status") {
    fail(`the conditions saved are ${JSON.stringify(fields)} — the column ones `
      + `must not be among them`);
  }

  /* Proved by matching, not only by reading the row back: the rule has
     to catch a planned ENW cable that is off site. */
  const layers = [{ Layer_Key: "electric", Utility_ID: 1 }];
  const subject = subjectOf({
    Layer_Key: "electric",
    Attributes: { Line_Type: "elec_main", Build_Status: "planned", Site: "Off-site" },
  }, layers);
  /* Matched as the database will hold it. A column the criteria list
     does not mention is cleared to "", and the endpoint turns "" into
     NULL before it writes — a "" scope column would match nothing at
     all, which is what this asserted before `stored` was applied here
     and Supply_Type joined the column criteria. */
  const asHeld = { ...stored(saved), Is_Active: true };
  if (!styleMatches(asHeld, subject, { organisationId: 7 })) {
    fail("the rule built from criteria does not match the feature it describes");
  }
  /* And the operator half has to bite. */
  if (styleMatches(asHeld, subject, { organisationId: 9 })) {
    fail("the rule matched another operator's standard, so the Operator "
      + "criterion is not being applied");
  }
}

// ─── 3. Removing a criterion removes the scope ───
{
  /* The other half of holding the scope in one list: a criterion taken
     out has to clear the column it came from, or the rule goes on
     narrowing by something no longer on screen. */
  const opened = toCriteria({ Style_Name: "x", Organisation_ID: 7, Site: "Off-site" });
  if (opened.Organisation_ID !== "" || opened.Site !== "") {
    fail("opening a rule left its columns set as well as listing them, so the "
      + "two can disagree");
  }
  if (opened.Conditions.length !== 2) {
    fail(`opening that rule listed ${opened.Conditions.length} criteria, expected 2`);
  }
  const without = fromCriteria({
    ...opened, Conditions: opened.Conditions.filter((c) => c.field !== "Site"),
  });
  if (without.Site !== "") fail("removing the Site criterion left the Site column set");
  if (String(without.Organisation_ID) !== "7") {
    fail("removing one criterion cleared another");
  }
  /* The list is the only truth while a rule is open. A column still
     holding a value the list does not mention has to be cleared, or a
     criterion somebody removed goes on narrowing invisibly — and the two
     safeguards for that (blanking on open, clearing on save) each hide
     the loss of the other, so each is tested on its own. */
  const stale = fromCriteria({
    Organisation_ID: 7, Site: "Off-site", Conditions: [],
  });
  if (stale.Organisation_ID !== "" || stale.Site !== "") {
    fail("saving a rule kept a column the criteria list does not mention");
  }

  /* And it now scores less, because it narrows by less. */
  const before = styleScore(stored(fromCriteria(opened)));
  const after = styleScore(stored(without));
  if (!(after < before)) {
    fail(`removing the Site criterion left the rule scoring ${after}, not less `
      + `than ${before}`);
  }
}

// ─── 4. A half-filled criterion is dropped, not saved ───
{
  const saved = fromCriteria({
    Style_Name: "x",
    Conditions: [
      { field: "", value: "" },
      { field: "  ", value: "anything" },
      { field: "Build_Status", value: " planned " },
      { field: "Size", value: "", other: true },
    ],
  });
  const conds = saved.Conditions ?? [];
  if (conds.length !== 2) {
    fail(`${conds.length} conditions saved from four rows, two of them blank`);
  }
  if (conds[0]?.value !== "planned") fail("a value was saved with its spaces");
  /* The flag the screen puts on a row while it is being typed into must
     not reach the database: 0240's constraint allows extra keys, so it
     would be stored and read back for ever. */
  for (const c of conds) {
    const keys = Object.keys(c).sort().join(",");
    if (keys !== "field,value") {
      fail(`a saved condition carries ${keys} — only field and value belong there`);
    }
  }
  /* Nothing left means null, which is how every row read before 0240. */
  if (fromCriteria({ Conditions: [{ field: "" }] }).Conditions !== null) {
    fail("a rule whose only criterion is blank saves an empty list rather than null");
  }
}

// ─── 5. The field can be changed, which is the reported bug ───
{
  /* "when I pick one of the fields from the dropdown box, I cannot
     change my selection - I need to delete the condition."

     It was an <input list>: a datalist filters its suggestions by what
     is already in the box, so once it held Build_Status the only
     suggestion left was Build_Status. The row's own field must be among
     its options, or a select would show an empty box for a row that has
     a value. */
  const criteria = [{ field: "Build_Status", value: "planned" }];
  const opts = fieldOptions(criteria, 0).map((f) => f.field);
  if (!opts.includes("Build_Status")) {
    fail("a criterion cannot see its own field in the list, so it reads as unset");
  }
  const own = fieldOptions(criteria, 0).find((f) => f.field === "Build_Status");
  if (own?.label !== "Build status") {
    fail(`a criterion's own field is offered as ${JSON.stringify(own?.label)} `
      + `rather than by its name`);
  }
  if (opts.length < 3) {
    fail(`a criterion is offered ${opts.length} field(s) — it cannot be changed `
      + `to anything`);
  }
  for (const f of ["Organisation_ID", "Site"]) {
    if (!opts.includes(f)) fail(`${f} is not offered as a criterion`);
  }

  /* A field another row uses is not offered twice: two criteria on one
     field can never both hold. */
  const two = [{ field: "Build_Status", value: "planned" }, { field: "", value: "" }];
  const second = fieldOptions(two, 1).map((f) => f.field);
  if (second.includes("Build_Status")) {
    fail("the same field is offered to two criteria, which is a rule that never matches");
  }
  if (!fieldOptions(two, 0).map((f) => f.field).includes("Build_Status")) {
    fail("a row stopped offering its own field because another row exists");
  }

  /* A rule saved with two criteria on one field — nothing stopped that
     before there was a screen for it — must still show both of them by
     name. This is the case the "or it is mine" clause exists for: the
     field is taken by the other row, and excluding it would leave the
     row reading as unset. */
  /* Build_Status, whose label is not its key: a field named "Size" would
     pass this whether it came through the list or through the fallback,
     and did. */
  const dup = [{ field: "Build_Status", value: "planned" },
    { field: "Build_Status", value: "existing" }];
  for (const i of [0, 1]) {
    const shown = fieldOptions(dup, i).find((f) => f.field === "Build_Status");
    if (!shown) fail(`criterion ${i + 1} of two on one field cannot see its own field`);
    else if (shown.label !== "Build status") {
      fail(`criterion ${i + 1} of two on one field is labelled ${shown.label} `
        + `rather than by its name`);
    }
  }

  /* A key typed in by hand, or saved before it was ever offered, is
     still the row's value and has to be selectable. */
  const odd = fieldOptions([{ field: "Anything_At_All", value: "y" }], 0);
  if (!odd.some((f) => f.field === "Anything_At_All")) {
    fail("a field not in the offered list cannot be shown, so the row reads as unset");
  }
}

// ─── 5b. Changing the field takes the value with it ───
{
  /* Or the rule saves "Site = planned": a value left over from the field
     it was typed for, matching nothing, with nothing to show it. */
  const was = [{ field: "Build_Status", value: "planned" }, { field: "Size", value: "185" }];
  const now = changeField(was, 0, "Site");
  if (now[0].field !== "Site") fail("the field did not change");
  if (now[0].value !== "") fail(`the old value survived the field change: `
    + `${JSON.stringify(now[0].value)}`);
  if (now[1].value !== "185") fail("changing one criterion cleared another's value");
  if (was[0].value !== "planned") fail("changeField edited the list it was given");

  /* "Something else" leaves the field to be typed and marks the row, so
     the pane can tell a row waiting for a typed key from a fresh one. */
  const other = changeField(was, 0, OTHER);
  if (other[0].field !== "" || other[0].other !== true) {
    fail("choosing to type a field name does not leave the row ready for one");
  }
  /* And picking a listed field again clears the mark, or the box never
     goes back to being a dropdown. */
  const back = changeField(other, 0, "Material");
  if (back[0].other !== false || back[0].field !== "Material") {
    fail("picking a listed field after typing one leaves the row in the typed state");
  }
  /* Whatever it holds, the mark never reaches the database. */
  const saved = fromCriteria({ Conditions: changeField(was, 0, OTHER) });
  for (const c of saved.Conditions ?? []) {
    if ("other" in c) fail("the typed-field mark was saved with the rule");
  }
}

// ─── 6. The values offered, where the set is known ───
{
  const ops = [{ Organisation_ID: 7, Name: "Electricity North West" }];
  const statuses = [{ key: "planned", label: "Planned" }, { key: "asbuilt", label: "As-Laid" }];
  const op = valuesFor("Organisation_ID", { operators: ops, statuses });
  if (!op || op[0][0] !== "7" || !op[0][1].includes("North West")) {
    fail("the Operator criterion does not offer the operators by name");
  }
  const site = valuesFor("Site", {});
  if (!site || site.length !== 2 || !site.some(([k]) => k === "Off-site")) {
    fail("the Site criterion does not offer On-site and Off-site");
  }
  const st = valuesFor("Build_Status", { operators: ops, statuses });
  if (!st || !st.some(([k]) => k === "planned")) {
    fail("the Build status criterion does not offer the statuses");
  }
  /* Values as text, because that is what the cascade compares and what
     the boolean attribute has to be matched as. */
  const off = valuesFor("Off_Site", {});
  if (!off || !off.some(([k]) => k === "true")) {
    fail("the hand-set off-site criterion does not offer true");
  }
  /* And anything else is free text, or the promise that any key works is
     broken at the value end instead of the field end. */
  if (valuesFor("Anything_At_All", {}) !== null) {
    fail("a field with no known values does not fall back to a typed value");
  }
  if (valuesFor("Size", {}) !== null) fail("cable size is not free text");
}

// ─── 7. Scope with no control left is kept, and said out loud ───
{
  /* The dangerous half of removing three dropdowns. A rule scoped to
     Layer_Key = plot narrows to the plot layer whether or not there is a
     box for it; saving it without the value would broaden it, and every
     plot on every drawing would change colour. */
  for (const row of LIVE) {
    const saved = fromCriteria(toCriteria(row));
    for (const k of PRESERVED) {
      if (String(row[k] ?? "") !== String(saved[k] ?? "")) {
        fail(`${row.Style_Name}: ${k} was dropped when the rule was saved`);
      }
    }
  }
  const said = preservedScope({ Layer_Key: "plot", Feature_Role: "plot" },
    { roleName: (r) => (r === "plot" ? "Plot seed" : r) });
  if (said.length !== 2) fail(`${said.length} things said about hidden scope, expected 2`);
  if (!said.join(" ").includes("plot")) fail("the hidden scope does not name the layer");
  if (!said.join(" ").includes("Plot seed")) {
    fail("the hidden scope names the role by its key rather than its name");
  }
  /* Nothing to say about a rule that has none, or the note appears on
     every rule and stops being read. */
  if (preservedScope({ Line_Type: "elec_main", Site: "Off-site" }).length !== 0) {
    fail("a rule with no hidden scope claims to have some");
  }
  if (preservedScope({}).length !== 0) fail("an empty rule claims hidden scope");
}

// ─── 8. What the pane is made of ───
{
  const src = readFileSync("src/features/admin/GisStylesAdmin.jsx", "utf8");
  /* Comments record what was removed and why, so match the JSX. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  /* The three controls the report asked for the removal of. Matched as
     an element with an id, which is what a control is, rather than by
     the word — the labels appear in the inspector, which keeps them
     because its job is to describe a feature that HAS a layer and a
     role, and which is a different pane. */
  for (const [id, what] of [
    ["gs-util", "Utility"], ["gs-layer", "Layer"], ["gs-role", "Point role"],
    ["gs-op", "Operator"], ["gs-site", "Site"],
  ]) {
    if (new RegExp(`id="${id}"`).test(code)) {
      fail(`the rule pane still has a ${what} dropdown (id="${id}")`);
    }
  }
  /* The inspector keeps its own, and they are not the same controls. */
  for (const id of ["gsi-util", "gsi-role", "gsi-site", "gsi-op"]) {
    if (!new RegExp(`id="${id}"`).test(code)) {
      fail(`the inspector lost its ${id} control — it describes a feature, `
        + `not a rule, and needs every field the cascade reads`);
    }
  }

  /* The field control is a select. An <input list> is what produced the
     bug, and the fix is not a different placeholder. */
  if (/list="gs-cond-fields"/.test(code)) {
    fail("the criterion's field is still an input with a datalist, which is "
      + "the reported bug");
  }
  if (!/fieldOptions\(criteria, i\)/.test(code)) {
    fail("the field options are not asked of the module that excludes the "
      + "ones already used");
  }
  if (!/changeField\(criteria, i, choice\)/.test(code)) {
    fail("the pane changes a criterion's field itself rather than through the "
      + "rule that clears the value with it");
  }
  /* Save goes through the one function that hoists the columns. */
  if (!/fromCriteria\(draft\)/.test(code)) {
    fail("save does not put the column criteria back in their columns");
  }
  if (!/toCriteria\(/.test(code)) fail("opening a rule does not build the criteria list");
  /* Nothing clears the preserved scope on its own. */
  if (!/PRESERVED/.test(code)) {
    fail("the pane never mentions the scope it no longer has controls for");
  }
  /* The datalists both panes use are rendered once, outside the pane
     that only exists while a rule is open. */
  const listAt = code.indexOf('<datalist id="gs-lts"');
  const paneAt = code.indexOf("gs-detail");
  if (listAt === -1 || (paneAt !== -1 && listAt > paneAt)) {
    fail("the line-type suggestions are inside the rule pane, so the "
      + "inspector only has them while a rule is open");
  }
}

// ─── 9. The module stays a mapping, not a second cascade ───
{
  /* Comments stripped first. This check's own first run reported
     styleCriteria.js "reaching for styleMatches" — which it does, in a
     comment, to say that the matching is unchanged. Four times this
     session, now five. */
  const src = readFileSync("src/features/admin/styleCriteria.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  /* It may read the field list from gisStyle — one list of attribute
     fields, in one place — but it must not score or match. A second
     opinion about who wins is two things to keep in step. */
  for (const fn of ["styleScore", "styleMatches", "resolveStyle", "cascadeOf", "WEIGHT"]) {
    if (new RegExp(`\\b${fn}\\b`).test(src)) {
      fail(`styleCriteria.js reaches for ${fn} — arranging a pane must not be `
        + `able to change which rule wins`);
    }
  }
  if (!COLUMN_CRITERIA.every((c) => c.field && c.label)) {
    fail("a column criterion has no label");
  }
  for (const c of CRITERIA_FIELDS) {
    if (!c.field || !c.label) fail(`a criterion field is missing its label: ${JSON.stringify(c)}`);
    if (isColumnField(c.field) !== !!c.column) {
      fail(`${c.field} disagrees with itself about being a column`);
    }
  }
  if (labelFor("Organisation_ID") !== "Operator") {
    fail("the Operator criterion is not called Operator");
  }
  if (labelFor("Wat_Is_Dit") !== "Wat_Is_Dit") {
    fail("an unknown field is not shown by its own name");
  }
  /* Site and the hand-set off-site flag are different facts and sit in
     one list, so they must not read the same. */
  if (labelFor("Site") === labelFor("Off_Site")) {
    fail("Site and Off_Site read identically in one list");
  }
  if (!/boundary/i.test(labelFor("Site"))) {
    fail("the Site criterion does not say where its value comes from");
  }
  if (OTHER === "" || isColumnField(OTHER)) fail("the escape hatch is not a distinct choice");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Rule criteria: one list, columns hoisted back on save, hidden scope kept, "
    + "and the field can be changed.");
process.exit(bad ? 1 : 0);
