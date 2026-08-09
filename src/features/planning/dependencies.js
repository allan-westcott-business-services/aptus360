/* What follows what.

   Jointing follows the dig. Reinstatement follows the dig. Those are
   rules between phases, held in Task_Dependency and read here — this
   module turns them into two answers the board needs:

     what else has to move when this moves, and
     is this arrangement still legal.

   Pure. Rules and bookings in, decisions out, no React and no fetching.

   ── Moving is not re-planning ──

   When a booking moves, everything downstream of it moves by the same
   amount. Not to where the rule would put it — to where it already was,
   plus the shift.

   That distinction is the whole design. If jointing was set to start
   the day after the dig, somebody decided on that day. Moving the dig a
   week should keep that arrangement, not collapse the gap to nothing
   because a finish-to-start rule technically allows jointing the
   morning after. A schedule that quietly re-optimises itself when you
   nudge one bar is a schedule nobody trusts.

   So the rules say *what* travels together, and the existing dates say
   how far apart they stay. */

/* Successors of a phase, for a given work type.

   A dependency with no work type applies to all of them — a mains
   call-off and a service call-off both joint after they dig, and saying
   so once is better than saying it twice and having one fall out of
   step. */
function successorsOf(taskTypeId, deps, workTypeId) {
  return deps
    .filter((d) => d.Is_Active !== false
      && Number(d.Predecessor_Task_Type_ID) === Number(taskTypeId)
      && (d.Work_Type_ID == null
        || Number(d.Work_Type_ID) === Number(workTypeId)))
    .map((d) => Number(d.Successor_Task_Type_ID));
}

/* Every phase downstream of one, following the chain.

   Breadth first with a seen set, so a rule graph that somebody has
   accidentally made circular — A before B before A — stops rather than
   spinning. The database forbids the one-step version of that; it
   cannot forbid the three-step version without a trigger, so this
   copes with it instead of trusting it cannot happen. */
export function downstreamTaskTypes(taskTypeId, deps = [], workTypeId = null) {
  const seen = new Set([Number(taskTypeId)]);
  const out = [];
  const queue = [Number(taskTypeId)];

  while (queue.length) {
    const cur = queue.shift();
    for (const next of successorsOf(cur, deps, workTypeId)) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

/* ── What travels with a move ──

   The bookings on the same call-off whose phase is downstream of the
   one being moved. Same call-off, because a dependency is about one
   piece of work: the jointing that follows this dig is the jointing on
   this call-off, not every jointing job on the estate.

   Returns the assignments, not ids, since the caller needs their days
   to lay them out again. */
export function dependentAssignments(assignment, opts = {}) {
  const {
    assignments = [], dependencies = [], submissions = [],
  } = opts;
  if (!assignment) return [];

  const sub = submissions
    .find((s) => Number(s.Submission_ID) === Number(assignment.Submission_ID));

  const following = new Set(downstreamTaskTypes(
    assignment.Task_Type_ID, dependencies, sub?.Work_Type_ID ?? null));
  if (!following.size) return [];

  return assignments.filter((a) =>
    Number(a.Assignment_ID) !== Number(assignment.Assignment_ID)
    && Number(a.Submission_ID) === Number(assignment.Submission_ID)
    && following.has(Number(a.Task_Type_ID)));
}

/* ── Is this arrangement legal ──

   Checked against the kind of each rule rather than against the shift,
   because the question is about where things ended up.

   Dates only, and days rather than halves. The rules are about which
   day work starts and finishes, and a finish-to-start that is satisfied
   by a morning would be a different rule — the one this schema calls a
   start-to-start with a lag.

   Returns a list of complaints, in the words a planner would use.
   Empty is fine. */
const dayMs = (d) => {
  const [y, m, dd] = String(d || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return NaN;
  return new Date(y, m - 1, dd, 12).getTime();
};

const DAY = 86400000;

export function dependencyProblems(assignments = [], opts = {}) {
  const {
    dependencies = [], dependencyTypes = [], taskTypes = [], submissions = [],
  } = opts;

  const typeById = new Map(dependencyTypes
    .map((t) => [Number(t.Dependency_Type_ID), t]));
  const taskName = (id) => taskTypes
    .find((t) => Number(t.Task_Type_ID) === Number(id))?.Task_Type_Name
    || `phase ${id}`;
  const subById = new Map(submissions.map((s) => [Number(s.Submission_ID), s]));

  const out = [];

  for (const dep of dependencies) {
    if (dep.Is_Active === false) continue;
    const kind = typeById.get(Number(dep.Dependency_Type_ID));
    if (!kind) continue;

    for (const before of assignments) {
      if (Number(before.Task_Type_ID) !== Number(dep.Predecessor_Task_Type_ID)) continue;
      const sub = subById.get(Number(before.Submission_ID));
      if (dep.Work_Type_ID != null
        && Number(dep.Work_Type_ID) !== Number(sub?.Work_Type_ID)) continue;

      for (const after of assignments) {
        if (Number(after.Submission_ID) !== Number(before.Submission_ID)) continue;
        if (Number(after.Task_Type_ID) !== Number(dep.Successor_Task_Type_ID)) continue;

        const startsAfter = dayMs(after.Start_Date);
        if (kind.Kind === "finish_to_start") {
          const ends = dayMs(before.End_Date);
          if (Number.isFinite(startsAfter) && Number.isFinite(ends)
            && startsAfter <= ends) {
            out.push(`${taskName(after.Task_Type_ID)} starts before `
              + `${taskName(before.Task_Type_ID)} has finished.`);
          }
        } else {
          /* Start to start, with however much of a head start the type
             asks for. Half-days rounded up to whole ones, because the
             dates are days — a lag of one half means "not before the
             same day", and of two means "not before the next". */
          const begins = dayMs(before.Start_Date);
          const lagDays = Math.floor((Number(kind.Lag_Halves) || 0) / 2);
          if (Number.isFinite(startsAfter) && Number.isFinite(begins)
            && startsAfter < begins + lagDays * DAY) {
            out.push(`${taskName(after.Task_Type_ID)} starts before `
              + `${taskName(before.Task_Type_ID)} has been going `
              + `${lagDays ? `${lagDays} day${lagDays === 1 ? "" : "s"}` : "at all"}.`);
          }
        }
      }
    }
  }

  return [...new Set(out)];
}
