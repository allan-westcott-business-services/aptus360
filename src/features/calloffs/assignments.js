/* Putting teams on the phases of a call-off.

   A work type is done in phases, each needing a craft, and a team may
   work a phase only if it holds that craft and covers the region. One
   phase can carry several assignments — Team A on plots 1 to 5, Team B
   on 6 to 9 — so work runs in parallel where the site allows.

   The rules live here rather than in the panel because they have edges,
   and because the interesting ones are about time: a phase cannot start
   before the one before it, and a team cannot be in two places at once. */

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
export function earliestStart(phases = [], assignments = [], taskTypeId, plots = []) {
  const order = new Map(phases.map((p, i) => [Number(p.Task_Type_ID), i]));
  const mine = order.get(Number(taskTypeId));
  if (mine == null) return null;

  const want = new Set(plots.map(String));
  let floor = null;
  let why = null;

  for (const a of assignments) {
    const theirs = order.get(Number(a.Task_Type_ID));
    if (theirs == null || theirs >= mine) continue;

    if (want.size) {
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
  teamName = () => null) {
  const out = new Map();
  for (const a of assignments) {
    if (Number(a.Task_Type_ID) !== Number(taskTypeId)) continue;
    if (exceptId != null && Number(a.Assignment_ID) === Number(exceptId)) continue;
    for (const p of parsePlots(a.Plot_Range)) {
      if (!out.has(p)) out.set(p, teamName(a.Team_ID) ?? `team ${a.Team_ID}`);
    }
  }
  return out;
}

/* Everything wrong with a proposed assignment, as a list. */
export function validate(draft, opts = {}) {
  const { phases = [], assignments = [], today = null, exceptId = null } = opts;
  const out = [];

  if (!draft.Team_ID) out.push("Choose a team.");
  if (!draft.Start_Date || !draft.End_Date) out.push("Give both a start and an end.");

  if (draft.Start_Date && draft.End_Date && draft.End_Date < draft.Start_Date) {
    out.push("The end is before the start.");
  }
  /* Not in the past. An assignment somebody cannot turn up for is a
     typo, and it is nearly always a year mistyped. */
  if (today && draft.Start_Date && draft.Start_Date < today) {
    out.push("The start is in the past.");
  }

  const plots = parsePlots(draft.Plot_Range);
  const floor = earliestStart(phases, assignments, draft.Task_Type_ID, plots);
  if (floor && draft.Start_Date && draft.Start_Date < floor.date) {
    out.push(`${floor.phase ?? "The previous phase"} starts on ${floor.date} `
      + "\u2014 this phase cannot begin before it.");
  }

  /* Plots another team already has on this phase.

     Checked here as well as disabled in the panel: a disabled pill is a
     hint, and a selection made before another assignment was saved would
     otherwise go through. */
  const taken = takenPlots(assignments, draft.Task_Type_ID, exceptId);
  const doubled = plots.filter((p) => taken.has(p));
  if (doubled.length) {
    out.push(`Plot${doubled.length === 1 ? "" : "s"} ${doubled.join(", ")} `
      + `already assigned on this phase.`);
  }

  if (!plots.length) out.push("Choose at least one plot.");

  const clashes = clashesFor(draft.Team_ID, draft.Start_Date, draft.End_Date,
    assignments, exceptId);
  if (clashes.length) {
    out.push(`That team is already booked ${clashes[0].Start_Date} to `
      + `${clashes[0].End_Date}.`);
  }

  return out;
}


/* The days an assignment covers, as rows to be marked up.

   Built from the two dates rather than stored as a count: a five-day
   assignment with a half-day Friday is not "four and a half days", it is
   five days one of which is a half, and only the second says which.

   Weekends are included. A gang working a Saturday is ordinary on a
   programme under pressure, and leaving them out would mean the form
   silently disagreeing with what was agreed. */
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
