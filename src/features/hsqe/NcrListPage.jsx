import { useState, useEffect, useMemo, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminDelete } from "../../api/admin.js";
import NcrModal from "./NcrModal.jsx";
import {
  auditorLabel, rowMatches, isBlank, trimStr, UTILITIES,
} from "./ncr.js";

/* The non-compliance register.

   One row per finding, with a filter on every column. Ported from the
   original app, including the part of it that is easy to miss: each
   column can be filtered to blanks only, which is how somebody finds
   the twelve reports nobody has given an owner.

   ── Blanks and text are exclusive ──

   Turning blanks on clears and disables the typed filter for that
   column, because "empty and contains abc" has no answer. The original
   did the same; leaving both live would let somebody build a filter
   that silently matches nothing and looks broken.

   ── Names, not ids ──

   Every filter matches what is on screen. Filtering on the id behind a
   column would find nothing anybody types, and the column that shows
   "Northern Powergrid" would answer to a number instead. */

const COLUMNS = [
  { key: "ref", label: "NCR Ref", width: 100 },
  { key: "received", label: "Date Received", width: 175, filter: "daterange" },
  { key: "region", label: "Region", width: 130, filter: "select" },
  { key: "subregion", label: "Sub Region", width: 130, filter: "select" },
  { key: "bu", label: "Business Unit", width: 120, filter: "select" },
  { key: "project", label: "Project", width: 110 },
  { key: "site", label: "Site Name", width: 200 },
  { key: "description", label: "Description", width: 260 },
  { key: "auditor", label: "Auditor", width: 150, filter: "select" },
  { key: "owner", label: "Owner", width: 140 },
  { key: "utility", label: "Utility", width: 110, filter: "select" },
  { key: "status", label: "Status", width: 110, filter: "select" },
  { key: "close", label: "Close Date", width: 115, filter: "daterange" },
];

const fmtDate = (v) => {
  if (!v) return "";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return y ? `${d}/${m}/${y}` : String(v);
};

export default function NcrListPage() {
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({
    statuses: [], regions: [], subRegions: [], people: [],
    dnos: [], idnos: [], projects: [], businessUnits: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const [filters, setFilters] = useState({});
  const [blanks, setBlanks] = useState({});
  const [sort, setSort] = useState({ key: "received", dir: -1 });
  const [editing, setEditing] = useState(null);   // { row } or { row: null }

  const load = useCallback(async () => {
    try {
      const soft = (t) => adminList(t).catch(() => ({ rows: [] }));
      const [n, st, reg, sub, ppl, dno, idno, proj, bu] = await Promise.all([
        adminList("NCR"),
        soft("NCR_Status"), soft("Region"), soft("Sub_Region"), soft("Person"),
        soft("DNO"), soft("IDNO"), soft("Project"),
        /* Business Unit arrives with the HR section. Until then the
           request fails and the column simply reads as empty, rather
           than the page refusing to load over a lookup it can do
           without. */
        soft("Business_Unit"),
      ]);
      setRows(n.rows || []);
      setLookups({
        statuses: st.rows || [], regions: reg.rows || [], subRegions: sub.rows || [],
        people: ppl.rows || [], dnos: dno.rows || [], idnos: idno.rows || [],
        projects: proj.rows || [], businessUnits: bu.rows || [],
      });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const names = useMemo(() => {
    const by = (list, idKey, nameKey) => {
      const map = new Map((list || []).map((x) => [Number(x[idKey]), x[nameKey]]));
      return (id) => (id == null ? null : map.get(Number(id)) ?? null);
    };
    return {
      status: by(lookups.statuses, "NCR_Status_ID", "NCR_Status"),
      region: by(lookups.regions, "Region_ID", "Region"),
      subRegion: by(lookups.subRegions, "Sub_Region_ID", "Sub_Region"),
      person: by(lookups.people, "Person_ID", "Person_Name"),
      dno: by(lookups.dnos, "DNO_ID", "DNO_Name"),
      idno: by(lookups.idnos, "IDNO_ID", "IDNO_Name"),
      bu: by(lookups.businessUnits, "Business_Unit_ID", "Business_Unit"),
    };
  }, [lookups]);

  const projectById = useMemo(
    () => new Map((lookups.projects || []).map((p) => [Number(p.Project_ID), p])),
    [lookups.projects]);

  /* One row, one column, as it appears on screen. `raw` asks for the
     underlying date so a range filter can compare it. */
  const cell = useCallback((row, key, raw = false) => {
    const project = projectById.get(Number(row.Project_ID));
    switch (key) {
      case "ref": return row.NCR_Reference ?? "";
      case "received": return raw ? row.Date_Received : fmtDate(row.Date_Received);
      case "close": return raw ? row.Close_Date : fmtDate(row.Close_Date);
      case "region": return names.region(row.Region_ID) ?? "";
      case "subregion": return names.subRegion(row.Sub_Region_ID) ?? "";
      case "bu": return names.bu(row.Business_Unit_ID) ?? "";
      case "project": return project?.Project_Ref ?? "";
      case "site": return project?.Site_Name ?? "";
      case "description": return row.Description ?? "";
      case "auditor": return auditorLabel(row, { dnoName: names.dno, idnoName: names.idno });
      case "owner": return names.person(row.Owner_Person_ID) ?? "";
      case "utility": return row.Utility ?? "";
      case "status": return names.status(row.NCR_Status_ID) ?? "";
      default: return "";
    }
  }, [names, projectById]);

  /* Options for a select filter: whatever the rows actually contain,
     de-duplicated case-insensitively. Taken from the data rather than
     the lookup table so a filter never offers a value that would match
     nothing — and never omits one that is in use but retired from the
     lookup. */
  const optionsFor = useCallback((key) => {
    if (key === "utility") return UTILITIES;
    const seen = new Map();
    for (const row of rows) {
      const v = trimStr(cell(row, key));
      if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [rows, cell]);

  const shown = useMemo(() => {
    const list = rows.filter((row) => rowMatches(row, filters, blanks, cell));
    return [...list].sort((a, b) => {
      const av = cell(a, sort.key, true) ?? "";
      const bv = cell(b, sort.key, true) ?? "";
      return String(av).localeCompare(String(bv), "en-GB",
        { numeric: true, sensitivity: "base" }) * sort.dir;
    });
  }, [rows, filters, blanks, sort, cell]);

  const activeFilters = Object.values(filters).filter(Boolean).length
    + Object.values(blanks).filter(Boolean).length;

  function toggleBlanks(key) {
    setBlanks((b) => ({ ...b, [key]: !b[key] }));
    /* Clearing the typed term as the toggle goes on, so the disabled
       box is not left showing a filter that is no longer applied. */
    setFilters((f) => ({ ...f, [key]: "", [`${key}_from`]: "", [`${key}_to`]: "" }));
  }

  async function remove(row) {
    if (!window.confirm(
      `Delete ${row.NCR_Reference}?\n\nIts actions and comments go with it. `
      + "This cannot be undone.")) return;
    setBusy(row.NCR_ID);
    try {
      await adminDelete("NCR", row.NCR_ID, "NCR_ID");
      setRows((xs) => xs.filter((x) => x.NCR_ID !== row.NCR_ID));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  function exportCsv() {
    const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const csv = [
      COLUMNS.map((c) => c.label).join(","),
      ...shown.map((r) => COLUMNS.map((c) => esc(cell(r, c.key))).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Non Compliance Reports ${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  if (loading) return <p className="hint">Loading non-compliance reports…</p>;

  return (
    <div className="ncr">
      <style>{CSS}</style>

      <div className="ncr-head">
        <div>
          <h2>
            Non Compliance Reports
            <span className="ncr-count">
              {shown.length === rows.length
                ? `(${rows.length})`
                : `(${shown.length} of ${rows.length})`}
            </span>
          </h2>
          <p className="ncr-sub">
            Findings raised on site: who raised it, who owns it, and what is being
            done. Every column filters, and the {"\u2205"} button beside a filter
            finds the rows where that column is empty.
          </p>
        </div>
        <div className="ncr-head-actions">
          <button className="btn sm" disabled={!activeFilters}
            onClick={() => { setFilters({}); setBlanks({}); }}>
            Clear filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <button className="btn sm" disabled={!shown.length} onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn edit sm" onClick={() => setEditing({ row: null })}>
            + Add report
          </button>
        </div>
      </div>

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      {!lookups.businessUnits.length && (
        <Banner kind="muted">
          Business Unit is not available yet &mdash; it arrives with the HR section.
          The column and its filter are here and will fill in on their own once the
          lookup exists.
        </Banner>
      )}

      <div className="ncr-scroll">
        <table>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key}>
                  <button className="ncr-sort"
                    onClick={() => setSort((s) => (s.key === c.key
                      ? { key: c.key, dir: -s.dir } : { key: c.key, dir: 1 }))}>
                    <span>{c.label}</span>
                    <span className="ncr-arrow">
                      {sort.key === c.key ? (sort.dir === 1 ? "\u25B2" : "\u25BC") : ""}
                    </span>
                  </button>
                </th>
              ))}
              <th />
            </tr>
            <tr className="ncr-filters">
              {COLUMNS.map((c) => {
                const on = !!blanks[c.key];
                return (
                  <th key={c.key}>
                    <div className="ncr-filter">
                      {c.filter === "select" ? (
                        <select value={filters[c.key] ?? ""} disabled={on}
                          aria-label={`Filter ${c.label}`}
                          onChange={(e) => setFilters((f) =>
                            ({ ...f, [c.key]: e.target.value }))}>
                          <option value="">{"\u2014 All \u2014"}</option>
                          {optionsFor(c.key).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : c.filter === "daterange" ? (
                        <span className="ncr-range">
                          <input type="date" disabled={on} aria-label={`${c.label} from`}
                            value={filters[`${c.key}_from`] ?? ""}
                            onChange={(e) => setFilters((f) =>
                              ({ ...f, [`${c.key}_from`]: e.target.value }))} />
                          <input type="date" disabled={on} aria-label={`${c.label} to`}
                            value={filters[`${c.key}_to`] ?? ""}
                            onChange={(e) => setFilters((f) =>
                              ({ ...f, [`${c.key}_to`]: e.target.value }))} />
                        </span>
                      ) : (
                        <input disabled={on} placeholder="Filter…"
                          aria-label={`Filter ${c.label}`}
                          value={filters[c.key] ?? ""}
                          onChange={(e) => setFilters((f) =>
                            ({ ...f, [c.key]: e.target.value }))} />
                      )}
                      <button className={on ? "ncr-blank on" : "ncr-blank"}
                        title={`Show only rows where ${c.label} is empty`}
                        aria-pressed={on}
                        onClick={() => toggleBlanks(c.key)}>{"\u2205"}</button>
                    </div>
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {!shown.length && (
              <tr>
                <td className="ncr-empty" colSpan={COLUMNS.length + 1}>
                  {rows.length ? "No reports match the filters."
                    : "No non-compliance reports yet."}
                </td>
              </tr>
            )}
            {shown.map((row) => (
              <tr key={row.NCR_ID}>
                {COLUMNS.map((c) => {
                  const text = cell(row, c.key);
                  if (c.key === "status") {
                    return <td key={c.key}><StatusPill status={text} /></td>;
                  }
                  return (
                    <td key={c.key} className={c.key === "ref" ? "ncr-ref" : ""}
                      title={c.key === "description" ? text : undefined}>
                      {isBlank(text)
                        ? <span className="ncr-dash">{"\u2014"}</span> : text}
                    </td>
                  );
                })}
                <td className="ncr-actions">
                  <button className="btn edit sm"
                    onClick={() => setEditing({ row })}>Edit</button>
                  <button className="btn delete sm" disabled={busy === row.NCR_ID}
                    onClick={() => remove(row)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <NcrModal
          ncr={editing.row}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

export function StatusPill({ status }) {
  const cls = status === "Open" ? "bad"
    : status === "On Hold" ? "warn"
      : status === "Closed" ? "ok" : "off";
  return <span className={`ncr-pill ${cls}`}>{status || "\u2014"}</span>;
}

const CSS = `
.ncr-head { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.ncr-head h2 { margin: 0; font-size: 18px; }
.ncr-count { font-size: 12px; font-weight: 500; color: var(--muted); margin-left: 8px; }
.ncr-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 82ch;
  line-height: 1.6; }
.ncr-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.ncr-scroll { overflow: auto; max-height: 66vh; border: 1px solid var(--border);
  border-radius: var(--radius); }
.ncr-scroll table { border-collapse: separate; border-spacing: 0; width: max-content;
  min-width: 100%; table-layout: fixed; font-size: 12.5px; }
.ncr-scroll th { position: sticky; top: 0; z-index: 2; background: var(--accent);
  color: #fff; padding: 0; text-align: left; }
.ncr-sort { width: 100%; background: none; border: none; color: inherit;
  font: 600 11.5px inherit; cursor: pointer; padding: 8px 10px; text-align: left;
  display: flex; align-items: center; gap: 5px; }
.ncr-arrow { font-size: 8px; }
.ncr-filters th { top: 33px; background: var(--accent-dark); padding: 4px 5px; }
.ncr-filter { display: flex; align-items: center; gap: 4px; }
.ncr-filter input, .ncr-filter select { flex: 1; min-width: 0; font: 500 11.5px inherit;
  padding: 4px 6px; border: 1px solid rgba(255,255,255,.28); border-radius: 5px;
  background: rgba(255,255,255,.94); color: var(--text); }
.ncr-filter input:disabled, .ncr-filter select:disabled { opacity: .45; }
.ncr-range { display: flex; gap: 3px; flex: 1; min-width: 0; }
.ncr-range input { font-size: 10.5px; padding: 4px 3px; }
.ncr-blank { flex: none; width: 22px; height: 22px; border-radius: 5px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.12);
  color: #fff; font-size: 12px; line-height: 1; padding: 0; }
.ncr-blank:hover { background: rgba(255,255,255,.24); }
.ncr-blank.on { background: var(--warn-bg); color: var(--warn-text);
  border-color: var(--warn-border); font-weight: 700; }

.ncr-scroll td { padding: 7px 10px; border-bottom: 1px solid #f1f3f6;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ncr-scroll tbody tr:nth-child(even) td { background: #fafbfc; }
.ncr-scroll tbody tr:hover td { background: var(--accent-light); }
.ncr-ref { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px;
  font-weight: 600; }
.ncr-dash { color: var(--muted); }
.ncr-empty { text-align: center; padding: 40px; color: var(--muted); font-style: italic; }
.ncr-actions { white-space: nowrap; }
.ncr-actions .btn + .btn { margin-left: 4px; }

.ncr-pill { display: inline-block; padding: 2px 9px; border-radius: 10px;
  font-size: 11px; font-weight: 600; white-space: nowrap; }
.ncr-pill.ok { background: var(--ok-bg); color: var(--ok-text); }
.ncr-pill.warn { background: var(--warn-bg); color: var(--warn-text); }
.ncr-pill.bad { background: var(--err-bg); color: var(--err-text); }
.ncr-pill.off { background: #f3f4f6; color: #6b7280; }
`;
