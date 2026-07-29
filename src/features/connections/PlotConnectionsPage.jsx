import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listAllConnections, updateConnection, bulkUpdateConnections } from "../../api/connections.js";
import { UTILITIES, RESIDENTIAL_UTILITIES, utilityById } from "../../lib/utilities.js";
import NewScheduleModal from "./NewScheduleModal.jsx";
import { useTableLayout } from "../../lib/useTableLayout.js";
import ColumnsMenu from "../../components/ColumnsMenu.jsx";
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
  { key: "sel",     label: "Select",     width: 38,  type: "none", fixed: true, raw: () => "" },
  { key: "project", label: "Project",    width: 110, type: "multi", raw: (r) => r._projectId },
  { key: "site",    label: "Site",       width: 180, type: "text",  raw: (r) => r._siteName || "" },
  { key: "plot",    label: "Plot",       width: 80,  type: "text",  align: "left", fixed: true, raw: (r) => r._plotNumber || "" },
  { key: "utility", label: "Utility",    width: 140, type: "multi", raw: (r) => r.Utility_ID },
  { key: "prog",    label: "Programmed", width: 128, type: "date", raw: (r) => r.Programmed_Date },
  { key: "conn",    label: "Connected",  width: 128, type: "date", raw: (r) => r.Connection_Date },
  { key: "laid",    label: "As laid",    width: 128, type: "date", raw: (r) => r.As_Laid_Date },
  { key: "outcome", label: "Outcome",    width: 150, type: "multi", raw: (r) => r.Visit_Outcome_ID },
  { key: "pack",    label: "Status",     width: 140, type: "multi", raw: (r) => r.Pack_Status_ID },
  { key: "meter",   label: "Meter no.",  width: 140, type: "text", raw: (r) => r.Meter_Number || "" },
  { key: "scsub",   label: "SC submitted", width: 128, type: "date", raw: (r) => r.Service_Card_Submission_Date },
];

/* Grouping by a field makes that column redundant — the heading already
   says it, so showing it repeats the same value down every row. */
const GROUP_HIDES = { project: ["project", "site"], region: [], utility: ["utility"], date: ["prog"] };

/* The order work actually happens in, taken from the column order rather
   than written out again — a column moved in COLS moves here with it.

   Deliberately the declared order, not the on-screen one: dragging a
   column changes where you look, not what has to be true before a field
   can be filled in. A rule that followed the layout would let someone
   unlock a field by rearranging the table.

   Nothing after Programmed can be filled until a date is set: recording
   a connection for a visit that was never booked is how a plot ends up
   connected on paper and untouched on site. Nothing after Outcome until
   there is one, for the same reason — a pack status against a visit with
   no known result says nothing. */
const at = (k) => COLS.findIndex((c) => c.key === k);
const AFTER_PROG = COLS.slice(at("prog") + 1).map((c) => c.key);
const AFTER_OUTCOME = COLS.slice(at("outcome") + 1).map((c) => c.key);

const lockedReason = (colKey, r) => {
  if (AFTER_OUTCOME.includes(colKey) && !r.Visit_Outcome_ID) return "Set an outcome first";
  if (AFTER_PROG.includes(colKey) && !r.Programmed_Date) return "Set a programmed date first";
  return null;
};

/* Every field the bulk editor can write, with what it is and which
   column gates it. */
const BULK_FIELDS = [
  { field: "Programmed_Date", label: "Programmed", type: "date", col: "prog" },
  { field: "Connection_Date", label: "Connected", type: "date", col: "conn" },
  { field: "As_Laid_Date", label: "As laid", type: "date", col: "laid" },
  { field: "Visit_Outcome_ID", label: "Outcome", type: "outcome", col: "outcome" },
  { field: "Pack_Status_ID", label: "Status", type: "pack", col: "pack" },
  { field: "Meter_Number", label: "Meter no.", type: "text", col: "meter" },
  { field: "Service_Card_Submission_Date", label: "SC submitted", type: "date", col: "scsub" },
];

export default function PlotConnectionsPage() {
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
  /* One draft per field, empty meaning "leave alone". A bulk form
     pre-filled from one row is how the other forty get overwritten. */
  const [bulkDraft, setBulkDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [util, setUtil] = useState("");
  const [state, setState] = useState("");        // all / connected / outstanding
  const [progFrom, setProgFrom] = useState("");
  const [progTo, setProgTo] = useState("");
  const [hideLaid, setHideLaid] = useState(false);
  const [groupBy, setGroupBy] = useState("project");
  /* Which groups are shut. Collapsed rather than expanded is the state
     worth storing: a set of the few that are shut stays small, and a new
     group appearing on the next load is open by default rather than
     hidden because nobody had opened it yet. Keyed by label, so
     regrouping starts everything open — the keys mean something
     different then. */
  const [collapsed, setCollapsed] = useState({});

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listAllConnections()]);
      setLookups(lk);
      setPlots(res.plots || []);
      setConns(res.connections || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const plotById = useMemo(() => {
    const m = {};
    plots.forEach((p) => { m[p.Plot_ID] = p; });
    return m;
  }, [plots]);

  const rows = useMemo(
    () => conns.map((c) => ({ ...c, _plotNumber: c._plotNumber ?? plotById[c.Plot_ID]?.Plot_Number ?? "" })),
    [conns, plotById]
  );

  const packName = (id) => (lookups?.packStatuses || []).find((s) => s.Pack_Status_ID === id)?.Pack_Status ?? "\u2014";

  const projectOptions = useMemo(() => {
    const m = new Map();
    conns.forEach((c) => { if (c._projectId && !m.has(c._projectId)) m.set(c._projectId, c._projectRef); });
    return [...m].map(([id, label]) => ({ id, label }));
  }, [conns]);

  const filterOptions = (key) => {
    if (key === "project") return projectOptions;
    if (key === "utility") return RESIDENTIAL_UTILITIES.map((u) => ({ id: u.id, label: u.name }));
    if (key === "pack") return (lookups?.packStatuses || []).map((s) => ({ id: s.Pack_Status_ID, label: s.Pack_Status }));
    return [];
  };

  const iso = (d) => (d ? String(d).slice(0, 10) : "");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !`${r._projectRef} ${r._siteName} ${r._plotNumber}`.toLowerCase().includes(q)) return false;
      if (region && String(r._regionId) !== region) return false;
      if (util && String(r.Utility_ID) !== util) return false;
      if (state === "connected" && !r.Connection_Date) return false;
      if (state === "outstanding" && r.Connection_Date) return false;
      if (hideLaid && r.As_Laid_Date) return false;
      const pd = iso(r.Programmed_Date);
      if (progFrom && (!pd || pd < progFrom)) return false;
      if (progTo && (!pd || pd > progTo)) return false;
      return rowPasses(r, COLS.filter((c) => c.type !== "none"), filters);
    });
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
  }, [rows, filters, sort, search, region, util, state, progFrom, progTo, hideLaid]);

  const stats = useMemo(() => ({
    total: shown.length,
    connected: shown.filter((r) => r.Connection_Date).length,
  }), [shown]);

  /* Grouping matches the original's Group By: rows stay in one table but
     get a heading row per group, so a day's programme or a site reads as a
     block rather than something you have to scan for. */
  const groups = useMemo(() => {
    if (groupBy === "none") return [["", shown]];
    const key = (r) =>
      groupBy === "project" ? `${r._projectRef} \u2014 ${r._siteName || "Unnamed site"}`
      : groupBy === "region" ? ((lookups?.regions || []).find((x) => x.Region_ID === r._regionId)?.Region ?? "No region")
      : groupBy === "utility" ? (utilityById(r.Utility_ID)?.name ?? "Unknown")
      : r.Programmed_Date ? String(r.Programmed_Date).slice(0, 10).split("-").reverse().join("/") : "Not programmed";
    const m = new Map();
    shown.forEach((r) => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [shown, groupBy, lookups]);

  const hidden = GROUP_HIDES[groupBy] || [];
  /* The layout's order, minus whatever this grouping folds away. Reading
     COLS directly here was the bug: a dropped column updated the saved
     order and the table went on rendering in the original sequence, so
     the drag looked like it had failed. */
  /* Two different kinds of hiding, deliberately kept apart: the grouping
     folds away the column it is grouping by, and layout.visible carries
     what the user chose in the Columns picker. Merging them would make a
     grouping change look like it had forgotten their choice. */
  const cols = layout.visible.filter((c) => !hidden.includes(c.key));

  const activeToolbar =
    !!(search || region || util || state || progFrom || progTo || hideLaid);

  function clearToolbar() {
    setSearch(""); setRegion(""); setUtil(""); setState("");
    setProgFrom(""); setProgTo(""); setHideLaid(false); setFilters({});
  }

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function patch(r, key, value) {
    setConns((x) => x.map((y) => (y.Plot_Utility_ID === r.Plot_Utility_ID ? { ...y, [key]: value } : y)));
    try { await updateConnection(r._projectId, r.Plot_Utility_ID, { [key]: value }); }
    catch (e) { setError(e.message); await load(); }
  }

  async function applyBulk() {
    const changes = Object.fromEntries(
      Object.entries(bulkDraft).filter(([, v]) => v !== "" && v != null)
    );
    if (!Object.keys(changes).length) return setError("Nothing to apply \u2014 fill a field first.");

    setBusy(true);
    try {
      const rows = shown.filter((r) => selected.includes(r.Plot_Utility_ID));

      /* The same rule the cells enforce. Without it the bulk bar is a way
         round it, and the first thing anyone would do with forty rows is
         exactly that. A row that can't take a field is skipped for that
         field rather than for the whole change. */
      let skipped = 0;
      const byProject = {};
      for (const r of rows) {
        const allowed = {};
        for (const [field, value] of Object.entries(changes)) {
          const col = BULK_FIELDS.find((b) => b.field === field)?.col;
          /* Judged against the row as it will be after this change, so
             setting a programmed date and a connected date together
             works in one pass rather than needing two. */
          const after = { ...r, ...changes };
          if (col && lockedReason(col, after)) { skipped++; continue; }
          allowed[field] = value;
        }
        if (!Object.keys(allowed).length) continue;
        const key = `${r._projectId}|${JSON.stringify(allowed)}`;
        (byProject[key] ||= { pid: r._projectId, changes: allowed, ids: [] })
          .ids.push(r.Plot_Utility_ID);
      }

      for (const { pid, changes: ch, ids } of Object.values(byProject)) {
        await bulkUpdateConnections(pid, ids, ch);
      }
      setBulkDraft({});
      setFlash(`${rows.length} connection${rows.length === 1 ? "" : "s"} updated`
        + (skipped ? ` \u2014 ${skipped} field(s) skipped, not unlocked yet` : ""));
      setTimeout(() => setFlash(""), 2600);
      setSelected([]);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading connections&hellip;</div>;

  const allSelected = shown.length > 0 && shown.every((r) => selected.includes(r.Plot_Utility_ID));
  
  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h2>Plot connections</h2>
          <p className="tab-sub">
            Every connection across all projects. Add them with New Schedule, then
            track and update them here.
          </p>
        </div>
        <div className="ph-actions">
          <ColumnsMenu
            columns={COLS}
            hidden={layout.hidden}
            onToggle={layout.toggleColumn}
            onReset={layout.reset}
          />
          <button className="btn ghost" onClick={() => { setLoading(true); load(); }}>&#8635; Refresh</button>
          <button className="btn accent" onClick={() => setScheduleOpen(true)}>+ New Schedule</button>
        </div>
      </div>

      {scheduleOpen && (
        <NewScheduleModal
          onClose={() => setScheduleOpen(false)}
          onSaved={(msg) => { setFlash(msg); setTimeout(() => setFlash(""), 5000); load(); }}
        />
      )}

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <div className="pc-toolbar">
        <input className="tb-search" value={search} aria-label="Search connections" placeholder="&#128269; Search project, site or plot&hellip;"
          onChange={(e) => setSearch(e.target.value)} />

        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {(lookups?.regions || []).map((r) => (
            <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
          ))}
        </select>

        <select value={util} onChange={(e) => setUtil(e.target.value)}>
          <option value="">All utilities</option>
          {RESIDENTIAL_UTILITIES.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All connections</option>
          <option value="outstanding">Not yet connected</option>
          <option value="connected">Connected</option>
        </select>

        <span className="tb-dates">
          <span className="tb-lbl">Programmed</span>
          <input className="dt" type="date" value={progFrom} onChange={(e) => setProgFrom(e.target.value)} />
          <span className="tb-lbl">to</span>
          <input className="dt" type="date" value={progTo} onChange={(e) => setProgTo(e.target.value)} />
          {(progFrom || progTo) && (
            <button className="tb-x" title="Clear dates"
              onClick={() => { setProgFrom(""); setProgTo(""); }}>&#10005;</button>
          )}
        </span>

        <span className="tb-group">
          <span className="tb-lbl">Group by</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="project">Project</option>
            <option value="region">Region</option>
            <option value="utility">Utility</option>
            <option value="date">Programmed date</option>
            <option value="none">No grouping</option>
          </select>
        </span>

        {/* Only worth offering while there are groups to work through. */}
        {groupBy !== "none" && (
          <span className="tb-group">
            <button className="tb-link" onClick={() => setCollapsed({})}>Expand all</button>
            <button className="tb-link"
              onClick={() => setCollapsed(Object.fromEntries(
                groups.filter(([label]) => label).map(([label]) => [label, true])))}>
              Collapse all
            </button>
          </span>
        )}

        <label className={hideLaid ? "tb-chk on" : "tb-chk"}>
          <input type="checkbox" checked={hideLaid} onChange={(e) => setHideLaid(e.target.checked)} />
          Hide rows with an as-laid date
        </label>

        {activeToolbar && (
          <button className="tb-clear" onClick={clearToolbar}>&#10005; Clear filters</button>
        )}
      </div>

      {conns.length > 0 && (
        <div className="conn-stats">
          <span className="cs-pill">{stats.total} connections</span>
          <span className="cs-pill conn">{stats.connected} connected</span>
        </div>
      )}

      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.length} selected</span>
          {BULK_FIELDS.map((b) => (
            <label key={b.field} className="bulk-f">
              <span>{b.label}</span>
              {b.type === "date" ? (
                <input type="date" value={bulkDraft[b.field] ?? ""}
                  onChange={(e) => setBulkDraft((d) => ({ ...d, [b.field]: e.target.value }))} />
              ) : b.type === "text" ? (
                <input value={bulkDraft[b.field] ?? ""} placeholder="\u2014"
                  onChange={(e) => setBulkDraft((d) => ({ ...d, [b.field]: e.target.value }))} />
              ) : (
                <select value={bulkDraft[b.field] ?? ""}
                  onChange={(e) => setBulkDraft((d) => ({
                    ...d, [b.field]: e.target.value ? Number(e.target.value) : "",
                  }))}>
                  <option value="">&mdash;</option>
                  {(b.type === "outcome" ? lookups.visitOutcomes : lookups.packStatuses || []).map((x) => (
                    b.type === "outcome"
                      ? <option key={x.Visit_Outcome_ID} value={x.Visit_Outcome_ID}>{x.Visit_Outcome}</option>
                      : <option key={x.Pack_Status_ID} value={x.Pack_Status_ID}>{x.Pack_Status}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
          <button className="btn accent" disabled={busy} onClick={applyBulk}>
            {busy ? "Applying\u2026" : "Apply"}
          </button>
          <button className="bulk-x" onClick={() => { setSelected([]); setBulkDraft({}); }}
            title="Clear">&#10005;</button>
        </div>
      )}

      {conns.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No connections yet</p>
          <p>Open a project, go to Plots, and generate connections there.</p>
        </div>
      ) : (
        <div className="dt-wrap">
          <table className="dt pc">
            <colgroup>{cols.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}</colgroup>
            <thead>
              <tr className="head-row">
                {cols.map((c) => (
                  <th key={c.key} {...layout.reorderProps(c.key)}
                      onClick={() => c.type !== "none" && toggleSort(c.key)}>
                    {c.key === "sel" ? (
                      <input type="checkbox" checked={allSelected} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSelected(e.target.checked ? shown.map((r) => r.Plot_Utility_ID) : [])} />
                    ) : (<>
                      {c.label}
                      {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                    </>)}
                    <span className="resizer" draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => layout.startResize(e, c.key)} />
                  </th>
                ))}
              </tr>
              <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                {cols.map((c) => (
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
                <tr><td colSpan={cols.length} className="no-rows">No connections match these filters.</td></tr>
              ) : groups.flatMap(([label, list]) => [
                ...(label ? [(
                  <tr className="grp-row" key={`g:${label}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [label]: !c[label] }))}>
                    <td colSpan={cols.length}>
                      {/* Selects this project's connections rather than the
                          whole table. With several projects on screen,
                          select-all in the header is almost never what was
                          meant. */}
                      <input type="checkbox" className="grp-sel"
                        checked={list.length > 0 && list.every((r) => selected.includes(r.Plot_Utility_ID))}
                        ref={(el) => {
                          if (!el) return;
                          const some = list.some((r) => selected.includes(r.Plot_Utility_ID));
                          const all = list.every((r) => selected.includes(r.Plot_Utility_ID));
                          /* Half-selected reads as "some of these", which a
                             plain tick can't say. */
                          el.indeterminate = some && !all;
                        }}
                        aria-label={`Select every connection in ${label}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const ids = list.map((r) => r.Plot_Utility_ID);
                          setSelected((sel) => e.target.checked
                            ? [...new Set([...sel, ...ids])]
                            : sel.filter((x) => !ids.includes(x)));
                        }} />
                      <button className="grp-toggle" aria-expanded={!collapsed[label]}
                        aria-label={`${collapsed[label] ? "Expand" : "Collapse"} ${label}`}
                        onClick={(e) => {
                          /* The whole row is the target, so the button is
                             for the keyboard and for the arrow itself —
                             without this it would toggle twice. */
                          e.stopPropagation();
                          setCollapsed((c) => ({ ...c, [label]: !c[label] }));
                        }}>
                        {collapsed[label] ? "\u25B8" : "\u25BE"}
                      </button>
                      {label} <span className="grp-count">{list.length}</span>
                    </td>
                  </tr>
                )] : []),
                ...(label && collapsed[label] ? [] : list.map((r) => {
                const u = utilityById(r.Utility_ID);
                const on = selected.includes(r.Plot_Utility_ID);
                return (
                  <tr key={r.Plot_Utility_ID} className={on ? "row-sel" : r.Connection_Date ? "done" : ""}>
                    {/* Per column, so a reordered header takes its data
                        with it. Cells written in a fixed sequence shear
                        away from their headings the moment one moves. */}
                    {cols.map((col) => {
                      /* Locked until the step before it has been recorded.
                         Shown as a disabled control with the reason on
                         hover, rather than hidden — an empty cell that
                         can't be typed into looks broken without it. */
                      const locked = lockedReason(col.key, r);
                      return (
                      <td key={col.key}
                        title={locked || undefined}
                        className={[
                          col.key === "sel" ? "mid" : "",
                          col.key === "project" ? "mono ref" : "",
                          col.key === "plot" ? "mono strong plot-cell" : "",
                          locked ? "locked" : "",
                        ].filter(Boolean).join(" ") || undefined}>

                        {col.key === "sel" ? (
                          <input type="checkbox" checked={on}
                            onChange={() => setSelected((sx) => on
                              ? sx.filter((x) => x !== r.Plot_Utility_ID)
                              : [...sx, r.Plot_Utility_ID])} />)

                        : col.key === "project" ? r._projectRef
                        : col.key === "site" ? r._siteName
                        : col.key === "plot" ? r._plotNumber

                        : col.key === "utility" ? (<>
                          <span className="dot" style={{ background: u?.colour }} /> {u?.name}
                        </>)

                        : col.key === "prog" ? (
                          <input className="in" type="date" value={r.Programmed_Date || ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Programmed_Date", e.target.value)} />)

                        : col.key === "conn" ? (
                          <input className="in" type="date" value={r.Connection_Date || ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Connection_Date", e.target.value)} />)

                        : col.key === "laid" ? (
                          <input className="in" type="date" value={r.As_Laid_Date || ""} disabled={!!locked}
                            onChange={(e) => patch(r, "As_Laid_Date", e.target.value)} />)

                        : col.key === "outcome" ? (
                          <select className="in" value={r.Visit_Outcome_ID ?? ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Visit_Outcome_ID", e.target.value ? Number(e.target.value) : null)}>
                            <option value="">&mdash;</option>
                            {(lookups.visitOutcomes || []).map((v) => (
                              <option key={v.Visit_Outcome_ID} value={v.Visit_Outcome_ID}>{v.Visit_Outcome}</option>
                            ))}
                          </select>)

                        : col.key === "pack" ? (
                          <select className="in" value={r.Pack_Status_ID ?? ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Pack_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                            <option value="">&mdash;</option>
                            {(lookups.packStatuses || []).map((x) => (
                              <option key={x.Pack_Status_ID} value={x.Pack_Status_ID}>{x.Pack_Status}</option>
                            ))}
                          </select>)

                        : col.key === "meter" ? (
                          <input className="in mono" value={r.Meter_Number || ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Meter_Number", e.target.value)} />)

                        : col.key === "scsub" ? (
                          <input className="in" type="date" value={r.Service_Card_Submission_Date || ""} disabled={!!locked}
                            onChange={(e) => patch(r, "Service_Card_Submission_Date", e.target.value)} />)

                        /* A column with no branch renders empty rather
                           than falling through to whichever cell happens
                           to be last — that was how the old chain worked,
                           and it would put the wrong control in any
                           column added later. */
                        : null}
                      </td>
                      );
                    })}
                  </tr>
                );
                })),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = FILTER_CSS + `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h2 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
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
.ph-actions { display: flex; align-items: center; gap: 10px; }
.pc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
.pc-toolbar select { width: auto; min-width: 132px; font-size: 12px; padding: 5px 8px; }
.tb-search { width: 230px; font-size: 12px; padding: 5px 9px; }
.tb-link { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 2px 4px; border-radius: 4px; }
.tb-link:hover { background: var(--accent-light); }
.tb-dates, .tb-group { display: inline-flex; align-items: center; gap: 6px;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 3px 8px; }
.tb-lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.tb-dates .dt { width: 138px; font-size: 12px; padding: 4px 6px; border: none; background: transparent; }
.tb-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 10px; }
.tb-chk { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--muted); background: var(--white);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 11px; margin: 0; cursor: pointer; }
.tb-chk.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.tb-clear { background: none; border: none; color: var(--accent); font: 600 12px inherit; cursor: pointer; }
.grp-row { cursor: pointer; }
.grp-row:hover td { background: #e4e8f2 !important; }
.grp-sel { margin-right: 9px; vertical-align: -2px; }
.grp-toggle { background: none; border: none; cursor: pointer; color: var(--accent);
  font-size: 11px; padding: 0 7px 0 0; line-height: 1; }
.grp-row td { background: #eef0f4 !important; font-size: 11.5px; font-weight: 700;
  color: var(--accent); padding: 6px 10px !important; position: sticky; top: 60px; z-index: 1; }
.grp-count { font-weight: 700; background: var(--accent); color: #fff; border-radius: 20px;
  padding: 1px 8px; margin-left: 7px; font-size: 10.5px; }
.conn-stats { display: flex; gap: 8px; margin-bottom: 12px; }
.cs-pill { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 13px;
  background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.cs-pill.laid { background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text); }
.cs-pill.conn { background: var(--ok-bg); border-color: var(--ok-border); color: var(--ok-text); }
.bulk-bar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; background: var(--accent);
  color: #fff; border-radius: var(--radius); padding: 9px 12px; margin-bottom: 10px; }
.bulk-f { display: flex; flex-direction: column; gap: 3px; margin: 0; font-size: 9.5px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgba(255,255,255,.8); }
.bulk-f input, .bulk-f select { width: auto; min-width: 108px; font-size: 12px; padding: 4px 7px; }
.dt.pc td.locked { background: #f8fafc; }
.dt.pc td.locked .in { opacity: .45; cursor: not-allowed; }
.bulk-count { font-size: 12px; font-weight: 700; }
.bulk-bar select, .bulk-bar input:not([type=checkbox]) { width: auto; min-width: 140px; font-size: 12px; padding: 5px 8px; }
.bulk-bar .btn { padding: 5px 13px; font-size: 12.5px; }
.bulk-x { background: none; border: none; color: #fff; cursor: pointer; font-size: 12px; margin-left: auto; }
/* Scoped .dt.pc, not .dt: this block is injected after the stylesheet,
   so an element-level rule here would retune every table in the app once
   this page had been opened. */
.dt.pc td { padding: 3px 6px; }
.dt .in { width: 100%; font-size: 11.5px; padding: 3px 6px; border-radius: 5px; }
.dt .in.num { text-align: right; }
.dt .num { text-align: right; }
.dt .mid { text-align: center; }
.dt .strong { font-weight: 700; }
/* Explicit, so it can't pick up alignment from a neighbouring rule */
/* Force it on every body cell. Something was giving a handful of rows a
   different alignment and forcing it is more reliable than chasing it. */
.dt.pc tbody td { text-align: left; }
.dt.pc tbody td.num, .dt.pc tbody td .in.num { text-align: right; }
.dt.pc tbody td.mid { text-align: center; }
.dt .plot-cell { padding-left: 10px; }
.dt .ref { color: var(--accent); font-weight: 600; }
.dt tbody tr.row-sel { background: #fff7ed !important; }
.dt tbody tr.done td:first-child { box-shadow: inset 3px 0 0 #059669; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
