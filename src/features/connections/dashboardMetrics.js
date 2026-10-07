/* What the Plot Connections dashboard counts.

   Ported from the original Aptus360 app, where the whole dashboard —
   sections, metrics, KPIs, predicates and rendering — lived in one
   8 MB index.html. Here the rules live apart from the screen, because
   the rules are the part that can be wrong in a way nobody sees: a
   card reading 412 looks exactly as convincing when the predicate is
   wrong as when it is right.

   ── What a metric is ──

   A row of Plot_Utility that should not be in the state it is in: a
   visit programmed a week ago with no service card, a gas plot whose
   meter card arrived before its service card. Each is a `predicate`
   over a row plus a shared `ctx`, and the count on the card and the
   rows the card opens come from that one function, so they cannot
   disagree.

   ── Why the outcome and status are matched on the WORD ──

   The original compares `r.Visit_Outcome` and `r.Status_Of_Pack`
   against 'Aborted', 'Completed', 'Issued' and so on. This system
   holds those as ids against lookup tables, so the caller passes
   resolvers that turn an id into the word. Matching on the word keeps
   the predicates readable next to the originals and means a lookup
   table renumbered tomorrow changes nothing here — the trap that put
   33,000 connections on the wrong utility was an id assumed to mean
   the same thing in two systems.

   Trimmed and compared case-insensitively because these values arrive
   from imports as well as from dropdowns, and 'Pack In Progress' has
   turned up as 'Pack in Progress'. */

export const SECTIONS = [
  {
    id: "jointing",
    title: "Jointing Dashboard",
    icon: "🔧",
    description: "Jointing progress and close-out exceptions.",
    accent: "#0f766e",
  },
  {
    id: "admin",
    title: "Admin Dashboard",
    icon: "📁",
    description: "Service card, meter card and as-laid paperwork exceptions.",
    accent: "#39467B",
  },
  {
    id: "pm",
    title: "Project Manager Dashboard",
    icon: "📈",
    description: "Contract-level oversight.",
    accent: "#b45309",
  },
];

/* ── Dates ──────────────────────────────────────────────────────────

   Working days, Monday to Friday, counted backwards from today. The
   metrics are about paperwork being late, and paperwork is not late
   for having been due over a weekend. */
export function workingDaysAgo(n, today = new Date()) {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  let counted = 0;
  while (counted < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) counted++;
  }
  return d;
}

/* A yyyy-mm-dd string against a Date at midnight, parsed as LOCAL.
   Postgres hands back naïve dates and a row programmed for 2026-05-01
   is that day whoever is looking at it; `new Date('2026-05-01')` would
   read it as UTC midnight and put it on the day before for anyone west
   of Greenwich. */
export function dateBefore(dateStr, threshold) {
  if (isBlank(dateStr)) return false;
  return new Date(String(dateStr).slice(0, 10) + "T00:00:00") < threshold;
}

/* Null, undefined, '' and whitespace all mean "not set". Imported rows
   carry empty strings where a dropdown would write null, and a card
   that treats '' as a value counts rows that have nothing in them. */
export function isBlank(v) {
  return v == null || String(v).trim() === "";
}

const sameWord = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export function daysBetween(from, to) {
  if (isBlank(from) || isBlank(to)) return null;
  const a = new Date(String(from).slice(0, 10) + "T00:00:00");
  const b = new Date(String(to).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

export function workingDaysBetween(from, to) {
  if (isBlank(from) || isBlank(to)) return null;
  const a = new Date(String(from).slice(0, 10) + "T00:00:00");
  const b = new Date(String(to).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const sign = b < a ? -1 : 1;
  let [lo, hi] = b < a ? [b, a] : [a, b];
  let n = 0;
  const cur = new Date(lo);
  while (cur < hi) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n * sign;
}

/* Monday to Friday of the week before the one `today` falls in. */
export function prevWeekRange(today = new Date()) {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  /* getDay() is 0 for Sunday, so a Sunday belongs to the week that
     started six days earlier rather than to the one starting tomorrow. */
  const back = (d.getDay() + 6) % 7;
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - back);
  const start = new Date(thisMonday);
  start.setDate(thisMonday.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return { start: isoDate(start), end: isoDate(end) };
}

export function isoDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateInRange(value, start, end) {
  if (isBlank(value)) return false;
  const v = String(value).slice(0, 10);
  return v >= start && v <= end;
}

/* ── The context every predicate shares ─────────────────────────────

   Built once per pass and handed to every predicate, so a card's count
   and the rows it opens are produced by the same comparison against
   the same moment. Recomputing "five working days ago" inside each
   predicate would let the count and the drill-down straddle midnight
   and disagree.

   `utility`, `outcome` and `packStatus` are resolvers supplied by the
   caller, turning this system's ids into the words the predicates read. */
export function buildCtx({ utility, outcome, packStatus, today = new Date() } = {}) {
  const util = (r) => String(utility ? utility(r.Utility_ID) ?? "" : "").toLowerCase();
  const out = (r) => (outcome ? outcome(r.Visit_Outcome_ID) ?? r.Visit_Outcome ?? "" : r.Visit_Outcome ?? "");
  const pack = (r) => (packStatus ? packStatus(r.Pack_Status_ID) ?? "" : "");
  return {
    today,
    twoDaysAgo: workingDaysAgo(2, today),
    fiveDaysAgo: workingDaysAgo(5, today),
    prevWeek: prevWeekRange(today),
    utilityOf: util,
    isGas: (r) => util(r) === "gas",
    isElectric: (r) => util(r) === "electric",
    isWater: (r) => util(r) === "water",
    outcomeOf: out,
    isOutcome: (r, ...names) => names.some((n) => sameWord(out(r), n)),
    isAborted: (r) => sameWord(out(r), "Aborted"),
    packIs: (r, ...names) => {
      const cur = pack(r);
      if (isBlank(cur)) return false;
      return names.some((n) => sameWord(cur, n));
    },
  };
}

/* ── The cards ──────────────────────────────────────────────────────

   Each one is a question somebody asks every week. The description is
   the question in words and the predicate is the same question in
   code; if they ever drift, the description is what people trust. */
export const METRICS = [
  {
    id: "late_no_card",
    group: "admin",
    title: "Late visits — no service card",
    icon: "⏰",
    accent: "#dc2626",
    description:
      "Programmed Date is more than 5 working days ago, but no Service Card "
      + "Submission Date has been recorded. Aborted and Dead Jointed visits "
      + "are excluded.",
    predicate: (r, ctx) =>
      !isBlank(r.Programmed_Date)
      && !ctx.isOutcome(r, "Aborted", "Dead Jointed")
      && isBlank(r.Service_Card_Submission_Date)
      && dateBefore(r.Programmed_Date, ctx.fiveDaysAgo),
  },
  {
    id: "gas_sc_no_mc",
    group: "admin",
    title: "Gas: service card in, meter card missing",
    icon: "🔥",
    accent: "#f59e0b",
    description:
      "Gas plots where the Service Card has been submitted but no Meter Card "
      + "Submission Date has been recorded. Excludes Self-Lay Provider (SLP) "
      + "plots. Aborted visits are excluded.",
    predicate: (r, ctx) =>
      ctx.isGas(r)
      && !ctx.isAborted(r)
      && !r.Self_Lay_Provider
      && !isBlank(r.Service_Card_Submission_Date)
      && isBlank(r.Meter_Card_Submission_Date),
  },
  {
    id: "gas_mc_no_sc",
    group: "admin",
    title: "Gas: meter card in, service card missing",
    icon: "🔥",
    accent: "#f59e0b",
    description:
      "Gas plots where the Meter Card has been submitted but no Service Card "
      + "Submission Date — the order is reversed. Aborted visits are excluded.",
    predicate: (r, ctx) =>
      ctx.isGas(r)
      && !ctx.isAborted(r)
      && !isBlank(r.Meter_Card_Submission_Date)
      && isBlank(r.Service_Card_Submission_Date),
  },
  {
    id: "late_no_aslaid",
    group: "admin",
    title: "Late as-laid — service card submitted",
    icon: "📋",
    accent: "#dc2626",
    description:
      "Service Card was submitted more than 5 working days ago but no As-Laid "
      + "Date has been recorded yet. Aborted visits are excluded.",
    predicate: (r, ctx) =>
      !ctx.isAborted(r)
      && !isBlank(r.Service_Card_Submission_Date)
      && isBlank(r.As_Laid_Date)
      && dateBefore(r.Service_Card_Submission_Date, ctx.fiveDaysAgo),
  },
  {
    id: "aslaid_no_sc",
    group: "admin",
    title: "As-laid recorded — no service card",
    icon: "⚠",
    accent: "#b45309",
    description:
      "As-Laid Date has been recorded but Service Card Submission Date is "
      + "missing — the card is overdue. Water plots are excluded as they "
      + "don't require a service card. Aborted visits are excluded.",
    predicate: (r, ctx) =>
      !ctx.isAborted(r)
      && !ctx.isWater(r)
      && !isBlank(r.As_Laid_Date)
      && isBlank(r.Service_Card_Submission_Date),
  },
  {
    id: "prog_not_closed_out",
    group: "pm",
    title: "Daily Plot Connections",
    icon: "🔗",
    accent: "#2563eb",
    description:
      "Programmed Date is set, but the Connection Date or the Outcome (or "
      + "both) is still blank — the visit has not been closed out. Aborted "
      + "visits are excluded.",
    predicate: (r, ctx) =>
      !ctx.isAborted(r)
      && !isBlank(r.Programmed_Date)
      && (isBlank(r.Connection_Date) || isBlank(ctx.outcomeOf(r))),
  },
  {
    id: "missing_job_packs",
    group: "pm",
    title: "Missing Job Packs",
    icon: "📦",
    accent: "#7c3aed",
    description:
      "Programmed Date is more than 2 working days ago and the Status is "
      + "still Issued or Pack In Progress — the job pack has not come back.",
    predicate: (r, ctx) =>
      ctx.packIs(r, "Issued", "Pack In Progress")
      && dateBefore(r.Programmed_Date, ctx.twoDaysAgo),
  },
  /* Both jointing cards are scoped to Electric. Jointing does not apply
     to gas or water, so their jointing columns are always blank and
     every one of those rows would otherwise match. */
  {
    id: "jointing_to_programme",
    group: "jointing",
    title: "Jointing to Programme",
    icon: "📅",
    accent: "#0f766e",
    description:
      "Electric plots where the visit is Completed or Aborted but no Planned "
      + "Jointing Date has been set — the joint still needs programming.",
    predicate: (r, ctx) =>
      ctx.isElectric(r)
      && ctx.isOutcome(r, "Completed", "Aborted")
      && isBlank(r.Planned_Jointing_Date),
  },
  {
    id: "jointing_confirmation_of_works",
    group: "jointing",
    title: "Confirmation of Works",
    icon: "🔧",
    accent: "#0e7490",
    description:
      "Electric plots with a Planned Jointing Date but no Actual Jointing "
      + "Date — the joint is programmed and awaiting confirmation that it "
      + "was done.",
    predicate: (r, ctx) =>
      ctx.isElectric(r)
      && !isBlank(r.Planned_Jointing_Date)
      && isBlank(r.Actual_Jointing_Date),
  },
];

export const metricsFor = (sectionId) => METRICS.filter((m) => m.group === sectionId);

/* One pass over the rows for every metric, rather than one pass each.
   Returns `{ id: { count, rows } }` — the rows kept so a card and its
   drill-down are the same list rather than two evaluations of it. */
export function computeMetrics(rows, ctx) {
  const out = {};
  for (const m of METRICS) out[m.id] = { count: 0, rows: [] };
  for (const r of rows) {
    for (const m of METRICS) {
      let hit = false;
      /* A predicate that throws on one odd row must not take the whole
         dashboard down with it: that row simply does not match. */
      try { hit = !!m.predicate(r, ctx); } catch { hit = false; }
      if (hit) { out[m.id].count++; out[m.id].rows.push(r); }
    }
  }
  return out;
}

/* ── Key performance indicators ─────────────────────────────────────

   Lead times in calendar days, because a customer waiting does not
   stop waiting at the weekend. On-time and previous-week measures use
   working days, because a gang does not work them. */
export const KPIS = [
  {
    id: "jointing_lead_time",
    title: "Average Jointing Lead Time",
    icon: "📅",
    accent: "#0f766e",
    description: "Programmed Date → Actual Jointing Date. Electric only.",
    anchor: (r) => r.Programmed_Date,
    compute: (rows, ctx) => avgDays(rows, (r) => ctx.isElectric(r),
      (r) => r.Programmed_Date, (r) => r.Actual_Jointing_Date, "plots"),
  },
  {
    id: "pack_return_gas_water",
    title: "Gas / Water Pack Return Lead Time",
    icon: "🔥",
    accent: "#10b981",
    description: "Programmed Date → Service Card Date. Gas and Water plots.",
    anchor: (r) => r.Programmed_Date,
    compute: (rows, ctx) => avgDays(rows, (r) => ctx.isGas(r) || ctx.isWater(r),
      (r) => r.Programmed_Date, (r) => r.Service_Card_Submission_Date, "plots"),
  },
  {
    id: "pack_return_electric",
    title: "Electric Pack Return Lead Time",
    icon: "⚡",
    accent: "#f59e0b",
    description: "Programmed Date → Service Card Date. Electric plots.",
    anchor: (r) => r.Programmed_Date,
    compute: (rows, ctx) => avgDays(rows, (r) => ctx.isElectric(r),
      (r) => r.Programmed_Date, (r) => r.Service_Card_Submission_Date, "plots"),
  },
  {
    id: "jointed_within_2_working_days",
    title: "Plots jointed within 2 working days",
    icon: "🎯",
    accent: "#0e7490",
    description:
      "Share of jointed Electric plots where Actual Jointing Date is within "
      + "2 working days of the Programmed Date.",
    anchor: (r) => r.Programmed_Date,
    compute: (rows, ctx) => {
      /* The denominator is plots that HAVE been jointed. Counting those
         still waiting would push the figure down for nothing worse than
         being recent. */
      const jointed = rows.filter((r) => ctx.isElectric(r)
        && !isBlank(r.Programmed_Date) && !isBlank(r.Actual_Jointing_Date));
      if (!jointed.length) {
        return { display: "—", unit: "", sub: "No Electric plots jointed in this period.", empty: true };
      }
      const onTime = jointed.filter((r) => {
        const d = workingDaysBetween(r.Programmed_Date, r.Actual_Jointing_Date);
        return d !== null && d <= 2;
      }).length;
      return {
        display: ((onTime / jointed.length) * 100).toFixed(1),
        unit: "%",
        sub: `${onTime.toLocaleString()} of ${jointed.length.toLocaleString()} jointed plots within 2 working days.`,
      };
    },
  },
  {
    id: "gw_connections_prev_week",
    title: "Total G&W Plot Connections Previous Week",
    icon: "💧",
    accent: "#3b82f6",
    description:
      "Gas and Water plots with a Programmed Date in the previous working "
      + "week and an outcome of Completed.",
    anchor: (r) => r.Programmed_Date,
    compute: (rows, ctx) => countOf(rows, (r) => (ctx.isGas(r) || ctx.isWater(r))
      && ctx.isOutcome(r, "Completed")
      && dateInRange(r.Programmed_Date, ctx.prevWeek.start, ctx.prevWeek.end),
    `Mon–Fri, ${fmtRange(ctx.prevWeek)}.`),
  },
  {
    id: "jointed_plots_prev_week",
    title: "Total Jointed Plots Previous Week",
    icon: "🔧",
    accent: "#0f766e",
    description:
      "Electric plots with an Actual Jointing Date in the previous working "
      + "week and an outcome of Completed.",
    anchor: (r) => r.Actual_Jointing_Date,
    compute: (rows, ctx) => countOf(rows, (r) => ctx.isElectric(r)
      && ctx.isOutcome(r, "Completed")
      && dateInRange(r.Actual_Jointing_Date, ctx.prevWeek.start, ctx.prevWeek.end),
    `Mon–Fri, ${fmtRange(ctx.prevWeek)}.`),
  },
];

function avgDays(rows, scope, from, to, noun) {
  const vals = [];
  for (const r of rows) {
    if (!scope(r)) continue;
    const d = daysBetween(from(r), to(r));
    /* A negative gap is a typo rather than a lead time, and one of them
       drags an average more than it informs it. */
    if (d !== null && d >= 0) vals.push(d);
  }
  if (!vals.length) {
    return { display: "—", unit: "", sub: `No ${noun} with both dates in this period.`, empty: true };
  }
  const avg = vals.reduce((t, n) => t + n, 0) / vals.length;
  return {
    display: avg.toFixed(1),
    unit: avg === 1 ? "day" : "days",
    sub: `Across ${vals.length.toLocaleString()} ${noun}.`,
  };
}

function countOf(rows, pred, sub) {
  const n = rows.filter((r) => { try { return pred(r); } catch { return false; } }).length;
  return { display: n.toLocaleString(), unit: n === 1 ? "plot" : "plots", sub };
}

export function fmtRange(r) {
  const f = (s) => String(s).slice(0, 10).split("-").reverse().join("/");
  return `${f(r.start)} – ${f(r.end)}`;
}

/* A start date narrows every KPI to rows on or after it, judged on that
   KPI's OWN anchor date — the jointing measures anchor on the jointing
   date and the rest on the programmed date, so one shared cut-off would
   mean different things to different cards. The metric cards and the
   chart are untouched by it. */
export function computeKpis(rows, ctx, startDate = "") {
  const out = {};
  for (const k of KPIS) {
    const eligible = startDate
      ? rows.filter((r) => {
        const a = k.anchor(r);
        return !isBlank(a) && String(a).slice(0, 10) >= startDate;
      })
      : rows;
    try { out[k.id] = k.compute(eligible, ctx); }
    catch { out[k.id] = { display: "—", unit: "", sub: "Could not be calculated.", empty: true }; }
  }
  return out;
}

/* Missing job packs broken down by team and utility — who is sitting on
   paperwork, which is the question the chart under the cards answers. */
export function packByTeam(rows, ctx, teamName) {
  const late = rows.filter((r) => {
    try {
      return ctx.packIs(r, "Issued", "Pack In Progress")
        && dateBefore(r.Programmed_Date, ctx.twoDaysAgo);
    } catch { return false; }
  });
  const by = new Map();
  for (const r of late) {
    const team = teamName ? (teamName(r.Team_ID) || "No team") : "No team";
    const util = ctx.utilityOf(r) || "unknown";
    if (!by.has(team)) by.set(team, { team, electric: 0, gas: 0, water: 0, total: 0 });
    const row = by.get(team);
    if (util in row) row[util] += 1;
    row.total += 1;
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}
