/* Changing every feature of one kind at once.

   Reclassifying a hundred service trenches from unmade to carriageway
   means opening a hundred editors. The change is one decision; making it
   a hundred times is how a drawing ends up with ninety-seven of them
   changed.

   ── What "the same kind" means ──

   The class of the thing selected: its line type where it has one, its
   role where it does not, and always within its own layer. An electric
   service cable and a gas service pipe are different kinds even though
   both are "services" — they are billed differently, dug differently and
   sized differently, and a bulk edit that treated them as one would be a
   trap.

   ── Only what is set is written ──

   A blank field means leave it alone, not clear it. Bulk editing is
   mostly used to set one thing across many features that differ in
   others, and a form that wrote every field would wipe the cable size
   off a hundred cables because the surface was the only thing being
   changed.

   Nothing here writes: it returns the features and the patch, and the
   caller applies them. */

/* The class of a feature, as a key and as something readable. */
export function classOf(feature, { lineTypes = [], layers = [] } = {}) {
  if (!feature) return null;
  const layer = feature.Layer_Key ?? null;
  const layerLabel = layers.find((l) => l.Layer_Key === layer)?.Label ?? layer ?? "";

  const lt = feature.Attributes?.Line_Type ?? null;
  if (lt) {
    const label = lineTypes.find((t) => t.Type_Key === lt)?.Label ?? lt;
    return { key: `${layer}\u0000lt:${lt}`, layer, lineType: lt, role: null, label };
  }

  const role = feature.Feature_Role ?? null;
  if (role) {
    const plural = {
      meter: "meters", joint: "joints", spannode: "span nodes", plot: "plot seeds",
      poc: "points of connection", substation: "substations", governor: "gas governors",
      linkbox: "link boxes", column: "lighting columns",
    };
    return {
      key: `${layer}\u0000role:${role}`,
      layer, lineType: null, role,
      label: `${layerLabel} ${plural[role] ?? `${role}s`}`.trim(),
    };
  }

  return { key: `${layer}\u0000any`, layer, lineType: null, role: null,
    label: layerLabel || "these" };
}

/* Everything of that class on the drawing. */
export function membersOf(features = [], cls) {
  if (!cls) return [];
  return features.filter((f) => {
    if (String(f.Layer_Key ?? "") !== String(cls.layer ?? "")) return false;
    if (cls.lineType) return f.Attributes?.Line_Type === cls.lineType;
    if (cls.role) return f.Feature_Role === cls.role;
    return !f.Attributes?.Line_Type && !f.Feature_Role;
  });
}

/* Which fields make sense for this class.

   Offered by what the class is rather than by what happens to be filled
   in: a service trench with no surface set still needs a surface field,
   and a meter must never be offered one. */
export function fieldsFor(cls, { lineTypes = [] } = {}) {
  if (!cls) return [];
  const out = [];

  /* Build status, on everything.

     The one field every class has, and so the only one a mixed
     selection can offer — which is exactly the case it is wanted for:
     "set the service trenches to As Laid", "set the LV cables and the
     service joints to Live". It was not offered here at all, so the
     commonest bulk change on a drawing was the one thing this could
     not do.

     Which statuses are valid is per feature, not per class: a main runs
     through more stages than a service. So the control offers the union
     for the classes chosen and planBulkEditMany refuses, per feature,
     any that cannot hold the one picked. Deciding it here would mean
     either offering stages some features cannot take, or hiding stages
     most of them can. */
  out.push({ key: "Build_Status", label: "Build status", kind: "status" });

  const isLine = !!cls.lineType;
  const t = lineTypes.find((x) => x.Type_Key === cls.lineType);
  const isTrench = isLine && (t?.Is_Trench ?? String(cls.lineType).includes("trench"));

  if (isLine) {
    out.push({ key: "Line_Type", label: "Line type", kind: "lineType",
      note: "Reclassifies every one of them" });
  }
  if (isTrench) {
    out.push({ key: "Surface_Type", label: "Surface", kind: "surface" });
    out.push({ key: "Site", label: "Site", kind: "choice",
      options: ["On-site", "Off-site"],
      note: "Normally worked out from the boundary" });
  }
  if (isLine && cls.layer === "electric") {
    out.push({ key: "VD_Cable_Size_ID", label: "Cable", kind: "cable",
      usage: cls.lineType === "elec_service" ? "service" : "mains" });
  }
  /* Gas and water carry a size as free text — there is no catalogue for
     them the way there is for electric cable. Not on a trench: a trench
     is a dig, and its size is its surface and its depth, neither of
     which is this field. */
  if (isLine && !isTrench && cls.layer !== "electric") {
    out.push({ key: "Size", label: "Size", kind: "text" });
  }
  return out;
}

/* ── Editing several classes at once ──

   "Set every service trench to As Laid" is one decision. So is "set the
   LV cables and the service joints to Live". Neither is reachable by
   picking a feature and editing its class: the first needs no feature
   selected at all, and the second spans two classes that share nothing
   but the field being changed.

   The classes are named rather than selected, the same way bulk delete
   names what it removes. Selecting a hundred trenches on the canvas to
   change one field on all of them is the work the feature exists to
   avoid.

   ── Only the fields they share ──

   Offering a field that applies to some of the chosen classes and not
   others is a form that writes a cable size onto a joint. The
   intersection is the honest answer: what can be said about ALL of
   them.

   Keyed on the field key, and a field is only kept where every class
   agrees on its kind — a "cable" field for mains and a "cable" field
   for services are the same key with different catalogues behind them,
   and merging them would offer service cables for a mains run. Where
   they differ, the field is dropped rather than guessed at. */
export function fieldsForMany(classes = [], opts = {}) {
  const lists = classes.map((c) => fieldsFor(c, opts));
  if (!lists.length) return [];

  const [first, ...rest] = lists;
  return first.filter((f) => rest.every((other) => {
    const match = other.find((o) => o.key === f.key);
    if (!match) return false;
    /* Same field, same meaning. kind decides the control and usage
       decides which catalogue it offers; either differing makes them
       two fields that happen to share a name. */
    return match.kind === f.kind && String(match.usage ?? "") === String(f.usage ?? "");
  }));
}

/* Every feature in any of the named classes, deduplicated.

   Deduplicated because the classes can overlap — a caller offering both
   "all electric lines" and "all service cables" is not asking for the
   services twice, and a feature written twice in one save is a race
   against itself. */
export function membersOfMany(features = [], classes = []) {
  const seen = new Set();
  const out = [];
  for (const cls of classes) {
    for (const f of membersOf(features, cls)) {
      if (seen.has(f.Feature_ID)) continue;
      seen.add(f.Feature_ID);
      out.push(f);
    }
  }
  return out;
}

/* The patch, from whatever was filled in.

   Values left blank are dropped rather than written as null: blank means
   "not changing this", and the difference matters when a field is being
   left alone across a hundred features that each have their own value.

   A field can still be cleared deliberately — the caller passes the
   CLEAR marker, which becomes a null in the patch. Without that there
   would be no way to unset a surface once it had been set. */
export const CLEAR = "\u0000clear";

export function buildPatch(draft = {}) {
  const patch = {};
  for (const [k, v] of Object.entries(draft)) {
    if (v === "" || v == null) continue;
    patch[k] = v === CLEAR ? null : v;
  }
  return patch;
}

/* The same, across several classes.

   Kept beside planBulkEdit rather than replacing it, because the
   single-class path is entered from a selected feature and knows its
   class already — routing it through a list of one would be ceremony. */
export function planBulkEditMany(features = [], classes = [], draft = {}, opts = {}) {
  const patch = buildPatch(draft);
  const members = membersOfMany(features, classes);
  if (!Object.keys(patch).length) {
    return { rows: [], members, patch, reason: "Nothing to change." };
  }
  if (!members.length) {
    return { rows: [], members, patch, reason: "Nothing of those kinds on this drawing." };
  }

  /* A status has to be one this feature can hold.

     Statuses are not universal: a main runs through more stages than a
     service, and a point through fewer than either. Writing "energised"
     onto a joint that has no such stage would put a value on the
     drawing that nothing else in the app can read back.

     Refused per feature rather than for the whole edit, so setting a
     hundred trenches As Laid is not blocked by one joint that cannot
     be. What was skipped is returned, and the caller says so. */
  const { lineTypes = [], statusesFor: allowed = null } = opts;
  const skipped = [];
  const wanted = patch.Build_Status;

  const rows = [];
  for (const f of members) {
    if (wanted != null && allowed) {
      const ok = allowed(f, lineTypes).some((s) => String(s.key ?? s) === String(wanted));
      if (!ok) { skipped.push(f); continue; }
    }
    const merged = { ...f.Attributes, ...patch };
    /* Already holding every value in the patch: not written. Fewer rows,
       and an undo entry that lists only what actually moved. */
    const changed = Object.entries(patch)
      .some(([k, v]) => String(f.Attributes?.[k] ?? "") !== String(v ?? ""));
    if (changed) rows.push({ Feature_ID: f.Feature_ID, Attributes: merged });
  }

  return { rows, members, patch, skipped };
}

/* The rows to write: every member, with the patch merged over its own
   attributes so nothing else on it is disturbed. */
export function planBulkEdit(features = [], cls, draft = {}) {
  const patch = buildPatch(draft);
  const members = membersOf(features, cls);
  if (!Object.keys(patch).length) {
    return { rows: [], members, patch, reason: "Nothing to change." };
  }

  const rows = members
    .map((f) => ({
      Feature_ID: f.Feature_ID,
      Attributes: { ...f.Attributes, ...patch },
    }))
    /* A feature already holding every value in the patch is not written.
       Fewer rows, and an undo entry that lists only what actually moved
       rather than the whole class. */
    .filter((r, i) => Object.entries(patch)
      .some(([k, v]) => String(members[i].Attributes?.[k] ?? "") !== String(v ?? "")));

  return { rows, members, patch };
}
