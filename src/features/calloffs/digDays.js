/* Half-days, as the planner books them.

   ── What this used to be ──

   An estimator: it took a run through the trench network, grouped its
   edges by the trench they lay on, sized each from what was routed in
   it, priced it against the surface it crossed, and returned half-days.
   Every input came from the drawing, and the drawing left this
   application with the GIS canvas.

   What is left is the unit. Call-offs raised while the canvas was here
   carry an Estimated_Half_Days, Planning books against it, and the
   assignment screens work in halves throughout — halfIsWorked,
   resolveStartHalf, weekend mornings booked without the afternoon. So
   the conversion and the wording stay, and they stay here rather than
   moving into a screen, because two screens rounding separately would
   disagree about what a day is.

   ── Why rounded up ──

   A gang cannot be sent for a third of a half-day, and a section
   needing four and a bit halves needs five. Rounding down produces a
   programme short on every row and then short overall by the sum of
   the roundings. */


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

/* sectionEstimate and callOffEstimate stood here.

   They turned a route through the trench network into half-days, using
   the trench contents, its size, the surface it crosses and the dig
   rates. Every input came from the drawing, and the drawing left this
   application with the canvas.

   What is left is the formatting — halfDaysFor and halfDaysText —
   because call-offs raised while the canvas was here still carry an
   Estimated_Half_Days, Planning still books against it, and it still
   has to be read as "1½ days" rather than as 3. */
