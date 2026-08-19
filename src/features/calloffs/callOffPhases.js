/* ── Which phases a call-off actually asks for ──

   The phases come from Work_Type_Task_Type: a work type lists the
   phases it involves, in its own order, and the call-off page draws one
   section per phase.

   An electric service call-off comes out with Excavation & Lay and
   Reinstatement on it, and neither is booked there. The service goes in
   the trench the mains call-off already dug, and the ground is
   reinstated once for the whole street rather than plot by plot. Two
   sections nobody fills in, on every electric service call-off, above
   the one they came to use.

   ── Why here and not in the mapping ──

   The mapping is the right place if those phases are wrong for the work
   type in general. They are not: the same rows drive the schedule and
   the cover states, and other utilities do dig for their services — a
   gas service has its own trench to the plot. Removing them from the
   work type would answer this question by making a different one wrong.

   So the rule is about the call-off, not the configuration: on an
   electric service, the dig and the reinstatement belong to the mains.

   ── Matched on the work type's name ──

   Which is what the page already does to decide whether a booking is
   scoped to mains or to services, a few hundred lines below where this
   is used. There is no flag on a work type saying "this is the electric
   service one", and inventing one here would be a second answer to a
   question already being answered by reading the name.

   Named `hidden` rather than `removed` because that is all this is: the
   phases still exist on the work type, still drive the cover states,
   and are still what the mains call-off books. */

/* The phases an electric service call-off does not book. */
const NOT_ON_ELECTRIC_SERVICE = [/^excav/i, /^lay\b/i, /^reinstat/i];

/* Whether this call-off is an electric service one.

   Both words, because "Electric Mains" digs and "Gas Service" digs —
   it is only the pair that means the trench was somebody else's. A work
   type named for two utilities is not caught, and should not be: a
   call-off covering electric and gas services has a gas trench in it. */
export function isElectricService(workTypeName) {
  const n = String(workTypeName || "");
  if (!/service/i.test(n)) return false;
  if (!/electric/i.test(n)) return false;
  /* Named for another utility as well, so the dig is somebody's. */
  if (/\b(gas|water|lighting)\b/i.test(n)) return false;
  return true;
}

/* The phases to draw, in the order the work type gives them. */
export function phasesToShow(phases = [], workTypeName = "") {
  if (!isElectricService(workTypeName)) return phases;

  return phases.filter((p) => {
    const name = String(p?.Task_Type_Name || "");
    return !NOT_ON_ELECTRIC_SERVICE.some((re) => re.test(name));
  });
}

/* And which were left out, so the page can say so rather than simply
   being short of two sections somebody remembers seeing.

   Worth saying once. A section that quietly disappears reads as
   something broken to whoever knew it was there, and as nothing at all
   to whoever did not — and the fact it carries, that the dig is on the
   mains call-off, is the thing a planner needs to know. */
export function phasesHidden(phases = [], workTypeName = "") {
  if (!isElectricService(workTypeName)) return [];
  const shown = new Set(phasesToShow(phases, workTypeName)
    .map((p) => Number(p.Task_Type_ID)));
  return phases.filter((p) => !shown.has(Number(p.Task_Type_ID)));
}
