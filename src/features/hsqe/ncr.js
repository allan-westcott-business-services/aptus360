/* Non-compliance reports: the rules, separate from the screens.

   The register and the dashboard both need to know what an NCR's
   auditor is called, how old an open one is, and how a filter behaves
   against a blank cell. Two copies of that would drift, and the
   symptom — a count on the dashboard disagreeing with the rows in the
   register — reads as data being wrong rather than as two functions
   disagreeing.

   Pure functions over plain rows, so they can be checked directly. */

export const STATUS_COLOURS = {
  "Open": "#dc2626",
  "On Hold": "#d97706",
  "Closed": "#059669",
};

/* Enough hues to keep adjacent slices apart at a glance, and cycled
   rather than extended, because a chart with more than a dozen
   categories has stopped being readable whatever the colours are. */
export const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4",
  "#6366f1", "#f97316", "#84cc16", "#ef4444", "#a855f7", "#0ea5e9",
];

export const AGING = [
  { key: "0-30", label: "0\u201330", colour: "#10b981", max: 30 },
  { key: "31-60", label: "31\u201360", colour: "#f59e0b", max: 60 },
  { key: "61-90", label: "61\u201390", colour: "#fb923c", max: 90 },
  { key: ">90", label: "Over 90", colour: "#dc2626", max: Infinity },
];

export const UTILITIES = ["Gas", "Water", "Electric", "Not Applicable"];

export const UNASSIGNED = "(Unassigned)";

export const trimStr = (v) => (v == null ? "" : String(v).trim());
export const isBlank = (v) => trimStr(v) === "";

/* A date column as a day, ignoring any time on it. Comparing timestamps
   would make an NCR received this morning 0 days old and one received
   this evening -1, which is not an age anybody means. */
export function toDay(v) {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  if (!y) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysOpen(row, today = new Date()) {
  const from = toDay(row.Date_Received);
  if (from == null) return null;
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - from) / 86400000);
}

/* Which age bucket an open report falls in.

   A report with no received date counts as the oldest bucket rather
   than being left out. It is the one nobody can put an age to, which
   makes it the one most worth looking at — quietly dropping it would
   make the aging bar add up to fewer than the Open count beside it. */
export function agingBucket(row, today = new Date()) {
  const days = daysOpen(row, today);
  if (days == null) return ">90";
  return AGING.find((b) => days <= b.max).key;
}

export function agingCounts(rows, statusName, today = new Date()) {
  const counts = Object.fromEntries(AGING.map((b) => [b.key, 0]));
  for (const row of rows) {
    if (statusName(row.NCR_Status_ID) !== "Open") continue;
    counts[agingBucket(row, today)] += 1;
  }
  return counts;
}

/* Who raised it. No auditor type means it was found internally, which
   is a fact about the report rather than a missing value, so it reads
   as the company rather than as a blank. */
export function auditorLabel(row, { dnoName, idnoName }) {
  if (row.Auditor_Type === "DNO") return dnoName(row.Auditor_DNO_ID) || "DNO";
  if (row.Auditor_Type === "IDNO") return idnoName(row.Auditor_IDNO_ID) || "IDNO";
  return "Aptus Utilities";
}

/* ── Drill-down ───────────────────────────────────────────────────
   Status, then region, then business unit — but only the levels not
   already chosen, so the chain can be entered at any point. Picking a
   region first leaves status and business unit still to come. */
export const DRILL_LEVELS = [
  { key: "status", label: "Status" },
  { key: "region", label: "Region" },
  { key: "bu", label: "Business Unit" },
];

export const nextLevel = (drill) => {
  const used = new Set(drill.map((d) => d.level));
  return DRILL_LEVELS.find((l) => !used.has(l.key))?.key ?? null;
};

/* The value a report has at one drill level. Names rather than ids,
   because the drill is stored as what was clicked and a name is what
   the breadcrumb has to show. */
export function levelValue(row, level, names) {
  if (level === "status") return names.status(row.NCR_Status_ID) || UNASSIGNED;
  if (level === "region") return names.region(row.Region_ID) || UNASSIGNED;
  if (level === "bu") return names.bu(row.Business_Unit_ID) || UNASSIGNED;
  return UNASSIGNED;
}

export const applyDrill = (rows, drill, names) =>
  drill.reduce((list, d) =>
    list.filter((row) => levelValue(row, d.level, names) === d.label), rows);

/* Counts at one level, largest first. Ordered by size rather than
   alphabetically because the question a chart answers is "which is
   biggest", and an alphabetical chart makes that a reading exercise. */
export function aggregate(rows, level, names) {
  const counts = new Map();
  for (const row of rows) {
    const key = levelValue(row, level, names);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/* ── Register filtering ───────────────────────────────────────────
   Three kinds of column filter, plus a blanks-only toggle that every
   column has. Blanks-only and a typed filter are exclusive: asking for
   rows where the cell is empty *and* contains "abc" is a question with
   no answer, so turning one on clears and disables the other. */
export function matchesText(value, term) {
  if (!term) return true;
  return trimStr(value).toLowerCase().includes(term.trim().toLowerCase());
}

export function matchesDateRange(value, from, to) {
  const d = toDay(value);
  if (from && (d == null || d < toDay(from))) return false;
  if (to && (d == null || d > toDay(to))) return false;
  return true;
}

/* One row against the whole filter state. `get` turns a column key into
   the row's displayed value, so filtering matches what is on screen
   rather than the id behind it — a filter that matched ids would find
   nothing anybody typed. */
export function rowMatches(row, filters, blanks, get) {
  for (const key of Object.keys(blanks)) {
    if (blanks[key] && !isBlank(get(row, key))) return false;
  }
  for (const [key, term] of Object.entries(filters)) {
    if (!term) continue;
    if (blanks[key]) continue;               // blanks-only wins; see above
    if (key.endsWith("_from") || key.endsWith("_to")) continue;
    if (!matchesText(get(row, key), term)) return false;
  }
  for (const key of new Set(Object.keys(filters)
    .filter((k) => k.endsWith("_from") || k.endsWith("_to"))
    .map((k) => k.replace(/_(from|to)$/, "")))) {
    if (blanks[key]) continue;
    if (!matchesDateRange(get(row, key, true),
      filters[`${key}_from`], filters[`${key}_to`])) return false;
  }
  return true;
}
