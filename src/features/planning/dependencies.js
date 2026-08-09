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
/* How long the second waits, in half-days.

   The rule's own delay where it has one, its type's where it has not.
   Nullish rather than falsy, because zero is an answer: a rule set to
   no delay at all should stay at none rather than inheriting its type's
   half day. That distinction is the reason the column is nullable.

   Exported because the board shows it and the check below applies it,
   and one of those getting it wrong while the other gets it right would
   be a schedule that disagrees with its own warning. */
export function lagHalves(dep, type) {
  const own = dep?.Lag_Halves;
  if (own != null && Number.isFinite(Number(own))) return Math.max(0, Number(own));
  const fallback = type?.Lag_Halves;
  if (fallback != null && Number.isFinite(Number(fallback))) {
    return Math.max(0, Number(fallback));
  }
  return 0;
}

/* Half-slots from a fixed epoch, so two bookings can be compared at the
   granularity the delay is expressed in.

   Days alone are not enough once the delay is configurable. A half-day
   delay is satisfied by a successor starting on the afternoon of the
   day the predecessor started, and refused by one starting that
   morning — a comparison in whole days cannot tell those apart, and
   would either wave both through or refuse both. */
const halfSlot = (date, part) => {
  const ms = dayMs(date);
  if (!Number.isFinite(ms)) return NaN;
  return Math.round(ms / DAY) * 2 + (part === "PM" ? 1 : 0);
};

const dayMs = (d) => {
  const [y, m, dd] = String(d || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return NaN;
  return new Date(y, m - 1, dd, 12).getTime();
};

const DAY = 86400000;

/* ── The earliest a phase may start, by the rules ──

   What the dependencies actually require, given what is already booked
   on this call-off. The successor's floor is:

     finish to start — the day after the predecessor finishes,
     start to start — the predecessor's start, plus its delay.

   The latest of those where a phase follows more than one, because
   every rule has to hold and the strictest is the binding one.

   ── Why this and not the phase order ──

   earliestStart in assignments.js does something adjacent and older: it
   takes the *start* of any earlier phase in the work type's list. That
   is a reasonable guess in the absence of rules, and it is wrong in the
   presence of them — it says jointing may begin the day the dig begins,
   when a finish-to-start says it may not begin until the dig is done.
   Where there are rules, they are the answer.

   Null where nothing constrains this phase: no rules, or none of its
   predecessors booked yet. The caller then falls back. */
export function dependencyFloor(taskTypeId, opts = {}) {
  const {
    assignments = [], dependencies = [], dependencyTypes = [],
    taskTypes = [], workTypeId = null,
  } = opts;

  const typeById = new Map(dependencyTypes
    .map((t) => [Number(t.Dependency_Type_ID), t]));
  const taskName = (id) => taskTypes
    .find((t) => Number(t.Task_Type_ID) === Number(id))?.Task_Type_Name
    || `phase ${id}`;

  let best = null;

  for (const dep of dependencies) {
    if (dep.Is_Active === false) continue;
    if (Number(dep.Successor_Task_Type_ID) !== Number(taskTypeId)) continue;
    if (dep.Work_Type_ID != null && workTypeId != null
      && Number(dep.Work_Type_ID) !== Number(workTypeId)) continue;

    const kind = typeById.get(Number(dep.Dependency_Type_ID));
    if (!kind) continue;

    for (const before of assignments) {
      if (Number(before.Task_Type_ID) !== Number(dep.Predecessor_Task_Type_ID)) continue;

      let fromMs;
      let why;
      if (kind.Kind === "finish_to_start") {
        fromMs = dayMs(before.End_Date);
        if (!Number.isFinite(fromMs)) continue;
        fromMs += DAY;
        why = `${taskName(before.Task_Type_ID)} finishes on ${before.End_Date}`;
      } else {
        fromMs = dayMs(before.Start_Date);
        if (!Number.isFinite(fromMs)) continue;
        /* Half-days rounded up to whole ones, because a start date is a
           day. A delay of one half means the same day — the afternoon
           of it, which the day rows decide — so it adds nothing here;
           two means the next day. */
        fromMs += Math.floor(lagHalves(dep, kind) / 2) * DAY;
        why = `${taskName(before.Task_Type_ID)} starts on ${before.Start_Date}`;
      }

      if (!best || fromMs > best.ms) {
        best = { ms: fromMs, phase: taskName(before.Task_Type_ID), why };
      }
    }
  }

  if (!best) return null;
  const d = new Date(best.ms);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    phase: best.phase,
    why: best.why,
  };
}

/* A delay in the words somebody would say it in. Half-days is the unit
   it is stored in and not the unit anybody speaks. */
export function describeLag(halves) {
  const n = Number(halves) || 0;
  if (!n) return "at all";
  if (n === 1) return "half a day";
  const days = n / 2;
  return days === Math.floor(days)
    ? `${days} day${days === 1 ? "" : "s"}`
    : `${Math.floor(days)} and a half days`;
}

export function dependencyProblems(assignments = [], opts = {}) {
  const {
    dependencies = [], dependencyTypes = [], taskTypes = [], submissions = [],
    workDays = [],
  } = opts;

  /* Which half of a given day a booking works, from its day rows. */
  const partOn = (assignment, date) => workDays.find((w) =>
    Number(w.Assignment_ID) === Number(assignment.Assignment_ID)
    && String(w.Work_Date).slice(0, 10) === String(date).slice(0, 10))?.Part || "Full";

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
          /* Start to start, with however much of a head start this rule
             asks for. Compared in half-days, which is what the delay is
             measured in — see halfSlot above for why days will not do.

             Which half each begins on comes from the day rows where
             they were given, and is assumed to be the morning where
             they were not: a booking with no day breakdown starts when
             its start date says, and treating that as an afternoon
             would refuse arrangements that are fine. */
          const lag = lagHalves(dep, kind);
          const beganAt = halfSlot(before.Start_Date, partOn(before, before.Start_Date));
          const startsAt = halfSlot(after.Start_Date, partOn(after, after.Start_Date));
          if (Number.isFinite(beganAt) && Number.isFinite(startsAt)
            && startsAt < beganAt + lag) {
            out.push(`${taskName(after.Task_Type_ID)} starts before `
              + `${taskName(before.Task_Type_ID)} has been going `
              + `${describeLag(lag)}.`);
          }
        }
      }
    }
  }

  return [...new Set(out)];
}
