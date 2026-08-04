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
export function contingencyFor(count, levels = [], { interim = false } = {}) {
  if (interim) return 0;
  const band = bandFor(count, levels);
  const v = Number(band?.Additional_Load);
  return Number.isFinite(v) ? v : 0;
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
