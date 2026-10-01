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
import {
  GROUPS, GROUP_FIELD, VOLTAGE_FIELD, groupOf, groupByKey, groupKeyOfRule,
  derivedAttributes, voltageOf,
} from "../../lib/styleGroups.js";
import { SECTIONS, sectionOf, layerFromTypeKey } from "./styleTree.js";

export { SECTIONS };

/* The subject a rule is written about: the most specific thing it names.

   Role beats line type beats layer, the same order `itemOf` files them
   in — a rule naming a role AND a layer is about the role, and the layer
   narrows it. */
export function subjectKeyOf(row = {}) {
  if (row.Feature_Role) return `role:${row.Feature_Role}`;
  /* A rule about a group of line types, which is one feature to style
     even though the drawing holds it as four. Asked before Line_Type
     because a group rule carries no line type of its own, and before
     Layer_Key because it carries one of those and is not about the
     layer. */
  const grp = groupKeyOfRule(row);
  if (grp) return `grp:${grp}`;
  /* A rule naming ONE of a group's members — an older rule about
     `elec_hv` alone. It belongs on the same screen as the group, or it
     is a rule nobody can reach while it goes on styling the drawing.
     `buildSubjects` files it separately from the group's own rules,
     because it outranks them and must not read as one of them. */
  if (row.Line_Type) {
    const g = groupOf(row.Line_Type);
    return g ? `grp:${g.key}` : `lt:${row.Line_Type}`;
  }
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
    /* The group condition is what a group rule is ABOUT, not something
       narrowing it — the same job `Line_Type` does on an ordinary rule,
       and that has never counted. Without this every group rule
       including its default reads as a variation, and the feature shows
       a default that is "not set" with its own default listed beside it
       as a variation of nothing. */
    || (Array.isArray(row.Conditions)
      && row.Conditions.some((c) => c && c.field && c.field !== GROUP_FIELD));
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

  /* ── Groups, before the catalogue that would otherwise list their
     members one by one ──

     "Examine how electric cables are styled (elec_main and elec_hv) and
     make it simpler under one elec_cable_main feature."

     A group stands in for its member line types, so the list offers
     "Electric mains cable" once instead of four near-identical entries
     wanting four defaults. Added from the group table and not from the
     catalogue, so it is there to be styled before anybody has styled
     it — the same reason the catalogue is read at all.

     Only where the catalogue actually carries a member: a group whose
     line types a project does not have is not a feature of that
     drawing, and listing it would offer a style for something nobody
     can draw. */
  const haveType = new Set(lineTypes.map((t) => t?.Type_Key).filter(Boolean));
  const grouped = new Set();
  for (const g of GROUPS) {
    const present = g.members.filter((m) => haveType.has(m));
    if (present.length === 0) continue;
    for (const m of present) grouped.add(m);
    add({
      key: `grp:${g.key}`,
      kind: "group",
      label: g.label,
      detail: g.key,
      members: present,
      Layer_Key: g.layer ?? null,
      /* No Line_Type of its own: a group rule narrows by the group
         CONDITION, and a line type on it would pin the rule to one
         member and quietly undo the whole point. */
      Line_Type: null,
      Feature_Role: null,
      section: sectionOf({ Layer_Key: g.layer ?? null }, { lineTypes }),
    });
  }

  /* The catalogue, so a feature nobody has styled is still there to be
     styled. This is the whole point of reading the catalogue. */
  for (const t of lineTypes) {
    if (!t?.Type_Key) continue;
    /* A member is styled through its group and is not offered twice. */
    if (grouped.has(t.Type_Key)) continue;
    const layer = t.Layer_Key ?? layerFromTypeKey(t.Type_Key) ?? null;
    add({
      key: `lt:${t.Type_Key}`,
      kind: "lt",
      /* `Label` is the column. There is no `Type_Name` — that was a
         guess at a schema nobody had looked at, and a fallback to a
         column that does not exist is a line of code that says the
         opposite of the truth to whoever reads it next. */
      label: t.Label ?? titleCase(t.Type_Key),
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
        label: `Everything on the ${ly?.Label ?? titleCase(lk)} layer`,
        detail: lk, Layer_Key: lk, Line_Type: null, Feature_Role: null,
        section: sectionOf({ Layer_Key: lk }, { lineTypes }),
      }).rules.push(row);
      continue;
    }
    /* A rule about a group whose members this catalogue does not carry.
       The group was not added above for exactly that reason, and the
       rule is still styling whatever it matches, so it gets its subject
       here and is marked — the same treatment a retired line type's
       rule gets, and for the same reason. */
    if (key.startsWith("grp:")) {
      const gk = key.slice(4);
      const g = groupByKey(gk);
      add({
        key, kind: "group",
        label: g?.label ?? titleCase(gk),
        detail: gk,
        members: g?.members ?? [],
        unlisted: true,
        Layer_Key: row.Layer_Key ?? g?.layer ?? null,
        Line_Type: null,
        Feature_Role: null,
        section: sectionOf(row, { lineTypes }),
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
    /* ── Rules that name ONE member of a group ──

       Held apart from the group's own rules rather than mixed in, and
       this is not tidiness. A rule naming `elec_hv` scores Line_Type =
       8; a group default scores Layer_Key + the group condition = 5. So
       the older rule OUTRANKS the default somebody is about to write,
       and folding it in as "also applies, the default wins where they
       disagree" would be the screen stating the opposite of what the
       canvas does.

       Listed, openable and deletable, under a heading that says they
       outrank. That is the honest version, and it is the only one that
       lets somebody clear them out. */
    s.typeRules = s.kind === "group"
      ? s.rules.filter((r) => r.Line_Type != null && r.Line_Type !== "")
        .sort((a, b) => (a.GIS_Style_ID ?? 0) - (b.GIS_Style_ID ?? 0))
      : [];
    const own = s.typeRules.length
      ? s.rules.filter((r) => !s.typeRules.includes(r))
      : s.rules;
    s.rules = own.concat(s.typeRules);
    const plain = own.filter((r) => !isVariation(r));
    /* Where several rules name the subject and narrow nothing, the
       cascade applies them in id order and the LAST one wins field by
       field. So the last is the default, and the others are named rather
       than hidden: a rule this screen does not show is a rule nobody can
       edit, and it goes on styling the drawing regardless. */
    const ordered = plain.slice().sort(
      (a, b) => (a.GIS_Style_ID ?? 0) - (b.GIS_Style_ID ?? 0));
    s.dflt = ordered.length ? ordered[ordered.length - 1] : null;
    s.alsoDefault = ordered.slice(0, -1);
    /* From `own`, not from every rule: a member-type rule that narrows
       something is still a member-type rule, and listing it as one of
       the group's variations would put it in the one place that says
       "this is derived from the default above" — which it is not. */
    s.variations = own.filter(isVariation)
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
  /* A group has no line type of its own, so nothing would derive the
     group attribute and every group rule — including the one being
     inherited from — would drop out of the cascade. Described as one of
     its own members, which is what the drawing actually holds: the
     voltage comes from the criteria when one names it, and from the
     first member otherwise, so "what does this inherit" is answered
     about a real cable rather than about a category. */
  if (subject.kind === "group" && !subject.Line_Type) {
    const members = subject.members ?? [];
    const want = Attributes[VOLTAGE_FIELD];
    Attributes.Line_Type = (want
      ? members.find((m) => voltageOf(m) === want)
      : null) ?? members[0] ?? null;
    Object.assign(Attributes, derivedAttributes(Attributes.Line_Type) ?? {});
  }
  if (Site != null) Attributes.Site = Site;
  if (Supply_Type != null) Attributes.Supply_Type = Supply_Type;

  const described = {
    Attributes,
    Layer_Key: subject.Layer_Key ?? null,
    /* Read back from the Attributes, where a group put the member it
       stands for. The column has to carry it too, or a rule naming that
       member outright would drop out of the cascade — and those are
       exactly the rules that outrank a group's own, so leaving them out
       is the inheritance line understating what the drawing will do. */
    Line_Type: Attributes.Line_Type ?? subject.Line_Type ?? null,
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
