/* The features you can style, each with a default style and the
   variations derived from it.

   ── What was wrong ──

   "The Add Rule button should not be in the left hand pane as these are
   the Features that I want to apply the styles to. The left hand pane
   should not contain rules. In the styles pane, I need to be able to set
   a DEFAULT style and every other style variation should be derived from
   the default style."

   The left pane was built from the rules. It grouped them well enough —
   sections, items, variations folded in — but it could only ever name
   things somebody had already written a rule about, and it called them
   by their rule's name. So "Off site" and "Plots (layer default)" read
   as features, a line type nobody had styled was missing from the one
   screen that exists to style it, and "+ Add a rule" sat at the top of a
   list that was supposed to be things, not rules.

   ── The shape now ──

   Subject   a thing that can be drawn, from the CATALOGUE: a line type,
             a point role, a whole layer, or the drawing itself. It
             exists whether or not any rule mentions it.

   Default   the rule that names that subject and narrows no further.
             What the thing looks like when nothing else applies.

   Variation a rule that names the same subject AND some criterion —
             off site, planned, this operator, that size. It sets only
             what differs; everything else comes from the default.

   ── This reads the cascade rather than copying it ──

   styleTree.js is deliberately unable to reach gisStyle.js: it decides
   where a rule is DRAWN and must not be able to change which rule wins.
   This file is the opposite case. `inheritedStyle` answers "what would
   this look like without this variation", and the only true answer is
   the one the canvas would reach — so it asks the canvas's own
   resolver. A second opinion here would be a screen that says a
   variation inherits one thing while the drawing shows another. */

import { resolveStyle, FIELDS } from "../../lib/gisStyle.js";
import { SECTIONS, sectionOf, layerFromTypeKey } from "./styleTree.js";

export { SECTIONS };

/* The subject a rule is written about: the most specific thing it names.

   Role beats line type beats layer, the same order `itemOf` files them
   in — a rule naming a role AND a layer is about the role, and the layer
   narrows it. */
export function subjectKeyOf(row = {}) {
  if (row.Feature_Role) return `role:${row.Feature_Role}`;
  if (row.Line_Type) return `lt:${row.Line_Type}`;
  if (row.Layer_Key) return `layer:${row.Layer_Key}`;
  return "any";
}

/* Does this rule narrow its subject, or is it the subject's default?

   The same question `isVariant` asks, and asked again here rather than
   imported so that the two cannot be read as one: that one decides
   whether a rule folds under an item on a list, this one decides whether
   a rule is a thing's default style, and they would not necessarily stay
   the same question. Today they are. */
export function isVariation(row = {}) {
  return row.Site != null
    || row.Supply_Type != null
    || row.Organisation_ID != null
    || (Array.isArray(row.Conditions) && row.Conditions.some((c) => c && c.field));
}

const titleCase = (s) => String(s || "")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase())
  .trim();

/* ── Every role a feature can hold ──

   Passed in rather than listed here: the register lives in
   GisStylesAdmin beside the CHECK constraint it mirrors, and a second
   copy is the fault that register has already had twice — a role added
   to the drawing and not to a list, so the thing could be drawn and not
   styled. */
export function buildSubjects({
  lineTypes = [], layers = [], rows = [], roles = [], roleLabels = {},
} = {}) {
  const byKey = new Map();

  const add = (s) => {
    if (!byKey.has(s.key)) byKey.set(s.key, { ...s, rules: [] });
    return byKey.get(s.key);
  };

  /* The catalogue first, so a feature nobody has styled is still there
     to be styled. This is the whole point of reading the catalogue. */
  for (const t of lineTypes) {
    if (!t?.Type_Key) continue;
    const layer = t.Layer_Key ?? layerFromTypeKey(t.Type_Key) ?? null;
    add({
      key: `lt:${t.Type_Key}`,
      kind: "lt",
      label: t.Label ?? t.Type_Name ?? titleCase(t.Type_Key),
      detail: t.Type_Key,
      Layer_Key: layer,
      Line_Type: t.Type_Key,
      Feature_Role: null,
      section: sectionOf({ Line_Type: t.Type_Key, Layer_Key: layer }, { lineTypes }),
    });
  }

  for (const r of roles) {
    if (!r?.key) continue;
    add({
      key: `role:${r.key}`,
      kind: "role",
      label: r.label ?? roleLabels[r.key] ?? titleCase(r.key),
      detail: r.key,
      Layer_Key: null,
      Line_Type: null,
      Feature_Role: r.key,
      section: sectionOf({ Feature_Role: r.key }, { lineTypes }),
    });
  }

  /* Layers and the drawing itself are NOT offered from the catalogue.

     A rule about a whole layer is a fallback, and one about the whole
     drawing is the thing every feature is an exception to. Both are
     real, both are in use, and neither is a feature — so they appear
     only where one already exists, which keeps them editable without
     inviting more of them. "I want to minimise the number of items in
     the list." */
  for (const row of rows) {
    const key = subjectKeyOf(row);
    if (byKey.has(key)) { byKey.get(key).rules.push(row); continue; }

    if (key === "any") {
      add({
        key: "any", kind: "any", label: "Everything on the drawing",
        detail: "no feature named", Layer_Key: null, Line_Type: null,
        Feature_Role: null, section: "sitewide",
      }).rules.push(row);
      continue;
    }
    if (key.startsWith("layer:")) {
      const lk = key.slice(6);
      const ly = layers.find((l) => l.Layer_Key === lk);
      add({
        key, kind: "layer",
        label: `Everything on the ${ly?.Label ?? ly?.Layer_Name ?? titleCase(lk)} layer`,
        detail: lk, Layer_Key: lk, Line_Type: null, Feature_Role: null,
        section: sectionOf({ Layer_Key: lk }, { lineTypes }),
      }).rules.push(row);
      continue;
    }
    /* A rule about a line type or a role the catalogue does not carry.
       Retired, renamed, or a catalogue that could not be read — either
       way the rule is still styling the drawing and has to be reachable.
       Named from the rule, and marked. */
    const isRole = key.startsWith("role:");
    const id = key.slice(isRole ? 5 : 3);
    add({
      key, kind: isRole ? "role" : "lt",
      label: row.Style_Name || titleCase(id),
      detail: id,
      unlisted: true,
      Layer_Key: row.Layer_Key ?? null,
      Line_Type: isRole ? null : id,
      Feature_Role: isRole ? id : null,
      section: sectionOf(row, { lineTypes }),
    }).rules.push(row);
  }

  /* Sort each subject's rules into the default and what narrows it. */
  for (const s of byKey.values()) {
    const plain = s.rules.filter((r) => !isVariation(r));
    /* Where several rules name the subject and narrow nothing, the
       cascade applies them in id order and the LAST one wins field by
       field. So the last is the default, and the others are named rather
       than hidden: a rule this screen does not show is a rule nobody can
       edit, and it goes on styling the drawing regardless. */
    const ordered = plain.slice().sort(
      (a, b) => (a.GIS_Style_ID ?? 0) - (b.GIS_Style_ID ?? 0));
    s.dflt = ordered.length ? ordered[ordered.length - 1] : null;
    s.alsoDefault = ordered.slice(0, -1);
    s.variations = s.rules.filter(isVariation)
      .sort((a, b) => (a.GIS_Style_ID ?? 0) - (b.GIS_Style_ID ?? 0));
  }

  return [...byKey.values()];
}

/* The subjects arranged into the sections the screen already uses, with
   the site-wide group first because it is what everything else is an
   exception to. */
export function sectionsOf(subjects = [], { layerLabels = {} } = {}) {
  const bySection = new Map();
  for (const s of subjects) {
    const k = s.section ?? "site";
    if (!bySection.has(k)) bySection.set(k, []);
    bySection.get(k).push(s);
  }

  const known = SECTIONS.map((s) => s.key);
  const extra = [...bySection.keys()]
    .filter((k) => k !== "sitewide" && !known.includes(k)).sort();
  const order = ["sitewide", ...known, ...extra];

  const labelFor = (k) => (k === "sitewide" ? "Site-wide"
    : SECTIONS.find((s) => s.key === k)?.label ?? layerLabels[k] ?? titleCase(k));

  return order
    .filter((k) => bySection.has(k))
    .map((k) => ({
      key: k,
      label: labelFor(k),
      subjects: bySection.get(k).slice().sort((a, b) => {
        /* A layer's fallback sorts last within its section: it is the
           thing the features above it are exceptions to. */
        const fallback = (x) => (x.kind === "layer" || x.kind === "any" ? 1 : 0);
        return fallback(a) - fallback(b) || a.label.localeCompare(b.label);
      }),
    }));
}

/* Every rule reaches a subject. A rule this screen cannot show is a rule
   nobody can edit, and it goes on styling the drawing regardless — which
   is the fault the old tree's `countRows` existed to prevent and this
   one inherits. */
export function countRules(subjects = []) {
  return subjects.reduce((n, s) => n + s.rules.length, 0);
}

/* ── What a variation is derived from ──

   Not "the default rule", which would be a guess: a variation on an
   electric main also sits under whatever the electric LAYER says, and
   under anything site-wide. The true answer is what the canvas would
   draw for this thing if this variation did not exist — so that is what
   is asked, of the canvas's own resolver, over every rule but this one.

   `criteria` is the variation's own scope, because what it inherits
   depends on it: an off-site variation inherits from the off-site rules
   beneath it, not from the on-site ones. */
export function inheritedStyle(subject, {
  rows = [], excludeId = null, criteria = [], organisationId = null,
} = {}) {
  if (!subject) return {};

  const Attributes = {};
  let Site = null;
  let Supply_Type = null;
  let org = organisationId;

  for (const c of criteria) {
    if (!c || !c.field) continue;
    if (c.field === "Site") Site = c.value ?? null;
    else if (c.field === "Supply_Type") Supply_Type = c.value ?? null;
    else if (c.field === "Organisation_ID") org = c.value ?? null;
    else Attributes[c.field] = c.value;
  }

  /* The thing as the canvas would describe it. Line_Type lives in the
     Attributes on a real feature and in its own field on the subject —
     both are set, because `styleMatches` reads the field and a condition
     naming Line_Type would read the attribute. */
  if (subject.Line_Type) Attributes.Line_Type = subject.Line_Type;
  if (Site != null) Attributes.Site = Site;
  if (Supply_Type != null) Attributes.Supply_Type = Supply_Type;

  const described = {
    Attributes,
    Layer_Key: subject.Layer_Key ?? null,
    Line_Type: subject.Line_Type ?? null,
    Feature_Role: subject.Feature_Role ?? null,
    Site,
    Supply_Type,
    Utility_ID: subject.Utility_ID ?? null,
  };

  /* Only the rule being edited is taken out. Whether the rest APPLY is
     `styleMatches`'s question, switched-off ones included, and asking it
     again here would be the second opinion this file exists not to
     have — one that could drift and say a variation inherits from a rule
     the canvas ignores. */
  const others = rows.filter((r) =>
    r && (excludeId == null || String(r.GIS_Style_ID) !== String(excludeId)));

  return resolveStyle(described, others,
    org == null || org === "" ? {} : { organisationId: org });
}

/* Which of a rule's appearance fields it sets itself, and which it takes
   from underneath. Null and "" both mean "not set" — the cascade tests
   for null, and the admin's empty controls read as "". */
export function overriddenFields(row = {}) {
  return FIELDS.filter((f) => row[f] != null && row[f] !== "");
}

export { FIELDS };
