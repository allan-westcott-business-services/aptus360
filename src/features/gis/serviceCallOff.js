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
