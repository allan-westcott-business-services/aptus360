import { useState, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import VynTable from "./VynTable.jsx";
import {
  SITE_COLUMNS, SCHEDULE_COLUMNS, runPipeline,
  trimStr, toDateOrNull, formatDate, toDateInputValue, sameDay, looksLikeEmail,
} from "./pipeline.js";
import {
  defaultTargetDate, buildEmailGroups, buildMissingEmailGroups,
  subjectFor, buildEmailBody, mailtoFor, copyTextFor,
} from "./emails.js";

/* The UU VYN Tracker.

   Two spreadsheets in, a set of draft emails out. The UU VYN Data export
   lists plots waiting on a water connection; the Schedule Data workbook
   says which gang is where on which day. Neither knows about the other,
   so the pipeline joins them on a plot reference it builds from each
   side, and the operative due on site tomorrow gets told which plots to
   record.

   ── Everything stays in the browser ──

   No file is uploaded and nothing is written to the database. This is a
   port of a tool that was a spreadsheet macro: it reads two workbooks,
   works on them in memory, and hands back drafts and an export. That is
   worth saying on the screen, because people are being asked to drop a
   customer's data onto a web page.

   ── Why the steps are visible ──

   The pipeline strip and the processing log are not decoration. When a
   week's run produces forty emails instead of four hundred, the question
   is always which step dropped the rows, and the answer is a count per
   step. The macro gave no such answer and the difference was a morning
   of opening spreadsheets. */

const TABS = [
  { id: "import", label: "Import Data" },
  { id: "overview", label: "Overview" },
  { id: "site", label: "Site Details" },
  { id: "schedule", label: "Schedule Combined" },
  { id: "emails", label: "Water Connection Emails" },
  { id: "log", label: "Processing Log" },
];

const STEP_LABELS = [
  "Import files", "Combine schedules", "Drop connected", "Extract AP code",
  "Extract plot no.", "Filter to water", "Expand ranges", "Build plot refs", "Map schedule",
];

/* SheetJS is 424 kB and most sessions never open this screen, so it is
   fetched when a file is actually dropped rather than with the page. */
const loadXlsx = () => import("xlsx");

export default function VynTrackerPage() {
  const [siteFile, setSiteFile] = useState(null);
  const [scheduleFile, setScheduleFile] = useState(null);
  const [siteRaw, setSiteRaw] = useState(null);
  const [scheduleSheets, setScheduleSheets] = useState(null);

  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("import");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const [targetDate, setTargetDate] = useState(defaultTargetDate);
  const [removed, setRemoved] = useState(() => new Set());
  const [copied, setCopied] = useState(null);
  /* Bumped whenever an operative email is typed in, to recompute the
     email groups: the pipeline rows are mutated in place (they are large
     and the tables hold references), so a version counter is what tells
     React the derived groups are stale. */
  const [revision, setRevision] = useState(0);

  const ready = !!siteRaw && !!scheduleSheets;

  async function readWorkbook(file) {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer();
    return XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  }

  const sheetRows = (XLSX, sheet) =>
    XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  /* The Site Details sheet, by name where possible.

     "Site Details" and "Active" are both seen in the wild. Failing
     those, the widest visible sheet with data reaching column AE is
     taken, because that is the shape of the real export whatever it has
     been renamed to — and among those, the one with the most rows, since
     a genuine export dwarfs any wide lookup sheet. */
  async function handleSiteFile(file) {
    setError("");
    try {
      const XLSX = await loadXlsx();
      const wb = await readWorkbook(file);
      let sheet = null;
      for (const name of ["Site Details", "Active"]) {
        const match = wb.SheetNames.find((n) =>
          n.toLowerCase().replace(/\s+/g, "") === name.toLowerCase().replace(/\s+/g, ""));
        if (match) { sheet = wb.Sheets[match]; break; }
      }
      if (!sheet) {
        let bestRows = 0;
        const meta = wb.Workbook?.Sheets;
        for (const name of wb.SheetNames) {
          const entry = meta?.find((s) => s.name === name);
          if (entry?.Hidden) continue;
          const s = wb.Sheets[name];
          if (!s?.["!ref"]) continue;
          const range = XLSX.utils.decode_range(s["!ref"]);
          if (range.e.c < 30) continue;
          const rowCount = range.e.r - range.s.r + 1;
          if (rowCount > bestRows) { bestRows = rowCount; sheet = s; }
        }
      }
      if (!sheet) {
        setError(`Couldn't find a Site Details sheet in "${file.name}". Looked for one named `
          + "\"Site Details\" or \"Active\", and for any visible sheet with data reaching "
          + "column AE. Check this is the UU VYN Data export.");
        return;
      }
      setSiteRaw(sheetRows(XLSX, sheet));
      setSiteFile(file.name);
    } catch (e) {
      setError(`Couldn't read "${file.name}": ${e.message}`);
    }
  }

  async function handleScheduleFile(file) {
    setError("");
    try {
      const XLSX = await loadXlsx();
      const wb = await readWorkbook(file);
      if (!wb.SheetNames.length) {
        setError(`"${file.name}" doesn't contain any sheets.`);
        return;
      }
      const sheets = {};
      for (const name of wb.SheetNames) sheets[name] = sheetRows(XLSX, wb.Sheets[name]);
      setScheduleSheets(sheets);
      setScheduleFile(`${file.name} (${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? "" : "s"})`);
    } catch (e) {
      setError(`Couldn't read "${file.name}": ${e.message}`);
    }
  }

  async function run() {
    setError("");
    setRunning(true);
    try {
      /* Walked rather than shown at once: the counts are the point, and
         a strip that fills in step by step is where somebody notices
         that the drop happened at "filter to water" and not at import. */
      for (let i = 0; i <= STEP_LABELS.length; i++) {
        setStepIndex(i);
        await new Promise((r) => setTimeout(r, 70));
      }
      setResult(runPipeline(siteRaw, scheduleSheets));
      setTab("overview");
    } catch (e) {
      setError(`The pipeline hit an error: ${e.message}`);
      setStepIndex(-1);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setSiteFile(null); setScheduleFile(null); setSiteRaw(null); setScheduleSheets(null);
    setResult(null); setError(""); setStepIndex(-1); setRemoved(new Set());
    setTargetDate(defaultTargetDate()); setTab("import");
  }

  async function exportWorkbook() {
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const toAoa = (cols, rows) => [
      cols.map((c) => c.label),
      ...rows.map((row) => cols.map((c) => {
        const v = row[c.key];
        if (c.type === "date") { const d = toDateOrNull(v); return d ? formatDate(d) : ""; }
        return v ?? "";
      })),
    ];
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet(toAoa(SITE_COLUMNS, result.siteRows)), "Site Details");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet(toAoa(SCHEDULE_COLUMNS, result.scheduleRows)), "Schedule_Combined");
    XLSX.writeFile(wb, `VYN_Tracker_Processed_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const editCell = useCallback((row, key, value) => {
    row[key] = value;
    setRevision((n) => n + 1);
  }, []);

  const groups = useMemo(
    () => (result ? buildEmailGroups(result.siteRows, targetDate).filter((g) => !removed.has(g.key)) : []),
    [result, targetDate, removed, revision]);

  const missingGroups = useMemo(
    () => (result ? buildMissingEmailGroups(result.siteRows, targetDate) : []),
    [result, targetDate, revision]);

  return (
    <div className="vy">
      <style>{CSS}</style>

      <div className="vy-head">
        <div>
          <h2>VYN Tracker</h2>
          <p className="vy-sub">
            Joins the UU VYN Data export to the Schedule Data workbook, then drafts
            one email per operative for the plots they are due to record.
          </p>
        </div>
        {result && (
          <div className="vy-head-actions">
            <button className="btn sm" onClick={reset}>Start over</button>
            <button className="btn edit sm" onClick={exportWorkbook}>Export workbook</button>
          </div>
        )}
      </div>

      <div className="vy-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? "vy-tab on" : "vy-tab"}
            disabled={t.id !== "import" && !result}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      {tab === "import" && (
        <>
          <div className="vy-strip">
            {STEP_LABELS.map((label, i) => (
              <div key={label}
                className={`vy-node ${stepIndex === -1 ? "" : i < stepIndex ? "done" : i === stepIndex ? "on" : ""}`}>
                <span className="vy-dot">{i + 1}</span>
                <span className="vy-step-label">{label}</span>
              </div>
            ))}
          </div>

          <div className="vy-drops">
            <DropZone
              eyebrow="File 1 of 2" title="UU VYN Data" filled={!!siteFile} name={siteFile}
              hint="The export containing the Site Details sheet (.xlsx, .xlsm or .xls)."
              onFile={handleSiteFile} />
            <DropZone
              eyebrow="File 2 of 2" title="Schedule Data" filled={!!scheduleFile} name={scheduleFile}
              hint="The workbook with each contract's programme sheets (Water Program, MU Program…)."
              onFile={handleScheduleFile} />
          </div>

          <div className="card vy-run">
            <div>
              <h3>Run the pipeline</h3>
              <p>
                Import, combine the schedule sheets, drop plots already connected, extract
                AP and plot numbers, filter to water services, expand plot ranges, build
                plot references, and map the schedule onto the site details.
              </p>
            </div>
            <button className="btn edit sm" disabled={!ready || running} onClick={run}>
              {running ? "Running\u2026" : "Run pipeline \u2192"}
            </button>
          </div>

          <p className="vy-privacy">
            Runs entirely in your browser. Neither file is uploaded, and nothing is written
            to Aptus360.
          </p>
        </>
      )}

      {tab === "overview" && result && (
        <Overview result={result} targetDate={targetDate} groups={groups}
          missingGroups={missingGroups} onGo={setTab} />
      )}

      {tab === "site" && result && (
        <div className="card">
          <VynTable columns={SITE_COLUMNS} rows={result.siteRows} onCellEdit={editCell} />
        </div>
      )}

      {tab === "schedule" && result && (
        <div className="card">
          <VynTable columns={SCHEDULE_COLUMNS} rows={result.scheduleRows} />
        </div>
      )}

      {tab === "emails" && result && (
        <Emails
          groups={groups} missingGroups={missingGroups}
          targetDate={targetDate} onTargetDate={setTargetDate}
          onRemove={(key) => setRemoved((s) => new Set(s).add(key))}
          onFillEmail={(g, value) => {
            g.rows.forEach((r) => { r.operativeEmail = value; });
            setRevision((n) => n + 1);
          }}
          copied={copied} onCopied={setCopied}
        />
      )}

      {tab === "log" && result && (
        <div className="card">
          <ol className="vy-log">
            {result.log.map((entry, i) => (
              <li key={i}><strong>{entry.name}</strong><span>{entry.detail}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ── Import ─────────────────────────────────────────────────────── */

function DropZone({ eyebrow, title, hint, filled, name, onFile }) {
  const [over, setOver] = useState(false);
  const id = `vy-file-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id}
      className={`vy-dz ${filled ? "filled" : ""} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}>
      <span className="vy-eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{hint}</p>
      {name && <span className="vy-filename">{name}</span>}
      <input id={id} type="file" className="vy-file" accept=".xlsx,.xlsm,.xls"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
    </label>
  );
}

/* ── Overview ───────────────────────────────────────────────────── */

function Overview({ result, targetDate, groups, missingGroups, onGo }) {
  const site = result.siteRows;
  const due = site.filter((r) => {
    const d = toDateOrNull(r.plannedDate);
    return d && sameDay(d, targetDate);
  });
  const ready = due.filter((r) =>
    looksLikeEmail(r.operativeEmail) && trimStr(r.vynRecordingLink) !== "").length;
  const noEmail = site.filter((r) =>
    trimStr(r.engineer) !== "" && !looksLikeEmail(r.operativeEmail)).length;

  return (
    <>
      <div className="vy-stats">
        <Stat label="Outstanding plots" value={site.length}
          hint="Site Details rows, connection not yet complete" />
        <Stat label="Water service visits" value={result.scheduleRows.length}
          hint="After filtering and plot-range expansion" />
        <Stat label="Matched to a visit" value={result.matched}
          hint="Plot Ref found in both sheets" />
        <Stat label={`Due ${formatDate(targetDate)}`} value={ready} accent
          hint={due.length > ready
            ? `Ready to email, of ${due.length} planned visits`
            : "Planned visits for the email run"} />
      </div>

      <div className="card vy-what">
        <h3>What happened</h3>
        <p>
          {result.matched.toLocaleString("en-GB")} of {site.length.toLocaleString("en-GB")}{" "}
          outstanding plots were matched to a scheduled water-service visit.{" "}
          {noEmail > 0
            ? `${noEmail.toLocaleString("en-GB")} of those matches have no operative email yet — `
              + "add one on Site Details, or on the Emails tab, and they join the run."
            : "Every matched plot has an operative email on file."}
        </p>
        <div className="vy-what-actions">
          <button className="btn sm" onClick={() => onGo("site")}>Review Site Details {"\u2192"}</button>
          <button className="btn sm" onClick={() => onGo("schedule")}>Review Schedule {"\u2192"}</button>
          <button className="btn edit sm" onClick={() => onGo("emails")}>
            {groups.length} email{groups.length === 1 ? "" : "s"} to send {"\u2192"}
          </button>
        </div>
        {missingGroups.length > 0 && (
          <Banner kind="warn">
            {missingGroups.length} team{missingGroups.length === 1 ? "" : "s"} due on{" "}
            {formatDate(targetDate)} {missingGroups.length === 1 ? "has" : "have"} no email
            address, so {missingGroups.length === 1 ? "it is" : "they are"} not in the run.
            Add one on the Emails tab.
          </Banner>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hint, accent }) {
  return (
    <div className={accent ? "card vy-stat accent" : "card vy-stat"}>
      <div className="vy-stat-label">{label}</div>
      <div className="vy-stat-value">{value.toLocaleString("en-GB")}</div>
      <div className="vy-stat-hint">{hint}</div>
    </div>
  );
}

/* ── Emails ─────────────────────────────────────────────────────── */

function Emails({ groups, missingGroups, targetDate, onTargetDate,
  onRemove, onFillEmail, copied, onCopied }) {
  return (
    <>
      <div className="card vy-target">
        <div>
          <h3>Visit date for this email run</h3>
          <p>
            The original macro only emailed operatives about the next day&rsquo;s visits.
            Change the date to draft for a different day.
          </p>
        </div>
        <div className="vy-target-pick">
          <input type="date" value={toDateInputValue(targetDate)}
            aria-label="Visit date"
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-").map(Number);
              if (y) onTargetDate(new Date(y, m - 1, d));
            }} />
          <span className="vy-pill">
            {groups.length} group{groups.length === 1 ? "" : "s"} to send
          </span>
        </div>
      </div>

      {missingGroups.map((g, i) => (
        <MissingGroup key={g.engineer} group={g} index={i} onFill={onFillEmail} />
      ))}

      {!groups.length ? (
        <div className="card vy-none">
          <h3>No emails to draft for {formatDate(targetDate)}</h3>
          <p>
            A group needs a valid operative email, a VYN recording link, and a planned
            date matching the one above.
          </p>
        </div>
      ) : groups.map((g) => (
        <div className="card vy-group" key={g.key}>
          <div className="vy-group-head">
            <div>
              <h4>{subjectFor(g)}</h4>
              <p className="vy-group-meta">
                To: {g.email} &middot; {g.items.length} plot{g.items.length === 1 ? "" : "s"}
              </p>
            </div>
            <button className="btn delete sm" onClick={() => onRemove(g.key)}>Remove</button>
          </div>
          <ul className="vy-plots">
            {g.items.map((it, i) => (
              <li key={i}>
                <a href={it.url} target="_blank" rel="noopener noreferrer">{it.text}</a>
              </li>
            ))}
          </ul>
          <div className="vy-group-actions">
            <a className="btn edit sm" href={mailtoFor(g)}>Open in email app</a>
            <button className="btn sm" onClick={async () => {
              const text = copyTextFor(g);
              try {
                await navigator.clipboard.writeText(text);
                onCopied(g.key);
                setTimeout(() => onCopied(null), 1800);
              } catch {
                /* Clipboard access is refused outside a secure context and
                   in some locked-down browsers. Saying so beats a button
                   that silently does nothing. */
                window.prompt("Copy the draft below:", text);
              }
            }}>
              {copied === g.key ? "Copied" : "Copy"}
            </button>
            <span className="vy-hint">
              Copy, then paste into a new email you start yourself, to keep your signature.
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

function MissingGroup({ group, index, onFill }) {
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const id = `vy-missing-${index}`;
  return (
    <div className="card vy-group vy-missing">
      <div className="vy-group-head">
        <div>
          <h4>{group.engineer}</h4>
          <p className="vy-group-meta">
            {group.items.length} plot{group.items.length === 1 ? "" : "s"} on{" "}
            {group.subjectDateText} &middot; no email on file
          </p>
        </div>
      </div>
      <ul className="vy-plots">
        {group.items.map((it, i) => (
          <li key={i}><a href={it.url} target="_blank" rel="noopener noreferrer">{it.text}</a></li>
        ))}
      </ul>
      <div className="vy-group-actions">
        <label className="vy-missing-fld" htmlFor={id}>
          <span>Operative email</span>
          <input id={id} type="email" value={value} className={bad ? "bad" : ""}
            placeholder="operative@example.com"
            onChange={(e) => { setValue(e.target.value); setBad(false); }} />
        </label>
        <button className="btn edit sm" onClick={() => {
          if (!looksLikeEmail(value)) { setBad(true); return; }
          onFill(group, value.trim());
        }}>Save</button>
      </div>
    </div>
  );
}

const CSS = `
.vy-head { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.vy-head h2 { margin: 0; font-size: 18px; }
.vy-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 74ch; }
.vy-head-actions { display: flex; gap: 8px; }

.vy-tabs { display: flex; gap: 2px; overflow-x: auto; margin-bottom: 16px;
  border-bottom: 1px solid var(--border); }
.vy-tab { background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font: 600 12.5px inherit; padding: 8px 13px; color: var(--muted);
  white-space: nowrap; }
.vy-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.vy-tab:disabled { color: #cbd5e1; cursor: not-allowed; }

/* ═══ IMPORT ════════════════════════════════════════════════════ */
.vy-strip { display: flex; align-items: flex-start; overflow-x: auto; gap: 0;
  padding: 16px 4px 8px; margin-bottom: 16px; }
.vy-node { display: flex; flex-direction: column; align-items: center; gap: 6px;
  flex: none; width: 96px; text-align: center; }
.vy-dot { width: 28px; height: 28px; border-radius: 50%; background: var(--bg);
  border: 2px solid var(--border); display: flex; align-items: center;
  justify-content: center; font: 600 11px ui-monospace, Menlo, monospace;
  color: var(--muted); transition: background .25s, border-color .25s, color .25s; }
.vy-node.done .vy-dot { background: var(--ok-text); border-color: var(--ok-text); color: #fff; }
.vy-node.on .vy-dot { background: var(--warn-text); border-color: var(--warn-text);
  color: #fff; box-shadow: 0 0 0 4px var(--warn-bg); }
.vy-step-label { font-size: 10.5px; color: var(--muted); line-height: 1.3; }
.vy-node.done .vy-step-label, .vy-node.on .vy-step-label { color: var(--text); font-weight: 600; }

.vy-drops { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.vy-dz { display: block; border: 1.5px dashed var(--border); border-radius: var(--radius);
  padding: 22px 18px; text-align: center; background: var(--bg); cursor: pointer;
  transition: border-color .15s, background .15s; }
.vy-dz:hover, .vy-dz.over { border-color: var(--accent); background: var(--accent-light); }
.vy-dz.filled { border-style: solid; border-color: var(--ok-text); background: var(--ok-bg); }
.vy-dz h3 { margin: 0 0 5px; font-size: 14.5px; }
.vy-dz p { margin: 0; font-size: 12px; color: var(--muted); }
.vy-eyebrow { display: block; font: 700 10px ui-monospace, Menlo, monospace;
  letter-spacing: .06em; text-transform: uppercase; color: var(--accent); margin-bottom: 5px; }
.vy-filename { display: block; margin-top: 9px; font: 500 11.5px ui-monospace, Menlo, monospace;
  color: var(--ok-text); word-break: break-all; }
.vy-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.vy-run { display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; }
.vy-run h3 { margin: 0 0 4px; font-size: 14.5px; }
.vy-run p { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 66ch; }
.vy-privacy { margin: 12px 2px 0; font-size: 11.5px; color: var(--muted); }

/* ═══ OVERVIEW ══════════════════════════════════════════════════ */
.vy-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px; margin-bottom: 16px; }
.vy-stat { padding: 15px 17px; }
.vy-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: var(--muted); }
.vy-stat-value { font-size: 25px; font-weight: 700; margin-top: 5px; letter-spacing: -.02em; }
.vy-stat-hint { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.vy-stat.accent { background: var(--accent-light); border-color: #bfdbfe; }
.vy-stat.accent .vy-stat-value, .vy-stat.accent .vy-stat-label { color: var(--accent); }
.vy-what h3 { margin: 0 0 5px; font-size: 14.5px; }
.vy-what p { margin: 0 0 13px; font-size: 12.5px; color: var(--muted); max-width: 78ch; }
.vy-what-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }

/* ═══ EMAILS ════════════════════════════════════════════════════ */
.vy-target { display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.vy-target h3 { margin: 0 0 4px; font-size: 14.5px; }
.vy-target p { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 62ch; }
.vy-target-pick { display: flex; align-items: center; gap: 9px; }
.vy-target-pick input { font: 500 12.5px inherit; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 6px; }
.vy-pill { font: 500 11px ui-monospace, Menlo, monospace; background: var(--accent-light);
  color: var(--accent); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
.vy-group { margin-bottom: 12px; }
.vy-missing { background: var(--warn-bg); border-color: var(--warn-border); }
.vy-group-head { display: flex; justify-content: space-between; align-items: flex-start;
  gap: 14px; flex-wrap: wrap; }
.vy-group-head h4 { margin: 0 0 3px; font-size: 14px; }
.vy-group-meta { margin: 0; font-size: 12px; color: var(--muted); }
.vy-plots { margin: 11px 0 0; padding-left: 18px; font-size: 12.5px; }
.vy-plots li { margin-bottom: 4px; }
.vy-group-actions { display: flex; gap: 9px; align-items: flex-end; flex-wrap: wrap;
  margin-top: 12px; }
.vy-hint { font-size: 11.5px; color: var(--muted); }
.vy-missing-fld { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.vy-missing-fld > span { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.vy-missing-fld input { font: 500 12.5px inherit; padding: 6px 9px; min-width: 230px;
  border: 1px solid var(--border); border-radius: 6px; }
.vy-missing-fld input.bad { border-color: var(--err-text); }
.vy-none { text-align: center; padding: 40px 24px; }
.vy-none h3 { margin: 0 0 6px; font-size: 15px; }
.vy-none p { margin: 0; font-size: 12.5px; color: var(--muted); }

/* ═══ LOG ═══════════════════════════════════════════════════════ */
.vy-log { margin: 0; padding-left: 20px; font-size: 12.5px; }
.vy-log li { padding: 7px 0; border-bottom: 1px solid #f1f3f6; }
.vy-log li strong { display: inline-block; min-width: 270px;
  font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.vy-log li span { color: var(--muted); }

/* ═══ TABLE ═════════════════════════════════════════════════════ */
.vy-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 12px; }
.vy-search { flex: 1; min-width: 180px; max-width: 320px; font: 500 12.5px inherit;
  padding: 7px 11px; border: 1px solid var(--border); border-radius: 7px; }
.vy-scroll { overflow: auto; max-height: 62vh; border: 1px solid var(--border);
  border-radius: var(--radius); }
.vy-scroll table { border-collapse: separate; border-spacing: 0; width: 100%;
  table-layout: fixed; font-size: 12.5px; }
.vy-scroll th { position: sticky; top: 0; z-index: 2; background: var(--accent);
  color: #fff; padding: 0; text-align: left; }
.vy-sort { width: 100%; background: none; border: none; color: inherit; font: 600 11.5px inherit;
  cursor: pointer; padding: 8px 10px; text-align: left; display: flex; align-items: center;
  gap: 5px; }
.vy-arrow { font-size: 8px; }
.vy-resize { position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; }
.vy-scroll th { position: sticky; }
.vy-filters th { top: 33px; background: var(--accent-dark); padding: 4px 6px; }
.vy-filters input { width: 100%; font: 500 11.5px inherit; padding: 4px 7px;
  border: 1px solid rgba(255,255,255,.28); border-radius: 5px; background: rgba(255,255,255,.94); }
.vy-scroll td { padding: 7px 10px; border-bottom: 1px solid #f1f3f6; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; }
.vy-scroll tbody tr:nth-child(even) td { background: #fafbfc; }
.vy-scroll tbody tr:hover td { background: var(--accent-light); }
.vy-mono { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.vy-dash { color: var(--muted); }
.vy-empty { text-align: center; padding: 34px; color: var(--muted); font-style: italic; }
.vy-edit { padding: 4px 6px; }
.vy-edit input { width: 100%; font: 500 12px inherit; padding: 4px 7px;
  border: 1px solid transparent; border-radius: 5px; background: transparent; }
.vy-edit input:hover { border-color: var(--border); }
.vy-edit input:focus { border-color: var(--accent); background: var(--white); outline: none; }
.vy-pager { display: flex; align-items: center; justify-content: space-between;
  margin-top: 11px; font-size: 12.5px; color: var(--muted); flex-wrap: wrap; gap: 10px; }
.vy-pager-btns { display: flex; gap: 6px; align-items: center; }
.vy-pager-btns select { font: 500 12px inherit; padding: 5px 8px;
  border: 1px solid var(--border); border-radius: 6px; }

@media (max-width: 760px) { .vy-drops { grid-template-columns: 1fr; } }
`;
