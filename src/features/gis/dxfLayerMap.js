/* What our geometry is called in somebody else's CAD.

   The export used to name layers from the drawing's own vocabulary.
   That is a fine default and the wrong answer for a CAD team with
   their own schedule, so the mapping is data: one row is one rule,
   what it matches and what the layer is called when it does.

   ── House style, and customers' ──

   A rule with no `Organisation_ID` is the HOUSE style — our own
   standard, used unless something more specific applies. A rule with
   one belongs to that customer and outranks the house rule it competes
   with. The same shape as the GIS style cascade on purpose: one way of
   thinking about whose rules these are, not two.

   ── Most specific wins ──

   Blank matches anything. A rule naming a line type beats one naming
   only a layer; a size band beats no size band; a customer beats the
   house. Scored here, beside the code that reads it.

   ── Sizes carry a unit, because two utilities disagree ──

   A pipe's size is a DIAMETER in millimetres; a cable's is an AREA in
   square millimetres. "95 to 300" means different things on water and
   on electric. The unit is decided by the layer, in one function, so
   the editor can show it and the matcher can use it and they cannot
   come apart. */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* Which unit a size is in, for a given utility. Electric and comms are
   specified by conductor area; everything else by diameter. */
export function sizeUnitFor(layerKey) {
  return layerKey === "electric" || layerKey === "comms"
    || layerKey === "telecoms" ? "mm2" : "mm";
}

export const sizeUnitLabel = (unit) => (unit === "mm2" ? "mm\u00b2" : "mm");

/* The number on a feature, whatever it means. Read as written: it is
   compared against bands entered in the same unit, so no conversion
   happens here and none should. */
export function sizeOf(f) {
  const raw = String(f?.Attributes?.Size ?? "");
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  return m ? Number(m[1]) : null;
}

/* Does this rule apply to this feature? */
export function ruleMatches(rule, subject, ctx = {}) {
  if (rule.Is_Active === false) return false;

  /* A customer's rule applies only under that customer; the house
     style applies to everyone. */
  const org = ctx.organisationId ?? null;
  if (rule.Organisation_ID != null
    && String(rule.Organisation_ID) !== String(org)) return false;

  if (rule.Layer_Key && rule.Layer_Key !== subject.layerKey) return false;
  if (rule.Line_Type && rule.Line_Type !== subject.lineType) return false;
  if (rule.Feature_Role && rule.Feature_Role !== subject.role) return false;
  if (rule.Build_Status && rule.Build_Status !== subject.status) return false;

  /* A particular cable, not just a size. "3c WAVE 95" is a type and a
     size together, and a schedule that separates 3c WAVE 95 from
     4c WAVE 95 cannot say so with a band: they are the same 95mm\u00b2.
     Compared case-insensitively and trimmed, because a schedule is
     typed by people and "3C WAVE" is the same cable as "3c wave". */
  const same = (a, b) => String(a).trim().toLowerCase()
    === String(b ?? "").trim().toLowerCase();
  if (rule.Cable_Type && !same(rule.Cable_Type, subject.cableType)) return false;
  if (rule.Size_Label && !same(rule.Size_Label, subject.sizeLabel)) return false;

  const from = num(rule.Size_From);
  const to = num(rule.Size_To);
  if (from != null || to != null) {
    /* A rule with a band cannot match a run with no size. Falling
       through to it would put an unsized cable in a band it may not
       belong to, and the export would look complete while being
       wrong. */
    if (subject.size == null) return false;
    if (from != null && subject.size < from) return false;
    if (to != null && subject.size > to) return false;
  }

  return true;
}

/* How specific a rule is. Bigger wins.

   A customer's rule outranks any house rule, which is why its weight
   is larger than everything else added together: "this client's
   standard" is a stronger claim than any amount of detail in ours. */
export function ruleScore(rule) {
  let n = 0;
  if (rule.Layer_Key) n += 1;
  if (rule.Build_Status) n += 2;
  if (rule.Feature_Role) n += 4;
  if (rule.Line_Type) n += 8;
  if (num(rule.Size_From) != null || num(rule.Size_To) != null) n += 16;
  /* An exact size beats a band that contains it, and a named cable
     type beats both: "this cable" is a more specific claim than "a
     cable of about this size". */
  if (rule.Size_Label) n += 24;
  if (rule.Cable_Type) n += 32;
  if (rule.Organisation_ID != null) n += 64;
  return n;
}

/* What the drawing knows about a feature, in the terms the rules are
   written in. */
export function subjectOf(f, lineTypes = [], opts = {}) {
  const { cableSizes = [], cableTypes = [] } = opts;
  const lineType = f?.Attributes?.Line_Type ?? null;
  const t = lineTypes.find((x) => x.Type_Key === lineType);

  /* Which cable this run is, where the drawing says so. A cable's
     identity lives in the catalogue, not on the feature: the feature
     holds an id, and the name somebody would write in a CAD schedule —
     "3c WAVE 95" — is the type's name and the size's label joined. The
     manual override is read FIRST, because a cable somebody set by
     hand is the cable that will be laid. */
  const a = f?.Attributes || {};
  const sizeId = a.Manual_VD_Cable_Size_ID ?? a.VD_Cable_Size_ID
    ?? a.Cable_Size_ID ?? null;
  const row = sizeId == null ? null
    : cableSizes.find((c) => String(c.Cable_Size_ID ?? c.Electric_Cable_Size_ID)
      === String(sizeId));
  /* Either spelling of the catalogue's keys: 0082 creates
     `Electric_Cable_Type_ID` and `Type_Name`, the live tables use
     `Cable_Type_ID` and `Cable_Type`. Accepting both costs a line and
     saves a rule that silently never matches. */
  const type = row
    ? cableTypes.find((x) => String(x.Cable_Type_ID ?? x.Electric_Cable_Type_ID)
      === String(row.Cable_Type_ID ?? row.Electric_Cable_Type_ID))
    : null;

  /* The number a band is matched against.

     A pipe carries its size on the feature; a CABLE carries an id, and
     the number is in the catalogue. Read from the feature first and
     the catalogue second, or a cable would match no band at all —
     which is how a 185mm\u00b2 run with no rule of its own ended up
     unmapped rather than in the 95\u2013300 band it belongs to. */
  const labelNum = (() => {
    const m2 = /(\d+(?:\.\d+)?)/.exec(String(row?.Size_Label ?? ""));
    return m2 ? Number(m2[1]) : null;
  })();

  return {
    layerKey: t?.Layer_Key ?? f?.Layer_Key ?? null,
    lineType,
    role: f?.Feature_Role ?? null,
    status: a.Build_Status ?? null,
    size: sizeOf(f) ?? labelNum,
    cableType: type?.Cable_Type ?? type?.Type_Name ?? null,
    /* The catalogue's own spelling where there is one, and whatever is
       written on the feature otherwise — a pipe size is on the feature
       and has no catalogue row to consult. */
    sizeLabel: row?.Size_Label ?? (a.Size ?? null),
  };
}

/* The rules that apply, most specific last — the order somebody reading
   an inspector expects, and the order the winner falls out of. */
export function cascadeFor(subject, rules = [], ctx = {}) {
  return rules
    .filter((r) => ruleMatches(r, subject, ctx))
    .map((r) => ({ rule: r, score: ruleScore(r) }))
    .sort((a, b) => a.score - b.score
      || (a.rule.Sort_Order ?? 0) - (b.rule.Sort_Order ?? 0)
      || (a.rule.DXF_Layer_Map_ID ?? 0) - (b.rule.DXF_Layer_Map_ID ?? 0));
}

/* Where a feature's geometry lands, and where its label lands with it.

   `fallback` is what the export did before any of this existed — the
   drawing's own vocabulary — and it is what an unmatched feature would
   get if `unmapped` were not given. `unmapped` is better: a layer
   named as unmapped is visible at a glance in AutoCAD, where a
   plausible-looking WATER-MAIN merged into a real schedule is not. */
export function layerFor(f, opts = {}) {
  const {
    rules = [], lineTypes = [], organisationId = null,
    fallback = null, unmapped = "APTUS-UNMAPPED",
    cableSizes = [], cableTypes = [],
  } = opts;

  const subject = subjectOf(f, lineTypes, { cableSizes, cableTypes });
  const order = cascadeFor(subject, rules, { organisationId });
  const won = order.length ? order[order.length - 1].rule : null;

  if (!won) {
    const name = fallback ? fallback(f) : unmapped;
    return {
      layer: name, aci: null, linetype: "CONTINUOUS",
      textLayer: null, matched: false, rule: null, subject,
    };
  }

  return {
    layer: won.CAD_Layer,
    aci: num(won.ACI_Colour),
    linetype: won.Linetype || "CONTINUOUS",
    /* No text layer on the rule means the label goes on the geometry's
       own layer, which is what a drawing without a separate annotation
       standard expects. */
    textLayer: won.Text_Layer || null,
    matched: true,
    rule: won,
    subject,
  };
}

/* The whole story, for the admin's inspector: every rule that applies,
   in the order they are considered, and which one wins. Built on
   cascadeFor so it cannot disagree with what the export does. */
export function explainLayer(f, opts = {}) {
  const {
    rules = [], lineTypes = [], organisationId = null,
    cableSizes = [], cableTypes = [],
  } = opts;
  const subject = subjectOf(f, lineTypes, { cableSizes, cableTypes });
  const order = cascadeFor(subject, rules, { organisationId });
  return {
    subject,
    rows: order,
    won: order.length ? order[order.length - 1].rule : null,
    unit: sizeUnitFor(subject.layerKey),
  };
}
