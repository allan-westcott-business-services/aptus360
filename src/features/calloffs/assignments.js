/* Putting teams on the phases of a call-off.

   A work type is done in phases, each needing a craft, and a team may
   work a phase only if it holds that craft and covers the region. One
   phase can carry several assignments — Team A on plots 1 to 5, Team B
   on 6 to 9 — so work runs in parallel where the site allows.

   The rules live here rather than in the panel because they have edges,
   and because the interesting ones are about time: a phase cannot start
   before the one before it, and a team cannot be in two places at once. */

/* A date as people write it: 17-Aug-2026.

   Here as well as in the panel because these rules build sentences that
   reach the screen, and an ISO date inside one of them would sit beside
   a formatted one and look like a fault. */
export function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = String(d).split("-");
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return M && dd ? `${dd}-${M}-${y}` : String(d);
}

/* Plots as written — "1-5", "12, 14" — expanded and collapsed.

   Text is how the work is described on site and how the original stores
   it. Expanding is needed to tell whether two assignments overlap;
   collapsing is needed so what is saved reads the way somebody wrote it. */
export function parsePlots(text) {
  const out = [];
  for (const part of String(text ?? "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*[-\u2013]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(String(i));
    } else {
      out.push(t);
    }
  }
  return [...new Set(out)];
}

export function serialisePlots(plots = []) {
  /* Numeric where it can be, so 1,2,3,5 becomes "1-3, 5" rather than a
     list four items long. Anything not a plain number is left as it is
     and listed separately — a plot called "12A" is not part of a run. */
  const nums = [];
  const rest = [];
  for (const p of plots) {
    const s = String(p).trim();
    if (!s) continue;
    if (/^\d+$/.test(s)) nums.push(Number(s));
    else rest.push(s);
  }
  nums.sort((a, b) => a - b);

  const runs = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1;
    runs.push(i === j ? String(nums[i])
      : (j === i + 1 ? `${nums[i]}, ${nums[j]}` : `${nums[i]}-${nums[j]}`));
    i = j + 1;
  }
  return [...runs, ...rest].join(", ");
}

/* Teams that may work a phase.

   Two conditions, both from the drawing rather than from judgement: the
   team holds the craft the phase needs, and it covers the region. A
   phase with no craft is open to anybody, which is what an unconfigured
   phase looks like and is worth seeing rather than silently excluding
   everybody. */
/* Whether one team may take one piece of work, and if not, why.

   eligibleTeams below answers "which teams can do this", which is the
   question a dropdown asks. Dragging a booking onto a lane asks the
   other one: this team, this work — yes or no, and if no, something to
   put on screen.

   Same two rules, deliberately in the same file. A board that let a
   booking be dropped where the call-off page would refuse it is two
   answers to one question, and the one the planner sees would be the
   wrong one.

   Returns null where it is allowed, and a sentence where it is not.
   Region is named first because it is the one that stops most drops:
   a gang covers the patch it covers. */
export function teamMayTake(team, opts = {}) {
  const {
    teamCrafts = [], teamRegions = [],
    craftId = null, regionId = null,
    regionName = null, craftName = null, taskName = null,
  } = opts;

  if (!team) return "That lane has no team on it.";
  if (team.Active === false) {
    return `${team.Team_Name} is not active.`;
  }

  /* Only where the call-off has a region. A project with none should
     not make every team ineligible — the same allowance eligibleTeams
     makes, for the same reason. */
  if (regionId != null) {
    const covers = teamRegions.some((x) =>
      Number(x.Team_ID) === Number(team.Team_ID)
      && Number(x.Region_ID) === Number(regionId));
    if (!covers) {
      return `${team.Team_Name} is not set up to work in `
        + `${regionName ? `the ${regionName} region` : "that region"}.`;
    }
  }

  /* A phase with no craft set is refused, not waved through.

     The rule used to skip the check when craftId was null, so a task
     type nobody had given a craft to could be dropped on any gang at
     all \u2014 which is the opposite of what the rule is for, and invisible
     because it looks like the drop simply worked.

     A missing craft is a gap in Admin rather than a fact about the
     work, so the refusal says where to fix it. */
  if (craftId == null) {
    return `${taskName || "That phase"} has no craft set, so there is no way `
      + "to tell which gangs can do it. Set one on the task type in Admin.";
  }

  {
    const holds = teamCrafts.some((x) =>
      Number(x.Team_ID) === Number(team.Team_ID)
      && Number(x.Craft_ID) === Number(craftId));
    if (!holds) {
      /* Named by the phase rather than by the craft behind it. "Not set
         up to perform Jointing" is the sentence a planner can act on;
         "does not hold the Jointing craft" is the same fact stated in
         the schema's words, and sends them looking for the wrong screen. */
      return `${team.Team_Name} is not set up to perform `
        + `${taskName || craftName || "this phase"}.`;
    }
  }

  return null;
}

export function eligibleTeams(teams = [], opts = {}) {
  const { teamCrafts = [], teamRegions = [], craftId = null, regionId = null } = opts;

  return teams.filter((t) => {
    if (!t.Active) return false;
    if (craftId != null) {
      const holds = teamCrafts.some((x) =>
        Number(x.Team_ID) === Number(t.Team_ID)
        && Number(x.Craft_ID) === Number(craftId));
      if (!holds) return false;
    }
    /* Region is only applied where the call-off has one. A project with
       no region should not leave every team ineligible. */
    if (regionId != null) {
      const covers = teamRegions.some((x) =>
        Number(x.Team_ID) === Number(t.Team_ID)
        && Number(x.Region_ID) === Number(regionId));
      if (!covers) return false;
    }
    return true;
  });
}

/* The earliest a phase may start.

   A later phase cannot begin before an earlier one has — jointing before
   excavation is not a scheduling preference, it is impossible. The floor
   is the latest start of any assignment on any earlier phase, so a phase
   may begin the same day the one before it does but never sooner.

   Only phases before this one in the work type's order count, and only
   assignments that share plots with what is being scheduled — two gangs
   on opposite ends of a site do not wait for each other. */
export function earliestStart(phases = [], assignments = [], taskTypeId,
  plots = [], spanId = null) {
  const order = new Map(phases.map((p, i) => [Number(p.Task_Type_ID), i]));
  const mine = order.get(Number(taskTypeId));
  if (mine == null) return null;

  const want = new Set(plots.map(String));
  let floor = null;
  let why = null;

  for (const a of assignments) {
    const theirs = order.get(Number(a.Task_Type_ID));
    if (theirs == null || theirs >= mine) continue;

    /* Only work on the same ground counts.

       On a service call-off that is the shared plots. On a mains
       call-off it is the span: jointing A7 to A12 has no reason to wait
       for excavation on A1 to A5, and with no plots to compare the first
       version made every phase wait for every other — which would have
       held up half a site for work at the other end of it. */
    if (spanId != null && a.Span_ID != null) {
      if (Number(a.Span_ID) !== Number(spanId)) continue;
    } else if (want.size) {
      const shared = parsePlots(a.Plot_Range).some((p) => want.has(p));
      if (!shared) continue;
    }
    if (!floor || a.Start_Date > floor) {
      floor = a.Start_Date;
      why = phases[theirs]?.Task_Type_Name ?? null;
    }
  }
  return floor ? { date: floor, phase: why } : null;
}

/* What a team already has booked, day by day.

   Built from the work-day rows rather than the assignment's two dates: a
   gang on site all Tuesday and free on Wednesday is not "booked Tuesday
   to Wednesday", and a check on the range would say it was.

   Returns date -> the parts already taken on it. */
export function bookedParts(teamId, assignments = [], workDays = [], exceptId = null) {
  const mine = new Set(assignments
    .filter((a) => Number(a.Team_ID) === Number(teamId))
    .filter((a) => exceptId == null || Number(a.Assignment_ID) !== Number(exceptId))
    .map((a) => Number(a.Assignment_ID)));

  const out = new Map();
  for (const d of workDays) {
    if (!mine.has(Number(d.Assignment_ID))) continue;
    if (!out.has(d.Work_Date)) out.set(d.Work_Date, new Set());
    out.get(d.Work_Date).add(d.Part || "Full");
  }
  return out;
}

/* Whether a part of a day is still free.

   Full takes the whole day, so nothing else fits beside it and it does
   not fit beside anything. AM and PM are halves and sit alongside each
   other — the same gang can do one span in the morning and another in
   the afternoon, which is ordinary and was refused by a check that only
   looked at dates. */
export function partIsFree(taken, part) {
  if (!taken || !taken.size) return true;
  if (taken.has("Full")) return false;
  if (part === "Full") return false;
  return !taken.has(part);
}

/* Which parts a team could still take on a day. */
export function freeParts(taken) {
  return ["Full", "AM", "PM"].filter((p) => partIsFree(taken, p));
}

/* A team already booked over these dates.

   Across every call-off, not just this one: a gang cannot be on two
   sites at once, and the clash that matters is the one nobody looking at
   this call-off would see. */
export function clashesFor(teamId, start, end, assignments = [], exceptId = null) {
  if (!teamId || !start || !end) return [];
  return assignments.filter((a) => {
    if (Number(a.Team_ID) !== Number(teamId)) return false;
    if (exceptId != null && Number(a.Assignment_ID) === Number(exceptId)) return false;
    /* Overlapping, which catches one that starts before and ends after
       as well as one that falls inside. */
    return a.Start_Date <= end && a.End_Date >= start;
  });
}

/* Plots already taken by another team on the same phase.

   A call-off of six plots can be split three and three, which is the
   point of allowing several assignments per phase — but two teams
   cannot both have plot four. Whoever turns up second finds the work
   done, or worse, both dig.

   Per phase, not per call-off: the same plot is excavated, jointed and
   reinstated, by different gangs at different times. Only a clash
   within one phase is a clash.

   Returns plot to the team holding it, so the panel can say which
   rather than only that the plot is unavailable. */
export function takenPlots(assignments = [], taskTypeId, exceptId = null,
  teamName = () => null, opts = {}) {
  /* ── And per utility, where the phase has been split ──

     Laying the gas on all six plots does not take those plots for the
     water or the electric: different trench, different gang, often a
     different week. So a booking only takes a plot from another they
     have a utility in common.

     A booking with no utilities recorded covers whatever the call-off
     does \u2014 every booking made before splitting existed is one \u2014 so
     it clashes with everything, which is the safe reading.

     No `utilitiesOf` and the check is by phase alone, as it was. */
  const { utilitiesOf = null, mine = null } = opts;
  const overlaps = (a) => {
    if (!utilitiesOf) return true;
    const theirs = (utilitiesOf(a) || []).map(Number);
    const ours = (mine || []).map(Number);
    if (!theirs.length || !ours.length) return true;
    return theirs.some((u) => ours.includes(u));
  };

  const out = new Map();
  for (const a of assignments) {
    if (Number(a.Task_Type_ID) !== Number(taskTypeId)) continue;
    if (!overlaps(a)) continue;
    if (exceptId != null && Number(a.Assignment_ID) === Number(exceptId)) continue;
    for (const p of parsePlots(a.Plot_Range)) {
      if (!out.has(p)) out.set(p, teamName(a.Team_ID) ?? `team ${a.Team_ID}`);
    }
  }
  return out;
}

/* Everything wrong with a proposed assignment, as a list. */
export function validate(draft, opts = {}) {
  const {
    phases = [], assignments = [], today = null, exceptId = null,
    /* How to read a booking's utilities, and what this one covers \u2014
       see takenPlots. Absent, the check is by phase alone. */
    utilitiesOf = null, utilities = [],
  } = opts;
  const out = [];

  if (!draft.Team_ID) out.push("Choose a team.");
  if (!draft.Start_Date || !draft.End_Date) out.push("Give both a start and an end.");

  if (draft.Start_Date && draft.End_Date && draft.End_Date < draft.Start_Date) {
    out.push("The end is before the start.");
  }
  /* Not in the past — but only for a date being set now.

     A new assignment somebody cannot turn up for is a typo, nearly
     always a mistyped year. An existing one whose start has since passed
     is not a typo, it is last week's work: refusing it made every
     assignment uneditable the moment it began, and the message pointed
     at a date nobody had touched.

     `wasStart` is the date the assignment already had. Unchanged, it is
     accepted whatever the calendar says; changed, it is checked like any
     other new date. */
  const startChanged = opts.wasStart == null || draft.Start_Date !== opts.wasStart;
  if (today && draft.Start_Date && startChanged && draft.Start_Date < today) {
    out.push("The start is in the past.");
  }

  const plots = parsePlots(draft.Plot_Range);
  const floor = earliestStart(phases, assignments, draft.Task_Type_ID, plots,
    draft.Span_ID ?? null);
  if (floor && draft.Start_Date && draft.Start_Date < floor.date) {
    /* The date as written, since this string reaches the screen. The
       panel formats what it prints; a rule that returns a raw ISO date
       inside a sentence would show one format beside another. */
    out.push(`${floor.phase ?? "The previous phase"} starts on ${fmtDate(floor.date)} `
      + "\u2014 this phase cannot begin before it.");
  }

  /* Plots another team already has on this phase.

     Checked here as well as disabled in the panel: a disabled pill is a
     hint, and a selection made before another assignment was saved would
     otherwise go through. */
  const taken = takenPlots(assignments, draft.Task_Type_ID, exceptId,
    () => null, { utilitiesOf, mine: utilities });
  const doubled = plots.filter((p) => taken.has(p));
  if (doubled.length) {
    out.push(`Plot${doubled.length === 1 ? "" : "s"} ${doubled.join(", ")} `
      + "already assigned on this phase"
      + (utilities.length ? " for the same utilities." : "."));
  }

  if (!plots.length) out.push("Choose at least one plot.");

  /* Booked, day part by day part.

     A team on site all Tuesday cannot take Tuesday at all; one doing a
     morning can still do the afternoon. Checking the date range instead
     refused the second half of a day the gang was free for, which is a
     day's work lost to a rule that was never meant to say that. */
  const workDays = opts.workDays ?? null;
  if (workDays) {
    const taken = bookedParts(draft.Team_ID, assignments, workDays, exceptId);
    /* Only the days the assignment works. A Sunday nobody is on site
       for cannot clash with anything, and checking it would refuse a
       booking on the strength of a day that is not in it. */
    const days = workedDaysIn(draft.Start_Date, draft.End_Date, draft.weekend || {})
      .map((x) => x.date);
    const bad = [];
    for (const d of days) {
      const part = draft.parts?.[d] || "Full";
      if (!partIsFree(taken.get(d), part)) {
        const has = [...(taken.get(d) || [])].join(" and ");
        bad.push(`${fmtDate(d)} (${part}, already ${has})`);
      }
    }
    if (bad.length) {
      out.push(`That team is already booked: ${bad.slice(0, 3).join(", ")}`
        + (bad.length > 3 ? ` and ${bad.length - 3} more` : "") + ".");
    }
  } else {
    /* No day breakdown to check against, so the whole range is compared
       — which is what this did before and is still right for a caller
       that has not loaded the days. */
    const clashes = clashesFor(draft.Team_ID, draft.Start_Date, draft.End_Date,
      assignments, exceptId);
    if (clashes.length) {
      out.push(`That team is already booked ${fmtDate(clashes[0].Start_Date)} to `
        + `${fmtDate(clashes[0].End_Date)}.`);
    }
  }

  return out;
}


/* ── Working the weekend ──

   A gang on a programme under pressure works Saturdays, and sometimes
   half of one. So an assignment carries which weekend halves it works —
   Saturday morning, Saturday afternoon, Sunday morning, Sunday
   afternoon — and everything else follows from that.

   ── Why this is a rule on the assignment, not four more day rows ──

   Call_Off_Work_Day could say it already: a row dated Saturday with
   Part = AM is a Saturday morning worked. But the day rows are the
   *result* of a decision, and the decision has to survive the days
   changing. A booking that runs Monday to Wednesday has no weekend in
   it and therefore no rows to read; extend it to the Friday and
   something has to know whether the Saturday counts. Deriving the
   answer from rows that do not exist yet is guessing, and the guess
   would be "no" on a gang that has worked every Saturday this year.

   So the rule is stored, and the rows are laid from it. */
export const WEEKEND_PARTS = [
  { key: "Sat_AM", dow: 6, part: "AM", label: "Sat AM" },
  { key: "Sat_PM", dow: 6, part: "PM", label: "Sat PM" },
  { key: "Sun_AM", dow: 0, part: "AM", label: "Sun AM" },
  { key: "Sun_PM", dow: 0, part: "PM", label: "Sun PM" },
];

export const worksAnyWeekend = (weekend = {}) =>
  WEEKEND_PARTS.some((w) => !!weekend[w.key]);

/* Noon, so a clock change cannot move a date by a day — the same guard
   daysBetween uses, and the reason it uses it. */
const at = (d) => {
  const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return null;
  return new Date(y, m - 1, dd, 12);
};

const iso = (dt) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

/* How much of a given day this assignment can work.

   A weekday is a whole day. A Saturday with both halves ticked is a
   whole day too; with one, that half; with neither, nothing at all —
   and nothing at all is what makes the schedule step over it.

   Null rather than "None", because the caller's question is "is there a
   day here", and a falsy answer is the honest shape for "no". */
export function availablePart(date, weekend = {}) {
  const dt = at(date);
  if (!dt) return null;
  const d = dt.getDay();
  if (d !== 0 && d !== 6) return "Full";
  const am = !!weekend[d === 6 ? "Sat_AM" : "Sun_AM"];
  const pm = !!weekend[d === 6 ? "Sat_PM" : "Sun_PM"];
  if (am && pm) return "Full";
  if (am) return "AM";
  if (pm) return "PM";
  return null;
}

export const isWorkingDay = (date, weekend = {}) =>
  availablePart(date, weekend) != null;

/* The next day this assignment could work, from `date` inclusive. */
export function nextWorkingDay(date, weekend = {}) {
  let dt = at(date);
  if (!dt) return null;
  /* Seven is enough to clear any weekend; the guard is against a rule
     with nothing ticked and a date that is somehow always a Sunday. */
  for (let i = 0; i < 8; i++) {
    if (isWorkingDay(iso(dt), weekend)) return iso(dt);
    dt = new Date(dt.getTime());
    dt.setDate(dt.getDate() + 1);
  }
  return null;
}

/* ── Laying a booking out ──

   Given a start and how many days of work, the days it actually falls
   on. Weekend days the assignment does not work are stepped over, and
   the work continues on the next weekday — which is the whole point:
   four days from a Friday, with no weekend working, is Friday, Monday,
   Tuesday, Wednesday, not Friday and two days nobody is on site.

   A weekend day that *is* worked comes back with the half it is worked,
   already set: a Saturday morning is half a day and the form should not
   offer to make it a full one, because the rule above says it is not.

   The end date comes out of this rather than being asked for. Two dates
   and a weekend rule can disagree — a range ending on a Sunday that is
   not worked has an end nobody is there for — and the way to make that
   impossible is for only one of them to be stored as a decision. */
export function laySchedule(start, length, weekend = {}) {
  const days = [];
  const want = Math.max(0, Math.floor(Number(length) || 0));
  if (!want) return { days, end: null, pushed: 0 };

  let cursor = nextWorkingDay(start, weekend);
  if (!cursor) return { days, end: null, pushed: 0 };

  let skipped = 0;
  let guard = 0;
  while (days.length < want && guard++ < 400) {
    const part = availablePart(cursor, weekend);
    if (part) days.push({ date: cursor, part });
    else skipped += 1;
    const dt = at(cursor);
    dt.setDate(dt.getDate() + 1);
    cursor = iso(dt);
  }

  return {
    days,
    end: days.length ? days[days.length - 1].date : null,
    /* How many days the weekend pushed it out by, for the sentence the
       form says out loud. A booking that quietly finished two days late
       is the thing this feature exists to stop. */
    pushed: skipped,
  };
}

/* The days worked inside a range that has already been decided.

   Used when reading an existing booking back: its length is however
   many days it actually works, and re-laying that many from the same
   start lands on the same dates. That round trip has to hold, or
   opening an assignment and saving it unchanged would walk its end date
   further out every time. */
export function workedDaysIn(start, end, weekend = {}) {
  return daysBetween(start, end)
    .map((d) => ({ date: d, part: availablePart(d, weekend) }))
    .filter((x) => x.part != null);
}

/* ── The same booking, half a day at a time ──

   laySchedule above counts whole days, which is what the form asks for:
   somebody books a gang for four days. Moving a booking is a different
   question — it keeps whatever shape it has and slides it — and a slide
   of half a day turns whole days into halves. A two-day booking nudged
   forward by a morning is an afternoon, a full day, and a morning: the
   same amount of work, decomposed differently.

   So a booking is exploded into an ordered list of half-days, moved,
   and recomposed. Everything that travels with a day — off site is the
   only thing so far — travels on the half, and a recomposed day is off
   site if either of its halves was. That is what keeps an off-site
   Tuesday off site after the booking shifts, rather than the flag
   sliding onto whichever row happens to be second.

   Working in halves rather than in dates is also what makes the weekend
   rule apply on the way: a Saturday with only the morning ticked offers
   one half, not two, so a booking sliding across it takes the morning
   and continues on the Monday afternoon. */
export function explodeHalves(days = []) {
  const out = [];
  for (const d of days) {
    const part = d.part || d.Part || "Full";
    const offSite = !!(d.offSite ?? d.Off_Site);
    if (part === "Full") out.push({ offSite }, { offSite });
    else out.push({ offSite });
  }
  return out;
}

/* `halves` laid from a given day and half, over the weekend rule.

   `startPM` says the booking begins in the afternoon. It applies only
   to the first day actually worked — if that day turns out to offer no
   afternoon, the booking starts on the next available half rather than
   on a half nobody works. */
export function layHalves(start, startPM, halves = [], weekend = {}) {
  const rows = [];
  if (!halves.length) return { days: [], end: null };

  const from = at(start);
  if (!from) return { days: [], end: null };

  let cursor = iso(from);
  let idx = 0;
  let first = true;
  let guard = 0;

  while (idx < halves.length && guard++ < 400) {
    const avail = availablePart(cursor, weekend);
    if (avail) {
      const canAM = (avail === "Full" || avail === "AM") && !(first && startPM);
      const canPM = avail === "Full" || avail === "PM";
      const taken = [];
      if (canAM && idx < halves.length) taken.push(["AM", halves[idx++]]);
      if (canPM && idx < halves.length) taken.push(["PM", halves[idx++]]);
      if (taken.length) {
        rows.push({
          date: cursor,
          part: taken.length === 2 ? "Full" : taken[0][0],
          offSite: taken.some(([, h]) => !!h?.offSite),
        });
      }
      first = false;
    }
    const dt = at(cursor);
    dt.setDate(dt.getDate() + 1);
    cursor = iso(dt);
  }

  return { days: rows, end: rows.length ? rows[rows.length - 1].date : null };
}

/* Whether a given half of a given day is worked. */
export function halfIsWorked(date, pm, weekend = {}) {
  const a = availablePart(date, weekend);
  if (!a) return false;
  return a === "Full" || a === (pm ? "PM" : "AM");
}

/* The nearest worked half to a target, in a given direction.

   Two things this has to get right, and the first version got neither.

   Direction. A booking dragged forward onto a Sunday should land on the
   Monday; dragged *backward* onto the same Sunday it should land on the
   Friday. Searching forwards in both cases moved a booking later when
   somebody had dragged it earlier, which is the one thing a drag must
   never do.

   Which half. Searching half by half, a two-day booking pulled back
   across a weekend landed on the Friday *afternoon* — because that is
   the nearest worked half to Sunday morning — and two whole days became
   an afternoon, a day and a morning. So the search steps whole days and
   keeps the half it was asked for, taking the other half of a day only
   where that day offers no other. A booking of whole days stays whole
   days, which is what dragging it a day sideways should do. */
export function resolveStartHalf(date, pm, weekend = {}, dir = 1) {
  let d = date;
  for (let i = 0; i < 10; i++) {
    if (halfIsWorked(d, pm, weekend)) return { date: d, pm: !!pm };
    if (halfIsWorked(d, !pm, weekend)) return { date: d, pm: !pm };
    const x = at(d);
    if (!x) return null;
    x.setDate(x.getDate() + (dir > 0 ? 1 : -1));
    d = iso(x);
  }
  return null;
}

/* Moving a booking by a number of half-days, signed.

   The whole operation in one place, so the board and the endpoint that
   writes for it cannot come to different answers about where a bar
   lands. Given the days as they stand it returns the days as they
   should be.

   The new start is worked out in halves from the old one: an odd shift
   flips which half of the day it begins on, and every two halves is a
   day. Where the result lands on a day the booking does not work,
   layHalves steps over it — so dragging onto a Sunday puts the work on
   the Monday rather than on a day nobody is there. */
export function shiftByHalves(days = [], halfShift = 0, weekend = {}) {
  return resizeByHalves(days, halfShift, halfShift, weekend);
}

/* ── Moving and stretching are the same operation ──

   A booking has two ends. Move it and both travel together; take hold
   of one end and only that one moves, and the length changes by the
   difference. So there is one function with a shift for each end, and
   moving is the case where the two shifts are equal.

   Written that way rather than as a move plus a separate resize because
   the hard parts — stepping over weekend halves, keeping whole days
   whole, carrying off site along — are identical, and two copies of
   them would drift.

   Growing adds plain half-days: a booking stretched by an afternoon
   gains an afternoon that is on site, because nobody has said
   otherwise. Shrinking drops halves from whichever end was pulled, and
   what they carried goes with them.

   Null where there would be nothing left. Half a day is the smallest
   booking there is, and a drag that would take away the last of it is a
   drag that should do nothing rather than delete the work. */
export function resizeByHalves(days = [], startShift = 0, endShift = 0, weekend = {}) {
  if (!days.length) return { days: [], end: null };

  const sorted = [...days].sort((a, b) =>
    String(a.date || a.Work_Date).localeCompare(String(b.date || b.Work_Date)));
  const firstDate = String(sorted[0].date || sorted[0].Work_Date).slice(0, 10);
  const firstPart = sorted[0].part || sorted[0].Part || "Full";

  let parts = explodeHalves(sorted);
  const sS = Math.round(startShift);
  const eS = Math.round(endShift);

  /* ── How the length changes, and at which end ──

     Only the *difference* between the two shifts changes the length. An
     earlier version trimmed `sS` halves off the front and padded `eS`
     onto the back, which is the right arithmetic and the wrong order: a
     two-day booking moved four days is sS = eS = 8, and slicing 8
     halves off a list of 4 leaves nothing to pad back, so 8 fresh ones
     were added and a two-day booking arrived as a four-day one. The
     symptom only appears once the move is longer than the booking,
     which is why every short move looked right.

     So a move — equal shifts — changes nothing about the list. The
     halves travel with it, off site and all.

     A stretch changes it at the end that was dragged, so the halves at
     the other end keep their dates: pulling the left handle earlier
     prepends, pushing the right handle later appends. `sS === 0` is the
     right handle, since the drop handler zeroes whichever end was not
     grabbed; anything else is treated as the left. */
  const grow = eS - sS;
  const fresh = (n) => Array(n).fill(null).map(() => ({ offSite: false }));
  if (grow > 0) {
    parts = sS === 0 ? [...parts, ...fresh(grow)] : [...fresh(grow), ...parts];
  } else if (grow < 0) {
    parts = sS === 0 ? parts.slice(0, parts.length + grow) : parts.slice(-grow);
  }

  if (!parts.length) return null;

  /* Where it starts now, as a half-slot from midnight on its first day,
     and where that lands after the shift. Floor rather than truncate,
     so moving earlier across a day boundary goes to the afternoon of
     the day before rather than back to its morning. */
  const pos = (firstPart === "PM" ? 1 : 0) + sS;
  const dayDelta = Math.floor(pos / 2);
  const startPM = ((pos % 2) + 2) % 2 === 1;

  const dt = at(firstDate);
  if (!dt) return { days: [], end: null };
  dt.setDate(dt.getDate() + dayDelta);

  const start = resolveStartHalf(iso(dt), startPM, weekend, sS < 0 ? -1 : 1);
  if (!start) return { days: [], end: null };

  return layHalves(start.date, start.pm, parts, weekend);
}

/* The days an assignment covers, as rows to be marked up.

   Built from the two dates rather than stored as a count: a five-day
   assignment with a half-day Friday is not "four and a half days", it is
   five days one of which is a half, and only the second says which.

   Every calendar day in the range, weekends included. What the
   assignment actually works is laySchedule's answer, which steps over
   the weekend halves the rule does not cover — this is the raw span,
   and is what that stepping is measured against. */
export function daysBetween(start, end) {
  if (!start || !end || end < start) return [];
  const out = [];
  const [y, m, d] = start.split("-").map(Number);
  /* Noon, so a daylight-saving change cannot move a date by a day. */
  const at = new Date(y, m - 1, d, 12);
  const stop = (() => {
    const [ey, em, ed] = end.split("-").map(Number);
    return new Date(ey, em - 1, ed, 12);
  })();

  /* A guard rather than a while(true): a mistyped year gives a range of
     thirty thousand days and a page that never renders. */
  let guard = 0;
  while (at <= stop && guard++ < 400) {
    const p = (n) => String(n).padStart(2, "0");
    out.push(`${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`);
    at.setDate(at.getDate() + 1);
  }
  return out;
}

/* How many days a set of markings comes to. Half days count as halves,
   which is the figure a programme is measured in. */
export function dayTotal(parts = {}) {
  return Object.values(parts)
    .reduce((t, v) => t + (v === "Full" ? 1 : 0.5), 0);
}
