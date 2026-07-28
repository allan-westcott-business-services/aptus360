import * as XLSX from "xlsx";

/* Reading an operator's export, according to its mapping.

   The mapping says which columns to read and which rows to keep. That's
   stored per IDNO rather than guessed from the headings, because a
   heading that looks plausible but means something else produces an
   invoice that's wrong rather than one that fails. */

/* Find a column by its configured heading. Compared case- and
   space-insensitively, since exports drift on presentation but not on
   wording. */
function columnIndex(headers, wanted) {
  if (!wanted) return -1;
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(wanted);
  let i = headers.findIndex((h) => norm(h) === target);
  if (i >= 0) return i;
  // Fall back to a contains match — "Plot" against "Plot Number"
  return headers.findIndex((h) => norm(h).includes(target));
}

export async function parseAvFile(file, config = {}) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = config.sheet_name && wb.SheetNames.includes(config.sheet_name)
    ? config.sheet_name
    : wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1, blankrows: false, defval: "",
  });
  if (!grid.length) throw new Error("That file has no rows.");

  /* The mapping says which columns to read; finding the row they're on
     is the parser's job. Exports carry title rows, blank lines and
     report banners above the headings, and those move — a fixed row
     number turns a cosmetic change into a failed run.

     The configured row is tried first, then the rest scanned for one
     that carries the columns the mapping asks for. */
  const wantPlot = config.plot;
  const wantValue = config.value;
  const SCAN_LIMIT = Math.min(grid.length, 30);

  const rowHasColumns = (row) => {
    const hs = row.map((h) => String(h || "").trim());
    return columnIndex(hs, wantPlot) >= 0 && columnIndex(hs, wantValue) >= 0;
  };

  const configured = Math.max(0, (Number(config.header_row) || 1) - 1);
  let headerRow = -1;

  if (configured < grid.length && rowHasColumns(grid[configured])) {
    headerRow = configured;
  } else {
    for (let i = 0; i < SCAN_LIMIT; i++) {
      if (rowHasColumns(grid[i])) { headerRow = i; break; }
    }
  }

  if (headerRow < 0) {
    /* Show what was actually there, a few rows of it — the usual cause
       is a mapping pointed at the wrong export. */
    const sample = grid.slice(0, Math.min(6, grid.length))
      .map((r, i) => `  row ${i + 1}: ${r.map((c) => String(c || "").trim())
        .filter(Boolean).slice(0, 6).join(" | ") || "(empty)"}`)
      .join("\n");
    throw new Error(
      `This file doesn't match the mapping — no row carries both ` +
      `"${wantPlot || "(plot not set)"}" and "${wantValue || "(value not set)"}".\n\n` +
      `What's in the first rows:\n${sample}`
    );
  }

  const headers = grid[headerRow].map((h) => String(h || "").trim());
  const foundElsewhere = headerRow !== configured;
  const cols = {
    plot: columnIndex(headers, config.plot),
    value: columnIndex(headers, config.value),
    service: columnIndex(headers, config.service),
    apNumber: columnIndex(headers, config.ap_number),
    customerRef: columnIndex(headers, config.customer_ref),
    status: columnIndex(headers, config.status_column || config.status),
    network: columnIndex(headers, config.network),
    description: columnIndex(headers, config.description),
  };

  const statusFilter = config.status_filter
    ? String(config.status_filter).trim().toLowerCase()
    : null;
  const minValue = config.min_value_filter != null ? Number(config.min_value_filter) : null;

  const rows = [];
  const skipped = [];

  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i];
    const plotRef = String(r[cols.plot] ?? "").trim();
    if (!plotRef) continue;

    const raw = r[cols.value];
    const value = typeof raw === "number"
      ? raw
      : Number(String(raw ?? "").replace(/[£$,\s]/g, ""));

    if (!Number.isFinite(value)) {
      skipped.push({ row: i + 1, plotRef, reason: `value "${raw}" isn't a number` });
      continue;
    }
    if (minValue != null && value < minValue) {
      skipped.push({ row: i + 1, plotRef, reason: `below the ${minValue} minimum` });
      continue;
    }
    if (statusFilter && cols.status >= 0) {
      const st = String(r[cols.status] ?? "").trim().toLowerCase();
      if (st !== statusFilter) {
        skipped.push({ row: i + 1, plotRef, reason: `status "${r[cols.status]}"` });
        continue;
      }
    }

    rows.push({
      sourceRow: i + 1,
      plotRef,
      value,
      service: cols.service >= 0 ? String(r[cols.service] ?? "").trim() : "",
      apNumber: cols.apNumber >= 0 ? String(r[cols.apNumber] ?? "").trim() : "",
      customerRef: cols.customerRef >= 0 ? String(r[cols.customerRef] ?? "").trim() : "",
      network: cols.network >= 0 ? String(r[cols.network] ?? "").trim() : "",
      description: cols.description >= 0 ? String(r[cols.description] ?? "").trim() : "",
    });
  }

  return {
    sheetName,
    headers,
    headerRow: headerRow + 1,
    headerRowMoved: foundElsewhere ? configured + 1 : null,
    columns: Object.fromEntries(
      Object.entries(cols).map(([k, i]) => [k, i >= 0 ? headers[i] : null])
    ),
    rows,
    skipped,
  };
}

/* Matching a reference to a plot.

   Operators write plot numbers loosely — "Plot 12", "12", "AP1045-12",
   "12A". Compare on the digits and any trailing letter, which separates
   12 from 12A without being confused by prefixes. */
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

/* One invoice per contract and network.

   The contract reference comes from the file, not from the user — the
   export covers whatever sites the operator is paying for, which may be
   several. Network number splits it further because some operators
   (ESP Gas) require a separate invoice per network. */
export function groupByContract(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    const ap = (r.apNumber || "").trim().toUpperCase();
    const network = (r.network || "").trim();
    const key = `${ap}|${network}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        contract: ap,
        network,
        customerRef: r.customerRef || "",
        rows: [],
      });
    }
    groups.get(key).rows.push(r);
  });
  return [...groups.values()].sort((a, b) => a.contract.localeCompare(b.contract));
}

/* Attach the project and matched plots to each group. A group whose
   contract reference isn't in Aptus can't be invoiced — it's reported
   rather than dropped, since a missing project is usually a data problem
   worth seeing. */
export function resolveGroups(groups, projects, plots, invoiced) {
  const byContract = new Map();
  projects.forEach((p) => byContract.set(String(p.Contract_Number || "").toUpperCase(), p));

  const plotsByProject = new Map();
  plots.forEach((pl) => {
    if (!plotsByProject.has(pl.Project_ID)) plotsByProject.set(pl.Project_ID, []);
    plotsByProject.get(pl.Project_ID).push(pl);
  });

  const billed = new Set((invoiced || []).map((l) => `${l.Plot_ID}|${l.Utility_ID}`));
  const billedRef = new Map();
  (invoiced || []).forEach((l) => billedRef.set(l.Plot_ID, l.AV_Invoice?.Invoice_Number));

  return groups.map((g) => {
    const project = byContract.get(g.contract) || null;
    if (!project) {
      return { ...g, project: null, lines: g.rows.map((r) => ({ ...r, plot: null })), matched: 0 };
    }
    const lines = matchRowsToPlots(g.rows, plotsByProject.get(project.Project_ID) || []);
    return {
      ...g,
      project,
      lines: lines.map((l) => ({
        ...l,
        billedOn: l.plot ? billedRef.get(l.plot.Plot_ID) : null,
      })),
      matched: lines.filter((l) => l.matched).length,
      total: lines.reduce((s, l) => s + l.value, 0),
    };
  });
}

/* An Invoice Report from the finance system, read only to learn which
   plots have already been billed. Deliberately forgiving: it's a
   cross-check, so a row it can't read should be reported, not fatal. */
export async function parseInvoiceReport(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, blankrows: false, defval: "",
  });

  const apRe = /^(AP\d+)\s*[/-]\s*(\d{1,4})/i;
  const highestByContract = {};
  const plotRefs = new Set();

  grid.forEach((row) => {
    row.forEach((cell) => {
      const s = String(cell ?? "").trim();
      const m = s.match(apRe);
      if (m) {
        const ap = m[1].toUpperCase();
        const seq = Number(m[2]);
        if (!highestByContract[ap] || seq > highestByContract[ap]) highestByContract[ap] = seq;
      }
    });
  });

  return { highestByContract, plotRefs: [...plotRefs], rowCount: grid.length };
}
