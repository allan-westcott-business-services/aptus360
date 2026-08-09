/* The VYN pipeline.

   A port of the original app's UU VYN Tracker, which was itself a
   browser re-implementation of an Excel macro suite ("Whole_Script").
   Each function below is one step of that macro, in the order it ran, so
   the output matches what the spreadsheet produced.

   Everything here is a pure function over plain arrays. That is
   deliberate: this is the part with all the rules in it — which rows
   count as water services, how "23-27, 30" becomes five rows, what a
   plot reference is made of — and rules are worth testing without a
   browser in the way. The screen does no transformation of its own.

   ── What the pipeline is for ──

   Two spreadsheets arrive each week: a UU VYN Data export listing plots
   awaiting a water connection, and a Schedule Data workbook saying which
   gang is on which site on which day. Neither knows about the other. The
   pipeline joins them on a plot reference it builds from each side, so
   the operative due on site tomorrow can be emailed the list of plots
   they need to record. */

/* ── Columns ──────────────────────────────────────────────────────
   Labels are matched against the sheet's own header row rather than
   read from fixed positions. The source files gain and lose columns
   between exports, and a fixed-position read would silently misalign
   every column after the change rather than failing where it went
   wrong. `derived` marks the columns the pipeline fills in itself. */

export const SITE_COLUMNS = [
  { key: "status", label: "Status (Hide)" },
  { key: "slp", label: "SLP (Hide)" },
  { key: "sitePlot", label: "Site & Plot Details" },
  { key: "plotDetails", label: "PLOT Details" },
  { key: "meterInstallBy", label: "Meter to be installed By" },
  { key: "commDom", label: "Comm or Dom" },
  { key: "target", label: "Target (Month & Year)", type: "date" },
  { key: "connectionDate", label: "Connection Date", type: "date" },
  { key: "houseNumber", label: "House Number" },
  { key: "flatNumber", label: "Flat/Apartment Number" },
  { key: "buildingName", label: "Building Name" },
  { key: "streetName", label: "Street Name" },
  { key: "postCode", label: "Post Code" },
  { key: "caseNumber", label: "Case Number" },
  { key: "vynRecordingLink", label: "VYN Recording Link" },
  { key: "caseId", label: "Case ID" },
  { key: "vynCompletedLink", label: "VYN Completed Link" },
  { key: "meterNumber", label: "Meter Number" },
  { key: "currentReading", label: "Current Reading" },
  { key: "connectionDate2", label: "Connection Date (2)", type: "date" },
  { key: "dateMeterInstalled", label: "Date of Meter Installation", type: "date" },
  { key: "meterLocation", label: "Meter Location" },
  { key: "meterPosition", label: "Meter Position" },
  { key: "sloSpiderReg", label: "SLO Spider Reg/Wiaps ref & Name" },
  { key: "addressId", label: "Address ID" },
  { key: "parentCase", label: "Parent Case" },
  { key: "siteAgentDetails", label: "Site Agent Details" },
  { key: "developmentId", label: "Development ID" },
  { key: "paymentTerms", label: "Payment Terms (Year)" },
  { key: "sewerageCode", label: "Sewerage Code" },
  { key: "notes", label: "Notes" },
  { key: "engineer", label: "Engineer", derived: true },
  { key: "operativeEmail", label: "Operative Email", derived: true, editable: true },
  { key: "plannedDate", label: "Planned Date", derived: true, type: "date" },
  { key: "apNumber", label: "AP Number", derived: true, mono: true },
  { key: "plotNumber", label: "Plot Number", derived: true, mono: true },
  { key: "plotRef", label: "Plot Ref", derived: true, mono: true },
];

export const SCHEDULE_COLUMNS = [
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "firstDayDuration", label: "First Day Duration" },
  { key: "lastDayDuration", label: "Last Day Duration" },
  { key: "contractCode", label: "Contract Code" },
  { key: "contractName", label: "Contract Name" },
  { key: "teamName", label: "Team Name" },
  { key: "teamEmail", label: "Team Email Addresses" },
  { key: "projectManager", label: "Project Manager" },
  { key: "siteAddress", label: "Site Address" },
  { key: "postCode", label: "Post Code" },
  { key: "utilities", label: "Utilities" },
  { key: "additional", label: "Additional" },
  { key: "developerRequestedDate", label: "Developer Requested Date", type: "date" },
  { key: "workType", label: "Work Type" },
  { key: "working", label: "Working" },
  { key: "quantity", label: "Quantity" },
  { key: "unit", label: "Unit" },
  { key: "plots", label: "Plots" },
  { key: "activityType", label: "Activity Type" },
  { key: "phase", label: "Phase" },
  { key: "joiner", label: "Joiner" },
  { key: "mainsJointing", label: "Mains Jointing" },
  { key: "serviceJointing", label: "Service Jointing" },
  { key: "gasPressure", label: "Gas Pressure" },
  { key: "gasProcedure", label: "Gas Procedure" },
  { key: "uipContact", label: "UIP Contact" },
  { key: "eusrNumbers", label: "EUSR Numbers" },
  { key: "gasConnectionType", label: "Gas Connection Type" },
  { key: "customer", label: "Customer" },
  { key: "plotRef", label: "Plot Ref", derived: true, mono: true },
];

/* Sheets in the schedule workbook that are never programme data. */
export const EXCLUDED_SHEETS = new Set([
  "schedule_combined", "site details", "sitedetails", "user", "linklogic",
]);

/* ── Small helpers ────────────────────────────────────────────── */

export const trimStr = (v) => (v == null ? "" : String(v).trim());
export const isBlank = (v) => v == null || String(v).trim() === "";

/* Excel keeps dates as days since 1899-12-30. SheetJS converts most of
   them when asked, but a numeric-only column still arrives as a serial. */
const serialToDate = (n) => new Date(Math.round((n - 25569) * 86400 * 1000));

export function toDateOrNull(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number") return serialToDate(v);
  const parsed = new Date(v);
  return isNaN(parsed) ? null : parsed;
}

export function formatDate(d) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/* Local components, not toISOString().slice(0,10). The latter converts to
   UTC first, which silently moves the date back a day whenever the
   browser is ahead of UTC — British Summer Time, every year, for half
   the year. The date was built from local parts; it has to be read the
   same way. */
export function toDateInputValue(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const sameDay = (a, b) =>
  !!a && !!b && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* Recipients are semicolon-separated in the source, the way Outlook
   writes a To field. Commas are tolerated because people type them. */
export const splitEmails = (s) =>
  trimStr(s).split(/[;,]/).map((x) => x.trim()).filter(Boolean);

export function looksLikeEmail(s) {
  const parts = splitEmails(s);
  if (!parts.length) return false;
  return parts.every((t) => {
    const at = t.indexOf("@");
    return t.length > 3 && at > 0 && t.lastIndexOf(".") > at + 1;
  });
}

/* ── Header matching ──────────────────────────────────────────────
   Headers sometimes wrap onto a second line with a parenthetical note
   ("Target\n(Month & Year)"), so matching uses the text before that. */
const normalizeHeader = (s) =>
  trimStr(s).split(/\n|\(/)[0].trim().toLowerCase().replace(/\s+/g, " ");

/* Where each column lives in this particular sheet.

   A label that appears twice — Site Details has "Connection Date" at
   both column H and column T — is claimed by each definition in turn, in
   the order the columns are declared, so the second definition gets the
   second occurrence rather than both pointing at the first. */
export function buildColumnIndexMap(headerRow, columnDefs) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const used = new Set();
  const map = {};
  for (const col of columnDefs) {
    if (col.derived) { map[col.key] = -1; continue; }
    const target = normalizeHeader(col.label);
    let idx = -1;
    for (let i = 0; i < normalized.length; i++) {
      if (!used.has(i) && normalized[i] === target) { idx = i; break; }
    }
    if (idx !== -1) used.add(idx);
    map[col.key] = idx;   // -1 means absent from this file; stays blank
  }
  return map;
}

function rowFromIndexMap(rawRow, columnDefs, indexMap) {
  const row = {};
  for (const col of columnDefs) {
    if (col.derived) { row[col.key] = ""; continue; }
    const idx = indexMap[col.key];
    row[col.key] = idx === -1 ? "" : (rawRow[idx] ?? "");
  }
  return row;
}

/* ── The steps ────────────────────────────────────────────────────
   One function per macro Sub, in the order Whole_Script called them. */

/* Site Details: row 1 is the header, data from row 2. */
export function buildSiteRows(rawRows) {
  const indexMap = buildColumnIndexMap(rawRows[0] || [], SITE_COLUMNS);
  return rawRows.slice(1)
    .filter((r) => r && r.some((c) => !isBlank(c)))
    .map((r) => rowFromIndexMap(r, SITE_COLUMNS, indexMap));
}

/* Combine_Schedule_Sheets — stack every programme sheet's data rows
   (row 3 onwards) under its own header (row 2). Each sheet gets its own
   index map, so a workbook whose sheets disagree about column order
   still lines up. */
export function combineScheduleSheets(scheduleSheets) {
  const combined = [];
  for (const sheetName of Object.keys(scheduleSheets)) {
    if (EXCLUDED_SHEETS.has(sheetName.toLowerCase())) continue;
    const rows = scheduleSheets[sheetName];
    if (!rows || rows.length < 3) continue;
    const indexMap = buildColumnIndexMap(rows[1] || [], SCHEDULE_COLUMNS);
    for (const r of rows.slice(2)) {
      if (!r || !r.some((c) => !isBlank(c))) continue;
      combined.push(rowFromIndexMap(r, SCHEDULE_COLUMNS, indexMap));
    }
  }
  return combined;
}

/* DeleteRowsWithValueInColumnH — a plot with a connection date is
   already done, so only the outstanding ones go forward. */
export const dropAlreadyConnected = (siteRows) =>
  siteRows.filter((row) => isBlank(row.connectionDate));

/* Extract_AP_Codes — first "AP" plus four digits in Site & Plot Details. */
export function extractApCodes(siteRows) {
  for (const row of siteRows) {
    const m = trimStr(row.sitePlot).match(/AP\d{4}/);
    row.apNumber = m ? m[0] : "";
  }
}

/* Extract_Plot_Numbers — the plot designator out of PLOT Details.

   An optional literal "PLOT" word, then the designator itself: any
   leading letters, digits, then any trailing letters. Covers "PLOT 60,",
   "PLOT,60", "C60", "23B" and "AB60CD". Anything that doesn't match
   falls back to the first token, so an unfamiliar shape degrades to the
   old behaviour rather than silently emptying the column. */
export function extractPlotNumbers(siteRows) {
  const re = /^\s*(?:PLOT\b[\s,]*)?([A-Za-z]*\d+[A-Za-z]*)\b/i;
  for (const row of siteRows) {
    const val = trimStr(row.plotDetails);
    const m = val.match(re);
    if (m) { row.plotNumber = m[1]; continue; }
    const fb = val.match(/^\s*(\S+)/);
    row.plotNumber = fb ? fb[1].replace(/,$/, "") : "";
  }
}

/* Filter_Schedule_Combined — water services only. */
export const filterToWaterServices = (scheduleRows) =>
  scheduleRows.filter((row) =>
    trimStr(row.utilities).toUpperCase().includes("W")
    && trimStr(row.workType).toLowerCase() === "services");

/* Expand_Plot_Ranges — "23-27, 30" becomes six rows, each a copy of the
   source row carrying one plot. A range whose ends are not numbers is
   kept whole rather than dropped. */
export function expandPlotRanges(scheduleRows) {
  const expanded = [];
  for (const row of scheduleRows) {
    const cell = trimStr(row.plots);
    if (cell === "") { expanded.push(row); continue; }
    const parts = cell.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) { expanded.push(row); continue; }
    for (const part of parts) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((p) => p.trim());
        const start = parseInt(a, 10), end = parseInt(b, 10);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          for (let j = start; j <= end; j++) expanded.push({ ...row, plots: String(j) });
        } else {
          expanded.push({ ...row, plots: part });
        }
      } else {
        expanded.push({ ...row, plots: part.replace(/,$/, "") });
      }
    }
  }
  return expanded;
}

/* Create_Plot_Ref1 — Site Details reference is AP number + plot number. */
export function buildSitePlotRef(siteRows) {
  for (const row of siteRows) {
    const ap = trimStr(row.apNumber), plot = trimStr(row.plotNumber);
    row.plotRef = (ap !== "" || plot !== "") ? `${ap}-${plot}` : "";
  }
}

/* Create_Plot_Ref2 — schedule reference is contract code + plot. Built
   unconditionally, matching the macro: a row with neither still gets a
   "-", which simply matches nothing. */
export function buildSchedulePlotRef(scheduleRows) {
  for (const row of scheduleRows) {
    row.plotRef = `${trimStr(row.contractCode)}-${trimStr(row.plots)}`;
  }
}

/* Map_Schedule_To_SiteDetails — the join. Team name becomes the
   engineer, start date becomes the planned date, and where the schedule
   carries team email addresses those fill in the operative email.

   Later matching rows win, which is the macro's dictionary behaviour. A
   blank team email never overwrites an address an earlier row supplied:
   losing a known address to a blank cell would silently drop that plot
   out of the email run. */
export function mapScheduleOntoSiteDetails(siteRows, scheduleRows) {
  const byRef = new Map();
  for (const row of siteRows) {
    if (trimStr(row.plotRef) !== "") byRef.set(row.plotRef, row);
  }
  for (const sched of scheduleRows) {
    const target = byRef.get(sched.plotRef);
    if (!target) continue;
    target.engineer = sched.teamName ?? "";
    if (trimStr(sched.teamEmail) !== "") target.operativeEmail = sched.teamEmail;
    target.plannedDate = sched.startDate ?? "";
  }
}

/* ── The whole run ────────────────────────────────────────────────
   Returns the two processed tables and a log of what each step did, in
   order, which is what the Processing Log tab shows. */
export function runPipeline(siteRawRows, scheduleSheets) {
  const log = [];
  const step = (name, detail) => log.push({ name, detail });

  let siteRows = buildSiteRows(siteRawRows);
  step("Build Site Details rows", `${siteRows.length} rows read.`);

  let scheduleRows = combineScheduleSheets(scheduleSheets);
  step("Combine_Schedule_Sheets",
    `${scheduleRows.length} rows stacked from ${Object.keys(scheduleSheets).length} sheet(s).`);

  siteRows = dropAlreadyConnected(siteRows);
  step("DeleteRowsWithValueInColumnH",
    `${siteRows.length} rows remain (Connection Date still blank).`);

  extractApCodes(siteRows);
  step("Extract_AP_Codes", "AP number pulled from Site & Plot Details.");

  extractPlotNumbers(siteRows);
  step("Extract_Plot_Numbers", "Plot number pulled from PLOT Details.");

  scheduleRows = filterToWaterServices(scheduleRows);
  step("Filter_Schedule_Combined",
    `${scheduleRows.length} rows remain (Utilities contains "W" and Work Type = "Services").`);

  scheduleRows = expandPlotRanges(scheduleRows);
  step("Expand_Plot_Ranges",
    `${scheduleRows.length} rows after expanding plot ranges.`);

  buildSitePlotRef(siteRows);
  step("Create_Plot_Ref1", "Site Details Plot Ref built from AP Number + Plot Number.");

  buildSchedulePlotRef(scheduleRows);
  step("Create_Plot_Ref2", "Schedule Plot Ref built from Contract Code + Plots.");

  mapScheduleOntoSiteDetails(siteRows, scheduleRows);
  const matched = siteRows.filter((r) => trimStr(r.engineer) !== "").length;
  step("Map_Schedule_To_SiteDetails",
    `${matched} of ${siteRows.length} site rows matched to a scheduled visit.`);

  return { siteRows, scheduleRows, log, matched };
}
