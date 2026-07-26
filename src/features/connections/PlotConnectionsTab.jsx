import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listConnections, generateConnections, updateConnection, bulkUpdateConnections } from "../../api/connections.js";
import { UTILITIES, utilityById } from "../../lib/utilities.js";
import { useTableLayout, TABLE_CSS } from "../../lib/useTableLayout.js";
import FilterCell, { blankFilter, rowPasses, FILTER_CSS } from "../../components/FilterCell.jsx";

/* Plot connections — one row per plot per utility, tracked from
   programmed through laid to connected.

   Dates are the substance here, so they're editable inline and settable
   in bulk: a gang lays forty services in a day and nobody wants to type
   that date forty times. */

const nat = (a, b) => {
  const re = /^(\d+)(.*)$/;
  const ma = re.exec(String(a)), mb = re.exec(String(b));
  if (ma && mb) { const d = Number(ma[1]) - Number(mb[1]); return d !== 0 ? d : ma[2].localeCompare(mb[2]); }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

const COLS = [
  { key: "sel",     label: "",           width: 38,  type: "none", raw: () => "" },
  { key: "plot",    label: "Plot",       width: 84,  type: "text", raw: (r) => r._plotNumber || "" },
  { key: "utility", label: "Utility",    width: 150, type: "multi", raw: (r) => r.Utility_ID },
  { key: "prog",    label: "Programmed", width: 128, type: "date", raw: (r) => r.Programmed_Date },
  { key: "laid",    label: "As laid",    width: 128, type: "date", raw: (r) => r.As_Laid_Date },
  { key: "conn",    label: "Connected",  width: 128, type: "date", raw: (r) => r.Connection_Date },
  { key: "meter",   label: "Meter no.",  width: 140, type: "text", raw: (r) => r.Meter_Number || "" },
  { key: "scsub",   label: "SC submitted", width: 128, type: "date", raw: (r) => r.Service_Card_Submission_Date },
  { key: "pack",    label: "Pack",       width: 140, type: "multi", raw: (r) => r.Pack_Status_ID },
  { key: "adopter", label: "Adopter",    width: 140, type: "multi", raw: (r) => r.IDNO_ID },
  { key: "av",      label: "AV value",   width: 104, type: "num",  align: "right", raw: (r) => r.AV_Value ?? null },
];

const BULK_DATES = [
  ["Programmed_Date", "Programmed"],
  ["As_Laid_Date", "As laid"],
  ["Connection_Date", "Connected"],
  ["Service_Card_Submission_Date", "SC submitted"],
];

export default function PlotConnectionsTab({ projectId }) {
  const layout = useTableLayout("connections", COLS);
  const [lookups, setLookups] = useState(null);
  const [plots, setPlots] = useState([]);
  const [conns, setConns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [selected, setSelected] = useState([]);
  const [sort, setSort] = useState({ key: "plot", dir: "asc" });
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genUtils, setGenUtils] = useState([]);
  const [bulkField, setBulkField] = useState("Programmed_Date");
  const [bulkValue, setBulkValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listConnections(projectId)]);
      setLookups(lk);
      setPlots(res.plots || []);
      setConns(res.connections || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const plotById = useMemo(() => {
    const m = {};
    plots.forEach((p) => { m[p.Plot_ID] = p; });
    return m;
  }, [plots]);

  const rows = useMemo(
    () => conns.map((c) => ({ ...c, _plotNumber: plotById[c.Plot_ID]?.Plot_Number ?? "" })),
    [conns, plotById]
  );

  const packName = (id) => (lookups?.packStatuses || []).find((s) => s.Pack_Status_ID === id)?.Pack_Status ?? "\u2014";
  const idnoName = (id) => (lookups?.idnos || []).find((i) => i.IDNO_ID === id)?.IDNO_Name ?? "\u2014";

  const filterOptions = (key) => {
    if (key === "utility") return UTILITIES.map((u) => ({ id: u.id, label: u.name }));
    if (key === "pack") return (lookups?.packStatuses || []).map((s) => ({ id: s.Pack_Status_ID, label: s.Pack_Status }));
    if (key === "adopter") return (lookups?.idnos || []).map((i) => ({ id: i.IDNO_ID, label: i.IDNO_Name }));
    return [];
  };

  const shown = useMemo(() => {
    const out = rows.filter((r) => rowPasses(r, COLS.filter((c) => c.type !== "none"), filters));
    const col = COLS.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (!col) return 0;
      if (col.key === "plot") return nat(a._plotNumber, b._plotNumber) * dir;
      const va = col.raw(a), vb = col.raw(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [rows, filters, sort]);

  const stats = useMemo(() => ({
    total: shown.length,
    laid: shown.filter((r) => r.As_Laid_Date).length,
    connected: shown.filter((r) => r.Connection_Date).length,
  }), [shown]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function patch(r, key, value) {
    setConns((x) => x.map((y) => (y.Plot_Utility_ID === r.Plot_Utility_ID ? { ...y, [key]: value } : y)));
    try { await updateConnection(projectId, r.Plot_Utility_ID, { [key]: value }); }
    catch (e) { setError(e.message); await load(); }
  }

  async function generate() {
    if (!genUtils.length) return setError("Choose at least one utility.");
    setBusy(true);
    try {
      const eligible = plots.filter((p) => !p.Self_Lay_Provider).map((p) => p.Plot_ID);
      const res = await generateConnections(projectId, eligible, genUtils);
      setFlash(`${res.created ?? 0} connection${res.created === 1 ? "" : "s"} created`);
      setTimeout(() => setFlash(""), 3000);
      setGenOpen(false);
      setGenUtils([]);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function applyBulk() {
    if (!bulkValue) return setError("Pick a date first.");
    setBusy(true);
    try {
      await bulkUpdateConnections(projectId, selected, { [bulkField]: bulkValue });
      setFlash(`${selected.length} connection${selected.length === 1 ? "" : "s"} updated`);
      setTimeout(() => setFlash(""), 2600);
      setSelected([]);
      setBulkValue("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading connections&hellip;</div>;

  const allSelected = shown.length > 0 && shown.every((r) => selected.includes(r.Plot_Utility_ID));
  const selfLay = plots.filter((p) => p.Self_Lay_Provider).length;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Plot connections <span className="count">{conns.length}</span></h3>
          <p className="tab-sub">One row per plot per utility, from programmed through laid to connected.</p>
        </div>
        <button className="btn accent" onClick={() => setGenOpen((g) => !g)}>
          {genOpen ? "Cancel" : "+ Generate connections"}
        </button>
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {genOpen && (
        <div className="gen-panel">
          <p className="panel-label">Generate connections</p>
          <p className="hint">
            Creates a row for every plot against each utility chosen. Existing rows are left
            alone{selfLay > 0 && `, and ${selfLay} self-lay plot${selfLay === 1 ? " is" : "s are"} skipped`}.
          </p>
          <div className="util-pick">
            {UTILITIES.map((u) => (
              <label key={u.id} className={genUtils.includes(u.id) ? "up on" : "up"}>
                <input type="checkbox" checked={genUtils.includes(u.id)}
                  onChange={() => setGenUtils((g) => g.includes(u.id) ? g.filter((x) => x !== u.id) : [...g, u.id])} />
                <span className="dot" style={{ background: u.colour }} />
                {u.name}
              </label>
            ))}
          </div>
          <button className="btn accent" disabled={busy || !genUtils.length} onClick={generate}>
            {busy ? "Generating\u2026" : `Generate for ${plots.length - selfLay} plot(s) × ${genUtils.length} utility(ies)`}
          </button>
        </div>
      )}

      {conns.length > 0 && (
        <div className="conn-stats">
          <span className="cs-pill">{stats.total} connections</span>
          <span className="cs-pill laid">{stats.laid} laid</span>
          <span className="cs-pill conn">{stats.connected} connected</span>
        </div>
      )}

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.length} selected</span>
          <select value={bulkField} onChange={(e) => setBulkField(e.target.value)}>
            {BULK_DATES.map(([k, l]) => <option key={k} value={k}>Set {l}</option>)}
          </select>
          <input type="date" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
          <button className="btn accent" disabled={busy || !bulkValue} onClick={applyBulk}>
            {busy ? "Applying\u2026" : "Apply"}
          </button>
          <button className="bulk-x" onClick={() => setSelected([])} title="Clear">&#10005;</button>
        </div>
      )}

      {conns.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No connections yet</p>
          <p>Generate them from the project&rsquo;s plots.</p>
        </div>
      ) : (
        <div className="dt-wrap">
          <table className="dt">
            <colgroup>{COLS.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}</colgroup>
            <thead>
              <tr className="head-row">
                {COLS.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align || "left" }}
                      onClick={() => c.type !== "none" && toggleSort(c.key)}>
                    {c.key === "sel" ? (
                      <input type="checkbox" checked={allSelected} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSelected(e.target.checked ? shown.map((r) => r.Plot_Utility_ID) : [])} />
                    ) : (<>
                      {c.label}
                      {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                    </>)}
                    <span className="resizer" onMouseDown={(e) => layout.startResize(e, c.key)} />
                  </th>
                ))}
              </tr>
              <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                {COLS.map((c) => (
                  <th key={c.key}>
                    {c.type !== "none" && (
                      <FilterCell col={c} value={filters[c.key] ?? blankFilter(c.type)}
                        onChange={(v) => setFilters((x) => ({ ...x, [c.key]: v }))}
                        options={c.type === "multi" ? filterOptions(c.key) : null}
                        open={openFilter === c.key}
                        setOpen={(o) => setOpenFilter(o ? c.key : null)} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={COLS.length} className="no-rows">No connections match these filters.</td></tr>
              ) : shown.map((r) => {
                const u = utilityById(r.Utility_ID);
                const on = selected.includes(r.Plot_Utility_ID);
                return (
                  <tr key={r.Plot_Utility_ID} className={on ? "row-sel" : r.Connection_Date ? "done" : ""}>
                    <td className="mid">
                      <input type="checkbox" checked={on}
                        onChange={() => setSelected((s) => on ? s.filter((x) => x !== r.Plot_Utility_ID) : [...s, r.Plot_Utility_ID])} />
                    </td>
                    <td className="mono strong">{r._plotNumber}</td>
                    <td><span className="dot" style={{ background: u?.colour }} /> {u?.name}</td>
                    <td><input className="in" type="date" value={r.Programmed_Date || ""}
                      onChange={(e) => patch(r, "Programmed_Date", e.target.value)} /></td>
                    <td><input className="in" type="date" value={r.As_Laid_Date || ""}
                      onChange={(e) => patch(r, "As_Laid_Date", e.target.value)} /></td>
                    <td><input className="in" type="date" value={r.Connection_Date || ""}
                      onChange={(e) => patch(r, "Connection_Date", e.target.value)} /></td>
                    <td><input className="in mono" value={r.Meter_Number || ""}
                      onChange={(e) => patch(r, "Meter_Number", e.target.value)} /></td>
                    <td><input className="in" type="date" value={r.Service_Card_Submission_Date || ""}
                      onChange={(e) => patch(r, "Service_Card_Submission_Date", e.target.value)} /></td>
                    <td>
                      <select className="in" value={r.Pack_Status_ID ?? ""}
                        onChange={(e) => patch(r, "Pack_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {(lookups.packStatuses || []).map((s) => (
                          <option key={s.Pack_Status_ID} value={s.Pack_Status_ID}>{s.Pack_Status}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="in" value={r.IDNO_ID ?? ""}
                        onChange={(e) => patch(r, "IDNO_ID", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {(lookups.idnos || []).map((i) => (
                          <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num"><input className="in num" type="number" step="0.01" value={r.AV_Value ?? ""}
                      onChange={(e) => patch(r, "AV_Value", e.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = TABLE_CSS + FILTER_CSS + `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count { font-size: 11px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }
.gen-panel { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb;
  padding: 16px; margin-bottom: 16px; }
.util-pick { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px; }
.up { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; margin: 0; cursor: pointer; }
.up.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.conn-stats { display: flex; gap: 8px; margin-bottom: 12px; }
.cs-pill { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 13px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.cs-pill.laid { background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text); }
.cs-pill.conn { background: var(--ok-bg); border-color: var(--ok-border); color: var(--ok-text); }
.bulk-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: var(--accent);
  color: #fff; border-radius: var(--radius); padding: 9px 12px; margin-bottom: 10px; }
.bulk-count { font-size: 12px; font-weight: 700; }
.bulk-bar select, .bulk-bar input { width: auto; min-width: 140px; font-size: 12px; padding: 5px 8px; }
.bulk-bar .btn { padding: 5px 13px; font-size: 12.5px; }
.bulk-x { background: none; border: none; color: #fff; cursor: pointer; font-size: 12px; margin-left: auto; }
.dt td { padding: 3px 6px; }
.dt .in { width: 100%; font-size: 11.5px; padding: 3px 6px; border-radius: 5px; }
.dt .in.num { text-align: right; }
.dt .num { text-align: right; }
.dt .mid { text-align: center; }
.dt .strong { font-weight: 700; }
.dt tbody tr.row-sel { background: #fff7ed !important; }
.dt tbody tr.done td:first-child { box-shadow: inset 3px 0 0 #059669; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
