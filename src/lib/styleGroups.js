/* Line types that are one thing to style.

   ── What was wrong ──

   "The styling of electric cables is just not working as expected. I am
   trying to set the style for a mains cable but it is difficult and
   confusing. A mains cable can be HV or LV; Planned, Existing
   (incumbent), To be Removed or Live; On Site or Off Site."

   All true, and the drawing holds it as FOUR line types:

     elec_main            our LV main          planned/aslaid/live
     elec_hv              our HV cable         planned/aslaid/live
     elec_main_existing   their LV main        existing/remove
     elec_hv_existing     their HV cable       existing/remove

   So the styles screen listed four features where somebody has one
   thing in mind, each wanting its own default, and two different stage
   vocabularies between them. Nothing was broken; it was four answers to
   one question.

   ── What this is ──

   A group is a NAME FOR SEVERAL LINE TYPES, used by the styles screen
   and by the cascade, and by nothing else. The drawing still stores
   `elec_hv` on an HV cable; the circuit builder, the joints, the bill
   and the DXF export all go on reading exactly what they read before.
   Only the question "what does this look like" is asked of the group.

   ── How it reaches the cascade ──

   Not as a new column, and not as a new weight. `styleMatches` already
   tests a rule's conditions against what the feature carries, so a
   group is simply an attribute the feature is DERIVED to carry:

     Line_Type_Group   elec_cable_main, on all four
     Cable_Voltage     hv or lv

   and a rule about the group is a rule on the electric layer with a
   `Line_Type_Group` condition. That is one line in `subjectOf` and no
   change at all to the matcher, the scores or the schema.

   The scoring falls out right. A group rule is Layer_Key (1) plus one
   condition (4) = 5; a rule naming `elec_hv` outright is Line_Type = 8
   and still beats it, which is what "most specific wins" has always
   meant. A group variation narrowed by voltage, stage and site is 1 +
   12 = 13 and beats both, which is also right: it is the more specific
   statement.

   ── What is NOT here ──

   Ownership. It looks like it belongs — ours against the incumbent's —
   but `Build_Status` already says it: only an `_existing` type can be
   `existing` or `remove`, and only ours can be `planned`, `aslaid` or
   `live`. A second criterion meaning the same thing is a second way to
   write a rule that contradicts the first. So the three axes the report
   names are the three on offer: voltage, stage, site. */

export const ELEC_CABLE_MAIN = "elec_cable_main";

/* The suffix that marks a line type as the incumbent's.

   The same naming rule `isExistingLineType` reads in buildStatus.js,
   written out again rather than imported: this file is under `lib/` and
   is reached by the cascade, which must not pull the drawing's code in
   behind it. Two readers of one convention is a thing that drifts, so
   `checkcablegroup.mjs` asserts the two agree and fails if either moves. */
const EXISTING_SUFFIX = "_existing";

export const GROUPS = [
  {
    key: ELEC_CABLE_MAIN,
    label: "Electric mains cable",
    /* What the rule is scoped to besides the group condition. The layer
       rather than nothing, so the rule says in its own columns roughly
       where it applies and does not read as a rule about the whole
       drawing that happens to carry a condition. */
    layer: "electric",
    members: ["elec_main", "elec_hv", "elec_main_existing", "elec_hv_existing"],
  },
];

const BY_MEMBER = new Map();
for (const g of GROUPS) for (const m of g.members) BY_MEMBER.set(m, g);

/* The group a line type belongs to, or null. */
export const groupOf = (lineType) =>
  BY_MEMBER.get(String(lineType ?? "")) ?? null;

export const groupByKey = (key) =>
  GROUPS.find((g) => g.key === String(key ?? "")) ?? null;

export const isGroupKey = (key) => groupByKey(key) != null;

/* ── HV or LV, from the spelling of the key ──

   By the key, because that is the only thing that says it: an HV cable
   is `elec_hv` or `elec_hv_existing` and there is no attribute on the
   feature to read.

   Anchored, and whole-word. A bare `/hv/` would read a type called
   `elec_hvac` — or anything else with those two letters in it — as high
   voltage, and style it as an 11 kV cable on a drawing somebody then
   builds from.

   Split from `voltageOf` so that claim can be tested. The rule is about
   how a key is spelt and holds for keys that are in no group at all;
   folded into the membership check it could only ever be exercised on
   the four members, where every spelling happens to be fine and a
   loosened test would pass unnoticed. It did: the first version of this
   had no anchor-specific assertion and the mutation walked through. */
export function voltageOfKey(key) {
  return /^elec_hv(_|$)/.test(String(key ?? "")) ? "hv" : "lv";
}

/* HV or LV for a line type that is actually in a group, and null
   otherwise — nothing outside a group has a voltage to report. */
export function voltageOf(lineType) {
  const key = String(lineType ?? "");
  if (!groupOf(key)) return null;
  return voltageOfKey(key);
}

/* Whose it is. Not offered as a criterion — `Build_Status` says the
   same thing — but derived so a check can assert that, rather than the
   claim sitting only in a comment. */
export function ownershipOf(lineType) {
  const key = String(lineType ?? "");
  if (!groupOf(key)) return null;
  return key.endsWith(EXISTING_SUFFIX) ? "incumbent" : "ours";
}

export const VOLTAGES = [["hv", "HV"], ["lv", "LV"]];

/* The derived keys, named so they cannot collide with anything a
   drawing already stores.

   `Cable_Voltage` and not `Voltage`: `Voltage` is already a condition
   field and already means something else — the cable's rating, 11 kV
   and the like. A derived attribute that shadowed it would silently
   rewrite every rule anybody had written about a rating. */
export const GROUP_FIELD = "Line_Type_Group";
export const VOLTAGE_FIELD = "Cable_Voltage";

/* What a feature carrying this line type is derived to also carry.

   Empty for anything outside a group, so nothing on the drawing gains
   an attribute it has no business with. */
export function derivedAttributes(lineType) {
  const g = groupOf(lineType);
  if (!g) return null;
  return { [GROUP_FIELD]: g.key, [VOLTAGE_FIELD]: voltageOf(lineType) };
}

/* The scope columns and conditions a rule about this group is written
   with. One place, so the pane that saves a rule and the check that
   reads one cannot disagree about what a group rule looks like. */
export function groupScope(key) {
  const g = groupByKey(key);
  if (!g) return null;
  return {
    Layer_Key: g.layer ?? null,
    condition: { field: GROUP_FIELD, value: g.key },
  };
}

/* Whether a rule is about a group — scoped by the group condition and
   not by a line type of its own. */
export function groupKeyOfRule(row = {}) {
  if (row.Line_Type != null && row.Line_Type !== "") return null;
  const conds = Array.isArray(row.Conditions) ? row.Conditions : [];
  const c = conds.find((x) => x && x.field === GROUP_FIELD);
  return c && isGroupKey(c.value) ? String(c.value) : null;
}
