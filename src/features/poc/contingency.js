/* The contingency allowance for a site of a given size.

   A stepped figure rather than a percentage: nothing on a handful of
   plots, a fixed allowance on a street, more on an estate. The bands are
   a commercial decision held in Contingency_Level, so this only has to
   pick the right one.

   Kept apart from the POC form because it is a rule with edges — an
   empty table, a count that falls in no band, two bands claiming the
   same count — and each of those has a right answer that is easier to
   state here than to read out of a form. */

/* The band a plot count falls in, or null.

   First match by lower bound. Bands should not overlap, but the table
   does not forbid it — someone re-banding mid-edit would otherwise be
   blocked — so this settles it rather than returning something
   arbitrary. */
export function bandFor(count, levels = []) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;

  return [...levels]
    /* Retired bands are left out, but only where the table says so.

       The filter is here rather than in the query because a table
       without an Is_Active column would make the whole select fail —
       and a failed lookup reads as "no bands", which silently zeroes
       the contingency on every application. Absent means active. */
    .filter((b) => b?.Is_Active !== false)
    .filter((b) => Number.isFinite(Number(b?.From_Plot_Count))
      && Number.isFinite(Number(b?.To_Plot_Count)))
    .sort((a, b) => Number(a.From_Plot_Count) - Number(b.From_Plot_Count))
    .find((b) => n >= Number(b.From_Plot_Count) && n <= Number(b.To_Plot_Count))
    ?? null;
}

/* The allowance itself.

   Zero for an interim application, whatever the plot count. An interim
   supply is temporary and covers a subset of the site — there is no
   future growth to hold a margin for, so a contingency on one would be
   asking the operator for capacity nobody intends to use.

   Zero where no band matches, which is the safe direction: a site larger
   than every band gets no contingency rather than the largest one, so
   the gap shows up as a figure somebody questions instead of a number
   that looks deliberate. */
/* The figure on a band row, whatever the column is called.

   This has been Additional_Load and Additional_kVA in different versions
   of the database, and a lookup that names one and finds the other reads
   as "no contingency" rather than as an error — the worst of both, since
   zero is a plausible answer.

   Named candidates rather than "the first numeric column that is not a
   bound", because that rule would pick up an id or a sort order the day
   somebody adds one. */
const LOAD_KEYS = ["Additional_Load", "Additional_kVA", "Additional_Load_kVA",
  "Contingency_Load", "kVA", "Load"];

export function loadOf(band) {
  if (!band) return 0;
  for (const k of LOAD_KEYS) {
    const v = Number(band[k]);
    if (band[k] != null && Number.isFinite(v)) return v;
  }
  return 0;
}

export function contingencyFor(count, levels = [], { interim = false } = {}) {
  if (interim) return 0;
  return loadOf(bandFor(count, levels));
}

/* Said in words, so the form can explain where the figure came from
   rather than presenting it as a given. */
export function contingencyNote(count, levels = []) {
  const band = bandFor(count, levels);
  if (!band) {
    return Number(count) > 0
      ? `${count} plot(s) — no contingency band covers this count`
      : "no plots yet";
  }
  return `${count} plot(s) — band ${band.From_Plot_Count}\u2013${band.To_Plot_Count}`;
}
