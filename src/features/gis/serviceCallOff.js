/* Which plots are on a service call-off, however they were chosen.

   ── One answer, three ways of reaching it ──

   A service call-off is a set of plots and the utilities being connected
   to them. It is not a run: gas and water go in on one visit and the
   electric follows a fortnight later, and neither is described by a
   length of trench.

   But a run is a good way of *choosing* plots, when somebody knows the
   trench from A8 to A14 serves everything they mean. So there are three
   ways in — typing a range, tapping seeds, or picking a run — and all
   three add to one list. Nothing downstream can tell which was used,
   because nothing downstream should care.

   ── Plot numbers are text ──

   12A is an ordinary plot. Sorted numerically where both are numbers,
   so 2 comes before 10 — sorted as text, 10 sits between 1 and 2, which
   reads as a mistake on a call-off. */

import { parsePlotRange } from "./plotRange.js";

/* The plot a seed stands for. The drawing holds the id; the call-off
   names the plot the way the site does, so a submission survives a plot
   being renumbered. */
export function plotOfSeed(seed, plotList = []) {
  if (seed?.Feature_Role !== "plot") return null;
  const row = plotList.find((p) =>
    Number(p.plot_id ?? p.Plot_ID) === Number(seed.Plot_ID));
  const n = row?.plot_number ?? row?.Plot_Number ?? seed.Label;
  return n == null ? null : String(n).trim();
}

/* Plots in the order a call-off should list them. */
export function sortPlots(plots = []) {
  return [...new Set(plots.filter((p) => p != null && String(p).trim()))]
    .map((p) => String(p).trim())
    .sort((a, b) => {
      const x = Number(a);
      const y = Number(b);
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

/* ── Typed ──

   "12-21, 25, 30-32". parsePlotRange already does this, and is what the
   plot placement uses — so the syntax somebody learns in one place
   works in the other.

   Checked against the drawing, because a call-off for plot 99 on a site
   that stops at 72 is a typing mistake and saying so now costs nothing.
   Not refused: a plot may be on the site and not yet on the drawing,
   and refusing would make the drawing the authority on what exists. */
export function plotsFromText(text, plotList = []) {
  const { numbers, bad, truncated } = parsePlotRange(text);
  const known = new Set(plotList
    .map((p) => String(p.plot_number ?? p.Plot_Number ?? "").trim())
    .filter(Boolean));

  return {
    plots: sortPlots(numbers),
    /* What could not be read at all — "12--15", or a stray word. */
    unreadable: bad,
    truncated,
    /* Read, but not on this drawing. */
    unknown: known.size ? numbers.filter((n) => !known.has(n)) : [],
  };
}

/* ── Tapped ──

   A seed toggles: tapping one that is already on the list takes it off.
   The alternative is a list that only grows and a separate remove
   action, which is two gestures for what is one decision. */
export function togglePlot(plots = [], plot) {
  if (plot == null) return plots;
  const p = String(plot).trim();
  if (!p) return plots;
  return plots.includes(p)
    ? plots.filter((x) => x !== p)
    : sortPlots([...plots, p]);
}

/* ── From a run ──

   Every plot served along a run of trench. The run itself is not kept:
   it was a way of choosing, and a service call-off that recorded which
   trench it came from would be claiming something about the work that
   is not true — the gang is connecting plots, not digging that run.

   `spans` are what spansBetween returns, each carrying the plots it
   serves, which is the same walk the mains call-off uses. */
export function plotsFromRun(spans = []) {
  return sortPlots(spans.flatMap((sp) => sp.plots || []));
}

/* ── Already done ──

   Plots on this project that have already been called off for a utility
   being asked for now.

   Flagged rather than removed. Twice is sometimes right — a service
   aborted and rescheduled, a plot revisited — and an application that
   quietly dropped them would be answering a question nobody asked. What
   is not right is nobody noticing. */
export function alreadyCalledOff(plots = [], utilityIds = [], priorCallOffs = []) {
  if (!plots.length || !utilityIds.length) return [];
  const wanted = new Set(utilityIds.map(Number));

  const done = new Set();
  for (const co of priorCallOffs) {
    const covers = (co.utility_ids || []).some((u) => wanted.has(Number(u)));
    if (!covers) continue;
    for (const p of co.plots || []) done.add(String(p).trim());
  }
  return plots.filter((p) => done.has(p));
}

/* What the call-off will say, for the panel to show before it is
   raised. */
export function serviceSummary(plots = [], utilityNames = []) {
  const n = plots.length;
  const who = utilityNames.length ? utilityNames.join(" \u00b7 ") : "no utilities yet";
  return `${n} plot${n === 1 ? "" : "s"} \u00b7 ${who}`;
}

/* The service call-offs already raised, from what listCallOffs returns.

   Its own function because three places re-read the call-offs — when a
   project opens, after a mains call-off is raised, and after a service
   one — and each mapped the rows itself. Three copies of one shape is
   three chances for the duplicate check to be reading something
   slightly different from what the panel shows. */
export function priorServicesFrom(rows = []) {
  return rows
    .filter((co) => co.Selection_Mode === "PlotList")
    .map((co) => ({
      submission: co.Submission_ID,
      status: co.Status,
      utility_ids: co.utility_ids || [],
      plots: (co.items || []).map((it) => String(it.Plot ?? "").trim()),
      /* When the gang is due. A plot already called off should say when
         rather than only that — "already on a call-off" invites the
         question this answers. */
      plannedFor: co.Preferred_Date ?? null,
      reference: co.AP_Number ?? null,
    }));
}

/* Whether a utility is connected to a plot.

   Street lighting is called off by column: a column is placed on the
   lighting layer, fed from the LV network, and has no plot at all. A
   lighting pill on a form that collects plot numbers would offer
   somebody a call-off that cannot be worked, and the mistake would only
   surface on site.

   Named by what it is rather than by a list of exclusions, so a utility
   added later is asked the same question instead of being let through
   because nobody remembered to exclude it. */
const PLOT_UTILITIES = ["electric", "gas", "water"];

export function servicedByPlot(utility) {
  const key = String(utility?.layer_key ?? utility?.Utility ?? "")
    .toLowerCase().replace(/[^a-z]/g, "");
  return PLOT_UTILITIES.includes(key);
}

/* Whether this would be the first electric service call-off on a site.

   ── Why it matters ──

   The first one energises the substation: the transformer is switched
   on and the network goes live. Real work, a day of it, and it happens
   as part of that visit rather than as a job of its own — so it is a
   phase on that call-off and on no other.

   ── What counts as one before it ──

   Any electric service call-off that has not been withdrawn. An
   abandoned one energised nothing, and treating it as the first would
   leave the site with the substation never switched on by anybody's
   programme.

   Aborted is not withdrawn. A call-off the gang could not work on the
   day is rescheduled rather than abandoned — the energisation is still
   coming, on whichever visit ends up doing it, and this call-off is
   still the one carrying it. */
export function firstElectricCallOff(priorCallOffs = [], electricUtilityId) {
  if (electricUtilityId == null) return false;
  const wanted = Number(electricUtilityId);

  return !priorCallOffs.some((co) => {
    if (/^withdrawn/i.test(String(co.status ?? ""))) return false;
    return (co.utility_ids || []).some((u) => Number(u) === wanted);
  });
}

/* The id of the electric utility, from the lookup list.

   By name, the way every other part of the drawing matches a utility to
   a layer — the Utility table has no key of its own to match on. */
export function electricUtilityId(utilities = []) {
  const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const row = utilities.find((u) => norm(u.Utility) === "electric");
  return row ? Number(row.Utility_ID) : null;
}

/* The utilities to test a plot against.

   Those ticked, where any have been. Where none have, every utility a
   plot can be connected to — because a panel that checks nothing until
   a box is ticked checks nothing at all for anybody who taps plots
   first, which is the order the panel invites.

   That was the fault: the rule was written to answer "can this plot be
   connected for what you have asked for", and until something is asked
   for the honest question is "can it be connected for anything". A plot
   fed from a dead main on every utility cannot. */
export function utilitiesToTest(serviceUtils = [], utilities = []) {
  const rows = utilities.filter(servicedByPlot);
  const chosen = serviceUtils.length
    ? rows.filter((u) => serviceUtils.map(Number).includes(Number(u.Utility_ID)))
    : rows;
  const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return chosen.map((u) => norm(u.Utility)).filter(Boolean);
}

/* ── Which utilities a service call-off may cover ──

   Electric on its own, or gas and water together.

   Not a rule invented here: it is how the work goes out. Gas and water
   are laid in one trench and connected on one visit, and the electric
   follows separately once the network is energised. A call-off for gas
   alone leaves the water gang a second visit to the same hole, and one
   for gas and electric together asks a gang to do two jobs that do not
   happen at the same time.

   ── Where a project has only some of them ──

   The combination is narrowed to what the site has. A gas-and-water
   project offers those two; a gas-only project offers gas alone, and
   that is a whole call-off rather than half of one. Offering water on a
   site with no water is offering a call-off nobody can raise.

   Kept here rather than in the panel because the panel is where it
   would be written twice — once to decide which pills to show and once
   to decide whether the selection is allowed. */
const SERVICE_GROUPS = [
  { key: "electric", members: ["electric"], label: "Electric" },
  { key: "gaswater", members: ["gas", "water"], label: "Gas & Water" },
];

const normKey = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");

/* The groups this project can raise, each narrowed to the utilities it
   actually has. A group with nothing left is not offered. */
export function serviceGroupsFor(projectUtilities = []) {
  const have = new Set(projectUtilities
    .map((u) => normKey(u.layer_key ?? u.Utility))
    .filter(Boolean));

  return SERVICE_GROUPS
    .map((g) => {
      const members = g.members.filter((m) => have.has(m));
      return {
        ...g,
        members,
        /* Named for what is actually there: a gas-only site should read
           "Gas", not "Gas & Water" with the water greyed out. */
        label: members.length === g.members.length
          ? g.label
          : members.map((m) => m[0].toUpperCase() + m.slice(1)).join(" & "),
      };
    })
    .filter((g) => g.members.length);
}

/* Whether a set of chosen utilities is one whole group.

   Not "at least one": half of a group is the case this exists to stop.
   Somebody who ticks gas on a site with water has asked for a visit
   that leaves the water gang a second trip to the same trench. */
export function isWholeGroup(chosen = [], groups = []) {
  if (!chosen.length) return false;
  const picked = [...new Set(chosen.map(normKey))].sort();
  return groups.some((g) =>
    [...g.members].sort().join() === picked.join());
}

/* What to say when somebody taps a plot before choosing. */
export function chooseUtilityFirst(groups = []) {
  const names = groups.map((g) => g.label);
  return names.length
    ? `Choose what is being connected first \u2014 ${names.join(" or ")}.`
    : "This project has no utilities set up to connect.";
}

/* Statuses a service call-off has finished at.

   A plot on a finished call-off is connected, and the question of
   whether to call it off again is a different one — this is about work
   already booked and not yet done. */
const DONE = ["Complete", "Aborted", "Withdrawn (Customer)", "Withdrawn (Aptus)"];

/* A call-off already booked for this plot on one of these utilities,
   and not yet finished.

   Which is a third answer beside live and dead: the plot is fine, the
   main may or may not be, and the work is already going out. Adding it
   to a second call-off would send two gangs to one plot. */
export function bookedFor(plot, utilityIds = [], priorCallOffs = []) {
  if (plot == null || !utilityIds.length) return null;
  const wanted = new Set(utilityIds.map(Number));
  const key = String(plot).trim();

  const hits = priorCallOffs.filter((co) => {
    if (DONE.includes(String(co.status ?? ""))) return false;
    if (!(co.utility_ids || []).some((u) => wanted.has(Number(u)))) return false;
    return (co.plots || []).some((p) => String(p).trim() === key);
  });
  if (!hits.length) return null;

  /* The soonest, where a plot somehow sits on two: the earliest visit
     is the one that answers "when is this happening". */
  const sorted = [...hits].sort((a, b) =>
    String(a.plannedFor ?? "9999").localeCompare(String(b.plannedFor ?? "9999")));
  return sorted[0];
}
