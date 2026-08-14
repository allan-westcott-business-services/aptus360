/* How many half-days a section of a mains call-off takes to dig and lay.

   ── Why half-days ──

   Because that is what the planner books in. `assignments.js` already
   works in halves throughout — `halfIsWorked`, `resolveStartHalf`,
   weekend mornings booked without the afternoon — so an estimate in
   hours would have to be converted by whoever read it, and two people
   converting it would disagree about what a day is.

   Rounded up, always. A gang cannot be sent for a third of a half-day,
   and a section that needs four and a bit halves needs five. Rounding
   down would produce a programme that is short on every row and then
   short overall by the sum of the roundings.

   ── Where the size comes from ──

   Not from the call-off. A section carries a length and nothing else,
   because that is what somebody raising one knows. The width and depth
   come from the drawing: what is routed in each trench decides how big
   the hole is, which is `trenchSize()`, and the same figures the canvas
   shows on the trench itself.

   ── Why per edge rather than per section ──

   A section is a run between two points, and the run crosses whatever
   trenches lie between them. Those are not one dig. A run that starts
   in a footway and crosses a carriageway is two rates, and the
   carriageway part is better than twice the footway part — averaging
   them over the section would flatter every crossing on the site.

   So the graph's edges are grouped by the trench they run on, each
   group is estimated at its own trench's size and surface, and the
   section is the sum. */

import { contentsOf } from "../gis/trenchContents.js";
import { trenchSize } from "../gis/trenchSize.js";
import { isTrenchType } from "../gis/snapping.js";
import { digEstimate, digEstimateTotal } from "../gis/digRate.js";

/* The hours in half a working day.

   Four, from the eight in `HOURS_PER_DAY` on digRate.js. Stated here
   rather than derived by dividing, because a half-day is a booking unit
   and not an arithmetic result: if a company works a nine-hour day, the
   half it books is still very likely four hours of production.

   Kept as one number so the rounding below has one thing to be wrong
   about, rather than a rate somewhere and a shift length somewhere
   else. */
export const HALF_DAY_HOURS = 4;

/* Hours as half-days, rounded up.

   Zero hours is no half-days rather than one. A section with nothing to
   dig should not consume a booking, and "1" against an empty row reads
   as a minimum charge nobody agreed to. */
export function halfDaysFor(hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return 0;
  return Math.ceil(h / HALF_DAY_HOURS);
}

export function halfDaysText(halves) {
  const n = Number(halves) || 0;
  if (n <= 0) return "\u2014";
  if (n === 1) return "\u00bd day";
  if (n % 2 === 0) return `${n / 2} day${n === 2 ? "" : "s"}`;
  return `${Math.floor(n / 2)}\u00bd days`;
}

/* What one trench along the run contributes.

   `metres` is how much of that trench the section actually crosses,
   which is not the trench's own length — a section may clip the end of
   a long trench, and charging the whole of it would count metres nobody
   is digging. */
function trenchLeg(trench, metres, opts) {
  const {
    features = [], lineTypes = [], surfaceTypes = [],
    rates, depthBands, layRates,
  } = opts;

  const serviceLineTypes = new Set(lineTypes
    .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
    .map((t) => t.Type_Key));
  const serviceTrenchTypes = new Set(["trench_service", ...lineTypes
    .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
    .map((t) => t.Type_Key)]);

  const res = contentsOf(trench, features, {
    serviceLineTypes,
    serviceTrenchTypes,
    isTrench: (x) => x.Feature_Type === "line"
      && isTrenchType(x.Attributes?.Line_Type, lineTypes),
  });
  if (res.error) return { ok: false, note: res.error, trench, metres };

  const items = (res.contents || []).map((c) => {
    const mm = Number(String(c.feature?.Attributes?.Size ?? "")
      .replace(/[^0-9.]/g, ""));
    return {
      utility: c.utility,
      outsideDiameterMM: mm > 0 ? mm : null,
      /* How much of the trench it covers. A section crossing a trench
         with several consecutive runs of one main is one pipe wide, not
         several. */
      withinM: c.withinM,
    };
  });

  const size = trenchSize(items, { trenchM: res.trenchM });
  const est = digEstimate({
    lengthM: metres,
    size,
    surfaceKey: trench?.Attributes?.Surface_Type ?? null,
    utilities: items.map((x) => x.utility),
    rates, depthBands, layRates, surfaceTypes,
  });

  return { ...est, trench, metres, size };
}

/* A whole section of call-off, from the edges its run crosses.

   `edges` are what `pathBetween` returns: each carries the trench it is
   on and its length along that trench. Grouped by trench first, so a
   run that leaves a trench and comes back to it is one leg and gets one
   setup rather than two.

   Returns no estimate rather than a zero where the drawing cannot
   answer — no route, or a trench with nothing routed in it yet. A blank
   is honest; a zero reads as work that takes no time. */
export function sectionEstimate(edges, opts = {}) {
  if (!edges?.length) {
    return { ok: false, halfDays: 0, note: "No route between those two ends on the drawing." };
  }

  const byTrench = new Map();
  for (const e of edges) {
    const id = e.trench?.Feature_ID;
    if (id == null) continue;
    const held = byTrench.get(id);
    if (held) held.metres += e.len;
    else byTrench.set(id, { trench: e.trench, metres: e.len });
  }

  const legs = [...byTrench.values()].map((x) => trenchLeg(x.trench, x.metres, opts));
  const total = digEstimateTotal(legs);

  /* Every leg unanswerable is no estimate. Some of them unanswerable is
     an estimate that names how much it left out, because a run that is
     four-fifths measured is worth more than nothing to a planner — so
     long as the fifth is declared rather than silently dropped. */
  if (!total.trenches) {
    return {
      ok: false, halfDays: 0,
      note: legs[0]?.note ?? "Nothing is routed in the trench along this run yet.",
    };
  }

  return {
    ok: true,
    halfDays: halfDaysFor(total.totalHours),
    hours: total.totalHours,
    digHours: total.digHours,
    layHours: total.layHours,
    volumeM3: total.volumeM3,
    lengthM: total.lengthM,
    trenches: total.trenches,
    /* Legs the drawing could not size. Named on screen, because a
       section short by one trench is short by however long that trench
       takes and nothing on the row would otherwise say so. */
    unsized: total.skipped,
    legs,
    basis: legs.find((l) => l.ok)?.basis ?? null,
  };
}

/* Every section on the call-off, and what the whole thing comes to.

   The half-days are summed from the rows rather than recomputed from
   the total hours. Each row is a booking somebody will make, and a
   planner adding up what is on screen has to get the number at the
   bottom — a total that rounded once at the end would sit below the
   sum of the rows and look like an error in the rows. */
export function callOffEstimate(sections = []) {
  const ok = sections.filter((s) => s?.ok);
  return {
    sections: ok.length,
    unestimated: sections.length - ok.length,
    halfDays: ok.reduce((t, s) => t + s.halfDays, 0),
    hours: Math.round(ok.reduce((t, s) => t + s.hours, 0) * 100) / 100,
    lengthM: Math.round(ok.reduce((t, s) => t + s.lengthM, 0) * 10) / 10,
    unsized: ok.reduce((t, s) => t + (s.unsized || 0), 0),
  };
}
