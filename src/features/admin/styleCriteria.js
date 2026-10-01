/* A rule's scope as ONE list of criteria.

   ── What was wrong ──

   The rule pane had seven dropdowns above the conditions builder, and
   the report was about all of them at once: "the Operator dropdown box
   should be a Rule Criteria… the Site dropdown box should be a
   criteria… I do not need the Utility dropdown box as I do not
   understand how this is having any bearing on the style", and the same
   for Layer and Point Role.

   They were all doing the same job — narrowing the rule — and it was
   only the storage that made three of them look like something else.
   Operator, Site, line type, role, layer, utility and supply type are
   COLUMNS on GIS_Style, each with its own weight in the cascade;
   conditions are a jsonb list added in 0240. A person reading the screen
   has no reason to know that and every reason to expect one list.

   ── What this does, and what it deliberately does not ──

   It maps a rule to a list of {field, value} and back. Nothing else:
   which rule WINS is still scored in gisStyle.js from the columns, and a
   criterion on Operator still writes `Organisation_ID`, still scores 32,
   and still matches through the same `styleMatches`. No drawing changes
   because the pane was rearranged — the round trip is the first thing
   the check tests, on rules taken from the live table.

   The one thing that must not go wrong: an Operator or Site criterion
   left sitting in `Conditions`. Conditions are matched against
   `GIS_Feature.Attributes`, which carries no `Organisation_ID`, so it
   would silently match nothing — the rule would look right, save
   cleanly and never apply. `fromCriteria` is the only thing that writes
   a rule back, and hoisting them out is its whole job. */

import { CONDITION_FIELDS } from "../../lib/gisStyle.js";
import { GROUP_FIELD, VOLTAGE_FIELD, VOLTAGES } from "../../lib/styleGroups.js";

/* The criteria that are columns, and so are matched by `styleMatches`
   against something other than the feature's Attributes.

   Only the two that were asked for. Line type and supply type stay as
   their own boxes — the line type is what the left-hand list is FOR, and
   neither was in the report. Layer, utility and role are not offered at
   all any more; see PRESERVED below. */
export const COLUMN_CRITERIA = [
  {
    field: "Organisation_ID",
    label: "Operator",
    /* Which standard is in force on the project, not a fact about the
       feature — it comes from the project, which is why it was never an
       attribute and cannot become a condition. */
    hint: "the standard in force on the project",
  },
  {
    field: "Supply_Type",
    label: "Supply type",
    /* What kind of supply a point is, where the role does not say it. A
       non-residential supply IS a meter to the network — it attaches,
       takes a service and counts in the bill — so it keeps the meter
       role, and this is the only thing that tells it apart. It had its
       own box under "Applies to" until the feature list made that box a
       way of pointing a rule at a different feature. */
    hint: "where the role does not say it",
  },
  {
    field: "Site",
    /* Named for where it comes from, because the other off-site fact is
       one line below it in the same list. `Site` is worked out from the
       boundary polygons when a line is drawn; `Off_Site` is a boolean
       somebody sets by hand for a commercial arrangement. Both are true
       about their own attribute and they do not have to agree —
       buildStatus.js says so at length, having been caught by it. */
    label: "Site (from the boundary)",
    hint: "On-site or Off-site, as the boundary put it",
  },
];

const COLUMN_FIELDS = new Set(COLUMN_CRITERIA.map((c) => c.field));
export const isColumnField = (field) => COLUMN_FIELDS.has(String(field ?? ""));

/* Scope columns that are no longer offered on the screen but are still
   read by the cascade, and still set on rules 0051 seeded.

   Not cleared, not hidden: a rule scoped to `Layer_Key = plot` narrows
   to the plot layer whether or not there is a box for it, and dropping
   the value on save because the control went away would broaden that
   rule and change what is drawn. The pane states them in words and
   offers to clear them; nothing clears them on its own. */
export const PRESERVED = ["Layer_Key", "Feature_Role", "Utility_ID"];

/* Every field a criterion can name.

   The attribute half comes from gisStyle.js rather than being listed
   again here — two lists of the same thing is how one of them goes
   stale. It stays a convenience and not a fence: `OTHER` below is how
   any other key a feature carries gets typed in, which is the promise
   0240 was built on and the fault the role register has had twice. */
export const OTHER = "__other";

export const CRITERIA_FIELDS = [
  ...COLUMN_CRITERIA.map((c) => ({ ...c, column: true })),
  ...CONDITION_FIELDS.map((c) => ({ ...c, column: false })),
];

/* ── The catalogue, as this FEATURE names its fields ──

   Reported: "it is not showing me the exact fields that exist in the
   Electric Main editor. For example, it is not showing the 'Status'
   field as it is showing 'Build Status'."

   The status field is called "Status" on a main and on a service, and
   "Build status" on everything else, and `statusFieldFor` in
   buildStatus.js is what knows that — beside the function that decides
   which stages the same feature can be at, because it is the same
   question. Passed in rather than imported so this file stays testable
   without the drawing code behind it. */
/* ── A group's own axis ──

   "A mains cable can be HV or LV; Planned, Existing (incumbent), To be
   Removed or Live; On Site or Off Site."

   Stage is `Build_Status` and site is the `Site` column, both already
   here. Voltage is the one thing neither of them can say, because the
   drawing says it with the line type — `elec_hv` against `elec_main` —
   and a group rule deliberately names no line type.

   Offered only on a group, and only on groups that have it: a
   criterion on the list for a feature it cannot be true of is a rule
   somebody can write that matches nothing. */
const VOLTAGE_CRITERION = {
  field: VOLTAGE_FIELD,
  label: "Voltage",
  hint: "HV or LV, from the cable type",
};

/* Which criteria this FEATURE can be narrowed by.

   `group` is the group key when a group is open and null otherwise.
   Passed in rather than worked out here, for the reason the whole file
   is arranged this way: this module stays testable without the drawing
   code or the subject tree behind it. */
export function criteriaFieldsFor({ statusField = null, group = null } = {}) {
  const base = group ? [...CRITERIA_FIELDS, VOLTAGE_CRITERION] : CRITERIA_FIELDS;
  /* The group's own condition is scope, not a criterion. It is written
     by the save path and it is not somebody's to choose, remove or
     point at another value — doing any of those turns the rule into one
     about a different feature, or about nothing. */
  const offered = base.filter((c) => c.field !== GROUP_FIELD);
  if (!statusField) return offered;
  return offered.map((c) => (c.field === statusField.key
    ? { ...c, label: statusField.label } : c));
}

export const labelFor = (field, ctx = {}) =>
  criteriaFieldsFor(ctx).find((c) => c.field === field)?.label ?? field;

/* The values a field can take, or null when it is anything you can type.

   The lists come in from the caller: this module is arranged to be
   testable without the canvas, and reaching into buildStatus.js for the
   statuses would drag the drawing code in behind it. */
export function valuesFor(field, { operators = [], statusField = null } = {}) {
  if (field === VOLTAGE_FIELD) return VOLTAGES;
  /* The stages THIS feature can be at, not all of them.

     A main's are planned / aslaid / live; the general list's are
     existing / planned / remove / asbuilt. `aslaid` and `asbuilt` are
     different keys for the same words and both are in use, so a
     criterion built from the general list and applied to a main matched
     nothing at all — for ever, and silently. */
  const statuses = statusField?.options ?? [];
  if (field === "Organisation_ID") {
    return operators.map((o) => [String(o.Organisation_ID), o.Name]);
  }
  if (field === "Site") {
    return [["On-site", "On site"], ["Off-site", "Off site"]];
  }
  if (field === "Supply_Type") {
    /* The only value the application writes (0194). A second one wants
       adding here and to whatever writes it, in the same change. */
    return [["nrs", "Non-residential supply"]];
  }
  if (statusField && field === statusField.key) {
    return statuses.length ? statuses.map((s) => [s.key, s.label]) : null;
  }
  /* The hand-set commercial flag. Written as a JSON boolean, compared as
     text by the cascade, so the values offered are the text of it. */
  if (field === "Off_Site") {
    return [["true", "Off site"], ["false", "On site"]];
  }
  return null;
}

/* ── Opening a rule ──

   The columns move INTO the list and are blanked on the draft, so that
   while a rule is open there is exactly one place its scope lives. Two
   places would be two things to keep in step, and the one that lost
   would lose silently: a criterion removed from the list while the
   column kept its value is a rule that goes on narrowing invisibly. */
export function toCriteria(row = {}) {
  const criteria = [];
  for (const c of COLUMN_CRITERIA) {
    const v = row[c.field];
    if (v !== "" && v != null) criteria.push({ field: c.field, value: v });
  }
  for (const c of Array.isArray(row.Conditions) ? row.Conditions : []) {
    if (!c) continue;
    /* The group condition is what the rule is ABOUT. It is kept out of
       the editable list the same way `Line_Type` is, and put back by
       `fromCriteria` — a row somebody could point at another value is a
       row that can silently restyle a different feature. */
    if (c.field === GROUP_FIELD) continue;
    criteria.push({ field: String(c.field ?? ""), value: c.value ?? "" });
  }
  const draft = { ...row, Conditions: criteria };
  for (const c of COLUMN_CRITERIA) draft[c.field] = "";
  return draft;
}

/* ── Saving it ──

   The columns come back out, the rest stay conditions, and a row with no
   field is dropped: somebody pressed Add and changed their mind, and the
   database refuses a condition naming nothing (0240) — correctly, since
   it would be scored for and never match.

   A column named twice keeps the last one. Not reachable from the
   screen, which does not offer a field another row already uses, but
   defined rather than left to whichever way the loop happens to run. */
export function fromCriteria(draft = {}, { group = null } = {}) {
  const out = { ...draft };
  for (const c of COLUMN_CRITERIA) out[c.field] = "";

  const conds = [];
  /* First, so a rule's own scope reads first wherever the row is
     printed. `toCriteria` took it out of the editable list; this is the
     only thing that puts it back, and a group rule saved without it is
     a rule about the whole electric layer — every service included. */
  if (group) conds.push({ field: GROUP_FIELD, value: String(group) });
  for (const r of Array.isArray(draft.Conditions) ? draft.Conditions : []) {
    if (!r) continue;
    const field = String(r.field ?? "").trim();
    if (field === "") continue;
    /* Never twice, however it got into the list. */
    if (field === GROUP_FIELD) continue;
    if (isColumnField(field)) {
      out[field] = r.value ?? "";
      continue;
    }
    /* Only the two keys. The row carries an `other` flag while it is
       being edited and that is nobody's business but the screen's. */
    conds.push({ field, value: String(r.value ?? "").trim() });
  }
  out.Conditions = conds.length ? conds : null;
  return out;
}

/* Changing which field a criterion names.

   The value goes with it. A value that belonged to another field is not
   a value for this one, and keeping it saves rules like "Site = planned"
   — which is a rule that matches nothing, written by somebody who
   changed their mind about the field and did not notice the box beside
   it still held the old answer.

   Here rather than in the pane because it is a rule about the data, and
   because a rule about the data written inside a component is a rule no
   check can reach without a browser. */
export function changeField(criteria = [], i = 0, choice = "") {
  const patch = choice === OTHER
    /* No field yet; the pane shows a box to type a key into. The flag is
       the screen's business and `fromCriteria` drops it. */
    ? { field: "", value: "", other: true }
    : { field: choice, value: "", other: false };
  return criteria.map((c, j) => (j === i ? { ...c, ...patch } : c));
}

/* Which fields row `i` may choose: everything, less the fields the OTHER
   rows already use.

   Its own field stays in its list — that is the whole of the bug being
   fixed here ("when I pick one of the fields from the dropdown box, I
   cannot change my selection"), and a list that excluded the current
   value would show an empty box for a row that has one.

   Two criteria on one field cannot both hold, so offering the same field
   twice offers a rule that never matches. */
export function fieldOptions(criteria = [], i = 0, ctx = {}) {
  const fields = criteriaFieldsFor(ctx);
  const taken = new Set(
    criteria
      .map((c, j) => (j === i ? null : String(c?.field ?? "")))
      .filter((f) => f),
  );
  const mine = String(criteria[i]?.field ?? "");
  const out = fields.filter((c) => c.field === mine || !taken.has(c.field));
  /* A field typed in by hand, or one saved before it was offered, is
     still the row's value and has to be selectable. */
  if (mine && !out.some((c) => c.field === mine)) {
    out.push({ field: mine, label: mine, column: isColumnField(mine) });
  }
  return out;
}

/* What a rule is scoped by that the screen no longer offers, in words.

   Empty for most rules. Said out loud for the ones 0051 seeded, because
   "this rule only applies on the plot layer" is a fact about what the
   rule does and hiding it is how the screen starts lying. */
export function preservedScope(row = {}, { layerName, roleName, utilityName } = {}) {
  const say = {
    Layer_Key: (v) => `layer ${layerName ? layerName(v) : v}`,
    Feature_Role: (v) => `role ${roleName ? roleName(v) : v}`,
    Utility_ID: (v) => `utility ${utilityName ? utilityName(v) : v}`,
  };
  return PRESERVED
    .filter((k) => row[k] !== "" && row[k] != null)
    .map((k) => say[k](row[k]));
}
