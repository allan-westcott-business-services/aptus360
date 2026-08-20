/* ── Which phases a call-off actually asks for ──

   The phases come from Work_Type_Task_Type: a work type lists the
   phases it involves, in its own order, and the call-off page draws one
   section per phase.

   A service call-off comes out with Excavation & Lay and Reinstatement
   on it, and neither is booked there. The dig and the cable are done
   before jointing starts, so the service goes in a trench that is
   already open, and the ground is reinstated once for the whole street
   rather than plot by plot. Two sections nobody fills in, on every
   service call-off, above the one they came to use.

   ── It is every utility, not just electric ──

   This was written believing gas and water were different, on the
   argument that a gas service has its own trench to the plot and so
   books its own dig. That is not how the work goes: a gas and water
   service call-off does not book excavation or reinstatement either.
   The dig is ahead of the service in every case, and the ground goes
   back once for the street whatever is in it.

   Which is just as well, because the belief could not have been acted
   on: `Work_Type` has one "Service Call Off" covering every utility,
   and which utilities a call-off carries is `utility_ids` on the row,
   not anything in the work type's name. A rule that needed to tell an
   electric service from a gas one could not have been written here at
   all.

   ── Why here and not in the mapping ──

   The mapping now looks like the right place: no service call-off books
   either phase, so the Work_Type_Task_Type rows joining them could go.

   They are kept because the same rows drive the schedule and the cover
   states — the phases still happen, they are just booked on the mains
   call-off, and a timeline that stopped knowing a service needs an open
   trench ahead of it would lose the dependency that orders the two.
   Removing them would answer this question by making a different one
   wrong.

   So the rule is about the call-off, not the configuration: on a
   service, the dig and the reinstatement belong to the mains.

   ── Matched on the work type's name ──

   Which is what the page already does to decide whether a booking is
   scoped to mains or to services, a few hundred lines below where this
   is used. There is no flag on a work type saying "this is the service
   one", and inventing one here would be a second answer to a question
   already being answered by reading the name.

   ── The names this has to match are the seeded ones ──

   `Work_Type` holds exactly three rows: "Mains Call Off", "Service Call
   Off" and "Street Light Call Off". None of them says "electric".

   This module was originally written to match a work type called
   "Electric Service", which no instance has ever had, so it returned
   every phase unchanged on every call-off ever raised and the two
   sections stayed on the page. Its check passed throughout, because the
   check fed it "Electric Service" too — a test of a name the database
   does not produce proves the function agrees with the test and nothing
   else. `checkcalloffphases.mjs` now reads the work type names out of
   the seed migrations and fails if this is matched against a name that
   is not among them.

   Named `hidden` rather than `removed` because that is all this is: the
   phases still exist on the work type, still drive the cover states,
   and are still what the mains call-off books. */

/* The phases a service call-off does not book. */
const NOT_ON_SERVICE = [/^excav/i, /^lay\b/i, /^reinstat/i];

/* Whether this call-off is a service one.

   Mains is excluded by name rather than by absence: a work type called
   "Service and Mains Call Off" digs, and would otherwise match on its
   first word.

   Street lighting is excluded too. "Street Light Call Off" carries no
   "service" and does not reach the second test, but a site naming one
   "Street Lighting Services" would — and a lighting column is dug for
   on its own call-off, there being no mains gang ahead of it. */
export function isServiceCallOff(workTypeName) {
  const n = String(workTypeName || "");
  if (!/\bservices?\b/i.test(n)) return false;
  if (/\bmains?\b/i.test(n)) return false;
  if (/\blight(ing)?\b/i.test(n)) return false;
  return true;
}

/* The phases to draw, in the order the work type gives them. */
export function phasesToShow(phases = [], workTypeName = "") {
  if (!isServiceCallOff(workTypeName)) return phases;

  return phases.filter((p) => {
    const name = String(p?.Task_Type_Name || "");
    return !NOT_ON_SERVICE.some((re) => re.test(name));
  });
}

/* And which were left out, so the page can say so rather than simply
   being short of two sections somebody remembers seeing.

   Worth saying once. A section that quietly disappears reads as
   something broken to whoever knew it was there, and as nothing at all
   to whoever did not — and the fact it carries, that the dig is on the
   mains call-off, is the thing a planner needs to know. */
export function phasesHidden(phases = [], workTypeName = "") {
  if (!isServiceCallOff(workTypeName)) return [];
  const shown = new Set(phasesToShow(phases, workTypeName)
    .map((p) => Number(p.Task_Type_ID)));
  return phases.filter((p) => !shown.has(Number(p.Task_Type_ID)));
}
