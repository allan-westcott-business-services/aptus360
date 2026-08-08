/* The schedule, as geometry.

   Everything the Planning board needs to work out where a bar goes and
   which row it goes in, with no React and no DOM. Features in,
   positions out — the same split the GIS modules use, and for the same
   reason: this is the part that is worth being sure about, and a
   calculation inside a component can only be checked by looking at it.

   ── Half-days are the unit ──

   Not pixels, and not milliseconds. A day on this board is two slots,
   because the smallest thing anybody schedules is a morning, and every
   position and width is a whole number of those slots. Rounding a date
   to a percentage and back is what makes a bar that should end on
   Friday finish a hair into Saturday, and at two months across, a hair
   is a day.

   ── Where the halves come from ──

   Call_Off_Work_Day, one row per day worked, each saying Full, AM or
   PM. That is a better record than the original had — it encoded the
   half in the *time* of a timestamp, 08:00 for a morning and 13:00 for
   an afternoon, which cannot say that a gang works Monday afternoon and
   all of Tuesday. So the footprint is read from the days where they
   exist, and falls back to the assignment's own start and end where
   they do not, which is what an assignment made before that table
   existed looks like.

   A gap in the middle is kept. A gang off on the Wednesday has two days
   either side of nothing, and the bar spans the lot rather than being
   drawn as two — the work is one booking, and splitting it on screen
   would say a team was free on a day nobody can book. */

export const DAY_MS = 86400000;

/* Midnight local, as a number. Dates arrive as "2026-08-17" and have to
   line up with a range whose start is midnight where the reader is —
   parsing them as UTC puts every bar an hour out west of Greenwich in
   summer, which reads as a bar starting the evening before. */
export function dayMs(d) {
  if (!d) return NaN;
  const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
  if (!y || !m || !dd) return NaN;
  return new Date(y, m - 1, dd).getTime();
}

export function todayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const toISO = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Every day in the window, as midnights. */
export function daysInRange(startMs, rangeDays) {
  const out = [];
  for (let i = 0; i < rangeDays; i++) out.push(startMs + i * DAY_MS);
  return out;
}

export const isWeekend = (ms) => {
  const d = new Date(ms).getDay();
  return d === 0 || d === 6;
};

/* ── The footprint of one booking, in half-day slots ──

   Slot 0 is the morning of the first day in the window; odd slots are
   afternoons. Slots may be negative or past the end — a booking that
   started last week is still drawn, clipped, because a bar that
   vanished when you paged forward would read as work that had been
   cancelled.

   `parts` is the day rows for this assignment, if any. Only the first
   and last matter to the shape: a Full day in the middle is two slots
   whatever it says, and a middle day marked AM does not make the bar
   narrower there — the booking still occupies that day on that team's
   row, and drawing a notch in it would say the team was free for the
   afternoon when the day before and after are booked solid. */
export function halfSpan({ startDate, endDate, parts = [] }, rangeStartMs) {
  const sorted = [...parts]
    .filter((p) => p && p.Work_Date)
    .sort((a, b) => String(a.Work_Date).localeCompare(String(b.Work_Date)));

  const firstDay = sorted.length ? sorted[0].Work_Date : startDate;
  const lastDay = sorted.length ? sorted[sorted.length - 1].Work_Date : endDate;

  const startMs = dayMs(firstDay);
  const endMs = dayMs(lastDay || firstDay);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  const startPart = sorted.length ? (sorted[0].Part || "Full") : "Full";
  const endPart = sorted.length
    ? (sorted[sorted.length - 1].Part || "Full") : "Full";

  const startDayIdx = Math.round((startMs - rangeStartMs) / DAY_MS);
  const endDayIdx = Math.round((endMs - rangeStartMs) / DAY_MS);

  /* A PM start begins in the second half of its day; an AM end finishes
     at midday. Everything else runs the whole day. */
  const startHalf = startDayIdx * 2 + (startPart === "PM" ? 1 : 0);
  const endHalf = endDayIdx * 2 + (endPart === "AM" ? 1 : 2);

  return {
    startHalf,
    lengthHalves: Math.max(1, endHalf - startHalf),
    startDate: firstDay,
    endDate: lastDay || firstDay,
  };
}

/* The days between a booking's first and last that carry no work.

   Half-slot ranges, in the same coordinates as the span they sit
   inside, so the board can draw them without converting anything. A day
   worked as a half leaves the other half a gap, which is right: a
   Saturday morning is a morning, and the afternoon of it is not being
   worked any more than the Sunday is. */
export function gapsIn(parts = [], span, rangeStartMs) {
  if (!span || !parts.length) return [];

  const worked = new Map();
  for (const p of parts) {
    if (!p?.Work_Date) continue;
    worked.set(String(p.Work_Date).slice(0, 10), p.Part || "Full");
  }

  const out = [];
  const first = Math.floor(span.startHalf / 2);
  const last = Math.floor((span.startHalf + span.lengthHalves - 1) / 2);
  for (let d = first; d <= last; d++) {
    const iso = toISO(rangeStartMs + d * DAY_MS);
    const part = worked.get(iso);
    /* Not in the list at all, so neither half is worked. */
    if (!part) { out.push({ startHalf: d * 2, lengthHalves: 2 }); continue; }
    if (part === "AM") out.push({ startHalf: d * 2 + 1, lengthHalves: 1 });
    if (part === "PM") out.push({ startHalf: d * 2, lengthHalves: 1 });
  }

  /* Trimmed to the booking, since the first and last day may themselves
     be halves and the loop above works in whole days. */
  const from = span.startHalf;
  const to = span.startHalf + span.lengthHalves;
  return out
    .map((g) => ({
      startHalf: Math.max(g.startHalf, from),
      lengthHalves: Math.min(g.startHalf + g.lengthHalves, to)
        - Math.max(g.startHalf, from),
    }))
    .filter((g) => g.lengthHalves > 0);
}

/* ── Lanes ──

   Two bookings on one row that overlap in time would sit on top of each
   other, and the one underneath would be invisible rather than obviously
   hidden — a team double-booked would look like a team booked once,
   which is the opposite of what a planner opened this to find out.

   So overlapping items drop onto their own lane within the row, and the
   row grows. First fit by start, longest first among equal starts, so a
   long booking takes the top lane and short ones fill in beneath rather
   than the reverse. */
export function packLanes(spans = []) {
  const sorted = [...spans].sort((a, b) =>
    a.startHalf - b.startHalf || b.lengthHalves - a.lengthHalves);

  const laneEnds = [];
  for (const sp of sorted) {
    let lane = laneEnds.findIndex((end) => end <= sp.startHalf);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(sp.startHalf + sp.lengthHalves);
    } else {
      laneEnds[lane] = sp.startHalf + sp.lengthHalves;
    }
    sp.lane = lane;
  }
  return { spans: sorted, laneCount: Math.max(1, laneEnds.length) };
}

/* ── Colours per phase ──

   A phase is recognised by name where the name is one of the three
   everybody knows, and takes a colour from the palette otherwise. The
   named ones are worth fixing because a planner reads the board by
   colour before reading a word of it, and excavation being purple on
   Monday and teal on Tuesday because somebody added a phase in between
   would undo that.

   Position in the palette rather than a hash: two phases next to each
   other in the list are next to each other on the board, and adjacent
   palette entries are the furthest apart in hue. */
const PALETTE = [
  "#7c3aed", "#0891b2", "#16a34a", "#dc2626", "#ea580c",
  "#0d9488", "#4338ca", "#be185d", "#65a30d", "#0369a1",
];

export function phaseColours(taskTypes = []) {
  const named = (name) => {
    const n = String(name || "").toLowerCase().trim();
    if (n.startsWith("excav") || n.startsWith("lay")) return "#7c3aed";
    if (n.startsWith("joint")) return "#d97706";
    if (n.startsWith("reinstate")) return "#2563eb";
    return null;
  };
  const out = new Map();
  taskTypes.forEach((t, i) => {
    out.set(Number(t.Task_Type_ID),
      named(t.Task_Type_Name) || PALETTE[i % PALETTE.length]);
  });
  return out;
}

/* ── Excavation and laying are one phase ──

   They are dug and laid by the same gang in the same visit, and the
   call-off view already treats them as one. On the board they matter
   only for the unassigned chips: listing both would put two chips on
   one day for a single piece of work, and a planner counting what is
   outstanding would count it twice.

   So the pair collapses onto an anchor — the excavation where there is
   one, the first laying where there is not — and the rest are folded
   away. */
export function mergeExcavateAndLay(taskTypeIds = [], taskTypeById = new Map()) {
  const rows = taskTypeIds.map((id) => taskTypeById.get(Number(id))).filter(Boolean);
  const is = (t, p) => String(t.Task_Type_Name || "").toLowerCase().trim().startsWith(p);
  const exc = rows.find((t) => is(t, "excav"));
  const lays = rows.filter((t) => is(t, "lay"));
  const anchorId = exc ? Number(exc.Task_Type_ID)
    : (lays[0] ? Number(lays[0].Task_Type_ID) : null);
  const fold = new Set(lays.map((t) => Number(t.Task_Type_ID))
    .filter((id) => id !== anchorId));
  return { anchorId, fold, hasExcavation: !!exc };
}

/* ── The board's rows ──

   One function rather than five, because the pivots differ only in what
   they group by and every one of them has to agree about what a bar
   is. Five copies of the item shape is how the region view ends up
   showing a label the team view does not.

   `data` is what the endpoint returns, plus the derived maps the page
   builds once. */
export function buildRows(data, opts = {}) {
  const {
    pivot = "team",
    rangeStart = todayMs(),
    rangeDays = 14,
    activeTeamsOnly = false,
    collapsedGroups = new Set(),
  } = opts;

  const rangeEnd = rangeStart + rangeDays * DAY_MS;
  const {
    submissions = [], assignments = [], workDays = [],
    taskTypes = [], workTypeTasks = [], workTypes = [],
    teams = [], regions = [], projects = [], people = [],
  } = data;

  const subById = new Map(submissions.map((s) => [Number(s.Submission_ID), s]));
  const taskById = new Map(taskTypes.map((t) => [Number(t.Task_Type_ID), t]));
  const projById = new Map(projects.map((p) => [Number(p.Project_ID), p]));
  const personById = new Map(people.map((p) => [Number(p.Person_ID), p]));
  const colours = phaseColours(taskTypes);

  const daysByAssignment = new Map();
  for (const d of workDays) {
    const k = Number(d.Assignment_ID);
    if (!daysByAssignment.has(k)) daysByAssignment.set(k, []);
    daysByAssignment.get(k).push(d);
  }

  const tasksForWorkType = (wtId) => workTypeTasks
    .filter((m) => Number(m.Work_Type_ID) === Number(wtId))
    .sort((a, b) => (a.Display_Order ?? 0) - (b.Display_Order ?? 0))
    .map((m) => Number(m.Task_Type_ID));

  /* The project a call-off belongs to, which is where its region and
     its manager come from. The original went through Contract; this
     application is organised around Project, and a call-off is raised
     against one. */
  const projectOf = (sub) => (sub?.Project_ID != null
    ? projById.get(Number(sub.Project_ID)) : null);

  /* ── What a bar is labelled with ──

     The project number, not the call-off's own reference.

     A bar is a couple of centimetres wide and carries one line of text,
     so that line has to be the thing somebody scanning the board is
     looking for — and that is the site, which they know by its project
     number. A call-off reference identifies the request rather than the
     job, and a week's worth of them tells you how many requests are
     open without telling you which sites are being worked.

     Falls back through the AP number to the submission id. Both are
     worse than the project number and better than a blank bar: a
     call-off raised against no project is a fault, and it should be
     visible on the board rather than drawn as an unlabelled block. */
  const refOf = (sub) => {
    const project = projectOf(sub);
    return project?.Display_Ref
      || project?.Project_Ref
      || sub?.AP_Number
      || `#${sub?.Submission_ID ?? "?"}`;
  };

  const itemFor = (a) => {
    const sub = subById.get(Number(a.Submission_ID));
    const parts = daysByAssignment.get(Number(a.Assignment_ID)) || [];
    const span = halfSpan({
      startDate: a.Start_Date, endDate: a.End_Date, parts,
    }, rangeStart);
    if (!span) return null;
    const task = taskById.get(Number(a.Task_Type_ID));
    return {
      kind: "assignment",
      id: `a${a.Assignment_ID}`,
      assignmentId: Number(a.Assignment_ID),
      submissionId: Number(a.Submission_ID),
      taskTypeId: Number(a.Task_Type_ID),
      ...span,
      ref: refOf(sub),
      /* The call-off's own reference, kept alongside rather than
         dropped: the bar does not show it, but the panel behind the bar
         is where somebody goes to find the request, and that is what
         they will search the call-off list for. */
      apNumber: sub?.AP_Number || null,
      phase: task?.Task_Type_Name || `Phase ${a.Task_Type_ID}`,
      label: `${refOf(sub)} \u00b7 `
        + `${task?.Task_Type_Name || `Phase ${a.Task_Type_ID}`}`
        + (a.Plot_Range ? ` \u00b7 Plots ${a.Plot_Range}` : ""),
      colour: colours.get(Number(a.Task_Type_ID)) || "#6b7280",
      /* Any day off site marks the whole booking. It is a warning that
         the gang leaves the development, and it applies to the visit
         rather than to the Tuesday of it. */
      offSite: parts.some((p) => p.Off_Site),
      /* ── Days inside the bar that nobody is working ──

         A booking that runs Friday to Wednesday over a weekend it does
         not work is one booking with two empty days in the middle, and
         a solid bar across them says the gang is on site. So the holes
         come out as half-slot ranges for the board to draw through,
         measured the same way the bar itself is so the two line up.

         Any missing day, not only a weekend: a gang off on the
         Wednesday leaves the same hole and deserves the same mark.

         Empty where there are no day rows at all — nothing is then
         known about the middle of the booking, and drawing it full of
         holes would be inventing that. */
      gaps: gapsIn(parts, span, rangeStart),
      /* The day rows, normalised, in date order. The board lays a drag
         out from these — it is the same list the endpoint will work
         from, in the same shape, so what a bar does the instant it is
         dropped is what the database is about to be told. */
      parts: [...parts]
        .map((p) => ({
          date: String(p.Work_Date).slice(0, 10),
          part: p.Part || "Full",
          offSite: !!p.Off_Site,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      projectId: sub?.Project_ID ?? null,
      raw: a,
      sub,
    };
  };

  /* Only what the window can show. Computed on the half-span rather
     than on the dates, so the two cannot disagree about whether a
     booking that ends at midday on the first day is visible. */
  const maxHalf = rangeDays * 2;
  const visible = (it) => it
    && it.startHalf < maxHalf
    && it.startHalf + it.lengthHalves > 0;

  const liveAssignments = assignments
    .map(itemFor)
    .filter(visible);

  /* ── Phases nobody has taken ──

     Every phase a call-off's work type involves, less the ones that
     already have a team, drawn at the date the customer asked for. The
     point of them is the question a planner is actually asking: this is
     wanted on the 14th, is there a gang free that week?

     A day wide by default, because no one has said how long it will
     take yet. */
  const assignedKey = new Set(assignments
    .map((a) => `${a.Submission_ID}|${a.Task_Type_ID}`));

  const unassignedItems = () => {
    const out = [];
    for (const sub of submissions) {
      if (!sub.Preferred_Date) continue;
      const ids = tasksForWorkType(sub.Work_Type_ID);
      const merge = mergeExcavateAndLay(ids, taskById);
      for (const tid of ids) {
        if (merge.fold.has(Number(tid))) continue;
        if (assignedKey.has(`${sub.Submission_ID}|${tid}`)) continue;
        const task = taskById.get(Number(tid));
        if (!task) continue;
        const span = halfSpan({
          startDate: sub.Preferred_Date, endDate: sub.Preferred_Date, parts: [],
        }, rangeStart);
        if (!span) continue;
        const name = (Number(tid) === merge.anchorId && merge.hasExcavation)
          ? "Excavation and Lay" : task.Task_Type_Name;
        out.push({
          kind: "unassigned",
          id: `u${sub.Submission_ID}-${tid}`,
          submissionId: Number(sub.Submission_ID),
          taskTypeId: Number(tid),
          ...span,
          ref: refOf(sub),
          apNumber: sub.AP_Number || null,
          phase: name,
          label: `${refOf(sub)} \u00b7 ${name}`,
          colour: colours.get(Number(tid)) || "#6b7280",
          offSite: false,
          projectId: sub.Project_ID ?? null,
          sub,
        });
      }
    }
    return out;
  };

  if (pivot === "team") {
    const rows = [{
      key: "unassigned",
      label: "Unassigned",
      isUnassigned: true,
      items: unassignedItems().filter(visible),
    }];
    for (const team of teams) {
      const items = liveAssignments
        .filter((it) => Number(it.raw.Team_ID) === Number(team.Team_ID));
      if (activeTeamsOnly && !items.length) continue;
      rows.push({
        key: `team-${team.Team_ID}`,
        label: team.Team_Name + (team.Active === false ? " (inactive)" : ""),
        items,
      });
    }
    return rows;
  }

  if (pivot === "region") {
    /* Three ways for a call-off to have no region, kept apart rather
       than gathered into one "Unknown". They are different faults with
       different fixes — a call-off raised against no project, a project
       that has gone, and a project nobody has given a region — and one
       bucket would send somebody looking in the wrong place. */
    const regionName = new Map(regions.map((r) => [Number(r.Region_ID), r.Region]));
    const DIAG = {
      "no-project": "\u2014 Not linked to a project \u2014",
      "no-region": "\u2014 No region on the project \u2014",
    };
    const groups = new Map();
    for (const it of liveAssignments) {
      const project = projectOf(it.sub);
      let key;
      if (!it.sub?.Project_ID) key = "no-project";
      else if (!project) key = "no-project";
      else if (project.Region_ID == null) key = "no-region";
      else key = String(Number(project.Region_ID));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    return [...groups].map(([key, items]) => ({
      key: `region-${key}`,
      label: DIAG[key] || regionName.get(Number(key)) || `Region #${key}`,
      items,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (pivot === "worktype") {
    const wtName = new Map(workTypes
      .map((w) => [Number(w.Work_Type_ID), w.Work_Type_Name]));
    const groups = new Map();
    for (const it of liveAssignments) {
      const key = String(Number(it.sub?.Work_Type_ID) || 0);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    return [...groups].map(([key, items]) => ({
      key: `worktype-${key}`,
      label: Number(key) === 0
        ? "\u2014 No work type \u2014"
        : (wtName.get(Number(key)) || `Work type #${key}`),
      items,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (pivot === "ref") {
    /* One row per call-off, carrying both what is booked and what is
       still outstanding on it. The project-centric read: pick a
       reference and see everything for it on one line, which is the
       view somebody wants on the phone to a developer. */
    const groups = new Map();
    const push = (sid, it) => {
      const k = String(sid);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    };
    for (const it of liveAssignments) push(it.submissionId, it);
    for (const it of unassignedItems().filter(visible)) push(it.submissionId, it);

    return [...groups].map(([sid, items]) => {
      const sub = subById.get(Number(sid));
      const site = sub?.Site_Name ? ` \u00b7 ${sub.Site_Name}` : "";
      /* The project number, as on the bars. The call-off's own
         reference is often not set at all — a submission raised from
         the drawing has no AP number until somebody types one — and the
         row then read "#12", which is a database id and tells nobody
         which site it is.

         The work type stays on the end, because one project raises
         several call-offs and they all carry the same number: without
         it the pivot shows three rows called 2607.001 and no way to
         tell the mains from the services. */
      const wt = workTypes.find((w) =>
        Number(w.Work_Type_ID) === Number(sub?.Work_Type_ID))?.Work_Type_Name;
      return {
        key: `ref-${sid}`,
        label: `${refOf(sub)}${site}${wt ? ` \u00b7 ${wt}` : ""}`,
        submissionId: Number(sid),
        items,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (pivot === "pm") {
    /* Grouped twice: by manager, and by team within them. A team works
       for more than one manager, so it appears under each — the row is
       "this team, on this manager's work", not the team's whole week.

       The header carries the count so a collapsed group still says how
       much is under it. */
    const byPm = new Map();
    for (const it of liveAssignments) {
      const project = projectOf(it.sub);
      const pm = project?.Project_Manager_ID ?? 0;
      const teamId = Number(it.raw.Team_ID) || 0;
      if (!byPm.has(pm)) byPm.set(pm, new Map());
      const teamsMap = byPm.get(pm);
      if (!teamsMap.has(teamId)) teamsMap.set(teamId, []);
      teamsMap.get(teamId).push(it);
    }

    const pmName = (id) => (Number(id) === 0
      ? "\u2014 No project manager \u2014"
      : (personById.get(Number(id))?.Person_Name || `Manager #${id}`));
    const teamName = (id) => (Number(id) === 0
      ? "\u2014 No team \u2014"
      : (teams.find((t) => Number(t.Team_ID) === Number(id))?.Team_Name
        || `Team #${id}`));

    const rows = [];
    for (const pm of [...byPm.keys()]
      .sort((a, b) => pmName(a).localeCompare(pmName(b)))) {
      const teamsMap = byPm.get(pm);
      const count = [...teamsMap.values()].reduce((n, xs) => n + xs.length, 0);
      const collapsed = collapsedGroups.has(String(pm));
      const colour = (Number(pm) !== 0
        && personById.get(Number(pm))?.Planner_Colour) || "#64748b";
      rows.push({
        type: "group",
        key: `pm-${pm}`,
        groupId: String(pm),
        label: pmName(pm),
        colour,
        count,
        collapsed,
        items: [],
      });
      if (collapsed) continue;
      for (const teamId of [...teamsMap.keys()]
        .sort((a, b) => teamName(a).localeCompare(teamName(b)))) {
        rows.push({
          key: `pm-${pm}-team-${teamId}`,
          label: teamName(teamId),
          groupColour: colour,
          items: teamsMap.get(teamId),
        });
      }
    }
    return rows;
  }

  return [];
}

/* ── Days with something on them ──

   What "jump to the next call-off" jumps to. Every date the board could
   possibly draw something on, whatever pivot is showing — a preferred
   date or a day somebody is working — so the jump lands on work that
   exists rather than on work this grouping happens to show.

   Sorted, de-duplicated midnights. */
export function activeDays(data) {
  const { submissions = [], assignments = [], workDays = [] } = data;
  const out = new Set();
  const add = (d) => {
    const ms = dayMs(d);
    if (Number.isFinite(ms)) out.add(ms);
  };
  for (const s of submissions) add(s.Preferred_Date);
  for (const a of assignments) add(a.Start_Date);
  for (const w of workDays) add(w.Work_Date);
  return [...out].sort((a, b) => a - b);
}

export const nextActiveDay = (days, afterMs) =>
  days.find((d) => d > afterMs) ?? null;

export const prevActiveDay = (days, beforeMs) =>
  [...days].reverse().find((d) => d < beforeMs) ?? null;
