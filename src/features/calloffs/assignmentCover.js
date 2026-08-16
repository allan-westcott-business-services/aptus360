/* How much of a call-off has been booked, phase by phase.

   ── The question this answers ──

   A call-off is raised, somebody books a team, and it looks dealt with.
   It is not: the booking may cover one span of four, or half the time
   the dig needs, and the rest is waiting on a person who thinks the job
   is done. Nothing on the list said so, so it had to be opened to find
   out — and a thing you have to open to check is a thing that gets
   missed.

   ── Three states, and what decides them ──

     Unassigned    nothing booked for this phase
     Part          something booked, but not all of it
     Assigned      every span covered, and enough time on each

   Two ways to fall short, and both matter.

   A span with no assignment against it is obvious once looked for. Time
   is the one that hides: a day's excavation booked as a morning reads as
   assigned on every screen, and only turns up when the gang runs out of
   day.

   ── Where there is no estimate ──

   Only excavation and lay is estimated — reinstatement has no figure to
   compare against, and a call-off raised before 0159 has none at all.

   For those, coverage is the whole test: every span booked means
   assigned. That is weaker, and it is the honest weaker answer. Marking
   a phase "part assigned" because nothing has estimated it would be a
   warning nobody could act on. */

/* Half-days a set of work-day rows comes to. Full is two, AM and PM one
   each — the same arithmetic dayTotal does, in halves rather than days
   because that is the unit the estimate is in. */
export function halvesBooked(days = []) {
  return days.reduce((t, d) => t + ((d.Part || "Full") === "Full" ? 2 : 1), 0);
}

/* Whether a phase is unassigned, part assigned, or assigned.

   `spans` are the call-off's section rows, each optionally carrying
   Estimated_Half_Days. `assignments` and `workDays` are that phase's
   only — the caller narrows by task type, because what counts as a
   phase is the office's business and not this function's. */
export function phaseCover(spans = [], assignments = [], workDays = []) {
  if (!assignments.length) return "unassigned";

  /* An assignment with no span covers the lot. That is what "all spans"
     means on the assignment editor, and it is the ordinary case on a
     call-off with one section. */
  const coversAll = assignments.some((a) => a.Span_ID == null);
  const covered = new Set(assignments
    .map((a) => a.Span_ID).filter((x) => x != null).map(Number));

  const everySpan = coversAll
    || (spans.length > 0 && spans.every((s) => covered.has(Number(s.Span_ID))));
  if (!everySpan) return "part";

  /* Enough time, where there is a figure to want. Summed across the
     phase rather than matched span by span: two teams splitting one
     span between them have booked it between them, and asking each to
     meet the whole estimate would call a fully booked job short. */
  const needed = spans.reduce(
    (t, s) => t + (Number(s.Estimated_Half_Days) || 0), 0);
  if (!needed) return "assigned";

  const ids = new Set(assignments.map((a) => Number(a.Assignment_ID)));
  const booked = halvesBooked(
    workDays.filter((d) => ids.has(Number(d.Assignment_ID))));

  return booked >= needed ? "assigned" : "part";
}

/* What each state is called and coloured.

   Amber for part rather than red: a half-booked call-off is not wrong,
   it is unfinished, and a list of red rows stops being read. Grey for
   unassigned, because nothing has gone wrong there either — it is
   simply the state everything starts in. */
export const COVER_LABEL = {
  unassigned: "Unassigned",
  part: "Part assigned",
  assigned: "Assigned",
};

/* Only the phases the office would look for on a list.

   A work type may have half a dozen, and a row carrying six pills says
   less than one carrying two. These are the ones that take days and get
   missed; the rest are visible on the call-off itself.

   Matched on the name because that is what a phase is identified by
   throughout — the same test energisationFloor and isDigTask use. */
export function isListedPhase(taskTypeName) {
  const n = String(taskTypeName || "").toLowerCase().trim();
  return n.startsWith("excav") || n.startsWith("lay")
    || n.startsWith("reinstat");
}
