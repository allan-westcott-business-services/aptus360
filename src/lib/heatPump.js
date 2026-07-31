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
