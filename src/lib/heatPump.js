/* Naming a heat pump model.

   The register lists 1,255 units and the model name alone does not
   identify one: 150 make-and-model pairs appear more than once, and 91
   of those carry different loads. An Airwell AW-WHPMA08-H91 is both a
   3.43 kVA unit and a 6.42 kVA one, under separate register entries.

   So a picker showing "AW-WHPMA08-H91" twice is asking someone to choose
   between two identical-looking options that size a supply differently.
   The reference and the load are what tell them apart, and both belong
   in the label wherever a choice is being made. */

export function heatPumpLabel(m, { withKva = true } = {}) {
  if (!m) return "";
  const name = [m.Make, m.Model].filter(Boolean).join(" ") || m.Model || "";
  const bits = [];
  /* Only where it differs — on the 236 rows where reference and model are
     the same string, repeating it is noise. */
  if (m.Model_Reference && m.Model_Reference !== m.Model) bits.push(m.Model_Reference);
  if (withKva && m.Rated_Power_kVA != null) bits.push(`${Number(m.Rated_Power_kVA)} kVA`);
  return bits.length ? `${name} — ${bits.join(" · ")}` : name;
}

/* Short form for a table cell, where the column is narrow and the row
   already says which plot it belongs to. */
export const heatPumpShort = (m) =>
  (m ? [m.Make, m.Model].filter(Boolean).join(" ") : "");


/* Which heat sources take a heat pump model.

   The register is the MCS list of air source units, so the model picker
   belongs with ASHP and nowhere else — asking someone to choose a heat
   pump for a gas boiler is a question with no answer, and the field
   sitting there implies there is one.

   Matched on the name rather than an id: the ids are whatever the
   Heat_Source table was seeded with, and a lookup renamed in Admin
   should still work. */
export const takesHeatPump = (heatSource) =>
  /\bashp\b|air\s*source/i.test(String(heatSource || ""));

export function sourceTakesHeatPump(heatSourceId, heatSources = []) {
  if (!heatSourceId) return false;
  const hs = heatSources.find((h) => String(h.Heat_Source_ID) === String(heatSourceId));
  return takesHeatPump(hs?.Heat_Source);
}


/* What a plot's load was arrived at from.

   The database decides this and hands back a word for it; these are the
   readable forms. Kept beside the heat pump helpers because two of the
   values exist only for air source plots, whose load is composed from a
   gas base plus half the fitted unit rather than read from a single row.

   Shared so the plots table and the seed editor cannot describe the same
   plot differently — the sort of drift that has someone comparing two
   screens and doubting both. */
export const KVA_SOURCE_TEXT = {
  entered:        "entered on this plot",
  "house type":   "from the house type",
  "heat pump":    "gas base + half the heat pump",
  "no heat pump": "no heat pump model set",
  "no gas base":  "no gas figure for this house type",
  "not set":      "no load recorded",
};

/* Whether that word means a figure exists. The two 'no ...' values are
   gaps with a reason rather than loads, and read as an absence. */
export const kvaSourceIsGap = (s) =>
  s === "no heat pump" || s === "no gas base" || s === "not set" || s == null;

export const kvaSourceText = (s) => KVA_SOURCE_TEXT[s] ?? "no load recorded";
