import * as XLSX from "xlsx";

/* Reading the operator's schedule.

   Every IDNO sends a different layout, so columns are matched by what
   the heading looks like rather than by position. Anything unmatched is
   reported instead of guessed at — a wrong column here becomes a wrong
   invoice. */

const PATTERNS = {
  plotRef: [/plot\s*(ref|no|number)?/i, /^plot$/i, /site\s*plot/i, /property/i],
  value: [/(net|asset|av)?\s*value/i, /amount/i, /price/i, /^av$/i, /payment/i],
  description: [/desc/i, /detail/i, /narrative/i, /house\s*type/i],
  utility: [/utility/i, /service/i, /commodity/i],
  reference: [/(our|your|invoice|scheme)\s*ref/i, /^ref/i],
};

function matchColumn(headers, patterns) {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(String(h || "").trim()));
    if (i >= 0) return i;
  }
  return -1;
}

export async function parseAvFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  if (!grid.length) throw new Error("That file has no rows.");

  /* The heading row isn't always the first — schedules often carry a
     title and a blank line above it. Take the first row that matches
     both a plot column and a value column. */
  let headerRow = -1;
  let cols = null;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const headers = grid[i].map((h) => String(h || ""));
    const plotRef = matchColumn(headers, PATTERNS.plotRef);
    const value = matchColumn(headers, PATTERNS.value);
    if (plotRef >= 0 && value >= 0) {
      headerRow = i;
      cols = {
        plotRef, value,
        description: matchColumn(headers, PATTERNS.description),
        utility: matchColumn(headers, PATTERNS.utility),
        reference: matchColumn(headers, PATTERNS.reference),
      };
      break;
    }
  }

  if (headerRow < 0) {
    const seen = (grid[0] || []).map((h) => String(h || "")).filter(Boolean).slice(0, 8);
    throw new Error(
      `Couldn't find a plot column and a value column. Headings seen: ${
        seen.join(", ") || "none"}.`
    );
  }

  const headers = grid[headerRow].map((h) => String(h || "").trim());
  const rows = [];
  const skipped = [];

  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i];
    const plotRef = String(r[cols.plotRef] ?? "").trim();
    const rawValue = r[cols.value];
    if (!plotRef) continue;

    const value = typeof rawValue === "number"
      ? rawValue
      : Number(String(rawValue ?? "").replace(/[£$,\s]/g, ""));

    if (!Number.isFinite(value)) {
      skipped.push({ row: i + 1, plotRef, reason: `value "${rawValue}" isn't a number` });
      continue;
    }

    rows.push({
      sourceRow: i + 1,
      plotRef,
      value,
      description: cols.description >= 0 ? String(r[cols.description] ?? "").trim() : "",
      utility: cols.utility >= 0 ? String(r[cols.utility] ?? "").trim() : "",
      reference: cols.reference >= 0 ? String(r[cols.reference] ?? "").trim() : "",
    });
  }

  return {
    sheetName,
    headers,
    columns: Object.fromEntries(
      Object.entries(cols).map(([k, i]) => [k, i >= 0 ? headers[i] : null])
    ),
    rows,
    skipped,
  };
}

/* Matching a reference to a plot.

   Operators write plot numbers loosely — "Plot 12", "12", "AP1045-12",
   "12A". Compare on the digits and any trailing letter, which is what
   distinguishes 12 from 12A without being confused by prefixes. */
export function normalisePlotRef(ref) {
  const s = String(ref || "").trim().toUpperCase();
  const m = s.match(/(\d+)\s*([A-Z]?)\s*$/);
  return m ? `${Number(m[1])}${m[2]}` : s;
}

export function matchRowsToPlots(rows, plots) {
  const byRef = new Map();
  plots.forEach((p) => {
    byRef.set(normalisePlotRef(p.Plot_Number), p);
    if (p.Plot_Ref) byRef.set(normalisePlotRef(p.Plot_Ref), p);
  });

  return rows.map((r) => {
    const key = normalisePlotRef(r.plotRef);
    const plot = byRef.get(key) || null;
    return { ...r, plot, matched: !!plot, normalised: key };
  });
}
